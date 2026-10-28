"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useLeads } from "@/context/leads-context";
import { PageHeader } from "@/components/layout/PageHeader";
import { BentoCard } from "@/components/dashboard/shared";
import { Button } from "@/components/ui/button";
import { DepartmentBadge, StatusBadge } from "@/components/ui/status-badge";
import { WorkflowStepper } from "@/components/ui/workflow-stepper";
import { WorkflowTimeline } from "@/components/ui/workflow-timeline";
import { AudioPlayer } from "@/components/ui/audio-player";
import { ErrorState } from "@/components/ui/loading-state";
import { Lead } from "@/types/leads";
import { formatDateTime, getInitials } from "@/lib/utils";
import { useAuth } from "@/context/auth-context";
import { LeadInsightPanel } from "@/components/ai/LeadInsightPanel";
import { SalesCopilot } from "@/components/ai/SalesCopilot";
import { VigilanceCopilot } from "@/components/ai/VigilanceCopilot";
import { SupportCopilot } from "@/components/ai/SupportCopilot";
import { AudioIntelligencePanel } from "@/components/ai/AudioIntelligencePanel";
import { 
  ArrowLeft, 
  Phone, 
  ShieldCheck, 
  Lock,
  Unlock,
  Headphones, 
  TrendingUp, 
  Award,
  Calendar,
  Clock,
  MapPin,
  FileText,
  User,
  Sparkles
} from "lucide-react";

export default function LeadDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { role } = useAuth();
  const { leads, getLeadById } = useLeads();
  const leadId = params?.id as string;
  const existingLead = leads.find((l) => l.id === leadId) || null;
  const [lead, setLead] = useState<Lead | null>(existingLead);
  const [loading, setLoading] = useState(!existingLead);

  useEffect(() => {
    async function loadLead() {
      if (!leadId) return;
      if (!lead) setLoading(true);
      const data = await getLeadById(leadId);
      setLead(data);
      setLoading(false);
    }
    loadLead();
  }, [leadId, getLeadById]);

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse p-4">
        <div className="h-8 w-48 bg-muted/60 rounded-xl" />
        <div className="h-20 w-full bg-muted/40 rounded-2xl" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="h-64 bg-muted/40 rounded-2xl" />
          <div className="h-64 bg-muted/40 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!lead) {
    return (
      <ErrorState
        title="Lead Record Not Found"
        message={`No lead record matches ID "${leadId}".`}
        onRetry={() => router.push("/leads")}
      />
    );
  }

  const getStageAction = () => {
    switch (lead.currentDepartment) {
      case "marketing":
      case "communication":
        return {
          label: "Open in Communication",
          href: "/communication",
          icon: <Phone className="w-3.5 h-3.5" />,
        };
      case "vigilance":
        return {
          label: "Open in Vigilance",
          href: "/vigilance",
          icon: <ShieldCheck className="w-3.5 h-3.5" />,
        };
      case "support":
        return {
          label: "Open in Support",
          href: "/support",
          icon: <Headphones className="w-3.5 h-3.5" />,
        };
      case "sales":
        return {
          label: "Open in Sales Queue",
          href: "/sales",
          icon: <TrendingUp className="w-3.5 h-3.5" />,
        };
      case "claimed":
        return {
          label: "Deal Completed",
          href: "/sales",
          icon: <Award className="w-3.5 h-3.5" />,
        };
      default:
        return {
          label: "View in Pipeline",
          href: "/leads",
          icon: <ArrowLeft className="w-3.5 h-3.5" />,
        };
    }
  };

  const action = getStageAction();

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/leads">
            <Button variant="ghost" size="sm" leftIcon={<ArrowLeft className="w-4 h-4" />}>
              Back to Leads
            </Button>
          </Link>
          <div className="h-4 w-px bg-border hidden sm:block" />
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">
              {lead.name}
            </h1>
            <span className="font-mono text-[12px] text-muted-foreground bg-muted/80 px-2.5 py-0.5 rounded-md border border-border">
              {lead.leadCode}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <DepartmentBadge department={lead.currentDepartment} />
          <StatusBadge status={lead.status} />
          <Link href={action.href}>
            <Button size="sm" variant="primary" leftIcon={action.icon}>
              {action.label}
            </Button>
          </Link>
        </div>
      </div>

      {/* Bento Row 1: Workflow Progression Stepper Banner */}
      <BentoCard
        title="Sequential Workflow Lifecycle"
        description="Active progression through the 5-stage qualification pipeline"
        badge={
          <span className="text-[11px] font-mono text-primary bg-primary/10 px-2 py-0.5 rounded-md font-semibold">
            Stage Progression
          </span>
        }
      >
        <WorkflowStepper currentDepartment={lead.currentDepartment} />
      </BentoCard>

      {/* Bento Row 2: 12-Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6">
        {/* Left Column (6 cols): Prospect & Contact Info */}
        <div className="lg:col-span-6 space-y-5 sm:space-y-6">
          <BentoCard title="Prospect & Contact Details" description="Primary account contact information">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-[13.5px]">
              <div className="p-3.5 rounded-xl border border-border/80 bg-muted/30 space-y-1">
                <span className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider block">
                  Lead Name
                </span>
                <p className="font-semibold text-foreground text-[14.5px]">{lead.name}</p>
                <span className="font-mono text-muted-foreground text-[12px]">{lead.leadCode}</span>
              </div>

              <div className="p-3.5 rounded-xl border border-border/80 bg-muted/30 space-y-1">
                <span className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider block">
                  Contact Number
                </span>
                <p className="font-mono font-semibold text-foreground text-[14.5px] flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                  {lead.contactNumber}
                </p>
                <span className="text-[11px] font-mono text-muted-foreground">Immutable Field</span>
              </div>

              <div className="sm:col-span-2 p-3.5 rounded-xl border border-border/80 bg-muted/30 space-y-1">
                <span className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider block">
                  Postal Address
                </span>
                <p className="text-foreground text-[13.5px]">
                  {lead.postalAddress ? (
                    <>
                      {lead.postalAddress}, {lead.city}, {lead.state} {lead.pincode && `- ${lead.pincode}`}
                    </>
                  ) : (
                    <span className="text-muted-foreground italic">Address pending outreach completion</span>
                  )}
                </p>
              </div>

              <div className="sm:col-span-2 p-3.5 rounded-xl border border-border/80 bg-muted/30 space-y-1">
                <span className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider block">
                  Lead Origin & Remarks
                </span>
                <p className="text-muted-foreground text-[13px] leading-relaxed">
                  {lead.remark || "Direct inbound inquiry."}
                </p>
              </div>
            </div>
          </BentoCard>

          {/* Department Stage Checkpoints */}
          <BentoCard title="Department Verification Checkpoints" description="Stage outputs and confirmed metadata">
            <div className="space-y-3 text-[13px]">
              {/* Meeting Scheduled Details */}
              <div className="p-3.5 rounded-xl border border-border/80 bg-muted/30 space-y-1">
                <div className="flex justify-between items-center mb-1">
                  <span className="font-semibold text-foreground flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-indigo-500" />
                    Communication Meeting Slot
                  </span>
                  {lead.communicationDetails?.scheduledDate ? (
                    <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md font-semibold">
                      Confirmed
                    </span>
                  ) : (
                    <span className="text-[11px] font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded-md">
                      Pending
                    </span>
                  )}
                </div>
                <p className="font-mono text-muted-foreground text-[12.5px]">
                  {lead.communicationDetails?.scheduledDate
                    ? `${lead.communicationDetails.scheduledDate} at ${lead.communicationDetails.scheduledTime}`
                    : "No meeting scheduled yet."}
                </p>
              </div>

              {/* Support 3-Point Checklist */}
              <div className="p-3.5 rounded-xl border border-border/80 bg-muted/30 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-foreground flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-teal-500" />
                    Support 3-Point Verification
                  </span>
                  <span className="text-[11px] font-mono text-muted-foreground">
                    {lead.supportDetails?.allocatedTo ? `Allocated to ${lead.supportDetails.allocatedTo}` : "Unallocated"}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 pt-1 font-mono text-[11.5px] text-center">
                  <div className={`p-1.5 rounded-lg border ${lead.supportDetails?.verification?.isDateVerified ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" : "bg-muted text-muted-foreground border-border"}`}>
                    Date: {lead.supportDetails?.verification?.isDateVerified ? "✓" : "—"}
                  </div>
                  <div className={`p-1.5 rounded-lg border ${lead.supportDetails?.verification?.isTimeVerified ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" : "bg-muted text-muted-foreground border-border"}`}>
                    Time: {lead.supportDetails?.verification?.isTimeVerified ? "✓" : "—"}
                  </div>
                  <div className={`p-1.5 rounded-lg border ${lead.supportDetails?.verification?.isAddressVerified ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" : "bg-muted text-muted-foreground border-border"}`}>
                    Address: {lead.supportDetails?.verification?.isAddressVerified ? "✓" : "—"}
                  </div>
                </div>
              </div>
            </div>
          </BentoCard>

          {/* AI Lead Intelligence Panel */}
          <LeadInsightPanel leadId={lead.id} />
        </div>

        {/* Right Column (6 cols): Audio Player & Audit Timeline */}
        <div className="lg:col-span-6 space-y-5 sm:space-y-6">
          {/* Audio Compliance Player */}
          <BentoCard
            title="Compliance Voice Recording"
            description="Vigilance call verification record with audio gating"
          >
            {lead.vigilanceDetails?.audio ? (
              <div className="space-y-3">
                <AudioPlayer
                  src={lead.vigilanceDetails.audio.url}
                  fileName={lead.vigilanceDetails.audio.fileName}
                  fileSize={lead.vigilanceDetails.audio.fileSize}
                  durationSeconds={lead.vigilanceDetails.audio.duration || 180}
                  isCompleted={lead.salesDetails?.audioListenCompleted || lead.currentDepartment === "claimed"}
                  requiredForAction="Claim Lead"
                />
              </div>
            ) : (
              <div className="p-6 text-center text-[13px] text-muted-foreground border border-dashed border-border rounded-xl bg-muted/20">
                <p>Voice recording not yet uploaded for this lead.</p>
                <p className="text-[12px] text-muted-foreground/80 mt-0.5">Recording will be attached in Stage 3 (Vigilance).</p>
              </div>
            )}
          </BentoCard>

          {/* AI Audio Transcription & Dialogue Intelligence */}
          <AudioIntelligencePanel
            leadId={lead.id}
            hasAudio={Boolean(lead.vigilanceDetails?.audio)}
          />

          {/* Role-Specific AI Copilots */}
          {(role === "SALES" || role === "ADMIN" || lead.currentDepartment === "sales") && (
            <SalesCopilot leadId={lead.id} />
          )}

          {(role === "VIGILANCE" || role === "ADMIN" || lead.currentDepartment === "vigilance") && (
            <VigilanceCopilot leadId={lead.id} />
          )}

          {(role === "SUPPORT" || role === "ADMIN" || lead.currentDepartment === "support") && (
            <SupportCopilot leadId={lead.id} />
          )}

          {/* Lifecycle History / Audit Timeline */}
          <BentoCard
            title="Audit Lifecycle Timeline"
            description="Immutable record of sequential stage handoffs"
          >
            <WorkflowTimeline history={lead.workflowHistory} />
          </BentoCard>
        </div>
      </div>
    </div>
  );
}
