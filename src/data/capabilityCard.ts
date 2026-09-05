import { merchantPolicy } from "./catalog";

export const capabilityCard = {
  merchant: {
    id: "merchant-aegis-demo",
    name: "Aegis Demo Store",
  },
  agentCommerce: {
    supportsNegotiation: true,
    supportsSignedOffers: true,
    supportsSpendMandates: true,
    supportsHumanApproval: true,
    paymentRail: "razorpay-test-mode",
    policyEnvelope: {
      maxDiscountPct: merchantPolicy.maxDiscountPct,
      maxUnitsPerOrder: merchantPolicy.maxUnitsPerOrder,
      minMarginPct: merchantPolicy.minMarginPct,
      requiresApprovalAtRiskScore: merchantPolicy.approvalRiskThreshold,
      highValueApprovalPaise: merchantPolicy.highValueApprovalPaise,
    },
    explainability: "Every money action returns reason codes and policy checks.",
    fullManifest: "/.well-known/agent",
  },
};
