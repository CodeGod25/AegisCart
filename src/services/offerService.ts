import { v4 as uuidv4 } from "uuid";
import { getDb } from "../db/client";
import { Offer, OfferStatus } from "../types/domain";
import { ledgerService } from "./ledgerService";
import { signPayload, verifyPayload } from "./signingService";
import { BaseService } from "./baseService";

const OFFER_TTL_MS = 10 * 60 * 1000; // signed offers are valid for 10 minutes

interface MintOfferInput {
  sku: string;
  name: string;
  quantity: number;
  unitPriceInPaise: number;
  totalInPaise: number;
  discountPct: number;
  currency: "INR";
  mandateId?: string | null;
}

interface OfferRow {
  offer_id: string;
  sku: string;
  name: string;
  quantity: number;
  unit_price_in_paise: number;
  total_in_paise: number;
  discount_pct: number;
  currency: string;
  mandate_id: string | null;
  created_at: string;
  expires_at: string;
  status: string;
  signature: string;
}

// The economically binding fields. Any change to price, quantity, currency, the
// bound mandate, or the expiry invalidates the signature.
function canonicalOffer(o: {
  offerId: string;
  sku: string;
  quantity: number;
  unitPriceInPaise: number;
  totalInPaise: number;
  discountPct: number;
  currency: string;
  mandateId: string | null;
  expiresAt: string;
}): string {
  return [
    o.offerId,
    o.sku,
    o.quantity,
    o.unitPriceInPaise,
    o.totalInPaise,
    o.discountPct,
    o.currency,
    o.mandateId ?? "",
    o.expiresAt,
  ].join("|");
}

function rowToOffer(row: OfferRow): Offer {
  return {
    offerId: row.offer_id,
    sku: row.sku,
    name: row.name,
    quantity: row.quantity,
    unitPriceInPaise: row.unit_price_in_paise,
    totalInPaise: row.total_in_paise,
    discountPct: row.discount_pct,
    currency: row.currency as "INR",
    mandateId: row.mandate_id,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    status: row.status as OfferStatus,
    signature: row.signature,
  };
}

class OfferService extends BaseService {
  async mint(input: MintOfferInput): Promise<Offer> {
    const db = await getDb();
    const offerId = `offer_${uuidv4()}`;
    const now = new Date();
    const createdAt = now.toISOString();
    const expiresAt = new Date(now.getTime() + OFFER_TTL_MS).toISOString();
    const mandateId = input.mandateId ?? null;

    const signature = signPayload(
      canonicalOffer({
        offerId,
        sku: input.sku,
        quantity: input.quantity,
        unitPriceInPaise: input.unitPriceInPaise,
        totalInPaise: input.totalInPaise,
        discountPct: input.discountPct,
        currency: input.currency,
        mandateId,
        expiresAt,
      })
    );

    await db.run(
      `INSERT INTO offers (
        offer_id, sku, name, quantity, unit_price_in_paise, total_in_paise,
        discount_pct, currency, mandate_id, created_at, expires_at, status, signature
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        offerId,
        input.sku,
        input.name,
        input.quantity,
        input.unitPriceInPaise,
        input.totalInPaise,
        input.discountPct,
        input.currency,
        mandateId,
        createdAt,
        expiresAt,
        "ACTIVE",
        signature,
      ]
    );

    const offer: Offer = {
      offerId,
      sku: input.sku,
      name: input.name,
      quantity: input.quantity,
      unitPriceInPaise: input.unitPriceInPaise,
      totalInPaise: input.totalInPaise,
      discountPct: input.discountPct,
      currency: input.currency,
      mandateId,
      createdAt,
      expiresAt,
      status: "ACTIVE",
      signature,
    };

    await this.ledgerAdd(
      "system",
      "OFFER_MINTED",
      `Signed offer ${offerId} minted for ${input.quantity} x ${input.sku} at ${input.totalInPaise} paise, valid until ${expiresAt}. Checkout must present this offer, so the policy-bounded price is now tamper-evident.`,
      {
        offerId,
        sku: input.sku,
        quantity: input.quantity,
        totalInPaise: input.totalInPaise,
        expiresAt,
      }
    );

    return offer;
  }

  async get(offerId: string): Promise<Offer | null> {
    const db = await getDb();
    const row = await db.get<OfferRow>(`SELECT * FROM offers WHERE offer_id = ?`, [offerId]);
    return row ? rowToOffer(row) : null;
  }

  async getByIds(offerIds: string[]): Promise<Offer[]> {
    if (offerIds.length === 0) {
      return [];
    }

    const db = await getDb();
    const placeholders = offerIds.map(() => "?").join(",");
    const rows = await db.all<OfferRow[]>(
      `SELECT * FROM offers WHERE offer_id IN (${placeholders})`,
      offerIds
    );
    return rows.map(rowToOffer);
  }

  async markStatus(offerId: string, status: OfferStatus): Promise<void> {
    const db = await getDb();
    await db.run(`UPDATE offers SET status = ? WHERE offer_id = ?`, [status, offerId]);
  }

  // Deterministic checkout gate: is this offer valid to pay `amountInPaise` right now?
  // Returns a stable reason code for the audit trail on failure.
  async validateForCheckout(
    offerId: string,
    amountInPaise?: number
  ): Promise<{ ok: boolean; reason: string; offer?: Offer }> {
    const offer = await this.get(offerId);
    if (!offer) {
      return { ok: false, reason: "OFFER_NOT_FOUND" };
    }
    if (offer.status === "CONSUMED") {
      return { ok: false, reason: "OFFER_ALREADY_CONSUMED", offer };
    }
    if (offer.status === "REJECTED") {
      return { ok: false, reason: "OFFER_REJECTED", offer };
    }

    const canonical = canonicalOffer({
      offerId: offer.offerId,
      sku: offer.sku,
      quantity: offer.quantity,
      unitPriceInPaise: offer.unitPriceInPaise,
      totalInPaise: offer.totalInPaise,
      discountPct: offer.discountPct,
      currency: offer.currency,
      mandateId: offer.mandateId,
      expiresAt: offer.expiresAt,
    });
    if (!verifyPayload(canonical, offer.signature)) {
      return { ok: false, reason: "OFFER_SIGNATURE_INVALID", offer };
    }

    if (new Date(offer.expiresAt).getTime() < Date.now()) {
      if (offer.status === "ACTIVE") {
        await this.markStatus(offerId, "EXPIRED");
      }
      return { ok: false, reason: "OFFER_EXPIRED", offer };
    }

    if (typeof amountInPaise === "number" && amountInPaise !== offer.totalInPaise) {
      return { ok: false, reason: "OFFER_AMOUNT_MISMATCH", offer };
    }

    return { ok: true, reason: "OFFER_VALID", offer };
  }

  async consume(offerId: string): Promise<void> {
    await this.markStatus(offerId, "CONSUMED");
    await this.ledgerAdd(
      "system",
      "OFFER_CONSUMED",
      `Offer ${offerId} consumed on successful payment; it can no longer be reused.`,
      { offerId }
    );
  }
}

export const offerService = new OfferService();
