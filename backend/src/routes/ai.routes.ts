import { Router } from "express";
import { AiController } from "../controllers/ai.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { requireRole } from "../middleware/role.middleware";
import { aiLimiter } from "../middleware/rateLimit.middleware";
import { ROLES } from "../constants/roles";

const router = Router();

// All AI routes require an authenticated user
router.use(requireAuth);

// 1. AI Subsystem Health (Admin only)
router.get("/health", requireRole(ROLES.ADMIN), AiController.aiHealth);

// 2. AI Audit Trail (Admin only)
router.get("/audit-logs", requireRole(ROLES.ADMIN), AiController.getAuditLogs);

// 3. AI Command Center Query (All authenticated roles; data is scoped by RBAC inside)
router.post("/command-center", aiLimiter, AiController.queryCommandCenter);

// 4. Lead Intelligence Scoring & Factor Extraction (RBAC enforced by lead department access)
router.get("/leads/:id/intelligence", aiLimiter, AiController.getLeadIntelligence);

// 5. Sales Copilot (Sales + Admin)
router.get(
  "/leads/:id/sales-copilot",
  requireRole(ROLES.SALES, ROLES.ADMIN),
  aiLimiter,
  AiController.getSalesCopilot
);

// 6. Vigilance Copilot (Vigilance + Admin)
router.get(
  "/leads/:id/vigilance-copilot",
  requireRole(ROLES.VIGILANCE, ROLES.ADMIN),
  aiLimiter,
  AiController.getVigilanceCopilot
);

// 7. Support Copilot (Support + Admin)
router.get(
  "/leads/:id/support-copilot",
  requireRole(ROLES.SUPPORT, ROLES.ADMIN),
  aiLimiter,
  AiController.getSupportCopilot
);

// 8. Audio Transcription (Vigilance, Support, Sales, Admin)
router.post(
  "/leads/:id/transcribe",
  requireRole(ROLES.VIGILANCE, ROLES.SUPPORT, ROLES.SALES, ROLES.ADMIN),
  aiLimiter,
  AiController.transcribeLeadAudio
);

// 9. Get Cached Transcription
router.get(
  "/leads/:id/transcription",
  requireRole(ROLES.VIGILANCE, ROLES.SUPPORT, ROLES.SALES, ROLES.ADMIN),
  aiLimiter,
  AiController.getLeadAudioTranscription
);

export default router;
