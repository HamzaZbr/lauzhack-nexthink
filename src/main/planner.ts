/**
 * Plan du pre-flight, version règles (déterministe). C'est aussi le filet de sécurité :
 * quand le LLM sera branché (bloc 1), il choisira parmi ces mêmes outils, et si l'appel
 * échoue ou dépasse le délai, c'est ce plan qui s'affiche.
 */
import { getDay, getMaintenanceSlot, toMin } from "./day";
import { now } from "./clock";
import { appMatches, isProtected } from "../shared/apps";
import { riskOf } from "./actions";
import { readDisplays, takeSnapshot } from "./sensors";
import { hasNeeds, needsCheck } from "../shared/needs";
import { getTriage } from "./agent";
import { hasKey } from "./llm";
import { planWorkspace } from "./workspace";
import type { ActionRequest, DayBlock, PreflightPlan, ProposedAction } from "../shared/types";

const nowMin = () => {
  const d = now();
  return d.getHours() * 60 + d.getMinutes();
};

/**
 * Prochain bloc selon l'horloge : le plus proche dans le temps, meeting OU tâche (celui en cours compte encore,
 * sauf s'il en commence un autre dans les 10 min). null s'il ne reste plus rien aujourd'hui.
 */
export function nextBlock(): DayBlock | null {
  const n = nowMin();
  const upcoming = getDay()
    .filter((b) => b.kind !== "free" && toMin(b.end) > n)
    .sort((a, b) => toMin(a.start) - toMin(b.start));
  const startingSoon = upcoming.find((b) => toMin(b.start) >= n && toMin(b.start) - n <= 10);
  return startingSoon ?? upcoming[0] ?? null;
}

const HEAVY_MB = 500;


export async function planPreflight(): Promise<PreflightPlan> {
  const next = nextBlock();
  const n0 = nowMin();
  const hhmmNow = `${String(Math.floor(n0 / 60)).padStart(2, "0")}:${String(n0 % 60).padStart(2, "0")}`;
  // Plus rien aujourd'hui : on garde les vérifications et le tri, sans bloc à préparer.
  const block: DayBlock = next ?? { id: "none", start: hhmmNow, end: hhmmNow, title: "Plus rien de prévu aujourd'hui", kind: "free", source: "calendar", apps: [] };
  const snapshot = await takeSnapshot(true);
  const actions: ProposedAction[] = [];
  let n = 0;
  const add = (req: ActionRequest, reason: string) =>
    actions.push({ id: `p${++n}`, ...req, reason, risk: riskOf(req) });

  // 1. Vérifications (lecture seule, faites d'office)
  add(
    { tool: "check_device", target: "Batterie, disque, mémoire, Wi-Fi" },
    snapshot.issues.length ? snapshot.issues.map((i) => i.message).join(" ") : "Rien d'anormal détecté.",
  );

  // 1 bis. Besoins du bloc : internet, batterie, écran externe, matériel (lecture seule)
  if (next && hasNeeds(next.needs)) {
    const displays = next.needs?.display ? await readDisplays() : null;
    const { lines, alerts } = needsCheck(next, snapshot, displays);
    if (lines.length)
      add(
        { tool: "check_needs", target: alerts ? `${alerts} chose${alerts > 1 ? "s" : ""} à régler avant « ${block.title} »` : `Ce dont « ${block.title} » a besoin`, args: { summary: lines.join(" "), alerts } },
        lines.join("\n"),
      );
  }

  // 2. Apps lourdes qui ne servent pas au bloc
  snapshot.apps
    .filter((a) => a.memMb >= HEAVY_MB && !isProtected(a.name) && !block.apps.some((w) => appMatches(w, a.name)))
    .filter((a) => a.name !== "Google Chrome") // Chrome : on traite les onglets, pas l'app entière
    .slice(0, 3)
    .forEach((a) =>
      add({ tool: "quit_app", target: a.name }, next ? `${a.memMb} Mo de RAM, CPU ${a.cpu} %, pas utile pour « ${block.title} ».` : `${a.memMb} Mo de RAM, CPU ${a.cpu} %, et plus rien de prévu aujourd'hui.`),
    );

  // 3. Onglets Chrome : l'IA trie (même résultat que l'arbre, grâce au cache) ; si elle échoue, règle simple (doublons).
  let ai: PreflightPlan["ai"];
  const tabs = snapshot.chromeTabs ?? [];
  let aiDone = false;
  if (tabs.length >= 3 && hasKey()) {
    const t = await getTriage(tabs, next);
    ai = t.info;
    if (t.info.used) {
      aiDone = true;
      const close = t.verdicts.filter((v) => v.close);
      if (close.length) {
        const urls = [...new Set(close.map((v) => v.url))];
        add(
          { tool: "close_tabs", target: `${close.length} onglet${close.length > 1 ? "s" : ""} sans rapport avec « ${block.title} »`, args: { urls, mode: "all" } },
          `Trié par l'IA : j'en garde ${t.verdicts.length - close.length} (liés à ta journée, en cours ou protégés). ~${((close.length * 80) / 1024).toFixed(1).replace(".", ",")} Go libérés. Les liens sont gardés pour les rouvrir.`,
        );
        actions[actions.length - 1].tabs = t.verdicts;
      }
    }
  }
  if (!aiDone && tabs.length) {
    const counts = new Map<string, number>();
    tabs.forEach((t) => counts.set(t.url, (counts.get(t.url) ?? 0) + 1));
    const dupUrls = [...counts.entries()].filter(([, c]) => c > 1).map(([u]) => u);
    const extra = [...counts.values()].reduce((s, c) => s + Math.max(0, c - 1), 0);
    if (extra > 0)
      add(
        { tool: "close_tabs", target: `${extra} onglet(s) Chrome en double`, args: { urls: dupUrls, mode: "duplicates" } },
        `Je garde un exemplaire de chaque page et je note les liens pour pouvoir les rouvrir.`,
      );
  }

  // 4. Ouvrir le meeting
  if (block.link) add({ tool: "open_url", target: block.link }, `« ${block.title} » commence à ${block.start}.`);

  // 5. Apps nécessaires au bloc qui ne sont pas ouvertes
  block.apps
    .filter((w) => !snapshot.apps.some((a) => appMatches(w, a.name)))
    .forEach((w) => add({ tool: "open_app", target: w === "Teams" ? "Microsoft Teams" : w }, `Nécessaire pour « ${block.title} ».`));

  // 5 bis. Espace de travail : documents cités (trouvés sur le Mac) et sites utiles (onglet mis devant ou ouvert)
  const workspace = next ? await planWorkspace(next, snapshot.chromeTabs) : [];
  for (const w of workspace) add(w.req, w.reason);

  // 5 ter. Documents de l'entreprise : notes de réunion pré-remplies, ou modèle pour une tâche de présentation / rapport
  if (next?.kind === "meeting")
    add(
      {
        tool: "meeting_notes",
        target: `Notes – ${next.title}`,
        args: {
          title: next.title,
          date: now().toLocaleDateString("fr-CH", { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
          start: next.start,
          end: next.end,
          location: next.location,
          attendees: next.attendees ?? [],
          agenda: next.notes,
        },
      },
      `Titre, heure${next.attendees?.length ? `, ${next.attendees.length} participants` : ""} et ordre du jour déjà remplis depuis l'invitation : plus de copier-coller.`,
    );
  if (next?.kind === "focus" && !workspace.some((w) => w.req.tool === "open_file")) {
    const kind = /pr[ée]sentation|slides|keynote|powerpoint|deck|pitch/i.test(next.title)
      ? "presentation"
      : /rapport|report|compte[- ]rendu|m[ée]mo/i.test(next.title)
        ? "rapport"
        : /tableau|budget|suivi|numbers|excel/i.test(next.title)
          ? "tableau"
          : null;
    if (kind)
      add(
        { tool: "new_from_template", target: kind },
        `« ${next.title} » : je pars du modèle de l'entreprise (fond, logo, mise en page) au lieu d'un document vierge.`,
      );
  }

  // 6. Mise à jour système (démo) : jamais pendant un meeting, proposée pour le prochain créneau libre
  const free = getMaintenanceSlot();
  if (free && toMin(free.start) > nowMin())
    add(
      { tool: "install_update", target: `Mise à jour macOS à ${free.start}` },
      `Redémarrage nécessaire (~8 min) : je la place pendant ton créneau libre ${free.start}–${free.end}. Simulée dans ce prototype.`,
    );

  return { block, idle: !next, minutesBefore: Math.max(0, toMin(block.start) - nowMin()), actions, snapshot, ai };
}
