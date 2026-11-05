import * as React from "react";
import { cn } from "@/lib/utils";
import { Loader2, AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "./button";

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-muted/70", className)}
      {...props}
    />
  );
}

export function TableSkeleton({ rows = 5, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="w-full space-y-2.5 p-4">
      <div className="flex items-center justify-between pb-2 border-b border-border/40">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-8 w-32" />
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 py-2">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className="h-7 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="rounded-2xl border border-border/80 bg-card p-5 space-y-4 shadow-neu-raised">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-28 rounded-lg" />
        <Skeleton className="h-8 w-8 rounded-xl" />
      </div>
      <Skeleton className="h-8 w-20 rounded-lg" />
      <Skeleton className="h-3 w-40 rounded-lg" />
    </div>
  );
}

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({
  title = "Unable to load record",
  message = "The requested CRM record or dataset could not be retrieved. Check your network connection or verify authorization.",
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <div
      className={cn(
        "flex min-h-[280px] flex-col items-center justify-center rounded-2xl border border-destructive/30 bg-destructive/5 shadow-neu-raised p-8 text-center",
        className
      )}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-card border border-destructive/30 text-destructive mb-3.5 shadow-neu-btn">
        <AlertTriangle className="h-6 w-6" />
      </div>
      <h3 className="text-base font-semibold text-foreground tracking-tight">{title}</h3>
      <p className="mt-1 max-w-sm text-ui-sm text-muted-foreground leading-relaxed">
        {message}
      </p>
      {onRetry && (
        <Button
          size="sm"
          variant="outline"
          onClick={onRetry}
          aria-label="Retry loading CRM data"
          leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
          className="mt-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Retry Request
        </Button>
      )}
    </div>
  );
}
