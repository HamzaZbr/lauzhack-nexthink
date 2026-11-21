/**
 * Ouvre une NOUVELLE fenêtre Chrome avec un jeu d'onglets de démo (le même à chaque fois).
 * Lancer : npm run demo:tabs
 * Avec TABS_SCOPE=front dans .env, l'app ne regarde que cette fenêtre : tes autres onglets ne sont pas touchés.
 *
 * Le mélange est pensé pour la démo (meeting « Sync équipe produit », 10:00, Teams) :
 * travail à garder, distractions à fermer, des doublons, et un piège (un tuto YouTube qui est du travail).
 */
import { execFile } from "node:child_process";

const TABS = [
  // Travail : à garder
  "https://github.com/electron/electron",
  "https://moodle.epfl.ch/",
  "https://www.notion.so/",
  "https://arxiv.org/list/cs.CV/recent",
  "https://huggingface.co/models",
  "https://stackoverflow.com/questions/tagged/applescript",
  "https://kotlinlang.org/docs/coroutines-overview.html",
  "https://www.youtube.com/results?search_query=electron+tutorial", // piège : YouTube, mais du travail
  // Distractions : à fermer
  "https://www.youtube.com/results?search_query=lofi+hip+hop",
  "https://www.reddit.com/r/ProgrammerHumor/",
  "https://www.reddit.com/r/ProgrammerHumor/", // doublon
  "https://news.ycombinator.com/",
  "https://www.netflix.com/",
  "https://www.instagram.com/",
  "https://www.google.com/search?q=meteo+lausanne",
  "https://www.google.com/search?q=meteo+lausanne", // doublon
  "https://www.linkedin.com/feed/",
  "https://www.amazon.de/s?k=casque+sony",
];

execFile("open", ["-na", "Google Chrome", "--args", "--new-window", ...TABS], (err) => {
  if (err) {
    console.error("Impossible d'ouvrir Chrome :", err.message);
    process.exit(1);
  }
  console.log(`Fenêtre de démo ouverte : ${TABS.length} onglets (8 de travail dont 1 piège, 10 à fermer dont 2 doublons).`);
  console.log("Mets TABS_SCOPE=front dans .env (puis relance l'app) pour que Preflight ne regarde que cette fenêtre.");
});
