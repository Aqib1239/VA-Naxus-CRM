import * as React from "react";
import { cn } from "@/lib/utils";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";

interface StatCardProps {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  trend?: {
    value: string;
    isPositive?: boolean;
    label?: string;
  };
  description?: string;
  className?: string;
  onClick?: () => void;
}

export function StatCard({
  label,
  value,
  icon,
  trend,
  description,
  className,
  onClick,
}: StatCardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "rounded-2xl border border-border/80 dark:border-border/50 bg-card p-5 sm:p-6 shadow-neu-raised transition-all duration-200 ease-out hover:shadow-neu-raised-lg",
        onClick && "cursor-pointer active:shadow-neu-inset",
        className
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-ui-sm font-medium text-muted-foreground">{label}</span>
        <div className="h-9 w-9 rounded-xl bg-muted/60 dark:bg-muted/40 shadow-neu-inset-sm flex items-center justify-center text-muted-foreground shrink-0 border border-border/60">
          {icon}
        </div>
      </div>

      <div className="mt-3.5">
        <div className="text-2xl sm:text-3xl lg:text-4xl font-semibold tracking-tight text-foreground font-mono tabular-nums leading-none">
          {value}
        </div>

        {(trend || description) && (
          <div className="mt-3 flex items-center gap-2 text-xs">
            {trend && (
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 font-medium font-mono text-2xs px-1.5 py-0.5 rounded-md",
                  trend.isPositive !== false
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                    : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20"
                )}
              >
                {trend.isPositive !== false ? (
                  <ArrowUpRight className="h-3 w-3" />
                ) : (
                  <ArrowDownRight className="h-3 w-3" />
                )}
                {trend.value}
              </span>
            )}
            {description && (
              <span className="text-muted-foreground text-xs truncate">
                {description}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
