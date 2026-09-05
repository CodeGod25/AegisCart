import "./helpers/env-setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bestIncentive,
  priceBundle,
  recommendCrossSell,
} from "../src/services/revenueService";
import { merchantPolicy } from "../src/data/catalog";

// The revenue engine grows revenue with PURELY deterministic pricing: the deepest
// discount that respects BOTH the discount cap and the margin floor. These pure
// tests pin the two binding constraints and the exact resulting numbers. No DB.

test("bestIncentive: margin floor binds before the discount cap (WR-4K-ULTRA)", () => {
  // marginFloorPrice = 2,440,000 / 0.8 = 3,050,000; max margin-safe discount is
  // floor((1 - 3050000/3299900) * 100) = floor(7.57) = 7%, below the 15% cap.
  const result = bestIncentive("WR-4K-ULTRA", 1);
  assert.equal(result.ok, true);
  assert.equal(result.bestDiscountPct, 7);
  assert.equal(result.bindingConstraint, "MARGIN_FLOOR");
  assert.ok(
    (result.resultingMarginPct ?? 0) >= merchantPolicy.minMarginPct,
    "resulting margin must stay at or above the floor"
  );
});

test("bestIncentive: discount cap binds when margin is comfortable (KB-75-MECH)", () => {
  // Margin-safe discount ~22% exceeds the 15% cap, so the cap is the binding limit.
  const result = bestIncentive("KB-75-MECH", 1);
  assert.equal(result.ok, true);
  assert.equal(result.bestDiscountPct, merchantPolicy.maxDiscountPct); // 15
  assert.equal(result.bindingConstraint, "DISCOUNT_CAP");
});

test("bestIncentive: clamps quantity to the per-order limit", () => {
  const result = bestIncentive("MS-ERG-PLUS", 10);
  assert.equal(result.ok, true);
  assert.equal(result.quantity, merchantPolicy.maxUnitsPerOrder); // 5
  // MS at 15% = 254,915/unit; 5 units => 1,274,575 paise.
  assert.equal(result.lineTotalInPaise, 1274575);
});

test("bestIncentive: unknown SKU is rejected, not guessed", () => {
  const result = bestIncentive("NOPE-000", 1);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "SKU_NOT_FOUND");
});

test("priceBundle: blends a margin-safe basket discount across items", () => {
  // KB (899900/560000) + WR (3299900/2440000): list 4,199,800; cost 3,000,000.
  // margin-safe discount floor((1 - 3750000/4199800)*100) = 10%, within the cap.
  const result = priceBundle([
    { sku: "KB-75-MECH", quantity: 1 },
    { sku: "WR-4K-ULTRA", quantity: 1 },
  ]);
  assert.equal(result.ok, true);
  assert.equal(result.lines?.length, 2);
  assert.equal(result.listTotalInPaise, 4199800);
  assert.equal(result.bundleDiscountPct, 10);
  assert.equal(result.savingsInPaise, 419980);
  assert.ok((result.blendedMarginPct ?? 0) >= merchantPolicy.minMarginPct);
});

test("priceBundle: an unknown SKU anywhere in the basket rejects the whole bundle", () => {
  const result = priceBundle([
    { sku: "KB-75-MECH", quantity: 1 },
    { sku: "BADSKU", quantity: 1 },
  ]);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "SKU_NOT_FOUND:BADSKU");
});

test("recommendCrossSell: returns complementary items with the upsell flagged", () => {
  const result = recommendCrossSell("KB-75-MECH");
  assert.equal(result.ok, true);
  assert.equal(result.anchorSku, "KB-75-MECH");
  assert.equal(result.recommendations?.length, 2);
  assert.equal(result.recommendations?.[0]?.sku, "MS-ERG-PLUS");
  assert.equal(result.recommendations?.[1]?.sku, "WR-4K-ULTRA");
  // WR is KB's upsell target, so its reason should read as an upgrade.
  assert.match(result.recommendations?.[1]?.reason ?? "", /upgrade/i);
});

test("recommendCrossSell: unknown SKU is rejected", () => {
  const result = recommendCrossSell("NOPE-000");
  assert.equal(result.ok, false);
  assert.equal(result.reason, "SKU_NOT_FOUND");
});
