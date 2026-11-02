import {
  seedDatabase,
  validateSeedEnvironment,
  seedDatabaseIfEmpty,
  PRIMARY_DEMO_USERS,
  ALIAS_DEMO_USERS,
} from "../scripts/seed";
import { User } from "../models/User.model";
import { Lead } from "../models/Lead.model";
import { logger } from "../config/logger";
import { ROLES } from "../constants/roles";

describe("Hardened Seed Script (Phase 1.1 & 1.2)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
  });

  describe("Configuration & Environment Validation (validateSeedEnvironment)", () => {
    it("should reject execution when NODE_ENV is missing or undefined", () => {
      delete process.env.NODE_ENV;
      process.env.SEED_DEFAULT_PASSWORD = "ValidSeedPassword#2026";

      expect(() => validateSeedEnvironment()).toThrow(
        /FATAL: NODE_ENV is missing or empty\. Demo seeding is strictly restricted to 'development' or 'test'\./
      );
    });

    it("should reject execution when NODE_ENV is empty or whitespace only", () => {
      process.env.NODE_ENV = "   ";
      process.env.SEED_DEFAULT_PASSWORD = "ValidSeedPassword#2026";

      expect(() => validateSeedEnvironment()).toThrow(
        /FATAL: NODE_ENV is missing or empty\. Demo seeding is strictly restricted to 'development' or 'test'\./
      );
    });

    it("should reject execution when NODE_ENV is production", () => {
      process.env.NODE_ENV = "production";
      process.env.SEED_DEFAULT_PASSWORD = "ValidSeedPassword#2026";

      expect(() => validateSeedEnvironment()).toThrow(
        /FATAL: Demo seed script is not permitted to run in environment 'production'\. It is strictly restricted to 'development' or 'test'\./
      );
    });

    it("should reject execution when NODE_ENV is an unexpected or unknown environment (staging, uat, qa)", () => {
      const unknownEnvs = ["staging", "uat", "qa", "preview", "sandbox"];
      process.env.SEED_DEFAULT_PASSWORD = "ValidSeedPassword#2026";

      for (const envVal of unknownEnvs) {
        process.env.NODE_ENV = envVal;
        expect(() => validateSeedEnvironment()).toThrow(
          new RegExp(`FATAL: Demo seed script is not permitted to run in environment '${envVal}'`)
        );
      }
    });

    it("should allow execution when NODE_ENV is development with valid seed password", () => {
      process.env.NODE_ENV = "development";
      process.env.SEED_DEFAULT_PASSWORD = "ValidSecretPassword#2026";

      const resolved = validateSeedEnvironment();
      expect(resolved).toBe("ValidSecretPassword#2026");
    });

    it("should allow execution when NODE_ENV is test with valid seed password", () => {
      process.env.NODE_ENV = "test";
      process.env.SEED_DEFAULT_PASSWORD = "ValidSecretPassword#2026";

      const resolved = validateSeedEnvironment();
      expect(resolved).toBe("ValidSecretPassword#2026");
    });

    it("should reject execution when SEED_DEFAULT_PASSWORD is missing", () => {
      process.env.NODE_ENV = "development";
      delete process.env.SEED_DEFAULT_PASSWORD;

      expect(() => validateSeedEnvironment()).toThrow(
        /SEED_DEFAULT_PASSWORD environment variable is required/
      );
    });

    it("should reject execution when SEED_DEFAULT_PASSWORD is empty or whitespace only", () => {
      process.env.NODE_ENV = "development";
      process.env.SEED_DEFAULT_PASSWORD = "    ";

      expect(() => validateSeedEnvironment()).toThrow(
        /SEED_DEFAULT_PASSWORD environment variable is required/
      );
    });

    it("should reject execution when SEED_DEFAULT_PASSWORD is shorter than 12 characters", () => {
      process.env.NODE_ENV = "development";
      process.env.SEED_DEFAULT_PASSWORD = "ShortPass!1"; // 11 characters

      expect(() => validateSeedEnvironment()).toThrow(
        /must be at least 12 characters long to satisfy password policy/
      );
    });

    it("should pass and return trimmed password when SEED_DEFAULT_PASSWORD is 12 or more characters", () => {
      process.env.NODE_ENV = "development";
      process.env.SEED_DEFAULT_PASSWORD = "   ValidSecretPassword#2026   ";

      const resolved = validateSeedEnvironment();
      expect(resolved).toBe("ValidSecretPassword#2026");
      expect(resolved.length).toBeGreaterThanOrEqual(12);
    });
  });

  describe("Pre-Execution Guardrails & Zero Database Operations on Rejection", () => {
    it("should reject execution and perform zero database reads/writes when NODE_ENV is missing", async () => {
      delete process.env.NODE_ENV;
      process.env.SEED_DEFAULT_PASSWORD = "ValidSeedPassword#2026";

      const userFindSpy = jest.spyOn(User, "findOne");
      const userSaveSpy = jest.spyOn(User.prototype, "save");
      const leadFindSpy = jest.spyOn(Lead, "findOne");
      const leadSaveSpy = jest.spyOn(Lead.prototype, "save");

      await expect(seedDatabase()).rejects.toThrow(
        /FATAL: NODE_ENV is missing or empty/
      );

      expect(userFindSpy).not.toHaveBeenCalled();
      expect(userSaveSpy).not.toHaveBeenCalled();
      expect(leadFindSpy).not.toHaveBeenCalled();
      expect(leadSaveSpy).not.toHaveBeenCalled();
    });

    it("should reject execution and perform zero database reads/writes when NODE_ENV is production", async () => {
      process.env.NODE_ENV = "production";
      process.env.SEED_DEFAULT_PASSWORD = "ValidSeedPassword#2026";

      const userFindSpy = jest.spyOn(User, "findOne");
      const userSaveSpy = jest.spyOn(User.prototype, "save");
      const leadFindSpy = jest.spyOn(Lead, "findOne");
      const leadSaveSpy = jest.spyOn(Lead.prototype, "save");

      await expect(seedDatabase()).rejects.toThrow(
        /FATAL: Demo seed script is not permitted to run in environment 'production'/
      );

      expect(userFindSpy).not.toHaveBeenCalled();
      expect(userSaveSpy).not.toHaveBeenCalled();
      expect(leadFindSpy).not.toHaveBeenCalled();
      expect(leadSaveSpy).not.toHaveBeenCalled();
    });

    it("should reject execution and perform zero database reads/writes when NODE_ENV is unknown (e.g. staging)", async () => {
      process.env.NODE_ENV = "staging";
      process.env.SEED_DEFAULT_PASSWORD = "ValidSeedPassword#2026";

      const userFindSpy = jest.spyOn(User, "findOne");
      const userSaveSpy = jest.spyOn(User.prototype, "save");
      const leadFindSpy = jest.spyOn(Lead, "findOne");
      const leadSaveSpy = jest.spyOn(Lead.prototype, "save");

      await expect(seedDatabase()).rejects.toThrow(
        /FATAL: Demo seed script is not permitted to run in environment 'staging'/
      );

      expect(userFindSpy).not.toHaveBeenCalled();
      expect(userSaveSpy).not.toHaveBeenCalled();
      expect(leadFindSpy).not.toHaveBeenCalled();
      expect(leadSaveSpy).not.toHaveBeenCalled();
    });

    it("should reject execution and perform zero database reads/writes if SEED_DEFAULT_PASSWORD is missing", async () => {
      process.env.NODE_ENV = "development";
      delete process.env.SEED_DEFAULT_PASSWORD;

      const userFindSpy = jest.spyOn(User, "findOne");
      const userSaveSpy = jest.spyOn(User.prototype, "save");
      const leadFindSpy = jest.spyOn(Lead, "findOne");
      const leadSaveSpy = jest.spyOn(Lead.prototype, "save");

      await expect(seedDatabase()).rejects.toThrow(
        /SEED_DEFAULT_PASSWORD environment variable is required/
      );

      expect(userFindSpy).not.toHaveBeenCalled();
      expect(userSaveSpy).not.toHaveBeenCalled();
      expect(leadFindSpy).not.toHaveBeenCalled();
      expect(leadSaveSpy).not.toHaveBeenCalled();
    });

    it("should reject execution and perform zero database reads/writes if SEED_DEFAULT_PASSWORD is invalid (< 12 chars)", async () => {
      process.env.NODE_ENV = "development";
      process.env.SEED_DEFAULT_PASSWORD = "shortpass11"; // 11 characters

      const userFindSpy = jest.spyOn(User, "findOne");
      const userSaveSpy = jest.spyOn(User.prototype, "save");
      const leadFindSpy = jest.spyOn(Lead, "findOne");
      const leadSaveSpy = jest.spyOn(Lead.prototype, "save");

      await expect(seedDatabase()).rejects.toThrow(
        /must be at least 12 characters long to satisfy password policy/
      );

      expect(userFindSpy).not.toHaveBeenCalled();
      expect(userSaveSpy).not.toHaveBeenCalled();
      expect(leadFindSpy).not.toHaveBeenCalled();
      expect(leadSaveSpy).not.toHaveBeenCalled();
    });
  });

  describe("Preservation of Existing Accounts (Issue 1 & 4)", () => {
    it("should never modify existing account role, department, password, or status", async () => {
      process.env.NODE_ENV = "development";
      process.env.SEED_DEFAULT_PASSWORD = "ValidSeedPassword#2026";

      // Mock an existing administrator account whose credentials and role must remain preserved
      const existingUserRecord: any = {
        _id: "user_existing_admin_id",
        email: "admin@vibhanu.com",
        role: ROLES.VIGILANCE, // Intentionally different from seed demo role (ROLES.ADMIN)
        department: "Custom Compliance Group", // Custom department
        password: "$2a$10$existingSecureHashedPasswordValue",
        isActive: false, // Inactive status must remain preserved
        name: "Existing Admin Name",
        save: jest.fn().mockResolvedValue(true),
      };

      jest.spyOn(User.prototype, "save").mockResolvedValue({} as any);

      // User.findOne returns the existing user for admin@vibhanu.com, and null for others
      (jest.spyOn(User, "findOne") as any).mockImplementation((query: any) => {
        if (query.email === "admin@vibhanu.com") {
          return Promise.resolve(existingUserRecord);
        }
        if (query.email === "sales@vibhanu.com") {
          return Promise.resolve({
            _id: "user_sales_id",
            email: "sales@vibhanu.com",
            role: ROLES.SALES,
          } as any);
        }
        return Promise.resolve(null);
      });

      jest.spyOn(Lead, "findOne").mockResolvedValue(null);
      jest.spyOn(Lead.prototype, "save").mockResolvedValue({} as any);

      const result = await seedDatabase();

      // Existing user record must NOT be modified
      expect(existingUserRecord.role).toBe(ROLES.VIGILANCE);
      expect(existingUserRecord.department).toBe("Custom Compliance Group");
      expect(existingUserRecord.password).toBe("$2a$10$existingSecureHashedPasswordValue");
      expect(existingUserRecord.isActive).toBe(false);
      expect(existingUserRecord.name).toBe("Existing Admin Name");

      // existingUserRecord.save must NEVER be called
      expect(existingUserRecord.save).not.toHaveBeenCalled();

      // The existing user must be reported as skipped, not updated
      expect(result.usersSkipped).toBeGreaterThanOrEqual(1);
      expect(result.usersUpdated).toBe(0);
    });
  });

  describe("No Inaccessible Random Accounts (Issue 2)", () => {
    it("should create users only with explicit configured password (>= 12 chars)", async () => {
      process.env.NODE_ENV = "development";
      process.env.SEED_DEFAULT_PASSWORD = "ExplicitConfiguredPassword#2026";

      const createdUserInstances: any[] = [];
      jest.spyOn(User.prototype, "save").mockImplementation(function (this: any) {
        createdUserInstances.push({
          email: this.email,
          role: this.role,
          password: this.password,
        });
        return Promise.resolve(this);
      });

      jest.spyOn(User, "findOne").mockResolvedValue(null);
      jest.spyOn(Lead, "findOne").mockResolvedValue(null);
      jest.spyOn(Lead.prototype, "save").mockResolvedValue({} as any);

      const result = await seedDatabase();

      expect(result.usersCreated).toBe(PRIMARY_DEMO_USERS.length + ALIAS_DEMO_USERS.length);
      expect(createdUserInstances.length).toBe(PRIMARY_DEMO_USERS.length + ALIAS_DEMO_USERS.length);

      // Verify that all created users used the explicit configured password, not Math.random()
      for (const instance of createdUserInstances) {
        expect(instance.password).toBe("ExplicitConfiguredPassword#2026");
        expect(instance.password.length).toBeGreaterThanOrEqual(12);
        expect(instance.password).not.toMatch(/^VbInit_/);
      }
    });

    it("should not define demo user constants with random password values", () => {
      for (const user of PRIMARY_DEMO_USERS) {
        expect((user as any).password).toBeUndefined();
      }
      for (const user of ALIAS_DEMO_USERS) {
        expect((user as any).password).toBeUndefined();
      }
    });
  });

  describe("Credential Sanitization in Logs (Issue 2 & 4)", () => {
    it("should never expose seed credentials in logger or console output", async () => {
      const secretPassword = "SuperSecretDevSeedPassword#2026";
      process.env.NODE_ENV = "development";
      process.env.SEED_DEFAULT_PASSWORD = secretPassword;

      const loggedMessages: string[] = [];

      jest.spyOn(logger, "info").mockImplementation((...args: any[]) => {
        loggedMessages.push(JSON.stringify(args));
        return logger as any;
      });
      jest.spyOn(logger, "warn").mockImplementation((...args: any[]) => {
        loggedMessages.push(JSON.stringify(args));
        return logger as any;
      });
      jest.spyOn(logger, "error").mockImplementation((...args: any[]) => {
        loggedMessages.push(JSON.stringify(args));
        return logger as any;
      });
      jest.spyOn(console, "log").mockImplementation((...args: any[]) => {
        loggedMessages.push(args.join(" "));
      });

      jest.spyOn(User, "findOne").mockResolvedValue(null);
      jest.spyOn(User.prototype, "save").mockResolvedValue({} as any);
      jest.spyOn(Lead, "findOne").mockResolvedValue(null);
      jest.spyOn(Lead.prototype, "save").mockResolvedValue({} as any);

      const result = await seedDatabase();

      expect(result.usersCreated).toBeGreaterThan(0);

      // Inspect every single logged string across logger and console
      for (const logEntry of loggedMessages) {
        expect(logEntry).not.toContain(secretPassword);
      }
    });
  });

  describe("Automatic Seed Guardrails (seedDatabaseIfEmpty)", () => {
    it("should skip seeding entirely when in production environment", async () => {
      process.env.NODE_ENV = "production";
      process.env.SEED_DEFAULT_PASSWORD = "ValidSeedPassword#2026";

      const warnSpy = jest.spyOn(logger, "warn").mockImplementation(() => logger as any);
      const countSpy = jest.spyOn(User, "countDocuments");

      await seedDatabaseIfEmpty();

      expect(warnSpy).toHaveBeenCalledWith(
        expect.objectContaining({ nodeEnv: "production" }),
        expect.stringMatching(/demo seeding is strictly restricted to 'development' or 'test'/)
      );
      expect(countSpy).not.toHaveBeenCalled();
    });

    it("should skip seeding entirely when NODE_ENV is unknown (e.g. staging)", async () => {
      process.env.NODE_ENV = "staging";
      process.env.SEED_DEFAULT_PASSWORD = "ValidSeedPassword#2026";

      const warnSpy = jest.spyOn(logger, "warn").mockImplementation(() => logger as any);
      const countSpy = jest.spyOn(User, "countDocuments");

      await seedDatabaseIfEmpty();

      expect(warnSpy).toHaveBeenCalledWith(
        expect.objectContaining({ nodeEnv: "staging" }),
        expect.stringMatching(/demo seeding is strictly restricted to 'development' or 'test'/)
      );
      expect(countSpy).not.toHaveBeenCalled();
    });

    it("should skip seeding entirely when NODE_ENV is missing", async () => {
      delete process.env.NODE_ENV;
      process.env.SEED_DEFAULT_PASSWORD = "ValidSeedPassword#2026";

      const warnSpy = jest.spyOn(logger, "warn").mockImplementation(() => logger as any);
      const countSpy = jest.spyOn(User, "countDocuments");

      await seedDatabaseIfEmpty();

      expect(warnSpy).toHaveBeenCalledWith(
        expect.objectContaining({ nodeEnv: "missing" }),
        expect.stringMatching(/demo seeding is strictly restricted to 'development' or 'test'/)
      );
      expect(countSpy).not.toHaveBeenCalled();
    });

    it("should skip seeding and log warning when SEED_DEFAULT_PASSWORD is not configured", async () => {
      process.env.NODE_ENV = "development";
      delete process.env.SEED_DEFAULT_PASSWORD;

      const warnSpy = jest.spyOn(logger, "warn").mockImplementation(() => logger as any);
      const countSpy = jest.spyOn(User, "countDocuments");

      await seedDatabaseIfEmpty();

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringMatching(/SEED_DEFAULT_PASSWORD is not configured or does not meet the 12-character minimum/)
      );
      expect(countSpy).not.toHaveBeenCalled();
    });

    it("should skip seeding and log warning when SEED_DEFAULT_PASSWORD is shorter than 12 characters", async () => {
      process.env.NODE_ENV = "development";
      process.env.SEED_DEFAULT_PASSWORD = "ShortPass10"; // 10 characters (< 12)

      const warnSpy = jest.spyOn(logger, "warn").mockImplementation(() => logger as any);
      const countSpy = jest.spyOn(User, "countDocuments");

      await seedDatabaseIfEmpty();

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringMatching(/SEED_DEFAULT_PASSWORD is not configured or does not meet the 12-character minimum/)
      );
      expect(countSpy).not.toHaveBeenCalled();
    });

    it("should invoke seedDatabase when in development, password configured (>= 12), and user count is 0", async () => {
      process.env.NODE_ENV = "development";
      process.env.SEED_DEFAULT_PASSWORD = "ValidSeedPassword#2026";

      jest.spyOn(User, "countDocuments").mockResolvedValue(0 as any);
      jest.spyOn(User, "findOne").mockResolvedValue(null);
      jest.spyOn(User.prototype, "save").mockResolvedValue({} as any);
      jest.spyOn(Lead, "findOne").mockResolvedValue(null);
      jest.spyOn(Lead.prototype, "save").mockResolvedValue({} as any);

      await seedDatabaseIfEmpty();

      expect(User.countDocuments).toHaveBeenCalled();
      expect(User.findOne).toHaveBeenCalled();
    });
  });
});
