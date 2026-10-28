import { GoogleGenAI } from "@google/genai";
import { env } from "./env";
import { logger } from "./logger";

let _client: GoogleGenAI | null = null;

export class GeminiConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeminiConfigError";
  }
}

export class GeminiRateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeminiRateLimitError";
  }
}

export class GeminiTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeminiTimeoutError";
  }
}

export class GeminiValidationError extends Error {
  readonly raw: unknown;
  constructor(message: string, raw?: unknown) {
    super(message);
    this.name = "GeminiValidationError";
    this.raw = raw;
  }
}

export function isGeminiConfigured(): boolean {
  return Boolean(env.GEMINI_API_KEY && env.GEMINI_API_KEY.trim().length > 0);
}

export function getGeminiClient(): GoogleGenAI {
  if (!_client) {
    if (!isGeminiConfigured()) {
      throw new GeminiConfigError(
        "GEMINI_API_KEY is not configured on the server. Please set GEMINI_API_KEY in the backend environment."
      );
    }
    _client = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
    logger.info({ model: env.GEMINI_MODEL }, "Google GenAI client initialized");
  }
  return _client;
}

export { env as geminiEnv };
