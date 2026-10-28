import rateLimit from "express-rate-limit";
import { ApiResponse } from "../utils/response";
import { env } from "../config/env";

export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: env.NODE_ENV === "test" ? 10000 : 300, // Limit each IP
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    return ApiResponse.error(res, "Too many requests from this IP. Please try again later.", 429);
  },
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: env.NODE_ENV === "test" ? 10000 : 25, // Limit login attempts
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    return ApiResponse.error(res, "Too many login attempts. Please wait 15 minutes before trying again.", 429);
  },
});

export const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.NODE_ENV === "test" ? 10000 : 50,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    return ApiResponse.error(res, "Upload limit reached. Please try again later.", 429);
  },
});

export const aiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: env.NODE_ENV === "test" ? 10000 : 30, // 30 AI requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    return ApiResponse.error(
      res,
      "AI request rate limit reached. Please wait a moment before sending more queries.",
      429
    );
  },
});
