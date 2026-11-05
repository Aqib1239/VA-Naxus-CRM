"use client";

import React from "react";
import Link from "next/link";
import { ShieldAlert, ArrowLeft, Home, Briefcase } from "lucide-react";
import { Role } from "@/types/auth";
import { ROLE_CONFIGS } from "@/constants/roles";
import { Button } from "@/components/ui/button";

interface AccessRestrictedProps {
  departmentName?: string;
  requiredRoles: Role[];
  currentRole?: Role | null;
  className?: string;
}

const ROLE_DEFAULT_ROUTES: Record<Role, string> = {
  ADMIN: "/",
  MARKETING: "/marketing",
  COMMUNICATION: "/communication",
  VIGILANCE: "/vigilance",
  SUPPORT: "/support",
  SALES: "/sales",
};

export function AccessRestricted({
  departmentName = "Department Workspace",
  requiredRoles,
  currentRole,
}: AccessRestrictedProps) {
  const currentRoleConfig = currentRole ? ROLE_CONFIGS[currentRole] : null;
  const userHomeRoute = currentRole ? ROLE_DEFAULT_ROUTES[currentRole] || "/" : "/";

  return (
    <div className="flex min-h-[calc(100vh-140px)] flex-col items-center justify-center p-4 sm:p-8 text-center animate-in fade-in-50 duration-300">
      <div className="w-full max-w-md rounded-2xl border border-rose-500/30 bg-card p-6 sm:p-8 shadow-neu-raised space-y-6">
        {/* Security Alert Badge */}
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 shadow-neu-inset-sm">
          <ShieldAlert className="h-8 w-8" />
        </div>

        {/* Text Details */}
        <div className="space-y-2">
          <span className="inline-flex items-center rounded-md border border-rose-500/30 bg-rose-500/10 px-2.5 py-0.5 text-2xs font-mono font-semibold uppercase tracking-wider text-rose-600 dark:text-rose-400">
            Access Restricted
          </span>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
            {departmentName}
          </h2>
          <p className="text-ui-sm text-muted-foreground leading-relaxed">
            Your active role does not have authorization to access this department interface.
            Protected departmental workflows and customer records require elevated clearance.
          </p>
        </div>

        {/* Role Comparison Breakdown */}
        <div className="rounded-xl border border-border/80 bg-muted/40 p-4 text-xs space-y-2.5 text-left">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground font-mono">Your Current Role:</span>
            <span className="font-semibold text-foreground px-2 py-0.5 rounded bg-muted border border-border font-mono text-2xs">
              {currentRoleConfig?.name || currentRole || "Unassigned"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground font-mono">Required Clearance:</span>
            <span className="font-semibold text-rose-600 dark:text-rose-400 px-2 py-0.5 rounded bg-rose-500/10 border border-rose-500/20 font-mono text-2xs">
              {requiredRoles.join(" or ")}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
          <Link href="/" className="flex-1">
            <Button
              variant="outline"
              size="md"
              className="w-full"
              leftIcon={<Home className="h-4 w-4" />}
            >
              Dashboard
            </Button>
          </Link>

          {userHomeRoute !== "/" && (
            <Link href={userHomeRoute} className="flex-1">
              <Button
                variant="primary"
                size="md"
                className="w-full"
                leftIcon={<Briefcase className="h-4 w-4" />}
              >
                My Department
              </Button>
            </Link>
          )}
        </div>

        <p className="text-2xs text-muted-foreground/80 font-mono">
          Security Note: Departmental data and API endpoints remain protected by server-side RBAC.
        </p>
      </div>
    </div>
  );
}

