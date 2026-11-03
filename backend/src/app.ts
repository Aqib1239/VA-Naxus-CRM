import express, { Express } from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import { env } from "./config/env";
import { getCorsOptions } from "./config/cors";
import { requestIdMiddleware } from "./middleware/requestId.middleware";
import { loggingMiddleware } from "./middleware/logging.middleware";
import { generalLimiter } from "./middleware/rateLimit.middleware";
import { errorMiddleware, notFoundHandler } from "./middleware/error.middleware";
import apiRouter from "./routes";

import { connectDatabase } from "./config/database";
import { logger } from "./config/logger";

export function createApp(customCorsOrigins?: string[]): Express {
  const app = express();

  // 1. API Security Headers via Helmet (Hardened for REST & Audio Streaming API)
  app.use(
    helmet({
      frameguard: { action: "deny" },
      noSniff: true,
      dnsPrefetchControl: { allow: false },
      crossOriginResourcePolicy: { policy: "cross-origin" },
      referrerPolicy: { policy: "no-referrer" },
      hsts: {
        maxAge: 63072000,
        includeSubDomains: true,
        preload: true,
      },
      contentSecurityPolicy: false, // Inappropriate for JSON API & binary audio responses; enforced on frontend
    })
  );

  // 2. Strict CORS Configuration (Explicit origin allowlist, no reflection, credentials only for trusted)
  const allowedOrigins = customCorsOrigins || env.corsAllowedOrigins;
  app.use(cors(getCorsOptions(allowedOrigins)));

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
