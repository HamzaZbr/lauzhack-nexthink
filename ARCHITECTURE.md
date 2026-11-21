# Comment marche Preflight

> Ce fichier explique ce qui se passe quand l'app tourne, et quels fichiers lire pour comprendre le code.

## 1. Les 3 morceaux d'une app Electron

Une app Electron, c'est **un programme Node.js** qui ouvre **des fenêtres Chrome**. Les deux ne se parlent que par messages.

```
┌──────────────────────────────┐        messages (IPC)        ┌──────────────────────────────┐
│  MAIN (Node.js)              │  ◄────────────────────────►  │  RENDERER (React, la page)   │
│  src/main/                   │                              │  src/renderer/src/           │
│                              │        ┌──────────────┐      │                              │
│  - lit le Mac (capteurs)     │        │  PRELOAD     │      │  - dashboard (4 pages)       │
│  - exécute les actions       │ ◄────► │  src/preload │ ◄──► │  - pop-ups                   │
│  - appelle le LLM            │        │  window.api  │      │  - n'a AUCUN accès au Mac    │
│  - ouvre les fenêtres        │        └──────────────┘      │                              │
└──────────────────────────────┘                              └──────────────────────────────┘
```

- **Main** : le seul qui a le droit de toucher au Mac (lancer `ps`, fermer une app, appeler Together).
- **Renderer** : l'interface. Elle ne peut rien faire seule ; elle **demande** au main via `window.api`.
- **Preload** : le pont entre les deux. Il expose une liste fermée de fonctions (`window.api.snapshot()`, `window.api.runActions()`…). Rien d'autre ne passe.

C'est aussi un argument de sécurité : même si la page faisait n'importe quoi, elle ne peut appeler que ces fonctions-là.

## 2. Ce qui se passe au lancement (`npm run dev`)

1. `src/main/index.ts` démarre : il charge `.env` (ta clé Together), ouvre le journal, enregistre les messages IPC.
2. Il crée l'**icône dans la barre de menu** (menu : brief, pre-flight, café, quitter).
3. Il ouvre le **dashboard** et le **pop-up du matin** (`src/main/windows.ts`).
4. Les deux fenêtres chargent la **même page React** ; l'adresse dit quoi afficher :
   - `#/app/today` → le dashboard sur la page Aujourd'hui ;
   - `#/popup/preflight` → le pop-up pre-flight.

## 3. Ce qui se passe pendant un pre-flight (exemple concret)

Tu cliques sur **« Préparer le prochain bloc »**.

```
Pop-up (React)                 Main (Node)                          Ton Mac
──────────────                 ───────────                          ───────
planPreflight() ─────────────► planner.ts
                               │ prochain bloc = « Sync 10:00 »
                               │ takeSnapshot() ──────────────────► pmset, df, vm_stat, ps,
                               │                                    system_profiler, AppleScript Chrome
                               │ ◄──────────────────────────────── batterie 83 %, disque 2,1 Go,
                               │                                    Chrome 5 Go / 74 onglets…
                               │ règles → 5 actions proposées
◄──────────────────────────────┘
affiche les actions + risques
(« demande » jamais cochée)

[Préparer (3)] ──────────────► actions.ts  runActions()
                               pour chaque action :
                               1. l'outil existe dans le catalogue ?
                               2. la cible est valide ? (app ouverte, pas protégée, URL sûre)
                               3. DRY_RUN ? → « simulé »   sinon → exécute ──► osascript / open
                               4. écrit dans le journal (+ garde la fonction « annuler »)
◄──────────────────────────────┘
affiche « fait / simulé / échec »
                               └─► envoie « journal-updated » au dashboard → la page Journal se met à jour
```

**Annuler** (page Journal) : le main retrouve la fonction gardée à l'étape 4 (ex. `open -a Docker` pour rouvrir Docker) et la lance.

## 3 bis. Ce qui se passe pendant le brief du matin

1. Tu écris « finir le rapport Q4 cet aprem, note de frais » et tu cliques sur **Préparer ma journée**.
2. `agent.ts` calcule tes **créneaux libres** (ex. 08:30–10:00, 12:00–18:00) à partir des meetings.
3. Il envoie au LLM : ta phrase, tes meetings, les créneaux libres, les apps disponibles, et un **schéma JSON** à respecter.
4. Le LLM renvoie des blocs, ex. `{ title: "Finir le rapport Q4", start: "14:00", end: "16:00", apps: ["Excel", "Google Chrome"] }`.
5. Le code **vérifie chaque bloc** : heures valides, dans un créneau libre, sans chevauchement. Ce qui ne passe pas est jeté.
6. Si le LLM échoue (erreur, plus de 12 s, rien de valide) → **plan de secours** : un bloc de 45 min par morceau de phrase.
7. La journée est mise à jour : la timeline, l'arbre et le prochain pre-flight utilisent les nouveaux blocs.

## 3 quater. Comment l'IA trie les onglets

1. La page **Mon PC** ou le **pre-flight** demande le tri. `agent.ts` (`getTriage`) regarde d'abord le **cache** : même bloc, mêmes onglets, il y a moins de 5 min → même réponse. L'arbre et le pop-up affichent donc **la même décision**. Si les deux demandent en même temps, un seul appel part.
2. Sinon, il envoie au LLM :
   - le prochain bloc (titre, heure, apps, description de l'invitation) et les autres blocs du jour ;
   - `USER_CONTEXT` (une phrase sur toi) et tes préférences apprises (`prefs.ts`) ;
   - une ligne par onglet : `12 | youtube.com | lofi beats | (affiché)`.
   Les onglets partent en **paquets de 25, envoyés en même temps** (76 onglets = 4 appels en parallèle). Un paquet qui échoue = ses onglets sont gardés. `TOGETHER_TABS_MODEL` permet un modèle rapide rien que pour ce tri (choisi avec `npm run bench:llm`).
3. Le LLM répond **seulement avec les onglets à fermer** : `{ close: [{ i: 12, reason: "vidéo sans rapport avec la revue budget" }] }`. Tout le reste est gardé. La réponse est courte, donc rapide et rarement coupée.
4. `tabs.ts` applique les **garde-fous** :
   - jamais fermés : l'onglet affiché, le lien du meeting, la messagerie, les documents Office/Google utiles au meeting ;
   - si une copie d'une page est gardée, aucune copie n'est fermée ;
   - au plus 40 fermetures d'un coup.
5. **Arbre** : groupes par site, rouge = tout à fermer, or = en partie, vert = tout gardé. Clic → chaque onglet avec « fermer · raison » ou « garder ».
6. **Pop-up** : « Fermer N onglets sans rapport » + « Voir onglet par onglet » (décochable).
7. **Apprentissage** : quand tu décoches un onglet, son site est noté « à garder » ; quand tu fermes, « fermable ». C'est redonné à l'IA la fois suivante.
8. En cas d'échec (délai de 25 s, réponse invalide…) → règle simple (doublons), et l'erreur exacte s'affiche (pop-up, page Mon PC, terminal).

## 3 ter. Ce qui se passe quand tu cliques sur « 09:55 » (démo)

1. La sidebar appelle `window.api.setClock("09:55")` → `clock.ts` décale l'horloge de l'app (le temps continue ensuite à s'écouler).
2. `scheduler.ts` revérifie tout de suite : il est 09:55, « Sync équipe produit » commence à 10:00, donc on est dans les 5 min → **ouvre le pop-up pre-flight**.
3. Le pre-flight demande son plan : `planner.ts` prend le **prochain meeting selon l'horloge**, lit le Mac, propose les actions.
4. En dehors de la démo, c'est exactement pareil avec la vraie heure : le planificateur tourne toutes les 15 s.

## 4. Le rôle de chaque fichier

### `src/main/` : le cerveau (Node.js)
| Fichier | Rôle |
|---|---|
| `index.ts` | Démarrage, barre de menu, branchement des messages IPC |
| `windows.ts` | Crée le dashboard et les pop-ups (taille, position, toujours au premier plan) |
| `sensors.ts` | **Lit le Mac.** Lance des commandes en lecture seule et les transforme en données (`DeviceSnapshot`) |
| `actions.ts` | **Agit sur le Mac.** Catalogue d'outils, niveaux de risque, validation, exécution, journal, annuler |
| `planner.ts` | Construit le plan du pre-flight à partir du prochain bloc + de la photo du Mac (règles) |
| `llm.ts` | Appelle Together AI et force une réponse JSON qui suit un schéma |
| `agent.ts` | Ce que fait le LLM : le brief du matin (phrase → blocs) et le tri des onglets du pre-flight, avec vérification et plan de secours |
| `tabs.ts` | Garde-fous du tri des onglets : ce que l'IA a le **droit** de fermer (fonctions pures, testées) |
| `prefs.ts` | Ce que l'agent apprend de toi, en local (`prefs.json`) : sites que tu gardes / fermes, et « ce qui reste pour demain » du bilan |
| `day.ts` | La journée : meetings + créneau de maintenance calculé + tâches du matin ; créneaux libres pour le brief |
| `clock.ts` | Horloge de l'app, décalable pour la démo (boutons 08:30 / 09:55 / 10:45 dans la sidebar) |
| `calendar.ts` | Charge le calendrier : lien ICS (`CALENDAR_ICS_URL`), fichier, ou `resources/demo.ics` ; recharge toutes les 10 min |
| `ics.ts` | Lit un `.ics` → meetings du jour (récurrences, fuseaux Outlook, liens Teams/Zoom, apps devinées) |
| `scheduler.ts` | Toutes les 15 s : tri des onglets 8 min avant, pre-flight 5 min avant un meeting ou une tâche, café au début du créneau libre, bilan à 18:00 |
| `workspace.ts` | Préparer l'espace de travail : documents cités trouvés par Spotlight (`mdfind`), onglets à mettre devant ou sites à ouvrir |
| `cleanup.ts` | Pause café : mesure des caches reconstructibles (liste fermée), de la Corbeille et des vieux téléchargements |

### `src/shared/` : ce que main et UI partagent
| Fichier | Rôle |
|---|---|
| `types.ts` | Toutes les formes de données (bloc de journée, action, photo du Mac, entrée de journal) |
| `mock.ts` | Ancienne journée d'exemple (plus utilisée par l'app, remplacée par `resources/demo.ics`) |
| `apps.ts` | Apps protégées, apps « à documents », correspondance « Teams » ↔ « Microsoft Teams » |
| `week.ts` | Récap de la semaine calculé depuis le journal ; hypothèses du « temps gagné » (5 min par problème repéré, 6 s par onglet…) |
| `tree.ts` | Construit l'arbre « pourquoi » (blocs → apps → onglets par site) à partir de la journée et de la photo du Mac |

### `src/renderer/src/` : l'interface (React)
| Fichier | Rôle |
|---|---|
| `main.tsx` | Choisit l'écran selon l'adresse (`#/app/…` ou `#/popup/…`) |
| `App.tsx` | Sidebar + en-tête + les 4 pages |
| `views/Today.tsx` | Timeline de la journée |
| `views/MyPc.tsx` | État du Mac + arbre animé |
| `views/Journal.tsx` | Journal des actions + Annuler |
| `views/Week.tsx` | Récap de la semaine : vrais chiffres depuis le journal, barres par jour, hypothèses affichées |
| `popup/Popup.tsx` | Les 4 pop-ups : brief du matin, pre-flight, pause café (nettoyage), bilan du soir |
| `theme/`, `styles.css`, `motion/`, `graphMotion.tsx` | Design et animations repris de Contagion |
| `app.css` | Styles propres à Preflight (tags de risque, timeline, pop-ups) |

## 5. Les règles de sécurité (à savoir expliquer au jury)

1. **Le LLM propose, le code dispose.** Le LLM ne lance jamais de commande ; il choisit dans un catalogue fermé (`actions.ts`).
2. **Chaque cible est vérifiée** : on ne ferme qu'une app réellement ouverte ; les apps système et les outils de dev sont protégés ; seuls les liens https/Teams/Zoom/Webex s'ouvrent.
3. **3 niveaux de risque** :
   - `auto` : lecture seule, fait d'office ;
   - `confirm` : réversible, 1 clic (coché par défaut) ;
   - `ask` : jamais coché par défaut (fermer Word, mise à jour avec redémarrage).
4. **Pas de shell** : les commandes passent par `execFile`, les noms en arguments. Un nom d'app bizarre ne peut pas lancer une autre commande.
5. **Tout est journalisé**, et ce qui est réversible est annulable.
6. **Simulation par défaut** (`PREFLIGHT_DRY_RUN=1`).

## 6. Quoi lire dans le code (≈ 25 min, dans cet ordre)

Oui, lis-en une partie : le jury va te poser des questions sur **comment** l'agent agit en sécurité, et tu dois pouvoir répondre sans hésiter. Tu n'as pas besoin de lire le design (CSS, animations).

1. **`src/shared/types.ts`** (5 min) : les formes de données. Tout le reste en découle.
2. **`src/main/actions.ts`** (10 min) : le plus important pour le pitch. Regarde le tableau `tools` (un outil = risque + `validate` + `execute`) et la fonction `runActions`.
3. **`src/main/planner.ts`** (5 min) : comment on passe de « photo du Mac + prochain bloc » à une liste d'actions. C'est ici que le LLM se branchera.
4. **`src/main/sensors.ts`** (5 min) : survole `takeSnapshot()` en bas, et une fonction `parse*` pour voir le principe.
5. Si tu as le temps : `src/renderer/src/popup/Popup.tsx`, fonction `Preflight`, pour voir comment l'UI appelle `window.api`.

## 7. Déboguer

- **L'IA est lente ou ne répond pas** : `npm run bench:llm` essaie plusieurs modèles avec ta clé (≈ 1-2 min) et indique le plus rapide qui marche. Mets-le dans `.env` : `TOGETHER_TABS_MODEL=...`.

- **Les erreurs du main** (capteurs, actions, LLM) s'affichent dans le **terminal** où tourne `npm run dev`.
- **Les erreurs de l'UI** : dans la fenêtre, `Cmd+Option+I` ouvre les outils de développement (onglet Console).
- **Le journal** est sauvegardé dans `~/Library/Application Support/lauzhack-nexthink/journal.json`.
- **Une valeur « non lue »** sur la page Mon PC = la commande correspondante a échoué ou a été refusée (ex. accès à Chrome refusé dans Réglages → Confidentialité → Automatisation).

## 8. Petit lexique

- **IPC** : les messages entre le main et les fenêtres.
- **Preload / `contextBridge`** : le pont qui expose `window.api` à la page, et rien d'autre.
- **Snapshot** : une photo de l'état du Mac à un instant donné.
- **Dry run** : mode simulation, les actions sont journalisées mais pas exécutées.
- **Serverless (Together)** : modèle utilisable directement avec ta clé, sans louer un serveur dédié.
