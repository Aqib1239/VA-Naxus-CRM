import { api } from "./api";

export interface LeadIntelligenceResult {
  priorityScore: number;
  scoreCategory: "hot" | "warm" | "cold" | "stalled";
  scoringFactors: Array<{
    factor: string;
    impact: "positive" | "negative" | "neutral";
    detail: string;
  }>;
  qualificationSummary: string;
  missingFields: string[];
  nextBestActions: Array<{
    action: string;
    rationale: string;
    urgency: "high" | "medium" | "low";
  }>;
  inactivityDays: number | null;
  inactivityRisk: "high" | "medium" | "low" | "none";
  analysisTimestamp: string;
  disclaimer: string;
}

export interface CommandCenterResponse {
  answer: string;
  toolsUsed: string[];
  crmContext: Record<string, any>;
  correlationId: string;
  suggestedFollowUps: string[];
  disclaimer: string;
}

export interface SalesCopilotResult {
  talkingPoints: string[];
  followUpDraft: string;
  objectionHandling: Array<{ objection: string; response: string }>;
  callScript: string;
  recommendedNextAction: { action: string; rationale: string; timing: string };
  disclaimer: string;
  requiresApproval: true;
}

export interface VigilanceCopilotResult {
  overallFinding: "proceed" | "flag_for_review" | "insufficient_evidence";
  checks: Array<{
    requirement: string;
    status: "verified" | "failed" | "incomplete" | "inconclusive";
    evidenceReference: string;
    explanation: string;
    uncertainty: "high" | "medium" | "low" | "none";
    recommendedHumanAction: string;
  }>;
  summary: string;
  mandatoryHumanVerificationRequired: true;
  disclaimer: string;
  analysisTimestamp: string;
}

export interface SupportCopilotResult {
  checklistStatus: {
    dateVerified: boolean;
    timeVerified: boolean;
    addressVerified: boolean;
    audioPresent: boolean;
    vigilanceCompleted: boolean;
  };
  missingRequirements: string[];
  workflowBlockers: string[];
  permittedNextActions: Array<{ action: string; condition: string; permitted: boolean }>;
  summary: string;
  readyForAllocation: boolean;
  disclaimer: string;
}

export interface AudioIntelligenceResult {
  transcription: string;
  speakerSegments: Array<{
    speaker: string;
    text: string;
    timestamp?: string;
  }>;
  summary: string;
  customerRequirements: string[];
  objections: string[];
  commitments: string[];
  nextSteps: string[];
  callOutcome: "meeting_confirmed" | "follow_up_needed" | "rescheduled" | "inconclusive";
  uncertainPassages: string[];
  audioDurationSeconds?: number;
  calculationMethod?: string;
  analysisTimestamp: string;
  disclaimer: string;
}

export interface ChatHistoryMessage {
  role: "user" | "model" | "assistant";
  content: string;
}

export const aiService = {
  async getLeadIntelligence(leadId: string): Promise<LeadIntelligenceResult> {
    const res = await api.get<{ analysis: LeadIntelligenceResult }>(`/ai/leads/${leadId}/intelligence`);
    return res.data.analysis;
  },

  async queryCommandCenter(
    question: string,
    history?: ChatHistoryMessage[]
  ): Promise<CommandCenterResponse> {
    const res = await api.post<CommandCenterResponse>("/ai/command-center", {
      question,
      history,
    });
    return res.data;
  },

  async getSalesCopilot(leadId: string): Promise<SalesCopilotResult> {
    const res = await api.get<{ copilot: SalesCopilotResult }>(`/ai/leads/${leadId}/sales-copilot`);
    return res.data.copilot;
  },

  async getVigilanceCopilot(leadId: string): Promise<VigilanceCopilotResult> {
    const res = await api.get<{ copilot: VigilanceCopilotResult }>(`/ai/leads/${leadId}/vigilance-copilot`);
    return res.data.copilot;
  },

  async getSupportCopilot(leadId: string): Promise<SupportCopilotResult> {
    const res = await api.get<{ copilot: SupportCopilotResult }>(`/ai/leads/${leadId}/support-copilot`);
    return res.data.copilot;
  },

  async transcribeAudio(leadId: string, force: boolean = false): Promise<AudioIntelligenceResult> {
    const res = await api.post<{ transcription: AudioIntelligenceResult }>(
      `/ai/leads/${leadId}/transcribe${force ? "?force=true" : ""}`,
      { force }
    );
    return res.data.transcription;
  },

  async getAudioTranscription(leadId: string): Promise<AudioIntelligenceResult | null> {
    try {
      const res = await api.get<{ transcription: AudioIntelligenceResult }>(
        `/ai/leads/${leadId}/transcription`
      );
      return res.data.transcription;
    } catch (err: any) {
      if (err?.status === 404) return null;
      throw err;
    }
  },
};
