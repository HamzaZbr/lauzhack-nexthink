import { motion } from "framer-motion";
import { Keyboard, Play } from "lucide-react";
import { useEffect, useState } from "react";
import type { ShortcutsState } from "@shared/types";
import { reveal } from "../motion/primitives";

const fmtMin = (m: number) => (m < 1 ? `${Math.round(m * 60)} s` : `${m.toFixed(m < 10 ? 1 : 0).replace(".", ",")} min`);

/** Raccourcis appris : ce que tu refais à la main chaque semaine, remplacé par une touche. */
export function Shortcuts() {
  const [st, setSt] = useState<ShortcutsState | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    void window.api.shortcuts().then(setSt);
  }, []);

  if (!st) return <p className="microcopy">…</p>;

  const toggle = async (id: string, on: boolean) => {
    const r = await window.api.toggleShortcut(id, on);
    setSt({ ...st, enabled: r.enabled });
    setMsg(r.conflict ?? (on ? "Raccourci actif, même quand l'app est derrière." : "Raccourci coupé."));
  };
  const tryIt = async (id: string) => {
    const e = await window.api.runShortcut(id);
    setMsg(e ? e.detail : "Rien à faire.");
  };

  const before = st.routines.reduce((t, r) => t + r.minutesBefore, 0);
  const after = st.routines.reduce((t, r) => t + r.minutesAfter, 0);

  return (
    <div className="page-stack">
      <div className="toolbar-row">
        <span className="microcopy">
          Journal d'usage de démo (simulé) · {st.sessions} actions sur 5 jours · {st.routines.length} routines repérées
        </span>
      </div>

      <section className="summary-strip">
        <div className="stat"><span>À la main</span><strong>{fmtMin(before)}</strong><small>par semaine sur ces routines</small></div>
        <div className="stat"><span>Avec les raccourcis</span><strong>{fmtMin(after)}</strong><small>~2 s par usage</small></div>
        <div className="stat"><span>Gagné</span><strong>{fmtMin(before - after)}</strong><small>par semaine</small></div>
        <div className="stat"><span>Clics évités</span><strong>{st.routines.reduce((t, r) => t + r.count * (r.steps.length - 1), 0)}</strong><small>par semaine</small></div>
      </section>

      {msg ? <p className="microcopy llm-status" data-ok="true">{msg}</p> : null}

      <section className="action-list">
        {st.routines.map((r, i) => {
          const def = st.defs.find((d) => d.id === r.shortcut)!;
          const on = st.enabled.includes(def.id);
          return (
            <motion.div key={`${r.shortcut}-${i}`} className="shortcut-card" {...reveal(0.05 * i)}>
              <div className="shortcut-head">
                <div>
                  <p className="eyebrow">Tu fais ça {r.count}× par semaine · {r.steps.length} étapes · ~{r.avgSeconds} s</p>
                  <strong>{def.label}</strong>
                  <p className="microcopy">{def.does}</p>
                </div>
                <kbd className="shortcut-keys" data-on={on}><Keyboard size={12} /> {def.keys}</kbd>
              </div>
              <button type="button" className="link-button" onClick={() => setOpen(open === r.shortcut + i ? null : r.shortcut + i)}>
                {open === r.shortcut + i ? "Masquer ce que tu fais à la main" : "Voir ce que tu fais à la main"}
              </button>
              {open === r.shortcut + i ? (
                <ol className="shortcut-steps">
                  {r.steps.map((s) => <li key={s}>{s}</li>)}
                </ol>
              ) : null}
              <div className="shortcut-foot">
                <span className="microcopy">{fmtMin(r.minutesBefore)} → {fmtMin(r.minutesAfter)} par semaine</span>
                <div className="shortcut-buttons">
                  <button className="mode-toggle" onClick={() => tryIt(def.id)}><Play size={12} /> Essayer</button>
                  <button className={on ? "mode-toggle" : "run-button"} onClick={() => toggle(def.id, !on)}>
                    {on ? "Couper le raccourci" : `Créer le raccourci ${def.keys}`}
                  </button>
                </div>
              </div>
            </motion.div>
          );
        })}
      </section>

      <p className="microcopy">
        Les documents sont créés dans Documents/Preflight, au modèle de Lémanic SA (entreprise inventée pour la démo), et
        ouverts dans Keynote, Pages ou Numbers si Office n'est pas installé. Rien d'existant n'est modifié. {st.note}
      </p>
    </div>
  );
}
