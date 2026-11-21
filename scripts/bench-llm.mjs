/**
 * Mesure la QUALITÉ et la vitesse du tri des onglets, modèle par modèle, avec TA clé.
 * Lancer : npm run bench:llm          (environ 2 à 3 min)
 *
 * 25 onglets réalistes, chacun avec la « bonne réponse » écrite à la main :
 *   K = à garder (travail, meeting, en cours)   C = à fermer (sans rapport)   ? = discutable (pas compté)
 * Pour chaque modèle (2 essais, pour voir s'il est stable) :
 *   - ERREURS GRAVES : onglets de travail qu'il a fermés (le pire : l'utilisateur perd quelque chose)
 *   - OUBLIS         : onglets inutiles qu'il a gardés (moins grave : on libère juste moins)
 *   - temps de réponse
 * Le prompt est LE MÊME que dans l'app (src/main/agent.ts, triageTabs) : si tu le changes là-bas, change-le ici.
 */
import { readFileSync } from "node:fs";

// ---------- .env ----------
const env = {};
try {
  for (const line of readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*"?(.*?)"?\s*$/);
    if (m) env[m[1]] = m[2];
  }
} catch {
  console.error("Pas de fichier .env trouvé.");
  process.exit(1);
}
const KEY = env.TOGETHER_API_KEY;
if (!KEY) {
  console.error("TOGETHER_API_KEY manquante dans .env");
  process.exit(1);
}

const MODELS = (process.argv[2]?.split(",") ?? [
  env.TOGETHER_MODEL,
  "zai-org/GLM-5.2",
  "deepseek-ai/DeepSeek-V4.1-Flash",
  "Qwen/Qwen3.5-9B",
  "openai/gpt-oss-120b",
]).filter((m, i, a) => m && a.indexOf(m) === i);
const RUNS = 2;

// ---------- 25 onglets + bonne réponse (meeting : « Sync équipe VITALS », étudiant EPFL en plein hackathon) ----------
const SAMPLE = [
  ["youtube.com", "lofi hip hop radio - beats to relax", "?"], // musique de fond : discutable
  ["github.com", "trueMOOVE / pull request #42", "K"],
  ["google.com", "kotlin coroutines flow - Recherche Google", "?"],
  ["moodle.epfl.ch", "CS-233 Introduction to ML", "K"],
  ["reddit.com", "r/ProgrammerHumor", "C"],
  ["docs.google.com", "Pitch LauzHack - brouillon", "K"],
  ["stackoverflow.com", "How to close Chrome tab with AppleScript", "K"], // sert au hackathon
  ["amazon.ch", "Casque Sony WH-1000XM6", "C"],
  ["arxiv.org", "Interpretable medical imaging survey", "K"], // sert à VITALS
  ["youtube.com", "Top 10 des buts de la semaine", "C"],
  ["huggingface.co", "Qwen model card", "K"],
  ["google.com", "météo lausanne - Recherche Google", "C"],
  ["ctftime.org", "Upcoming CTF events", "K"],
  ["netflix.com", "Reprendre la lecture", "C"],
  ["notion.so", "VITALS - notes de réunion", "K"], // directement lié au meeting
  ["mediaspace.epfl.ch", "Cours Analyse I - semaine 9", "K"],
  ["sbb.ch", "Horaire Lausanne - Genève", "?"],
  ["google.com", "electron tray icon macos - Recherche Google", "?"],
  ["linkedin.com", "Fil d'actualité", "C"],
  ["github.com", "electron-vite docs", "K"],
  ["youtube.com", "Electron tutorial in 100 seconds", "K"], // YouTube mais du travail : le piège
  ["instagram.com", "Instagram", "C"],
  ["chat.openai.com", "ChatGPT", "K"],
  ["kotlinlang.org", "Coroutines guide", "K"],
  ["news.ycombinator.com", "Hacker News", "C"],
];
const lines = SAMPLE.map(([s, t], i) => `${i} | ${s} | ${t}`).join("\n");

// ---------- Même prompt que l'app ----------
const schema = {
  type: "object",
  properties: { close: { type: "array", items: { type: "object", properties: { i: { type: "integer" }, reason: { type: "string" } }, required: ["i", "reason"] } } },
  required: ["close"],
};
const systemApp =
  "Tu es l'agent Preflight, un assistant IT. Le navigateur de l'utilisateur est surchargé avant son prochain bloc de travail. " +
  "Renvoie UNIQUEMENT les onglets à fermer, dans « close ». Ne cite pas ceux à garder. Réponds directement, sans réfléchir longuement. " +
  "Garde tout ce qui peut servir pour le prochain bloc ou les autres blocs du jour, ce qui ressemble à un travail en cours " +
  "(mail, document, formulaire, panier), ce que l'utilisateur garde toujours, et dans le doute garde. " +
  "Pour un développeur ou un étudiant, les pages techniques sont du travail : questions Stack Overflow, documentation, assistants IA (ChatGPT, Claude), tutoriels vidéo de programmation. " +
  "Ferme ce qui est clairement sans rapport : divertissement, achats, réseaux sociaux, pages de résultats de recherche non techniques, doublons. " +
  "reason : 8 mots maximum, en français, concrète (ex. « vidéo sans rapport avec la revue budget »).";
const system = `${systemApp}\n\nRéponds uniquement en JSON valide qui suit ce schéma :\n${JSON.stringify(schema)}`;
const user = JSON.stringify({
  utilisateur: env.USER_CONTEXT || "Étudiant en informatique à l'EPFL",
  prochain_bloc: { titre: "Sync équipe VITALS", debut: "10:00", apps: ["Teams", "Notion"] },
  autres_blocs_du_jour: ["14:00 Hackathon LauzHack : app Electron", "16:00 Exercices CS-233"],
  onglets: `numéro | site | titre\n${lines}`,
});

const noThinking = (m) =>
  /gpt-oss/i.test(m) ? { reasoning_effort: "low" } : { reasoning: { enabled: false }, chat_template_kwargs: { enable_thinking: false, thinking: false } };

async function call(model) {
  const started = Date.now();
  const body = {
    model, temperature: 0.2, max_tokens: 1200, ...noThinking(model),
    messages: [{ role: "system", content: system }, { role: "user", content: user }],
    response_format: { type: "json_schema", json_schema: { name: "tab_triage", schema } },
  };
  try {
    let res = await post(body);
    if (!res.ok) {
      const text = await res.text();
      if (res.status === 400 && /reasoning|chat_template|thinking/i.test(text)) {
        delete body.reasoning; delete body.chat_template_kwargs; delete body.reasoning_effort;
        res = await post(body);
        if (!res.ok) return { ms: Date.now() - started, err: `HTTP ${res.status}` };
      } else return { ms: Date.now() - started, err: `HTTP ${res.status} ${text.slice(0, 60).replace(/\s+/g, " ")}` };
    }
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content ?? "";
    const parsed = JSON.parse(content.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/```(?:json)?/g, "").trim());
    const closed = new Set((parsed.close ?? []).map((c) => c.i).filter((i) => Number.isInteger(i) && i >= 0 && i < SAMPLE.length));
    return { ms: Date.now() - started, closed };
  } catch (e) {
    return { ms: Date.now() - started, err: e.name === "TimeoutError" ? "délai > 40 s" : `réponse invalide (${String(e.message).slice(0, 40)})` };
  }
}
const post = (body) =>
  fetch("https://api.together.ai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(40_000),
  });

// ---------- Score ----------
const shouldKeep = SAMPLE.map((s, i) => (s[2] === "K" ? i : -1)).filter((i) => i >= 0);
const shouldClose = SAMPLE.map((s, i) => (s[2] === "C" ? i : -1)).filter((i) => i >= 0);
const label = (i) => `${SAMPLE[i][0]} « ${SAMPLE[i][1].slice(0, 28)} »`;

console.log(`25 onglets : ${shouldKeep.length} à garder, ${shouldClose.length} à fermer, ${SAMPLE.length - shouldKeep.length - shouldClose.length} discutables (non comptés). ${RUNS} essais par modèle.\n`);
const summary = [];
for (const model of MODELS) {
  console.log(`■ ${model}`);
  let graveTotal = 0, missTotal = 0, msTotal = 0, okRuns = 0;
  for (let r = 1; r <= RUNS; r++) {
    const res = await call(model);
    if (res.err) {
      console.log(`  essai ${r} : ERREUR ${res.err} (${(res.ms / 1000).toFixed(1)} s)`);
      continue;
    }
    const grave = shouldKeep.filter((i) => res.closed.has(i));
    const miss = shouldClose.filter((i) => !res.closed.has(i));
    graveTotal += grave.length; missTotal += miss.length; msTotal += res.ms; okRuns++;
    console.log(`  essai ${r} : ${(res.ms / 1000).toFixed(1)} s · erreurs graves ${grave.length}/${shouldKeep.length} · oublis ${miss.length}/${shouldClose.length}`);
    if (grave.length) console.log(`    ✗ a fermé du travail : ${grave.map(label).join(", ")}`);
    if (miss.length) console.log(`    · a gardé : ${miss.map(label).join(", ")}`);
  }
  if (okRuns) summary.push({ model, grave: graveTotal / okRuns, miss: missTotal / okRuns, s: msTotal / okRuns / 1000, runs: okRuns });
  console.log("");
}

// Classement : d'abord le moins d'erreurs graves, puis le moins d'oublis, puis le plus rapide.
summary.sort((a, b) => a.grave - b.grave || a.miss - b.miss || a.s - b.s);
console.log("CLASSEMENT (moyenne par essai)");
console.log("modèle                               graves   oublis   temps");
for (const r of summary)
  console.log(`${r.model.padEnd(36)} ${r.grave.toFixed(1).padStart(6)}   ${r.miss.toFixed(1).padStart(6)}   ${r.s.toFixed(1).padStart(4)} s`);
const best = summary[0];
if (best) console.log(`\n→ Meilleur : ${best.model}. Mets dans .env : TOGETHER_MODEL=${best.model}`);
console.log("  Une erreur grave = un onglet de travail fermé. Dans l'app, les garde-fous et la case à décocher rattrapent une partie, mais un bon modèle doit être proche de 0.");
