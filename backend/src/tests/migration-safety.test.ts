import fs from "fs";
import path from "path";
import os from "os";
import {
  classifyDeliveryType,
  isValidCloudinaryPublicId,
  resolveValidPublicId,
  isProductionEnvironment,
  assertExecutionAuthorization,
  inventoryLegacyAudio,
  runMigration,
  writeLedgerToFile,
  inspectCloudinaryAssetSource,
  verifyAssetIdentityForReconciliation,
  DurableLedgerEntry,
} from "../scripts/migrate-cloudinary-audio";
import { maskRedisUrl, getRedisClient, setMockRedisClient, clearMockRedisClient } from "../config/redis";
import { MediaTicketService } from "../services/media-ticket.service";

describe("Phase 1 — Migration Classification & Public ID Validation", () => {
  it("should classify explicitly known delivery types and treat null, empty, and unsupported types as 'unknown'", () => {
    expect(classifyDeliveryType("authenticated")).toBe("authenticated");
    expect(classifyDeliveryType("AUTHENTICATED ")).toBe("authenticated");
    expect(classifyDeliveryType("upload")).toBe("upload");
    expect(classifyDeliveryType("UPLOAD")).toBe("upload");
    expect(classifyDeliveryType("private")).toBe("private");
    expect(classifyDeliveryType("PRIVATE")).toBe("private");

    // Must never fall back to "upload"
    expect(classifyDeliveryType(null)).toBe("unknown");
    expect(classifyDeliveryType(undefined)).toBe("unknown");
    expect(classifyDeliveryType("")).toBe("unknown");
    expect(classifyDeliveryType("   ")).toBe("unknown");
    expect(classifyDeliveryType("external_s3")).toBe("unknown");
    expect(classifyDeliveryType(12345)).toBe("unknown");
  });

  it("should strictly validate Cloudinary public IDs and reject local filesystem paths, traversal, and URLs", () => {
    // Valid Cloudinary public IDs
    expect(isValidCloudinaryPublicId("vibhanu-crm/audio/rec_12345")).toBe(true);
    expect(isValidCloudinaryPublicId("audio_compliance_lead_001")).toBe(true);
    expect(isValidCloudinaryPublicId("folder/subfolder/call-recording-99")).toBe(true);

    // Invalid filesystem paths
    expect(isValidCloudinaryPublicId("/audio/sample-call.wav")).toBe(false);
    expect(isValidCloudinaryPublicId("./uploads/recording.mp3")).toBe(false);
    expect(isValidCloudinaryPublicId("../../../etc/passwd")).toBe(false);
    expect(isValidCloudinaryPublicId("C:\\data\\recordings\\audio.wav")).toBe(false);
    expect(isValidCloudinaryPublicId("D:/drive-c/sample.wav")).toBe(false);
    expect(isValidCloudinaryPublicId("uploads/file.wav")).toBe(false);

    // Invalid extensions and URLs
    expect(isValidCloudinaryPublicId("https://res.cloudinary.com/demo/video/sample.mp3")).toBe(false);
    expect(isValidCloudinaryPublicId("recording.mp3")).toBe(false);
    expect(isValidCloudinaryPublicId("call.wav")).toBe(false);
    expect(isValidCloudinaryPublicId("")).toBe(false);
    expect(isValidCloudinaryPublicId(null)).toBe(false);
    expect(isValidCloudinaryPublicId(undefined)).toBe(false);
  });

  it("should resolve valid publicId and verify storagePath is not accidentally treated as a Cloudinary public ID", () => {
    // Legitimate publicId present
    const audioWithValidPublicId = {
      publicId: "vibhanu-crm/audio/aud_valid_123",
      storagePath: "C:\\local\\path\\audio.wav",
    };
    expect(resolveValidPublicId(audioWithValidPublicId)).toBe("vibhanu-crm/audio/aud_valid_123");

    // Missing publicId, but storagePath is a local file path — must NOT be treated as Cloudinary public ID
    const audioWithLocalFilePath = {
      storagePath: "d:\\drive-c data\\recordings\\sample-call.wav",
    };
    expect(resolveValidPublicId(audioWithLocalFilePath)).toBeNull();

    // StoragePath that is a local relative URL — must NOT be treated as Cloudinary public ID
    const audioWithRelativePath = {
      storagePath: "/audio/sample-call.wav",
    };
    expect(resolveValidPublicId(audioWithRelativePath)).toBeNull();

    // StoragePath that is genuinely a Cloudinary folder identifier
    const audioWithFolderStoragePath = {
      storagePath: "vibhanu-crm/audio/call_recording_456",
    };
    expect(resolveValidPublicId(audioWithFolderStoragePath)).toBe("vibhanu-crm/audio/call_recording_456");
  });
});

describe("Phase 2 — Centralized Execution Authorization", () => {
  const originalArgv = process.argv;
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.argv = originalArgv;
    process.env = { ...originalEnv };
  });

  it("should default to dry-run and allow dry-run simulation without execution flags", () => {
    delete process.env.CONFIRM_MIGRATION;
    process.argv = ["node", "migrate-cloudinary-audio.ts"];

    // Must not throw for dry-run
    expect(() => {
      assertExecutionAuthorization({ isDryRun: true, target: "development" });
    }).not.toThrow();
  });

  it("should block live execution when --execute flag is missing", () => {
    process.env.CONFIRM_MIGRATION = "true";
    process.argv = ["node", "migrate-cloudinary-audio.ts"];

    expect(() => {
      assertExecutionAuthorization({ isDryRun: false, target: "development" });
    }).toThrow(/Live execution requires explicit '--execute' command line flag/);
  });

  it("should block live execution when CONFIRM_MIGRATION is not true", () => {
    process.argv = ["node", "migrate-cloudinary-audio.ts", "--execute"];
    delete process.env.CONFIRM_MIGRATION;

    expect(() => {
      assertExecutionAuthorization({ isDryRun: false, target: "development" });
    }).toThrow(/Live execution requires environment variable CONFIRM_MIGRATION=true/);
  });

  it("should block live execution when target environment is missing or invalid", () => {
    process.argv = ["node", "migrate-cloudinary-audio.ts", "--execute"];
    process.env.CONFIRM_MIGRATION = "true";
    delete process.env.MIGRATION_TARGET;

    expect(() => {
      assertExecutionAuthorization({ isDryRun: false, target: "" });
    }).toThrow(/Explicit target environment must be specified via MIGRATION_TARGET/);

    expect(() => {
      assertExecutionAuthorization({ isDryRun: false, target: "unrecognized-env" });
    }).toThrow(/INVALID MIGRATION TARGET/);
  });

  it("should block live execution when NODE_ENV is unset/ambiguous", () => {
    process.argv = ["node", "migrate-cloudinary-audio.ts", "--execute"];
    process.env.CONFIRM_MIGRATION = "true";
    delete process.env.NODE_ENV;

    expect(() => {
      assertExecutionAuthorization({ isDryRun: false, target: "development" });
    }).toThrow(/AMBIGUOUS ENVIRONMENT: NODE_ENV is unset/);
  });

  it("should detect production environment through multiple signals", () => {
    // 1. NODE_ENV = production
    process.env.NODE_ENV = "production";
    expect(isProductionEnvironment()).toBe(true);

    // 2. VERCEL_ENV = production
    process.env.NODE_ENV = "development";
    process.env.VERCEL_ENV = "production";
    expect(isProductionEnvironment()).toBe(true);

    // 3. VERCEL = 1
    process.env.VERCEL_ENV = "";
    process.env.VERCEL = "1";
    expect(isProductionEnvironment()).toBe(true);

    // 4. Target = production
    process.env.VERCEL = "0";
    expect(isProductionEnvironment("production")).toBe(true);

    // 5. MONGODB_URI pointing to MongoDB Atlas
    process.env.MONGODB_URI = "mongodb+srv://admin:pass@cluster0.mongodb.net/crm_production";
    expect(isProductionEnvironment("development")).toBe(true);
  });

  it("should halt live production migration unless ALLOW_PROD_MIGRATION=true", () => {
    process.argv = ["node", "migrate-cloudinary-audio.ts", "--execute"];
    process.env.CONFIRM_MIGRATION = "true";
    process.env.NODE_ENV = "production";
    delete process.env.ALLOW_PROD_MIGRATION;

    expect(() => {
      assertExecutionAuthorization({ isDryRun: false, target: "production" });
    }).toThrow(/PRODUCTION SAFETY HALT/);

    // With explicit ALLOW_PROD_MIGRATION=true, authorization succeeds
    process.env.ALLOW_PROD_MIGRATION = "true";
    expect(() => {
      assertExecutionAuthorization({ isDryRun: false, target: "production" });
    }).not.toThrow();
  });
});

describe("Phase 3 & 4 — Cloudinary Collision Safety, Database Consistency & Reconciliation", () => {
  const originalArgv = process.argv;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.argv = ["node", "migrate-cloudinary-audio.ts", "--execute"];
    process.env.CONFIRM_MIGRATION = "true";
    process.env.NODE_ENV = "development";
    process.env.MIGRATION_TARGET = "development";
    process.env.MONGODB_URI = "mongodb://127.0.0.1:27017/crm_dev_test";
    delete process.env.ALLOW_PROD_MIGRATION;
    delete process.env.VERCEL;
    delete process.env.VERCEL_ENV;
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.env = { ...originalEnv };
  });

  it("should skip unknown, null, and empty delivery types during migration evaluation", async () => {
    const mockModel = {
      countDocuments: jest.fn().mockResolvedValue(4),
      aggregate: jest.fn().mockResolvedValue([
        { _id: "upload", count: 1 },
        { _id: null, count: 2 },
        { _id: "external", count: 1 },
      ]),
      find: jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue([
          {
            _id: "lead_upload_01",
            leadCode: "VA-2026-1001",
            vigilanceDetails: {
              audio: {
                publicId: "vibhanu-crm/audio/lead_1001",
                deliveryType: "upload",
              },
            },
          },
        ]),
      }),
    };

    const inventory = await inventoryLegacyAudio(mockModel);
    expect(inventory.byDeliveryType.upload).toBe(1);
    expect(inventory.byDeliveryType.unknown).toBe(3); // 2 null + 1 external
  });

  it("should not perform mutations during dry-run", async () => {
    const mockCloudinary = {
      uploader: {
        rename: jest.fn(),
      },
      api: {
        resource: jest.fn().mockImplementation((_id: string, opts: any) => {
          if (opts.type === "upload") return Promise.resolve({ type: "upload", resource_type: "video" });
          return Promise.reject(new Error("Resource not found"));
        }),
      },
    };

    const mockModel = {
      countDocuments: jest.fn().mockResolvedValue(1),
      aggregate: jest.fn().mockResolvedValue([{ _id: "upload", count: 1 }]),
      find: jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue([
          {
            _id: "lead_dry_01",
            leadCode: "VA-2026-9001",
            vigilanceDetails: {
              audio: {
                publicId: "vibhanu-crm/audio/dry_test_01",
                deliveryType: "upload",
              },
            },
          },
        ]),
      }),
      updateOne: jest.fn(),
    };

    const tmpLedger = path.join(os.tmpdir(), `ledger-dry-${Date.now()}.json`);

    const result = await runMigration({
      isDryRun: true,
      cloudinaryClient: mockCloudinary,
      leadModel: mockModel,
      ledgerPath: tmpLedger,
    });

    expect(result.processed).toBe(1);
    expect(result.succeeded).toBe(1);
    expect(mockCloudinary.uploader.rename).not.toHaveBeenCalled();
    expect(mockModel.updateOne).not.toHaveBeenCalled();

    if (fs.existsSync(tmpLedger)) fs.unlinkSync(tmpLedger);
  });

  it("should prevent overwriting an existing authenticated target collision (overwrite: false)", async () => {
    const mockCloudinary = {
      api: {
        resource: jest.fn().mockImplementation((publicId: string, options: any) => {
          // Simulate both source 'upload' and target 'authenticated' assets already exist
          if (options.type === "authenticated") {
            return Promise.resolve({ public_id: publicId, type: "authenticated", resource_type: "video" });
          }
          if (options.type === "upload") {
            return Promise.resolve({ public_id: publicId, type: "upload", resource_type: "video" });
          }
          return Promise.reject(new Error("Not found"));
        }),
      },
      uploader: {
        rename: jest.fn(),
      },
    };

    const mockModel = {
      countDocuments: jest.fn().mockResolvedValue(1),
      aggregate: jest.fn().mockResolvedValue([{ _id: "upload", count: 1 }]),
      find: jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue([
          {
            _id: "lead_collision_01",
            leadCode: "VA-2026-9002",
            vigilanceDetails: {
              audio: {
                publicId: "vibhanu-crm/audio/collision_01",
                deliveryType: "upload",
              },
            },
          },
        ]),
      }),
      updateOne: jest.fn(),
    };

    const tmpLedger = path.join(os.tmpdir(), `ledger-collision-${Date.now()}.json`);

    const result = await runMigration({
      isDryRun: false,
      target: "development",
      cloudinaryClient: mockCloudinary,
      leadModel: mockModel,
      ledgerPath: tmpLedger,
    });

    expect(result.skipped).toBe(1);
    expect(mockCloudinary.uploader.rename).not.toHaveBeenCalled();
    const entry = result.ledger.find((e) => e.leadCode === "VA-2026-9002");
    expect(entry?.errorCategory).toBe("COLLISION");
    expect(entry?.error).toContain("already exists at target publicId");

    if (fs.existsSync(tmpLedger)) fs.unlinkSync(tmpLedger);
  });

  it("should detect failed MongoDB update and preserve Cloudinary-success / Mongo-failure state", async () => {
    const mockCloudinary = {
      api: {
        resource: jest.fn().mockImplementation((_id: string, opts: any) => {
          if (opts.type === "upload") return Promise.resolve({ type: "upload", resource_type: "video" });
          return Promise.reject(new Error("Not found"));
        }),
      },
      uploader: {
        rename: jest.fn().mockResolvedValue({
          public_id: "vibhanu-crm/audio/rec_split_01",
          type: "authenticated",
          version: 12345,
        }),
      },
    };

    const mockModel = {
      countDocuments: jest.fn().mockResolvedValue(1),
      aggregate: jest.fn().mockResolvedValue([{ _id: "upload", count: 1 }]),
      find: jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue([
          {
            _id: "lead_split_01",
            leadCode: "VA-2026-9003",
            vigilanceDetails: {
              audio: {
                publicId: "vibhanu-crm/audio/rec_split_01",
                deliveryType: "upload",
              },
            },
          },
        ]),
      }),
      // Simulate MongoDB network / write failure
      updateOne: jest.fn().mockResolvedValue({ acknowledged: false, matchedCount: 0 }),
    };

    const tmpLedger = path.join(os.tmpdir(), `ledger-split-${Date.now()}.json`);

    const result = await runMigration({
      isDryRun: false,
      target: "development",
      cloudinaryClient: mockCloudinary,
      leadModel: mockModel,
      ledgerPath: tmpLedger,
    });

    expect(result.failed).toBe(1);
    const entry = result.ledger.find((e) => e.leadCode === "VA-2026-9003");
    expect(entry?.cloudinaryResult).toBe("SUCCESS");
    expect(entry?.mongoResult).toBe("FAILED");
    expect(entry?.errorCategory).toBe("MONGO_UPDATE_ERROR");

    // Verify Cloudinary asset is NOT reverted back to public
    expect(mockCloudinary.uploader.rename).toHaveBeenCalledTimes(1);
    expect(mockCloudinary.uploader.rename).toHaveBeenCalledWith(
      "vibhanu-crm/audio/rec_split_01",
      "vibhanu-crm/audio/rec_split_01",
      expect.objectContaining({
        overwrite: false,
        to_type: "authenticated",
      })
    );

    if (fs.existsSync(tmpLedger)) fs.unlinkSync(tmpLedger);
  });

  it("should idempotently reconcile a Cloudinary-success / Mongo-failure condition on subsequent run", async () => {
    // Cloudinary reports asset is ALREADY authenticated, and source upload no longer exists
    const mockCloudinary = {
      api: {
        resource: jest.fn().mockImplementation((_id: string, opts: any) => {
          if (opts.type === "authenticated") {
            return Promise.resolve({
              type: "authenticated",
              resource_type: "video",
              format: "mp3",
              bytes: 32000,
            });
          }
          return Promise.reject(new Error("Resource not found"));
        }),
      },
      uploader: {
        rename: jest.fn(),
      },
    };

    const mockModel = {
      countDocuments: jest.fn().mockResolvedValue(1),
      aggregate: jest.fn().mockResolvedValue([{ _id: "upload", count: 1 }]),
      find: jest.fn().mockImplementation((query?: any) => {
        if (query?._id?.$ne) {
          return { select: jest.fn().mockResolvedValue([]) };
        }
        return {
          select: jest.fn().mockResolvedValue([
            {
              _id: "lead_reconcile_01",
              leadCode: "VA-2026-9004",
              vigilanceDetails: {
                audio: {
                  publicId: "vibhanu-crm/audio/rec_reconcile_01",
                  deliveryType: "upload",
                  format: "mp3",
                  fileSize: 32000,
                },
              },
            },
          ]),
        };
      }),
      updateOne: jest.fn().mockResolvedValue({ acknowledged: true, matchedCount: 1 }),
      findById: jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue({
          vigilanceDetails: {
            audio: {
              deliveryType: "authenticated",
            },
          },
        }),
      }),
    };

    const tmpLedger = path.join(os.tmpdir(), `ledger-reconcile-${Date.now()}.json`);

    const result = await runMigration({
      isDryRun: false,
      target: "development",
      cloudinaryClient: mockCloudinary,
      leadModel: mockModel,
      ledgerPath: tmpLedger,
    });

    expect(result.reconciled).toBe(1);
    expect(mockCloudinary.uploader.rename).not.toHaveBeenCalled(); // No duplicate rename
    expect(mockModel.updateOne).toHaveBeenCalledWith(
      { _id: "lead_reconcile_01" },
      expect.objectContaining({
        $set: expect.objectContaining({
          "vigilanceDetails.audio.deliveryType": "authenticated",
          "vigilanceDetails.audio.protectionStatus": "protected",
        }),
      })
    );

    const entry = result.ledger.find((e) => e.leadCode === "VA-2026-9004");
    expect(entry?.status).toBe("RECONCILED");
    expect(entry?.cloudinaryResult).toBe("ALREADY_AUTHENTICATED");
    expect(entry?.mongoResult).toBe("SUCCESS");

    if (fs.existsSync(tmpLedger)) fs.unlinkSync(tmpLedger);
  });
});

describe("Phase 1 & 2 — Independent Cloudinary Source Type & Asset Identity Verification", () => {
  const originalArgv = process.argv;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.argv = ["node", "migrate-cloudinary-audio.ts", "--execute"];
    process.env.CONFIRM_MIGRATION = "true";
    process.env.NODE_ENV = "development";
    process.env.MIGRATION_TARGET = "development";
    process.env.MONGODB_URI = "mongodb://127.0.0.1:27017/crm_dev_test";
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.env = { ...originalEnv };
  });

  it("1. Upload assets invoke rename with type 'upload'", async () => {
    const mockCloudinary = {
      api: {
        resource: jest.fn().mockImplementation((_id: string, opts: any) => {
          if (opts.type === "upload") {
            return Promise.resolve({ type: "upload", resource_type: "video" });
          }
          return Promise.reject(new Error("Resource not found"));
        }),
      },
      uploader: {
        rename: jest.fn().mockResolvedValue({
          public_id: "vibhanu-crm/audio/upload_rec_01",
          type: "authenticated",
        }),
      },
    };

    const mockModel = {
      countDocuments: jest.fn().mockResolvedValue(1),
      aggregate: jest.fn().mockResolvedValue([{ _id: "upload", count: 1 }]),
      find: jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue([
          {
            _id: "lead_up_01",
            leadCode: "VA-2026-UP01",
            vigilanceDetails: {
              audio: {
                publicId: "vibhanu-crm/audio/upload_rec_01",
                deliveryType: "upload",
              },
            },
          },
        ]),
      }),
      updateOne: jest.fn().mockResolvedValue({ acknowledged: true, matchedCount: 1 }),
      findById: jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue({
          vigilanceDetails: { audio: { deliveryType: "authenticated" } },
        }),
      }),
    };

    const tmpLedger = path.join(os.tmpdir(), `ledger-up-${Date.now()}.json`);

    const result = await runMigration({
      isDryRun: false,
      target: "development",
      cloudinaryClient: mockCloudinary,
      leadModel: mockModel,
      ledgerPath: tmpLedger,
    });

    expect(result.succeeded).toBe(1);
    expect(mockCloudinary.uploader.rename).toHaveBeenCalledTimes(1);
    expect(mockCloudinary.uploader.rename).toHaveBeenCalledWith(
      "vibhanu-crm/audio/upload_rec_01",
      "vibhanu-crm/audio/upload_rec_01",
      expect.objectContaining({
        type: "upload",
        to_type: "authenticated",
        overwrite: false,
      })
    );

    if (fs.existsSync(tmpLedger)) fs.unlinkSync(tmpLedger);
  });

  it("2. Private assets invoke rename with type 'private'", async () => {
    const mockCloudinary = {
      api: {
        resource: jest.fn().mockImplementation((_id: string, opts: any) => {
          if (opts.type === "private") {
            return Promise.resolve({ type: "private", resource_type: "video" });
          }
          return Promise.reject(new Error("Resource not found"));
        }),
      },
      uploader: {
        rename: jest.fn().mockResolvedValue({
          public_id: "vibhanu-crm/audio/priv_rec_02",
          type: "authenticated",
        }),
      },
    };

    // Even if MongoDB recorded deliveryType as 'upload', independent Cloudinary inspection detects 'private'
    const mockModel = {
      countDocuments: jest.fn().mockResolvedValue(1),
      aggregate: jest.fn().mockResolvedValue([{ _id: "private", count: 1 }]),
      find: jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue([
          {
            _id: "lead_priv_02",
            leadCode: "VA-2026-PRIV02",
            vigilanceDetails: {
              audio: {
                publicId: "vibhanu-crm/audio/priv_rec_02",
                deliveryType: "private",
              },
            },
          },
        ]),
      }),
      updateOne: jest.fn().mockResolvedValue({ acknowledged: true, matchedCount: 1 }),
      findById: jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue({
          vigilanceDetails: { audio: { deliveryType: "authenticated" } },
        }),
      }),
    };

    const tmpLedger = path.join(os.tmpdir(), `ledger-priv-${Date.now()}.json`);

    const result = await runMigration({
      isDryRun: false,
      target: "development",
      cloudinaryClient: mockCloudinary,
      leadModel: mockModel,
      ledgerPath: tmpLedger,
    });

    expect(result.succeeded).toBe(1);
    expect(mockCloudinary.uploader.rename).toHaveBeenCalledTimes(1);
    expect(mockCloudinary.uploader.rename).toHaveBeenCalledWith(
      "vibhanu-crm/audio/priv_rec_02",
      "vibhanu-crm/audio/priv_rec_02",
      expect.objectContaining({
        type: "private",
        to_type: "authenticated",
        overwrite: false,
      })
    );

    if (fs.existsSync(tmpLedger)) fs.unlinkSync(tmpLedger);
  });

  it("3. Unknown assets never invoke rename", async () => {
    const mockCloudinary = {
      api: {
        // Not found in any delivery tier
        resource: jest.fn().mockRejectedValue({ http_code: 404, message: "Resource not found" }),
      },
      uploader: {
        rename: jest.fn(),
      },
    };

    const mockModel = {
      countDocuments: jest.fn().mockResolvedValue(1),
      aggregate: jest.fn().mockResolvedValue([{ _id: "upload", count: 1 }]),
      find: jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue([
          {
            _id: "lead_unk_03",
            leadCode: "VA-2026-UNK03",
            vigilanceDetails: {
              audio: {
                publicId: "vibhanu-crm/audio/unk_rec_03",
                deliveryType: "upload",
              },
            },
          },
        ]),
      }),
      updateOne: jest.fn(),
    };

    const tmpLedger = path.join(os.tmpdir(), `ledger-unk-${Date.now()}.json`);

    const result = await runMigration({
      isDryRun: false,
      target: "development",
      cloudinaryClient: mockCloudinary,
      leadModel: mockModel,
      ledgerPath: tmpLedger,
    });

    expect(result.skipped).toBe(1);
    expect(mockCloudinary.uploader.rename).not.toHaveBeenCalled();
    const entry = result.ledger.find((e) => e.leadCode === "VA-2026-UNK03");
    expect(entry?.status).toBe("SKIPPED");
    expect(entry?.errorCategory).toBe("UNVERIFIED_SOURCE");

    if (fs.existsSync(tmpLedger)) fs.unlinkSync(tmpLedger);
  });

  it("4. Authenticated assets are skipped or reconciled based on identity verification", async () => {
    const mockCloudinary = {
      api: {
        resource: jest.fn().mockImplementation((_id: string, opts: any) => {
          if (opts.type === "authenticated") {
            return Promise.resolve({
              type: "authenticated",
              resource_type: "video",
              format: "wav",
              bytes: 64000,
            });
          }
          return Promise.reject(new Error("Resource not found"));
        }),
      },
      uploader: {
        rename: jest.fn(),
      },
    };

    // Lead with verified corroborating metadata
    const mockModel = {
      countDocuments: jest.fn().mockResolvedValue(1),
      aggregate: jest.fn().mockResolvedValue([{ _id: "upload", count: 1 }]),
      find: jest.fn().mockImplementation((query?: any) => {
        if (query?._id?.$ne) {
          return { select: jest.fn().mockResolvedValue([]) };
        }
        return {
          select: jest.fn().mockResolvedValue([
            {
              _id: "lead_auth_04",
              leadCode: "VA-2026-AUTH04",
              vigilanceDetails: {
                audio: {
                  publicId: "vibhanu-crm/audio/auth_rec_04",
                  deliveryType: "upload",
                  format: "wav",
                  fileSize: 64000,
                },
              },
            },
          ]),
        };
      }),
      updateOne: jest.fn().mockResolvedValue({ acknowledged: true, matchedCount: 1 }),
      findById: jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue({
          vigilanceDetails: { audio: { deliveryType: "authenticated" } },
        }),
      }),
    };

    const tmpLedger = path.join(os.tmpdir(), `ledger-auth-${Date.now()}.json`);

    const result = await runMigration({
      isDryRun: false,
      target: "development",
      cloudinaryClient: mockCloudinary,
      leadModel: mockModel,
      ledgerPath: tmpLedger,
    });

    expect(result.reconciled).toBe(1);
    expect(mockCloudinary.uploader.rename).not.toHaveBeenCalled();
    expect(mockModel.updateOne).toHaveBeenCalledTimes(1);

    if (fs.existsSync(tmpLedger)) fs.unlinkSync(tmpLedger);
  });

  it("5. Mismatched asset identities are never reconciled", async () => {
    // 5A: Format mismatch (MongoDB has mp3, Cloudinary has wav)
    const mockCloudinaryFormatMismatch = {
      api: {
        resource: jest.fn().mockImplementation((_id: string, opts: any) => {
          if (opts.type === "authenticated") {
            return Promise.resolve({
              type: "authenticated",
              resource_type: "video",
              format: "wav", // MISMATCH: Cloudinary has wav
              bytes: 50000,
            });
          }
          return Promise.reject(new Error("Not found"));
        }),
      },
      uploader: { rename: jest.fn() },
    };

    const mockModelFormatMismatch = {
      countDocuments: jest.fn().mockResolvedValue(1),
      aggregate: jest.fn().mockResolvedValue([{ _id: "upload", count: 1 }]),
      find: jest.fn().mockImplementation((query?: any) => {
        if (query?._id?.$ne) return { select: jest.fn().mockResolvedValue([]) };
        return {
          select: jest.fn().mockResolvedValue([
            {
              _id: "lead_mismatch_05",
              leadCode: "VA-2026-MM05",
              vigilanceDetails: {
                audio: {
                  publicId: "vibhanu-crm/audio/rec_mm_05",
                  deliveryType: "upload",
                  format: "mp3", // MISMATCH: Mongo has mp3
                  fileSize: 50000,
                },
              },
            },
          ]),
        };
      }),
      updateOne: jest.fn(),
    };

    const tmpLedger = path.join(os.tmpdir(), `ledger-mm-${Date.now()}.json`);

    const result = await runMigration({
      isDryRun: false,
      target: "development",
      cloudinaryClient: mockCloudinaryFormatMismatch,
      leadModel: mockModelFormatMismatch,
      ledgerPath: tmpLedger,
    });

    expect(result.skipped).toBe(1);
    expect(result.reconciled).toBe(0);
    expect(mockCloudinaryFormatMismatch.uploader.rename).not.toHaveBeenCalled();
    expect(mockModelFormatMismatch.updateOne).not.toHaveBeenCalled();

    const entry = result.ledger.find((e) => e.leadCode === "VA-2026-MM05");
    expect(entry?.status).toBe("SKIPPED");
    expect(entry?.errorCategory).toBe("IDENTITY_MISMATCH");
    expect(entry?.error).toContain("Format mismatch");

    // 5B: Ambiguous database association (Duplicate lead claiming same publicId)
    const leadToCheck = {
      _id: "lead_curr_01",
      leadCode: "VA-2026-CURR",
      vigilanceDetails: {
        audio: {
          publicId: "vibhanu-crm/audio/shared_recording",
          format: "mp3",
          fileSize: 50000,
        },
      },
    };
    const authAsset = {
      type: "authenticated",
      resource_type: "video",
      format: "mp3",
      bytes: 50000,
    };
    const mockModelDuplicateLeads = {
      find: jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue([
          { _id: "lead_other_02", leadCode: "VA-2026-OTHER" },
        ]),
      }),
    };

    const identityCheck = await verifyAssetIdentityForReconciliation(
      leadToCheck,
      authAsset,
      mockModelDuplicateLeads
    );
    expect(identityCheck.verified).toBe(false);
    expect(identityCheck.reason).toContain("Ambiguous database association");

    if (fs.existsSync(tmpLedger)) fs.unlinkSync(tmpLedger);
  });

  it("6. overwrite:false is always enforced across rename calls", async () => {
    const mockCloudinary = {
      api: {
        resource: jest.fn().mockImplementation((_id: string, opts: any) => {
          if (opts.type === "upload") return Promise.resolve({ type: "upload", resource_type: "video" });
          return Promise.reject(new Error("Not found"));
        }),
      },
      uploader: {
        rename: jest.fn().mockResolvedValue({
          public_id: "vibhanu-crm/audio/rec_ow_06",
          type: "authenticated",
        }),
      },
    };

    const mockModel = {
      countDocuments: jest.fn().mockResolvedValue(1),
      aggregate: jest.fn().mockResolvedValue([{ _id: "upload", count: 1 }]),
      find: jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue([
          {
            _id: "lead_ow_06",
            leadCode: "VA-2026-OW06",
            vigilanceDetails: {
              audio: {
                publicId: "vibhanu-crm/audio/rec_ow_06",
                deliveryType: "upload",
              },
            },
          },
        ]),
      }),
      updateOne: jest.fn().mockResolvedValue({ acknowledged: true, matchedCount: 1 }),
      findById: jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue({
          vigilanceDetails: { audio: { deliveryType: "authenticated" } },
        }),
      }),
    };

    const tmpLedger = path.join(os.tmpdir(), `ledger-ow-${Date.now()}.json`);

    await runMigration({
      isDryRun: false,
      target: "development",
      cloudinaryClient: mockCloudinary,
      leadModel: mockModel,
      ledgerPath: tmpLedger,
    });

    expect(mockCloudinary.uploader.rename).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({
        overwrite: false, // MUST BE FALSE
      })
    );

    if (fs.existsSync(tmpLedger)) fs.unlinkSync(tmpLedger);
  });
});

describe("Phase 5 — Durable Ledger Persistence & Non-Secret Invariant", () => {
  it("should durably persist ledger to disk with all required fields and no secrets", () => {
    const tmpLedger = path.join(os.tmpdir(), `ledger-test-${Date.now()}.json`);

    const entries: DurableLedgerEntry[] = [
      {
        leadId: "lead_001",
        leadCode: "VA-2026-1001",
        publicId: "vibhanu-crm/audio/call_01",
        previousDeliveryType: "upload",
        currentVerifiedCloudinaryType: "authenticated",
        cloudinaryResult: "SUCCESS",
        mongoResult: "SUCCESS",
        status: "SUCCESS",
        timestamp: new Date().toISOString(),
        errorCategory: "NONE",
      },
      {
        leadId: "lead_002",
        leadCode: "VA-2026-1002",
        publicId: "vibhanu-crm/audio/call_02",
        previousDeliveryType: "upload",
        currentVerifiedCloudinaryType: "upload",
        cloudinaryResult: "FAILED",
        mongoResult: "NOT_ATTEMPTED",
        status: "FAILED",
        timestamp: new Date().toISOString(),
        errorCategory: "CLOUDINARY_API_ERROR",
        error: "Upstream rate limit exceeded",
      },
    ];

    writeLedgerToFile(tmpLedger, entries);

    expect(fs.existsSync(tmpLedger)).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(tmpLedger, "utf8"));
    expect(parsed.length).toBe(2);
    expect(parsed[0].leadCode).toBe("VA-2026-1001");
    expect(parsed[1].errorCategory).toBe("CLOUDINARY_API_ERROR");

    // Strictly ensure no credentials or signatures in serialized output
    const rawContent = fs.readFileSync(tmpLedger, "utf8");
    expect(rawContent).not.toContain("api_secret");
    expect(rawContent).not.toContain("ticket=");
    expect(rawContent).not.toContain("Bearer ");

    if (fs.existsSync(tmpLedger)) fs.unlinkSync(tmpLedger);
  });
});

describe("Phase 6 — Redis Configuration & Production Fail-Closed Behavior", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    clearMockRedisClient();
    process.env = { ...originalEnv };
  });

  it("should sanitize Redis connection URLs and mask credentials in logs", () => {
    expect(maskRedisUrl("redis://default:SecretPassword123@redis-host.upstash.io:6379")).toBe(
      "redis://default:******@redis-host.upstash.io:6379"
    );
    expect(maskRedisUrl("rediss://:MyRedisToken@127.0.0.1:6380?timeout=5000")).toBe(
      "rediss://:******@127.0.0.1:6380"
    );
    expect(maskRedisUrl(undefined)).toBe("[NOT CONFIGURED]");
  });

  it("should support mock Redis client for isolated offline testing", () => {
    const fakeMock = { ping: jest.fn().mockResolvedValue("PONG") };
    setMockRedisClient(fakeMock);

    expect(getRedisClient()).toBe(fakeMock);

    clearMockRedisClient();
    expect(getRedisClient()).not.toBe(fakeMock);
  });

  it("should fail closed in production when Redis is unconfigured or unavailable", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.REDIS_URL;
    delete process.env.KV_URL;
    delete process.env.UPSTASH_REDIS_URL;
    clearMockRedisClient();

    // 1. getRedisClient() throws in production when unconfigured
    expect(() => {
      getRedisClient();
    }).toThrow(/(REDIS_URL|KV_URL)/);

    // 2. MediaTicketService.createSession() fails closed in production
    await expect(
      MediaTicketService.createSession("lead_test_01", "user_test_01")
    ).rejects.toThrow(/(REDIS_URL|Shared Redis storage is required in production)/);

    // 3. MediaTicketService.validateSession() fails closed in production
    await expect(
      MediaTicketService.validateSession("mock_ticket_123", "lead_test_01")
    ).rejects.toThrow(/(REDIS_URL|Shared Redis storage is required in production)/);

    // 4. MediaTicketService.revokeSession() fails closed in production
    await expect(
      MediaTicketService.revokeSession("mock_ticket_123")
    ).rejects.toThrow(/(REDIS_URL|Shared Redis storage is required in production)/);
  });

  it("should map KV_URL and UPSTASH_REDIS_URL consistently when REDIS_URL is not explicitly set", () => {
    delete process.env.REDIS_URL;
    process.env.KV_URL = "redis://default:token@kv.upstash.io:6379";

    const masked = maskRedisUrl(process.env.KV_URL);
    expect(masked).toBe("redis://default:******@kv.upstash.io:6379");
  });
});
