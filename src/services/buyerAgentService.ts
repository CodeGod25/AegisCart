import { v4 as uuidv4 } from "uuid";
import { buildAgentManifest } from "../data/agentManifest";
import { catalog } from "../data/catalog";
import { runCheckout } from "./checkoutService";
import { ledgerService } from "./ledgerService";
import { negotiate } from "./negotiationService";
import { mandateService } from "./mandateService";
import { simulationService } from "./simulationService";

// Buyer agent state tracking for the console interface
let buyerAgentState: {
  isRunning: boolean;
  currentTask: string;
  runId: string | null;
} = {
  isRunning: false,
  currentTask: "Idle",
  runId: null,
};

// State management functions
export function getBuyerAgentState() {
  return { ...buyerAgentState }; // Return a copy to prevent external modification
}

export function setBuyerAgentState(updates: Partial<typeof buyerAgentState>) {
  buyerAgentState = { ...buyerAgentState, ...updates };
}

export function stopBuyerAgent() {
  if (!buyerAgentState.isRunning) return false;
  buyerAgentState = { ...buyerAgentState, isRunning: false, currentTask: "Stop requested" };
  return true;
}

// ---------------------------------------------------------------------------
// Autonomous buyer agent — the A2A ("agent-to-agent") demo.
//
// This is the *counterparty* to the merchant. Where the merchant's agent sells,
// this agent BUYS on behalf of a human, bounded by a signed spend mandate. It
// runs a full, deterministic procurement mission against the merchant's own
// services and narrates every decision into the shared ledger, so the audit
// trail reads as a conversation between two agents.
//
// It deliberately exercises the four things the brief asks an agentic-commerce
// build to prove:
//   1. discovery      — reads /.well-known/agent + /catalog before transacting
//   2. adaptation     — opens above policy, then adapts to the merchant's counter
//   3. bounded + gated — transacts only inside its signed mandate, and when the
//                        merchant escalates to a human it refuses to bypass the gate
//   4. failure recovery — survives one injected payment decline and retries
//
// Crucially, the buyer's *decisions* here are deterministic rules (adapt to the
// counter, retry a retriable failure, defer to a human on approval). No LLM is
// in this loop: an autonomous spender must be predictable, not creative.
// ---------------------------------------------------------------------------

type Speaker = "buyer" | "merchant" | "human";

export interface TranscriptEntry {
  seq: number;
  ts: string;
  from: Speaker;
  phase: string;
  text: string;
  reasonCode?: string;
  data?: Record<string, unknown>;
}

export interface BuyerRunResult {
  runId: string;
  startedAt: string;
  finishedAt: string;
  buyer: string;
  mandate: {
    mandateId: string;
    maxTotalPaise: number;
    maxPerOrderPaise: number;
    allowedCategories: string[];
    currency: string;
  };
  transcript: TranscriptEntry[];
  outcome: {
    purchases: number;
    unitsBought: number;
    totalSpentPaise: number;
    mandateRemainingPaise: number;
    mandateStatus: string;
    paymentsRecovered: number;
    escalatedApprovals: string[];
    offersConsumed: string[];
  };
  summary: string;
}

// Structural view of negotiate()'s wide return union. negotiate() infers a union
// of five shapes that TypeScript cannot narrow by a non-literal `status`, so we
// widen once at this boundary (the same `as unknown as` pattern the approvals
// route uses for a stored proposedAction). The runtime object genuinely carries
// these optional fields.
interface NegotiateQuote {
  sku: string;
  name: string;
  quantity: number;
  unitPriceInPaise: number;
  totalPriceInPaise: number;
  discountPctApplied: number;
  currency: string;
  offerId?: string;
}

interface NegotiateOutcome {
  ok: boolean;
  status: number;
  message?: string;
  reason?: string;
  offer?: { offerId: string; signature: string; expiresAt: string };
  quote?: NegotiateQuote;
  counterOffer?: { maxDiscountPct: number; maxQuantity: number };
  counterfactual?: string;
  requiresApproval?: boolean;
  approval?: { approvalId: string; status: string; reasons: string[]; riskScore: number };
  decision?: {
    allowed: boolean;
    effectiveDiscountPct: number;
    reasons: string[];
    riskScore: number;
    requiresApproval: boolean;
  };
}

// --- Scenario knobs (deterministic mission) --------------------------------
const BUYER_ID = "nova-procurement-agent";
const PRIMARY_SKU = "MS-ERG-PLUS"; // peripherals; cheap enough that qty fits the per-order cap
const MANDATE_MAX_TOTAL_PAISE = 5_000_000; // ₹50,000 signed budget
const MANDATE_MAX_PER_ORDER_PAISE = 1_500_000; // ₹15,000 per order
const MANDATE_CATEGORIES = ["peripherals"];

const OPENING_QTY = 8; // above the per-order unit limit on purpose
const OPENING_DISCOUNT = 20; // above the discount cap on purpose
const GREEDY_DISCOUNT = 25; // the deeper deal that should trip the human-approval gate

// Indian-format rupee string from paise, dependency-free and deterministic.
function formatInr(paise: number): string {
  const [intPart, decPart] = (paise / 100).toFixed(2).split(".");
  const whole = intPart ?? "0";
  const lastThree = whole.slice(-3);
  const rest = whole.slice(0, -3);
  const grouped = rest
    ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${lastThree}`
    : lastThree;
  return `₹${grouped}.${decPart ?? "00"}`;
}

function asNumber(v: unknown): number | undefined {
  return typeof v === "number" ? v : undefined;
}
function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

/**
 * Run the autonomous buyer-agent mission end to end and return the full,
 * structured transcript. Every step is also appended to the shared ledger, so
 * the merchant console's live audit trail shows the two agents interleaved.
 */
export async function runBuyerAgentDemo(): Promise<BuyerRunResult> {
  // Check if already running
  if (buyerAgentState.isRunning) {
    throw new Error("Buyer agent is already running");
  }

  // Set state to running
  setBuyerAgentState({
    isRunning: true,
    currentTask: "Starting mission...",
    runId: `run_${uuidv4()}`
  });

  const runId = buyerAgentState.runId!;
  const startedAt = new Date().toISOString();

  try {
  const transcript: TranscriptEntry[] = [];
  let seq = 0;
  function say(
    from: Speaker,
    phase: string,
    text: string,
    opts?: { reasonCode?: string; data?: Record<string, unknown> }
  ): void {
    // Update current task based on phase
    setBuyerAgentState({ currentTask: phase });

    seq += 1;
    const entry: TranscriptEntry = { seq, ts: new Date().toISOString(), from, phase, text };
    if (opts?.reasonCode) {
      entry.reasonCode = opts.reasonCode;
    }
    if (opts?.data) {
      entry.data = opts.data;
    }
    transcript.push(entry);
  }
  async function buyerLedger(
    actionType: "AGENT_MESSAGE" | "ESCALATED",
    explainability: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    await ledgerService.add({ actor: "buyer_agent", actionType, explainability, payload });
  }

  const outcome = {
    purchases: 0,
    unitsBought: 0,
    totalSpentPaise: 0,
    mandateRemainingPaise: 0,
    mandateStatus: "ACTIVE",
    paymentsRecovered: 0,
    escalatedApprovals: [] as string[],
    offersConsumed: [] as string[],
  };

  // --- 1. Discovery -------------------------------------------------------
  const manifest = buildAgentManifest();
  const mandatesSupported = manifest.mandates.supported;
  const skuCount = manifest.catalogSummary.length;
  const primary = catalog.find((c) => c.sku === PRIMARY_SKU);
  const primaryName = primary?.name ?? PRIMARY_SKU;

  say(
    "buyer",
    "DISCOVER",
    `Read GET /.well-known/agent and GET /catalog/items. The merchant exposes signed offers, ${mandatesSupported ? "signed spend mandates" : "no mandates"}, and per-action reason codes — it is transactable end-to-end. ${skuCount} SKUs in the feed.`,
    { data: { mandatesSupported, skuCount, guarantees: manifest.guarantees.everyMoneyActionIs } }
  );
  await buyerLedger(
    "AGENT_MESSAGE",
    `Buyer agent ${BUYER_ID} discovered the merchant via its manifest: signed offers + spend mandates + reason codes present, so the merchant is safe to transact with autonomously.`,
    { runId, skuCount, mandatesSupported }
  );

  // --- 2. Mandate (human pre-authorization) -------------------------------
  const mandate = await mandateService.create({
    buyer: BUYER_ID,
    maxTotalPaise: MANDATE_MAX_TOTAL_PAISE,
    maxPerOrderPaise: MANDATE_MAX_PER_ORDER_PAISE,
    allowedCategories: MANDATE_CATEGORIES,
  });
  say(
    "human",
    "MANDATE",
    `Human signs a spend mandate for the agent: up to ${formatInr(MANDATE_MAX_TOTAL_PAISE)} total, ${formatInr(MANDATE_MAX_PER_ORDER_PAISE)} per order, categories [${MANDATE_CATEGORIES.join(", ")}]. The agent may now buy without a human in the loop for each purchase.`,
    { data: { mandateId: mandate.mandateId, signature: mandate.signature.slice(0, 16) + "…" } }
  );
  say(
    "buyer",
    "MANDATE",
    `Bound to mandate ${mandate.mandateId}. I will keep every order inside this signed envelope.`,
    { data: { mandateId: mandate.mandateId } }
  );

  // --- 3. Opening offer, deliberately above policy → merchant counters ----
  say(
    "buyer",
    "NEGOTIATE",
    `Opening ambitiously to probe the bounds: ${OPENING_QTY} × ${primaryName} at ${OPENING_DISCOUNT}% off.`,
    { data: { sku: PRIMARY_SKU, quantity: OPENING_QTY, requestedDiscountPct: OPENING_DISCOUNT } }
  );

  const opening = (await negotiate({
    sku: PRIMARY_SKU,
    quantity: OPENING_QTY,
    requestedDiscountPct: OPENING_DISCOUNT,
    mandateId: mandate.mandateId,
  })) as unknown as NegotiateOutcome;

  // Default adaptation targets; overridden by the merchant's counter if present.
  let adaptQty = OPENING_QTY;
  let adaptDiscount = OPENING_DISCOUNT;

  if (opening.status === 422 && opening.counterOffer) {
    const co = opening.counterOffer;
    say(
      "merchant",
      "COUNTER",
      `Rejected within policy: max ${co.maxQuantity} units per order, discount capped at ${co.maxDiscountPct}%. ${opening.counterfactual ?? ""}`.trim(),
      { reasonCode: opening.message ?? "POLICY_REJECTED", data: { counterOffer: co, reasons: opening.decision?.reasons } }
    );
    adaptQty = Math.min(OPENING_QTY, co.maxQuantity);
    adaptDiscount = Math.min(OPENING_DISCOUNT, co.maxDiscountPct);
    say(
      "buyer",
      "ADAPT",
      `Understood. Adapting to the merchant's stated bounds: ${adaptQty} units at ${adaptDiscount}% off.`,
      { data: { quantity: adaptQty, requestedDiscountPct: adaptDiscount } }
    );
    await buyerLedger(
      "AGENT_MESSAGE",
      `Buyer adapted to merchant counter-offer: reduced to ${adaptQty} units and ${adaptDiscount}% discount to fit policy, rather than abandoning the purchase.`,
      { runId, from: { quantity: OPENING_QTY, discount: OPENING_DISCOUNT }, to: { quantity: adaptQty, discount: adaptDiscount } }
    );
  } else {
    // Unexpected: proceed with a known-safe order rather than looping.
    say(
      "merchant",
      "COUNTER",
      `Responded with status ${opening.status}. Falling back to a policy-safe order.`,
      { reasonCode: opening.message ?? "UNEXPECTED", data: { status: opening.status } }
    );
    adaptQty = 5;
    adaptDiscount = 15;
  }

  // --- 4. Adapted negotiation → signed offer ------------------------------
  const adapted = (await negotiate({
    sku: PRIMARY_SKU,
    quantity: adaptQty,
    requestedDiscountPct: adaptDiscount,
    mandateId: mandate.mandateId,
  })) as unknown as NegotiateOutcome;

  const offerId = adapted.offer?.offerId ?? adapted.quote?.offerId;

  if (adapted.status === 200 && offerId && adapted.quote) {
    const q = adapted.quote;
    say(
      "merchant",
      "OFFER",
      `Signed offer ${offerId} minted: ${q.quantity} × ${q.name} at ${q.discountPctApplied}% off = ${formatInr(q.totalPriceInPaise)}. Tamper-evident, expires in 10 minutes.`,
      { reasonCode: "OFFER_VALID", data: { offerId, totalPriceInPaise: q.totalPriceInPaise, expiresAt: adapted.offer?.expiresAt } }
    );
    say(
      "buyer",
      "OFFER",
      `Offer accepted. ${formatInr(q.totalPriceInPaise)} is within my ${formatInr(MANDATE_MAX_PER_ORDER_PAISE)} per-order cap. Proceeding to pay.`,
      { data: { offerId } }
    );

    // --- 5. Pay, with one injected decline to prove recovery --------------
    simulationService.setFailNextPayment("PAYMENT_DECLINED");
    say(
      "buyer",
      "PAY",
      `Submitting payment against signed offer ${offerId}.`,
      { data: { offerId } }
    );

    const firstAttempt = await runCheckout({ offerId, receipt: `rcpt-${runId}-1` });
    const firstOk = firstAttempt.body.ok === true;

    if (!firstOk) {
      const errCode = asString(firstAttempt.body.error) ?? "PAYMENT_FAILED";
      const retriable = firstAttempt.body.retriable === true;
      say(
        "merchant",
        "DECLINE",
        `Payment ${errCode} (HTTP ${firstAttempt.status}). ${asString(firstAttempt.body.fallback) ?? ""}`.trim(),
        { reasonCode: errCode, data: { retriable, offerId } }
      );

      if (retriable) {
        await buyerLedger(
          "AGENT_MESSAGE",
          `Buyer received a retriable ${errCode}. The signed offer is still ACTIVE, so the agent retries once before the offer expires instead of failing the mission.`,
          { runId, offerId, failureCode: errCode }
        );
        say(
          "buyer",
          "RETRY",
          `That decline is retriable and my signed offer is still valid. Retrying the payment once.`,
          { reasonCode: errCode, data: { offerId } }
        );

        const retry = await runCheckout({ offerId, receipt: `rcpt-${runId}-2` });
        if (retry.body.ok === true) {
          const paid = asNumber(retry.body.amountInPaise) ?? q.totalPriceInPaise;
          const paymentId = asString(retry.body.paymentId) ?? "";
          outcome.purchases += 1;
          outcome.unitsBought += q.quantity;
          outcome.totalSpentPaise += paid;
          outcome.paymentsRecovered += 1;
          outcome.offersConsumed.push(offerId);
          say(
            "merchant",
            "PURCHASED",
            `Payment ${paymentId} succeeded for ${formatInr(paid)}. Offer consumed; mandate debited.`,
            { reasonCode: "PAYMENT_SUCCEEDED", data: { paymentId, amountInPaise: paid, offerId } }
          );
          say(
            "buyer",
            "PURCHASED",
            `Purchase complete on retry — recovered cleanly from the decline. Bought ${q.quantity} × ${q.name} for ${formatInr(paid)}.`,
            { data: { paymentId, amountInPaise: paid } }
          );
        } else {
          say(
            "merchant",
            "PURCHASED",
            `Retry did not succeed (HTTP ${retry.status}, ${asString(retry.body.error) ?? "unknown"}).`,
            { reasonCode: asString(retry.body.error) ?? "UNKNOWN", data: { status: retry.status } }
          );
        }
      }
    } else {
      // No decline fired (e.g., simulation state was cleared elsewhere): still a sale.
      const paid = asNumber(firstAttempt.body.amountInPaise) ?? q.totalPriceInPaise;
      const paymentId = asString(firstAttempt.body.paymentId) ?? "";
      outcome.purchases += 1;
      outcome.unitsBought += q.quantity;
      outcome.totalSpentPaise += paid;
      outcome.offersConsumed.push(offerId);
      say(
        "merchant",
        "PURCHASED",
        `Payment ${paymentId} succeeded for ${formatInr(paid)}. Offer consumed; mandate debited.`,
        { reasonCode: "PAYMENT_SUCCEEDED", data: { paymentId, amountInPaise: paid, offerId } }
      );
      say("buyer", "PURCHASED", `Purchase complete: ${formatInr(paid)}.`, { data: { paymentId } });
    }
  } else {
    say(
      "merchant",
      "OFFER",
      `Could not mint an offer for the adapted order (status ${adapted.status}${adapted.reason ? `, ${adapted.reason}` : ""}).`,
      { reasonCode: adapted.message ?? adapted.reason ?? "NO_OFFER", data: { status: adapted.status } }
    );
  }

  // --- 6. A deeper deal that trips the human-approval gate → escalate -----
  say(
    "buyer",
    "NEGOTIATE",
    `One more: I'll try for a deeper ${GREEDY_DISCOUNT}% off on ${adaptQty} × ${primaryName} to stretch the budget.`,
    { data: { sku: PRIMARY_SKU, quantity: adaptQty, requestedDiscountPct: GREEDY_DISCOUNT } }
  );

  const greedy = (await negotiate({
    sku: PRIMARY_SKU,
    quantity: adaptQty,
    requestedDiscountPct: GREEDY_DISCOUNT,
    mandateId: mandate.mandateId,
  })) as unknown as NegotiateOutcome;

  if (greedy.status === 202 && greedy.approval) {
    const ap = greedy.approval;
    say(
      "merchant",
      "APPROVAL_REQUIRED",
      `Held for human approval (${ap.approvalId}); risk score ${ap.riskScore}, reasons: ${ap.reasons.join(", ")}. No payable offer is minted until a human decides.`,
      { reasonCode: "REQUIRES_HUMAN_APPROVAL", data: { approvalId: ap.approvalId, riskScore: ap.riskScore, reasons: ap.reasons } }
    );
    outcome.escalatedApprovals.push(ap.approvalId);
    await buyerLedger(
      "ESCALATED",
      `Buyer hit the merchant's human-approval gate on a deep-discount order. Although the mandate authorizes the spend, the agent will NOT bypass the merchant's human-in-the-loop control. Escalating approval ${ap.approvalId} to the human and stopping.`,
      { runId, approvalId: ap.approvalId, riskScore: ap.riskScore }
    );
    say(
      "buyer",
      "ESCALATE",
      `My mandate would cover this, but the merchant requires a human to approve it. I will not try to route around that gate — escalating ${ap.approvalId} to my human and stopping here.`,
      { reasonCode: "REQUIRES_HUMAN_APPROVAL", data: { approvalId: ap.approvalId } }
    );
  } else if (greedy.status === 200 && greedy.offer) {
    // If policy ever auto-approves this, the buyer simply declines to over-buy.
    say(
      "merchant",
      "OFFER",
      `Offer available for the deeper discount (${greedy.offer.offerId}).`,
      { reasonCode: "OFFER_VALID", data: { offerId: greedy.offer.offerId } }
    );
    say(
      "buyer",
      "DONE",
      `I already met my need on the first order; I'll leave this offer unused rather than spend beyond the goal.`,
      { data: { offerId: greedy.offer.offerId } }
    );
  } else {
    say(
      "merchant",
      "APPROVAL_REQUIRED",
      `Responded with status ${greedy.status}${greedy.reason ? ` (${greedy.reason})` : ""}.`,
      { reasonCode: greedy.message ?? greedy.reason ?? "UNEXPECTED", data: { status: greedy.status } }
    );
  }

  // --- 7. Finalize --------------------------------------------------------
  const finalMandate = await mandateService.get(mandate.mandateId);
  outcome.mandateRemainingPaise = finalMandate
    ? Math.max(0, finalMandate.maxTotalPaise - finalMandate.spentPaise)
    : MANDATE_MAX_TOTAL_PAISE - outcome.totalSpentPaise;
  outcome.mandateStatus = finalMandate?.status ?? "ACTIVE";

  const finishedAt = new Date().toISOString();

  const summary =
    `Autonomous buyer agent "${BUYER_ID}" ran a full procurement mission under signed mandate ${mandate.mandateId}. ` +
    `It discovered the merchant from its manifest, opened at ${OPENING_QTY} units/${OPENING_DISCOUNT}% off, adapted to the merchant's counter (max ${adaptQty} units, ${adaptDiscount}% cap), ` +
    `secured a signed offer for ${outcome.unitsBought || adaptQty} × ${primaryName}` +
    (outcome.purchases > 0 ? `, recovered from an injected payment decline and paid ${formatInr(outcome.totalSpentPaise)} on retry` : `, but the payment did not complete`) +
    (outcome.escalatedApprovals.length > 0
      ? `, then refused to bypass the merchant's human-approval gate on a deeper ${GREEDY_DISCOUNT}%-off order and escalated it to a human`
      : ``) +
    `. Mandate remaining: ${formatInr(outcome.mandateRemainingPaise)} of ${formatInr(MANDATE_MAX_TOTAL_PAISE)} (${outcome.mandateStatus}).`;

  await buyerLedger("AGENT_MESSAGE", `Buyer mission complete. ${summary}`, {
    runId,
    purchases: outcome.purchases,
    totalSpentPaise: outcome.totalSpentPaise,
    escalatedApprovals: outcome.escalatedApprovals,
  });

  return {
    runId,
    startedAt,
    finishedAt,
    buyer: BUYER_ID,
    mandate: {
      mandateId: mandate.mandateId,
      maxTotalPaise: mandate.maxTotalPaise,
      maxPerOrderPaise: mandate.maxPerOrderPaise,
      allowedCategories: mandate.allowedCategories,
      currency: mandate.currency,
    },
    transcript,
    outcome,
    summary,
  };
} finally {
  // Reset state when done (whether success or error)
  setBuyerAgentState({
    isRunning: false,
    currentTask: "Mission completed",
    runId: null
  });
}

}

// Static description of what the demo exercises — handy for the console and for
// a judge poking at GET /buyer/info before hitting "Run".
export function describeBuyerAgent(): Record<string, unknown> {
  return {
    name: "AegisCart autonomous buyer agent",
    buyer: BUYER_ID,
    role: "Buys on behalf of a human, bounded by a signed spend mandate (the A2A counterparty to the merchant agent).",
    deterministic:
      "The buyer's decisions are rule-based, not LLM-driven: an autonomous spender must be predictable. The LLM is never in the money loop on either side.",
    mission: [
      "Discover the merchant via GET /.well-known/agent and GET /catalog/items.",
      "Operate under a human-signed spend mandate (category, per-order cap, total budget).",
      "Open above policy, then adapt to the merchant's counter-offer instead of abandoning.",
      "Take a signed, tamper-evident offer and pay against it.",
      "Survive one injected payment decline and recover on retry.",
      "When the merchant escalates a risky order to a human, defer to that gate rather than bypass it.",
    ],
    run: "POST /buyer/run",
    proves: ["discovery", "adaptation", "bounded+gated spend", "graceful failure recovery"],
  };
}
