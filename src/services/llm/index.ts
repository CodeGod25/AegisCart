import { env } from "../../config/env";
import { simulationService } from "../simulationService";
import { AnthropicClient } from "./anthropicClient";
import { OpenAiClient } from "./openaiClient";
import { LlmClient, LlmRequest } from "./types";

let cached: LlmClient | null | undefined;

// Returns the configured client, or null when running offline (LLM_PROVIDER=mock,
// or a real provider selected without an API key). Null is not an error: callers
// fall back to deterministic language, so the app is fully functional with no LLM.
export function getLlmClient(): LlmClient | null {
  if (cached !== undefined) {
    return cached;
  }
  if (env.LLM_PROVIDER === "openai" && env.LLM_API_KEY) {
    cached = new OpenAiClient();
  } else if (env.LLM_PROVIDER === "anthropic" && env.LLM_API_KEY) {
    cached = new AnthropicClient();
  } else {
    cached = null;
  }
  return cached;
}

export interface LlmOutcome {
  ok: boolean;
  text: string;
  provider: string;
  model: string;
  // True whenever the caller should use its deterministic fallback instead of `text`.
  fallback: boolean;
  reason?: string;
  // Latency in milliseconds for the LLM call (if applicable).
  latencyMs?: number;
}

// Single choke point for every LLM call. Guarantees graceful degradation: if no
// client is configured, an outage is simulated, or the provider errors/times out,
// it returns ok:false with a reason and the caller uses its deterministic path.
export async function runLlm(req: LlmRequest): Promise<LlmOutcome> {
  const client = getLlmClient();
  if (!client) {
    const outcome = {
      ok: false,
      text: "",
      provider: env.LLM_PROVIDER,
      model: env.LLM_MODEL,
      fallback: true,
      reason: "LLM_NOT_CONFIGURED",
    };
    // Debug logging removed for production - uncomment if needed for troubleshooting
    // console.debug(`[LLM] Outcome: ${JSON.stringify({ ok: outcome.ok, provider: outcome.provider, model: outcome.model, fallback: outcome.fallback, reason: outcome.reason })}`);
    return outcome;
  }
  if (simulationService.isLlmUnavailable()) {
    const outcome = {
      ok: false,
      text: "",
      provider: client.provider,
      model: client.model,
      fallback: true,
      reason: "LLM_UNAVAILABLE_SIMULATED",
    };
    // Debug logging removed for production - uncomment if needed for troubleshooting
    // console.debug(`[LLM] Outcome: ${JSON.stringify({ ok: outcome.ok, provider: outcome.provider, model: outcome.model, fallback: outcome.fallback, reason: outcome.reason })}`);
    return outcome;
  }
  const startTime = Date.now();
  try {
    const text = await client.complete(req);
    const latencyMs = Date.now() - startTime;
    const outcome = { ok: true, text, provider: client.provider, model: client.model, fallback: false, latencyMs };
    // Debug logging removed for production - uncomment if needed for troubleshooting
    // console.debug(`[LLM] Outcome: ${JSON.stringify({ ok: outcome.ok, provider: outcome.provider, model: outcome.model, fallback: outcome.fallback, latencyMs: outcome.latencyMs })}`);
    return outcome;
  } catch (err) {
    const latencyMs = Date.now() - startTime;
    const outcome = {
      ok: false,
      text: "",
      provider: client.provider,
      model: client.model,
      fallback: true,
      reason: err instanceof Error ? err.message : "LLM_ERROR",
      latencyMs,
    };
    // Debug logging removed for production - uncomment if needed for troubleshooting
    // console.debug(`[LLM] Outcome: ${JSON.stringify({ ok: outcome.ok, provider: outcome.provider, model: outcome.model, fallback: outcome.fallback, reason: outcome.reason, latencyMs: outcome.latencyMs })}`);
    return outcome;
  }
}

export function llmInfo(): { provider: string; model: string; configured: boolean } {
  return { provider: env.LLM_PROVIDER, model: env.LLM_MODEL, configured: !!getLlmClient() };
}

// Test/hot-reload hook: forget the memoized client so a config change is re-read.
export function resetLlmClientCache(): void {
  cached = undefined;
}
