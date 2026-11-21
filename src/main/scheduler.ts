/**
 * Planificateur : toutes les 15 s, il regarde l'heure (horloge de démo comprise) et la journée.
 * - 5 min avant un meeting → pop-up pre-flight ;
 * - au début du créneau libre → pop-up pause café (maintenance).
 * Chaque déclenchement n'a lieu qu'une fois.
 */
import { getDay, toMin } from "./day";
import { now } from "./clock";
import { openPopup } from "./windows";

const PREFLIGHT_MINUTES = 5;
const fired = new Set<string>();
let timer: NodeJS.Timeout | null = null;

export function tick() {
  const d = now();
  const nowMin = d.getHours() * 60 + d.getMinutes();
  for (const b of getDay()) {
    const start = toMin(b.start);
    if (b.kind === "meeting" && nowMin >= start - PREFLIGHT_MINUTES && nowMin < start) {
      const key = `preflight-${b.start}-${b.title}`;
      if (!fired.has(key)) {
        fired.add(key);
        openPopup("preflight");
        return; // un seul pop-up à la fois
      }
    }
    if (b.kind === "free" && nowMin >= start && nowMin < start + 5) {
      const key = `coffee-${b.start}`;
      if (!fired.has(key)) {
        fired.add(key);
        openPopup("coffee");
        return;
      }
    }
  }
}

export function startScheduler() {
  if (!timer) timer = setInterval(tick, 15_000);
}

/** Après un changement d'horloge : on oublie les déclenchements et on vérifie tout de suite. */
export function resetScheduler() {
  fired.clear();
  tick();
}
