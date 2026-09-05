import "./helpers/env-setup";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resetDatabase } from "./helpers/db";
import { ledgerService } from "../src/services/ledgerService";
import { negotiate } from "../src/services/negotiationService";
import { runCheckout } from "../src/services/checkoutService";

beforeEach(async () => {
  await resetDatabase();
});

test("ledger: adding events immediately reflects in list() without cache delay", async () => {
  // Initial empty check
  const initial = await ledgerService.list();
  assert.equal(initial.length, 0);

  // Add an entry
  await ledgerService.add({
    actor: "merchant",
    actionType: "OFFER_MINTED",
    explainability: "Test offer minted",
    payload: { sku: "KB-75-MECH" },
  });

  // Query immediately - must return 1 item (not cached 0)
  const afterAdd = await ledgerService.list();
  assert.equal(afterAdd.length, 1);
  assert.equal(afterAdd[0].actionType, "OFFER_MINTED");
  assert.equal(afterAdd[0].explainability, "Test offer minted");

  // Add second entry
  await ledgerService.add({
    actor: "buyer",
    actionType: "PAYMENT_SUCCEEDED",
    explainability: "Test payment completed",
    payload: { amountInPaise: 809910 },
  });

  // Query immediately - must return 2 items
  const afterSecondAdd = await ledgerService.list();
  assert.equal(afterSecondAdd.length, 2);
});

test("ledger: negotiation and checkout actions automatically record to ledger", async () => {
  const neg = await negotiate({ sku: "KB-75-MECH", quantity: 1, requestedDiscountPct: 5 }) as any;
  assert.equal(neg.status, 200);

  const eventsAfterQuote = await ledgerService.list();
  assert.ok(eventsAfterQuote.length >= 1);
  assert.ok(eventsAfterQuote.some((e) => e.actionType === "OFFER_MINTED"));

  const pay = await runCheckout({ offerId: neg.offer.offerId, receipt: "test-rcpt" }) as any;
  assert.equal(pay.status, 200);

  const eventsAfterPay = await ledgerService.list();
  assert.ok(eventsAfterPay.some((e) => e.actionType === "PAYMENT_SUCCEEDED"));
  assert.ok(eventsAfterPay.some((e) => e.actionType === "OFFER_CONSUMED"));
});
