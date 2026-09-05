import { Router } from "express";
import { buildAgentManifest } from "../data/agentManifest";

export const wellKnownRouter = Router();

// GET /.well-known/agent — the machine-readable manifest an AI buyer reads first
// to learn how to transact with this merchant (capabilities, guarantees, interop,
// endpoints and reason codes).
wellKnownRouter.get("/agent", (_req, res) => {
  res.json(buildAgentManifest());
});
