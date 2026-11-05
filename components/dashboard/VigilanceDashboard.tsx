"use client";

import React from "react";
import Link from "next/link";
import { useAuth } from "@/context/auth-context";
import { useLeads } from "@/context/leads-context";
import { PageHeader } from "@/components/layout/PageHeader";
import { RoleBadge } from "@/components/ui/role-badge";
import { Button } from "@/components/ui/button";
import { LeadsService } from "@/services/leads.service";
import {
  DashboardSkeleton,
  BentoCard,
  BentoKpiRow,
  BentoQueueTable,
  BentoActivityTimeline,
  buildActivityEvents,
} from "@/components/dashboard/shared";
import { ShieldCheck, Mic, CheckCircle2, AlertCircle, ArrowRight, Music, FileAudio } from "lucide-react";
import { cn } from "@/lib/utils";

export function VigilanceDashboard() {
  const { user } = useAuth();
  const { leads, stats, isLoading } = useLeads();

  const activeStats = stats || (leads.length > 0 ? LeadsService.computeStatsFromLeads(leads) : null);

  if ((isLoading && leads.length === 0) || !activeStats) return <DashboardSkeleton />;

  const vigilanceLeads = leads.filter((l) => l.currentDepartment === "vigilance");
  const withAudio = vigilanceLeads.filter((l) => !!l.vigilanceDetails?.audio);
  const pendingAudio = vigilanceLeads.filter((l) => !l.vigilanceDetails?.audio);

  const recentVigilance = [...vigilanceLeads]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 6);

  const activityEvents = buildActivityEvents(
    leads.filter((l) => l.currentDepartment === "vigilance"),
    6
  );

  const compliancePercent =
    vigilanceLeads.length > 0
      ? Math.round((withAudio.length / vigilanceLeads.length) * 100)
      : 100;

  const vigilanceMetrics = [
    {
      label: "Verification Queue",
      value: vigilanceLeads.length,
      sublabel: "Awaiting audit",
      icon: <ShieldCheck className="w-4 h-4 text-amber-500" />,
      highlight: true,
    },
    {
      label: "Audio Pending",
      value: pendingAudio.length,
      sublabel: "No voice record",
      icon: <Mic className="w-4 h-4 text-rose-500" />,
      trend: pendingAudio.length > 0 ? { value: "Action Required", isPositive: false } : undefined,
    },
    {
      label: "Audio Uploaded",
      value: withAudio.length,
      sublabel: "Ready for verification",
      icon: <CheckCircle2 className="w-4 h-4 text-teal-500" />,
    },
    {
      label: "Compliance Rate",
      value: `${compliancePercent}%`,
      sublabel: "Voice audit coverage",
      icon: <Music className="w-4 h-4 text-primary" />,
    },
  ];

  return (
    <div className="space-y-6 pb-12">
      {/* Workspace Header */}
      <PageHeader
        title="Verification Workspace"
        description="Stage 3: Audit lead information and attach mandatory compliance voice recordings before transferring to Support."
        badge={<RoleBadge role="VIGILANCE" />}
      >
        <Link href="/vigilance">
          <Button size="md" rightIcon={<ArrowRight className="w-4 h-4" />}>
            Open Verification Queue
          </Button>
        </Link>
      </PageHeader>

      {/* Bento Row 1: KPI Telemetry */}
      <BentoCard
        title="Vigilance & Compliance Telemetry"
        description="Audit queue depth, audio recording attachment rate, and compliance coverage"
      >
        <BentoKpiRow metrics={vigilanceMetrics} />
      </BentoCard>

      {/* Urgent Audio Missing Alert Banner if any */}
      {pendingAudio.length > 0 && (
        <div className="rounded-2xl border border-rose-200/80 dark:border-rose-900/40 bg-rose-500/5 dark:bg-rose-950/20 p-4.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 shrink-0 border border-rose-500/20">
              <AlertCircle className="w-4.5 h-4.5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">
                {pendingAudio.length} Leads Missing Mandatory Audio Recording
              </p>
              <p className="text-ui-sm text-muted-foreground">
                Audit cannot be completed without an attached call verification file.
              </p>
            </div>
          </div>
          <Link href="/vigilance">
            <Button size="sm" variant="destructive" className="text-ui-sm h-8 px-3">
              Upload Audio Now
            </Button>
          </Link>
        </div>
      )}

      {/* Bento Row 2: Verification Queue (8 cols) & Audio Evidence Tracker (4 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6">
        {/* Left 8 Cols: Primary Verification Queue */}
        <div className="lg:col-span-8">
          <BentoQueueTable
            leads={recentVigilance}
            title="Vigilance Queue"
            description="Leads awaiting voice record attachment and audit approval"
            viewAllHref="/vigilance"
            showDepartment={false}
            emptyMessage="Vigilance queue is clear. All leads have been verified and transferred to Support."
            actionLabel="Verify"
            onRowActionHref={() => "/vigilance"}
          />
        </div>

        {/* Right 4 Cols: Audio Compliance Breakdown */}
        <div className="lg:col-span-4 space-y-5">
          <BentoCard
            title="Voice Evidence Status"
            description="Audio records attached to active leads"
            noPadding
          >
            {vigilanceLeads.length === 0 ? (
              <div className="p-6 text-center text-ui-sm text-muted-foreground">
                No active leads in vigilance.
              </div>
            ) : (
              <div className="divide-y divide-border/60">
                {vigilanceLeads.slice(0, 5).map((lead) => {
                  const hasAudio = !!lead.vigilanceDetails?.audio;
                  return (
                    <div key={lead.id} className="p-4 hover:bg-muted/30 transition-colors">
                      <div className="flex items-center justify-between gap-2">
                        <Link href={`/leads/${lead.id}`} className="font-semibold text-foreground hover:text-primary transition-colors text-ui-sm truncate">
                          {lead.name}
                        </Link>
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 font-mono text-2xs px-2 py-0.5 rounded-md font-semibold border",
                            hasAudio
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                              : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20"
                          )}
                        >
                          {hasAudio ? (
                            <>
                              <FileAudio className="w-3 h-3" />
                              Attached
                            </>
                          ) : (
                            <>
                              <AlertCircle className="w-3 h-3" />
                              Missing
                            </>
                          )}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-xs font-mono text-muted-foreground">
                        <span>{lead.leadCode}</span>
                        <span>{lead.city || "Mumbai"}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </BentoCard>
        </div>
      </div>

      {/* Bento Row 3: Vigilance Audit Activity Stream */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6">
        <div className="lg:col-span-12">
          <BentoActivityTimeline
            events={activityEvents}
            title="Vigilance Audit Activity Stream"
            description="Real-time log of call recordings attached and compliance approvals"
          />
        </div>
      </div>
    </div>
  );
}
