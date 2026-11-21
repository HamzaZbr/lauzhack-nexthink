import { motion } from "framer-motion";
import { Coffee, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { ActionLogEntry, CleanupItem, DayBlock, DayPlanResult, PopupKind, PreflightPlan, Risk } from "@shared/types";
import { reveal } from "../motion/primitives";
import { weekStats } from "@shared/week";

const riskLabel: Record<Risk, string> = { auto: "auto", confirm: "1 clic", ask: "demande" };

/** Libellé lisible d'une action : « Fermer Docker », « Rejoindre le meeting »… */
function actionTitle(a: { tool: string; target: string }, meetingLink?: string) {
  if (a.tool === "quit_app" || a.tool === "close_tabs") return `Fermer ${a.target}`;
  if (a.tool === "open_url") return a.target === meetingLink ? "Rejoindre le meeting" : `Ouvrir ${a.target}`;
  if (a.tool === "open_app") return `Ouvrir ${a.target}`;
  if (a.tool === "open_file") return `Ouvrir ${a.target.split("/").pop()}`;
  if (a.tool === "focus_tab") return `Mettre devant ton onglet ${a.target}`;
  return a.target;
}

export function Popup({ kind }: { kind: PopupKind }) {
  useEffect(() => {
    document.body.style.overflow = "hidden";
  }, []);
  return (
    <motion.div className="popup" {...reveal(0)}>
      {/* Bande du haut pour déplacer la fenêtre (le reste doit pouvoir scroller et se cliquer) */}
      <div className="popup-grip" aria-hidden="true" />
      <button className="icon-button" style={{ position: "absolute", top: 14, right: 14, minHeight: 28, padding: "0 6px" }}
        onClick={() => window.api.closePopup()} aria-label="Fermer">
        <X size={14} />
      </button>
      {kind === "morning" ? <Morning /> : null}
      {kind === "preflight" ? <Preflight /> : null}
      {kind === "coffee" ? <CoffeeBreak /> : null}
      {kind === "evening" ? <Evening /> : null}
    </motion.div>
  );
}

function Morning() {
  const [text, setText] = useState("");
  const [calendar, setCalendar] = useState<DayBlock[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<DayPlanResult | null>(null);
  const [time, setTime] = useState("");
  const [carried, setCarried] = useState("");

  useEffect(() => {
    window.api.day().then((d) => setCalendar(d.filter((b) => b.source === "calendar" && b.kind === "meeting")));
    window.api.clock().then((c) => setTime(c.hhmm));
    // Ce que tu avais noté au bilan d'hier soir
    window.api.carryOver().then((t) => {
      if (t) setText((cur) => cur || t);
      setCarried(t);
    });
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
        <p className="eyebrow">Brief du matin · {time}</p>
        <h2>Bonjour. Voilà ta journée.</h2>
      </div>
      <div className="mini-blocks">
        {calendar.map((b) => (
          <div key={b.id}><time>{b.start}</time><span>{b.title}</span></div>
        ))}
      </div>
      <div className="dashed" />
      <div>
        <p className="microcopy" style={{ marginBottom: 8 }}>
          Qu'est-ce que tu fais aujourd'hui en plus de ces meetings ? Une phrase suffit.
          {carried ? " Repris de ton bilan d'hier :" : ""}
        </p>
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
  const [openTabs, setOpenTabs] = useState<string | null>(null); // action dont on affiche les onglets
  const [skipped, setSkipped] = useState<Set<string>>(new Set()); // URLs que l'utilisateur garde finalement

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
    // Apprentissage : les sites que tu as décochés seront gardés la prochaine fois.
    const aiTabs = plan.actions.find((a) => a.tabs)?.tabs ?? [];
    const keptDomains = aiTabs.filter((t) => t.close && skipped.has(t.url)).map((t) => t.domain);
    const closedDomains = checked[plan.actions.find((a) => a.tabs)?.id ?? ""] ? aiTabs.filter((t) => t.close && !skipped.has(t.url)).map((t) => t.domain) : [];
    if (keptDomains.length || closedDomains.length) void window.api.tabsFeedback(keptDomains, closedDomains);
    const chosen = plan.actions
      .filter((a) => checked[a.id])
      .map(({ tool, target, args, tabs }) => {
        if (!tabs) return { tool, target, args };
        // Onglets triés par l'IA : on retire ceux que l'utilisateur a décochés.
        const urls = [...new Set(tabs.filter((t) => t.close && !skipped.has(t.url)).map((t) => t.url))];
        return { tool, target: `${urls.length} onglet(s) fermé(s) après tri par l'IA`, args: { ...args, urls } };
      })
      .filter((r) => !(r.tool === "close_tabs" && Array.isArray(r.args?.urls) && r.args.urls.length === 0));
    setResults(await window.api.runActions(chosen));
    setRunning(false);
  };

  if (!plan)
    return (
      <div>
        <p className="eyebrow">Pre-flight</p>
        <h2>Je regarde ton Mac…</h2>
        <p className="microcopy">Batterie, disque, mémoire, Wi-Fi, apps ouvertes, et l'IA trie tes onglets selon ton meeting.</p>
      </div>
    );

  const count = Object.values(checked).filter(Boolean).length;
  return (
    <>
      <div>
        <p className="eyebrow">
          Pre-flight · {plan.idle ? "vérification" : plan.minutesBefore > 0 ? `dans ${plan.minutesBefore} min` : "maintenant"}
          {plan.ai?.used ? ` · IA ${(plan.ai.latencyMs / 1000).toFixed(1)} s` : plan.ai?.error ? " · IA indisponible, règles simples" : ""}
        </p>
        <h2>{plan.idle ? "Plus rien de prévu aujourd'hui" : `${plan.block.title}, ${plan.block.start}`}</h2>
        {plan.ai?.error ? <p className="microcopy llm-status" data-ok={plan.ai.used ? "true" : "false"}>IA : {plan.ai.error}</p> : null}
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
            <div key={a.id}>
              <label className="action-row">
                <input type="checkbox" checked={!!checked[a.id]} disabled={a.risk === "auto"}
                  onChange={(e) => {
                    setChecked((c) => ({ ...c, [a.id]: e.target.checked }));
                    // La case principale pilote toute la liste d'onglets.
                    if (a.tabs) setSkipped(e.target.checked ? new Set() : new Set(a.tabs.filter((t) => t.close).map((t) => t.url)));
                  }} />
                <div>
                  <strong>{a.tabs ? `Fermer ${a.tabs.filter((t) => t.close && !skipped.has(t.url)).length} onglets sans rapport` : actionTitle(a, plan.block.link)}</strong>
                  <p>{a.reason}</p>
                  {a.tabs ? (
                    <button type="button" className="link-button" onClick={() => setOpenTabs(openTabs === a.id ? null : a.id)}>
                      {openTabs === a.id ? "Masquer le détail" : "Voir onglet par onglet"}
                    </button>
                  ) : null}
                </div>
                <span className="risk-tag" data-risk={a.risk}>{riskLabel[a.risk]}</span>
              </label>
              {a.tabs && openTabs === a.id ? (
                <div className="tab-verdicts">
                  <div className="tab-verdicts-head">
                    <span>
                      <strong>{a.tabs.filter((t) => t.close && !skipped.has(t.url)).length}</strong> / {a.tabs.filter((t) => t.close).length} onglets seront fermés. Décoche ceux à garder.
                    </span>
                    <button type="button" className="link-button" onClick={() => { setSkipped(new Set()); setChecked((c) => ({ ...c, [a.id]: true })); }}>tout cocher</button>
                    <button type="button" className="link-button" onClick={() => { setSkipped(new Set(a.tabs!.filter((t) => t.close).map((t) => t.url))); setChecked((c) => ({ ...c, [a.id]: false })); }}>tout décocher</button>
                  </div>
                  <ul>
                    {a.tabs.filter((t) => t.close).map((t, i) => (
                      <li key={`${t.url}-${i}`} data-off={skipped.has(t.url) ? "true" : undefined}>
                        <label>
                          <input type="checkbox" checked={!skipped.has(t.url)}
                            onChange={(e) => {
                              const next = new Set(skipped);
                              if (e.target.checked) next.delete(t.url);
                              else next.add(t.url);
                              setSkipped(next);
                              // Tout décoché → la case principale se décoche ; un coché → elle se recoche.
                              const remaining = a.tabs!.filter((x) => x.close && !next.has(x.url)).length;
                              setChecked((c) => ({ ...c, [a.id]: remaining > 0 }));
                            }} />
                          <span><strong>{t.title || t.domain}</strong><em>{t.domain} · {t.reason}</em></span>
                        </label>
                      </li>
                    ))}
                  </ul>
                  <p className="microcopy">Gardés : {a.tabs.filter((t) => !t.close).length} onglets (liés à ta journée, en cours, ou protégés).</p>
                </div>
              ) : null}
            </div>
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

const fmtMb = (mb: number | null) => (mb === null ? "taille inconnue" : mb >= 1024 ? `${(mb / 1024).toFixed(1).replace(".", ",")} Go` : `${mb} Mo`);

function CoffeeBreak() {
  const [free, setFree] = useState<DayBlock | null>(null);
  const [next, setNext] = useState<DayBlock | null>(null);
  const [items, setItems] = useState<CleanupItem[] | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [update, setUpdate] = useState(false); // « demande » : jamais coché d'avance
  const [result, setResult] = useState<ActionLogEntry[] | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    window.api.day().then((d) => {
      const f = d.find((b) => b.kind === "free") ?? null;
      setFree(f);
      setNext(f ? d.find((b) => (b.kind === "meeting" || b.kind === "focus") && b.start >= f.end) ?? null : null);
    });
    window.api.cleanupPlan().then((list) => {
      setItems(list);
      // Caches reconstructibles cochés ; Corbeille et téléchargements (« demande ») jamais cochés d'avance.
      setChecked(Object.fromEntries(list.map((i) => [i.id, i.risk !== "ask"])));
    });
  }, []);

  const chosen = (items ?? []).filter((i) => checked[i.id]);
  const total = chosen.reduce((s, i) => s + (i.sizeMb ?? 0), 0);

  const go = async () => {
    setRunning(true);
    // Vider la Corbeille EN PREMIER : sinon les vieux téléchargements qu'on vient d'y mettre seraient effacés pour de bon.
    const ordered = [...chosen].sort((a, b) => Number(b.tool === "empty_trash") - Number(a.tool === "empty_trash"));
    const requests = [
      ...ordered.map((i) => ({ tool: i.tool, target: i.id })),
      ...(update && free ? [{ tool: "install_update", target: `Mise à jour macOS à ${free.start}` }] : []),
    ];
    setResult(await window.api.runActions(requests));
    setRunning(false);
  };

  return (
    <>
      <div>
        <p className="eyebrow"><Coffee size={12} style={{ verticalAlign: -1 }} /> Pause · {free ? `${free.start} – ${free.end}` : "maintenant"}</p>
        <h2>Prends un café, je range ton Mac.</h2>
        <p className="microcopy">
          {items === null ? "Je mesure ce que je peux libérer…" : `Je peux libérer ${fmtMb(total)} sur ton disque pendant ta pause.`}
          {next ? ` Ce sera fini avant « ${next.title} » à ${next.start}.` : ""}
        </p>
      </div>

      {result ? (
        <div className="action-list">
          {result.map((r) => (
            <div key={r.id} className="action-row">
              <span className="risk-tag" data-risk={r.status === "failed" ? "ask" : r.status === "simulated" ? "confirm" : "auto"}>
                {r.status === "done" ? "fait" : r.status === "simulated" ? "simulé" : "échec"}
              </span>
              <div><p>{r.detail}</p></div>
              <span />
            </div>
          ))}
        </div>
      ) : items ? (
        <div className="action-list">
          {items.map((i) => (
            <label key={i.id} className="action-row">
              <input type="checkbox" checked={!!checked[i.id]} onChange={(e) => setChecked((c) => ({ ...c, [i.id]: e.target.checked }))} />
              <div>
                <strong>{i.label} · {fmtMb(i.sizeMb)}</strong>
                <p>{i.explain}</p>
              </div>
              <span className="risk-tag" data-risk={i.risk}>{i.risk === "ask" ? "demande" : "1 clic"}</span>
            </label>
          ))}
          <label className="action-row">
            <input type="checkbox" checked={update} onChange={(e) => setUpdate(e.target.checked)} />
            <div>
              <strong>Mise à jour macOS (~8 min, redémarrage)</strong>
              <p>Placée dans ta pause plutôt que pendant ton travail. Simulée dans ce prototype.</p>
            </div>
            <span className="risk-tag" data-risk="ask">demande</span>
          </label>
        </div>
      ) : null}

      <div className="popup-footer">
        {result ? (
          <>
            <button className="mode-toggle" onClick={() => window.api.showDashboard("journal")}>Voir le journal</button>
            <button className="run-button" onClick={() => window.api.closePopup()}>Fermer</button>
          </>
        ) : (
          <>
            <button className="mode-toggle" onClick={() => window.api.closePopup()}>Pas maintenant</button>
            <button className="run-button" onClick={go} disabled={running || !items || (chosen.length === 0 && !update)}>
              {running ? "Je range…" : "Vas-y"}
            </button>
          </>
        )}
      </div>
    </>
  );
}

/** Bilan de fin de journée : ce que l'agent a fait, ce qui reste, et demain. */
function Evening() {
  const [journal, setJournal] = useState<ActionLogEntry[]>([]);
  const [day, setDay] = useState<DayBlock[]>([]);
  const [tomorrow, setTomorrow] = useState<DayBlock[]>([]);
  const [clock, setClock] = useState("18:00");
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [rest, setRest] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void Promise.all([window.api.journal(), window.api.day(), window.api.tomorrow(), window.api.clock()]).then(([j, d, t, c]) => {
      setJournal(j);
      setTomorrow(t.slice(0, 3));
      setClock(c.hhmm);
      const blocks = d.filter((b) => b.kind !== "free");
      setDay(blocks);
      const toMin = (x: string) => Number(x.slice(0, 2)) * 60 + Number(x.slice(3, 5));
      const nowMin = toMin(c.hhmm);
      // Par défaut : les blocs passés sont « faits », les autres restent pour demain.
      const initial = Object.fromEntries(blocks.map((b) => [b.id, toMin(b.end) <= nowMin]));
      setDone(initial);
      setRest(blocks.filter((b) => b.source === "morning" && !initial[b.id]).map((b) => b.title).join(", "));
    });
  }, []);

  const toggle = (b: DayBlock, value: boolean) => {
    const next = { ...done, [b.id]: value };
    setDone(next);
    // La liste « pour demain » suit les tâches du brief non faites.
    setRest(day.filter((x) => x.source === "morning" && !next[x.id]).map((x) => x.title).join(", "));
  };

  const now = new Date();
  now.setHours(Number(clock.slice(0, 2)), Number(clock.slice(3, 5)), 0, 0);
  const stats = weekStats(journal, now, !journal.some((e) => e.status === "done" && e.tool !== "check_device"), 1);
  const freedGo = (stats.freedMb + stats.freedDiskMb) / 1024;

  const save = async () => {
    await window.api.setCarryOver(rest);
    setSaved(true);
  };

  return (
    <>
      <div>
        <p className="eyebrow">Bilan de la journée · {clock}</p>
        <h2>Bonne fin de journée.</h2>
        <p className="microcopy">Voilà ce que j'ai fait pour toi aujourd'hui, et ce qui t'attend demain.</p>
      </div>

      <div className="evening-stats">
        <div><strong>{stats.minutes}</strong><span>min gagnées (estimé)</span></div>
        <div><strong>{stats.done}</strong><span>actions faites{stats.simulated ? ` · ${stats.simulated} simulées` : ""}</span></div>
        <div><strong>{stats.issues}</strong><span>problèmes repérés</span></div>
        <div><strong>{freedGo.toFixed(1).replace(".", ",")}</strong><span>Go libérés</span></div>
      </div>

      {day.length ? (
        <div>
          <p className="eyebrow">Aujourd'hui · coche ce qui est fait</p>
          <div className="action-list">
            {day.map((b) => (
              <label key={b.id} className="action-row">
                <input type="checkbox" checked={!!done[b.id]} onChange={(e) => toggle(b, e.target.checked)} />
                <div>
                  <strong>{b.title}</strong>
                  <p>{b.start}–{b.end} · {b.kind === "meeting" ? "meeting" : "tâche"}</p>
                </div>
                <span />
              </label>
            ))}
          </div>
        </div>
      ) : null}

      <div>
        <p className="eyebrow">Ce qui reste pour demain</p>
        <textarea value={rest} onChange={(e) => setRest(e.target.value)} placeholder="Rien ? Parfait. Sinon, écris-le ici : je le reprendrai dans ton brief de demain matin." />
      </div>

      {tomorrow.length ? (
        <div className="mini-blocks">
          <p className="eyebrow">Demain</p>
          {tomorrow.map((b) => (
            <div key={b.id}><time>{b.start}</time><span>{b.title}</span></div>
          ))}
        </div>
      ) : null}

      {saved ? <p className="microcopy llm-status" data-ok="true">Noté : je le reprendrai dans ton brief de demain matin.</p> : null}
      <div className="popup-footer">
        <button className="mode-toggle" onClick={() => window.api.closePopup()}>Fermer</button>
        <button className="run-button" onClick={saved ? () => window.api.closePopup() : save}>{saved ? "À demain" : "Garder pour demain"}</button>
      </div>
    </>
  );
}
