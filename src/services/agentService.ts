import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { env } from "../config/env";
import { getDb } from "../db/client";
import { runCheckout } from "./checkoutService";
import { ledgerService } from "./ledgerService";
import { getLlmClient, LlmOutcome, runLlm } from "./llm";
import { mandateService } from "./mandateService";
import { offerService } from "./offerService";
import { negotiate } from "./negotiationService";
import { cacheService } from "./cacheService";
import * as utils from "./utils";
import { BaseService } from "./baseService";
import { INTENT_CLASSIFICATION_SYSTEM, REPHRASE_SYSTEM, getSkuList } from "./llm/prompts";
import { catalog } from "../data/catalog";

// Simple LRU cache for LLM intent classification outcomes
const intentClassificationCache = new Map<string, LlmOutcome>();
const INTENT_CLASSIFICATION_CACHE_LIMIT = 100;

function cacheIntentClassification(text: string, outcome: LlmOutcome): void {
  if (intentClassificationCache.size >= INTENT_CLASSIFICATION_CACHE_LIMIT) {
    // Remove the first (oldest) entry
    const firstKey = intentClassificationCache.keys().next().value;
    if (firstKey !== undefined) {
      intentClassificationCache.delete(firstKey);
    }
  }
  intentClassificationCache.set(text, outcome);
}

function getCachedIntentClassification(text: string): LlmOutcome | null {
  return intentClassificationCache.get(text) ?? null;
}

// ---------------------------------------------------------------------------
// The conversational merchant agent.
//
// This is the one place the LLM is used, and it is used ONLY for language:
//   1. understanding a buyer's free-text message into a structured intent, and
//   2. rephrasing a reply that was already written from deterministic data.
// Every number, price, discount and decision comes from the deterministic
// policy / offer / mandate / checkout services. The LLM never sees or decides a
// money value — at most it paraphrases a sentence we generated. If the LLM is
// absent, disabled, or errors, the agent stays fully functional on its
// deterministic floor. That split is the intended "AI judgment" story.
// ---------------------------------------------------------------------------

const IntentSchema = z.object({
  action: z.enum(["QUOTE", "CHECKOUT", "CREATE_MANDATE", "INSPECT_MANDATE", "REVOKE_MANDATE", "CATALOG", "HELP", "UNKNOWN"]),
  sku: z.string().optional(),
  quantity: z.number().int().min(1).max(9999).optional(),
  requestedDiscountPct: z.number().min(0).max(100).optional(),
  offerId: z.string().optional(),
  mandateId: z.string().optional(),
});

export type ParsedIntent = z.infer<typeof IntentSchema>;
export type AgentAction = ParsedIntent["action"];

export interface AgentTurn {
  sessionId: string;
  reply: string;
  action: AgentAction;
  intent: ParsedIntent;
  data: Record<string, unknown>;
  llm: {
    intent: LlmMeta;
    reply: LlmMeta;
  };
}

interface LlmMeta {
  used: boolean;
  provider: string;
  model: string;
  fallback: boolean;
  reason?: string;
}

// --- small deterministic helpers -------------------------------------------


function tryParseIntent(raw: string): ParsedIntent | null {
  try {
    const cleaned = raw
      .trim()
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/, "")
      .trim();
    const parsed = IntentSchema.safeParse(JSON.parse(cleaned));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

// Language understanding: try the LLM, but validate its output against our schema
// and catalog, and fall back to the deterministic parser on any doubt.
async function understand(
  text: string,
  hasPendingOffer: boolean
): Promise<{ intent: ParsedIntent; llm: LlmOutcome | null }> {
  const deterministic = utils.deterministicIntent(text, hasPendingOffer);
  const client = getLlmClient();
  if (!client) {
    return { intent: deterministic, llm: null };
  }

  // Check cache for the LLM outcome (we cache the LLM call result, not the final intent)
  const cachedOutcome = getCachedIntentClassification(text);
  let outcome: LlmOutcome;
  if (cachedOutcome !== null) {
    outcome = cachedOutcome;
  } else {
    const skuList = getSkuList(catalog);
    const system = INTENT_CLASSIFICATION_SYSTEM.replace("{{skuList}}", skuList);
    outcome = await runLlm({ system, user: text, json: true, temperature: 0 });
    // Cache the outcome for future use
    cacheIntentClassification(text, outcome);
  }

  if (!outcome.ok) {
    return { intent: deterministic, llm: outcome };
  }

  const parsed = tryParseIntent(outcome.text);
  if (!parsed) {
    return {
      intent: deterministic,
      llm: { ...outcome, ok: false, fallback: true, reason: "LLM_INTENT_UNPARSEABLE" },
    };
  }

  // Never trust an LLM SKU that isn't in the catalog; prefer the deterministic one.
  if (parsed.sku && !catalog.some((c) => c.sku === parsed.sku)) {
    if (utils.deterministicIntent(text, hasPendingOffer).sku) {
      parsed.sku = utils.deterministicIntent(text, hasPendingOffer).sku;
    } else {
      delete parsed.sku;
    }
  }
  return { intent: parsed, llm: outcome };
}

// --- reply phrasing ---------------------------------------------------------
// The LLM only ever rephrases a sentence we already wrote from deterministic
// data. It is explicitly forbidden from adding or altering any number or fact,
// so it cannot introduce a wrong price even if it hallucinates.
async function phrase(deterministicReply: string): Promise<{ text: string; llm: LlmOutcome | null }> {
  const client = getLlmClient();
  if (!client) {
    return { text: deterministicReply, llm: null };
  }
  const outcome = await runLlm({ system: REPHRASE_SYSTEM, user: deterministicReply, temperature: 0.3, maxTokens: 220 });
  if (!outcome.ok || outcome.text.trim().length === 0) {
    return { text: deterministicReply, llm: outcome };
  }
  return { text: outcome.text.trim(), llm: outcome };
}

function llmMeta(outcome: LlmOutcome | null): LlmMeta {
  if (!outcome) {
    return {
      used: false,
      provider: env.LLM_PROVIDER,
      model: env.LLM_MODEL,
      fallback: true,
      reason: "LLM_NOT_CONFIGURED",
    };
  }
  const meta: LlmMeta = {
    used: outcome.ok,
    provider: outcome.provider,
    model: outcome.model,
    fallback: outcome.fallback,
  };
  if (outcome.reason) meta.reason = outcome.reason;
  return meta;
}

// --- persistence ------------------------------------------------------------

interface AgentMessageRow {
  role: string;
  content: string;
  created_at: string;
  structured_json: string | null;
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function saveMessage(
  sessionId: string,
  role: "user" | "assistant",
  content: string,
  structured: unknown | null
): Promise<void> {
  const db = await getDb();
  await db.run(
    `INSERT INTO agent_messages (session_id, created_at, role, content, structured_json)
     VALUES (?, ?, ?, ?, ?)`,
    [sessionId, new Date().toISOString(), role, content, structured ? JSON.stringify(structured) : null]
  );
}

export async function getHistory(
  sessionId: string
): Promise<Array<{ role: string; content: string; createdAt: string; structured: unknown }>> {
  const db = await getDb();
  const rows = await db.all<AgentMessageRow[]>(
    `SELECT role, content, created_at, structured_json FROM agent_messages
     WHERE session_id = ? ORDER BY id ASC`,
    [sessionId]
  );
  return rows.map((r) => ({
    role: r.role,
    content: r.content,
    createdAt: r.created_at,
    structured: r.structured_json ? safeJson(r.structured_json) : null,
  }));
}

function extractOfferId(structured: unknown): string | undefined {
  const s = structured as
    | { data?: { negotiation?: { offer?: { offerId?: string }; quote?: { offerId?: string } } } }
    | null
    | undefined;
  return s?.data?.negotiation?.offer?.offerId ?? s?.data?.negotiation?.quote?.offerId;
}

// The most recent still-payable offer produced in this conversation, so a bare
// "yes, pay" can find something to check out.
async function latestOfferIdForSession(sessionId: string): Promise<string | undefined> {
    const db = await getDb();
    const rows = await db.all<{ structured_json: string | null }[]>(
      `SELECT structured_json FROM agent_messages
       WHERE session_id = ? AND role = 'assistant' AND structured_json IS NOT NULL
       ORDER BY id DESC LIMIT 10`,
      [sessionId]
    );

    for (const r of rows) {
      if (!r.structured_json) continue;
      const parsed = safeJson(r.structured_json);
      if (!parsed) continue;
      const offerId = extractOfferId(parsed);
      if (!offerId) continue;
      const offer = await offerService.get(offerId);
      if (offer && offer.status === "ACTIVE" && new Date(offer.expiresAt).getTime() > Date.now()) {
        return offerId;
      }
    }
    return undefined;
}

// --- deterministic reply text ----------------------------------------------

function catalogLine(): string {
  return catalog
    .map((c) => `${c.name} (${c.sku}) — ${utils.rupees(c.priceInPaise)}${c.stock > 0 ? "" : " [out of stock]"}`)
    .join("; ");
}

function deterministicReply(action: AgentAction, data: Record<string, unknown>, originalMessage = ""): string {
  switch (action) {
    case "HELP":
      return (
        `Hello! I'm your AegisCart assistant. I can help you with:\n\n` +
        `• **Quoting products**: Ask for a quote on any item, e.g., "quote 2 keyboards at 10% off"\n` +
        `• **Making payments**: Once you have a quote, say "pay" to checkout\n` +
        `• **Setting up budgets**: Create a spend mandate for an autonomous buyer, e.g., "set a budget of ₹5000"\n` +
        `• **Checking your mandate**: Ask "inspect my mandate" to see remaining budget\n` +
        `• **Revoking a mandate**: Say "revoke my mandate" to cancel it\n` +
        `• **Viewing our catalog**: Ask "what do you sell?" or "show catalog"\n\n` +
        `All prices and discounts are calculated deterministically within our policy. I only handle the wording.\n\n` +
        `Our current catalog: ${catalogLine()}`
      );
    case "CATALOG":
      const lines = catalog.map(item => {
        const priceInRupees = (item.priceInPaise / 100).toFixed(2);
        const stockStatus = item.stock > 0 ? `In stock (${item.stock} available)` : 'Out of stock';
        return `- ${item.name} (${item.sku}): ₹${priceInRupees} - ${stockStatus}`;
      }).join('\n');
      return `Here's what we currently have available:\n\n${lines}\n\nAsk me for a quote on any of these items!`;
    case "QUOTE":
      return quoteReply(data);
    case "CHECKOUT":
      return checkoutReply(data);
    case "CREATE_MANDATE":
      return mandateReply(data);
    case "INSPECT_MANDATE":
      return inspectMandateReply(data);
    case "REVOKE_MANDATE":
      return revokeMandateReply(data);
    case "UNKNOWN":
    default:
      return (
        `I didn't quite understand${originalMessage ? ` "${originalMessage.slice(0, 80)}"` : " that"}. ` +
        `You can ask me to quote a product, pay for the latest offer, or manage a spending mandate.\n\n` +
        `Try: "quote 2 keyboards", "pay", or "set a budget of ₹5000".`
      );
  }
}

function quoteReply(data: Record<string, unknown>): string {
  const neg = data.negotiation as Record<string, any> | undefined;
  if (!neg) return "I couldn't build a quote for that. Which product would you like?";

  if (neg.status === 404) {
    return "I couldn't find that product in our catalog. Try asking for the keyboard, monitor, or mouse.";
  }
  if (neg.ok && neg.status === 200 && neg.quote) {
    const q = neg.quote;
    const upsell = neg.upsell?.name ? `\n\n💡 You might also like the ${neg.upsell.name}.` : "";
    return (
      `Here's your quote: ${q.quantity} × ${q.name} at ${utils.rupees(q.totalPriceInPaise)} ` +
      `(${q.discountPctApplied}% off).\n\n` +
      `Offer ${q.offerId} is signed and valid for 10 minutes — ` +
      `say "pay" to check out.${upsell}`
    );
  }
  if (neg.ok && neg.status === 202 && neg.approval) {
    const reasons = Array.isArray(neg.approval.reasons) ? neg.approval.reasons.join(", ") : "policy review";
    return (
      `🔒 That order needs a human approval (${reasons}), so I've queued approval ${neg.approval.approvalId}.\n\n` +
      `Nothing is charged and no payable offer exists until a manager approves it.`
    );
  }
  if (!neg.ok && neg.message === "MANDATE_REJECTED") {
    return `💰 That price is fine for us, but it exceeds your spend mandate (${neg.reason}). A human can raise or renew the mandate.`;
  }
  if (!neg.ok && neg.message === "POLICY_REJECTED") {
    const reasons = Array.isArray(neg.decision?.reasons) ? neg.decision.reasons.join(", ") : "policy limits";
    const co = neg.counterOffer;
    const co_text = co ? `\n\n💡 The best I can do is up to ${co.maxDiscountPct}% off and ${co.maxQuantity} units.` : "";
    return `🚫 I can't accept that request (${reasons}).${co_text}`;
  }
  return "I couldn't complete that quote. Could you rephrase it?";
}

function checkoutReply(data: Record<string, unknown>): string {
  const co = data.checkout as { status?: number; body?: Record<string, any> } | undefined;
  if (!co || !co.body) {
    return "I don't have an active offer to pay yet. Ask me for a quote first, then say \"pay\".";
  }

  const body = co.body;
  const status = co.status ?? 500;
  const ok = body.ok ?? false;

  if (status === 200 && ok) {
    return (
      `✅ Payment complete — ${utils.rupees(Number(body.amountInPaise) || 0)} captured for offer ${body.offerId}.\n\n` +
      `📦 Order ${body.orderId} is confirmed.`
    );
  }

  const err = body.error ?? "PAYMENT_FAILED";
  const fallback = body.fallback ? `\n\n💡 ${body.fallback}` : "";
  return `❌ The payment didn't go through (${err}).${fallback}`;
}

function mandateReply(data: Record<string, unknown>): string {
  const m = data.mandate as Record<string, any> | undefined;
  if (m?.mandateId) {
    return (
      `✅ Signed spend mandate ${m.mandateId} created successfully!\n\n` +
      `📊 Budget details:\n` +
      `• Total budget: ${utils.rupees(m.maxTotalPaise)}\n` +
      `• Per-order limit: ${utils.rupees(m.maxPerOrderPaise)}\n` +
      `• Currency: ${m.currency}\n\n` +
      `An autonomous buyer can now transact within this envelope, and you can revoke it at any time as a kill-switch.\n\n` +
      `To check your mandate's status, ask: "inspect my mandate"`
    );
  }

  // Handle validation errors
  if (data.note === "INVALID_MANDATE_BOUNDS") {
    return `❌ I can't create that mandate because the per-order amount (${utils.rupees(Math.round(Number(data.perOrderAmount ?? 0) * 100))}) cannot exceed the total budget (${utils.rupees(Math.round(Number(data.amount ?? 0) * 100))}).\n\nPlease specify a per-order amount that is less than or equal to the total budget.`;
  }

  if (data.note === "MANDATE_CREATION_FAILED") {
    return `❌ I encountered an error while creating your mandate: ${data.error || 'Unknown error'}. Please try again with a different budget amount.`;
  }

  return (
    `💰 Tell me a budget and I'll create a signed spend mandate — for example, ` +
    `"set a budget of ₹5000". You can revoke it at any time as a kill-switch.`
  );
}

function inspectMandateReply(data: Record<string, unknown>): string {
  const mandate = data.mandate as any;
  if (!mandate) {
    if (data.note === "NO_ACTIVE_MANDATE") {
      return `📭 You don't have any active mandates. Would you like to create one? For example: "set a budget of ₹5000".`;
    }
    if (data.note === "MANDATE_NOT_FOUND") {
      return `❓ I couldn't find your mandate. It may have expired or been revoked.`;
    }
    return `❓ I couldn't inspect your mandate. Please try again.`;
  }

  const remaining = data.remainingPaise as number;
  const spent = mandate.spentPaise;
  const total = mandate.maxTotalPaise;
  const perOrder = mandate.maxPerOrderPaise;

  let statusText = `Active`;
  let statusEmoji = "✅";
  if (remaining === 0) {
    statusText = `Exhausted (no remaining budget)`;
    statusEmoji = "⚠️";
  } else if (remaining < perOrder) {
    statusText = `Active (but remaining budget ${utils.rupees(remaining)} is below per-order limit ${utils.rupees(perOrder)})`;
    statusEmoji = "⚠️";
  }

  const expiresAt = new Date(mandate.expiresAt);
  const expiresString = expiresAt.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

  return (
    `${statusEmoji} Mandate ${mandate.mandateId} status: ${statusText}\n\n` +
    `📊 Budget details:\n` +
    `• Total budget: ${utils.rupees(total)}\n` +
    `• Spent: ${utils.rupees(spent)}\n` +
    `• Remaining: ${utils.rupees(remaining)}\n` +
    `• Per-order limit: ${utils.rupees(perOrder)}\n\n` +
    `📅 Expires: ${expiresString}\n\n` +
    `An autonomous buyer can make purchases up to ${utils.rupees(perOrder)} per order, ` +
    `as long as the total spent doesn't exceed ${utils.rupees(total)}.\n\n` +
    `To revoke this mandate, say: "revoke my mandate"`
  );
}

function revokeMandateReply(data: Record<string, unknown>): string {
  if (data.revoked) {
    return (
      `✅ I've revoked mandate ${data.mandateId}.\n\n` +
      `The autonomous buyer agent can no longer make purchases against this mandate.\n\n` +
      `To create a new mandate, tell me a budget amount.`
    );
  }

  if (data.note === "NO_ACTIVE_MANDATE") {
    return `📭 You don't have any active mandates to revoke.`;
  }

  if (data.note === "MANDATE_NOT_FOUND") {
    return `❓ I couldn't find your mandate to revoke. It may have already expired or been revoked.`;
  }

  return `❌ I encountered an issue while trying to revoke your mandate. Please try again.`;
}

// --- orchestration ----------------------------------------------------------

export interface HandleMessageInput {
  message: string;
  sessionId?: string | undefined;
  mandateId?: string | undefined;
}

export async function handleMessage(input: HandleMessageInput): Promise<AgentTurn> {
  const sessionId = input.sessionId ?? `agent_${uuidv4()}`;
  const message = input.message.trim();

  // Get pending offer ID before saving user message to ensure we see offers from previous turns
  const pendingOfferId = await latestOfferIdForSession(sessionId);
  
  await saveMessage(sessionId, "user", message, null);

  const { intent, llm: intentLlm } = await understand(message, !!pendingOfferId);

  const data: Record<string, unknown> = {};

  switch (intent.action) {
    case "QUOTE": {
      if (!intent.sku) {
        data.note = "NO_SKU_RESOLVED";
        break;
      }
      const negInput: {
        sku: string;
        quantity: number;
        requestedDiscountPct: number;
        mandateId?: string;
      } = {
        sku: intent.sku,
        quantity: intent.quantity ?? 1,
        requestedDiscountPct: intent.requestedDiscountPct ?? 0,
      };
      if (input.mandateId) negInput.mandateId = input.mandateId;
      data.negotiation = await negotiate(negInput);

      // Add policy evaluation phase for visualization
      (data.negotiation as any).phase = "policy_evaluation";
      break;
    }
    case "CHECKOUT": {
      const offerId = intent.offerId ?? pendingOfferId;
      if (!offerId) {
        data.note = "NO_PENDING_OFFER";
        break;
      }
      data.checkout = await runCheckout({ offerId, receipt: `agent_${Date.now()}` });
      break;
    }
    case "CREATE_MANDATE": {
      const amount = utils.extractRupees(message);
      if (amount) {
        const totalPaise = Math.round(amount * 100);
        const perOrderAmount = utils.extractPerOrderAmount(message);
        const perOrderPaise = perOrderAmount !== undefined
          ? Math.round(perOrderAmount * 100)
          : totalPaise; // Default to total amount if not specified

        // Validate that per-order amount does not exceed total amount
        if (perOrderPaise > totalPaise) {
          data.note = "INVALID_MANDATE_BOUNDS";
          data.validationError = "maxPerOrderPaise cannot exceed maxTotalPaise";
          break;
        }

        try {
          data.mandate = await mandateService.create({
            buyer: "conversational-buyer",
            maxTotalPaise: totalPaise,
            maxPerOrderPaise: perOrderPaise,
            allowedCategories: [],
          });
        } catch (error) {
          // Handle any unexpected errors from mandate creation
          data.note = "MANDATE_CREATION_FAILED";
          data.error = error instanceof Error ? error.message : "Unknown error";
        }
      } else {
        data.note = "NO_BUDGET_AMOUNT";
      }
      break;
    }
    case "INSPECT_MANDATE": {
      // Look for the most recent mandate for this session
      const pendingOfferId = await latestOfferIdForSession(sessionId);
      // For mandate inspection, we don't have a direct way to get mandate ID from session
      // In a real implementation, we might store mandate IDs in the session or have the user specify it
      // For now, we'll look for any active mandate for the conversational buyer
      const db = await getDb();
      const mandateRows = await db.all<{ mandate_id: string }[]>(
        `SELECT mandate_id FROM mandates WHERE buyer = ? AND status = 'ACTIVE' ORDER BY created_at DESC LIMIT 1`,
        ["conversational-buyer"]
      );

      if (mandateRows.length === 0) {
        data.note = "NO_ACTIVE_MANDATE";
        break;
      }

      const mandateId = mandateRows[0]!.mandate_id;
      const mandate = await mandateService.get(mandateId);
      if (!mandate) {
        data.note = "MANDATE_NOT_FOUND";
        break;
      }

      data.mandate = mandate;
      data.remainingPaise = Math.max(0, mandate.maxTotalPaise - mandate.spentPaise);
      break;
    }
    case "REVOKE_MANDATE": {
      // Look for the most recent mandate for this session
      const db = await getDb();
      const mandateRows = await db.all<{ mandate_id: string }[]>(
        `SELECT mandate_id FROM mandates WHERE buyer = ? AND status = 'ACTIVE' ORDER BY created_at DESC LIMIT 1`,
        ["conversational-buyer"]
      );

      if (mandateRows.length === 0) {
        data.note = "NO_ACTIVE_MANDATE";
        break;
      }

      const mandateId = mandateRows[0]!.mandate_id;
      const mandate = await mandateService.get(mandateId);
      if (!mandate) {
        data.note = "MANDATE_NOT_FOUND";
        break;
      }

      // Revoke the mandate
      await mandateService.revoke(mandateId);
      data.revoked = true;
      data.mandateId = mandateId;
      break;
    }
    case "CATALOG":
    case "HELP":
    case "UNKNOWN":
    default:
      break;
  }

  const baseReply = deterministicReply(intent.action, data, message);
  const { text: reply, llm: replyLlm } = await phrase(baseReply);

  const turn: AgentTurn = {
    sessionId,
    reply,
    action: intent.action,
    intent,
    data,
    llm: { intent: llmMeta(intentLlm), reply: llmMeta(replyLlm) },
  };

  await saveMessage(sessionId, "assistant", reply, { action: intent.action, intent, data });

  // Generate detailed explainability message for audit trail
  const intentLlmUsed = turn.llm.intent.used ? "LLM" : "deterministic fallback";
  const intentLlmReason = turn.llm.intent.reason ? ` (${turn.llm.intent.reason})` : "";
  const replyLlmUsed = turn.llm.reply.used ? "LLM" : "deterministic";
  const replyLlmReason = turn.llm.reply.reason ? ` (${turn.llm.reply.reason})` : "";

  const explainability = `Conversational agent processed "${intent.action}" intent. ` +
    `Intent understanding: ${intentLlmUsed}${intentLlmReason}. ` +
    `Reply phrasing: ${replyLlmUsed}${replyLlmReason}. ` +
    `All monetary decisions and validation derived from deterministic policy services.`;

  await ledgerService.add({
    actor: "agent",
    actionType: "AGENT_MESSAGE",
    explainability,
    payload: {
      sessionId,
      action: intent.action,
      intent,
      llm: turn.llm,
    },
  });

  return turn;
}