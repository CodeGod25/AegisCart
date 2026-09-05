import { catalog, merchantPolicy } from "../data/catalog";
import { CatalogItem } from "../types/domain";
import { ledgerService } from "./ledgerService";

// ---------------------------------------------------------------------------
// The revenue engine. Its job is the Track-01 goal — grow the merchant's
// revenue — and it does so with PURELY DETERMINISTIC money math:
//   * bestIncentive  — the deepest discount that still respects the margin floor
//                      and the discount cap (dynamic pricing, policy-bounded)
//   * recommendCrossSell — complementary items to raise basket value
//   * priceBundle    — basket-level pricing preserving a blended margin floor
//   * computeMetrics — revenue/margin/conversion reconstructed from the ledger
// No LLM is involved anywhere here. Every number is a function of the catalog,
// the merchant policy, and the immutable audit trail.
// ---------------------------------------------------------------------------

function itemBySku(sku: string): CatalogItem | undefined {
  return catalog.find((c) => c.sku === sku);
}

function marginPct(priceInPaise: number, costInPaise: number): number {
  if (priceInPaise <= 0) return 0;
  return ((priceInPaise - costInPaise) / priceInPaise) * 100;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// The lowest price at which an item still meets the margin floor.
function marginFloorPrice(costInPaise: number): number {
  const m = merchantPolicy.minMarginPct / 100;
  if (m >= 1) return Number.POSITIVE_INFINITY;
  return costInPaise / (1 - m);
}

// --- dynamic pricing --------------------------------------------------------

export interface BestIncentive {
  ok: boolean;
  reason?: string;
  sku?: string;
  name?: string;
  quantity?: number;
  listUnitPriceInPaise?: number;
  bestDiscountPct?: number;
  discountedUnitPriceInPaise?: number;
  lineTotalInPaise?: number;
  totalSavingsInPaise?: number;
  resultingMarginPct?: number;
  bindingConstraint?: "DISCOUNT_CAP" | "MARGIN_FLOOR" | "NONE";
  explanation?: string;
}

// The single best offer we can make on an item without breaching policy. As the
// discount grows, margin shrinks; we take the largest whole-percent discount that
// stays at or under the discount cap AND at or above the margin floor.
export function bestIncentive(sku: string, quantity = 1): BestIncentive {
  const item = itemBySku(sku);
  if (!item) {
    return { ok: false, reason: "SKU_NOT_FOUND" };
  }
  const qty = Math.max(1, Math.min(quantity, merchantPolicy.maxUnitsPerOrder));
  const list = item.priceInPaise;

  const maxByCap = merchantPolicy.maxDiscountPct;
  // Floor the margin-derived limit: rounding up could dip below the margin floor.
  const maxByMargin = Math.floor((1 - marginFloorPrice(item.costInPaise) / list) * 100);

  const bestDiscountPct = Math.max(0, Math.min(maxByCap, maxByMargin));
  const discountedUnit = Math.round(list * (1 - bestDiscountPct / 100));
  const lineTotal = discountedUnit * qty;
  const totalSavings = (list - discountedUnit) * qty;

  const bindingConstraint =
    bestDiscountPct === 0
      ? "NONE"
      : maxByMargin <= maxByCap
        ? "MARGIN_FLOOR"
        : "DISCOUNT_CAP";

  return {
    ok: true,
    sku: item.sku,
    name: item.name,
    quantity: qty,
    listUnitPriceInPaise: list,
    bestDiscountPct,
    discountedUnitPriceInPaise: discountedUnit,
    lineTotalInPaise: lineTotal,
    totalSavingsInPaise: totalSavings,
    resultingMarginPct: round2(marginPct(discountedUnit, item.costInPaise)),
    bindingConstraint,
    explanation:
      bindingConstraint === "MARGIN_FLOOR"
        ? `Capped at ${bestDiscountPct}% by the ${merchantPolicy.minMarginPct}% margin floor — a deeper discount would sell below the merchant's minimum margin.`
        : bindingConstraint === "DISCOUNT_CAP"
          ? `Capped at the ${merchantPolicy.maxDiscountPct}% policy discount ceiling while keeping a healthy ${round2(marginPct(discountedUnit, item.costInPaise))}% margin.`
          : `No discount is possible on this item without breaching the margin floor.`,
  };
}

// --- cross-sell -------------------------------------------------------------

export interface CrossSellRecommendation {
  sku: string;
  name: string;
  category: string;
  priceInPaise: number;
  inStock: boolean;
  reason: string;
  projectedBasketUpliftPaise: number;
}

export interface CrossSellResult {
  ok: boolean;
  reason?: string;
  anchorSku?: string;
  anchorName?: string;
  recommendations?: CrossSellRecommendation[];
}

// Complementary items to raise basket value. Uses explicit cross-sell wiring,
// falls back to the upsell target and same-category items. Deterministic ordering.
export function recommendCrossSell(sku: string): CrossSellResult {
  const anchor = itemBySku(sku);
  if (!anchor) {
    return { ok: false, reason: "SKU_NOT_FOUND" };
  }

  const orderedSkus: string[] = [];
  const push = (s: string | undefined) => {
    if (s && s !== sku && !orderedSkus.includes(s)) orderedSkus.push(s);
  };

  (anchor.crossSellSkus ?? []).forEach(push);
  push(anchor.upsellSku);
  // Round out with any remaining same-category items, then anything else.
  catalog.filter((c) => c.category === anchor.category).forEach((c) => push(c.sku));
  catalog.forEach((c) => push(c.sku));

  const recommendations: CrossSellRecommendation[] = [];
  for (const s of orderedSkus) {
    const item = itemBySku(s);
    if (!item) continue;
    const isUpsell = item.sku === anchor.upsellSku;
    const sameCategory = item.category === anchor.category;
    recommendations.push({
      sku: item.sku,
      name: item.name,
      category: item.category,
      priceInPaise: item.priceInPaise,
      inStock: item.stock > 0,
      reason: isUpsell
        ? "Higher-value upgrade that lifts order value the most."
        : sameCategory
          ? "Frequently bought alongside items in the same category."
          : "Complements the anchor item to complete the buyer's setup.",
      // Upside if the buyer adds one unit of this item to the basket.
      projectedBasketUpliftPaise: item.priceInPaise,
    });
  }

  return {
    ok: true,
    anchorSku: anchor.sku,
    anchorName: anchor.name,
    recommendations,
  };
}

// --- bundle pricing ---------------------------------------------------------

export interface BundleLine {
  sku: string;
  name: string;
  quantity: number;
  unitPriceInPaise: number;
  lineTotalInPaise: number;
}

export interface BundleResult {
  ok: boolean;
  reason?: string;
  lines?: BundleLine[];
  listTotalInPaise?: number;
  bundleDiscountPct?: number;
  bundleTotalInPaise?: number;
  savingsInPaise?: number;
  blendedMarginPct?: number;
  explanation?: string;
}

// Basket-level dynamic pricing: the largest whole-percent bundle discount that
// keeps the blended margin at or above the floor and within the discount cap.
export function priceBundle(items: Array<{ sku: string; quantity: number }>): BundleResult {
  if (!items.length) {
    return { ok: false, reason: "EMPTY_BUNDLE" };
  }

  const lines: BundleLine[] = [];
  let listTotal = 0;
  let costTotal = 0;

  for (const req of items) {
    const item = itemBySku(req.sku);
    if (!item) {
      return { ok: false, reason: `SKU_NOT_FOUND:${req.sku}` };
    }
    const qty = Math.max(1, Math.min(req.quantity, merchantPolicy.maxUnitsPerOrder));
    const lineTotal = item.priceInPaise * qty;
    listTotal += lineTotal;
    costTotal += item.costInPaise * qty;
    lines.push({
      sku: item.sku,
      name: item.name,
      quantity: qty,
      unitPriceInPaise: item.priceInPaise,
      lineTotalInPaise: lineTotal,
    });
  }

  const maxByCap = merchantPolicy.maxDiscountPct;
  const maxByMargin = Math.floor((1 - marginFloorPrice(costTotal) / listTotal) * 100);
  const bundleDiscountPct = Math.max(0, Math.min(maxByCap, maxByMargin));
  const bundleTotal = Math.round(listTotal * (1 - bundleDiscountPct / 100));
  const savings = listTotal - bundleTotal;

  return {
    ok: true,
    lines,
    listTotalInPaise: listTotal,
    bundleDiscountPct,
    bundleTotalInPaise: bundleTotal,
    savingsInPaise: savings,
    blendedMarginPct: round2(marginPct(bundleTotal, costTotal)),
    explanation:
      `Bundling ${lines.length} line item(s) unlocks a ${bundleDiscountPct}% basket discount ` +
      `(saving ${savings} paise) while holding a blended margin of ` +
      `${round2(marginPct(bundleTotal, costTotal))}%, at or above the ${merchantPolicy.minMarginPct}% floor.`,
  };
}

// --- metrics (reconstructed from the immutable ledger) ----------------------

export interface RevenueMetrics {
  generatedAt: string;
  currency: "INR";
  sales: {
    count: number;
    unitsSold: number;
    revenueInPaise: number;
    costOfGoodsInPaise: number;
    grossProfitInPaise: number;
    blendedMarginPct: number;
    averageOrderValueInPaise: number;
    listValueInPaise: number;
    discountGivenInPaise: number;
    effectiveDiscountRatePct: number;
  };
  funnel: {
    negotiations: number;
    offersMinted: number;
    paymentAttempts: number;
    paymentsSucceeded: number;
    paymentsFailed: number;
    offerToSaleConversionPct: number;
    paymentSuccessRatePct: number;
  };
  governance: {
    approvalsRequested: number;
    approvalsGranted: number;
    approvalsRejected: number;
    mandatesCreated: number;
    mandateSpendInPaise: number;
  };
  perSku: Array<{ sku: string; name: string; unitsSold: number; revenueInPaise: number }>;
  topSellingSku: string | null;
  eventCounts: Record<string, number>;
}

interface MintedRecord {
  sku: string;
  quantity: number;
  totalInPaise: number;
}

function asRecord(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function computeMetrics(): Promise<RevenueMetrics> {
  const events = await ledgerService.list();

  const minted = new Map<string, MintedRecord>();
  const consumed = new Set<string>();
  const eventCounts: Record<string, number> = {};
  let mandateSpend = 0;

  for (const e of events) {
    eventCounts[e.actionType] = (eventCounts[e.actionType] ?? 0) + 1;
    const p = asRecord(e.payload);
    if (e.actionType === "OFFER_MINTED" && typeof p.offerId === "string") {
      minted.set(p.offerId, {
        sku: String(p.sku ?? ""),
        quantity: num(p.quantity),
        totalInPaise: num(p.totalInPaise),
      });
    } else if (e.actionType === "OFFER_CONSUMED" && typeof p.offerId === "string") {
      consumed.add(p.offerId);
    } else if (e.actionType === "MANDATE_DEBITED") {
      mandateSpend += num(p.amountInPaise);
    }
  }

  let revenue = 0;
  let cost = 0;
  let listValue = 0;
  let unitsSold = 0;
  let salesCount = 0;
  const perSku = new Map<string, { name: string; units: number; revenue: number }>();

  for (const offerId of consumed) {
    const rec = minted.get(offerId);
    if (!rec) continue; // consumed offer with no mint record — ignore rather than guess
    salesCount += 1;
    revenue += rec.totalInPaise;
    unitsSold += rec.quantity;
    const item = itemBySku(rec.sku);
    if (item) {
      cost += item.costInPaise * rec.quantity;
      listValue += item.priceInPaise * rec.quantity;
    }
    const cur = perSku.get(rec.sku) ?? { name: item?.name ?? rec.sku, units: 0, revenue: 0 };
    cur.units += rec.quantity;
    cur.revenue += rec.totalInPaise;
    perSku.set(rec.sku, cur);
  }

  const grossProfit = revenue - cost;
  const discountGiven = Math.max(0, listValue - revenue);

  const negotiations = eventCounts["NEGOTIATION_EVALUATED"] ?? 0;
  const offersMinted = eventCounts["OFFER_MINTED"] ?? 0;
  const paymentAttempts = eventCounts["PAYMENT_ATTEMPTED"] ?? 0;
  const paymentsSucceeded = eventCounts["PAYMENT_SUCCEEDED"] ?? 0;
  const paymentsFailed = eventCounts["PAYMENT_FAILED"] ?? 0;

  const perSkuArr = [...perSku.entries()]
    .map(([sku, v]) => ({ sku, name: v.name, unitsSold: v.units, revenueInPaise: v.revenue }))
    .sort((a, b) => b.revenueInPaise - a.revenueInPaise);

  return {
    generatedAt: new Date().toISOString(),
    currency: "INR",
    sales: {
      count: salesCount,
      unitsSold,
      revenueInPaise: revenue,
      costOfGoodsInPaise: cost,
      grossProfitInPaise: grossProfit,
      blendedMarginPct: revenue > 0 ? round2((grossProfit / revenue) * 100) : 0,
      averageOrderValueInPaise: salesCount > 0 ? Math.round(revenue / salesCount) : 0,
      listValueInPaise: listValue,
      discountGivenInPaise: discountGiven,
      effectiveDiscountRatePct: listValue > 0 ? round2((discountGiven / listValue) * 100) : 0,
    },
    funnel: {
      negotiations,
      offersMinted,
      paymentAttempts,
      paymentsSucceeded,
      paymentsFailed,
      offerToSaleConversionPct: offersMinted > 0 ? round2((salesCount / offersMinted) * 100) : 0,
      paymentSuccessRatePct:
        paymentAttempts > 0 ? round2((paymentsSucceeded / paymentAttempts) * 100) : 0,
    },
    governance: {
      approvalsRequested: eventCounts["APPROVAL_REQUESTED"] ?? 0,
      approvalsGranted: eventCounts["APPROVAL_GRANTED"] ?? 0,
      approvalsRejected: eventCounts["APPROVAL_REJECTED"] ?? 0,
      mandatesCreated: eventCounts["MANDATE_CREATED"] ?? 0,
      mandateSpendInPaise: mandateSpend,
    },
    perSku: perSkuArr,
    topSellingSku: perSkuArr[0]?.sku ?? null,
    eventCounts,
  };
}
