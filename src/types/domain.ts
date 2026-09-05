export type Currency = "INR";

export type RecurrenceType = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

export interface CatalogItem {
  sku: string;
  name: string;
  description: string;
  category: string;
  priceInPaise: number;
  costInPaise: number;
  currency: Currency;
  stock: number;
  upsellSku?: string;
  crossSellSkus?: string[];
}

export interface MerchantPolicy {
  maxDiscountPct: number;
  minMarginPct: number;
  maxUnitsPerOrder: number;
  blockedSkus: string[];
  approvalRiskThreshold: number;
  // Orders at or above this value always require human approval, regardless of
  // risk score — a "big spend needs a human" gate independent of discount math.
  highValueApprovalPaise: number;
}

export interface NegotiationRequest {
  sku: string;
  quantity: number;
  requestedDiscountPct: number;
  mandateId?: string;
}

export interface PolicyEvaluation {
  allowed: boolean;
  effectiveDiscountPct: number;
  reasons: string[];
  riskScore: number;
  requiresApproval: boolean;
}

export type MoneyActionType =
  | "NEGOTIATION_EVALUATED"
  | "OFFER_MINTED"
  | "OFFER_CONSUMED"
  | "OFFER_REJECTED"
  | "ORDER_CREATED"
  | "PAYMENT_ATTEMPTED"
  | "PAYMENT_RETRIED"
  | "PAYMENT_FAILED"
  | "PAYMENT_SUCCEEDED"
  | "PAYMENT_VERIFIED"
  | "WEBHOOK_RECEIVED"
  | "MANDATE_CREATED"
  | "MANDATE_DEBITED"
  | "MANDATE_REJECTED"
  | "APPROVAL_REQUESTED"
  | "APPROVAL_GRANTED"
  | "APPROVAL_REJECTED"
  | "UPSELL_SUGGESTED"
  | "AGENT_MESSAGE"
  | "FAILURE_INJECTED"
  | "ESCALATED"
  | "X402_CHALLENGED"
  | "X402_SETTLED";

export type Actor = "agent" | "system" | "buyer_agent" | "human";

export interface MoneyAction {
  id: string;
  timestamp: string;
  actor: Actor;
  actionType: MoneyActionType;
  explainability: string;
  payload: Record<string, unknown>;
}

export type OfferStatus = "ACTIVE" | "CONSUMED" | "EXPIRED" | "REJECTED";

export interface Offer {
  offerId: string;
  sku: string;
  name: string;
  quantity: number;
  unitPriceInPaise: number;
  totalInPaise: number;
  discountPct: number;
  currency: Currency;
  mandateId: string | null;
  createdAt: string;
  expiresAt: string;
  status: OfferStatus;
  signature: string;
}

export type MandateStatus = "ACTIVE" | "EXHAUSTED" | "EXPIRED" | "REVOKED";

// AP2-style "Intent Mandate": a bounded, signed authorization that the merchant
// enforces on the buyer agent. The LLM never edits these numbers; the deterministic
// mandate service does.
export interface SpendMandate {
  mandateId: string;
  buyer: string;
  maxTotalPaise: number;
  maxPerOrderPaise: number;
  allowedCategories: string[]; // empty array => all categories allowed
  spentPaise: number;
  currency: Currency;
  createdAt: string;
  expiresAt: string;
  status: MandateStatus;
  signature: string;
  // Recurring mandate fields
  recurrenceType: RecurrenceType | null; // NULL for one-time mandates
  recurrenceInterval: number;
  nextRenewalAt: string | null; // When the mandate should next renew (NULL for one-time or if no more renewals)
  renewalCount: number;
  maxRenewals: number | null; // NULL for unlimited renewals
  resetSpentOnRenewal: boolean; // Whether spent amount resets to 0 on renewal
}

export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED";
export type ApprovalKind = "NEGOTIATION" | "CHECKOUT";

export interface Approval {
  approvalId: string;
  createdAt: string;
  updatedAt: string;
  status: ApprovalStatus;
  kind: ApprovalKind;
  reasons: string[];
  riskScore: number;
  proposedAction: Record<string, unknown>;
  resolution: string | null;
  decidedBy: string | null;
}
