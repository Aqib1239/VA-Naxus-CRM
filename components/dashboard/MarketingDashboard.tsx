"use client";

import React from "react";
import Link from "next/link";
import { useAuth } from "@/context/auth-context";
import { useLeads } from "@/context/leads-context";
import { PageHeader } from "@/components/layout/PageHeader";
import { RoleBadge } from "@/components/ui/role-badge";
import { Button } from "@/components/ui/button";
import {
  DashboardSkeleton,
  BentoCard,
  BentoKpiRow,
  BentoQueueTable,
  BentoActivityTimeline,
  buildActivityEvents,
} from "@/components/dashboard/shared";
import { LeadsService } from "@/services/leads.service";
import { Megaphone, Plus, Send, Users, CheckCircle2, Clock, Sparkles } from "lucide-react";

export function MarketingDashboard() {
  const { user } = useAuth();
  const { leads, stats, isLoading } = useLeads();

  const activeStats = stats || (leads.length > 0 ? LeadsService.computeStatsFromLeads(leads) : null);

  if ((isLoading && leads.length === 0) || !activeStats) return <DashboardSkeleton />;

  const myLeads = leads.filter((l) => l.currentDepartment === "marketing");
  const userName = user?.name || "";
  const dispatched = leads.filter(
    (l) => (userName && l.createdBy?.includes(userName)) || (l.createdBy === userName && l.currentDepartment !== "marketing")
  );

  const recentIntake = [...myLeads]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 6);

  const recentDispatched = leads
    .filter((l) => l.currentDepartment !== "marketing")
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 5);

  const [todayCount, setTodayCount] = React.useState(0);

  React.useEffect(() => {
    const now = new Date();
    const count = leads.filter((l) => {
      const d = new Date(l.createdAt);
      return (
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate()
      );
    }).length;
    setTodayCount(count);
  }, [leads]);

  const activityEvents = buildActivityEvents(
    leads.filter((l) => l.currentDepartment === "marketing" || (userName && l.createdBy?.includes(userName))),
    6
  );

  const marketingMetrics = [
    {
      label: "In Marketing Queue",
      value: activeStats.marketingCount,
      sublabel: "Awaiting outreach",
      icon: <Megaphone className="w-4 h-4 text-blue-500" />,
      highlight: true,
    },
    {
      label: "Intake Today",
      value: todayCount,
      sublabel: "New inbound leads",
      icon: <Clock className="w-4 h-4 text-indigo-500" />,
    },
    {
      label: "Dispatched",
      value: dispatched.length > 0 ? dispatched.length : activeStats.totalLeads - activeStats.marketingCount,
      sublabel: "Moved downstream",
      icon: <Send className="w-4 h-4 text-teal-500" />,
    },
    {
      label: "Total Pipeline",
      value: activeStats.totalLeads,
      sublabel: "Global accounts",
      icon: <Users className="w-4 h-4 text-muted-foreground" />,
    },
  ];

  return (
    <div className="space-y-6 pb-12">
      {/* Workspace Header */}
      <PageHeader
        title="Lead Intake Workspace"
        description="Stage 1: Capture inbound enterprise leads and dispatch them into the communication pipeline."
        badge={<RoleBadge role="MARKETING" />}
      >
        <Link href="/marketing">
          <Button size="md" leftIcon={<Plus className="w-4 h-4" />}>
            New Lead Intake
          </Button>
        </Link>
      </PageHeader>

      {/* Bento Row 1: KPI Overview Banner */}
      <BentoCard
        title="Marketing Telemetry"
        description="Daily intake velocity and downstream pipeline progression"
      >
        <BentoKpiRow metrics={marketingMetrics} />
      </BentoCard>

      {/* Bento Row 2: Primary Work Queue (8 cols) & Intake Actions (4 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6">
        {/* Left 8 Cols: Primary Intake Queue */}
        <div className="lg:col-span-8">
          <BentoQueueTable
            leads={recentIntake}
            title="Marketing Intake Queue"
            description="Leads currently awaiting initial dispatch to Communication"
            viewAllHref="/marketing"
            showDepartment={false}
            emptyMessage="Marketing intake queue is completely clear. All leads have been dispatched."
            actionLabel="Open Intake"
            onRowActionHref={() => "/marketing"}
          />
        </div>

        {/* Right 4 Cols: Fast Action & Dispatched Summary */}
        <div className="lg:col-span-4 space-y-5">
          {/* Quick Intake CTA Card */}
          <BentoCard
            title="Fast Lead Intake"
            description="Add high-priority prospect to queue"
          >
            <div className="space-y-4">
              <p className="text-ui-sm text-muted-foreground leading-relaxed">
                Directly register inbound inquiries with contact details to initiate automated CRM workflow.
              </p>
              <Link href="/marketing" className="block">
                <Button className="w-full justify-center" leftIcon={<Sparkles className="w-4 h-4" />}>
                  Open Lead Creator
                </Button>
              </Link>
            </div>
          </BentoCard>

          {/* Downstream Dispatch Tracker */}
          <BentoCard
            title="Recently Dispatched"
            description="Leads actively moving downstream"
          >
            <div className="space-y-3">
              {recentDispatched.map((lead) => (
                <div key={lead.id} className="flex items-center justify-between gap-2 text-ui-sm">
                  <div className="min-w-0">
                    <Link href={`/leads/${lead.id}`} className="font-medium text-foreground hover:text-primary transition-colors truncate block">
                      {lead.name}
                    </Link>
                    <span className="font-mono text-2xs text-muted-foreground">{lead.leadCode}</span>
                  </div>
                  <span className="shrink-0 text-2xs font-mono px-2 py-0.5 rounded-md border border-border bg-muted/60 capitalize font-medium">
                    {lead.currentDepartment}
                  </span>
                </div>
              ))}
            </div>
          </BentoCard>
        </div>
      </div>

      {/* Bento Row 3: Marketing Activity Timeline */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6">
        <div className="lg:col-span-12">
          <BentoActivityTimeline
            events={activityEvents}
            title="Marketing Intake & Dispatch History"
            description="Immutable record of lead entries and downstream transfers"
          />
        </div>
      </div>
    </div>
  );
}
