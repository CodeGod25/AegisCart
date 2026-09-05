import cors from "cors";
import express from "express";
import path from "path";
import { agentRouter } from "./routes/agent";
import { buyerRouter } from "./routes/buyer";
import { catalogRouter } from "./routes/catalog";
import { checkoutRouter } from "./routes/checkout";
import { demoRouter } from "./routes/demo";
import { ledgerRouter } from "./routes/ledger";
import { mandateRouter } from "./routes/mandates";
import { metricsRouter } from "./routes/metrics";
import { negotiationRouter } from "./routes/negotiate";
import { offerRouter } from "./routes/offers";
import { approvalRouter } from "./routes/approvals";
import { revenueRouter } from "./routes/revenue";
import { sessionRouter } from "./routes/sessions";
import { simulationRouter } from "./routes/simulate";
import { webhookRouter } from "./routes/webhooks";
import { wellKnownRouter } from "./routes/wellKnown";
import { x402Router } from "./routes/x402";
import { healthRouter } from "./routes/health";
import { infoRouter } from "./routes/info";
import { requestLogger } from "./middleware/logger";
import { errorFormatter } from "./middleware/errorHandler";
import { apiLimiter, strictLimiter, lenientLimiter } from "./middleware/rateLimiter";
import { metricsMiddleware } from "./metrics";

export const app = express();

// CORS middleware - must be first to handle preflight OPTIONS requests across origins
app.use(
  cors({
    origin: true,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept", "Origin"],
  })
);

// Request logging - log all requests
app.use(requestLogger);

// Rate limiting - protect endpoints
app.use("/webhooks", strictLimiter); // Webhooks are critical
app.use("/negotiate", strictLimiter); // Financial operations
app.use("/offers", strictLimiter); // Offer operations
app.use("/mandates", strictLimiter); // Mandate operations
app.use("/approvals", strictLimiter); // Approval operations
app.use("/checkout", strictLimiter); // Checkout operations
app.use("/x402", strictLimiter); // x402 operations
app.use("/api/", apiLimiter); // General API routes
app.use(lenientLimiter); // Lenient limit for public endpoints

// Built-in middleware
app.use("/webhooks", express.raw({ type: "application/json" }), webhookRouter);
app.use(express.json());
app.use(express.static(path.join(process.cwd(), "public")));

// Metrics collection - after routes but before error handling
app.use(metricsMiddleware);

// Health check (no auth needed)
app.use("/health", healthRouter);

// Public endpoints
app.use("/.well-known", wellKnownRouter);
app.use("/catalog", catalogRouter);
app.use("/info", infoRouter);

// Protected endpoints (require authentication in production)
app.use("/negotiate", negotiationRouter);
app.use("/offers", offerRouter);
app.use("/mandates", mandateRouter);
app.use("/approvals", approvalRouter);
app.use("/checkout", checkoutRouter);
app.use("/demo", demoRouter);
app.use("/x402", x402Router);
app.use("/agent", agentRouter);
app.use("/buyer", buyerRouter);
app.use("/revenue", revenueRouter);
app.use("/metrics", metricsRouter);
app.use("/ledger", ledgerRouter);
app.use("/simulate", simulationRouter);
app.use("/sessions", sessionRouter);

// Error handling - should be last
app.use(errorFormatter);

app.get("/", (_req, res) => {
  res.sendFile(path.join(process.cwd(), "public", "index.html"));
});