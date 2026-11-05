"use client";

import * as React from "react";
import { useAuth } from "@/context/auth-context";
import { ROLE_CONFIGS } from "@/constants/roles";
import { cn } from "@/lib/utils";
import { Shield } from "lucide-react";

/**
 * Read-only Active Role Display
 * Dynamic credential-based role switching has been permanently removed for production security.
 * Every user operates under their own verified backend-authenticated account.
 */
export function RoleSwitcher({ className }: { className?: string }) {
  const { user, role } = useAuth();
  if (!user || !role) return null;

  const activeConfig = ROLE_CONFIGS[role];
  if (!activeConfig) return null;

  return (
    <div
      className={cn(
        "flex items-center gap-2.5 h-9 px-3 rounded-xl border border-border/80 bg-card shadow-neu-btn text-ui-sm font-medium text-foreground",
        className
      )}
    >
      <div className="flex h-5 w-5 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Shield className="w-3.5 h-3.5" />
      </div>
      <div className="flex flex-col items-start text-left">
        <span className="text-3xs text-muted-foreground uppercase tracking-wider font-mono leading-none">
          Role
        </span>
        <span className="font-semibold text-foreground text-xs leading-tight">
          {activeConfig.badgeLabel}
        </span>
      </div>
    </div>
  );
}
