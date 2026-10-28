"use client";

import React from "react";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface AiBadgeProps {
  className?: string;
  label?: string;
}

export function AiBadge({ className, label = "AI Generated" }: AiBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-violet-400/30 bg-violet-50/80 px-2 py-0.5 text-[10px] font-semibold text-violet-700 shadow-xs dark:border-violet-600/40 dark:bg-violet-950/40 dark:text-violet-300",
        className
      )}
    >
      <Sparkles className="h-2.5 w-2.5 text-violet-500 animate-pulse" />
      {label}
    </span>
  );
}
