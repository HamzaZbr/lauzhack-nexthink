/**
 * Ce que l'agent apprend de toi, en local (fichier prefs.json dans le dossier de l'app).
 * Quand tu décoches un onglet proposé par l'IA, son site compte comme « à garder » ;
 * quand tu fermes des onglets, leur site compte comme « fermable ».
 * Ces préférences sont redonnées à l'IA au tri suivant.
 */
import { app } from "electron";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { now } from "./clock";

interface Prefs {
  keepDomains: Record<string, number>;
  closeDomains: Record<string, number>;
  /** Ce que tu as noté au bilan du soir, repris dans le brief du lendemain. */
  carryOver?: string;
  /** Jour (horloge de l'app) où « ce qui reste » a été noté : on ne le propose qu'à partir du lendemain. */
  carryOverDay?: string;
}

const path = () => join(app.getPath("userData"), "prefs.json");
let prefs: Prefs | null = null;

function load(): Prefs {
  if (prefs) return prefs;
  try {
    prefs = JSON.parse(readFileSync(path(), "utf8")) as Prefs;
  } catch {
    prefs = { keepDomains: {}, closeDomains: {} };
  }
  return prefs;
}

function save() {
  try {
    writeFileSync(path(), JSON.stringify(load(), null, 2));
  } catch {
    /* tant pis, on garde en mémoire */
  }
}

/**
 * « Ce qui reste » du bilan, proposé dans le brief du LENDEMAIN seulement (pas le soir même, pas à chaque relance).
 * Effacé dès qu'un brief est planifié.
 */
export const getCarryOver = () => {
  const p = load();
  if (!p.carryOver || !p.carryOverDay || p.carryOverDay === now().toDateString()) return "";
  return p.carryOver;
};
export function setCarryOver(text: string) {
  load().carryOver = text.slice(0, 500);
  load().carryOverDay = now().toDateString();
  save();
}

export function recordFeedback(kept: string[], closed: string[]) {
  const p = load();
  for (const d of new Set(kept)) p.keepDomains[d] = (p.keepDomains[d] ?? 0) + 1;
  for (const d of new Set(closed)) p.closeDomains[d] = (p.closeDomains[d] ?? 0) + 1;
  try {
    writeFileSync(path(), JSON.stringify(p, null, 2));
  } catch {
    /* tant pis, on garde en mémoire */
  }
}

/** Résumé pour l'IA : les sites que tu gardes toujours, et ceux que tu fermes souvent. */
export function learnedPreferences() {
  const p = load();
  const top = (r: Record<string, number>, min: number) =>
    Object.entries(r).filter(([, n]) => n >= min).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([d]) => d);
  return { toujours_garder: top(p.keepDomains, 1), souvent_fermes: top(p.closeDomains, 2) };
}
