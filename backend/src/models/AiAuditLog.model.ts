import mongoose, { Document, Schema, Model } from "mongoose";

export interface IAiAuditLog extends Document {
  correlationId: string;
  userId: mongoose.Types.ObjectId;
  userRole: string;
  action: string;
  resourceId?: string;
  taskType: string;
  aiModel: string;
  latencyMs?: number;
  state: "success" | "failure" | "denied";
  errorCode?: string;
  ip?: string;
  createdAt: Date;
}

const AiAuditLogSchema = new Schema<IAiAuditLog>(
  {
    correlationId: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    userRole: { type: String, required: true },
    action: { type: String, required: true },
    resourceId: { type: String },
    taskType: { type: String, required: true },
    aiModel: { type: String, required: true },
    latencyMs: { type: Number },
    state: { type: String, enum: ["success", "failure", "denied"], required: true },
    errorCode: { type: String },
    ip: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

AiAuditLogSchema.index({ userId: 1, createdAt: -1 });
AiAuditLogSchema.index({ resourceId: 1, taskType: 1 });
AiAuditLogSchema.index({ createdAt: -1 });

export const AiAuditLog: Model<IAiAuditLog> =
  mongoose.models.AiAuditLog || mongoose.model<IAiAuditLog>("AiAuditLog", AiAuditLogSchema);
