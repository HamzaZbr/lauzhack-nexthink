/**
 * Registre d'actions : la seule porte par laquelle l'agent agit sur le poste.
 * - chaque outil a un niveau de risque (auto / confirm / ask) ;
 * - chaque cible est vérifiée (l'app existe, n'est pas protégée, l'URL est sûre) — le LLM ne peut rien inventer ;
 * - les commandes passent par execFile, sans shell, et les noms passent en argv (pas d'injection) ;
 * - tout est journalisé, et ce qui est réversible garde sa fonction « annuler ».
 * PREFLIGHT_DRY_RUN=0 dans .env pour agir pour de vrai (par défaut : simulation).
 */
import { app } from "electron";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { takeSnapshot } from "./sensors";
import { now } from "./clock";
import { isDocumentApp, isProtected } from "../shared/apps";
import type { ActionLogEntry, ActionRequest, Risk, ToolInfo } from "../shared/types";

const run = promisify(execFile);
const dryRun = () => process.env.PREFLIGHT_DRY_RUN !== "0";

interface Outcome {
  detail: string;
  freedMb?: number;
  undo?: () => Promise<string>;
}

interface ToolDef extends ToolInfo {
  /** Risque réel pour cette cible (ex. fermer Word passe en « ask »). */
  riskFor?: (req: ActionRequest) => Risk;
  /** Lève une erreur si la demande n'est pas valide. */
  validate: (req: ActionRequest) => Promise<void>;
  execute: (req: ActionRequest) => Promise<Outcome>;
}

const osa = (lines: string[], argv: string[] = []) =>
  run("osascript", [...lines.flatMap((l) => ["-e", l]), ...argv], { timeout: 10_000 });

const SAFE_URL = /^(https?|msteams|zoommtg|zoomus|webex):\/\//i;
const SAFE_APP_NAME = /^[\p{L}\p{N} .&'()+-]{1,60}$/u;

async function runningApp(name: string) {
  const snap = await takeSnapshot(false);
  return snap.apps.find((a) => a.name === name);
}

const CLOSE_TABS_SCRIPT = [
  "on run argv",
  "set mode to item 1 of argv",
  "set targets to rest of argv",
  "set seen to {}",
  "set toClose to {}",
  'tell application "Google Chrome"',
  "repeat with wi from 1 to (count of windows)",
  "repeat with ti from 1 to (count of tabs of window wi)",
  "set u to URL of tab ti of window wi",
  "if u is in targets then",
  'if mode is "all" or u is in seen then',
  "set end of toClose to {wi, ti}",
  "else",
  "set end of seen to u",
  "end if",
  "end if",
  "end repeat",
  "end repeat",
  "repeat with k from (count of toClose) to 1 by -1",
  "set p to item k of toClose",
  "close tab (item 2 of p) of window (item 1 of p)",
  "end repeat",
  "end tell",
  "return count of toClose",
  "end run",
];

const tools: ToolDef[] = [
  {
    tool: "check_device",
    label: "Vérifier le poste",
    risk: "auto",
    description: "Lecture seule : batterie, disque, mémoire, Wi-Fi, apps ouvertes.",
    validate: async () => {},
    execute: async () => {
      const s = await takeSnapshot(true);
      return { detail: s.issues.length ? s.issues.map((i) => i.message).join(" ") : "Tout est OK." };
    },
  },
  {
    tool: "quit_app",
    label: "Fermer une app",
    risk: "confirm",
    description: "Ferme proprement une app (comme Cmd+Q). L'app demande elle-même s'il faut sauvegarder.",
    riskFor: (req) => (isDocumentApp(req.target) ? "ask" : "confirm"),
    validate: async (req) => {
      if (!SAFE_APP_NAME.test(req.target)) throw new Error("Nom d'app invalide.");
      if (isProtected(req.target)) throw new Error(`${req.target} est protégée.`);
      if (!(await runningApp(req.target))) throw new Error(`${req.target} n'est pas ouverte.`);
    },
    execute: async (req) => {
      const before = await runningApp(req.target);
      await osa(["on run argv", "tell application (item 1 of argv) to quit", "end run"], [req.target]);
      return {
        detail: `${req.target} fermée.`,
        freedMb: before?.memMb,
        undo: async () => {
          await run("open", ["-a", req.target]);
          return `${req.target} rouverte.`;
        },
      };
    },
  },
  {
    tool: "close_tabs",
    label: "Fermer des onglets Chrome",
    risk: "confirm",
    description: "Ferme des onglets Chrome par URL (mode « duplicates » : garde le premier). Les liens sont gardés pour les rouvrir.",
    validate: async (req) => {
      const urls = req.args?.urls;
      if (!Array.isArray(urls) || !urls.length || !urls.every((u) => typeof u === "string")) throw new Error("Liste d'URL manquante.");
    },
    execute: async (req) => {
      const urls = req.args!.urls as string[];
      const mode = req.args?.mode === "all" ? "all" : "duplicates";
      const { stdout } = await osa(CLOSE_TABS_SCRIPT, [mode, ...urls]);
      const closed = Number(stdout.trim()) || 0;
      const reopen = urls.filter((u) => SAFE_URL.test(u));
      return {
        detail: `${closed} onglet(s) fermé(s).`,
        freedMb: closed * 80, // estimation : ~80 Mo par onglet
        undo: async () => {
          if (reopen.length) await run("open", ["-a", "Google Chrome", ...reopen]);
          return `${reopen.length} onglet(s) rouvert(s).`;
        },
      };
    },
  },
  {
    tool: "open_url",
    label: "Ouvrir un lien (meeting, doc)",
    risk: "confirm",
    description: "Ouvre un lien de meeting ou un document (https, msteams, zoom, webex).",
    validate: async (req) => {
      if (!SAFE_URL.test(req.target)) throw new Error("Lien refusé (seuls https, Teams, Zoom, Webex).");
    },
    execute: async (req) => {
      await run("open", [req.target]);
      return { detail: `Ouvert : ${req.target}` };
    },
  },
  {
    tool: "open_app",
    label: "Ouvrir une app",
    risk: "confirm",
    description: "Lance une app nécessaire au prochain bloc.",
    validate: async (req) => {
      if (!SAFE_APP_NAME.test(req.target)) throw new Error("Nom d'app invalide.");
    },
    execute: async (req) => {
      await run("open", ["-a", req.target]);
      return {
        detail: `${req.target} ouverte.`,
        undo: async () => {
          await osa(["on run argv", "tell application (item 1 of argv) to quit", "end run"], [req.target]);
          return `${req.target} refermée.`;
        },
      };
    },
  },
  {
    tool: "install_update",
    label: "Installer une mise à jour",
    risk: "ask",
    description: "Mise à jour système avec redémarrage. Toujours simulée dans ce prototype.",
    validate: async () => {},
    execute: async (req) => ({ detail: `Simulé : ${req.target} planifiée.` }),
  },
];

export const catalog = (): ToolInfo[] => tools.map(({ tool, label, risk, description }) => ({ tool, label, risk, description }));
export const riskOf = (req: ActionRequest): Risk => {
  const def = tools.find((t) => t.tool === req.tool);
  return def ? (def.riskFor?.(req) ?? def.risk) : "ask";
};

/* ---------- Journal ---------- */

const journalPath = () => join(app.getPath("userData"), "journal.json");
let journal: ActionLogEntry[] = [];
const undos = new Map<string, () => Promise<string>>();
let onChange: (j: ActionLogEntry[]) => void = () => {};

export function initJournal(listener: (j: ActionLogEntry[]) => void) {
  onChange = listener;
  try {
    // Les « annuler » ne survivent pas à un redémarrage : on les désactive pour les anciennes entrées.
    journal = (JSON.parse(readFileSync(journalPath(), "utf8")) as ActionLogEntry[]).map((e) => ({ ...e, undoable: false }));
  } catch {
    journal = [];
  }
}

function save() {
  try {
    writeFileSync(journalPath(), JSON.stringify(journal.slice(0, 500), null, 2));
  } catch {
    /* le journal en mémoire suffit */
  }
  onChange(journal);
}

export const getJournal = () => journal;

/** Exécute les actions validées par l'utilisateur, une par une, et les journalise. */
export async function runActions(requests: ActionRequest[]): Promise<ActionLogEntry[]> {
  const results: ActionLogEntry[] = [];
  for (const req of requests) {
    const def = tools.find((t) => t.tool === req.tool);
    const entry: ActionLogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      at: now().toISOString(), // heure de l'app : suit l'horloge de démo
      tool: req.tool,
      target: req.target,
      risk: def ? (def.riskFor?.(req) ?? def.risk) : "ask",
      status: "failed",
      detail: "",
      undoable: false,
    };
    try {
      if (!def) throw new Error(`Outil inconnu : ${req.tool}`);
      await def.validate(req);
      // La lecture seule s'exécute toujours ; le reste est simulé tant que PREFLIGHT_DRY_RUN n'est pas à 0.
      if (dryRun() && def.risk !== "auto") {
        entry.status = "simulated";
        entry.detail = `Simulation : ${def.label.toLowerCase()} → ${req.target}`;
      } else {
        const out = await def.execute(req);
        entry.status = def.tool === "install_update" ? "simulated" : "done";
        entry.detail = out.detail;
        entry.freedMb = out.freedMb;
        if (out.undo) {
          entry.undoable = true;
          undos.set(entry.id, out.undo);
        }
      }
    } catch (error) {
      entry.detail = String((error as Error).message ?? error);
    }
    journal = [entry, ...journal];
    results.push(entry);
  }
  save();
  return results;
}

export async function undo(id: string): Promise<ActionLogEntry | null> {
  const fn = undos.get(id);
  const entry = journal.find((e) => e.id === id);
  if (!fn || !entry) return null;
  try {
    entry.detail = `${entry.detail} · Annulé : ${await fn()}`;
    entry.status = "undone";
  } catch (error) {
    entry.detail = `${entry.detail} · Échec de l'annulation : ${(error as Error).message}`;
  }
  entry.undoable = false;
  undos.delete(id);
  save();
  return entry;
}
