import { env } from "./env";
import { logger } from "./logger";

export class OpenRouterConfigError extends Error {
  readonly status: number;
  constructor(message: string, status: number = 503) {
    super(message);
    this.name = "OpenRouterConfigError";
    this.status = status;
    Object.setPrototypeOf(this, OpenRouterConfigError.prototype);
  }
}

export class OpenRouterRateLimitError extends Error {
  readonly status: number;
  constructor(message: string, status: number = 429) {
    super(message);
    this.name = "OpenRouterRateLimitError";
    this.status = status;
    Object.setPrototypeOf(this, OpenRouterRateLimitError.prototype);
  }
}

export class OpenRouterTimeoutError extends Error {
  readonly status: number;
  constructor(message: string, status: number = 504) {
    super(message);
    this.name = "OpenRouterTimeoutError";
    this.status = status;
    Object.setPrototypeOf(this, OpenRouterTimeoutError.prototype);
  }
}

export class OpenRouterApiError extends Error {
  readonly status: number;
  readonly rawError?: unknown;
  readonly finishReason?: string | null;
  readonly correlationId?: string;
  constructor(
    message: string,
    status: number = 500,
    rawError?: unknown,
    finishReason?: string | null,
    correlationId?: string
  ) {
    super(message);
    this.name = "OpenRouterApiError";
    this.status = status;
    this.rawError = rawError;
    this.finishReason = finishReason;
    this.correlationId = correlationId;
    Object.setPrototypeOf(this, OpenRouterApiError.prototype);
  }
}

export function isOpenRouterConfigured(): boolean {
  return Boolean(env.OPENROUTER_API_KEY && env.OPENROUTER_API_KEY.trim().length > 0);
}

export { env as openRouterEnv };
