import express, { Express } from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import { env } from "./config/env";
import { requestIdMiddleware } from "./middleware/requestId.middleware";
import { loggingMiddleware } from "./middleware/logging.middleware";
import { generalLimiter } from "./middleware/rateLimit.middleware";
import { errorMiddleware, notFoundHandler } from "./middleware/error.middleware";
import apiRouter from "./routes";

import { connectDatabase } from "./config/database";
import { logger } from "./config/logger";

export function createApp(): Express {
  const app = express();

  // 1. Security Headers via Helmet
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
      contentSecurityPolicy: false, // Managed by Next.js on frontend
    })
  );

  // 2. CORS Configuration
  const allowedOrigins = env.CLIENT_URL.split(",").map((url) => url.trim());
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps, curl, server-to-server)
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) !== -1 || env.NODE_ENV === "development" || allowedOrigins.includes("*")) {
          return callback(null, true);
        }
        return callback(new Error(`CORS policy does not allow access from origin: ${origin}`));
      },
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "X-Request-Id", "Range"],
      exposedHeaders: ["X-Request-Id", "Content-Range", "Accept-Ranges"],
    })
  );

  // 3. Body & Cookie Parsing
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true, limit: "2mb" }));
  app.use(cookieParser());

  // 4. Request ID & Structured Logging
  app.use(requestIdMiddleware);
  app.use(loggingMiddleware);

  // 5. Standalone Root & Health endpoints (zero DB dependency, serverless-safe)
  app.get("/", (_req, res) => {
    return res.status(200).json({
      success: true,
      message: "VA Nexus API is running",
    });
  });

  app.get("/api/health", (_req, res) => {
    return res.status(200).json({
      success: true,
      message: "VA Nexus API is running",
    });
  });

  // Favicon handler: return 204 No Content so browser requests never crash
  app.get("/favicon.ico", (_req, res) => {
    return res.status(204).end();
  });

  // 6. Rate Limiting
  app.use("/api", generalLimiter);

  // 7. Serverless Database Auto-Connect for API routes
  app.use("/api", async (req, _res, next) => {
    // Health checks and favicon skip DB connection
    if (req.path === "/health" || req.path === "/favicon.ico") {
      return next();
    }
    try {
      await connectDatabase();
      next();
    } catch (err) {
      logger.error({ err }, "Database connection error in request middleware");
      next(err);
    }
  });

  // 8. Mount API Routes
  app.use("/api", apiRouter);

  // 9. Not Found & Error Handling
  app.use(notFoundHandler);
  app.use(errorMiddleware);

  return app;
}

export const app = createApp();
export default app;
