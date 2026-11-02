import { getDeepgramClient } from "../config/deepgram";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { sanitizeUrlForLogging } from "../middleware/logging.middleware";
import {
  ITranscriptParagraph,
  ITranscriptUtterance,
  ITranscriptWord,
  ISpeakerMapping,
} from "../models/Transcription.model";

export interface DeepgramTranscriptionOutput {
  provider: "DEEPGRAM";
  model: string;
  language: string;
  detectedLanguage?: string;
  fullTranscript: string;
  confidence: number;
  audioDurationSeconds: number;
  paragraphs: ITranscriptParagraph[];
  utterances: ITranscriptUtterance[];
  words: ITranscriptWord[];
  speakers: ISpeakerMapping[];
}

export class DeepgramService {
  /**
   * SSRF Protection: Ensure external audio URLs are valid, safe HTTPS endpoints.
   */
  static validateAudioUrl(audioUrl: string): void {
    if (!audioUrl || typeof audioUrl !== "string") {
      throw new Error("Invalid audio URL: URL must be a non-empty string.");
    }

    let parsed: URL;
    try {
      parsed = new URL(audioUrl);
    } catch {
      throw new Error("Invalid audio URL: Malformed URL provided.");
    }

    // Must be https or in dev http
    const isDev = env.NODE_ENV === "development" || env.NODE_ENV === "test";
    if (parsed.protocol !== "https:" && (!isDev || parsed.protocol !== "http:")) {
      throw new Error("Audio URL security violation: Only HTTPS audio URLs are permitted.");
    }

    const host = parsed.hostname.toLowerCase();

    // Check for SSRF / private IP access
    const isPrivate =
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host === "169.254.169.254" || // AWS / Cloud metadata
      host.startsWith("10.") ||
      host.startsWith("192.168.") ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host);

    if (isPrivate && env.NODE_ENV === "production") {
      throw new Error("Audio URL security violation: Access to private networks and loopback is forbidden.");
    }
  }

  /**
   * Helper to parse and normalize Deepgram Nova-3 SDK response payloads.
   */
  private static normalizeDeepgramResponse(
    response: any,
    model: string,
    language: string
  ): DeepgramTranscriptionOutput {
    const results = response?.results || response?.result?.results || response?.data?.results;
    const metadata = response?.metadata || response?.result?.metadata || response?.data?.metadata;

    if (!results || !results.channels || results.channels.length === 0) {
      throw new Error("Deepgram returned an empty or malformed transcription response.");
    }

    const primaryChannel = results.channels[0];
    const alternative = primaryChannel.alternatives?.[0] || {
      transcript: "",
      confidence: 0,
      words: [],
      paragraphs: { paragraphs: [] },
    };

    const fullTranscript = (alternative.transcript || "").trim();
    const confidence = alternative.confidence ?? 0;
    const audioDurationSeconds = Math.round(metadata?.duration || 0);

    // Detect language
    const detectedLanguage =
      primaryChannel.detected_language ||
      alternative.languages?.[0] ||
      metadata?.model_info?.[model]?.language ||
      language;

    // Extract words
    const rawWords = alternative.words || [];
    const words: ITranscriptWord[] = rawWords.map((w: any) => ({
      word: w.word || "",
      start: Number(w.start ?? 0),
      end: Number(w.end ?? 0),
      confidence: Number(w.confidence ?? 0),
      speaker: typeof w.speaker === "number" ? w.speaker : undefined,
      punctuated_word: w.punctuated_word,
    }));

    // Extract paragraphs
    const rawParagraphs = alternative.paragraphs?.paragraphs || [];
    const paragraphs: ITranscriptParagraph[] = rawParagraphs.map((p: any) => {
      const text = (p.sentences || []).map((s: any) => s.text).join(" ").trim() || "";
      return {
        speaker: typeof p.speaker === "number" ? p.speaker : undefined,
        text,
        start: Number(p.start ?? 0),
        end: Number(p.end ?? 0),
        numWords: p.num_words,
      };
    });

    // Extract utterances
    const rawUtterances = results.utterances || [];
    const utterances: ITranscriptUtterance[] = rawUtterances.map((u: any) => ({
      id: u.id ? String(u.id) : undefined,
      speaker: typeof u.speaker === "number" ? u.speaker : undefined,
      transcript: (u.transcript || "").trim(),
      start: Number(u.start ?? 0),
      end: Number(u.end ?? 0),
      confidence: Number(u.confidence ?? 0),
      words: (u.words || []).map((w: any) => ({
        word: w.word || "",
        start: Number(w.start ?? 0),
        end: Number(w.end ?? 0),
        confidence: Number(w.confidence ?? 0),
        speaker: typeof w.speaker === "number" ? w.speaker : undefined,
        punctuated_word: w.punctuated_word,
      })),
    }));

    // Identify detected speaker IDs
    const detectedSpeakerIds = new Set<number>();
    for (const w of words) {
      if (typeof w.speaker === "number") detectedSpeakerIds.add(w.speaker);
    }
    for (const u of utterances) {
      if (typeof u.speaker === "number") detectedSpeakerIds.add(u.speaker);
    }
    for (const p of paragraphs) {
      if (typeof p.speaker === "number") detectedSpeakerIds.add(p.speaker);
    }

    // Default speaker list: UNKNOWN roles
    const speakers: ISpeakerMapping[] = Array.from(detectedSpeakerIds)
      .sort((a, b) => a - b)
      .map((speakerId) => ({
        speakerId,
        role: "UNKNOWN" as const,
      }));

    logger.info(
      {
        fullTranscriptLength: fullTranscript.length,
        paragraphsCount: paragraphs.length,
        utterancesCount: utterances.length,
        wordsCount: words.length,
        detectedSpeakers: speakers.map((s) => s.speakerId),
      },
      "Deepgram transcription completed successfully"
    );

    return {
      provider: "DEEPGRAM",
      model,
      language,
      detectedLanguage,
      fullTranscript,
      confidence,
      audioDurationSeconds,
      paragraphs,
      utterances,
      words,
      speakers,
    };
  }

  /**
   * Transcribe audio directly from binary bytes (Buffer).
   * Preferred secure method: transfers audio directly to Deepgram without exposing signed Cloudinary URLs.
   */
  static async transcribeAudioBuffer(
    audioBuffer: Buffer,
    mimeType: string = "audio/mpeg"
  ): Promise<DeepgramTranscriptionOutput> {
    if (!audioBuffer || audioBuffer.length === 0) {
      throw new Error("Invalid audio buffer: Audio data is empty.");
    }

    const client = getDeepgramClient();
    const model = env.DEEPGRAM_MODEL || "nova-3";
    const language = env.DEEPGRAM_LANGUAGE || "multi";

    logger.info(
      { bufferLength: audioBuffer.length, mimeType, model, language },
      "Initiating Deepgram prerecorded transcription from secure binary buffer"
    );

    try {
      let response: any;
      if (typeof (client.listen?.v1?.media as any)?.transcribeFile === "function") {
        response = await (client.listen.v1.media as any).transcribeFile(
          audioBuffer,
          {
            model,
            language,
            smart_format: true,
            punctuate: true,
            paragraphs: true,
            utterances: true,
            diarize_model: "latest",
          }
        );
      } else if (typeof (client.listen?.v1?.media as any)?.transcribeUrl === "function") {
        throw new Error("Client does not support transcribeFile; fallback to transcribeUrl required.");
      } else {
        throw new Error("Deepgram transcribe methods unavailable on client");
      }

      return this.normalizeDeepgramResponse(response, model, language);
    } catch (err: any) {
      logger.error(
        { err: err?.message, bufferLength: audioBuffer.length },
        "Deepgram transcription from binary buffer failed"
      );

      if (err?.status === 429) {
        throw new Error("Deepgram rate limit reached. Please wait a moment before retrying.");
      }
      if (err?.status === 401 || err?.status === 403) {
        throw new Error("Deepgram authentication error. Check server DEEPGRAM_API_KEY configuration.");
      }

      throw new Error(`Deepgram transcription service error: ${err?.message || "Failed to process audio"}`);
    }
  }

  /**
   * Transcribe a prerecorded audio file using Deepgram Nova-3 multilingual model
   * with speaker diarization.
   */
  static async transcribeAudioUrl(audioUrl: string): Promise<DeepgramTranscriptionOutput> {
    this.validateAudioUrl(audioUrl);

    const client = getDeepgramClient();
    const model = env.DEEPGRAM_MODEL || "nova-3";
    const language = env.DEEPGRAM_LANGUAGE || "multi";

    const sanitizedUrl = sanitizeUrlForLogging(audioUrl);
    logger.info({ audioUrl: sanitizedUrl, model, language }, "Initiating Deepgram prerecorded transcription");

    try {
      // Call Deepgram Nova-3 API with official SDK
      const response = await client.listen.v1.media.transcribeUrl({
        url: audioUrl,
        model,
        language,
        smart_format: true,
        punctuate: true,
        paragraphs: true,
        utterances: true,
        diarize_model: "latest",
      });

      return this.normalizeDeepgramResponse(response, model, language);
    } catch (err: any) {
      const sanitizedErrUrl = sanitizeUrlForLogging(audioUrl);
      logger.error({ err: err?.message, audioUrl: sanitizedErrUrl }, "Deepgram transcription API call failed");

      if (err?.status === 429) {
        throw new Error("Deepgram rate limit reached. Please wait a moment before retrying.");
      }
      if (err?.status === 401 || err?.status === 403) {
        throw new Error("Deepgram authentication error. Check server DEEPGRAM_API_KEY configuration.");
      }
      if (err?.message?.includes("Invalid audio URL")) {
        throw err;
      }

      throw new Error(`Deepgram transcription service error: ${err?.message || "Failed to process audio"}`);
    }
  }
}
