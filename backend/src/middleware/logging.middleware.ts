import { Request, Response, NextFunction } from "express";
import { logger } from "../config/logger";

/**
 * Sanitizes URLs to prevent credentials, media tickets, or sensitive tokens
 * from leaking into server stdout, log files, or log aggregators.
 */
export function sanitizeUrlForLogging(rawUrl?: string): string {
  if (!rawUrl || typeof rawUrl !== "string") return rawUrl || "";

  try {
    return rawUrl
      .replace(/([?&]ticket=)[^&]+/gi, "$1[REDACTED]")
      .replace(/([?&]token=)[^&]+/gi, "$1[REDACTED]")
      .replace(/([?&]password=)[^&]+/gi, "$1[REDACTED]")
      .replace(/([?&]secret=)[^&]+/gi, "$1[REDACTED]")
      .replace(/([?&]api_key=)[^&]+/gi, "$1[REDACTED]")
      .replace(/([?&]signature=)[^&]+/gi, "$1[REDACTED]")
      .replace(/(\/s--)[^/]+(--\/)/gi, "$1[REDACTED]$2");
  } catch {
    return rawUrl;
  }
}

export function loggingMiddleware(req: Request, res: Response, next: NextFunction) {
  const startTime = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - startTime;
    const sanitizedPath = sanitizeUrlForLogging(req.originalUrl || req.url);

    const logData = {
      requestId: req.requestId,
      method: req.method,
      path: sanitizedPath,
      statusCode: res.statusCode,
      durationMs: duration,
      userId: req.user?.id,
      role: req.user?.role,
    };

    if (process.env.NODE_ENV !== "production") {
      console.log(`[API] ${req.method} ${sanitizedPath} ${res.statusCode} in ${duration}ms`);
    }

    if (res.statusCode >= 500) {
      logger.error(logData, "HTTP Request Server Error");
    } else if (res.statusCode >= 400) {
      logger.warn(logData, "HTTP Request Client Error");
    } else {
      logger.info(logData, "HTTP Request Handled");
    }
  });

  next();
}
