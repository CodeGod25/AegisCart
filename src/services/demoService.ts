import { getDb } from "../db/client";
import { cacheService } from "./cacheService";

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
    cacheService.clearQueryCache("ledger_list_");
  } catch (error) {
    await db.exec("ROLLBACK");
    throw error;
  }
}