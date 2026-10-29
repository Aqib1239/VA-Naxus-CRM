import crypto from "crypto";
import { z } from "zod";
import { Lead } from "../../models/Lead.model";
import { DEPARTMENTS, LEAD_STATUS } from "../../constants/departments";
import { ROLES, ROLE_DEFINITIONS } from "../../constants/roles";
import { logger } from "../../config/logger";
import {
  isOpenRouterConfigured,
  openRouterEnv,
  OpenRouterConfigError,
  OpenRouterRateLimitError,
  OpenRouterTimeoutError,
  OpenRouterApiError,
} from "../../config/openrouter";
import {
  callOpenRouter,
  parseOpenRouterJson,
  stripInternalReasoning,
  extractFieldsFromMalformedJson,
  normalizeMarkdownTables,
  OpenRouterChatMessage,
} from "./openrouter.provider";
import { logAiAudit } from "./ai-audit.service";
import { IAuthUser } from "../../types/auth.types";

export const ALLOWED_CRM_TOOLS = [
  "get_stage_counts",
  "get_recent_leads",
  "get_stalled_leads",
  "get_my_assigned_leads",
  "get_conversion_rate",
  "get_leads_by_status",
  "get_vigilance_leads_without_audio",
  "get_vigilance_audio_status_summary",
] as const;

export type AllowedCrmTool = (typeof ALLOWED_CRM_TOOLS)[number];

export { normalizeMarkdownTables, extractFieldsFromMalformedJson };

/**
 * Safely unwrap nested JSON wrappers, code fences, or malformed JSON
 * so the final answer is always clean markdown rather than serialized JSON.
 */
export function unwrapJsonAnswer(text: string): string {
  if (!text || typeof text !== "string") return "";
  let trimmed = text.trim();

  // Strip code fences if wrapped in ```json ... ``` or ``` ... ```
  if (trimmed.startsWith("```")) {
    const inner = trimmed.replace(/^```[a-zA-Z]*\n?/, "").replace(/\n?```$/, "").trim();
    try {
      const parsed = JSON.parse(inner);
      if (parsed && typeof parsed.answer === "string") {
        return unwrapJsonAnswer(parsed.answer);
      }
    } catch {}
    trimmed = inner;
  }

  // If raw JSON object string
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed.answer === "string") {
        return unwrapJsonAnswer(parsed.answer);
      }
    } catch {}
  }

  // If text contains "answer": ... or 'answer': ... but JSON.parse failed (e.g. unescaped quotes)
  if (trimmed.includes('"answer"') || trimmed.includes("'answer'")) {
    const extracted = extractFieldsFromMalformedJson(trimmed);
    if (extracted.answer && extracted.answer !== trimmed) {
      return unwrapJsonAnswer(extracted.answer);
    }
  }

  return normalizeMarkdownTables(trimmed);
}

function getUserDeptFilter(user: IAuthUser): Record<string, any> {
  if (user.role === ROLES.ADMIN) return {};
  const allowed = ROLE_DEFINITIONS[user.role]?.allowedDepartments ?? [];
  return { currentDepartment: { $in: allowed } };
}

async function executeSafeTool(tool: AllowedCrmTool, user: IAuthUser): Promise<Record<string, any>> {
  const deptFilter = getUserDeptFilter(user);

  switch (tool) {
    case "get_stage_counts": {
      const counts = await Lead.aggregate([
        { $match: deptFilter },
        { $group: { _id: "$currentDepartment", count: { $sum: 1 } } },
      ]);
      const result: Record<string, number> = {};
      counts.forEach((c) => {
        result[c._id] = c.count;
      });
      return { stageCounts: result };
    }

    case "get_recent_leads": {
      const leads = await Lead.find(deptFilter)
        .select("leadCode name currentDepartment status city createdAt updatedAt")
        .sort({ createdAt: -1 })
        .limit(10)
        .lean();
      return {
        recentLeads: leads.map((l: any) => ({
          leadCode: l.leadCode,
          name: l.name,
          department: l.currentDepartment,
          status: l.status,
          city: l.city,
          createdAt: l.createdAt,
          updatedAt: l.updatedAt,
        })),
      };
    }

    case "get_stalled_leads": {
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      const leads = await Lead.find({
        ...deptFilter,
        updatedAt: { $lt: threeDaysAgo },
        status: { $nin: [LEAD_STATUS.CLAIMED, LEAD_STATUS.REJECTED] },
      })
        .select("leadCode name currentDepartment status vigilanceDetails updatedAt createdAt")
        .sort({ updatedAt: 1 })
        .limit(15)
        .lean();
      return {
        stalledLeads: leads.map((l: any) => {
          const daysSinceActivity = Math.round(
            (Date.now() - new Date(l.updatedAt || l.createdAt).getTime()) / (1000 * 60 * 60 * 24)
          );
          let audioStatus = "n/a (not in vigilance)";
          if (l.currentDepartment === DEPARTMENTS.VIGILANCE) {
            const hasAudio = Boolean(l.vigilanceDetails?.audio?.url);
            const isCompleted = Boolean(l.vigilanceDetails?.completedAt);
            if (!hasAudio) {
              audioStatus = "missing";
            } else if (!isCompleted) {
              audioStatus = "uploaded_awaiting_verification";
            } else {
              audioStatus = "verified";
            }
          }
          return {
            leadCode: l.leadCode,
            name: l.name,
            department: l.currentDepartment,
            status: l.status,
            lastActivityAt: l.updatedAt,
            daysSinceActivity,
            audioStatus,
          };
        }),
        totalStalled: leads.length,
      };
    }

    case "get_my_assigned_leads": {
      let filter: Record<string, any> = deptFilter;
      if (user.role === ROLES.SUPPORT) {
        filter = { "supportDetails.allocatedTo": user.name };
      } else if (user.role === ROLES.SALES) {
        filter = { "salesDetails.claimedById": user.id };
      }
      const leads = await Lead.find(filter)
        .select("leadCode name currentDepartment status createdAt updatedAt")
        .sort({ updatedAt: -1 })
        .limit(15)
        .lean();
      return {
        assignedLeads: leads.map((l: any) => ({
          leadCode: l.leadCode,
          name: l.name,
          department: l.currentDepartment,
          status: l.status,
        })),
        count: leads.length,
      };
    }

    case "get_conversion_rate": {
      const [total, claimed] = await Promise.all([
        Lead.countDocuments(deptFilter),
        Lead.countDocuments({ ...deptFilter, status: LEAD_STATUS.CLAIMED }),
      ]);
      return {
        totalLeadsInScope: total,
        claimedLeads: claimed,
        conversionRatePercent: total > 0 ? Math.round((claimed / total) * 100) : 0,
      };
    }

    case "get_leads_by_status": {
      const counts = await Lead.aggregate([
        { $match: deptFilter },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]);
      const statusCounts: Record<string, number> = {};
      counts.forEach((c) => {
        statusCounts[c._id] = c.count;
      });
      return { statusCounts };
    }

    case "get_vigilance_leads_without_audio": {
      // RBAC check: enforce that user has permission to access the Vigilance department
      const allowedDepts = ROLE_DEFINITIONS[user.role]?.allowedDepartments ?? [];
      if (user.role !== ROLES.ADMIN && !allowedDepts.includes(DEPARTMENTS.VIGILANCE)) {
        return {
          totalVigilanceWithoutAudio: 0,
          department: DEPARTMENTS.VIGILANCE,
          leads: [],
          message: `User role '${user.role}' is not authorized to view Vigilance department records.`,
        };
      }

      // Return ONLY leads currently in the Vigilance stage where audio recording is confirmed missing
      const leads = await Lead.find({
        currentDepartment: DEPARTMENTS.VIGILANCE,
        $or: [
          { "vigilanceDetails.audio": { $exists: false } },
          { "vigilanceDetails.audio": null },
          { "vigilanceDetails.audio.url": { $exists: false } },
          { "vigilanceDetails.audio.url": null },
          { "vigilanceDetails.audio.url": "" },
        ],
      })
        .select("leadCode name currentDepartment status vigilanceDetails updatedAt createdAt")
        .sort({ updatedAt: 1 })
        .limit(25)
        .lean();

      return {
        totalVigilanceWithoutAudio: leads.length,
        department: DEPARTMENTS.VIGILANCE,
        leads: leads.map((l: any) => {
          const daysSinceLastActivity = Math.max(
            0,
            Math.round(
              (Date.now() - new Date(l.updatedAt || l.createdAt).getTime()) / (1000 * 60 * 60 * 24)
            )
          );
          let evidence = "vigilanceDetails.audio is null/absent in database";
          if (l.vigilanceDetails?.audio && !l.vigilanceDetails.audio.url) {
            evidence = "vigilanceDetails.audio.url is missing/blank in database record";
          }
          return {
            leadId: l.leadCode,
            companyName: l.name,
            stage: l.currentDepartment,
            status: l.status,
            daysSinceLastActivity,
            audioStatus: "missing",
            evidence,
          };
        }),
      };
    }

    case "get_vigilance_audio_status_summary": {
      // RBAC check: enforce that user has permission to access the Vigilance department
      const allowedDepts = ROLE_DEFINITIONS[user.role]?.allowedDepartments ?? [];
      if (user.role !== ROLES.ADMIN && !allowedDepts.includes(DEPARTMENTS.VIGILANCE)) {
        return {
          totalVigilanceLeads: 0,
          missingAudioCount: 0,
          awaitingVerificationCount: 0,
          verifiedCount: 0,
          unconfirmedCount: 0,
          leads: [],
          message: `User role '${user.role}' is not authorized to view Vigilance department records.`,
        };
      }

      // Returns full audit breakdown of leads in Vigilance department
      const leads = await Lead.find({
        currentDepartment: DEPARTMENTS.VIGILANCE,
      })
        .select("leadCode name currentDepartment status vigilanceDetails updatedAt createdAt")
        .sort({ updatedAt: 1 })
        .limit(50)
        .lean();

      let missingCount = 0;
      let awaitingVerificationCount = 0;
      let verifiedCount = 0;
      let unconfirmedCount = 0;

      const categorizedLeads = leads.map((l: any) => {
        const daysSinceLastActivity = Math.max(
          0,
          Math.round(
            (Date.now() - new Date(l.updatedAt || l.createdAt).getTime()) / (1000 * 60 * 60 * 24)
          )
        );

        const hasAudioObj = Boolean(l.vigilanceDetails?.audio);
        const hasUrl = Boolean(
          l.vigilanceDetails?.audio?.url && l.vigilanceDetails.audio.url.trim().length > 0
        );
        const isCompleted = Boolean(l.vigilanceDetails?.completedAt);

        let audioStatus: "missing" | "uploaded_awaiting_verification" | "verified" | "cannot_be_confirmed" =
          "cannot_be_confirmed";
        let evidence = "";

        if (!hasAudioObj || !hasUrl) {
          audioStatus = "missing";
          missingCount++;
          evidence = !hasAudioObj
            ? "vigilanceDetails.audio subdocument is null/absent in database"
            : "vigilanceDetails.audio.url is missing or blank";
        } else if (hasUrl && !isCompleted) {
          audioStatus = "uploaded_awaiting_verification";
          awaitingVerificationCount++;
          const file =
            l.vigilanceDetails.audio.fileName ||
            l.vigilanceDetails.audio.originalName ||
            "audio recording";
          const uploader = l.vigilanceDetails.audio.uploadedBy || "officer";
          evidence = `Audio recording '${file}' uploaded by ${uploader}; awaiting verification`;
        } else if (isCompleted) {
          audioStatus = "verified";
          verifiedCount++;
          const verifier = l.vigilanceDetails.completedBy || "vigilance officer";
          evidence = `Verified by ${verifier} on ${l.vigilanceDetails.completedAt}`;
        } else {
          audioStatus = "cannot_be_confirmed";
          unconfirmedCount++;
          evidence = "Audio metadata cannot be confirmed from database fields";
        }

        return {
          leadId: l.leadCode,
          companyName: l.name,
          stage: l.currentDepartment,
          status: l.status,
          daysSinceLastActivity,
          audioStatus,
          evidence,
        };
      });

      return {
        totalVigilanceLeads: leads.length,
        missingAudioCount: missingCount,
        awaitingVerificationCount,
        verifiedCount,
        unconfirmedCount,
        leads: categorizedLeads,
      };
    }

    default:
      return { error: "Unknown tool identifier" };
  }
}

export interface ChatHistoryMessage {
  role: "user" | "model" | "assistant";
  content: string;
}

/**
 * Normalizes multi-turn chat history for OpenRouter conversation:
 * - Drops invalid/empty messages
 * - Maps "model" role to "assistant"
 * - Deduplicates consecutive user messages with identical content
 * - Strips any trailing user message that duplicates the current question
 * - Bounded to the most recent conversation turns
 */
export function normalizeChatHistory(
  history: ChatHistoryMessage[] = [],
  currentQuestion?: string
): OpenRouterChatMessage[] {
  if (!Array.isArray(history) || history.length === 0) {
    return [];
  }

  const normalized: OpenRouterChatMessage[] = [];
  const cleanQ = (currentQuestion || "").trim().toLowerCase();

  for (const item of history) {
    if (!item || typeof item.content !== "string") continue;
    const content = item.content.trim();
    if (!content) continue;

    const role: "user" | "assistant" =
      item.role === "assistant" || item.role === "model" ? "assistant" : "user";

    // Deduplicate consecutive user messages with identical text
    if (normalized.length > 0) {
      const prev = normalized[normalized.length - 1];
      if (prev.role === "user" && role === "user") {
        if (prev.content.trim().toLowerCase() === content.toLowerCase()) {
          continue;
        }
      }
    }

    normalized.push({ role, content });
  }

  // Strip trailing user message if it duplicates the current question
  if (cleanQ) {
    while (
      normalized.length > 0 &&
      normalized[normalized.length - 1].role === "user" &&
      normalized[normalized.length - 1].content.trim().toLowerCase() === cleanQ
    ) {
      normalized.pop();
    }
  }

  return normalized.slice(-8);
}

export interface CommandCenterRequest {
  question: string;
  history?: ChatHistoryMessage[];
  user: IAuthUser;
}

export interface CommandCenterResponse {
  answer: string;
  toolsUsed: string[];
  crmContext: Record<string, any>;
  correlationId: string;
  suggestedFollowUps: string[];
  disclaimer: string;
}

export const CommandCenterResponseSchema = z.object({
  answer: z.string().max(4000),
  toolsUsed: z.array(z.string()).optional().default([]),
  suggestedFollowUps: z.array(z.string()).max(4).optional().default([]),
  disclaimer: z.string().optional().default(""),
});

export class CommandCenterService {
  static async answer(req: CommandCenterRequest): Promise<CommandCenterResponse> {
    const { question, history = [], user } = req;
    const correlationId = crypto.randomUUID();

    if (!isOpenRouterConfigured() || !openRouterEnv.AI_FEATURES_ENABLED) {
      throw new OpenRouterConfigError(
        "OpenRouter AI provider is not configured on the server. Please set OPENROUTER_API_KEY in the server environment (backend/.env) to enable the VA Nexus AI Command Center."
      );
    }

    try {
      // Step 1: Tool relevance selection scoped to user question
      const qLower = question.toLowerCase();
      let toolsToCall: AllowedCrmTool[] = ["get_stage_counts"];

      const isVigilanceMentioned = qLower.includes("vigilance");
      const isAudioMentioned =
        qLower.includes("audio") ||
        qLower.includes("recording") ||
        qLower.includes("call recording") ||
        qLower.includes("voice");
      const isMissingMentioned =
        qLower.includes("without") ||
        qLower.includes("missing") ||
        qLower.includes("no audio") ||
        qLower.includes("not uploaded") ||
        qLower.includes("lack");
      const isStalledMentioned =
        qLower.includes("stall") ||
        qLower.includes("stuck") ||
        qLower.includes("delay") ||
        qLower.includes("bottleneck");

      if ((isVigilanceMentioned || isAudioMentioned) && isMissingMentioned) {
        toolsToCall = ["get_vigilance_leads_without_audio", "get_vigilance_audio_status_summary"];
      } else if (isVigilanceMentioned && (isAudioMentioned || isStalledMentioned)) {
        toolsToCall = ["get_vigilance_leads_without_audio", "get_vigilance_audio_status_summary"];
      } else if (isVigilanceMentioned) {
        toolsToCall = ["get_vigilance_audio_status_summary", "get_stage_counts"];
      } else if (isAudioMentioned) {
        toolsToCall = ["get_vigilance_audio_status_summary"];
      } else if (isStalledMentioned) {
        toolsToCall = ["get_stalled_leads"];
      } else if (
        qLower.includes("conversion") ||
        qLower.includes("rate") ||
        qLower.includes("win") ||
        qLower.includes("close")
      ) {
        toolsToCall = ["get_conversion_rate", "get_stage_counts"];
      } else if (
        qLower.includes("my") ||
        qLower.includes("assign") ||
        qLower.includes("allocated") ||
        qLower.includes("work")
      ) {
        toolsToCall = ["get_my_assigned_leads"];
      } else if (qLower.includes("recent") || qLower.includes("latest") || qLower.includes("new")) {
        toolsToCall = ["get_recent_leads"];
      } else if (qLower.includes("status")) {
        toolsToCall = ["get_leads_by_status", "get_stage_counts"];
      }

      // Step 2: Execute safe, pre-approved read-only tools strictly scoped to user role
      const crmContext: Record<string, any> = {};
      for (const tool of toolsToCall) {
        try {
          crmContext[tool] = await executeSafeTool(tool, user);
        } catch (toolErr: any) {
          crmContext[tool] = { error: toolErr?.message || "Unavailable" };
        }
      }

      // Step 3: Build multi-turn OpenRouter conversation with role grounding & context
      const systemInstruction = `You are the VA Nexus AI Operations Assistant for Venture Automation Nexus (Tagline: Connect. Automate. Accelerate.).
Role constraints & grounding rules:
- Authorized User: ${user.name} (${user.role})
- You must ground your answer strictly on the provided live CRM data snapshot and verified conversation context.
- NEVER generate arbitrary database queries, MongoDB operators, shell commands, or executable code for the user.
- Do not fabricate numbers, conversion stats, or lead records. If data is not available in the snapshot, state that clearly.
- Clearly distinguish verified database facts from analytical observations or recommendations.
- Respect the sequential department pipeline: Marketing -> Communication -> Vigilance -> Support -> Sales -> Claimed.
- Never output internal chain-of-thought or private reasoning. Provide only the clear final response.
- Return ONLY valid JSON adhering strictly to the required schema.`;

      const conversationMessages: OpenRouterChatMessage[] = [
        { role: "system", content: systemInstruction },
      ];

      // Include normalized prior conversation turns (avoiding duplicate user turns)
      const normalizedPriorTurns = normalizeChatHistory(history, question);
      conversationMessages.push(...normalizedPriorTurns);

      // Current user turn with live CRM context snapshot
      const currentTurnPrompt = `Current User Question: "${question.replace(/"/g, "'")}"

Live Authorized CRM Data Snapshot for ${user.role} (VA Nexus):
${JSON.stringify(crmContext, null, 2)}

Provide a helpful, precise, executive-ready response grounded strictly in this live data snapshot.

MANDATORY ACCURACY & FORMATTING RULES:
1. Format your "answer" as clean, beautifully rendered GitHub-Flavored Markdown (GFM).
2. When presenting leads or comparable records (especially for stalled leads or leads in Vigilance without audio), you MUST include a clean Markdown table with headers:
   | Lead ID | Company Name | Stage / Status | Days Stalled | Audio Status | Evidence |
   |---|---|---|---|---|---|
   Ensure every row is on its own separate line with a newline character.
3. Bold key terms using double asterisks (e.g. **Vigilance**, **Missing Audio**, **Awaiting Verification**).
4. For questions regarding Vigilance audio status:
   - If asked for leads in Vigilance without audio, report ONLY leads that meet both conditions: currently in the Vigilance stage, and recording data confirms audio is missing.
   - Distinguish strictly between:
     * 'missing': audio is not uploaded or URL is empty.
     * 'uploaded_awaiting_verification': audio file is present but verification completedAt is not yet set.
     * 'verified': verification completedAt is set (lead has completed vigilance).
   - If audio metadata cannot be determined, explicitly state that it cannot be confirmed.
   - Cite the exact evidence from the data snapshot (e.g., "vigilanceDetails.audio is null/absent in database").
   - Do NOT equate general lead stalling with missing audio.
5. Ground all lead counts, names, and IDs in the snapshot. Never fabricate records.
6. The "answer" field MUST be a clean Markdown string. Never return an escaped JSON string or nested JSON object inside "answer".
7. CRITICAL JSON ESCAPING: Inside the "answer" string, if you quote terms, use single quotes 'like this' or escaped quotes \\"like this\\". NEVER output unescaped double quotes that break JSON syntax.

Return ONLY a valid JSON object matching this schema:
{
  "answer": "Clean Markdown string with table and formatting",
  "toolsUsed": ${JSON.stringify(toolsToCall)},
  "suggestedFollowUps": ["Concise relevant follow-up question 1", "Concise relevant follow-up question 2"],
  "disclaimer": "Live data analysis for ${user.role} in VA Nexus via OpenRouter. Verified against CRM records."
}`;

      conversationMessages.push({
        role: "user",
        content: currentTurnPrompt,
      });

      // Step 4: Call OpenRouter API with reasoning enabled
      const answerResponse = await callOpenRouter({
        messages: conversationMessages,
        taskType: "command_center",
        correlationId,
      });

      // Step 5: Parse response and strip any internal reasoning
      let answerText = "";
      let reportedTools = toolsToCall;
      let followUps: string[] = [];
      let disclaimer = `Live data analysis for ${user.role} in VA Nexus via OpenRouter (${answerResponse.model}). Verified against CRM records.`;

      try {
        const parsed = parseOpenRouterJson<any>(answerResponse.content, correlationId);
        const validated = CommandCenterResponseSchema.parse(parsed);
        answerText = stripInternalReasoning(validated.answer);
        answerText = unwrapJsonAnswer(answerText);
        if (validated.toolsUsed && validated.toolsUsed.length > 0) {
          reportedTools = validated.toolsUsed as AllowedCrmTool[];
        }
        if (validated.suggestedFollowUps && validated.suggestedFollowUps.length > 0) {
          followUps = validated.suggestedFollowUps;
        }
        if (validated.disclaimer) {
          disclaimer = validated.disclaimer;
        }
      } catch (parseErr: any) {
        logger.warn(
          {
            correlationId,
            parseError: parseErr?.message,
            rawSnippet: answerResponse.content.slice(0, 300),
          },
          "Command Center JSON parse or validation failed; attempting resilient recovery"
        );

        const extracted = extractFieldsFromMalformedJson(answerResponse.content);
        if (extracted.answer) {
          answerText = unwrapJsonAnswer(extracted.answer);
          if (extracted.toolsUsed.length > 0) {
            reportedTools = extracted.toolsUsed as AllowedCrmTool[];
          }
          if (extracted.suggestedFollowUps.length > 0) {
            followUps = extracted.suggestedFollowUps;
          }
          if (extracted.disclaimer) {
            disclaimer = extracted.disclaimer;
          }
        } else {
          // If model returned direct non-JSON text, clean it of any internal reasoning and unwrap
          answerText = stripInternalReasoning(answerResponse.content);
          answerText = unwrapJsonAnswer(answerText);
          if (!answerText) {
            answerText = answerResponse.content;
          }
        }
      }

      await logAiAudit({
        correlationId,
        userId: user.id,
        userRole: user.role,
        action: "command_center_query",
        taskType: "command_center",
        model: answerResponse.model,
        latencyMs: answerResponse.latencyMs,
        state: "success",
      });

      // Important: Never send reasoningDetails to the client
      return {
        answer: answerText,
        toolsUsed: reportedTools,
        crmContext,
        correlationId,
        suggestedFollowUps: followUps,
        disclaimer,
      };
    } catch (err: any) {
      logger.error(
        {
          correlationId,
          userId: user.id,
          userRole: user.role,
          upstreamStatus: err?.status,
          finishReason: err?.finishReason,
          openRouterError: err?.message,
          errorStack: err?.stack,
          errorName: err?.name,
        },
        "Command Center OpenRouter query processing failed"
      );

      await logAiAudit({
        correlationId,
        userId: user.id,
        userRole: user.role,
        action: "command_center_error",
        taskType: "command_center",
        model: openRouterEnv.OPENROUTER_MODEL,
        state: "failure",
        errorCode: err?.name,
      });

      // Preserve specific OpenRouter error types so error middleware sends the correct status code
      if (
        err?.name === "OpenRouterConfigError" ||
        err?.name === "OpenRouterRateLimitError" ||
        err?.name === "OpenRouterTimeoutError" ||
        err?.name === "OpenRouterApiError" ||
        err instanceof OpenRouterConfigError ||
        err instanceof OpenRouterRateLimitError ||
        err instanceof OpenRouterTimeoutError ||
        err instanceof OpenRouterApiError
      ) {
        throw err;
      }

      // Never silently return a fake canned answer! Propagate error with actionable message
      throw new OpenRouterApiError(
        err?.message ||
          "Unable to generate response from OpenRouter AI. Please verify your connection and API key configuration, then try again.",
        err?.status || 500,
        undefined,
        err?.finishReason,
        correlationId
      );
    }
  }
}
