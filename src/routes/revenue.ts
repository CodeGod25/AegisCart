import { Router } from "express";
import { z } from "zod";
import { bestIncentive, priceBundle, recommendCrossSell } from "../services/revenueService";

export const revenueRouter = Router();

// Deterministic revenue-growth tools. None of these touch an LLM; each is a pure
// function of the catalog and the merchant policy (discount cap + margin floor).

const recommendationSchema = z.object({ sku: z.string().min(1) });

revenueRouter.get("/recommendations", (req, res) => {
  const parse = recommendationSchema.safeParse(req.query);
  if (!parse.success) {
    return res.status(400).json({ error: "INVALID_RECOMMENDATION_QUERY", details: parse.error.flatten() });
  }
  const result = recommendCrossSell(parse.data.sku);
  return res.status(result.ok ? 200 : 404).json(result);
});

const bestOfferSchema = z.object({
  sku: z.string().min(1),
  quantity: z.coerce.number().int().min(1).optional(),
});

revenueRouter.get("/best-offer", (req, res) => {
  const parse = bestOfferSchema.safeParse(req.query);
  if (!parse.success) {
    return res.status(400).json({ error: "INVALID_BEST_OFFER_QUERY", details: parse.error.flatten() });
  }
  const result = bestIncentive(parse.data.sku, parse.data.quantity ?? 1);
  return res.status(result.ok ? 200 : 404).json(result);
});

const bundleSchema = z.object({
  items: z
    .array(z.object({ sku: z.string().min(1), quantity: z.coerce.number().int().min(1) }))
    .min(1),
});

revenueRouter.post("/bundle", (req, res) => {
  const parse = bundleSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: "INVALID_BUNDLE_PAYLOAD", details: parse.error.flatten() });
  }
  const result = priceBundle(parse.data.items);
  return res.status(result.ok ? 200 : 400).json(result);
});
