import { catalog } from "../data/catalog";
import { CatalogItem } from "../types/domain";
import { cacheService } from "./cacheService";
import { ParsedIntent } from "./actionHandler";

/**
 * Deterministic helper functions used across services.
 * These functions are pure and have no side effects, making them easy to test.
 */

// Pre-processed catalog maps for O(1) lookups
const skuMap = new Map<string, CatalogItem>();
const skuLowerMap = new Map<string, CatalogItem>();

// Populate maps on module load
for (const item of catalog) {
  skuMap.set(item.sku, item);
  skuLowerMap.set(item.sku.toLowerCase(), item);
}

// Cache for matchSku results to avoid recomputation
const matchSkuCache = new Map<string, string | undefined>();
const MATCH_SKU_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const matchSkuCacheTimestamps = new Map<string, number>();

export const NUMBER_WORDS: Record<string, number> = {
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

export function rupees(paise: number): string {
  return `₹${(paise / 100).toFixed(2)}`;
}

export function clampPct(n: number): number {
  return Math.max(0, Math.min(100, n));
}

export function tokens(s: string): string[] {
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
// Uses caching and pre-processed maps for performance optimization.
export function matchSku(text: string): string | undefined {
  // Check cache first
  const now = Date.now();
  if (matchSkuCache.has(text)) {
    const timestamp = matchSkuCacheTimestamps.get(text) || 0;
    if (now - timestamp < MATCH_SKU_CACHE_TTL_MS) {
      return matchSkuCache.get(text);
    }
    // Remove expired cache entry
    matchSkuCache.delete(text);
    matchSkuCacheTimestamps.delete(text);
  }

  // Fast path: direct SKU lookup (case-insensitive)
  const lowerText = text.toLowerCase();
  const words = new Set(tokens(lowerText));

  // Check for exact SKU match first (highest priority)
  if (skuLowerMap.has(lowerText)) {
    const result = skuLowerMap.get(lowerText)!.sku;
    // Cache the result
    matchSkuCache.set(text, result);
    matchSkuCacheTimestamps.set(text, now);
    return result;
  }

  // If no direct match, do scoring algorithm (optimized)
  let best: { sku: string; score: number } | undefined;

  // Only iterate through catalog for fuzzy matching
  for (const item of catalog) {
    // Skip if we already have an exact match (handled above)
    // Build keys set more efficiently
    let score = 0;

    // Direct SKU inclusion check (case-insensitive)
    if (lowerText.includes(item.sku.toLowerCase())) {
      score += 5;
    }

    // Check tokens more efficiently
    const skuTokens = tokens(item.sku);
    const nameTokens = tokens(item.name);
    const categoryTokens = tokens(item.category);

    // Check SKU tokens
    for (const k of skuTokens) {
      if (words.has(k)) {
        score += 1;
        break; // Early exit if we find a match
      }
    }

    // Check name tokens only if needed
    if (score < 5) { // Only check if we haven't already got a strong SKU match
      for (const k of nameTokens) {
        if (words.has(k)) {
          score += 1;
          break; // Early exit
        }
      }
    }

    // Check category tokens only if needed
    if (score < 5) { // Only check if we haven't already got a strong match
      for (const k of categoryTokens) {
        if (words.has(k)) {
          score += 1;
          break; // Early exit
        }
      }
    }

    if (score > 0 && (!best || score > best.score)) {
      best = { sku: item.sku, score };

      // Early exit if we have a very strong match
      if (score >= 8) { // High confidence match
        break;
      }
    }
  }

  const result = best?.sku;

  // Cache the result (including undefined for cache misses)
  matchSkuCache.set(text, result);
  matchSkuCacheTimestamps.set(text, now);

  // Limit cache size to prevent memory leaks
  if (matchSkuCache.size > 1000) {
    // Remove oldest entries
    const oldestKey = Array.from(matchSkuCacheTimestamps.entries())
      .sort((a, b) => a[1] - b[1])[0]?.[0];
    if (!oldestKey) return result;
    matchSkuCache.delete(oldestKey);
    matchSkuCacheTimestamps.delete(oldestKey);
  }

  return result;
}



export function extractDiscountPct(text: string): number | undefined {
  const t = text.toLowerCase();
  const pctMatch = t.match(/(\d{1,3}(?:\.\d+)?)\s*(?:%|percent|per\s?cent)/);
  const pct = pctMatch?.[1];
  if (pct) return clampPct(Number(pct));
  const offMatch = t.match(/(\d{1,3}(?:\.\d+)?)\s*off\b/);
  const off = offMatch?.[1];
  if (off) return clampPct(Number(off));
  if (/\b(discount|deal|cheaper|lower price|better price|reduce|knock off)\b/.test(t)) {
    // A discount was requested but no figure given: try for the best allowed.
    return cacheService.getPolicy().maxDiscountPct;
  }
  return undefined;
}

export function extractQuantity(text: string): number | undefined {
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

export function extractRupees(text: string): number | undefined {
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

export function extractPerOrderAmount(text: string): number | undefined {
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

export function detectAction(
  text: string,
  hasPendingOffer: boolean,
  sku: string | undefined
): "QUOTE" | "CHECKOUT" | "CREATE_MANDATE" | "INSPECT_MANDATE" | "REVOKE_MANDATE" | "CATALOG" | "HELP" | "UNKNOWN" {
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

// Deterministic intent detection as a fallback when LLM is unavailable or fails.
// Uses scoring and contextual awareness for improved accuracy over first-match-wins.
export function deterministicIntent(text: string, hasPendingOffer: boolean): ParsedIntent {
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

  for (const [action, score] of Object.entries(actionScores)) {
    if (score > bestScore) {
      bestScore = score;
      bestAction = action as typeof bestAction;
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