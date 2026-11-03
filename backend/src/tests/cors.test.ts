import request from "supertest";
import { createApp } from "../app";
import {
  parseAndValidateCorsOrigins,
  validateOriginFormat,
  DEFAULT_DEVELOPMENT_ORIGINS,
} from "../config/cors";

describe("Phase 2.1 — Strict CORS Origin Allowlist & Remediation", () => {
  const PRODUCTION_ORIGIN = "https://va-nexus-crm.vercel.app";
  const TEST_ALLOWED_ORIGINS = [PRODUCTION_ORIGIN, "http://localhost:3000", "http://127.0.0.1:3000"];

  let app: any;

  beforeAll(() => {
    // Instantiate test Express app with explicit trusted origins
    app = createApp(TEST_ALLOWED_ORIGINS);
  });

  describe("Origin Format & Startup Allowlist Validation", () => {
    it("should accept valid http and https origins with exact scheme and port", () => {
      expect(validateOriginFormat("https://va-nexus-crm.vercel.app")).toBe("https://va-nexus-crm.vercel.app");
      expect(validateOriginFormat("http://localhost:3000")).toBe("http://localhost:3000");
      expect(validateOriginFormat("http://127.0.0.1:3000")).toBe("http://127.0.0.1:3000");
      expect(validateOriginFormat("https://crm.company.org:8443")).toBe("https://crm.company.org:8443");
    });

    it("should reject wildcard origin configuration (* or *.domain)", () => {
      expect(() => validateOriginFormat("*")).toThrow(
        /Wildcard origin '\*' is strictly prohibited/
      );
      expect(() => validateOriginFormat("*.vercel.app")).toThrow(
        /Wildcard origin '\*\.vercel\.app' is strictly prohibited/
      );
      expect(() => validateOriginFormat("https://*")).toThrow(
        /Wildcard origin/
      );
    });

    it("should reject origin 'null' in allowlist configuration", () => {
      expect(() => validateOriginFormat("null")).toThrow(
        /Origin 'null' is strictly prohibited/
      );
    });

    it("should reject malformed URLs or invalid protocols", () => {
      expect(() => validateOriginFormat("not-a-valid-url")).toThrow(
        /Malformed CORS origin/
      );
      expect(() => validateOriginFormat("ftp://va-nexus-crm.vercel.app")).toThrow(
        /Only 'http:' and 'https:' are permitted/
      );
      expect(() => validateOriginFormat("javascript:alert(1)")).toThrow(
        /Only 'http:' and 'https:' are permitted/
      );
    });

    it("should reject origins with path components, trailing slashes, queries, or hashes", () => {
      expect(() => validateOriginFormat("https://va-nexus-crm.vercel.app/")).toThrow(
        /must not end with a trailing slash/
      );
      expect(() => validateOriginFormat("https://va-nexus-crm.vercel.app/api")).toThrow(
        /must not contain a path component/
      );
      expect(() => validateOriginFormat("https://va-nexus-crm.vercel.app?key=val")).toThrow(
        /must not contain query parameters/
      );
      expect(() => validateOriginFormat("https://va-nexus-crm.vercel.app#frag")).toThrow(
        /must not contain query parameters or hash fragments/
      );
    });

    it("should fail closed and prevent startup if production allowlist is missing or empty", () => {
      expect(() => parseAndValidateCorsOrigins("", true)).toThrow(
        /CORS_ALLOWED_ORIGINS \(or CLIENT_URL\) is required and cannot be empty in production/
      );
      expect(() => parseAndValidateCorsOrigins(undefined, true)).toThrow(
        /CORS_ALLOWED_ORIGINS \(or CLIENT_URL\) is required and cannot be empty in production/
      );
      expect(() => parseAndValidateCorsOrigins("   ", true)).toThrow(
        /CORS_ALLOWED_ORIGINS \(or CLIENT_URL\) is required and cannot be empty in production/
      );
    });

    it("should default to localhost/127.0.0.1 origins when allowlist is missing in development", () => {
      const devOrigins = parseAndValidateCorsOrigins(undefined, false);
      expect(devOrigins).toEqual(DEFAULT_DEVELOPMENT_ORIGINS);
      expect(devOrigins).toContain("http://localhost:3000");
      expect(devOrigins).toContain("http://127.0.0.1:3000");
    });

    it("should correctly parse multiple comma-separated origins", () => {
      const parsed = parseAndValidateCorsOrigins(
        "https://va-nexus-crm.vercel.app, http://localhost:3000, http://127.0.0.1:3000",
        true
      );
      expect(parsed).toEqual([
        "https://va-nexus-crm.vercel.app",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
      ]);
    });
  });

  describe("Browser CORS Enforcement & Preflight (Supertest)", () => {
    it("should grant CORS permissions to the configured production frontend origin", async () => {
      const res = await request(app)
        .get("/api/health")
        .set("Origin", PRODUCTION_ORIGIN);

      expect(res.status).toBe(200);
      expect(res.headers["access-control-allow-origin"]).toBe(PRODUCTION_ORIGIN);
      expect(res.headers["access-control-allow-credentials"]).toBe("true");
      expect(res.headers["vary"]).toContain("Origin");
    });

    it("should grant CORS permissions to configured development origins", async () => {
      const res = await request(app)
        .get("/api/health")
        .set("Origin", "http://localhost:3000");

      expect(res.status).toBe(200);
      expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
      expect(res.headers["access-control-allow-credentials"]).toBe("true");
    });

    it("should deny CORS permission and NEVER reflect unconfigured external origins", async () => {
      const attackerOrigins = [
        "https://random-attacker-domain.org",
        "https://evil-va-nexus-crm.vercel.app",
        "https://va-nexus-crm.vercel.app.attacker.com",
        "https://not-our-crm.vercel.app",
        "http://malicious.local",
      ];

      for (const origin of attackerOrigins) {
        const res = await request(app)
          .get("/api/health")
          .set("Origin", origin);

        // Untrusted origins must NEVER receive Access-Control-Allow-Origin
        expect(res.headers["access-control-allow-origin"]).toBeUndefined();
        expect(res.headers["access-control-allow-credentials"]).toBeUndefined();
      }
    });

    it("should reject Origin: null and grant no CORS permission", async () => {
      const res = await request(app)
        .get("/api/health")
        .set("Origin", "null");

      expect(res.headers["access-control-allow-origin"]).toBeUndefined();
      expect(res.headers["access-control-allow-credentials"]).toBeUndefined();
    });

    it("should handle allowed OPTIONS preflight requests properly (204 No Content)", async () => {
      const res = await request(app)
        .options("/api/health")
        .set("Origin", PRODUCTION_ORIGIN)
        .set("Access-Control-Request-Method", "POST")
        .set("Access-Control-Request-Headers", "Content-Type,Authorization");

      expect(res.status).toBe(204);
      expect(res.headers["access-control-allow-origin"]).toBe(PRODUCTION_ORIGIN);
      expect(res.headers["access-control-allow-credentials"]).toBe("true");
      expect(res.headers["access-control-allow-methods"]).toBe("GET,POST,PUT,PATCH,DELETE,OPTIONS");
      expect(res.headers["access-control-allow-headers"]).toContain("Content-Type");
      expect(res.headers["access-control-allow-headers"]).toContain("Authorization");
      expect(res.headers["access-control-expose-headers"]).toContain("X-Request-Id");
    });

    it("should reject untrusted OPTIONS preflight requests with zero CORS permission", async () => {
      const res = await request(app)
        .options("/api/health")
        .set("Origin", "https://untrusted-attacker.org")
        .set("Access-Control-Request-Method", "POST");

      expect(res.headers["access-control-allow-origin"]).toBeUndefined();
      expect(res.headers["access-control-allow-credentials"]).toBeUndefined();
    });

    it("should reject preflight requests with Origin: null", async () => {
      const res = await request(app)
        .options("/api/health")
        .set("Origin", "null")
        .set("Access-Control-Request-Method", "GET");

      expect(res.headers["access-control-allow-origin"]).toBeUndefined();
      expect(res.headers["access-control-allow-credentials"]).toBeUndefined();
    });

    it("should preserve legitimate server-to-server and non-browser calls without Origin header", async () => {
      const res = await request(app).get("/api/health");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe("VA Nexus API is running");
      // Must not dynamically generate or reflect CORS headers
      expect(res.headers["access-control-allow-origin"]).toBeUndefined();
      expect(res.headers["access-control-allow-credentials"]).toBeUndefined();
    });

    it("should enforce exact scheme and port matching without permissive substring checks", async () => {
      // Wrong scheme (http instead of https for production)
      const wrongSchemeRes = await request(app)
        .get("/api/health")
        .set("Origin", "http://va-nexus-crm.vercel.app");
      expect(wrongSchemeRes.headers["access-control-allow-origin"]).toBeUndefined();

      // Wrong port (3001 instead of 3000 for localhost)
      const wrongPortRes = await request(app)
        .get("/api/health")
        .set("Origin", "http://localhost:3001");
      expect(wrongPortRes.headers["access-control-allow-origin"]).toBeUndefined();
    });
  });
});
