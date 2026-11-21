import { motion } from "framer-motion";
import { Coffee, X } from "lucide-react";
import { useEffect, useState } from "react";
import { mockDay, mockPreflight } from "@shared/mock";
import type { PopupKind, Risk } from "@shared/types";
import { reveal } from "../motion/primitives";

const riskLabel: Record<Risk, string> = { auto: "auto", confirm: "1 clic", ask: "demande" };
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
  const calendar = mockDay.filter((b) => b.source === "calendar" && b.kind !== "free");
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
        <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)}
          placeholder="Ex. finir le rapport Q4 cet après-midi, faire ma note de frais" />
      </div>
      <div className="popup-footer">
        <button className="mode-toggle" onClick={() => window.api.closePopup()}>Plus tard</button>
        <button className="run-button" onClick={() => window.api.popupAnswer("morning", { text })}>Préparer ma journée</button>
      </div>
    </>
  );
}

function Preflight() {
  // Par défaut : les actions auto et « 1 clic » sont cochées ; celles qui « demandent » ne le sont jamais.
  const [checked, setChecked] = useState<Record<string, boolean>>(
    Object.fromEntries(mockPreflight.map((a) => [a.id, a.risk !== "ask"])),
  );
  const count = Object.values(checked).filter(Boolean).length;
  return (
    <>
      <div>
        <p className="eyebrow">Pre-flight · dans 5 min</p>
        <h2>Sync équipe produit, 10:00</h2>
        <p className="microcopy">Je prépare ton PC pour l'appel. Rien n'est fait sans ton accord, sauf les vérifications.</p>
      </div>
      <div className="action-list">
        {mockPreflight.map((a) => (
          <label key={a.id} className="action-row">
            <input type="checkbox" checked={checked[a.id]} disabled={a.risk === "auto"}
              onChange={(e) => setChecked((c) => ({ ...c, [a.id]: e.target.checked }))} />
            <div>
              <strong>{a.target}</strong>
              <p>{a.reason}</p>
            </div>
            <span className="risk-tag" data-risk={a.risk}>{riskLabel[a.risk]}</span>
          </label>
        ))}
      </div>
      <div className="popup-footer">
        <button className="mode-toggle" onClick={() => window.api.showDashboard("pc")}>Voir pourquoi</button>
        <button className="run-button" onClick={() => window.api.popupAnswer("preflight", { approved: Object.keys(checked).filter((k) => checked[k]) })}>
          Préparer ({count})
        </button>
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
