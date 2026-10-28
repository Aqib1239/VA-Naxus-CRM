import crypto from "crypto";
import mongoose from "mongoose";
import { z } from "zod";
import { ILead } from "../../models/Lead.model";
import { AiAnalysis } from "../../models/AiAnalysis.model";
import { callGemini, parseGeminiJson } from "./gemini.provider";
import { logAiAudit } from "./ai-audit.service";
import { geminiEnv, isGeminiConfigured } from "../../config/gemini";
import { IAuthUser } from "../../types/auth.types";
import { logger } from "../../config/logger";

export const VerificationCheckStatus = z.enum(["verified", "failed", "incomplete", "inconclusive"]);

export const VigilanceCopilotSchema = z.object({
  overallFinding: z.enum(["proceed", "flag_for_review", "insufficient_evidence"]),
  checks: z.array(
    z.object({
      requirement: z.string(),
      status: VerificationCheckStatus,
      evidenceReference: z.string(),
      explanation: z.string(),
      uncertainty: z.enum(["high", "medium", "low", "none"]),
      recommendedHumanAction: z.string(),
    })
  ),
  summary: z.string().max(800),
  mandatoryHumanVerificationRequired: z.literal(true),
  disclaimer: z.string(),
  calculationMethod: z.enum(["gemini_synthesized", "deterministic_audit"]),
  analysisTimestamp: z.string(),
});

export type VigilanceCopilotResult = z.infer<typeof VigilanceCopilotSchema>;

export class VigilanceCopilotService {
  private static generateDeterministicAudit(lead: ILead): VigilanceCopilotResult {
    const hasAudio = Boolean(lead.vigilanceDetails?.audio?.url);
    const hasDate = Boolean(lead.date && lead.date.trim().length > 0);
    const hasTime = Boolean(lead.time && lead.time.trim().length > 0);
    const hasAddress = Boolean(lead.postalAddress && lead.postalAddress.trim().length > 0);
    const hasNotes = Boolean(
      (lead.remark && lead.remark.trim().length > 0) ||
      (lead.communicationDetails?.meetingNotes && lead.communicationDetails.meetingNotes.trim().length > 0)
    );

    const checks: VigilanceCopilotResult["checks"] = [
      {
        requirement: "Mandatory Call Audio Recording",
        status: hasAudio ? "verified" : "failed",
        evidenceReference: hasAudio
          ? `Audio record: ${lead.vigilanceDetails?.audio?.fileName || "Uploaded"}`
          : "vigilanceDetails.audio is null",
        explanation: hasAudio
          ? "Audio file is safely uploaded to Cloudinary CDN and attached to lead record."
          : "CRITICAL: Vigilance audit strictly mandates an audio recording prior to verification.",
        uncertainty: "none",
        recommendedHumanAction: hasAudio
          ? "Listen to audio preview to ensure clarity and audio-visual match."
          : "Request communication agent or officer to upload call recording.",
      },
      {
        requirement: "Appointment Date Confirmation",
        status: hasDate ? "verified" : "incomplete",
        evidenceReference: hasDate ? `date: "${lead.date}"` : "date field is empty",
        explanation: hasDate
          ? `Date '${lead.date}' is populated from meeting scheduling.`
          : "Appointment date is missing.",
        uncertainty: "none",
        recommendedHumanAction: hasDate
          ? "Verify that date aligns with customer availability."
          : "Confirm date with customer.",
      },
      {
        requirement: "Appointment Time Confirmation",
        status: hasTime ? "verified" : "incomplete",
        evidenceReference: hasTime ? `time: "${lead.time}"` : "time field is empty",
        explanation: hasTime
          ? `Time slot '${lead.time}' is confirmed.`
          : "Time slot has not been selected.",
        uncertainty: "none",
        recommendedHumanAction: hasTime
          ? "Cross-check against sales calendar slot availability."
          : "Confirm scheduled time slot.",
      },
      {
        requirement: "Postal / Site Address Verification",
        status: hasAddress ? "verified" : "incomplete",
        evidenceReference: hasAddress
          ? `postalAddress: "${lead.postalAddress}, ${lead.city || ""}"`
          : "postalAddress is empty",
        explanation: hasAddress
          ? "Full street address provided for meeting or service delivery."
          : "Address detail is missing or incomplete.",
        uncertainty: hasAddress ? "low" : "none",
        recommendedHumanAction: hasAddress
          ? "Confirm pincode and delivery landmark."
          : "Obtain complete location address from client.",
      },
      {
        requirement: "Communication Engagement Notes",
        status: hasNotes ? "verified" : "inconclusive",
        evidenceReference: hasNotes
          ? `meetingNotes: "${lead.communicationDetails?.meetingNotes || lead.remark}"`
          : "No initial communication notes present",
        explanation: hasNotes
          ? "Documented initial dialogue with client exists."
          : "No notes recorded from initial customer touchpoint.",
        uncertainty: hasNotes ? "low" : "medium",
        recommendedHumanAction: "Review notes to anticipate potential objections or specific client requests.",
      },
    ];

    let overallFinding: VigilanceCopilotResult["overallFinding"] = "proceed";
    if (!hasAudio) {
      overallFinding = "insufficient_evidence";
    } else if (!hasDate || !hasTime || !hasAddress) {
      overallFinding = "flag_for_review";
    }

    return {
      overallFinding,
      checks,
      summary: !hasAudio
        ? "Lead cannot be verified: mandatory audio verification recording is missing."
        : overallFinding === "flag_for_review"
        ? "Audio is attached, but some meeting or address details require manual confirmation before proceeding."
        : "All core verification evidence appears present. Officer may complete the audit.",
      mandatoryHumanVerificationRequired: true,
      disclaimer: "AI verification findings are advisory. The Vigilance Officer bears final legal responsibility.",
      calculationMethod: "deterministic_audit",
      analysisTimestamp: new Date().toISOString(),
    };
  }

  static async evaluate(lead: ILead, user: IAuthUser): Promise<VigilanceCopilotResult> {
    const correlationId = crypto.randomUUID();
    const fallback = this.generateDeterministicAudit(lead);

    if (!isGeminiConfigured() || !geminiEnv.AI_FEATURES_ENABLED) {
      return fallback;
    }

    const requestedByObjectId = mongoose.Types.ObjectId.isValid(user.id)
      ? new mongoose.Types.ObjectId(user.id)
      : new mongoose.Types.ObjectId("000000000000000000000000");

    const analysisRecord = await AiAnalysis.create({
      sourceRecordId: lead._id,
      sourceModel: "Lead",
      taskType: "vigilance_copilot",
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
        currentStage: lead.currentDepartment,
        status: lead.status,
        hasAudio: Boolean(lead.vigilanceDetails?.audio),
        audioFileName: lead.vigilanceDetails?.audio?.fileName || null,
        audioDuration: lead.vigilanceDetails?.audio?.duration || null,
        date: lead.date,
        time: lead.time,
        address: lead.postalAddress,
        city: lead.city,
        state: lead.state,
        pincode: lead.pincode,
        remark: lead.remark,
        communicationNotes: lead.communicationDetails?.meetingNotes,
        deterministicChecks: fallback.checks,
      };

      const systemInstruction = `You are the Vigilance Copilot for VA Nexus (Venture Automation Nexus - Connect. Automate. Accelerate.).
Evaluate lead data against the strict verification checklist.
Mandatory Rules:
1. An audio recording is strictly mandatory. If missing, status MUST be 'failed' and overall 'insufficient_evidence'.
2. You CANNOT approve or reject leads automatically. Human verification is always mandatory (mandatoryHumanVerificationRequired: true).
3. Return ONLY valid JSON adhering to the required schema.`;

      const prompt = `Evaluate the following lead verification packet:
${JSON.stringify(sanitizedContext, null, 2)}

Return JSON with exact schema:
{
  "overallFinding": "proceed" | "flag_for_review" | "insufficient_evidence",
  "checks": [
    {
      "requirement": string,
      "status": "verified" | "failed" | "incomplete" | "inconclusive",
      "evidenceReference": string,
      "explanation": string,
      "uncertainty": "high" | "medium" | "low" | "none",
      "recommendedHumanAction": string
    }
  ],
  "summary": string (max 500 chars),
  "mandatoryHumanVerificationRequired": true,
  "disclaimer": "AI audit is advisory. The human Vigilance Officer holds sole authority to verify or reject.",
  "calculationMethod": "gemini_synthesized",
  "analysisTimestamp": "${new Date().toISOString()}"
}`;

      const response = await callGemini({
        prompt,
        systemInstruction,
        correlationId,
        taskType: "vigilance_copilot",
      });

      const parsed = parseGeminiJson<unknown>(response.text, correlationId);
      const validated = VigilanceCopilotSchema.parse(parsed);

      await AiAnalysis.findByIdAndUpdate(analysisRecord._id, {
        state: "completed",
        result: validated as Record<string, unknown>,
        latencyMs: response.latencyMs,
      });

      await logAiAudit({
        correlationId,
        userId: user.id,
        userRole: user.role,
        action: "vigilance_copilot_evaluate",
        taskType: "vigilance_copilot",
        model: response.model,
        resourceId: lead._id.toString(),
        latencyMs: response.latencyMs,
        state: "success",
      });

      return validated;
    } catch (err: any) {
      logger.warn(
        { err: err?.message, correlationId, leadId: lead._id },
        "Vigilance copilot Gemini evaluation failed; returning deterministic audit"
      );

      await AiAnalysis.findByIdAndUpdate(analysisRecord._id, {
        state: "failed",
        error: { message: err?.message || "Synthesis error", code: err?.name },
      });

      return {
        ...fallback,
        calculationMethod: "deterministic_audit",
        disclaimer: `Deterministic compliance checklist audit based on CRM records (Gemini synthesis unavailable: ${err?.message || "offline"}). The human Vigilance Officer holds sole authority to verify or reject.`,
      };
    }
  }
}
