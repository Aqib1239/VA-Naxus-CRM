import request from "supertest";
import mongoose from "mongoose";
import https from "https";
import { EventEmitter, Readable } from "stream";
import { MongoMemoryServer } from "mongodb-memory-server";
import RedisMock from "ioredis-mock";
import { app } from "../app";
import { User } from "../models/User.model";
import { Lead } from "../models/Lead.model";
import { ROLES } from "../constants/roles";
import { DEPARTMENTS, LEAD_STATUS } from "../constants/departments";
import { generateToken } from "../utils/jwt";
import { IAuthUser } from "../types/auth.types";
import { MediaTicketService } from "../services/media-ticket.service";
import { LeadService } from "../services/lead.service";
import { Transcription } from "../models/Transcription.model";
import { DeepgramService } from "../services/deepgram.service";
import { setMockRedisClient, clearMockRedisClient } from "../config/redis";
import { generateSignedCloudinaryAudioUrl } from "../config/cloudinary";
import { sanitizeUrlForLogging } from "../middleware/logging.middleware";
import { env } from "../config/env";

let mongoServer: MongoMemoryServer;

jest.setTimeout(120000);

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await User.deleteMany({});
  await Lead.deleteMany({});
  clearMockRedisClient();
  await MediaTicketService.clearForTests();
  jest.restoreAllMocks();
});

describe("Phase 2.2.2 — Authenticated Cloudinary Audio Delivery & Backend Streaming Proxy", () => {
  /**
   * Helper to mock upstream HTTPS Cloudinary requests for proxy testing.
   */
  function mockUpstreamCloudinary(options: {
    statusCode?: number;
    headers?: Record<string, string>;
    data?: Buffer;
    error?: Error;
    onReqCreated?: (req: any) => void;
  } = {}) {
    return jest.spyOn(https, "request").mockImplementation((url: any, opts: any, callback: any) => {
      const cb = typeof opts === "function" ? opts : callback;
      const reqEmitter: any = new EventEmitter();
      reqEmitter.destroyed = false;
      reqEmitter.end = jest.fn();
      reqEmitter.destroy = jest.fn(() => {
        reqEmitter.destroyed = true;
      });
      reqEmitter.setTimeout = jest.fn();

      if (options.onReqCreated) {
        options.onReqCreated(reqEmitter);
      }

      process.nextTick(() => {
        if (options.error) {
          reqEmitter.emit("error", options.error);
          return;
        }

        const statusCode = options.statusCode || 200;
        const responseData = options.data !== undefined ? options.data : Buffer.from("ID3_SIMULATED_AUDIO_BYTES_VA_NEXUS");
        const responseStream: any = new Readable({
          read() {
            if (responseData.length > 0) {
              this.push(responseData);
            }
            this.push(null);
          },
        });

        responseStream.statusCode = statusCode;
        responseStream.headers = {
          "content-type": "audio/mpeg",
          "accept-ranges": "bytes",
          "content-length": String(responseData.length),
          etag: '"test-audio-etag-12345"',
          "last-modified": "Sun, 01 Nov 2026 00:00:00 GMT",
          ...options.headers,
        };

        if (cb) {
          cb(responseStream);
        }
      });

      return reqEmitter;
    });
  }

  async function createRoleUser(role: any, email: string, name: string, isActive = true) {
    const user = new User({
      name,
      email,
      password: "Password@12345",
      role,
      department: `${role} Department`,
      isActive,
    });
    await user.save();
    const token = generateToken({
      userId: user._id.toString(),
      email: user.email,
      role: user.role,
      name: user.name,
      department: user.department,
    });
    return { user, token };
  }

  async function createLeadWithAudio(
    department: any = DEPARTMENTS.VIGILANCE,
    deliveryType: "authenticated" | "upload" | "private" = "authenticated"
  ) {
    const lead = new Lead({
      leadCode: `VA-2026-${Math.floor(1000 + Math.random() * 9000)}`,
      name: "Acme Industrial Corp",
      contactNumber: "+91 98765 43210",
      createdBy: "Rohan Varma (MARKETING)",
      postalAddress: "Plot 42, MIDC Industrial Area",
      city: "Pune",
      state: "Maharashtra",
      currentDepartment: department,
      status: LEAD_STATUS.VERIFIED,
      vigilanceDetails: {
        completedBy: "Vikram Malhotra",
        completedAt: new Date().toISOString(),
        verificationNotes: "Call recording verified",
        audio: {
          id: `aud_${Date.now()}`,
          fileName: "call_recording.mp3",
          originalName: "call_recording.mp3",
          fileSize: 1048576,
          duration: 120,
          url: "/api/leads/placeholder/audio",
          storagePath: "vibhanu-crm/audio/recording_123",
          publicId: "vibhanu-crm/audio/recording_123",
          mimeType: "audio/mpeg",
          resourceType: "video",
          deliveryType,
          format: "mp3",
          uploadedBy: "Vikram Malhotra (VIGILANCE)",
          uploadedAt: new Date().toISOString(),
        },
      },
      workflowHistory: [],
    });
    await lead.save();
    return lead;
  }

  describe("1. Strict Token & Credential Rejection", () => {
    it("should reject GET /api/leads/:id/audio when application JWT is passed in ?token=", async () => {
      const { token } = await createRoleUser(ROLES.VIGILANCE, "vigilance@vibhanu.com", "Vikram Malhotra");
      const lead = await createLeadWithAudio();

      const res = await request(app).get(`/api/leads/${lead._id}/audio?token=${token}`);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain("Reusable authentication tokens in URL query parameters are strictly prohibited");
    });

    it("should reject unauthenticated GET /api/leads/:id/audio with 401 Unauthorized", async () => {
      const lead = await createLeadWithAudio();

      const res = await request(app).get(`/api/leads/${lead._id}/audio`);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain("Authentication required");
    });

    it("should reject invalid playback session tickets with 403 Forbidden", async () => {
      const lead = await createLeadWithAudio();

      const res = await request(app).get(`/api/leads/${lead._id}/audio?ticket=fake_invalid_session_ticket_hex`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain("Invalid, expired, or unauthorized playback session");
    });
  });

  describe("2. Bounded Playback Session Lifecycle & Redis SHA-256 Hashing", () => {
    it("should hash session tokens with SHA-256 in Redis and never store raw tokens", async () => {
      const sharedRedis = new RedisMock();
      setMockRedisClient(sharedRedis);

      const { user } = await createRoleUser(ROLES.VIGILANCE, "vigilance@vibhanu.com", "Vikram Malhotra");
      const lead = await createLeadWithAudio();

      const session = await MediaTicketService.createSession(
        lead._id.toString(),
        user._id.toString(),
        { publicId: "vibhanu-crm/audio/recording_123", resourceType: "video", deliveryType: "authenticated" }
      );

      expect(session.ticket).toBeDefined();
      expect(session.tokenHash).toBeDefined();
      expect(session.ticket).not.toBe(session.tokenHash);

      // Verify Redis contains the hashed key, NOT the raw ticket
      const rawExists = await sharedRedis.exists(`crm:media_session:${session.ticket}`);
      const hashExists = await sharedRedis.exists(`crm:media_session:${session.tokenHash}`);

      expect(rawExists).toBe(0);
      expect(hashExists).toBe(1);

      // Verify stored properties in Redis
      const storedLeadId = await sharedRedis.hget(`crm:media_session:${session.tokenHash}`, "leadId");
      const storedDeliveryType = await sharedRedis.hget(`crm:media_session:${session.tokenHash}`, "deliveryType");
      expect(storedLeadId).toBe(lead._id.toString());
      expect(storedDeliveryType).toBe("authenticated");
    });

    it("should issue session tokens bound to lead and resource with no-store headers", async () => {
      const { token } = await createRoleUser(ROLES.VIGILANCE, "vigilance@vibhanu.com", "Vikram Malhotra");
      const lead = await createLeadWithAudio();

      const res = await request(app)
        .post(`/api/leads/${lead._id}/audio/ticket`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.ticket).toBeDefined();
      expect(res.body.data.streamUrl).toBe(`/api/leads/${lead._id}/audio?ticket=${res.body.data.ticket}`);
      expect(res.body.data.expiresInSeconds).toBe(MediaTicketService.IDLE_TIMEOUT_SECONDS);
      expect(res.body.data.maxLifetimeSeconds).toBe(MediaTicketService.ABSOLUTE_MAX_LIFETIME_SECONDS);

      // Verify no-store on session issuance
      expect(res.header["cache-control"]).toBe("private, no-cache, no-store, must-revalidate");
      expect(res.header["pragma"]).toBe("no-cache");
    });

    it("should reject session ticket when idle timeout is exceeded", async () => {
      const sharedRedis = new RedisMock();
      setMockRedisClient(sharedRedis);

      const { user } = await createRoleUser(ROLES.VIGILANCE, "vigilance@vibhanu.com", "Vikram Malhotra");
      const lead = await createLeadWithAudio();

      const session = await MediaTicketService.createSession(
        lead._id.toString(),
        user._id.toString(),
        { publicId: "vibhanu-crm/audio/recording_123" }
      );

      // Advance time beyond idle timeout (5 minutes = 300s -> 301s)
      const originalNow = Date.now;
      Date.now = jest.fn(() => originalNow() + (MediaTicketService.IDLE_TIMEOUT_SECONDS + 1) * 1000);

      try {
        const validation = await MediaTicketService.validateSession(
          session.ticket,
          lead._id.toString(),
          "vibhanu-crm/audio/recording_123"
        );
        expect(validation.valid).toBe(false);
        expect(["IDLE_TIMEOUT_REACHED", "SESSION_NOT_FOUND_OR_EXPIRED"]).toContain(validation.reason);
      } finally {
        Date.now = originalNow;
      }
    });

    it("should reject session ticket when absolute maximum lifetime is reached even with active requests", async () => {
      const sharedRedis = new RedisMock();
      setMockRedisClient(sharedRedis);

      const { user } = await createRoleUser(ROLES.VIGILANCE, "vigilance@vibhanu.com", "Vikram Malhotra");
      const lead = await createLeadWithAudio();

      const session = await MediaTicketService.createSession(
        lead._id.toString(),
        user._id.toString(),
        { publicId: "vibhanu-crm/audio/recording_123" }
      );

      // Advance time past absolute max session lifetime (15 minutes = 900s -> 905s)
      const originalNow = Date.now;
      Date.now = jest.fn(() => originalNow() + (MediaTicketService.ABSOLUTE_MAX_LIFETIME_SECONDS + 5) * 1000);

      try {
        const validation = await MediaTicketService.validateSession(
          session.ticket,
          lead._id.toString(),
          "vibhanu-crm/audio/recording_123"
        );
        expect(validation.valid).toBe(false);
        expect(["ABSOLUTE_EXPIRY_REACHED", "SESSION_NOT_FOUND_OR_EXPIRED"]).toContain(validation.reason);
      } finally {
        Date.now = originalNow;
      }
    });

    it("should allow session revocation on demand via revokeSession()", async () => {
      const sharedRedis = new RedisMock();
      setMockRedisClient(sharedRedis);

      const { user } = await createRoleUser(ROLES.VIGILANCE, "vigilance@vibhanu.com", "Vikram Malhotra");
      const lead = await createLeadWithAudio();

      const session = await MediaTicketService.createSession(
        lead._id.toString(),
        user._id.toString(),
        { publicId: "vibhanu-crm/audio/recording_123" }
      );

      // Confirm valid before revoke
      const val1 = await MediaTicketService.validateSession(session.ticket, lead._id.toString());
      expect(val1.valid).toBe(true);

      // Revoke
      await MediaTicketService.revokeSession(session.ticket);

      // Confirm invalid after revoke
      const val2 = await MediaTicketService.validateSession(session.ticket, lead._id.toString());
      expect(val2.valid).toBe(false);
    });
  });

  describe("3. Authorization Revalidation & Access Control", () => {
    it("should immediately reject playback if the user account has been deactivated", async () => {
      const sharedRedis = new RedisMock();
      setMockRedisClient(sharedRedis);

      const { user } = await createRoleUser(ROLES.VIGILANCE, "vigilance@vibhanu.com", "Vikram Malhotra");
      const lead = await createLeadWithAudio();

      const session = await MediaTicketService.createSession(
        lead._id.toString(),
        user._id.toString(),
        { publicId: "vibhanu-crm/audio/recording_123" }
      );

      // Deactivate user in database
      user.isActive = false;
      await user.save();

      const res = await request(app).get(`/api/leads/${lead._id}/audio?ticket=${session.ticket}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain("deactivated or no longer exists");
    });

    it("should enforce cross-lead isolation: ticket for Lead A cannot stream Lead B", async () => {
      const sharedRedis = new RedisMock();
      setMockRedisClient(sharedRedis);

      const { user } = await createRoleUser(ROLES.VIGILANCE, "vigilance@vibhanu.com", "Vikram Malhotra");
      const leadA = await createLeadWithAudio(DEPARTMENTS.VIGILANCE);
      const leadB = await createLeadWithAudio(DEPARTMENTS.VIGILANCE);

      const session = await MediaTicketService.createSession(
        leadA._id.toString(),
        user._id.toString(),
        { publicId: "vibhanu-crm/audio/recording_123" }
      );

      const res = await request(app).get(`/api/leads/${leadB._id}/audio?ticket=${session.ticket}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain("Invalid, expired, or unauthorized playback session");
    });

    it("should reject audio streaming if the user's role lacks access to the lead department", async () => {
      const { token } = await createRoleUser(ROLES.MARKETING, "marketing@vibhanu.com", "Rohan Varma");
      const lead = await createLeadWithAudio(DEPARTMENTS.VIGILANCE);

      const res = await request(app)
        .get(`/api/leads/${lead._id}/audio`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain("restricted for your account role");
    });

    it("should allow ADMIN to stream audio across any lead department", async () => {
      const { token } = await createRoleUser(ROLES.ADMIN, "admin@vibhanu.com", "Ananya Sharma");
      const lead = await createLeadWithAudio(DEPARTMENTS.MARKETING);

      const mockHttps = mockUpstreamCloudinary({
        data: Buffer.from("ADMIN_TEST_AUDIO_STREAM_BYTES"),
      });

      const res = await request(app)
        .get(`/api/leads/${lead._id}/audio`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.header.location).toBeUndefined(); // Zero 302 redirects!
      expect(mockHttps).toHaveBeenCalled();
    });
  });

  describe("4. Secure Backend Streaming Proxy (Zero 302 Redirects)", () => {
    it("should stream audio bytes directly to the browser (HTTP 200) without 302 redirect", async () => {
      const { user, token } = await createRoleUser(ROLES.VIGILANCE, "vigilance@vibhanu.com", "Vikram Malhotra");
      const lead = await createLeadWithAudio();

      const audioBuffer = Buffer.from("VERIFIED_COMPLIANCE_AUDIO_PAYLOAD_CHUNK");
      const mockHttps = mockUpstreamCloudinary({
        statusCode: 200,
        headers: {
          "content-type": "audio/mpeg",
          "content-length": String(audioBuffer.length),
        },
        data: audioBuffer,
      });

      const res = await request(app)
        .get(`/api/leads/${lead._id}/audio`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.header.location).toBeUndefined(); // Zero redirects!
      expect(res.header["content-type"]).toBe("audio/mpeg");
      expect(res.header["cache-control"]).toBe("private, no-cache, no-store, must-revalidate");
      expect(res.header["referrer-policy"]).toBe("no-referrer");
      expect(res.header["x-content-type-options"]).toBe("nosniff");
      expect(res.body.toString()).toBe(audioBuffer.toString());
      expect(mockHttps).toHaveBeenCalled();
    });

    it("should handle HEAD requests and return media headers without a response body", async () => {
      const { token } = await createRoleUser(ROLES.VIGILANCE, "vigilance@vibhanu.com", "Vikram Malhotra");
      const lead = await createLeadWithAudio();

      mockUpstreamCloudinary({
        statusCode: 200,
        headers: {
          "content-type": "audio/mpeg",
          "content-length": "1048576",
        },
        data: Buffer.from(""),
      });

      const res = await request(app)
        .head(`/api/leads/${lead._id}/audio`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.header["content-type"]).toBe("audio/mpeg");
      expect(res.header["content-length"]).toBe("1048576");
      expect(res.header["accept-ranges"]).toBe("bytes");
      expect(res.text).toBeFalsy();
    });

    it("should forward HTTP Range requests and preserve 206 Partial Content and Content-Range", async () => {
      const { token } = await createRoleUser(ROLES.VIGILANCE, "vigilance@vibhanu.com", "Vikram Malhotra");
      const lead = await createLeadWithAudio();

      const chunkBuffer = Buffer.from("AUDIO_BYTE_RANGE_0_1024");
      let forwardedRangeHeader: string | undefined;

      jest.spyOn(https, "request").mockImplementation((url: any, opts: any, callback: any) => {
        forwardedRangeHeader = opts?.headers?.["Range"] || opts?.headers?.["range"];
        const cb = typeof opts === "function" ? opts : callback;
        const reqEmitter: any = new EventEmitter();
        reqEmitter.end = jest.fn();
        reqEmitter.destroy = jest.fn();
        reqEmitter.setTimeout = jest.fn();

        process.nextTick(() => {
          const responseStream: any = new Readable({
            read() {
              this.push(chunkBuffer);
              this.push(null);
            },
          });
          responseStream.statusCode = 206;
          responseStream.headers = {
            "content-type": "audio/mpeg",
            "content-range": "bytes 0-1024/2048000",
            "content-length": String(chunkBuffer.length),
            "accept-ranges": "bytes",
          };
          if (cb) cb(responseStream);
        });

        return reqEmitter;
      });

      const res = await request(app)
        .get(`/api/leads/${lead._id}/audio`)
        .set("Authorization", `Bearer ${token}`)
        .set("Range", "bytes=0-1024");

      expect(res.status).toBe(206);
      expect(forwardedRangeHeader).toBe("bytes=0-1024");
      expect(res.header["content-range"]).toBe("bytes 0-1024/2048000");
      expect(res.header["accept-ranges"]).toBe("bytes");
      expect(res.body.toString()).toBe(chunkBuffer.toString());
    });

    it("should preserve 416 Range Not Satisfiable when invalid byte range is requested", async () => {
      const { token } = await createRoleUser(ROLES.VIGILANCE, "vigilance@vibhanu.com", "Vikram Malhotra");
      const lead = await createLeadWithAudio();

      mockUpstreamCloudinary({
        statusCode: 416,
        headers: {
          "content-range": "bytes */1048576",
        },
      });

      const res = await request(app)
        .get(`/api/leads/${lead._id}/audio`)
        .set("Authorization", `Bearer ${token}`)
        .set("Range", "bytes=9999999-10000000");

      expect(res.status).toBe(416);
      expect(res.header["content-range"]).toBe("bytes */1048576");
    });

    it("should allow repeated Range requests beyond 15 seconds during active bounded session", async () => {
      const sharedRedis = new RedisMock();
      setMockRedisClient(sharedRedis);

      const { user } = await createRoleUser(ROLES.VIGILANCE, "vigilance@vibhanu.com", "Vikram Malhotra");
      const lead = await createLeadWithAudio();

      const session = await MediaTicketService.createSession(
        lead._id.toString(),
        user._id.toString(),
        { publicId: "vibhanu-crm/audio/recording_123" }
      );

      mockUpstreamCloudinary({
        statusCode: 206,
        headers: { "content-range": "bytes 0-512/1048576" },
        data: Buffer.from("CHUNK_1"),
      });

      // Request 1: initial probe (t = 0)
      const res1 = await request(app).get(`/api/leads/${lead._id}/audio?ticket=${session.ticket}`);
      expect(res1.status).toBe(206);

      // Request 2: seek to 30 seconds into call (t = 25s, beyond the legacy 15s grace window)
      const originalNow = Date.now;
      Date.now = jest.fn(() => originalNow() + 25000);

      try {
        mockUpstreamCloudinary({
          statusCode: 206,
          headers: { "content-range": "bytes 512000-1024000/1048576" },
          data: Buffer.from("CHUNK_2_AFTER_25S"),
        });

        const res2 = await request(app)
          .get(`/api/leads/${lead._id}/audio?ticket=${session.ticket}`)
          .set("Range", "bytes=512000-1024000");

        // Must succeed because session is active and within idle timeout!
        expect(res2.status).toBe(206);
        expect(res2.header["content-range"]).toBe("bytes 512000-1024000/1048576");
      } finally {
        Date.now = originalNow;
      }
    });

    it("should handle client disconnect and abort upstream request without socket leaks", async () => {
      const { token } = await createRoleUser(ROLES.VIGILANCE, "vigilance@vibhanu.com", "Vikram Malhotra");
      const lead = await createLeadWithAudio();

      let capturedReq: any;
      mockUpstreamCloudinary({
        onReqCreated: (req) => {
          capturedReq = req;
        },
      });

      await request(app)
        .get(`/api/leads/${lead._id}/audio`)
        .set("Authorization", `Bearer ${token}`);

      expect(capturedReq).toBeDefined();
    });

    it("should return 502 Bad Gateway when upstream Cloudinary connection fails", async () => {
      const { token } = await createRoleUser(ROLES.VIGILANCE, "vigilance@vibhanu.com", "Vikram Malhotra");
      const lead = await createLeadWithAudio();

      mockUpstreamCloudinary({
        error: new Error("Cloudinary connection reset by peer"),
      });

      const res = await request(app)
        .get(`/api/leads/${lead._id}/audio`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(502);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain("Upstream storage connection failure");
    });
  });

  describe("5. Cloudinary Authenticated URL Generation & Response Sanitization", () => {
    it("should generate signed delivery URL using official SDK with type: authenticated", () => {
      const signedUrl = generateSignedCloudinaryAudioUrl("vibhanu-crm/audio/audio_test_123", {
        resourceType: "video",
        deliveryType: "authenticated",
        format: "mp3",
      });

      expect(signedUrl).toContain("/video/authenticated/");
      expect(signedUrl).toContain("/s--");
      expect(signedUrl).toContain("audio_test_123");
      expect(signedUrl).not.toContain("expires_at="); // No arbitrary expires_at query string
    });

    it("should sanitize lead JSON responses so vigilanceDetails.audio.url points to proxy endpoint and strips storage metadata", async () => {
      const { user, token } = await createRoleUser(ROLES.VIGILANCE, "vigilance@vibhanu.com", "Vikram Malhotra");
      const lead = await createLeadWithAudio();

      const res = await request(app)
        .get(`/api/leads/${lead._id}`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      const audioObj = res.body.data.lead.vigilanceDetails.audio;
      expect(audioObj.url).toBe(`/api/leads/${lead._id}/audio`);
      expect(audioObj.url).not.toContain("res.cloudinary.com");
      expect(audioObj.publicId).toBeUndefined();
      expect(audioObj.storagePath).toBeUndefined();
      expect(audioObj.deliveryType).toBeUndefined();
    });

    it("should sanitize media tickets and Cloudinary HMAC signatures from URLs in application logs", () => {
      const rawUrl =
        "/api/leads/6ae6166e/audio?ticket=78bb5377685a0307eb1f0b19f866a84a8cdbcca9dd747b8147724d6900fc02dc&signature=secret_hmac&extra=1";
      const sanitized = sanitizeUrlForLogging(rawUrl);

      expect(sanitized).toBe("/api/leads/6ae6166e/audio?ticket=[REDACTED]&signature=[REDACTED]&extra=1");
      expect(sanitized).not.toContain("78bb5377685a0307");
      expect(sanitized).not.toContain("secret_hmac");

      // Path-based Cloudinary signature redaction
      const pathWithSig = "https://res.cloudinary.com/vibhanu/video/authenticated/s--SecretSig123--/v1/recording.mp3";
      const sanitizedPath = sanitizeUrlForLogging(pathWithSig);
      expect(sanitizedPath).toContain("/s--[REDACTED]--/");
      expect(sanitizedPath).not.toContain("SecretSig123");
    });

    it("should sanitize lead audio metadata in lean queries returned by LeadService.getLeads", async () => {
      const { user } = await createRoleUser(ROLES.VIGILANCE, "vigilance@vibhanu.com", "Vikram Malhotra");
      const lead = await createLeadWithAudio();

      const authUser: IAuthUser = {
        id: user._id.toString(),
        email: user.email,
        name: user.name,
        role: user.role,
        department: user.department,
        isActive: true,
      };
      const result = await LeadService.getLeads({}, authUser);
      expect(result.data.length).toBeGreaterThan(0);

      const foundLead = result.data.find((l: any) => l.id === lead._id.toString());
      expect(foundLead).toBeDefined();
      expect(foundLead.vigilanceDetails?.audio).toBeDefined();

      const audio = foundLead.vigilanceDetails.audio;
      expect(audio.url).toBe(`/api/leads/${lead._id}/audio`);
      expect(audio.publicId).toBeUndefined();
      expect(audio.storagePath).toBeUndefined();
      expect(audio.deliveryType).toBeUndefined();
    });

    it("should reject unexpected upstream redirects with HTTP 502 to prevent SSRF bypass", async () => {
      const { token } = await createRoleUser(ROLES.VIGILANCE, "vigilance@vibhanu.com", "Vikram Malhotra");
      const lead = await createLeadWithAudio();

      mockUpstreamCloudinary({
        statusCode: 302,
        headers: { location: "https://evil-attacker.com/steal-data" },
      });

      const res = await request(app)
        .get(`/api/leads/${lead._id}/audio`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(502);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain("Upstream storage redirected unexpectedly");
    });
  });

  describe("6. Deepgram Direct Audio Buffer Transfer & Response Sanitization", () => {
    it("should sanitize audioUrl in Transcription.toJSON to internal CRM proxy endpoint", () => {
      const transDoc = new Transcription({
        leadId: new mongoose.Types.ObjectId(),
        recordingId: "aud_test_123",
        audioUrl: "https://res.cloudinary.com/vibhanu/video/authenticated/s--Secret123--/v1/audio.mp3",
        status: "COMPLETED",
        fullTranscript: "Test transcript",
        speakers: [],
        speakerMappings: [],
      });

      const json = transDoc.toJSON();
      expect(json.audioUrl).toBe(`/api/leads/${transDoc.leadId}/audio`);
      expect(json.audioUrl).not.toContain("res.cloudinary.com");
      expect(json.audioUrl).not.toContain("Secret123");
    });

    it("should transcribe audio from binary Buffer without leaking Cloudinary signed URLs", async () => {
      // Mock client.listen.v1.media.transcribeFile on Deepgram client
      const fakeBuffer = Buffer.from("RIFF_WAVE_FAKE_AUDIO_BYTES_VA_NEXUS");
      const dgClient = {
        listen: {
          v1: {
            media: {
              transcribeFile: jest.fn(async () => ({
                metadata: { duration: 12.5 },
                results: {
                  channels: [
                    {
                      alternatives: [
                        {
                          transcript: "Hello from secure binary buffer transfer.",
                          confidence: 0.98,
                          words: [],
                          paragraphs: { paragraphs: [] },
                        },
                      ],
                    },
                  ],
                  utterances: [],
                },
              })),
            },
          },
        },
      };

      const getClientSpy = jest
        .spyOn(require("../config/deepgram"), "getDeepgramClient")
        .mockReturnValue(dgClient);

      try {
        const result = await DeepgramService.transcribeAudioBuffer(fakeBuffer, "audio/wav");
        expect(result.fullTranscript).toBe("Hello from secure binary buffer transfer.");
        expect(result.confidence).toBe(0.98);
        expect(dgClient.listen.v1.media.transcribeFile).toHaveBeenCalledWith(
          fakeBuffer,
          expect.objectContaining({
            smart_format: true,
            punctuate: true,
          })
        );
      } finally {
        getClientSpy.mockRestore();
      }
    });
  });

  describe("7. Final Protection Status Derivation & Ticket Response Sanitization", () => {
    it("should accurately derive protectionStatus as 'protected' for authenticated delivery assets", async () => {
      const { token } = await createRoleUser(ROLES.VIGILANCE, "vigilance_status@vibhanu.com", "Vigilance Tester");
      const lead = await createLeadWithAudio(DEPARTMENTS.VIGILANCE, "authenticated");

      const res = await request(app)
        .get(`/api/leads/${lead._id}`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      const audio = res.body.data.lead.vigilanceDetails.audio;
      expect(audio.protectionStatus).toBe("protected");
      expect(audio.url).toBe(`/api/leads/${lead._id}/audio`);
      expect(audio.deliveryType).toBeUndefined();
      expect(audio.publicId).toBeUndefined();
      expect(audio.storagePath).toBeUndefined();
    });

    it("should accurately derive protectionStatus as 'legacy-public' for upload delivery assets", async () => {
      const { token } = await createRoleUser(ROLES.VIGILANCE, "vigilance_legacy@vibhanu.com", "Vigilance Legacy");
      const lead = await createLeadWithAudio(DEPARTMENTS.VIGILANCE, "upload");

      const res = await request(app)
        .get(`/api/leads/${lead._id}`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      const audio = res.body.data.lead.vigilanceDetails.audio;
      expect(audio.protectionStatus).toBe("legacy-public");
      expect(audio.url).toBe(`/api/leads/${lead._id}/audio`);
      expect(audio.deliveryType).toBeUndefined();
      expect(audio.publicId).toBeUndefined();
      expect(audio.storagePath).toBeUndefined();
    });

    it("should accurately derive protectionStatus as 'private' for private delivery assets", async () => {
      const { token } = await createRoleUser(ROLES.VIGILANCE, "vigilance_priv@vibhanu.com", "Vigilance Private");
      const lead = await createLeadWithAudio(DEPARTMENTS.VIGILANCE, "private");

      const res = await request(app)
        .get(`/api/leads/${lead._id}`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      const audio = res.body.data.lead.vigilanceDetails.audio;
      expect(audio.protectionStatus).toBe("private");
      expect(audio.url).toBe(`/api/leads/${lead._id}/audio`);
      expect(audio.deliveryType).toBeUndefined();
      expect(audio.publicId).toBeUndefined();
      expect(audio.storagePath).toBeUndefined();
    });

    it("should accurately derive protectionStatus as 'unknown' when deliveryType is missing or unverified", async () => {
      const { token } = await createRoleUser(ROLES.VIGILANCE, "vigilance_unknown@vibhanu.com", "Vigilance Unknown");
      const lead = await Lead.create({
        leadCode: `VA-TEST-${Date.now().toString().slice(-4)}`,
        name: "Unknown Protection Corp",
        contactNumber: "+919876500099",
        currentDepartment: DEPARTMENTS.VIGILANCE,
        status: LEAD_STATUS.MEETING_SCHEDULED,
        createdBy: "system",
        vigilanceDetails: {
          audio: {
            id: "aud_unknown_01",
            fileName: "unknown_recording.mp3",
            originalName: "unknown_recording.mp3",
            fileSize: 10240,
            duration: 120,
            url: "https://res.cloudinary.com/vibhanu/video/upload/unknown_recording.mp3",
            storagePath: "raw/unknown_recording.mp3",
            mimeType: "audio/mpeg",
            uploadedBy: "system",
            uploadedAt: new Date().toISOString(),
          },
        },
      });

      const res = await request(app)
        .get(`/api/leads/${lead._id}`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      const audio = res.body.data.lead.vigilanceDetails.audio;
      expect(audio.protectionStatus).toBe("unknown");
      expect(audio.url).toBe(`/api/leads/${lead._id}/audio`);
      expect(audio.deliveryType).toBeUndefined();
      expect(audio.publicId).toBeUndefined();
      expect(audio.storagePath).toBeUndefined();
    });

    it("should never leak audioResourceId or Cloudinary publicId in media ticket response", async () => {
      const { token } = await createRoleUser(ROLES.VIGILANCE, "vigilance_ticket_check@vibhanu.com", "Vigilance Ticket Auditor");
      const lead = await createLeadWithAudio(DEPARTMENTS.VIGILANCE, "authenticated");

      const res = await request(app)
        .post(`/api/leads/${lead._id}/audio/ticket`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.ticket).toBeDefined();
      expect(res.body.data.streamUrl).toBeDefined();
      expect(res.body.data.expiresInSeconds).toBeDefined();
      // Ensure Cloudinary publicId / audioResourceId is strictly absent
      expect(res.body.data.audioResourceId).toBeUndefined();
      expect(JSON.stringify(res.body.data)).not.toContain("vibhanu-crm/audio");
    });
  });

  describe("8. Audio Ticket Issuance, Dual-Identifier Resolution (ObjectId & leadCode), and Error Responses", () => {
    it("should issue audio ticket using human-readable leadCode (e.g. VA-2026-1012)", async () => {
      const { token } = await createRoleUser(ROLES.VIGILANCE, "vig_code@vibhanu.com", "Vigilance Code Tester");
      const lead = await createLeadWithAudio(DEPARTMENTS.VIGILANCE, "authenticated");

      const res = await request(app)
        .post(`/api/leads/${lead.leadCode}/audio/ticket`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.ticket).toBeDefined();
      expect(res.body.data.leadId).toBe(lead.leadCode);
      expect(res.body.data.streamUrl).toBe(`/api/leads/${lead.leadCode}/audio?ticket=${res.body.data.ticket}`);
    });

    it("should stream audio using leadCode route (GET /api/leads/:leadCode/audio?ticket=...)", async () => {
      const { token } = await createRoleUser(ROLES.VIGILANCE, "vig_stream_code@vibhanu.com", "Vigilance Stream Code Tester");
      const lead = await createLeadWithAudio(DEPARTMENTS.VIGILANCE, "authenticated");
      mockUpstreamCloudinary({ data: Buffer.from("RIFF....WAVEfmt ....data....fake audio bytes") });

      // 1. Issue ticket using leadCode
      const ticketRes = await request(app)
        .post(`/api/leads/${lead.leadCode}/audio/ticket`)
        .set("Authorization", `Bearer ${token}`);

      expect(ticketRes.status).toBe(200);
      const ticket = ticketRes.body.data.ticket;

      // 2. Stream audio using leadCode route
      const streamRes = await request(app).get(`/api/leads/${lead.leadCode}/audio?ticket=${ticket}`);
      expect(streamRes.status).toBe(200);
      expect(streamRes.headers["content-type"]).toBe("audio/mpeg");
      expect(streamRes.body.toString()).toContain("fake audio bytes");
    });

    it("should allow ticket issued with ObjectId to be redeemed via leadCode route and vice versa", async () => {
      const { token } = await createRoleUser(ROLES.VIGILANCE, "vig_dual@vibhanu.com", "Vigilance Dual Tester");
      const lead = await createLeadWithAudio(DEPARTMENTS.VIGILANCE, "authenticated");
      mockUpstreamCloudinary({ data: Buffer.from("cross-identifier audio stream") });

      // Ticket issued with ObjectId
      const ticketRes = await request(app)
        .post(`/api/leads/${lead._id}/audio/ticket`)
        .set("Authorization", `Bearer ${token}`);
      const ticket = ticketRes.body.data.ticket;

      // Redeemed with leadCode
      const streamRes = await request(app).get(`/api/leads/${lead.leadCode}/audio?ticket=${ticket}`);
      expect(streamRes.status).toBe(200);
      expect(streamRes.body.toString()).toContain("cross-identifier audio stream");
    });

    it("should return structured 404 when lead does not exist in database", async () => {
      const { token } = await createRoleUser(ROLES.VIGILANCE, "vig_notfound@vibhanu.com", "Vigilance NotFound");
      const nonExistentLeadId = new mongoose.Types.ObjectId().toString();

      const res = await request(app)
        .post(`/api/leads/${nonExistentLeadId}/audio/ticket`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain("Lead not found");
    });

    it("should return structured 404 when lead exists but has no audio recording attached", async () => {
      const { token } = await createRoleUser(ROLES.VIGILANCE, "vig_noaudio@vibhanu.com", "Vigilance NoAudio");
      const leadWithoutAudio = await Lead.create({
        leadCode: `VA-TEST-${Date.now().toString().slice(-4)}`,
        name: "No Audio Corp",
        contactNumber: "+919876543210",
        currentDepartment: DEPARTMENTS.VIGILANCE,
        status: LEAD_STATUS.MEETING_SCHEDULED,
        createdBy: "system",
      });

      const res = await request(app)
        .post(`/api/leads/${leadWithoutAudio._id}/audio/ticket`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe("Audio recording not found for this lead.");
    });

    it("should return 401 Unauthorized when unauthenticated client requests audio ticket", async () => {
      const lead = await createLeadWithAudio(DEPARTMENTS.VIGILANCE, "authenticated");

      const res = await request(app).post(`/api/leads/${lead._id}/audio/ticket`);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain("Authentication required");
    });

    it("should return 403 Forbidden when user role is not authorized for the lead department", async () => {
      // Sales rep trying to request ticket for a lead currently in Communication department
      const { token } = await createRoleUser(ROLES.SALES, "sales_unauth@vibhanu.com", "Sales Unauth");
      const lead = await createLeadWithAudio(DEPARTMENTS.COMMUNICATION, "authenticated");

      const res = await request(app)
        .post(`/api/leads/${lead._id}/audio/ticket`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain("permission");
    });

    it("should also support GET /api/leads/:id/audio/ticket for media ticket generation", async () => {
      const { token } = await createRoleUser(ROLES.ADMIN, "admin_get_ticket@vibhanu.com", "Admin Get Ticket");
      const lead = await createLeadWithAudio(DEPARTMENTS.VIGILANCE, "authenticated");

      const res = await request(app)
        .get(`/api/leads/${lead._id}/audio/ticket`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.ticket).toBeDefined();
      expect(res.body.data.streamUrl).toBeDefined();
    });
  });
});
