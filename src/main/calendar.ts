/**
 * Calendrier : lit un fichier .ics et en tire les meetings du jour.
 * Sources, par ordre de priorité (dans .env) :
 *   CALENDAR_ICS_URL  : lien ICS secret (Outlook « Publier un calendrier », Google « Adresse secrète iCal »)
 *   CALENDAR_ICS_FILE : chemin d'un fichier .ics
 *   sinon             : resources/demo.ics, dont les meetings sont recalés sur aujourd'hui
 * Les réunions récurrentes sont dépliées pour aujourd'hui (node-ical).
 */
import { app } from "electron";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { setCalendar } from "./day";
import { icsToBlocks } from "./ics";
import { now } from "./clock";
import type { CalendarInfo } from "../shared/types";

let info: CalendarInfo = { source: "demo", label: "Calendrier de démo", events: 0 };
let timer: NodeJS.Timeout | null = null;

export const calendarInfo = () => info;

async function readSource(): Promise<{ ics: string; info: Omit<CalendarInfo, "events"> }> {
  const url = process.env.CALENDAR_ICS_URL?.trim();
  const file = process.env.CALENDAR_ICS_FILE?.trim();
  if (url) {
    // Outlook ne répond qu'à un « navigateur » : on envoie un User-Agent de navigateur.
    const res = await fetch(url.replace(/^webcal:/i, "https:"), {
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/131 Safari/537.36" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Lien ICS : HTTP ${res.status}`);
    const host = new URL(url.replace(/^webcal:/i, "https:")).hostname;
    return { ics: await res.text(), info: { source: "url", label: host.includes("outlook") || host.includes("office") ? "Outlook (lien ICS)" : host.includes("google") ? "Google Agenda (lien iCal)" : `Lien ICS (${host})` } };
  }
  if (file) return { ics: await readFile(file, "utf8"), info: { source: "file", label: `Fichier ${file.split("/").pop()}` } };
  return { ics: await readFile(join(app.getAppPath(), "resources", "demo.ics"), "utf8"), info: { source: "demo", label: "Calendrier de démo" } };
}

/** Charge (ou recharge) le calendrier du jour. En cas d'erreur, retombe sur la démo. */
export async function loadCalendar(): Promise<CalendarInfo> {
  try {
    const { ics, info: src } = await readSource();
    const blocks = icsToBlocks(ics, now(), src.source === "demo");
    setCalendar(blocks);
    info = { ...src, events: blocks.length, loadedAt: new Date().toISOString() };
  } catch (error) {
    const ics = await readFile(join(app.getAppPath(), "resources", "demo.ics"), "utf8");
    const blocks = icsToBlocks(ics, now(), true);
    setCalendar(blocks);
    info = { source: "demo", label: "Calendrier de démo (source réelle en erreur)", events: blocks.length, error: String((error as Error).message ?? error), loadedAt: new Date().toISOString() };
  }
  // Un lien distant est relu toutes les 10 min.
  if (!timer && process.env.CALENDAR_ICS_URL) timer = setInterval(() => void loadCalendar(), 10 * 60_000);
  return info;
}
