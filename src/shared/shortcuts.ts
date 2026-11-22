/**
 * Raccourcis appris : on repère dans un journal d'usage les mêmes suites de clics, répétées chaque semaine,
 * et on propose de les remplacer par un raccourci clavier.
 * Ici le journal d'usage est SIMULÉ (resources/usage-demo.json, étiqueté « démo ») : en entreprise, ces données
 * existent déjà dans un outil de télémétrie du poste comme Nexthink.
 * Fonctions pures : utilisables par le main et le renderer.
 */

/** Un raccourci que l'app sait exécuter pour de vrai. */
export interface ShortcutDef {
  id: "presentation" | "rapport" | "tableau" | "notes";
  label: string;
  /** Accélérateur Electron (globalShortcut). */
  accelerator: string;
  /** Affichage, ex. « ⌃⌥P ». */
  keys: string;
  /** Ce que fait le raccourci, en une ligne. */
  does: string;
}

export const SHORTCUTS: ShortcutDef[] = [
  { id: "presentation", label: "Nouvelle présentation Lémanic", accelerator: "Control+Alt+P", keys: "⌃⌥P", does: "Ouvre une présentation au modèle de l'entreprise (fond, logo, polices)." },
  { id: "rapport", label: "Nouveau rapport Lémanic", accelerator: "Control+Alt+R", keys: "⌃⌥R", does: "Ouvre un rapport déjà mis en page (en-tête, titres, rubriques)." },
  { id: "tableau", label: "Nouveau tableau de suivi Lémanic", accelerator: "Control+Alt+T", keys: "⌃⌥T", does: "Ouvre un tableau de suivi aux couleurs de l'entreprise, avec le total." },
  { id: "notes", label: "Notes du prochain meeting", accelerator: "Control+Alt+N", keys: "⌃⌥N", does: "Ouvre des notes pré-remplies avec le titre, l'heure, les participants et l'ordre du jour." },
];

/** Une ligne du journal d'usage : une suite d'actions faites à la main, avec sa durée. */
export interface UsageSession {
  at: string; // ISO
  app: string;
  steps: string[];
  seconds: number;
}

/** Une routine repérée : la même suite d'actions, répétée. */
export interface Routine {
  shortcut: ShortcutDef["id"];
  app: string;
  steps: string[];
  count: number;
  avgSeconds: number;
  /** Minutes perdues par semaine à la main, et avec le raccourci (~2 s par usage). */
  minutesBefore: number;
  minutesAfter: number;
}

/** Quel raccourci remplace une suite d'actions (repérée par son premier geste). */
const SHORTCUT_FOR: Array<[RegExp, ShortcutDef["id"]]> = [
  [/notes|compte[- ]rendu/i, "notes"],
  [/présentation|keynote|powerpoint/i, "presentation"],
  [/tableau|numbers|excel/i, "tableau"],
  [/rapport|pages|word/i, "rapport"],
];

const SECONDS_WITH_SHORTCUT = 2;

/**
 * Regroupe les sessions identiques (même app, mêmes étapes). Une suite répétée au moins `min` fois
 * dans la période devient une routine. Triées par temps perdu.
 */
export function detectRoutines(sessions: UsageSession[], min = 3): Routine[] {
  const groups = new Map<string, UsageSession[]>();
  for (const s of sessions) {
    const key = `${s.app}|${s.steps.join(" > ")}`;
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  const out: Routine[] = [];
  for (const list of groups.values()) {
    if (list.length < min) continue;
    const first = list[0];
    const rule = SHORTCUT_FOR.find(([re]) => re.test(first.steps[0])) ?? SHORTCUT_FOR.find(([re]) => re.test(first.app));
    if (!rule) continue;
    const avg = list.reduce((t, s) => t + s.seconds, 0) / list.length;
    out.push({
      shortcut: rule[1],
      app: first.app,
      steps: first.steps,
      count: list.length,
      avgSeconds: Math.round(avg),
      minutesBefore: Math.round((list.length * avg) / 6) / 10,
      minutesAfter: Math.round((list.length * SECONDS_WITH_SHORTCUT) / 6) / 10,
    });
  }
  return out.sort((a, b) => b.minutesBefore - a.minutesBefore);
}
