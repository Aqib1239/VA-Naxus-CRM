import crypto from "crypto";
import mongoose from "mongoose";
import { z } from "zod";
import { ILead } from "../../models/Lead.model";
import { AiAnalysis } from "../../models/AiAnalysis.model";
import { callGemini, parseGeminiJson } from "./gemini.provider";
import { logAiAudit } from "./ai-audit.service";
import { logger } from "../../config/logger";
import { geminiEnv, isGeminiConfigured } from "../../config/gemini";
import { IAuthUser } from "../../types/auth.types";
import { DEPARTMENTS, LEAD_STATUS } from "../../constants/departments";

export const LeadIntelligenceSchema = z.object({
  priorityScore: z.number().min(0).max(100),
  scoreCategory: z.enum(["hot", "warm", "cold", "stalled"]),
  scoringFactors: z.array(
    z.object({
      factor: z.string(),
      impact: z.enum(["positive", "negative", "neutral"]),
      detail: z.string(),
    })
  ),
  qualificationSummary: z.string().max(800),
  missingFields: z.array(z.string()),
  nextBestActions: z
    .array(
      z.object({
        action: z.string(),
        rationale: z.string(),
        urgency: z.enum(["high", "medium", "low"]),
      })
    )
    .max(6),
  inactivityDays: z.number().nullable(),
  inactivityRisk: z.enum(["high", "medium", "low", "none"]),
  calculationMethod: z.enum(["gemini_synthesized", "deterministic_heuristic"]),
  analysisTimestamp: z.string(),
  disclaimer: z.string(),
});

export type LeadIntelligenceResult = z.infer<typeof LeadIntelligenceSchema>;

export class LeadIntelligenceService {
  /**
   * Deterministic heuristic scoring baseline based on CRM business rules
   */
  public static calculateDeterministicBaseline(lead: ILead): LeadIntelligenceResult {
    const now = new Date();
    const createdDate = new Date(lead.createdAt || now);
    const updatedDate = new Date(lead.updatedAt || now);
    const inactivityDays = Math.max(
      0,
      Math.floor((now.getTime() - updatedDate.getTime()) / (1000 * 60 * 60 * 24))
    );

    let score = 50;
    const factors: Array<{
      factor: string;
      impact: "positive" | "negative" | "neutral";
      detail: string;
    }> = [];
    const missingFields: string[] = [];
    const nextBestActions: Array<{
      action: string;
      rationale: string;
      urgency: "high" | "medium" | "low";
    }> = [];

    // Stage progress factor
    switch (lead.currentDepartment) {
      case DEPARTMENTS.SALES:
        score += 25;
        factors.push({
          factor: "Advanced Sales Stage",
          impact: "positive",
          detail: "Lead cleared Vigilance and Support verification, ready for closing.",
        });
        break;
      case DEPARTMENTS.SUPPORT:
        score += 15;
        factors.push({
          factor: "Support Checklist Stage",
          impact: "positive",
          detail: "Vigilance audit complete; undergoing final 3-point check.",
        });
        break;
      case DEPARTMENTS.VIGILANCE:
        score += 10;
        factors.push({
          factor: "Vigilance Audit Stage",
          impact: "neutral",
          detail: "Pending audio verification and compliance review.",
        });
        break;
      case DEPARTMENTS.COMMUNICATION:
        score += 5;
        factors.push({
          factor: "Initial Contact Stage",
          impact: "neutral",
          detail: "Awaiting meeting schedule with client.",
        });
        break;
      case DEPARTMENTS.CLAIMED:
        score += 35;
        factors.push({
          factor: "Claimed Lead",
          impact: "positive",
          detail: "Lead successfully acquired by Sales.",
        });
        break;
      default:
        break;
    }

    // Audio check
    if (lead.vigilanceDetails?.audio?.url) {
      score += 15;
      factors.push({
        factor: "Audio Recording Present",
        impact: "positive",
        detail: "Verification call audio attached and valid.",
      });
    } else if (
      lead.currentDepartment === DEPARTMENTS.VIGILANCE ||
      lead.currentDepartment === DEPARTMENTS.SUPPORT ||
      lead.currentDepartment === DEPARTMENTS.SALES
    ) {
      score -= 20;
      factors.push({
        factor: "Missing Required Audio",
        impact: "negative",
        detail: "Mandatory call audio recording is missing for this stage.",
      });
      missingFields.push("vigilanceDetails.audio");
      nextBestActions.push({
        action: "Upload Verification Audio",
        rationale: "Required before lead can progress through Vigilance & Support.",
        urgency: "high",
      });
    }

    // Field completeness
    if (!lead.contactNumber) {
      missingFields.push("contactNumber");
      score -= 25;
    }
    if (!lead.postalAddress) {
      missingFields.push("postalAddress");
      score -= 5;
    }
    if (!lead.date || !lead.time) {
      missingFields.push("scheduledDate/Time");
      if (lead.currentDepartment === DEPARTMENTS.COMMUNICATION) {
        nextBestActions.push({
          action: "Schedule Customer Meeting",
          rationale: "Lead needs confirmed appointment date and time slot.",
          urgency: "high",
        });
      }
    }

    // Inactivity penalty
    let inactivityRisk: "high" | "medium" | "low" | "none" = "none";
    if (inactivityDays >= 7) {
      score -= 25;
      inactivityRisk = "high";
      factors.push({
        factor: "Prolonged Inactivity",
        impact: "negative",
        detail: `Lead has had no recorded workflow activity for ${inactivityDays} days.`,
      });
      nextBestActions.push({
        action: "Re-engage Prospect Promptly",
        rationale: "High risk of lead going cold due to 7+ days of inactivity.",
        urgency: "high",
      });
    } else if (inactivityDays >= 3) {
      score -= 10;
      inactivityRisk = "medium";
      factors.push({
        factor: "Moderate Inactivity",
        impact: "negative",
        detail: `No updates for ${inactivityDays} days. Follow-up recommended.`,
      });
      nextBestActions.push({
        action: "Follow Up with Client",
        rationale: "Keep momentum going across department transitions.",
        urgency: "medium",
      });
    } else {
      factors.push({
        factor: "Recent Activity",
        impact: "positive",
        detail: "Lead has active updates within the last 48 hours.",
      });
      inactivityRisk = "low";
    }

    // Clamp score
    const priorityScore = Math.max(0, Math.min(100, Math.round(score)));

    let scoreCategory: "hot" | "warm" | "cold" | "stalled" = "warm";
    if (inactivityDays >= 7) scoreCategory = "stalled";
    else if (priorityScore >= 75) scoreCategory = "hot";
    else if (priorityScore >= 45) scoreCategory = "warm";
    else scoreCategory = "cold";

    if (nextBestActions.length === 0) {
      nextBestActions.push({
        action: "Review Lead Status in Queue",
        rationale: "Ensure all requirements for current stage are completed.",
        urgency: "low",
      });
    }

    return {
      priorityScore,
      scoreCategory,
      scoringFactors: factors,
      qualificationSummary: `Lead ${lead.leadCode} (${lead.name}) is currently in the ${lead.currentDepartment} queue with status '${lead.status}'. Evaluated with ${factors.length} contributing factors.`,
      missingFields,
      nextBestActions,
      inactivityDays,
      inactivityRisk,
      calculationMethod: "deterministic_heuristic",
      analysisTimestamp: now.toISOString(),
      disclaimer: "Heuristic baseline score based on documented CRM business rules.",
    };
  }

  /**
   * Main analysis method with Gemini synthesis and automatic fallback
   */
  static async analyzeLead(lead: ILead, user: IAuthUser): Promise<LeadIntelligenceResult> {
    const correlationId = crypto.randomUUID();
    const baseline = this.calculateDeterministicBaseline(lead);

    // If Gemini is not configured, safely return deterministic baseline
    if (!isGeminiConfigured() || !geminiEnv.AI_FEATURES_ENABLED) {
      return baseline;
    }

    const requestedByObjectId = mongoose.Types.ObjectId.isValid(user.id)
      ? new mongoose.Types.ObjectId(user.id)
      : new mongoose.Types.ObjectId("000000000000000000000000");

    const analysisRecord = await AiAnalysis.create({
      sourceRecordId: lead._id,
      sourceModel: "Lead",
      taskType: "lead_intelligence",
      aiModel: geminiEnv.GEMINI_MODEL,
      correlationId,
      state: "processing",
      requestedBy: requestedByObjectId,
      requestedByRole: user.role,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    try {
      const sanitizedContext = {
        leadCode: lead.leadCode,
        stage: lead.currentDepartment,
        status: lead.status,
        city: lead.city,
        state: lead.state,
        hasContact: Boolean(lead.contactNumber),
        hasAddress: Boolean(lead.postalAddress),
        hasScheduledMeeting: Boolean(lead.date && lead.time),
        meetingDate: lead.date,
        meetingTime: lead.time,
        hasAudioAttached: Boolean(lead.vigilanceDetails?.audio),
        supportVerification: lead.supportDetails?.verification || null,
        salesAudioListened: lead.salesDetails?.audioListenCompleted || false,
        workflowHistoryCount: lead.workflowHistory?.length || 0,
        inactivityDays: baseline.inactivityDays,
        heuristicBaselineScore: baseline.priorityScore,
      };

      const systemInstruction = `You are the Lead Intelligence Engine for VA Nexus (Venture Automation Nexus - Connect. Automate. Accelerate.).
Evaluate CRM lead readiness, priority (0-100), missing fields, and actionable next steps.
Rules:
- Respect the strict sequential pipeline: Marketing -> Communication -> Vigilance -> Support -> Sales -> Claimed.
- Never invent facts, contact numbers, or claims not present in the CRM context.
- Return ONLY valid JSON adhering to the required schema.`;

      const prompt = `Analyze this lead and refine the intelligence report.
CRM Context:
${JSON.stringify(sanitizedContext, null, 2)}

Return JSON with exact schema:
{
  "priorityScore": number (0 to 100),
  "scoreCategory": "hot" | "warm" | "cold" | "stalled",
  "scoringFactors": [
    { "factor": string, "impact": "positive" | "negative" | "neutral", "detail": string }
  ],
  "qualificationSummary": string (max 500 chars),
  "missingFields": string[],
  "nextBestActions": [
    { "action": string, "rationale": string, "urgency": "high" | "medium" | "low" }
  ],
  "inactivityDays": number or null,
  "inactivityRisk": "high" | "medium" | "low" | "none",
  "calculationMethod": "gemini_synthesized",
  "analysisTimestamp": "${new Date().toISOString()}",
  "disclaimer": "AI-generated synthesis. Authorized user verification is recommended before taking consequential actions."
}`;

      const response = await callGemini({
        prompt,
        systemInstruction,
        correlationId,
        taskType: "lead_intelligence",
      });

      const parsed = parseGeminiJson<unknown>(response.text, correlationId);
      const validated = LeadIntelligenceSchema.parse(parsed);

      await AiAnalysis.findByIdAndUpdate(analysisRecord._id, {
        state: "completed",
        result: validated as Record<string, unknown>,
        latencyMs: response.latencyMs,
        retries: response.retries,
      });

      await logAiAudit({
        correlationId,
        userId: user.id,
        userRole: user.role,
        action: "lead_intelligence_analysis",
        taskType: "lead_intelligence",
        model: response.model,
        resourceId: lead._id.toString(),
        latencyMs: response.latencyMs,
        state: "success",
      });

      return validated;
    } catch (err: any) {
      logger.warn(
        { err: err?.message, correlationId, leadId: lead._id },
        "Gemini synthesis failed; returning deterministic baseline"
      );

      await AiAnalysis.findByIdAndUpdate(analysisRecord._id, {
        state: "failed",
        error: { message: err?.message || "Synthesis error", code: err?.name },
      });

      await logAiAudit({
        correlationId,
        userId: user.id,
        userRole: user.role,
        action: "lead_intelligence_fallback",
        taskType: "lead_intelligence",
        model: geminiEnv.GEMINI_MODEL,
        resourceId: lead._id.toString(),
        state: "failure",
        errorCode: err?.name,
      });

      return {
        ...baseline,
        calculationMethod: "deterministic_heuristic",
        disclaimer: `Deterministic heuristic calculation based on CRM business rules (Gemini AI unavailable: ${err?.message || "synthesis failed"}).`,
      };
    }
  }
}
