import { motion } from "framer-motion";
import { ArrowRight, Coffee } from "lucide-react";
import { useEffect, useState } from "react";
import type { DayBlock } from "@shared/types";
import { reveal } from "../motion/primitives";

const kindLabel = { meeting: "Meeting", focus: "Tâche", free: "Libre" } as const;

export function Today() {
  const [day, setDay] = useState<DayBlock[]>([]);
  useEffect(() => {
    window.api.day().then(setDay);
    return window.api.onEvent((e) => {
      if (e.type === "day-updated") setDay(e.payload as DayBlock[]);
    });
  }, []);
  const nextId = day.find((b) => b.kind === "meeting")?.id;
  return (
    <div className="page-stack">
      <section className="timeline">
        {day.map((block, i) => (
          <motion.div key={block.id} className="timeline-row" data-kind={block.kind} data-next={block.id === nextId} {...reveal(0.04 * i)}>
            <time>{block.start} – {block.end}</time>
            <div>
              <span className="block-kind">{kindLabel[block.kind]} · {block.source === "calendar" ? "calendrier" : "ajouté ce matin"}</span>
              <br />
              <strong>{block.title}</strong>
              {block.apps.length ? <p className="microcopy">{block.apps.join(" · ")}</p> : null}
            </div>
            {block.id === nextId ? <span className="risk-tag" data-risk="confirm">pre-flight à T-5 min</span> : null}
            {block.kind === "free" ? <span className="risk-tag" data-risk="auto"><Coffee size={11} /> maintenance possible</span> : null}
          </motion.div>
        ))}
      </section>
      <section className="visual-panel">
        <p className="eyebrow">Démo</p>
        <h2>Tester les pop-ups</h2>
        <p className="microcopy">En vrai, ils s'ouvrent seuls : le brief au démarrage, le pre-flight 5 min avant chaque bloc, le café dans un créneau libre.</p>
        <div className="toolbar-row" style={{ marginTop: 14 }}>
          <button className="mode-toggle" onClick={() => window.api.openPopup("morning")}>Brief du matin <ArrowRight size={14} /></button>
          <button className="mode-toggle" onClick={() => window.api.openPopup("preflight")}>Pre-flight <ArrowRight size={14} /></button>
          <button className="mode-toggle" onClick={() => window.api.openPopup("coffee")}>Pause café <ArrowRight size={14} /></button>
        </div>
      </section>
    </div>
  );
}
