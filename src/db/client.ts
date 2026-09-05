import fs from "fs";
import path from "path";
import { Database, open } from "sqlite";
import sqlite3 from "sqlite3";
import { env } from "../config/env";

type SqliteDb = Database<sqlite3.Database, sqlite3.Statement>;

let dbPromise: Promise<SqliteDb> | null = null;
let dbInstance: SqliteDb | null = null;

async function createDatabase(): Promise<SqliteDb> {
  // ":memory:" (used by the test suite) is a private in-memory database — never a
  // file — so tests are fully isolated and never touch the real data directory.
  const isMemory = env.SQLITE_DB_PATH === ":memory:";
  const dbPath = isMemory ? ":memory:" : path.join(process.cwd(), env.SQLITE_DB_PATH);
  if (!isMemory) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }

  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database,
  });

  // WAL is a no-op for an in-memory database; only meaningful for a file-backed one.
  if (!isMemory) {
    await db.exec("PRAGMA journal_mode = WAL;");
  }
  await db.exec("PRAGMA foreign_keys = ON;");

  await db.exec(`
    CREATE TABLE IF NOT EXISTS ledger_events (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      actor TEXT NOT NULL,
      action_type TEXT NOT NULL,
      explainability TEXT NOT NULL,
      payload_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS checkout_sessions (
      session_id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      order_id TEXT,
      amount_in_paise INTEGER NOT NULL,
      currency TEXT NOT NULL,
      receipt TEXT NOT NULL,
      status TEXT NOT NULL,
      metadata_json TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_checkout_sessions_order_id
      ON checkout_sessions(order_id);

    CREATE TABLE IF NOT EXISTS webhook_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT,
      event_type TEXT,
      signature_valid INTEGER NOT NULL,
      payload_json TEXT NOT NULL,
      received_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS offers (
      offer_id TEXT PRIMARY KEY,
      sku TEXT NOT NULL,
      name TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price_in_paise INTEGER NOT NULL,
      total_in_paise INTEGER NOT NULL,
      discount_pct REAL NOT NULL,
      currency TEXT NOT NULL,
      mandate_id TEXT,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      status TEXT NOT NULL,
      signature TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS mandates (
      mandate_id TEXT PRIMARY KEY,
      buyer TEXT NOT NULL,
      max_total_paise INTEGER NOT NULL,
      max_per_order_paise INTEGER NOT NULL,
      allowed_categories_json TEXT NOT NULL,
      spent_paise INTEGER NOT NULL,
      currency TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      status TEXT NOT NULL,
      signature TEXT NOT NULL,
      -- Recurring mandate fields
      recurrence_type TEXT NULL, -- NULL for one-time, otherwise 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'
      recurrence_interval INTEGER NOT NULL DEFAULT 1,
      next_renewal_at TEXT NULL, -- When the mandate should next renew (NULL for one-time or if no more renewals)
      renewal_count INTEGER NOT NULL DEFAULT 0,
      max_renewals INTEGER NULL, -- NULL for unlimited renewals
      reset_spent_on_renewal INTEGER NOT NULL DEFAULT 1 -- 0 = false, 1 = true
    );

    -- Index for efficient mandate lookup by buyer and status
    CREATE INDEX IF NOT EXISTS idx_mandates_buyer_status ON mandates(buyer, status);

    CREATE TABLE IF NOT EXISTS approvals (
      approval_id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      status TEXT NOT NULL,
      kind TEXT NOT NULL,
      reasons_json TEXT NOT NULL,
      risk_score INTEGER NOT NULL,
      proposed_action_json TEXT NOT NULL,
      resolution TEXT,
      decided_by TEXT
    );

    CREATE TABLE IF NOT EXISTS idempotency_keys (
      idempotency_key TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      status_code INTEGER NOT NULL,
      response_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agent_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT,
      created_at TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      structured_json TEXT
    );

    -- Index for efficient session-based message lookup
    CREATE INDEX IF NOT EXISTS idx_agent_messages_session_id ON agent_messages(session_id);
  `);

  dbInstance = db;
  return db;
}

export async function initializeDatabase(): Promise<void> {
  if (!dbPromise) {
    dbPromise = createDatabase();
  }

  await dbPromise;
}

export async function getDb(): Promise<SqliteDb> {
  if (!dbPromise) {
    dbPromise = createDatabase();
  }

  return dbPromise;
}

export async function closeDatabase(): Promise<void> {
  if (dbInstance) {
    await dbInstance.close();
    dbInstance = null;
  }
  dbPromise = null; // reset the promise so we can reinitialize if needed
}
