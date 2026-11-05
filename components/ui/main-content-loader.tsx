"use client";

import React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface MainContentLoaderProps {
  label?: string;
  description?: string;
  className?: string;
}

export function MainContentLoader({
  label = "Loading workspace...",
  description = "Retrieving pipeline telemetry and records",
  className,
}: MainContentLoaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center min-h-[calc(100vh-160px)] w-full py-16 animate-in fade-in-50 duration-150 select-none",
        className
      )}
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex flex-col items-center gap-3.5 p-6 sm:p-8 rounded-xl border border-border/70 bg-card shadow-xs max-w-sm w-full text-center">
        {/* Sleek branded loader icon */}
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary border border-primary/20 shrink-0">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>

        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground tracking-tight">
            {label}
          </p>
          {description && (
            <p className="text-xs text-muted-foreground font-sans">
              {description}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
