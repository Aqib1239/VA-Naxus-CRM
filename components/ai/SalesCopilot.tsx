"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  Phone,
  FileText,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  RefreshCw,
  Copy,
  Check,
  ShieldAlert,
} from "lucide-react";
import { aiService, SalesCopilotResult } from "@/services/ai.service";
import { AiBadge } from "./AiBadge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface SalesCopilotProps {
  leadId: string;
  className?: string;
}

export function SalesCopilot({ leadId, className }: SalesCopilotProps) {
  const [result, setResult] = useState<SalesCopilotResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editedDraft, setEditedDraft] = useState("");
  const [isApproved, setIsApproved] = useState(false);
  const [expandedSection, setExpandedSection] = useState<string | null>("talkingPoints");
  const [copied, setCopied] = useState(false);

  const generate = async () => {
    setLoading(true);
    setError(null);
    setIsApproved(false);
    try {
      const data = await aiService.getSalesCopilot(leadId);
      setResult(data);
      setEditedDraft(data.followUpDraft);
    } catch (err: any) {
      const msg = err?.message || "Failed to generate sales copilot.";
      setError(msg);
      toast.error("Sales Copilot Error", { description: msg });
    } finally {
      setLoading(false);
    }
  };

  const handleCopyDraft = async () => {
    if (!isApproved) {
      toast.warning("Draft Approval Required", {
        description: "Please review and click 'Approve Draft' before copying or sending.",
      });
      return;
    }
    await navigator.clipboard.writeText(editedDraft);
    setCopied(true);
    toast.success("Draft copied to clipboard");
    setTimeout(() => setCopied(false), 2500);
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
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 shadow-neu-raised-sm dark:bg-emerald-950/50 dark:text-emerald-300">
            <Phone className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">Sales Copilot</h3>
            <p className="text-[11px] text-muted-foreground">
              Personalized talking points, objection handling & call scripts
            </p>
          </div>
        </div>
        <AiBadge />
      </div>

      {/* Mandatory Human Gate Reminder */}
      <div className="flex items-start gap-2 rounded-xl border border-amber-300/60 bg-amber-50/70 p-2.5 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300 text-xs">
        <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
        <span className="text-[11px] leading-tight">
          <strong>Human Review Mandatory:</strong> AI drafts must be verified by the assigned Sales
          Executive before communicating with prospects or modifying deal parameters.
        </span>
      </div>

      {/* Empty State */}
      {!result && !loading && (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/40 shadow-neu-inset-sm">
            <Sparkles className="h-6 w-6 text-muted-foreground/60" />
          </div>
          <p className="text-xs text-muted-foreground max-w-xs">
            Generate customized sales collateral tailored to this prospect&apos;s verified requirements.
          </p>
          <button
            type="button"
            onClick={generate}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-neu-btn hover:bg-emerald-700 active:shadow-neu-inset transition-all"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Generate Sales Copilot
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center gap-3 py-8">
          <div className="h-7 w-7 rounded-full border-2 border-emerald-500/20 border-t-emerald-600 animate-spin" />
          <p className="text-xs text-muted-foreground font-medium animate-pulse">
            Drafting personalized pitch, objection handling & script…
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-red-700 text-xs">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <button type="button" onClick={generate} className="font-semibold underline">
            Retry
          </button>
        </div>
      )}

      {/* Result View */}
      {result && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
          {/* Section: Talking Points */}
          <div className="rounded-xl border border-border/70 overflow-hidden shadow-neu-raised-sm">
            <button
              type="button"
              onClick={() => setExpandedSection(expandedSection === "talkingPoints" ? null : "talkingPoints")}
              className="flex items-center justify-between w-full px-4 py-2.5 bg-muted/30 hover:bg-muted/50 text-left text-xs font-semibold text-foreground transition-colors"
            >
              <span className="flex items-center gap-2">
                <MessageSquare className="h-3.5 w-3.5 text-emerald-600" />
                Key Talking Points ({result.talkingPoints.length})
              </span>
              {expandedSection === "talkingPoints" ? (
                <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </button>
            {expandedSection === "talkingPoints" && (
              <div className="p-3.5 space-y-2 border-t border-border/50 bg-background/50 text-xs">
                {result.talkingPoints.map((tp, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <span className="font-mono font-bold text-emerald-600 shrink-0">{idx + 1}.</span>
                    <span className="text-foreground leading-relaxed">{tp}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section: Call Script */}
          <div className="rounded-xl border border-border/70 overflow-hidden shadow-neu-raised-sm">
            <button
              type="button"
              onClick={() => setExpandedSection(expandedSection === "callScript" ? null : "callScript")}
              className="flex items-center justify-between w-full px-4 py-2.5 bg-muted/30 hover:bg-muted/50 text-left text-xs font-semibold text-foreground transition-colors"
            >
              <span className="flex items-center gap-2">
                <Phone className="h-3.5 w-3.5 text-emerald-600" />
                Engaging Call Opening Script
              </span>
              {expandedSection === "callScript" ? (
                <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </button>
            {expandedSection === "callScript" && (
              <div className="p-3.5 border-t border-border/50 bg-background/50 text-xs text-foreground whitespace-pre-wrap leading-relaxed">
                {result.callScript}
              </div>
            )}
          </div>

          {/* Section: Objection Handling */}
          <div className="rounded-xl border border-border/70 overflow-hidden shadow-neu-raised-sm">
            <button
              type="button"
              onClick={() => setExpandedSection(expandedSection === "objections" ? null : "objections")}
              className="flex items-center justify-between w-full px-4 py-2.5 bg-muted/30 hover:bg-muted/50 text-left text-xs font-semibold text-foreground transition-colors"
            >
              <span className="flex items-center gap-2">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                Objection Responses ({result.objectionHandling.length})
              </span>
              {expandedSection === "objections" ? (
                <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </button>
            {expandedSection === "objections" && (
              <div className="p-3.5 space-y-3 border-t border-border/50 bg-background/50 text-xs">
                {result.objectionHandling.map((o, idx) => (
                  <div key={idx} className="space-y-1">
                    <p className="font-semibold text-amber-600 dark:text-amber-400">
                      Objection: &ldquo;{o.objection}&rdquo;
                    </p>
                    <p className="text-foreground pl-3 border-l-2 border-emerald-500 text-[11px] leading-relaxed">
                      {o.response}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section: Follow-up Message Draft & Approval */}
          <div className="rounded-xl border border-border/70 p-3.5 bg-muted/10 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5 text-primary" />
                Editable Follow-up Draft
              </span>
              <span
                className={cn(
                  "text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full",
                  isApproved
                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                    : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                )}
              >
                {isApproved ? "Approved by User" : "Pending Approval"}
              </span>
            </div>

            <textarea
              value={editedDraft}
              onChange={(e) => {
                setEditedDraft(e.target.value);
                setIsApproved(false);
              }}
              rows={5}
              className="w-full rounded-xl border border-border/80 bg-background p-3 text-xs text-foreground shadow-neu-inset-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none font-sans"
            />

            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={() => {
                  setIsApproved(true);
                  toast.success("Draft approved for follow-up transmission");
                }}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-semibold shadow-neu-btn active:shadow-neu-inset transition-all",
                  isApproved
                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                    : "bg-emerald-600 text-white hover:bg-emerald-700"
                )}
              >
                <Check className="h-3.5 w-3.5" />
                {isApproved ? "Approved" : "Approve Draft"}
              </button>

              <button
                type="button"
                onClick={handleCopyDraft}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border/70 bg-card px-3.5 py-1.5 text-xs font-semibold text-foreground shadow-neu-raised-sm hover:shadow-neu-btn-hover active:shadow-neu-inset transition-all"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy to Clipboard"}
              </button>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between pt-1 border-t border-border/50 text-[10px] text-muted-foreground">
            <span>{result.disclaimer}</span>
            <button
              type="button"
              onClick={generate}
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              <RefreshCw className="h-3 w-3" /> Regenerate
            </button>
          </div>
        </motion.div>
      )}
    </div>
  );
}
