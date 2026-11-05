"use client";

import React from "react";
import { useAuth } from "@/context/auth-context";
import { useLeads } from "@/context/leads-context";
import { useAccentTheme, ACCENT_THEMES, AccentTheme } from "@/context/accent-context";
import { PageHeader } from "@/components/layout/PageHeader";
import { BentoCard } from "@/components/dashboard/shared";
import { Button } from "@/components/ui/button";
import { RoleBadge } from "@/components/ui/role-badge";
import { ROLE_CONFIGS } from "@/constants/roles";
import { Role } from "@/types/auth";
import { 
  Shield, 
  User, 
  RotateCcw, 
  Check, 
  Palette,
  Server, 
  Sparkles,
  CheckCircle2
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function SettingsPage() {
  const { user, role } = useAuth();
  const { resetToDefaultMockData } = useLeads();
  const { accent, setAccent } = useAccentTheme();

  const allRoles: Role[] = ["ADMIN", "MARKETING", "COMMUNICATION", "VIGILANCE", "SUPPORT", "SALES"];

  const permissionsList = [
    { key: "leads:create", label: "Create Inbound Leads (Marketing)" },
    { key: "leads:read", label: "Read Lead Directory & Profiles" },
    { key: "leads:edit_communication", label: "Schedule Outreach Meetings (Communication)" },
    { key: "leads:edit_vigilance", label: "Audit Verification (Vigilance)" },
    { key: "leads:upload_audio", label: "Upload Mandatory Voice Records (Vigilance)" },
    { key: "leads:allocate_support", label: "3-Point Checklist & Allocation (Support)" },
    { key: "leads:claim_sales", label: "Listen Audio & Claim Deals (Sales)" },
    { key: "settings:manage", label: "System Administration & RBAC" },
  ];

  return (
    <div className="space-y-6 pb-12">
      {/* Page Header */}
      <PageHeader
        title="Settings & System Configuration"
        description="Configure appearance accents, inspect role-based access controls, and manage active session authentication."
      >
        <Button
          variant="outline"
          size="sm"
          onClick={resetToDefaultMockData}
          leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
        >
          Reset Demo Data
        </Button>
      </PageHeader>

      {/* Bento Grid: 12 Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6">
        {/* Left Column (6 cols): Appearance Theme & Active Profile */}
        <div className="lg:col-span-6 space-y-5 sm:space-y-6">
          {/* Accent Color Palette Selector */}
          <BentoCard
            title="Accent Color System"
            description="Personalize UI focus rings, primary action buttons, and active indicators"
            badge={
              <span className="text-2xs font-mono text-primary bg-primary/10 px-2 py-0.5 rounded-md font-semibold">
                Live Switch
              </span>
            }
          >
            <div className="space-y-3">
              <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground block">
                Select Enterprise Accent Theme
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {(Object.keys(ACCENT_THEMES) as AccentTheme[]).map((key) => {
                  const item = ACCENT_THEMES[key];
                  const isSelected = accent === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setAccent(key)}
                      className={cn(
                        "flex items-center gap-2.5 p-3 rounded-xl border text-left transition-all duration-200 select-none",
                        isSelected
                          ? "shadow-neu-inset border-primary/50 bg-primary/10 ring-1 ring-primary/40 text-primary"
                          : "shadow-neu-btn hover:shadow-neu-btn-hover active:shadow-neu-inset border-border/80 bg-card text-foreground"
                      )}
                    >
                      <span className={cn("w-4 h-4 rounded-full shrink-0 shadow-2xs", item.previewBg)} />
                      <div className="min-w-0 flex-1">
                        <span className="text-ui-sm font-semibold truncate block leading-tight">
                          {item.name}
                        </span>
                      </div>
                      {isSelected && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </BentoCard>

          {/* Active Profile & Quick Switcher */}
          <BentoCard
            title="Active User Session"
            description="Current authenticated identity and role privileges"
          >
            <div className="space-y-4 text-ui-sm">
              <div className="flex items-center justify-between p-4 rounded-2xl bg-card border border-border/80 shadow-neu-raised-sm">
                <div>
                  <h4 className="font-semibold text-foreground text-base">{user?.name}</h4>
                  <p className="text-muted-foreground text-ui-sm">{user?.email}</p>
                  <p className="text-xs text-muted-foreground font-mono mt-0.5">{user?.department}</p>
                </div>
                <RoleBadge role={user?.role || role || "ADMIN"} size="md" />
              </div>

              <div className="p-3 rounded-xl bg-muted/40 border border-border/60 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">Independent Role Access:</span> Account credentials, permissions, and departmental scopes are authoritatively managed and verified by the backend.
              </div>
            </div>
          </BentoCard>

          {/* REST API Endpoints Card */}
          <BentoCard
            title="REST API Architecture"
            description="End-to-end connected API service endpoints"
          >
            <div className="p-4 bg-muted/30 rounded-2xl border border-border/80 shadow-neu-inset-sm space-y-2.5 font-mono text-xs">
              <div className="flex justify-between items-center">
                <span className="text-foreground">POST /api/leads</span>
                <span className="text-blue-600 dark:text-blue-400 font-semibold">Marketing Create</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-foreground">POST /api/leads/:id/meeting</span>
                <span className="text-indigo-600 dark:text-indigo-400 font-semibold">Communication Schedule</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-foreground">POST /api/leads/:id/verify</span>
                <span className="text-amber-600 dark:text-amber-400 font-semibold">Vigilance & Audio</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-foreground">POST /api/leads/:id/allocate</span>
                <span className="text-teal-600 dark:text-teal-400 font-semibold">Support 3-Point Check</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-foreground">POST /api/leads/:id/claim</span>
                <span className="text-purple-600 dark:text-purple-400 font-semibold">Sales Claim Lead</span>
              </div>
            </div>
          </BentoCard>
        </div>

        {/* Right Column (6 cols): RBAC Permission Matrix */}
        <div className="lg:col-span-6">
          <BentoCard
            title="Role Permission Matrix"
            description="Departmental visibility & action authorization matrix"
            noPadding
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-ui-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-muted-foreground font-mono">
                    <th className="py-3 px-4 font-semibold text-xs uppercase tracking-wider">Permission</th>
                    <th className="py-3 px-2 font-semibold text-xs text-center">Admin</th>
                    <th className="py-3 px-2 font-semibold text-xs text-center">Mkt</th>
                    <th className="py-3 px-2 font-semibold text-xs text-center">Com</th>
                    <th className="py-3 px-2 font-semibold text-xs text-center">Vig</th>
                    <th className="py-3 px-2 font-semibold text-xs text-center">Sup</th>
                    <th className="py-3 px-2 font-semibold text-xs text-center">Sal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {permissionsList.map((perm) => (
                    <tr key={perm.key} className="hover:bg-muted/30 transition-colors">
                      <td className="py-3 px-4 font-medium text-foreground text-ui-sm">
                        {perm.label}
                      </td>
                      {allRoles.map((r) => {
                        const hasPerm = ROLE_CONFIGS[r].permissions.includes(perm.key as any);
                        return (
                          <td key={r} className="py-3 px-2 text-center">
                            {hasPerm ? (
                              <Check className="w-4 h-4 text-emerald-500 mx-auto" />
                            ) : (
                              <span className="text-muted-foreground/30 text-ui-sm">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </BentoCard>
        </div>
      </div>
    </div>
  );
}
