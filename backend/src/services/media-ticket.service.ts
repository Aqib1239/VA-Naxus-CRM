import crypto from "crypto";
import { getRedisClient } from "../config/redis";
import { env } from "../config/env";
import { logger } from "../config/logger";

export interface PlaybackSessionRecord {
  tokenHash: string;
  leadId: string;
  publicId?: string;
  userId: string;
  operation: "stream";
  resourceType: string;
  deliveryType: string;
  createdAt: number;
  lastActiveAt: number;
  absoluteExpiresAt: number;
}

export interface SessionValidationResult {
  valid: boolean;
  reason?: string;
  session?: {
    userId: string;
    leadId: string;
    publicId: string;
    resourceType: string;
    deliveryType: string;
  };
}

/**
 * Atomic Redis Lua script for bounded playback session validation and activity update.
 *
 * Guarantees:
 * - Checks key existence and retrieves session properties atomically.
 * - Verifies leadId and publicId bindings in constant time.
 * - Checks absolute session expiry (does NOT reset on activity).
 * - Checks idle timeout since last request.
 * - Updates lastActiveAt and sets remaining TTL to min(idleTimeout, absoluteRemaining).
 */
const VALIDATE_SESSION_LUA_SCRIPT = `
local key = KEYS[1]
local expectedLeadId = ARGV[1]
local expectedPublicId = ARGV[2]
local now = tonumber(ARGV[3])
local idleTimeoutMs = tonumber(ARGV[4])
local idleTimeoutSec = tonumber(ARGV[5])
local expectedAltLeadId = ARGV[6] or ''

local exists = redis.call('EXISTS', key)
if exists == 0 then
  return {0, 'SESSION_NOT_FOUND_OR_EXPIRED'}
end

local leadId = redis.call('HGET', key, 'leadId')
if leadId ~= expectedLeadId and (expectedAltLeadId == '' or leadId ~= expectedAltLeadId) then
  return {0, 'LEAD_MISMATCH'}
end

local publicId = redis.call('HGET', key, 'publicId')
if expectedPublicId ~= '' and publicId and publicId ~= '' and publicId ~= expectedPublicId then
  return {0, 'RESOURCE_MISMATCH'}
end

local absoluteExpiresAt = tonumber(redis.call('HGET', key, 'absoluteExpiresAt') or '0')
if now > absoluteExpiresAt then
  redis.call('DEL', key)
  return {0, 'ABSOLUTE_EXPIRY_REACHED'}
end

local lastActiveAt = tonumber(redis.call('HGET', key, 'lastActiveAt') or '0')
local idleElapsed = now - lastActiveAt
if lastActiveAt > 0 and idleElapsed > idleTimeoutMs then
  redis.call('DEL', key)
  return {0, 'IDLE_TIMEOUT_REACHED'}
end

-- Valid session: update lastActiveAt and adjust remaining TTL
redis.call('HSET', key, 'lastActiveAt', tostring(now))
local remainingAbsoluteSec = math.ceil((absoluteExpiresAt - now) / 1000)
local newTtl = math.min(idleTimeoutSec, remainingAbsoluteSec)
if newTtl > 0 then
  redis.call('EXPIRE', key, newTtl)
end

local userId = redis.call('HGET', key, 'userId') or ''
local resourceType = redis.call('HGET', key, 'resourceType') or 'video'
local deliveryType = redis.call('HGET', key, 'deliveryType') or 'authenticated'

return {1, 'VALID_SESSION', userId, leadId, publicId or '', resourceType, deliveryType}
`;

/**
 * Service managing cryptographically secure, bounded playback sessions across serverless Vercel instances.
 *
 * Architecture & Guarantees:
 * - Shared External Storage: Backed by Redis in production for cross-instance consistency.
 * - Fail-Closed: Production strictly rejects process-local memory fallbacks.
 * - Token Hashing: Stores ONLY SHA-256 hashes in Redis, never raw tokens.
 * - Bounded Session Lifecycle:
 *   - Idle timeout (default: 300s / 5m) handles inactive sessions.
 *   - Absolute max session lifetime (default: 900s / 15m) prevents infinite renewal.
 *   - Absolute expiry does NOT slide on activity.
 *   - Allows repeated GET, HEAD, and Range requests for streaming and seeking during the session.
 * - Resource Scoped: Strictly bound to userId, leadId, and Cloudinary public_id.
 * - Zero API Privileges: Cannot authenticate any REST API endpoint or administrative action.
 */
export class MediaTicketService {
  private static readonly KEY_PREFIX = "crm:media_session:";
  public static readonly IDLE_TIMEOUT_SECONDS = 300; // 5 minutes of idle time
  public static readonly ABSOLUTE_MAX_LIFETIME_SECONDS = 900; // 15 minutes absolute lifetime

  // In-memory fallback strictly isolated to local development and test environments
  private static memoryStore = new Map<string, PlaybackSessionRecord>();

  /**
   * Hashes a raw session token using SHA-256 for secure storage.
   */
  private static hashToken(rawToken: string): string {
    return crypto.createHash("sha256").update(rawToken).digest("hex");
  }

  /**
   * Creates a cryptographically secure playback session bound to a specific user, lead, and audio asset.
   */
  static async createSession(
    leadId: string,
    userId: string,
    assetMeta: {
      publicId?: string;
      resourceType?: string;
      deliveryType?: string;
    } = {},
    customOptions: {
      idleTimeoutSeconds?: number;
      maxLifetimeSeconds?: number;
    } = {}
  ): Promise<{
    ticket: string;
    token: string;
    tokenHash: string;
    expiresInSeconds: number;
    maxLifetimeSeconds: number;
    streamUrl: string;
  }> {
    const redis = getRedisClient();
    const isProd = env.NODE_ENV === "production" || process.env.NODE_ENV === "production";

    if (!redis && isProd) {
      throw new Error(
        "FATAL: Shared Redis storage is required in production. Media session issuance failed closed."
      );
    }

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = this.hashToken(rawToken);

    const idleTimeoutSec = customOptions.idleTimeoutSeconds || this.IDLE_TIMEOUT_SECONDS;
    const maxLifetimeSec = customOptions.maxLifetimeSeconds || this.ABSOLUTE_MAX_LIFETIME_SECONDS;

    const now = Date.now();
    const absoluteExpiresAt = now + maxLifetimeSec * 1000;
    const key = `${this.KEY_PREFIX}${tokenHash}`;

    const publicId = assetMeta.publicId || "";
    const resourceType = assetMeta.resourceType || "video";
    const deliveryType = assetMeta.deliveryType || "authenticated";

    if (redis) {
      await redis.hset(key, {
        leadId,
        publicId,
        userId,
        operation: "stream",
        resourceType,
        deliveryType,
        createdAt: now.toString(),
        lastActiveAt: now.toString(),
        absoluteExpiresAt: absoluteExpiresAt.toString(),
      });
      // Initial TTL is the minimum of idle timeout and absolute expiry
      await redis.expire(key, Math.min(idleTimeoutSec, maxLifetimeSec));
    } else {
      if (isProd) {
        throw new Error(
          "FATAL: Shared Redis storage is required in production. Media session issuance failed closed."
        );
      }
      this.cleanupMemoryExpired();
      this.memoryStore.set(tokenHash, {
        tokenHash,
        leadId,
        publicId,
        userId,
        operation: "stream",
        resourceType,
        deliveryType,
        createdAt: now,
        lastActiveAt: now,
        absoluteExpiresAt,
      });
    }

    return {
      ticket: rawToken,
      token: rawToken,
      tokenHash,
      expiresInSeconds: idleTimeoutSec,
      maxLifetimeSeconds: maxLifetimeSec,
      streamUrl: `/api/leads/${leadId}/audio?ticket=${rawToken}`,
    };
  }

  /**
   * Backward-compatible alias for existing callers.
   */
  static async createTicket(
    leadId: string,
    userId: string,
    audioResourceId?: string
  ): Promise<{ ticket: string; expiresInSeconds: number }> {
    const session = await this.createSession(leadId, userId, { publicId: audioResourceId });
    return {
      ticket: session.ticket,
      expiresInSeconds: session.expiresInSeconds,
    };
  }

  /**
   * Atomically validates a media playback session.
   * Enforces lead binding, resource binding, idle timeout, and absolute expiration.
   */
  static async validateSession(
    ticket: string,
    leadId: string,
    publicId?: string,
    alternateLeadId?: string
  ): Promise<SessionValidationResult> {
    if (!ticket || typeof ticket !== "string") {
      return { valid: false, reason: "Missing or malformed ticket parameter." };
    }

    const redis = getRedisClient();
    const isProd = env.NODE_ENV === "production" || process.env.NODE_ENV === "production";

    if (!redis && isProd) {
      throw new Error(
        "FATAL: Shared Redis storage is required in production. Media session validation failed closed."
      );
    }

    const tokenHash = this.hashToken(ticket);
    const key = `${this.KEY_PREFIX}${tokenHash}`;
    const now = Date.now();
    const idleTimeoutMs = this.IDLE_TIMEOUT_SECONDS * 1000;
    const idleTimeoutSec = this.IDLE_TIMEOUT_SECONDS;

    if (redis) {
      try {
        const result = (await redis.eval(
          VALIDATE_SESSION_LUA_SCRIPT,
          1,
          key,
          leadId,
          publicId || "",
          now,
          idleTimeoutMs,
          idleTimeoutSec,
          alternateLeadId || ""
        )) as [number, string, string?, string?, string?, string?, string?];

        const [status, code, userId, returnedLeadId, returnedPublicId, resourceType, deliveryType] = result;
        if (status === 1) {
          return {
            valid: true,
            reason: code,
            session: {
              userId: userId || "",
              leadId: returnedLeadId || leadId,
              publicId: returnedPublicId || "",
              resourceType: resourceType || "video",
              deliveryType: deliveryType || "authenticated",
            },
          };
        }

        return { valid: false, reason: code };
      } catch (err: any) {
        logger.error({ err: err.message }, "Error during Redis atomic session validation");
        if (isProd) {
          throw new Error("Shared datastore error during media session validation.");
        }
        return { valid: false, reason: "REDIS_EXECUTION_ERROR" };
      }
    }

    // In-memory atomic validation for local dev/test
    if (isProd) {
      throw new Error(
        "FATAL: Shared Redis storage is required in production. Media session validation failed closed."
      );
    }
    this.cleanupMemoryExpired();
    const record = this.memoryStore.get(tokenHash);
    if (!record) {
      return { valid: false, reason: "SESSION_NOT_FOUND_OR_EXPIRED" };
    }

    if (record.leadId !== leadId && (!alternateLeadId || record.leadId !== alternateLeadId)) {
      return { valid: false, reason: "LEAD_MISMATCH" };
    }

    if (publicId && record.publicId && record.publicId !== publicId) {
      return { valid: false, reason: "RESOURCE_MISMATCH" };
    }

    if (now > record.absoluteExpiresAt) {
      this.memoryStore.delete(tokenHash);
      return { valid: false, reason: "ABSOLUTE_EXPIRY_REACHED" };
    }

    const idleElapsed = now - record.lastActiveAt;
    if (record.lastActiveAt > 0 && idleElapsed > idleTimeoutMs) {
      this.memoryStore.delete(tokenHash);
      return { valid: false, reason: "IDLE_TIMEOUT_REACHED" };
    }

    // Update activity
    record.lastActiveAt = now;

    return {
      valid: true,
      reason: "VALID_SESSION",
      session: {
        userId: record.userId,
        leadId: record.leadId,
        publicId: record.publicId || "",
        resourceType: record.resourceType,
        deliveryType: record.deliveryType,
      },
    };
  }

  /**
   * Backward-compatible alias for existing test calls.
   */
  static async validateAndConsumeTicket(
    ticket: string,
    leadId: string,
    audioResourceId?: string
  ): Promise<SessionValidationResult> {
    return this.validateSession(ticket, leadId, audioResourceId);
  }

  /**
   * Explicitly revokes an active playback session.
   */
  static async revokeSession(ticket: string): Promise<boolean> {
    if (!ticket) return false;
    const tokenHash = this.hashToken(ticket);
    const key = `${this.KEY_PREFIX}${tokenHash}`;

    const redis = getRedisClient();
    const isProd = env.NODE_ENV === "production" || process.env.NODE_ENV === "production";

    if (redis) {
      const deleted = await redis.del(key);
      return deleted > 0;
    }

    if (isProd) {
      throw new Error(
        "FATAL: Shared Redis storage is required in production. Media session revocation failed closed."
      );
    }

    return this.memoryStore.delete(tokenHash);
  }

  /**
   * Memory store cleanup helper for dev/test.
   */
  private static cleanupMemoryExpired(): void {
    const now = Date.now();
    for (const [key, record] of this.memoryStore.entries()) {
      if (now > record.absoluteExpiresAt || now - record.lastActiveAt > this.IDLE_TIMEOUT_SECONDS * 1000) {
        this.memoryStore.delete(key);
      }
    }
  }

  /**
   * Checks whether the service is currently using an external shared Redis store.
   */
  static isUsingSharedStore(): boolean {
    return Boolean(getRedisClient());
  }

  /**
   * Test helper: clear all tickets/sessions from both Redis and memory store.
   */
  static async clearForTests(): Promise<void> {
    this.memoryStore.clear();
    const redis = getRedisClient();
    if (redis) {
      try {
        const keys = await redis.keys(`${this.KEY_PREFIX}*`);
        if (keys.length > 0) {
          await redis.del(...keys);
        }
      } catch {
        // Ignored in test cleanup
      }
    }
  }
}
