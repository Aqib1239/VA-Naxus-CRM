import mongoose from "mongoose";
import { AiAuditLog } from "../../models/AiAuditLog.model";
import { logger } from "../../config/logger";

export interface AuditParams {
  correlationId: string;
  userId: string;
  userRole: string;
  action: string;
  taskType: string;
  model: string;
  resourceId?: string;
  latencyMs?: number;
  state: "success" | "failure" | "denied";
  errorCode?: string;
  ip?: string;
}

export async function logAiAudit(params: AuditParams): Promise<void> {
  try {
    const isValidId = mongoose.Types.ObjectId.isValid(params.userId);
    const userIdObj = isValidId
      ? new mongoose.Types.ObjectId(params.userId)
      : new mongoose.Types.ObjectId("000000000000000000000000");

    const { model, ...rest } = params;

    await AiAuditLog.create({
      ...rest,
      aiModel: model,
      userId: userIdObj,
    });
  } catch (err: any) {
    logger.warn({ err: err?.message, correlationId: params.correlationId }, "Failed to write AI audit log");
  }
}
