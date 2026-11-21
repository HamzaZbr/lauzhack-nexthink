import { useCallback, useEffect, useMemo, useState } from "react";
import ReactFlow, { Background, Controls, MarkerType, Panel, Position, type Edge, type Node } from "reactflow";
import { RefreshCw, RotateCcw } from "lucide-react";
import { mockDay } from "@shared/mock";
import { buildTree, type TreeNodeType } from "@shared/tree";
import type { DeviceSnapshot } from "@shared/types";
import { columnLayout, edgeTypes, NODE_H, NODE_W, STEP } from "../graphMotion";

const typeLabel: Record<TreeNodeType, string> = { block: "bloc de la journée", useful: "utile aujourd'hui", idle: "inactif", heavy: "inactif et lourd" };

/**
 * Arbre « pourquoi » à partir de la vraie photo du Mac : blocs de la journée (colonne 0) → apps (colonne 1).
 * Même animation que le graphe de contagion : les colonnes apparaissent l'une après l'autre.
 */
export function MyPc() {
  const [snap, setSnap] = useState<DeviceSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [replay, setReplay] = useState(0);

  const refresh = useCallback(async () => {
    setLoading(true);
    setSnap(await window.api.snapshot(true));
    setLoading(false);
    setReplay((n) => n + 1);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const tree = useMemo(() => (snap ? buildTree(mockDay, snap) : { nodes: [], links: [] }), [snap]);

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
      data: { delay: 0.3 },
    }));
    return { flowNodes, flowEdges };
  }, [tree]);

  const heavy = tree.nodes.filter((n) => n.type === "heavy");
  const heavyMb = heavy.reduce((s, n) => s + (n.memMb ?? 0), 0);

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
        <span><i style={{ borderColor: "var(--np-soft)" }} />inactif</span>
        <span><i style={{ borderColor: "var(--np-accent-coral)" }} />inactif et lourd</span>
      </div>
      <section className="graph-stage">
        {loading && !snap ? <p className="microcopy" style={{ padding: 20 }}>Lecture du Mac…</p> : (
          <ReactFlow key={replay} defaultNodes={flow.flowNodes} defaultEdges={flow.flowEdges} edgeTypes={edgeTypes}
            fitView fitViewOptions={{ padding: 0.2, maxZoom: 1 }} minZoom={0.3} maxZoom={1.4} proOptions={{ hideAttribution: true }}>
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
      <section className="visual-panel">
        <p className="eyebrow">Proposition de l'agent</p>
        {heavy.length ? (
          <>
            <h2>Libérer {(heavyMb / 1024).toFixed(1).replace(".", ",")} Go avant ton prochain meeting</h2>
            <p className="microcopy">{heavy.map((n) => n.label).join(", ")} : lourd, inactif, et rien dans ta journée n'en a besoin. Rien n'est fermé sans ton accord.</p>
          </>
        ) : (
          <>
            <h2>Rien de lourd à libérer</h2>
            <p className="microcopy">Toutes les apps lourdes servent à un bloc de ta journée.</p>
          </>
        )}
        <div className="toolbar-row" style={{ marginTop: 14 }}>
          <button className="run-button" onClick={() => window.api.openPopup("preflight")}>Voir les actions proposées</button>
        </div>
      </section>
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
