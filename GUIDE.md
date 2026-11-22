# Guide : bien utiliser et bien tester Preflight

> Pour l'objectif et l'avancement : [PROJET.md](PROJET.md). Pour le fonctionnement du code : [ARCHITECTURE.md](ARCHITECTURE.md).

## 1. Réglages (`.env`)

Le fichier `.env` n'est lu **qu'au démarrage** : relance `npm run dev` après chaque modification.

| Ligne | Valeur conseillée | À quoi ça sert |
|---|---|---|
| `TOGETHER_API_KEY` | ta clé | Accès à l'IA |
| `TOGETHER_MODEL` | `zai-org/GLM-5.2` | IA du brief du matin (rapide, ~0,8 s) |
| `TOGETHER_TABS_MODEL` | `openai/gpt-oss-120b` | IA du tri des onglets (la plus juste, ~4 s, lancée en avance) |
| `USER_CONTEXT` | une phrase sur toi | Dit à l'IA ce qui compte comme du travail pour toi. Pas de `#` dans la phrase |
| `PREFLIGHT_DRY_RUN` | `1` pour tester, `0` pour la démo | `1` = actions simulées, `0` = actions réelles |
| `TABS_SCOPE` | `front` | Ne regarder et ne fermer que la fenêtre Chrome au premier plan |
| `CALENDAR_ICS_URL` | commentée (`#`) pour la démo | Ton vrai agenda (lien ICS). Sans elle : calendrier de démo |
| `TABS_SEND_TITLES` | `1` | `0` = n'envoyer à l'IA que les noms de sites, pas les titres d'onglets |

## 2. Bien écrire le brief du matin

L'IA tire de ta phrase, pour chaque tâche : un **titre**, un **créneau** (seulement dans tes trous libres) et les **apps nécessaires**. Ces apps servent ensuite partout : l'arbre relie la tâche à ses apps, le pre-flight les ouvre, et le tri des onglets garde ce qui est lié.

**Les 4 règles**
1. **Une tâche par morceau**, séparées par des virgules.
2. **Nomme l'outil ou le site** : « dans VS Code », « sur GitHub », « dans Excel », « sur Notion ».
3. **Donne l'heure ou la durée** si tu la connais : « à 14h », « 1h ». Sinon l'IA estime (30 à 120 min).
4. **Nomme le document** : « le budget Q4 (Excel) », « les slides du pitch ».

| ❌ Vague | ✅ Optimal |
|---|---|
| bosser sur VITALS | 2h sur VITALS à 14h : entraîner le modèle dans VS Code et lire 2 papiers arXiv |
| préparer le pitch | 1h pour les slides du pitch dans Google Slides, puis répéter |
| faire des exos | 45 min d'exercices CS-233 sur Moodle à 16h |
| répondre aux mails | 30 min de mails dans Outlook avant 9h |

**Ce que l'IA retient aussi (pour préparer ton espace de travail) :**
- les **sites** cités ou évidents (« sur GitHub » → github.com) : à T-5, l'onglet déjà ouvert est mis devant, sinon le site est ouvert ; ces onglets ne sont **jamais fermés** par le tri ;
- les **documents** cités (« le fichier budget_q4 ») : l'app les cherche sur ton Mac (Spotlight) et propose d'ouvrir le plus récent.

**Phrase de démo qui marche bien :**
`finir le rapport Q4 dans Excel avec le fichier budget_q4 à 14h, relire la PR #42 sur GitHub, 45 min d'exercices CS-233 sur Moodle`

Le fichier `resources/demo-files/budget_q4.xlsx` existe pour la démo : Spotlight le trouve (il est dans ton dossier).

**Raccourci :** Cmd+Entrée envoie le brief.

## 3. Bien écrire un meeting dans l'agenda

L'app lit l'invitation (titre, description, lieu). Sans indice, elle ne sait pas de quoi le meeting a besoin : rien ne lui est relié dans l'arbre (« aucune app détectée »).

| Mets dans l'invitation | L'app en déduit |
|---|---|
| Un lien Teams (`teams.microsoft.com/l/meetup-join/…`) | Teams + bouton « Rejoindre le meeting » |
| Un lien Zoom (`…zoom.us/j/…`) | Zoom + « Rejoindre » |
| Un lien Google Meet (`meet.google.com/…`) | Chrome + « Rejoindre » |
| Un lien Webex | Webex + « Rejoindre » |
| `budget.xlsx`, « Excel », « tableur » | Excel |
| `.pptx`, « PowerPoint », « slides » | PowerPoint |
| `.docx`, « Word » | Word |
| Un nom de fichier (`budget_q4.xlsx`) | Le fichier est cherché sur ton Mac et proposé à l'ouverture avant le meeting |
| Un ordre du jour | Donné à l'IA pour trier les onglets (ex. elle garde le doc mentionné) |
| « présenter », « projecteur », « pitch », « soutenance » | Tu présentes : adaptateur HDMI dans le sac la veille, et à T-5 l'app vérifie qu'un écran externe est branché |
| « HDMI », « chargeur », « casque », « clé USB » | Ajouté à la liste « Dans ton sac » |
| Un lien de visio, « en ligne », « GitHub »… | Besoin d'internet : à T-5, le Wi-Fi est vérifié |
| Un bloc de 90 min ou plus | Batterie vérifiée à T-5 (branche-toi si < 50 %) |

« Préparer le pitch » ne compte **pas** comme une présentation (pas d'écran à brancher) ; « présenter le pitch » ou « pitch devant le jury » oui.

**Exemple d'invitation idéale**
- Titre : `Revue budget avec Finance`
- Description : `Tu présentes les chiffres au projecteur, salle BC 410. Document : budget_q4.xlsx. Teams : https://teams.microsoft.com/l/meetup-join/…`

**Attention avec un vrai agenda :** Google et Outlook ne mettent pas leur lien ICS à jour instantanément (de quelques minutes à plusieurs heures). Un meeting que tu viens d'ajouter peut ne pas apparaître : bouton « recharger » au-dessus de la timeline, ou calendrier de démo.

**Agenda de démo sur deux jours :** `resources/outlook-preflight-22-23nov.ics` (dimanche 22 + lundi 23). À importer dans Outlook, ou à lire directement : `CALENDAR_ICS_FILE=/Users/hamza/Desktop/bsa/lauzhack-nexthink/resources/outlook-preflight-22-23nov.ics`. Le bouton **demain 08:30** de l'horloge passe au lundi : meetings du lundi, tâches de la veille oubliées, ce qui restait repris dans le brief.

## 4. Le scénario de démo (le pitch, 4 min)

**Avant (10 min) :**
1. `.env` : `PREFLIGHT_DRY_RUN=0`, `TABS_SCOPE=front`, `CALENDAR_ICS_FILE=` chemin complet de `resources/outlook-preflight-22-23nov.ics` (l'événement « Pitch LauzHack » à l'heure de ton passage).
2. `npm run demo:tabs` : la fenêtre Chrome de démo. **Laisse-la au premier plan.**
3. Ouvre **Spotify** (une app « inutile » à fermer).
4. `npm run dev` : **seule la mascotte apparaît**, en bas à droite. Ouvre Mon PC une fois (le tri des onglets est préparé), puis ferme le tableau de bord.
5. Raccourcis : active ⌃⌥P (présentation) dans la page Raccourcis.
6. Câble HDMI à portée de main, **débranché**. Recopie vidéo réglée.

**Pendant :**
1. *(0:00)* Écran vide, juste la mascotte. Le problème en une phrase.
2. *(0:20)* Clic sur la mascotte (« Hey bro, let's begin ») → brief : tu écris ta journée → « N tâches placées ».
3. *(0:55)* Horloge → 5 min avant le pitch → la mascotte : « « Pitch LauzHack » à 12:30. Je prépare ton Mac. » → pre-flight : ⚠ aucun écran branché → tu branches → ✓ en 3 s. Spotify et les onglets inutiles fermés.
4. *(1:50)* Bloc « préparer la présentation de mon projet de master » : le pre-flight propose « Créer la présentation au modèle de l'entreprise », ou tu appuies sur **⌃⌥P** → Keynote s'ouvre au modèle Lémanic. Page Raccourcis : 46 min/semaine à la main → 1 min.
5. *(2:40)* 18:00 → bilan : temps gagné, ce qui reste, « Dans ton sac pour demain ».
6. *(3:20)* Sécurité (rien sans ton accord, Annuler, simulation par défaut) et la suite (flotte d'entreprise, données Nexthink).

**Après :** remets `PREFLIGHT_DRY_RUN=1`.

## 5. Checklist de test

| # | Test | Résultat attendu | État |
|---|---|---|---|
| 1 | Bouton « Tester le LLM » | « OK · ~300 ms » en vert | ✅ |
| 2 | Page Aujourd'hui | « Calendrier de démo · 3 meetings » (ou ton lien ICS) | ✅ |
| 3 | Brief (08:30) | Tâches en gras, placées entre les meetings | ✅ |
| 4 | Bouton pre-flight de la sidebar | Pop-up qui s'ouvre tout seul en < 15 s | ✅ |
| 5 | Vrai meeting dans 5 min (heure réelle) | Pop-up tout seul à T-5 | ✅ |
| 6 | Mon PC | « Onglets triés par l'IA en x s », groupes rouge/or/vert | ✅ |
| 7 | Pop-up : décocher la case principale des onglets | Tous les onglets se décochent | à revérifier |
| 8 | Pop-up : scroller la liste d'onglets | La liste défile | à revérifier |
| 9 | Mode réel : fermer Spotify | Spotify se ferme | ✅ |
| 10 | Journal : Annuler | Spotify se rouvre | ✅ |
| 11 | Mode réel : fermer des onglets | Les onglets se ferment, la ligne du journal dit « fait · N onglet(s) » | à revérifier |
| 12 | Après une action | L'arbre se met à jour seul (~1,5 s) | à revérifier |
| 13 | 10:45 café → « Vas-y » | Tailles mesurées (Go), actions faites ou simulées dans le journal, « Disque libéré » sur Semaine | ✅ OK |
| 14 | Semaine → « seulement le réel » | Chiffres = actions faites du journal | ✅ OK |
| 15 | `npm run bench:llm` | Tableau erreurs graves / oublis par modèle | ✅ |
| 18 | 18:00 bilan | « Dans ton sac pour demain : adaptateur USB-C → HDMI · pour « Revue budget avec Finance » à 11:30 » | à vérifier |
| 19 | « aller à » 11:25 (sans écran externe branché) | Pre-flight : « ⚠ Tu présentes à 11:30 et aucun écran externe n'est branché… » en tête, et « ● en direct » | ✅ |
| 20 | Pop-up du test 19 ouvert, branche un écran / une TV / un projecteur | En 3 s, l'alerte devient « ✓ Écran externe branché (nom) » et le titre « Tout est prêt » (ou une chose de moins à régler) | à vérifier |
| 21 | Brief « présenter le pitch à 12h30 », puis 12:25 | Même alerte écran + HDMI dans « À avoir sur toi aujourd'hui » | à vérifier |
| 22 | 18:00 bilan → « Garder pour demain » → bouton **demain 08:30** | Horloge « lun. 23 nov. · J+1 », meetings du lundi (avec le fichier Outlook), tâches d'hier disparues, brief pré-rempli avec ce qui restait | à vérifier |
| 23 | `npm run dev` | Seule la mascotte apparaît en bas à droite, bulle « Clique-moi pour commencer ta journée » ; pas de tableau de bord | à vérifier |
| 24 | Clic sur la mascotte | Le brief s'ouvre, la mascotte dit « Bonjour ! » ; après le brief, « N tâches placées » ; un 2e clic ouvre le tableau de bord ; clic droit = menu | à vérifier |
| 25 | Horloge → pre-flight | La mascotte saute et annonce le bloc | à vérifier |
| 26 | Pre-flight d'un meeting → « Ouvrir des notes de réunion déjà remplies » | Pages s'ouvre avec titre, date, participants, ordre du jour, Décisions, Actions (fichier dans Documents/Preflight) | à vérifier |
| 27 | Page Raccourcis → « Essayer » sur la présentation | Keynote s'ouvre avec le modèle Lémanic (fond bleu, logo) ; ligne « fait » dans le journal | à vérifier |
| 28 | « Créer le raccourci ⌃⌥P », puis ⌃⌥P depuis n'importe quelle app | Nouvelle présentation ouverte, la mascotte le dit | à vérifier |
| 29 | Tri des onglets sur `npm run demo:tabs` | GitHub, Moodle, Stack Overflow, tuto Electron… gardés (« site de travail ») ; Netflix, Reddit, Instagram… fermés | à vérifier |
| 16 | Brief avec « le fichier budget_q4 » et « sur GitHub », puis « aller à » 13:55 | Pre-flight : « Ouvrir budget_q4.xlsx », onglet GitHub mis devant ou ouvert | à vérifier |
| 17 | 18:00 bilan → « Garder pour demain » → **demain 08:30** | Le brief du lendemain est pré-rempli avec ce qui restait (pas le soir même, pas à chaque relance) ; effacé dès qu'un brief est planifié | ✅ |

## 6. Si quelque chose ne marche pas

- **La mascotte n'apparaît pas** : icône de la barre de menu → « Afficher la mascotte ». Ou `PREFLIGHT_START=dashboard` dans `.env` pour revenir à l'ancien démarrage.
- **⌃⌥P ne fait rien** : la page Raccourcis dit si la touche est déjà prise par une autre app ; utilise « Essayer ».
- **Keynote / Pages affiche « document importé »** : normal, les modèles sont au format Office (.pptx, .docx) ; Keynote et Pages les convertissent.


| Symptôme | Cause probable | Que faire |
|---|---|---|
| « IA indisponible : réponse vide » | Le modèle « réfléchit » trop | `npm run bench:llm` et changer de modèle |
| « IA indisponible : délai dépassé » | Modèle lent ou réseau | Changer `TOGETHER_TABS_MODEL`, vérifier le Wi-Fi |
| Le pre-flight ne s'ouvre pas | Aucun meeting ni tâche à venir | Faire le brief, ou commenter `CALENDAR_ICS_URL` |
| Un meeting ajouté n'apparaît pas | Lien ICS pas encore mis à jour | Bouton « recharger », ou calendrier de démo |
| Onglets « non lus » | Accès à Chrome refusé | Réglages Système → Confidentialité → Automatisation → autoriser Chrome |
| Une action dit « simulé » | `PREFLIGHT_DRY_RUN` n'est pas à `0` | Le mettre à `0`, relancer |
| Un réglage de `.env` n'a pas d'effet | `.env` lu seulement au démarrage | Relancer `npm run dev` |
| Erreur bizarre | — | Regarder le terminal de `npm run dev` (lignes `[llm]`) et `Cmd+Option+I` dans la fenêtre |

## 7. Ce qui est sûr, ce qui ne l'est pas

- **Lire le Mac** (batterie, disque, apps, onglets) : sans risque.
- **Fermer une app** : comme Cmd+Q, l'app demande s'il faut sauvegarder. Word, Excel, Pages… ne sont jamais cochés d'avance.
- **Fermer des onglets** : ce qui est tapé dedans (formulaire, brouillon) est perdu ; « Annuler » rouvre les pages, pas le texte. L'onglet affiché, ta messagerie et le lien du meeting ne sont jamais fermés.
- **Nettoyage de la pause café** : seulement une liste fermée de caches qui se reconstruisent tout seuls (npm, pip, Homebrew, Gradle, Xcode, Spotify). Vider la Corbeille est définitif (« demande »). Les vieux téléchargements vont dans la Corbeille (récupérables).
- **Mise à jour macOS** : toujours simulée.
- **Processus d'arrière-plan** : pas touchés (lecture seule prévue en dernière feature).
