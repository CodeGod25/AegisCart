import rateLimit from "express-rate-limit";

/**
 * Rate limiter for API endpoints.
 * Configures different limits based on route sensitivity.
 */

/**
 * General API rate limiter - 100 requests per 15 minutes
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: {
    error: "RATE_LIMIT_EXCEEDED",
    message: "Too many requests from this IP, please try again after 15 minutes",
  },
});

/**
 * Strict rate limiter for financial endpoints - 20 requests per 15 minutes
 */
export const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // limit each IP to 20 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "RATE_LIMIT_EXCEEDED",
    message: "Too many requests from this IP, please try again after 15 minutes",
  },
});

/**
 * Lenient rate limiter for public endpoints - 200 requests per 15 minutes
 */
export const lenientLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // limit each IP to 200 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "RATE_LIMIT_EXCEEDED",
    message: "Too many requests from this IP, please try again after 15 minutes",
  },
});