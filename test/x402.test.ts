import "./helpers/env-setup";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resetDatabase } from "./helpers/db";
import { offerService } from "../src/services/offerService";
import { runCheckout } from "../src/services/checkoutService";
import { x402Service, X402_SCHEME } from "../src/services/x402Service";

// x402 handshake over the deterministic money core. The challenge advertises the
// signed offer's exact total and signature; the payment header is decoded and then
// settled through the SAME runCheckout used by /checkout/pay, so no new money math
// is introduced and the offer is single-use across both doors.

beforeEach(async () => {
  await resetDatabase();
});

async function mintTestOffer() {
  return offerService.mint({
    sku: "KB-75-MECH",
    name: "Aegis 75% Mechanical Keyboard",
    quantity: 1,
    unitPriceInPaise: 899900,
    totalInPaise: 899900,
    discountPct: 0,
    currency: "INR",
    mandateId: null,
  });
}

function encodePayment(obj: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(obj), "utf8").toString("base64");
}

test("x402: challenge advertises the signed offer's exact total and signature", async () => {
  const offer = await mintTestOffer();
  const challenge = await x402Service.challenge(offer.offerId, "/x402/checkout");
  assert.ok(challenge);
  assert.equal(challenge.x402Version, 1);
  assert.equal(challenge.error, "PAYMENT_REQUIRED");
  const req = challenge.accepts[0];
  assert.ok(req);
  assert.equal(req.scheme, X402_SCHEME);
  assert.equal(req.maxAmountRequired, 899900);
  assert.equal(req.offerId, offer.offerId);
  assert.equal(req.signature, offer.signature); // client can verify before paying
});

test("x402: challenge for an unknown offer is null (route answers 404)", async () => {
  const challenge = await x402Service.challenge("offer_does_not_exist", "/x402/checkout");
  assert.equal(challenge, null);
});

test("x402: decodePayment rejects missing, malformed, and wrong-scheme headers", async () => {
  assert.equal(x402Service.decodePayment(undefined).ok, false);

  const malformed = x402Service.decodePayment("!!!not-base64-json!!!");
  assert.equal(malformed.ok, false);

  const wrongScheme = x402Service.decodePayment(
    encodePayment({ scheme: "some-other-scheme", offerId: "offer_x" })
  );
  assert.equal(wrongScheme.ok, false);
  if (!wrongScheme.ok) assert.equal(wrongScheme.reason, "X402_SCHEME_UNSUPPORTED");

  const noOffer = x402Service.decodePayment(encodePayment({ scheme: X402_SCHEME }));
  assert.equal(noOffer.ok, false);
});

test("x402: a well-formed payment header decodes to the offer being settled", async () => {
  const decoded = x402Service.decodePayment(
    encodePayment({ scheme: X402_SCHEME, offerId: "offer_abc", receipt: "r-1" })
  );
  assert.ok(decoded.ok);
  if (decoded.ok) {
    assert.equal(decoded.payload.offerId, "offer_abc");
    assert.equal(decoded.payload.receipt, "r-1");
  }
});

test("x402: settling a valid offer through the money core succeeds once, then the offer is single-use", async () => {
  const offer = await mintTestOffer();

  const decoded = x402Service.decodePayment(
    encodePayment({ scheme: X402_SCHEME, offerId: offer.offerId, receipt: "x402-settle" })
  );
  assert.ok(decoded.ok);

  const first = await runCheckout({ offerId: offer.offerId, receipt: "x402-settle" });
  assert.equal(first.status, 200);
  assert.equal(first.body.ok, true);
  assert.equal(first.body.amountInPaise, 899900);

  // The offer is consumed — a replay through either checkout door is refused.
  const replay = await runCheckout({ offerId: offer.offerId, receipt: "x402-settle-2" });
  assert.equal(replay.status, 422);
  assert.equal(replay.body.reason, "OFFER_ALREADY_CONSUMED");
});
