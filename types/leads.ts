import { Role } from "./auth";

export type Department =
  | "marketing"
  | "communication"
  | "vigilance"
  | "support"
  | "sales"
  | "claimed";

export type LeadStatus =
  | "new"
  | "in_progress"
  | "meeting_scheduled"
  | "verified"
  | "allocated"
  | "claimed"
  | "rejected";

export interface AudioData {
  id: string;
  fileName: string;
  fileSize: number; // in bytes
  duration: number; // in seconds
  url: string;
  uploadedAt: string;
  uploadedBy: string;
  mimeType: string;
  waveformSample?: number[];
  publicId?: string;
  resourceType?: string;
  protectionStatus?: "protected" | "legacy-public" | "private" | "unknown";
  /** Raw File object – only present for locally selected files before upload */
  _file?: File;
}

export interface VerificationData {
  isDateVerified: boolean;
  isTimeVerified: boolean;
  isAddressVerified: boolean;
  verifiedBy?: string;
  verifiedAt?: string;
  notes?: string;
}

export interface WorkflowHistoryItem {
  id: string;
  department: Department;
  action: string;
  userName: string;
  userRole: Role;
  timestamp: string;
  description: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface Lead {
  id: string;
  leadCode: string; // e.g. "VA-2026-0842"
  name: string;
  contactNumber: string;
  postalAddress?: string;
  city?: string;
  state?: string;
  pincode?: string;
  date?: string; // Scheduled / target date (YYYY-MM-DD)
  time?: string; // Scheduled / target time (HH:MM or 11:30 AM)
  remark?: string;
  currentDepartment: Department;
  status: LeadStatus;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  
  // Department-specific progression fields
  communicationDetails?: {
    scheduledDate?: string;
    scheduledTime?: string;
    meetingNotes?: string;
    completedAt?: string;
    completedBy?: string;
  };
  
  vigilanceDetails?: {
    audio?: AudioData;
    verificationNotes?: string;
    completedAt?: string;
    completedBy?: string;
  };
  
  supportDetails?: {
    verification: VerificationData;
    allocationNotes?: string;
    allocatedTo?: string;
    completedAt?: string;
    completedBy?: string;
  };
  
  salesDetails?: {
    audioListenCompleted: boolean;
    claimedBy?: string;
    claimedAt?: string;
    dealValue?: number;
    closingRemarks?: string;
  };
  
  workflowHistory: WorkflowHistoryItem[];
}

export interface LeadFilters {
  search?: string;
  department?: Department | "all";
  status?: LeadStatus | "all";
  dateRange?: {
    from?: string;
    to?: string;
  };
  sortBy?: "createdAt" | "updatedAt" | "name" | "department";
  sortOrder?: "asc" | "desc";
  page?: number;
  limit?: number;
}

export interface DashboardStats {
  totalLeads: number;
  marketingCount: number;
  communicationCount: number;
  vigilanceCount: number;
  supportCount: number;
  salesCount: number;
  claimedCount: number;
  conversionRate: number;
  recentActivityCount: number;
  leadsGrowthPercentage: number;
}
