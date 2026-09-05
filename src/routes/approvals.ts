import { Router } from "express";
import { z } from "zod";
import { approvalService } from "../services/approvalService";
import { offerService } from "../services/offerService";
import { ApprovalStatus } from "../types/domain";
import { asyncHandler } from "../middleware/errorHandler";

export const approvalRouter = Router();

const decisionSchema = z.object({
  decidedBy: z.string().min(1).default("merchant-console"),
});

interface ProposedNegotiation {
  sku: string;
  name: string;
  quantity: number;
  unitPriceInPaise: number;
  totalInPaise: number;
  discountPct: number;
  currency: "INR";
  mandateId: string | null;
}

approvalRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const raw = typeof _req.query.status === "string" ? _req.query.status.toUpperCase() : undefined;
    const status: ApprovalStatus | undefined =
      raw === "PENDING" || raw === "APPROVED" || raw === "REJECTED" ? raw : undefined;
    const approvals = await approvalService.list(status);
    return res.status(200).json({ ok: true, approvals });
  })
);

approvalRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = typeof req.params.id === "string" ? req.params.id : "";
    if (!id) {
      const err = new Error("Missing approval ID");
      err.status = 400;
      err.name = "MISSING_APPROVAL_ID";
      throw err;
    }
    const approval = await approvalService.get(id);
    if (!approval) {
      const err = new Error("Approval not found");
      err.status = 404;
      err.name = "APPROVAL_NOT_FOUND";
      throw err;
    }
    return res.status(200).json({ ok: true, approval });
  })
);

approvalRouter.post(
  "/:id/approve",
  asyncHandler(async (req, res) => {
    const id = typeof req.params.id === "string" ? req.params.id : "";
    if (!id) {
      const err = new Error("Missing approval ID");
      err.status = 400;
      err.name = "MISSING_APPROVAL_ID";
      throw err;
    }
    const parsed = decisionSchema.safeParse(req.body ?? {});
    const decidedBy = parsed.success ? parsed.data.decidedBy : "merchant-console";

    const approval = await approvalService.get(id);
    if (!approval) {
      const err = new Error("Approval not found");
      err.status = 404;
      err.name = "APPROVAL_NOT_FOUND";
      throw err;
    }
    if (approval.status !== "PENDING") {
      const err = new Error("Already decided");
      err.status = 409;
      err.name = "ALREADY_DECIDED";
      err.details = { status: approval.status };
      throw err;
    }

    const resolved = await approvalService.resolve(
      id,
      "APPROVED",
      decidedBy,
      "Approved via merchant console"
    );
    if (!resolved) {
      const err = new Error("Approval resolve failed");
      err.status = 500;
      err.name = "APPROVAL_RESOLVE_FAILED";
      throw err;
    }

    // On approval of a negotiation, mint the signed offer now — deferred until the
    // human said yes, so no payable artifact ever existed for an un-approved action.
    if (resolved.kind === "NEGOTIATION") {
      const pa = resolved.proposedAction as unknown as ProposedNegotiation;
      const offer = await offerService.mint({
        sku: pa.sku,
        name: pa.name,
        quantity: pa.quantity,
        unitPriceInPaise: pa.unitPriceInPaise,
        totalInPaise: pa.totalInPaise,
        discountPct: pa.discountPct,
        currency: pa.currency,
        mandateId: pa.mandateId,
      });
      return res.status(200).json({
        ok: true,
        approval: resolved,
        offer: {
          offerId: offer.offerId,
          signature: offer.signature,
          expiresAt: offer.expiresAt,
          totalInPaise: offer.totalInPaise,
        },
      });
    }

    return res.status(200).json({ ok: true, approval: resolved });
  })
);

approvalRouter.post(
  "/:id/reject",
  asyncHandler(async (req, res) => {
    const id = typeof req.params.id === "string" ? req.params.id : "";
    if (!id) {
      const err = new Error("Missing approval ID");
      err.status = 400;
      err.name = "MISSING_APPROVAL_ID";
      throw err;
    }
    const parsed = decisionSchema.safeParse(req.body ?? {});
    const decidedBy = parsed.success ? parsed.data.decidedBy : "merchant-console";

    const approval = await approvalService.get(id);
    if (!approval) {
      const err = new Error("Approval not found");
      err.status = 404;
      err.name = "APPROVAL_NOT_FOUND";
      throw err;
    }
    if (approval.status !== "PENDING") {
      const err = new Error("Already decided");
      err.status = 409;
      err.name = "ALREADY_DECIDED";
      err.details = { status: approval.status };
      throw err;
    }

    const resolved = await approvalService.resolve(
      id,
      "REJECTED",
      decidedBy,
      "Rejected via merchant console"
    );
    return res.status(200).json({ ok: true, approval: resolved });
  })
);