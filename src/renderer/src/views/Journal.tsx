import { useEffect, useState } from "react";
import { Undo2 } from "lucide-react";
import type { ActionLogEntry } from "@shared/types";

const statusLabel: Record<ActionLogEntry["status"], string> = { done: "fait", undone: "annulé", failed: "échec", simulated: "simulé" };

export function Journal() {
  const [entries, setEntries] = useState<ActionLogEntry[]>([]);

  useEffect(() => {
    window.api.journal().then(setEntries);
    return window.api.onEvent((e) => {
      if (e.type === "journal-updated") setEntries(e.payload as ActionLogEntry[]);
    });
  }, []);

  if (!entries.length)
    return (
      <section className="visual-panel">
        <h2>Aucune action pour l'instant</h2>
        <p className="microcopy">Lance un pre-flight : chaque action de l'agent apparaîtra ici, avec un bouton pour l'annuler quand c'est possible.</p>
      </section>
    );

  return (
    <div className="page-stack">
      <section className="action-list">
        {entries.map((entry) => (
          <div key={entry.id} className="action-row">
            <time className="microcopy">{new Date(entry.at).toLocaleTimeString("fr-CH", { hour: "2-digit", minute: "2-digit" })}</time>
            <div>
              <strong>{entry.target}</strong>
              <p>{entry.detail}</p>
              <p>{entry.tool} · <span className="risk-tag" data-risk={entry.risk}>{entry.risk}</span> · {statusLabel[entry.status]}</p>
            </div>
            {entry.undoable ? (
              <button className="mode-toggle" onClick={() => window.api.undo(entry.id)}><Undo2 size={14} /> Annuler</button>
            ) : <span className="microcopy">{statusLabel[entry.status]}</span>}
          </div>
        ))}
      </section>
    </div>
  );
}
