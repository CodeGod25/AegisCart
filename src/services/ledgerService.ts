import { EventEmitter } from "node:events";
import { v4 as uuidv4 } from "uuid";
import { getDb } from "../db/client";
import { Actor, MoneyAction } from "../types/domain";
import { cacheService } from "./cacheService";

interface ListOptions {
  limit?: number;
  offset?: number;
  orderBy?: "ASC" | "DESC";
}

class LedgerService {
  // In-process notifications for the console's live SSE stream (GET /ledger/stream).
  // This is strictly a real-time convenience: the durable, authoritative record is
  // always the ledger_events table, which list() re-reads. Streaming can never
  // affect a write.
  readonly emitter = new EventEmitter();

  constructor() {
    // Many console tabs may subscribe at once; don't emit a false leak warning.
    this.emitter.setMaxListeners(0);
  }

  async add(event: Omit<MoneyAction, "id" | "timestamp">): Promise<MoneyAction> {
    const startTime = Date.now();
    const db = await getDb();
    const entry: MoneyAction = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      ...event,
    };

    await db.run(
      `INSERT INTO ledger_events (id, timestamp, actor, action_type, explainability, payload_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        entry.id,
        entry.timestamp,
        entry.actor,
        entry.actionType,
        entry.explainability,
        JSON.stringify(entry.payload),
      ]
    );

    // Notify open SSE listeners. Best-effort: a listener error must never break the
    // write path, since the durable insert above has already succeeded.
    try {
      this.emitter.emit("append", entry);
    } catch {
      /* streaming is best-effort */
    }

    const duration = Date.now() - startTime;
    if (duration > 50) { // Log if write takes more than 50ms
      console.info(`Ledger write completed in ${duration}ms`);
    }

    return entry;
  }

  /**
   * List ledger events with optional pagination
   * @param options Pagination and ordering options
   */
  async list(options: ListOptions = {}): Promise<MoneyAction[]> {
    const startTime = Date.now();
    const { limit, offset, orderBy = "ASC" } = options;

    // Create cache key based on pagination options
    const cacheKey = `ledger_list_${limit ?? 'all'}_${offset ?? 0}_${orderBy}`;

    // Use cache service for database query results
    const result = await cacheService.cacheQuery(
      cacheKey,
      async () => {
        const db = await getDb();

        // Build query with pagination
        let query = `
          SELECT id, timestamp, actor, action_type, explainability, payload_json
          FROM ledger_events
          ORDER BY timestamp ${orderBy}
        `;

        const params: any[] = [];

        if (limit !== undefined) {
          query += " LIMIT ?";
          params.push(limit);

          if (offset !== undefined) {
            query += " OFFSET ?";
            params.push(offset);
          }
        }

        const rows = await db.all<
          {
            id: string;
            timestamp: string;
            actor: Actor;
            action_type: MoneyAction["actionType"];
            explainability: string;
            payload_json: string;
          }[]
        >(query, params);

        return rows.map((row) => ({
          id: row.id,
          timestamp: row.timestamp,
          actor: row.actor,
          actionType: row.action_type,
          explainability: row.explainability,
          payload: row.payload_json ? JSON.parse(row.payload_json) : {},
        }));
      },
      // Shorter TTL for ledger data since it changes frequently
      10 * 1000 // 10 seconds
    );

    const duration = Date.now() - startTime;
    if (duration > 100) { // Log if query takes more than 100ms
      console.info(`Ledger query (${JSON.stringify(options)}) completed in ${duration}ms`);
    }

    return result;
  }

  async clear(): Promise<void> {
    const startTime = Date.now();
    const db = await getDb();
    await db.run("DELETE FROM ledger_events");

    // Clear ledger-related cache entries when data is cleared
    // This is a simple approach - in production we might want more granular cache invalidation
    cacheService.clearQueryCache("ledger_list_");

    const duration = Date.now() - startTime;
    if (duration > 50) { // Log if clear takes more than 50ms
      console.info(`Ledger clear completed in ${duration}ms`);
    }
  }
}

export const ledgerService = new LedgerService();
