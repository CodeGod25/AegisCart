import { Router } from "express";
import { z } from "zod";
import { runCheckout } from "../services/checkoutService";
import { idempotencyService } from "../services/idempotencyService";
import { verifyPayment } from "../services/paymentService";
import { asyncHandler } from "../middleware/errorHandler";
import { createErrorResponse } from "../middleware/errorHandler";

export const checkoutRouter = Router();

// Checkout no longer accepts a free-floating amount. It accepts a signed offer id,
// and the amount is derived from that offer server-side. `amountInPaise`, if sent,
// is only a cross-check that must match the offer exactly.
const checkoutSchema = z.object({
  offerId: z.string().min(1, "Offer ID is required"),
  receipt: z.string().min(3, "Receipt must be at least 3 characters"),
  amountInPaise: z.coerce.number().int().positive().optional(),
  idempotencyKey: z.string().min(8).optional(),
});

const verifySchema = z.object({
  orderId: z.string().min(1, "Order ID is required"),
  paymentId: z.string().min(1, "Payment ID is required"),
  signature: z.string().min(8, "Signature must be at least 8 characters"),
  sessionId: z.string().optional(),
});

checkoutRouter.post(
  "/pay",
  asyncHandler(async (req, res) => {
    const parse = checkoutSchema.safeParse(req.body);

    if (!parse.success) {
      const err = new Error("Invalid request payload");
      err.status = 400;
      err.name = "VALIDATION_ERROR";
      err.details = parse.error.format();
      throw err;
    }

    const { offerId, receipt, amountInPaise, idempotencyKey } = parse.data;
    const headerKey = req.header("Idempotency-Key") ?? undefined;
    const key = idempotencyKey ?? headerKey;

    // Idempotency: reserve the key before executing so a concurrent duplicate is
    // rejected, and a later retry replays the stored outcome instead of re-charging.
    if (key) {
      const begin = await idempotencyService.begin(key);
      if (begin.state === "DONE") {
        res.setHeader("X-Idempotent-Replay", "true");
        return res.status(begin.statusCode).json(begin.response);
      }
      if (begin.state === "IN_FLIGHT") {
        return res.status(409).json({
          ok: false,
          error: "IDEMPOTENT_IN_FLIGHT",
          fallback: "A request with this Idempotency-Key is already being processed; retry shortly.",
        });
      }
    }

    const result = await runCheckout({ offerId, receipt, amountInPaise });

    if (key) {
      // Release the key on any server-side / unknown-outcome failure (>=500, e.g. a
      // gateway timeout) so a retry with the SAME key can safely re-execute. Definitive
      // outcomes (2xx, 402 decline, 409 stock, 422 gate) are finalized and replay verbatim.
      if (result.status >= 500) {
        await idempotencyService.release(key);
      } else {
        await idempotencyService.finalize(key, result.status, result.body);
      }
    }

    return res.status(result.status).json(result.body);
  })
);

checkoutRouter.post(
  "/verify",
  asyncHandler(async (req, res) => {
    const parse = verifySchema.safeParse(req.body);

    if (!parse.success) {
      const err = new Error("Invalid request payload");
      err.status = 400;
      err.name = "VALIDATION_ERROR";
      err.details = parse.error.format();
      throw err;
    }

    const result = await verifyPayment(parse.data);
    return res.status(result.valid ? 200 : 400).json(result);
  })
);