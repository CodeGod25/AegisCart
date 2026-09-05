import { Request, Response, NextFunction } from "express";

declare global {
  interface Error {
    status?: number;
    details?: unknown;
    validationErrors?: unknown;
  }
}

/**
 * Standardized error response format
 */
export interface ErrorResponse {
  error: string;
  message?: string;
  details?: any;
  timestamp: string;
  path?: string;
  requestId?: string;
}

/**
 * Generate a standardized error response
 */
export function createErrorResponse(
  error: string,
  options: {
    message?: string;
    details?: any;
    req?: Request;
  } = {}
): ErrorResponse {
  const response: ErrorResponse = {
    error,
    timestamp: new Date().toISOString(),
  };

  if (options.message !== undefined) response.message = options.message;
  if (options.details !== undefined) response.details = options.details;
  if (options.req?.path !== undefined) response.path = options.req.path;
  const requestId = options.req?.headers["x-request-id"];
  if (typeof requestId === "string") response.requestId = requestId;
  return response;
}

/**
 * Centralized error handling middleware
 * Catches all async errors and formats them consistently
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Error formatting middleware
 * Formats errors into consistent JSON responses
 */
export function errorFormatter(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) {
  // If headers already sent, delegate to Express' default error handler
  if (res.headersSent) {
    return next(err);
  }

  // Determine status code
  const statusCode =
    err.status || err.statusCode || (err instanceof Error ? 500 : 500);

  // Create standardized error response
  const errorResponse: ErrorResponse = {
    error: err.name || "INTERNAL_SERVER_ERROR",
    message: err.message || "An internal server error occurred",
    timestamp: new Date().toISOString(),
    path: req.path,
  };
  const details = err.details || err.validationErrors;
  if (details !== undefined) errorResponse.details = details;
  const requestId = req.headers["x-request-id"];
  if (typeof requestId === "string") errorResponse.requestId = requestId;

  // Log the error for debugging (in production, use proper logger)
  console.error(`[${errorResponse.requestId}] ${err.stack || err}`);

  // Send response
  res.status(statusCode).json(errorResponse);
}

/**
 * Validation error helper for Zod
 */
export function zodValidationError(error: any): ErrorResponse {
  return createErrorResponse("VALIDATION_ERROR", {
    message: "Invalid request payload",
    details: error.format?.() || error.errors,
  });
}