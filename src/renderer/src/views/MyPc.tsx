import { useCallback, useEffect, useMemo, useState } from "react";
import ReactFlow, { Background, Controls, MarkerType, Panel, Position, type Edge, type Node } from "reactflow";
import { ExternalLink, RefreshCw, RotateCcw, X } from "lucide-react";
import { buildTree, type TreeNode, type TreeNodeType } from "@shared/tree";
import { isDocumentApp, isProtected } from "@shared/apps";
import type { ActionLogEntry, ActionRequest, ClockState, DayBlock, DeviceSnapshot, TriageResponse } from "@shared/types";
import { columnLayout, edgeTypes, NODE_H, NODE_W, STEP } from "../graphMotion";

const typeLabel: Record<TreeNodeType, string> = {
  block: "bloc de la journée",
  useful: "utile aujourd'hui",
  idle: "pas lié à ta journée",
  heavy: "inactif et lourd",
  missing: "à ouvrir",
  tabs: "onglets à trier",
  close: "à fermer selon l'IA",
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
  const [clock, setClock] = useState<ClockState | null>(null);
  const [triage, setTriage] = useState<TriageResponse | null>(null);
  const [triaging, setTriaging] = useState(false);

  // L'IA trie les onglets (résultat partagé avec le pop-up pre-flight, gardé 5 min).
  const runTriage = useCallback(async (fresh = false) => {
    setTriaging(true);
    const t = await window.api.triageTabs(fresh);
    setTriage(t);
    setTriaging(false);
    if (t.verdicts) setReplay((n) => n + 1);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [s, d, c] = await Promise.all([window.api.snapshot(true), window.api.day(), window.api.clock()]);
    setSnap(s);
    setDay(d);
    setClock(c);
    setLoading(false);
    setReplay((n) => n + 1);
    void runTriage();
  }, [runTriage]);

  useEffect(() => {
    void refresh();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = window.api.onEvent((e) => {
      if (e.type === "day-updated") setDay(e.payload as DayBlock[]);
      if (e.type === "clock-updated") setClock(e.payload as ClockState);
      // Une action vient d'être faite (pop-up ou panneau) : on relit le Mac 1,5 s plus tard (le temps que les apps se ferment).
      if (e.type === "journal-updated") {
        clearTimeout(timer);
        timer = setTimeout(() => void refresh(), 1500);
      }
    });
    return () => {
      clearTimeout(timer);
      off();
    };
  }, [refresh]);

  const nowMin = clock ? Number(clock.hhmm.slice(0, 2)) * 60 + Number(clock.hhmm.slice(3)) : undefined;
  const tree = useMemo(
    () => (snap ? buildTree(day, snap, { nowMin, verdicts: triage?.verdicts }) : { nodes: [] as TreeNode[], links: [] }),
    [snap, day, nowMin, triage],
  );
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

  // Nœud virtuel « tous les onglets », avec l'avis de l'IA s'il existe
  const allTabsNode: TreeNode | null = useMemo(() => {
    const tabs = snap?.chromeTabs;
    if (!tabs?.length) return null;
    const byUrl = new Map((triage?.verdicts ?? []).map((v) => [v.url, v]));
    const rows = tabs.map((t) => ({ title: t.title, url: t.url, close: byUrl.get(t.url)?.close, reason: byUrl.get(t.url)?.reason }));
    const ai = !!triage?.verdicts?.length;
    const closeN = rows.filter((r) => r.close).length;
    return {
      id: "__all__",
      label: "Tous les onglets Chrome",
      detail: `${rows.length} onglets${ai ? ` · IA : fermer ${closeN}` : ""}`,
      type: "tabs",
      column: 2,
      tabs: rows,
      aiClose: ai ? closeN : undefined,
    };
  }, [snap, triage]);

  const heavy = tree.nodes.filter((n) => n.type === "heavy");
  const heavyMb = heavy.reduce((s, n) => s + (n.memMb ?? 0), 0);
  const selected = selectedId === "__all__" ? allTabsNode : (tree.nodes.find((n) => n.id === selectedId) ?? null);

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
      <div className="toolbar-row">
        <span className="microcopy llm-status" data-ok={triage?.ai ? triage.ai.used : undefined}>
          {triaging
            ? "IA : tri de tes onglets en cours…"
            : triage?.ai?.used
              ? `Onglets triés par l'IA (${triage.ai.model.split("/").pop()}) en ${(triage.ai.latencyMs / 1000).toFixed(1)} s${triage.ai.cached ? " (gardé en mémoire)" : ""} pour « ${triage.blockTitle ?? "ta journée"} » : ${triage.ai.closed} à fermer, ${triage.ai.kept} gardés.${triage.ai.error ? ` (${triage.ai.error})` : ""}`
              : triage?.ai?.error
                ? `IA indisponible (${triage.ai.error}) : couleurs par règles simples.`
                : "Onglets : couleurs par règles simples."}
        </span>
        <button className="filter-chip" onClick={() => runTriage(true)} disabled={triaging}>retrier avec l'IA</button>
        {allTabsNode ? (
          <button className="filter-chip" data-active={selectedId === "__all__"} onClick={() => setSelectedId("__all__")}>
            voir tous les onglets ({allTabsNode.tabs?.length})
          </button>
        ) : null}
      </div>
      <div className="legend">
        <span><i style={{ borderColor: "var(--np-strong)" }} />bloc de la journée</span>
        <span><i style={{ borderColor: "var(--risk-auto)" }} />utile aujourd'hui</span>
        <span><i style={{ borderColor: "var(--np-strong)", borderStyle: "dashed" }} />à ouvrir</span>
        <span><i style={{ borderColor: "var(--np-accent-gold)" }} />à trier</span>
        <span><i style={{ borderColor: "var(--np-soft)" }} />pas lié à ta journée</span>
        <span><i style={{ borderColor: "var(--np-accent-coral)" }} />lourd et inutile / à fermer selon l'IA</span>
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
            <Inspector node={selected} onClose={() => setSelectedId(null)} onDone={() => {}} />
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

type TabRow = NonNullable<TreeNode["tabs"]>[number];
const siteOf = (url: string) => {
  try {
    const u = new URL(url);
    return u.protocol === "file:" ? "fichiers locaux" : u.hostname.replace(/^www\./, "");
  } catch {
    return "autre";
  }
};

/**
 * Liste complète des onglets d'un groupe (ou de tous) : recherche, filtres, une case par onglet.
 * Par défaut, sont cochés ceux que l'IA propose de fermer. Fermer = registre d'actions (journal, annuler).
 */
function TabsPanel({ node, onClose }: { node: TreeNode; onClose: () => void }) {
  const tabs = node.tabs ?? [];
  const ai = node.aiClose !== undefined;
  const [filter, setFilter] = useState<"close" | "keep" | "all">(ai && (node.aiClose ?? 0) > 0 ? "close" : "all");
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState<Set<string>>(() => new Set(tabs.filter((t) => t.close).map((t) => t.url)));
  const [result, setResult] = useState<ActionLogEntry[] | null>(null);
  const [busy, setBusy] = useState(false);
  const many = node.id === "__all__";

  useEffect(() => {
    setSel(new Set(tabs.filter((t) => t.close).map((t) => t.url)));
    setFilter(ai && (node.aiClose ?? 0) > 0 ? "close" : "all");
    setQuery("");
    setResult(null);
  }, [node.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const q = query.trim().toLowerCase();
  const shown = tabs
    .filter((t) => (filter === "close" ? t.close : filter === "keep" ? !t.close : true))
    .filter((t) => !q || t.title.toLowerCase().includes(q) || t.url.toLowerCase().includes(q))
    .sort((a, b) => Number(!!b.close) - Number(!!a.close));
  const toggle = (url: string, on: boolean) => {
    const next = new Set(sel);
    if (on) next.add(url);
    else next.delete(url);
    setSel(next);
  };
  const setShown = (on: boolean) => {
    const next = new Set(sel);
    shown.forEach((t) => (on ? next.add(t.url) : next.delete(t.url)));
    setSel(next);
  };

  const run = async () => {
    setBusy(true);
    const urls = [...sel];
    // Apprentissage : proposés par l'IA mais décochés → sites à garder ; cochés → sites fermables.
    const kept = tabs.filter((t) => t.close && !sel.has(t.url)).map((t) => siteOf(t.url));
    const closed = tabs.filter((t) => sel.has(t.url)).map((t) => siteOf(t.url));
    void window.api.tabsFeedback(kept, closed);
    setResult(await window.api.runActions([{ tool: "close_tabs", target: `${selCount} onglet(s) ${many ? "choisis" : node.label}`, args: { urls, mode: "all" } }]));
    setBusy(false);
  };

  const counts = { close: tabs.filter((t) => t.close).length, keep: tabs.filter((t) => !t.close).length, all: tabs.length };
  // Compté en onglets (deux onglets sur la même page = 2), pas en adresses.
  const selCount = tabs.filter((t) => sel.has(t.url)).length;

  return (
    <div className="inspector">
      <div className="inspector-head">
        <p className="eyebrow">{many ? "tous les onglets" : typeLabel[node.type]}</p>
        <button className="icon-button" onClick={onClose} aria-label="Fermer le détail"><X size={14} /></button>
      </div>
      <h2>{node.label}</h2>
      <p className="microcopy">{node.detail}</p>

      <div className="tab-filters">
        {ai ? (
          <>
            <button className="filter-chip" data-active={filter === "close"} onClick={() => setFilter("close")}>à fermer ({counts.close})</button>
            <button className="filter-chip" data-active={filter === "keep"} onClick={() => setFilter("keep")}>gardés ({counts.keep})</button>
          </>
        ) : null}
        <button className="filter-chip" data-active={filter === "all"} onClick={() => setFilter("all")}>tous ({counts.all})</button>
      </div>
      {tabs.length > 8 ? (
        <input className="tab-search" placeholder="Chercher un onglet (titre ou adresse)…" value={query} onChange={(e) => setQuery(e.target.value)} />
      ) : null}
      <div className="tab-bulk">
        <button type="button" className="link-button" onClick={() => setShown(true)}>cocher la liste</button>
        <button type="button" className="link-button" onClick={() => setShown(false)}>décocher la liste</button>
        <span className="microcopy">{selCount} coché{selCount > 1 ? "s" : ""}</span>
      </div>

      <ul className="tab-list tab-list-full">
        {shown.map((t, i) => (
          <li key={`${t.url}-${i}`} data-close={t.close ? "true" : undefined} data-sel={sel.has(t.url) ? "true" : undefined} title={t.url}>
            <label>
              <input type="checkbox" checked={sel.has(t.url)} onChange={(e) => toggle(t.url, e.target.checked)} />
              <span>
                <strong>{t.title || t.url}</strong>
                <em>{many ? `${siteOf(t.url)} · ` : ""}{t.reason ? `${t.close ? "IA : fermer" : "IA : garder"} · ${t.reason}` : siteOf(t.url)}</em>
              </span>
            </label>
          </li>
        ))}
        {!shown.length ? <li className="microcopy">Aucun onglet pour ce filtre.</li> : null}
      </ul>

      <div className="divider" />
      <p className="microcopy">Ce que tu as tapé dans ces onglets (formulaire, brouillon) serait perdu. Annuler rouvre les pages.</p>
      <div className="toolbar-row" style={{ marginTop: 10 }}>
        <button className="run-button" onClick={run} disabled={busy || sel.size === 0}>{busy ? "En cours…" : `Fermer la sélection (${selCount})`}</button>
        <span className="risk-tag" data-risk="confirm">1 clic</span>
      </div>
      {result?.map((r) => (
        <p key={r.id} className="microcopy llm-status" data-ok={r.status !== "failed"} style={{ marginTop: 10 }}>
          {r.status === "simulated" ? "Simulé" : r.status === "done" ? "Fait" : "Échec"} : {r.detail}
        </p>
      ))}
    </div>
  );
}

/** Détail d'un nœud + l'action qu'on peut faire dessus. */
function Inspector({ node, onClose, onDone }: { node: TreeNode; onClose: () => void; onDone: () => void }) {
  const [result, setResult] = useState<ActionLogEntry[] | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setResult(null), [node.id]);
  if (node.tabs?.length) return <TabsPanel node={node} onClose={onClose} />;

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
  if (node.tabs?.length) {
    // Avec l'IA : seulement les onglets qu'elle propose de fermer. Sans IA : tout le groupe.
    const chosen = node.aiClose !== undefined ? node.tabs.filter((t) => t.close) : node.tabs;
    if (chosen.length)
      action = {
        label: node.aiClose !== undefined ? `Fermer les ${chosen.length} proposés par l'IA` : `Fermer ces ${chosen.length} onglets`,
        request: { tool: "close_tabs", target: `${chosen.length} onglets ${node.label}`, args: { urls: [...new Set(chosen.map((t) => t.url))], mode: "all" } },
        risk: "confirm",
        warning: "Ce que tu as tapé dans ces onglets (formulaire, brouillon) serait perdu. Annuler rouvre les pages.",
      };
  }

  const run = async () => {
    if (!action) return;
    setBusy(true);
    if (action.request.tool === "close_tabs") void window.api.tabsFeedback([], [node.label]);
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
          {[...node.tabs].sort((a, b) => Number(!!b.close) - Number(!!a.close)).slice(0, 12).map((t, i) => (
            <li key={i} title={t.url} data-close={t.close ? "true" : undefined}>
              <ExternalLink size={11} /> {t.title || t.url}
              {t.reason ? <em>{t.close ? "fermer" : "garder"} · {t.reason}</em> : null}
            </li>
          ))}
          {node.tabs.length > 12 ? <li className="microcopy">+ {node.tabs.length - 12} autres</li> : null}
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
