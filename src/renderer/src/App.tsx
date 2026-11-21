import { AnimatePresence, motion } from "framer-motion";
import { BarChart3, CalendarClock, ChevronDown, Clock, Cpu, Moon, ScrollText, Sparkles, Sun, Zap } from "lucide-react";
import { useEffect, useState, type ComponentType } from "react";
import { InteractiveLabel } from "./motion/primitives";
import { Today } from "./views/Today";
import { MyPc } from "./views/MyPc";
import { Journal } from "./views/Journal";
import { Week } from "./views/Week";
import type { AppInfo, ClockState, DayBlock, LlmPingResult } from "@shared/types";

export type View = "today" | "pc" | "journal" | "week";
type Theme = "light" | "dark";

const viewMeta: Record<View, { label: string; key: string; icon: ComponentType<{ size?: number }>; lead: string }> = {
  today: { label: "Aujourd'hui", key: "1", icon: CalendarClock, lead: "Ta journée telle que l'agent la voit : le calendrier, tes tâches du matin, et ce qu'il prépare avant chaque bloc." },
  pc: { label: "Mon PC", key: "2", icon: Cpu, lead: "Ce qui tourne sur ta machine, rangé selon ta journée. Ce qui ne sert à rien aujourd'hui est mis en évidence." },
  journal: { label: "Journal", key: "3", icon: ScrollText, lead: "Chaque action de l'agent, avec la raison et un bouton pour l'annuler." },
  week: { label: "Semaine", key: "4", icon: BarChart3, lead: "Ce que Preflight t'a fait gagner cette semaine." },
};

const sections: Array<{ label: string; items: View[] }> = [
  { label: "Journée", items: ["today", "pc"] },
  { label: "Historique", items: ["journal", "week"] },
];

export function App({ initialView }: { initialView?: string }) {
  const [view, setView] = useState<View>(initialView && initialView in viewMeta ? (initialView as View) : "today");
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // Raccourcis clavier [1]…[4], comme dans Contagion.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "TEXTAREA" || (e.target as HTMLElement)?.tagName === "INPUT") return;
      const match = (Object.keys(viewMeta) as View[]).find((v) => viewMeta[v].key === e.key);
      if (match) setView(match);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Le process main peut demander d'afficher une vue (ex. « Voir pourquoi » depuis un pop-up).
  useEffect(
    () =>
      window.api?.onEvent((event) => {
        if (event.type === "navigate" && typeof event.payload === "string" && event.payload in viewMeta) setView(event.payload as View);
      }),
    [],
  );

  return (
    <main className="app-shell">
      <div className="drag-region" />
      <Sidebar view={view} setView={setView} theme={theme} setTheme={setTheme} />
      <section className="content-pane">
        <header className="topbar">
          <div>
            <p className="eyebrow">Preflight · Nexthink challenge</p>
            <h1>{viewMeta[view].label}</h1>
            <p className="lead">{viewMeta[view].lead}</p>
          </div>
          <div className="topbar-actions">
            <button className="run-button" onClick={() => window.api.openPopup("preflight")}>
              <Zap size={15} />
              Préparer le prochain bloc
            </button>
          </div>
        </header>

        <AnimatePresence mode="wait">
          <motion.div
            key={view}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: 0.2, ease: "easeOut" } }}
            exit={{ opacity: 0, filter: "blur(8px)", transition: { duration: 0.28, ease: "easeInOut" } }}
          >
            {view === "today" ? <Today /> : null}
            {view === "pc" ? <MyPc /> : null}
            {view === "journal" ? <Journal /> : null}
            {view === "week" ? <Week /> : null}
          </motion.div>
        </AnimatePresence>
      </section>
    </main>
  );
}

function Sidebar({ view, setView, theme, setTheme }: { view: View; setView: (v: View) => void; theme: Theme; setTheme: (t: Theme) => void }) {
  const [open, setOpen] = useState<Record<string, boolean>>({ Journée: true, Historique: true });
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [ping, setPing] = useState<LlmPingResult | null>(null);
  const [pinging, setPinging] = useState(false);

  useEffect(() => {
    window.api?.info().then(setInfo);
  }, []);

  const testLlm = async () => {
    setPinging(true);
    setPing(await window.api.pingLlm());
    setPinging(false);
  };

  return (
    <aside className="sidebar">
      <div className="brand-mark" aria-hidden="true">
        <span />
        <span />
      </div>

      <nav className="sidebar-nav" aria-label="Navigation">
        {sections.map((section) => (
          <div className="nav-section" key={section.label}>
            <button className="section-trigger" aria-expanded={open[section.label]}
              onClick={() => setOpen((cur) => ({ ...cur, [section.label]: !cur[section.label] }))}>
              {section.label}
              <ChevronDown size={14} />
            </button>
            <AnimatePresence initial={false}>
              {open[section.label] ? (
                <motion.div className="section-menu" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}>
                  {section.items.map((item) => {
                    const Icon = viewMeta[item].icon;
                    return (
                      <button key={item} className="nav-item" data-selected={view === item} onClick={() => setView(item)}
                        aria-keyshortcuts={viewMeta[item].key}>
                        <Icon size={15} />
                        <InteractiveLabel>{viewMeta[item].label}</InteractiveLabel>
                        <span className="nav-key">[{viewMeta[item].key}]</span>
                      </button>
                    );
                  })}
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        ))}
      </nav>

      <DemoClock />

      <div className="sidebar-controls">
        <button className="mode-toggle" onClick={testLlm} disabled={pinging}>
          <Sparkles size={14} />
          {pinging ? "Test du LLM…" : "Tester le LLM"}
        </button>
        {ping ? (
          <span className="status-line llm-status" data-ok={ping.ok}>
            {ping.ok ? `OK · ${ping.latencyMs} ms · « ${ping.message} »` : `Erreur : ${ping.error}`}
          </span>
        ) : null}
        <button className="mode-toggle" onClick={() => setTheme(theme === "light" ? "dark" : "light")}>
          {theme === "light" ? <Sun size={14} /> : <Moon size={14} />}
          {theme === "light" ? "clair" : "sombre"}
        </button>
        <span className="status-line">
          {info ? `${info.hasKey ? "Clé Together OK" : "Clé Together manquante (.env)"} · ${info.model}` : "…"}
        </span>
      </div>
    </aside>
  );
}

/** Horloge de démo : régler l'heure de l'app pour déclencher les pop-ups pendant le pitch. */
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const toHHMM = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

function DemoClock() {
  const [clock, setClock] = useState<ClockState | null>(null);
  const [day, setDay] = useState<DayBlock[]>([]);
  useEffect(() => {
    const read = () => window.api.clock().then(setClock);
    void read();
    window.api.day().then(setDay);
    const t = setInterval(read, 15_000);
    const off = window.api.onEvent((e) => {
      if (e.type === "clock-updated") setClock(e.payload as ClockState);
      if (e.type === "day-updated") setDay(e.payload as DayBlock[]);
    });
    return () => {
      clearInterval(t);
      off();
    };
  }, []);

  // Les boutons suivent la vraie journée : 5 min avant le 1er bloc à préparer, et le début du créneau libre.
  const first = day.find((b) => b.kind === "meeting") ?? day.find((b) => b.kind === "focus");
  const free = day.find((b) => b.kind === "free");
  const times = [
    { hhmm: "08:30", label: "brief" },
    ...(first ? [{ hhmm: toHHMM(Math.max(0, toMin(first.start) - 5)), label: "pre-flight" }] : []),
    ...(free ? [{ hhmm: free.start, label: "café" }] : []),
    { hhmm: "18:00", label: "bilan" },
  ];

  const [custom, setCustom] = useState("13:55");
  const set = async (hhmm: string | null) => {
    setClock(await window.api.setClock(hhmm));
    if (hhmm === "08:30") void window.api.openPopup("morning");
  };

  return (
    <div className="demo-clock">
      <p className="section-trigger"><Clock size={13} /> Horloge {clock?.demo ? "· démo" : ""}</p>
      <strong className="demo-time">{clock?.hhmm ?? "--:--"}</strong>
      <div className="demo-buttons">
        {times.map((t) => (
          <button key={t.label} className="filter-chip" data-active={clock?.hhmm === t.hhmm} onClick={() => set(t.hhmm)} title={`Mettre l'horloge à ${t.hhmm}`}>
            {t.hhmm} <span className="microcopy">{t.label}</span>
          </button>
        ))}
        {clock?.demo ? <button className="filter-chip" onClick={() => set(null)}>heure réelle</button> : null}
      </div>
      <form className="demo-custom" onSubmit={(e) => { e.preventDefault(); void set(custom); }}>
        <input type="time" value={custom} onChange={(e) => setCustom(e.target.value)} aria-label="Régler l'horloge" />
        <button className="filter-chip" type="submit">aller à</button>
      </form>
      {!first ? <p className="microcopy">Rien à préparer aujourd'hui : fais le brief (08:30) ou vérifie le calendrier.</p> : null}
    </div>
  );
}
