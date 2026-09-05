import { v4 as uuidv4 } from "uuid";
import { getDb } from "../db/client";

type SessionStatus =
  | "CREATED"
  | "ORDER_CREATED"
  | "PAYMENT_FAILED"
  | "PAYMENT_SUCCEEDED"
  | "PAYMENT_VERIFIED"
  | "WEBHOOK_UPDATED";

interface SessionCreateInput {
  amountInPaise: number;
  currency: "INR";
  receipt: string;
}

class SessionService {
  async createSession(input: SessionCreateInput): Promise<{ sessionId: string }> {
    const db = await getDb();
    const sessionId = uuidv4();
    const now = new Date().toISOString();

    await db.run(
      `INSERT INTO checkout_sessions (
        session_id, created_at, updated_at, order_id, amount_in_paise, currency, receipt, status, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        sessionId,
        now,
        now,
        null,
        input.amountInPaise,
        input.currency,
        input.receipt,
        "CREATED",
        JSON.stringify({}),
      ]
    );

    return { sessionId };
  }

  async attachOrder(sessionId: string, orderId: string): Promise<void> {
    await this.updateSession(sessionId, "ORDER_CREATED", { orderId });
  }

  async updateSession(
    sessionId: string,
    status: SessionStatus,
    patch: Record<string, unknown>
  ): Promise<void> {
    const db = await getDb();
    const existing = await db.get<{
      metadata_json: string;
      order_id: string | null;
    }>(
      "SELECT metadata_json, order_id FROM checkout_sessions WHERE session_id = ?",
      [sessionId]
    );

    if (!existing) {
      return;
    }

    const now = new Date().toISOString();
    const mergedMetadata = {
      ...(existing.metadata_json ? JSON.parse(existing.metadata_json) : {}),
      ...patch,
    };

    const nextOrderId =
      typeof patch.orderId === "string" ? (patch.orderId as string) : existing.order_id;

    await db.run(
      `UPDATE checkout_sessions
       SET updated_at = ?, status = ?, order_id = ?, metadata_json = ?
       WHERE session_id = ?`,
      [now, status, nextOrderId, JSON.stringify(mergedMetadata), sessionId]
    );
  }

  async updateByOrderId(
    orderId: string,
    status: SessionStatus,
    patch: Record<string, unknown>
  ): Promise<void> {
    const db = await getDb();
    const session = await db.get<{ session_id: string }>(
      "SELECT session_id FROM checkout_sessions WHERE order_id = ?",
      [orderId]
    );

    if (!session) {
      return;
    }

    await this.updateSession(session.session_id, status, patch);
  }

  async listSessions(limit = 50): Promise<unknown[]> {
    const db = await getDb();
    const rows = await db.all<{
      session_id: string;
      created_at: string;
      updated_at: string;
      order_id: string | null;
      amount_in_paise: number;
      currency: string;
      receipt: string;
      status: string;
      metadata_json: string;
    }[]>(
      `SELECT session_id, created_at, updated_at, order_id, amount_in_paise, currency, receipt, status, metadata_json
       FROM checkout_sessions
       ORDER BY created_at DESC
       LIMIT ?`,
      [limit]
    );

    return rows.map((row) => ({
      sessionId: row.session_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      orderId: row.order_id,
      amountInPaise: row.amount_in_paise,
      currency: row.currency,
      receipt: row.receipt,
      status: row.status,
      metadata: row.metadata_json ? JSON.parse(row.metadata_json) : {},
    }));
  }
}

export const sessionService = new SessionService();
