import { Router } from "express";
import { describeBuyerAgent, getBuyerAgentState, runBuyerAgentDemo, stopBuyerAgent } from "../services/buyerAgentService";
import { asyncHandler } from "../middleware/errorHandler";

export const buyerRouter = Router();

// The autonomous buyer-agent demo (A2A). A single POST runs the whole mission
// against the merchant's own services and returns the structured transcript;
// every step is also appended to the ledger, so the live audit trail shows the
// buyer and merchant agents interleaved. This is the endpoint the console's
// "Run buyer agent" button calls.
buyerRouter.post(
  "/run",
  asyncHandler(async (_req, res) => {
    const result = await runBuyerAgentDemo();
    return res.status(200).json({ ok: true, ...result });
  })
);

// Get the current status of the buyer agent (for console UI)
buyerRouter.get(
  "/status",
  asyncHandler(async (_req, res) => {
    return res.status(200).json({ ok: true, ...getBuyerAgentState() });
  })
);

// Stop the buyer agent (for console UI)
buyerRouter.post(
  "/stop",
  asyncHandler(async (_req, res) => {
    return res.status(200).json({ ok: true, stopped: stopBuyerAgent(), message: "Buyer agent stop requested" });
  })
);

buyerRouter.get(
  "/info",
  asyncHandler(async (_req, res) => {
    return res.status(200).json(describeBuyerAgent());
  })
);