/**
 * Ce que fait le LLM. Règle du projet : il PROPOSE du JSON, le code le vérifie.
 * Si l'appel échoue ou renvoie n'importe quoi, on a toujours un plan de secours.
 */
import { chatJSON } from "./llm";
import { freeSlots, getCalendar, isHHMM, setMorningBlocks, toHHMM, toMin } from "./day";
import { takeSnapshot } from "./sensors";
import type { DayBlock, DayPlanResult } from "../shared/types";

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
        },
        required: ["title", "start", "end", "apps"],
      },
    },
    summary: { type: "string" },
  },
  required: ["blocks", "summary"],
};

interface LlmDay {
  blocks: Array<{ title: string; start: string; end: string; apps: string[] }>;
  summary: string;
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
