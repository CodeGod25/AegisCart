import { Router } from "express";
import { register } from "../metrics";

export const systemMetricsRouter = Router();

// Endpoint to expose Prometheus metrics
systemMetricsRouter.get("/metrics", async (_req, res) => {
  try {
    const metrics = await register.metrics();
    res.set("Content-Type", register.contentType);
    res.end(metrics);
  } catch (ex) {
    res.status(500).end(ex);
  }
});

export default systemMetricsRouter;