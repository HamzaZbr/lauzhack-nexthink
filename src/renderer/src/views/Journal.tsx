import { Undo2 } from "lucide-react";
import type { ActionLogEntry } from "@shared/types";

// Exemple : le vrai journal viendra du registre d'actions (process main).
const sample: ActionLogEntry[] = [
  { id: "l1", at: new Date().toISOString(), tool: "close_tabs", target: "11 onglets Chrome inactifs", status: "done", undoable: true },
  { id: "l2", at: new Date().toISOString(), tool: "check_device", target: "Wi-Fi, batterie, disque", status: "done", undoable: false },
];

export function Journal() {
  return (
    <div className="page-stack">
      <section className="action-list">
        {sample.map((entry) => (
          <div key={entry.id} className="action-row">
            <time className="microcopy">{new Date(entry.at).toLocaleTimeString("fr-CH", { hour: "2-digit", minute: "2-digit" })}</time>
            <div>
              <strong>{entry.target}</strong>
              <p>{entry.tool} · {entry.status === "done" ? "fait" : entry.status}</p>
            </div>
            {entry.undoable ? <button className="mode-toggle"><Undo2 size={14} /> Annuler</button> : <span className="microcopy">lecture seule</span>}
          </div>
        ))}
      </section>
      <p className="microcopy">Données d'exemple. Le registre d'actions remplira ce journal.</p>
    </div>
  );
}
