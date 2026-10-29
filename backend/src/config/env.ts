import { z } from "zod";
import dotenv from "dotenv";
import path from "path";

// Load .env file
dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z
    .string()
    .default("5000")
    .transform((val) => parseInt(val, 10)),
  MONGO_URI: z
    .string()
    .default("")
    .transform((val) => val || process.env.MONGODB_URI || process.env.MONGO_URI || ""),
  MONGODB_URI: z
    .string()
    .default("")
    .transform((val) => val || process.env.MONGODB_URI || process.env.MONGO_URI || ""),
  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters").default("vibhanu_crm_super_secure_jwt_secret_key_2026_dev_prod"),
  JWT_EXPIRES_IN: z.string().default("7d"),
  CLIENT_URL: z.string().default("http://localhost:3000"),
  UPLOAD_DIR: z.string().default("./uploads"),
  MAX_AUDIO_FILE_SIZE: z
    .string()
    .default("15728640")
    .transform((val) => parseInt(val, 10)),
  CLOUDINARY_CLOUD_NAME: z.string().default("").transform((val) => val || process.env.CLOUDINARY_CLOUD_NAME || ""),
  CLOUDINARY_API_KEY: z.string().default("").transform((val) => val || process.env.CLOUDINARY_API_KEY || ""),
  CLOUDINARY_API_SECRET: z.string().default("").transform((val) => val || process.env.CLOUDINARY_API_SECRET || ""),
  OPENROUTER_API_KEY: z.string().default("").transform((val) => val || process.env.OPENROUTER_API_KEY || ""),
  OPENROUTER_MODEL: z
    .string()
    .default("nvidia/nemotron-3.5-lightning:free")
    .transform((val) => val || process.env.OPENROUTER_MODEL || "nvidia/nemotron-3.5-lightning:free"),
  OPENROUTER_BASE_URL: z
    .string()
    .default("https://openrouter.ai/api/v1")
    .transform((val) => val || process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1"),
  OPENROUTER_TIMEOUT_MS: z
    .string()
    .default("35000")
    .transform((val) => parseInt(val, 10) || 35000),
  OPENROUTER_MAX_RETRIES: z
    .string()
    .default("2")
    .transform((val) => parseInt(val, 10) || 2),
  OPENROUTER_MAX_TOKENS: z
    .string()
    .default("4096")
    .transform((val) => parseInt(val, 10) || 4096),
  GEMINI_API_KEY: z.string().default("").transform((val) => val || process.env.GEMINI_API_KEY || ""),
  GEMINI_MODEL: z.string().default("gemini-3.8-flash").transform((val) => val || process.env.GEMINI_MODEL || "gemini-3.8-flash"),
  GEMINI_EMBEDDING_MODEL: z.string().default("text-embedding-004").transform((val) => val || process.env.GEMINI_EMBEDDING_MODEL || "text-embedding-004"),
  GEMINI_TIMEOUT_MS: z
    .string()
    .default("30000")
    .transform((val) => parseInt(val, 10) || 30000),
  GEMINI_MAX_RETRIES: z
    .string()
    .default("3")
    .transform((val) => parseInt(val, 10) || 3),
  AI_FEATURES_ENABLED: z
    .string()
    .default("true")
    .transform((val) => (val === "true" || val === "1" || val === "yes")),
  AI_MONTHLY_BUDGET_USD: z
    .string()
    .default("50")
    .transform((val) => parseFloat(val) || 50),
});

export type EnvConfig = z.infer<typeof envSchema>;

function validateEnv(): EnvConfig {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error("❌ Invalid environment variables:", JSON.stringify(result.error.format(), null, 2));
    throw new Error("Invalid environment configuration. Check your .env file.");
  }

  return result.data;
}

export const env = validateEnv();
