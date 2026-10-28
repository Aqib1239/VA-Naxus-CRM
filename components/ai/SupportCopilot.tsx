"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import {
  Headphones,
  Sparkles,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Check,
  Ban,
  ArrowRight,
} from "lucide-react";
import { aiService, SupportCopilotResult } from "@/services/ai.service";
import { AiBadge } from "./AiBadge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface SupportCopilotProps {
  leadId: string;
  className?: string;
}

export function SupportCopilot({ leadId, className }: SupportCopilotProps) {
  const [result, setResult] = useState<SupportCopilotResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const evaluate = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await aiService.getSupportCopilot(leadId);
      setResult(data);
    } catch (err: any) {
      const msg = err?.message || "Failed to evaluate support checklist.";
      setError(msg);
      toast.error("Support Copilot Error", { description: msg });
    } finally {
      setLoading(false);
    }
  };

  const StatusItem = ({ label, passed }: { label: string; passed: boolean }) => (
    <div className="flex items-center justify-between text-xs py-1 border-b border-border/40 last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      {passed ? (
        <span className="inline-flex items-center gap-1 font-bold text-emerald-600 dark:text-emerald-400">
          <Check className="h-3 w-3" /> Confirmed
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 font-bold text-red-500">
          <Ban className="h-3 w-3" /> Incomplete
        </span>
      )}
    </div>
  );

  return (
    <div
      className={cn(
        "rounded-2xl border border-border/80 bg-card p-5 shadow-neu-raised dark:shadow-none space-y-4",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-border/60">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-100 text-purple-700 shadow-neu-raised-sm dark:bg-purple-950/50 dark:text-purple-300">
            <Headphones className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">Support Copilot</h3>
            <p className="text-[11px] text-muted-foreground">
              3-point checklist audit & sales allocation readiness
            </p>
          </div>
        </div>
        <AiBadge />
      </div>

      {/* Empty State */}
      {!result && !loading && (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/40 shadow-neu-inset-sm">
            <Headphones className="h-6 w-6 text-muted-foreground/60" />
          </div>
          <p className="text-xs text-muted-foreground max-w-xs">
            Audit Date, Time, Address, and audio integrity before allocating to Sales.
          </p>
          <button
            type="button"
            onClick={evaluate}
            className="inline-flex items-center gap-2 rounded-xl bg-purple-600 px-4 py-2 text-xs font-semibold text-white shadow-neu-btn hover:bg-purple-700 active:shadow-neu-inset transition-all"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Check Allocation Readiness
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center gap-3 py-8">
          <div className="h-7 w-7 rounded-full border-2 border-purple-500/20 border-t-purple-600 animate-spin" />
          <p className="text-xs text-muted-foreground font-medium animate-pulse">
            Verifying 3-point checklist & Vigilance audit state…
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-red-700 text-xs">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <button type="button" onClick={evaluate} className="font-semibold underline">
            Retry
          </button>
        </div>
      )}

      {/* Result View */}
      {result && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3.5">
          {/* Allocation Readiness Banner */}
          <div
            className={cn(
              "flex items-center gap-3 rounded-xl border p-3.5 text-xs shadow-neu-inset-sm",
              result.readyForAllocation
                ? "border-emerald-300/80 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300"
                : "border-amber-300/80 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300"
            )}
          >
            {result.readyForAllocation ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
            )}
            <div>
              <p className="font-bold uppercase tracking-wider text-[11px]">
                {result.readyForAllocation ? "Ready for Sales Allocation" : "Allocation Blocked"}
              </p>
              <p className="text-[11px] leading-relaxed mt-0.5">{result.summary}</p>
            </div>
          </div>

          {/* 3-Point Checklist Table */}
          <div className="rounded-xl border border-border/70 bg-card p-3 shadow-neu-raised-sm">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground font-mono mb-2">
              Mandatory Gate Checklist
            </h4>
            <StatusItem label="Appointment Date Verified" passed={result.checklistStatus.dateVerified} />
            <StatusItem label="Appointment Time Slot Verified" passed={result.checklistStatus.timeVerified} />
            <StatusItem label="Postal/Physical Address Verified" passed={result.checklistStatus.addressVerified} />
            <StatusItem label="Vigilance Call Audio Attached" passed={result.checklistStatus.audioPresent} />
            <StatusItem label="Vigilance Department Completed" passed={result.checklistStatus.vigilanceCompleted} />
          </div>

          {/* Missing Requirements if any */}
          {result.missingRequirements.length > 0 && (
            <div className="rounded-xl border border-red-200/60 bg-red-50/50 dark:border-red-950 dark:bg-red-950/20 p-3 space-y-1 text-xs">
              <span className="font-bold text-red-700 dark:text-red-400 text-[11px] uppercase tracking-wider">
                Outstanding Blockers ({result.missingRequirements.length})
              </span>
              <ul className="list-disc list-inside space-y-0.5 text-red-800 dark:text-red-300 text-[11px]">
                {result.missingRequirements.map((m, idx) => (
                  <li key={idx}>{m}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Permitted Next Actions */}
          <div className="space-y-1.5">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground font-mono">
              Workflow Next Actions
            </h4>
            {result.permittedNextActions.map((act, idx) => (
              <div
                key={idx}
                className={cn(
                  "flex items-center justify-between rounded-lg border p-2.5 text-xs",
                  act.permitted
                    ? "border-emerald-200 bg-emerald-50/40 text-foreground dark:border-emerald-950"
                    : "border-border/50 bg-muted/20 text-muted-foreground opacity-60"
                )}
              >
                <div>
                  <span className="font-semibold block">{act.action}</span>
                  <span className="text-[10px] text-muted-foreground">{act.condition}</span>
                </div>
                <span
                  className={cn(
                    "text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-md",
                    act.permitted ? "bg-emerald-600 text-white" : "bg-muted text-muted-foreground"
                  )}
                >
                  {act.permitted ? "Permitted" : "Locked"}
                </span>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between pt-1 border-t border-border/50 text-[10px] text-muted-foreground">
            <span>{result.disclaimer}</span>
            <button
              type="button"
              onClick={evaluate}
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              <RefreshCw className="h-3 w-3" /> Re-check
            </button>
          </div>
        </motion.div>
      )}
    </div>
  );
}
