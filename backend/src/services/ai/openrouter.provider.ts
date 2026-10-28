import crypto from "crypto";
import {
  isOpenRouterConfigured,
  openRouterEnv,
  OpenRouterConfigError,
  OpenRouterRateLimitError,
  OpenRouterTimeoutError,
  OpenRouterApiError,
} from "../../config/openrouter";
import { logger } from "../../config/logger";

export interface OpenRouterChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
  reasoning_details?: any;
}

export interface OpenRouterRequest {
  messages: OpenRouterChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  correlationId?: string;
  taskType?: string;
}

export interface OpenRouterResponse {
  content: string;
  model: string;
  correlationId: string;
  taskType: string;
  latencyMs: number;
  retries: number;
  reasoningDetails?: any;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

/**
 * Strips internal chain-of-thought and reasoning artifacts so that
 * only the model's intended final answer is returned to the user.
 */
export function stripInternalReasoning(raw: string): string {
  if (!raw) return "";

  let cleaned = raw;

  // 1. Strip <thought> ... </thought> or <think> ... </think> tags (case-insensitive)
  cleaned = cleaned.replace(/<thought>[\s\S]*?<\/thought>/gi, "");
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, "");
  cleaned = cleaned.replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, "");

  // 2. Strip unclosed opening thinking tags if generation ended abruptly
  cleaned = cleaned.replace(/<thought>[\s\S]*$/gi, "");
  cleaned = cleaned.replace(/<think>[\s\S]*$/gi, "");

  // 3. Strip explicit "Reasoning:\n...\n\nFinal Answer:\n" wrappers if present
  const finalAnswerMatch = cleaned.match(/(?:^|\n)(?:final answer|answer):\s*([\s\S]*)$/i);
  if (finalAnswerMatch && finalAnswerMatch[1] && finalAnswerMatch[1].trim()) {
    // If the text clearly demarcated reasoning vs final answer
    const beforePart = cleaned.slice(0, cleaned.indexOf(finalAnswerMatch[0])).toLowerCase();
    if (beforePart.includes("reasoning:") || beforePart.includes("thought process:")) {
      cleaned = finalAnswerMatch[1];
    }
  }

  return cleaned.trim();
}

/**
 * Main OpenRouter API caller with bounded retries, timeouts, and error handling.
 */
export async function callOpenRouter(req: OpenRouterRequest): Promise<OpenRouterResponse> {
  const correlationId = req.correlationId || crypto.randomUUID();
  const model = req.model || openRouterEnv.OPENROUTER_MODEL || "nvidia/nemotron-3.5-lightning:free";
  const maxRetries = Math.max(0, openRouterEnv.OPENROUTER_MAX_RETRIES ?? 2);
  const timeoutMs = Math.max(3000, openRouterEnv.OPENROUTER_TIMEOUT_MS ?? 35000);
  const taskType = req.taskType || "command_center";
  const baseUrl = (openRouterEnv.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1").replace(/\/+$/, "");
  const endpoint = `${baseUrl}/chat/completions`;

  if (!isOpenRouterConfigured()) {
    throw new OpenRouterConfigError(
      "OpenRouter AI provider is not configured. Please set OPENROUTER_API_KEY in the server environment (backend/.env)."
    );
  }

  let attempt = 0;
  let lastError: Error | null = null;

  while (attempt <= maxRetries) {
    const start = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    try {
      logger.info(
        { correlationId, model, taskType, attempt, endpoint },
        "Sending request to OpenRouter API"
      );

      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openRouterEnv.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": openRouterEnv.CLIENT_URL || "http://localhost:3000",
          "X-Title": "VA Nexus CRM",
        },
        body: JSON.stringify({
          model,
          messages: req.messages,
          reasoning: { enabled: true },
          temperature: req.temperature ?? 0.2,
          max_tokens: req.maxTokens ?? 2048,
        }),
        signal: controller.signal,
      });

      clearTimeout(timer);
      const latencyMs = Date.now() - start;

      if (!res.ok) {
        let errJson: any = null;
        let errBodyText = "";
        try {
          errJson = await res.json();
        } catch {
          errBodyText = await res.text().catch(() => "");
        }

        const rawMsg =
          errJson?.error?.message ||
          errJson?.message ||
          errBodyText ||
          `HTTP ${res.status} ${res.statusText}`;

        logger.error(
          { correlationId, status: res.status, rawMsg, taskType, model },
          "OpenRouter API returned error status"
        );

        // Fail fast on auth, credit, rate limit, or model not found errors (no retry loop)
        if (res.status === 401 || res.status === 403) {
          throw new OpenRouterConfigError(
            `OpenRouter authentication failed (${res.status}): ${rawMsg}. Please check your OPENROUTER_API_KEY in backend/.env.`
          );
        }

        if (res.status === 402) {
          throw new OpenRouterConfigError(
            `OpenRouter account has insufficient credits: ${rawMsg}.`
          );
        }

        if (res.status === 429) {
          throw new OpenRouterRateLimitError(
            `OpenRouter rate limit or model quota exceeded for '${model}': ${rawMsg}. Please retry in a few moments.`
          );
        }

        if (res.status === 404 || res.status === 400) {
          throw new OpenRouterApiError(
            `OpenRouter model '${model}' is unavailable or rejected request (${res.status}): ${rawMsg}`,
            res.status,
            errJson
          );
        }

        // For 5xx errors, allow retry if attempts remain
        throw new OpenRouterApiError(
          `OpenRouter service error (${res.status}): ${rawMsg}`,
          res.status,
          errJson
        );
      }

      const data: any = await res.json();
      const choice = data?.choices?.[0];
      const message = choice?.message;

      // Extract only intended content; NEVER forward message.reasoning or message.reasoning_details to client
      const rawContent: string = message?.content || "";
      const reasoningDetails = message?.reasoning_details || null;
      const cleanContent = stripInternalReasoning(rawContent);

      if (!cleanContent && !rawContent) {
        throw new OpenRouterApiError(
          "OpenRouter returned an empty response content.",
          500,
          data
        );
      }

      const returnedModel = data?.model || model;

      logger.info(
        { correlationId, model: returnedModel, taskType, latencyMs, retries: attempt },
        "OpenRouter request completed successfully"
      );

      return {
        content: cleanContent || rawContent,
        model: returnedModel,
        correlationId,
        taskType,
        latencyMs,
        retries: attempt,
        reasoningDetails,
        usage: {
          promptTokens: data?.usage?.prompt_tokens,
          completionTokens: data?.usage?.completion_tokens,
          totalTokens: data?.usage?.total_tokens,
        },
      };
    } catch (err: any) {
      clearTimeout(timer);
      const latencyMs = Date.now() - start;
      lastError = err;

      const isAbort =
        err?.name === "AbortError" ||
        String(err?.message || "").toLowerCase().includes("aborted");

      if (isAbort) {
        lastError = new OpenRouterTimeoutError(
          `OpenRouter API request timed out after ${timeoutMs}ms for task '${taskType}'.`
        );
        logger.warn({ correlationId, taskType, attempt, timeoutMs }, "OpenRouter request timed out");
      }

      // If it's a fatal config or rate limit error, do NOT retry
      if (
        err instanceof OpenRouterConfigError ||
        err instanceof OpenRouterRateLimitError ||
        (err instanceof OpenRouterApiError && err.status < 500)
      ) {
        throw err;
      }

      logger.warn(
        { correlationId, taskType, attempt, latencyMs, message: err?.message },
        "OpenRouter transient error, evaluating retry"
      );

      if (attempt < maxRetries) {
        const jitter = Math.floor(Math.random() * 400);
        const backoffMs = Math.min(1000 * Math.pow(2, attempt) + jitter, 10000);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }

      attempt++;
    }
  }

  logger.error(
    { correlationId, taskType, attempts: attempt },
    "OpenRouter provider exhausted all retries"
  );

  throw (
    lastError ||
    new OpenRouterApiError(
      `OpenRouter request failed after ${attempt} attempts for task '${taskType}'`,
      500
    )
  );
}

/**
 * Robust JSON parser for OpenRouter structured responses.
 * Automatically cleans markdown ```json ... ``` wrapping and whitespace.
 */
export function parseOpenRouterJson<T>(rawText: string, correlationId: string): T {
  let cleaned = rawText.trim();

  // Strip internal reasoning first just in case
  cleaned = stripInternalReasoning(cleaned);

  // Strip markdown code fences if model returned them
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```[a-zA-Z]*\n?/, "").replace(/\n?```$/, "");
  }
  cleaned = cleaned.trim();

  // Find boundaries of valid JSON object or array
  const firstBrace = cleaned.indexOf("{");
  const firstBracket = cleaned.indexOf("[");
  let startIdx = -1;

  if (firstBrace !== -1 && firstBracket !== -1) {
    startIdx = Math.min(firstBrace, firstBracket);
  } else if (firstBrace !== -1) {
    startIdx = firstBrace;
  } else if (firstBracket !== -1) {
    startIdx = firstBracket;
  }

  if (startIdx !== -1) {
    const isArray = cleaned[startIdx] === "[";
    const lastIdx = isArray ? cleaned.lastIndexOf("]") : cleaned.lastIndexOf("}");
    if (lastIdx > startIdx) {
      cleaned = cleaned.slice(startIdx, lastIdx + 1);
    }
  }

  try {
    return JSON.parse(cleaned) as T;
  } catch (err: any) {
    logger.error(
      { correlationId, rawTextSnippet: rawText.slice(0, 300), err: err?.message },
      "Failed to parse structured JSON from OpenRouter response"
    );
    throw new Error(
      `Failed to parse valid structured JSON from OpenRouter AI response: ${err?.message}`
    );
  }
}
