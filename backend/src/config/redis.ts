import Redis from "ioredis";
import { env } from "./env";
import { logger } from "./logger";

let redisClient: Redis | null = null;
let mockClient: any = null;

/**
 * Sanitizes Redis connection URLs to prevent credentials from being exposed in logs or errors.
 */
export function maskRedisUrl(rawUrl?: string): string {
  if (!rawUrl) return "[NOT CONFIGURED]";
  try {
    const url = new URL(rawUrl);
    if (url.password) {
      url.password = "******";
    }
    url.search = "";
    return url.toString();
  } catch {
    return rawUrl.replace(/:([^:@]+)@/, ":******@").split("?")[0];
  }
}

/**
 * Returns the active Redis client for shared state across serverless instances.
 * In production, fails closed if Redis is unconfigured or unavailable.
 */
export function getRedisClient(): Redis | null {
  if (mockClient) {
    return mockClient;
  }

  if (redisClient) {
    return redisClient;
  }

  const redisUrl = (
    env.REDIS_URL ||
    process.env.REDIS_URL ||
    process.env.KV_URL ||
    process.env.UPSTASH_REDIS_URL ||
    ""
  ).trim();

  const isProd = env.NODE_ENV === "production" || process.env.NODE_ENV === "production";

  if (!redisUrl) {
    if (isProd) {
      throw new Error(
        "FATAL: REDIS_URL (or KV_URL) is required in production for serverless media ticket consistency. Process-local storage is prohibited in production."
      );
    }
    return null;
  }

  try {
    const masked = maskRedisUrl(redisUrl);
    logger.info({ redisUrl: masked }, "Initializing Redis client for shared serverless state");

    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      connectTimeout: 5000,
      enableReadyCheck: true,
      lazyConnect: false,
      retryStrategy: (times) => {
        if (times > 5) {
          logger.error("Redis retry limit exceeded");
          return null;
        }
        return Math.min(times * 200, 2000);
      },
    });

    redisClient.on("error", (err) => {
      const sanitizedMsg = err?.message ? maskRedisUrl(err.message) : "Unknown Redis connection error";
      logger.error({ err: sanitizedMsg }, "Redis connection error");
    });

    redisClient.on("connect", () => {
      logger.info("Connected to Redis shared datastore");
    });

    return redisClient;
  } catch (err: any) {
    const sanitizedMsg = err?.message ? maskRedisUrl(err.message) : "Failed to instantiate Redis client";
    logger.error({ err: sanitizedMsg }, "Failed to instantiate Redis client");
    if (isProd) {
      throw new Error("FATAL: Failed to connect to Redis in production.");
    }
    return null;
  }
}

/**
 * Checks whether Redis is configured in the environment.
 */
export function isRedisConfigured(): boolean {
  return Boolean(
    mockClient ||
      env.REDIS_URL ||
      process.env.REDIS_URL ||
      process.env.KV_URL ||
      process.env.UPSTASH_REDIS_URL
  );
}

/**
 * Sets a mock Redis client (used for offline Jest tests).
 */
export function setMockRedisClient(client: any): void {
  mockClient = client;
}

/**
 * Clears the mock client.
 */
export function clearMockRedisClient(): void {
  mockClient = null;
}

/**
 * Closes the active Redis connection.
 */
export async function closeRedisConnection(): Promise<void> {
  if (redisClient) {
    try {
      await redisClient.quit();
    } catch {
      redisClient.disconnect();
    }
    redisClient = null;
  }
  mockClient = null;
}
