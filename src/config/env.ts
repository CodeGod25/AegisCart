import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  RAZORPAY_API_BASE: z.string().default("https://api.razorpay.com/v1"),
  SQLITE_DB_PATH: z.string().default("data/aegiscart.db"),
  // Secret used to HMAC-sign offers and mandates so the policy-bounded price
  // and spend envelope cannot be tampered with between negotiation and checkout.
  AEGIS_SIGNING_SECRET: z.string().default("dev-aegis-signing-secret-change-me"),
  // LLM adapter. Provider "mock" needs no key and keeps the demo fully offline.
  // Set LLM_PROVIDER=openai (OpenAI-compatible) or anthropic + LLM_API_KEY to use a real model.
  LLM_PROVIDER: z.enum(["mock", "openai", "anthropic"]).default("mock"),
  LLM_API_KEY: z.string().optional(),
  LLM_MODEL: z.string().default("gpt-4o-mini"),
  LLM_BASE_URL: z.string().optional(),
  LLM_TIMEOUT_MS: z.coerce.number().default(15000),
  // Logging
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  APP_VERSION: z.string().default("1.0.0"),
});

export const env = envSchema.parse(process.env);