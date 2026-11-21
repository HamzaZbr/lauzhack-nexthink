/**
 * Arbre « pourquoi » : ta journée (colonne 0) → les apps (colonne 1) → les onglets Chrome par site (colonne 2).
 * - une app nécessaire à un bloc mais fermée apparaît en pointillés (« à ouvrir ») ;
 * - une app lourde qui ne sert à aucun bloc est en corail ;
 * - les 74 onglets deviennent quelques groupes par site, triés (travail / pas lié / à trier).
 */
import { appMatches, isProtected } from "./apps";
import type { DayBlock, DeviceSnapshot } from "./types";

export type TreeNodeType = "block" | "useful" | "idle" | "heavy" | "missing" | "tabs";
export interface TreeNode {
  id: string;
  label: string;
  detail: string;
  type: TreeNodeType;
  column: number;
  memMb?: number;
  cpu?: number;
  appName?: string;
  tabs?: Array<{ title: string; url: string }>;
  blocks?: string[]; // titres des blocs liés
  start?: string;
}
export interface TreeLink { source: string; target: string; label?: string }

const HEAVY_MB = 500;
const MAX_APPS = 8;
const MIN_MB = 100;
const MAX_TAB_GROUPS = 5;

// Heuristique en attendant le tri par le LLM.
const WORK_SITES = /sharepoint|office|microsoft|teams|outlook|live\.com|docs\.google|drive\.google|notion|jira|atlassian|confluence|github|gitlab|figma|slack|zoom|webex|moodle|epfl/i;
const OFF_SITES = /youtube|netflix|instagram|facebook|tiktok|twitter|x\.com|reddit|twitch|primevideo|disney|spotify/i;

export const domainOf = (url: string) => {
  try {
    const u = new URL(url);
    return u.protocol.startsWith("http") ? u.hostname.replace(/^www\./, "") : u.protocol.replace(":", "");
  } catch {
    return "autre";
  }
};

export function buildTree(day: DayBlock[], snap: DeviceSnapshot) {
  const blocks = day.filter((b) => b.kind !== "free").sort((a, b) => a.start.localeCompare(b.start));
  const nodes: TreeNode[] = [];
  const links: TreeLink[] = [];

  for (const b of blocks)
    nodes.push({
      id: `blk-${b.id}`,
      label: b.title,
      detail: `${b.start}–${b.end} · ${b.kind === "meeting" ? "meeting" : "tâche"}`,
      type: "block",
      column: 0,
      start: b.start,
    });

  const running = snap.apps.filter((a) => !isProtected(a.name) && a.memMb >= MIN_MB).slice(0, MAX_APPS);
  const linked = new Set<string>();

  // Blocs → apps nécessaires (ouvertes ou non)
  for (const b of blocks) {
    for (const wanted of b.apps) {
      const app = running.find((a) => appMatches(wanted, a.name)) ?? snap.apps.find((a) => appMatches(wanted, a.name));
      if (app) {
        const id = `app-${app.name}`;
        if (!nodes.some((n) => n.id === id))
          nodes.push({ id, label: app.name, detail: `${app.memMb} Mo · CPU ${app.cpu} %`, type: "useful", column: 1, memMb: app.memMb, cpu: app.cpu, appName: app.name, blocks: [] });
        nodes.find((n) => n.id === id)!.blocks!.push(b.title);
        links.push({ source: `blk-${b.id}`, target: id });
        linked.add(app.name);
      } else {
        const name = wanted === "Teams" ? "Microsoft Teams" : wanted === "Chrome" ? "Google Chrome" : wanted;
        const id = `miss-${name}`;
        if (!nodes.some((n) => n.id === id))
          nodes.push({ id, label: name, detail: `fermée · à ouvrir avant ${b.start}`, type: "missing", column: 1, appName: name, blocks: [] });
        nodes.find((n) => n.id === id)!.blocks!.push(b.title);
        links.push({ source: `blk-${b.id}`, target: id, label: "à ouvrir" });
      }
    }
  }

  // Apps qui ne servent à aucun bloc
  const unrelated = running.filter((a) => !linked.has(a.name));
  if (unrelated.length) {
    nodes.push({ id: "blk-none", label: "Rien de prévu", detail: "pas lié à ta journée", type: "block", column: 0 });
    for (const a of unrelated) {
      const type: TreeNodeType = a.memMb >= HEAVY_MB && a.cpu < 5 ? "heavy" : "idle";
      const id = `app-${a.name}`;
      nodes.push({ id, label: a.name, detail: `${a.memMb} Mo · CPU ${a.cpu} %`, type, column: 1, memMb: a.memMb, cpu: a.cpu, appName: a.name, blocks: [] });
      links.push({ source: "blk-none", target: id, label: type === "heavy" ? `${(a.memMb / 1024).toFixed(1).replace(".", ",")} Go` : undefined });
    }
  }

  // Chrome → onglets groupés par site
  const chrome = nodes.find((n) => n.appName === "Google Chrome" && n.column === 1 && n.type !== "missing");
  if (chrome && snap.chromeTabs?.length) {
    chrome.detail = `${chrome.memMb} Mo · ${snap.chromeTabs.length} onglets`;
    const groups = new Map<string, Array<{ title: string; url: string }>>();
    for (const t of snap.chromeTabs) {
      const d = domainOf(t.url);
      groups.set(d, [...(groups.get(d) ?? []), { title: t.title, url: t.url }]);
    }
    const sorted = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
    const top = sorted.slice(0, MAX_TAB_GROUPS);
    const rest = sorted.slice(MAX_TAB_GROUPS).flatMap(([, tabs]) => tabs);
    const all = rest.length ? [...top, [`${sorted.length - MAX_TAB_GROUPS} autres sites`, rest] as [string, typeof rest]] : top;
    for (const [domain, tabs] of all) {
      const dupes = tabs.length - new Set(tabs.map((t) => t.url)).size;
      const type: TreeNodeType = WORK_SITES.test(domain) ? "useful" : OFF_SITES.test(domain) ? "idle" : "tabs";
      const id = `tabs-${domain}`;
      nodes.push({
        id,
        label: domain,
        detail: `${tabs.length} onglet${tabs.length > 1 ? "s" : ""}${dupes ? ` · ${dupes} en double` : ""}${type === "idle" ? " · pas lié à ta journée" : type === "tabs" ? " · à trier" : ""}`,
        type,
        column: 2,
        tabs,
      });
      links.push({ source: chrome.id, target: id, label: String(tabs.length) });
    }
  }

  return { nodes, links };
}
