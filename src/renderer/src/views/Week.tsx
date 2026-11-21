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

// Valeurs d'exemple : elles seront calculées à partir du journal des actions.
const stats = [
  { label: "Temps gagné", value: 25, unit: "min", detail: "estimé, hypothèses affichées" },
  { label: "Mémoire libérée", value: 3.4, decimals: 1, unit: "Go", detail: "avant tes meetings" },
  { label: "Problèmes évités", value: 3, detail: "détectés avant un appel" },
  { label: "Mises à jour placées", value: 2, detail: "pendant tes pauses" },
];

export function Week() {
  return (
    <div className="page-stack">
      <section className="summary-strip">
        {stats.map((s) => (
          <div className="stat" key={s.label}>
            <span>{s.label}</span>
            <CountNumber value={s.value} decimals={s.decimals} unit={s.unit} />
            <small>{s.detail}</small>
          </div>
        ))}
      </section>
      <p className="microcopy">Données d'exemple.</p>
    </div>
  );
}
