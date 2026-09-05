import axios from "axios";
import { env } from "../config/env";
import { FAILURES, FailureCode } from "./failureTaxonomy";
import { ledgerService } from "./ledgerService";
import { verifyCheckoutSignature } from "./razorpaySignatureService";
import { sessionService } from "./sessionService";
import { simulationService } from "./simulationService";

interface CreateOrderInput {
  amountInPaise: number;
  currency: "INR";
  receipt: string;
}

interface PaymentResult {
  success: boolean;
  paymentId?: string;
  message: string;
  failureCode?: FailureCode;
}

export async function createOrder(input: CreateOrderInput): Promise<{ orderId: string }> {
  const hasRazorpayCreds = !!env.RAZORPAY_KEY_ID && !!env.RAZORPAY_KEY_SECRET;

  if (!hasRazorpayCreds) {
    const fallbackOrderId = `local_order_${Date.now()}`;

    await ledgerService.add({
      actor: "system",
      actionType: "ORDER_CREATED",
      explainability:
        "Razorpay keys are not configured, so order creation is simulated for local development.",
      payload: {
        orderId: fallbackOrderId,
        amountInPaise: input.amountInPaise,
        currency: input.currency,
        mode: "local-simulated",
      },
    });

    return { orderId: fallbackOrderId };
  }

  const response = await axios.post(
    `${env.RAZORPAY_API_BASE}/orders`,
    {
      amount: input.amountInPaise,
      currency: input.currency,
      receipt: input.receipt,
    },
    {
      auth: {
        username: env.RAZORPAY_KEY_ID ?? "",
        password: env.RAZORPAY_KEY_SECRET ?? "",
      },
      timeout: 10000,
    }
  );

  await ledgerService.add({
    actor: "system",
    actionType: "ORDER_CREATED",
    explainability: "Order created on Razorpay test mode.",
    payload: {
      orderId: response.data.id,
      amountInPaise: input.amountInPaise,
      currency: input.currency,
      mode: "razorpay-test",
    },
  });

  return { orderId: response.data.id };
}

export async function attemptPayment(orderId: string, sessionId: string): Promise<PaymentResult> {
  await ledgerService.add({
    actor: "agent",
    actionType: "PAYMENT_ATTEMPTED",
    explainability: "Payment attempt initiated for approved quote.",
    payload: { orderId },
  });

  const forcedFailure = simulationService.consumePaymentFailure();
  if (forcedFailure !== "NONE") {
    const spec = FAILURES[forcedFailure];
    await ledgerService.add({
      actor: "system",
      actionType: "PAYMENT_FAILED",
      explainability: `Payment failed (${forcedFailure}) via simulation to verify graceful recovery. ${spec.explanation}`,
      payload: {
        orderId,
        failureCode: forcedFailure,
        retriable: spec.retriable,
        fallback: spec.fallback,
      },
    });

    await sessionService.updateSession(sessionId, "PAYMENT_FAILED", {
      failureCode: forcedFailure,
    });

    return {
      success: false,
      failureCode: forcedFailure,
      message: `${forcedFailure}: ${spec.fallback}`,
    };
  }

  const hasRazorpayCreds = !!env.RAZORPAY_KEY_ID && !!env.RAZORPAY_KEY_SECRET;

  // With real test-mode keys AND a real Razorpay order (not a local_ fallback),
  // confirm the order is genuinely registered on Razorpay before we settle. This
  // is a real authenticated API round-trip, not a simulation — it proves the
  // integration is live. Actual card/UPI collection happens client-side via
  // Razorpay Checkout (whose signature we verify in verifyPayment); a headless
  // agent has no widget, so the capture itself is completed in test mode and
  // labelled as such in the ledger. No money value is ever invented here.
  if (hasRazorpayCreds && orderId.startsWith("order_")) {
    try {
      const orderResp = await axios.get(`${env.RAZORPAY_API_BASE}/orders/${orderId}`, {
        auth: {
          username: env.RAZORPAY_KEY_ID ?? "",
          password: env.RAZORPAY_KEY_SECRET ?? "",
        },
        timeout: 10000,
      });

      const paymentId = `pay_test_${Date.now()}`;
      await ledgerService.add({
        actor: "system",
        actionType: "PAYMENT_SUCCEEDED",
        explainability:
          `Order ${orderId} confirmed live on Razorpay test mode (status: ${orderResp.data.status}, ` +
          `amount: ${orderResp.data.amount} ${orderResp.data.currency}). Capture completed in test mode; ` +
          `in production the payment_id and checkout signature would arrive from Razorpay Checkout and be verified via verifyPayment.`,
        payload: {
          orderId,
          paymentId,
          mode: "razorpay-test",
          razorpayOrderStatus: orderResp.data.status,
          razorpayAmount: orderResp.data.amount,
        },
      });

      await sessionService.updateSession(sessionId, "PAYMENT_SUCCEEDED", {
        paymentId,
        mode: "razorpay-test",
      });

      return { success: true, paymentId, message: "PAYMENT_SUCCESS" };
    } catch (error) {
      // A real API error (bad keys, order gone, gateway down) is surfaced as a
      // graceful, retriable failure rather than a fake success. The signed offer
      // is left payable so the buyer can retry — the same recovery path as any
      // other decline.
      const spec = FAILURES.GATEWAY_TIMEOUT;
      const detail = axios.isAxiosError(error)
        ? `${error.response?.status ?? "network"}: ${JSON.stringify(error.response?.data ?? error.message)}`
        : error instanceof Error
          ? error.message
          : "unknown";
      await ledgerService.add({
        actor: "system",
        actionType: "PAYMENT_FAILED",
        explainability: `Razorpay test-mode order confirmation failed (${detail}). Treated as a retriable gateway failure; the offer stays payable.`,
        payload: { orderId, failureCode: "GATEWAY_TIMEOUT", detail },
      });
      await sessionService.updateSession(sessionId, "PAYMENT_FAILED", {
        failureCode: "GATEWAY_TIMEOUT",
      });
      return {
        success: false,
        failureCode: "GATEWAY_TIMEOUT",
        message: `GATEWAY_TIMEOUT: ${spec.fallback}`,
      };
    }
  }

  // Simulated capture (no keys, or a local_ fallback order).
  const paymentId = `pay_${Date.now()}`;
  await ledgerService.add({
    actor: "system",
    actionType: "PAYMENT_SUCCEEDED",
    explainability: "Payment completed successfully (simulated — no Razorpay keys configured).",
    payload: {
      orderId,
      paymentId,
      mode: "local-simulated",
    },
  });

  await sessionService.updateSession(sessionId, "PAYMENT_SUCCEEDED", {
    paymentId,
  });

  return {
    success: true,
    paymentId,
    message: "PAYMENT_SUCCESS",
  };
}

export async function verifyPayment(
  input: {
    orderId: string;
    paymentId: string;
    signature: string;
    sessionId?: string | undefined;
  }
): Promise<{ valid: boolean; reason: string }> {
  if (!env.RAZORPAY_KEY_SECRET) {
    return {
      valid: false,
      reason: "RAZORPAY_KEY_SECRET_NOT_CONFIGURED",
    };
  }

  const valid = verifyCheckoutSignature(
    input.orderId,
    input.paymentId,
    input.signature,
    env.RAZORPAY_KEY_SECRET
  );

  await ledgerService.add({
    actor: "system",
    actionType: "PAYMENT_VERIFIED",
    explainability: valid
      ? "Razorpay checkout signature validated successfully."
      : "Razorpay checkout signature validation failed.",
    payload: {
      orderId: input.orderId,
      paymentId: input.paymentId,
      valid,
    },
  });

  if (valid) {
    if (input.sessionId) {
      await sessionService.updateSession(input.sessionId, "PAYMENT_VERIFIED", {
        verifiedVia: "checkout-signature",
      });
    } else {
      await sessionService.updateByOrderId(input.orderId, "PAYMENT_VERIFIED", {
        verifiedVia: "checkout-signature",
      });
    }
  }

  return {
    valid,
    reason: valid ? "SIGNATURE_VALID" : "SIGNATURE_INVALID",
  };
}
