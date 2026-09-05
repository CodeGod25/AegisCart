import { catalog, merchantPolicy } from "./catalog";
import { FAILURES } from "../services/failureTaxonomy";

// Offer / mandate lifetimes mirrored here for the manifest. Kept as plain numbers
// so the manifest module has no runtime dependency on the services it describes.
const OFFER_TTL_MINUTES = 10;
const MANDATE_DEFAULT_TTL_HOURS = 24;

/**
 * The agent-readable manifest served at GET /.well-known/agent.
 *
 * This is the machine-facing contract: it tells an autonomous AI buyer how to
 * discover the catalog, negotiate a price, obtain a signed offer, transact
 * within a signed spend mandate, and read the audit trail — and it states, up
 * front, the guarantees that make every money action explainable, bounded and
 * gated. It is intentionally verbose: it doubles as the interop story for the
 * global agentic-commerce protocol race (ACP, AP2, x402, NPCI UAP).
 */
export function buildAgentManifest() {
  return {
    spec: "aegiscart-agent-manifest",
    version: "1.0",
    generatedAt: new Date().toISOString(),

    merchant: {
      id: "merchant-aegis-demo",
      name: "Aegis Demo Store",
      description:
        "A Razorpay-powered merchant that is transactable end-to-end by an autonomous AI buyer, with every money action explainable, bounded and gated.",
      merchantOfRecord: "Aegis Demo Store",
      paymentServiceProvider: "Razorpay",
      paymentRail: "razorpay-test-mode",
      currency: "INR",
      testMode: true,
    },

    // How AegisCart positions itself against the emerging agentic-commerce
    // protocols. We do not claim wire-level conformance; we implement the same
    // primitives (signed price binding, signed spend mandates, delegated
    // checkout, per-action reason codes) so bridging to any of these is small.
    interop: {
      summary:
        "AegisCart implements the primitives shared across the agentic-commerce protocol race: a signed, tamper-evident price binding (offer), a signed spend envelope (mandate), delegated checkout, and per-action reason codes. This makes the merchant portable across ACP, AP2, x402 and NPCI UAP rather than locked to one.",
      protocols: [
        {
          name: "ACP — Agentic Commerce Protocol",
          origin: "OpenAI + Stripe",
          status: "compatible-pattern",
          notes:
            "Delegated checkout: an AI buyer discovers the catalog, negotiates, then pays against a signed offer via POST /checkout/pay. The merchant stays merchant of record and Razorpay is the PSP — the same division of responsibility ACP formalises.",
        },
        {
          name: "AP2 — Agent Payments Protocol",
          origin: "Google",
          status: "implemented-analog",
          notes:
            "Our Spend Mandate is an AP2-style mandate: an immutable, cryptographically signed budget envelope (buyer, per-order cap, total cap, allowed categories, expiry). Our signed Offer is the Cart-Mandate analog — a tamper-evident price the buyer agreed to, verified again at checkout.",
        },
        {
          name: "x402",
          origin: "Coinbase",
          status: "implemented-analog",
          notes:
            "A real HTTP 402 challenge/settle loop is live at POST /x402/checkout. An unpaid request returns 402 with machine-readable payment requirements (a signed, policy-bounded offer); the buyer retries with an X-PAYMENT header and receives the resource plus an X-PAYMENT-RESPONSE settlement. The 402 front door reuses the same offer, idempotency and ledger primitives as cart checkout, so it adds no new money math.",
        },
        {
          name: "NPCI UAP — UPI agentic layer",
          origin: "NPCI (India)",
          status: "bridge-ready",
          notes:
            "The mandate math is rail-agnostic. The same signed envelope that gates a Razorpay payment here can gate a UPI AutoPay / agentic mandate. Razorpay test mode stands in for the live UPI rail in this demo.",
        },
      ],
    },

    // The promises an AI buyer can rely on. These map directly to the hackathon
    // bar: every money action explainable, bounded and gated, plus graceful
    // failure handling.
    guarantees: {
      everyMoneyActionIs: [
        "explainable — each action writes a reason code and a human-readable line to the ledger",
        "bounded — a deterministic policy engine enforces discount cap, margin floor, quantity and stock limits",
        "gated — risky or high-value actions are held for explicit human approval before any payable offer exists",
        "idempotent — checkout uses reserve-then-finalize keys, so a retry never double-charges",
        "tamper-evident — offers and mandates are HMAC-SHA256 signed and re-verified before money moves",
      ],
      deterministicMoneyLLMLanguage:
        "All money math — pricing, discount bounds, margin floor, signatures, mandate debits, idempotency — is deterministic code. The LLM only handles language (intent parsing, explanations, upsell phrasing). The LLM never decides a number that touches money.",
      auditTrail:
        "GET /ledger returns an append-only, human-readable log of every action, each carrying an explainability string and its structured payload.",
      failureHandling:
        "Payment declines, gateway timeouts, invalid signatures, insufficient stock and exhausted or revoked mandates each return a stable reason code and a documented fallback rather than a generic error.",
    },

    // The deterministic bounds the policy engine enforces on every negotiation.
    policyEnvelope: {
      maxDiscountPct: merchantPolicy.maxDiscountPct,
      minMarginPct: merchantPolicy.minMarginPct,
      maxUnitsPerOrder: merchantPolicy.maxUnitsPerOrder,
      blockedSkus: merchantPolicy.blockedSkus,
      requiresApprovalAtRiskScore: merchantPolicy.approvalRiskThreshold,
      highValueApprovalPaise: merchantPolicy.highValueApprovalPaise,
      note: "Discounts beyond the cap are clamped, not honoured; an order that breaks the margin floor, quantity or stock limit is rejected outright with a reason code.",
    },

    // AP2-style signed spend mandate: how an autonomous buyer gets a budget it
    // can transact within without a human in the loop for each purchase.
    mandates: {
      supported: true,
      model: "AP2-style signed spend mandate",
      signature:
        "HMAC-SHA256 over the immutable envelope (buyer, caps, allowed categories, window). Mutable spend and status are deliberately excluded so a legitimate debit never invalidates the signature.",
      defaultTtlHours: MANDATE_DEFAULT_TTL_HOURS,
      envelopeFields: [
        "buyer",
        "maxTotalPaise",
        "maxPerOrderPaise",
        "allowedCategories",
        "currency",
        "createdAt",
        "expiresAt",
      ],
      checkedAt: [
        "negotiation — an order outside the envelope is refused before an offer is minted",
        "checkout — the envelope is re-validated at payment time, then debited only after the payment succeeds",
      ],
      create: "POST /mandates",
      inspect: "GET /mandates/:id",
      killSwitch: "POST /mandates/:id/revoke — a human can stop the buyer agent immediately",
    },

    // Signed, TTL-bound price binding between negotiation and checkout.
    offers: {
      model: "signed, TTL-bound price quote (Cart-Mandate analog)",
      ttlMinutes: OFFER_TTL_MINUTES,
      signature:
        "HMAC-SHA256 binding offerId, sku, quantity, unit price, total, discount, mandate and expiry. The client cannot alter the agreed price between quote and payment.",
      inspect: "GET /offers/:offerId",
      validatedAtCheckout: true,
      singleUse: "an offer is consumed on a successful payment and cannot be replayed",
    },

    // Revenue-growth tooling — the Track-01 goal. All of it is deterministic:
    // pricing is a function of the catalog and the discount-cap / margin-floor
    // policy, and the metrics are reconstructed purely from the ledger.
    revenue: {
      goal: "Grow merchant revenue without ever breaching the discount cap or margin floor.",
      bestOffer:
        "GET /revenue/best-offer computes the deepest whole-percent discount that stays within the discount cap AND at or above the margin floor — the strongest incentive that is still safe to make.",
      crossSell:
        "GET /revenue/recommendations returns complementary and upgrade SKUs to raise basket value.",
      bundle:
        "POST /revenue/bundle prices a multi-item basket at a blended, margin-safe discount.",
      metrics:
        "GET /metrics reports revenue, gross margin, discount given, average order value and funnel conversion — every figure derived from the immutable ledger, so it can never drift from the audit trail.",
    },

    // The full API surface an AI buyer needs, in the order it would use them.
    endpoints: [
      { method: "GET", path: "/.well-known/agent", purpose: "This manifest — capabilities, guarantees and interop." },
      { method: "GET", path: "/catalog/items", purpose: "Product feed: SKUs, prices, stock, categories, upsell links." },
      { method: "GET", path: "/catalog/capabilities", purpose: "Short capability card (policy envelope summary)." },
      { method: "POST", path: "/mandates", purpose: "Create a signed spend mandate for an autonomous buyer." },
      { method: "GET", path: "/mandates/:id", purpose: "Inspect a mandate and its remaining budget." },
      { method: "POST", path: "/mandates/:id/revoke", purpose: "Human kill-switch: revoke a mandate immediately." },
      { method: "POST", path: "/negotiate", purpose: "Negotiate price/quantity (optionally under a mandate). Returns a signed offer, or a pending approval for risky/high-value orders." },
      { method: "GET", path: "/offers/:offerId", purpose: "Inspect a signed offer before paying." },
      { method: "POST", path: "/checkout/pay", purpose: "Pay against a signed offer. Supports an Idempotency-Key header or field." },
      { method: "POST", path: "/x402/checkout", purpose: "x402 handshake: unpaid -> 402 with payment requirements; retry with an X-PAYMENT header to settle against the signed offer and unlock the resource." },
      { method: "POST", path: "/checkout/verify", purpose: "Verify a Razorpay payment signature." },
      { method: "POST", path: "/agent/message", purpose: "Converse with the merchant's sales agent in natural language; it returns a reply plus the structured, deterministic result." },
      { method: "GET", path: "/agent/history", purpose: "Replay a conversation by sessionId." },
      { method: "GET", path: "/agent/info", purpose: "Whether a live LLM is configured or the agent is on its deterministic floor." },
      { method: "POST", path: "/buyer/run", purpose: "Run the autonomous buyer-agent demo (A2A): discovery → mandate → negotiate/adapt → signed offer → decline+recover → human-approval escalation. Reasoning is streamed into the ledger." },
      { method: "GET", path: "/buyer/info", purpose: "Describe the autonomous buyer agent and what its mission exercises." },
      { method: "GET", path: "/revenue/recommendations", purpose: "Deterministic cross-sell/upsell recommendations for a SKU." },
      { method: "GET", path: "/revenue/best-offer", purpose: "The deepest policy-safe discount for a SKU (margin-floor aware)." },
      { method: "POST", path: "/revenue/bundle", purpose: "Price a multi-item bundle at a blended, margin-safe discount." },
      { method: "GET", path: "/metrics", purpose: "Revenue, margin and conversion metrics reconstructed from the ledger." },
      { method: "GET", path: "/approvals", purpose: "The human approval queue (optionally filtered by status)." },
      { method: "POST", path: "/approvals/:id/approve", purpose: "Human approves a held negotiation; mints the signed offer." },
      { method: "POST", path: "/approvals/:id/reject", purpose: "Human rejects a held negotiation." },
      { method: "GET", path: "/ledger", purpose: "Append-only audit trail of every money action with explainability." },
      { method: "POST", path: "/simulate/*", purpose: "Inject controlled failures (declines, timeouts) to demo graceful recovery." },
    ],

    // Stable reason codes an agent can branch on, grouped by the gate that emits
    // them. These are the exact strings returned in responses and the ledger.
    reasonCodes: {
      policy: [
        "SKU_BLOCKED_BY_POLICY",
        "INVALID_QUANTITY",
        "QUANTITY_EXCEEDS_LIMIT",
        "INSUFFICIENT_STOCK",
        "DISCOUNT_CAPPED_TO_POLICY",
        "MARGIN_BELOW_POLICY_FLOOR",
        "REQUIRES_HUMAN_APPROVAL",
        "HIGH_VALUE_ORDER",
      ],
      offer: [
        "OFFER_VALID",
        "OFFER_NOT_FOUND",
        "OFFER_EXPIRED",
        "OFFER_ALREADY_CONSUMED",
        "OFFER_REJECTED",
        "OFFER_SIGNATURE_INVALID",
        "OFFER_AMOUNT_MISMATCH",
      ],
      mandate: [
        "MANDATE_VALID",
        "MANDATE_NOT_FOUND",
        "MANDATE_SIGNATURE_INVALID",
        "MANDATE_EXPIRED",
        "MANDATE_REVOKED",
        "MANDATE_EXHAUSTED",
        "MANDATE_CATEGORY_NOT_ALLOWED",
        "MANDATE_PER_ORDER_EXCEEDED",
        "MANDATE_BUDGET_EXCEEDED",
      ],
    },

    catalogSummary: catalog.map((item) => ({
      sku: item.sku,
      name: item.name,
      category: item.category,
      priceInPaise: item.priceInPaise,
      currency: item.currency,
      inStock: item.stock > 0,
    })),

    // Every failure mode an AI buyer might hit, with its recovery path, so the
    // agent can plan retries deterministically instead of guessing.
    failureModes: Object.values(FAILURES),

    contact: {
      humanApprovalQueue: "/approvals",
      auditTrail: "/ledger",
      decisionMaker: "merchant-console",
    },
  };
}
