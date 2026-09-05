import { catalog } from "../data/catalog";
import { approvalService } from "./approvalService";
import { ledgerService } from "./ledgerService";
import { mandateService } from "./mandateService";
import { offerService } from "./offerService";
import { evaluatePolicy } from "./policyEngine";
import { cacheService } from "./cacheService";
import { BaseService } from "./baseService";

interface NegotiationInput {
  sku: string;
  quantity: number;
  requestedDiscountPct: number;
  mandateId?: string | undefined;
}

export async function negotiate(input: NegotiationInput) {
  // Start timing for performance monitoring
  const startTime = Date.now();

  // Parallelize independent operations where possible
  // 1. Find item in catalog (synchronous, very fast)
  const item = catalog.find((entry) => entry.sku === input.sku);
  if (!item) {
    return {
      ok: false,
      status: 404,
      message: "SKU_NOT_FOUND",
    };
  }

  // 2. Evaluate policy and get upsell in parallel (both depend only on item)
  const [policy, upsell] = await Promise.all([
    evaluatePolicy(item, input.quantity, input.requestedDiscountPct),
    item.upsellSku
      ? Promise.resolve(catalog.find((entry) => entry.sku === item.upsellSku))
      : Promise.resolve(undefined)
  ]);

  const unitPriceAfterDiscount = Math.round(
    item.priceInPaise * (1 - policy.effectiveDiscountPct / 100)
  );
  const totalPrice = unitPriceAfterDiscount * input.quantity;

  const explainability = policy.allowed
    ? "Request was accepted within policy bounds."
    : "Request was blocked because one or more policy checks failed.";

  // 3. Fire-and-forget ledger logging for negotiation evaluation
  ledgerService.add({
    actor: "agent",
    actionType: "NEGOTIATION_EVALUATED",
    explainability,
    payload: {
      sku: input.sku,
      quantity: input.quantity,
      requestedDiscountPct: input.requestedDiscountPct,
      effectiveDiscountPct: policy.effectiveDiscountPct,
      allowed: policy.allowed,
      reasons: policy.reasons,
      riskScore: policy.riskScore,
      requiresApproval: policy.requiresApproval,
    },
  }).catch(error => {
    // Log error but don't fail the negotiation
    console.warn("Failed to log negotiation evaluation:", error);
  });

  if (!policy.allowed) {
    return {
      ok: false,
      status: 422,
      message: "POLICY_REJECTED",
      decision: policy,
      counterOffer: {
        maxDiscountPct: cacheService.getPolicy().maxDiscountPct,
        maxQuantity: Math.min(item.stock, cacheService.getPolicy().maxUnitsPerOrder),
      },
      counterfactual:
        "If discount and quantity remain within policy while preserving margin floor, this request would pass.",
    };
  }

  // 4. Parallelize mandate validation (if needed) with independent operations
  if (input.mandateId) {
    // Mandate validation can run in parallel with quote preparation
    const [mandateCheck] = await Promise.all([
      mandateService.validate(input.mandateId, {
        totalInPaise: totalPrice,
        category: item.category,
      })
    ]);

    if (!mandateCheck.ok) {
      // Fire-and-forget ledger logging for mandate rejection
      ledgerService.add({
        actor: "system",
        actionType: "MANDATE_REJECTED",
        explainability: `Negotiation blocked: mandate ${input.mandateId} failed validation (${mandateCheck.reason}). The request is within merchant policy but exceeds the buyer's signed spend envelope.`,
        payload: {
          mandateId: input.mandateId,
          reason: mandateCheck.reason,
          totalInPaise: totalPrice,
          category: item.category,
        },
      }).catch(error => {
        console.warn("Failed to log mandate rejection:", error);
      });

      return {
        ok: false,
        status: 422,
        message: "MANDATE_REJECTED",
        reason: mandateCheck.reason,
        decision: policy,
        explainability: {
          whyBlocked:
            "The order is acceptable to the merchant but not covered by the buyer's signed spend mandate.",
        },
      };
    }
  }

  const quote = {
    sku: item.sku,
    name: item.name,
    quantity: input.quantity,
    unitPriceInPaise: unitPriceAfterDiscount,
    totalPriceInPaise: totalPrice,
    discountPctApplied: policy.effectiveDiscountPct,
    currency: item.currency,
  };

  const upsellPayload = upsell
    ? {
        sku: upsell.sku,
        name: upsell.name,
        reason: "Complements current item and raises basket value without policy risk.",
      }
    : null;

  // Gate: risky or high-value actions are held for a human. No signed offer is
  // minted until approval, so nothing payable exists for an un-approved action.
  if (policy.requiresApproval) {
    const approval = await approvalService.create({
      kind: "NEGOTIATION",
      reasons: policy.reasons,
      riskScore: policy.riskScore,
      proposedAction: {
        sku: item.sku,
        name: item.name,
        quantity: input.quantity,
        unitPriceInPaise: unitPriceAfterDiscount,
        totalInPaise: totalPrice,
        discountPct: policy.effectiveDiscountPct,
        currency: item.currency,
        mandateId: input.mandateId ?? null,
      },
    });

    return {
      ok: true,
      status: 202,
      requiresApproval: true,
      approval: {
        approvalId: approval.approvalId,
        status: approval.status,
        reasons: approval.reasons,
        riskScore: approval.riskScore,
      },
      quote,
      decision: policy,
      upsell: upsellPayload,
      explainability: {
        whyHeld:
          "Risk score or order value exceeded the merchant's auto-approve threshold, so a human must approve before a payable offer is minted.",
        nextStep: `Approve via POST /approvals/${approval.approvalId}/approve to mint the signed offer, or reject it.`,
      },
    };
  }

  // Money math is done deterministically above. We now mint a signed, TTL-bound
  // offer so the agreed price cannot be altered between negotiation and checkout.
  const offer = await offerService.mint({
    sku: item.sku,
    name: item.name,
    quantity: input.quantity,
    unitPriceInPaise: unitPriceAfterDiscount,
    totalInPaise: totalPrice,
    discountPct: policy.effectiveDiscountPct,
    currency: item.currency,
    mandateId: input.mandateId ?? null,
  });

  // Log performance metrics
  const duration = Date.now() - startTime;
  if (duration > 100) { // Log if negotiation takes more than 100ms
    console.info(`Negotiation completed in ${duration}ms for SKU: ${input.sku}`);
  }

  return {
    ok: true,
    status: 200,
    offer: {
      offerId: offer.offerId,
      signature: offer.signature,
      expiresAt: offer.expiresAt,
    },
    quote: {
      ...quote,
      offerId: offer.offerId,
    },
    decision: policy,
    upsell: upsellPayload,
    explainability: {
      whyThisOffer: "Best valid offer under policy constraints and margin floor.",
      whyNotLowerPrice:
        "Further discount would violate merchant discount cap or margin floor policy.",
    },
  };
}
