import * as React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "secondary" | "outline" | "success" | "warning" | "destructive" | "info" | "neutral";
  size?: "sm" | "md";
}

export function Badge({ className, variant = "default", size = "sm", ...props }: BadgeProps) {
  const variants = {
    default: "bg-primary text-primary-foreground border-primary/20 shadow-xs",
    secondary: "bg-secondary text-secondary-foreground border-border/70 shadow-2xs",
    neutral: "bg-muted/70 text-muted-foreground border-border/80 shadow-2xs",
    outline: "text-foreground border-border/80 bg-card/60 shadow-2xs",
    success: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-300/50 dark:border-emerald-800/50 shadow-2xs",
    warning: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-300/50 dark:border-amber-800/50 shadow-2xs",
    destructive: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-300/50 dark:border-rose-800/50 shadow-2xs",
    info: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-300/50 dark:border-sky-800/50 shadow-2xs",
  };

  const sizes = {
    sm: "px-2.5 py-0.5 text-2xs font-medium tracking-tight",
    md: "px-3 py-1 text-xs font-medium",
  };

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-full border transition-all select-none font-sans",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    />
  );
}
