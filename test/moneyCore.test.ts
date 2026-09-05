import "./helpers/env-setup";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resetDatabase } from "./helpers/db";
import { negotiate } from "../src/services/negotiationService";
import { runCheckout } from "../src/services/checkoutService";
import { offerService } from "../src/services/offerService";
import { computeMetrics } from "../src/services/revenueService";
import { simulationService } from "../src/services/simulationService";

// End-to-end money-core invariants against a private in-memory database. These are
// the "would you trust it" tests: a signed offer is required to pay, the agreed
// amount is server-derived, an offer can be paid at most once, a declined payment
// recovers, and the metrics reconcile to the ledger.

// negotiate()/runCheckout() return field-rich unions; widen for dynamic reads.
function loose(v: unknown): Record<string, any> {
  return v as Record<string, any>;
}

beforeEach(async () => {
  await resetDatabase();
});

test("checkout: pays a signed offer at the server-derived amount, exactly once", async () => {
  const neg = loose(await negotiate({ sku: "KB-75-MECH", quantity: 1, requestedDiscountPct: 10 }));
  assert.equal(neg.status, 200);
  const offerId: string = neg.offer.offerId;
  assert.ok(offerId);
  assert.equal(neg.quote.totalPriceInPaise, 809910); // round(899900 * 0.9)

  const pay = loose(await runCheckout({ offerId, receipt: "rcpt-1" }));
  assert.equal(pay.status, 200);
  assert.equal(pay.body.ok, true);
  assert.equal(pay.body.offerId, offerId);
  assert.equal(pay.body.amountInPaise, 809910, "amount is derived from the offer, not the caller");
  assert.ok(pay.body.paymentId);

  // The offer is now consumed and cannot be replayed — no double charge.
  const consumed = await offerService.get(offerId);
  assert.equal(consumed?.status, "CONSUMED");

  const replay = loose(await runCheckout({ offerId, receipt: "rcpt-2" }));
  assert.equal(replay.status, 422);
  assert.equal(replay.body.error, "OFFER_REJECTED");
  assert.equal(replay.body.reason, "OFFER_ALREADY_CONSUMED");
});

test("checkout: refuses a payment with no valid signed offer", async () => {
  const result = loose(await runCheckout({ offerId: "offer_does_not_exist", receipt: "rcpt" }));
  assert.equal(result.status, 422);
  assert.equal(result.body.error, "OFFER_REJECTED");
  assert.equal(result.body.reason, "OFFER_NOT_FOUND");
});

test("recovery: a declined payment leaves the offer payable, and the retry succeeds", async () => {
  const neg = loose(await negotiate({ sku: "MS-ERG-PLUS", quantity: 1, requestedDiscountPct: 0 }));
  assert.equal(neg.status, 200);
  const offerId: string = neg.offer.offerId;

  // Arm exactly one decline on the next payment attempt.
  simulationService.setFailNextPayment("PAYMENT_DECLINED");
  const declined = loose(await runCheckout({ offerId, receipt: "rcpt-a" }));
  assert.equal(declined.status, 402);
  assert.equal(declined.body.error, "PAYMENT_DECLINED");
  assert.equal(declined.body.retriable, true);

  // The offer must still be ACTIVE so the buyer can retry before it expires.
  const stillActive = await offerService.get(offerId);
  assert.equal(stillActive?.status, "ACTIVE");

  // Forced failure is read-and-clear, so the natural retry goes through.
  const retried = loose(await runCheckout({ offerId, receipt: "rcpt-b" }));
  assert.equal(retried.status, 200);
  assert.equal(retried.body.ok, true);
});

test("metrics: reconcile exactly to the ledger after one sale", async () => {
  const neg = loose(await negotiate({ sku: "KB-75-MECH", quantity: 2, requestedDiscountPct: 10 }));
  assert.equal(neg.status, 200);
  const pay = loose(await runCheckout({ offerId: neg.offer.offerId, receipt: "rcpt-m" }));
  assert.equal(pay.status, 200);

  const metrics = await computeMetrics();
  // Sale economics: 2 x KB at 10% off = 1,619,820 revenue; cost 1,120,000.
  assert.equal(metrics.sales.count, 1);
  assert.equal(metrics.sales.unitsSold, 2);
  assert.equal(metrics.sales.revenueInPaise, 1619820);
  assert.equal(metrics.sales.costOfGoodsInPaise, 1120000);
  assert.equal(metrics.sales.grossProfitInPaise, 499820);
  assert.equal(metrics.sales.listValueInPaise, 1799800);
  assert.equal(metrics.sales.discountGivenInPaise, 179980);
  // Funnel.
  assert.equal(metrics.funnel.offersMinted, 1);
  assert.equal(metrics.funnel.paymentsSucceeded, 1);
  assert.equal(metrics.funnel.paymentsFailed, 0);
  assert.equal(metrics.funnel.offerToSaleConversionPct, 100);
  assert.equal(metrics.topSellingSku, "KB-75-MECH");
});
