/**
 * Horloge de l'app. En mode démo, on la décale pour que « le meeting de 10:00 » arrive
 * quand on veut pendant le pitch, sans attendre la vraie heure. On peut aussi passer au lendemain.
 */
import type { ClockState } from "../shared/types";

let offsetMs = 0;

export const now = () => new Date(Date.now() + offsetMs);

export const hhmm = (d = now()) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

/**
 * Place l'horloge à HH:MM, le jour affiché par l'app (le lendemain si `nextDay`) ; le temps continue ensuite à s'écouler.
 * `null` = heure réelle.
 */
export function setDemoTime(value: string | null, nextDay = false) {
  if (!value) {
    offsetMs = 0;
    return;
  }
  const [h, m] = value.split(":").map(Number);
  const target = now(); // on reste sur le jour de l'app (utile après « demain »)
  if (nextDay) target.setDate(target.getDate() + 1);
  target.setHours(h, m, 0, 0);
  offsetMs = target.getTime() - Date.now();
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

export const clockState = (): ClockState => {
  const d = now();
  return {
    hhmm: hhmm(d),
    demo: offsetMs !== 0,
    iso: d.toISOString(),
    dayLabel: d.toLocaleDateString("fr-CH", { weekday: "short", day: "numeric", month: "short" }),
    dayOffset: Math.round((startOfDay(d) - startOfDay(new Date())) / 86_400_000),
  };
};
