/**
 * Tri des onglets : fonctions pures (testables sans Electron).
 * L'IA renvoie seulement les onglets qu'elle propose de FERMER (le reste est gardé par défaut).
 * Ce fichier décide ce qui est AUTORISÉ :
 * - index invalide → ignoré ; onglet non cité → gardé ;
 * - jamais fermés : l'onglet affiché en ce moment, le lien du meeting, la messagerie,
 *   les documents Office/Google si le meeting en a besoin, les sites de travail connus (GitHub, Stack Overflow,
 *   docs, Moodle…) et les vidéos de tuto ;
 * - si une copie d'une URL est gardée, aucune copie n'est fermée ;
 * - au plus MAX_CLOSE onglets d'un coup.
 */
import type { ChromeTab, DayBlock, TabVerdict } from "../shared/types";

export const MAX_CLOSE = 40;

export interface LlmTabClose {
  i: number;
  reason: string;
}

export const hostOf = (url: string) => {
  try {
    const u = new URL(url);
    if (u.protocol === "file:") return "fichiers locaux";
    if (u.protocol === "chrome:" || u.protocol === "chrome-extension:") return "pages Chrome";
    return u.hostname.replace(/^www\./, "");
  } catch {
    return "autre";
  }
};

/**
 * Sites de travail : jamais fermés, même si l'IA le propose. Le code a le dernier mot.
 * (Ajoute les tiens avec WORK_SITES=exemple.com,autre.org dans .env.)
 */
const WORK = /(^|\.)(github\.com|gitlab\.com|bitbucket\.org|stackoverflow\.com|stackexchange\.com|superuser\.com|serverfault\.com|epfl\.ch|arxiv\.org|huggingface\.co|notion\.so|overleaf\.com|kaggle\.com|colab\.research\.google\.com|chatgpt\.com|claude\.ai|figma\.com|python\.org|pytorch\.org|kotlinlang\.org|developer\.mozilla\.org|developer\.apple\.com|readthedocs\.io|npmjs\.com|localhost)$|^(docs|developer|learn)\./i;
/** Une vidéo YouTube de travail (tuto, cours, conférence) n'est pas une distraction. */
const WORK_VIDEO = /tuto|tutorial|cours|course|lecture|le[çc]on|conf[ée]rence|talk|how to|explained|introduction to|crash course/i;
const extraWork = () =>
  (process.env.WORK_SITES ?? "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);

/** L'onglet est-il un site de travail connu ? (raison, ou null) */
export function workReason(tab: ChromeTab): string | null {
  const host = hostOf(tab.url);
  if (host === "fichiers locaux") return "fichier local ouvert";
  if (WORK.test(host) || extraWork().some((s) => host === s || host.endsWith(`.${s}`))) return "site de travail";
  if (/youtube\.com$|youtu\.be$/.test(host) && WORK_VIDEO.test(`${tab.title} ${decodeURIComponent(tab.url)}`)) return "vidéo de travail (tuto, cours)";
  return null;
}

const MAIL = /outlook\.(office|live)|mail\.google|proton\.me|^mail\./i;
const OFFICE = /sharepoint|office\.com|officeapps|onedrive|live\.com|docs\.google|drive\.google/i;

/** Raison de protection d'un onglet, ou null s'il peut être fermé. */
export function protectedReason(tab: ChromeTab, block: DayBlock | null): string | null {
  const host = hostOf(tab.url);
  if (tab.active) return "onglet affiché en ce moment";
  if (block?.sites?.some((s) => host === s || host.endsWith(`.${s}`))) return `site utile pour « ${block.title} »`;
  if (block?.link && host === hostOf(block.link)) return "lien du meeting";
  if (MAIL.test(host)) return "messagerie (brouillon possible)";
  if (block && OFFICE.test(host) && block.apps.some((a) => /excel|word|powerpoint|teams|numbers|pages|keynote/i.test(a))) return "document utile au meeting";
  return workReason(tab);
}

export function applyTriage(tabs: ChromeTab[], closeList: LlmTabClose[], block: DayBlock | null): TabVerdict[] {
  const toClose = new Map<number, string>();
  for (const c of closeList ?? []) {
    if (c && Number.isInteger(c.i) && c.i >= 0 && c.i < tabs.length) toClose.set(c.i, String(c.reason ?? "").slice(0, 80));
  }
  const verdicts: TabVerdict[] = tabs.map((t, i) => {
    const guard = protectedReason(t, block);
    const wanted = toClose.has(i);
    return {
      title: t.title,
      url: t.url,
      domain: hostOf(t.url),
      close: wanted && !guard,
      reason: guard ? `gardé : ${guard}` : wanted ? toClose.get(i) || "sans rapport avec ta journée" : "gardé par l'IA",
    };
  });
  // Si une copie d'une URL est gardée, on ne ferme aucune copie (la fermeture se fait par URL).
  const kept = new Set(verdicts.filter((v) => !v.close).map((v) => v.url));
  for (const v of verdicts)
    if (v.close && kept.has(v.url)) {
      v.close = false;
      v.reason = "gardé : une autre copie de cette page est gardée";
    }
  let n = 0;
  for (const v of verdicts)
    if (v.close && ++n > MAX_CLOSE) {
      v.close = false;
      v.reason = `gardé : maximum ${MAX_CLOSE} fermetures d'un coup`;
    }
  return verdicts;
}
