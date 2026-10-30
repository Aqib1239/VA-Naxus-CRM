import crypto from "crypto";
import mongoose from "mongoose";
import { z } from "zod";
import { ILead } from "../../models/Lead.model";
import { AiAnalysis } from "../../models/AiAnalysis.model";
import { Transcription, ITranscription } from "../../models/Transcription.model";
import { TranscriptionJobService } from "../transcription-job.service";
import { DeepgramService } from "../deepgram.service";
import { callOpenRouter, stripInternalReasoning } from "./openrouter.provider";
import { logAiAudit } from "./ai-audit.service";
import { openRouterEnv, isOpenRouterConfigured } from "../../config/openrouter";
import { isDeepgramConfigured } from "../../config/deepgram";
import { IAuthUser } from "../../types/auth.types";
import { logger } from "../../config/logger";

export const AudioIntelligenceSchema = z.object({
  transcription: z.string().min(1),
  speakerSegments: z.array(
    z.object({
      speaker: z.string(),
      text: z.string(),
      timestamp: z.string().optional(),
    })
  ),
  summary: z.string().max(2000),
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
  calculationMethod: z.string().default("deepgram_nova3"),
  analysisTimestamp: z.string(),
  disclaimer: z.string(),
});

export type AudioIntelligenceResult = z.infer<typeof AudioIntelligenceSchema>;

export class AudioIntelligenceService {
  /**
   * Helper to format a completed Transcription record into an AudioIntelligenceResult
   */
  private static formatResultFromJob(job: ITranscription): AudioIntelligenceResult {
    const speakerSegments = (job.utterances || []).map((u) => {
      const startMin = Math.floor(u.start / 60);
      const startSec = Math.floor(u.start % 60);
      const timeStr = `${String(startMin).padStart(2, "0")}:${String(startSec).padStart(2, "0")}`;
      return {
        speaker: typeof u.speaker === "number" ? `Speaker ${u.speaker}` : "Unknown",
        text: u.transcript,
        timestamp: timeStr,
      };
    });

    const ai = job.aiAnalysis;
    const validOutcomes = ["meeting_confirmed", "follow_up_needed", "rescheduled", "inconclusive"];
    const outcome = validOutcomes.includes(ai?.callOutcome || "")
      ? (ai?.callOutcome as "meeting_confirmed" | "follow_up_needed" | "rescheduled" | "inconclusive")
      : "inconclusive";

    return {
      transcription: job.fullTranscript || "",
      speakerSegments,
      summary: ai?.summary || "Audio recording transcribed successfully via Deepgram Nova-3.",
      customerRequirements: ai?.customerInterestAndIntent ? [ai.customerInterestAndIntent] : [],
      objections: ai?.customerObjections || [],
      commitments: ai?.commitments || [],
      nextSteps: ai?.suggestedNextActions || [],
      callOutcome: outcome,
      uncertainPassages: [],
      audioDurationSeconds: job.audioDurationSeconds || 0,
      calculationMethod: "deepgram_nova3",
      analysisTimestamp: job.processingCompletedAt?.toISOString() || new Date().toISOString(),
      disclaimer: "Speech transcription powered by Deepgram Nova-3 and OpenRouter in VA Nexus.",
    };
  }

  /**
   * Transcribe and analyze audio recording using Deepgram Nova-3 + OpenRouter
   */
  static async transcribeLeadAudio(
    lead: ILead,
    user: IAuthUser,
    options: { force?: boolean } = {}
  ): Promise<AudioIntelligenceResult> {
    const correlationId = crypto.randomUUID();

    const audioMeta = lead.vigilanceDetails?.audio;
    if (!audioMeta || !audioMeta.url) {
      throw new Error("No call recording audio is attached to this lead.");
    }

    // 1. Check for existing cached completed job in Transcription collection
    if (!options.force) {
      const existingJob = await Transcription.findOne({
        leadId: lead._id,
        status: "COMPLETED",
      }).sort({ createdAt: -1 });

      if (existingJob && existingJob.fullTranscript) {
        return this.formatResultFromJob(existingJob);
      }
    }

    // 2. Run Deepgram transcription directly or through job worker
    const { job, alreadyCompleted } = await TranscriptionJobService.createOrGetJob(lead, user, options);

    let completedJob: ITranscription | null = job;
    if (!alreadyCompleted || job.status !== "COMPLETED") {
      // Process synchronously if not completed yet
      completedJob = await TranscriptionJobService.processJob(job._id.toString());
      if (!completedJob || completedJob.status !== "COMPLETED") {
        throw new Error(
          completedJob?.failureReason ||
            "Call recording transcription is processing in background. Please check status in a moment."
        );
      }
    }

    // 3. If AI insights analysis is not yet done and OpenRouter is configured, trigger OpenRouter analysis
    if (!completedJob.aiAnalysis && isOpenRouterConfigured() && openRouterEnv.AI_FEATURES_ENABLED) {
      try {
        completedJob = await TranscriptionJobService.analyzeTranscriptWithOpenRouter(lead._id.toString(), user);
      } catch (err: any) {
        logger.warn({ err: err?.message, leadId: lead._id }, "OpenRouter call analysis skipped during audio transcription");
      }
    }

    const result = this.formatResultFromJob(completedJob);

    // Also persist into AiAnalysis collection for backward compatibility
    const requestedByObjectId = mongoose.Types.ObjectId.isValid(user.id)
      ? new mongoose.Types.ObjectId(user.id)
      : new mongoose.Types.ObjectId("000000000000000000000000");

    await AiAnalysis.create({
      sourceRecordId: lead._id,
      sourceModel: "Lead",
      taskType: "audio_transcription",
      aiModel: "deepgram-nova-3",
      correlationId,
      state: "completed",
      result: result as unknown as Record<string, unknown>,
      requestedBy: requestedByObjectId,
      requestedByRole: user.role,
      expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    });

    await logAiAudit({
      correlationId,
      userId: user.id,
      userRole: user.role,
      action: "audio_transcription",
      taskType: "audio_transcription",
      model: "deepgram-nova-3",
      resourceId: lead._id.toString(),
      state: "success",
    });

    return result;
  }

  /**
   * Retrieve cached transcription if already completed
   */
  static async getCachedTranscription(leadId: string): Promise<AudioIntelligenceResult | null> {
    const filterId = mongoose.Types.ObjectId.isValid(leadId)
      ? new mongoose.Types.ObjectId(leadId)
      : leadId;

    const existingJob = await Transcription.findOne({
      leadId: filterId,
      status: "COMPLETED",
    }).sort({ createdAt: -1 });

    if (existingJob && existingJob.fullTranscript) {
      return this.formatResultFromJob(existingJob);
    }

    const existingAnalysis = await AiAnalysis.findOne({
      sourceRecordId: filterId,
      taskType: "audio_transcription",
      state: "completed",
    }).sort({ createdAt: -1 });

    if (existingAnalysis && existingAnalysis.result) {
      return existingAnalysis.result as unknown as AudioIntelligenceResult;
    }

    return null;
  }
}
