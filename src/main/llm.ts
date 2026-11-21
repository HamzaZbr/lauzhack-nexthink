/**
 * Appels au LLM (Together AI, API compatible OpenAI) avec une sortie JSON contrainte par un schéma.
 * Règle du projet : le LLM PROPOSE (un plan en JSON), le code vérifie et exécute. Jamais l'inverse.
 */
import type { LlmPingResult } from "../shared/types";

const ENDPOINT = "https://api.together.ai/v1/chat/completions";

export const model = () => process.env.TOGETHER_MODEL || "zai-org/GLM-5.2";
export const hasKey = () => Boolean(process.env.TOGETHER_API_KEY);

export interface ChatJsonOptions {
  system: string;
  user: string;
  schemaName: string;
  schema: Record<string, unknown>;
  timeoutMs?: number;
  /** Longueur max de la réponse (sinon Together coupe parfois le JSON). */
  maxTokens?: number;
  /** Modèle à utiliser pour cet appel (sinon TOGETHER_MODEL). */
  model?: string;
}

/** Envoie un prompt et renvoie l'objet JSON parsé. Lève une erreur en cas de timeout ou de JSON invalide. */
/** Options pour couper la réflexion, selon la famille du modèle (doc Together « Reasoning »). */
export function noThinking(modelId: string): Record<string, unknown> {
  if (process.env.LLM_REASONING === "1") return {};
  if (/gpt-oss/i.test(modelId)) return { reasoning_effort: "low" }; // ne peut pas être coupée, seulement réduite
  return { reasoning: { enabled: false }, chat_template_kwargs: { enable_thinking: false, thinking: false } };
}

export async function chatJSON<T>({ system, user, schemaName, schema, timeoutMs = 15_000, maxTokens = 2048, model: modelOverride }: ChatJsonOptions): Promise<T> {
  const modelId = modelOverride || model();
  if (!hasKey()) throw new Error("TOGETHER_API_KEY manquante dans .env");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const body: Record<string, unknown> = {
      model: modelId,
      temperature: 0.2,
      max_tokens: maxTokens,
      // Les modèles « hybrides » (GLM, Qwen, Kimi…) réfléchissent par défaut avant de répondre, et cette réflexion
      // consomme max_tokens et du temps. On la coupe (LLM_REASONING=1 dans .env pour la garder).
      ...noThinking(modelId),
      messages: [
        // La doc Together conseille de redonner le schéma dans le prompt en plus de response_format.
        { role: "system", content: `${system}\n\nRéponds uniquement en JSON valide qui suit ce schéma :\n${JSON.stringify(schema)}` },
        { role: "user", content: user },
      ],
      response_format: { type: "json_schema", json_schema: { name: schemaName, schema } },
    };
    const post = () =>
      fetch(ENDPOINT, {
        method: "POST",
        signal: controller.signal,
        headers: { Authorization: `Bearer ${process.env.TOGETHER_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

    let res = await post();
    if (!res.ok) {
      const text = await res.text();
      // Modèle qui refuse une des options de réflexion : on réessaie sans.
      if (res.status === 400 && /reasoning|chat_template|thinking/i.test(text) && ("reasoning" in body || "chat_template_kwargs" in body || "reasoning_effort" in body)) {
        delete body.reasoning;
        delete body.chat_template_kwargs;
        delete body.reasoning_effort;
        res = await post();
      } else if (text.includes("non-serverless")) {
        throw new Error(`Le modèle ${modelId} n'est pas « serverless » sur ta clé. Lance « npm run bench:llm » pour en choisir un.`);
      } else {
        throw new Error(`Together ${res.status}: ${text.slice(0, 300)}`);
      }
      if (!res.ok) throw new Error(`Together ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }

    type Choice = { message?: { content?: string; reasoning?: string; reasoning_content?: string }; finish_reason?: string };
    let data = (await res.json()) as { choices?: Choice[] };
    let choice = data.choices?.[0];

    // Réponse vide parce que la longueur a été mangée par la réflexion : un seul nouvel essai, avec 3× plus de place.
    if (!choice?.message?.content?.trim() && choice?.finish_reason === "length") {
      body.max_tokens = maxTokens * 3;
      res = await post();
      if (!res.ok) throw new Error(`Together ${res.status}: ${(await res.text()).slice(0, 300)}`);
      data = (await res.json()) as { choices?: Choice[] };
      choice = data.choices?.[0];
    }

    const content = choice?.message?.content ?? "";
    if (!content.trim()) {
      const thought = (choice?.message?.reasoning ?? choice?.message?.reasoning_content ?? "").length;
      throw new Error(
        `réponse vide (fin : ${choice?.finish_reason ?? "?"}${thought ? `, ${thought} caractères de réflexion` : ""}). Lance « npm run bench:llm » pour choisir un modèle.`,
      );
    }
    // Certains modèles entourent quand même le JSON de ```json … ``` ou d'un bloc <think>.
    const cleaned = content.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/```(?:json)?/g, "").trim();
    try {
      return JSON.parse(cleaned) as T;
    } catch {
      throw new Error(`Réponse JSON invalide ou coupée (${cleaned.length} caractères, fin : « ${cleaned.slice(-40)} »)`);
    }
  } catch (error) {
    const msg = (error as Error).name === "AbortError" ? `délai dépassé (${timeoutMs / 1000} s)` : String((error as Error).message ?? error);
    console.error(`[llm] ${schemaName} (${modelId}) : ${msg}`);
    throw new Error(msg);
  } finally {
    clearTimeout(timer);
  }
}

/** Test de bout en bout : vérifie la clé, le modèle et le mode JSON. */
export async function ping(): Promise<LlmPingResult> {
  const started = Date.now();
  try {
    const data = await chatJSON<{ ok: boolean; message: string }>({
      system: "Tu es l'agent Preflight, un assistant IT sur le poste de l'employé.",
      user: "Dis bonjour en une phrase courte en français et mets ok à true.",
      schemaName: "ping",
      schema: {
        type: "object",
        properties: { ok: { type: "boolean" }, message: { type: "string" } },
        required: ["ok", "message"],
      },
    });
    return { ok: data.ok === true, model: model(), latencyMs: Date.now() - started, message: data.message };
  } catch (error) {
    return { ok: false, model: model(), latencyMs: Date.now() - started, error: String((error as Error).message ?? error) };
  }
}
