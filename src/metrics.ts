import client from "prom-client";
import { Request, Response, NextFunction } from "express";

// Create a register to collect metrics
export const register = new client.Registry();

// Enable collection of default metrics (memory usage, GC, etc.)
client.collectDefaultMetrics({ register });

// Create a histogram for HTTP request duration
export const httpRequestDurationMs = new client.Histogram({
  name: "http_request_duration_ms",
  help: "Duration of HTTP requests in ms",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.1, 5, 15, 50, 100, 300, 500, 1000, 3000, 5000], // time buckets for response time
});

// Create a counter for HTTP requests
export const httpRequestsTotal = new client.Counter({
  name: "http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "route", "status_code"],
});

// Create a counter for HTTP errors (status code >= 400)
export const httpErrorsTotal = new client.Counter({
  name: "http_errors_total",
  help: "Total number of HTTP errors (status code >= 400)",
  labelNames: ["method", "route", "status_code"],
});

// Register the custom metrics
register.registerMetric(httpRequestDurationMs);
register.registerMetric(httpRequestsTotal);
register.registerMetric(httpErrorsTotal);

// Middleware to collect metrics
export const metricsMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();

  res.on("finish", () => {
    const responseTime = Date.now() - startTime;
    const route = req.route ? req.route.path : req.path;
    const method = req.method;
    const statusCode = res.statusCode;

    httpRequestsTotal.inc({ method, route, status_code: String(statusCode) });
    httpRequestDurationMs.observe({ method, route, status_code: String(statusCode) }, responseTime);

    if (statusCode >= 400) {
      httpErrorsTotal.inc({ method, route, status_code: String(statusCode) });
    }
  });

  next();
};