import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { app } from "../app";
import { User } from "../models/User.model";
import { Lead } from "../models/Lead.model";
import { ROLES } from "../constants/roles";
import { DEPARTMENTS, LEAD_STATUS } from "../constants/departments";
import { generateToken } from "../utils/jwt";
import { stripInternalReasoning } from "../services/ai/openrouter.provider";
import { unwrapJsonAnswer } from "../services/ai/command-center.service";

// Mock the OpenRouter Provider for Command Center
jest.mock("../services/ai/openrouter.provider", () => {
  const actual = jest.requireActual("../services/ai/openrouter.provider");
  return {
    ...actual,
    callOpenRouter: jest.fn(async ({ messages, correlationId }: any) => {
      const lastUserMsg = messages[messages.length - 1]?.content || "";
      let answer = "There is currently 1 lead in the pipeline for your authorized scope in VA Nexus.";
      let toolsUsed = ["get_stage_counts"];

      if (lastUserMsg.toLowerCase().includes("vigilance") || lastUserMsg.toLowerCase().includes("audio")) {
        answer = "### Vigilance Audio Audit Summary\n\n| Lead ID | Company Name | Stage / Status | Days Stalled | Audio Status | Evidence |\n|---|---|---|---|---|---|\n| **VA-2026-1001** | Alpha Metal Works | vigilance (meeting_scheduled) | 4d | **missing** | vigilanceDetails.audio is null/absent in database |\n\n**1 lead** in Vigilance is confirmed missing required audio verification.";
        toolsUsed = ["get_vigilance_leads_without_audio", "get_vigilance_audio_status_summary"];
      }

      return {
        content: JSON.stringify({
          answer,
          toolsUsed,
          suggestedFollowUps: ["Which leads are stalled?", "Show audio status summary"],
          disclaimer:
            "Live data analysis for ADMIN in VA Nexus via OpenRouter (nvidia/nemotron-3.5-lightning:free). Verified against CRM records.",
        }),
        model: "nvidia/nemotron-3.5-lightning:free",
        correlationId: correlationId || "test_cid",
        taskType: "command_center",
        latencyMs: 25,
        retries: 0,
        reasoningDetails: { server_internal_step: "verified" },
      };
    }),
  };
});

jest.mock("../config/openrouter", () => {
  const actual = jest.requireActual("../config/openrouter");
  return {
    ...actual,
    isOpenRouterConfigured: jest.fn(() => true),
  };
});

jest.mock("../config/gemini", () => {
  const actual = jest.requireActual("../config/gemini");
  return {
    ...actual,
    isGeminiConfigured: jest.fn(() => true),
  };
});

// Mock the Gemini Provider for other copilot routes
jest.mock("../services/ai/gemini.provider", () => {
  const actual = jest.requireActual("../services/ai/gemini.provider");
  return {
    ...actual,
    callGemini: jest.fn(async ({ taskType, correlationId }: any) => {
      if (taskType === "sales_copilot") {
        return {
          text: JSON.stringify({
            talkingPoints: ["Discuss enterprise deployment SLA", "Review verified appointment slot"],
            followUpDraft: "Thank you for confirming your requirements with VA Nexus.",
            objectionHandling: [{ objection: "Budget constraints", response: "We offer flexible tiered pricing." }],
            callScript: "Hello, this is Aditya from VA Nexus regarding your enterprise lead.",
            recommendedNextAction: { action: "Conduct closing presentation", rationale: "Stage ready", timing: "Immediate" },
            disclaimer: "AI-generated draft in VA Nexus.",
            requiresApproval: true,
            calculationMethod: "gemini_synthesized",
          }),
          model: "gemini-3.8-flash",
          correlationId: correlationId || "test_cid",
          taskType,
          latencyMs: 15,
          retries: 0,
        };
      }
      if (taskType === "audio_transcription") {
        return {
          text: JSON.stringify({
            transcription: "[Officer]: Hello, am I speaking with Acme Industrial Corp?\n[Customer]: Yes, confirmed.",
            speakerSegments: [{ speaker: "Officer", text: "Hello, am I speaking with Acme Industrial Corp?", timestamp: "00:02" }],
            summary: "Qualification call confirmed appointment date and time in Mumbai.",
            customerRequirements: ["Enterprise security SLA"],
            objections: [],
            commitments: ["Meeting confirmed for Nov 5"],
            nextSteps: ["Support allocation"],
            callOutcome: "meeting_confirmed",
            uncertainPassages: [],
            calculationMethod: "gemini_multimodal_audio",
            analysisTimestamp: new Date().toISOString(),
            disclaimer: "AI-generated transcription from call recording in VA Nexus.",
          }),
          model: "gemini-3.8-flash",
          correlationId: correlationId || "test_cid",
          taskType,
          latencyMs: 20,
          retries: 0,
        };
      }
      return actual.callGemini({ taskType, correlationId });
    }),
  };
});

let mongoServer: MongoMemoryServer;
const originalFetch = global.fetch;

jest.setTimeout(60000);

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  // Mock global fetch for remote audio test download
  global.fetch = jest.fn(async (url: any) => {
    if (typeof url === "string" && url.includes("cloudinary")) {
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => Buffer.from("fake-mp3-audio-bytes-for-test"),
      } as any;
    }
    if (typeof originalFetch === "function") {
      return originalFetch(url);
    }
    return { ok: true, status: 200, arrayBuffer: async () => Buffer.from("") } as any;
  }) as any;
});

afterAll(async () => {
  global.fetch = originalFetch;
  await mongoose.disconnect();
  if (mongoServer) {
    await mongoServer.stop();
  }
});

beforeEach(async () => {
  await User.deleteMany({});
  await Lead.deleteMany({});
});

describe("AI Subsystem & Copilot Routes", () => {
  async function createRoleUser(role: any, email: string) {
    const user = new User({
      name: `${role} User`,
      email,
      password: "Password@123",
      role,
      department: "Test Department",
      isActive: true,
    });
    await user.save();
    const token = generateToken({
      userId: user._id.toString(),
      email: user.email,
      role: user.role,
      name: user.name,
      department: user.department,
    });
    return { user, token };
  }

  async function createSampleLead(overrides: Record<string, any> = {}) {
    const lead = new Lead({
      leadCode: `VA-2026-${Math.floor(1000 + Math.random() * 9000)}`,
      name: "Acme Industrial Corp",
      contactNumber: "9876543210",
      city: "Mumbai",
      state: "Maharashtra",
      postalAddress: "Plot 42, MIDC Andheri East",
      date: "2026-11-05",
      time: "14:30",
      remark: "Interested in full enterprise license",
      currentDepartment: DEPARTMENTS.COMMUNICATION,
      status: LEAD_STATUS.IN_PROGRESS,
      createdBy: "Test Marketing User",
      workflowHistory: [
        {
          id: `wf_${Date.now()}`,
          department: DEPARTMENTS.MARKETING,
          action: "Lead Created",
          userName: "Test User",
          userRole: ROLES.MARKETING,
          timestamp: new Date().toISOString(),
          description: "Initial inbound lead created",
        },
      ],
      ...overrides,
    });
    await lead.save();
    return lead;
  }

  // Unit tests for internal reasoning stripping
  describe("stripInternalReasoning", () => {
    it("should remove <thought> tags completely", () => {
      const input = "<thought>Thinking about leads...\nCounting records</thought>Here is the final answer.";
      expect(stripInternalReasoning(input)).toBe("Here is the final answer.");
    });

    it("should remove <think> tags completely", () => {
      const input = "<think>Internal deliberation</think>Final result for user.";
      expect(stripInternalReasoning(input)).toBe("Final result for user.");
    });

    it("should preserve clean response without reasoning tags", () => {
      const input = "Lead VA-2026-1001 is in progress.";
      expect(stripInternalReasoning(input)).toBe("Lead VA-2026-1001 is in progress.");
    });
  });

  // Unit tests for unwrapJsonAnswer
  describe("unwrapJsonAnswer", () => {
    it("should unwrap raw JSON string containing answer property", () => {
      const raw = JSON.stringify({
        answer: "### Vigilance Audit\n\nAll verified.",
      });
      expect(unwrapJsonAnswer(raw)).toBe("### Vigilance Audit\n\nAll verified.");
    });

    it("should unwrap markdown fenced json blocks", () => {
      const fenced = "```json\n" + JSON.stringify({ answer: "Unwrapped markdown content" }) + "\n```";
      expect(unwrapJsonAnswer(fenced)).toBe("Unwrapped markdown content");
    });

    it("should recursively unwrap double-nested JSON strings", () => {
      const nested = JSON.stringify({
        answer: JSON.stringify({ answer: "Doubly unwrapped answer" }),
      });
      expect(unwrapJsonAnswer(nested)).toBe("Doubly unwrapped answer");
    });

    it("should preserve clean markdown and tables untouched", () => {
      const table = "| Lead ID | Audio Status |\n|---|---|\n| VA-1001 | missing |";
      expect(unwrapJsonAnswer(table)).toBe(table);
    });
  });

  // 1. Health endpoint security
  it("GET /api/ai/health should allow ADMIN and never expose API keys", async () => {
    const { token } = await createRoleUser(ROLES.ADMIN, "admin@vibhanu.com");

    const res = await request(app)
      .get("/api/ai/health")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.activeModel).toBeDefined();
    expect(res.body.data.isOpenRouterConfigured).toBeDefined();
    // Verify API keys are NOT leaked anywhere in response body
    const bodyStr = JSON.stringify(res.body);
    expect(bodyStr).not.toContain("OPENROUTER_API_KEY");
    expect(bodyStr).not.toContain("GEMINI_API_KEY");
    expect(res.body.data.apiKey).toBeUndefined();
  });

  it("GET /api/ai/health should FORBID non-admin users (403)", async () => {
    const { token } = await createRoleUser(ROLES.MARKETING, "mkt@vibhanu.com");

    const res = await request(app)
      .get("/api/ai/health")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it("Should return 401 Unauthorized for unauthenticated requests to AI routes", async () => {
    const res = await request(app).get("/api/ai/health");
    expect(res.status).toBe(401);
  });

  // 2. Command Center via OpenRouter
  it("POST /api/ai/command-center should return valid answer and tools used via OpenRouter", async () => {
    const { token } = await createRoleUser(ROLES.ADMIN, "admin2@vibhanu.com");
    await createSampleLead();

    const res = await request(app)
      .post("/api/ai/command-center")
      .set("Authorization", `Bearer ${token}`)
      .send({
        question: "How many leads are in each pipeline stage?",
        history: [{ role: "user", content: "Hello" }],
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.answer).toBeDefined();
    expect(Array.isArray(res.body.data.toolsUsed)).toBe(true);
    expect(res.body.data.disclaimer).toBeDefined();
    // Verify NO reasoning_details or private thoughts leaked to response
    const resStr = JSON.stringify(res.body);
    expect(resStr).not.toContain("<thought>");
    expect(resStr).not.toContain("reasoning_details");
    expect(res.body.data.reasoningDetails).toBeUndefined();
  });

  it("POST /api/ai/command-center should accurately distinguish vigilance audio states and format markdown table", async () => {
    const { token } = await createRoleUser(ROLES.ADMIN, "admin_vig@vibhanu.com");

    // Lead 1: In Vigilance, missing audio completely
    await createSampleLead({
      leadCode: "VA-2026-9001",
      name: "Stalled Missing Audio Corp",
      currentDepartment: DEPARTMENTS.VIGILANCE,
      status: LEAD_STATUS.MEETING_SCHEDULED,
      vigilanceDetails: {},
    });

    // Lead 2: In Vigilance, audio uploaded awaiting verification
    await createSampleLead({
      leadCode: "VA-2026-9002",
      name: "Uploaded Audio Awaiting Corp",
      currentDepartment: DEPARTMENTS.VIGILANCE,
      status: LEAD_STATUS.MEETING_SCHEDULED,
      vigilanceDetails: {
        audio: {
          id: "aud_9002",
          fileName: "call_9002.mp3",
          originalName: "call_9002.mp3",
          fileSize: 45000,
          duration: 90,
          url: "https://cloud.com/call_9002.mp3",
          storagePath: "/audio/9002",
          mimeType: "audio/mpeg",
          uploadedBy: "Officer Rajesh",
          uploadedAt: new Date().toISOString(),
        },
      },
    });

    // Lead 3: In Vigilance, audio verified
    await createSampleLead({
      leadCode: "VA-2026-9003",
      name: "Verified Audio Corp",
      currentDepartment: DEPARTMENTS.VIGILANCE,
      status: LEAD_STATUS.MEETING_SCHEDULED,
      vigilanceDetails: {
        audio: {
          id: "aud_9003",
          fileName: "call_9003.mp3",
          originalName: "call_9003.mp3",
          fileSize: 55000,
          duration: 120,
          url: "https://cloud.com/call_9003.mp3",
          storagePath: "/audio/9003",
          mimeType: "audio/mpeg",
          uploadedBy: "Officer Rajesh",
          uploadedAt: new Date().toISOString(),
        },
        completedAt: new Date().toISOString(),
        completedBy: "Auditor Sharma",
      },
    });

    const res = await request(app)
      .post("/api/ai/command-center")
      .set("Authorization", `Bearer ${token}`)
      .send({
        question: "Are there any leads stuck without audio in Vigilance?",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const toolsUsed = res.body.data.toolsUsed;
    expect(toolsUsed).toContain("get_vigilance_leads_without_audio");
    expect(toolsUsed).toContain("get_vigilance_audio_status_summary");

    // Check crmContext accuracy
    const crmContext = res.body.data.crmContext;
    const withoutAudio = crmContext.get_vigilance_leads_without_audio;
    expect(withoutAudio.totalVigilanceWithoutAudio).toBe(1);
    expect(withoutAudio.leads[0].leadId).toBe("VA-2026-9001");
    expect(withoutAudio.leads[0].audioStatus).toBe("missing");
    expect(withoutAudio.leads[0].evidence).toContain("vigilanceDetails.audio is null/absent");

    const summary = crmContext.get_vigilance_audio_status_summary;
    expect(summary.totalVigilanceLeads).toBe(3);
    expect(summary.missingAudioCount).toBe(1);
    expect(summary.awaitingVerificationCount).toBe(1);
    expect(summary.verifiedCount).toBe(1);

    // Verify response answer contains markdown table and no raw JSON wrapper
    expect(res.body.data.answer).toContain("| Lead ID | Company Name | Stage / Status | Days Stalled | Audio Status | Evidence |");
    expect(res.body.data.answer).not.toMatch(/^\{"answer":/);
  });

  it("POST /api/ai/command-center should enforce RBAC and not expose vigilance leads to MARKETING role", async () => {
    const { token } = await createRoleUser(ROLES.MARKETING, "mkt_vig@vibhanu.com");

    await createSampleLead({
      leadCode: "VA-2026-9999",
      name: "Secret Vigilance Lead",
      currentDepartment: DEPARTMENTS.VIGILANCE,
      status: LEAD_STATUS.MEETING_SCHEDULED,
      vigilanceDetails: {},
    });

    const res = await request(app)
      .post("/api/ai/command-center")
      .set("Authorization", `Bearer ${token}`)
      .send({
        question: "Are there any leads stuck without audio in Vigilance?",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const crmContext = res.body.data.crmContext;
    const withoutAudio = crmContext.get_vigilance_leads_without_audio;
    // Marketing user cannot access vigilance leads
    expect(withoutAudio.totalVigilanceWithoutAudio).toBe(0);
    expect(withoutAudio.leads).toEqual([]);
  });

  // 3. Lead Intelligence
  it("GET /api/ai/leads/:id/intelligence should return explainable score (0-100)", async () => {
    const { token } = await createRoleUser(ROLES.ADMIN, "admin3@vibhanu.com");
    const lead = await createSampleLead();

    const res = await request(app)
      .get(`/api/ai/leads/${lead._id}/intelligence`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const analysis = res.body.data.analysis;
    expect(typeof analysis.priorityScore).toBe("number");
    expect(analysis.priorityScore).toBeGreaterThanOrEqual(0);
    expect(analysis.priorityScore).toBeLessThanOrEqual(100);
    expect(Array.isArray(analysis.scoringFactors)).toBe(true);
    expect(Array.isArray(analysis.nextBestActions)).toBe(true);
    expect(analysis.disclaimer).toBeDefined();
  });

  // 4. Sales Copilot RBAC
  it("GET /api/ai/leads/:id/sales-copilot should allow SALES role", async () => {
    const { token } = await createRoleUser(ROLES.SALES, "sales@vibhanu.com");
    const lead = await createSampleLead({
      currentDepartment: DEPARTMENTS.SALES,
      status: LEAD_STATUS.ALLOCATED,
    });

    const res = await request(app)
      .get(`/api/ai/leads/${lead._id}/sales-copilot`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.copilot.talkingPoints)).toBe(true);
    expect(res.body.data.copilot.requiresApproval).toBe(true);
  });

  it("GET /api/ai/leads/:id/sales-copilot should FORBID MARKETING role (403)", async () => {
    const { token } = await createRoleUser(ROLES.MARKETING, "mkt2@vibhanu.com");
    const lead = await createSampleLead();

    const res = await request(app)
      .get(`/api/ai/leads/${lead._id}/sales-copilot`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  // 5. Vigilance Copilot RBAC
  it("GET /api/ai/leads/:id/vigilance-copilot should allow VIGILANCE role", async () => {
    const { token } = await createRoleUser(ROLES.VIGILANCE, "vig@vibhanu.com");
    const lead = await createSampleLead({
      currentDepartment: DEPARTMENTS.VIGILANCE,
      status: LEAD_STATUS.MEETING_SCHEDULED,
    });

    const res = await request(app)
      .get(`/api/ai/leads/${lead._id}/vigilance-copilot`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.copilot.overallFinding).toBeDefined();
    expect(res.body.data.copilot.mandatoryHumanVerificationRequired).toBe(true);
    expect(Array.isArray(res.body.data.copilot.checks)).toBe(true);
  });

  it("GET /api/ai/leads/:id/vigilance-copilot should FORBID SALES role (403)", async () => {
    const { token } = await createRoleUser(ROLES.SALES, "sales2@vibhanu.com");
    const lead = await createSampleLead();

    const res = await request(app)
      .get(`/api/ai/leads/${lead._id}/vigilance-copilot`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  // 6. Support Copilot RBAC
  it("GET /api/ai/leads/:id/support-copilot should allow SUPPORT role", async () => {
    const { token } = await createRoleUser(ROLES.SUPPORT, "supp@vibhanu.com");
    const lead = await createSampleLead({
      currentDepartment: DEPARTMENTS.SUPPORT,
      status: LEAD_STATUS.VERIFIED,
    });

    const res = await request(app)
      .get(`/api/ai/leads/${lead._id}/support-copilot`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.copilot.checklistStatus).toBeDefined();
    expect(typeof res.body.data.copilot.readyForAllocation).toBe("boolean");
  });

  it("GET /api/ai/leads/:id/support-copilot should FORBID MARKETING role (403)", async () => {
    const { token } = await createRoleUser(ROLES.MARKETING, "mkt3@vibhanu.com");
    const lead = await createSampleLead();

    const res = await request(app)
      .get(`/api/ai/leads/${lead._id}/support-copilot`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  // 7. Audio Transcription & Diarization
  it("POST /api/ai/leads/:id/transcribe should allow VIGILANCE role and return structured dialogue", async () => {
    const { token } = await createRoleUser(ROLES.VIGILANCE, "vig2@vibhanu.com");
    const lead = await createSampleLead({
      currentDepartment: DEPARTMENTS.VIGILANCE,
      vigilanceDetails: {
        audio: {
          id: "aud_test_1",
          fileName: "sample_call.mp3",
          originalName: "sample_call.mp3",
          fileSize: 10240,
          duration: 45,
          url: "https://res.cloudinary.com/dummy/video/upload/sample.mp3",
          storagePath: "dummy_path",
          mimeType: "audio/mpeg",
          uploadedBy: "Test Vigilance",
          uploadedAt: new Date().toISOString(),
        },
      },
    });

    const res = await request(app)
      .post(`/api/ai/leads/${lead._id}/transcribe`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const trans = res.body.data.transcription;
    expect(trans.transcription).toBeDefined();
    expect(Array.isArray(trans.speakerSegments)).toBe(true);
    expect(Array.isArray(trans.customerRequirements)).toBe(true);
    expect(trans.callOutcome).toBeDefined();

    // Verify cached GET retrieval
    const getRes = await request(app)
      .get(`/api/ai/leads/${lead._id}/transcription`)
      .set("Authorization", `Bearer ${token}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.data.transcription.transcription).toBe(trans.transcription);
  });

  it("POST /api/ai/leads/:id/transcribe should FORBID MARKETING role (403)", async () => {
    const { token } = await createRoleUser(ROLES.MARKETING, "mkt4@vibhanu.com");
    const lead = await createSampleLead();

    const res = await request(app)
      .post(`/api/ai/leads/${lead._id}/transcribe`)
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(403);
  });
});
