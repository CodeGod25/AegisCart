import { Router } from "express";
import { z } from "zod";
import { FAILURES } from "../services/failureTaxonomy";
import { simulationService } from "../services/simulationService";

export const simulationRouter = Router();

// The failures an operator can arm on the next payment attempt (see failureTaxonomy).
const PAYMENT_FAILURES = ["PAYMENT_DECLINED", "GATEWAY_TIMEOUT", "INSUFFICIENT_STOCK"] as const;

const failureSchema = z.object({
  type: z.enum(PAYMENT_FAILURES),
});

simulationRouter.post("/failure", (req, res) => {
  const parse = failureSchema.safeParse(req.body);

  if (!parse.success) {
    return res.status(400).json({
      error: "INVALID_FAILURE_TYPE",
      supported: PAYMENT_FAILURES,
    });
  }

  simulationService.setFailNextPayment(parse.data.type);
  return res.status(200).json({
    ok: true,
    message: `Failure armed: the next payment attempt will fail as ${parse.data.type}, then recover gracefully.`,
    state: simulationService.getState(),
  });
});

const llmSchema = z.object({
  unavailable: z.boolean(),
});

simulationRouter.post("/llm", (req, res) => {
  const parse = llmSchema.safeParse(req.body);

  if (!parse.success) {
    return res.status(400).json({
      error: "INVALID_LLM_TOGGLE",
      expected: { unavailable: "boolean" },
    });
  }

  simulationService.setLlmUnavailable(parse.data.unavailable);
  return res.json({
    ok: true,
    message: parse.data.unavailable
      ? "LLM outage simulated: language calls will fall back to deterministic templates. Money flow is unaffected."
      : "LLM restored.",
    state: simulationService.getState(),
  });
});

simulationRouter.post("/reset", (_req, res) => {
  simulationService.reset();
  return res.json({
    ok: true,
    message: "All simulated failures cleared.",
    state: simulationService.getState(),
  });
});

simulationRouter.get("/state", (_req, res) => {
  res.json(simulationService.getState());
});

// The full failure taxonomy: every failure mode with its code, status, whether a
// retry is safe, and the recovery path. Drives the console's failure panel.
simulationRouter.get("/taxonomy", (_req, res) => {
  res.json({ failures: Object.values(FAILURES) });
});
