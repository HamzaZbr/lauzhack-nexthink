/**
 * Plan du pre-flight, version règles (déterministe). C'est aussi le filet de sécurité :
 * quand le LLM sera branché (bloc 1), il choisira parmi ces mêmes outils, et si l'appel
 * échoue ou dépasse le délai, c'est ce plan qui s'affiche.
 */
import { getDay, getMaintenanceSlot, toMin } from "./day";
import { now } from "./clock";
import { appMatches, isProtected } from "../shared/apps";
import { riskOf } from "./actions";
import { takeSnapshot } from "./sensors";
import type { ActionRequest, DayBlock, PreflightPlan, ProposedAction } from "../shared/types";

const nowMin = () => {
  const d = now();
  return d.getHours() * 60 + d.getMinutes();
};

/** Prochain meeting selon l'horloge (celui en cours compte encore), sinon le premier de la journée. */
export function nextBlock(): DayBlock {
  const day = getDay();
  const meetings = day.filter((b) => b.kind === "meeting");
  return meetings.find((b) => toMin(b.end) > nowMin()) ?? meetings[0] ?? day[0];
}

const HEAVY_MB = 500;

export async function planPreflight(): Promise<PreflightPlan> {
  const block = nextBlock();
  if (!block) throw new Error("Aucun meeting dans la journée.");
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

  // 2. Apps lourdes qui ne servent pas au bloc
  snapshot.apps
    .filter((a) => a.memMb >= HEAVY_MB && !isProtected(a.name) && !block.apps.some((w) => appMatches(w, a.name)))
    .filter((a) => a.name !== "Google Chrome") // Chrome : on traite les onglets, pas l'app entière
    .slice(0, 3)
    .forEach((a) =>
      add({ tool: "quit_app", target: a.name }, `${a.memMb} Mo de RAM, CPU ${a.cpu} %, pas utile pour « ${block.title} ».`),
    );

  // 3. Onglets Chrome en double
  if (snapshot.chromeTabs?.length) {
    const counts = new Map<string, number>();
    snapshot.chromeTabs.forEach((t) => counts.set(t.url, (counts.get(t.url) ?? 0) + 1));
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

  // 6. Mise à jour système (démo) : jamais pendant un meeting, proposée pour le prochain créneau libre
  const free = getMaintenanceSlot();
  if (free)
    add(
      { tool: "install_update", target: `Mise à jour macOS à ${free.start}` },
      `Redémarrage nécessaire (~8 min) : je la place pendant ton créneau libre ${free.start}–${free.end}. Simulée dans ce prototype.`,
    );

  return { block, minutesBefore: Math.max(0, toMin(block.start) - nowMin()), actions, snapshot };
}
