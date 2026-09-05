import { FAILURES, failureBody } from "./failureTaxonomy";
import { ledgerService } from "./ledgerService";
import { mandateService } from "./mandateService";
import { offerService } from "./offerService";
import { attemptPayment, createOrder } from "./paymentService";
import { sessionService } from "./sessionService";
import { BaseService } from "./baseService";

export interface CheckoutResult {
  status: number;
  body: Record<string, unknown>;
}

export interface RunCheckoutInput {
  offerId: string;
  receipt: string;
  amountInPaise?: number | undefined;
}

// The core checkout money action, computed as a single {status, body} result so it
// can be wrapped by the idempotency layer (route) or called directly by an agent.
// Every gate here is deterministic: signed-offer validity, mandate envelope, then
// payment. No LLM is anywhere near this path.
export async function runCheckout(input: RunCheckoutInput): Promise<CheckoutResult> {
  const { offerId, receipt, amountInPaise } = input;

  // Gate (deterministic): the payment amount is bound to a signed, unexpired,
  // unconsumed offer. A client cannot pay an amount the policy engine never approved.
  const check = await offerService.validateForCheckout(offerId, amountInPaise);
  if (!check.ok || !check.offer) {
    await ledgerService.add({
      actor: "system",
      actionType: "OFFER_REJECTED",
      explainability: `Checkout refused: offer ${offerId} failed validation (${check.reason}). The policy-bounded price was not honoured, so no money action proceeds.`,
      payload: { offerId, reason: check.reason, amountInPaise: amountInPaise ?? null },
    });
    return {
      status: 422,
      body: {
        ok: false,
        error: "OFFER_REJECTED",
        reason: check.reason,
        fallback: "Request a fresh quote to obtain a valid offer, then retry checkout.",
      },
    };
  }

  const offer = check.offer;
  const amount = offer.totalInPaise;

  // If the offer is bound to a spend mandate, re-check the buyer's envelope at
  // payment time — budget may have been consumed by another order since minting.
  if (offer.mandateId) {
    const mandateCheck = await mandateService.validate(offer.mandateId, { totalInPaise: amount });
    if (!mandateCheck.ok) {
      await ledgerService.add({
        actor: "system",
        actionType: "MANDATE_REJECTED",
        explainability: `Checkout refused: mandate ${offer.mandateId} failed validation (${mandateCheck.reason}). The buyer's signed spend envelope no longer permits this payment.`,
        payload: {
          offerId: offer.offerId,
          mandateId: offer.mandateId,
          reason: mandateCheck.reason,
          amountInPaise: amount,
        },
      });
      return {
        status: 422,
        body: {
          ok: false,
          error: "MANDATE_REJECTED",
          reason: mandateCheck.reason,
          offerId: offer.offerId,
          fallback: "The spend mandate cannot cover this order; a human must raise or renew it.",
        },
      };
    }
  }

  try {
    const session = await sessionService.createSession({
      amountInPaise: amount,
      currency: offer.currency,
      receipt,
    });
    const order = await createOrder({
      amountInPaise: amount,
      currency: offer.currency,
      receipt,
    });
    await sessionService.attachOrder(session.sessionId, order.orderId);

    const payment = await attemptPayment(order.orderId, session.sessionId);

    if (!payment.success) {
      // Payment failed. The offer is left ACTIVE so the buyer can retry (with a
      // fresh key, or the SAME key for a timeout) before it expires — the recovery
      // path. Status and guidance come from the central failure taxonomy.
      const code = payment.failureCode ?? "PAYMENT_DECLINED";
      const spec = FAILURES[code];
      return {
        status: spec.httpStatus,
        body: failureBody(code, {
          sessionId: session.sessionId,
          orderId: order.orderId,
          offerId: offer.offerId,
        }),
      };
    }

    // Debit the buyer's mandate only after the payment actually succeeded, then
    // consume the offer so neither can be reused.
    if (offer.mandateId) {
      await mandateService.debit(offer.mandateId, amount);
    }
    await offerService.consume(offer.offerId);

    return {
      status: 200,
      body: {
        ok: true,
        sessionId: session.sessionId,
        orderId: order.orderId,
        offerId: offer.offerId,
        paymentId: payment.paymentId,
        amountInPaise: amount,
        message: payment.message,
      },
    };
  } catch (error) {
    return {
      status: 500,
      body: {
        ok: false,
        error: "ORDER_CREATION_FAILED",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
    };
  }
}
