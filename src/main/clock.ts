/**
 * Horloge de l'app. En mode démo, on la décale pour que « le meeting de 10:00 » arrive
 * quand on veut pendant le pitch, sans attendre la vraie heure.
 */
let offsetMs = 0;

export const now = () => new Date(Date.now() + offsetMs);

/** Place l'horloge à HH:MM aujourd'hui (ex. "09:55") ; le temps continue ensuite à s'écouler. */
export function setDemoTime(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  const target = new Date();
  target.setHours(h, m, 0, 0);
  offsetMs = target.getTime() - Date.now();
}

export const resetClock = () => {
  offsetMs = 0;
};

export const hhmm = (d = now()) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
