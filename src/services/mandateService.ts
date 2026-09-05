import { v4 as uuidv4 } from "uuid";
import { getDb } from "../db/client";
import { MandateStatus, SpendMandate, RecurrenceType } from "../types/domain";
import { ledgerService } from "./ledgerService";
import { signPayload, verifyPayload } from "./signingService";
import { BaseService } from "./baseService";

const DEFAULT_MANDATE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CreateMandateInput {
  buyer: string;
  maxTotalPaise: number;
  maxPerOrderPaise: number;
  allowedCategories: string[];
  ttlMs?: number | undefined;
  // Recurring mandate fields
  recurrenceType?: RecurrenceType | null | undefined;
  recurrenceInterval?: number | undefined;
  maxRenewals?: number | null | undefined;
  resetSpentOnRenewal?: boolean | undefined;
}

interface MandateRow {
  mandate_id: string;
  buyer: string;
  max_total_paise: number;
  max_per_order_paise: number;
  allowed_categories_json: string;
  spent_paise: number;
  currency: string;
  created_at: string;
  expires_at: string;
  status: string;
  signature: string;
  // Recurring mandate fields
  recurrence_type: string | null;
  recurrence_interval: number;
  next_renewal_at: string | null;
  renewal_count: number;
  max_renewals: number | null;
  reset_spent_on_renewal: number; // 0 = false, 1 = true
}

// The signature covers only the immutable envelope (who, the bounds, the window).
// spentPaise, status, nextRenewalAt, and renewalCount are mutable ledgered state
// and are deliberately excluded, so a legitimate debit or renewal does not invalidate the mandate signature.
function canonicalMandate(m: {
  mandateId: string;
  buyer: string;
  maxTotalPaise: number;
  maxPerOrderPaise: number;
  allowedCategories: string[];
  currency: string;
  createdAt: string;
  expiresAt: string;
  recurrenceType: string | null;
  recurrenceInterval: number; // NOT NULL in DB, default 1
  maxRenewals: number | null;
  resetSpentOnRenewal: number; // 0 or 1, NOT NULL in DB
}): string {
  return [
    m.mandateId,
    m.buyer,
    m.maxTotalPaise,
    m.maxPerOrderPaise,
    [...m.allowedCategories].sort().join(","),
    m.currency,
    m.createdAt,
    m.expiresAt,
    m.recurrenceType ?? "NULL",
    m.recurrenceInterval.toString(),
    m.maxRenewals === null ? "NULL" : m.maxRenewals.toString(),
    m.resetSpentOnRenewal.toString(),
  ].join("|");
}

/**
 * Calculate the next renewal date based on recurrence type and interval
 * @param startDate The date to calculate from (usually createdAt or last renewal)
 * @param recurrenceType The type of recurrence (DAILY, WEEKLY, MONTHLY, YEARLY)
 * @param interval The interval (e.g., 2 for every 2 weeks)
 * @returns ISO string of the next renewal date
 */
function calculateNextRenewalAt(startDate: Date, recurrenceType: RecurrenceType, interval: number): string {
    const result = new Date(startDate.getTime());

    switch (recurrenceType) {
      case "DAILY":
        result.setDate(result.getDate() + interval);
        break;
      case "WEEKLY":
        result.setDate(result.getDate() + (7 * interval));
        break;
      case "MONTHLY":
        result.setMonth(result.getMonth() + interval);
        break;
      case "YEARLY":
        result.setFullYear(result.getFullYear() + interval);
        break;
      default:
        throw new Error(`Unsupported recurrence type: ${recurrenceType}`);
    }

    return result.toISOString();
}

function rowToMandate(row: MandateRow): SpendMandate {
  return {
    mandateId: row.mandate_id,
    buyer: row.buyer,
    maxTotalPaise: row.max_total_paise,
    maxPerOrderPaise: row.max_per_order_paise,
    allowedCategories: row.allowed_categories_json ? JSON.parse(row.allowed_categories_json) : [],
    spentPaise: row.spent_paise,
    currency: row.currency as "INR",
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    status: row.status as MandateStatus,
    signature: row.signature,
    recurrenceType: row.recurrence_type as RecurrenceType | null,
    recurrenceInterval: row.recurrence_interval,
    nextRenewalAt: row.next_renewal_at,
    renewalCount: row.renewal_count,
    maxRenewals: row.max_renewals ?? null,
    resetSpentOnRenewal: row.reset_spent_on_renewal === 1,
  };
}

interface ValidateOpts {
  totalInPaise: number;
  category?: string;
}

class MandateService extends BaseService {
  async create(input: CreateMandateInput): Promise<SpendMandate> {
    const db = await getDb();
    const mandateId = `mnd_${uuidv4()}`;
    const now = new Date();
    const createdAt = now.toISOString();
    const expiresAt = new Date(now.getTime() + (input.ttlMs ?? DEFAULT_MANDATE_TTL_MS)).toISOString();
    const allowedCategories = input.allowedCategories ?? [];

    const recurrenceType = input.recurrenceType ?? null;
    const recurrenceInterval = input.recurrenceInterval ?? 1;
    const maxRenewals = input.maxRenewals ?? null;
    const resetSpentOnRenewal = input.resetSpentOnRenewal ?? true;

    // Calculate initial nextRenewalAt for recurring mandates
    let nextRenewalAt: string | null = null;
    if (recurrenceType !== null) {
      nextRenewalAt = calculateNextRenewalAt(new Date(createdAt), recurrenceType, recurrenceInterval);
    }

    const signature = signPayload(
      canonicalMandate({
        mandateId,
        buyer: input.buyer,
        maxTotalPaise: input.maxTotalPaise,
        maxPerOrderPaise: input.maxPerOrderPaise,
        allowedCategories,
        currency: "INR",
        createdAt,
        expiresAt,
        recurrenceType,
        recurrenceInterval,
        maxRenewals,
        resetSpentOnRenewal: resetSpentOnRenewal ? 1 : 0,
      })
    );

    await db.run(
      `INSERT INTO mandates (
        mandate_id, buyer, max_total_paise, max_per_order_paise, allowed_categories_json,
        spent_paise, currency, created_at, expires_at, status, signature,
        recurrence_type, recurrence_interval, next_renewal_at, renewal_count, max_renewals, reset_spent_on_renewal
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        mandateId,
        input.buyer,
        input.maxTotalPaise,
        input.maxPerOrderPaise,
        JSON.stringify(allowedCategories),
        0,
        "INR",
        createdAt,
        expiresAt,
        "ACTIVE",
        signature,
        recurrenceType,
        recurrenceInterval,
        nextRenewalAt,
        0,
        maxRenewals,
        resetSpentOnRenewal ? 1 : 0,
      ]
    );

    await this.ledgerAdd(
      "human",
      "MANDATE_CREATED",
      `Spend mandate ${mandateId} created for ${input.buyer}: up to ${input.maxTotalPaise} paise total, ${input.maxPerOrderPaise} per order${allowedCategories.length ? `, categories [${allowedCategories.join(", ")}]` : ", all categories"}. The buyer agent may transact autonomously within this signed envelope.`,
      {
        mandateId,
        buyer: input.buyer,
        maxTotalPaise: input.maxTotalPaise,
        maxPerOrderPaise: input.maxPerOrderPaise,
        allowedCategories,
        expiresAt,
      }
    );

    return {
      mandateId,
      buyer: input.buyer,
      maxTotalPaise: input.maxTotalPaise,
      maxPerOrderPaise: input.maxPerOrderPaise,
      allowedCategories,
      spentPaise: 0,
      currency: "INR",
      createdAt,
      expiresAt,
      status: "ACTIVE",
      signature,
      recurrenceType,
      recurrenceInterval,
      nextRenewalAt,
      renewalCount: 0,
      maxRenewals,
      resetSpentOnRenewal,
    };
  }

  async get(mandateId: string): Promise<SpendMandate | null> {
    const db = await getDb();
    const row = await db.get<MandateRow>(`SELECT * FROM mandates WHERE mandate_id = ?`, [mandateId]);
    return row ? rowToMandate(row) : null;
  }

  private verifySignature(m: SpendMandate): boolean {
    return verifyPayload(
      canonicalMandate({
        mandateId: m.mandateId,
        buyer: m.buyer,
        maxTotalPaise: m.maxTotalPaise,
        maxPerOrderPaise: m.maxPerOrderPaise,
        allowedCategories: m.allowedCategories,
        currency: m.currency,
        createdAt: m.createdAt,
        expiresAt: m.expiresAt,
        recurrenceType: m.recurrenceType,
        recurrenceInterval: m.recurrenceInterval,
        maxRenewals: m.maxRenewals,
        resetSpentOnRenewal: m.resetSpentOnRenewal ? 1 : 0,
      }),
      m.signature
    );
  }

  // Deterministic envelope check. Returns a stable reason code for the audit trail.
  async validate(
    mandateId: string,
    opts: ValidateOpts
  ): Promise<{ ok: boolean; reason: string; mandate?: SpendMandate }> {
    const mandate = await this.get(mandateId);
    if (!mandate) {
      return { ok: false, reason: "MANDATE_NOT_FOUND" };
    }
    if (!this.verifySignature(mandate)) {
      return { ok: false, reason: "MANDATE_SIGNATURE_INVALID", mandate };
    }
    if (mandate.status !== "ACTIVE") {
      return { ok: false, reason: `MANDATE_${mandate.status}`, mandate };
    }
    if (new Date(mandate.expiresAt).getTime() < Date.now()) {
      await this.markStatus(mandateId, "EXPIRED");
      return { ok: false, reason: "MANDATE_EXPIRED", mandate };
    }
    if (
      opts.category &&
      mandate.allowedCategories.length > 0 &&
      !mandate.allowedCategories.includes(opts.category)
    ) {
      return { ok: false, reason: "MANDATE_CATEGORY_NOT_ALLOWED", mandate };
    }
    if (opts.totalInPaise > mandate.maxPerOrderPaise) {
      return { ok: false, reason: "MANDATE_PER_ORDER_EXCEEDED", mandate };
    }
    if (mandate.spentPaise + opts.totalInPaise > mandate.maxTotalPaise) {
      return { ok: false, reason: "MANDATE_BUDGET_EXCEEDED", mandate };
    }
    return { ok: true, reason: "MANDATE_VALID", mandate };
  }

  private async markStatus(mandateId: string, status: MandateStatus): Promise<void> {
    const db = await getDb();
    await db.run(`UPDATE mandates SET status = ? WHERE mandate_id = ?`, [status, mandateId]);
  }

  // Human kill-switch: immediately stops an autonomous buyer agent from spending.
  async revoke(mandateId: string): Promise<void> {
    await this.markStatus(mandateId, "REVOKED");
  }

  // Applied only after a payment actually succeeds. Increments spend and exhausts
  // the mandate when the remaining budget can no longer cover the per-order cap.
  async debit(mandateId: string, amountInPaise: number): Promise<void> {
    const db = await getDb();
    const mandate = await this.get(mandateId);
    if (!mandate) {
      return;
    }
    const nextSpent = mandate.spentPaise + amountInPaise;
    const remaining = mandate.maxTotalPaise - nextSpent;
    const nextStatus: MandateStatus = remaining < mandate.maxPerOrderPaise ? "EXHAUSTED" : "ACTIVE";

    await db.run(`UPDATE mandates SET spent_paise = ?, status = ? WHERE mandate_id = ?`, [
      nextSpent,
      nextStatus,
      mandateId,
    ]);

    await this.ledgerAdd(
      "system",
      "MANDATE_DEBITED",
      `Mandate ${mandateId} debited ${amountInPaise} paise; ${Math.max(0, remaining)} paise of the signed budget remains${nextStatus === "EXHAUSTED" ? " (now exhausted)" : ""}.`,
      { mandateId, amountInPaise, spentPaise: nextSpent, remainingPaise: Math.max(0, remaining), status: nextStatus }
    );
  }
}

export const mandateService = new MandateService();
