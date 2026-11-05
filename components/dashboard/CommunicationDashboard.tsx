"use client";

import React from "react";
import Link from "next/link";
import { useAuth } from "@/context/auth-context";
import { useLeads } from "@/context/leads-context";
import { PageHeader } from "@/components/layout/PageHeader";
import { RoleBadge } from "@/components/ui/role-badge";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  DashboardSkeleton,
  BentoCard,
  BentoKpiRow,
  BentoQueueTable,
  BentoActivityTimeline,
  buildActivityEvents,
} from "@/components/dashboard/shared";
import { LeadsService } from "@/services/leads.service";
import { MessageSquare, Phone, Calendar, Clock, ArrowRight, Lock } from "lucide-react";

export function CommunicationDashboard() {
  const { user } = useAuth();
  const { leads, stats, isLoading } = useLeads();

  const activeStats = stats || (leads.length > 0 ? LeadsService.computeStatsFromLeads(leads) : null);

  if ((isLoading && leads.length === 0) || !activeStats) return <DashboardSkeleton />;

  const commLeads = leads.filter((l) => l.currentDepartment === "communication");
  const withMeeting = commLeads.filter((l) => l.communicationDetails?.scheduledDate);
  const outreachQueue = commLeads.filter((l) => !l.communicationDetails?.scheduledDate);

  const recentComm = [...commLeads]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 6);

  const activityEvents = buildActivityEvents(
    leads.filter((l) => l.currentDepartment === "communication"),
    6
  );

  const commMetrics = [
    {
      label: "Pending Outreach",
      value: outreachQueue.length,
      sublabel: "Awaiting initial call",
      icon: <Phone className="w-4 h-4 text-indigo-500" />,
      highlight: true,
    },
    {
      label: "Meetings Scheduled",
      value: withMeeting.length,
      sublabel: "Confirmed date & time",
      icon: <Calendar className="w-4 h-4 text-blue-500" />,
    },
    {
      label: "Communication Total",
      value: commLeads.length,
      sublabel: "Current active load",
      icon: <MessageSquare className="w-4 h-4 text-muted-foreground" />,
    },
    {
      label: "Ready for Vigilance",
      value: activeStats.vigilanceCount,
      sublabel: "Transferred downstream",
      icon: <Clock className="w-4 h-4 text-amber-500" />,
    },
  ];

  return (
    <div className="space-y-6 pb-12">
      {/* Workspace Header */}
      <PageHeader
        title="Outreach Workspace"
        description="Stage 2: Establish customer contact, verify postal address, schedule client meetings, and transfer leads to Vigilance."
        badge={<RoleBadge role="COMMUNICATION" />}
      >
        <Link href="/communication">
          <Button size="md" rightIcon={<ArrowRight className="w-4 h-4" />}>
            Open Communication Queue
          </Button>
        </Link>
      </PageHeader>

      {/* Bento Row 1: KPI Telemetry */}
      <BentoCard
        title="Outreach Telemetry"
        description="Active call queue, confirmed meetings, and audit transfer velocity"
      >
        <BentoKpiRow metrics={commMetrics} />
      </BentoCard>

      {/* Bento Row 2: Primary Work Queue (8 cols) & Meeting Calendar (4 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6">
        {/* Left 8 Cols: Primary Outreach Queue */}
        <div className="lg:col-span-8">
          <BentoQueueTable
            leads={recentComm}
            title="Communication Queue"
            description="Leads requiring telephone contact and meeting scheduling"
            viewAllHref="/communication"
            showDepartment={false}
            emptyMessage="Communication queue is empty. No leads currently require outreach."
            actionLabel="Schedule"
            onRowActionHref={() => "/communication"}
          />
        </div>

        {/* Right 4 Cols: Scheduled Meetings List */}
        <div className="lg:col-span-4">
          <BentoCard
            title="Scheduled Meetings"
            description="Confirmed upcoming client meetings"
            noPadding
          >
            {withMeeting.length === 0 ? (
              <div className="p-6 text-center text-ui-sm text-muted-foreground">
                No meetings currently scheduled.
              </div>
            ) : (
              <div className="divide-y divide-border/60">
                {withMeeting.slice(0, 5).map((lead) => (
                  <div key={lead.id} className="p-4 hover:bg-muted/30 transition-colors">
                    <div className="flex items-center justify-between gap-2">
                      <Link href={`/leads/${lead.id}`} className="font-semibold text-foreground hover:text-primary transition-colors text-ui-sm truncate">
                        {lead.name}
                      </Link>
                      <span className="text-2xs font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded-md">
                        {lead.leadCode}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center justify-between text-xs font-mono text-muted-foreground">
                      <span>{lead.communicationDetails?.scheduledDate || "Date TBD"}</span>
                      <span>{lead.communicationDetails?.scheduledTime || "Time TBD"}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </BentoCard>
        </div>
      </div>

      {/* Bento Row 3: Communication Activity Spine */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6">
        <div className="lg:col-span-12">
          <BentoActivityTimeline
            events={activityEvents}
            title="Communication Activity Stream"
            description="Real-time log of scheduled appointments and address updates"
          />
        </div>
      </div>
    </div>
  );
}
