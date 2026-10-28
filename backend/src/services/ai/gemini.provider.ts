import crypto from "crypto";
import {
  getGeminiClient,
  geminiEnv,
  isGeminiConfigured,
  GeminiConfigError,
  GeminiRateLimitError,
  GeminiTimeoutError,
  GeminiValidationError,
} from "../../config/gemini";
import { logger } from "../../config/logger";

export interface GeminiRequest {
  prompt?: string;
  contents?: any;
  audioData?: {
    mimeType: string;
    data: string; // base64
  };
  systemInstruction?: string;
  model?: string;
  correlationId?: string;
  taskType?: string;
  temperature?: number;
  responseMimeType?: string;
}

export interface GeminiResponse {
  text: string;
  model: string;
  correlationId: string;
  taskType: string;
  latencyMs: number;
  retries: number;
}

export async function callGemini(req: GeminiRequest): Promise<GeminiResponse> {
  const correlationId = req.correlationId || crypto.randomUUID();
  const model = req.model || geminiEnv.GEMINI_MODEL;
  const maxRetries = Math.max(0, geminiEnv.GEMINI_MAX_RETRIES);
  const timeoutMs = Math.max(2000, geminiEnv.GEMINI_TIMEOUT_MS);
  const taskType = req.taskType || "generic";

  if (!isGeminiConfigured()) {
    throw new GeminiConfigError(
      "Gemini AI provider is not configured. GEMINI_API_KEY is missing."
    );
  }

  let attempt = 0;
  let lastError: Error | null = null;

  while (attempt <= maxRetries) {
    const start = Date.now();
    try {
      const client = getGeminiClient();

      let contents: any = req.contents ?? req.prompt ?? "";
      if (req.audioData) {
        contents = [
          {
            inlineData: {
              mimeType: req.audioData.mimeType,
              data: req.audioData.data,
            },
          },
          {
            text: req.prompt || "Please transcribe and analyze this audio call recording.",
          },
        ];
      }

      const generatePromise = client.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction: req.systemInstruction,
          temperature: req.temperature ?? 0.2,
          responseMimeType: req.responseMimeType,
        },
      });

      const timeoutPromise = new Promise<never>((_, reject) => {
        const timer = setTimeout(() => {
          reject(
            new GeminiTimeoutError(
              `Gemini API request timed out after ${timeoutMs}ms for task '${taskType}'`
            )
          );
        }, timeoutMs);
        if (typeof timer.unref === "function") {
          timer.unref();
        }
      });

      const result = await Promise.race([generatePromise, timeoutPromise]);
      const text = result.text || "";
      const latencyMs = Date.now() - start;

      logger.info(
        { correlationId, model, taskType, latencyMs, retries: attempt },
        "Gemini API call succeeded"
      );

      return {
        text,
        model,
        correlationId,
        taskType,
        latencyMs,
        retries: attempt,
      };
    } catch (err: any) {
      const latencyMs = Date.now() - start;
      lastError = err;

      const rawMessage = String(err?.message || "");
      let cleanMessage = rawMessage;
      try {
        const parsed = JSON.parse(rawMessage);
        if (parsed?.error?.message) {
          cleanMessage = parsed.error.message;
        }
      } catch {
        // Not JSON string
      }

      const isRateLimit =
        err?.status === 429 ||
        rawMessage.includes("429") ||
        rawMessage.toLowerCase().includes("quota") ||
        rawMessage.toLowerCase().includes("resource_exhausted");

      const isTimeout = err instanceof GeminiTimeoutError || rawMessage.includes("timed out");
      const isLeakedKey =
        rawMessage.includes("API key was reported as leaked") ||
        cleanMessage.includes("API key was reported as leaked");

      const isAuthError =
        err?.status === 401 ||
        err?.status === 403 ||
        rawMessage.includes("PERMISSION_DENIED") ||
        rawMessage.includes("API_KEY_INVALID");

      const isModelNotFoundError =
        err?.status === 404 ||
        rawMessage.includes("NOT_FOUND") ||
        rawMessage.includes("no longer available");

      if (isLeakedKey) {
        logger.error(
          { correlationId, taskType, latencyMs },
          "Gemini API key has been reported as leaked by Google"
        );
        throw new GeminiConfigError(
          "Your Gemini API Key has been reported as leaked/compromised by Google. Please generate a new key at https://aistudio.google.com/ and set GEMINI_API_KEY in backend/.env."
        );
      }

      if (isAuthError) {
        logger.error(
          { correlationId, taskType, latencyMs, status: err?.status },
          "Gemini authentication / permission denied error"
        );
        throw new GeminiConfigError(
          `Gemini API authentication failed: ${cleanMessage}`
        );
      }

      if (isModelNotFoundError) {
        logger.error(
          { correlationId, taskType, model, latencyMs },
          "Gemini model not found or deprecated"
        );
        throw new GeminiConfigError(
          `Gemini model '${model}' is unavailable: ${cleanMessage}`
        );
      }

      if (err instanceof GeminiConfigError) {
        throw err;
      }

      if (isRateLimit) {
        lastError = new GeminiRateLimitError(
          `Gemini rate limit or quota exceeded: ${cleanMessage}`
        );
        logger.warn(
          { correlationId, taskType, attempt, latencyMs },
          "Gemini rate limit encountered"
        );
      } else if (isTimeout) {
        logger.warn(
          { correlationId, taskType, attempt, latencyMs },
          "Gemini request timeout"
        );
      } else {
        logger.warn(
          { correlationId, taskType, attempt, latencyMs, message: cleanMessage },
          "Gemini transient API failure, evaluating retry"
        );
      }

      if (attempt < maxRetries) {
        // Exponential backoff with random jitter: (2^attempt * 1000) + jitter
        const jitter = Math.floor(Math.random() * 500);
        const backoffMs = Math.min(1000 * Math.pow(2, attempt) + jitter, 15000);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }

      attempt++;
    }
  }

  logger.error(
    { correlationId, taskType, attempts: attempt },
    "Gemini provider exhausted all retries"
  );

  throw (
    lastError ||
    new Error(`Gemini request failed after ${attempt} attempts for task '${taskType}'`)
  );
}

/**
 * Robust JSON parser for Gemini structured responses.
 * Automatically cleans markdown ```json ... ``` wrapping and whitespace.
 */
export function parseGeminiJson<T>(rawText: string, correlationId: string): T {
  if (!rawText || !rawText.trim()) {
    throw new GeminiValidationError("Empty response received from Gemini", rawText);
  }

  let cleaned = rawText.trim();

  // Strip code block fences
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  }

  // Attempt direct JSON parse
  try {
    return JSON.parse(cleaned) as T;
  } catch (initialErr: any) {
    // If there is narrative text around JSON, locate first '{' or '[' and last '}' or ']'
    const firstBrace = cleaned.indexOf("{");
    const firstBracket = cleaned.indexOf("[");
    const startIndex =
      firstBrace !== -1 && firstBracket !== -1
        ? Math.min(firstBrace, firstBracket)
        : firstBrace !== -1
        ? firstBrace
        : firstBracket;

    const lastBrace = cleaned.lastIndexOf("}");
    const lastBracket = cleaned.lastIndexOf("]");
    const endIndex = Math.max(lastBrace, lastBracket);

    if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
      const extracted = cleaned.substring(startIndex, endIndex + 1);
      try {
        return JSON.parse(extracted) as T;
      } catch (extractErr) {
        // Fall through to error throw
      }
    }

    logger.error(
      { correlationId, preview: cleaned.substring(0, 300) },
      "Failed to parse structured JSON from Gemini response"
    );

    throw new GeminiValidationError(
      `Failed to parse JSON response from Gemini: ${initialErr?.message || "Invalid syntax"}`,
      rawText
    );
  }
}
