import { getDb } from "../db/client";

// Reserve-then-finalize idempotency for checkout. A key is inserted with a
// sentinel status_code = 0 (in-flight) before the money action runs, so a
// concurrent duplicate is detected rather than executed twice. On completion the
// row is finalized with the real status + response; a later retry replays it.
type BeginResult =
  | { state: "NEW" }
  | { state: "IN_FLIGHT" }
  | { state: "DONE"; statusCode: number; response: Record<string, unknown> };

class IdempotencyService {
  async begin(key: string): Promise<BeginResult> {
    const db = await getDb();
    const inserted = await db.run(
      `INSERT OR IGNORE INTO idempotency_keys (idempotency_key, created_at, status_code, response_json)
       VALUES (?, ?, 0, '')`,
      [key, new Date().toISOString()]
    );

    if (inserted.changes === 1) {
      return { state: "NEW" };
    }

    const row = await db.get<{ status_code: number; response_json: string }>(
      `SELECT status_code, response_json FROM idempotency_keys WHERE idempotency_key = ?`,
      [key]
    );

    if (!row || row.status_code === 0) {
      return { state: "IN_FLIGHT" };
    }

    return {
      state: "DONE",
      statusCode: row.status_code,
      response: row.response_json ? JSON.parse(row.response_json) : {},
    };
  }

  async finalize(key: string, statusCode: number, response: Record<string, unknown>): Promise<void> {
    const db = await getDb();
    await db.run(
      `UPDATE idempotency_keys SET status_code = ?, response_json = ? WHERE idempotency_key = ?`,
      [statusCode, JSON.stringify(response), key]
    );
  }

  // Frees a reservation whose money action failed unexpectedly, so a genuine
  // retry with the same key is allowed rather than being stuck IN_FLIGHT.
  async release(key: string): Promise<void> {
    const db = await getDb();
    await db.run(
      `DELETE FROM idempotency_keys WHERE idempotency_key = ? AND status_code = 0`,
      [key]
    );
  }
}

export const idempotencyService = new IdempotencyService();
