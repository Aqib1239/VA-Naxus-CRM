import * as React from "react";
import { Role } from "@/types/auth";
import { ROLE_CONFIGS } from "@/constants/roles";
import { cn } from "@/lib/utils";

interface RoleBadgeProps {
  role: Role;
  className?: string;
  size?: "sm" | "md";
}

export function RoleBadge({ role, className, size = "sm" }: RoleBadgeProps) {
  const config = ROLE_CONFIGS[role] || ROLE_CONFIGS.ADMIN;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-lg font-mono font-semibold border select-none transition-all shadow-2xs",
        config.color,
        size === "sm" ? "px-2 py-0.5 text-2xs tracking-wider" : "px-2.5 py-1 text-xs",
        className
      )}
    >
      {config.badgeLabel.toUpperCase()}
    </span>
  );
}
