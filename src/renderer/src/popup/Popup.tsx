import { motion } from "framer-motion";
import { Coffee, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { ActionLogEntry, DayBlock, DayPlanResult, PopupKind, PreflightPlan, Risk } from "@shared/types";
import { reveal } from "../motion/primitives";

const riskLabel: Record<Risk, string> = { auto: "auto", confirm: "1 clic", ask: "demande" };

/** Libellé lisible d'une action : « Fermer Docker », « Rejoindre le meeting »… */
function actionTitle(a: { tool: string; target: string }, meetingLink?: string) {
  if (a.tool === "quit_app" || a.tool === "close_tabs") return `Fermer ${a.target}`;
  if (a.tool === "open_url") return a.target === meetingLink ? "Rejoindre le meeting" : `Ouvrir ${a.target}`;
  if (a.tool === "open_app") return `Ouvrir ${a.target}`;
  return a.target;
}
const nowHHMM = () => new Date().toLocaleTimeString("fr-CH", { hour: "2-digit", minute: "2-digit" });

export function Popup({ kind }: { kind: PopupKind }) {
  useEffect(() => {
    document.body.style.overflow = "hidden";
  }, []);
  return (
    <motion.div className="popup" {...reveal(0)}>
      <button className="icon-button" style={{ position: "absolute", top: 14, right: 14, minHeight: 28, padding: "0 6px" }}
        onClick={() => window.api.closePopup()} aria-label="Fermer">
        <X size={14} />
      </button>
      {kind === "morning" ? <Morning /> : null}
      {kind === "preflight" ? <Preflight /> : null}
      {kind === "coffee" ? <CoffeeBreak /> : null}
    </motion.div>
  );
}

function Morning() {
  const [text, setText] = useState("");
  const [calendar, setCalendar] = useState<DayBlock[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<DayPlanResult | null>(null);

  useEffect(() => {
    window.api.day().then((d) => setCalendar(d.filter((b) => b.source === "calendar" && b.kind === "meeting")));
  }, []);

  const submit = async () => {
    if (!text.trim()) return;
    setBusy(true);
    setResult(await window.api.planDay(text));
    setBusy(false);
  };

  if (result)
    return (
      <>
        <div>
          <p className="eyebrow">Brief du matin · {result.source === "llm" ? `IA · ${(result.latencyMs / 1000).toFixed(1)} s` : "plan simple"}</p>
          <h2>Ta journée est prête.</h2>
          <p className="microcopy">{result.summary}</p>
        </div>
        <div className="mini-blocks">
          {[...calendar, ...result.blocks].sort((a, b) => a.start.localeCompare(b.start)).map((b) => (
            <motion.div key={b.id} {...reveal(0.05)}>
              <time>{b.start}</time>
              <span>
                {b.source === "morning" ? <strong>{b.title}</strong> : b.title}
                {b.apps.length ? <span className="microcopy"> · {b.apps.join(", ")}</span> : null}
              </span>
            </motion.div>
          ))}
        </div>
        {result.error ? <p className="microcopy">IA indisponible ({result.error.slice(0, 80)}), plan simple utilisé.</p> : null}
        <p className="microcopy">Je préparerai ton Mac 5 min avant chaque bloc.</p>
        <div className="popup-footer">
          <button className="mode-toggle" onClick={() => setResult(null)}>Modifier</button>
          <button className="run-button" onClick={() => window.api.closePopup()}>C'est parti</button>
        </div>
      </>
    );

  return (
    <>
      <div>
        <p className="eyebrow">Brief du matin · {nowHHMM()}</p>
        <h2>Bonjour. Voilà ta journée.</h2>
      </div>
      <div className="mini-blocks">
        {calendar.map((b) => (
          <div key={b.id}><time>{b.start}</time><span>{b.title}</span></div>
        ))}
      </div>
      <div className="dashed" />
      <div>
        <p className="microcopy" style={{ marginBottom: 8 }}>Qu'est-ce que tu fais aujourd'hui en plus de ces meetings ? Une phrase suffit.</p>
        <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} disabled={busy}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit(); }}
          placeholder="Ex. finir le rapport Q4 cet après-midi, faire ma note de frais" />
      </div>
      <div className="popup-footer">
        <button className="mode-toggle" onClick={() => window.api.closePopup()} disabled={busy}>Plus tard</button>
        <button className="run-button" onClick={submit} disabled={busy || !text.trim()}>{busy ? "Je prépare…" : "Préparer ma journée"}</button>
      </div>
    </>
  );
}

function Preflight() {
  const [plan, setPlan] = useState<PreflightPlan | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [results, setResults] = useState<ActionLogEntry[] | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    window.api.planPreflight().then((p) => {
      setPlan(p);
      // Par défaut : « auto » et « 1 clic » cochés ; ce qui « demande » ne l'est jamais.
      setChecked(Object.fromEntries(p.actions.map((a) => [a.id, a.risk !== "ask"])));
    });
  }, []);

  const go = async () => {
    if (!plan) return;
    setRunning(true);
    const chosen = plan.actions.filter((a) => checked[a.id]).map(({ tool, target, args }) => ({ tool, target, args }));
    setResults(await window.api.runActions(chosen));
    setRunning(false);
  };

  if (!plan)
    return (
      <div>
        <p className="eyebrow">Pre-flight</p>
        <h2>Je regarde ton Mac…</h2>
        <p className="microcopy">Batterie, disque, mémoire, Wi-Fi, apps ouvertes.</p>
      </div>
    );

  const count = Object.values(checked).filter(Boolean).length;
  return (
    <>
      <div>
        <p className="eyebrow">Pre-flight · dans {plan.minutesBefore} min</p>
        <h2>{plan.block.title}, {plan.block.start}</h2>
        <p className="microcopy">Je prépare ton PC. Rien n'est fait sans ton accord, sauf les vérifications.</p>
      </div>
      {results ? (
        <div className="action-list">
          {results.map((r) => (
            <div key={r.id} className="action-row">
              <span className="risk-tag" data-risk={r.status === "failed" ? "ask" : r.status === "simulated" ? "confirm" : "auto"}>
                {r.status === "done" ? "fait" : r.status === "simulated" ? "simulé" : r.status === "failed" ? "échec" : r.status}
              </span>
              <div>
                <strong>{actionTitle(r, plan.block.link)}</strong>
                <p>{r.detail}</p>
              </div>
              <span />
            </div>
          ))}
        </div>
      ) : (
        <div className="action-list">
          {plan.actions.map((a) => (
            <label key={a.id} className="action-row">
              <input type="checkbox" checked={!!checked[a.id]} disabled={a.risk === "auto"}
                onChange={(e) => setChecked((c) => ({ ...c, [a.id]: e.target.checked }))} />
              <div>
                <strong>{actionTitle(a, plan.block.link)}</strong>
                <p>{a.reason}</p>
              </div>
              <span className="risk-tag" data-risk={a.risk}>{riskLabel[a.risk]}</span>
            </label>
          ))}
        </div>
      )}
      <div className="popup-footer">
        {results ? (
          <>
            <button className="mode-toggle" onClick={() => window.api.showDashboard("journal")}>Voir le journal</button>
            <button className="run-button" onClick={() => window.api.closePopup()}>Fermer</button>
          </>
        ) : (
          <>
            <button className="mode-toggle" onClick={() => window.api.showDashboard("pc")}>Voir pourquoi</button>
            <button className="run-button" onClick={go} disabled={running || count === 0}>{running ? "En cours…" : `Préparer (${count})`}</button>
          </>
        )}
      </div>
    </>
  );
}

function CoffeeBreak() {
  return (
    <>
      <div>
        <p className="eyebrow"><Coffee size={12} style={{ verticalAlign: -1 }} /> Créneau libre · 10:45 – 11:30</p>
        <h2>Prends un café, je m'occupe de la mise à jour.</h2>
        <p className="microcopy">La mise à jour macOS prend environ 8 min et demande un redémarrage. Ton prochain meeting est à 11:30 : ce sera fini bien avant.</p>
      </div>
      <motion.div {...reveal(0.1)} className="mini-blocks">
        <div><time>10:45</time><span>Sauvegarde des fenêtres ouvertes</span></div>
        <div><time>10:46</time><span>Mise à jour + redémarrage</span></div>
        <div><time>10:55</time><span>Réouverture de tes apps</span></div>
      </motion.div>
      <div className="popup-footer">
        <button className="mode-toggle" onClick={() => window.api.closePopup()}>Pas maintenant</button>
        <button className="run-button" onClick={() => window.api.popupAnswer("coffee", { accepted: true })}>Vas-y</button>
      </div>
    </>
  );
}
