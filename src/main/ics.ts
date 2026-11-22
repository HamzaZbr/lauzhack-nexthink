/** Lecture d'un .ics → meetings du jour (fonctions pures, testables sans Electron). */
import * as ical from "node-ical";
import type { DayBlock } from "../shared/types";
import { needsFromText } from "../shared/needs";

export const text = (v: unknown): string => (typeof v === "string" ? v : (v as { val?: string } | undefined)?.val ?? "");
const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

const LINK = /(https:\/\/teams\.microsoft\.com\/l\/meetup-join\/[^\s<>"']+|https:\/\/[\w.-]*zoom\.us\/j\/[^\s<>"']+|https:\/\/[\w.-]*webex\.com\/[^\s<>"']+|https:\/\/meet\.google\.com\/[\w-]+)/i;

/** Participants d'une invitation : le nom (CN) s'il existe, sinon l'adresse sans « mailto: ». */
export function attendeesOf(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return [
    ...new Set(
      list
        .map((a) => {
          const o = a as { params?: { CN?: string }; val?: string };
          const name = o?.params?.CN ?? (typeof a === "string" ? a : o?.val) ?? "";
          return String(name).replace(/^mailto:/i, "").replace(/^"|"$/g, "").trim();
        })
        .filter((x) => x.length > 1),
    ),
  ].slice(0, 20);
}

/** Devine les apps d'un meeting à partir de son lien et de sa description. */
export function appsFor(blob: string, link?: string): string[] {
  const apps = new Set<string>();
  if (link?.includes("teams.microsoft.com")) apps.add("Teams");
  if (link?.includes("zoom.us")) apps.add("zoom.us");
  if (link?.includes("webex.com")) apps.add("Webex");
  if (link?.includes("meet.google.com")) apps.add("Chrome");
  if (/excel|\.xlsx|tableur/i.test(blob)) apps.add("Excel");
  if (/powerpoint|\.pptx|slides/i.test(blob)) apps.add("PowerPoint");
  if (/\bword\b|\.docx/i.test(blob)) apps.add("Word");
  if (/antigravity/i.test(blob)) apps.add("Antigravity");
  if (/vs ?code|visual studio code/i.test(blob)) apps.add("Visual Studio Code");
  return [...apps];
}

/** Sites utiles cités dans l'événement (hors lien de visio) : leurs onglets sont gardés, mis devant ou ouverts. */
export function sitesOf(blob: string, link?: string): string[] {
  const hosts = (blob.match(/https?:\/\/[^\s"<>]+/g) ?? [])
    .filter((u) => u !== link)
    .map((u) => {
      try {
        return new URL(u).hostname.replace(/^www\./, "");
      } catch {
        return "";
      }
    })
    .filter((h) => h && !/zoom\.us|teams\.microsoft|webex|meet\.google/.test(h));
  return [...new Set(hosts)].slice(0, 3);
}

/** Transforme un .ics en blocs (meetings et blocs de travail) pour la journée `day`. `mapToToday` : ignore la date (calendrier de démo). */
export function icsToBlocks(ics: string, day: Date, mapToToday = false): DayBlock[] {
  const data = ical.sync.parseICS(ics);
  const from = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0);
  const to = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59, 59);
  const blocks: DayBlock[] = [];
  for (const comp of Object.values(data)) {
    if (!comp || comp.type !== "VEVENT") continue;
    const ev = comp as ical.VEvent;
    if (ev.status === "CANCELLED" || ev.datetype === "date") continue; // pas les journées entières
    const instances: Array<{ start: Date; end: Date; ev: ical.VEvent }> = mapToToday
      ? [{ start: new Date(ev.start), end: new Date(ev.end ?? ev.start), ev }]
      : ical
          .expandRecurringEvent(ev, { from, to })
          .filter((i) => !i.isFullDay)
          .map((i) => ({ start: new Date(i.start), end: new Date(i.end), ev: i.event }));
    for (const inst of instances) {
      if (!mapToToday && (inst.end <= from || inst.start >= to)) continue;
      const blob = `${text(inst.ev.summary)} ${text(inst.ev.description)} ${text(inst.ev.location)}`;
      const link = blob.match(LINK)?.[1];
      blocks.push({
        id: `cal-${blocks.length + 1}`,
        start: hhmm(inst.start),
        end: hhmm(inst.end),
        title: text(inst.ev.summary).slice(0, 60) || "(sans titre)",
        // Un événement avec un lien de visio ou des participants est un meeting ; sinon, un bloc de travail que tu t'es réservé.
        kind: link || attendeesOf((inst.ev as unknown as { attendee?: unknown }).attendee).length >= 2 ? "meeting" : "focus",
        source: "calendar",
        apps: appsFor(blob, link),
        sites: sitesOf(blob, link),
        link,
        docs: [...new Set((blob.match(/[\w.-]+\.(xlsx|xls|csv|docx|doc|pptx|ppt|key|pages|numbers|pdf)\b/gi) ?? []).map((f) => f.replace(/\.[a-z]+$/i, "")))].slice(0, 3),
        location: text(inst.ev.location).trim().slice(0, 120) || undefined,
        attendees: attendeesOf((inst.ev as unknown as { attendee?: unknown }).attendee),
        needs: needsFromText(blob, { link, minutes: Math.round((inst.end.getTime() - inst.start.getTime()) / 60_000) }),
        notes: text(inst.ev.description).replace(/https?:\/\/\S+/g, "").replace(/\s+/g, " ").trim().slice(0, 300) || undefined,
      });
    }
  }
  const seen = new Set<string>();
  return blocks
    .sort((a, b) => a.start.localeCompare(b.start))
    .filter((b) => {
      const k = `${b.start}|${b.title}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}

