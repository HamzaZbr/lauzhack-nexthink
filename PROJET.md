# Preflight : objectif et avancement

> Fichier de référence. Si tu te perds, reviens ici.
> Dernière mise à jour : samedi 21/11, 19h45.

## L'objectif en une phrase

**Un agent IT qui prépare ta journée** : il lit ton calendrier, te demande le matin ce que tu fais en plus, prépare ton Mac 5 min avant chaque meeting (en demandant avant d'agir) et place la maintenance dans tes créneaux libres.

## Le problème (slide 3 du challenge Nexthink)

La plupart des soucis tech au travail ne sont **jamais signalés** : un PC lent avant un appel, le Wi-Fi qui lâche, une mise à jour qui tombe au mauvais moment. Les gens soupirent, contournent et continuent. L'IT ne voit que les tickets.

## Pour qui

Un employé de bureau avec une journée chargée de meetings, sur son propre poste.

## Ce qu'on montre au jury (le « moment » de la démo)

1. **09:55** : le pop-up pre-flight s'ouvre seul, « Sync équipe produit dans 5 min ».
2. L'agent a détecté de **vrais problèmes** (sur ton Mac aujourd'hui : **2,1 Go libres sur le disque**, **Chrome à 5 Go avec 74 onglets**).
3. Il propose des actions, chacune avec **sa raison** et **son niveau de risque** (auto / 1 clic / demande).
4. Clic sur « Préparer » : c'est fait, tout est **dans le journal**, et **annulable**.
5. « Voir pourquoi » ouvre l'**arbre** : ta journée d'un côté, ce qui tourne sur ton Mac de l'autre.
6. **Pause café** : la mise à jour est placée dans le créneau libre, pas pendant le meeting.
7. **Semaine** : ce que l'agent t'a fait gagner.

## Le scénario de démo (avec l'horloge)

1. Lancer l'app. Dans la sidebar : **08:30** → le brief s'ouvre. Taper « finir le rapport Q4 cet aprem, note de frais » → l'IA place les tâches.
2. **09:55** → le pre-flight s'ouvre **tout seul** pour « Sync équipe produit » (10:00). Montrer les risques, cliquer « Voir pourquoi » (arbre), puis « Préparer ».
3. **Journal** → les actions faites, cliquer « Annuler » sur l'une d'elles.
4. **10:45** → la pause café s'ouvre toute seule : la mise à jour est placée avant le meeting de 11:30.
5. **Semaine** → ce que l'agent t'a fait gagner.

Avant la démo : `PREFLIGHT_DRY_RUN=0` dans `.env`, Spotify ouvert, quelques onglets en double, Docker fermé si des conteneurs comptent.

## Comment ça colle à la grille du jury

| Critère | Poids | Notre réponse |
|---|---|---|
| Idée & impact | 30 % | Douleur fréquente et silencieuse (PC pas prêt avant un appel), pour un utilisateur clair |
| Exécution | 30 % | Démo réelle sur un Mac ; le LLM propose, le code vérifie ; niveaux de risque, journal, annuler |
| Créativité | 20 % | L'agent part du **calendrier** (ce que tu vas faire), pas seulement de l'état du PC |
| Utile quand rien ne casse | 10 % | Brief du matin, maintenance dans les trous, récap de la semaine |
| Pitch & démo | 10 % | Un scénario de 3 min, l'horloge de démo, une vidéo de secours |

## Périmètre

**Cœur (à finir absolument)**
- Brief du matin + pre-flight à T-5 min
- Maintenance dans les créneaux libres + pause café
- Niveaux de risque, journal, annuler

**Bonus (seulement si le cœur marche avant ~6h)**
- Raccourcis : repérer les suites d'actions répétées dans la semaine et proposer un raccourci

**Hors périmètre (mentionné dans le pitch comme « prochaines étapes »)**
- Microsoft Graph (calendrier + logs M365 en production)
- Vue agrégée pour l'IT (ce qui fait souffrir l'entreprise, classé par heures perdues)
- Windows

## Décisions prises

- Démo sur le Mac de Hz. Stack : Electron + React + TypeScript, design repris de Contagion.
- LLM : Together AI, modèle serverless (`zai-org/GLM-5.3-Flash` par défaut), réponses en JSON contraint par un schéma.
- **Le LLM propose, le code dispose** : il ne peut choisir que des outils du catalogue, sur des cibles vérifiées.
- Par défaut les actions sont **simulées** (`PREFLIGHT_DRY_RUN=1`) ; on passe en réel pour la démo.
- Calendrier : faux `.ics` pour la démo (fiable) + lien ICS Outlook en option.

## Avancement

Légende : `[x]` fait · `[~]` en cours · `[ ]` à faire

### Fondations
- [x] Repo Electron + React/TS, design Contagion, 4 pages, 3 pop-ups, icône dans la barre de menu
- [x] Appel LLM Together en JSON (bouton « Tester le LLM »)
- [x] Modèle LLM serverless (`zai-org/GLM-5.3-Flash`) : test OK, ~1,2 s

### Capteurs et actions (18:30–20:00)
- [x] Lecture du Mac : batterie, disque, mémoire, Wi-Fi, apps par RAM/CPU, onglets Chrome
- [x] Détection de problèmes (batterie < 20 %, disque < 10 Go, mémoire > 85 %, Wi-Fi < −70 dBm, onglets en double)
- [x] Registre d'actions : fermer une app, fermer des onglets, ouvrir un lien/une app, mise à jour (simulée)
- [x] Validation des cibles, apps protégées, pas de shell, journal persistant, annuler
- [x] Page Mon PC (vraies données + arbre), page Journal (vraies actions), pop-up pre-flight (vrai plan)
- [x] Arbre v2 : 3 colonnes (blocs → apps → onglets par site), apps à ouvrir en pointillés, barre de RAM, clic sur un nœud → détail + action (fermer / ouvrir)

### Calendrier et horloge
- [x] Calendrier `.ics` : démo (`resources/demo.ics`) ou vrai lien ICS Outlook/Google (`CALENDAR_ICS_URL`), réunions récurrentes comprises
- [x] Liens Teams/Zoom/Webex/Meet extraits des invitations → apps nécessaires + « Rejoindre le meeting »
- [x] Créneau de maintenance calculé (premier trou entre deux meetings)
- [x] Horloge de démo dans la sidebar (08:30 brief · 09:55 pre-flight · 10:45 café · heure réelle)
- [x] Planificateur : pre-flight tout seul 5 min avant chaque meeting, café au début du créneau libre
- [ ] Tester avec ton vrai lien ICS (Outlook EPFL ou Google)

### Bloc 1 : LLM (21:30–23:30)
- [x] Brief du matin : le LLM découpe la phrase en blocs placés dans les créneaux libres, avec les apps (+ plan de secours sans IA)
- [ ] Pre-flight : le LLM trie les **74 onglets** selon le meeting (garder / fermer, avec une raison)
- [~] Filet de sécurité : fait pour le brief (12 s max), à faire pour le pre-flight

### Bloc 2 : maintenance (23:30–01:30)
- [ ] Trouver les créneaux libres dans le calendrier
- [ ] Pop-up café déclenché au début du créneau
- [ ] Nettoyage disque proposé (caches, Corbeille), toujours en « demande »

### Finitions (01:30–03:00, puis 07:00–09:30)
- [ ] Semaine : chiffres calculés depuis le journal (hypothèses affichées)
- [ ] Scénario de démo complet, joué 2 fois sans intervenir
- [ ] Dormir (03:00–07:00)

### Pitch (10:00–12:00)
- [ ] 3-4 slides : qui, quelle douleur, démo, sécurité, prochaines étapes
- [ ] Vidéo de secours de la démo
- [ ] Répéter 3 min · push final avant 12:00

## Ce qu'on a appris en testant sur le vrai Mac

- Disque : **2,1 Go libres**. C'est un vrai problème à montrer (et à corriger avec un nettoyage proposé).
- Chrome : **5 Go, 74 onglets**, classé « utile » parce que le bloc « Rapport Q4 » a besoin de Chrome. Le tri onglet par onglet est le bon travail pour le LLM.
- Les règles seules ne proposent presque rien à fermer : il faut le LLM (ou une scène de démo préparée).
