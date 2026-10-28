"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText,
  Sparkles,
  RefreshCw,
  Copy,
  Check,
  AlertTriangle,
  Users,
  CheckCircle2,
  Clock,
  ListTodo,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { aiService, AudioIntelligenceResult } from "@/services/ai.service";
import { AiBadge } from "./AiBadge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface AudioIntelligencePanelProps {
  leadId: string;
  hasAudio: boolean;
  className?: string;
}

export function AudioIntelligencePanel({
  leadId,
  hasAudio,
  className,
}: AudioIntelligencePanelProps) {
  const [result, setResult] = useState<AudioIntelligenceResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialChecking, setInitialChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showFullTranscript, setShowFullTranscript] = useState(true);

  // Check on load if lead has existing cached transcription
  useEffect(() => {
    let isMounted = true;
    async function checkCached() {
      if (!hasAudio) {
        setInitialChecking(false);
        return;
      }
      try {
        const cached = await aiService.getAudioTranscription(leadId);
        if (isMounted && cached) {
          setResult(cached);
        }
      } catch (e) {
        // Silently ignore 404 cache misses
      } finally {
        if (isMounted) setInitialChecking(false);
      }
    }
    checkCached();
    return () => {
      isMounted = false;
    };
  }, [leadId, hasAudio]);

  const handleTranscribe = async (force: boolean = false) => {
    if (!hasAudio) {
      toast.error("No audio recording is attached to this lead.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await aiService.transcribeAudio(leadId, force);
      setResult(data);
      toast.success("Call recording transcribed successfully");
    } catch (err: any) {
      const msg = err?.message || "Transcription failed.";
      setError(msg);
      toast.error("Audio Transcription Failed", { description: msg });
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!result?.transcription) return;
    await navigator.clipboard.writeText(result.transcription);
    setCopied(true);
    toast.success("Transcript copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  const outcomeColors: Record<string, string> = {
    meeting_confirmed:
      "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300",
    follow_up_needed:
      "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300",
    rescheduled:
      "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950 dark:text-blue-300",
    inconclusive:
      "bg-zinc-100 text-zinc-800 border-zinc-300 dark:bg-zinc-900 dark:text-zinc-300",
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
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-100 text-violet-700 shadow-neu-raised-sm dark:bg-violet-950/50 dark:text-violet-300">
            <FileText className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">Speech & Audio Intelligence</h3>
            <p className="text-[11px] text-muted-foreground">
              Multimodal call transcription, speaker diarization & insights
            </p>
          </div>
        </div>
        <AiBadge label="Gemini Audio" />
      </div>

      {/* When audio is not available */}
      {!hasAudio && (
        <div className="p-4 text-center text-xs text-muted-foreground bg-muted/20 border border-dashed border-border rounded-xl">
          Voice recording has not yet been uploaded for this lead. Transcription requires a valid
          Vigilance call recording.
        </div>
      )}

      {/* Empty State when audio exists but no transcript yet */}
      {hasAudio && !result && !loading && !initialChecking && (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/40 shadow-neu-inset-sm">
            <Sparkles className="h-6 w-6 text-violet-500/70" />
          </div>
          <p className="text-xs text-muted-foreground max-w-xs">
            Generate an AI transcript with speaker diarization, customer requirements, commitments, and
            call outcome.
          </p>
          <button
            type="button"
            onClick={() => handleTranscribe(false)}
            className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-xs font-semibold text-white shadow-neu-btn hover:bg-violet-700 active:shadow-neu-inset transition-all"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Transcribe Audio to Text
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center gap-3 py-8">
          <div className="h-7 w-7 rounded-full border-2 border-violet-500/20 border-t-violet-600 animate-spin" />
          <p className="text-xs text-muted-foreground font-medium animate-pulse">
            Transcribing voice audio & separating speakers…
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-red-700 text-xs">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <button
            type="button"
            onClick={() => handleTranscribe(true)}
            className="font-semibold underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Results View */}
      {result && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          {/* Summary & Outcome Banner */}
          <div className="rounded-xl border border-border/70 bg-muted/20 p-3.5 space-y-2 shadow-neu-inset-sm">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase font-bold tracking-wider font-mono text-muted-foreground">
                Call Summary & Outcome
              </span>
              <span
                className={cn(
                  "font-mono text-[10px] uppercase font-bold px-2 py-0.5 rounded-md border",
                  outcomeColors[result.callOutcome] || outcomeColors.inconclusive
                )}
              >
                {result.callOutcome.replace(/_/g, " ")}
              </span>
            </div>
            <p className="text-xs text-foreground leading-relaxed">{result.summary}</p>
          </div>

          {/* Diarized Dialogue View */}
          <div className="rounded-xl border border-border/70 overflow-hidden shadow-neu-raised-sm">
            <button
              type="button"
              onClick={() => setShowFullTranscript(!showFullTranscript)}
              className="flex items-center justify-between w-full px-4 py-2.5 bg-muted/30 hover:bg-muted/50 text-left text-xs font-semibold text-foreground transition-colors"
            >
              <span className="flex items-center gap-2">
                <Users className="h-3.5 w-3.5 text-violet-600" />
                Speaker Diarized Transcript ({result.speakerSegments.length} turns)
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCopy();
                  }}
                  className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                  title="Copy full transcript"
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </button>
                {showFullTranscript ? (
                  <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </div>
            </button>

            {showFullTranscript && (
              <div className="p-3.5 space-y-2.5 max-h-[300px] overflow-y-auto border-t border-border/50 bg-background/50 text-xs">
                {result.speakerSegments.map((seg, idx) => (
                  <div key={idx} className="flex items-start gap-2.5">
                    <div className="flex items-center gap-1 shrink-0 font-mono text-[10px] text-muted-foreground mt-0.5">
                      <Clock className="h-2.5 w-2.5" />
                      <span>{seg.timestamp || "—"}</span>
                    </div>
                    <div className="flex-1">
                      <span
                        className={cn(
                          "font-bold text-[11px] mr-1.5",
                          seg.speaker.toLowerCase().includes("officer") ||
                            seg.speaker.toLowerCase().includes("agent")
                            ? "text-blue-600 dark:text-blue-400"
                            : "text-emerald-600 dark:text-emerald-400"
                        )}
                      >
                        [{seg.speaker}]:
                      </span>
                      <span className="text-foreground leading-relaxed">{seg.text}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Customer Requirements & Next Steps Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Requirements */}
            <div className="rounded-xl border border-border/70 p-3 bg-muted/10 space-y-1.5">
              <span className="text-[10px] uppercase font-bold tracking-wider font-mono text-muted-foreground flex items-center gap-1.5">
                <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                Customer Requirements
              </span>
              {result.customerRequirements.length > 0 ? (
                <ul className="space-y-1 text-xs">
                  {result.customerRequirements.map((r, idx) => (
                    <li key={idx} className="text-muted-foreground leading-tight flex items-start gap-1.5">
                      <span className="text-primary font-bold">•</span>
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[11px] text-muted-foreground italic">None explicitly identified</p>
              )}
            </div>

            {/* Next Steps */}
            <div className="rounded-xl border border-border/70 p-3 bg-muted/10 space-y-1.5">
              <span className="text-[10px] uppercase font-bold tracking-wider font-mono text-muted-foreground flex items-center gap-1.5">
                <ListTodo className="h-3 w-3 text-primary" />
                Agreed Next Steps
              </span>
              {result.nextSteps.length > 0 ? (
                <ul className="space-y-1 text-xs">
                  {result.nextSteps.map((s, idx) => (
                    <li key={idx} className="text-muted-foreground leading-tight flex items-start gap-1.5">
                      <span className="text-primary font-bold">→</span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[11px] text-muted-foreground italic">No immediate next steps noted</p>
              )}
            </div>
          </div>

          {/* Uncertain Passages if any */}
          {result.uncertainPassages && result.uncertainPassages.length > 0 && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-300/50 bg-amber-50/50 p-2.5 text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300 text-xs">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <div className="text-[11px]">
                <span className="font-semibold">Uncertain or Inaudible Phrases: </span>
                <span>{result.uncertainPassages.join(", ")}</span>
              </div>
            </div>
          )}

          {/* Footer Controls */}
          <div className="flex items-center justify-between pt-1 border-t border-border/50 text-[10px] text-muted-foreground">
            <span>{result.disclaimer}</span>
            <button
              type="button"
              onClick={() => handleTranscribe(true)}
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              <RefreshCw className="h-3 w-3" /> Re-transcribe
            </button>
          </div>
        </motion.div>
      )}
    </div>
  );
}
