/**
 * Ce que fait le LLM. Règle du projet : il PROPOSE du JSON, le code le vérifie.
 * Si l'appel échoue ou renvoie n'importe quoi, on a toujours un plan de secours.
 */
import { chatJSON, model } from "./llm";
import { freeSlots, getCalendar, getDay, isHHMM, setMorningBlocks, toHHMM, toMin } from "./day";
import { takeSnapshot } from "./sensors";
import { applyTriage, hostOf, type LlmTabClose } from "./tabs";
import { learnedPreferences } from "./prefs";
import type { ChromeTab, DayBlock, DayPlanResult, TabVerdict, TriageInfo } from "../shared/types";

const COMMON_APPS = ["Outlook", "Microsoft Teams", "Excel", "Word", "PowerPoint", "Google Chrome", "Slack", "Notion", "Figma", "Visual Studio Code"];

const DAY_SCHEMA = {
  type: "object",
  properties: {
    blocks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          start: { type: "string", description: "HH:MM" },
          end: { type: "string", description: "HH:MM" },
          apps: { type: "array", items: { type: "string" } },
          sites: { type: "array", items: { type: "string" } },
          docs: { type: "array", items: { type: "string" } },
        },
        required: ["title", "start", "end", "apps", "sites", "docs"],
      },
    },
    summary: { type: "string" },
  },
  required: ["blocks", "summary"],
};

interface LlmDay {
  blocks: Array<{ title: string; start: string; end: string; apps: string[]; sites?: string[]; docs?: string[] }>;
  summary: string;
}

/** Domaines propres : « https://www.github.com/x » → « github.com ». */
export function cleanSites(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out = raw
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0])
    .filter((x) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(x));
  return [...new Set(out)].slice(0, 4);
}

/** Garde seulement des blocs valides : heures correctes, dans un créneau libre, sans chevaucher un meeting. */
function sanitize(raw: LlmDay["blocks"], slots: Array<{ start: string; end: string }>): DayBlock[] {
  const out: DayBlock[] = [];
  for (const [i, b] of raw.entries()) {
    if (!b || typeof b.title !== "string" || !isHHMM(b.start) || !isHHMM(b.end)) continue;
    const s = toMin(b.start);
    const e = toMin(b.end);
    if (e <= s) continue;
    const inSlot = slots.some((sl) => s >= toMin(sl.start) && e <= toMin(sl.end));
    if (!inSlot) continue;
    if (out.some((o) => s < toMin(o.end) && e > toMin(o.start))) continue;
    out.push({
      id: `m${i + 1}`,
      start: b.start,
      end: b.end,
      title: b.title.slice(0, 60),
      kind: "focus",
      source: "morning",
      apps: (Array.isArray(b.apps) ? b.apps : []).filter((a) => typeof a === "string").map((a) => a.slice(0, 40)).slice(0, 4),
      sites: cleanSites(b.sites),
      docs: (Array.isArray(b.docs) ? b.docs : []).filter((d) => typeof d === "string" && d.trim().length >= 2).map((d) => d.trim().slice(0, 40)).slice(0, 3),
    });
  }
  return out;
}

/** Plan de secours sans LLM : une tâche par morceau de phrase, mise bout à bout dans les créneaux libres. */
function fallback(text: string, slots: Array<{ start: string; end: string }>): DayBlock[] {
  const parts = text.split(/,|;| et |\n/).map((p) => p.trim()).filter((p) => p.length > 2).slice(0, 4);
  const blocks: DayBlock[] = [];
  let slot = 0;
  let cursor = slots[0] ? toMin(slots[0].start) : 9 * 60;
  for (const [i, p] of parts.entries()) {
    while (slots[slot] && cursor + 45 > toMin(slots[slot].end)) {
      slot++;
      if (slots[slot]) cursor = toMin(slots[slot].start);
    }
    if (!slots[slot]) break;
    blocks.push({ id: `m${i + 1}`, start: toHHMM(cursor), end: toHHMM(cursor + 45), title: p.slice(0, 60), kind: "focus", source: "morning", apps: [] });
    cursor += 45;
  }
  return blocks;
}

/** Brief du matin : transforme la phrase de l'utilisateur en blocs de la journée. */
export async function planDay(text: string): Promise<DayPlanResult> {
  const slots = freeSlots();
  const started = Date.now();
  const snap = await takeSnapshot(false);
  const known = [...new Set([...snap.apps.map((a) => a.name), ...COMMON_APPS])].slice(0, 30);
  const calendar = getCalendar();
  try {
    const res = await chatJSON<LlmDay>({
      system:
        "Tu es l'agent Preflight, un assistant IT. L'utilisateur décrit ce qu'il fera aujourd'hui en plus de ses meetings. " +
        "Découpe sa phrase en tâches concrètes, estime leur durée de façon réaliste (30 à 120 min), place-les UNIQUEMENT dans les créneaux libres donnés, " +
        "sans chevauchement, et indique pour chaque tâche les apps nécessaires, choisies dans la liste fournie. " +
        "sites : les domaines web utiles à la tâche s'ils sont mentionnés ou évidents (ex. github.com, moodle.epfl.ch, notion.so), sinon []. " +
        "docs : mots-clés courts des fichiers mentionnés, sans extension (ex. « budget_q4 », « pitch »), sinon []. " +
        "Titres courts (moins de 6 mots), en français. summary : une phrase qui résume la journée.",
      user: JSON.stringify({
        phrase: text,
        meetings: calendar.filter((b) => b.kind === "meeting").map((b) => ({ start: b.start, end: b.end, title: b.title })),
        creneaux_libres: slots,
        apps_disponibles: known,
      }),
      schemaName: "day_plan",
      schema: DAY_SCHEMA,
      timeoutMs: 12_000,
    });
    const blocks = sanitize(res.blocks ?? [], slots);
    if (!blocks.length) throw new Error("Le LLM n'a renvoyé aucun bloc valide.");
    setMorningBlocks(blocks);
    return { blocks, summary: res.summary ?? "", source: "llm", latencyMs: Date.now() - started };
  } catch (error) {
    const blocks = fallback(text, slots);
    setMorningBlocks(blocks);
    return {
      blocks,
      summary: "Plan simple (sans IA) : une tâche par morceau de phrase.",
      source: "fallback",
      latencyMs: Date.now() - started,
      error: String((error as Error).message ?? error),
    };
  }
}

/* ---------- Pre-flight : tri des onglets ---------- */

const TABS_SCHEMA = {
  type: "object",
  properties: {
    close: {
      type: "array",
      description: "Seulement les onglets à fermer. Tous les autres sont gardés.",
      items: {
        type: "object",
        properties: { i: { type: "integer" }, reason: { type: "string" } },
        required: ["i", "reason"],
      },
    },
  },
  required: ["close"],
};

export interface TriageResult {
  verdicts: TabVerdict[];
  info: TriageInfo;
}

let cache: { key: string; at: number; result: TriageResult } | null = null;
let inflight: { key: string; promise: Promise<TriageResult> } | null = null;
const TTL_OK = 5 * 60_000;
const TTL_ERROR = 30_000;

const cacheKey = (tabs: ChromeTab[], block: DayBlock | null) =>
  `${block?.id ?? "none"}|${block?.start ?? ""}|${tabs.length}|${tabs.map((t) => t.url).join("|").length}|${tabs.filter((t) => t.active).map((t) => t.url).join(",")}`;

/**
 * Tri des onglets par l'IA, mis en cache 5 min : l'arbre et le pop-up affichent la même décision.
 * Ne lève jamais d'erreur : en cas d'échec, `info.error` est rempli et `verdicts` est vide.
 */
export async function getTriage(tabs: ChromeTab[], block: DayBlock | null, fresh = false): Promise<TriageResult> {
  const key = cacheKey(tabs, block);
  if (!fresh && cache && cache.key === key) {
    const ttl = cache.result.info.error ? TTL_ERROR : TTL_OK;
    if (Date.now() - cache.at < ttl) return { ...cache.result, info: { ...cache.result.info, cached: true } };
  }
  // Si l'arbre et le pop-up demandent en même temps, un seul appel à l'IA.
  if (inflight && inflight.key === key) return inflight.promise;
  const promise = triageTabs(tabs, block)
    .catch((error): TriageResult => ({ verdicts: [], info: { used: false, latencyMs: 0, model: model(), error: String((error as Error).message ?? error).slice(0, 200) } }))
    .then((result) => {
      cache = { key, at: Date.now(), result };
      inflight = null;
      return result;
    });
  inflight = { key, promise };
  return promise;
}

const BATCH = 25;

/**
 * Tri par l'IA. Les onglets partent en paquets de 25, traités EN MÊME TEMPS (3 paquets ≈ le temps d'un seul).
 * Un paquet qui échoue = ses onglets sont gardés ; si tous échouent, on remonte l'erreur.
 * TOGETHER_TABS_MODEL dans .env : un modèle rapide juste pour ce tri.
 */
async function triageTabs(tabs: ChromeTab[], block: DayBlock | null): Promise<TriageResult> {
  const started = Date.now();
  const tabsModel = process.env.TOGETHER_TABS_MODEL || model();
  const sendTitles = process.env.TABS_SEND_TITLES !== "0";
  const list = tabs.slice(0, 120);
  const others = getDay()
    .filter((b) => b.kind !== "free" && b.id !== block?.id)
    .map((b) => `${b.start} ${b.title}`);
  const context = {
    utilisateur: process.env.USER_CONTEXT || undefined,
    prochain_bloc: block ? { titre: block.title, debut: block.start, apps: block.apps, description: block.notes } : "rien de prévu",
    autres_blocs_du_jour: others,
    preferences_apprises: learnedPreferences(),
  };
  const system =
    "Tu es l'agent Preflight, un assistant IT. Le navigateur de l'utilisateur est surchargé avant son prochain bloc de travail. " +
    "Renvoie UNIQUEMENT les onglets à fermer, dans « close ». Ne cite pas ceux à garder. Réponds directement, sans réfléchir longuement. " +
    "Garde tout ce qui peut servir pour le prochain bloc ou les autres blocs du jour, ce qui ressemble à un travail en cours " +
    "(mail, document, formulaire, panier), ce que l'utilisateur garde toujours, et dans le doute garde. " +
    "Pour un développeur ou un étudiant, les pages techniques sont du travail : questions Stack Overflow, documentation, assistants IA (ChatGPT, Claude), tutoriels vidéo de programmation. " +
    "Ferme ce qui est clairement sans rapport : divertissement, achats, réseaux sociaux, pages de résultats de recherche non techniques, doublons. " +
    "reason : 8 mots maximum, en français, concrète (ex. « vidéo sans rapport avec la revue budget »).";

  const batches: Array<{ offset: number; tabs: ChromeTab[] }> = [];
  for (let o = 0; o < list.length; o += BATCH) batches.push({ offset: o, tabs: list.slice(o, o + BATCH) });

  const results = await Promise.allSettled(
    batches.map(async ({ offset, tabs: part }) => {
      // Format compact (une ligne par onglet), numéros globaux pour pouvoir fusionner.
      const lines = part
        .map((t, k) => {
          const title = sendTitles ? ` | ${t.title.replace(/\s+/g, " ").slice(0, 70)}` : "";
          return `${offset + k} | ${hostOf(t.url)}${title}${t.active ? " | (affiché)" : ""}`;
        })
        .join("\n");
      const res = await chatJSON<{ close: LlmTabClose[] }>({
        system,
        user: JSON.stringify({ ...context, onglets: `numéro | site | titre\n${lines}` }),
        schemaName: "tab_triage",
        schema: TABS_SCHEMA,
        timeoutMs: 20_000,
        maxTokens: 1200,
        model: tabsModel,
      });
      // On ne garde que les numéros de CE paquet (l'IA ne peut pas viser un onglet qu'on ne lui a pas montré).
      return (res.close ?? []).filter((c) => Number.isInteger(c?.i) && c.i >= offset && c.i < offset + part.length);
    }),
  );
  const ok = results.filter((r): r is PromiseFulfilledResult<LlmTabClose[]> => r.status === "fulfilled");
  if (!ok.length) throw (results[0] as PromiseRejectedResult).reason;
  const failed = results.length - ok.length;
  const verdicts = applyTriage(list, ok.flatMap((r) => r.value), block);
  const closed = verdicts.filter((v) => v.close).length;
  return {
    verdicts,
    info: {
      used: true,
      latencyMs: Date.now() - started,
      model: tabsModel,
      kept: verdicts.length - closed,
      closed,
      ...(failed ? { error: `${failed}/${results.length} paquets sans réponse : leurs onglets sont gardés` } : {}),
    },
  };
}
