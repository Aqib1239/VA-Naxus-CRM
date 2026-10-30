import { api } from "./api";

export type TranscriptionStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
export type SpeakerRole = "AGENT" | "CUSTOMER" | "UNKNOWN";

export interface TranscriptWord {
  word: string;
  start: number;
  end: number;
  confidence: number;
  speaker?: number;
  punctuated_word?: string;
}

export interface TranscriptParagraph {
  speaker?: number;
  text: string;
  start: number;
  end: number;
  numWords?: number;
}

export interface TranscriptUtterance {
  id?: string;
  speaker?: number;
  transcript: string;
  start: number;
  end: number;
  confidence?: number;
  words?: TranscriptWord[];
}

export interface SpeakerMapping {
  speakerId: number;
  role: SpeakerRole;
  assignedBy?: string;
  assignedAt?: string;
}

export interface TranscriptionAiAnalysis {
  summary: string;
  customerObjections: string[];
  customerInterestAndIntent: string;
  agentCommunicationQuality: string;
  unansweredQuestions: string[];
  commitments: string[];
  suggestedNextActions: string[];
  callOutcome?: string;
  analyzedAt: string;
  analyzedModel: string;
}

export interface TranscriptionData {
  id: string;
  leadId: string;
  recordingId: string;
  audioUrl: string;
  status: TranscriptionStatus;
  provider: string;
  model: string;
  language: string;
  detectedLanguage?: string;
  fullTranscript: string;
  confidence?: number;
  audioDurationSeconds?: number;
  paragraphs: TranscriptParagraph[];
  utterances: TranscriptUtterance[];
  words: TranscriptWord[];
  speakers: SpeakerMapping[];
  speakerMappings: SpeakerMapping[];
  processingStartedAt?: string;
  processingCompletedAt?: string;
  failureReason?: string;
  retryCount: number;
  aiAnalysis?: TranscriptionAiAnalysis;
  createdAt: string;
  updatedAt: string;
}

export interface TranscriptionStatusResponse {
  jobId: string;
  status: TranscriptionStatus;
  failureReason?: string;
  retryCount: number;
  processingStartedAt?: string;
  processingCompletedAt?: string;
  confidence?: number;
  detectedLanguage?: string;
}

export const transcriptionService = {
  /**
   * Start or retrieve transcription for a lead's audio recording.
   */
  async startTranscription(leadId: string, force: boolean = false): Promise<{
    jobId: string;
    status: TranscriptionStatus;
    alreadyCompleted: boolean;
    transcription: TranscriptionData;
  }> {
    const res = await api.post<{
      jobId: string;
      status: TranscriptionStatus;
      alreadyCompleted: boolean;
      transcription: TranscriptionData;
    }>(`/transcription/leads/${leadId}/start${force ? "?force=true" : ""}`, { force });
    return res.data;
  },

  /**
   * Check status of a transcription job.
   */
  async getTranscriptionStatus(leadId: string): Promise<TranscriptionStatusResponse | null> {
    try {
      const res = await api.get<TranscriptionStatusResponse>(`/transcription/leads/${leadId}/status`);
      return res.data;
    } catch (err: any) {
      if (err?.status === 404) return null;
      throw err;
    }
  },

  /**
   * Fetch complete transcription data with speakers, timestamps, words, and optional AI analysis.
   */
  async getTranscription(leadId: string): Promise<TranscriptionData | null> {
    try {
      const res = await api.get<{ transcription: TranscriptionData }>(`/transcription/leads/${leadId}`);
      return res.data.transcription;
    } catch (err: any) {
      if (err?.status === 404) return null;
      throw err;
    }
  },

  /**
   * Retry a failed transcription job.
   */
  async retryTranscription(leadId: string): Promise<{ jobId: string; status: TranscriptionStatus; retryCount: number }> {
    const res = await api.post<{
      jobId: string;
      status: TranscriptionStatus;
      retryCount: number;
    }>(`/transcription/leads/${leadId}/retry`);
    return res.data;
  },

  /**
   * Update manual speaker role mappings (Speaker 0 -> Agent, Speaker 1 -> Customer, etc.)
   */
  async updateSpeakerMappings(
    leadId: string,
    mappings: Array<{ speakerId: number; role: SpeakerRole }>
  ): Promise<{ speakers: SpeakerMapping[]; speakerMappings: SpeakerMapping[] }> {
    const res = await api.put<{
      speakers: SpeakerMapping[];
      speakerMappings: SpeakerMapping[];
    }>(`/transcription/leads/${leadId}/speakers`, { mappings });
    return res.data;
  },

  /**
   * Trigger optional OpenRouter AI call analysis on the completed verbatim transcript.
   */
  async analyzeTranscript(leadId: string): Promise<{ aiAnalysis: TranscriptionAiAnalysis }> {
    const res = await api.post<{ aiAnalysis: TranscriptionAiAnalysis }>(`/transcription/leads/${leadId}/analyze`);
    return res.data;
  },
};
