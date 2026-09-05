import { Router } from "express";
import { offerService } from "../services/offerService";

export const offerRouter = Router();

// Lets the console and any buyer agent inspect a signed offer before paying.
offerRouter.get("/:offerId", async (req, res) => {
  const offerId = req.params.offerId;
  if (!offerId) {
    return res.status(400).json({ ok: false, error: "MISSING_OFFER_ID" });
  }

  const offer = await offerService.get(offerId);
  if (!offer) {
    return res.status(404).json({ ok: false, error: "OFFER_NOT_FOUND" });
  }

  return res.json({ ok: true, offer });
});
