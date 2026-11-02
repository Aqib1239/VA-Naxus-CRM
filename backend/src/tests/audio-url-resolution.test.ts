describe("Frontend Audio URL Resolution & Security Hardening", () => {
  function isValidLeadId(id: unknown): id is string {
    return typeof id === "string" && /^[a-zA-Z0-9_-]{1,64}$/.test(id) && !id.includes("..");
  }

  function getApiBaseUrl(envNodeEnv?: string, nextPublicApiUrl?: string): string {
    if (nextPublicApiUrl) {
      return nextPublicApiUrl.replace(/\/$/, "");
    }
    if (envNodeEnv === "production") {
      return "/api";
    }
    return "http://localhost:5000/api";
  }

  function getBackendOrigin(envNodeEnv?: string, nextPublicApiUrl?: string): string {
    const apiBase = getApiBaseUrl(envNodeEnv, nextPublicApiUrl);
    return apiBase.replace(/\/api$/, "");
  }

  function isMockLeadId(id: unknown): boolean {
    return typeof id === "string" && /^lead-\d{3,4}$/i.test(id);
  }

  function resolveAudioUrl(
    src?: string,
    leadId?: string,
    envNodeEnv?: string,
    nextPublicApiUrl?: string
  ): string {
    if (src && (src.startsWith("blob:") || src.startsWith("data:"))) {
      return src;
    }

    if (src && src.startsWith("/audio/")) {
      return src;
    }

    const backendOrigin = getBackendOrigin(envNodeEnv, nextPublicApiUrl);
    const apiBase = getApiBaseUrl(envNodeEnv, nextPublicApiUrl);

    if (isMockLeadId(leadId)) {
      if (src && !src.includes("/api/leads/") && !src.includes("cloudinary.com")) {
        return src;
      }
      return "/audio/sample-call.wav";
    }

    if (leadId) {
      if (isValidLeadId(leadId)) {
        return `${backendOrigin}/api/leads/${leadId}/audio`;
      }
      return "";
    }

    if (src && (src.startsWith("https://res.cloudinary.com/") || src.startsWith("http://res.cloudinary.com/"))) {
      return "";
    }

    if (src && src.startsWith("/")) {
      if (src.startsWith("/api/leads/")) {
        const parts = src.split("?")[0].split("/");
        const idFromPath = parts[3];
        if (idFromPath && isValidLeadId(idFromPath)) {
          return `${backendOrigin}${src}`;
        }
        return "";
      }
      if (src.startsWith("/leads/")) {
        const parts = src.split("?")[0].split("/");
        const idFromPath = parts[2];
        if (idFromPath && isValidLeadId(idFromPath)) {
          return `${apiBase}${src}`;
        }
        return "";
      }
      return src;
    }

    if (src && (src.startsWith("http://") || src.startsWith("https://"))) {
      try {
        const parsed = new URL(src);
        if (parsed.hostname === "res.cloudinary.com" || parsed.hostname.endsWith(".cloudinary.com")) {
          return "";
        }
        return src;
      } catch {
        return "";
      }
    }

    return "";
  }

  describe("1. Lead ID Validation", () => {
    it("should accept valid MongoDB ObjectIds and alphanumeric slugs", () => {
      expect(isValidLeadId("65a123456789abcdef012345")).toBe(true);
      expect(isValidLeadId("lead-101")).toBe(true);
      expect(isValidLeadId("VA_2026_TEST")).toBe(true);
      expect(isValidLeadId("aud_sample_01")).toBe(true);
    });

    it("should reject path traversal, slashes, and special characters", () => {
      expect(isValidLeadId("../../../etc/passwd")).toBe(false);
      expect(isValidLeadId("lead/123")).toBe(false);
      expect(isValidLeadId("lead\\123")).toBe(false);
      expect(isValidLeadId("<script>alert(1)</script>")).toBe(false);
      expect(isValidLeadId("lead$123")).toBe(false);
      expect(isValidLeadId("")).toBe(false);
      expect(isValidLeadId(null)).toBe(false);
      expect(isValidLeadId(undefined)).toBe(false);
    });
  });

  describe("2. Canonical Audio Proxy Resolution", () => {
    it("should construct canonical backend streaming proxy route from trusted leadId", () => {
      const url = resolveAudioUrl(undefined, "65a123456789abcdef012345", "development");
      expect(url).toBe("http://localhost:5000/api/leads/65a123456789abcdef012345/audio");
    });

    it("should reject direct Cloudinary CDN URLs when no valid leadId is provided", () => {
      const rawCloudinary = "https://res.cloudinary.com/vibhanu/video/authenticated/s--xyz--/v1/recording.mp3";
      expect(resolveAudioUrl(rawCloudinary, undefined, "development")).toBe("");
    });

    it("should never regex-parse leadId from Cloudinary URL when leadId is omitted", () => {
      const spoofedCloudinary = "https://res.cloudinary.com/vibhanu/video/upload/audio_fakelead123_test.mp3";
      expect(resolveAudioUrl(spoofedCloudinary, undefined, "development")).toBe("");
    });

    it("should use explicit trusted leadId even if a Cloudinary URL was passed as src", () => {
      const rawCloudinary = "https://res.cloudinary.com/vibhanu/video/upload/audio_fake_test.mp3";
      const url = resolveAudioUrl(rawCloudinary, "trusted-lead-999", "development");
      expect(url).toBe("http://localhost:5000/api/leads/trusted-lead-999/audio");
    });

    it("should reject if leadId is invalid format", () => {
      expect(resolveAudioUrl(undefined, "../malicious-traversal", "development")).toBe("");
    });
  });

  describe("3. Production Environment & Localhost Fallback Prevention", () => {
    it("should resolve to relative /api in production when NEXT_PUBLIC_API_URL is unset", () => {
      const url = resolveAudioUrl(undefined, "65a123456789abcdef012345", "production", undefined);
      expect(url).toBe("/api/leads/65a123456789abcdef012345/audio");
      expect(url).not.toContain("localhost:5000");
    });

    it("should use custom domain in production when NEXT_PUBLIC_API_URL is configured", () => {
      const url = resolveAudioUrl(
        undefined,
        "65a123456789abcdef012345",
        "production",
        "https://crm.vanexus.com/api"
      );
      expect(url).toBe("https://crm.vanexus.com/api/leads/65a123456789abcdef012345/audio");
    });

    it("should preserve blob and data URLs for local previews", () => {
      expect(resolveAudioUrl("blob:http://localhost:3000/uuid-1", undefined, "production")).toBe(
        "blob:http://localhost:3000/uuid-1"
      );
      expect(resolveAudioUrl("data:audio/mp3;base64,...", undefined, "production")).toBe(
        "data:audio/mp3;base64,..."
      );
    });

    it("should preserve local static public assets (/audio/sample-call.wav) without proxying", () => {
      expect(resolveAudioUrl("/audio/sample-call.wav", undefined, "production")).toBe(
        "/audio/sample-call.wav"
      );
      expect(resolveAudioUrl("/audio/sample-call.wav", "lead-011", "development")).toBe(
        "/audio/sample-call.wav"
      );
    });

    it("should safely fall back to local demo audio for client-side fixture leads (e.g. lead-011)", () => {
      expect(resolveAudioUrl(undefined, "lead-011", "development")).toBe(
        "/audio/sample-call.wav"
      );
    });
  });
});

