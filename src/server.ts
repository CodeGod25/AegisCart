import { app } from "./app";
import { env } from "./config/env";
import { initializeDatabase, closeDatabase } from "./db/client";
import { logger } from "./logger";
import { markAsReady } from "./routes/health";

let server: any; // We'll assign the server instance here

async function bootstrap() {
  await initializeDatabase();

  // Mark service as ready after all initialization is complete
  markAsReady();

  server = app.listen(env.PORT, () => {
    logger.info(`AegisCart API listening on port ${env.PORT}`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully`);
    // Stop accepting new connections
    server.close(async (err: any) => {
      if (err) {
        logger.error({ err: err.message }, "Error during server shutdown");
        process.exit(1);
      }
      logger.info("Server closed");
      // Close the database connection
      try {
        await closeDatabase();
        logger.info("Database connection closed");
      } catch (dbErr) {
        logger.error({ err: dbErr instanceof Error ? dbErr.message : String(dbErr) }, "Error closing database connection");
      }
      logger.info("Shutdown complete");
      process.exit(0);
    });

    // Force shutdown after 10 seconds
    setTimeout(() => {
      logger.warn("Force shutting down after timeout");
      process.exit(1);
    }, 10000);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

bootstrap().catch((error) => {
  logger.error({ err: error.message, stack: error.stack }, "Failed to bootstrap AegisCart");
  process.exit(1);
});