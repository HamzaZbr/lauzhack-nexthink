/**
 * Préparer l'espace de travail d'un bloc : trouver les documents cités (Spotlight) et les onglets utiles.
 * Lecture seule : ce fichier ne fait que PROPOSER ; l'exécution passe par le registre d'actions.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename } from "node:path";
import type { ActionRequest, ChromeTab, DayBlock } from "../shared/types";

const run = promisify(execFile);

export const DOC_EXT = /\.(xlsx|xls|csv|docx|doc|pptx|ppt|key|pages|numbers|pdf|ipynb|md|txt)$/i;
const SKIP = /\/(Library|node_modules|\.git|\.Trash|\.cache|\.npm|\.gradle|venv|\.venv|site-packages)\//;

export interface FoundDoc {
  path: string;
  name: string;
  modified: Date;
}

/** Cherche un document par mot-clé avec Spotlight (mdfind), dans ton dossier personnel ; renvoie le plus récent. */
export async function findDoc(keyword: string): Promise<FoundDoc | null> {
  const k = keyword.replace(/\.[a-z]{2,5}$/i, "").trim();
  if (k.length < 2) return null;
  try {
    const { stdout } = await run("mdfind", ["-onlyin", homedir(), "-name", k], { timeout: 3000, maxBuffer: 4 * 1024 * 1024 });
    const paths = stdout.split("\n").filter((p) => p && DOC_EXT.test(p) && !SKIP.test(p)).slice(0, 40);
    const withDates = await Promise.all(
      paths.map(async (p) => {
        try {
          return { path: p, name: basename(p), modified: (await stat(p)).mtime };
        } catch {
          return null;
        }
      }),
    );
    return withDates.filter((x): x is FoundDoc => !!x).sort((a, b) => b.modified.getTime() - a.modified.getTime())[0] ?? null;
  } catch {
    return null;
  }
}

const ago = (d: Date) => {
  const h = Math.round((Date.now() - d.getTime()) / 3_600_000);
  return h < 1 ? "il y a moins d'une heure" : h < 48 ? `il y a ${h} h` : `il y a ${Math.round(h / 24)} jours`;
};

/** Actions pour préparer le bloc : documents à ouvrir, onglets à mettre devant ou sites à ouvrir. */
export async function planWorkspace(block: DayBlock, tabs: ChromeTab[] | null): Promise<Array<{ req: ActionRequest; reason: string }>> {
  const out: Array<{ req: ActionRequest; reason: string }> = [];

  // Documents cités dans le brief ou l'invitation
  const docs = await Promise.all((block.docs ?? []).map(async (k) => ({ k, found: await findDoc(k) })));
  for (const { k, found } of docs) {
    if (found)
      out.push({
        req: { tool: "open_file", target: found.path },
        reason: `Trouvé sur ton Mac pour « ${k} » : ${found.name}, modifié ${ago(found.modified)}.`,
      });
  }

  // Sites utiles : onglet déjà ouvert → le mettre devant ; sinon l'ouvrir
  for (const site of block.sites ?? []) {
    const tab = tabs?.find((t) => {
      try {
        const host = new URL(t.url).hostname.replace(/^www\./, "");
        return host === site || host.endsWith(`.${site}`);
      } catch {
        return false;
      }
    });
    if (tab) out.push({ req: { tool: "focus_tab", target: site, args: { url: tab.url, title: tab.title } }, reason: `Ton onglet « ${tab.title.slice(0, 60)} » est déjà ouvert : je le mets devant.` });
    else out.push({ req: { tool: "open_url", target: `https://${site}` }, reason: `Site utile pour « ${block.title} ».` });
  }
  return out;
}
