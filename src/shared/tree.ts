/** Construit l'arbre « pourquoi » (blocs de la journée → apps ouvertes) à partir d'une photo du poste. */
import { appMatches, isProtected } from "./apps";
import type { DayBlock, DeviceSnapshot } from "./types";

export type TreeNodeType = "block" | "useful" | "idle" | "heavy";
export interface TreeNode { id: string; label: string; detail: string; type: TreeNodeType; column: number; memMb?: number }
export interface TreeLink { source: string; target: string; label?: string }

const HEAVY_MB = 500;
const MAX_APPS = 10;

export function buildTree(day: DayBlock[], snap: DeviceSnapshot) {
  const blocks = day.filter((b) => b.kind !== "free");
  const nodes: TreeNode[] = blocks.map((b) => ({
    id: `blk-${b.id}`,
    label: `${b.title} ${b.start}`,
    detail: b.kind === "meeting" ? "meeting" : "tâche du matin",
    type: "block",
    column: 0,
  }));
  nodes.push({ id: "blk-none", label: "Rien de prévu", detail: "pas lié à ta journée", type: "block", column: 0 });

  const links: TreeLink[] = [];
  const apps = snap.apps.filter((a) => !isProtected(a.name)).slice(0, MAX_APPS);
  for (const a of apps) {
    const owners = blocks.filter((b) => b.apps.some((w) => appMatches(w, a.name)));
    const type: TreeNodeType = owners.length ? "useful" : a.memMb >= HEAVY_MB && a.cpu < 5 ? "heavy" : "idle";
    const tabs = a.name === "Google Chrome" && snap.chromeTabs ? ` · ${snap.chromeTabs.length} onglets` : "";
    const id = `app-${a.name}`;
    nodes.push({ id, label: a.name, detail: `${a.memMb} Mo · CPU ${a.cpu} %${tabs}`, type, column: 1, memMb: a.memMb });
    if (owners.length) owners.forEach((b) => links.push({ source: `blk-${b.id}`, target: id, label: "nécessaire" }));
    else links.push({ source: "blk-none", target: id, label: type === "heavy" ? `${(a.memMb / 1024).toFixed(1).replace(".", ",")} Go` : undefined });
  }
  // On masque les blocs sans app pour garder l'arbre lisible.
  const used = new Set(links.map((l) => l.source));
  return { nodes: nodes.filter((n) => n.column === 1 || used.has(n.id)), links };
}
