import { getDb } from "../db/client";

class WebhookService {
  async saveEvent(input: {
    eventId?: string;
    eventType?: string;
    signatureValid: boolean;
    payload: unknown;
  }): Promise<void> {
    const db = await getDb();

    await db.run(
      `INSERT INTO webhook_events (
        event_id, event_type, signature_valid, payload_json, received_at
      ) VALUES (?, ?, ?, ?, ?)`,
      [
        input.eventId ?? null,
        input.eventType ?? null,
        input.signatureValid ? 1 : 0,
        JSON.stringify(input.payload),
        new Date().toISOString(),
      ]
    );
  }
}

export const webhookService = new WebhookService();
