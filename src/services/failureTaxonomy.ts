// Central failure taxonomy. Every failure the system can produce is defined once,
// here, with a stable code, an HTTP status, whether a retry is safe, a one-line
// explanation for the ledger, and the concrete recovery path we offer the caller.
// This is what turns "one failure handled gracefully" into a documented contract
// rather than an ad-hoc catch block.

export type FailureCode =
  | "PAYMENT_DECLINED"
  | "GATEWAY_TIMEOUT"
  | "INSUFFICIENT_STOCK"
  | "WEBHOOK_SIGNATURE_INVALID"
  | "LLM_UNAVAILABLE";

// The subset a caller can inject at the payment step to exercise recovery.
export type PaymentFailureCode = Extract<
  FailureCode,
  "PAYMENT_DECLINED" | "GATEWAY_TIMEOUT" | "INSUFFICIENT_STOCK"
>;

export type FailureCategory = "payment" | "inventory" | "security" | "ai";

export interface FailureSpec {
  code: FailureCode;
  httpStatus: number;
  category: FailureCategory;
  // Is retrying the same operation safe/sensible? Drives the idempotency-release
  // decision at checkout and the guidance we return to the caller.
  retriable: boolean;
  explanation: string;
  fallback: string;
}

export const FAILURES: Record<FailureCode, FailureSpec> = {
  PAYMENT_DECLINED: {
    code: "PAYMENT_DECLINED",
    httpStatus: 402,
    category: "payment",
    retriable: true,
    explanation: "The payment was declined by the gateway.",
    fallback:
      "The signed offer stays valid. Retry with a fresh Idempotency-Key or try an alternate method before the offer expires.",
  },
  GATEWAY_TIMEOUT: {
    code: "GATEWAY_TIMEOUT",
    httpStatus: 504,
    category: "payment",
    retriable: true,
    explanation: "The payment gateway did not respond in time; the outcome is unknown.",
    fallback:
      "Retry with the SAME Idempotency-Key. Reserve-then-finalize guarantees the retry cannot double-charge if the first attempt actually went through.",
  },
  INSUFFICIENT_STOCK: {
    code: "INSUFFICIENT_STOCK",
    httpStatus: 409,
    category: "inventory",
    retriable: false,
    explanation: "Stock for this SKU changed between quote and payment.",
    fallback:
      "Re-negotiate at the available quantity to obtain a fresh signed offer; the stale offer will not be honoured.",
  },
  WEBHOOK_SIGNATURE_INVALID: {
    code: "WEBHOOK_SIGNATURE_INVALID",
    httpStatus: 400,
    category: "security",
    retriable: false,
    explanation: "An inbound webhook failed HMAC signature verification.",
    fallback:
      "The event is rejected without mutating any session or money state. Verify the webhook signing secret and resend.",
  },
  LLM_UNAVAILABLE: {
    code: "LLM_UNAVAILABLE",
    httpStatus: 200,
    category: "ai",
    retriable: true,
    explanation: "The language model was unavailable or timed out.",
    fallback:
      "Served a deterministic fallback explanation. The money flow is unaffected because the LLM never decides amounts — it only phrases language.",
  },
};

// Build a uniform, caller-facing failure body from a code (plus any extra fields).
export function failureBody(
  code: FailureCode,
  extra: Record<string, unknown> = {}
): Record<string, unknown> {
  const spec = FAILURES[code];
  return {
    ok: false,
    error: code,
    reason: spec.explanation,
    retriable: spec.retriable,
    fallback: spec.fallback,
    ...extra,
  };
}
