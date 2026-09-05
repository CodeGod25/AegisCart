import { Router } from "express";
import { resetDemoData } from "../services/demoService";
import { simulationService } from "../services/simulationService";

export const demoRouter = Router();

demoRouter.post("/reset", async (_req, res) => {
  await resetDemoData();
  simulationService.reset();
  return res.json({ ok: true, message: "Demo reset: ledger, chat, offers, approvals, and simulations cleared." });
});