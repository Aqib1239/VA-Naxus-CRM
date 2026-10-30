import crypto from "crypto";
import mongoose from "mongoose";
import { z } from "zod";
import { ILead } from "../../models/Lead.model";
import { AiAnalysis } from "../../models/AiAnalysis.model";
import { callOpenRouter, parseOpenRouterJson } from "./openrouter.provider";
import { logAiAudit } from "./ai-audit.service";
import { openRouterEnv, isOpenRouterConfigured, OpenRouterConfigError } from "../../config/openrouter";
import { IAuthUser } from "../../types/auth.types";
import { logger } from "../../config/logger";

export const SalesCopilotSchema = z.object({
  talkingPoints: z.array(z.string()).max(10),
  followUpDraft: z.string().max(3000),
  objectionHandling: z
    .array(
      z.object({
        objection: z.string(),
        response: z.string(),
      })
    )
    .max(10),
  callScript: z.string().max(3000),
  recommendedNextAction: z.object({
    action: z.string(),
    rationale: z.string(),
    timing: z.string(),
  }),
  disclaimer: z.string(),
  requiresApproval: z.literal(true),
  calculationMethod: z.string().default("openrouter_synthesized"),
});

export type SalesCopilotResult = z.infer<typeof SalesCopilotSchema>;

export class SalesCopilotService {
  static async generateForLead(lead: ILead, user: IAuthUser): Promise<SalesCopilotResult> {
    const correlationId = crypto.randomUUID();

    if (!isOpenRouterConfigured() || !openRouterEnv.AI_FEATURES_ENABLED) {
      throw new OpenRouterConfigError(
        "OpenRouter AI is not configured on the server. Please configure OPENROUTER_API_KEY in backend/.env to generate live sales copilot intelligence."
      );
    }

    const requestedByObjectId = mongoose.Types.ObjectId.isValid(user.id)
      ? new mongoose.Types.ObjectId(user.id)
      : new mongoose.Types.ObjectId("000000000000000000000000");

    const analysisRecord = await AiAnalysis.create({
      sourceRecordId: lead._id,
      sourceModel: "Lead",
      taskType: "sales_copilot",
      aiModel: openRouterEnv.OPENROUTER_MODEL || "nvidia/nemotron-3.5-lightning:free",
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
        contactNumber: lead.contactNumber || "Not provided",
        city: lead.city || "Not provided",
        state: lead.state || "Not provided",
        postalAddress: lead.postalAddress || "Not provided",
        meetingDate: lead.date || "Not scheduled",
        meetingTime: lead.time || "Not scheduled",
        remark: lead.remark || "None",
        communicationNotes: lead.communicationDetails?.meetingNotes || "None recorded",
        vigilanceNotes: lead.vigilanceDetails?.verificationNotes || "None recorded",
        hasAudioRecording: Boolean(lead.vigilanceDetails?.audio?.url),
        supportNotes: lead.supportDetails?.allocationNotes || "None recorded",
        supportChecklist: lead.supportDetails?.verification || null,
        dealValueEstimate: lead.salesDetails?.dealValue || null,
        currentStage: lead.currentDepartment,
        status: lead.status,
      };

      const systemInstruction = `You are the Executive Sales Copilot for VA Nexus (Venture Automation Nexus - Connect. Automate. Accelerate.).
Generate tailored, high-converting B2B sales talking points, objection handling, personalized follow-up message draft, and telephone call opening scripts for executive sales closers.

Strict Rules:
- You must require user approval before sending (requiresApproval: true).
- Never claim an outreach email or message has already been dispatched.
- Ground all collateral strictly on the actual lead data available in MongoDB. Do not invent customer information, requirements, or activity.
- If information is missing, clearly indicate that it is unavailable.
- Return ONLY valid JSON matching the exact schema specified.`;

      const prompt = `Generate customized sales copilot collateral for this prospect:
${JSON.stringify(sanitizedContext, null, 2)}

Return JSON with exact structure:
{
  "talkingPoints": [
    "Key talking point tailored to lead requirements and verified details"
  ],
  "followUpDraft": "Personalized message draft ready for sales rep review and transmission.",
  "objectionHandling": [
    { "objection": "Likely objection based on industry/notes", "response": "Actionable value-driven counter" }
  ],
  "callScript": "Custom opening call script for sales closing conversation with this prospect.",
  "recommendedNextAction": {
    "action": "Immediate recommended sales action",
    "rationale": "Clear strategic rationale grounded in lead status",
    "timing": "Recommended execution timing (e.g. Immediate / Next business morning)"
  },
  "disclaimer": "AI-generated sales draft in VA Nexus via OpenRouter (${openRouterEnv.OPENROUTER_MODEL || "nvidia/nemotron-3.5-lightning:free"}). Sales executive must review, customize, and approve before sending.",
  "requiresApproval": true,
  "calculationMethod": "openrouter_synthesized"
}`;

      const response = await callOpenRouter({
        messages: [
          { role: "system", content: systemInstruction },
          { role: "user", content: prompt },
        ],
        correlationId,
        taskType: "sales_copilot",
        temperature: 0.2,
      });

      const parsed = parseOpenRouterJson<unknown>(response.content, correlationId);
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
        "Sales copilot OpenRouter generation failed"
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
        model: openRouterEnv.OPENROUTER_MODEL || "nvidia/nemotron-3.5-lightning:free",
        resourceId: lead._id.toString(),
        state: "failure",
        errorCode: err?.name,
      });

      throw new Error(
        err?.message ||
          "Unable to generate Sales Copilot advice. Please check your OpenRouter AI configuration and try again."
      );
    }
  }
}
