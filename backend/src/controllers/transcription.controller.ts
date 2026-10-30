import { Request, Response, NextFunction } from "express";
import { LeadService } from "../services/lead.service";
import { TranscriptionJobService } from "../services/transcription-job.service";
import { ApiResponse } from "../utils/response";
import { logger } from "../config/logger";
import { SpeakerRole } from "../models/Transcription.model";

export class TranscriptionController {
  /**
   * Start or retrieve a transcription job for a lead's audio recording.
   * POST /api/transcription/leads/:id/start
   */
  static async startTranscription(req: Request, res: Response, next: NextFunction) {
    try {
      const leadId = req.params.id;
      const user = req.user!;
      const force = req.query.force === "true" || req.body?.force === true;

      // 1. Verify user permission to access this lead
      const lead = await LeadService.getLeadById(leadId, user);
      if (!lead) {
        return ApiResponse.notFound(res, "Lead not found");
      }

      // 2. Verify lead has attached audio recording
      const audioMeta = lead.vigilanceDetails?.audio;
      if (!audioMeta || !audioMeta.url) {
        return ApiResponse.badRequest(
          res,
          "No audio recording attached to this lead. Upload audio in Vigilance stage before requesting transcription."
        );
      }

      // 3. Create or get existing transcription job
      const { job, isNew, alreadyCompleted } = await TranscriptionJobService.createOrGetJob(
        lead,
        user,
        { force }
      );

      const message = alreadyCompleted
        ? "Existing completed transcription retrieved."
        : isNew
        ? "Transcription job queued successfully."
        : `Transcription job already ${job.status.toLowerCase()}.`;

      return ApiResponse.success(
        res,
        {
          jobId: job._id,
          status: job.status,
          alreadyCompleted,
          transcription: job,
        },
        message,
        isNew ? 202 : 200
      );
    } catch (err: any) {
      logger.error({ err: err?.message, leadId: req.params.id }, "Failed to start transcription");
      next(err);
    }
  }

  /**
   * Get current transcription status for a lead.
   * GET /api/transcription/leads/:id/status
   */
  static async getTranscriptionStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const leadId = req.params.id;
      const user = req.user!;

      const lead = await LeadService.getLeadById(leadId, user);
      if (!lead) {
        return ApiResponse.notFound(res, "Lead not found");
      }

      const job = await TranscriptionJobService.getTranscriptionByLeadId(leadId);
      if (!job) {
        return ApiResponse.notFound(
          res,
          "No transcription job found for this lead. You can start a new transcription."
        );
      }

      return ApiResponse.success(
        res,
        {
          jobId: job._id,
          status: job.status,
          failureReason: job.status === "FAILED" ? job.failureReason : undefined,
          retryCount: job.retryCount,
          processingStartedAt: job.processingStartedAt,
          processingCompletedAt: job.processingCompletedAt,
          confidence: job.confidence,
          detectedLanguage: job.detectedLanguage,
        },
        "Transcription status retrieved successfully."
      );
    } catch (err: any) {
      next(err);
    }
  }

  /**
   * Get full transcription result (including speaker mappings, utterances, words, AI insights).
   * GET /api/transcription/leads/:id
   */
  static async getTranscriptionResult(req: Request, res: Response, next: NextFunction) {
    try {
      const leadId = req.params.id;
      const user = req.user!;

      const lead = await LeadService.getLeadById(leadId, user);
      if (!lead) {
        return ApiResponse.notFound(res, "Lead not found");
      }

      const job = await TranscriptionJobService.getTranscriptionByLeadId(leadId);
      if (!job) {
        return ApiResponse.notFound(
          res,
          "No transcription found for this lead. You can start a new transcription."
        );
      }

      return ApiResponse.success(
        res,
        { transcription: job },
        "Transcription result retrieved successfully."
      );
    } catch (err: any) {
      next(err);
    }
  }

  /**
   * Retry a failed transcription job.
   * POST /api/transcription/leads/:id/retry
   */
  static async retryTranscription(req: Request, res: Response, next: NextFunction) {
    try {
      const leadId = req.params.id;
      const user = req.user!;

      const lead = await LeadService.getLeadById(leadId, user);
      if (!lead) {
        return ApiResponse.notFound(res, "Lead not found");
      }

      const retriedJob = await TranscriptionJobService.retryJob(leadId, user);

      return ApiResponse.success(
        res,
        {
          jobId: retriedJob._id,
          status: retriedJob.status,
          retryCount: retriedJob.retryCount,
        },
        "Transcription job has been re-queued for processing.",
        202
      );
    } catch (err: any) {
      next(err);
    }
  }

  /**
   * Update manual speaker mappings (e.g. Speaker 0 -> AGENT, Speaker 1 -> CUSTOMER).
   * PUT /api/transcription/leads/:id/speakers
   */
  static async updateSpeakerMappings(req: Request, res: Response, next: NextFunction) {
    try {
      const leadId = req.params.id;
      const user = req.user!;
      const { mappings } = req.body;

      if (!Array.isArray(mappings) || mappings.length === 0) {
        return ApiResponse.badRequest(res, "Invalid speaker mappings: Expected non-empty array of mappings.");
      }

      const lead = await LeadService.getLeadById(leadId, user);
      if (!lead) {
        return ApiResponse.notFound(res, "Lead not found");
      }

      const updated = await TranscriptionJobService.updateSpeakerMappings(
        leadId,
        mappings as Array<{ speakerId: number; role: SpeakerRole }>,
        user
      );

      return ApiResponse.success(
        res,
        {
          speakers: updated.speakers,
          speakerMappings: updated.speakerMappings,
        },
        "Speaker mappings updated successfully."
      );
    } catch (err: any) {
      next(err);
    }
  }

  /**
   * Run OpenRouter AI analysis on completed transcript.
   * POST /api/transcription/leads/:id/analyze
   */
  static async analyzeTranscript(req: Request, res: Response, next: NextFunction) {
    try {
      const leadId = req.params.id;
      const user = req.user!;

      const lead = await LeadService.getLeadById(leadId, user);
      if (!lead) {
        return ApiResponse.notFound(res, "Lead not found");
      }

      const analyzed = await TranscriptionJobService.analyzeTranscriptWithOpenRouter(leadId, user);

      return ApiResponse.success(
        res,
        {
          aiAnalysis: analyzed.aiAnalysis,
        },
        "AI call analysis completed successfully."
      );
    } catch (err: any) {
      next(err);
    }
  }
}
