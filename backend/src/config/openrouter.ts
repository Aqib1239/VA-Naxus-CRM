import { env } from "./env";
import { logger } from "./logger";

export class OpenRouterConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenRouterConfigError";
  }
}

export class OpenRouterRateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenRouterRateLimitError";
  }
}

export class OpenRouterTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenRouterTimeoutError";
  }
}

export class OpenRouterApiError extends Error {
  readonly status: number;
  readonly rawError?: unknown;
  constructor(message: string, status: number = 500, rawError?: unknown) {
    super(message);
    this.name = "OpenRouterApiError";
    this.status = status;
    this.rawError = rawError;
  }
}

export function isOpenRouterConfigured(): boolean {
  return Boolean(env.OPENROUTER_API_KEY && env.OPENROUTER_API_KEY.trim().length > 0);
}

export { env as openRouterEnv };
