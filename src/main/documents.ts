/**
 * Documents de l'entreprise (Lémanic SA, entreprise inventée pour la démo) :
 * - modèles prêts à l'emploi (présentation, rapport, tableau) : copiés dans Documents/Preflight puis ouverts ;
 * - notes de réunion pré-remplies à partir de l'invitation.
 * On ne crée que des NOUVEAUX fichiers dans Documents/Preflight : rien d'existant n'est modifié ni effacé.
 */
import { app } from "electron";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { copyFile, mkdir, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { resolveApp } from "./installed";
import { now } from "./clock";

const run = promisify(execFile);

export const TEMPLATES = {
  presentation: { file: "presentation-lemanic.pptx", name: "Présentation Lémanic", app: "PowerPoint" },
  rapport: { file: "rapport-lemanic.docx", name: "Rapport Lémanic", app: "Word" },
  tableau: { file: "tableau-lemanic.xlsx", name: "Tableau de suivi Lémanic", app: "Excel" },
} as const;
export type TemplateId = keyof typeof TEMPLATES;
export const isTemplateId = (x: string): x is TemplateId => Object.hasOwn(TEMPLATES, x);

export const OUT_DIR = join(homedir(), "Documents", "Preflight");

const stamp = () => {
  const d = now();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}h${p(d.getMinutes())}`;
};

/** Nom de fichier sûr et unique dans Documents/Preflight. */
function freshPath(base: string, ext: string) {
  const clean = base.replace(/[^\p{L}\p{N} _.,'()-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 60) || "Document";
  let path = join(OUT_DIR, `${clean} ${stamp()}.${ext}`);
  for (let i = 2; existsSync(path); i++) path = join(OUT_DIR, `${clean} ${stamp()} (${i}).${ext}`);
  return path;
}

/** Ouvre avec l'app installée (Keynote si pas de PowerPoint…), sinon avec l'app par défaut. */
async function openWith(path: string, wanted: string) {
  const appName = resolveApp(wanted);
  await run("open", appName ? ["-a", appName, path] : [path]);
  return appName ?? "l'app par défaut";
}

export async function newFromTemplate(id: TemplateId) {
  const t = TEMPLATES[id];
  await mkdir(OUT_DIR, { recursive: true });
  const ext = t.file.split(".").pop()!;
  const path = freshPath(t.name, ext);
  await copyFile(join(app.getAppPath(), "resources", "templates", t.file), path);
  const opened = await openWith(path, t.app);
  return { path, opened };
}

export interface NotesInput {
  title: string;
  date: string; // ex. « dimanche 22 novembre 2026 »
  start: string;
  end: string;
  location?: string;
  attendees?: string[];
  agenda?: string;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Notes de réunion au format HTML (converti ensuite en .docx par textutil, l'outil intégré à macOS). */
export function notesHtml(n: NotesInput): string {
  const row = (k: string, v: string) => `<p style="margin:2pt 0"><b style="color:#1F3A5F">${esc(k)}</b> ${esc(v)}</p>`;
  return [
    `<html><head><meta charset="utf-8"></head><body style="font-family:'Helvetica Neue',Helvetica,Arial;font-size:11pt;color:#222">`,
    `<p style="color:#E8A33D;font-size:9pt;font-weight:bold">■ LÉMANIC SA · NOTES DE RÉUNION</p>`,
    `<h1 style="color:#1F3A5F;font-size:22pt;margin:6pt 0">${esc(n.title)}</h1>`,
    row("Date :", `${n.date}, ${n.start}–${n.end}`),
    n.location ? row("Lieu :", n.location) : "",
    row("Participants :", n.attendees?.length ? n.attendees.join(", ") : "—"),
    `<h2 style="color:#1F3A5F;font-size:14pt;margin-top:14pt">Ordre du jour</h2>`,
    `<p>${n.agenda ? esc(n.agenda) : "—"}</p>`,
    `<h2 style="color:#1F3A5F;font-size:14pt;margin-top:14pt">Notes</h2><p>&nbsp;</p>`,
    `<h2 style="color:#1F3A5F;font-size:14pt;margin-top:14pt">Décisions</h2><ul><li>&nbsp;</li></ul>`,
    `<h2 style="color:#1F3A5F;font-size:14pt;margin-top:14pt">Actions</h2>`,
    `<table border="1" cellpadding="4" style="border-collapse:collapse;width:100%"><tr style="background:#1F3A5F;color:#fff"><th>Action</th><th>Qui</th><th>Pour quand</th></tr><tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr></table>`,
    `<p style="color:#5A6470;font-size:9pt;margin-top:18pt">Pré-rempli par Preflight à partir de l'invitation.</p>`,
    `</body></html>`,
  ].join("\n");
}

export async function meetingNotes(n: NotesInput) {
  await mkdir(OUT_DIR, { recursive: true });
  const path = freshPath(`Notes – ${n.title}`, "docx");
  const html = join(tmpdir(), `preflight-notes-${Date.now()}.html`);
  await writeFile(html, notesHtml(n), "utf8");
  try {
    await run("textutil", ["-convert", "docx", "-output", path, html], { timeout: 15_000 });
  } finally {
    await rm(html, { force: true });
  }
  const opened = await openWith(path, "Word");
  return { path, opened };
}
