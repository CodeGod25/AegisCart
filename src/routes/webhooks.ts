import { Router } from "express";
import { env } from "../config/env";
import { FAILURES, failureBody } from "../services/failureTaxonomy";
import { ledgerService } from "../services/ledgerService";
import { verifyWebhookSignature } from "../services/razorpaySignatureService";
import { sessionService } from "../services/sessionService";
import { webhookService } from "../services/webhookService";

export const webhookRouter = Router();

webhookRouter.post("/razorpay", async (req, res) => {
  const signatureHeader = req.header("x-razorpay-signature") ?? "";
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from([]);

  if (!env.RAZORPAY_WEBHOOK_SECRET) {
    await ledgerService.add({
      actor: "system",
      actionType: "WEBHOOK_RECEIVED",
      explainability: "Webhook received but webhook secret is not configured.",
      payload: {
        signatureProvided: !!signatureHeader,
      },
    });

    return res.status(503).json({
      ok: false,
      error: "RAZORPAY_WEBHOOK_SECRET_NOT_CONFIGURED",
    });
  }

  const validSignature = verifyWebhookSignature(
    rawBody,
    signatureHeader,
    env.RAZORPAY_WEBHOOK_SECRET
  );

  let payload: any = {};
  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    payload = { malformed: true };
  }

  await webhookService.saveEvent({
    eventId: payload?.payload?.payment?.entity?.id,
    eventType: payload?.event,
    signatureValid: validSignature,
    payload,
  });

  await ledgerService.add({
    actor: "system",
    actionType: "WEBHOOK_RECEIVED",
    explainability: validSignature
      ? "Razorpay webhook signature validated and event persisted."
      : "Razorpay webhook signature failed validation.",
    payload: {
      event: payload?.event,
      signatureValid: validSignature,
    },
  });

  if (!validSignature) {
    // Reject without mutating any session or money state — the graceful, safe path.
    const spec = FAILURES.WEBHOOK_SIGNATURE_INVALID;
    return res.status(spec.httpStatus).json(failureBody("WEBHOOK_SIGNATURE_INVALID"));
  }

  const orderId: string | undefined = payload?.payload?.payment?.entity?.order_id;
  if (orderId) {
    const eventType = payload?.event;
    if (eventType === "payment.captured") {
      await sessionService.updateByOrderId(orderId, "WEBHOOK_UPDATED", {
        webhookStatus: "PAYMENT_CAPTURED",
        webhookPaymentId: payload?.payload?.payment?.entity?.id,
      });
    } else if (eventType === "payment.failed") {
      await sessionService.updateByOrderId(orderId, "WEBHOOK_UPDATED", {
        webhookStatus: "PAYMENT_FAILED",
        webhookPaymentId: payload?.payload?.payment?.entity?.id,
      });
    }
  }

  return res.status(200).json({ ok: true });
});
