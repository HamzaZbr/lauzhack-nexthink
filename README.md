# Preflight — LauzHack 2026 · challenge Nexthink

> Objectif et avancement : [PROJET.md](PROJET.md) · Bien utiliser et tester : [GUIDE.md](GUIDE.md) · Comment ça marche : [ARCHITECTURE.md](ARCHITECTURE.md)

Un agent IT qui prépare ta journée : il lit ton calendrier, te demande le matin ce que tu fais en plus,
prépare ton Mac 5 min avant chaque bloc (en demandant avant d'agir) et place la maintenance dans tes créneaux libres.

## Lancer

```bash
npm install
cp .env.example .env    # puis mets ta clé TOGETHER_API_KEY
npm run dev
```

- Le dashboard s'ouvre, le brief du matin aussi. L'icône dans la barre de menu ouvre les pop-ups de test.
- Bouton **Tester le LLM** en bas de la sidebar : vérifie la clé, le modèle et le mode JSON.
- `npm run typecheck` pour vérifier les types, `npm run build` pour construire.

## Structure

```
src/main/        process principal : fenêtres, barre de menu, IPC, LLM (llm.ts), horloge démo (clock.ts)
src/preload/     pont sécurisé entre l'UI et le main (window.api)
src/shared/      types partagés + données de démo (mock.ts)
src/renderer/    l'UI React (design repris de Contagion)
  src/views/     Aujourd'hui · Mon PC (arbre « pourquoi ») · Journal · Semaine
  src/popup/     brief du matin · pre-flight · pause café
```

## Règles du projet

- Le LLM **propose** un plan en JSON ; le code vérifie que chaque action existe dans le catalogue et applique son niveau de risque.
- Risques : `auto` (lecture seule) · `confirm` (réversible, 1 clic) · `ask` (toujours demander).
- Chaque action est journalisée et, si possible, annulable.
- Par défaut `PREFLIGHT_DRY_RUN=1` : les actions sont simulées. Mets `PREFLIGHT_DRY_RUN=0` dans `.env` pour agir pour de vrai.
- Au premier pre-flight, macOS demande d’autoriser l’app à contrôler Chrome (onglets) : accepte.
