import axios from "axios";
import { env } from "../../config/env";
import { LlmClient, LlmRequest } from "./types";

// Anthropic Messages API client. Language-only: never used to decide a money value.
export class AnthropicClient implements LlmClient {
  readonly provider = "anthropic";
  readonly model = env.LLM_MODEL;
  private readonly baseUrl = env.LLM_BASE_URL ?? "https://api.anthropic.com/v1";

  async complete(req: LlmRequest): Promise<string> {
    // Anthropic has no response_format flag; we instruct JSON in the system prompt.
    const system = req.json
      ? `${req.system}\n\nRespond with a single valid JSON object and nothing else.`
      : req.system;

    const res = await axios.post(
      `${this.baseUrl}/messages`,
      {
        model: this.model,
        max_tokens: req.maxTokens ?? 500,
        temperature: req.temperature ?? 0.2,
        system,
        messages: [{ role: "user", content: req.user }],
      },
      {
        headers: {
          "x-api-key": env.LLM_API_KEY ?? "",
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        timeout: env.LLM_TIMEOUT_MS,
      }
    );

    const blocks = res.data?.content;
    const text = Array.isArray(blocks)
      ? blocks.map((b: { text?: string }) => (typeof b?.text === "string" ? b.text : "")).join("")
      : "";
    if (text.trim().length === 0) {
      throw new Error("LLM_EMPTY_RESPONSE");
    }
    return text;
  }
}
