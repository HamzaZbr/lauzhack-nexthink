/**
 * Données de démo. Elles seront remplacées par le vrai calendrier (.ics) et les vrais capteurs,
 * mais elles gardent la même forme : l'UI ne changera pas.
 */
import type { DayBlock } from "./types";

export const mockDay: DayBlock[] = [
  { id: "b1", start: "09:00", end: "09:30", title: "Mails + Slack", kind: "focus", source: "morning", apps: ["Outlook", "Slack"] },
  { id: "b2", start: "10:00", end: "10:45", title: "Sync équipe produit", kind: "meeting", source: "calendar", apps: ["Teams"], link: "https://teams.microsoft.com/" },
  { id: "b3", start: "10:45", end: "11:30", title: "Créneau libre", kind: "free", source: "calendar", apps: [] },
  { id: "b4", start: "11:30", end: "12:00", title: "Revue budget avec Finance", kind: "meeting", source: "calendar", apps: ["Teams", "Excel"] },
  { id: "b5", start: "14:00", end: "16:00", title: "Finir le rapport Q4", kind: "focus", source: "morning", apps: ["Excel", "Chrome"] },
];
