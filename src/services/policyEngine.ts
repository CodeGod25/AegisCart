import { CatalogItem, PolicyEvaluation } from "../types/domain";
import { cacheService } from "./cacheService";

function computeMarginPct(item: CatalogItem, discountPct: number): number {
  const discountedPrice = item.priceInPaise * (1 - discountPct / 100);
  return ((discountedPrice - item.costInPaise) / discountedPrice) * 100;
}

export function evaluatePolicy(
  item: CatalogItem,
  quantity: number,
  requestedDiscountPct: number
): PolicyEvaluation {
  const policy = cacheService.getPolicy();
  const reasons: string[] = [];
  let allowed = true;

  if (policy.blockedSkus.includes(item.sku)) {
    allowed = false;
    reasons.push("SKU_BLOCKED_BY_POLICY");
  }

  if (quantity <= 0) {
    allowed = false;
    reasons.push("INVALID_QUANTITY");
  }

  if (quantity > policy.maxUnitsPerOrder) {
    allowed = false;
    reasons.push("QUANTITY_EXCEEDS_LIMIT");
  }

  if (quantity > item.stock) {
    allowed = false;
    reasons.push("INSUFFICIENT_STOCK");
  }

  const boundedDiscount = Math.max(0, Math.min(requestedDiscountPct, policy.maxDiscountPct));
  if (requestedDiscountPct > policy.maxDiscountPct) {
    reasons.push("DISCOUNT_CAPPED_TO_POLICY");
  }

  const marginPct = computeMarginPct(item, boundedDiscount);
  if (marginPct < policy.minMarginPct) {
    allowed = false;
    reasons.push("MARGIN_BELOW_POLICY_FLOOR");
  }

  const riskScore =
    (requestedDiscountPct > policy.maxDiscountPct ? 4 : 0) +
    (quantity >= policy.maxUnitsPerOrder ? 2 : 0) +
    (marginPct <= policy.minMarginPct + 5 ? 2 : 0);

  // Order value is computed deterministically here so a high-value gate can fire
  // independently of the discount-based risk score.
  const effectiveUnitPriceInPaise = Math.round(item.priceInPaise * (1 - boundedDiscount / 100));
  const orderValueInPaise = effectiveUnitPriceInPaise * Math.max(0, quantity);
  const highValue = orderValueInPaise >= policy.highValueApprovalPaise;

  const requiresApproval = riskScore >= policy.approvalRiskThreshold || highValue;
  if (requiresApproval) {
    reasons.push("REQUIRES_HUMAN_APPROVAL");
    if (highValue) {
      reasons.push("HIGH_VALUE_ORDER");
    }
  }

  return {
    allowed,
    effectiveDiscountPct: boundedDiscount,
    reasons,
    riskScore,
    requiresApproval,
  };
}
