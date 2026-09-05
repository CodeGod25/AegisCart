import { v4 as uuidv4 } from "uuid";
import { getDb } from "../db/client";
import { Approval, ApprovalKind, ApprovalStatus } from "../types/domain";
import { ledgerService } from "./ledgerService";
import { BaseService } from "./baseService";

interface CreateApprovalInput {
  kind: ApprovalKind;
  reasons: string[];
  riskScore: number;
  proposedAction: Record<string, unknown>;
}

interface ApprovalRow {
  approval_id: string;
  created_at: string;
  updated_at: string;
  status: string;
  kind: string;
  reasons_json: string;
  risk_score: number;
  proposed_action_json: string;
  resolution: string | null;
  decided_by: string | null;
}

function rowToApproval(row: ApprovalRow): Approval {
  return {
    approvalId: row.approval_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    status: row.status as ApprovalStatus,
    kind: row.kind as ApprovalKind,
    reasons: row.reasons_json ? JSON.parse(row.reasons_json) : [],
    riskScore: row.risk_score,
    proposedAction: row.proposed_action_json ? JSON.parse(row.proposed_action_json) : {},
    resolution: row.resolution,
    decidedBy: row.decided_by,
  };
}

class ApprovalService extends BaseService {
  async create(input: CreateApprovalInput): Promise<Approval> {
    const db = await getDb();
    const approvalId = `apr_${uuidv4()}`;
    const now = new Date().toISOString();

    await db.run(
      `INSERT INTO approvals (
        approval_id, created_at, updated_at, status, kind,
        reasons_json, risk_score, proposed_action_json, resolution, decided_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        approvalId,
        now,
        now,
        "PENDING",
        input.kind,
        JSON.stringify(input.reasons),
        input.riskScore,
        JSON.stringify(input.proposedAction),
        null,
        null,
      ]
    );

    await this.ledgerAdd(
      "system",
      "APPROVAL_REQUESTED",
      `Action held for human approval (${approvalId}); risk ${input.riskScore}, reasons: ${input.reasons.join(", ") || "n/a"}. No money action proceeds until a human decides.`,
      {
        approvalId,
        kind: input.kind,
        riskScore: input.riskScore,
        reasons: input.reasons,
      }
    );

    return {
      approvalId,
      createdAt: now,
      updatedAt: now,
      status: "PENDING",
      kind: input.kind,
      reasons: input.reasons,
      riskScore: input.riskScore,
      proposedAction: input.proposedAction,
      resolution: null,
      decidedBy: null,
    };
  }

  async get(approvalId: string): Promise<Approval | null> {
    const db = await getDb();
    const row = await db.get<ApprovalRow>(`SELECT * FROM approvals WHERE approval_id = ?`, [
      approvalId,
    ]);
    return row ? rowToApproval(row) : null;
  }

  async list(status?: ApprovalStatus): Promise<Approval[]> {
    const db = await getDb();
    const rows = status
      ? await db.all<ApprovalRow[]>(
          `SELECT * FROM approvals WHERE status = ? ORDER BY created_at DESC`,
          [status]
        )
      : await db.all<ApprovalRow[]>(`SELECT * FROM approvals ORDER BY created_at DESC`);
    return rows.map(rowToApproval);
  }

  // Deterministic state transition; caller must have confirmed the approval is
  // PENDING. Records who decided and logs the human decision to the ledger.
  async resolve(
    approvalId: string,
    decision: "APPROVED" | "REJECTED",
    decidedBy: string,
    resolution: string
  ): Promise<Approval | null> {
    const existing = await this.get(approvalId);
    if (!existing) {
      return null;
    }

    const db = await getDb();
    const now = new Date().toISOString();
    await db.run(
      `UPDATE approvals SET status = ?, updated_at = ?, resolution = ?, decided_by = ? WHERE approval_id = ?`,
      [decision, now, resolution, decidedBy, approvalId]
    );

    await this.ledgerAdd(
      "human",
      decision === "APPROVED" ? "APPROVAL_GRANTED" : "APPROVAL_REJECTED",
      decision === "APPROVED"
        ? `Human ${decidedBy} approved ${approvalId}. The bounded action may now proceed.`
        : `Human ${decidedBy} rejected ${approvalId}. No money action will proceed.`,
      { approvalId, decidedBy, resolution }
    );

    return { ...existing, status: decision, updatedAt: now, resolution, decidedBy };
  }
}

export const approvalService = new ApprovalService();
