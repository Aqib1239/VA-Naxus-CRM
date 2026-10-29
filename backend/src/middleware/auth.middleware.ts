import { Request, Response, NextFunction } from "express";
import { verifyToken } from "../utils/jwt";
import { User } from "../models/User.model";
import { ApiResponse } from "../utils/response";
import { logger } from "../config/logger";

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    let token: string | undefined;

    // 1. Check Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1];
    } else if (req.cookies && (req.cookies.token || req.cookies.vibhanu_auth_token)) {
      // 2. Check HttpOnly cookie
      token = req.cookies.token || req.cookies.vibhanu_auth_token;
    } else if (typeof req.query.token === "string" && req.query.token) {
      // 3. Check query param token (required for HTML5 media elements like <audio>)
      token = req.query.token;
    }

    if (!token) {
      return ApiResponse.unauthorized(res, "Authentication required. No token provided.");
    }

    // 3. Verify token signature & expiration
    let decoded;
    try {
      decoded = verifyToken(token);
    } catch (err: any) {
      if (err.name === "TokenExpiredError") {
        return ApiResponse.unauthorized(res, "Session expired. Please log in again.");
      }
      return ApiResponse.unauthorized(res, "Invalid authentication token.");
    }

    // 4. Load & validate user from database
    const user = await User.findById(decoded.userId).select("+isActive");
    if (!user) {
      return ApiResponse.unauthorized(res, "User account no longer exists.");
    }

    if (!user.isActive) {
      return ApiResponse.forbidden(res, "User account has been deactivated. Please contact administrator.");
    }

    // 5. Attach authenticated user to request
    req.user = {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      department: user.department,
      avatar: user.avatar,
      isActive: user.isActive,
    };

    next();
  } catch (err: any) {
    const isDbError =
      err?.name === "MongoServerSelectionError" ||
      err?.name === "MongoNetworkError" ||
      err?.name === "MongoTimeoutError" ||
      (typeof err?.message === "string" &&
        (err.message.includes("buffering timed out") ||
          err.message.includes("connection pool") ||
          err.message.includes("MongoNetworkError")));

    logger.error(
      {
        errorName: err?.name,
        errorMessage: err?.message,
        errorStack: err?.stack,
        isDbError,
      },
      "Authentication middleware error"
    );

    if (isDbError) {
      // Forward database failure to error middleware so it is not masked as an invalid token
      return next(err);
    }

    return ApiResponse.unauthorized(res, "Authentication failed.");
  }
}
