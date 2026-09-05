import crypto from "crypto";
import { env } from "../config/env";

// Internal HMAC signing for offers and mandates. Kept separate from the Razorpay
// signature service: this protects AegisCart's own policy-bounded artifacts (the
// agreed price, the spend envelope) from tampering between negotiation and payment.
export function signPayload(canonical: string): string {
  return crypto
    .createHmac("sha256", env.AEGIS_SIGNING_SECRET)
    .update(canonical)
    .digest("hex");
}

export function verifyPayload(canonical: string, signature: string): boolean {
  const expected = signPayload(canonical);
  const expectedBuf = Buffer.from(expected, "utf8");
  const providedBuf = Buffer.from(signature, "utf8");
  if (expectedBuf.length !== providedBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}
