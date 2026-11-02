/** @type {import('next').NextConfig} */

function getBackendOrigin() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) {
    return process.env.NODE_ENV === "production" ? "" : "http://localhost:5000";
  }
  try {
    const parsed = new URL(apiUrl);
    return parsed.origin;
  } catch {
    return "";
  }
}

const backendOrigin = getBackendOrigin();
const connectOrigins = ["'self'", backendOrigin].filter(Boolean).join(" ");
const mediaOrigins = ["'self'", "data:", "blob:", backendOrigin].filter(Boolean).join(" ");

export const cspDirectives = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src ${connectOrigins}`,
  `media-src ${mediaOrigins}`,
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "block-all-mixed-content",
  "upgrade-insecure-requests",
].join("; ");

const isCspEnforced = process.env.ENFORCE_CSP === "true";
const cspHeaderKey = isCspEnforced
  ? "Content-Security-Policy"
  : "Content-Security-Policy-Report-Only";

export const securityHeaders = [
  {
    key: cspHeaderKey,
    value: cspDirectives,
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
