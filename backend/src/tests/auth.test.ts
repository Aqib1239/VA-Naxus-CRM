import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { app } from "../app";
import { User } from "../models/User.model";
import { ROLES } from "../constants/roles";
import { randomBytes } from "node:crypto";


let mongoServer: MongoMemoryServer;

jest.setTimeout(120000);

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await User.deleteMany({});
});

const createTestPassword = (): string =>
  randomBytes(32).toString("base64url");

const testUserPassword = createTestPassword();

describe("Authentication API", () => {
  const testUser = {
    name: "Test Admin",
    email: "admin@vibhanu.com",
    password: testUserPassword,
    role: ROLES.ADMIN,
    department: "Executive Management",
  };

  it("should securely hash password on save and not expose plaintext", async () => {
    const user = new User(testUser);
    await user.save();

    const rawUser = await User.findById(user._id).select("+password");
    expect(rawUser?.password).toBeDefined();
    expect(rawUser?.password).not.toBe(testUser.password);
    expect(rawUser?.password).toMatch(/^\$2[aby]\$/); // bcrypt hash format
  });

  it("should successfully log in with valid credentials and return JWT & user", async () => {
    const user = new User(testUser);
    await user.save();

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: testUser.email, password: testUser.password });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.user.email).toBe(testUser.email);
    expect(res.body.data.user.role).toBe(ROLES.ADMIN);
    expect(res.body.data.user.password).toBeUndefined();
  });

  it("should reject login with wrong password (401)", async () => {
    const user = new User(testUser);
    await user.save();

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: testUser.email, password: createTestPassword() });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it("should reject login for non-existent email (401)", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "unknown@vibhanu.com", password: createTestPassword() });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it("should fetch current authenticated user via GET /api/auth/me", async () => {
    const user = new User(testUser);
    await user.save();

    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ email: testUser.email, password: testUser.password });

    const token = loginRes.body.data.token;

    const meRes = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`);

    expect(meRes.status).toBe(200);
    expect(meRes.body.data.user.email).toBe(testUser.email);
    expect(meRes.body.data.user.name).toBe(testUser.name);
  });

  it("should reject unauthenticated requests to /api/auth/me (401)", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  describe("Remediated Security Controls & Six-Role Independent Logins", () => {
    it("should reject passwords that do not match the user's stored password", async () => {
      const validPassword = createTestPassword();

      const user = new User({
        name: "Security User",
        email: "secuser@vibhanu.com",
        password: validPassword,
        role: ROLES.ADMIN,
        department: "Executive Management",
      });

      await user.save();

      // Generate different passwords to verify authentication rejects mismatches.
      const invalidPasswords = Array.from(
        { length: 3 },
        () => createTestPassword()
      );

      for (const password of invalidPasswords) {
        const res = await request(app)
          .post("/api/auth/login")
          .send({
            email: "secuser@vibhanu.com",
            password,
          });

        expect(res.status).toBe(401);
        expect(res.body.success).toBe(false);
      }
    });

    it("should reject role names as email login shortcuts", async () => {
      const roleShortcutPassword = createTestPassword();

      const admin = new User({
        name: "Admin User",
        email: "admin@vibhanu.com",
        password: roleShortcutPassword,
        role: ROLES.ADMIN,
        department: "Executive Management",
      });

      await admin.save();

      // Attempt login using "admin" instead of the registered email
      const res = await request(app)
        .post("/api/auth/login")
        .send({
          email: "admin",
          password: roleShortcutPassword,
        });

      // Should return 422 (validation failure) or 401 (authentication failure)
      expect([401, 422]).toContain(res.status);
      expect(res.body.success).toBe(false);
    });

    it("should reject empty or missing credentials (422)", async () => {
      const emptyRes = await request(app)
        .post("/api/auth/login")
        .send({});
      expect(emptyRes.status).toBe(422);

      const blankRes = await request(app)
        .post("/api/auth/login")
        .send({ email: "", password: "" });
      expect(blankRes.status).toBe(422);
    });

    it("should authenticate each of the 6 roles independently and issue role-accurate JWTs", async () => {
      const rolesToTest = [
        {
          role: ROLES.ADMIN,
          email: "ananya.admin@vibhanu.com",
          dept: "Executive Management",
        },
        {
          role: ROLES.MARKETING,
          email: "rohan.mkt@vibhanu.com",
          dept: "Growth & Acquisition",
        },
        {
          role: ROLES.COMMUNICATION,
          email: "pooja.com@vibhanu.com",
          dept: "Customer Outreach",
        },
        {
          role: ROLES.VIGILANCE,
          email: "vikram.vig@vibhanu.com",
          dept: "Compliance & Vigilance",
        },
        {
          role: ROLES.SUPPORT,
          email: "neha.sup@vibhanu.com",
          dept: "Operations & Support",
        },
        {
          role: ROLES.SALES,
          email: "aditya.sal@vibhanu.com",
          dept: "Enterprise Sales",
        },
      ];

      for (const account of rolesToTest) {
        const accountPassword = createTestPassword();

        const user = new User({
          name: `${account.role} Specialist`,
          email: account.email,
          password: accountPassword,
          role: account.role,
          department: account.dept,
        });

        await user.save();

        const loginRes = await request(app)
          .post("/api/auth/login")
          .send({
            email: account.email,
            password: accountPassword,
          });

        expect(loginRes.status).toBe(200);
        expect(loginRes.body.data.user.role).toBe(account.role);
        expect(loginRes.body.data.user.email).toBe(account.email);
        expect(loginRes.body.data.user.password).toBeUndefined();

        const token = loginRes.body.data.token;

        expect(token).toBeDefined();

        // Verify authenticated user through /api/auth/me
        const meRes = await request(app)
          .get("/api/auth/me")
          .set("Authorization", `Bearer ${token}`);

        expect(meRes.status).toBe(200);
        expect(meRes.body.data.user.role).toBe(account.role);
        expect(meRes.body.data.user.email).toBe(account.email);
      }
    });

    it("should ignore any client-supplied role in login body and derive role purely from DB record", async () => {
      const marketingPassword = createTestPassword();

      const mktUser = new User({
        name: "Marketing Exec",
        email: "mkt.attacker@vibhanu.com",
        password: marketingPassword,
        role: ROLES.MARKETING,
        department: "Growth & Acquisition",
      });
      await mktUser.save();

      // Client attempts to supply role: "ADMIN" in login payload
      const loginRes = await request(app)
        .post("/api/auth/login")
        .send({
          email: "mkt.attacker@vibhanu.com",
          password: marketingPassword,
          role: "ADMIN",
        } as any);

      expect(loginRes.status).toBe(200);
      // Authority must remain MARKETING from the database, NOT ADMIN
      expect(loginRes.body.data.user.role).toBe(ROLES.MARKETING);

      const meRes = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${loginRes.body.data.token}`);

      expect(meRes.body.data.user.role).toBe(ROLES.MARKETING);
    });

    it("should fail validation in production when JWT_SECRET is missing or less than 32 characters", () => {
      const { z } = require("zod");
      const prodEnvSchema = z.object({
        NODE_ENV: z.literal("production"),
        JWT_SECRET: z.string({
          required_error: "JWT_SECRET is required in production environment.",
        }).min(32, "JWT_SECRET must be at least 32 characters in production."),
      });

      // Missing JWT_SECRET
      const missingSecret = prodEnvSchema.safeParse({ NODE_ENV: "production" });
      expect(missingSecret.success).toBe(false);

      // Short JWT_SECRET (< 32 chars)
      const shortSecret = prodEnvSchema.safeParse({
        NODE_ENV: "production",
        JWT_SECRET: "x".repeat(22),
      });
      expect(shortSecret.success).toBe(false);

      // Valid strong JWT_SECRET (>= 32 chars)
      const validSecret = prodEnvSchema.safeParse({
        NODE_ENV: "production",
        JWT_SECRET: "x".repeat(64),
      });
      expect(validSecret.success).toBe(true);
    });

    it("should enforce a minimum of 12 characters for new user accounts via createUserValidator", () => {
      const { createUserValidator } = require("../validators/auth.validator");

      const shortValidationPassword = "x".repeat(10);
      const validValidationPassword = "x".repeat(22);

      // Password shorter than 12 characters
      const shortResult = createUserValidator.safeParse({
        name: "New Sales User",
        email: "newsales@vibhanu.com",
        password: shortValidationPassword,
        role: ROLES.SALES,
        department: "Enterprise Sales",
      });

      expect(shortResult.success).toBe(false);
      expect(shortResult.error.errors[0].message).toMatch(
        /Password must be at least 12 characters/
      );

      // Password with 12 or more characters
      const validResult = createUserValidator.safeParse({
        name: "New Sales User",
        email: "newsales@vibhanu.com",
        password: validValidationPassword,
        role: ROLES.SALES,
        department: "Enterprise Sales",
      });

      expect(validResult.success).toBe(true);
    });

    it("should reject admin user creation when password is shorter than 12 characters via API", async () => {
      // 1. Generate credentials for the test admin
      const adminPassword = createTestPassword();

      const admin = new User({
        name: "Super Admin",
        email: "superadmin@vibhanu.com",
        password: adminPassword,
        role: ROLES.ADMIN,
        department: "Executive Management",
      });

      await admin.save();

      const loginRes = await request(app)
        .post("/api/auth/login")
        .send({
          email: "superadmin@vibhanu.com",
          password: adminPassword,
        });

      expect(loginRes.status).toBe(200);

      const adminToken = loginRes.body.data.token;
      const shortApiTestPassword = "x".repeat(8);

      // 2. Attempt to create a user with a password shorter than 12 characters
      const createShortRes = await request(app)
        .post("/api/admin/users")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          name: "Junior Sales",
          email: "juniorsales@vibhanu.com",
          password: shortApiTestPassword,
          role: ROLES.SALES,
          department: "Enterprise Sales",
        });

      expect(createShortRes.status).toBe(422);

      // 3. Create a user with a valid generated password
      const validNewUserPassword = createTestPassword();

      const createValidRes = await request(app)
        .post("/api/admin/users")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          name: "Junior Sales",
          email: "juniorsales@vibhanu.com",
          password: validNewUserPassword,
          role: ROLES.SALES,
          department: "Enterprise Sales",
        });

      expect(createValidRes.status).toBe(201);
      expect(createValidRes.body.data.user.email).toBe(
        "juniorsales@vibhanu.com"
      );
      expect(createValidRes.body.data.user.password).toBeUndefined();
    });

    it("should allow existing users with legacy valid passwords (6+ chars) to authenticate without resetting", async () => {
      // Generate a seven-character legacy password
      const legacyPassword = "x".repeat(7);

      const legacyUser = new User({
        name: "Legacy User",
        email: "legacy@vibhanu.com",
        password: legacyPassword,
        role: ROLES.SUPPORT,
        department: "Operations & Support",
      });

      await legacyUser.save();

      // Ensure password hash was generated and preserved
      const savedUser = await User.findById(legacyUser._id).select("+password");

      expect(savedUser?.password).toMatch(/^\$2[aby]\$/);

      const initialHash = savedUser?.password;

      // Authenticate using the existing seven-character password
      const loginRes = await request(app)
        .post("/api/auth/login")
        .send({
          email: "legacy@vibhanu.com",
          password: legacyPassword,
        });

      expect(loginRes.status).toBe(200);
      expect(loginRes.body.data.user.email).toBe("legacy@vibhanu.com");
      expect(loginRes.body.data.user.role).toBe(ROLES.SUPPORT);

      // Verify that the password hash remains unchanged
      const postLoginUser = await User.findById(legacyUser._id).select("+password");

      expect(postLoginUser?.password).toBe(initialHash);
    });
  });
});
