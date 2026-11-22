/**
 * Raccourcis clavier globaux (fonctionnent même quand l'app est derrière).
 * Ils déclenchent une action du registre, donc ils passent dans le journal comme le reste.
 */
import { app, globalShortcut } from "electron";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SHORTCUTS, detectRoutines, type Routine, type UsageSession } from "../shared/shortcuts";
import { getEnabledShortcuts, setEnabledShortcuts } from "./prefs";
import { runActions } from "./actions";
import { nextBlock } from "./planner";
import { now } from "./clock";
import type { ActionLogEntry, ActionRequest } from "../shared/types";

let notify: (entry: ActionLogEntry, label: string) => void = () => {};
export const onShortcutUsed = (fn: typeof notify) => {
  notify = fn;
};

/** Journal d'usage simulé (démo) → routines repérées. */
export function routines(): { routines: Routine[]; sessions: number; note: string } {
  try {
    const j = JSON.parse(readFileSync(join(app.getAppPath(), "resources", "usage-demo.json"), "utf8")) as { _note: string; sessions: UsageSession[] };
    return { routines: detectRoutines(j.sessions), sessions: j.sessions.length, note: j._note };
  } catch {
    return { routines: [], sessions: 0, note: "Journal d'usage de démo introuvable." };
  }
}

/** Ce que fait un raccourci : une demande au registre d'actions. */
function requestFor(id: string): ActionRequest | null {
  if (id === "notes") {
    const b = nextBlock();
    const meeting = b?.kind === "meeting" ? b : null;
    return {
      tool: "meeting_notes",
      target: `Notes – ${meeting?.title ?? "Réunion"}`,
      args: {
        title: meeting?.title ?? "Réunion",
        date: now().toLocaleDateString("fr-CH", { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
        start: meeting?.start ?? "",
        end: meeting?.end ?? "",
        location: meeting?.location,
        attendees: meeting?.attendees ?? [],
        agenda: meeting?.notes,
      },
    };
  }
  if (id === "presentation" || id === "rapport" || id === "tableau") return { tool: "new_from_template", target: id };
  return null;
}

export async function runShortcut(id: string) {
  const req = requestFor(id);
  const def = SHORTCUTS.find((s) => s.id === id);
  if (!req || !def) return null;
  const [entry] = await runActions([req]);
  notify(entry, def.label);
  return entry;
}

function registerAll() {
  globalShortcut.unregisterAll();
  for (const id of getEnabledShortcuts()) {
    const def = SHORTCUTS.find((s) => s.id === id);
    if (!def) continue;
    const ok = globalShortcut.register(def.accelerator, () => {
      console.log(`[raccourci] ${def.keys} pressé → ${def.label}`);
      void runShortcut(id);
    });
    console.log(`[raccourci] ${def.keys} (${def.accelerator}) ${ok ? "actif" : "REFUSÉ par macOS (déjà pris ?)"}`);
  }
}

export const enabledShortcuts = () => getEnabledShortcuts();

/** Active ou coupe un raccourci. Renvoie la liste à jour, et si la touche était déjà prise par une autre app. */
export function toggleShortcut(id: string, on: boolean): { enabled: string[]; conflict?: string } {
  const def = SHORTCUTS.find((s) => s.id === id);
  if (!def) return { enabled: getEnabledShortcuts() };
  const current = new Set(getEnabledShortcuts());
  if (on) current.add(id);
  else current.delete(id);
  setEnabledShortcuts([...current]);
  registerAll();
  const conflict = on && !globalShortcut.isRegistered(def.accelerator) ? `${def.keys} est déjà pris par une autre app.` : undefined;
  return { enabled: getEnabledShortcuts(), conflict };
}

export function startShortcuts() {
  registerAll();
  app.on("will-quit", () => globalShortcut.unregisterAll());
}
