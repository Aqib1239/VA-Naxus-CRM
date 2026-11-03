/**
 * LeadsService — Backend-Connected Implementation
 *
 * All methods call the real REST API via the `api` client.
 * On network failure (backend offline), falls back to the localStorage
 * mock so the frontend remains usable in isolation.
 */

import { Lead, LeadFilters, DashboardStats, AudioData } from "@/types/leads";
import { User } from "@/types/auth";
import { INITIAL_MOCK_LEADS } from "./mockData";
import { api, PaginatedResponse } from "./api";

// ─────────────────────────────────────────────────────────────
// Helpers — map backend shape → frontend Lead shape
// ─────────────────────────────────────────────────────────────

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === "production" ? "/api" : "http://localhost:5000/api");

/** Build the authorised audio streaming URL for a lead (never includes tokens in query string) */
function buildAudioUrl(leadId: string): string {
  return `${BASE_URL}/leads/${leadId}/audio`;
}

/** Map a raw backend lead document to the frontend Lead interface */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapBackendLead(raw: any): Lead {
  const dept = (raw.currentDepartment as string)?.toLowerCase();
  const status = (raw.status as string)?.toLowerCase();
  const leadId = raw.id || raw._id;

  // Map audio metadata
  const rawAudio = raw.vigilanceDetails?.audio || raw.audio;
  let audioData: AudioData | undefined;
  if (rawAudio && (rawAudio.url || rawAudio.storagePath || rawAudio.fileName || rawAudio.originalName)) {
    const rawUrl: string | undefined = rawAudio.url;
    let url = buildAudioUrl(leadId);

    if (rawUrl) {
      if (rawUrl.startsWith("blob:") || rawUrl.startsWith("data:")) {
        // 1. Local client preview Blob/data URL
        url = rawUrl;
      } else if (rawUrl.startsWith("/audio/") || rawUrl.startsWith("http://localhost:3000/audio/")) {
        // 2. Safe local static audio asset in Next.js public/ directory
        url = rawUrl;
      } else {
        // 3. All remote and Cloudinary media streams through the authorized backend proxy
        url = buildAudioUrl(leadId);
      }
    }

    const protectionStatus: "protected" | "legacy-public" | "private" | "unknown" =
      rawAudio.protectionStatus === "protected" ||
      rawAudio.protectionStatus === "legacy-public" ||
      rawAudio.protectionStatus === "private" ||
      rawAudio.protectionStatus === "unknown"
        ? rawAudio.protectionStatus
        : "unknown";

    audioData = {
      id: rawAudio.id || rawAudio._id || rawAudio.filename || `aud-${leadId}`,
      url,
      protectionStatus,
      fileName: rawAudio.fileName || rawAudio.originalName || rawAudio.filename || "recording.mp3",
      fileSize: rawAudio.fileSize || rawAudio.size || 0,
      duration: rawAudio.duration || 180,
      mimeType: rawAudio.mimeType || "audio/mpeg",
      uploadedAt: rawAudio.uploadedAt || raw.updatedAt || raw.createdAt,
      uploadedBy: typeof rawAudio.uploadedBy === "object"
        ? (rawAudio.uploadedBy?.name || "System")
        : (rawAudio.uploadedBy || "System"),
      waveformSample: rawAudio.waveformSample,
      resourceType: rawAudio.resourceType || "video",
    };
  }

  // Map workflow history
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const workflowHistory = (raw.workflowHistory || []).map((wf: any) => ({
    id: wf.id || wf._id || String(Math.random()),
    department: (wf.department || wf.fromDepartment || wf.toDepartment || "marketing").toLowerCase(),
    action: wf.action || "Action",
    userName: wf.userName || wf.performedBy?.name || "System",
    userRole: wf.userRole || wf.performedBy?.role || "SYSTEM",
    timestamp: wf.timestamp || wf.performedAt || raw.createdAt,
    description: wf.description || wf.note || wf.action,
    metadata: wf.metadata,
  }));

  return {
    id: leadId,
    leadCode: raw.leadCode || leadId,
    name: raw.name,
    contactNumber: raw.contactNumber,
    city: raw.city || "",
    state: raw.state || "",
    postalAddress: raw.postalAddress || "",
    pincode: raw.pincode,
    remark: raw.remark || "",
    date: raw.date,
    time: raw.time,
    currentDepartment: dept as Lead["currentDepartment"],
    status: status as Lead["status"],
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    createdBy: typeof raw.createdBy === "object"
      ? `${raw.createdBy?.name} (${raw.createdBy?.role})`
      : raw.createdBy || "System",
    workflowHistory,
    // Department-specific detail sub-objects
    communicationDetails: raw.communicationDetails,
    vigilanceDetails: raw.vigilanceDetails
      ? {
          ...raw.vigilanceDetails,
          audio: audioData || raw.vigilanceDetails.audio,
        }
      : audioData
      ? { audio: audioData }
      : undefined,
    supportDetails: raw.supportDetails,
    salesDetails: raw.salesDetails,
  };
}

// ─────────────────────────────────────────────────────────────
// LocalStorage fallback helpers (used when backend is offline)
// ─────────────────────────────────────────────────────────────

const STORAGE_KEY_LEADS = "vibhanu_crm_leads_v1";

function loadLocalLeads(): Lead[] {
  if (typeof window === "undefined") return INITIAL_MOCK_LEADS;
  try {
    const stored = localStorage.getItem(STORAGE_KEY_LEADS);
    if (stored) return JSON.parse(stored);
  } catch (e) {
    console.error("Failed to parse stored leads", e);
  }
  saveLocalLeads(INITIAL_MOCK_LEADS);
  return INITIAL_MOCK_LEADS;
}

function saveLocalLeads(leads: Lead[]): void {
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY_LEADS, JSON.stringify(leads));
  }
}

// ─────────────────────────────────────────────────────────────
// LeadsService
// ─────────────────────────────────────────────────────────────

export class LeadsService {
  /** Compute dashboard KPI statistics directly from any lead array */
  static computeStatsFromLeads(leads: Lead[]): DashboardStats {
    const count = (dept: string) =>
      leads.filter((l) => l.currentDepartment === dept).length;
    const claimedCount = count("claimed");
    const totalLeads = leads.length;
    return {
      totalLeads,
      marketingCount: count("marketing"),
      communicationCount: count("communication"),
      vigilanceCount: count("vigilance"),
      supportCount: count("support"),
      salesCount: count("sales"),
      claimedCount,
      conversionRate: totalLeads > 0 ? Math.round((claimedCount / totalLeads) * 100) : 0,
      recentActivityCount: Math.max(12, totalLeads * 2),
      leadsGrowthPercentage: 18.4,
    };
  }

  /** Reset local mock data back to defaults (dev helper) */
  static resetData(): Lead[] {
    saveLocalLeads(INITIAL_MOCK_LEADS);
    return INITIAL_MOCK_LEADS;
  }

  // ───────────────────────────────────────────────
  // GET /api/leads — list with pagination & filters
  // ───────────────────────────────────────────────
  static async getLeads(
    filters: LeadFilters = {}
  ): Promise<PaginatedResponse<Lead>> {
    try {
      const params: Record<string, string | number | boolean | undefined> = {};
      if (filters.page)       params.page       = filters.page;
      if (filters.limit)      params.limit      = filters.limit;
      if (filters.search)     params.search     = filters.search;
      if (filters.department && filters.department !== "all")
                              params.department  = filters.department;
      if (filters.status && filters.status !== "all")
                              params.status      = filters.status;
      if (filters.sortBy)     params.sortBy     = filters.sortBy;
      if (filters.sortOrder)  params.sortOrder  = filters.sortOrder;

      const res = await api.get<{
        data: unknown[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
      }>("/leads", params);

      // Backend returns { data: { data: leads[], total, page, limit, totalPages } }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payload = res.data as any;
      const rawLeads: unknown[] = payload?.data ?? payload?.leads ?? [];
      const leads = rawLeads.map(mapBackendLead);
      return {
        data: leads,
        total:      payload?.total      ?? leads.length,
        page:       payload?.page       ?? filters.page ?? 1,
        limit:      payload?.limit      ?? filters.limit ?? 10,
        totalPages: payload?.totalPages ?? 1,
      };
    } catch (err: unknown) {
      const code = (err as { status?: number })?.status;
      if (code === 401 || code === 403) throw err; // propagate auth errors

      console.warn("[LeadsService] Backend offline — using local mock", err);
      return fallbackGetLeads(filters);
    }
  }

  // ───────────────────────────────────────────────
  // GET /api/leads/:id — single lead
  // ───────────────────────────────────────────────
  static async getLeadById(id: string): Promise<Lead | null> {
    try {
      const res = await api.get<unknown>(`/leads/${id}`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw = (res.data as any)?.lead ?? res.data;
      return raw ? mapBackendLead(raw) : null;
    } catch (err: unknown) {
      const code = (err as { status?: number })?.status;
      if (code === 401 || code === 403) throw err;

      console.warn("[LeadsService] Fallback getLeadById", err);
      const leads = loadLocalLeads();
      return (
        leads.find(
          (l) =>
            l.id === id ||
            l.leadCode.toLowerCase() === id.toLowerCase()
        ) || null
      );
    }
  }

  // ───────────────────────────────────────────────
  // POST /api/leads/:id/audio/ticket — short-lived media ticket
  // ───────────────────────────────────────────────
  static async getAudioTicket(
    leadId: string
  ): Promise<{ ticket: string; leadId: string; expiresInSeconds: number; streamUrl: string }> {
    const res = await api.post<{
      ticket: string;
      leadId: string;
      expiresInSeconds: number;
      streamUrl: string;
    }>(`/leads/${leadId}/audio/ticket`);
    return res.data;
  }

  // ───────────────────────────────────────────────
  // GET /api/dashboard — aggregated stats
  // ───────────────────────────────────────────────
  static async getDashboardStats(): Promise<DashboardStats> {
    try {
      const res = await api.get<DashboardStats>("/dashboard");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (res.data as any)?.stats ?? res.data;
    } catch (err: unknown) {
      const code = (err as { status?: number })?.status;
      if (code === 401 || code === 403) throw err;

      console.warn("[LeadsService] Fallback getDashboardStats", err);
      return fallbackGetDashboardStats();
    }
  }

  // ───────────────────────────────────────────────
  // 1. MARKETING: POST /api/leads — create lead
  // ───────────────────────────────────────────────
  static async createMarketingLead(
    data: {
      name: string;
      contactNumber: string;
      city?: string;
      state?: string;
      initialRemarks?: string;
    },
    _user?: User | null
  ): Promise<Lead> {
    try {
      const res = await api.post<unknown>("/leads", {
        name: data.name,
        contactNumber: data.contactNumber,
        city: data.city,
        state: data.state,
        remark: data.initialRemarks,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw = (res.data as any)?.lead ?? res.data;
      return mapBackendLead(raw);
    } catch (err: unknown) {
      const code = (err as { status?: number })?.status;
      if (code === 401 || code === 403) throw err;

      console.warn("[LeadsService] Fallback createMarketingLead", err);
      return fallbackCreateLead(data, _user);
    }
  }

  // ───────────────────────────────────────────────
  // 2. COMMUNICATION: POST /api/leads/:id/meeting
  // ───────────────────────────────────────────────
  static async scheduleCommunicationMeeting(
    leadId: string,
    data: {
      name: string;
      postalAddress: string;
      city: string;
      state: string;
      pincode?: string;
      date: string;
      time: string;
      remark: string;
    },
    _user?: User | null
  ): Promise<Lead> {
    try {
      const res = await api.post<unknown>(`/leads/${leadId}/meeting`, data);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw = (res.data as any)?.lead ?? res.data;
      return mapBackendLead(raw);
    } catch (err: unknown) {
      const code = (err as { status?: number })?.status;
      if (code === 401 || code === 403) throw err;

      console.warn("[LeadsService] Fallback scheduleCommunicationMeeting", err);
      return fallbackScheduleMeeting(leadId, data, _user);
    }
  }

  // ───────────────────────────────────────────────
  // 3a. VIGILANCE: POST /api/leads/:id/audio — upload
  // 3b.            POST /api/leads/:id/verify  — verify
  // ───────────────────────────────────────────────
  static async verifyVigilanceLead(
    leadId: string,
    data: {
      name: string;
      postalAddress: string;
      city: string;
      state: string;
      pincode?: string;
      date: string;
      time: string;
      remark: string;
      audio: AudioData;
    },
    _user?: User | null
  ): Promise<Lead> {
    try {
      // Step 1 — Upload audio if a file is attached
      if (data.audio._file) {
        const formData = new FormData();
        formData.append("audio", data.audio._file);
        await api.upload<unknown>(`/leads/${leadId}/audio`, formData);
      }

      // Step 2 — Verify lead and move to Support
      const res = await api.post<unknown>(`/leads/${leadId}/verify`, {
        name: data.name,
        postalAddress: data.postalAddress,
        city: data.city,
        state: data.state,
        pincode: data.pincode,
        date: data.date,
        time: data.time,
        remark: data.remark,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw = (res.data as any)?.lead ?? res.data;
      return mapBackendLead(raw);
    } catch (err: unknown) {
      const code = (err as { status?: number })?.status;
      if (code === 401 || code === 403) throw err;

      console.warn("[LeadsService] Fallback verifyVigilanceLead", err);
      return fallbackVerifyVigilance(leadId, data, _user);
    }
  }

  // ───────────────────────────────────────────────
  // 4. SUPPORT: POST /api/leads/:id/allocate
  // ───────────────────────────────────────────────
  static async allocateSupportLead(
    leadId: string,
    data: {
      isDateVerified: boolean;
      isTimeVerified: boolean;
      isAddressVerified: boolean;
      allocatedTo: string;
      allocationNotes?: string;
    },
    _user?: User | null
  ): Promise<Lead> {
    try {
      const res = await api.post<unknown>(`/leads/${leadId}/allocate`, data);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw = (res.data as any)?.lead ?? res.data;
      return mapBackendLead(raw);
    } catch (err: unknown) {
      const code = (err as { status?: number })?.status;
      if (code === 401 || code === 403) throw err;

      console.warn("[LeadsService] Fallback allocateSupportLead", err);
      return fallbackAllocateLead(leadId, data, _user);
    }
  }

  // ───────────────────────────────────────────────
  // Mark audio as listened (local-only gating state)
  // ───────────────────────────────────────────────
  static async markAudioListenCompleted(leadId: string): Promise<Lead> {
    // This is purely a client-side gating mechanism.
    // We mutate local state; if connected to backend, also optimistically update.
    const leads = loadLocalLeads();
    const index = leads.findIndex((l) => l.id === leadId);
    if (index !== -1) {
      leads[index] = {
        ...leads[index],
        salesDetails: {
          ...(leads[index].salesDetails || { audioListenCompleted: false }),
          audioListenCompleted: true,
        },
      };
      saveLocalLeads(leads);
      return leads[index];
    }
    // If not in local cache, try fetching from backend
    const lead = await this.getLeadById(leadId);
    if (!lead) throw new Error("Lead not found");
    return { ...lead, salesDetails: { ...(lead.salesDetails || { audioListenCompleted: false }), audioListenCompleted: true } };
  }

  // ───────────────────────────────────────────────
  // 5. SALES: POST /api/leads/:id/claim
  // ───────────────────────────────────────────────
  static async claimSalesLead(
    leadId: string,
    data: {
      dealValue?: number;
      closingRemarks?: string;
    },
    _user?: User | null
  ): Promise<Lead> {
    try {
      const res = await api.post<unknown>(`/leads/${leadId}/claim`, data);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw = (res.data as any)?.lead ?? res.data;
      return mapBackendLead(raw);
    } catch (err: unknown) {
      const code = (err as { status?: number })?.status;
      if (code === 401 || code === 403) throw err;

      console.warn("[LeadsService] Fallback claimSalesLead", err);
      return fallbackClaimLead(leadId, data, _user);
    }
  }
}

// ─────────────────────────────────────────────────────────────
// LOCAL FALLBACK IMPLEMENTATIONS (mirrors original localStorage logic)
// ─────────────────────────────────────────────────────────────

function fallbackGetLeads(filters: LeadFilters): PaginatedResponse<Lead> {
  let leads = loadLocalLeads();

  if (filters.department && filters.department !== "all")
    leads = leads.filter((l) => l.currentDepartment === filters.department);

  if (filters.status && filters.status !== "all")
    leads = leads.filter((l) => l.status === filters.status);

  if (filters.search?.trim()) {
    const q = filters.search.toLowerCase().trim();
    leads = leads.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        l.leadCode.toLowerCase().includes(q) ||
        l.contactNumber.toLowerCase().includes(q) ||
        (l.city && l.city.toLowerCase().includes(q)) ||
        (l.postalAddress && l.postalAddress.toLowerCase().includes(q)) ||
        (l.remark && l.remark.toLowerCase().includes(q))
    );
  }

  const sortBy = filters.sortBy || "createdAt";
  const sortOrder = filters.sortOrder || "desc";
  leads.sort((a, b) => {
    let valA: string | number = (a[sortBy as keyof Lead] as string) || "";
    let valB: string | number = (b[sortBy as keyof Lead] as string) || "";
    if (typeof valA === "string") valA = valA.toLowerCase();
    if (typeof valB === "string") valB = valB.toLowerCase();
    if (valA < valB) return sortOrder === "asc" ? -1 : 1;
    if (valA > valB) return sortOrder === "asc" ? 1 : -1;
    return 0;
  });

  const page = filters.page || 1;
  const limit = filters.limit || 10;
  const total = leads.length;
  return {
    data: leads.slice((page - 1) * limit, page * limit),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
  };
}

function fallbackGetDashboardStats(): DashboardStats {
  const leads = loadLocalLeads();
  const count = (dept: string) =>
    leads.filter((l) => l.currentDepartment === dept).length;
  const claimedCount = count("claimed");
  const totalLeads = leads.length;
  return {
    totalLeads,
    marketingCount:      count("marketing"),
    communicationCount:  count("communication"),
    vigilanceCount:      count("vigilance"),
    supportCount:        count("support"),
    salesCount:          count("sales"),
    claimedCount,
    conversionRate:      totalLeads > 0 ? Math.round((claimedCount / totalLeads) * 100) : 0,
    recentActivityCount: 24,
    leadsGrowthPercentage: 18.4,
  };
}

function fallbackCreateLead(
  data: { name: string; contactNumber: string; city?: string; state?: string; initialRemarks?: string },
  user?: User | null
): Lead {
  const leads = loadLocalLeads();
  const now = new Date().toISOString();
  const leadCode = `VA-2026-${Math.floor(1000 + Math.random() * 9000)}`;
  const userName = user?.name || "System";
  const userRole = user?.role || "MARKETING";
  const newLead: Lead = {
    id: `lead-${Date.now()}`,
    leadCode,
    name: data.name.trim(),
    contactNumber: data.contactNumber.trim(),
    city: data.city || "Mumbai",
    state: data.state || "Maharashtra",
    remark: data.initialRemarks || "Direct inbound lead.",
    currentDepartment: "communication",
    status: "in_progress",
    createdAt: now,
    updatedAt: now,
    createdBy: `${userName} (${userRole})`,
    workflowHistory: [{
      id: `wf-${Date.now()}-1`,
      department: "marketing",
      action: "Lead Created",
      userName,
      userRole,
      timestamp: now,
      description: "Lead created by Marketing. Dispatched to Communication team.",
    }],
  };
  leads.unshift(newLead);
  saveLocalLeads(leads);
  return newLead;
}

function fallbackScheduleMeeting(
  leadId: string,
  data: { name: string; postalAddress: string; city: string; state: string; pincode?: string; date: string; time: string; remark: string },
  user?: User | null
): Lead {
  const leads = loadLocalLeads();
  const index = leads.findIndex((l) => l.id === leadId);
  if (index === -1) throw new Error("Lead not found");
  const now = new Date().toISOString();
  const userName = user?.name || "System";
  const userRole = user?.role || "COMMUNICATION";
  const updated: Lead = {
    ...leads[index],
    ...data,
    currentDepartment: "vigilance",
    status: "meeting_scheduled",
    updatedAt: now,
    communicationDetails: { scheduledDate: data.date, scheduledTime: data.time, meetingNotes: data.remark, completedAt: now, completedBy: userName },
    workflowHistory: [...leads[index].workflowHistory, { id: `wf-${Date.now()}`, department: "communication", action: "Meeting Scheduled", userName, userRole, timestamp: now, description: `Meeting scheduled for ${data.date} at ${data.time}. Transferred to Vigilance.` }],
  };
  leads[index] = updated;
  saveLocalLeads(leads);
  return updated;
}

function fallbackVerifyVigilance(
  leadId: string,
  data: { name: string; postalAddress: string; city: string; state: string; pincode?: string; date: string; time: string; remark: string; audio: AudioData },
  user?: User | null
): Lead {
  const leads = loadLocalLeads();
  const index = leads.findIndex((l) => l.id === leadId);
  if (index === -1) throw new Error("Lead not found");
  const now = new Date().toISOString();
  const userName = user?.name || "System";
  const userRole = user?.role || "VIGILANCE";
  const updated: Lead = {
    ...leads[index],
    name: data.name, postalAddress: data.postalAddress, city: data.city, state: data.state, pincode: data.pincode, date: data.date, time: data.time, remark: data.remark,
    currentDepartment: "support",
    status: "verified",
    updatedAt: now,
    vigilanceDetails: { audio: data.audio, verificationNotes: data.remark, completedAt: now, completedBy: userName },
    supportDetails: { verification: { isDateVerified: false, isTimeVerified: false, isAddressVerified: false } },
    workflowHistory: [...leads[index].workflowHistory, { id: `wf-${Date.now()}`, department: "vigilance", action: "Verified & Audio Uploaded", userName, userRole, timestamp: now, description: `Vigilance audit passed. Call recording (${data.audio.fileName}) attached. Moved to Support.` }],
  };
  leads[index] = updated;
  saveLocalLeads(leads);
  return updated;
}

function fallbackAllocateLead(
  leadId: string,
  data: { isDateVerified: boolean; isTimeVerified: boolean; isAddressVerified: boolean; allocatedTo: string; allocationNotes?: string },
  user?: User | null
): Lead {
  const leads = loadLocalLeads();
  const index = leads.findIndex((l) => l.id === leadId);
  if (index === -1) throw new Error("Lead not found");
  const now = new Date().toISOString();
  const userName = user?.name || "System";
  const userRole = user?.role || "SUPPORT";
  const updated: Lead = {
    ...leads[index],
    currentDepartment: "sales",
    status: "allocated",
    updatedAt: now,
    supportDetails: { verification: { isDateVerified: data.isDateVerified, isTimeVerified: data.isTimeVerified, isAddressVerified: data.isAddressVerified, verifiedBy: userName, verifiedAt: now, notes: data.allocationNotes }, allocatedTo: data.allocatedTo, allocationNotes: data.allocationNotes, completedAt: now, completedBy: userName },
    salesDetails: { audioListenCompleted: false },
    workflowHistory: [...leads[index].workflowHistory, { id: `wf-${Date.now()}`, department: "support", action: "Allocated to Sales", userName, userRole, timestamp: now, description: `3-point verification confirmed. Allocated to Sales Executive: ${data.allocatedTo}.` }],
  };
  leads[index] = updated;
  saveLocalLeads(leads);
  return updated;
}

function fallbackClaimLead(
  leadId: string,
  data: { dealValue?: number; closingRemarks?: string },
  user?: User | null
): Lead {
  const leads = loadLocalLeads();
  const index = leads.findIndex((l) => l.id === leadId);
  if (index === -1) throw new Error("Lead not found");
  const now = new Date().toISOString();
  const userName = user?.name || "System";
  const userRole = user?.role || "SALES";
  const updated: Lead = {
    ...leads[index],
    currentDepartment: "claimed",
    status: "claimed",
    updatedAt: now,
    salesDetails: { audioListenCompleted: true, claimedBy: `${userName} (${userRole})`, claimedAt: now, dealValue: data.dealValue || 350000, closingRemarks: data.closingRemarks || "Lead claimed after audio review." },
    workflowHistory: [...leads[index].workflowHistory, { id: `wf-${Date.now()}`, department: "sales", action: "Audio Listened & Lead Claimed", userName, userRole, timestamp: now, description: `Audio review completed. Lead claimed by ${userName}.` }],
  };
  leads[index] = updated;
  saveLocalLeads(leads);
  return updated;
}
