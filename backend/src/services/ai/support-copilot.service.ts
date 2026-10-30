import crypto from "crypto";
import mongoose from "mongoose";
import { z } from "zod";
import { ILead } from "../../models/Lead.model";
import { AiAnalysis } from "../../models/AiAnalysis.model";
import { callOpenRouter, parseOpenRouterJson } from "./openrouter.provider";
import { logAiAudit } from "./ai-audit.service";
import { openRouterEnv, isOpenRouterConfigured } from "../../config/openrouter";
import { IAuthUser } from "../../types/auth.types";
import { logger } from "../../config/logger";
import { DEPARTMENTS } from "../../constants/departments";

export const SupportCopilotSchema = z.object({
  checklistStatus: z.object({
    dateVerified: z.boolean(),
    timeVerified: z.boolean(),
    addressVerified: z.boolean(),
    audioPresent: z.boolean(),
    vigilanceCompleted: z.boolean(),
  }),
  missingRequirements: z.array(z.string()),
  workflowBlockers: z.array(z.string()),
  permittedNextActions: z.array(
    z.object({
      action: z.string(),
      condition: z.string(),
      permitted: z.boolean(),
    })
  ),
  summary: z.string().max(800),
  readyForAllocation: z.boolean(),
  disclaimer: z.string(),
  calculationMethod: z.enum(["openrouter_synthesized", "deterministic_checklist"]),
});

export type SupportCopilotResult = z.infer<typeof SupportCopilotSchema>;

export class SupportCopilotService {
  private static generateDeterministicChecklist(lead: ILead): SupportCopilotResult {
    const v = lead.supportDetails?.verification;
    const dateVerified = Boolean(v?.isDateVerified);
    const timeVerified = Boolean(v?.isTimeVerified);
    const addressVerified = Boolean(v?.isAddressVerified);
    const audioPresent = Boolean(lead.vigilanceDetails?.audio?.url);
    const vigilanceCompleted = Boolean(
      lead.vigilanceDetails?.completedAt || lead.currentDepartment !== DEPARTMENTS.VIGILANCE
    );

    const missingRequirements: string[] = [];
    const workflowBlockers: string[] = [];

    if (!audioPresent) {
      missingRequirements.push("Vigilance call audio recording");
      workflowBlockers.push("Audio file must be uploaded before completing Support allocation.");
    }
    if (!dateVerified) {
      missingRequirements.push("Meeting Date confirmation");
      workflowBlockers.push("Lead appointment date is unverified.");
    }
    if (!timeVerified) {
      missingRequirements.push("Meeting Time slot confirmation");
      workflowBlockers.push("Lead appointment time slot is unverified.");
    }
    if (!addressVerified) {
      missingRequirements.push("Physical / Site Address confirmation");
      workflowBlockers.push("Physical meeting address is unverified.");
    }

    const readyForAllocation =
      dateVerified && timeVerified && addressVerified && audioPresent && vigilanceCompleted;

    const permittedNextActions = [
      {
        action: "Allocate Lead to Sales Executive",
        condition: "Requires 3-point checklist (Date, Time, Address) & uploaded audio.",
        permitted: readyForAllocation,
      },
      {
        action: "Perform Manual 3-Point Checklist Verification",
        condition: "Support coordinator reviews and confirms meeting details.",
        permitted: !readyForAllocation,
      },
      {
        action: "Return Lead to Vigilance for Audio Upload",
        condition: "Applicable if call recording is missing or corrupted.",
        permitted: !audioPresent,
      },
    ];

    let summary = "";
    if (readyForAllocation) {
      summary = `Lead ${lead.leadCode} has fulfilled all 3 verification checklist points and has a valid audio record. It is ready for allocation to the Sales queue.`;
    } else {
      summary = `Lead ${lead.leadCode} cannot be allocated yet. ${missingRequirements.length} required verification items remain unconfirmed (${missingRequirements.join(", ")}).`;
    }

    return {
      checklistStatus: {
        dateVerified,
        timeVerified,
        addressVerified,
        audioPresent,
        vigilanceCompleted,
      },
      missingRequirements,
      workflowBlockers,
      permittedNextActions,
      summary,
      readyForAllocation,
      disclaimer: "Support checklist evaluation is deterministic and strictly adheres to CRM allocation criteria.",
      calculationMethod: "deterministic_checklist",
    };
  }

  static async evaluate(lead: ILead, user: IAuthUser): Promise<SupportCopilotResult> {
    const correlationId = crypto.randomUUID();
    const fallback = this.generateDeterministicChecklist(lead);

    if (!isOpenRouterConfigured() || !openRouterEnv.AI_FEATURES_ENABLED) {
      return fallback;
    }

    const requestedByObjectId = mongoose.Types.ObjectId.isValid(user.id)
      ? new mongoose.Types.ObjectId(user.id)
      : new mongoose.Types.ObjectId("000000000000000000000000");

    const analysisRecord = await AiAnalysis.create({
      sourceRecordId: lead._id,
      sourceModel: "Lead",
      taskType: "support_copilot",
      aiModel: openRouterEnv.OPENROUTER_MODEL || "nvidia/nemotron-3.5-lightning:free",
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
        date: lead.date,
        time: lead.time,
        address: lead.postalAddress,
        city: lead.city,
        state: lead.state,
        supportVerification: lead.supportDetails?.verification,
        allocatedTo: lead.supportDetails?.allocatedTo,
        allocationNotes: lead.supportDetails?.allocationNotes,
        hasAudio: Boolean(lead.vigilanceDetails?.audio),
        baseline: fallback,
      };

      const systemInstruction = `You are the Support Copilot for VA Nexus (Venture Automation Nexus - Connect. Automate. Accelerate.).
Evaluate lead readiness for Sales allocation based on the mandatory 3-point checklist:
1. Date must be verified.
2. Time must be verified.
3. Address must be verified.
4. Audio recording must be attached.
Allocation CANNOT be ready if any of these 4 items is false.
Return ONLY valid JSON matching the requested schema.`;

      const prompt = `Evaluate the Support checklist readiness for this lead:
${JSON.stringify(sanitizedContext, null, 2)}

Return JSON with exact structure:
{
  "checklistStatus": {
    "dateVerified": boolean,
    "timeVerified": boolean,
    "addressVerified": boolean,
    "audioPresent": boolean,
    "vigilanceCompleted": boolean
  },
  "missingRequirements": string[],
  "workflowBlockers": string[],
  "permittedNextActions": [
    { "action": string, "condition": string, "permitted": boolean }
  ],
  "summary": string (max 500 chars),
  "readyForAllocation": boolean,
  "disclaimer": "AI support guidance via OpenRouter (${openRouterEnv.OPENROUTER_MODEL || "nvidia/nemotron-3.5-lightning:free"}). Support coordinator must verify items prior to Sales queue allocation.",
  "calculationMethod": "openrouter_synthesized"
}`;

      const response = await callOpenRouter({
        messages: [
          { role: "system", content: systemInstruction },
          { role: "user", content: prompt },
        ],
        correlationId,
        taskType: "support_copilot",
        temperature: 0.2,
      });

      const parsed = parseOpenRouterJson<unknown>(response.content, correlationId);
      const validated = SupportCopilotSchema.parse(parsed);

      await AiAnalysis.findByIdAndUpdate(analysisRecord._id, {
        state: "completed",
        result: validated as Record<string, unknown>,
        latencyMs: response.latencyMs,
      });

      await logAiAudit({
        correlationId,
        userId: user.id,
        userRole: user.role,
        action: "support_copilot_evaluate",
        taskType: "support_copilot",
        model: response.model,
        resourceId: lead._id.toString(),
        latencyMs: response.latencyMs,
        state: "success",
      });

      return validated;
    } catch (err: any) {
      logger.warn(
        { err: err?.message, correlationId, leadId: lead._id },
        "Support copilot OpenRouter evaluation failed; returning deterministic checklist"
      );

      await AiAnalysis.findByIdAndUpdate(analysisRecord._id, {
        state: "failed",
        error: { message: err?.message || "Synthesis error", code: err?.name },
      });

      return {
        ...fallback,
        calculationMethod: "deterministic_checklist",
        disclaimer: `Deterministic checklist audit based on CRM records (OpenRouter synthesis unavailable: ${err?.message || "offline"}). Support coordinator must verify items prior to Sales queue allocation.`,
      };
    }
  }
}
