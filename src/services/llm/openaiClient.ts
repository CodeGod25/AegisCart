import axios from "axios";
import { env } from "../../config/env";
import { LlmClient, LlmRequest } from "./types";

// OpenAI-compatible Chat Completions client. Works with OpenAI and any compatible
// gateway (set LLM_BASE_URL). Language-only: never used to decide a money value.
export class OpenAiClient implements LlmClient {
  readonly provider = "openai";
  readonly model = env.LLM_MODEL;
  private readonly baseUrl = env.LLM_BASE_URL ?? "https://api.openai.com/v1";

  async complete(req: LlmRequest): Promise<string> {
    const res = await axios.post(
      `${this.baseUrl}/chat/completions`,
      {
        model: this.model,
        messages: [
          { role: "system", content: req.system },
          { role: "user", content: req.user },
        ],
        temperature: req.temperature ?? 0.2,
        max_tokens: req.maxTokens ?? 500,
        ...(req.json ? { response_format: { type: "json_object" } } : {}),
      },
      {
        headers: {
          Authorization: `Bearer ${env.LLM_API_KEY ?? ""}`,
          "Content-Type": "application/json",
        },
        timeout: env.LLM_TIMEOUT_MS,
      }
    );

    const content = res.data?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.trim().length === 0) {
      throw new Error("LLM_EMPTY_RESPONSE");
    }
    return content;
  }
}
