import { Router } from "express";
import { sessionService } from "../services/sessionService";

export const sessionRouter = Router();

sessionRouter.get("/checkout", async (_req, res) => {
  const sessions = await sessionService.listSessions();
  res.json({ sessions });
});
