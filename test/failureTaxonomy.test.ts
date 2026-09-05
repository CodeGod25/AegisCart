import "./helpers/env-setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { FAILURES, failureBody, FailureCode } from "../src/services/failureTaxonomy";

// The failure taxonomy turns "one failure handled gracefully" into a documented
// contract: every failure has a stable code, an HTTP status, a retriable flag and
// a concrete fallback. Pure data, no DB.

test("taxonomy: every entry's code matches its map key and carries guidance", () => {
  for (const [key, spec] of Object.entries(FAILURES)) {
    assert.equal(spec.code, key, `${key} spec.code should equal its key`);
    assert.ok(spec.explanation.length > 0, `${key} needs an explanation`);
    assert.ok(spec.fallback.length > 0, `${key} needs a fallback`);
    assert.ok(spec.httpStatus >= 200 && spec.httpStatus < 600, `${key} needs a valid status`);
  }
});

test("taxonomy: HTTP status, category and retriability are stable per code", () => {
  const expected: Record<FailureCode, { httpStatus: number; retriable: boolean; category: string }> = {
    PAYMENT_DECLINED: { httpStatus: 402, retriable: true, category: "payment" },
    GATEWAY_TIMEOUT: { httpStatus: 504, retriable: true, category: "payment" },
    INSUFFICIENT_STOCK: { httpStatus: 409, retriable: false, category: "inventory" },
    WEBHOOK_SIGNATURE_INVALID: { httpStatus: 400, retriable: false, category: "security" },
    LLM_UNAVAILABLE: { httpStatus: 200, retriable: true, category: "ai" },
  };
  for (const code of Object.keys(expected) as FailureCode[]) {
    const spec = FAILURES[code];
    const want = expected[code];
    assert.equal(spec.httpStatus, want.httpStatus, `${code} httpStatus`);
    assert.equal(spec.retriable, want.retriable, `${code} retriable`);
    assert.equal(spec.category, want.category, `${code} category`);
  }
});

test("taxonomy: failureBody builds a uniform caller-facing envelope with extras merged", () => {
  const body = failureBody("PAYMENT_DECLINED", { offerId: "offer_1", orderId: "order_1" });
  assert.equal(body.ok, false);
  assert.equal(body.error, "PAYMENT_DECLINED");
  assert.equal(body.reason, FAILURES.PAYMENT_DECLINED.explanation);
  assert.equal(body.retriable, true);
  assert.equal(body.fallback, FAILURES.PAYMENT_DECLINED.fallback);
  assert.equal(body.offerId, "offer_1");
  assert.equal(body.orderId, "order_1");
});
