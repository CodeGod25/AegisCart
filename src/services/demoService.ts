import { getDb } from "../db/client";

export async function resetDemoData(): Promise<void> {
  const db = await getDb();
  await db.exec("BEGIN");
  try {
    await db.exec(`
      DELETE FROM agent_messages;
      DELETE FROM ledger_events;
      DELETE FROM approvals;
      DELETE FROM offers;
      DELETE FROM mandates;
      DELETE FROM checkout_sessions;
      DELETE FROM idempotency_keys;
    `);
    await db.exec("COMMIT");
  } catch (error) {
    await db.exec("ROLLBACK");
    throw error;
  }
}