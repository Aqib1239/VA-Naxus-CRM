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
  BentoWorkloadMatrix,
  BentoActivityTimeline,
  BentoAlertBanner,
  buildActivityEvents,
} from "@/components/dashboard/shared";
import { LeadsService } from "@/services/leads.service";
import {
  Users,
  Megaphone,
  MessageSquare,
  ShieldCheck,
  Headphones,
  TrendingUp,
  Plus,
  ArrowUpRight,
  Sparkles,
} from "lucide-react";

export function AdminDashboard() {
  const { user } = useAuth();
  const { leads, stats, isLoading } = useLeads();
  const [greeting, setGreeting] = React.useState("Welcome");

  React.useEffect(() => {
    const h = new Date().getHours();
    if (h < 12) setGreeting("Good morning");
    else if (h < 17) setGreeting("Good afternoon");
    else setGreeting("Good evening");
  }, []);

  const activeStats = stats || (leads.length > 0 ? LeadsService.computeStatsFromLeads(leads) : null);

  if ((isLoading && leads.length === 0) || !activeStats) return <DashboardSkeleton />;

  const recentLeads = [...leads]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 6);

  const allEvents = buildActivityEvents(leads, 6);

  const pendingAttention = [
    { label: "Vigilance", count: activeStats.vigilanceCount, href: "/vigilance" },
    { label: "Support", count: activeStats.supportCount, href: "/support" },
    { label: "Sales", count: activeStats.salesCount, href: "/sales" },
  ].filter((d) => d.count > 0);

  const adminKpis = [
    {
      label: "Total Leads",
      value: activeStats.totalLeads,
      trend: { value: `+${activeStats.leadsGrowthPercentage}%`, isPositive: true },
      sublabel: "Active database",
      icon: <Users className="w-4 h-4 text-primary" />,
      highlight: true,
    },
    {
      label: "Inbound & Outreach",
      value: activeStats.marketingCount + activeStats.communicationCount,
      sublabel: `${activeStats.marketingCount} Mkt • ${activeStats.communicationCount} Comm`,
      icon: <Megaphone className="w-4 h-4 text-blue-500" />,
    },
    {
      label: "Audit & Support",
      value: activeStats.vigilanceCount + activeStats.supportCount,
      sublabel: `${activeStats.vigilanceCount} Vig • ${activeStats.supportCount} Sup`,
      icon: <ShieldCheck className="w-4 h-4 text-amber-500" />,
    },
    {
      label: "Conversion Rate",
      value: `${activeStats.conversionRate}%`,
      sublabel: `${activeStats.claimedCount} deals closed`,
      icon: <TrendingUp className="w-4 h-4 text-emerald-500" />,
    },
  ];

  return (
    <div className="space-y-6 pb-12">
      {/* Page Header */}
      <PageHeader
        title={`${greeting}, ${user?.name ? user.name.split(" ")[0] : "Admin"}`}
        description="Global operational overview across lead intake, verification, allocation, and sales conversion."
        badge={<RoleBadge role="ADMIN" />}
      >
        <Link href="/marketing">
          <Button size="md" leftIcon={<Plus className="w-4 h-4" />}>
            Create Lead
          </Button>
        </Link>
      </PageHeader>

      {/* Bento Row 1: Executive KPI Strip & Workload Matrix */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6">
        {/* Left 8 Cols: Large Bento KPI Overview */}
        <div className="lg:col-span-8 flex flex-col justify-between">
          <BentoCard
            title="Executive Pipeline Metrics"
            description="High-density real-time metrics across all active operational stages"
            className="h-full"
            badge={
              <span className="text-2xs font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md font-semibold">
                Live Data
              </span>
            }
          >
            <BentoKpiRow metrics={adminKpis} />
          </BentoCard>
        </div>

        {/* Right 4 Cols: Department Load Matrix */}
        <div className="lg:col-span-4">
          <BentoWorkloadMatrix stats={activeStats} />
        </div>
      </div>

      {/* Alert Banner if any stages require immediate attention */}
      <BentoAlertBanner items={pendingAttention} />

      {/* Bento Row 2: Recent Leads Directory & Audit Stream */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6">
        {/* Left 8 Cols: Primary Lead Table */}
        <div className="lg:col-span-8">
          <BentoQueueTable
            leads={recentLeads}
            title="Global Lead Directory"
            description="Live snapshot of enterprise accounts in sequential progression"
            viewAllHref="/leads"
            showDepartment={true}
            actionLabel="Inspect"
          />
        </div>

        {/* Right 4 Cols: Real-Time Audit Timeline */}
        <div className="lg:col-span-4">
          <BentoActivityTimeline
            events={allEvents}
            title="Cross-Department Audit Spine"
            description="Real-time immutable workflow event log"
          />
        </div>
      </div>
    </div>
  );
}
