import crypto from "crypto";
import mongoose from "mongoose";
import { Transcription, ITranscription, ISpeakerMapping, SpeakerRole } from "../models/Transcription.model";
import { ILead } from "../models/Lead.model";
import { DeepgramService } from "./deepgram.service";
import { callOpenRouter, stripInternalReasoning } from "./ai/openrouter.provider";
import { logAiAudit } from "./ai/ai-audit.service";
import { logger } from "../config/logger";
import { env } from "../config/env";
import { IAuthUser } from "../types/auth.types";

const STALE_JOB_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes
const MAX_AUTO_RETRIES = 3;
const WORKER_ID = `worker_${process.pid}_${crypto.randomBytes(4).toString("hex")}`;

export class TranscriptionJobService {
  private static workerInterval: NodeJS.Timeout | null = null;
  private static isProcessingLoopRunning = false;

  /**
   * Start the standalone background worker loop if not running in a serverless environment.
   */
  static startBackgroundWorker(): void {
    if (process.env.VERCEL) {
      logger.info("Vercel serverless environment detected: skipping standalone worker loop");
      return;
    }

    if (this.workerInterval) return;

    logger.info({ workerId: WORKER_ID }, "Starting standalone transcription queue worker loop");
    this.workerInterval = setInterval(() => {
      this.processNextPendingJob().catch((err) => {
        logger.error({ err }, "Error in background transcription worker loop");
      });
    }, 5000);
  }

  /**
   * Stop the background worker loop.
   */
  static stopBackgroundWorker(): void {
    if (this.workerInterval) {
      clearInterval(this.workerInterval);
      this.workerInterval = null;
    }
  }

  /**
   * Create a new transcription job or return an existing completed/in-progress job.
   */
  static async createOrGetJob(
    lead: ILead,
    user: IAuthUser,
    options: { force?: boolean } = {}
  ): Promise<{ job: ITranscription; isNew: boolean; alreadyCompleted: boolean }> {
    const audioMeta = lead.vigilanceDetails?.audio;
    if (!audioMeta || !audioMeta.url) {
      throw new Error("No call recording audio is attached to this lead.");
    }

    const recordingId = audioMeta.id || `aud_${lead._id.toString()}`;
    const audioUrl = audioMeta.url;

    // Validate audio constraints
    if (audioMeta.duration && audioMeta.duration > 120) {
      logger.warn({ leadId: lead._id, duration: audioMeta.duration }, "Audio duration exceeds recommended 2-minute constraint");
    }

    // 1. Check for existing completed transcription
    if (!options.force) {
      const existingCompleted = await Transcription.findOne({
        leadId: lead._id,
        recordingId,
        status: "COMPLETED",
      }).sort({ createdAt: -1 });

      if (existingCompleted) {
        return { job: existingCompleted, isNew: false, alreadyCompleted: true };
      }
    }

    // 2. Check for active (PENDING or PROCESSING) job to prevent duplicates
    const existingActive = await Transcription.findOne({
      leadId: lead._id,
      recordingId,
      status: { $in: ["PENDING", "PROCESSING"] },
    }).sort({ createdAt: -1 });

    if (existingActive) {
      // Check if job is stuck in PROCESSING beyond timeout
      const isStale =
        existingActive.status === "PROCESSING" &&
        existingActive.claimedAt &&
        Date.now() - new Date(existingActive.claimedAt).getTime() > STALE_JOB_TIMEOUT_MS;

      if (isStale) {
        logger.warn({ jobId: existingActive._id }, "Active transcription job timed out; resetting to PENDING");
        existingActive.status = "PENDING";
        existingActive.claimedAt = undefined;
        existingActive.claimedBy = undefined;
        await existingActive.save();
      }

      return { job: existingActive, isNew: false, alreadyCompleted: false };
    }

    // 3. Create new transcription job in PENDING state
    const requestedByObjectId = mongoose.Types.ObjectId.isValid(user.id)
      ? new mongoose.Types.ObjectId(user.id)
      : undefined;

    const newJob = await Transcription.create({
      leadId: lead._id,
      recordingId,
      audioUrl,
      status: "PENDING",
      provider: "DEEPGRAM",
      model: env.DEEPGRAM_MODEL || "nova-3",
      language: env.DEEPGRAM_LANGUAGE || "multi",
      requestedBy: requestedByObjectId,
      requestedByRole: user.role,
      retryCount: 0,
    });

    logger.info({ jobId: newJob._id, leadId: lead._id, recordingId }, "Created transcription job in PENDING state");

    // Asynchronously kick off processing without blocking
    setImmediate(() => {
      this.processJob(newJob._id.toString()).catch((err) => {
        logger.error({ err, jobId: newJob._id }, "Asynchronous job execution error");
      });
    });

    return { job: newJob, isNew: true, alreadyCompleted: false };
  }

  /**
   * Atomically claim a pending job and process it with Deepgram.
   */
  static async processJob(jobId: string): Promise<ITranscription | null> {
    const jobObjectId = mongoose.Types.ObjectId.isValid(jobId)
      ? new mongoose.Types.ObjectId(jobId)
      : null;
    if (!jobObjectId) return null;

    // Atomic claim: only update if status is PENDING or FAILED with retry count < max
    const claimedJob = await Transcription.findOneAndUpdate(
      {
        _id: jobObjectId,
        status: { $in: ["PENDING", "FAILED"] },
      },
      {
        $set: {
          status: "PROCESSING",
          processingStartedAt: new Date(),
          claimedAt: new Date(),
          claimedBy: WORKER_ID,
        },
      },
      { new: true }
    );

    if (!claimedJob) {
      // Job was already claimed or is completed
      return null;
    }

    logger.info({ jobId, workerId: WORKER_ID }, "Atomically claimed transcription job; calling Deepgram");

    try {
      // Perform Deepgram transcription
      const dgOutput = await DeepgramService.transcribeAudioUrl(claimedJob.audioUrl);

      // Preserve existing speaker mappings if any were previously assigned
      const existingMappings = claimedJob.speakerMappings || [];
      const mappingMap = new Map<number, SpeakerRole>();
      for (const m of existingMappings) {
        mappingMap.set(m.speakerId, m.role);
      }

      const mergedSpeakers = dgOutput.speakers.map((s) => ({
        speakerId: s.speakerId,
        role: mappingMap.get(s.speakerId) || ("UNKNOWN" as SpeakerRole),
      }));

      // Update job to COMPLETED
      claimedJob.status = "COMPLETED";
      claimedJob.fullTranscript = dgOutput.fullTranscript;
      claimedJob.confidence = dgOutput.confidence;
      claimedJob.audioDurationSeconds = dgOutput.audioDurationSeconds;
      claimedJob.paragraphs = dgOutput.paragraphs;
      claimedJob.utterances = dgOutput.utterances;
      claimedJob.words = dgOutput.words;
      claimedJob.speakers = mergedSpeakers;
      claimedJob.speakerMappings = mergedSpeakers;
      claimedJob.detectedLanguage = dgOutput.detectedLanguage;
      claimedJob.processingCompletedAt = new Date();
      claimedJob.failureReason = undefined;

      await claimedJob.save();

      logger.info({ jobId, transcriptLength: dgOutput.fullTranscript.length }, "Transcription job COMPLETED successfully");
      return claimedJob;
    } catch (err: any) {
      logger.error({ err: err?.message, jobId }, "Transcription job failed during Deepgram processing");

      claimedJob.status = "FAILED";
      claimedJob.failureReason = err?.message || "Transcription failed";
      claimedJob.retryCount = (claimedJob.retryCount || 0) + 1;
      claimedJob.claimedAt = undefined;
      claimedJob.claimedBy = undefined;

      await claimedJob.save();
      return claimedJob;
    }
  }

  /**
   * Process next pending job from the persistent MongoDB queue.
   */
  static async processNextPendingJob(): Promise<ITranscription | null> {
    if (this.isProcessingLoopRunning) return null;
    this.isProcessingLoopRunning = true;

    try {
      // Find oldest pending job or timed-out processing job
      const candidate = await Transcription.findOne({
        $or: [
          { status: "PENDING" },
          {
            status: "PROCESSING",
            claimedAt: { $lt: new Date(Date.now() - STALE_JOB_TIMEOUT_MS) },
          },
        ],
      }).sort({ createdAt: 1 });

      if (!candidate) {
        return null;
      }

      return await this.processJob(candidate._id.toString());
    } finally {
      this.isProcessingLoopRunning = false;
    }
  }

  /**
   * Retry a failed transcription job.
   */
  static async retryJob(leadId: string, user: IAuthUser): Promise<ITranscription> {
    const filterLeadId = mongoose.Types.ObjectId.isValid(leadId)
      ? new mongoose.Types.ObjectId(leadId)
      : leadId;

    const job = await Transcription.findOne({
      leadId: filterLeadId,
    }).sort({ createdAt: -1 });

    if (!job) {
      throw new Error("No transcription job found to retry for this lead.");
    }

    if (job.status === "PROCESSING") {
      throw new Error("Transcription is currently in progress. Please wait for it to complete.");
    }

    job.status = "PENDING";
    job.failureReason = undefined;
    job.claimedAt = undefined;
    job.claimedBy = undefined;
    job.retryCount = (job.retryCount || 0) + 1;
    await job.save();

    // Trigger processing
    setImmediate(() => {
      this.processJob(job._id.toString()).catch((err) => {
        logger.error({ err, jobId: job._id }, "Error processing retried transcription job");
      });
    });

    return job;
  }

  /**
   * Get transcription status and data for a lead.
   */
  static async getTranscriptionByLeadId(leadId: string): Promise<ITranscription | null> {
    const filterLeadId = mongoose.Types.ObjectId.isValid(leadId)
      ? new mongoose.Types.ObjectId(leadId)
      : leadId;

    return await Transcription.findOne({
      leadId: filterLeadId,
    }).sort({ createdAt: -1 });
  }

  /**
   * Update manual speaker mappings (Speaker 0 -> Agent, Speaker 1 -> Customer, etc.)
   */
  static async updateSpeakerMappings(
    leadId: string,
    mappings: Array<{ speakerId: number; role: SpeakerRole }>,
    user: IAuthUser
  ): Promise<ITranscription> {
    const filterLeadId = mongoose.Types.ObjectId.isValid(leadId)
      ? new mongoose.Types.ObjectId(leadId)
      : leadId;

    const transcription = await Transcription.findOne({
      leadId: filterLeadId,
      status: "COMPLETED",
    }).sort({ createdAt: -1 });

    if (!transcription) {
      throw new Error("No completed transcription found for this lead to update speaker mappings.");
    }

    // Validate roles
    const validRoles: SpeakerRole[] = ["AGENT", "CUSTOMER", "UNKNOWN"];
    const sanitizedMappings: ISpeakerMapping[] = mappings.map((m) => {
      if (!validRoles.includes(m.role)) {
        throw new Error(`Invalid speaker role: ${m.role}. Allowed: AGENT, CUSTOMER, UNKNOWN.`);
      }
      return {
        speakerId: Number(m.speakerId),
        role: m.role,
        assignedBy: `${user.name} (${user.role})`,
        assignedAt: new Date().toISOString(),
      };
    });

    transcription.speakerMappings = sanitizedMappings;
    transcription.speakers = sanitizedMappings;
    await transcription.save();

    logger.info({ leadId, mappings: sanitizedMappings }, "Updated speaker mappings for transcription");
    return transcription;
  }

  /**
   * OpenRouter post-transcription analysis: Analyzes completed verbatim transcript text.
   * Kept strictly separate from Deepgram transcription.
   */
  static async analyzeTranscriptWithOpenRouter(
    leadId: string,
    user: IAuthUser
  ): Promise<ITranscription> {
    const filterLeadId = mongoose.Types.ObjectId.isValid(leadId)
      ? new mongoose.Types.ObjectId(leadId)
      : leadId;

    const transcription = await Transcription.findOne({
      leadId: filterLeadId,
      status: "COMPLETED",
    }).sort({ createdAt: -1 });

    if (!transcription || !transcription.fullTranscript) {
      throw new Error("Cannot analyze call: A completed verbatim transcription is required first.");
    }

    const correlationId = crypto.randomUUID();

    // Map speaker turns with roles for clean dialogue context
    const speakerRoleMap = new Map<number, string>();
    for (const sm of transcription.speakerMappings || []) {
      speakerRoleMap.set(sm.speakerId, sm.role);
    }

    const formattedDialogue = (transcription.utterances || []).length > 0
      ? transcription.utterances
          .map((u) => {
            const role = typeof u.speaker === "number" ? speakerRoleMap.get(u.speaker) || `Speaker ${u.speaker}` : "Unknown";
            return `[${role}] (${u.start.toFixed(1)}s - ${u.end.toFixed(1)}s): ${u.transcript}`;
          })
          .join("\n")
      : transcription.fullTranscript;

    const systemPrompt = `You are the Expert Call Analyst for VA Nexus CRM.
Analyze the following authentic call transcript between an agent and a customer.
STRICT RULES:
- Do not fabricate or invent statements not present in the transcript.
- Distinctly identify:
  1. Customer objections
  2. Customer interest and purchase intent
  3. Agent communication quality
  4. Unanswered questions
  5. Commitments made by either party
  6. Call summary
  7. Suggested next actions
- Return ONLY valid JSON adhering strictly to the requested schema.`;

    const userPrompt = `Analyze this call recording transcript:

TRANSCRIPT:
${formattedDialogue}

Return JSON with exact structure:
{
  "summary": "Concise 2-3 paragraph summary of the call",
  "customerObjections": ["Objection 1", "Objection 2"],
  "customerInterestAndIntent": "Description of customer's interest level and purchase intent",
  "agentCommunicationQuality": "Assessment of agent's professionalism, clarity, and objection handling",
  "unansweredQuestions": ["Question 1", "Question 2"],
  "commitments": ["Commitment 1", "Commitment 2"],
  "suggestedNextActions": ["Next action 1", "Next action 2"],
  "callOutcome": "meeting_confirmed | follow_up_needed | rescheduled | inconclusive"
}`;

    try {
      const response = await callOpenRouter({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        correlationId,
        taskType: "call_transcript_analysis",
      });

      const cleaned = stripInternalReasoning(response.content);
      let parsed: any;
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error("Unable to parse AI analysis response as JSON.");
        }
      }

      transcription.aiAnalysis = {
        summary: parsed.summary || "Summary unavailable",
        customerObjections: Array.isArray(parsed.customerObjections) ? parsed.customerObjections : [],
        customerInterestAndIntent: parsed.customerInterestAndIntent || "",
        agentCommunicationQuality: parsed.agentCommunicationQuality || "",
        unansweredQuestions: Array.isArray(parsed.unansweredQuestions) ? parsed.unansweredQuestions : [],
        commitments: Array.isArray(parsed.commitments) ? parsed.commitments : [],
        suggestedNextActions: Array.isArray(parsed.suggestedNextActions) ? parsed.suggestedNextActions : [],
        callOutcome: parsed.callOutcome || "inconclusive",
        analyzedAt: new Date().toISOString(),
        analyzedModel: response.model,
      };

      await transcription.save();

      await logAiAudit({
        correlationId,
        userId: user.id,
        userRole: user.role,
        action: "call_transcript_analysis",
        taskType: "audio_transcription",
        model: response.model,
        resourceId: transcription._id.toString(),
        latencyMs: response.latencyMs,
        state: "success",
      });

      logger.info({ leadId, correlationId }, "OpenRouter call transcript analysis completed successfully");
      return transcription;
    } catch (err: any) {
      logger.error({ err: err?.message, leadId, correlationId }, "OpenRouter call transcript analysis failed");
      throw new Error(`AI Call Analysis failed: ${err?.message || "Unknown error"}`);
    }
  }
}
