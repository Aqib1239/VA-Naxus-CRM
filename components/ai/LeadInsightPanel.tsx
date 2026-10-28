"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import { aiService, LeadIntelligenceResult } from "@/services/ai.service";
import { AiBadge } from "./AiBadge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface LeadInsightPanelProps {
  leadId: string;
  className?: string;
}

export function LeadInsightPanel({ leadId, className }: LeadInsightPanelProps) {
  const [result, setResult] = useState<LeadIntelligenceResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyze = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await aiService.getLeadIntelligence(leadId);
      setResult(data);
    } catch (err: any) {
      const msg = err?.message || "Analysis failed. Please try again.";
      setError(msg);
      toast.error("Lead Intelligence failed", { description: msg });
    } finally {
      setLoading(false);
    }
  };

  const getScoreColor = (cat: string) => {
    switch (cat) {
      case "hot":
        return "text-red-500 border-red-500/30 bg-red-50/50 dark:bg-red-950/20";
      case "warm":
        return "text-amber-500 border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/20";
      case "cold":
        return "text-blue-500 border-blue-500/30 bg-blue-50/50 dark:bg-blue-950/20";
      case "stalled":
        return "text-zinc-400 border-zinc-500/30 bg-zinc-50/50 dark:bg-zinc-900/30";
      default:
        return "text-primary border-primary/30 bg-primary/5";
    }
  };

  return (
    <div
      className={cn(
        "rounded-2xl border border-border/80 bg-card p-5 shadow-neu-raised dark:shadow-none transition-all",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-border/60">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-100 text-violet-700 shadow-neu-raised-sm dark:bg-violet-950/50 dark:text-violet-300">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">Lead Intelligence</h3>
            <p className="text-[11px] text-muted-foreground">Explainable AI priority & conversion signals</p>
          </div>
        </div>
        <AiBadge />
      </div>

      {/* Initial Empty State */}
      {!result && !loading && (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/40 shadow-neu-inset-sm">
            <TrendingUp className="h-6 w-6 text-muted-foreground/60" />
          </div>
          <div>
            <p className="text-xs font-semibold text-foreground">No AI analysis generated yet</p>
            <p className="text-[11px] text-muted-foreground max-w-xs mt-0.5">
              Generate an explainable 0–100 score, missing field detection, and next-best actions.
            </p>
          </div>
          <button
            type="button"
            onClick={analyze}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-neu-btn hover:shadow-neu-btn-hover active:shadow-neu-inset transition-all"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Analyze Lead with AI
          </button>
        </div>
      )}

      {/* Loading Spinner */}
      {loading && (
        <div className="flex flex-col items-center gap-3 py-8">
          <div className="h-7 w-7 rounded-full border-2 border-violet-500/20 border-t-violet-600 animate-spin" />
          <p className="text-xs text-muted-foreground font-medium animate-pulse">
            Analyzing lead criteria & pipeline signals…
          </p>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-red-300/60 bg-red-50/70 p-3 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <div className="text-xs flex-1">
            <p className="font-semibold">Analysis Failed</p>
            <p className="text-[11px] opacity-90 mt-0.5">{error}</p>
          </div>
          <button
            type="button"
            onClick={analyze}
            className="text-xs font-medium underline underline-offset-2 hover:opacity-80"
          >
            Retry
          </button>
        </div>
      )}

      {/* Analysis Results Display */}
      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mt-4 space-y-4"
          >
            {/* Score Card */}
            <div className="flex items-center justify-between rounded-xl border border-border/70 bg-muted/20 p-4 shadow-neu-inset-sm">
              <div className="flex items-center gap-3.5">
                <div
                  className={cn(
                    "flex flex-col items-center justify-center h-14 w-14 rounded-2xl border font-mono font-black shadow-neu-raised-sm",
                    getScoreColor(result.scoreCategory)
                  )}
                >
                  <span className="text-2xl leading-none">{result.priorityScore}</span>
                  <span className="text-[9px] uppercase tracking-wider font-semibold opacity-70">/100</span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-foreground">
                      {result.scoreCategory} Lead
                    </span>
                    {result.inactivityRisk === "high" && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700 dark:bg-red-950 dark:text-red-300">
                        <AlertTriangle className="h-2.5 w-2.5" /> Stalled
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                    {result.qualificationSummary}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={analyze}
                title="Re-run analysis"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/70 text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Contributing Factors */}
            {result.scoringFactors && result.scoringFactors.length > 0 && (
              <div>
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground font-mono mb-2">
                  Contributing Factors
                </h4>
                <div className="space-y-1.5">
                  {result.scoringFactors.map((f, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2 rounded-lg border border-border/50 bg-background/50 px-2.5 py-1.5 text-xs"
                    >
                      {f.impact === "positive" ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                      ) : f.impact === "negative" ? (
                        <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />
                      ) : (
                        <div className="h-2 w-2 rounded-full bg-muted-foreground shrink-0 mt-1.5" />
                      )}
                      <div className="flex-1 min-w-0">
                        <span className="font-semibold text-foreground">{f.factor}: </span>
                        <span className="text-muted-foreground">{f.detail}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Missing Fields */}
            {result.missingFields && result.missingFields.length > 0 && (
              <div>
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 font-mono mb-1.5">
                  Missing Stage Requirements
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {result.missingFields.map((field, i) => (
                    <span
                      key={i}
                      className="rounded-md border border-amber-300/50 bg-amber-50/70 px-2 py-0.5 font-mono text-[10px] font-medium text-amber-800 dark:border-amber-800/40 dark:bg-amber-950/40 dark:text-amber-300"
                    >
                      {field}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Next Best Actions */}
            {result.nextBestActions && result.nextBestActions.length > 0 && (
              <div>
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-primary font-mono mb-1.5">
                  Recommended Next Actions
                </h4>
                <div className="space-y-1.5">
                  {result.nextBestActions.map((act, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2 rounded-xl border border-primary/20 bg-primary/5 p-2.5 text-xs"
                    >
                      <ChevronRight className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-foreground">{act.action}</span>
                          <span
                            className={cn(
                              "text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.2 rounded-sm",
                              act.urgency === "high"
                                ? "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300"
                                : act.urgency === "medium"
                                ? "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300"
                                : "bg-muted text-muted-foreground"
                            )}
                          >
                            {act.urgency}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{act.rationale}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Footer Disclaimer */}
            <div className="pt-2 border-t border-border/50 flex items-center justify-between text-[10px] text-muted-foreground">
              <span>{result.disclaimer}</span>
              <span className="font-mono">{new Date(result.analysisTimestamp).toLocaleTimeString()}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
