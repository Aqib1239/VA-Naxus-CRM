import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { app } from "../app";
import { User } from "../models/User.model";
import { Lead } from "../models/Lead.model";
import { Transcription } from "../models/Transcription.model";
import { ROLES } from "../constants/roles";
import { DEPARTMENTS, LEAD_STATUS } from "../constants/departments";
import { generateToken } from "../utils/jwt";
import { DeepgramService } from "../services/deepgram.service";
import { TranscriptionJobService } from "../services/transcription-job.service";

// Mock Deepgram Client
jest.mock("../config/deepgram", () => {
  return {
    isDeepgramConfigured: jest.fn(() => true),
    getDeepgramClient: jest.fn(() => ({
      listen: {
        v1: {
          media: {
            transcribeUrl: jest.fn(async () => ({
              metadata: {
                duration: 54.3,
                model_info: {
                  "nova-3": { language: "multi" },
                },
              },
              results: {
                channels: [
                  {
                    detected_language: "multi",
                    alternatives: [
                      {
                        transcript:
                          "Namaste sir, main VA Nexus se bol raha hoon regarding your enterprise enquiry. Yes, I am interested lekin implementation pricing thoda high lag raha hai.",
                        confidence: 0.96,
                        words: [
                          { word: "Namaste", start: 0.2, end: 0.8, confidence: 0.98, speaker: 0 },
                          { word: "sir", start: 0.9, end: 1.2, confidence: 0.95, speaker: 0 },
                          { word: "main", start: 1.3, end: 1.5, confidence: 0.96, speaker: 0 },
                          { word: "VA", start: 1.6, end: 1.9, confidence: 0.94, speaker: 0 },
                          { word: "Nexus", start: 2.0, end: 2.5, confidence: 0.97, speaker: 0 },
                          { word: "Yes", start: 3.5, end: 3.8, confidence: 0.99, speaker: 1 },
                          { word: "interested", start: 4.0, end: 4.6, confidence: 0.96, speaker: 1 },
                          { word: "lekin", start: 4.8, end: 5.2, confidence: 0.95, speaker: 1 },
                          { word: "pricing", start: 5.3, end: 5.8, confidence: 0.97, speaker: 1 },
                        ],
                        paragraphs: {
                          paragraphs: [
                            {
                              speaker: 0,
                              start: 0.2,
                              end: 2.5,
                              num_words: 5,
                              sentences: [
                                {
                                  text: "Namaste sir, main VA Nexus se bol raha hoon regarding your enterprise enquiry.",
                                  start: 0.2,
                                  end: 2.5,
                                },
                              ],
                            },
                            {
                              speaker: 1,
                              start: 3.5,
                              end: 5.8,
                              num_words: 4,
                              sentences: [
                                {
                                  text: "Yes, I am interested lekin implementation pricing thoda high lag raha hai.",
                                  start: 3.5,
                                  end: 5.8,
                                },
                              ],
                            },
                          ],
                        },
                      },
                    ],
                  },
                ],
                utterances: [
                  {
                    id: "utt_0",
                    speaker: 0,
                    start: 0.2,
                    end: 2.5,
                    confidence: 0.96,
                    transcript: "Namaste sir, main VA Nexus se bol raha hoon regarding your enterprise enquiry.",
                  },
                  {
                    id: "utt_1",
                    speaker: 1,
                    start: 3.5,
                    end: 5.8,
                    confidence: 0.95,
                    transcript: "Yes, I am interested lekin implementation pricing thoda high lag raha hai.",
                  },
                ],
              },
            })),
          },
        },
      },
    })),
  };
});

// Mock OpenRouter Provider for Transcript Analysis
jest.mock("../services/ai/openrouter.provider", () => {
  const actual = jest.requireActual("../services/ai/openrouter.provider");
  return {
    ...actual,
    callOpenRouter: jest.fn(async () => ({
      content: JSON.stringify({
        summary:
          "Executive verification call where the officer confirmed enterprise lead details. The customer expressed genuine interest in VA Nexus CRM but voiced concerns regarding implementation cost.",
        customerObjections: ["Implementation cost is perceived as high"],
        customerInterestAndIntent: "High purchase intent pending favorable commercial terms",
        agentCommunicationQuality: "Professional, courteous greeting in Hindi and clear English articulation",
        unansweredQuestions: ["Annual maintenance charges"],
        commitments: ["Officer promised to send revised proposal by end of day"],
        suggestedNextActions: ["Forward to Sales executive for commercial negotiation"],
        callOutcome: "follow_up_needed",
      }),
      model: "nvidia/nemotron-3.5-lightning:free",
      correlationId: "mock_openrouter_cid",
      taskType: "call_transcript_analysis",
      latencyMs: 150,
      retries: 0,
    })),
  };
});

let mongoServer: MongoMemoryServer;

jest.setTimeout(60000);

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongoServer) {
    await mongoServer.stop();
  }
});

beforeEach(async () => {
  await User.deleteMany({});
  await Lead.deleteMany({});
  await Transcription.deleteMany({});
});

describe("Deepgram Audio Transcription & Dialogue Intelligence Subsystem", () => {
  async function createTestUser(role: any, email = "test@example.com") {
    const user = new User({
      name: `Test ${role}`,
      email,
      password: "Password123!",
      role,
      department: role === ROLES.ADMIN ? DEPARTMENTS.MARKETING : role.toLowerCase(),
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
    const authUser = {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      department: user.department,
      isActive: true,
    };
    return { user, token, authUser };
  }

  async function createLeadWithAudio(user: any) {
    const lead = new Lead({
      leadCode: "VA-2026-DG01",
      name: "Acme Enterprises",
      contactNumber: "9876543210",
      city: "Mumbai",
      state: "Maharashtra",
      currentDepartment: DEPARTMENTS.VIGILANCE,
      status: LEAD_STATUS.IN_PROGRESS,
      createdBy: "Test User",
      createdById: user._id,
      vigilanceDetails: {
        audio: {
          id: "aud_test_dg_101",
          fileName: "Lead_Verification_Call.mp3",
          originalName: "Lead_Verification_Call.mp3",
          fileSize: 1048576,
          duration: 54,
          url: "https://res.cloudinary.com/test-cloud/video/upload/v1/vibhanu-crm/audio/test.mp3",
          storagePath: "vibhanu-crm/audio/test",
          mimeType: "audio/mpeg",
          uploadedBy: "Vikram Malhotra (Vigilance)",
          uploadedAt: new Date().toISOString(),
          waveformSample: [50, 60, 70, 80],
          resourceType: "video",
        },
      },
    });
    await lead.save();
    return lead;
  }

  // 1. Audio URL Security & SSRF Protection
  describe("1. Audio URL Security & SSRF Validation", () => {
    it("should accept valid HTTPS URLs", () => {
      expect(() => {
        DeepgramService.validateAudioUrl("https://res.cloudinary.com/test/audio.mp3");
      }).not.toThrow();
    });

    it("should reject malformed or non-URL strings", () => {
      expect(() => {
        DeepgramService.validateAudioUrl("not-a-valid-url");
      }).toThrow("Invalid audio URL");
    });
  });

  // 2. Transcription Job Creation & Duplicate Prevention
  describe("2. Asynchronous Job State & Deduplication", () => {
    it("should create a new job in PENDING state and process it atomically", async () => {
      const { user, authUser } = await createTestUser(ROLES.VIGILANCE);
      const lead = await createLeadWithAudio(user);

      const result = await TranscriptionJobService.createOrGetJob(lead, authUser);
      expect(result.isNew).toBe(true);
      expect(result.job.status).toBe("PENDING");

      // Atomically process the job
      const completedJob = await TranscriptionJobService.processJob(result.job._id.toString());
      expect(completedJob).not.toBeNull();
      expect(completedJob!.status).toBe("COMPLETED");
      expect(completedJob!.provider).toBe("DEEPGRAM");
      expect(completedJob!.model).toBe("nova-3");
      expect(completedJob!.language).toBe("multi");
      expect(completedJob!.fullTranscript).toContain("Namaste");
      expect(completedJob!.speakers.length).toBe(2);
      expect(completedJob!.utterances.length).toBe(2);
      expect(completedJob!.paragraphs.length).toBe(2);
    });

    it("should prevent duplicate processing if completed transcription exists", async () => {
      const { user, authUser } = await createTestUser(ROLES.VIGILANCE);
      const lead = await createLeadWithAudio(user);

      const first = await TranscriptionJobService.createOrGetJob(lead, authUser);
      await TranscriptionJobService.processJob(first.job._id.toString());

      // Second call should return existing without re-processing
      const second = await TranscriptionJobService.createOrGetJob(lead, authUser);
      expect(second.alreadyCompleted).toBe(true);
      expect(second.isNew).toBe(false);
      expect(second.job._id.toString()).toBe(first.job._id.toString());
    });
  });

  // 3. Speaker Diarization & Role Mapping
  describe("3. Speaker Diarization & Role Mapping", () => {
    it("should preserve original speaker IDs and allow manual role mapping", async () => {
      const { user, authUser } = await createTestUser(ROLES.VIGILANCE);
      const lead = await createLeadWithAudio(user);

      const { job } = await TranscriptionJobService.createOrGetJob(lead, authUser);
      await TranscriptionJobService.processJob(job._id.toString());

      // Update speaker mapping: Speaker 0 -> AGENT, Speaker 1 -> CUSTOMER
      const updated = await TranscriptionJobService.updateSpeakerMappings(
        lead._id.toString(),
        [
          { speakerId: 0, role: "AGENT" },
          { speakerId: 1, role: "CUSTOMER" },
        ],
        authUser
      );

      expect(updated.speakerMappings).toHaveLength(2);
      expect(updated.speakerMappings[0].speakerId).toBe(0);
      expect(updated.speakerMappings[0].role).toBe("AGENT");
      expect(updated.speakerMappings[1].speakerId).toBe(1);
      expect(updated.speakerMappings[1].role).toBe("CUSTOMER");

      // Verify that original Deepgram transcript and utterance speaker numbers remain intact
      expect(updated.utterances[0].speaker).toBe(0);
      expect(updated.utterances[1].speaker).toBe(1);
    });
  });

  // 4. OpenRouter Transcript Analysis (Separated from Transcription)
  describe("4. OpenRouter Post-Transcription Analysis", () => {
    it("should analyze the completed transcript with OpenRouter and store insights", async () => {
      const { user, authUser } = await createTestUser(ROLES.SALES);
      const lead = await createLeadWithAudio(user);

      const { job } = await TranscriptionJobService.createOrGetJob(lead, authUser);
      await TranscriptionJobService.processJob(job._id.toString());

      const analyzed = await TranscriptionJobService.analyzeTranscriptWithOpenRouter(
        lead._id.toString(),
        authUser
      );

      expect(analyzed.aiAnalysis).toBeDefined();
      expect(analyzed.aiAnalysis!.summary).toContain("Executive verification call");
      expect(analyzed.aiAnalysis!.customerObjections).toContain("Implementation cost is perceived as high");
      expect(analyzed.aiAnalysis!.customerInterestAndIntent).toContain("High purchase intent");
      expect(analyzed.aiAnalysis!.agentCommunicationQuality).toContain("Professional");
      expect(analyzed.aiAnalysis!.commitments.length).toBeGreaterThan(0);
    });
  });

  // 5. REST API RBAC & Endpoint Tests
  describe("5. REST API Routes & Permissions", () => {
    it("should return 401 for unauthenticated requests", async () => {
      const { user } = await createTestUser(ROLES.VIGILANCE);
      const lead = await createLeadWithAudio(user);

      const res = await request(app).post(`/api/transcription/leads/${lead._id}/start`);
      expect(res.status).toBe(401);
    });

    it("should reject MARKETING role from transcription endpoints (403)", async () => {
      const { user } = await createTestUser(ROLES.VIGILANCE, "vigilance@test.com");
      const { token: mktToken } = await createTestUser(ROLES.MARKETING, "mkt@test.com");
      const lead = await createLeadWithAudio(user);

      const res = await request(app)
        .post(`/api/transcription/leads/${lead._id}/start`)
        .set("Authorization", `Bearer ${mktToken}`);

      expect(res.status).toBe(403);
    });

    it("should allow VIGILANCE user to start transcription (202 or 200)", async () => {
      const { user, token } = await createTestUser(ROLES.VIGILANCE);
      const lead = await createLeadWithAudio(user);

      const res = await request(app)
        .post(`/api/transcription/leads/${lead._id}/start`)
        .set("Authorization", `Bearer ${token}`);

      expect([200, 202]).toContain(res.status);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBeDefined();
    });

    it("should fetch transcription status via GET /api/transcription/leads/:id/status", async () => {
      const { user, token } = await createTestUser(ROLES.VIGILANCE);
      const lead = await createLeadWithAudio(user);

      // Start job
      await request(app)
        .post(`/api/transcription/leads/${lead._id}/start`)
        .set("Authorization", `Bearer ${token}`);

      const res = await request(app)
        .get(`/api/transcription/leads/${lead._id}/status`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBeDefined();
    });

    it("should update speaker mappings via PUT /api/transcription/leads/:id/speakers", async () => {
      const { user, token, authUser } = await createTestUser(ROLES.ADMIN);
      const lead = await createLeadWithAudio(user);

      const { job } = await TranscriptionJobService.createOrGetJob(lead, authUser);
      await TranscriptionJobService.processJob(job._id.toString());

      const res = await request(app)
        .put(`/api/transcription/leads/${lead._id}/speakers`)
        .set("Authorization", `Bearer ${token}`)
        .send({
          mappings: [
            { speakerId: 0, role: "AGENT" },
            { speakerId: 1, role: "CUSTOMER" },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.data.speakers).toHaveLength(2);
      expect(res.body.data.speakers[0].role).toBe("AGENT");
    });
  });
});
