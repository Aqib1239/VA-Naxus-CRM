/**
 * Premium Bento-Style Dashboard Primitives — Vibh-Anu CRM
 * 
 * Reusable components powering all 6 role-specific Bento workspaces
 * (Admin, Marketing, Communication, Vigilance, Support, Sales).
 */
"use client";

import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { DepartmentBadge, StatusBadge } from "@/components/ui/status-badge";
import { CardSkeleton, TableSkeleton } from "@/components/ui/loading-state";
import { formatDateTime, getInitials } from "@/lib/utils";
import { Lead, DashboardStats, WorkflowHistoryItem } from "@/types/leads";
import { 
  ArrowRight, 
  ArrowUpRight, 
  ArrowDownRight, 
  CheckCircle2, 
  Clock, 
  Sparkles,
  AlertCircle
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, useReducedMotion } from "framer-motion";

// ─────────────────────────────────────────────────────────────────────────────
// 1. Dashboard Skeleton (Bento Layout)
// ─────────────────────────────────────────────────────────────────────────────
export function DashboardSkeleton({ kpiCount = 4 }: { kpiCount?: number } = {}) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="h-8 w-64 bg-muted/60 animate-pulse rounded-xl" />
        <div className="h-4 w-96 bg-muted/50 animate-pulse rounded-md" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
        <div className="md:col-span-8 h-40 bg-muted/50 animate-pulse rounded-2xl" />
        <div className="md:col-span-4 h-40 bg-muted/50 animate-pulse rounded-2xl" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-8 h-96 bg-muted/40 animate-pulse rounded-2xl" />
        <div className="lg:col-span-4 h-96 bg-muted/40 animate-pulse rounded-2xl" />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Bento Card (Base Container)
// ─────────────────────────────────────────────────────────────────────────────
export interface BentoCardProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  description?: string;
  badge?: React.ReactNode;
  action?: React.ReactNode;
  noPadding?: boolean;
}

export function BentoCard({
  title,
  description,
  badge,
  action,
  children,
  className,
  noPadding = false,
  ...props
}: BentoCardProps) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
      animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "rounded-2xl border border-border/80 dark:border-border/50 bg-card text-card-foreground shadow-neu-raised transition-all duration-200 ease-out hover:shadow-neu-raised-lg flex flex-col justify-between overflow-hidden",
        className
      )}
      {...(props as any)}
    >
      {(title || action || badge) && (
        <div className="flex items-center justify-between p-5 sm:p-6 border-b border-border/50 gap-3">
          <div>
            <div className="flex items-center gap-2.5">
              {title && (
                <h3 className="text-[16px] font-semibold leading-tight text-foreground tracking-tight">
                  {title}
                </h3>
              )}
              {badge}
            </div>
            {description && (
              <p className="text-[13px] text-muted-foreground mt-0.5 leading-relaxed">
                {description}
              </p>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div className={cn(!noPadding && "p-5 sm:p-6", "flex-1")}>{children}</div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Compact Bento KPI Block
// ─────────────────────────────────────────────────────────────────────────────
export interface BentoMetric {
  label: string;
  value: string | number;
  sublabel?: string;
  icon?: React.ReactNode;
  trend?: { value: string; isPositive?: boolean };
  highlight?: boolean;
}

export function BentoKpiRow({ metrics }: { metrics: BentoMetric[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 w-full">
      {metrics.map((m, idx) => (
        <div
          key={idx}
          className={cn(
            "p-4 sm:p-5 rounded-2xl border transition-all duration-200 flex flex-col justify-between",
            m.highlight
              ? "border-primary/30 bg-primary/5 dark:bg-primary/10 shadow-neu-raised-sm ring-1 ring-primary/20"
              : "border-border/80 dark:border-border/50 bg-card shadow-neu-raised-sm hover:shadow-neu-raised"
          )}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[13px] font-medium text-muted-foreground truncate">{m.label}</span>
            {m.icon && (
              <div className="h-8 w-8 rounded-xl bg-muted/60 dark:bg-muted/40 shadow-neu-inset-sm flex items-center justify-center text-muted-foreground shrink-0 border border-border/60">
                {m.icon}
              </div>
            )}
          </div>

          <div className="space-y-1">
            <div className="text-2xl sm:text-[28px] font-semibold tracking-tight text-foreground font-mono tabular-nums leading-none">
              {m.value}
            </div>
            {(m.trend || m.sublabel) && (
              <div className="flex items-center gap-1.5 text-[12px] pt-1">
                {m.trend && (
                  <span
                    className={cn(
                      "inline-flex items-center gap-0.5 font-medium font-mono text-[11px] px-1.5 py-0.5 rounded-md",
                      m.trend.isPositive !== false
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                        : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20"
                    )}
                  >
                    {m.trend.isPositive !== false ? (
                      <ArrowUpRight className="h-3 w-3" />
                    ) : (
                      <ArrowDownRight className="h-3 w-3" />
                    )}
                    {m.trend.value}
                  </span>
                )}
                {m.sublabel && (
                  <span className="text-muted-foreground text-[12px] truncate">
                    {m.sublabel}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Primary Work Queue Table (High Information Density)
// ─────────────────────────────────────────────────────────────────────────────
interface BentoQueueTableProps {
  leads: Lead[];
  title?: string;
  description?: string;
  viewAllHref?: string;
  showDepartment?: boolean;
  emptyMessage?: string;
  actionLabel?: string;
  onRowActionHref?: (lead: Lead) => string;
}

export function BentoQueueTable({
  leads,
  title = "Active Work Queue",
  description = "Sequential pipeline items requiring action",
  viewAllHref,
  showDepartment = true,
  emptyMessage = "No active leads in this queue.",
  actionLabel = "View",
  onRowActionHref,
}: BentoQueueTableProps) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <BentoCard
      title={title}
      description={description}
      noPadding
      action={
        viewAllHref && (
          <Link href={viewAllHref}>
            <Button variant="ghost" size="sm" rightIcon={<ArrowRight className="w-3.5 h-3.5" />} className="h-8 text-[13px]">
              View All
            </Button>
          </Link>
        )
      }
    >
      {leads.length === 0 ? (
        <div className="p-8 text-center text-[13.5px] text-muted-foreground flex flex-col items-center justify-center gap-2">
          <div className="h-10 w-10 rounded-full bg-muted/60 flex items-center justify-center text-muted-foreground">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <p>{emptyMessage}</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-muted-foreground font-mono text-[12px] uppercase tracking-wider">
                <th className="py-3 px-5 font-semibold">Lead Prospect</th>
                <th className="py-3 px-5 font-semibold">Contact</th>
                {showDepartment && <th className="py-3 px-5 font-semibold">Department</th>}
                <th className="py-3 px-5 font-semibold">Status</th>
                <th className="py-3 px-5 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <motion.tbody
              initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
              animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="divide-y divide-border/60"
            >
              {leads.map((lead) => {
                const targetHref = onRowActionHref ? onRowActionHref(lead) : `/leads/${lead.id}`;
                return (
                  <tr key={lead.id} className="hover:bg-muted/30 transition-colors group">
                    <td className="py-3.5 px-5">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold font-mono text-[12px] shrink-0 border border-primary/20">
                          {getInitials(lead.name)}
                        </div>
                        <div className="min-w-0">
                          <Link
                            href={`/leads/${lead.id}`}
                            className="font-semibold text-foreground hover:text-primary transition-colors truncate block text-[14px]"
                          >
                            {lead.name}
                          </Link>
                          <span className="text-[12px] font-mono text-muted-foreground">
                            {lead.leadCode}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-5 font-mono text-foreground/80 text-[13px]">
                      {lead.contactNumber}
                    </td>
                    {showDepartment && (
                      <td className="py-3.5 px-5">
                        <DepartmentBadge department={lead.currentDepartment} />
                      </td>
                    )}
                    <td className="py-3.5 px-5">
                      <StatusBadge status={lead.status} />
                    </td>
                    <td className="py-3.5 px-5 text-right">
                      <Link href={targetHref}>
                        <Button size="sm" variant="outline" className="h-8 text-[13px] px-3">
                          {actionLabel}
                        </Button>
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </motion.tbody>
          </table>
        </div>
      )}
    </BentoCard>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Department Workload Matrix (Visual Distribution Bars)
// ─────────────────────────────────────────────────────────────────────────────
export function BentoWorkloadMatrix({ stats }: { stats: DashboardStats }) {
  const depts = [
    { label: "Marketing", count: stats.marketingCount, color: "bg-blue-500", href: "/marketing" },
    { label: "Communication", count: stats.communicationCount, color: "bg-indigo-500", href: "/communication" },
    { label: "Vigilance", count: stats.vigilanceCount, color: "bg-amber-500", href: "/vigilance" },
    { label: "Support", count: stats.supportCount, color: "bg-teal-500", href: "/support" },
    { label: "Sales Queue", count: stats.salesCount, color: "bg-purple-500", href: "/sales" },
    { label: "Claimed Deals", count: stats.claimedCount, color: "bg-emerald-500", href: "/leads" },
  ];

  return (
    <BentoCard
      title="Department Load Matrix"
      description="Active queue distribution across the organization"
    >
      <div className="space-y-3.5">
        {depts.map((d) => {
          const percent = stats.totalLeads > 0 ? Math.round((d.count / stats.totalLeads) * 100) : 0;
          return (
            <div key={d.label} className="space-y-1.5">
              <div className="flex justify-between items-center text-[13px]">
                <Link href={d.href} className="font-medium text-foreground hover:text-primary transition-colors">
                  {d.label}
                </Link>
                <span className="font-mono text-muted-foreground tabular-nums text-[12px]">
                  {d.count} ({percent}%)
                </span>
              </div>
              <div className="h-2.5 w-full bg-muted/80 dark:bg-muted/50 shadow-neu-inset-sm rounded-full overflow-hidden p-[2px]">
                <div
                  className={`h-full ${d.color} transition-all duration-300 rounded-full shadow-xs`}
                  style={{ width: `${percent}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </BentoCard>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Bento Activity Timeline (Subtle Vertical Audit Spine)
// ─────────────────────────────────────────────────────────────────────────────
export interface ActivityEvent extends WorkflowHistoryItem {
  leadName: string;
  leadCode: string;
  leadId: string;
}

export function BentoActivityTimeline({
  events,
  title = "Audit Timeline",
  description = "Real-time immutable lifecycle events",
}: {
  events: ActivityEvent[];
  title?: string;
  description?: string;
}) {
  return (
    <BentoCard title={title} description={description}>
      {events.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">No recent activity recorded.</p>
      ) : (
        <div className="space-y-4">
          {events.map((event, idx) => (
            <div key={idx} className="flex items-start gap-3 border-b border-border/40 pb-3.5 last:border-0 last:pb-0">
              <div className="h-7 w-7 rounded-xl bg-muted/60 dark:bg-muted/40 text-primary shadow-neu-inset-sm flex items-center justify-center font-bold text-[10.5px] shrink-0 font-mono mt-0.5 border border-border/60">
                {event.userName ? getInitials(event.userName) : "VA"}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1">
                  <span className="font-semibold text-foreground text-[13px] truncate">
                    {event.action}
                  </span>
                  <time className="text-[11px] font-mono text-muted-foreground shrink-0 tabular-nums">
                    {formatDateTime(event.timestamp)}
                  </time>
                </div>
                <p className="text-[12px] text-muted-foreground line-clamp-1 mt-0.5">
                  <Link href={`/leads/${event.leadId}`} className="text-foreground font-medium hover:underline">
                    {event.leadName}
                  </Link>{" "}
                  <span className="font-mono text-[11px]">({event.leadCode})</span>
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </BentoCard>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Attention & Alert Banner
// ─────────────────────────────────────────────────────────────────────────────
export function BentoAlertBanner({
  items,
}: {
  items: { label: string; count: number; href: string }[];
}) {
  if (items.length === 0) return null;

  return (
    <div className="rounded-2xl border border-amber-300/80 dark:border-amber-900/40 bg-amber-500/5 dark:bg-amber-950/20 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-neu-raised-sm">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0 border border-amber-500/20 shadow-neu-inset-sm">
          <AlertCircle className="w-4.5 h-4.5" />
        </div>
        <div>
          <p className="text-[14px] font-semibold text-foreground">Pipeline Attention Required</p>
          <p className="text-[13px] text-muted-foreground">
            {items.map((d) => `${d.count} in ${d.label}`).join(" • ")}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {items.map((d) => (
          <Link key={d.label} href={d.href}>
            <Button size="sm" variant="outline" className="text-[13px] h-8 px-3">
              View {d.label} ({d.count})
            </Button>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: extract recent events from leads
// ─────────────────────────────────────────────────────────────────────────────
export function buildActivityEvents(leads: Lead[], limit = 5): ActivityEvent[] {
  return leads
    .flatMap((l) =>
      l.workflowHistory.map((item) => ({
        ...item,
        leadName: l.name,
        leadCode: l.leadCode,
        leadId: l.id,
      }))
    )
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, limit);
}
