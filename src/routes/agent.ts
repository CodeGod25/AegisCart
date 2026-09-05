import { Router } from "express";
import { z } from "zod";
import { getHistory, handleMessage } from "../services/agentService";
import { llmInfo } from "../services/llm";
import { asyncHandler } from "../middleware/errorHandler";

export const agentRouter = Router();

const messageSchema = z.object({
  message: z.string().min(1).max(2000),
  sessionId: z.string().min(1).optional(),
  mandateId: z.string().min(1).optional(),
});

// The conversational merchant agent. Language in, deterministic money actions out.
// The response carries both the natural-language reply AND the structured result
// (intent, negotiation/checkout/mandate data, and which parts used the LLM vs the
// deterministic fallback) so the outcome is fully auditable, not just chatty.
agentRouter.post(
  "/message",
  asyncHandler(async (req, res) => {
    const parse = messageSchema.safeParse(req.body);
    if (!parse.success) {
      const err = new Error("Invalid request payload");
      err.status = 400;
      err.name = "VALIDATION_ERROR";
      err.details = parse.error.format();
      throw err;
    }

    const turn = await handleMessage(parse.data);
    return res.status(200).json(turn);
  })
);

const historySchema = z.object({
  sessionId: z.string().min(1),
});

agentRouter.get(
  "/history",
  asyncHandler(async (req, res) => {
    const parse = historySchema.safeParse(req.query);
    if (!parse.success) {
      const err = new Error("Invalid request payload");
      err.status = 400;
      err.name = "VALIDATION_ERROR";
      err.details = parse.error.format();
      throw err;
    }

    const messages = await getHistory(parse.data.sessionId);
    return res.status(200).json({ sessionId: parse.data.sessionId, messages });
  })
);

// Lets the console show whether a live model is wired up or the agent is running
// on its deterministic floor — useful for the demo narrative.
agentRouter.get(
  "/info",
  asyncHandler(async (_req, res) => {
    return res.status(200).json(llmInfo());
  })
);