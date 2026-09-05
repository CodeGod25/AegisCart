import pino from "pino";
import pinoHttp from "pino-http";
import { env } from "./config/env";

// Define transport based on environment
let transportOptions: Parameters<typeof pino.transport>[0] = {
  target: "pino-pretty",
  options: {
    colorize: true,
    translateTime: "SYS:standard",
    ignore: "pid,hostname",
  },
};

// In production, we might want to write to a file or use a different transport
// For now, we'll use pretty print in development and JSON in production
if (env.NODE_ENV === "production") {
  transportOptions = {
    target: "pino/file",
    options: {
      destination: "./logs/aegiscart.log",
      mkdir: true,
    },
  };
}

// Create logger instance
export const logger = pino(
  {
    level: env.LOG_LEVEL,
    base: {
      service: "aegiscart",
      version: env.APP_VERSION,
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  pino.transport(transportOptions)
);

// HTTP logger middleware for express
export const httpLogger = pinoHttp({
  logger,
  // Custom serializers to redact sensitive headers
  serializers: {
    req: (req: any) => {
      return {
        method: req.method,
        url: req.url,
        headers: {
          ...req.headers,
          // Redact authorization and cookie headers
          authorization: "[REDACTED]",
          cookie: "[REDACTED]",
        },
      };
    },
    res: (res: any) => {
      return {
        statusCode: res.statusCode,
      };
    },
    err: (err: any) => {
      return {
        type: err.type || err.name || err.constructor.name,
        message: err.message,
        stack: err.stack,
      };
    },
  },
  // Custom attribute to include request ID if we implement it later
  genReqId: (req: any) => req.id || req.headers["x-request-id"] || undefined,
} as any);

export default logger;