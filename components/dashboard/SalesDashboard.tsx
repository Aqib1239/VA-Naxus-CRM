"use client";

import React from "react";
import Link from "next/link";
import { useAuth } from "@/context/auth-context";
import { useLeads } from "@/context/leads-context";
import { PageHeader } from "@/components/layout/PageHeader";
import { RoleBadge } from "@/components/ui/role-badge";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { LeadsService } from "@/services/leads.service";
import {
  DashboardSkeleton,
  BentoCard,
  BentoKpiRow,
  BentoActivityTimeline,
  buildActivityEvents,
} from "@/components/dashboard/shared";
import {
  TrendingUp,
  Headphones,
  Trophy,
  Lock,
  Unlock,
  AlertCircle,
  ArrowRight,
  Music,
  DollarSign,
  Sparkles,
} from "lucide-react";
import { getInitials, formatDateTime, cn } from "@/lib/utils";

export function SalesDashboard() {
  const { user } = useAuth();
  const { leads, stats, isLoading } = useLeads();

  const activeStats = stats || (leads.length > 0 ? LeadsService.computeStatsFromLeads(leads) : null);

  if ((isLoading && leads.length === 0) || !activeStats) return <DashboardSkeleton />;

  const salesLeads = leads.filter((l) => l.currentDepartment === "sales");
  const claimedLeads = leads.filter((l) => l.currentDepartment === "claimed");

  const audioCompleted = salesLeads.filter((l) => l.salesDetails?.audioListenCompleted === true);
  const audioPending = salesLeads.filter((l) => !l.salesDetails?.audioListenCompleted);

  const userName = user?.name || "";
  const myClaimed = claimedLeads.filter((l) => (userName ? l.salesDetails?.claimedBy?.includes(userName) : false));

  const activityEvents = buildActivityEvents(
    leads.filter((l) => l.currentDepartment === "sales" || l.currentDepartment === "claimed"),
    6
  );

  const totalDealValue = myClaimed.reduce(
    (acc, l) => acc + (l.salesDetails?.dealValue ?? 0),
    0
  );

  const salesMetrics = [
    {
      label: "Sales Queue",
      value: salesLeads.length,
      sublabel: "Allocated accounts",
      icon: <Headphones className="w-4 h-4 text-purple-500" />,
      highlight: true,
    },
    {
      label: "Ready to Claim",
      value: audioCompleted.length,
      sublabel: "Audio gate unlocked",
      icon: <Unlock className="w-4 h-4 text-emerald-500" />,
      trend: audioCompleted.length > 0 ? { value: "Unlocked", isPositive: true } : undefined,
    },
    {
      label: "Audio Locked",
      value: audioPending.length,
      sublabel: "Requires audio review",
      icon: <Lock className="w-4 h-4 text-amber-500" />,
    },
    {
      label: "My Deal Value",
      value: `₹${totalDealValue > 0 ? totalDealValue.toLocaleString("en-IN") : "0"}`,
      sublabel: `${myClaimed.length} closed deals`,
      icon: <Trophy className="w-4 h-4 text-emerald-500" />,
    },
  ];

  return (
    <div className="space-y-6 pb-12">
      {/* Workspace Header */}
      <PageHeader
        title="Conversion Workspace"
        description="Stage 5: Final qualification. Listen to the mandatory compliance voice recording to unlock and claim enterprise leads."
        badge={<RoleBadge role="SALES" />}
      >
        <Link href="/sales">
          <Button size="md" rightIcon={<ArrowRight className="w-4 h-4" />}>
            Open Sales Queue
          </Button>
        </Link>
      </PageHeader>

      {/* Bento Row 1: KPI Telemetry */}
      <BentoCard
        title="Sales & Deal Conversion Telemetry"
        description="Audio gating status, deal pipeline value, and claimed accounts"
      >
        <BentoKpiRow metrics={salesMetrics} />
      </BentoCard>

      {/* Audio Gating Alert or Ready to Claim Banner */}
      {audioCompleted.length > 0 ? (
        <div className="rounded-2xl border border-emerald-200/80 dark:border-emerald-900/40 bg-emerald-500/5 dark:bg-emerald-950/20 p-4.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0 border border-emerald-500/20">
              <Unlock className="w-4.5 h-4.5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">
                {audioCompleted.length} Leads Audio-Verified & Ready to Claim
              </p>
              <p className="text-ui-sm text-muted-foreground">
                Audio playback completed. You are authorized to claim these accounts and enter contract values.
              </p>
            </div>
          </div>
          <Link href="/sales">
            <Button size="sm" variant="success" className="text-ui-sm h-8 px-3">
              Claim Leads Now
            </Button>
          </Link>
        </div>
      ) : audioPending.length > 0 ? (
        <div className="rounded-2xl border border-amber-200/80 dark:border-amber-900/40 bg-amber-500/5 dark:bg-amber-950/20 p-4.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0 border border-amber-500/20">
              <Lock className="w-4.5 h-4.5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">
                {audioPending.length} Leads Locked by Audio Compliance Gate
              </p>
              <p className="text-ui-sm text-muted-foreground">
                You must listen to the complete voice recording before the Claim button unlocks.
              </p>
            </div>
          </div>
          <Link href="/sales">
            <Button size="sm" variant="outline" className="text-ui-sm h-8 px-3">
              Listen to Audio
            </Button>
          </Link>
        </div>
      ) : null}

      {/* Bento Row 2: Sales Queue (8 cols) & My Closed Deals (4 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6">
        {/* Left 8 Cols: Primary Sales Queue with Audio Gating Indicator */}
        <div className="lg:col-span-8">
          <BentoCard
            title="Sales Queue & Audio Gate Matrix"
            description="Leads awaiting voice review and executive closing"
            noPadding
            action={
              <Link href="/sales">
                <Button variant="ghost" size="sm" rightIcon={<ArrowRight className="w-3.5 h-3.5" />} className="h-8 text-ui-sm">
                  View Queue
                </Button>
              </Link>
            }
          >
            {salesLeads.length === 0 ? (
              <div className="p-8 text-center text-ui-sm text-muted-foreground flex flex-col items-center justify-center gap-2">
                <div className="h-10 w-10 rounded-full bg-muted/60 flex items-center justify-center text-muted-foreground">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <p>No leads currently in the Sales queue.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-border bg-muted/30 text-muted-foreground font-mono text-xs uppercase tracking-wider">
                      <th className="py-3 px-5 font-semibold">Lead Prospect</th>
                      <th className="py-3 px-5 font-semibold">Contact</th>
                      <th className="py-3 px-5 font-semibold">Audio Gate</th>
                      <th className="py-3 px-5 font-semibold">Status</th>
                      <th className="py-3 px-5 font-semibold text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {salesLeads.map((lead) => {
                      const isAudioDone = lead.salesDetails?.audioListenCompleted === true;
                      return (
                        <tr key={lead.id} className="hover:bg-muted/30 transition-colors">
                          <td className="py-3.5 px-5">
                            <div className="flex items-center gap-3">
                              <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold font-mono text-xs shrink-0 border border-primary/20">
                                {getInitials(lead.name)}
                              </div>
                              <div className="min-w-0">
                                <Link
                                  href={`/leads/${lead.id}`}
                                  className="font-semibold text-foreground hover:text-primary transition-colors truncate block text-sm"
                                >
                                  {lead.name}
                                </Link>
                                <span className="text-xs font-mono text-muted-foreground">
                                  {lead.leadCode}
                                </span>
                              </div>
                            </div>
                          </td>
                          <td className="py-3.5 px-5 font-mono text-foreground/80 text-ui-sm">
                            {lead.contactNumber}
                          </td>
                          <td className="py-3.5 px-5">
                            <span
                              className={cn(
                                "inline-flex items-center gap-1 font-mono text-2xs px-2.5 py-0.5 rounded-md font-semibold border",
                                isAudioDone
                                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                                  : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                              )}
                            >
                              {isAudioDone ? (
                                <>
                                  <Unlock className="w-3 h-3" />
                                  UNLOCKED
                                </>
                              ) : (
                                <>
                                  <Lock className="w-3 h-3" />
                                  LOCKED
                                </>
                              )}
                            </span>
                          </td>
                          <td className="py-3.5 px-5">
                            <StatusBadge status={lead.status} />
                          </td>
                          <td className="py-3.5 px-5 text-right">
                            <Link href="/sales">
                              <Button
                                size="sm"
                                variant={isAudioDone ? "success" : "outline"}
                                className="h-8 text-ui-sm px-3"
                              >
                                {isAudioDone ? "Claim Deal" : "Listen Audio"}
                              </Button>
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </BentoCard>
        </div>

        {/* Right 4 Cols: My Closed Deals Table */}
        <div className="lg:col-span-4">
          <BentoCard
            title="My Closed Deals"
            description="Accounts claimed and finalized"
            noPadding
          >
            {myClaimed.length === 0 ? (
              <div className="p-6 text-center text-ui-sm text-muted-foreground">
                No claimed deals yet. Finish audio review to claim leads.
              </div>
            ) : (
              <div className="divide-y divide-border/60">
                {myClaimed.slice(0, 5).map((lead) => (
                  <div key={lead.id} className="p-4 hover:bg-muted/30 transition-colors">
                    <div className="flex items-center justify-between gap-2">
                      <Link href={`/leads/${lead.id}`} className="font-semibold text-foreground hover:text-primary transition-colors text-ui-sm truncate">
                        {lead.name}
                      </Link>
                      <span className="font-mono text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md">
                        ₹{(lead.salesDetails?.dealValue || 350000).toLocaleString("en-IN")}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs font-mono text-muted-foreground">
                      <span>{lead.leadCode}</span>
                      <span>{formatDateTime(lead.salesDetails?.claimedAt || lead.updatedAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </BentoCard>
        </div>
      </div>

      {/* Bento Row 3: Sales Activity Timeline */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6">
        <div className="lg:col-span-12">
          <BentoActivityTimeline
            events={activityEvents}
            title="Sales Qualification & Closing Stream"
            description="Real-time log of audio listeners and deal claims"
          />
        </div>
      </div>
    </div>
  );
}
