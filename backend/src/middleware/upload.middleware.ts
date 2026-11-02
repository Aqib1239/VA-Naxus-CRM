import multer from "multer";
import path from "path";
import crypto from "crypto";
import { Request } from "express";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import { cloudinary } from "../config/cloudinary";

// ─────────────────────────────────────────────────────────────
// Allowed audio types (kept identical to your previous config)
// ─────────────────────────────────────────────────────────────
const ALLOWED_MIME_TYPES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/wave",
  "audio/x-wav",
  "audio/ogg",
  "audio/webm",
  "audio/mp4",
  "audio/aac",
  "audio/x-m4a",
  "audio/m4a",
  "audio/flac",
]);

const ALLOWED_EXTENSIONS = new Set([
  ".mp3", ".wav", ".ogg", ".webm", ".mp4", ".m4a", ".aac", ".flac",
]);

// ─────────────────────────────────────────────────────────────
// Cloudinary storage engine
// Audio is treated as `resource_type: "video"` in Cloudinary —
// this is required, otherwise audio uploads are rejected.
// ─────────────────────────────────────────────────────────────
const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req: Request, file) => {
    const rawExt = path.extname(file.originalname).toLowerCase();
    const ext = ALLOWED_EXTENSIONS.has(rawExt) ? rawExt.replace(".", "") : "mp3";

    const leadId = req.params.id || "lead";
    const sanitizedLeadId = leadId.replace(/[^a-zA-Z0-9-_]/g, "_");
    const uniqueSuffix = `${Date.now()}_${crypto.randomBytes(6).toString("hex")}`;

    return {
      folder: "vibhanu-crm/audio",
      resource_type: "video",          // ← REQUIRED for audio
      type: "authenticated",           // Authenticated delivery: accessible exclusively via signed URLs on backend proxy
      format: ext,
      public_id: `audio_${sanitizedLeadId}_${uniqueSuffix}`,
    };
  },
});

// ─────────────────────────────────────────────────────────────
// Multer instance — same shape/API as before, so nothing else
// in the codebase needs to change (audioUpload.single("audio")).
// ─────────────────────────────────────────────────────────────
export const audioUpload = multer({
  storage,
  limits: {
    fileSize: env.MAX_AUDIO_FILE_SIZE,
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const mime = file.mimetype.toLowerCase();

    if (!ALLOWED_MIME_TYPES.has(mime) && !ALLOWED_EXTENSIONS.has(ext)) {
      logger.warn(
        { mime, ext, originalName: file.originalname },
        "Rejected non-audio file upload"
      );
      const err: any = new Error(
        "Invalid audio file format. Allowed formats: MP3, WAV, OGG, WEBM, M4A, AAC, FLAC."
      );
      err.statusCode = 400;
      return cb(err);
    }

    cb(null, true);
  },
});