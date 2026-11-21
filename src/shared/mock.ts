/**
 * Données de démo. Elles seront remplacées par le vrai calendrier (.ics) et les vrais capteurs,
 * mais elles gardent la même forme : l'UI ne changera pas.
 */
import type { DayBlock, ProposedAction } from "./types";

export const mockDay: DayBlock[] = [
  { id: "b1", start: "09:00", end: "09:30", title: "Mails + Slack", kind: "focus", source: "morning", apps: ["Outlook", "Slack"] },
  { id: "b2", start: "10:00", end: "10:45", title: "Sync équipe produit", kind: "meeting", source: "calendar", apps: ["Teams"], link: "https://teams.microsoft.com/" },
  { id: "b3", start: "10:45", end: "11:30", title: "Créneau libre", kind: "free", source: "calendar", apps: [] },
  { id: "b4", start: "11:30", end: "12:00", title: "Revue budget avec Finance", kind: "meeting", source: "calendar", apps: ["Teams", "Excel"] },
  { id: "b5", start: "14:00", end: "16:00", title: "Finir le rapport Q4", kind: "focus", source: "morning", apps: ["Excel", "Chrome"] },
];

export const mockPreflight: ProposedAction[] = [
  { id: "a1", tool: "check_device", target: "Wi-Fi, batterie, disque", reason: "Vérifié automatiquement : Wi-Fi faible (−78 dBm), batterie 12 %.", risk: "auto" },
  { id: "a2", tool: "quit_app", target: "Docker Desktop", reason: "2,1 Go de RAM, pas utilisé depuis hier, pas lié à ta journée.", risk: "confirm" },
  { id: "a3", tool: "close_tabs", target: "11 onglets Chrome inactifs", reason: "Pas ouverts depuis 3 h. Je garde leurs liens pour les rouvrir.", risk: "confirm" },
  { id: "a4", tool: "open_meeting", target: "Teams · Sync équipe produit", reason: "Le meeting commence dans 5 min.", risk: "confirm" },
  { id: "a5", tool: "install_update", target: "Mise à jour macOS (8 min)", reason: "Redémarrage nécessaire : je te propose de la faire à 10:45, pendant ton créneau libre.", risk: "ask" },
];

/** Arbre « pourquoi » : blocs de la journée → apps ouvertes. */
export type TreeNodeType = "block" | "useful" | "idle" | "heavy";
export interface TreeNode { id: string; label: string; detail: string; type: TreeNodeType; column: number }
export interface TreeLink { source: string; target: string; label?: string }

export const mockTree: { nodes: TreeNode[]; links: TreeLink[] } = {
  nodes: [
    { id: "blk-meeting", label: "Sync équipe 10:00", detail: "meeting · dans 5 min", type: "block", column: 0 },
    { id: "blk-q4", label: "Rapport Q4 14:00", detail: "tâche du matin", type: "block", column: 0 },
    { id: "blk-none", label: "Rien de prévu", detail: "pas lié à ta journée", type: "block", column: 0 },
    { id: "app-teams", label: "Teams", detail: "380 Mo · prêt", type: "useful", column: 1 },
    { id: "app-excel", label: "Excel", detail: "540 Mo · rapport_q4.xlsx", type: "useful", column: 1 },
    { id: "app-chrome-work", label: "Chrome · 3 onglets", detail: "SharePoint, Jira, Gmail", type: "useful", column: 1 },
    { id: "app-docker", label: "Docker Desktop", detail: "2,1 Go · inactif depuis hier", type: "heavy", column: 1 },
    { id: "app-chrome-idle", label: "Chrome · 11 onglets", detail: "1,1 Go · inactifs depuis 3 h", type: "heavy", column: 1 },
    { id: "app-spotify", label: "Spotify", detail: "210 Mo · en pause", type: "idle", column: 1 },
  ],
  links: [
    { source: "blk-meeting", target: "app-teams", label: "nécessaire" },
    { source: "blk-q4", target: "app-excel", label: "nécessaire" },
    { source: "blk-q4", target: "app-chrome-work" },
    { source: "blk-none", target: "app-docker", label: "2,1 Go" },
    { source: "blk-none", target: "app-chrome-idle", label: "1,1 Go" },
    { source: "blk-none", target: "app-spotify" },
  ],
};
