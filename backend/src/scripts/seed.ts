import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import { User } from "../models/User.model";
import { Lead } from "../models/Lead.model";
import { ROLES } from "../constants/roles";
import { DEPARTMENTS, LEAD_STATUS, WORKFLOW_ACTIONS } from "../constants/departments";
import { connectDatabase, disconnectDatabase } from "../config/database";
import { logger } from "../config/logger";
import { env } from "../config/env";

// Validate seed environment and explicit configuration before any DB operations
export function validateSeedEnvironment(): string {
  const rawEnv = process.env.NODE_ENV ? process.env.NODE_ENV.toLowerCase().trim() : "";

  if (!rawEnv) {
    throw new Error(
      "FATAL: NODE_ENV is missing or empty. Demo seeding is strictly restricted to 'development' or 'test'."
    );
  }

  if (rawEnv !== "development" && rawEnv !== "test") {
    throw new Error(
      `FATAL: Demo seed script is not permitted to run in environment '${rawEnv}'. It is strictly restricted to 'development' or 'test'.`
    );
  }

  const rawPassword = process.env.SEED_DEFAULT_PASSWORD;
  if (!rawPassword || !rawPassword.trim()) {
    throw new Error(
      "FATAL: SEED_DEFAULT_PASSWORD environment variable is required to run seed script."
    );
  }

  const trimmedPassword = rawPassword.trim();
  if (trimmedPassword.length < 12) {
    throw new Error(
      "FATAL: SEED_DEFAULT_PASSWORD must be at least 12 characters long to satisfy password policy."
    );
  }

  return trimmedPassword;
}

export interface IDemoUserSeed {
  name: string;
  email: string;
  role: (typeof ROLES)[keyof typeof ROLES];
  department: string;
  avatar: string;
}

export const PRIMARY_DEMO_USERS: IDemoUserSeed[] = [
  {
    name: "Ananya Sharma",
    email: "admin@vibhanu.com",
    role: ROLES.ADMIN,
    department: "Executive Management",
    avatar: "AS",
  },
  {
    name: "Rohan Varma",
    email: "marketing@vibhanu.com",
    role: ROLES.MARKETING,
    department: "Growth & Acquisition",
    avatar: "RV",
  },
  {
    name: "Pooja Hegde",
    email: "communication@vibhanu.com",
    role: ROLES.COMMUNICATION,
    department: "Customer Outreach",
    avatar: "PH",
  },
  {
    name: "Vikram Malhotra",
    email: "vigilance@vibhanu.com",
    role: ROLES.VIGILANCE,
    department: "Compliance & Vigilance",
    avatar: "VM",
  },
  {
    name: "Neha Sundaram",
    email: "support@vibhanu.com",
    role: ROLES.SUPPORT,
    department: "Operations & Support",
    avatar: "NS",
  },
  {
    name: "Aditya Deshmukh",
    email: "sales@vibhanu.com",
    role: ROLES.SALES,
    department: "Enterprise Sales",
    avatar: "AD",
  },
];

// Alias accounts for name-based email logins
export const ALIAS_DEMO_USERS: IDemoUserSeed[] = [
  {
    name: "Ananya Sharma",
    email: "ananya.sharma@vibhanu.com",
    role: ROLES.ADMIN,
    department: "Executive Management",
    avatar: "AS",
  },
  {
    name: "Rohan Varma",
    email: "rohan.varma@vibhanu.com",
    role: ROLES.MARKETING,
    department: "Growth & Acquisition",
    avatar: "RV",
  },
  {
    name: "Pooja Hegde",
    email: "pooja.hegde@vibhanu.com",
    role: ROLES.COMMUNICATION,
    department: "Customer Outreach",
    avatar: "PH",
  },
  {
    name: "Vikram Malhotra",
    email: "vikram.malhotra@vibhanu.com",
    role: ROLES.VIGILANCE,
    department: "Compliance & Vigilance",
    avatar: "VM",
  },
  {
    name: "Neha Sundaram",
    email: "neha.sundaram@vibhanu.com",
    role: ROLES.SUPPORT,
    department: "Operations & Support",
    avatar: "NS",
  },
  {
    name: "Aditya Deshmukh",
    email: "aditya.deshmukh@vibhanu.com",
    role: ROLES.SALES,
    department: "Enterprise Sales",
    avatar: "AD",
  },
];

// Helper to ensure demo audio file exists in uploads folder
export function ensureDemoAudioFile(): string {
  const uploadDir = path.resolve(process.cwd(), env.UPLOAD_DIR);
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const demoFilename = "audio_demo_sample_call.wav";
  const targetPath = path.resolve(uploadDir, demoFilename);

  // Also check if public sample exists in frontend public
  const rootAudio = path.resolve(process.cwd(), "..", "public", "audio", "sample-call.wav");
  if (fs.existsSync(rootAudio)) {
    fs.copyFileSync(rootAudio, targetPath);
  } else if (!fs.existsSync(targetPath)) {
    // Generate valid 10-second sample WAV file
    const sampleRate = 22050;
    const duration = 10;
    const numSamples = sampleRate * duration;
    const buffer = Buffer.alloc(44 + numSamples * 2);

    buffer.write("RIFF", 0);
    buffer.writeUInt32LE(36 + numSamples * 2, 4);
    buffer.write("WAVE", 8);
    buffer.write("fmt ", 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20); // PCM
    buffer.writeUInt16LE(1, 22); // mono
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * 2, 28);
    buffer.writeUInt16LE(2, 32);
    buffer.writeUInt16LE(16, 34);
    buffer.write("data", 36);
    buffer.writeUInt32LE(numSamples * 2, 40);

    let offset = 44;
    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      const s = 0.2 * Math.sin(2 * Math.PI * 440 * t);
      buffer.writeInt16LE(Math.floor(s * 32767), offset);
      offset += 2;
    }
    fs.writeFileSync(targetPath, buffer);
  }

  return demoFilename;
}

export function buildDemoLeads(demoAudioFile: string, salesUserId?: string) {
  const now = Date.now();
  const formatIso = (offsetMs: number) => new Date(now + offsetMs).toISOString();
  const formatDateOnly = (offsetDays: number) => {
    const d = new Date(now + offsetDays * 86400000);
    return d.toISOString().split("T")[0];
  };

  const today = formatDateOnly(0);
  const tomorrow = formatDateOnly(1);
  const inTwoDays = formatDateOnly(2);
  const yesterday = formatDateOnly(-1);
  const twoDaysAgo = formatDateOnly(-2);
  const threeDaysAgo = formatDateOnly(-3);
  const fourDaysAgo = formatDateOnly(-4);

  return [
    // ==============================================================
    // 1. MARKETING LEADS (3 Leads)
    // ==============================================================
    {
      leadCode: "VA-2026-1001",
      name: "Nexus Enterprises",
      contactNumber: "+91 98201 44521",
      city: "Mumbai",
      state: "Maharashtra",
      pincode: "400051",
      postalAddress: "C-22, G Block, Bandra Kurla Complex",
      currentDepartment: DEPARTMENTS.MARKETING,
      status: LEAD_STATUS.NEW,
      createdBy: "Rohan Varma (MARKETING)",
      remark: "Inbound enterprise inquiry via Cloud ERP landing page. Requesting 50+ user licenses.",
      workflowHistory: [
        {
          id: `wf_${now}_1001`,
          department: DEPARTMENTS.MARKETING,
          action: WORKFLOW_ACTIONS.LEAD_CREATED,
          userName: "Rohan Varma",
          userRole: ROLES.MARKETING,
          timestamp: formatIso(-3600000 * 6),
          description: "Inbound campaign submission captured from official portal.",
        },
      ],
    },
    {
      leadCode: "VA-2026-1002",
      name: "Apex Infotech",
      contactNumber: "+91 98112 30495",
      city: "New Delhi",
      state: "Delhi",
      pincode: "110001",
      postalAddress: "14, Barakhamba Road, Connaught Place",
      currentDepartment: DEPARTMENTS.MARKETING,
      status: LEAD_STATUS.NEW,
      createdBy: "Rohan Varma (MARKETING)",
      remark: "Captured at North India Tech Expo 2026. Needs multi-branch CRM integration.",
      workflowHistory: [
        {
          id: `wf_${now}_1002`,
          department: DEPARTMENTS.MARKETING,
          action: WORKFLOW_ACTIONS.LEAD_CREATED,
          userName: "Rohan Varma",
          userRole: ROLES.MARKETING,
          timestamp: formatIso(-3600000 * 12),
          description: "Registered lead from delegate badge scan.",
        },
      ],
    },
    {
      leadCode: "VA-2026-1003",
      name: "BluePeak Solutions",
      contactNumber: "+91 99104 88723",
      city: "Noida",
      state: "Uttar Pradesh",
      pincode: "201301",
      postalAddress: "Tower B, Logix Cyber Park, Sector 62",
      currentDepartment: DEPARTMENTS.MARKETING,
      status: LEAD_STATUS.IN_PROGRESS,
      createdBy: "Rohan Varma (MARKETING)",
      remark: "Direct web form inquiry. Assessing migration timeline from legacy CRM.",
      workflowHistory: [
        {
          id: `wf_${now}_1003`,
          department: DEPARTMENTS.MARKETING,
          action: WORKFLOW_ACTIONS.LEAD_CREATED,
          userName: "Rohan Varma",
          userRole: ROLES.MARKETING,
          timestamp: formatIso(-3600000 * 18),
          description: "Direct web inquiry logged by marketing automation webhook.",
        },
      ],
    },

    // ==============================================================
    // 2. COMMUNICATION LEADS (3 Leads)
    // ==============================================================
    {
      leadCode: "VA-2026-1004",
      name: "Vertex Retail",
      contactNumber: "+91 98105 77612",
      city: "Gurugram",
      state: "Haryana",
      pincode: "122002",
      postalAddress: "8th Floor, DLF Cyber City, Phase 2",
      currentDepartment: DEPARTMENTS.COMMUNICATION,
      status: LEAD_STATUS.IN_PROGRESS,
      createdBy: "Rohan Varma (MARKETING)",
      remark: "Initial call connected. Procurement manager requested demo schedule for this week.",
      workflowHistory: [
        {
          id: `wf_${now}_1004a`,
          department: DEPARTMENTS.MARKETING,
          action: WORKFLOW_ACTIONS.LEAD_CREATED,
          userName: "Rohan Varma",
          userRole: ROLES.MARKETING,
          timestamp: formatIso(-3600000 * 24),
          description: "Lead created from marketing campaign.",
        },
        {
          id: `wf_${now}_1004b`,
          department: DEPARTMENTS.COMMUNICATION,
          action: WORKFLOW_ACTIONS.STATUS_UPDATED,
          userName: "Pooja Hegde",
          userRole: ROLES.COMMUNICATION,
          timestamp: formatIso(-3600000 * 16),
          description: "Outreach call placed. Client requested meeting schedule confirmation.",
        },
      ],
    },
    {
      leadCode: "VA-2026-1005",
      name: "UrbanEdge Trading",
      contactNumber: "+91 94150 63219",
      city: "Lucknow",
      state: "Uttar Pradesh",
      pincode: "226010",
      postalAddress: "Plot 45, Gomti Nagar Business Park",
      date: tomorrow,
      time: "02:30 PM",
      currentDepartment: DEPARTMENTS.COMMUNICATION,
      status: LEAD_STATUS.MEETING_SCHEDULED,
      createdBy: "Rohan Varma (MARKETING)",
      remark: "Introductory demo meeting scheduled. Discussion on automated invoice reconciliation.",
      communicationDetails: {
        scheduledDate: tomorrow,
        scheduledTime: "02:30 PM",
        meetingNotes: "CFO confirmed attendance. Send calendar invite with Zoom link.",
        completedAt: formatIso(-3600000 * 8),
        completedBy: "Pooja Hegde (COMMUNICATION)",
      },
      workflowHistory: [
        {
          id: `wf_${now}_1005a`,
          department: DEPARTMENTS.MARKETING,
          action: WORKFLOW_ACTIONS.LEAD_CREATED,
          userName: "Rohan Varma",
          userRole: ROLES.MARKETING,
          timestamp: formatIso(-3600000 * 28),
          description: "Lead created.",
        },
        {
          id: `wf_${now}_1005b`,
          department: DEPARTMENTS.COMMUNICATION,
          action: WORKFLOW_ACTIONS.MEETING_SCHEDULED,
          userName: "Pooja Hegde",
          userRole: ROLES.COMMUNICATION,
          timestamp: formatIso(-3600000 * 8),
          description: `Meeting confirmed for ${tomorrow} at 02:30 PM.`,
        },
      ],
    },
    {
      leadCode: "VA-2026-1006",
      name: "PrimeTech Systems",
      contactNumber: "+91 98230 45129",
      city: "Pune",
      state: "Maharashtra",
      pincode: "411028",
      postalAddress: "Level 5, Cybercity Tower 2, Magarpatta",
      date: inTwoDays,
      time: "11:00 AM",
      currentDepartment: DEPARTMENTS.COMMUNICATION,
      status: LEAD_STATUS.MEETING_SCHEDULED,
      createdBy: "Rohan Varma (MARKETING)",
      remark: "Virtual meeting fixed with IT Director regarding data migration and security architecture.",
      communicationDetails: {
        scheduledDate: inTwoDays,
        scheduledTime: "11:00 AM",
        meetingNotes: "IT infrastructure review scheduled with engineering team.",
        completedAt: formatIso(-3600000 * 4),
        completedBy: "Pooja Hegde (COMMUNICATION)",
      },
      workflowHistory: [
        {
          id: `wf_${now}_1006a`,
          department: DEPARTMENTS.MARKETING,
          action: WORKFLOW_ACTIONS.LEAD_CREATED,
          userName: "Rohan Varma",
          userRole: ROLES.MARKETING,
          timestamp: formatIso(-3600000 * 30),
          description: "Inbound campaign submission.",
        },
        {
          id: `wf_${now}_1006b`,
          department: DEPARTMENTS.COMMUNICATION,
          action: WORKFLOW_ACTIONS.MEETING_SCHEDULED,
          userName: "Pooja Hegde",
          userRole: ROLES.COMMUNICATION,
          timestamp: formatIso(-3600000 * 4),
          description: `Meeting scheduled for ${inTwoDays} at 11:00 AM.`,
        },
      ],
    },

    // ==============================================================
    // 3. VIGILANCE LEADS (3 Leads)
    // ==============================================================
    {
      leadCode: "VA-2026-1007",
      name: "GreenLeaf Industries",
      contactNumber: "+91 94140 23891",
      city: "Jaipur",
      state: "Rajasthan",
      pincode: "302022",
      postalAddress: "F-120, Sitapura Industrial Area",
      date: yesterday,
      time: "03:00 PM",
      currentDepartment: DEPARTMENTS.VIGILANCE,
      status: LEAD_STATUS.MEETING_SCHEDULED,
      createdBy: "Rohan Varma (MARKETING)",
      remark: "Meeting completed by Communication. Pending phone audit & audio call recording upload.",
      communicationDetails: {
        scheduledDate: yesterday,
        scheduledTime: "03:00 PM",
        meetingNotes: "Introductory meeting completed. Lead forwarded to Vigilance for telephonic audit.",
        completedAt: formatIso(-3600000 * 20),
        completedBy: "Pooja Hegde (COMMUNICATION)",
      },
      // Missing audio on purpose - gives Vigilance dashboard real pending audio alert!
      workflowHistory: [
        {
          id: `wf_${now}_1007a`,
          department: DEPARTMENTS.MARKETING,
          action: WORKFLOW_ACTIONS.LEAD_CREATED,
          userName: "Rohan Varma",
          userRole: ROLES.MARKETING,
          timestamp: formatIso(-3600000 * 36),
          description: "Lead created.",
        },
        {
          id: `wf_${now}_1007b`,
          department: DEPARTMENTS.COMMUNICATION,
          action: WORKFLOW_ACTIONS.MEETING_SCHEDULED,
          userName: "Pooja Hegde",
          userRole: ROLES.COMMUNICATION,
          timestamp: formatIso(-3600000 * 20),
          description: "Meeting held. Transferred to Vigilance for identity & audio verification.",
        },
      ],
    },
    // ==============================================================
    // 3. VIGILANCE LEADS (5 Fresh Leads ready for Cloudinary upload)
    // ==============================================================
    {
      leadCode: "VA-2026-1021",
      name: "Tata Precision Engineering Ltd",
      contactNumber: "+91 98201 44520",
      city: "Navi Mumbai",
      state: "Maharashtra",
      pincode: "400705",
      postalAddress: "Plot C-45, TTC Industrial Area, MIDC Pawane",
      date: yesterday,
      time: "11:00 AM",
      currentDepartment: DEPARTMENTS.VIGILANCE,
      status: LEAD_STATUS.MEETING_SCHEDULED,
      createdBy: "Rohan Varma (MARKETING)",
      remark: "Enterprise industrial tools procurement inquiry. Transferred to Vigilance for physical address & authorized signatory call verification.",
      communicationDetails: {
        scheduledDate: yesterday,
        scheduledTime: "11:00 AM",
        meetingNotes: "Met with Operations VP. Transferred to Vigilance for KYC & identity verification call recording.",
        completedAt: formatIso(-3600000 * 20),
        completedBy: "Pooja Hegde (COMMUNICATION)",
      },
      workflowHistory: [
        {
          id: `wf_${now}_1021a`,
          department: DEPARTMENTS.MARKETING,
          action: WORKFLOW_ACTIONS.LEAD_CREATED,
          userName: "Rohan Varma",
          userRole: ROLES.MARKETING,
          timestamp: formatIso(-3600000 * 36),
          description: "Lead captured via industrial expo portal.",
        },
        {
          id: `wf_${now}_1021b`,
          department: DEPARTMENTS.COMMUNICATION,
          action: WORKFLOW_ACTIONS.MEETING_SCHEDULED,
          userName: "Pooja Hegde",
          userRole: ROLES.COMMUNICATION,
          timestamp: formatIso(-3600000 * 20),
          description: "Meeting held. Transferred to Vigilance for identity & call audit.",
        },
      ],
    },
    {
      leadCode: "VA-2026-1022",
      name: "Aurobindo Logistics & ColdChain",
      contactNumber: "+91 98490 12890",
      city: "Hyderabad",
      state: "Telangana",
      pincode: "500084",
      postalAddress: "Survey 64, Phase IV, IDA Jeedimetla",
      date: yesterday,
      time: "02:30 PM",
      currentDepartment: DEPARTMENTS.VIGILANCE,
      status: LEAD_STATUS.MEETING_SCHEDULED,
      createdBy: "Rohan Varma (MARKETING)",
      remark: "Pharmaceutical temperature-controlled fleet contract. Awaiting vigilance call recording.",
      communicationDetails: {
        scheduledDate: yesterday,
        scheduledTime: "02:30 PM",
        meetingNotes: "Introductory briefing complete. Handed over to Vigilance for compliance audit.",
        completedAt: formatIso(-3600000 * 18),
        completedBy: "Pooja Hegde (COMMUNICATION)",
      },
      workflowHistory: [
        {
          id: `wf_${now}_1022a`,
          department: DEPARTMENTS.MARKETING,
          action: WORKFLOW_ACTIONS.LEAD_CREATED,
          userName: "Rohan Varma",
          userRole: ROLES.MARKETING,
          timestamp: formatIso(-3600000 * 30),
          description: "Pharma supply chain conference lead.",
        },
        {
          id: `wf_${now}_1022b`,
          department: DEPARTMENTS.COMMUNICATION,
          action: WORKFLOW_ACTIONS.MEETING_SCHEDULED,
          userName: "Pooja Hegde",
          userRole: ROLES.COMMUNICATION,
          timestamp: formatIso(-3600000 * 18),
          description: "Client confirmed interest. Shifted to Vigilance.",
        },
      ],
    },
    {
      leadCode: "VA-2026-1023",
      name: "Infosys BPO Infrastructure Ltd",
      contactNumber: "+91 99001 77412",
      city: "Bengaluru",
      state: "Karnataka",
      pincode: "560100",
      postalAddress: "Plot 44, Electronics City, Hosur Road",
      date: today,
      time: "10:00 AM",
      currentDepartment: DEPARTMENTS.VIGILANCE,
      status: LEAD_STATUS.IN_PROGRESS,
      createdBy: "Rohan Varma (MARKETING)",
      remark: "BPO enterprise workflow suite upgrade. Vigilance telephonic audit in progress.",
      communicationDetails: {
        scheduledDate: today,
        scheduledTime: "10:00 AM",
        meetingNotes: "Discovery meeting finished. Handed over to Vigilance.",
        completedAt: formatIso(-3600000 * 12),
        completedBy: "Pooja Hegde (COMMUNICATION)",
      },
      workflowHistory: [
        {
          id: `wf_${now}_1023a`,
          department: DEPARTMENTS.MARKETING,
          action: WORKFLOW_ACTIONS.LEAD_CREATED,
          userName: "Rohan Varma",
          userRole: ROLES.MARKETING,
          timestamp: formatIso(-3600000 * 24),
          description: "Enterprise web portal inquiry.",
        },
        {
          id: `wf_${now}_1023b`,
          department: DEPARTMENTS.COMMUNICATION,
          action: WORKFLOW_ACTIONS.MEETING_SCHEDULED,
          userName: "Pooja Hegde",
          userRole: ROLES.COMMUNICATION,
          timestamp: formatIso(-3600000 * 12),
          description: "Meeting held. Transferred to Vigilance.",
        },
      ],
    },
    {
      leadCode: "VA-2026-1024",
      name: "Godrej Agrovet Consumer Solutions",
      contactNumber: "+91 98203 55891",
      city: "Mumbai",
      state: "Maharashtra",
      pincode: "400079",
      postalAddress: "Eastern Express Highway, Vikhroli East",
      date: today,
      time: "03:00 PM",
      currentDepartment: DEPARTMENTS.VIGILANCE,
      status: LEAD_STATUS.MEETING_SCHEDULED,
      createdBy: "Rohan Varma (MARKETING)",
      remark: "Agri-business customer management contract. Ready for vigilance call recording.",
      communicationDetails: {
        scheduledDate: today,
        scheduledTime: "03:00 PM",
        meetingNotes: "Demo concluded. Forwarded to Vigilance team.",
        completedAt: formatIso(-3600000 * 8),
        completedBy: "Pooja Hegde (COMMUNICATION)",
      },
      workflowHistory: [
        {
          id: `wf_${now}_1024a`,
          department: DEPARTMENTS.MARKETING,
          action: WORKFLOW_ACTIONS.LEAD_CREATED,
          userName: "Rohan Varma",
          userRole: ROLES.MARKETING,
          timestamp: formatIso(-3600000 * 20),
          description: "Inbound campaign submission.",
        },
        {
          id: `wf_${now}_1024b`,
          department: DEPARTMENTS.COMMUNICATION,
          action: WORKFLOW_ACTIONS.MEETING_SCHEDULED,
          userName: "Pooja Hegde",
          userRole: ROLES.COMMUNICATION,
          timestamp: formatIso(-3600000 * 8),
          description: "Meeting scheduled. Forwarded to Vigilance.",
        },
      ],
    },
    {
      leadCode: "VA-2026-1025",
      name: "Sun Pharma Healthcare Devices",
      contactNumber: "+91 97129 44310",
      city: "Vadodara",
      state: "Gujarat",
      pincode: "390020",
      postalAddress: "Sun Pharma Road, Tandalja",
      date: today,
      time: "04:30 PM",
      currentDepartment: DEPARTMENTS.VIGILANCE,
      status: LEAD_STATUS.MEETING_SCHEDULED,
      createdBy: "Rohan Varma (MARKETING)",
      remark: "Medical instruments distribution deal. Telephonic verification call required.",
      communicationDetails: {
        scheduledDate: today,
        scheduledTime: "04:30 PM",
        meetingNotes: "Technical briefing completed. Transferred to Vigilance.",
        completedAt: formatIso(-3600000 * 4),
        completedBy: "Pooja Hegde (COMMUNICATION)",
      },
      workflowHistory: [
        {
          id: `wf_${now}_1025a`,
          department: DEPARTMENTS.MARKETING,
          action: WORKFLOW_ACTIONS.LEAD_CREATED,
          userName: "Rohan Varma",
          userRole: ROLES.MARKETING,
          timestamp: formatIso(-3600000 * 16),
          description: "Healthcare symposium registration.",
        },
        {
          id: `wf_${now}_1025b`,
          department: DEPARTMENTS.COMMUNICATION,
          action: WORKFLOW_ACTIONS.MEETING_SCHEDULED,
          userName: "Pooja Hegde",
          userRole: ROLES.COMMUNICATION,
          timestamp: formatIso(-3600000 * 4),
          description: "Meeting wrapped up. Handed over to Vigilance.",
        },
      ],
    },

    // ==============================================================
    // 5. SALES LEADS (2 Leads)
    // ==============================================================
    {
      leadCode: "VA-2026-1012",
      name: "Spectra Analytics",
      contactNumber: "+91 97909 31450",
      city: "Chennai",
      state: "Tamil Nadu",
      pincode: "600113",
      postalAddress: "Level 6, Ascendas IT Park, Taramani",
      date: threeDaysAgo,
      time: "02:00 PM",
      currentDepartment: DEPARTMENTS.SALES,
      status: LEAD_STATUS.ALLOCATED,
      createdBy: "Rohan Varma (MARKETING)",
      remark: "Lead allocated to Sales. Audio recording pending review. Claim button locked until 100% audio listened.",
      vigilanceDetails: {
        audio: {
          id: "aud_1012",
          fileName: "Vigilance_Call_SpectraAnalytics_Chennai.wav",
          originalName: "Vigilance_Call_SpectraAnalytics_Chennai.wav",
          fileSize: 1058444,
          duration: 180,
          url: "/api/leads/VA-2026-1012/audio",
          storagePath: demoAudioFile,
          mimeType: "audio/wav",
          uploadedAt: formatIso(-3600000 * 30),
          uploadedBy: "Vikram Malhotra (VIGILANCE)",
          waveformSample: [28, 48, 68, 88, 78, 62, 48, 68, 82, 72, 48, 32],
        },
        verificationNotes: "Identity and company presence verified.",
        completedAt: formatIso(-3600000 * 30),
        completedBy: "Vikram Malhotra (VIGILANCE)",
      },
      supportDetails: {
        verification: {
          isDateVerified: true,
          isTimeVerified: true,
          isAddressVerified: true,
          verifiedBy: "Neha Sundaram (SUPPORT)",
          verifiedAt: formatIso(-3600000 * 18),
          notes: "Address confirmed at Ascendas IT Park.",
        },
        allocatedTo: "Aditya Deshmukh (Sales Executive)",
        allocationNotes: "High probability conversion. 35 seat enterprise tier.",
        completedAt: formatIso(-3600000 * 18),
        completedBy: "Neha Sundaram (SUPPORT)",
      },
      salesDetails: {
        audioListenCompleted: false, // AUDIO LOCKED: Must listen to full audio before claim button unlocks!
      },
      workflowHistory: [
        {
          id: `wf_${now}_1012a`,
          department: DEPARTMENTS.MARKETING,
          action: WORKFLOW_ACTIONS.LEAD_CREATED,
          userName: "Rohan Varma",
          userRole: ROLES.MARKETING,
          timestamp: formatIso(-3600000 * 56),
          description: "Inbound campaign submission.",
        },
        {
          id: `wf_${now}_1012b`,
          department: DEPARTMENTS.COMMUNICATION,
          action: WORKFLOW_ACTIONS.MEETING_SCHEDULED,
          userName: "Pooja Hegde",
          userRole: ROLES.COMMUNICATION,
          timestamp: formatIso(-3600000 * 40),
          description: "Meeting completed.",
        },
        {
          id: `wf_${now}_1012c`,
          department: DEPARTMENTS.VIGILANCE,
          action: WORKFLOW_ACTIONS.VERIFIED_AND_AUDIO_UPLOADED,
          userName: "Vikram Malhotra",
          userRole: ROLES.VIGILANCE,
          timestamp: formatIso(-3600000 * 30),
          description: "Call recording attached and verified.",
        },
        {
          id: `wf_${now}_1012d`,
          department: DEPARTMENTS.SUPPORT,
          action: WORKFLOW_ACTIONS.ALLOCATED_TO_SALES,
          userName: "Neha Sundaram",
          userRole: ROLES.SUPPORT,
          timestamp: formatIso(-3600000 * 18),
          description: "3-point verification confirmed. Allocated to Sales Executive: Aditya Deshmukh.",
        },
      ],
    },
    {
      leadCode: "VA-2026-1013",
      name: "Kuber FinTech Systems",
      contactNumber: "+91 98260 54318",
      city: "Indore",
      state: "Madhya Pradesh",
      pincode: "452010",
      postalAddress: "Scheme 54, Vijay Nagar Commercial Complex",
      date: threeDaysAgo,
      time: "04:00 PM",
      currentDepartment: DEPARTMENTS.SALES,
      status: LEAD_STATUS.ALLOCATED,
      createdBy: "Rohan Varma (MARKETING)",
      remark: "Audio playback completed by Sales Executive. Ready to claim with final deal value.",
      vigilanceDetails: {
        audio: {
          id: "aud_1013",
          fileName: "Vigilance_Call_KuberFinTech_Indore.wav",
          originalName: "Vigilance_Call_KuberFinTech_Indore.wav",
          fileSize: 1058444,
          duration: 180,
          url: "/api/leads/VA-2026-1013/audio",
          storagePath: demoAudioFile,
          mimeType: "audio/wav",
          uploadedAt: formatIso(-3600000 * 32),
          uploadedBy: "Vikram Malhotra (VIGILANCE)",
          waveformSample: [32, 52, 72, 88, 82, 64, 50, 70, 84, 76, 52, 36],
        },
        verificationNotes: "Identity and business license verified.",
        completedAt: formatIso(-3600000 * 32),
        completedBy: "Vikram Malhotra (VIGILANCE)",
      },
      supportDetails: {
        verification: {
          isDateVerified: true,
          isTimeVerified: true,
          isAddressVerified: true,
          verifiedBy: "Neha Sundaram (SUPPORT)",
          verifiedAt: formatIso(-3600000 * 20),
        },
        allocatedTo: "Aditya Deshmukh (Sales Executive)",
        completedAt: formatIso(-3600000 * 20),
        completedBy: "Neha Sundaram (SUPPORT)",
      },
      salesDetails: {
        audioListenCompleted: true, // READY TO CLAIM! Interviewer can immediately enter deal value and click Claim!
      },
      workflowHistory: [
        {
          id: `wf_${now}_1013a`,
          department: DEPARTMENTS.MARKETING,
          action: WORKFLOW_ACTIONS.LEAD_CREATED,
          userName: "Rohan Varma",
          userRole: ROLES.MARKETING,
          timestamp: formatIso(-3600000 * 58),
          description: "Inbound campaign submission.",
        },
        {
          id: `wf_${now}_1013b`,
          department: DEPARTMENTS.COMMUNICATION,
          action: WORKFLOW_ACTIONS.MEETING_SCHEDULED,
          userName: "Pooja Hegde",
          userRole: ROLES.COMMUNICATION,
          timestamp: formatIso(-3600000 * 42),
          description: "Meeting completed.",
        },
        {
          id: `wf_${now}_1013c`,
          department: DEPARTMENTS.VIGILANCE,
          action: WORKFLOW_ACTIONS.VERIFIED_AND_AUDIO_UPLOADED,
          userName: "Vikram Malhotra",
          userRole: ROLES.VIGILANCE,
          timestamp: formatIso(-3600000 * 32),
          description: "Audio verified.",
        },
        {
          id: `wf_${now}_1013d`,
          department: DEPARTMENTS.SUPPORT,
          action: WORKFLOW_ACTIONS.ALLOCATED_TO_SALES,
          userName: "Neha Sundaram",
          userRole: ROLES.SUPPORT,
          timestamp: formatIso(-3600000 * 20),
          description: "Allocated to Sales Executive: Aditya Deshmukh.",
        },
      ],
    },

    // ==============================================================
    // 6. CLAIMED LEADS (1 Lead)
    // ==============================================================
    {
      leadCode: "VA-2026-1014",
      name: "OceanWave Maritime",
      contactNumber: "+91 94471 88234",
      city: "Kochi",
      state: "Kerala",
      pincode: "682003",
      postalAddress: "Harbour View Tower, Willingdon Island",
      date: fourDaysAgo,
      time: "11:30 AM",
      currentDepartment: DEPARTMENTS.CLAIMED,
      status: LEAD_STATUS.CLAIMED,
      createdBy: "Rohan Varma (MARKETING)",
      remark: "Successfully closed enterprise deal for maritime cargo tracking workflow.",
      vigilanceDetails: {
        audio: {
          id: "aud_1014",
          fileName: "Vigilance_Call_OceanWave_Kochi.wav",
          originalName: "Vigilance_Call_OceanWave_Kochi.wav",
          fileSize: 1058444,
          duration: 195,
          url: "/api/leads/VA-2026-1014/audio",
          storagePath: demoAudioFile,
          mimeType: "audio/wav",
          uploadedAt: formatIso(-3600000 * 72),
          uploadedBy: "Vikram Malhotra (VIGILANCE)",
          waveformSample: [30, 45, 60, 80, 95, 80, 65, 70, 85, 90, 75, 60, 45, 30],
        },
        verificationNotes: "Audit verified and confirmed.",
        completedAt: formatIso(-3600000 * 72),
        completedBy: "Vikram Malhotra (VIGILANCE)",
      },
      supportDetails: {
        verification: {
          isDateVerified: true,
          isTimeVerified: true,
          isAddressVerified: true,
          verifiedBy: "Neha Sundaram (SUPPORT)",
          verifiedAt: formatIso(-3600000 * 60),
        },
        allocatedTo: "Aditya Deshmukh (Sales Executive)",
        completedAt: formatIso(-3600000 * 60),
        completedBy: "Neha Sundaram (SUPPORT)",
      },
      salesDetails: {
        audioListenCompleted: true,
        claimedBy: "Aditya Deshmukh (SALES)",
        claimedById: salesUserId,
        claimedAt: formatIso(-3600000 * 24),
        dealValue: 500000,
        closingRemarks: "Client signed 3-year enterprise contract. Onboarding scheduled for Q4.",
      },
      workflowHistory: [
        {
          id: `wf_${now}_1014a`,
          department: DEPARTMENTS.MARKETING,
          action: WORKFLOW_ACTIONS.LEAD_CREATED,
          userName: "Rohan Varma",
          userRole: ROLES.MARKETING,
          timestamp: formatIso(-3600000 * 80),
          description: "Registered lead from marketing campaign.",
        },
        {
          id: `wf_${now}_1014b`,
          department: DEPARTMENTS.COMMUNICATION,
          action: WORKFLOW_ACTIONS.MEETING_SCHEDULED,
          userName: "Pooja Hegde",
          userRole: ROLES.COMMUNICATION,
          timestamp: formatIso(-3600000 * 76),
          description: "Introductory meeting scheduled.",
        },
        {
          id: `wf_${now}_1014c`,
          department: DEPARTMENTS.VIGILANCE,
          action: WORKFLOW_ACTIONS.VERIFIED_AND_AUDIO_UPLOADED,
          userName: "Vikram Malhotra",
          userRole: ROLES.VIGILANCE,
          timestamp: formatIso(-3600000 * 72),
          description: "Call recording attached and verified.",
        },
        {
          id: `wf_${now}_1014d`,
          department: DEPARTMENTS.SUPPORT,
          action: WORKFLOW_ACTIONS.ALLOCATED_TO_SALES,
          userName: "Neha Sundaram",
          userRole: ROLES.SUPPORT,
          timestamp: formatIso(-3600000 * 60),
          description: "3-point verification confirmed. Allocated to Aditya Deshmukh.",
        },
        {
          id: `wf_${now}_1014e`,
          department: DEPARTMENTS.SALES,
          action: WORKFLOW_ACTIONS.AUDIO_LISTENED_AND_CLAIMED,
          userName: "Aditya Deshmukh",
          userRole: ROLES.SALES,
          timestamp: formatIso(-3600000 * 24),
          description: "Full audio listened. Claimed lead and closed contract (₹5,00,000).",
          metadata: { dealValue: 500000 },
        },
      ],
    },
  ];
}

export async function seedDatabase(): Promise<{
  usersCreated: number;
  usersUpdated: number;
  usersSkipped: number;
  leadsCreated: number;
  leadsUpdated: number;
}> {
  // Fail closed before any database writes or file operations if production or missing/invalid config
  const seedPassword = validateSeedEnvironment();

  const demoAudioFile = ensureDemoAudioFile();

  // 1. Seed Users Idempotently (Preserving and Skipping Existing Accounts)
  let usersCreated = 0;
  let usersSkipped = 0;
  const usersUpdated = 0;
  const allUsersToSeed = [...PRIMARY_DEMO_USERS, ...ALIAS_DEMO_USERS];

  for (const u of allUsersToSeed) {
    const existing = await User.findOne({ email: u.email });
    if (!existing) {
      const user = new User({
        ...u,
        password: seedPassword,
      });
      await user.save();
      usersCreated++;
      logger.info({ email: u.email, role: u.role }, "Seed user created");
    } else {
      // Security: Never overwrite or modify existing user accounts in demo seed script.
      // Roles, departments, passwords, and status of existing accounts are preserved unconditionally.
      usersSkipped++;
      logger.info(
        { email: u.email, role: existing.role },
        "Existing user preserved; skipping modification"
      );
    }
  }

  // Fetch sales user ID for linking claimed deal
  const salesUser = await User.findOne({ email: "sales@vibhanu.com" });
  const salesUserId = salesUser?._id?.toString();

  // 2. Seed Leads Idempotently
  let leadsCreated = 0;
  let leadsUpdated = 0;
  const demoLeads = buildDemoLeads(demoAudioFile, salesUserId);

  for (const leadData of demoLeads) {
    const existing = await Lead.findOne({ leadCode: leadData.leadCode });
    if (!existing) {
      const lead = new Lead(leadData);
      await lead.save();
      leadsCreated++;
    } else {
      existing.set(leadData);
      if (!(leadData as any).vigilanceDetails) existing.set("vigilanceDetails", undefined);
      if (!(leadData as any).supportDetails) existing.set("supportDetails", undefined);
      if (!(leadData as any).salesDetails) existing.set("salesDetails", undefined);
      if (!(leadData as any).communicationDetails) existing.set("communicationDetails", undefined);
      await existing.save();
      leadsUpdated++;
    }
  }

  return {
    usersCreated,
    usersUpdated,
    usersSkipped,
    leadsCreated,
    leadsUpdated,
  };
}

export async function seedDatabaseIfEmpty() {
  const rawEnv = process.env.NODE_ENV ? process.env.NODE_ENV.toLowerCase().trim() : "";
  if (rawEnv !== "development" && rawEnv !== "test") {
    logger.warn(
      { nodeEnv: rawEnv || "missing" },
      "seedDatabaseIfEmpty skipped: demo seeding is strictly restricted to 'development' or 'test' environments."
    );
    return;
  }

  // If SEED_DEFAULT_PASSWORD is not configured or does not meet minimum 12 chars, log warning and do not execute demo seed
  const rawPassword = process.env.SEED_DEFAULT_PASSWORD?.trim();
  if (!rawPassword || rawPassword.length < 12) {
    logger.warn(
      "Database has no users, but SEED_DEFAULT_PASSWORD is not configured or does not meet the 12-character minimum. Skipping automatic demo seed."
    );
    return;
  }

  const count = await User.countDocuments();
  if (count === 0) {
    logger.info("Database has no users. Running initial seed...");
    await seedDatabase();
  }
}

// Direct CLI invocation
if (require.main === module) {
  (async () => {
    try {
      // Validate environment and seed credentials BEFORE connecting to MongoDB
      validateSeedEnvironment();

      await connectDatabase();
      const result = await seedDatabase();

      const dbName = mongoose.connection.name || "vibhanu_crm";

      // Concise summary conforming to Section 13 specification
      console.log("\nMongoDB connected successfully\n");
      console.log("Demo seed completed\n");
      console.log("Users:");
      console.log(`Created: ${result.usersCreated}`);
      console.log(`Skipped: ${result.usersSkipped}`);
      console.log(`Updated: ${result.usersUpdated}\n`);
      console.log("Leads:");
      console.log(`Created: ${result.leadsCreated}`);
      console.log(`Updated: ${result.leadsUpdated}\n`);
      console.log("Database:");
      console.log(dbName + "\n");
      console.log("Connection:");
      console.log("MongoDB Atlas\n");

      await disconnectDatabase();
      process.exit(0);
    } catch (err: any) {
      logger.error({ err: err.message }, "Seed script failed");
      process.exit(1);
    }
  })();
}
