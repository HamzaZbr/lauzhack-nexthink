/**
 * La journée de l'utilisateur : les événements du calendrier + les tâches ajoutées le matin.
 * Le calendrier vient pour l'instant des données de démo (bientôt : un fichier .ics).
 */
import { mockDay } from "../shared/mock";
import type { DayBlock } from "../shared/types";

let calendar: DayBlock[] = mockDay.filter((b) => b.source === "calendar");
// Avant le brief : les tâches d'exemple, pour que l'arbre et le pre-flight aient de quoi travailler.
let morning: DayBlock[] = mockDay.filter((b) => b.source === "morning");
let onChange: (day: DayBlock[]) => void = () => {};

const byStart = (a: DayBlock, b: DayBlock) => a.start.localeCompare(b.start);

export const getDay = (): DayBlock[] => [...calendar, ...morning].sort(byStart);
export const getCalendar = () => calendar;
export const onDayChange = (listener: (day: DayBlock[]) => void) => {
  onChange = listener;
};

export function setMorningBlocks(blocks: DayBlock[]) {
  morning = blocks;
  onChange(getDay());
}

export function setCalendar(blocks: DayBlock[]) {
  calendar = blocks;
  onChange(getDay());
}

/* ---------- Créneaux libres ---------- */

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
const toHHMM = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/**
 * Trous entre les meetings, entre `from` et `to`. Les créneaux marqués « libre » dans le calendrier
 * sont gardés pour la maintenance (pause café) : on n'y place pas de tâches.
 */
export function freeSlots(from = "08:30", to = "18:00", minMinutes = 30): Array<{ start: string; end: string }> {
  const busy = calendar.map((b) => [toMin(b.start), toMin(b.end)] as const).sort((a, b) => a[0] - b[0]);
  const slots: Array<{ start: string; end: string }> = [];
  let cursor = toMin(from);
  for (const [s, e] of busy) {
    if (s - cursor >= minMinutes) slots.push({ start: toHHMM(cursor), end: toHHMM(s) });
    cursor = Math.max(cursor, e);
  }
  if (toMin(to) - cursor >= minMinutes) slots.push({ start: toHHMM(cursor), end: to });
  return slots;
}

export const isHHMM = (s: unknown): s is string => typeof s === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
export { toMin, toHHMM };
