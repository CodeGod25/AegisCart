import "./helpers/env-setup";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resetDatabase } from "./helpers/db";
import { negotiate } from "../src/services/negotiationService";
import { runCheckout } from "../src/services/checkoutService";
import { mandateService } from "../src/services/mandateService";

// The spend mandate is the buyer-side bound: an order acceptable to the merchant
// is still refused if it falls outside the buyer's signed envelope (category,
// per-order cap, remaining budget). The mandate is debited only after a payment
// actually succeeds. In-memory DB, reset per test.

function loose(v: unknown): Record<string, any> {
  return v as Record<string, any>;
}

beforeEach(async () => {
  await resetDatabase();
});

test("mandate: an order within the signed envelope mints an offer", async () => {
  const mandate = await mandateService.create({
    buyer: "buyer-1",
    maxTotalPaise: 2_000_000,
    maxPerOrderPaise: 1_000_000,
    allowedCategories: ["peripherals"],
  });
  const neg = loose(
    await negotiate({
      sku: "KB-75-MECH", // peripherals, total 899,900
      quantity: 1,
      requestedDiscountPct: 0,
      mandateId: mandate.mandateId,
    })
  );
  assert.equal(neg.status, 200);
  assert.ok(neg.offer.offerId);
});

test("mandate: an out-of-category order is refused before any offer is minted", async () => {
  const mandate = await mandateService.create({
    buyer: "buyer-2",
    maxTotalPaise: 10_000_000,
    maxPerOrderPaise: 10_000_000,
    allowedCategories: ["peripherals"], // WR-4K-ULTRA is a display
  });
  const neg = loose(
    await negotiate({
      sku: "WR-4K-ULTRA",
      quantity: 1,
      requestedDiscountPct: 0,
      mandateId: mandate.mandateId,
    })
  );
  assert.equal(neg.ok, false);
  assert.equal(neg.status, 422);
  assert.equal(neg.message, "MANDATE_REJECTED");
  assert.equal(neg.reason, "MANDATE_CATEGORY_NOT_ALLOWED");
});

test("mandate: an order over the remaining budget is refused", async () => {
  const mandate = await mandateService.create({
    buyer: "buyer-3",
    maxTotalPaise: 500_000, // KB costs 899,900 — over budget
    maxPerOrderPaise: 5_000_000,
    allowedCategories: [],
  });
  const neg = loose(
    await negotiate({
      sku: "KB-75-MECH",
      quantity: 1,
      requestedDiscountPct: 0,
      mandateId: mandate.mandateId,
    })
  );
  assert.equal(neg.ok, false);
  assert.equal(neg.reason, "MANDATE_BUDGET_EXCEEDED");
});

test("mandate: is debited exactly once, only after the payment succeeds", async () => {
  const mandate = await mandateService.create({
    buyer: "buyer-4",
    maxTotalPaise: 2_000_000,
    maxPerOrderPaise: 1_000_000,
    allowedCategories: [],
  });
  const neg = loose(
    await negotiate({
      sku: "KB-75-MECH",
      quantity: 1,
      requestedDiscountPct: 0,
      mandateId: mandate.mandateId,
    })
  );
  assert.equal(neg.status, 200);

  // Not debited until payment happens.
  const beforePay = await mandateService.get(mandate.mandateId);
  assert.equal(beforePay?.spentPaise, 0);

  const pay = loose(await runCheckout({ offerId: neg.offer.offerId, receipt: "rcpt-mnd" }));
  assert.equal(pay.status, 200);

  const afterPay = await mandateService.get(mandate.mandateId);
  assert.equal(afterPay?.spentPaise, 899900);
  assert.equal(afterPay?.status, "ACTIVE"); // 1,100,100 remains, above the per-order cap
});
