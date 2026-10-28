import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { LeadService } from "../services/lead.service";
import { LeadIntelligenceService } from "../services/ai/lead-intelligence.service";
import { CommandCenterService } from "../services/ai/command-center.service";
import { SalesCopilotService } from "../services/ai/sales-copilot.service";
import { VigilanceCopilotService } from "../services/ai/vigilance-copilot.service";
import { SupportCopilotService } from "../services/ai/support-copilot.service";
import { AudioIntelligenceService } from "../services/ai/audio-intelligence.service";
import { AiAuditLog } from "../models/AiAuditLog.model";
import { ApiResponse } from "../utils/response";
import { env } from "../config/env";
import { isGeminiConfigured } from "../config/gemini";
import { isOpenRouterConfigured } from "../config/openrouter";
import { logger } from "../config/logger";

const queryCommandCenterValidator = z.object({
  question: z
    .string()
    .min(2, "Question must be at least 2 characters")
    .max(1000, "Question cannot exceed 1000 characters")
    .trim(),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "model", "assistant"]),
        content: z.string().max(4000),
      })
    )
    .optional(),
});

export class AiController {
  /**
   * Health & Status for AI subsystem (Never reveals secrets)
   */
  static async aiHealth(req: Request, res: Response, next: NextFunction) {
    try {
      const configured = isGeminiConfigured();
      const openRouterConfigured = isOpenRouterConfigured();
      return ApiResponse.success(
        res,
        {
          aiFeaturesEnabled: env.AI_FEATURES_ENABLED,
          isOpenRouterConfigured: openRouterConfigured,
          openRouterModel: env.OPENROUTER_MODEL,
          isGeminiConfigured: configured,
          activeModel: env.OPENROUTER_MODEL || env.GEMINI_MODEL,
          geminiModel: env.GEMINI_MODEL,
          embeddingModel: env.GEMINI_EMBEDDING_MODEL,
          maxRetries: env.GEMINI_MAX_RETRIES,
          timeoutMs: env.GEMINI_TIMEOUT_MS,
          monthlyBudgetUSD: env.AI_MONTHLY_BUDGET_USD,
        },
        "AI service status retrieved successfully."
      );
    } catch (err) {
      next(err);
    }
  }

  /**
   * Lead Intelligence Scoring & Analysis
   */
  static async getLeadIntelligence(req: Request, res: Response, next: NextFunction) {
    try {
      const lead = await LeadService.getLeadById(req.params.id, req.user!);
      const analysis = await LeadIntelligenceService.analyzeLead(lead, req.user!);
      return ApiResponse.success(res, { analysis }, "Lead intelligence analysis completed.");
    } catch (err) {
      next(err);
    }
  }

  /**
   * AI Command Center Query
   */
  static async queryCommandCenter(req: Request, res: Response, next: NextFunction) {
    try {
      const { question, history } = queryCommandCenterValidator.parse(req.body);
      const answer = await CommandCenterService.answer({
        question,
        history,
        user: req.user!,
      });
      return ApiResponse.success(res, answer, "Command Center query processed.");
    } catch (err) {
      next(err);
    }
  }

  /**
   * Sales Copilot Generation
   */
  static async getSalesCopilot(req: Request, res: Response, next: NextFunction) {
    try {
      const lead = await LeadService.getLeadById(req.params.id, req.user!);
      const copilot = await SalesCopilotService.generateForLead(lead, req.user!);
      return ApiResponse.success(res, { copilot }, "Sales copilot generated successfully.");
    } catch (err) {
      next(err);
    }
  }

  /**
   * Vigilance Copilot Evaluation
   */
  static async getVigilanceCopilot(req: Request, res: Response, next: NextFunction) {
    try {
      const lead = await LeadService.getLeadById(req.params.id, req.user!);
      const copilot = await VigilanceCopilotService.evaluate(lead, req.user!);
      return ApiResponse.success(res, { copilot }, "Vigilance copilot evaluation completed.");
    } catch (err) {
      next(err);
    }
  }

  /**
   * Support Copilot Evaluation
   */
  static async getSupportCopilot(req: Request, res: Response, next: NextFunction) {
    try {
      const lead = await LeadService.getLeadById(req.params.id, req.user!);
      const copilot = await SupportCopilotService.evaluate(lead, req.user!);
      return ApiResponse.success(res, { copilot }, "Support copilot evaluation completed.");
    } catch (err) {
      next(err);
    }
  }

  /**
   * Audio Transcription & Dialogue Intelligence
   */
  static async transcribeLeadAudio(req: Request, res: Response, next: NextFunction) {
    try {
      const lead = await LeadService.getLeadById(req.params.id, req.user!);
      const force = req.query.force === "true" || req.body?.force === true;
      const result = await AudioIntelligenceService.transcribeLeadAudio(lead, req.user!, {
        force,
      });
      return ApiResponse.success(res, { transcription: result }, "Audio transcription completed.");
    } catch (err) {
      next(err);
    }
  }

  /**
   * Get Cached Audio Transcription
   */
  static async getLeadAudioTranscription(req: Request, res: Response, next: NextFunction) {
    try {
      const lead = await LeadService.getLeadById(req.params.id, req.user!);
      const cached = await AudioIntelligenceService.getCachedTranscription(lead.id);
      if (!cached) {
        return ApiResponse.notFound(
          res,
          "No completed transcription found for this lead. You can trigger a new transcription."
        );
      }
      return ApiResponse.success(
        res,
        { transcription: cached },
        "Cached audio transcription retrieved."
      );
    } catch (err) {
      next(err);
    }
  }

  /**
   * AI Audit Logs (ADMIN only)
   */
  static async getAuditLogs(req: Request, res: Response, next: NextFunction) {
    try {
      const page = parseInt(req.query.page as string, 10) || 1;
      const limit = Math.min(100, parseInt(req.query.limit as string, 10) || 20);
      const skip = (page - 1) * limit;

      const [logs, total] = await Promise.all([
        AiAuditLog.find()
          .populate("userId", "name email role department")
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        AiAuditLog.countDocuments(),
      ]);

      return ApiResponse.success(
        res,
        {
          data: logs,
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit) || 1,
        },
        "AI audit logs retrieved successfully."
      );
    } catch (err) {
      next(err);
    }
  }
}
