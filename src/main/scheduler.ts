/**
 * Planificateur : toutes les 15 s, il regarde l'heure (horloge de démo comprise) et la journée.
 * - 5 min avant un meeting ou une tâche → pop-up pre-flight ;
 * - au début du créneau libre → pop-up pause café (maintenance).
 * Chaque déclenchement n'a lieu qu'une fois.
 */
import { getDay, toMin } from "./day";
import { now } from "./clock";
import { openPopup } from "./windows";
import { getTriage } from "./agent";
import { takeSnapshot } from "./sensors";
import { ensureToday } from "./calendar";

const PREFLIGHT_MINUTES = 5;
const EVENING = process.env.EVENING_AT && /^\d{2}:\d{2}$/.test(process.env.EVENING_AT) ? process.env.EVENING_AT : "18:00";
const fired = new Set<string>();
let timer: NodeJS.Timeout | null = null;

export function tick() {
  // Minuit passé (vraie heure ou démo) : journée rechargée, puis on regarde au prochain tour.
  void ensureToday().catch(() => {});
  const d = now();
  const nowMin = d.getHours() * 60 + d.getMinutes();
  // Bilan de fin de journée (une fois par jour)
  if (nowMin >= toMin(EVENING) && nowMin < toMin(EVENING) + 5 && !fired.has(`evening-${d.toDateString()}`)) {
    fired.add(`evening-${d.toDateString()}`);
    openPopup("evening");
    return;
  }
  for (const b of getDay()) {
    const start = toMin(b.start);
    // 8 min avant un meeting : l'IA trie les onglets en arrière-plan, pour que le pre-flight (T-5) s'ouvre déjà prêt.
    const prepared = b.kind === "meeting" || b.kind === "focus"; // meetings ET tâches du brief
    if (prepared && nowMin >= start - 8 && nowMin < start - PREFLIGHT_MINUTES) {
      const key = `prefetch-${b.start}-${b.title}`;
      if (!fired.has(key)) {
        fired.add(key);
        void takeSnapshot(true).then((s) => (s.chromeTabs && s.chromeTabs.length >= 3 ? getTriage(s.chromeTabs, b) : null)).catch(() => {});
      }
    }
    if (prepared && nowMin >= start - PREFLIGHT_MINUTES && nowMin < start) {
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
