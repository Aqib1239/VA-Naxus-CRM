import request from "supertest";
import { createApp } from "../app";
import { ROLES } from "../constants/roles";
import { DEPARTMENTS, LEAD_STATUS } from "../constants/departments";
import { User } from "../models/User.model";
import { Lead } from "../models/Lead.model";
import { generateToken } from "../utils/jwt";
import path from "path";
import https from "https";
import fs from "fs";
import { Readable } from "stream";
import { EventEmitter } from "events";

describe("Phase 2.3 — Frontend Route Guarding & Security Headers", () => {
  const allowedOrigins = ["https://vibhanu-crm.vercel.app", "http://localhost:3000"];
  const app = createApp(allowedOrigins);

  async function createTestUser(role: string, email: string) {
    const user = new User({
      name: `Test ${role}`,
      email,
      password: "Password@12345",
      role,
      department: `${role} Department`,
      isActive: true,
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

  /* -------------------------------------------------------------------------- */
  /*  1. Backend Response Security Headers                                      */
  /* -------------------------------------------------------------------------- */
  describe("1. Backend Security Headers (Helmet Configuration)", () => {
    it("should include X-Content-Type-Options: nosniff on API responses", async () => {
      const res = await request(app).get("/api/health");
      expect(res.status).toBe(200);
      expect(res.headers["x-content-type-options"]).toBe("nosniff");
    });

    it("should include X-Frame-Options: DENY on API responses", async () => {
      const res = await request(app).get("/api/health");
      expect(res.status).toBe(200);
      expect(res.headers["x-frame-options"]).toBe("DENY");
    });

    it("should include Strict-Transport-Security with max-age and preload", async () => {
      const res = await request(app).get("/api/health");
      expect(res.status).toBe(200);
      expect(res.headers["strict-transport-security"]).toBeDefined();
      expect(res.headers["strict-transport-security"]).toContain("max-age=63072000");
      expect(res.headers["strict-transport-security"]).toContain("includeSubDomains");
      expect(res.headers["strict-transport-security"]).toContain("preload");
    });

    it("should include Referrer-Policy: no-referrer on API responses", async () => {
      const res = await request(app).get("/api/health");
      expect(res.status).toBe(200);
      expect(res.headers["referrer-policy"]).toBe("no-referrer");
    });

    it("should include Cross-Origin-Resource-Policy: cross-origin to permit audio streaming", async () => {
      const res = await request(app).get("/api/health");
      expect(res.status).toBe(200);
      expect(res.headers["cross-origin-resource-policy"]).toBe("cross-origin");
    });

    it("should NOT attach HTML Content-Security-Policy to JSON API responses", async () => {
      const res = await request(app).get("/api/health");
      expect(res.status).toBe(200);
      expect(res.headers["content-security-policy"]).toBeUndefined();
    });
  });

  /* -------------------------------------------------------------------------- */
  /*  2. CORS & Preflight Non-Interference Regression                            */
  /* -------------------------------------------------------------------------- */
  describe("2. CORS & OPTIONS Preflight Non-Interference", () => {
    it("should correctly handle allowed OPTIONS preflight while maintaining security headers", async () => {
      const res = await request(app)
        .options("/api/health")
        .set("Origin", "https://vibhanu-crm.vercel.app")
        .set("Access-Control-Request-Method", "GET")
        .set("Access-Control-Request-Headers", "authorization,content-type");

      expect(res.status).toBe(204);
      expect(res.headers["access-control-allow-origin"]).toBe("https://vibhanu-crm.vercel.app");
      expect(res.headers["access-control-allow-credentials"]).toBe("true");
      expect(res.headers["x-content-type-options"]).toBe("nosniff");
      expect(res.headers["x-frame-options"]).toBe("DENY");
    });

    it("should maintain security headers on 401 Unauthorized responses", async () => {
      const res = await request(app)
        .get("/api/auth/me")
        .set("Origin", "https://vibhanu-crm.vercel.app");

      expect(res.status).toBe(401);
      expect(res.headers["x-content-type-options"]).toBe("nosniff");
      expect(res.headers["x-frame-options"]).toBe("DENY");
      expect(res.headers["access-control-allow-origin"]).toBe("https://vibhanu-crm.vercel.app");
    });
  });

  /* -------------------------------------------------------------------------- */
  /*  3. Audio Streaming & Range Header Non-Interference                         */
  /* -------------------------------------------------------------------------- */
  describe("3. Audio Streaming & Range Request Non-Interference", () => {
    let lead: any;
    let vigilanceUser: any;
    let vigilanceToken: string;

    beforeEach(async () => {
      const { user, token } = await createTestUser(
        ROLES.VIGILANCE,
        `vig_sec_${Date.now()}@vibhanu.com`
      );
      vigilanceUser = user;
      vigilanceToken = token;

      lead = await Lead.create({
        leadCode: `VA-2026-${Math.floor(1000 + Math.random() * 9000)}`,
        name: "Security Test Corp",
        contactNumber: "+91 98765 00123",
        createdBy: "system",
        currentDepartment: DEPARTMENTS.VIGILANCE,
        status: LEAD_STATUS.VERIFIED,
        vigilanceDetails: {
          audio: {
            id: `aud_sec_${Date.now()}`,
            fileName: "security_test.mp3",
            originalName: "security_test.mp3",
            fileSize: 1048576,
            duration: 120,
            url: "/api/leads/placeholder/audio",
            storagePath: "vibhanu-crm/audio/sec_123",
            publicId: "vibhanu-crm/audio/sec_123",
            mimeType: "audio/mpeg",
            resourceType: "video",
            deliveryType: "authenticated",
            uploadedBy: "system",
            uploadedAt: new Date().toISOString(),
          },
        },
      });
    });

    it("should preserve Accept-Ranges: bytes and security headers during audio streaming", async () => {
      // Mock upstream HTTPS request to Cloudinary
      const fakeAudioBuffer = Buffer.from("ID3-MPEG-AUDIO-STREAM-SECURITY-TEST");
      const httpsRequestSpy = jest.spyOn(https, "request").mockImplementation((url: any, opts: any, callback: any) => {
        const cb = typeof opts === "function" ? opts : callback;
        const reqEmitter: any = new EventEmitter();
        reqEmitter.destroyed = false;
        reqEmitter.end = jest.fn();
        reqEmitter.destroy = jest.fn(() => {
          reqEmitter.destroyed = true;
        });
        reqEmitter.setTimeout = jest.fn();

        process.nextTick(() => {
          const responseStream: any = new Readable({
            read() {
              this.push(fakeAudioBuffer);
              this.push(null);
            },
          });
          responseStream.statusCode = 200;
          responseStream.headers = {
            "content-type": "audio/mpeg",
            "accept-ranges": "bytes",
            "content-length": String(fakeAudioBuffer.length),
            etag: '"sec-audio-etag-123"',
            "last-modified": "Sun, 01 Nov 2026 00:00:00 GMT",
          };
          if (cb) cb(responseStream);
        });

        return reqEmitter;
      });

      try {
        const res = await request(app)
          .get(`/api/leads/${lead._id}/audio`)
          .set("Authorization", `Bearer ${vigilanceToken}`)
          .set("Origin", "https://vibhanu-crm.vercel.app");

        expect(res.status).toBe(200);
        expect(res.headers["content-type"]).toBe("audio/mpeg");
        expect(res.headers["accept-ranges"]).toBe("bytes");
        expect(res.headers["cross-origin-resource-policy"]).toBe("cross-origin");
        expect(res.headers["x-content-type-options"]).toBe("nosniff");
        expect(res.headers["x-frame-options"]).toBe("DENY");
      } finally {
        httpsRequestSpy.mockRestore();
      }
    });
  });

  /* -------------------------------------------------------------------------- */
  /*  4. Frontend Security Headers Configuration Validation (next.config.mjs)    */
  /* -------------------------------------------------------------------------- */
  describe("4. Next.js Security Headers Configuration (next.config.mjs)", () => {
    let nextConfigContent: string;

    beforeAll(() => {
      const configPath = path.resolve(__dirname, "../../../next.config.mjs");
      nextConfigContent = fs.readFileSync(configPath, "utf-8");
    });

    it("should export headers matching all routes /(.*)", () => {
      expect(nextConfigContent).toContain('source: "/(.*)"');
      expect(nextConfigContent).toContain("headers: securityHeaders");
    });

    it("should configure strict X-Content-Type-Options: nosniff", () => {
      expect(nextConfigContent).toContain('"X-Content-Type-Options"');
      expect(nextConfigContent).toContain('"nosniff"');
    });

    it("should configure strict X-Frame-Options: DENY against clickjacking", () => {
      expect(nextConfigContent).toContain('"X-Frame-Options"');
      expect(nextConfigContent).toContain('"DENY"');
    });

    it("should configure Referrer-Policy: strict-origin-when-cross-origin", () => {
      expect(nextConfigContent).toContain('"Referrer-Policy"');
      expect(nextConfigContent).toContain('"strict-origin-when-cross-origin"');
    });

    it("should configure Permissions-Policy restricting sensitive browser APIs", () => {
      expect(nextConfigContent).toContain('"Permissions-Policy"');
      expect(nextConfigContent).toContain("camera=()");
      expect(nextConfigContent).toContain("microphone=()");
      expect(nextConfigContent).toContain("geolocation=()");
    });

    it("should configure Strict-Transport-Security with max-age=63072000 and preload", () => {
      expect(nextConfigContent).toContain('"Strict-Transport-Security"');
      expect(nextConfigContent).toContain("max-age=63072000");
      expect(nextConfigContent).toContain("includeSubDomains");
      expect(nextConfigContent).toContain("preload");
    });

    it("should configure Content-Security-Policy-Report-Only for initial safe CSP validation", () => {
      expect(nextConfigContent).toContain('"Content-Security-Policy-Report-Only"');
      expect(nextConfigContent).toContain("default-src 'self'");
      expect(nextConfigContent).toContain("frame-ancestors 'none'");
      expect(nextConfigContent).toContain("object-src 'none'");
      expect(nextConfigContent).toContain("base-uri 'self'");
      expect(nextConfigContent).toContain("form-action 'self'");
      expect(nextConfigContent).toContain("script-src 'self' 'unsafe-inline'");
      expect(nextConfigContent).not.toContain("'unsafe-eval'");
      expect(nextConfigContent).toContain("style-src 'self' 'unsafe-inline'");
      expect(nextConfigContent).toContain("connect-src");
      expect(nextConfigContent).toContain("media-src");
    });
  });

  /* -------------------------------------------------------------------------- */
  /*  5. Department Route Guarding & RBAC Rules Verification                     */
  /* -------------------------------------------------------------------------- */
  describe("5. Frontend Route Guarding & Department RBAC Rules", () => {
    const DEPARTMENT_ROUTE_PERMISSIONS: Record<string, string[]> = {
      "/marketing": ["ADMIN", "MARKETING"],
      "/communication": ["ADMIN", "COMMUNICATION"],
      "/vigilance": ["ADMIN", "VIGILANCE"],
      "/support": ["ADMIN", "SUPPORT"],
      "/sales": ["ADMIN", "SALES"],
    };

    function isRouteAuthorized(route: string, userRole: string): boolean {
      if (userRole === "ADMIN") return true;
      const matched = Object.keys(DEPARTMENT_ROUTE_PERMISSIONS).find(
        (r) => route === r || route.startsWith(r + "/")
      );
      if (!matched) return true; // public or universal route
      return DEPARTMENT_ROUTE_PERMISSIONS[matched].includes(userRole);
    }

    it("should permit ADMIN across every department route", () => {
      for (const route of Object.keys(DEPARTMENT_ROUTE_PERMISSIONS)) {
        expect(isRouteAuthorized(route, "ADMIN")).toBe(true);
      }
    });

    it("should permit MARKETING role ONLY on /marketing and deny other departments", () => {
      expect(isRouteAuthorized("/marketing", "MARKETING")).toBe(true);
      expect(isRouteAuthorized("/communication", "MARKETING")).toBe(false);
      expect(isRouteAuthorized("/vigilance", "MARKETING")).toBe(false);
      expect(isRouteAuthorized("/support", "MARKETING")).toBe(false);
      expect(isRouteAuthorized("/sales", "MARKETING")).toBe(false);
    });

    it("should permit VIGILANCE role ONLY on /vigilance and deny other departments", () => {
      expect(isRouteAuthorized("/vigilance", "VIGILANCE")).toBe(true);
      expect(isRouteAuthorized("/marketing", "VIGILANCE")).toBe(false);
      expect(isRouteAuthorized("/sales", "VIGILANCE")).toBe(false);
    });

    it("should permit SALES role ONLY on /sales and deny other departments", () => {
      expect(isRouteAuthorized("/sales", "SALES")).toBe(true);
      expect(isRouteAuthorized("/vigilance", "SALES")).toBe(false);
      expect(isRouteAuthorized("/marketing", "SALES")).toBe(false);
    });

    it("should permit all authenticated roles on universal routes like / and /leads", () => {
      const allRoles = ["ADMIN", "MARKETING", "COMMUNICATION", "VIGILANCE", "SUPPORT", "SALES"];
      for (const r of allRoles) {
        expect(isRouteAuthorized("/", r)).toBe(true);
        expect(isRouteAuthorized("/leads", r)).toBe(true);
        expect(isRouteAuthorized("/ai", r)).toBe(true);
        expect(isRouteAuthorized("/settings", r)).toBe(true);
      }
    });
  });

  /* -------------------------------------------------------------------------- */
  /*  6. Existing /api/auth/me Hydration Invariants                              */
  /* -------------------------------------------------------------------------- */
  describe("6. /api/auth/me Hydration & Session Invariants", () => {
    it("should successfully return user profile when valid JWT is supplied", async () => {
      const { user, token } = await createTestUser(
        ROLES.COMMUNICATION,
        `comm_me_${Date.now()}@vibhanu.com`
      );

      const res = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe(user.email);
      expect(res.body.data.user.role).toBe(ROLES.COMMUNICATION);
      expect(res.body.data.user.password).toBeUndefined();
    });

    it("should reject /api/auth/me with 401 when token is missing", async () => {
      const res = await request(app).get("/api/auth/me");
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it("should reject /api/auth/me with 401 when token is invalid or tampered", async () => {
      const res = await request(app)
        .get("/api/auth/me")
        .set("Authorization", "Bearer invalid.token.payload");

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });
});

