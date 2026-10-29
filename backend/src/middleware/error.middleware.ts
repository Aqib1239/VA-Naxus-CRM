import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import multer from "multer";
import { ApiResponse } from "../utils/response";
import { logger } from "../config/logger";
import { env } from "../config/env";

export function errorMiddleware(err: any, req: Request, res: Response, _next: NextFunction) {
  logger.error(
    {
      err: {
        message: err.message,
        name: err.name,
        stack: env.NODE_ENV === "development" ? err.stack : undefined,
      },
      requestId: req.requestId,
      path: req.originalUrl,
      method: req.method,
    },
    "Unhandled Exception Caught in Error Middleware"
  );

  // 1. Zod validation error
  if (err instanceof ZodError) {
    const errors: Record<string, string> = {};
    err.errors.forEach((e) => {
      const field = e.path.join(".");
      errors[field || "general"] = e.message;
    });
    return ApiResponse.unprocessable(res, "Validation failed", errors);
  }

  // 2. Multer file upload errors
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      const maxMb = Math.round(env.MAX_AUDIO_FILE_SIZE / (1024 * 1024));
      return ApiResponse.badRequest(res, `Audio file exceeds maximum allowed size of ${maxMb}MB.`);
    }
    return ApiResponse.badRequest(res, `File upload error: ${err.message}`);
  }

  // 3. Mongoose CastError (invalid ObjectId)
  if (err.name === "CastError") {
    return ApiResponse.badRequest(res, `Invalid resource identifier format: ${err.value}`);
  }

  // 4. Mongoose validation error
  if (err.name === "ValidationError") {
    const errors: Record<string, string> = {};
    Object.keys(err.errors || {}).forEach((key) => {
      errors[key] = err.errors[key].message;
    });
    return ApiResponse.unprocessable(res, "Database validation error", errors);
  }

  // 5. MongoDB duplicate key error (E11000)
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || "field";
    const value = err.keyValue ? err.keyValue[field] : "";
    return ApiResponse.conflict(res, `A record with ${field} '${value}' already exists.`);
  }

  // 6. JWT token errors
  if (err.name === "JsonWebTokenError") {
    return ApiResponse.unauthorized(res, "Invalid token signature.");
  }
  if (err.name === "TokenExpiredError") {
    return ApiResponse.unauthorized(res, "Authentication token has expired.");
  }

  // 7. Database connection errors
  if (
    err.name === "MongoServerSelectionError" ||
    err.name === "MongoNetworkError" ||
    err.name === "MongoTimeoutError"
  ) {
    return ApiResponse.error(
      res,
      "Database connection is currently unavailable. Please verify MongoDB service status.",
      503
    );
  }

  // 8. OpenRouter / AI Provider errors with specific HTTP status codes
  const isOpenRouterError =
    err.name === "OpenRouterApiError" ||
    err.name === "OpenRouterRateLimitError" ||
    err.name === "OpenRouterTimeoutError" ||
    err.name === "OpenRouterConfigError";

  const statusCode =
    err.statusCode || (err.status && typeof err.status === "number" ? err.status : 500);
  const message = err.message || "An unexpected internal server error occurred.";

  const clientMessage =
    isOpenRouterError
      ? message
      : statusCode >= 500 && env.NODE_ENV === "production"
        ? "Internal server error"
        : message;

  return ApiResponse.error(
    res,
    clientMessage,
    statusCode,
    err.errors
  );
}

export function notFoundHandler(req: Request, res: Response) {
  return ApiResponse.notFound(res, `Route '${req.method} ${req.originalUrl}' does not exist.`);
}
