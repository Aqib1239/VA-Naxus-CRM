import * as React from "react";
import { WorkflowHistoryItem } from "@/types/leads";
import { DepartmentBadge } from "./status-badge";
import { RoleBadge } from "./role-badge";
import { formatDateTime } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { Circle } from "lucide-react";

interface WorkflowTimelineProps {
  history: WorkflowHistoryItem[];
  className?: string;
}

export function WorkflowTimeline({ history, className }: WorkflowTimelineProps) {
  if (!history || history.length === 0) {
    return (
      <div className="text-ui-sm text-muted-foreground py-4 italic">
        No workflow history recorded yet.
      </div>
    );
  }

  const sortedHistory = [...history].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  return (
    <div className={cn("relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-3 before:bottom-3 before:w-px before:bg-border", className)}>
      {sortedHistory.map((item, index) => {
        const isLatest = index === 0;

        return (
          <div key={item.id || index} className="relative">
            {/* Timeline Dot */}
            <div
              className={cn(
                "absolute -left-6 top-1.5 w-5 h-5 rounded-full bg-card border flex items-center justify-center transition-all shadow-neu-raised-sm",
                isLatest
                  ? "border-primary ring-4 ring-primary/20"
                  : "border-border/80 text-muted-foreground"
              )}
            >
              <div className={cn("w-2 h-2 rounded-full", isLatest ? "bg-primary" : "bg-muted-foreground/40")} />
            </div>

            {/* Content Card */}
            <div className="bg-card border border-border/80 rounded-2xl m-1 p-3 shadow-neu-raised space-y-2.5 transition-all hover:shadow-neu-btn-hover">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-semibold text-foreground">
                    {item.action}
                  </h4>
                  <DepartmentBadge department={item.department} showIcon={false} className="py-0.5 text-2xs px-2" />
                </div>
                <time className="text-xs font-mono text-muted-foreground tabular-nums">
                  {formatDateTime(item.timestamp)}
                </time>
              </div>

              <p className="text-ui-sm text-muted-foreground leading-relaxed break-words [overflow-wrap:anywhere]">
                {item.description}
              </p>

              <div className="flex items-center gap-2 pt-2 border-t border-border/60 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">{item.userName}</span>
                <span>•</span>
                <RoleBadge role={item.userRole} size="sm" />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
