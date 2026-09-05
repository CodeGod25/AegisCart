import { Request, Response, NextFunction } from "express";

/**
 * Logger middleware for request/response logging
 * Adds correlation IDs and logs request details
 */
export function requestLogger(
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Generate correlation ID if not present
  const requestId =
    req.headers["x-request-id"] ||
    Math.random().toString(36).substring(2, 15) +
      Math.random().toString(36).substring(2, 15);

  // Add request ID to request object for downstream use
  (req as any).requestId = requestId as string;

  // Record start time
  const startTime = Date.now();

  // Log incoming request
  console.info(
    `[${requestId}] ${req.method} ${req.path} - IP: ${req.ip || req.connection.remoteAddress}`
  );

  // Log request body for non-sensitive endpoints (be careful with PII/payment data)
  if (
    req.method === "POST" ||
    req.method === "PUT" ||
    req.method === "PATCH"
  ) {
    // Skip logging body for sensitive endpoints
    const sensitivePaths = ["/checkout", "/x402", "/payment", "/webhooks"];
    const isSensitive = sensitivePaths.some((path) =>
      req.path.startsWith(path)
    );

    if (!isSensitive && Object.keys(req.body).length > 0) {
      // Log truncated body to avoid excessive logging
      const bodyLength = JSON.stringify(req.body).length;
      if (bodyLength < 1000) {
        // Debug logging removed for production - uncomment if needed for troubleshooting
        // console.debug(`[${requestId}] Request Body:`, req.body);
      } else {
        // Debug logging removed for production - uncomment if needed for troubleshooting
        // console.debug(`[${requestId}] Request Body: [TRUNCATED - ${bodyLength} chars]`);
      }
    }
  }

  // Handle response finishing
  res.on("finish", () => {
    const duration = Date.now() - startTime;
    console.info(
      `[${requestId}] ${req.method} ${req.path} - ${res.statusCode} - ${duration}ms`
    );
  });

  // Handle response closing (client disconnect)
  res.on("close", () => {
    const duration = Date.now() - startTime;
    console.info(
      `[${requestId}] ${req.method} ${req.path} - Client Disconnected - ${duration}ms`
    );
  });

  next();
}