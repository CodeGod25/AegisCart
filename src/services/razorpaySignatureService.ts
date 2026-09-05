import crypto from "crypto";

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");

  if (aBuf.length !== bBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(aBuf, bBuf);
}

export function verifyCheckoutSignature(
  orderId: string,
  paymentId: string,
  signature: string,
  keySecret: string
): boolean {
  const body = `${orderId}|${paymentId}`;
  const expected = crypto.createHmac("sha256", keySecret).update(body).digest("hex");
  return safeEqual(expected, signature);
}

export function verifyWebhookSignature(
  rawBody: Buffer,
  signature: string,
  webhookSecret: string
): boolean {
  const expected = crypto.createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
  return safeEqual(expected, signature);
}
