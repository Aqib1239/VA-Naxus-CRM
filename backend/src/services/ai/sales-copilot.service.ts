import crypto from "crypto";
import mongoose from "mongoose";
import { z } from "zod";
import { ILead } from "../../models/Lead.model";
import { AiAnalysis } from "../../models/AiAnalysis.model";
import { callGemini, parseGeminiJson } from "./gemini.provider";
import { logAiAudit } from "./ai-audit.service";
import { geminiEnv, isGeminiConfigured, GeminiConfigError } from "../../config/gemini";
import { IAuthUser } from "../../types/auth.types";
import { logger } from "../../config/logger";

export const SalesCopilotSchema = z.object({
  talkingPoints: z.array(z.string()).max(6),
  followUpDraft: z.string().max(1200),
  objectionHandling: z
    .array(
      z.object({
        objection: z.string(),
        response: z.string(),
      })
    )
    .max(5),
  callScript: z.string().max(1800),
  recommendedNextAction: z.object({
    action: z.string(),
    rationale: z.string(),
    timing: z.string(),
  }),
  disclaimer: z.string(),
  requiresApproval: z.literal(true),
  calculationMethod: z.literal("gemini_synthesized"),
});

export type SalesCopilotResult = z.infer<typeof SalesCopilotSchema>;

export class SalesCopilotService {
  static async generateForLead(lead: ILead, user: IAuthUser): Promise<SalesCopilotResult> {
    const correlationId = crypto.randomUUID();

    if (!isGeminiConfigured() || !geminiEnv.AI_FEATURES_ENABLED) {
      throw new GeminiConfigError(
        "Gemini AI is not configured on the server. Please configure GEMINI_API_KEY to generate live sales copilot intelligence."
      );
    }

    const requestedByObjectId = mongoose.Types.ObjectId.isValid(user.id)
      ? new mongoose.Types.ObjectId(user.id)
      : new mongoose.Types.ObjectId("000000000000000000000000");

    const analysisRecord = await AiAnalysis.create({
      sourceRecordId: lead._id,
      sourceModel: "Lead",
      taskType: "sales_copilot",
      aiModel: geminiEnv.GEMINI_MODEL,
      correlationId,
      state: "processing",
      requestedBy: requestedByObjectId,
      requestedByRole: user.role,
      expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    });

    try {
      const sanitizedContext = {
        leadCode: lead.leadCode,
        leadName: lead.name,
        city: lead.city,
        state: lead.state,
        meetingDate: lead.date,
        meetingTime: lead.time,
        communicationNotes: lead.communicationDetails?.meetingNotes,
        vigilanceNotes: lead.vigilanceDetails?.verificationNotes,
        hasAudio: Boolean(lead.vigilanceDetails?.audio),
        supportNotes: lead.supportDetails?.allocationNotes,
        dealValueEstimate: lead.salesDetails?.dealValue || null,
        currentStage: lead.currentDepartment,
        status: lead.status,
      };

      const systemInstruction = `You are the Sales Copilot for VA Nexus (Venture Automation Nexus - Connect. Automate. Accelerate.).
Generate tailored, high-converting B2B sales talking points, objection handling, follow-up messages, and phone scripts for executive closers.
Constraints:
- You must require user approval before sending (requiresApproval: true).
- Never claim an outreach email or message has already been dispatched.
- Ground talking points strictly on the verified customer data provided.
- Return ONLY valid JSON matching the requested schema.`;

      const prompt = `Generate customized sales copilot collateral for this prospect:
${JSON.stringify(sanitizedContext, null, 2)}

Return JSON with exact structure:
{
  "talkingPoints": ["point 1", "point 2"],
  "followUpDraft": "string (personalized email/message draft ready for sales rep review)",
  "objectionHandling": [
    { "objection": "string", "response": "string" }
  ],
  "callScript": "string (custom opening call script for this prospect)",
  "recommendedNextAction": {
    "action": "string",
    "rationale": "string",
    "timing": "string"
  },
  "disclaimer": "AI-generated draft in VA Nexus. Sales executive must review, customize, and approve before sending.",
  "requiresApproval": true,
  "calculationMethod": "gemini_synthesized"
}`;

      const response = await callGemini({
        prompt,
        systemInstruction,
        correlationId,
        taskType: "sales_copilot",
        temperature: 0.25,
      });

      const parsed = parseGeminiJson<unknown>(response.text, correlationId);
      const validated = SalesCopilotSchema.parse(parsed);

      await AiAnalysis.findByIdAndUpdate(analysisRecord._id, {
        state: "completed",
        result: validated as Record<string, unknown>,
        latencyMs: response.latencyMs,
      });

      await logAiAudit({
        correlationId,
        userId: user.id,
        userRole: user.role,
        action: "sales_copilot_generate",
        taskType: "sales_copilot",
        model: response.model,
        resourceId: lead._id.toString(),
        latencyMs: response.latencyMs,
        state: "success",
      });

      return validated;
    } catch (err: any) {
      logger.error(
        { err: err?.message, correlationId, leadId: lead._id },
        "Sales copilot Gemini generation failed"
      );

      await AiAnalysis.findByIdAndUpdate(analysisRecord._id, {
        state: "failed",
        error: { message: err?.message || "Synthesis error", code: err?.name },
      });

      await logAiAudit({
        correlationId,
        userId: user.id,
        userRole: user.role,
        action: "sales_copilot_error",
        taskType: "sales_copilot",
        model: geminiEnv.GEMINI_MODEL,
        resourceId: lead._id.toString(),
        state: "failure",
        errorCode: err?.name,
      });

      throw new Error(
        err?.message ||
          "Unable to generate Sales Copilot advice. Please check your Gemini AI configuration and try again."
      );
    }
  }
}
