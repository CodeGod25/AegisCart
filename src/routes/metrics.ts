import { Router } from "express";
import { computeMetrics } from "../services/revenueService";

export const metricsRouter = Router();

// Revenue dashboard, reconstructed entirely from the immutable ledger. Every figure
// here is a pure function of recorded money actions — nothing is stored separately,
// so the metrics can never drift from the audit trail.
metricsRouter.get("/", async (_req, res) => {
  const metrics = await computeMetrics();
  return res.status(200).json(metrics);
});
