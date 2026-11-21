# Preflight : objectif et avancement

> Fichier de référence. Si tu te perds, reviens ici. Pour tester et faire la démo : [GUIDE.md](GUIDE.md).
> Dernière mise à jour : samedi 21/11, 23h45.

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

Avant la démo : `PREFLIGHT_DRY_RUN=0` et `TABS_SCOPE=front` dans `.env`, `npm run demo:tabs` (fenêtre Chrome de démo au premier plan), Spotify ouvert, Docker fermé si des conteneurs comptent.

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

**Dernière feature (dimanche matin, si le temps le permet)**
- Processus d'arrière-plan, **en lecture seule** : afficher les plus gourmands (Spotlight `mds_stores`, Time Machine `backupd`, synchro iCloud, un `python`/`node` oublié…) expliqués en langage humain, **sans bouton pour les arrêter** (trop risqué). Aujourd'hui `sensors.ts` les ignore exprès : il ne garde que les `.app`.

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
- [x] Modèle LLM : `zai-org/GLM-5.2`, choisi par mesure (`npm run bench:llm`) : 0,6 s pour trier 25 onglets

### Capteurs et actions (18:30–20:00)
- [x] Lecture du Mac : batterie, disque, mémoire, Wi-Fi, apps par RAM/CPU, onglets Chrome
- [x] Détection de problèmes (batterie < 20 %, disque < 10 Go, mémoire > 85 %, Wi-Fi < −70 dBm, onglets en double)
- [x] Registre d'actions : fermer une app, fermer des onglets, ouvrir un lien/une app, mise à jour (simulée)
- [x] Validation des cibles, apps protégées, pas de shell, journal persistant, annuler
- [x] **Testé en réel sur le Mac** : fermeture de Spotify + Annuler (rouvert), fermeture d'onglets, pre-flight déclenché seul 5 min avant un vrai meeting
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
- [x] Pre-flight : l'IA trie les onglets selon le meeting (garder / fermer + raison), détail onglet par onglet décochable, garde-fous dans le code
- [x] Filet de sécurité : brief (12 s max) et tri des onglets (25 s max) retombent sur les règles si l'IA échoue ; l'erreur exacte est affichée
- [x] Tri plus fiable : l'IA ne renvoie que les onglets à fermer (réponse courte), longueur max fixée
- [x] Un seul « cerveau » : le même tri (gardé 5 min) colore l'arbre (rouge = à fermer selon l'IA) et remplit le pop-up
- [x] Plus de contexte : description de l'invitation, onglet affiché protégé, phrase sur toi (`USER_CONTEXT`), préférences apprises (sites que tu décoches / fermes)
- [x] Les blocs terminés disparaissent de l'arbre ; la timeline les grise

### Idées notées
- [x] Le brief retient aussi les **sites** et les **documents** des tâches
- [x] **Préparer l'espace de travail** : à T-5, ouvrir le document cité (trouvé par Spotlight), mettre devant l'onglet utile ou ouvrir le site ; onglets de la tâche protégés et en vert dans l'arbre
- [x] **Pause café qui agit vraiment** : mesure et nettoie les caches reconstructibles (npm, pip, Homebrew, Gradle, Xcode, Spotify), vide la Corbeille, range les vieux téléchargements dans la Corbeille ; Go libérés dans le journal et la page Semaine
- [x] **Bilan de fin de journée** (18:00, ou bouton « bilan ») : temps gagné, actions, problèmes et Go libérés du jour ; coche ce qui est fait ; « ce qui reste » est repris dans le brief du lendemain ; aperçu des meetings de demain

### Bloc 2 : maintenance (23:30–01:30)
- [ ] Trouver les créneaux libres dans le calendrier
- [ ] Pop-up café déclenché au début du créneau
- [ ] Nettoyage disque proposé (caches, Corbeille), toujours en « demande »

### Finitions (01:30–03:00, puis 07:00–09:30)
- [x] Semaine : chiffres calculés depuis le journal (temps gagné avec hypothèses affichées, barres par jour, simulations comptées à part)
- [ ] Scénario de démo complet, joué 2 fois sans intervenir
- [ ] Dormir (03:00–07:00)

### Pitch (10:00–12:00)
- [ ] 3-4 slides : qui, quelle douleur, démo, sécurité, prochaines étapes
- [ ] Vidéo de secours de la démo
- [ ] Répéter 3 min · push final avant 12:00

## Ce que l'IA reçoit pour trier les onglets

- le prochain bloc (titre, heure, apps, **description de l'invitation**) et les autres blocs du jour ;
- une phrase sur toi (`USER_CONTEXT` dans `.env`) ;
- ce qu'elle a appris de toi (`prefs.json`) : sites que tu gardes toujours, sites que tu fermes souvent ;
- une ligne par onglet : `numéro | site | titre | (affiché)` (`TABS_SEND_TITLES=0` → sans les titres).

Elle répond seulement par les onglets à fermer, avec une raison. Le code refuse de fermer : l'onglet affiché, le lien du meeting, la messagerie, les documents utiles au meeting ; plafond de 40.

## Ce qu'on a appris en testant sur le vrai Mac

- Disque : **2,1 Go libres**. C'est un vrai problème à montrer (et à corriger avec un nettoyage proposé).
- Chrome : **5 Go, 74 onglets**, classé « utile » parce que le bloc « Rapport Q4 » a besoin de Chrome. Le tri onglet par onglet est le bon travail pour le LLM.
- Les règles seules ne proposent presque rien à fermer : il faut le LLM (ou une scène de démo préparée).
- Le premier tri par l'IA échouait (réponse trop longue pour 73 onglets) : corrigé en ne demandant que les onglets à fermer.
- Il échouait encore avec une réponse **vide** : GLM-5.3-Flash « réfléchit » par défaut et la réflexion mange toute la longueur. Couper la réflexion ne suffisait pas (GLM-5.3-Flash l'ignore : 4 800 caractères de réflexion, réponse vide). Mesure sur 7 modèles → **GLM-5.2 : 0,6 s**, DeepSeek-V4.1-Flash 0,8 s (mais ferme une question Stack Overflow utile), Qwen3.5-9B 1,0 s (prudent). Choix : GLM-5.2.
- Mesure de **qualité** (25 onglets étiquetés à la main, 2 essais) : **gpt-oss-120b 0 erreur grave / 0 oubli (4 s)**, GLM-5.2 1 / 0,5 (0,8 s, ferme toujours la question Stack Overflow), DeepSeek 1,5 / 1, Qwen 2 / 2. Choix : **gpt-oss-120b pour les onglets** (lancé en avance, 8 min avant le meeting, donc ses 4 s ne se voient pas), **GLM-5.2 pour le brief** (interactif, doit être rapide). Consigne enrichie : les pages techniques (Stack Overflow, docs, assistants IA, tutos de code) sont du travail.
- Avec un vrai lien de calendrier un samedi, il n'y a aucun meeting : pour la démo, commenter `CALENDAR_ICS_URL`.
