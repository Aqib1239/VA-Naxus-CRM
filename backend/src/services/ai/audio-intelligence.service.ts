import crypto from "crypto";
import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import { z } from "zod";
import { ILead } from "../../models/Lead.model";
import { AiAnalysis } from "../../models/AiAnalysis.model";
import { callGemini, parseGeminiJson } from "./gemini.provider";
import { logAiAudit } from "./ai-audit.service";
import { geminiEnv, isGeminiConfigured, GeminiConfigError } from "../../config/gemini";
import { IAuthUser } from "../../types/auth.types";
import { logger } from "../../config/logger";
import { env } from "../../config/env";

export const AudioIntelligenceSchema = z.object({
  transcription: z.string().min(1),
  speakerSegments: z.array(
    z.object({
      speaker: z.string(),
      text: z.string(),
      timestamp: z.string().optional(),
    })
  ),
  summary: z.string().max(1200),
  customerRequirements: z.array(z.string()),
  objections: z.array(z.string()),
  commitments: z.array(z.string()),
  nextSteps: z.array(z.string()),
  callOutcome: z.enum([
    "meeting_confirmed",
    "follow_up_needed",
    "rescheduled",
    "inconclusive",
  ]),
  uncertainPassages: z.array(z.string()),
  audioDurationSeconds: z.number().optional(),
  calculationMethod: z.literal("gemini_multimodal_audio"),
  analysisTimestamp: z.string(),
  disclaimer: z.string(),
});

export type AudioIntelligenceResult = z.infer<typeof AudioIntelligenceSchema>;

export class AudioIntelligenceService {
  /**
   * Helper to retrieve audio as base64 string from Cloudinary CDN or local filesystem
   */
  private static async getAudioBase64AndMime(lead: ILead): Promise<{
    data: string;
    mimeType: string;
    fileSize: number;
  }> {
    const audioMeta = lead.vigilanceDetails?.audio;
    if (!audioMeta || !audioMeta.url) {
      throw new Error("No call recording audio is attached to this lead.");
    }

    const mimeType = audioMeta.mimeType || "audio/mpeg";

    // Case 1: Remote Cloudinary or HTTPS URL
    if (audioMeta.url.startsWith("http://") || audioMeta.url.startsWith("https://")) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 25000);

      try {
        const res = await fetch(audioMeta.url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!res.ok) {
          throw new Error(`Failed to fetch audio from storage provider (HTTP ${res.status}).`);
        }

        const arrayBuffer = await res.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        if (buffer.length > env.MAX_AUDIO_FILE_SIZE) {
          throw new Error(
            `Audio file size (${(buffer.length / 1024 / 1024).toFixed(1)}MB) exceeds maximum permitted limit (${(env.MAX_AUDIO_FILE_SIZE / 1024 / 1024).toFixed(0)}MB).`
          );
        }

        return {
          data: buffer.toString("base64"),
          mimeType,
          fileSize: buffer.length,
        };
      } catch (fetchErr: any) {
        clearTimeout(timeoutId);
        logger.error({ err: fetchErr?.message, url: audioMeta.url }, "Audio CDN fetch failed");
        throw new Error(`Unable to download audio for transcription: ${fetchErr?.message}`);
      }
    }

    // Case 2: Local file fallback
    const possiblePaths = [
      audioMeta.storagePath,
      path.join(process.cwd(), audioMeta.storagePath),
      path.join(process.cwd(), "uploads", audioMeta.fileName),
      path.join(process.cwd(), "..", "public", "audio", audioMeta.fileName),
    ];

    for (const p of possiblePaths) {
      if (p && fs.existsSync(p)) {
        const stats = fs.statSync(p);
        if (stats.size > env.MAX_AUDIO_FILE_SIZE) {
          throw new Error(`Audio file exceeds limit.`);
        }
        const buffer = fs.readFileSync(p);
        return {
          data: buffer.toString("base64"),
          mimeType,
          fileSize: stats.size,
        };
      }
    }

    throw new Error(
      `Audio recording file could not be located on CDN or local disk (${audioMeta.fileName}).`
    );
  }

  /**
   * Transcribe and analyze audio recording using Gemini multimodal input
   */
  static async transcribeLeadAudio(
    lead: ILead,
    user: IAuthUser,
    options: { force?: boolean } = {}
  ): Promise<AudioIntelligenceResult> {
    const correlationId = crypto.randomUUID();

    // Idempotent caching: check if recent completed transcription exists
    if (!options.force) {
      const existing = await AiAnalysis.findOne({
        sourceRecordId: lead._id,
        taskType: "audio_transcription",
        state: "completed",
      }).sort({ createdAt: -1 });

      if (existing && existing.result) {
        return existing.result as unknown as AudioIntelligenceResult;
      }
    }

    if (!isGeminiConfigured() || !geminiEnv.AI_FEATURES_ENABLED) {
      throw new GeminiConfigError(
        "Gemini AI is not configured on the server. Please configure GEMINI_API_KEY in the server environment to transcribe call audio."
      );
    }

    const requestedByObjectId = mongoose.Types.ObjectId.isValid(user.id)
      ? new mongoose.Types.ObjectId(user.id)
      : new mongoose.Types.ObjectId("000000000000000000000000");

    const analysisRecord = await AiAnalysis.create({
      sourceRecordId: lead._id,
      sourceModel: "Lead",
      taskType: "audio_transcription",
      aiModel: geminiEnv.GEMINI_MODEL,
      correlationId,
      state: "processing",
      requestedBy: requestedByObjectId,
      requestedByRole: user.role,
      expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days
    });

    try {
      // 1. Fetch audio payload
      const audioPayload = await this.getAudioBase64AndMime(lead);

      // 2. Prepare multimodal prompt
      const systemInstruction = `You are the Audio & Speech Intelligence engine for VA Nexus (Venture Automation Nexus).
You analyze genuine voice recordings of customer qualification and vigilance verification calls.
Strict Transcription & Analysis Rules:
- Provide an accurate transcription with speaker diarization (e.g. Officer vs Customer).
- Clearly timestamp speaker turns if audible.
- If words or phrases are inaudible, label them as '[inaudible]' or '[uncertain]' and include in 'uncertainPassages'. Never fabricate words or conversation.
- Extract customer requirements, stated objections, commitments, and the primary call outcome.
- Return ONLY valid JSON adhering strictly to the required schema.`;

      const prompt = `Please transcribe this call recording for Lead ${lead.leadCode} (${lead.name}) and extract structured conversation intelligence.

Return JSON with exact schema:
{
  "transcription": "string (full text dialogue)",
  "speakerSegments": [
    { "speaker": "string", "text": "string", "timestamp": "string" }
  ],
  "summary": "string (concise 2-3 paragraph summary)",
  "customerRequirements": ["string"],
  "objections": ["string"],
  "commitments": ["string"],
  "nextSteps": ["string"],
  "callOutcome": "meeting_confirmed" | "follow_up_needed" | "rescheduled" | "inconclusive",
  "uncertainPassages": ["string"],
  "audioDurationSeconds": number,
  "calculationMethod": "gemini_multimodal_audio",
  "analysisTimestamp": "${new Date().toISOString()}",
  "disclaimer": "AI-generated transcription from call recording in VA Nexus. Review alongside original audio."
}`;

      // 3. Multimodal call to Gemini
      const response = await callGemini({
        prompt,
        audioData: {
          mimeType: audioPayload.mimeType,
          data: audioPayload.data,
        },
        systemInstruction,
        correlationId,
        taskType: "audio_transcription",
      });

      const parsed = parseGeminiJson<unknown>(response.text, correlationId);
      const validated = AudioIntelligenceSchema.parse(parsed);

      await AiAnalysis.findByIdAndUpdate(analysisRecord._id, {
        state: "completed",
        result: validated as Record<string, unknown>,
        latencyMs: response.latencyMs,
      });

      await logAiAudit({
        correlationId,
        userId: user.id,
        userRole: user.role,
        action: "audio_transcription",
        taskType: "audio_transcription",
        model: response.model,
        resourceId: lead._id.toString(),
        latencyMs: response.latencyMs,
        state: "success",
      });

      return validated;
    } catch (err: any) {
      logger.error(
        { err: err?.message, correlationId, leadId: lead._id },
        "Gemini audio transcription failed"
      );

      await AiAnalysis.findByIdAndUpdate(analysisRecord._id, {
        state: "failed",
        error: { message: err?.message || "Audio processing failed", code: err?.name },
      });

      await logAiAudit({
        correlationId,
        userId: user.id,
        userRole: user.role,
        action: "audio_transcription_error",
        taskType: "audio_transcription",
        model: geminiEnv.GEMINI_MODEL,
        resourceId: lead._id.toString(),
        state: "failure",
        errorCode: err?.name,
      });

      throw new Error(
        err?.message ||
          "Failed to transcribe audio recording with Gemini AI. Please verify the audio file and server configuration, then try again."
      );
    }
  }

  /**
   * Retrieve cached transcription if already completed
   */
  static async getCachedTranscription(leadId: string): Promise<AudioIntelligenceResult | null> {
    const filterId = mongoose.Types.ObjectId.isValid(leadId)
      ? new mongoose.Types.ObjectId(leadId)
      : leadId;
    const existing = await AiAnalysis.findOne({
      sourceRecordId: filterId,
      taskType: "audio_transcription",
      state: "completed",
    }).sort({ createdAt: -1 });

    if (existing && existing.result) {
      return existing.result as unknown as AudioIntelligenceResult;
    }
    return null;
  }
}
