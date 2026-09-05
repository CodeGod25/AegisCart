import "./helpers/env-setup";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resetDatabase } from "./helpers/db";
import { idempotencyService } from "../src/services/idempotencyService";

// Reserve-then-finalize idempotency. The first begin() reserves the key (NEW); a
// concurrent duplicate sees IN_FLIGHT; after finalize() a later begin() replays
// the stored response (DONE) instead of re-running the money action. A failed,
// still-reserved key can be released so a genuine retry is allowed.

beforeEach(async () => {
  await resetDatabase();
});

test("idempotency: reserve, detect in-flight duplicate, then replay the finalized result", async () => {
  const key = "idem-key-1";

  const first = await idempotencyService.begin(key);
  assert.equal(first.state, "NEW");

  const duplicate = await idempotencyService.begin(key);
  assert.equal(duplicate.state, "IN_FLIGHT");

  await idempotencyService.finalize(key, 200, { ok: true, paymentId: "pay_123" });

  const replay = await idempotencyService.begin(key);
  assert.ok(replay.state === "DONE");
  assert.equal(replay.statusCode, 200);
  assert.equal(replay.response.paymentId, "pay_123");
});

test("idempotency: release frees only a still-reserved key, and never a finalized one", async () => {
  // A finalized key is immutable: releasing it must not reopen it.
  const doneKey = "idem-done";
  await idempotencyService.begin(doneKey);
  await idempotencyService.finalize(doneKey, 200, { ok: true });
  await idempotencyService.release(doneKey);
  const afterReleaseDone = await idempotencyService.begin(doneKey);
  assert.equal(afterReleaseDone.state, "DONE");

  // An in-flight key whose action failed can be released so the retry re-executes.
  const flightKey = "idem-flight";
  await idempotencyService.begin(flightKey);
  await idempotencyService.release(flightKey);
  const afterReleaseFlight = await idempotencyService.begin(flightKey);
  assert.equal(afterReleaseFlight.state, "NEW");
});
