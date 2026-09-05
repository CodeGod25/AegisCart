import { Router } from "express";
import { z } from "zod";
import { runCheckout } from "../services/checkoutService";
import { idempotencyService } from "../services/idempotencyService";
import { ledgerService } from "../services/ledgerService";
import { x402Service } from "../services/x402Service";
import { asyncHandler } from "../middleware/errorHandler";

export const x402Router = Router();

/**
 * x402 pay-per-request front door.
 *
 * POST /x402/checkout  { offerId }
 *   - no X-PAYMENT header      -> 402 + payment requirements (the challenge)
 *   - valid X-PAYMENT header   -> runs the deterministic checkout, then 200 +
 *                                 X-PAYMENT-RESPONSE (the settlement) or the
 *                                 money core's failure status (402 decline, etc.)
 *
 * Every branch reuses the same offer + idempotency + ledger primitives as
 * POST /checkout/pay, so the 402 handshake introduces no new money math.
 */

/**
 * Validation schema for x402 checkout request
 */
const x402CheckoutSchema = z.object({
  offerId: z.string().min(1, "Offer ID is required"),
});

/**
 * Validation schema for X-PAYMENT header (handled separately)
 */
const x402PaymentHeaderSchema = z.object({
  x402Version: z.number().int().positive(),
  scheme: z.string(),
  network: z.string(),
  signature: z.string(),
  // Note: payload validation is handled by x402Service.decodePayment
});

x402Router.post(
  "/checkout",
  asyncHandler(async (req, res) => {
    // Validate request body
    const bodyParse = x402CheckoutSchema.safeParse(req.body);
    if (!bodyParse.success) {
      const err = new Error("Invalid request payload");
      err.status = 400;
      err.name = "VALIDATION_ERROR";
      err.details = bodyParse.error.format();
      throw err;
    }

    const { offerId } = bodyParse.data;
    const resource = "/x402/checkout";

    const paymentHeader = req.header("X-PAYMENT");

    // ---- Step 1: no payment presented -> issue the 402 challenge. ----
    if (!paymentHeader) {
      const challenge = await x402Service.challenge(offerId, resource);
      if (!challenge) {
        const err = new Error(`Offer not found: ${offerId}`);
        err.status = 404;
        err.name = "OFFER_NOT_FOUND";
        throw err;
      }
      await ledgerService.add({
        actor: "system",
        actionType: "X402_CHALLENGED",
        explainability: `x402: responded 402 Payment Required for offer ${offerId}. The buyer must satisfy the signed-offer payment requirement and retry with an X-PAYMENT header.`,
        payload: { offerId, resource, amountInPaise: challenge.accepts[0]?.maxAmountRequired ?? null },
      });
      return res.status(402).json(challenge);
    }

    // ---- Step 2: payment presented -> verify, then settle via the money core. ----
    const decoded = x402Service.decodePayment(paymentHeader);
    if (!decoded.ok) {
      const err = new Error("The X-PAYMENT header was missing or invalid. Fetch a fresh 402 challenge and retry.");
      err.status = 402;
      err.name = "PAYMENT_REQUIRED";
      err.details = { reason: decoded.reason };
      throw err;
    }

    const payload = decoded.payload;
    // If the caller also sent a body offerId, it must match the header — no ambiguity
    // about which offer is being settled.
    if (offerId && offerId !== payload.offerId) {
      const err = new Error("Offer ID in body does not match Offer ID in X-PAYMENT header");
      err.status = 400;
      err.name = "X402_OFFER_ID_MISMATCH";
      throw err;
    }

    const key = payload.idempotencyKey;
    if (key) {
      const begin = await idempotencyService.begin(key);
      if (begin.state === "DONE") {
        res.setHeader("X-Idempotent-Replay", "true");
        return res.status(begin.statusCode).json(begin.response);
      }
      if (begin.state === "IN_FLIGHT") {
        return res.status(409).json({ ok: false, error: "IDEMPOTENT_IN_FLIGHT" });
      }
    }

    const result = await runCheckout({
      offerId: payload.offerId,
      receipt: payload.receipt ?? `x402-${Date.now()}`,
    });

    if (key) {
      if (result.status >= 500) await idempotencyService.release(key);
      else await idempotencyService.finalize(key, result.status, result.body);
    }

    if (result.status === 200 && result.body.ok) {
      const settlement = x402Service.encodeSettlement({
        x402Version: 1,
        scheme: "aegiscart-signed-offer",
        network: "razorpay-test-mode",
        success: true,
        offerId: payload.offerId,
        orderId: String(result.body.orderId ?? ""),
        paymentId: String(result.body.paymentId ?? ""),
        amountInPaise: Number(result.body.amountInPaise ?? 0),
        currency: "INR",
      });
      res.setHeader("X-PAYMENT-RESPONSE", settlement);
      await ledgerService.add({
        actor: "system",
        actionType: "X402_SETTLED",
        explainability: `x402: payment settled for offer ${payload.offerId}. Resource unlocked and settlement returned in X-PAYMENT-RESPONSE.`,
        payload: {
          offerId: payload.offerId,
          orderId: result.body.orderId ?? null,
          amountInPaise: result.body.amountInPaise ?? null,
        },
      });
      return res.status(200).json({
        ok: true,
        x402Version: 1,
        settled: true,
        resource,
        offerId: payload.offerId,
        payment: {
          orderId: result.body.orderId,
          paymentId: result.body.paymentId,
          amountInPaise: result.body.amountInPaise,
        },
        // The "unlocked resource" — here, machine-readable proof the buyer can retain.
        content: {
          message: "Payment accepted via x402. This confirmation is the paid resource.",
          offerId: payload.offerId,
        },
      });
    }

    // Payment did not succeed — surface the money core's reason code under x402 framing.
    const err = new Error("Payment failed");
    err.status = result.status;
    err.name = "PAYMENT_REQUIRED";
    err.details = { ...result.body, settled: false };
    throw err;
  })
);