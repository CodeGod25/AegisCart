// Minimal, provider-agnostic LLM contract. The rest of the app depends only on
// this interface, never on a specific vendor SDK, so providers are swappable and
// the whole thing degrades to deterministic behaviour when no model is configured.

export interface LlmRequest {
  system: string;
  user: string;
  // Ask the provider for a strict JSON object (used for intent extraction).
  json?: boolean;
  temperature?: number;
  maxTokens?: number;
}

export interface LlmClient {
  readonly provider: string;
  readonly model: string;
  complete(req: LlmRequest): Promise<string>;
}
