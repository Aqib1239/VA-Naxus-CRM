import mongoose, { Document, Schema, Model } from "mongoose";

export type AiTaskType =
  | "lead_intelligence"
  | "audio_transcription"
  | "audio_summary"
  | "vigilance_copilot"
  | "support_copilot"
  | "sales_copilot"
  | "command_center"
  | "workflow_intelligence"
  | "analytics_narration";

export type AiProcessingState = "queued" | "processing" | "completed" | "failed" | "retrying";

export interface IAiAnalysis extends Document {
  sourceRecordId: mongoose.Types.ObjectId;
  sourceModel: string;
  taskType: AiTaskType;
  aiModel: string;
  correlationId: string;
  state: AiProcessingState;
  result?: Record<string, unknown>;
  error?: { message: string; code?: string };
  requestedBy: mongoose.Types.ObjectId;
  requestedByRole: string;
  latencyMs?: number;
  retries?: number;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AiAnalysisSchema = new Schema<IAiAnalysis>(
  {
    sourceRecordId: { type: Schema.Types.ObjectId, required: true, index: true },
    sourceModel: { type: String, required: true, default: "Lead" },
    taskType: { type: String, required: true, index: true },
    aiModel: { type: String, required: true },
    correlationId: { type: String, required: true, index: true },
    state: {
      type: String,
      enum: ["queued", "processing", "completed", "failed", "retrying"],
      default: "queued",
      index: true,
    },
    result: { type: Schema.Types.Mixed },
    error: {
      message: { type: String },
      code: { type: String },
    },
    requestedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    requestedByRole: { type: String, required: true },
    latencyMs: { type: Number },
    retries: { type: Number, default: 0 },
    expiresAt: { type: Date },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret: any) {
        ret.id = ret._id?.toString() || ret.id;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

AiAnalysisSchema.index({ sourceRecordId: 1, taskType: 1 });
AiAnalysisSchema.index({ createdAt: -1 });
AiAnalysisSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const AiAnalysis: Model<IAiAnalysis> =
  mongoose.models.AiAnalysis || mongoose.model<IAiAnalysis>("AiAnalysis", AiAnalysisSchema);
