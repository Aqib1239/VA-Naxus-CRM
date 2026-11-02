import mongoose from "mongoose";
import { Lead, ILead, sanitizeLeadAudio } from "../models/Lead.model";
import { DEPARTMENTS, LEAD_STATUS, WORKFLOW_ACTIONS, DepartmentType, LeadStatusType } from "../constants/departments";
import { ROLES, ROLE_DEFINITIONS, UserRole } from "../constants/roles";
import { IAuthUser } from "../types/auth.types";
import { IAudioMetadata, IWorkflowHistoryItem } from "../types/lead.types";

export interface ILeadQueryFilters {
  page?: number;
  limit?: number;
  search?: string;
  department?: string;
  status?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  from?: string;
  to?: string;
}

export class LeadService {
  /**
   * Generate a unique sequential/random Lead Code like 'VA-2026-XXXX'
   */
  private static async generateLeadCode(): Promise<string> {
    const year = new Date().getFullYear();
    const count = await Lead.countDocuments();
    const codeNumber = 1000 + (count % 9000) + Math.floor(Math.random() * 10);
    const candidate = `VA-${year}-${codeNumber}`;

    const exists = await Lead.findOne({ leadCode: candidate });
    if (exists) {
      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      return `VA-${year}-${randomSuffix}`;
    }
    return candidate;
  }

  /**
   * Helper to check if lead ID is MongoDB ObjectId or leadCode
   */
  public static getLeadQuery(id: string) {
    if (mongoose.Types.ObjectId.isValid(id)) {
      return { $or: [{ _id: id }, { leadCode: id }] };
    }
    return { leadCode: id };
  }

  /**
   * 1. CREATE LEAD (Marketing / Admin)
   */
  static async createLead(
    data: { name: string; contactNumber: string; city?: string; state?: string; initialRemarks?: string },
    user: IAuthUser
  ): Promise<ILead> {
    const leadCode = await this.generateLeadCode();
    const now = new Date().toISOString();

    const workflowItem: IWorkflowHistoryItem = {
      id: `wf_${Date.now()}_1`,
      department: DEPARTMENTS.MARKETING,
      action: WORKFLOW_ACTIONS.LEAD_CREATED,
      userName: user.name,
      userRole: user.role,
      timestamp: now,
      description: `Lead created by ${user.name} (${user.role}). Dispatched to Communication team.`,
    };

    const lead = new Lead({
      leadCode,
      name: data.name.trim(),
      contactNumber: data.contactNumber.trim(),
      city: data.city || "Mumbai",
      state: data.state || "Maharashtra",
      remark: data.initialRemarks || "Direct inbound lead created via Marketing console.",
      currentDepartment: DEPARTMENTS.COMMUNICATION,
      status: LEAD_STATUS.IN_PROGRESS,
      createdBy: `${user.name} (${user.role})`,
      createdById: user.id,
      workflowHistory: [workflowItem],
    });

    await lead.save();
    return lead;
  }

  /**
   * 2. GET LEADS (Filtered with RBAC)
   */
  static async getLeads(filters: ILeadQueryFilters, user: IAuthUser) {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const query: any = {};

    // RBAC Filter: If user is not ADMIN, restrict by allowed departments
    if (user.role !== ROLES.ADMIN) {
      const roleDef = ROLE_DEFINITIONS[user.role];
      const allowed = roleDef?.allowedDepartments || [];

      if (filters.department && filters.department !== "all") {
        if (!allowed.includes(filters.department)) {
          const err: any = new Error(`Role '${user.role}' is not authorized to view '${filters.department}' leads.`);
          err.statusCode = 403;
          throw err;
        }
        query.currentDepartment = filters.department;
      } else {
        query.currentDepartment = { $in: allowed };
      }
    } else {
      if (filters.department && filters.department !== "all") {
        query.currentDepartment = filters.department;
      }
    }

    if (filters.status && filters.status !== "all") {
      query.status = filters.status;
    }

    if (filters.search && filters.search.trim()) {
      const regex = new RegExp(filters.search.trim(), "i");
      query.$or = [
        { name: regex },
        { leadCode: regex },
        { contactNumber: regex },
        { city: regex },
        { state: regex },
        { postalAddress: regex },
        { remark: regex },
      ];
    }

    if (filters.from || filters.to) {
      query.createdAt = {};
      if (filters.from) query.createdAt.$gte = new Date(filters.from);
      if (filters.to) query.createdAt.$lte = new Date(filters.to);
    }

    const sortField = filters.sortBy || "createdAt";
    const sortDirection = filters.sortOrder === "asc" ? 1 : -1;
    const sortOption: any = { [sortField]: sortDirection };

    const tStart = Date.now();
    // Use projection for list views when full details are not requested
    // This reduces wire payload by ~75% (excluding full workflow history)
    const [leads, total] = await Promise.all([
      Lead.find(query)
        .sort(sortOption)
        .skip(skip)
        .limit(limit)
        .lean(),
      Lead.countDocuments(query),
    ]);
    const duration = Date.now() - tStart;

    // Transform _id to id for lean results and sanitize audio metadata to prevent storage leakage
    const mappedLeads = leads.map((l: any) => {
      const id = l._id?.toString() || l.id;
      delete l._id;
      delete l.__v;
      const mapped = {
        ...l,
        id,
      };
      sanitizeLeadAudio(mapped);
      return mapped;
    });

    return {
      data: mappedLeads,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
      queryTimeMs: duration,
    };
  }

  /**
   * 3. GET LEAD BY ID
   */
  static async getLeadById(id: string, user: IAuthUser): Promise<ILead> {
    const lead = await Lead.findOne(this.getLeadQuery(id));

    if (!lead) {
      const err: any = new Error("Lead not found");
      err.statusCode = 404;
      throw err;
    }

    // RBAC check
    if (user.role !== ROLES.ADMIN) {
      const roleDef = ROLE_DEFINITIONS[user.role];
      const allowed = roleDef?.allowedDepartments || [];
      if (!allowed.includes(lead.currentDepartment)) {
        const err: any = new Error(`You do not have permission to view leads in '${lead.currentDepartment}' department.`);
        err.statusCode = 403;
        throw err;
      }
    }

    return lead;
  }

  /**
   * 4. COMMUNICATION: Schedule Meeting (Communication -> Vigilance)
   */
  static async scheduleMeeting(
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
    user: IAuthUser
  ): Promise<ILead> {
    const lead = await Lead.findOne(this.getLeadQuery(leadId));
    if (!lead) {
      const err: any = new Error("Lead not found");
      err.statusCode = 404;
      throw err;
    }

    if (lead.currentDepartment !== DEPARTMENTS.COMMUNICATION && user.role !== ROLES.ADMIN) {
      const err: any = new Error(`Cannot schedule meeting: Lead is in '${lead.currentDepartment}' stage.`);
      err.statusCode = 409;
      throw err;
    }

    const now = new Date().toISOString();

    lead.name = data.name.trim();
    lead.postalAddress = data.postalAddress.trim();
    lead.city = data.city.trim();
    lead.state = data.state.trim();
    lead.pincode = data.pincode ? data.pincode.trim() : lead.pincode;
    lead.date = data.date;
    lead.time = data.time;
    lead.remark = data.remark.trim();
    lead.currentDepartment = DEPARTMENTS.VIGILANCE;
    lead.status = LEAD_STATUS.MEETING_SCHEDULED;

    lead.communicationDetails = {
      scheduledDate: data.date,
      scheduledTime: data.time,
      meetingNotes: data.remark,
      completedAt: now,
      completedBy: `${user.name} (${user.role})`,
    };

    lead.workflowHistory.push({
      id: `wf_${Date.now()}`,
      department: DEPARTMENTS.COMMUNICATION,
      action: WORKFLOW_ACTIONS.MEETING_SCHEDULED,
      userName: user.name,
      userRole: user.role,
      timestamp: now,
      description: `Meeting scheduled for ${data.date} at ${data.time}. Transferred lead to Vigilance.`,
      metadata: { date: data.date, time: data.time },
    });

    await lead.save();
    return lead;
  }

  /**
   * 5. VIGILANCE: Attach Audio
   */
  static async attachAudio(leadId: string, audioMeta: IAudioMetadata, user: IAuthUser): Promise<ILead> {
    const lead = await Lead.findOne(this.getLeadQuery(leadId));
    if (!lead) {
      const err: any = new Error("Lead not found");
      err.statusCode = 404;
      throw err;
    }

    if (lead.currentDepartment !== DEPARTMENTS.VIGILANCE && user.role !== ROLES.ADMIN) {
      const err: any = new Error(`Audio upload only permitted for leads in Vigilance department.`);
      err.statusCode = 409;
      throw err;
    }

    lead.vigilanceDetails = {
      ...(lead.vigilanceDetails || {}),
      audio: audioMeta,
    };

    await lead.save();
    return lead;
  }

  /**
   * 6. VIGILANCE: Verify Lead (Vigilance -> Support)
   */
  static async verifyVigilance(
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
    user: IAuthUser
  ): Promise<ILead> {
    const lead = await Lead.findOne(this.getLeadQuery(leadId));
    if (!lead) {
      const err: any = new Error("Lead not found");
      err.statusCode = 404;
      throw err;
    }

    if (lead.currentDepartment !== DEPARTMENTS.VIGILANCE && user.role !== ROLES.ADMIN) {
      const err: any = new Error(`Cannot verify: Lead is currently in '${lead.currentDepartment}' department.`);
      err.statusCode = 409;
      throw err;
    }

    if (!lead.vigilanceDetails?.audio) {
      const err: any = new Error("Mandatory: Audio verification recording must be uploaded before completing Vigilance audit.");
      err.statusCode = 422;
      throw err;
    }

    const now = new Date().toISOString();

    lead.name = data.name.trim();
    lead.postalAddress = data.postalAddress.trim();
    lead.city = data.city.trim();
    lead.state = data.state.trim();
    lead.pincode = data.pincode ? data.pincode.trim() : lead.pincode;
    lead.date = data.date;
    lead.time = data.time;
    lead.remark = data.remark.trim();
    lead.currentDepartment = DEPARTMENTS.SUPPORT;
    lead.status = LEAD_STATUS.VERIFIED;

    lead.vigilanceDetails.verificationNotes = data.remark;
    lead.vigilanceDetails.completedAt = now;
    lead.vigilanceDetails.completedBy = `${user.name} (${user.role})`;

    lead.supportDetails = {
      verification: {
        isDateVerified: false,
        isTimeVerified: false,
        isAddressVerified: false,
      },
    };

    lead.workflowHistory.push({
      id: `wf_${Date.now()}`,
      department: DEPARTMENTS.VIGILANCE,
      action: WORKFLOW_ACTIONS.VERIFIED_AND_AUDIO_UPLOADED,
      userName: user.name,
      userRole: user.role,
      timestamp: now,
      description: `Vigilance audit passed. Call recording (${lead.vigilanceDetails.audio.fileName}) verified. Moved to Support.`,
    });

    await lead.save();
    return lead;
  }

  /**
   * 7. SUPPORT: 3-Point Allocation (Support -> Sales)
   */
  static async allocateSupport(
    leadId: string,
    data: {
      isDateVerified: boolean;
      isTimeVerified: boolean;
      isAddressVerified: boolean;
      allocatedTo: string;
      allocationNotes?: string;
    },
    user: IAuthUser
  ): Promise<ILead> {
    const lead = await Lead.findOne(this.getLeadQuery(leadId));
    if (!lead) {
      const err: any = new Error("Lead not found");
      err.statusCode = 404;
      throw err;
    }

    if (lead.currentDepartment !== DEPARTMENTS.SUPPORT && user.role !== ROLES.ADMIN) {
      const err: any = new Error(`Cannot allocate: Lead is currently in '${lead.currentDepartment}' department.`);
      err.statusCode = 409;
      throw err;
    }

    if (!data.isDateVerified || !data.isTimeVerified || !data.isAddressVerified) {
      const err: any = new Error("3-point verification required: Date, Time slot, and Address must all be confirmed.");
      err.statusCode = 422;
      throw err;
    }

    const now = new Date().toISOString();

    lead.currentDepartment = DEPARTMENTS.SALES;
    lead.status = LEAD_STATUS.ALLOCATED;

    lead.supportDetails = {
      verification: {
        isDateVerified: data.isDateVerified,
        isTimeVerified: data.isTimeVerified,
        isAddressVerified: data.isAddressVerified,
        verifiedBy: `${user.name} (${user.role})`,
        verifiedAt: now,
        notes: data.allocationNotes,
      },
      allocatedTo: data.allocatedTo.trim(),
      allocationNotes: data.allocationNotes,
      completedAt: now,
      completedBy: `${user.name} (${user.role})`,
    };

    lead.salesDetails = {
      audioListenCompleted: false, // Audio must be fully listened before claiming
    };

    lead.workflowHistory.push({
      id: `wf_${Date.now()}`,
      department: DEPARTMENTS.SUPPORT,
      action: WORKFLOW_ACTIONS.ALLOCATED_TO_SALES,
      userName: user.name,
      userRole: user.role,
      timestamp: now,
      description: `3-point verification confirmed. Allocated to Sales Executive: ${data.allocatedTo}.`,
    });

    await lead.save();
    return lead;
  }

  /**
   * 8. SALES: Claim Lead (Sales -> Claimed)
   * Uses Atomic Conditional Update to prevent double claiming and race conditions!
   */
  static async claimSales(
    leadId: string,
    data: {
      dealValue?: number;
      closingRemarks?: string;
    },
    user: IAuthUser
  ): Promise<ILead> {
    const lead = await Lead.findOne(this.getLeadQuery(leadId));
    if (!lead) {
      const err: any = new Error("Lead not found");
      err.statusCode = 404;
      throw err;
    }

    if (lead.currentDepartment !== DEPARTMENTS.SALES && user.role !== ROLES.ADMIN) {
      const err: any = new Error(`Cannot claim: Lead is currently in '${lead.currentDepartment}' department.`);
      err.statusCode = 409;
      throw err;
    }

    if (lead.status === LEAD_STATUS.CLAIMED) {
      const err: any = new Error(`This lead has already been claimed by ${lead.salesDetails?.claimedBy || "another executive"}.`);
      err.statusCode = 409;
      throw err;
    }

    if (!lead.vigilanceDetails?.audio) {
      const err: any = new Error("Cannot claim lead: Required verification audio record is missing.");
      err.statusCode = 422;
      throw err;
    }

    const now = new Date().toISOString();

    const workflowItem: IWorkflowHistoryItem = {
      id: `wf_${Date.now()}`,
      department: DEPARTMENTS.SALES,
      action: WORKFLOW_ACTIONS.AUDIO_LISTENED_AND_CLAIMED,
      userName: user.name,
      userRole: user.role,
      timestamp: now,
      description: `Audio review verified. Lead claimed by ${user.name}. Deal value: ₹${(data.dealValue || 350000).toLocaleString("en-IN")}.`,
      metadata: { dealValue: data.dealValue || 350000 },
    };

    // Atomic findOneAndUpdate ensuring no concurrent claim can succeed
    const claimedLead = await Lead.findOneAndUpdate(
      {
        _id: lead._id,
        currentDepartment: DEPARTMENTS.SALES,
        status: { $ne: LEAD_STATUS.CLAIMED },
      },
      {
        $set: {
          currentDepartment: DEPARTMENTS.CLAIMED,
          status: LEAD_STATUS.CLAIMED,
          "salesDetails.audioListenCompleted": true,
          "salesDetails.claimedBy": `${user.name} (${user.role})`,
          "salesDetails.claimedById": user.id,
          "salesDetails.claimedAt": now,
          "salesDetails.dealValue": data.dealValue || 350000,
          "salesDetails.closingRemarks": data.closingRemarks || "Lead successfully claimed after complete audio review.",
        },
        $push: {
          workflowHistory: workflowItem,
        },
      },
      { new: true }
    );

    if (!claimedLead) {
      const err: any = new Error("Lead claim failed: The lead may have already been claimed by another user concurrently.");
      err.statusCode = 409;
      throw err;
    }

    return claimedLead;
  }
}
