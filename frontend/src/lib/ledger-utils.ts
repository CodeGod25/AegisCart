// Define the shape of a ledger event payload (based on the backend)
// We'll keep it as unknown for now, but we can refine if needed.

// Reason codes sets (mirroring the backend app.js)
const RC_OK = new Set([
  "OFFER_VALID",
  "PAYMENT_SUCCEEDED",
  "MANDATE_VALID",
  "APPROVAL_GRANTED",
]);
const RC_WARN = new Set([
  "REQUIRES_HUMAN_APPROVAL",
  "HIGH_VALUE_ORDER",
  "DISCOUNT_CAPPED_TO_POLICY",
  "ESCALATED",
  "LLM_UNAVAILABLE",
  "LLM_UNAVAILABLE_SIMULATED",
  "UNEXPECTED",
]);
const RC_BAD = new Set([
  "PAYMENT_DECLINED",
  "PAYMENT_FAILED",
  "OFFER_REJECTED",
  "MANDATE_REJECTED",
  "MANDATE_REVOKED",
  "MANDATE_EXHAUSTED",
  "MANDATE_EXPIRED",
  "OFFER_EXPIRED",
  "OFFER_SIGNATURE_INVALID",
  "OFFER_AMOUNT_MISMATCH",
  "INSUFFICIENT_STOCK",
  "WEBHOOK_SIGNATURE_INVALID",
  "MANDATE_SIGNATURE_INVALID",
  "APPROVAL_REJECTED",
  "GATEWAY_TIMEOUT",
  "MARGIN_BELOW_POLICY_FLOOR",
  "POLICY_REJECTED",
  "MANDATE_PER_ORDER_EXCEEDED",
  "MANDATE_BUDGET_EXCEEDED",
  "MANDATE_CATEGORY_NOT_ALLOWED",
  "SKU_BLOCKED_BY_POLICY",
  "QUANTITY_EXCEEDS_LIMIT",
  "INVALID_QUANTITY",
  "SKU_NOT_FOUND",
]);

function rcClass(code: string): "" | "ok" | "warn" | "bad" {
  if (!code) return "";
  if (RC_OK.has(code)) return "ok";
  if (RC_WARN.has(code)) return "warn";
  if (RC_BAD.has(code)) return "bad";
  return "";
}

// Define the shape of a turn for actor colors (from agent.ts)
const ATYPE_OK = new Set([
  "OFFER_MINTED",
  "PAYMENT_SUCCEEDED",
  "MANDATE_CREATED",
  "APPROVAL_GRANTED",
  "MANDATE_DEBITED",
  "PAYMENT_VERIFIED",
  "OFFER_CONSUMED",
]);
const ATYPE_WARN = new Set([
  "APPROVAL_REQUESTED",
  "UPSELL_SUGGESTED",
  "ESCALATED",
  "FAILURE_INJECTED",
]);
const ATYPE_BAD = new Set([
  "PAYMENT_FAILED",
  "OFFER_REJECTED",
  "MANDATE_REJECTED",
  "APPROVAL_REJECTED",
]);

function atypeColor(actionType: string): string {
  if (ATYPE_OK.has(actionType)) return "var(--ok)";
  if (ATYPE_WARN.has(actionType)) return "var(--warn)";
  if (ATYPE_BAD.has(actionType)) return "var(--bad)";
  return "var(--paper)";
}

// Chip component for reason codes
export function chip(code: string): string {
  if (!code) return "";
  const cls = rcClass(code);
  return cls ? `<span class="rc ${cls}">${code}</span>` : `<span class="rc">${code}</span>`;
}

// Helper to extract reason codes from an event
interface LedgerEventLike {
  actionType?: string;
  payload?: Record<string, unknown>;
}

export function reasonChipsFor(event: LedgerEventLike): string {
  const p = event && event.payload && typeof event.payload === "object" ? event.payload : {};
  const codes: string[] = [];
  const cand = [p.reason, p.failureCode, p.reasonCode, p.code, p.error];
  cand.forEach((c) => {
    if (typeof c === "string" && c && codes.indexOf(c) === -1) codes.push(c);
  });
  return codes.map(chip).join("");
}

// Helper to generate seal for an event
export function sealFor(event: LedgerEventLike): string {
  const t = event.actionType;
  const p = event.payload && typeof event.payload === "object" ? event.payload : {};
  if ((t === "OFFER_MINTED" || t === "OFFER_CONSUMED") && typeof p.offerId === "string") {
    // We don't have shortId in the frontend yet, but we can use the full id or a substring
    // For now, we'll use the first 8 characters of the offerId
    const shortId = p.offerId.length > 8 ? p.offerId.substring(0, 8) + "…" : p.offerId;
    return `<span class="seal">offer ${shortId}</span>`;
  }
  if (t === "MANDATE_CREATED" && typeof p.mandateId === "string") {
    const shortId = p.mandateId.length > 8 ? p.mandateId.substring(0, 8) + "…" : p.mandateId;
    return `<span class="seal buyer-seal">mandate ${shortId}</span>`;
  }
  if (t === "MANDATE_DEBITED" && typeof p.amountInPaise === "number") {
    // We don't have the INR formatter here, but we can import it or just show the number
    // For now, we'll show the amount in paise as a fallback
    return `<span class="seal buyer-seal">debit ${p.amountInPaise}paise</span>`;
  }
  return "";
}

// We'll also need a function to format INR, but we already have it in format.ts
// We'll import it where needed.

// Export the atypeColor for use in components
export { atypeColor };