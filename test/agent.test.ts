import "./helpers/env-setup";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resetDatabase } from "./helpers/db";
import { handleMessage } from "../src/services/agentService";

// The conversational agent, on its deterministic floor (LLM_PROVIDER=mock => no
// client). This proves the "AI judgment" split: with NO LLM available, the agent
// still parses intent, negotiates a policy-bounded price, and takes payment — the
// LLM, when present, only rephrases language it never invents numbers.

function loose(v: unknown): Record<string, any> {
  return v as Record<string, any>;
}

beforeEach(async () => {
  await resetDatabase();
});

test("agent: parses a free-text quote and mints an offer, with no LLM in the loop", async () => {
  const turn = await handleMessage({ message: "quote 2 keyboards at 10% off" });

  assert.equal(turn.action, "QUOTE");
  assert.equal(turn.intent.sku, "KB-75-MECH");
  assert.equal(turn.intent.quantity, 2);
  assert.equal(turn.intent.requestedDiscountPct, 10);

  // Deterministic floor: neither understanding nor phrasing used a live model.
  assert.equal(turn.llm.intent.used, false);
  assert.equal(turn.llm.intent.fallback, true);
  assert.equal(turn.llm.reply.used, false);

  const neg = loose(turn.data.negotiation);
  assert.equal(neg.status, 200);
  assert.ok(neg.quote.offerId);

  // The reply carries the deterministic numbers verbatim (2 x KB at 10% off).
  assert.match(turn.reply, /10% off/);
  assert.match(turn.reply, /16198\.20/);
});

test("agent: a follow-up 'pay' checks out the pending offer in the same session", async () => {
  const quote = await handleMessage({ message: "quote 2 keyboards at 10% off" });
  const pay = await handleMessage({ message: "pay", sessionId: quote.sessionId });

  assert.equal(pay.sessionId, quote.sessionId);
  assert.equal(pay.action, "CHECKOUT");

  const checkout = loose(pay.data.checkout);
  assert.equal(checkout.status, 200);
  assert.equal(checkout.body.ok, true);
  assert.match(pay.reply, /Payment complete/);
});

test("agent: 'what do you sell' is understood as a catalog request", async () => {
  const turn = await handleMessage({ message: "what do you sell?" });
  assert.equal(turn.action, "CATALOG");
});
