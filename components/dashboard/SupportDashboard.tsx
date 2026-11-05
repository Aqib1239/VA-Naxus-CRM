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
import { Headphones, ClipboardCheck, UserCheck, TrendingUp, CheckCircle2, ArrowRight, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export function SupportDashboard() {
  const { user } = useAuth();
  const { leads, stats, isLoading } = useLeads();

  const activeStats = stats || (leads.length > 0 ? LeadsService.computeStatsFromLeads(leads) : null);

  if ((isLoading && leads.length === 0) || !activeStats) return <DashboardSkeleton />;

  const supportLeads = leads.filter((l) => l.currentDepartment === "support");

  // Fully verified (all 3 checks done) but not yet allocated
  const readyToAllocate = supportLeads.filter((l) => {
    const v = l.supportDetails?.verification;
    return v && v.isDateVerified && v.isTimeVerified && v.isAddressVerified && !l.supportDetails?.allocatedTo;
  });

  // Allocated to someone
  const allocated = supportLeads.filter((l) => !!l.supportDetails?.allocatedTo);

  // Incomplete checks
  const pendingVerif = supportLeads.filter((l) => {
    const v = l.supportDetails?.verification;
    return !v || !(v.isDateVerified && v.isTimeVerified && v.isAddressVerified);
  });

  const recentSupport = [...supportLeads]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 6);

  const activityEvents = buildActivityEvents(
    leads.filter((l) => l.currentDepartment === "support"),
    6
  );

  const supportMetrics = [
    {
      label: "Support Queue",
      value: supportLeads.length,
      sublabel: "In operational queue",
      icon: <Headphones className="w-4 h-4 text-teal-500" />,
      highlight: true,
    },
    {
      label: "Ready to Allocate",
      value: readyToAllocate.length,
      sublabel: "3-point verified",
      icon: <ClipboardCheck className="w-4 h-4 text-emerald-500" />,
      trend: readyToAllocate.length > 0 ? { value: "Ready", isPositive: true } : undefined,
    },
    {
      label: "Pending Checklist",
      value: pendingVerif.length,
      sublabel: "Checks in progress",
      icon: <CheckCircle2 className="w-4 h-4 text-amber-500" />,
    },
    {
      label: "Active in Sales",
      value: activeStats.salesCount,
      sublabel: "Assigned to executives",
      icon: <TrendingUp className="w-4 h-4 text-purple-500" />,
    },
  ];

  return (
    <div className="space-y-6 pb-12">
      {/* Workspace Header */}
      <PageHeader
        title="Allocation Workspace"
        description="Stage 4: Complete the 3-point verification checklist (Date, Time, Address) and assign qualified leads to Sales Executives."
        badge={<RoleBadge role="SUPPORT" />}
      >
        <Link href="/support">
          <Button size="md" rightIcon={<ArrowRight className="w-4 h-4" />}>
            Open Support Queue
          </Button>
        </Link>
      </PageHeader>

      {/* Bento Row 1: KPI Telemetry */}
      <BentoCard
        title="Allocation Telemetry"
        description="3-point checklist completion rate, ready accounts, and executive distribution"
      >
        <BentoKpiRow metrics={supportMetrics} />
      </BentoCard>

      {/* Ready-to-Allocate Banner if any */}
      {readyToAllocate.length > 0 && (
        <div className="rounded-2xl border border-emerald-200/80 dark:border-emerald-900/40 bg-emerald-500/5 dark:bg-emerald-950/20 p-4.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0 border border-emerald-500/20">
              <Sparkles className="w-4.5 h-4.5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">
                {readyToAllocate.length} Leads 3-Point Verified & Ready for Assignment
              </p>
              <p className="text-ui-sm text-muted-foreground">
                Date, time slot, and postal address confirmed. Ready to hand off to Sales Executives.
              </p>
            </div>
          </div>
          <Link href="/support">
            <Button size="sm" variant="success" className="text-ui-sm h-8 px-3">
              Allocate Now
            </Button>
          </Link>
        </div>
      )}

      {/* Bento Row 2: Support Queue (8 cols) & Verification Breakdown (4 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6">
        {/* Left 8 Cols: Primary Support Queue */}
        <div className="lg:col-span-8">
          <BentoQueueTable
            leads={recentSupport}
            title="Support Queue"
            description="Accounts awaiting 3-point checklist confirmation and sales rep allocation"
            viewAllHref="/support"
            showDepartment={false}
            emptyMessage="Support queue is clear. All leads have been allocated to the Sales team."
            actionLabel="Allocate"
            onRowActionHref={() => "/support"}
          />
        </div>

        {/* Right 4 Cols: 3-Point Checklist Status Overview */}
        <div className="lg:col-span-4 space-y-5">
          <BentoCard
            title="3-Point Checklist Status"
            description="Verification state of active leads"
            noPadding
          >
            {supportLeads.length === 0 ? (
              <div className="p-6 text-center text-ui-sm text-muted-foreground">
                No active leads in support.
              </div>
            ) : (
              <div className="divide-y divide-border/60">
                {supportLeads.slice(0, 5).map((lead) => {
                  const v = lead.supportDetails?.verification;
                  const isDone = v && v.isDateVerified && v.isTimeVerified && v.isAddressVerified;
                  const completedCount = (v?.isDateVerified ? 1 : 0) + (v?.isTimeVerified ? 1 : 0) + (v?.isAddressVerified ? 1 : 0);

                  return (
                    <div key={lead.id} className="p-4 hover:bg-muted/30 transition-colors">
                      <div className="flex items-center justify-between gap-2">
                        <Link href={`/leads/${lead.id}`} className="font-semibold text-foreground hover:text-primary transition-colors text-ui-sm truncate">
                          {lead.name}
                        </Link>
                        <span
                          className={cn(
                            "font-mono text-2xs px-2 py-0.5 rounded-md font-semibold border",
                            isDone
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                              : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                          )}
                        >
                          {completedCount}/3 Checks
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-xs font-mono text-muted-foreground">
                        <span>{lead.leadCode}</span>
                        <span>{lead.supportDetails?.allocatedTo || "Unallocated"}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </BentoCard>
        </div>
      </div>

      {/* Bento Row 3: Support Activity Spine */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6">
        <div className="lg:col-span-12">
          <BentoActivityTimeline
            events={activityEvents}
            title="Support Operations Activity Stream"
            description="Real-time log of 3-point checklist completions and executive allocations"
          />
        </div>
      </div>
    </div>
  );
}
