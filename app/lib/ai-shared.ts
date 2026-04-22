import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

export function anthropic(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

export function hasApiKey(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

export function handleAnthropicError(err: unknown): Response {
  console.error("AI error:", err);
  if (err instanceof Anthropic.AuthenticationError) {
    return Response.json({ error: "Clé API Anthropic invalide ou manquante" }, { status: 401 });
  }
  if (err instanceof Anthropic.RateLimitError) {
    return Response.json({ error: "Trop de requêtes, réessaie dans quelques secondes" }, { status: 429 });
  }
  if (err instanceof Anthropic.APIError) {
    return Response.json({ error: `Erreur API (${err.status}) : ${err.message}` }, { status: 502 });
  }
  return Response.json({ error: "Erreur inconnue" }, { status: 500 });
}

export const CLASSIFY_MODEL = "claude-haiku-4-5" as const;
export const CHAT_MODEL = "claude-sonnet-4-6" as const;
