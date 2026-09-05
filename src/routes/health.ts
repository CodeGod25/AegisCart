import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler";
import { env } from "../config/env";
import { initializeDatabase } from "../db/client";

/**
 * Health check router providing liveness and readiness probes
 */
export const healthRouter = Router();

// Track startup time for readiness checks
let startupTime = Date.now();
let isReady = false;

/**
 * Initialize health check - call this after all services are ready
 */
export function markAsReady() {
  isReady = true;
}

/**
 * Liveness probe - checks if the service is running
 * Returns 200 if the service is alive, regardless of dependencies
 */
healthRouter.get(
  "/live",
  asyncHandler(async (_req, res) => {
    res.json({
      status: "alive",
      service: "aegiscart",
      timestamp: new Date().toISOString(),
      uptime: Date.now() - startupTime,
    });
  })
);

/**
 * Readiness probe - checks if the service is ready to handle requests
 * Returns 200 if all dependencies are ready, 503 if not
 */
healthRouter.get(
  "/ready",
  asyncHandler(async (req, res) => {
    const checks: Record<string, boolean> = {};
    let overallReady = true;

    // Check database connection
    try {
      const db = await initializeDatabase();
      // Try a simple query to verify connection
      // Note: In a real implementation, you'd do a proper health check query
      checks.database = true;
    } catch (error) {
      checks.database = false;
      overallReady = false;
    }

    // Check external service connectivity (example: Razorpay)
    // In a real implementation, you'd check actual service health
    checks.externalServices = true; // Placeholder

    // Check if service is marked as ready
    checks.serviceReady = isReady;

    overallReady = overallReady && isReady;

    const statusCode = overallReady ? 200 : 503;
    res.status(statusCode).json({
      status: overallReady ? "ready" : "not ready",
      service: "aegiscart",
      timestamp: new Date().toISOString(),
      checks,
    });
  })
);

/**
 * Comprehensive health endpoint combining liveness and readiness
 */
healthRouter.get(
  "",
  asyncHandler(async (_req, res) => {
    // For backward compatibility, also provide the simple health check
    const systemMetrics = {
      memory: process.memoryUsage(),
      nodeVersion: process.version,
      uptime: process.uptime(),
    };
    res.json({
      status: "ok",
      service: "aegiscart",
      timestamp: new Date().toISOString(),
      version: env.APP_VERSION || "1.0.0",
      environment: env.NODE_ENV || "development",
      system: systemMetrics,
    });
  })
);