import { offerService } from "./offerService";
import { Offer } from "../types/domain";

/**
 * x402 — HTTP 402 "Payment Required" handshake, implemented over AegisCart's
 * existing deterministic money core.
 *
 * The x402 pattern is a two-step challenge/settle loop:
 *   1. A client requests a paid resource with no payment. The server answers
 *      402 with a machine-readable list of payment requirements (`accepts`).
 *   2. The client re-requests with an `X-PAYMENT` header carrying proof it has
 *      satisfied one of those requirements. The server verifies, grants the
 *      resource, and returns settlement details in `X-PAYMENT-RESPONSE`.
 *
 * We do NOT invent a new price here. The payment requirement is a signed,
 * policy-bounded offer that the offer/negotiation layer already minted — so the
 * 402 front door inherits every guarantee of the money core (tamper-evident
 * price, mandate envelope, idempotency, ledger) and adds no new trust surface.
 */

export const X402_VERSION = 1;
export const X402_SCHEME = "aegiscart-signed-offer";
export const X402_NETWORK = "razorpay-test-mode";

export interface X402PaymentRequirement {
  scheme: string;
  network: string;
  resource: string;
  description: string;
  mimeType: string;
  payTo: string;
  maxAmountRequired: number; // paise — the exact signed-offer total
  currency: "INR";
  offerId: string;
  expiresAt: string;
  signature: string; // the offer's HMAC — lets a client verify before paying
}

export interface X402Challenge {
  x402Version: number;
  error: "PAYMENT_REQUIRED";
  message: string;
  accepts: X402PaymentRequirement[];
}

// What a client packs (base64 JSON) into the `X-PAYMENT` request header.
export interface X402PaymentPayload {
  x402Version: number;
  scheme: string;
  offerId: string;
  receipt?: string;
  idempotencyKey?: string;
}

// What the server packs (base64 JSON) into the `X-PAYMENT-RESPONSE` header on success.
export interface X402SettlementReceipt {
  x402Version: number;
  scheme: string;
  network: string;
  success: true;
  offerId: string;
  orderId: string;
  paymentId: string;
  amountInPaise: number;
  currency: "INR";
}

function requirementFor(offer: Offer, resource: string): X402PaymentRequirement {
  return {
    scheme: X402_SCHEME,
    network: X402_NETWORK,
    resource,
    description: `Pay the signed, policy-bounded offer ${offer.offerId} for ${offer.quantity} x ${offer.sku}.`,
    mimeType: "application/json",
    payTo: "merchant-aegis-demo",
    maxAmountRequired: offer.totalInPaise,
    currency: offer.currency,
    offerId: offer.offerId,
    expiresAt: offer.expiresAt,
    signature: offer.signature,
  };
}

class X402Service {
  // Build the 402 body for an unpaid offer. Returns null if the offer is unknown,
  // so the route can answer 404 rather than advertise a non-existent requirement.
  async challenge(offerId: string, resource: string): Promise<X402Challenge | null> {
    const offer = await offerService.get(offerId);
    if (!offer) return null;
    return {
      x402Version: X402_VERSION,
      error: "PAYMENT_REQUIRED",
      message:
        "This resource requires payment. Satisfy one of `accepts` and retry with an X-PAYMENT header.",
      accepts: [requirementFor(offer, resource)],
    };
  }

  // Parse and shallow-validate the client's X-PAYMENT header. Returns a stable
  // reason code on any structural problem so the audit trail stays uniform.
  decodePayment(
    header: string | undefined
  ): { ok: true; payload: X402PaymentPayload } | { ok: false; reason: string } {
    if (!header) return { ok: false, reason: "X402_PAYMENT_HEADER_MISSING" };
    let json: unknown;
    try {
      json = JSON.parse(Buffer.from(header, "base64").toString("utf8"));
    } catch {
      return { ok: false, reason: "X402_PAYMENT_HEADER_MALFORMED" };
    }
    if (!json || typeof json !== "object") {
      return { ok: false, reason: "X402_PAYMENT_HEADER_MALFORMED" };
    }
    const p = json as Record<string, unknown>;
    if (p.scheme !== X402_SCHEME) {
      return { ok: false, reason: "X402_SCHEME_UNSUPPORTED" };
    }
    if (typeof p.offerId !== "string" || !p.offerId) {
      return { ok: false, reason: "X402_OFFER_ID_MISSING" };
    }
    const payload: X402PaymentPayload = {
      x402Version: typeof p.x402Version === "number" ? p.x402Version : X402_VERSION,
      scheme: X402_SCHEME,
      offerId: p.offerId,
      ...(typeof p.receipt === "string" ? { receipt: p.receipt } : {}),
      ...(typeof p.idempotencyKey === "string" ? { idempotencyKey: p.idempotencyKey } : {}),
    };
    return { ok: true, payload };
  }

  encodeSettlement(r: X402SettlementReceipt): string {
    return Buffer.from(JSON.stringify(r), "utf8").toString("base64");
  }
}

export const x402Service = new X402Service();
