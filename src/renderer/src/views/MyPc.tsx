import { useMemo, useState } from "react";
import ReactFlow, { Background, Controls, MarkerType, Panel, Position, type Edge, type Node } from "reactflow";
import { RotateCcw } from "lucide-react";
import { mockTree } from "@shared/mock";
import { columnLayout, edgeTypes, NODE_H, NODE_W, STEP } from "../graphMotion";

const typeLabel = { block: "bloc de la journée", useful: "utile aujourd'hui", idle: "inactif", heavy: "inactif et lourd" } as const;

/**
 * Arbre « pourquoi » : on part des blocs de la journée (colonne 0) vers les apps (colonne 1).
 * Même animation que le graphe de contagion : les colonnes apparaissent l'une après l'autre.
 */
export function MyPc() {
  const [replay, setReplay] = useState(0);
  const { nodes, links } = mockTree;

  const flow = useMemo(() => {
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
  }, [nodes, links]);

  const heavy = nodes.filter((n) => n.type === "heavy");

  return (
    <div className="page-stack">
      <div className="legend">
        <span><i style={{ borderColor: "var(--np-strong)" }} />bloc de la journée</span>
        <span><i style={{ borderColor: "var(--risk-auto)" }} />utile aujourd'hui</span>
        <span><i style={{ borderColor: "var(--np-soft)" }} />inactif</span>
        <span><i style={{ borderColor: "var(--np-accent-coral)" }} />inactif et lourd</span>
      </div>
      <section className="graph-stage">
        <ReactFlow key={replay} defaultNodes={flow.flowNodes} defaultEdges={flow.flowEdges} edgeTypes={edgeTypes}
          fitView fitViewOptions={{ padding: 0.2, maxZoom: 1 }} minZoom={0.3} maxZoom={1.4} proOptions={{ hideAttribution: true }}>
          <Background gap={28} size={1} color="var(--np-line-strong)" />
          <Controls />
          <Panel position="top-right" className="flow-panel">
            <button className="mode-toggle" onClick={() => setReplay((n) => n + 1)}><RotateCcw size={14} /> Rejouer</button>
          </Panel>
        </ReactFlow>
      </section>
      <section className="visual-panel">
        <p className="eyebrow">Proposition de l'agent</p>
        <h2>Libérer 3,2 Go avant ton meeting de 10:00</h2>
        <p className="microcopy">{heavy.map((n) => n.label).join(" et ")} ne servent à rien dans ta journée. Rien n'est fermé sans ton accord.</p>
        <div className="toolbar-row" style={{ marginTop: 14 }}>
          <button className="run-button" onClick={() => window.api.openPopup("preflight")}>Voir les actions proposées</button>
          <button className="mode-toggle">Garder tel quel</button>
        </div>
      </section>
    </div>
  );
}
