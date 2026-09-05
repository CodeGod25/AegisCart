import "./helpers/env-setup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluatePolicy } from "../src/services/policyEngine";
import { catalog, merchantPolicy } from "../src/data/catalog";

// Pure, deterministic tests for the policy engine — the heart of "every money
// action is bounded". No database or LLM is involved. Fixtures below are traced
// by hand against the real catalog so the numeric expectations are exact.
//
//   KB-75-MECH  price 899900  cost 560000  (peripherals)
//   WR-4K-ULTRA price 3299900 cost 2440000 (displays)
//   MS-ERG-PLUS price 299900  cost 170000  (peripherals)
//   policy: maxDiscount 15%, minMargin 20%, maxUnits 5, riskThreshold 6,
//           highValue >= 5,000,000 paise

function item(sku: string) {
  const found = catalog.find((c) => c.sku === sku);
  if (!found) throw new Error(`test fixture missing SKU ${sku}`);
  return found;
}

test("policy: accepts an in-policy request and applies the exact discount", () => {
  const result = evaluatePolicy(item("KB-75-MECH"), 1, 10, merchantPolicy);
  assert.equal(result.allowed, true);
  assert.equal(result.effectiveDiscountPct, 10);
  assert.equal(result.requiresApproval, false);
  assert.deepEqual(result.reasons, []);
});

test("policy: clamps a discount above the cap instead of rejecting the order", () => {
  // 25% requested, cap is 15%. Margin at 15% for KB is ~26.8%, still above floor.
  const result = evaluatePolicy(item("KB-75-MECH"), 1, 25, merchantPolicy);
  assert.equal(result.allowed, true);
  assert.equal(result.effectiveDiscountPct, 15, "discount is clamped to the 15% cap");
  assert.ok(result.reasons.includes("DISCOUNT_CAPPED_TO_POLICY"));
});

test("policy: rejects a quantity above the per-order limit", () => {
  const result = evaluatePolicy(item("MS-ERG-PLUS"), 6, 0, merchantPolicy);
  assert.equal(result.allowed, false);
  assert.ok(result.reasons.includes("QUANTITY_EXCEEDS_LIMIT"));
});

test("policy: rejects when the margin floor would be breached", () => {
  // WR at 15% (within the cap) drops margin to ~13%, below the 20% floor.
  const result = evaluatePolicy(item("WR-4K-ULTRA"), 1, 15, merchantPolicy);
  assert.equal(result.allowed, false);
  assert.ok(result.reasons.includes("MARGIN_BELOW_POLICY_FLOOR"));
  // 15 is not GREATER than the 15 cap, so it must NOT be flagged as capped.
  assert.equal(result.reasons.includes("DISCOUNT_CAPPED_TO_POLICY"), false);
});

test("policy: holds a high-value order for human approval", () => {
  // WR x2 at list = 6,599,800 paise, above the 5,000,000 high-value gate.
  const result = evaluatePolicy(item("WR-4K-ULTRA"), 2, 0, merchantPolicy);
  assert.equal(result.allowed, true);
  assert.equal(result.requiresApproval, true);
  assert.ok(result.reasons.includes("REQUIRES_HUMAN_APPROVAL"));
  assert.ok(result.reasons.includes("HIGH_VALUE_ORDER"));
});

test("policy: holds a high-risk order (capped + max qty) for approval, without high value", () => {
  // MS x5 at 25% requested: risk = 4 (over cap) + 2 (at max units) = 6 >= threshold.
  // Order value ~1.27M paise stays below the high-value gate.
  const result = evaluatePolicy(item("MS-ERG-PLUS"), 5, 25, merchantPolicy);
  assert.equal(result.allowed, true);
  assert.equal(result.riskScore, 6);
  assert.equal(result.requiresApproval, true);
  assert.ok(result.reasons.includes("REQUIRES_HUMAN_APPROVAL"));
  assert.ok(result.reasons.includes("DISCOUNT_CAPPED_TO_POLICY"));
  assert.equal(result.reasons.includes("HIGH_VALUE_ORDER"), false);
});
