/**
 * Récap de la semaine, calculé à partir du journal des actions.
 * Le « temps gagné » est une ESTIMATION : les hypothèses sont listées dans HYPOTHESES et affichées à l'écran.
 */
import type { ActionLogEntry } from "./types";

export const HYPOTHESES = [
  { tool: "check_device", minutes: 5, label: "Problème détecté avant un meeting (batterie, Wi-Fi, disque…)", per: "problème" },
  { tool: "open_url", minutes: 1, label: "Lien du meeting ouvert pour toi (plus besoin de le chercher dans le mail)", per: "meeting" },
  { tool: "open_app", minutes: 0.5, label: "App nécessaire ouverte avant le bloc", per: "app" },
  { tool: "quit_app", minutes: 0.5, label: "App inutile fermée (moins de ralentissements)", per: "app" },
  { tool: "close_tabs", minutes: 0.1, label: "Onglet fermé (6 s de tri à la main)", per: "onglet" },
  { tool: "install_update", minutes: 8, label: "Mise à jour placée dans une pause au lieu d'interrompre ton travail", per: "mise à jour" },
] as const;

export interface WeekStats {
  from: Date;
  to: Date;
  entries: number;
  done: number;
  simulated: number;
  undone: number;
  failed: number;
  minutes: number;
  freedMb: number;
  freedDiskMb: number;
  tabsClosed: number;
  issues: number;
  updates: number;
  byDay: Array<{ day: string; label: string; done: number; simulated: number }>;
  byTool: Array<{ tool: string; label: string; count: number; minutes: number }>;
}

const DAY_LABELS = ["dim", "lun", "mar", "mer", "jeu", "ven", "sam"];

/** `includeSimulated` : compter aussi ce qui aurait été fait en mode simulation (utile tant qu'on teste). */
export function weekStats(journal: ActionLogEntry[], now: Date, includeSimulated: boolean, days = 7): WeekStats {
  // Jusqu'à la fin de la journée : avec l'horloge de démo, une action peut être datée « plus tard » que maintenant.
  const to = new Date(now);
  to.setHours(23, 59, 59, 999);
  const from = new Date(now);
  from.setDate(from.getDate() - (days - 1));
  from.setHours(0, 0, 0, 0);
  const inWeek = journal.filter((e) => {
    const d = new Date(e.at);
    return d >= from && d <= to;
  });
  const counted = inWeek.filter((e) => e.status === "done" || (includeSimulated && e.status === "simulated"));

  const byTool = HYPOTHESES.map((h) => {
    const rows = counted.filter((e) => e.tool === h.tool);
    // Combien d'« unités » : problèmes détectés, onglets fermés… sinon 1 par action.
    const units = rows.reduce((s, e) => s + (h.tool === "check_device" || h.tool === "close_tabs" ? (e.items ?? 0) : 1), 0);
    return { tool: h.tool, label: h.label, count: units, minutes: units * h.minutes };
  });

  const byDay = Array.from({ length: days }, (_, i) => {
    const d = new Date(from);
    d.setDate(from.getDate() + i);
    const key = d.toDateString();
    const rows = inWeek.filter((e) => new Date(e.at).toDateString() === key);
    return {
      day: key,
      label: `${DAY_LABELS[d.getDay()]} ${d.getDate()}`,
      done: rows.filter((e) => e.status === "done").length,
      simulated: rows.filter((e) => e.status === "simulated").length,
    };
  });

  return {
    from,
    to,
    entries: inWeek.length,
    done: inWeek.filter((e) => e.status === "done").length,
    simulated: inWeek.filter((e) => e.status === "simulated").length,
    undone: inWeek.filter((e) => e.status === "undone").length,
    failed: inWeek.filter((e) => e.status === "failed").length,
    minutes: Math.round(byTool.reduce((s, t) => s + t.minutes, 0)),
    freedMb: counted.reduce((s, e) => s + (e.freedMb ?? 0), 0),
    freedDiskMb: counted.reduce((s, e) => s + (e.freedDiskMb ?? 0), 0),
    tabsClosed: byTool.find((t) => t.tool === "close_tabs")?.count ?? 0,
    issues: byTool.find((t) => t.tool === "check_device")?.count ?? 0,
    updates: byTool.find((t) => t.tool === "install_update")?.count ?? 0,
    byDay,
    byTool,
  };
}
