import { motion } from "framer-motion";
import { ArrowRight, Coffee, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import type { CalendarInfo, ClockState, DayBlock } from "@shared/types";
import { reveal } from "../motion/primitives";

const kindLabel = { meeting: "Meeting", focus: "Tâche", free: "Libre" } as const;

export function Today() {
  const [day, setDay] = useState<DayBlock[]>([]);
  const [cal, setCal] = useState<CalendarInfo | null>(null);
  const [clock, setClock] = useState<ClockState | null>(null);
  useEffect(() => {
    window.api.day().then(setDay);
    window.api.calendarInfo().then(setCal);
    window.api.clock().then(setClock);
    const t = setInterval(() => window.api.clock().then(setClock), 15_000);
    const off = window.api.onEvent((e) => {
      if (e.type === "day-updated") setDay(e.payload as DayBlock[]);
      if (e.type === "clock-updated") setClock(e.payload as ClockState);
    });
    return () => {
      clearInterval(t);
      off();
    };
  }, []);
  const reload = async () => {
    setCal(await window.api.reloadCalendar());
    setDay(await window.api.day());
  };
  const nowMin = clock ? Number(clock.hhmm.slice(0, 2)) * 60 + Number(clock.hhmm.slice(3)) : 0;
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  const upcoming = day.filter((b) => b.kind !== "free" && toMin(b.end) > nowMin);
  const nextId = (upcoming.find((b) => toMin(b.start) >= nowMin && toMin(b.start) - nowMin <= 10) ?? upcoming[0])?.id;
  const hasMorning = day.some((b) => b.source === "morning");
  return (
    <div className="page-stack">
      <div className="toolbar-row">
        <span className="microcopy">
          {cal ? `${cal.label} · ${cal.events} meeting${cal.events > 1 ? "s" : ""} aujourd'hui` : "…"}
          {cal?.error ? ` · erreur : ${cal.error}` : ""}
        </span>
        <button className="filter-chip" onClick={reload}><RefreshCw size={12} /> recharger</button>
        {!hasMorning ? (
          <button className="filter-chip" onClick={() => window.api.openPopup("morning")}>Ajouter mes tâches du jour (brief)</button>
        ) : null}
      </div>
      <section className="timeline">
        {day.map((block, i) => (
          <motion.div key={block.id} className="timeline-row" data-kind={block.kind} data-next={block.id === nextId}
            data-past={clock ? toMin(block.end) <= nowMin : undefined} {...reveal(0.04 * i)}>
            <time>{block.start} – {block.end}</time>
            <div>
              <span className="block-kind">{kindLabel[block.kind]} · {block.source === "calendar" ? "calendrier" : "ajouté ce matin"}</span>
              <br />
              <strong>{block.title}</strong>
              {block.apps.length ? <p className="microcopy">{block.apps.join(" · ")}</p> : null}
            </div>
            {block.id === nextId ? <span className="risk-tag" data-risk="confirm">prochain · pre-flight à T-5 min</span> : null}
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
