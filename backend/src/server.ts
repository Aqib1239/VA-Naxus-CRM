import { app } from "./app";
import { env } from "./config/env";
import { logger } from "./config/logger";
import { connectDatabase, disconnectDatabase } from "./config/database";
import { seedDatabaseIfEmpty } from "./scripts/seed";

let server: any = null;

async function startServer() {
  try {
    // 1. Connect to Database
    await connectDatabase();

    // 2. Auto-seed if database has no users in development
    if (env.NODE_ENV !== "production") {
      await seedDatabaseIfEmpty();
    }

    // 3. Start listening
    server = app.listen(env.PORT, () => {
      logger.info(`=======================================================`);
      logger.info(`🚀 VibhAnu CRM Backend API running on port ${env.PORT}`);
      logger.info(`🔗 Environment: ${env.NODE_ENV}`);
      logger.info(`🔗 API Health: http://localhost:${env.PORT}/api/health`);
      logger.info(`🔗 Allowed Client: ${env.CLIENT_URL}`);
      logger.info(`=======================================================`);
    });

    // 4. Handle Process Signals for Graceful Shutdown
    const handleShutdown = async (signal: string) => {
      logger.info(`Received ${signal}. Starting graceful shutdown...`);

      if (server) {
        server.close(async () => {
          logger.info("HTTP server closed.");
          await disconnectDatabase();
          process.exit(0);
        });

        // Force shutdown after 10s if hanging
        setTimeout(() => {
          logger.error("Could not close connections in time, forcefully shutting down");
          process.exit(1);
        }, 10000);
      } else {
        await disconnectDatabase();
        process.exit(0);
      }
    };

    process.on("SIGTERM", () => handleShutdown("SIGTERM"));
    process.on("SIGINT", () => handleShutdown("SIGINT"));
  } catch (err) {
    logger.fatal({ err }, "Fatal error during server startup");
    process.exit(1);
  }
}

// Only start standalone HTTP listener when running as direct server (not inside Vercel serverless functions)
if (!process.env.VERCEL) {
  startServer();
}

export { app, startServer };
export default app;
