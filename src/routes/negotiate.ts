import { Router } from "express";
import { z } from "zod";
import { negotiate } from "../services/negotiationService";

export const negotiationRouter = Router();

const negotiationSchema = z.object({
  sku: z.string().min(1),
  quantity: z.coerce.number().int().min(1),
  requestedDiscountPct: z.coerce.number().min(0).max(100),
  mandateId: z.string().min(1).optional(),
});

negotiationRouter.post("/quote", async (req, res) => {
  const parse = negotiationSchema.safeParse(req.body);

  if (!parse.success) {
    return res.status(400).json({
      error: "INVALID_NEGOTIATION_PAYLOAD",
      details: parse.error.flatten(),
    });
  }

  const result = await negotiate(parse.data);
  return res.status(result.status).json(result);
});
