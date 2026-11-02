import { DepartmentType, LeadStatusType } from "../constants/departments";
import { UserRole } from "../constants/roles";

export type AudioProtectionStatus = "protected" | "legacy-public" | "private" | "unknown";

export interface IAudioMetadata {
  id: string;
  fileName: string;
  originalName: string;
  fileSize: number;
  duration: number;
  url: string;
  storagePath: string;
  mimeType: string;
  uploadedBy: string;
  uploadedAt: string;
  waveformSample?: number[];
  publicId?: string;
  resourceType?: "video" | "raw";
  deliveryType?: "upload" | "authenticated" | "private";
  format?: string;
  version?: string;
  protectionStatus?: AudioProtectionStatus;
}

export interface IVerificationMetadata {
  isDateVerified: boolean;
  isTimeVerified: boolean;
  isAddressVerified: boolean;
  verifiedBy?: string;
  verifiedAt?: string;
  notes?: string;
}

export interface IWorkflowHistoryItem {
  id: string;
  department: DepartmentType;
  action: string;
  userName: string;
  userRole: UserRole;
  timestamp: string;
  description: string;
  metadata?: Record<string, any>;
}

export interface ILeadDocument {
  id: string;
  leadCode: string;
  name: string;
  contactNumber: string;
  postalAddress?: string;
  city?: string;
  state?: string;
  pincode?: string;
  date?: string;
  time?: string;
  remark?: string;
  currentDepartment: DepartmentType;
  status: LeadStatusType;
  createdBy: string;
  createdById?: string;
  
  communicationDetails?: {
    scheduledDate?: string;
    scheduledTime?: string;
    meetingNotes?: string;
    completedAt?: string;
    completedBy?: string;
  };

  vigilanceDetails?: {
    audio?: IAudioMetadata;
    verificationNotes?: string;
    completedAt?: string;
    completedBy?: string;
  };

  supportDetails?: {
    verification: IVerificationMetadata;
    allocatedTo?: string;
    allocationNotes?: string;
    completedAt?: string;
    completedBy?: string;
  };

  salesDetails?: {
    audioListenCompleted: boolean;
    claimedBy?: string;
    claimedById?: string;
    claimedAt?: string;
    dealValue?: number;
    closingRemarks?: string;
  };

  workflowHistory: IWorkflowHistoryItem[];
  createdAt: Date;
  updatedAt: Date;
}
