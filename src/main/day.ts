/**
 * La journée de l'utilisateur :
 * - les meetings du calendrier (calendar.ts) ;
 * - un créneau de maintenance calculé (le premier trou entre deux meetings) : c'est là que va la pause café ;
 * - les tâches ajoutées le matin (agent.ts, brief du matin).
 */
import type { DayBlock } from "../shared/types";
import { resolveApps } from "./installed";

/** « Excel » sur un Mac sans Office → « Numbers », Teams absent → retiré (le lien s'ouvre dans le navigateur). */
const withInstalledApps = (blocks: DayBlock[]) => blocks.map((b) => ({ ...b, apps: resolveApps(b.apps) }));

let calendar: DayBlock[] = [];
let morning: DayBlock[] = [];
let onChange: (day: DayBlock[]) => void = () => {};

const byStart = (a: DayBlock, b: DayBlock) => a.start.localeCompare(b.start);

export const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
export const toHHMM = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
export const isHHMM = (s: unknown): s is string => typeof s === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

/** Premier trou de 20 à 120 min entre deux meetings (sinon juste après le dernier), limité à 45 min. */
function maintenanceSlot(): DayBlock | null {
  const ms = [...calendar].sort(byStart);
  const make = (start: number, end: number): DayBlock => ({
    id: "free-maintenance",
    start: toHHMM(start),
    end: toHHMM(Math.min(end, start + 45)),
    title: "Créneau libre",
    kind: "free",
    source: "calendar",
    apps: [],
  });
  for (let i = 0; i < ms.length - 1; i++) {
    const gap = toMin(ms[i + 1].start) - toMin(ms[i].end);
    if (gap >= 20 && gap <= 120) return make(toMin(ms[i].end), toMin(ms[i + 1].start));
  }
  const last = ms[ms.length - 1];
  if (last && toMin(last.end) <= 17 * 60) return make(toMin(last.end), toMin(last.end) + 45);
  return null;
}

export const getCalendar = () => calendar;
export const getMaintenanceSlot = () => maintenanceSlot();
export const getDay = (): DayBlock[] => {
  const free = maintenanceSlot();
  return [...calendar, ...(free ? [free] : []), ...morning].sort(byStart);
};

export const onDayChange = (listener: (day: DayBlock[]) => void) => {
  onChange = listener;
};

export function setMorningBlocks(blocks: DayBlock[]) {
  morning = withInstalledApps(blocks);
  onChange(getDay());
}

/** Nouveau jour : les tâches du brief d'hier ne restent pas (ce qui restait est repris par le bilan → brief). */
export function clearMorning() {
  morning = [];
}

export function setCalendar(blocks: DayBlock[]) {
  calendar = withInstalledApps(blocks);
  onChange(getDay());
}

/** Trous libres pour placer les tâches du matin (hors meetings et hors créneau de maintenance). */
export function freeSlots(from = "08:30", to = "18:00", minMinutes = 30): Array<{ start: string; end: string }> {
  const free = maintenanceSlot();
  const busy = [...calendar, ...(free ? [free] : [])].map((b) => [toMin(b.start), toMin(b.end)] as const).sort((a, b) => a[0] - b[0]);
  const slots: Array<{ start: string; end: string }> = [];
  let cursor = toMin(from);
  for (const [s, e] of busy) {
    if (s - cursor >= minMinutes) slots.push({ start: toHHMM(cursor), end: toHHMM(s) });
    cursor = Math.max(cursor, e);
  }
  if (toMin(to) - cursor >= minMinutes) slots.push({ start: toHHMM(cursor), end: to });
  return slots;
}
