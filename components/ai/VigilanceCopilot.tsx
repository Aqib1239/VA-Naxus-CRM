"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import {
  ShieldCheck,
  Sparkles,
  CheckCircle2,
  XCircle,
  AlertCircle,
  HelpCircle,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { aiService, VigilanceCopilotResult } from "@/services/ai.service";
import { AiBadge } from "./AiBadge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface VigilanceCopilotProps {
  leadId: string;
  className?: string;
}

export function VigilanceCopilot({ leadId, className }: VigilanceCopilotProps) {
  const [result, setResult] = useState<VigilanceCopilotResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const evaluate = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await aiService.getVigilanceCopilot(leadId);
      setResult(data);
    } catch (err: any) {
      const msg = err?.message || "Failed to evaluate vigilance evidence.";
      setError(msg);
      toast.error("Vigilance Copilot Error", { description: msg });
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "verified":
        return (
          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
            <CheckCircle2 className="h-3 w-3" /> Verified
          </span>
        );
      case "failed":
        return (
          <span className="inline-flex items-center gap-1 rounded-md bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-800 dark:bg-red-950 dark:text-red-300">
            <XCircle className="h-3 w-3" /> Failed
          </span>
        );
      case "incomplete":
        return (
          <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
            <AlertCircle className="h-3 w-3" /> Incomplete
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
            <HelpCircle className="h-3 w-3" /> Inconclusive
          </span>
        );
    }
  };

  const getOverallFindingBadge = (finding: string) => {
    switch (finding) {
      case "proceed":
        return "border-emerald-300/80 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300";
      case "flag_for_review":
        return "border-amber-300/80 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300";
      default:
        return "border-red-300/80 bg-red-50 text-red-900 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300";
    }
  };

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
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-100 text-blue-700 shadow-neu-raised-sm dark:bg-blue-950/50 dark:text-blue-300">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">Vigilance Copilot</h3>
            <p className="text-[11px] text-muted-foreground">
              Evidence-based verification audit & compliance checklist
            </p>
          </div>
        </div>
        <AiBadge />
      </div>

      {/* Mandatory Human Responsibility */}
      <div className="flex items-start gap-2.5 rounded-xl border border-blue-200 bg-blue-50/70 p-2.5 text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-300 text-xs">
        <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
        <span className="text-[11px] leading-tight">
          <strong>Non-Delegable Verification:</strong> AI findings do not change lead state. The
          human Vigilance Officer must independently listen to the audio and execute the formal
          verification transition.
        </span>
      </div>

      {/* Empty State */}
      {!result && !loading && (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/40 shadow-neu-inset-sm">
            <ShieldCheck className="h-6 w-6 text-muted-foreground/60" />
          </div>
          <p className="text-xs text-muted-foreground max-w-xs">
            Audit this lead against mandatory verification items before submitting your vigilance sign-off.
          </p>
          <button
            type="button"
            onClick={evaluate}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-neu-btn hover:bg-blue-700 active:shadow-neu-inset transition-all"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Audit Verification Evidence
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center gap-3 py-8">
          <div className="h-7 w-7 rounded-full border-2 border-blue-500/20 border-t-blue-600 animate-spin" />
          <p className="text-xs text-muted-foreground font-medium animate-pulse">
            Cross-referencing audio metadata, address & meeting schedules…
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-red-700 text-xs">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <button type="button" onClick={evaluate} className="font-semibold underline">
            Retry
          </button>
        </div>
      )}

      {/* Result View */}
      {result && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3.5">
          {/* Overall finding callout */}
          <div className={cn("rounded-xl border p-3.5 text-xs shadow-neu-inset-sm", getOverallFindingBadge(result.overallFinding))}>
            <div className="flex items-center justify-between font-bold uppercase tracking-wider text-[11px] mb-1">
              <span>Overall Finding: {result.overallFinding.replace(/_/g, " ")}</span>
              <span className="font-mono text-[9px] lowercase opacity-70">advisory only</span>
            </div>
            <p className="leading-relaxed">{result.summary}</p>
          </div>

          {/* Checklist items */}
          <div className="space-y-2">
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground font-mono">
              Audit Checklist ({result.checks.length} items)
            </h4>
            {result.checks.map((chk, idx) => (
              <div
                key={idx}
                className="rounded-xl border border-border/70 bg-card p-3 shadow-neu-raised-sm space-y-1.5 text-xs"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-foreground">{chk.requirement}</span>
                  {getStatusBadge(chk.status)}
                </div>
                <p className="text-[11px] text-muted-foreground">{chk.explanation}</p>
                <div className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground/80 pt-0.5">
                  <span className="font-semibold">Evidence:</span>
                  <span className="truncate">{chk.evidenceReference}</span>
                </div>
                {chk.recommendedHumanAction && (
                  <div className="pt-1 text-[11px] text-primary font-medium">
                    → Recommendation: {chk.recommendedHumanAction}
                  </div>
                )}
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
              <RefreshCw className="h-3 w-3" /> Re-audit
            </button>
          </div>
        </motion.div>
      )}
    </div>
  );
}
