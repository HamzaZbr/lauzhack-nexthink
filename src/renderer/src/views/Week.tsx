import { useEffect, useMemo, useState } from "react";
import { HYPOTHESES, weekStats } from "@shared/week";
import type { ActionLogEntry, ClockState } from "@shared/types";
import { useCountUp } from "../motion/primitives";

function CountNumber({ value, decimals = 0, unit }: { value: number; decimals?: number; unit?: string }) {
  const shown = useCountUp(value, 1.1);
  return (
    <span className="big-figure">
      {shown.toFixed(decimals).replace(".", ",")}
      {unit ? <small>{unit}</small> : null}
    </span>
  );
}

/** Page Semaine : ce que l'agent t'a fait gagner, calculé depuis le journal (7 derniers jours). */
export function Week() {
  const [journal, setJournal] = useState<ActionLogEntry[]>([]);
  const [clock, setClock] = useState<ClockState | null>(null);
  const [withSim, setWithSim] = useState<boolean | null>(null);

  useEffect(() => {
    window.api.journal().then(setJournal);
    window.api.clock().then(setClock);
    return window.api.onEvent((e) => {
      if (e.type === "journal-updated") setJournal(e.payload as ActionLogEntry[]);
    });
  }, []);

  // Le journal est daté avec l'horloge de l'app : on prend sa date du jour, pas celle de l'ordinateur.
  const now = useMemo(() => {
    return clock ? new Date(clock.iso) : new Date();
  }, [clock]);

  const hasReal = journal.some((e) => e.status === "done" && e.tool !== "check_device");
  const includeSim = withSim ?? !hasReal; // par défaut : simulations comptées seulement s'il n'y a rien de réel
  const s = useMemo(() => weekStats(journal, now, includeSim), [journal, now, includeSim]);
  const maxDay = Math.max(1, ...s.byDay.map((d) => d.done + d.simulated));

  if (!s.entries)
    return (
      <section className="visual-panel">
        <h2>Pas encore d'actions cette semaine</h2>
        <p className="microcopy">Lance un pre-flight : chaque action de l'agent nourrit ce récap.</p>
      </section>
    );

  const stats = [
    { label: "Temps gagné (estimé)", value: s.minutes, unit: "min", detail: "voir les hypothèses en dessous" },
    { label: "Mémoire libérée", value: s.freedMb / 1024, decimals: 1, unit: "Go", detail: "apps fermées + onglets (~80 Mo chacun)" },
    { label: "Disque libéré", value: s.freedDiskMb / 1024, decimals: 1, unit: "Go", detail: "pendant les pauses café" },
    { label: "Problèmes repérés", value: s.issues, detail: "avant un meeting" },
    { label: "Onglets fermés", value: s.tabsClosed, detail: `${s.updates} mise${s.updates > 1 ? "s" : ""} à jour placée${s.updates > 1 ? "s" : ""} dans une pause` },
  ];

  return (
    <div className="page-stack">
      <div className="toolbar-row">
        <span className="microcopy">
          7 derniers jours · {s.done} action{s.done > 1 ? "s" : ""} faite{s.done > 1 ? "s" : ""}, {s.simulated} simulée{s.simulated > 1 ? "s" : ""}, {s.undone} annulée{s.undone > 1 ? "s" : ""}
          {s.failed ? `, ${s.failed} en échec` : ""}
        </span>
        <button className="filter-chip" data-active={includeSim} onClick={() => setWithSim(!includeSim)}>
          {includeSim ? "simulations comptées" : "seulement le réel"}
        </button>
      </div>

      <section className="summary-strip">
        {stats.map((st) => (
          <div className="stat" key={st.label}>
            <span>{st.label}</span>
            <CountNumber value={st.value} decimals={st.decimals} unit={st.unit} />
            <small>{st.detail}</small>
          </div>
        ))}
      </section>

      <section className="visual-panel">
        <p className="eyebrow">Actions par jour</p>
        <div className="day-bars">
          {s.byDay.map((d) => (
            <div key={d.day} className="day-bar">
              <div className="day-bar-track">
                <i className="day-bar-sim" style={{ height: `${(d.simulated / maxDay) * 100}%` }} />
                <i className="day-bar-done" style={{ height: `${(d.done / maxDay) * 100}%` }} />
              </div>
              <strong>{d.done + d.simulated || ""}</strong>
              <span>{d.label}</span>
            </div>
          ))}
        </div>
        <div className="legend" style={{ marginTop: 10 }}>
          <span><i style={{ background: "var(--np-strong)", borderColor: "var(--np-strong)" }} />faites</span>
          <span><i style={{ background: "var(--np-line-strong)", borderColor: "var(--np-line-strong)" }} />simulées</span>
        </div>
      </section>

      <section className="visual-panel">
        <p className="eyebrow">Comment on compte le temps gagné</p>
        <p className="microcopy">Une estimation, pas une mesure. Chaque hypothèse est volontairement prudente.</p>
        <div className="action-list" style={{ marginTop: 12 }}>
          {s.byTool.map((t) => {
            const h = HYPOTHESES.find((x) => x.tool === t.tool)!;
            return (
              <div key={t.tool} className="action-row">
                <span className="microcopy">{h.minutes < 1 ? `${Math.round(h.minutes * 60)} s` : `${h.minutes} min`} / {h.per}</span>
                <div>
                  <strong>{t.label}</strong>
                  <p>{t.count} × → {t.minutes < 1 && t.minutes > 0 ? "< 1" : Math.round(t.minutes)} min</p>
                </div>
                <span />
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
