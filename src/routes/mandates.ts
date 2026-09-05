import { Router } from "express";
import { z } from "zod";
import { ledgerService } from "../services/ledgerService";
import { mandateService } from "../services/mandateService";
import { RecurrenceType } from "../types/domain";

export const mandateRouter = Router();

const createMandateSchema = z.object({
  buyer: z.string().min(1),
  maxTotalPaise: z.coerce.number().int().positive(),
  maxPerOrderPaise: z.coerce.number().int().positive(),
  allowedCategories: z.array(z.string()).default([]),
  ttlMs: z.coerce.number().int().positive().optional(),
  // Recurring mandate fields
  recurrenceType: z.enum(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"]).nullish(),
  recurrenceInterval: z.coerce.number().int().positive().optional(),
  maxRenewals: z.coerce.number().int().positive().optional().nullish(),
  resetSpentOnRenewal: z.boolean().optional(),
});

mandateRouter.post("/", async (req, res) => {
  const parse = createMandateSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: "INVALID_MANDATE_PAYLOAD", details: parse.error.flatten() });
  }
  if (parse.data.maxPerOrderPaise > parse.data.maxTotalPaise) {
    return res.status(422).json({
      ok: false,
      error: "INVALID_MANDATE_BOUNDS",
      reason: "maxPerOrderPaise cannot exceed maxTotalPaise",
    });
  }

  const mandate = await mandateService.create({ ...parse.data, recurrenceType: parse.data.recurrenceType ?? null });
  return res.status(201).json({ ok: true, mandate });
});

mandateRouter.get("/:id", async (req, res) => {
  const id = req.params.id;
  if (!id) {
    return res.status(400).json({ ok: false, error: "MISSING_MANDATE_ID" });
  }
  const mandate = await mandateService.get(id);
  if (!mandate) {
    return res.status(404).json({ ok: false, error: "MANDATE_NOT_FOUND" });
  }

  const remainingPaise = Math.max(0, mandate.maxTotalPaise - mandate.spentPaise);
  return res.json({ ok: true, mandate: { ...mandate, remainingPaise } });
});

// Revoke a mandate (human kill-switch for an autonomous buyer agent).
mandateRouter.post("/:id/revoke", async (req, res) => {
  const id = req.params.id;
  if (!id) {
    return res.status(400).json({ ok: false, error: "MISSING_MANDATE_ID" });
  }
  const mandate = await mandateService.get(id);
  if (!mandate) {
    return res.status(404).json({ ok: false, error: "MANDATE_NOT_FOUND" });
  }
  if (mandate.status === "REVOKED") {
    return res.json({ ok: true, mandate });
  }

  await mandateService.revoke(id);
  await ledgerService.add({
    actor: "human",
    actionType: "MANDATE_REJECTED",
    explainability: `Mandate ${id} revoked by human. The buyer agent can no longer transact against it.`,
    payload: { mandateId: id },
  });
  const updated = await mandateService.get(id);
  return res.json({ ok: true, mandate: updated });
});
