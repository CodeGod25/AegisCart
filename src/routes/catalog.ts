import { Router } from "express";
import { capabilityCard } from "../data/capabilityCard";
import { catalog } from "../data/catalog";

export const catalogRouter = Router();

catalogRouter.get("/items", (_req, res) => {
  res.json({ items: catalog });
});

catalogRouter.get("/capabilities", (_req, res) => {
  res.json(capabilityCard);
});
