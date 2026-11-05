import * as React from "react";
import { Department, LeadStatus } from "@/types/leads";
import { cn } from "@/lib/utils";
import { 
  Megaphone, 
  MessageSquare, 
  ShieldCheck, 
  Headphones, 
  TrendingUp, 
  CheckCircle2, 
  Clock, 
  AlertCircle 
} from "lucide-react";

interface DepartmentBadgeProps {
  department: Department;
  className?: string;
  showIcon?: boolean;
}

export function DepartmentBadge({ department, className, showIcon = true }: DepartmentBadgeProps) {
  const configs: Record<Department, { label: string; icon: React.ReactNode; styles: string }> = {
    marketing: {
      label: "Marketing",
      icon: <Megaphone className="w-3.5 h-3.5" />,
      styles: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-300/60 dark:border-blue-800/50",
    },
    communication: {
      label: "Communication",
      icon: <MessageSquare className="w-3.5 h-3.5" />,
      styles: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-300/60 dark:border-indigo-800/50",
    },
    vigilance: {
      label: "Vigilance",
      icon: <ShieldCheck className="w-3.5 h-3.5" />,
      styles: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-300/60 dark:border-amber-800/50",
    },
    support: {
      label: "Support",
      icon: <Headphones className="w-3.5 h-3.5" />,
      styles: "bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-300/60 dark:border-teal-800/50",
    },
    sales: {
      label: "Sales",
      icon: <TrendingUp className="w-3.5 h-3.5" />,
      styles: "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-300/60 dark:border-purple-800/50",
    },
    claimed: {
      label: "Claimed",
      icon: <CheckCircle2 className="w-3.5 h-3.5" />,
      styles: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-300/60 dark:border-emerald-800/50",
    },
  };

  const config = configs[department] || configs.marketing;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border select-none transition-all shadow-2xs",
        config.styles,
        className
      )}
    >
      {showIcon && <span className="shrink-0">{config.icon}</span>}
      <span>{config.label}</span>
    </span>
  );
}

interface StatusBadgeProps {
  status: LeadStatus;
  className?: string;
  showIcon?: boolean;
}

export function StatusBadge({ status, className, showIcon = true }: StatusBadgeProps) {
  const configs: Record<LeadStatus, { label: string; dotColor: string; styles: string }> = {
    new: {
      label: "New Entry",
      dotColor: "bg-blue-500 shadow-[0_0_6px_rgba(59,130,246,0.6)]",
      styles: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-300/60 dark:border-blue-800/50",
    },
    in_progress: {
      label: "In Outreach",
      dotColor: "bg-indigo-500 shadow-[0_0_6px_rgba(99,102,241,0.6)]",
      styles: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-300/60 dark:border-indigo-800/50",
    },
    meeting_scheduled: {
      label: "Meeting Scheduled",
      dotColor: "bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.6)]",
      styles: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-300/60 dark:border-amber-800/50",
    },
    verified: {
      label: "Audit Verified",
      dotColor: "bg-teal-500 shadow-[0_0_6px_rgba(20,184,166,0.6)]",
      styles: "bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-300/60 dark:border-teal-800/50",
    },
    allocated: {
      label: "Allocated to Sales",
      dotColor: "bg-purple-500 shadow-[0_0_6px_rgba(168,85,247,0.6)]",
      styles: "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-300/60 dark:border-purple-800/50",
    },
    claimed: {
      label: "Claimed & Closed",
      dotColor: "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]",
      styles: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-300/60 dark:border-emerald-800/50",
    },
    rejected: {
      label: "Disqualified",
      dotColor: "bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.6)]",
      styles: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-300/60 dark:border-rose-800/50",
    },
  };

  const config = configs[status] || configs.new;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border select-none transition-all shadow-2xs",
        config.styles,
        className
      )}
    >
      {showIcon && (
        <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", config.dotColor)} />
      )}
      <span>{config.label}</span>
    </span>
  );
}
