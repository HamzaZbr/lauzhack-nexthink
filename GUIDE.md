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

**Exemple d'invitation idéale**
- Titre : `Revue budget avec Finance`
- Description : `Ordre du jour : valider budget_q4.xlsx. Teams : https://teams.microsoft.com/l/meetup-join/…`

**Attention avec un vrai agenda :** Google et Outlook ne mettent pas leur lien ICS à jour instantanément (de quelques minutes à plusieurs heures). Un meeting que tu viens d'ajouter peut ne pas apparaître : bouton « recharger » au-dessus de la timeline, ou calendrier de démo.

## 4. Le scénario de démo (≈ 3 min)

**Avant (5 min) :**
1. `.env` : `PREFLIGHT_DRY_RUN=0`, `TABS_SCOPE=front`, `CALENDAR_ICS_URL` commentée.
2. `npm run demo:tabs` : une fenêtre Chrome de démo s'ouvre (18 onglets). **Laisse-la au premier plan.**
3. Ouvre **Spotify** (une app « inutile » à fermer). Ferme **Docker** si des conteneurs comptent.
4. `npm run dev`. Ouvre la page **Mon PC** une fois : le tri des onglets est fait et gardé 5 min, le pre-flight s'ouvrira instantanément.

**Pendant :**
1. Sidebar → **08:30 brief** → taper la phrase de démo (section 2) → « Ta journée est prête ».
2. Sidebar → **09:55 pre-flight** → le pop-up s'ouvre **tout seul**. Montrer les niveaux de risque, « Voir onglet par onglet », décocher un onglet.
3. « Voir pourquoi » → l'arbre : ta journée → tes apps → tes onglets, en rouge ce que l'IA ferme.
4. « Préparer » → Spotify et les onglets se ferment.
5. **Journal** → « Annuler » sur une action → elle revient.
6. Sidebar → **10:45 café** → « je peux libérer X Go pendant ta pause » : caches reconstructibles cochés, Corbeille et vieux téléchargements à cocher (« demande »), mise à jour placée avant le meeting de 11:30.
7. Sidebar → **18:00 bilan** → les chiffres du jour, cocher ce qui est fait, « Garder pour demain ».
8. **Semaine** → « seulement le réel » → ce que l'agent a fait gagner, avec les hypothèses.
9. (Option) **08:30 brief** à nouveau → ce qui restait est déjà pré-rempli.

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
| 13 | 10:45 café → « Vas-y » | Tailles mesurées (Go), actions faites ou simulées dans le journal, « Disque libéré » sur Semaine | à revérifier |
| 14 | Semaine → « seulement le réel » | Chiffres = actions faites du journal | à revérifier |
| 15 | `npm run bench:llm` | Tableau erreurs graves / oublis par modèle | ✅ |
| 16 | Brief avec « le fichier budget_q4 » et « sur GitHub », puis « aller à » 13:55 | Pre-flight : « Ouvrir budget_q4.xlsx », onglet GitHub mis devant ou ouvert | à vérifier |
| 17 | 18:00 bilan → « Garder pour demain » → 08:30 brief | Le brief est pré-rempli avec ce qui restait | à vérifier |

## 6. Si quelque chose ne marche pas

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
