import { useCallback, useEffect, useMemo, useState } from "react";
import ReactFlow, { Background, Controls, MarkerType, Panel, Position, type Edge, type Node } from "reactflow";
import { ExternalLink, RefreshCw, RotateCcw, X } from "lucide-react";
import { buildTree, type TreeNode, type TreeNodeType } from "@shared/tree";
import { isDocumentApp, isProtected } from "@shared/apps";
import type { ActionLogEntry, ActionRequest, DayBlock, DeviceSnapshot } from "@shared/types";
import { columnLayout, edgeTypes, NODE_H, NODE_W, STEP } from "../graphMotion";

const typeLabel: Record<TreeNodeType, string> = {
  block: "bloc de la journée",
  useful: "utile aujourd'hui",
  idle: "pas lié à ta journée",
  heavy: "inactif et lourd",
  missing: "à ouvrir",
  tabs: "onglets à trier",
};

/**
 * Page « Mon PC » : l'état du Mac et l'arbre « pourquoi ».
 * Clic sur un nœud → panneau à droite avec le détail et l'action possible (passe par le registre d'actions).
 */
export function MyPc() {
  const [snap, setSnap] = useState<DeviceSnapshot | null>(null);
  const [day, setDay] = useState<DayBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [replay, setReplay] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [s, d] = await Promise.all([window.api.snapshot(true), window.api.day()]);
    setSnap(s);
    setDay(d);
    setLoading(false);
    setReplay((n) => n + 1);
  }, []);

  useEffect(() => {
    void refresh();
    return window.api.onEvent((e) => {
      if (e.type === "day-updated") setDay(e.payload as DayBlock[]);
    });
  }, [refresh]);

  const tree = useMemo(() => (snap ? buildTree(day, snap) : { nodes: [] as TreeNode[], links: [] }), [snap, day]);
  const maxMb = Math.max(1, ...tree.nodes.map((n) => n.memMb ?? 0));

  const flow = useMemo(() => {
    const { nodes, links } = tree;
    // Le layout de Contagion ne gère pas un graphe vide (boucle sur des colonnes inexistantes).
    if (!nodes.length) return { flowNodes: [] as Node[], flowEdges: [] as Edge[] };
    const columnOf = new Map(nodes.map((n) => [n.id, n.column]));
    const order = new Map(nodes.map((n, i) => [n.id, i]));
    const layout = columnLayout(columnOf, order, links);
    const flowNodes: Node[] = nodes.map((n) => ({
      id: n.id,
      position: layout[n.id] ?? { x: 0, y: 0 },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      className: "flow-reveal",
      style: { width: NODE_W, height: NODE_H, ["--node-delay" as string]: `${n.column * STEP}s` },
      data: {
        label: (
          <div className="flow-node" data-type={n.type}>
            <span>{typeLabel[n.type]}</span>
            <strong>{n.label}</strong>
            <small>{n.detail}</small>
            {n.memMb ? <i className="mem-bar" style={{ width: `${Math.max(4, (n.memMb / maxMb) * 100)}%` }} /> : null}
          </div>
        ),
      },
    }));
    const flowEdges: Edge[] = links.map((l, i) => ({
      id: `e${i}`,
      source: l.source,
      target: l.target,
      label: l.label,
      type: "shock",
      className: `edge-shock edge-to-${nodes.find((n) => n.id === l.target)?.type ?? "idle"}`,
      markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
      data: { delay: (nodes.find((n) => n.id === l.source)?.column ?? 0) * STEP + 0.3 },
    }));
    return { flowNodes, flowEdges };
  }, [tree, maxMb]);

  const heavy = tree.nodes.filter((n) => n.type === "heavy");
  const heavyMb = heavy.reduce((s, n) => s + (n.memMb ?? 0), 0);
  const selected = tree.nodes.find((n) => n.id === selectedId) ?? null;

  return (
    <div className="page-stack">
      {snap ? <DeviceStrip snap={snap} /> : null}
      {snap?.issues.length ? (
        <div className="issue-list">
          {snap.issues.map((i) => (
            <span key={i.id} className="risk-tag" data-risk={i.level === "info" ? "auto" : i.level === "warn" ? "confirm" : "ask"}>{i.message}</span>
          ))}
        </div>
      ) : null}
      <div className="legend">
        <span><i style={{ borderColor: "var(--np-strong)" }} />bloc de la journée</span>
        <span><i style={{ borderColor: "var(--risk-auto)" }} />utile aujourd'hui</span>
        <span><i style={{ borderColor: "var(--np-strong)", borderStyle: "dashed" }} />à ouvrir</span>
        <span><i style={{ borderColor: "var(--np-accent-gold)" }} />à trier</span>
        <span><i style={{ borderColor: "var(--np-soft)" }} />pas lié à ta journée</span>
        <span><i style={{ borderColor: "var(--np-accent-coral)" }} />inactif et lourd</span>
      </div>
      <div className="graph-layout">
        <section className="graph-stage">
          {loading && !snap ? <p className="microcopy" style={{ padding: 20 }}>Lecture du Mac…</p> : (
            <ReactFlow key={replay} defaultNodes={flow.flowNodes} defaultEdges={flow.flowEdges} edgeTypes={edgeTypes}
              onNodeClick={(_, node) => setSelectedId(node.id)} onPaneClick={() => setSelectedId(null)}
              fitView fitViewOptions={{ padding: 0.15, maxZoom: 1 }} minZoom={0.25} maxZoom={1.4} proOptions={{ hideAttribution: true }}>
              <Background gap={28} size={1} color="var(--np-line-strong)" />
              <Controls />
              <Panel position="top-right" className="flow-panel">
                <div className="toolbar-row">
                  <button className="mode-toggle" onClick={() => setReplay((n) => n + 1)}><RotateCcw size={14} /> Rejouer</button>
                  <button className="mode-toggle" onClick={refresh} disabled={loading}><RefreshCw size={14} /> {loading ? "Lecture…" : "Actualiser"}</button>
                </div>
              </Panel>
            </ReactFlow>
          )}
        </section>
        <aside className="inspector-panel">
          {selected ? (
            <Inspector node={selected} onClose={() => setSelectedId(null)} onDone={refresh} />
          ) : (
            <>
              <p className="eyebrow">Proposition de l'agent</p>
              {heavy.length ? (
                <>
                  <h2>Libérer {(heavyMb / 1024).toFixed(1).replace(".", ",")} Go</h2>
                  <p className="microcopy">{heavy.map((n) => n.label).join(", ")} : lourd, inactif, et rien dans ta journée n'en a besoin.</p>
                </>
              ) : (
                <>
                  <h2>Rien de lourd à fermer</h2>
                  <p className="microcopy">Toutes les grosses apps servent à un bloc de ta journée. Regarde plutôt les onglets à trier.</p>
                </>
              )}
              <div className="divider" />
              <p className="microcopy">Clique sur un nœud de l'arbre pour voir le détail et agir dessus. Rien n'est fait sans ton clic.</p>
              <button className="run-button" style={{ marginTop: 14 }} onClick={() => window.api.openPopup("preflight")}>Préparer le prochain meeting</button>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

/** Détail d'un nœud + l'action qu'on peut faire dessus. */
function Inspector({ node, onClose, onDone }: { node: TreeNode; onClose: () => void; onDone: () => void }) {
  const [result, setResult] = useState<ActionLogEntry[] | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setResult(null), [node.id]);

  let action: { label: string; request: ActionRequest; risk: "confirm" | "ask"; warning?: string } | null = null;
  if (node.appName && node.type !== "missing" && !isProtected(node.appName) && node.appName !== "Google Chrome")
    action = {
      label: `Fermer ${node.appName}`,
      request: { tool: "quit_app", target: node.appName },
      risk: isDocumentApp(node.appName) ? "ask" : "confirm",
      warning: isDocumentApp(node.appName) ? "Peut contenir un document non sauvegardé : l'app te demandera." : node.appName === "Docker" ? "Fermer Docker arrête tes conteneurs." : undefined,
    };
  if (node.type === "missing" && node.appName)
    action = { label: `Ouvrir ${node.appName}`, request: { tool: "open_app", target: node.appName }, risk: "confirm" };
  if (node.tabs?.length)
    action = {
      label: `Fermer ces ${node.tabs.length} onglets`,
      request: { tool: "close_tabs", target: `${node.tabs.length} onglets ${node.label}`, args: { urls: node.tabs.map((t) => t.url), mode: "all" } },
      risk: "confirm",
      warning: "Ce que tu as tapé dans ces onglets (formulaire, brouillon) serait perdu. Annuler rouvre les pages.",
    };

  const run = async () => {
    if (!action) return;
    setBusy(true);
    setResult(await window.api.runActions([action.request]));
    setBusy(false);
    onDone();
  };

  return (
    <div className="inspector">
      <div className="inspector-head">
        <p className="eyebrow">{typeLabel[node.type]}</p>
        <button className="icon-button" onClick={onClose} aria-label="Fermer le détail"><X size={14} /></button>
      </div>
      <h2>{node.label}</h2>
      <p className="microcopy">{node.detail}</p>
      {node.blocks?.length ? <p className="microcopy">Nécessaire pour : {node.blocks.join(", ")}</p> : null}
      {node.tabs?.length ? (
        <ul className="tab-list">
          {node.tabs.slice(0, 8).map((t, i) => (
            <li key={i} title={t.url}><ExternalLink size={11} /> {t.title || t.url}</li>
          ))}
          {node.tabs.length > 8 ? <li className="microcopy">+ {node.tabs.length - 8} autres</li> : null}
        </ul>
      ) : null}
      {action ? (
        <>
          <div className="divider" />
          {action.warning ? <p className="microcopy">{action.warning}</p> : null}
          <div className="toolbar-row" style={{ marginTop: 10 }}>
            <button className="run-button" onClick={run} disabled={busy}>{busy ? "En cours…" : action.label}</button>
            <span className="risk-tag" data-risk={action.risk}>{action.risk === "ask" ? "demande" : "1 clic"}</span>
          </div>
        </>
      ) : node.type === "block" ? (
        <p className="microcopy" style={{ marginTop: 10 }}>Le pre-flight de ce bloc s'ouvrira 5 min avant le début.</p>
      ) : null}
      {result?.map((r) => (
        <p key={r.id} className="microcopy llm-status" data-ok={r.status !== "failed"} style={{ marginTop: 10 }}>
          {r.status === "simulated" ? "Simulé" : r.status === "done" ? "Fait" : "Échec"} : {r.detail}
        </p>
      ))}
    </div>
  );
}

function DeviceStrip({ snap }: { snap: DeviceSnapshot }) {
  const cells = [
    { label: "Batterie", value: snap.battery ? `${snap.battery.percent} %` : "—", detail: snap.battery ? (snap.battery.charging ? "en charge" : "sur batterie") : "non lue" },
    { label: "Disque libre", value: snap.disk ? `${snap.disk.freeGb} Go` : "—", detail: snap.disk ? `sur ${snap.disk.totalGb} Go` : "non lu" },
    { label: "Mémoire", value: snap.memory ? `${snap.memory.usedGb} / ${snap.memory.totalGb} Go` : "—", detail: "utilisée" },
    { label: "Wi-Fi", value: snap.wifi ? `${snap.wifi.rssi} dBm` : "—", detail: snap.wifi ? (snap.wifi.rssi < -70 ? "faible" : "correct") : "non lu" },
  ];
  return (
    <section className="summary-strip">
      {cells.map((c) => (
        <div className="stat" key={c.label}>
          <span>{c.label}</span>
          <strong>{c.value}</strong>
          <small>{c.detail}</small>
        </div>
      ))}
    </section>
  );
}
