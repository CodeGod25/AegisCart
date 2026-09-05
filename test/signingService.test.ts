import "./helpers/env-setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { signPayload, verifyPayload } from "../src/services/signingService";

// HMAC signing is what makes an offer/mandate tamper-evident: the agreed price and
// spend envelope cannot be altered between negotiation and payment. Pure crypto,
// no DB.

const canonical = "offer_1|KB-75-MECH|2|809910|1619820|10|INR||2026-01-01T00:00:00.000Z";

test("signing: is deterministic for the same canonical string", () => {
  assert.equal(signPayload(canonical), signPayload(canonical));
});

test("signing: verifies a genuine signature", () => {
  assert.equal(verifyPayload(canonical, signPayload(canonical)), true);
});

test("signing: rejects a tampered payload (price changed after signing)", () => {
  const signature = signPayload(canonical);
  const tampered = canonical.replace("1619820", "1000000"); // buyer lowers the total
  assert.equal(verifyPayload(tampered, signature), false);
});

test("signing: rejects a malformed/wrong-length signature without throwing", () => {
  // Guards timingSafeEqual against a length-mismatch throw.
  assert.equal(verifyPayload(canonical, "deadbeef"), false);
});

test("signing: different payloads produce different signatures", () => {
  assert.notEqual(signPayload("payload-a"), signPayload("payload-b"));
});
