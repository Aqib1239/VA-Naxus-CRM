import { DeepgramClient } from "@deepgram/sdk";
import { env } from "./env";
import { logger } from "./logger";

export class DeepgramConfigError extends Error {
  constructor(message = "Deepgram API is not configured on the server.") {
    super(message);
    this.name = "DeepgramConfigError";
  }
}

export function isDeepgramConfigured(): boolean {
  return Boolean(env.DEEPGRAM_API_KEY && env.DEEPGRAM_API_KEY.trim().length > 0);
}

let deepgramClientInstance: DeepgramClient | null = null;

export function getDeepgramClient(): DeepgramClient {
  const apiKey = env.DEEPGRAM_API_KEY || process.env.DEEPGRAM_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    throw new DeepgramConfigError(
      "Deepgram API key is missing. Please set DEEPGRAM_API_KEY in the server environment (backend/.env)."
    );
  }

  if (!deepgramClientInstance) {
    deepgramClientInstance = new DeepgramClient({
      apiKey: apiKey.trim(),
    });
    logger.info("Initialized Deepgram client for audio transcription");
  }

  return deepgramClientInstance;
}
