import { Router, Request, Response } from "express";
import { ledgerService } from "../services/ledgerService";
import { MoneyAction } from "../types/domain";
import { asyncHandler } from "../middleware/errorHandler";

export const ledgerRouter = Router();

ledgerRouter.get(
  "/events",
  asyncHandler(async (req: Request, res: Response) => {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
    const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : undefined;
    const order = req.query.order === "desc" ? "DESC" : "ASC";

    const events = await ledgerService.list({
      ...(limit !== undefined ? { limit } : {}),
      ...(offset !== undefined ? { offset } : {}),
      orderBy: order,
    });
    res.json({
      events,
      pagination: {
        limit,
        offset,
        order
      }
    });
  })
);

// Server-Sent Events stream of the audit ledger. On connect it emits a full
// `snapshot` of the current ledger, then pushes each new money action as an
// `append` the instant it is written — so the console's timeline is truly live
// without polling. This is in-process and best-effort; the authoritative record
// is always GET /ledger/events.
ledgerRouter.get(
  "/stream",
  async (req: Request, res: Response) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Disable proxy buffering so events flush immediately.
      "X-Accel-Buffering": "no",
    });
    // Tell EventSource how long to wait before reconnecting if the stream drops.
    res.write("retry: 3000\n\n");

    try {
      // For SSE, we still want the full snapshot without pagination for consistency
      const snapshot = await ledgerService.list();
      res.write(`event: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`);

      const onAppend = (entry: MoneyAction): void => {
        try {
          res.write(`event: append\ndata: ${JSON.stringify(entry)}\n\n`);
        } catch {
          // Client went away between events; the "close" handler will clean up.
        }
      };
      ledgerService.emitter.on("append", onAppend);

      // Comment pings keep intermediaries from closing an idle connection.
      const keepAlive = setInterval(() => {
        try {
          res.write(": keep-alive\n\n");
        } catch {
          /* ignore */
        }
      }, 15000);

      req.on("close", () => {
        clearInterval(keepAlive);
        ledgerService.emitter.off("append", onAppend);
        res.end();
      });
    } catch (error) {
      // If we fail to get the snapshot, we should still try to send an error event?
      // But SSE doesn't have a standard error event. We can close the connection with an error status?
      // However, we already wrote the 200 head. We'll log the error and close.
      console.error("Failed to initialize SSE stream:", error);
      res.status(500).end();
    }
  }
);

ledgerRouter.delete(
  "/events",
  asyncHandler(async (_req: Request, res: Response) => {
    await ledgerService.clear();
    res.status(204).send();
  })
);