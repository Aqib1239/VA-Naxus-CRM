import { CorsOptions } from "cors";

/**
 * Default origins permitted in development and testing environments.
 */
export const DEFAULT_DEVELOPMENT_ORIGINS: string[] = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

/**
 * Validates and normalizes an individual origin string.
 * Enforces strict exact format: <scheme>://<host>[:<port>].
 * Rejects wildcards, paths, trailing slashes, queries, hashes, and unsupported protocols.
 */
export function validateOriginFormat(origin: string): string {
  const trimmed = origin.trim();

  if (!trimmed) {
    throw new Error("CORS origin entry cannot be empty.");
  }

  if (trimmed === "*" || trimmed.includes("*")) {
    throw new Error(
      `FATAL: Wildcard origin '${trimmed}' is strictly prohibited. An explicit, exact origin is required.`
    );
  }

  if (trimmed === "null") {
    throw new Error("FATAL: Origin 'null' is strictly prohibited in CORS allowlist.");
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(
      `FATAL: Malformed CORS origin '${trimmed}'. Must be a valid URL with scheme and host.`
    );
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(
      `FATAL: Invalid protocol in CORS origin '${trimmed}'. Only 'http:' and 'https:' are permitted.`
    );
  }

  // Reject paths (including trailing slashes e.g. "https://example.com/")
  if (parsed.pathname !== "/" && parsed.pathname !== "") {
    throw new Error(`FATAL: CORS origin '${trimmed}' must not contain a path component.`);
  }

  if (trimmed.endsWith("/")) {
    throw new Error(`FATAL: CORS origin '${trimmed}' must not end with a trailing slash.`);
  }

  if (parsed.search || parsed.hash) {
    throw new Error(
      `FATAL: CORS origin '${trimmed}' must not contain query parameters or hash fragments.`
    );
  }

  // Exact normalized match comparison: must match parsed.origin verbatim
  if (parsed.origin !== trimmed) {
    throw new Error(
      `FATAL: CORS origin '${trimmed}' is not in normalized origin format (expected '${parsed.origin}').`
    );
  }

  return trimmed;
}

/**
 * Parses and validates comma-separated origin configurations.
 * Fails closed in production if allowlist is missing or empty.
 */
export function parseAndValidateCorsOrigins(
  rawOrigins: string | undefined,
  isProduction: boolean
): string[] {
  const input = rawOrigins ? rawOrigins.trim() : "";

  if (!input) {
    if (isProduction) {
      throw new Error(
        "FATAL: CORS_ALLOWED_ORIGINS (or CLIENT_URL) is required and cannot be empty in production."
      );
    }
    return [...DEFAULT_DEVELOPMENT_ORIGINS];
  }

  const entries = input
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (entries.length === 0) {
    if (isProduction) {
      throw new Error(
        "FATAL: CORS_ALLOWED_ORIGINS must contain at least one valid origin in production."
      );
    }
    return [...DEFAULT_DEVELOPMENT_ORIGINS];
  }

  return entries.map(validateOriginFormat);
}

/**
 * Builds hardened Express CORS options using an exact-match allowlist.
 */
export function getCorsOptions(allowedOrigins: string[]): CorsOptions {
  const allowedSet = new Set(allowedOrigins);

  return {
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      // Requests without an Origin header (mobile apps, curl, server-to-server) receive no CORS headers
      if (!origin || origin === "null") {
        return callback(null, false);
      }

      // Exact match check (exact scheme, host, and port)
      if (allowedSet.has(origin)) {
        return callback(null, true);
      }

      // Untrusted origins receive zero CORS permissions
      return callback(null, false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Request-Id", "Range"],
    exposedHeaders: ["X-Request-Id", "Content-Range", "Accept-Ranges"],
    optionsSuccessStatus: 204,
  };
}
