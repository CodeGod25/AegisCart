// Shared database + simulation reset for integration tests. Import this AFTER
// "./env-setup" so the in-memory DB path is already in place when getDb() runs.
//
// getDb() creates the schema on first call (CREATE TABLE IF NOT EXISTS), so the
// first resetDatabase() also initializes the in-memory database. Because the DB
// is ":memory:" and getDb() memoizes one connection per process, and node:test
// runs each test FILE in its own process, every file gets a private database.
import { getDb } from "../../src/db/client";
import { simulationService } from "../../src/services/simulationService";

const TABLES = [
  "ledger_events",
  "checkout_sessions",
  "webhook_events",
  "offers",
  "mandates",
  "approvals",
  "idempotency_keys",
  "agent_messages",
];

// Clear every table and disarm any injected failure, so each test starts clean.
export async function resetDatabase(): Promise<void> {
  const db = await getDb();
  for (const table of TABLES) {
    await db.exec(`DELETE FROM ${table};`);
  }
  simulationService.reset();
}
