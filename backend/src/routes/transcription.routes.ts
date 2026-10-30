import { Router } from "express";
import { TranscriptionController } from "../controllers/transcription.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { requireRole } from "../middleware/role.middleware";
import { aiLimiter } from "../middleware/rateLimit.middleware";
import { ROLES } from "../constants/roles";

const router = Router();

// All transcription routes require an authenticated user with appropriate department access
router.use(requireAuth);
router.use(requireRole(ROLES.VIGILANCE, ROLES.SUPPORT, ROLES.SALES, ROLES.ADMIN));

// 1. Start or retrieve transcription job
router.post("/leads/:id/start", aiLimiter, TranscriptionController.startTranscription);

// 2. Get transcription status (PENDING, PROCESSING, COMPLETED, FAILED)
router.get("/leads/:id/status", aiLimiter, TranscriptionController.getTranscriptionStatus);

// 3. Get full transcription result (including speaker mappings, utterances, words)
router.get("/leads/:id", aiLimiter, TranscriptionController.getTranscriptionResult);

// 4. Retry failed transcription
router.post("/leads/:id/retry", aiLimiter, TranscriptionController.retryTranscription);

// 5. Update speaker mappings (e.g. Speaker 0 -> AGENT, Speaker 1 -> CUSTOMER)
router.put("/leads/:id/speakers", aiLimiter, TranscriptionController.updateSpeakerMappings);

// 6. Optional OpenRouter transcript analysis (separate from transcription)
router.post("/leads/:id/analyze", aiLimiter, TranscriptionController.analyzeTranscript);

export default router;
