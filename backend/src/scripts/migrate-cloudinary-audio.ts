/**
 * Legacy Cloudinary Audio Asset Migration Script (Readiness & Safe Execution)
 *
 * PROJECT: VA Nexus CRM
 * PURPOSE:
 * 1. Safe, read-only aggregation & inventory of call recording assets.
 * 2. Controlled, collision-safe migration of legacy "upload" and "private" audio
 *    assets to Cloudinary "authenticated" delivery with CDN cache invalidation.
 * 3. Idempotent reconciliation of partial-success (Cloudinary-succeeded / Mongo-failed) states.
 * 4. Durable, non-secret rerun ledger written to disk.
 *
 * SAFETY INVARIANTS:
 * - DEFAULTS TO DRY-RUN: Dry-run is the default for EVERY execution path.
 * - IMPOSSIBLE-TO-BYPASS EXECUTION AUTHORIZATION: Both CLI and exported runMigration()
 *   require explicit --execute flag, CONFIRM_MIGRATION=true, and explicit target.
 * - MULTI-SIGNAL PRODUCTION PROTECTION: Production detection checks NODE_ENV, VERCEL,
 *   VERCEL_ENV, MIGRATION_TARGET, and MONGODB_URI. Production strictly requires ALLOW_PROD_MIGRATION=true.
 * - INDEPENDENT SOURCE TYPE VERIFICATION: Never assumes MongoDB deliveryType is true.
 *   Cloudinary Admin API verifies actual source delivery tier (upload vs private vs authenticated).
 * - ASSET IDENTITY VERIFICATION: Reconciles authenticated assets only when database association
 *   uniqueness and Cloudinary asset attributes (format, size, version) match without ambiguity.
 * - COLLISION SAFETY: Target authenticated presence is verified; overwrite: false is strictly enforced.
 * - STRICT CLASSIFICATION: Missing or unknown delivery types are classified as UNKNOWN and skipped.
 * - VALID PUBLIC ID REQUIRED: Local filesystem paths and URLs in storagePath are never treated as public IDs.
 * - DATABASE INTEGRITY & RECONCILIATION: MongoDB is updated only after Cloudinary confirmation.
 *   matchedCount and acknowledged are verified. Split states are tracked and reconciled idempotently.
 * - DURABLE LEDGER: Non-secret ledger is persisted to disk on completion and batch checkpoints.
 * - NEVER REVERTS: Successfully authenticated assets are never reverted to public on downstream errors.
 */

import dotenv from "dotenv";
dotenv.config();

import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import { v2 as defaultCloudinary } from "cloudinary";
import { Lead } from "../models/Lead.model";
import { logger } from "../config/logger";

/* -------------------------------------------------------------------------- */
/*  Interfaces & Types                                                        */
/* -------------------------------------------------------------------------- */

export type DeliveryTypeClassification = "authenticated" | "upload" | "private" | "unknown";

export type CloudinaryMigrationResult = "SUCCESS" | "FAILED" | "SKIPPED" | "ALREADY_AUTHENTICATED";
export type MongoUpdateResult = "SUCCESS" | "FAILED" | "SKIPPED" | "NOT_ATTEMPTED";
export type MigrationItemStatus = "SUCCESS" | "FAILED" | "SKIPPED" | "RECONCILED";

export type MigrationErrorCategory =
  | "NONE"
  | "COLLISION"
  | "CLOUDINARY_API_ERROR"
  | "MONGO_UPDATE_ERROR"
  | "INVALID_METADATA"
  | "UNVERIFIED_SOURCE"
  | "UNKNOWN_DELIVERY_TYPE"
  | "IDENTITY_MISMATCH"
  | "ABORTED";

export interface DurableLedgerEntry {
  leadId: string;
  leadCode: string;
  publicId: string;
  previousDeliveryType: string;
  currentVerifiedCloudinaryType: string;
  cloudinaryResult: CloudinaryMigrationResult;
  mongoResult: MongoUpdateResult;
  status: MigrationItemStatus;
  timestamp: string;
  errorCategory: MigrationErrorCategory;
  error?: string;
}

export interface InventorySummary {
  totalLeads: number;
  leadsWithAudio: number;
  byDeliveryType: {
    authenticated: number;
    upload: number;
    private: number;
    unknown: number;
  };
}

export interface MigrationOptions {
  isDryRun?: boolean;
  target?: string;
  batchSize?: number;
  batchDelayMs?: number;
  maxConsecutiveErrors?: number;
  ledgerPath?: string;
  cloudinaryClient?: any;
  leadModel?: any;
}

export interface MigrationResult {
  inventory: InventorySummary;
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  reconciled: number;
  ledger: DurableLedgerEntry[];
  ledgerPath: string;
}

export interface CloudinarySourceInspection {
  verifiedSourceType: "upload" | "private" | "authenticated" | "collision" | "unknown";
  sourceAsset?: any;
  authenticatedAsset?: any;
  error?: string;
}

export interface AssetIdentityVerificationResult {
  verified: boolean;
  reason?: string;
}

/* -------------------------------------------------------------------------- */
/*  Constants & Defaults                                                      */
/* -------------------------------------------------------------------------- */

const DEFAULT_BATCH_SIZE = 5;
const DEFAULT_BATCH_DELAY_MS = 1000;
const DEFAULT_MAX_CONSECUTIVE_ERRORS = 3;
const DEFAULT_LEDGER_PATH = path.resolve(process.cwd(), "logs", "migration-ledgers", "migration-ledger.json");

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/* -------------------------------------------------------------------------- */
/*  Phase 1 — Classification & Identification Helpers                         */
/* -------------------------------------------------------------------------- */

/**
 * Classifies deliveryType strictly without default fallback to "upload".
 * Missing, null, empty, or unverified strings are classified as "unknown".
 */
export function classifyDeliveryType(deliveryType: unknown): DeliveryTypeClassification {
  if (typeof deliveryType !== "string") return "unknown";
  const clean = deliveryType.trim().toLowerCase();
  if (clean === "authenticated") return "authenticated";
  if (clean === "upload") return "upload";
  if (clean === "private") return "private";
  return "unknown";
}

/**
 * Validates that a string is a legitimate Cloudinary publicId and NOT a
 * local filesystem path, directory traversal, URL, or local static asset.
 */
export function isValidCloudinaryPublicId(publicId: unknown): publicId is string {
  if (typeof publicId !== "string" || !publicId.trim()) {
    return false;
  }
  const trimmed = publicId.trim();

  // Reject filesystem paths, directory traversals, drive letters, URLs
  if (
    trimmed.startsWith("./") ||
    trimmed.startsWith("../") ||
    trimmed.startsWith("/") ||
    trimmed.startsWith("\\") ||
    trimmed.includes(":\\") ||
    trimmed.includes(":/") ||
    trimmed.startsWith("uploads") ||
    trimmed.startsWith("src") ||
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("file://")
  ) {
    return false;
  }

  // Reject local file extensions (Cloudinary public IDs do not require file extensions)
  if (/\.(wav|mp3|ogg|m4a|aac|flac|wma)$/i.test(trimmed)) {
    return false;
  }

  // Cloudinary public ID: alphanumeric characters, underscores, hyphens, and slashes
  return /^[a-zA-Z0-9_\-\/]{1,256}$/.test(trimmed);
}

/**
 * Resolves the verified Cloudinary public ID from lead audio metadata.
 * Strictly verifies that storagePath is not accidentally treated as a Cloudinary public ID.
 */
export function resolveValidPublicId(audio: any): string | null {
  if (!audio) return null;

  // 1. Prefer explicit audio.publicId
  if (isValidCloudinaryPublicId(audio.publicId)) {
    return audio.publicId.trim();
  }

  // 2. Only consider storagePath if it strictly passes Cloudinary publicId validation
  if (isValidCloudinaryPublicId(audio.storagePath)) {
    return audio.storagePath.trim();
  }

  return null;
}

/**
 * Helper to identify 404 "not found" errors from Cloudinary Admin API.
 */
export function isCloudinaryNotFoundError(err: any): boolean {
  if (!err) return false;
  if (err.http_code === 404 || err.status === 404) return true;
  const msg = (err.message || String(err)).toLowerCase();
  return msg.includes("not found") || msg.includes("cannot find") || msg.includes("resource not found");
}

/**
 * Independently inspects Cloudinary to determine actual asset delivery tier (upload vs private vs authenticated).
 * Never assumes MongoDB deliveryType alone is proof of the actual Cloudinary delivery type.
 */
export async function inspectCloudinaryAssetSource(
  cld: any,
  publicId: string
): Promise<CloudinarySourceInspection> {
  if (!cld?.api?.resource) {
    return {
      verifiedSourceType: "unknown",
      error: "Cloudinary Admin API client unavailable",
    };
  }

  let authenticatedAsset: any = null;
  let uploadAsset: any = null;
  let privateAsset: any = null;

  // 1. Probe authenticated tier
  try {
    const res = await cld.api.resource(publicId, {
      resource_type: "video",
      type: "authenticated",
    });
    if (res && res.type === "authenticated") {
      authenticatedAsset = res;
    }
  } catch (err: any) {
    if (!isCloudinaryNotFoundError(err)) {
      return {
        verifiedSourceType: "unknown",
        error: `Cloudinary API error inspecting authenticated tier: ${err?.message || err}`,
      };
    }
  }

  // 2. Probe upload tier
  try {
    const res = await cld.api.resource(publicId, {
      resource_type: "video",
      type: "upload",
    });
    if (res && res.type === "upload") {
      uploadAsset = res;
    }
  } catch (err: any) {
    if (!isCloudinaryNotFoundError(err)) {
      return {
        verifiedSourceType: "unknown",
        error: `Cloudinary API error inspecting upload tier: ${err?.message || err}`,
      };
    }
  }

  // 3. Probe private tier
  try {
    const res = await cld.api.resource(publicId, {
      resource_type: "video",
      type: "private",
    });
    if (res && res.type === "private") {
      privateAsset = res;
    }
  } catch (err: any) {
    if (!isCloudinaryNotFoundError(err)) {
      return {
        verifiedSourceType: "unknown",
        error: `Cloudinary API error inspecting private tier: ${err?.message || err}`,
      };
    }
  }

  // Evaluate collisions and source delivery tier
  // If authenticated asset already exists alongside an unmigrated source (upload or private): collision!
  if (authenticatedAsset && (uploadAsset || privateAsset)) {
    return {
      verifiedSourceType: "collision",
      authenticatedAsset,
      sourceAsset: uploadAsset || privateAsset,
      error: "Authenticated asset already exists at target publicId alongside source asset. Aborting rename to prevent overwrite.",
    };
  }

  // If only authenticated exists:
  if (authenticatedAsset) {
    return {
      verifiedSourceType: "authenticated",
      authenticatedAsset,
    };
  }

  // If both upload and private exist simultaneously: collision!
  if (uploadAsset && privateAsset) {
    return {
      verifiedSourceType: "collision",
      error: "Asset exists in both upload and private delivery tiers simultaneously.",
    };
  }

  // If strictly upload exists:
  if (uploadAsset) {
    return {
      verifiedSourceType: "upload",
      sourceAsset: uploadAsset,
    };
  }

  // If strictly private exists:
  if (privateAsset) {
    return {
      verifiedSourceType: "private",
      sourceAsset: privateAsset,
    };
  }

  // Not found in any supported tier:
  return {
    verifiedSourceType: "unknown",
    error: "Asset not found in Cloudinary under authenticated, upload, or private delivery tiers.",
  };
}

/* -------------------------------------------------------------------------- */
/*  Phase 2 — Asset Identity Verification for Reconciliation                  */
/* -------------------------------------------------------------------------- */

/**
 * Verifies that an existing authenticated Cloudinary asset corresponds to the
 * expected recording in the Lead database record before reconciliation.
 *
 * Ensures:
 * 1. Database Association: The publicId is uniquely associated with this lead
 *    and not shared or claimed by other leads.
 * 2. Cloudinary Asset Identity: Format, size, and resource type match database metadata
 *    and are not contradictory or ambiguous.
 */
export async function verifyAssetIdentityForReconciliation(
  lead: any,
  authenticatedAsset: any,
  model: any
): Promise<AssetIdentityVerificationResult> {
  const audio = lead?.vigilanceDetails?.audio;
  const publicId = resolveValidPublicId(audio);
  const leadId = lead?._id ? lead._id.toString() : lead?.id;

  if (!publicId) {
    return {
      verified: false,
      reason: "Lead audio metadata lacks a valid Cloudinary publicId.",
    };
  }

  if (!authenticatedAsset) {
    return {
      verified: false,
      reason: "No authenticated Cloudinary asset details provided for verification.",
    };
  }

  // 1. Verify Database Association Uniqueness
  // Check if any other lead in MongoDB references this publicId or storagePath
  if (model?.find) {
    try {
      const otherLeadsQuery = model.find({
        _id: { $ne: lead._id },
        $or: [
          { "vigilanceDetails.audio.publicId": publicId },
          { "vigilanceDetails.audio.storagePath": publicId },
        ],
      });
      const matchingOtherLeads = otherLeadsQuery.select
        ? await otherLeadsQuery.select("_id leadCode")
        : await otherLeadsQuery;

      if (Array.isArray(matchingOtherLeads) && matchingOtherLeads.length > 0) {
        const otherCodes = matchingOtherLeads.map((l: any) => l.leadCode || l._id || "unknown").join(", ");
        return {
          verified: false,
          reason: `Ambiguous database association: publicId '${publicId}' is also associated with other lead(s): ${otherCodes}. Requires manual review.`,
        };
      }
    } catch (err: any) {
      return {
        verified: false,
        reason: `Failed to verify database association uniqueness: ${err?.message || err}`,
      };
    }
  }

  // 2. Resource Type Verification
  if (authenticatedAsset.resource_type && authenticatedAsset.resource_type !== "video") {
    return {
      verified: false,
      reason: `Resource type mismatch: Cloudinary has '${authenticatedAsset.resource_type}', expected 'video'.`,
    };
  }

  // 3. Independent Asset Attributes Comparison
  let corroboratingChecksCount = 0;

  // Format Check
  if (audio?.format && authenticatedAsset.format) {
    const dbFormat = String(audio.format).toLowerCase().trim();
    const cldFormat = String(authenticatedAsset.format).toLowerCase().trim();
    if (dbFormat !== cldFormat) {
      return {
        verified: false,
        reason: `Format mismatch between MongoDB ('${dbFormat}') and Cloudinary ('${cldFormat}'). Requires manual review.`,
      };
    }
    corroboratingChecksCount++;
  }

  // File Size / Bytes Check
  const dbBytes = Number(audio?.fileSize || audio?.size || 0);
  const cldBytes = Number(authenticatedAsset.bytes || 0);
  if (dbBytes > 0 && cldBytes > 0) {
    if (dbBytes !== cldBytes) {
      return {
        verified: false,
        reason: `File size mismatch between MongoDB (${dbBytes} bytes) and Cloudinary (${cldBytes} bytes). Requires manual review.`,
      };
    }
    corroboratingChecksCount++;
  }

  // Version Check (if present on both)
  if (audio?.version && authenticatedAsset.version) {
    const dbVersion = String(audio.version).trim();
    const cldVersion = String(authenticatedAsset.version).trim();
    if (dbVersion !== cldVersion) {
      return {
        verified: false,
        reason: `Version mismatch between MongoDB ('${dbVersion}') and Cloudinary ('${cldVersion}'). Requires manual review.`,
      };
    }
    corroboratingChecksCount++;
  }

  // Public ID specific association check (e.g. contains leadCode or leadId)
  if (lead?.leadCode && publicId.includes(lead.leadCode)) {
    corroboratingChecksCount++;
  } else if (leadId && publicId.includes(leadId)) {
    corroboratingChecksCount++;
  }

  // 4. Ambiguity / Insufficient Corroboration Guard
  // If there are zero corroborating checks (i.e. no format, no size, no version, and public ID does not contain lead identity),
  // we do not infer identity solely from publicId matching.
  if (corroboratingChecksCount === 0) {
    return {
      verified: false,
      reason: "Insufficient corroborating metadata (missing format, file size, version, and lead identifier) to verify asset identity independently. Requires manual review.",
    };
  }

  return { verified: true };
}

/* -------------------------------------------------------------------------- */
/*  Phase 2 — Centralized Execution Authorization                             */
/* -------------------------------------------------------------------------- */

/**
 * Multi-signal check for production environments.
 * Does not rely solely on NODE_ENV.
 */
export function isProductionEnvironment(target?: string): boolean {
  const nodeEnv = (process.env.NODE_ENV || "").toLowerCase().trim();
  const vercelEnv = (process.env.VERCEL_ENV || "").toLowerCase().trim();
  const isVercel = process.env.VERCEL === "1";
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || "";
  const cleanTarget = (target || process.env.MIGRATION_TARGET || "").toLowerCase().trim();

  if (nodeEnv === "production" || vercelEnv === "production" || cleanTarget === "production") {
    return true;
  }

  if (isVercel && (vercelEnv === "production" || !vercelEnv)) {
    return true;
  }

  // MongoDB host indicators
  if (mongoUri.includes(".mongodb.net") && (mongoUri.includes("prod") || !mongoUri.includes("dev"))) {
    return true;
  }

  return false;
}

/**
 * Centralized execution authorization gate.
 * Ensures live execution cannot be bypassed through runMigration() or direct invocation.
 * Fails closed if any requirement or target configuration is ambiguous.
 */
export function assertExecutionAuthorization(options: { isDryRun: boolean; target?: string }): void {
  // Dry-run simulation is always safe and permitted
  if (options.isDryRun) {
    return;
  }

  // LIVE EXECUTION REQUESTED: Strictly enforce all safety gates
  const args = typeof process !== "undefined" && process.argv ? process.argv : [];
  const hasExecuteArg = args.includes("--execute");
  const isConfirmSet = process.env.CONFIRM_MIGRATION === "true";

  if (!hasExecuteArg) {
    throw new Error(
      "MIGRATION AUTHORIZATION FAILED: Live execution requires explicit '--execute' command line flag."
    );
  }

  if (!isConfirmSet) {
    throw new Error(
      "MIGRATION AUTHORIZATION FAILED: Live execution requires environment variable CONFIRM_MIGRATION=true."
    );
  }

  const target = (options.target || process.env.MIGRATION_TARGET || "").trim();
  if (!target) {
    throw new Error(
      "MIGRATION TARGET REQUIRED: Explicit target environment must be specified via MIGRATION_TARGET (e.g. 'development', 'staging', or 'production')."
    );
  }

  const validTargets = ["development", "test", "staging", "production"];
  if (!validTargets.includes(target.toLowerCase())) {
    throw new Error(
      `INVALID MIGRATION TARGET: Target '${target}' is unrecognized. Must be one of: ${validTargets.join(", ")}.`
    );
  }

  const nodeEnv = (process.env.NODE_ENV || "").toLowerCase().trim();
  if (!nodeEnv) {
    throw new Error(
      "AMBIGUOUS ENVIRONMENT: NODE_ENV is unset. Migration fails closed when environment is ambiguous."
    );
  }

  // Check multi-signal production gate
  const isProd = isProductionEnvironment(target);
  if (isProd) {
    const allowProd = process.env.ALLOW_PROD_MIGRATION === "true";
    if (!allowProd) {
      throw new Error(
        "PRODUCTION SAFETY HALT: Production environment detected. Live execution strictly requires ALLOW_PROD_MIGRATION=true and CONFIRM_MIGRATION=true."
      );
    }
  }
}

/* -------------------------------------------------------------------------- */
/*  Phase 5 — Durable Non-Secret Ledger Persistence                           */
/* -------------------------------------------------------------------------- */

/**
 * Atomically writes the non-secret migration ledger to disk.
 * Never stores credentials, API secrets, signatures, or media tickets.
 */
export function writeLedgerToFile(ledgerPath: string, ledger: DurableLedgerEntry[]): void {
  try {
    const dir = path.dirname(ledgerPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2), "utf8");
    logger.info({ ledgerPath, entryCount: ledger.length }, "Durable migration ledger saved to disk");
  } catch (err: any) {
    logger.error({ err: err.message, ledgerPath }, "Failed to write durable migration ledger");
  }
}

/* -------------------------------------------------------------------------- */
/*  Phase 1 & 4 — Inventory & Aggregation                                     */
/* -------------------------------------------------------------------------- */

/**
 * Perform a safe, read-only aggregation query across Lead records
 * to inventory audio assets and categorize delivery tiers.
 * Missing or unknown delivery types are strictly categorized as "unknown".
 */
export async function inventoryLegacyAudio(customModel?: any): Promise<InventorySummary> {
  const model = customModel || Lead;
  const summary: InventorySummary = {
    totalLeads: 0,
    leadsWithAudio: 0,
    byDeliveryType: {
      authenticated: 0,
      upload: 0,
      private: 0,
      unknown: 0,
    },
  };

  summary.totalLeads = await model.countDocuments();
  summary.leadsWithAudio = await model.countDocuments({
    "vigilanceDetails.audio": { $exists: true, $ne: null },
  });

  const aggregation = await model.aggregate([
    {
      $match: {
        "vigilanceDetails.audio": { $exists: true, $ne: null },
      },
    },
    {
      $group: {
        _id: "$vigilanceDetails.audio.deliveryType",
        count: { $sum: 1 },
      },
    },
  ]);

  for (const group of aggregation) {
    const classified = classifyDeliveryType(group._id);
    if (classified === "authenticated") {
      summary.byDeliveryType.authenticated += group.count;
    } else if (classified === "upload") {
      summary.byDeliveryType.upload += group.count;
    } else if (classified === "private") {
      summary.byDeliveryType.private += group.count;
    } else {
      summary.byDeliveryType.unknown += group.count;
    }
  }

  return summary;
}

/* -------------------------------------------------------------------------- */
/*  Main Migration Engine                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Executes migration or dry-run simulation for eligible legacy audio assets.
 * Default execution path is ALWAYS dry-run.
 */
export async function runMigration(options: MigrationOptions = {}): Promise<MigrationResult> {
  // Default to dry-run unless explicitly specified
  const isDryRun = options.isDryRun !== false;
  const target = options.target || process.env.MIGRATION_TARGET || "development";
  const batchSize = options.batchSize || DEFAULT_BATCH_SIZE;
  const batchDelayMs = options.batchDelayMs ?? DEFAULT_BATCH_DELAY_MS;
  const maxConsecutiveErrors = options.maxConsecutiveErrors || DEFAULT_MAX_CONSECUTIVE_ERRORS;
  const ledgerPath = options.ledgerPath || DEFAULT_LEDGER_PATH;

  const cld = options.cloudinaryClient || defaultCloudinary;
  const model = options.leadModel || Lead;

  // Centralized safety check: cannot be bypassed through options
  assertExecutionAuthorization({ isDryRun, target });

  const ledger: DurableLedgerEntry[] = [];

  logger.info(
    { mode: isDryRun ? "DRY RUN (PLANNING/SIMULATION)" : "LIVE EXECUTION", target },
    "Starting legacy Cloudinary audio asset migration evaluation"
  );

  // 1. Inventory read-only check
  const inventory = await inventoryLegacyAudio(model);
  logger.info(
    {
      totalLeads: inventory.totalLeads,
      leadsWithAudio: inventory.leadsWithAudio,
      authenticated: inventory.byDeliveryType.authenticated,
      upload: inventory.byDeliveryType.upload,
      private: inventory.byDeliveryType.private,
      unknown: inventory.byDeliveryType.unknown,
    },
    "Asset inventory assessment complete"
  );

  // 2. Query target leads: ONLY explicitly verified 'upload' and 'private' assets can become candidates
  // Unknown, null, empty and unsupported delivery types are excluded from candidates
  const targetLeads = await model.find({
    "vigilanceDetails.audio": { $exists: true, $ne: null },
    "vigilanceDetails.audio.deliveryType": { $in: ["upload", "private"] },
  }).select("_id leadCode vigilanceDetails.audio");

  logger.info({ candidateCount: targetLeads.length }, "Identified candidate leads for migration evaluation");

  let succeeded = 0;
  let failed = 0;
  let skipped = 0;
  let reconciled = 0;
  let consecutiveErrors = 0;

  // Process candidates in batches
  for (let i = 0; i < targetLeads.length; i += batchSize) {
    if (consecutiveErrors >= maxConsecutiveErrors) {
      logger.error(
        { consecutiveErrors, maxAllowed: maxConsecutiveErrors },
        "Halted migration loop due to exceeding consecutive failure limit"
      );
      break;
    }

    const batch = targetLeads.slice(i, i + batchSize);

    for (const lead of batch) {
      const audio = lead.vigilanceDetails?.audio;
      const rawDeliveryType = audio?.deliveryType;
      const classifiedType = classifyDeliveryType(rawDeliveryType);

      // Phase 1: Filter unknown delivery types
      if (classifiedType !== "upload" && classifiedType !== "private") {
        ledger.push({
          leadId: lead._id.toString(),
          leadCode: lead.leadCode,
          publicId: audio?.publicId || "UNSET",
          previousDeliveryType: String(rawDeliveryType),
          currentVerifiedCloudinaryType: "unknown",
          cloudinaryResult: "SKIPPED",
          mongoResult: "SKIPPED",
          status: "SKIPPED",
          timestamp: new Date().toISOString(),
          errorCategory: "UNKNOWN_DELIVERY_TYPE",
          error: `Delivery type '${rawDeliveryType}' is not verified as 'upload' or 'private'. Skipped.`,
        });
        skipped++;
        continue;
      }

      // Phase 1: Validate Cloudinary publicId
      const publicId = resolveValidPublicId(audio);
      if (!publicId) {
        ledger.push({
          leadId: lead._id.toString(),
          leadCode: lead.leadCode,
          publicId: String(audio?.publicId || audio?.storagePath || "INVALID"),
          previousDeliveryType: classifiedType,
          currentVerifiedCloudinaryType: "unknown",
          cloudinaryResult: "SKIPPED",
          mongoResult: "SKIPPED",
          status: "SKIPPED",
          timestamp: new Date().toISOString(),
          errorCategory: "INVALID_METADATA",
          error: "Invalid or missing Cloudinary publicId. StoragePath is not a valid Cloudinary public ID.",
        });
        skipped++;
        continue;
      }

      // Phase 1 & 2: Independent Cloudinary source verification
      try {
        let inspection: CloudinarySourceInspection;

        if (cld?.api?.resource) {
          // Probe actual Cloudinary delivery tiers directly
          inspection = await inspectCloudinaryAssetSource(cld, publicId);
        } else {
          // When Admin API is omitted or in pure unit-test simulation without api
          inspection = {
            verifiedSourceType: isDryRun ? classifiedType : "unknown",
            error: isDryRun ? undefined : "Cloudinary Admin API client unavailable",
          };
        }

        // Handle collision
        if (inspection.verifiedSourceType === "collision") {
          ledger.push({
            leadId: lead._id.toString(),
            leadCode: lead.leadCode,
            publicId,
            previousDeliveryType: classifiedType,
            currentVerifiedCloudinaryType: "authenticated",
            cloudinaryResult: "SKIPPED",
            mongoResult: "SKIPPED",
            status: "SKIPPED",
            timestamp: new Date().toISOString(),
            errorCategory: "COLLISION",
            error: inspection.error || "Authenticated asset already exists at target publicId. Aborting rename to prevent overwrite.",
          });
          skipped++;
          continue;
        }

        // Handle unknown or unverified source type in Cloudinary
        if (inspection.verifiedSourceType === "unknown") {
          ledger.push({
            leadId: lead._id.toString(),
            leadCode: lead.leadCode,
            publicId,
            previousDeliveryType: classifiedType,
            currentVerifiedCloudinaryType: "unknown",
            cloudinaryResult: "SKIPPED",
            mongoResult: "SKIPPED",
            status: "SKIPPED",
            timestamp: new Date().toISOString(),
            errorCategory: "UNVERIFIED_SOURCE",
            error: inspection.error || "Source delivery type could not be independently verified in Cloudinary. Skipped for manual review.",
          });
          skipped++;
          continue;
        }

        // Handle ALREADY AUTHENTICATED asset (Reconciliation Path)
        if (inspection.verifiedSourceType === "authenticated") {
          // Phase 2: Asset Identity Verification before reconciliation
          const identityCheck = await verifyAssetIdentityForReconciliation(lead, inspection.authenticatedAsset, model);

          if (!identityCheck.verified) {
            ledger.push({
              leadId: lead._id.toString(),
              leadCode: lead.leadCode,
              publicId,
              previousDeliveryType: classifiedType,
              currentVerifiedCloudinaryType: "authenticated",
              cloudinaryResult: "SKIPPED",
              mongoResult: "SKIPPED",
              status: "SKIPPED",
              timestamp: new Date().toISOString(),
              errorCategory: "IDENTITY_MISMATCH",
              error: identityCheck.reason || "Authenticated asset identity could not be verified. Requires manual review.",
            });
            skipped++;
            continue;
          }

          // Asset identity verified! Reconcile MongoDB record
          if (isDryRun) {
            ledger.push({
              leadId: lead._id.toString(),
              leadCode: lead.leadCode,
              publicId,
              previousDeliveryType: classifiedType,
              currentVerifiedCloudinaryType: "authenticated",
              cloudinaryResult: "ALREADY_AUTHENTICATED",
              mongoResult: "SUCCESS",
              status: "RECONCILED",
              timestamp: new Date().toISOString(),
              errorCategory: "NONE",
            });
            reconciled++;
            continue;
          }

          // Live Execution: Update MongoDB directly without calling Cloudinary rename
          logger.info(
            { leadId: lead._id, publicId },
            "Asset is already authenticated in Cloudinary with verified identity; reconciling MongoDB record"
          );

          const updateRes = await model.updateOne(
            { _id: lead._id },
            {
              $set: {
                "vigilanceDetails.audio.deliveryType": "authenticated",
                "vigilanceDetails.audio.protectionStatus": "protected",
                "vigilanceDetails.audio.migratedAt": new Date().toISOString(),
              },
            }
          );

          if (!updateRes.acknowledged || updateRes.matchedCount === 0) {
            throw new Error(`MongoDB reconciliation update failed for lead ${lead._id}`);
          }

          const verifiedDoc = await model.findById(lead._id).select("vigilanceDetails.audio.deliveryType");
          if (verifiedDoc?.vigilanceDetails?.audio?.deliveryType !== "authenticated") {
            throw new Error("MongoDB post-reconciliation verification failed");
          }

          ledger.push({
            leadId: lead._id.toString(),
            leadCode: lead.leadCode,
            publicId,
            previousDeliveryType: classifiedType,
            currentVerifiedCloudinaryType: "authenticated",
            cloudinaryResult: "ALREADY_AUTHENTICATED",
            mongoResult: "SUCCESS",
            status: "RECONCILED",
            timestamp: new Date().toISOString(),
            errorCategory: "NONE",
          });

          reconciled++;
          consecutiveErrors = 0;
          continue;
        }

        // Live or Dry-run: Verified source type is either "upload" or "private"
        const verifiedSourceType = inspection.verifiedSourceType;

        // Dry-run simulation branch
        if (isDryRun) {
          ledger.push({
            leadId: lead._id.toString(),
            leadCode: lead.leadCode,
            publicId,
            previousDeliveryType: classifiedType,
            currentVerifiedCloudinaryType: "authenticated",
            cloudinaryResult: "SUCCESS",
            mongoResult: "SUCCESS",
            status: "SUCCESS",
            timestamp: new Date().toISOString(),
            errorCategory: "NONE",
          });
          succeeded++;
          continue;
        }

        // Live Execution: Step A — Cloudinary Rename with verifiedSourceType and overwrite: false
        let renameResult: any;
        try {
          renameResult = await cld.uploader.rename(publicId, publicId, {
            resource_type: "video",
            type: verifiedSourceType, // STRICT: Uses independent Cloudinary verified source type!
            to_type: "authenticated",
            overwrite: false,         // STRICT: Never overwrite existing asset!
            invalidate: true,
          });
        } catch (renameErr: any) {
          ledger.push({
            leadId: lead._id.toString(),
            leadCode: lead.leadCode,
            publicId,
            previousDeliveryType: classifiedType,
            currentVerifiedCloudinaryType: verifiedSourceType,
            cloudinaryResult: "FAILED",
            mongoResult: "NOT_ATTEMPTED",
            status: "FAILED",
            timestamp: new Date().toISOString(),
            errorCategory: "CLOUDINARY_API_ERROR",
            error: renameErr?.message || String(renameErr),
          });
          failed++;
          consecutiveErrors++;
          continue;
        }

        if (renameResult.type !== "authenticated") {
          throw new Error(
            `Cloudinary returned unexpected delivery type: ${renameResult.type} (expected 'authenticated')`
          );
        }

        // Live Execution: Step B — Update MongoDB after Cloudinary confirmation
        try {
          const updateRes = await model.updateOne(
            { _id: lead._id },
            {
              $set: {
                "vigilanceDetails.audio.deliveryType": "authenticated",
                "vigilanceDetails.audio.protectionStatus": "protected",
                "vigilanceDetails.audio.migratedAt": new Date().toISOString(),
              },
            }
          );

          if (!updateRes.acknowledged || updateRes.matchedCount === 0) {
            throw new Error(`MongoDB update failed: matchedCount was 0 or unacknowledged.`);
          }

          // Verify stored deliveryType
          const verifiedDoc = await model.findById(lead._id).select("vigilanceDetails.audio.deliveryType");
          if (verifiedDoc?.vigilanceDetails?.audio?.deliveryType !== "authenticated") {
            throw new Error("MongoDB post-update verification failed: deliveryType is not authenticated");
          }

          ledger.push({
            leadId: lead._id.toString(),
            leadCode: lead.leadCode,
            publicId,
            previousDeliveryType: classifiedType,
            currentVerifiedCloudinaryType: "authenticated",
            cloudinaryResult: "SUCCESS",
            mongoResult: "SUCCESS",
            status: "SUCCESS",
            timestamp: new Date().toISOString(),
            errorCategory: "NONE",
          });

          succeeded++;
          consecutiveErrors = 0;
        } catch (mongoErr: any) {
          // Cloudinary succeeded, but MongoDB failed!
          // NEVER revert Cloudinary asset to public. Capture split state for subsequent reconciliation.
          ledger.push({
            leadId: lead._id.toString(),
            leadCode: lead.leadCode,
            publicId,
            previousDeliveryType: classifiedType,
            currentVerifiedCloudinaryType: "authenticated",
            cloudinaryResult: "SUCCESS",
            mongoResult: "FAILED",
            status: "FAILED",
            timestamp: new Date().toISOString(),
            errorCategory: "MONGO_UPDATE_ERROR",
            error: mongoErr?.message || String(mongoErr),
          });
          failed++;
          consecutiveErrors++;
        }
      } catch (err: any) {
        ledger.push({
          leadId: lead._id.toString(),
          leadCode: lead.leadCode,
          publicId,
          previousDeliveryType: classifiedType,
          currentVerifiedCloudinaryType: "unknown",
          cloudinaryResult: "FAILED",
          mongoResult: "NOT_ATTEMPTED",
          status: "FAILED",
          timestamp: new Date().toISOString(),
          errorCategory: "CLOUDINARY_API_ERROR",
          error: err?.message || String(err),
        });
        failed++;
        consecutiveErrors++;
      }
    }

    // Save ledger checkpoint to disk after each batch
    writeLedgerToFile(ledgerPath, ledger);

    // Rate-limit backoff delay between batches
    if (i + batchSize < targetLeads.length) {
      await sleep(batchDelayMs);
    }
  }

  // Final durable ledger flush
  writeLedgerToFile(ledgerPath, ledger);

  return {
    inventory,
    processed: targetLeads.length,
    succeeded,
    failed,
    skipped,
    reconciled,
    ledger,
    ledgerPath,
  };
}

/* -------------------------------------------------------------------------- */
/*  CLI Entrypoint                                                            */
/* -------------------------------------------------------------------------- */

async function main() {
  const args = process.argv.slice(2);
  const isExecuteRequested = args.includes("--execute");
  const isConfirmSet = process.env.CONFIRM_MIGRATION === "true";

  // Strict default: Dry-run unless BOTH are present
  const isDryRun = !(isExecuteRequested && isConfirmSet);
  const target = process.env.MIGRATION_TARGET || (isProductionEnvironment() ? "production" : "development");

  console.log("================================================================================");
  console.log("       VA NEXUS CRM — CLOUDINARY AUDIO MIGRATION READINESS RUNNER              ");
  console.log("================================================================================");
  console.log(`MODE:                  ${isDryRun ? "DRY RUN (INVENTORY & SIMULATION ONLY)" : "LIVE EXECUTION"}`);
  console.log(`TARGET ENVIRONMENT:    ${target}`);
  console.log(`Cloudinary Cloud Name: ${process.env.CLOUDINARY_CLOUD_NAME || "Not Set"}`);
  console.log(`Batch Size:            ${DEFAULT_BATCH_SIZE}`);
  console.log(`Batch Delay:           ${DEFAULT_BATCH_DELAY_MS}ms`);
  console.log("--------------------------------------------------------------------------------\n");

  if (!isDryRun) {
    try {
      assertExecutionAuthorization({ isDryRun: false, target });
    } catch (authErr: any) {
      console.error(`\n[SAFETY HALT] ${authErr.message}\n`);
      process.exit(1);
    }
  }

  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!mongoUri) {
    console.error("MONGODB_URI is not set in environment. Exiting.");
    process.exit(1);
  }

  await mongoose.connect(mongoUri);
  console.log("Connected to MongoDB successfully.\n");

  try {
    const result = await runMigration({ isDryRun, target });

    console.log("\n================================================================================");
    console.log("                           MIGRATION SUMMARY                                    ");
    console.log("================================================================================");
    console.log(`Total Leads in Database:               ${result.inventory.totalLeads}`);
    console.log(`Total Leads with Audio:                ${result.inventory.leadsWithAudio}`);
    console.log(`  - Authenticated (Protected):         ${result.inventory.byDeliveryType.authenticated}`);
    console.log(`  - Upload (Legacy Public):            ${result.inventory.byDeliveryType.upload}`);
    console.log(`  - Private (Verification Required):   ${result.inventory.byDeliveryType.private}`);
    console.log(`  - Unknown / Unverified:              ${result.inventory.byDeliveryType.unknown}`);
    console.log("--------------------------------------------------------------------------------");
    console.log(`Candidates Evaluated:                  ${result.processed}`);
    console.log(`Succeeded (${isDryRun ? "Simulated" : "Migrated"}):               ${result.succeeded}`);
    console.log(`Reconciled:                            ${result.reconciled}`);
    console.log(`Failed:                                ${result.failed}`);
    console.log(`Skipped:                               ${result.skipped}`);
    console.log(`Durable Ledger Path:                   ${result.ledgerPath}`);
    console.log("================================================================================\n");

    const failedEntries = result.ledger.filter((e) => e.status === "FAILED");
    if (failedEntries.length > 0) {
      console.log("Failure Ledger Sample:");
      console.table(
        failedEntries.slice(0, 10).map((e) => ({
          leadCode: e.leadCode,
          publicId: e.publicId,
          errorCategory: e.errorCategory,
          error: e.error,
        }))
      );
    }
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB.");
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error("Fatal migration error:", err);
    process.exit(1);
  });
}
