/**
 * Appels au LLM (Together AI, API compatible OpenAI) avec une sortie JSON contrainte par un schéma.
 * Règle du projet : le LLM PROPOSE (un plan en JSON), le code vérifie et exécute. Jamais l'inverse.
 */
import type { LlmPingResult } from "../shared/types";

const ENDPOINT = "https://api.together.ai/v1/chat/completions";

export const model = () => process.env.TOGETHER_MODEL || "zai-org/GLM-5.1";
export const hasKey = () => Boolean(process.env.TOGETHER_API_KEY);

export interface ChatJsonOptions {
  system: string;
  user: string;
  schemaName: string;
  schema: Record<string, unknown>;
  timeoutMs?: number;
}

/** Envoie un prompt et renvoie l'objet JSON parsé. Lève une erreur en cas de timeout ou de JSON invalide. */
export async function chatJSON<T>({ system, user, schemaName, schema, timeoutMs = 15_000 }: ChatJsonOptions): Promise<T> {
  if (!hasKey()) throw new Error("TOGETHER_API_KEY manquante dans .env");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      signal: controller.signal,
      headers: { Authorization: `Bearer ${process.env.TOGETHER_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: model(),
        temperature: 0.2,
        messages: [
          // La doc Together conseille de redonner le schéma dans le prompt en plus de response_format.
          { role: "system", content: `${system}\n\nRéponds uniquement en JSON valide qui suit ce schéma :\n${JSON.stringify(schema)}` },
          { role: "user", content: user },
        ],
        response_format: { type: "json_schema", json_schema: { name: schemaName, schema } },
      }),
    });
    if (!res.ok) throw new Error(`Together ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = body.choices?.[0]?.message?.content ?? "";
    // Certains modèles entourent quand même le JSON de ```json … ``` ou d'un bloc <think>.
    const cleaned = content.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/```(?:json)?/g, "").trim();
    return JSON.parse(cleaned) as T;
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
