/**
 * Horloge de l'app. En mode démo, on la décale pour que « le meeting de 10:00 » arrive
 * quand on veut pendant le pitch, sans attendre la vraie heure.
 */
import type { ClockState } from "../shared/types";

let offsetMs = 0;

export const now = () => new Date(Date.now() + offsetMs);

export const hhmm = (d = now()) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

/** Place l'horloge à HH:MM aujourd'hui (ex. "09:55") ; le temps continue ensuite à s'écouler. `null` = heure réelle. */
export function setDemoTime(value: string | null) {
  if (!value) {
    offsetMs = 0;
    return;
  }
  const [h, m] = value.split(":").map(Number);
  const target = new Date();
  target.setHours(h, m, 0, 0);
  offsetMs = target.getTime() - Date.now();
}

export const clockState = (): ClockState => ({ hhmm: hhmm(), demo: offsetMs !== 0 });
