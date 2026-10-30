import mongoose, { Document, Schema, Model } from "mongoose";

export type TranscriptionStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
export type SpeakerRole = "AGENT" | "CUSTOMER" | "UNKNOWN";

export interface ITranscriptWord {
  word: string;
  start: number;
  end: number;
  confidence: number;
  speaker?: number;
  punctuated_word?: string;
}

export interface ITranscriptParagraph {
  speaker?: number;
  text: string;
  start: number;
  end: number;
  numWords?: number;
}

export interface ITranscriptUtterance {
  id?: string;
  speaker?: number;
  transcript: string;
  start: number;
  end: number;
  confidence?: number;
  words?: ITranscriptWord[];
}

export interface ISpeakerMapping {
  speakerId: number;
  role: SpeakerRole;
  assignedBy?: string;
  assignedAt?: string;
}

export interface ITranscriptionAiAnalysis {
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

export interface ITranscription extends Omit<Document, "model"> {
  leadId: mongoose.Types.ObjectId;
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
  paragraphs: ITranscriptParagraph[];
  utterances: ITranscriptUtterance[];
  words: ITranscriptWord[];
  speakers: ISpeakerMapping[];
  speakerMappings: ISpeakerMapping[];
  processingStartedAt?: Date;
  processingCompletedAt?: Date;
  failureReason?: string;
  retryCount: number;
  claimedAt?: Date;
  claimedBy?: string;
  aiAnalysis?: ITranscriptionAiAnalysis;
  requestedBy?: mongoose.Types.ObjectId;
  requestedByRole?: string;
  createdAt: Date;
  updatedAt: Date;
}

const WordSchema = new Schema<ITranscriptWord>(
  {
    word: { type: String, required: true },
    start: { type: Number, required: true },
    end: { type: Number, required: true },
    confidence: { type: Number, default: 0 },
    speaker: { type: Number },
    punctuated_word: { type: String },
  },
  { _id: false }
);

const ParagraphSchema = new Schema<ITranscriptParagraph>(
  {
    speaker: { type: Number },
    text: { type: String, required: true },
    start: { type: Number, required: true },
    end: { type: Number, required: true },
    numWords: { type: Number },
  },
  { _id: false }
);

const UtteranceSchema = new Schema<ITranscriptUtterance>(
  {
    id: { type: String },
    speaker: { type: Number },
    transcript: { type: String, required: true },
    start: { type: Number, required: true },
    end: { type: Number, required: true },
    confidence: { type: Number },
    words: { type: [WordSchema], default: [] },
  },
  { _id: false }
);

const SpeakerMappingSchema = new Schema<ISpeakerMapping>(
  {
    speakerId: { type: Number, required: true },
    role: {
      type: String,
      enum: ["AGENT", "CUSTOMER", "UNKNOWN"],
      default: "UNKNOWN",
    },
    assignedBy: { type: String },
    assignedAt: { type: String },
  },
  { _id: false }
);

const AiAnalysisSchema = new Schema<ITranscriptionAiAnalysis>(
  {
    summary: { type: String, required: true },
    customerObjections: { type: [String], default: [] },
    customerInterestAndIntent: { type: String, default: "" },
    agentCommunicationQuality: { type: String, default: "" },
    unansweredQuestions: { type: [String], default: [] },
    commitments: { type: [String], default: [] },
    suggestedNextActions: { type: [String], default: [] },
    callOutcome: { type: String },
    analyzedAt: { type: String, required: true },
    analyzedModel: { type: String, required: true },
  },
  { _id: false }
);

const TranscriptionSchema = new Schema<ITranscription>(
  {
    leadId: { type: Schema.Types.ObjectId, ref: "Lead", required: true, index: true },
    recordingId: { type: String, required: true, index: true },
    audioUrl: { type: String, required: true },
    status: {
      type: String,
      enum: ["PENDING", "PROCESSING", "COMPLETED", "FAILED"],
      default: "PENDING",
      index: true,
    },
    provider: { type: String, default: "DEEPGRAM" },
    model: { type: String, default: "nova-3" },
    language: { type: String, default: "multi" },
    detectedLanguage: { type: String },
    fullTranscript: { type: String, default: "" },
    confidence: { type: Number },
    audioDurationSeconds: { type: Number },
    paragraphs: { type: [ParagraphSchema], default: [] },
    utterances: { type: [UtteranceSchema], default: [] },
    words: { type: [WordSchema], default: [] },
    speakers: { type: [SpeakerMappingSchema], default: [] },
    speakerMappings: { type: [SpeakerMappingSchema], default: [] },
    processingStartedAt: { type: Date },
    processingCompletedAt: { type: Date },
    failureReason: { type: String },
    retryCount: { type: Number, default: 0 },
    claimedAt: { type: Date },
    claimedBy: { type: String },
    aiAnalysis: { type: AiAnalysisSchema },
    requestedBy: { type: Schema.Types.ObjectId, ref: "User" },
    requestedByRole: { type: String },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret: any) {
        ret.id = ret._id ? ret._id.toString() : ret.id;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Compound indexes
TranscriptionSchema.index({ leadId: 1, recordingId: 1 });
TranscriptionSchema.index({ leadId: 1, status: 1 });
TranscriptionSchema.index({ status: 1, createdAt: 1 });
TranscriptionSchema.index({ createdAt: -1 });

export const Transcription: Model<ITranscription> =
  mongoose.models.Transcription || mongoose.model<ITranscription>("Transcription", TranscriptionSchema);
