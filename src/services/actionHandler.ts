import { z } from "zod";
import { env } from "../config/env";
import { catalog, merchantPolicy } from "../data/catalog";
import { getDb } from "../db/client";
import { runCheckout } from "./checkoutService";
import { ledgerService } from "./ledgerService";
import { getLlmClient, LlmOutcome, runLlm } from "./llm";
import { mandateService } from "./mandateService";
import { offerService } from "./offerService";
import { negotiate } from "./negotiationService";
import { cacheService } from "./cacheService";

// ---------------------------------------------------------------------------
// Agent Action Handler Interface
// ---------------------------------------------------------------------------

export interface AgentActionHandler {
  canHandle(action: string): boolean;
  handle(
    message: string,
    sessionId: string,
    intent: z.infer<typeof IntentSchema>,
    hasPendingOffer: boolean,
    mandateId?: string
  ): Promise<Record<string, unknown>>;
}

// ---------------------------------------------------------------------------
// Shared Utilities (moved from agentService for reuse)
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

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

function rupees(paise: number): string {
  return `₹${(paise / 100).toFixed(2)}`;
}

function clampPct(n: number): number {
  return Math.max(0, Math.min(100, n));
}

function tokens(s: string): string[] {
  const out: string[] = [];
  for (const raw of s.toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length < 2) continue;
    out.push(raw);
    // crude de-pluralization so "keyboards" matches "keyboard", "displays" -> "display"
    if (raw.length > 3 && raw.endsWith("s")) out.push(raw.slice(0, -1));
  }
  return out;
}

// Deterministic SKU resolver: scores catalog items by keyword overlap with the
// message (name words, sku tokens, category), with a strong boost for a direct
// SKU mention. Returns the best match, or undefined.
function matchSku(text: string): string | undefined {
  const words = new Set(tokens(text));
  const lower = text.toLowerCase();
  let best: { sku: string; score: number } | undefined;

  for (const item of catalog) {
    const keys = new Set<string>([
      ...tokens(item.sku),
      item.sku.toLowerCase(),
      ...tokens(item.name),
      ...tokens(item.category),
    ]);
    let score = 0;
    if (lower.includes(item.sku.toLowerCase())) score += 5;
    for (const k of keys) {
      if (words.has(k)) score += 1;
    }
    if (score > 0 && (!best || score > best.score)) {
      best = { sku: item.sku, score };
    }
  }
  return best?.sku;
}

function extractDiscountPct(text: string): number | undefined {
  const t = text.toLowerCase();
  const pctMatch = t.match(/(\d{1,3}(?:\.\d+)?)\s*(?:%|percent|per\s?cent)/);
  const pct = pctMatch?.[1];
  if (pct) return clampPct(Number(pct));
  const offMatch = t.match(/(\d{1,3}(?:\.\d+)?)\s*off\b/);
  const off = offMatch?.[1];
  if (off) return clampPct(Number(off));
  if (/\b(discount|deal|cheaper|lower price|better price|reduce|knock off)\b/.test(t)) {
    // A discount was requested but no figure given: try for the best allowed.
    return merchantPolicy.maxDiscountPct;
  }
  return undefined;
}

function extractQuantity(text: string): number | undefined {
  // Remove percentage / "X off" expressions first so we never read a discount as a quantity.
  let t = text.toLowerCase();
  t = t.replace(/(\d{1,3}(?:\.\d+)?)\s*(?:%|percent|per\s?cent)/g, " ");
  t = t.replace(/(\d{1,3}(?:\.\d+)?)\s*off\b/g, " ");

  const digits = t.match(/\b(\d{1,4})\b/)?.[1];
  if (digits) {
    return Math.max(1, Math.min(9999, parseInt(digits, 10)));
  }
  for (const [word, n] of Object.entries(NUMBER_WORDS)) {
    if (new RegExp(`\\b${word}\\b`).test(t)) return n;
  }
  return undefined;
}

function extractRupees(text: string): number | undefined {
  const patterns = [
    /(?:₹|rs\.?|inr)\s*([\d,]{2,})/i,
    /([\d,]{2,})\s*(?:rupees?|inr)\b/i,
    /budget[^\d]{0,12}([\d,]{2,})/i,
  ];
  for (const re of patterns) {
    const captured = text.match(re)?.[1];
    if (captured) {
      const n = Number(captured.replace(/,/g, ""));
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return undefined;
}

function extractPerOrderAmount(text: string): number | undefined {
  const t = text.toLowerCase();

  // Pattern 1: "X per order" or "X each"
  const perOrderMatch = t.match(/(\d{1,6}(?:[,.]\d+)?)\s*(?:per\s?order|each)\b/);
  if (perOrderMatch) {
    const amountStr = perOrderMatch[1];
    if (amountStr !== undefined) {
      const amount = Number(amountStr.replace(/,/g, ""));
      if (!isNaN(amount)) return amount;
    }
  }

  // Pattern 2: "per order: X" or "each: X"
  const perOrderColonMatch = t.match(/(?:per\s?order|each)\s*[:=]\s*(\d{1,6}(?:[,.]\d+)?)/);
  if (perOrderColonMatch) {
    const amountStr = perOrderColonMatch[1];
    if (amountStr !== undefined) {
      const amount = Number(amountStr.replace(/,/g, ""));
      if (!isNaN(amount)) return amount;
    }
  }

  // Pattern 3: "with X per order" or "and X per order"
  const withPerOrderMatch = t.match(/(?:with|and)\s+(\d{1,6}(?:[,.]\d+)?)\s*(?:per\s?order|each)\b/);
  if (withPerOrderMatch) {
    const amountStr = withPerOrderMatch[1];
    if (amountStr !== undefined) {
      const amount = Number(amountStr.replace(/,/g, ""));
      if (!isNaN(amount)) return amount;
    }
  }

  return undefined;
}

function detectAction(
  text: string,
  hasPendingOffer: boolean,
  sku: string | undefined
): AgentAction {
  const t = text.toLowerCase();
  if (/\b(mandate|budget|authori[sz]e|spend(?:ing)? limit)\b/.test(t)) {
    // Check for specific mandate actions
    if (/\b(check|inspect|show|view|status|remaining)\b.*\b(mandate|budget)\b/.test(t) ||
        /\b(mandate|budget)\b.*\b(check|inspect|show|view|status|remaining)\b/.test(t)) {
      return "INSPECT_MANDATE";
    }
    if (/\b(revoke|cancel|delete|remove|kill)\b.*\b(mandate|budget)\b/.test(t) ||
        /\b(mandate|budget)\b.*\b(revoke|cancel|delete|remove|kill)\b/.test(t)) {
      return "REVOKE_MANDATE";
    }
    return "CREATE_MANDATE";
  }
  if (
    /\b(pay|checkout|check out|place order|complete the (?:order|purchase)|proceed)\b/.test(t) ||
    (hasPendingOffer && /\b(yes|yep|yeah|do it|go ahead|sure|confirm|ok|okay)\b/.test(t))
  ) {
    return "CHECKOUT";
  }
  if (/\b(catalog|catalogue|products?|inventory|what do you (?:sell|have)|show me)\b/.test(t)) {
    return "CATALOG";
  }
  if (sku || /\b(buy|order|purchase|quote|price|cost|how much|discount|deal)\b/.test(t)) {
    return "QUOTE";
  }
  if (/\b(help|hi|hello|hey|what can you)\b/.test(t)) return "HELP";
  return "UNKNOWN";
}

function deterministicIntent(text: string, hasPendingOffer: boolean): ParsedIntent {
  const sku = matchSku(text);
  const requestedDiscountPct = extractDiscountPct(text);
  const quantity = extractQuantity(text);

  // Enhanced action detection with scoring and contextual awareness
  const action = detectActionEnhanced(text, hasPendingOffer, sku);

  const intent: ParsedIntent = { action };
  if (sku) intent.sku = sku;
  if (quantity !== undefined) intent.quantity = quantity;
  if (requestedDiscountPct !== undefined) intent.requestedDiscountPct = requestedDiscountPct;
  return intent;
}

// Enhanced action detection that uses scoring instead of first-match-wins
function detectActionEnhanced(
  text: string,
  hasPendingOffer: boolean,
  sku: string | undefined
): "QUOTE" | "CHECKOUT" | "CREATE_MANDATE" | "INSPECT_MANDATE" | "REVOKE_MANDATE" | "CATALOG" | "HELP" | "UNKNOWN" {
  const t = text.toLowerCase();

  // Define action patterns with weights and contextual modifiers
  const actionScores: Record<"QUOTE" | "CHECKOUT" | "CREATE_MANDATE" | "INSPECT_MANDATE" | "REVOKE_MANDATE" | "CATALOG" | "HELP" | "UNKNOWN", number> = {
    QUOTE: 0,
    CHECKOUT: 0,
    CREATE_MANDATE: 0,
    INSPECT_MANDATE: 0,
    REVOKE_MANDATE: 0,
    CATALOG: 0,
    HELP: 0,
    UNKNOWN: 0
  };

  // Mandate-related patterns
  if (/\b(mandate|budget|authori[sz]e|spend(?:ing)? limit)\b/.test(t)) {
    // Check for specific mandate actions with contextual weighting
    const checkPattern = /\b(check|inspect|show|view|status|remaining)\b.*\b(mandate|budget)\b/.test(t) ||
                        /\b(mandate|budget)\b.*\b(check|inspect|show|view|status|remaining)\b/.test(t);
    const revokePattern = /\b(revoke|cancel|delete|remove|kill)\b.*\b(mandate|budget)\b/.test(t) ||
                         /\b(mandate|budget)\b.*\b(revoke|cancel|delete|remove|kill)\b/.test(t);

    if (checkPattern) {
      actionScores.INSPECT_MANDATE += 3;
      actionScores.CREATE_MANDATE += 1; // Secondary possibility
    } else if (revokePattern) {
      actionScores.REVOKE_MANDATE += 3;
      actionScores.CREATE_MANDATE += 1; // Secondary possibility
    } else {
      actionScores.CREATE_MANDATE += 3;
      // Add contextual boosts for create mandate
      if (/\b(set|create|establish|new)\b.*\b(mandate|budget)\b/.test(t)) {
        actionScores.CREATE_MANDATE += 2;
      }
      if (/\b(limit|cap|maximum)\b.*\b(budget|spend|spending)\b/.test(t)) {
        actionScores.CREATE_MANDATE += 1;
      }
    }
  }

  // Checkout/Payment patterns
  const payPattern = /\b(pay|checkout|check out|place order|complete the (?:order|purchase)|proceed)\b/.test(t);
  const confirmationPattern = hasPendingOffer && /\b(yes|yep|yeah|do it|go ahead|sure|confirm|ok|okay)\b/.test(t);

  if (payPattern) {
    actionScores.CHECKOUT += 3;
  }
  if (confirmationPattern) {
    actionScores.CHECKOUT += 2;
    // If it's a clear confirmation word, boost checkout significantly
    if (/\b(yes|yep|yeah|do it|go ahead|sure|confirm)\b/.test(t)) {
      actionScores.CHECKOUT += 1;
    }
  }

  // Catalog patterns
  if (/\b(catalog|catalogue|products?|inventory|what do you (?:sell|have)|show me)\b/.test(t)) {
    actionScores.CATALOG += 3;
    // Boost for explicit browsing language
    if (/\b(browse|see|look at|view)\b/.test(t)) {
      actionScores.CATALOG += 1;
    }
  }

  // Quote/Purchase patterns (only if we have an SKU or strong purchase intent)
  const purchasePattern = sku || /\b(buy|order|purchase|quote|price|cost|how much|discount|deal)\b/.test(t);
  if (purchasePattern) {
    actionScores.QUOTE += 3;
    // Boost for explicit quoting language
    if (/\b(quote|price|cost|how much)\b/.test(t)) {
      actionScores.QUOTE += 2;
    }
    // Boost for explicit buying language
    if (/\b(buy|order|purchase)\b/.test(t)) {
      actionScores.QUOTE += 2;
    }
    // Boost for discount/deal language
    if (/\b(discount|deal|sale|offer)\b/.test(t)) {
      actionScores.QUOTE += 1;
    }
  }

  // Help patterns
  if (/\b(help|hi|hello|hey|what can you)\b/.test(t)) {
    actionScores.HELP += 3;
    // Boost for explicit help requests
    if (/\b(help|assist|support)\b/.test(t)) {
      actionScores.HELP += 2;
    }
  }

  // Find the action with the highest score
  let bestAction: "QUOTE" | "CHECKOUT" | "CREATE_MANDATE" | "INSPECT_MANDATE" | "REVOKE_MANDATE" | "CATALOG" | "HELP" | "UNKNOWN" = "UNKNOWN";
  let bestScore = 0;

  for (const [action, score] of Object.entries(actionScores) as [AgentAction, number][]) {
    if (score > bestScore) {
      bestScore = score;
      bestAction = action;
    }
  }

  // If there's a tie or low confidence, fall back to original logic for safety
  if (bestScore === 0) {
    return detectAction(text, hasPendingOffer, sku);
  }

  // Special case: if we have high confidence in UNKNOWN but there's clear intent, adjust
  if (bestAction === "UNKNOWN" && bestScore < 2) {
    // Check for any strong indicators we might have missed
    if (sku) {
      return "QUOTE"; // If we have an SKU, it's likely a quote request
    }
    if (hasPendingOffer && /\b(yes|yep|yeah|do it|go ahead|sure|confirm|ok|okay)\b/.test(t)) {
      return "CHECKOUT"; // Clear confirmation with pending offer
    }
  }

  return bestAction;
}

// ---------------------------------------------------------------------------
// Specific Action Handlers
// ---------------------------------------------------------------------------

class QuoteActionHandler implements AgentActionHandler {
  canHandle(action: string): boolean {
    return action === "QUOTE";
  }

  async handle(
    message: string,
    sessionId: string,
    intent: ParsedIntent,
    hasPendingOffer: boolean,
    mandateId?: string
  ): Promise<Record<string, unknown>> {
    const data: Record<string, unknown> = {};

    if (!intent.sku) {
      data.note = "NO_SKU_RESOLVED";
      return data;
    }

    const negInput: { sku: string; quantity: number; requestedDiscountPct: number; mandateId?: string } = {
      sku: intent.sku,
      quantity: intent.quantity ?? 1,
      requestedDiscountPct: intent.requestedDiscountPct ?? 0,
    };
    if (mandateId) negInput.mandateId = mandateId;

    data.negotiation = await negotiate(negInput);

    // Add policy evaluation phase for visualization
    (data.negotiation as any).phase = "policy_evaluation";

    return data;
  }
}

class CheckoutActionHandler implements AgentActionHandler {
  canHandle(action: string): boolean {
    return action === "CHECKOUT";
  }

  async handle(
    message: string,
    sessionId: string,
    intent: ParsedIntent,
    hasPendingOffer: boolean,
    mandateId?: string
  ): Promise<Record<string, unknown>> {
    const data: Record<string, unknown> = {};

    // In a real implementation, we would get the pending offer ID from session storage
    // For now, we'll rely on the intent.offerId or look it up
    const offerId = intent.offerId; // This would typically come from session context
    if (!offerId) {
      data.note = "NO_PENDING_OFFER";
      return data;
    }

    data.checkout = await runCheckout({ offerId, receipt: `agent_${Date.now()}` });

    return data;
  }
}

class CreateMandateActionHandler implements AgentActionHandler {
  canHandle(action: string): boolean {
    return action === "CREATE_MANDATE";
  }

  async handle(
    message: string,
    sessionId: string,
    intent: ParsedIntent,
    hasPendingOffer: boolean,
    mandateId?: string
  ): Promise<Record<string, unknown>> {
    const data: Record<string, unknown> = {};

    const amount = extractRupees(message);
    if (amount) {
      const totalPaise = Math.round(amount * 100);
      const perOrderAmount = extractPerOrderAmount(message);
      const perOrderPaise = perOrderAmount !== undefined
        ? Math.round(perOrderAmount * 100)
        : totalPaise; // Default to total amount if not specified

      // Validate that per-order amount does not exceed total amount
      if (perOrderPaise > totalPaise) {
        data.note = "INVALID_MANDATE_BOUNDS";
        data.validationError = "maxPerOrderPaise cannot exceed maxTotalPaise";
        return data;
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

    return data;
  }
}

class InspectMandateActionHandler implements AgentActionHandler {
  canHandle(action: string): boolean {
    return action === "INSPECT_MANDATE";
  }

  async handle(
    message: string,
    sessionId: string,
    intent: ParsedIntent,
    hasPendingOffer: boolean,
    mandateId?: string
  ): Promise<Record<string, unknown>> {
    const data: Record<string, unknown> = {};

    // For mandate inspection, we look for any active mandate for the conversational buyer
    // In a more complete implementation, we might store mandate IDs in session context
    const db = await getDb();
    const mandateRows = await db.all<{ mandate_id: string }[]>(
      `SELECT mandate_id FROM mandates WHERE buyer = ? AND status = 'ACTIVE' ORDER BY created_at DESC LIMIT 1`,
      ["conversational-buyer"]
    );

    if (mandateRows.length === 0) {
      data.note = "NO_ACTIVE_MANDATE";
      return data;
    }

    const mandateIdFromDb = mandateRows[0]?.mandate_id;
    if (!mandateIdFromDb) {
      data.note = "NO_ACTIVE_MANDATE";
      return data;
    }
    const mandate = await mandateService.get(mandateIdFromDb);
    if (!mandate) {
      data.note = "MANDATE_NOT_FOUND";
      return data;
    }

    data.mandate = mandate;
    data.remainingPaise = Math.max(0, mandate.maxTotalPaise - mandate.spentPaise);

    return data;
  }
}

class RevokeMandateActionHandler implements AgentActionHandler {
  canHandle(action: string): boolean {
    return action === "REVOKE_MANDATE";
  }

  async handle(
    message: string,
    sessionId: string,
    intent: ParsedIntent,
    hasPendingOffer: boolean,
    mandateId?: string
  ): Promise<Record<string, unknown>> {
    const data: Record<string, unknown> = {};

    // Look for the most recent mandate for this session
    const db = await getDb();
    const mandateRows = await db.all<{ mandate_id: string }[]>(
      `SELECT mandate_id FROM mandates WHERE buyer = ? AND status = 'ACTIVE' ORDER BY created_at DESC LIMIT 1`,
      ["conversational-buyer"]
    );

    if (mandateRows.length === 0) {
      data.note = "NO_ACTIVE_MANDATE";
      return data;
    }

    const mandateIdFromDb = mandateRows[0]?.mandate_id;
    if (!mandateIdFromDb) {
      data.note = "NO_ACTIVE_MANDATE";
      return data;
    }
    const mandate = await mandateService.get(mandateIdFromDb);
    if (!mandate) {
      data.note = "MANDATE_NOT_FOUND";
      return data;
    }

    // Revoke the mandate
    await mandateService.revoke(mandateIdFromDb);
    data.revoked = true;
    data.mandateId = mandateIdFromDb;

    return data;
  }
}

class CatalogActionHandler implements AgentActionHandler {
  canHandle(action: string): boolean {
    return action === "CATALOG";
  }

  async handle(
    message: string,
    sessionId: string,
    intent: ParsedIntent,
    hasPendingOffer: boolean,
    mandateId?: string
  ): Promise<Record<string, unknown>> {
    // No additional data needed for catalog action
    return {};
  }
}

class HelpActionHandler implements AgentActionHandler {
  canHandle(action: string): boolean {
    return action === "HELP";
  }

  async handle(
    message: string,
    sessionId: string,
    intent: ParsedIntent,
    hasPendingOffer: boolean,
    mandateId?: string
  ): Promise<Record<string, unknown>> {
    // No additional data needed for help action
    return {};
  }
}

class UnknownActionHandler implements AgentActionHandler {
  canHandle(action: string): boolean {
    return action === "UNKNOWN";
  }

  async handle(
    message: string,
    sessionId: string,
    intent: ParsedIntent,
    hasPendingOffer: boolean,
    mandateId?: string
  ): Promise<Record<string, unknown>> {
    // No additional data needed for unknown action
    return {};
  }
}

// ---------------------------------------------------------------------------
// Action Handler Registry
// ---------------------------------------------------------------------------

export class ActionHandlerRegistry {
  private handlers: AgentActionHandler[] = [];

  constructor() {
    // Register all handlers
    this.register(new QuoteActionHandler());
    this.register(new CheckoutActionHandler());
    this.register(new CreateMandateActionHandler());
    this.register(new InspectMandateActionHandler());
    this.register(new RevokeMandateActionHandler());
    this.register(new CatalogActionHandler());
    this.register(new HelpActionHandler());
    this.register(new UnknownActionHandler());
  }

  register(handler: AgentActionHandler): void {
    this.handlers.push(handler);
  }

  getHandler(action: string): AgentActionHandler | undefined {
    return this.handlers.find(handler => handler.canHandle(action));
  }
}

// Export singleton registry
export const actionHandlerRegistry = new ActionHandlerRegistry();