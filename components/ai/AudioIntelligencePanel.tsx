"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
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
  Play,
  Pause,
  Search,
  Volume2,
  VolumeX,
  RotateCcw,
  Bot,
  UserCheck,
  Shield,
  HelpCircle,
  TrendingUp,
  MessageSquare,
  Sliders,
} from "lucide-react";
import {
  transcriptionService,
  TranscriptionData,
  TranscriptionStatus,
  SpeakerRole,
  SpeakerMapping,
} from "@/services/transcription.service";
import { AiBadge } from "./AiBadge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface AudioIntelligencePanelProps {
  leadId: string;
  hasAudio: boolean;
  audioUrl?: string;
  className?: string;
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || isNaN(seconds) || seconds < 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
}

export function AudioIntelligencePanel({
  leadId,
  hasAudio,
  audioUrl,
  className,
}: AudioIntelligencePanelProps) {
  const [data, setData] = useState<TranscriptionData | null>(null);
  const [status, setStatus] = useState<TranscriptionStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialChecking, setInitialChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Search & view options
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"utterances" | "paragraphs" | "raw">("utterances");
  const [activeTab, setActiveTab] = useState<"transcript" | "insights" | "mapping">("transcript");

  // Audio Playback & Synchronization
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isMuted, setIsMuted] = useState(false);

  // Speaker mapping local state
  const [isSavingMapping, setIsSavingMapping] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Resolved audio URL
  const resolvedAudioSrc = useMemo(() => {
    if (audioUrl) return audioUrl;
    if (data?.audioUrl) return data.audioUrl;
    return `/api/leads/${leadId}/audio`;
  }, [audioUrl, data?.audioUrl, leadId]);

  // Load existing transcription on mount
  useEffect(() => {
    let isMounted = true;

    async function loadInitial() {
      if (!hasAudio) {
        setInitialChecking(false);
        return;
      }

      try {
        const existing = await transcriptionService.getTranscription(leadId);
        if (!isMounted) return;

        if (existing) {
          setData(existing);
          setStatus(existing.status);
          if (existing.status === "FAILED") {
            setError(existing.failureReason || "Transcription failed.");
          }
        } else {
          // Check if there is an active job status
          const jobStatus = await transcriptionService.getTranscriptionStatus(leadId);
          if (!isMounted) return;
          if (jobStatus) {
            setStatus(jobStatus.status);
            if (jobStatus.status === "FAILED") {
              setError(jobStatus.failureReason || "Transcription failed.");
            }
          }
        }
      } catch (err: any) {
        // Silently ignore 404 cache misses on initial check
      } finally {
        if (isMounted) setInitialChecking(false);
      }
    }

    loadInitial();

    return () => {
      isMounted = false;
    };
  }, [leadId, hasAudio]);

  // Status Polling when status is PENDING or PROCESSING
  useEffect(() => {
    if (status !== "PENDING" && status !== "PROCESSING") return;

    let isMounted = true;
    const interval = setInterval(async () => {
      try {
        const jobStatus = await transcriptionService.getTranscriptionStatus(leadId);
        if (!isMounted || !jobStatus) return;

        setStatus(jobStatus.status);

        if (jobStatus.status === "COMPLETED") {
          clearInterval(interval);
          const fullData = await transcriptionService.getTranscription(leadId);
          if (isMounted && fullData) {
            setData(fullData);
            setError(null);
            toast.success("Hinglish call transcription completed successfully!");
          }
        } else if (jobStatus.status === "FAILED") {
          clearInterval(interval);
          setError(jobStatus.failureReason || "Deepgram transcription failed.");
          toast.error("Audio Transcription Failed", {
            description: jobStatus.failureReason || "An error occurred during audio processing.",
          });
        }
      } catch (err: any) {
        // Continue polling unless component unmounts
      }
    }, 2500);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [leadId, status]);

  // Start or retry transcription
  const handleStartTranscription = async (force: boolean = false) => {
    if (!hasAudio) {
      toast.error("No audio recording is attached to this lead.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await transcriptionService.startTranscription(leadId, force);
      setStatus(res.status);
      if (res.transcription) {
        setData(res.transcription);
      }

      if (res.status === "COMPLETED") {
        toast.success("Transcription retrieved successfully.");
      } else {
        toast.info("Deepgram transcription started in background.", {
          description: "Processing Hinglish audio with speaker diarization...",
        });
      }
    } catch (err: any) {
      const msg = err?.message || "Failed to start transcription.";
      setError(msg);
      toast.error("Transcription Failed", { description: msg });
    } finally {
      setLoading(false);
    }
  };

  const handleRetry = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await transcriptionService.retryTranscription(leadId);
      setStatus(res.status);
      toast.info("Transcription retry queued.");
    } catch (err: any) {
      const msg = err?.message || "Retry failed.";
      setError(msg);
      toast.error("Retry Failed", { description: msg });
    } finally {
      setLoading(false);
    }
  };

  // Speaker mapping update
  const handleSpeakerRoleChange = async (speakerId: number, newRole: SpeakerRole) => {
    if (!data) return;

    const currentMappings = data.speakerMappings || data.speakers || [];
    const updatedMappings: SpeakerMapping[] = currentMappings.map((m) =>
      m.speakerId === speakerId ? { ...m, role: newRole } : m
    );

    // If speaker wasn't in array yet, add it
    if (!updatedMappings.some((m) => m.speakerId === speakerId)) {
      updatedMappings.push({ speakerId, role: newRole });
    }

    // Optimistically update UI
    setData((prev) => (prev ? { ...prev, speakerMappings: updatedMappings, speakers: updatedMappings } : null));

    setIsSavingMapping(true);
    try {
      await transcriptionService.updateSpeakerMappings(leadId, updatedMappings);
      toast.success(`Speaker ${speakerId} mapped to ${newRole}`);
    } catch (err: any) {
      toast.error("Failed to save speaker mapping", { description: err?.message });
      // Re-fetch to restore server state
      const fresh = await transcriptionService.getTranscription(leadId);
      if (fresh) setData(fresh);
    } finally {
      setIsSavingMapping(false);
    }
  };

  // Run optional OpenRouter analysis on completed transcript
  const handleAnalyzeWithAi = async () => {
    if (!data || data.status !== "COMPLETED") {
      toast.error("Call audio must be transcribed before running AI analysis.");
      return;
    }

    setIsAnalyzing(true);
    try {
      const res = await transcriptionService.analyzeTranscript(leadId);
      setData((prev) => (prev ? { ...prev, aiAnalysis: res.aiAnalysis } : null));
      setActiveTab("insights");
      toast.success("AI Call Insights generated successfully via OpenRouter!");
    } catch (err: any) {
      toast.error("AI Analysis Failed", { description: err?.message });
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Audio seeking to exact second
  const handleSeekTo = (seconds: number) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = seconds;
    setCurrentTime(seconds);
    audioRef.current.play().catch(() => {});
    setIsPlaying(true);
  };

  // Toggle play/pause
  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  const handleCopy = async () => {
    if (!data?.fullTranscript) return;
    await navigator.clipboard.writeText(data.fullTranscript);
    setCopied(true);
    toast.success("Verbatim transcript copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  // Role helper
  const getSpeakerLabel = (speakerId?: number): { label: string; role: SpeakerRole } => {
    if (typeof speakerId !== "number") return { label: "Speaker", role: "UNKNOWN" };
    const mapping = (data?.speakerMappings || data?.speakers || []).find((s) => s.speakerId === speakerId);
    const role = mapping?.role || "UNKNOWN";
    if (role === "AGENT") return { label: `Agent (Speaker ${speakerId})`, role: "AGENT" };
    if (role === "CUSTOMER") return { label: `Customer (Speaker ${speakerId})`, role: "CUSTOMER" };
    return { label: `Speaker ${speakerId}`, role: "UNKNOWN" };
  };

  // Filtered utterances by search query
  const filteredUtterances = useMemo(() => {
    if (!data?.utterances) return [];
    if (!searchQuery.trim()) return data.utterances;
    const q = searchQuery.toLowerCase();
    return data.utterances.filter((u) => u.transcript.toLowerCase().includes(q));
  }, [data?.utterances, searchQuery]);

  // Identify currently active utterance during playback
  const activeUtteranceIndex = useMemo(() => {
    if (!data?.utterances || !isPlaying) return -1;
    return data.utterances.findIndex((u) => currentTime >= u.start && currentTime <= u.end + 0.3);
  }, [data?.utterances, currentTime, isPlaying]);

  return (
    <div
      className={cn(
        "rounded-2xl border border-border/80 bg-card p-5 shadow-neu-raised dark:shadow-none space-y-4",
        className
      )}
    >
      {/* Hidden Synchronized HTML5 Audio Element */}
      <audio
        ref={audioRef}
        src={resolvedAudioSrc}
        preload="metadata"
        onTimeUpdate={() => {
          if (audioRef.current) {
            setCurrentTime(audioRef.current.currentTime);
          }
        }}
        onLoadedMetadata={() => {
          if (audioRef.current && isFinite(audioRef.current.duration)) {
            setDuration(audioRef.current.duration);
          }
        }}
        onEnded={() => setIsPlaying(false)}
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
      />

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-border/60">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100 text-violet-700 shadow-neu-raised-sm dark:bg-violet-950/50 dark:text-violet-300">
            <FileText className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-foreground">Hinglish Speech & Audio Intelligence</h3>
              <AiBadge label="Deepgram Nova-3" />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Verbatim multilingual transcription, diarization & interactive playback
            </p>
          </div>
        </div>

        {/* Status Indicator */}
        <div className="flex items-center gap-2">
          {status === "PENDING" && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-950/60 dark:text-amber-300">
              <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
              Pending
            </span>
          )}
          {status === "PROCESSING" && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-blue-100 text-blue-800 border border-blue-300 dark:bg-blue-950/60 dark:text-blue-300">
              <RefreshCw className="h-3 w-3 animate-spin text-blue-600" />
              Processing
            </span>
          )}
          {status === "COMPLETED" && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300">
              <CheckCircle2 className="h-3 w-3 text-emerald-600" />
              Completed
            </span>
          )}
          {status === "FAILED" && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-red-100 text-red-800 border border-red-300 dark:bg-red-950/60 dark:text-red-300">
              <AlertTriangle className="h-3 w-3 text-red-600" />
              Failed
            </span>
          )}
        </div>
      </div>

      {/* When audio is not uploaded */}
      {!hasAudio && (
        <div className="p-5 text-center text-xs text-muted-foreground bg-muted/20 border border-dashed border-border rounded-xl">
          Voice recording has not yet been uploaded for this lead. Upload call recording in Stage 3 (Vigilance) to enable Deepgram transcription.
        </div>
      )}

      {/* Empty State when audio exists but no transcript yet */}
      {hasAudio && !status && !loading && !initialChecking && (
        <div className="flex flex-col items-center gap-3 py-8 text-center bg-muted/10 border border-dashed border-border/80 rounded-2xl">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-100 dark:bg-violet-950/40 shadow-neu-inset-sm">
            <Sparkles className="h-6 w-6 text-violet-600 dark:text-violet-400" />
          </div>
          <div className="space-y-1 max-w-sm">
            <h4 className="text-xs font-semibold text-foreground">Transcribe Call Audio with Deepgram Nova-3</h4>
            <p className="text-[11px] text-muted-foreground">
              Transcribes Hindi + English (Hinglish) code-switching with speaker separation and exact timestamps.
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleStartTranscription(false)}
            className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-xs font-semibold text-white shadow-neu-btn hover:bg-violet-700 active:shadow-neu-inset transition-all"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Start Transcription
          </button>
        </div>
      )}

      {/* Loading or Processing State */}
      {(loading || status === "PROCESSING" || status === "PENDING") && (
        <div className="flex flex-col items-center gap-3 py-8 bg-muted/10 border border-border/60 rounded-2xl">
          <div className="h-8 w-8 rounded-full border-2 border-violet-500/20 border-t-violet-600 animate-spin" />
          <div className="text-center space-y-1">
            <p className="text-xs text-foreground font-semibold">
              {status === "PENDING" ? "Transcription Job Queued…" : "Deepgram Nova-3 is transcribing audio…"}
            </p>
            <p className="text-[11px] text-muted-foreground animate-pulse">
              Recognizing Hindi and English speech, identifying speakers, and extracting timestamps.
            </p>
          </div>
        </div>
      )}

      {/* Error / Failed State */}
      {error && status === "FAILED" && (
        <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-red-800 dark:bg-red-950/30 dark:border-red-900/50 dark:text-red-300 space-y-2">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-red-600" />
            <div className="flex-1 text-xs">
              <span className="font-bold">Transcription Failed: </span>
              <span>{error}</span>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={handleRetry}
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 active:scale-95 transition-all"
            >
              <RefreshCw className="h-3 w-3" /> Retry Transcription
            </button>
          </div>
        </div>
      )}

      {/* Completed Transcription View */}
      {data && status === "COMPLETED" && (
        <div className="space-y-4">
          {/* Synchronized Compact Audio Player Bar */}
          <div className="rounded-xl border border-border/70 bg-muted/20 p-3 space-y-2.5 shadow-neu-inset-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={togglePlay}
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-neu-btn hover:opacity-90 active:scale-95 transition-all"
                  title={isPlaying ? "Pause" : "Play"}
                >
                  {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
                </button>
                <div className="text-xs font-mono font-medium text-foreground">
                  <span>{formatTime(currentTime)}</span>
                  <span className="text-muted-foreground mx-1">/</span>
                  <span className="text-muted-foreground">{formatTime(duration || data.audioDurationSeconds || 0)}</span>
                </div>
              </div>

              {/* Playback Speed Controls */}
              <div className="flex items-center gap-2">
                <div className="flex items-center rounded-lg border border-border bg-background/50 p-0.5 text-[11px] font-mono">
                  {[1, 1.25, 1.5, 2].map((rate) => (
                    <button
                      key={rate}
                      type="button"
                      onClick={() => {
                        setPlaybackRate(rate);
                        if (audioRef.current) audioRef.current.playbackRate = rate;
                      }}
                      className={cn(
                        "px-1.5 py-0.5 rounded",
                        playbackRate === rate ? "bg-primary text-primary-foreground font-bold" : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {rate}x
                    </button>
                  ))}
                </div>

                {/* Mute Button */}
                <button
                  type="button"
                  onClick={() => {
                    const next = !isMuted;
                    setIsMuted(next);
                    if (audioRef.current) audioRef.current.muted = next;
                  }}
                  className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground"
                  title={isMuted ? "Unmute" : "Mute"}
                >
                  {isMuted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>

            {/* Audio Seek Scrubber */}
            <input
              type="range"
              min={0}
              max={duration || data.audioDurationSeconds || 120}
              step={0.1}
              value={currentTime}
              onChange={(e) => handleSeekTo(parseFloat(e.target.value))}
              className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
            />
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center justify-between border-b border-border/70 pb-2">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setActiveTab("transcript")}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all",
                  activeTab === "transcript"
                    ? "bg-primary text-primary-foreground shadow-neu-btn"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                )}
              >
                Transcript ({data.utterances?.length || 0} segments)
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("insights")}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all",
                  activeTab === "insights"
                    ? "bg-primary text-primary-foreground shadow-neu-btn"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                )}
              >
                <Sparkles className="h-3 w-3 text-amber-500" />
                AI Call Insights
                {data.aiAnalysis && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("mapping")}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all",
                  activeTab === "mapping"
                    ? "bg-primary text-primary-foreground shadow-neu-btn"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                )}
              >
                <Users className="h-3 w-3" />
                Speaker Mapping ({(data.speakers || []).length})
              </button>
            </div>

            {/* Copy & Retranscribe Buttons */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground p-1 rounded hover:bg-muted/50"
                title="Copy verbatim transcript"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
              <button
                type="button"
                onClick={() => handleStartTranscription(true)}
                className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                title="Force re-transcription"
              >
                <RefreshCw className="h-3 w-3" /> Re-run
              </button>
            </div>
          </div>

          {/* TAB 1: TRANSCRIPT VIEWER */}
          {activeTab === "transcript" && (
            <div className="space-y-3">
              {/* Search & View Mode Switcher */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search transcript phrases…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full rounded-lg border border-border/70 bg-background/50 pl-8 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  {searchQuery && (
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">
                      {filteredUtterances.length} matches
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <span>View:</span>
                  <button
                    type="button"
                    onClick={() => setViewMode("utterances")}
                    className={cn(
                      "px-2 py-0.5 rounded text-[11px]",
                      viewMode === "utterances" ? "bg-muted font-bold text-foreground" : "hover:text-foreground"
                    )}
                  >
                    Diarized
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("paragraphs")}
                    className={cn(
                      "px-2 py-0.5 rounded text-[11px]",
                      viewMode === "paragraphs" ? "bg-muted font-bold text-foreground" : "hover:text-foreground"
                    )}
                  >
                    Paragraphs
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("raw")}
                    className={cn(
                      "px-2 py-0.5 rounded text-[11px]",
                      viewMode === "raw" ? "bg-muted font-bold text-foreground" : "hover:text-foreground"
                    )}
                  >
                    Raw Text
                  </button>
                </div>
              </div>

              {/* Diarized Speech Segments */}
              {viewMode === "utterances" && (
                <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                  {filteredUtterances.length === 0 ? (
                    <p className="text-center py-6 text-xs text-muted-foreground italic">
                      No matching speech segments found.
                    </p>
                  ) : (
                    filteredUtterances.map((seg, idx) => {
                      const { label, role } = getSpeakerLabel(seg.speaker);
                      const isActive = activeUtteranceIndex === idx;

                      return (
                        <div
                          key={idx}
                          onClick={() => handleSeekTo(seg.start)}
                          className={cn(
                            "cursor-pointer rounded-xl border p-3 transition-all",
                            isActive
                              ? "border-primary bg-primary/10 shadow-neu-inset-sm ring-1 ring-primary/40"
                              : "border-border/60 bg-background/40 hover:bg-muted/30"
                          )}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-1.5">
                              <span
                                className={cn(
                                  "font-bold text-[11px] px-1.5 py-0.5 rounded font-mono",
                                  role === "AGENT"
                                    ? "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                                    : role === "CUSTOMER"
                                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                                    : "bg-muted text-muted-foreground"
                                )}
                              >
                                {label}
                              </span>
                            </div>

                            <button
                              type="button"
                              className="inline-flex items-center gap-1 font-mono text-[10px] text-muted-foreground hover:text-primary transition-colors"
                              title="Click to seek audio here"
                            >
                              <Clock className="h-2.5 w-2.5" />
                              <span>{formatTime(seg.start)}</span>
                            </button>
                          </div>

                          <p className="text-xs text-foreground leading-relaxed pl-1">
                            {seg.transcript}
                          </p>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* Paragraphs Mode */}
              {viewMode === "paragraphs" && (
                <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
                  {(data.paragraphs || []).map((p, idx) => {
                    const { label, role } = getSpeakerLabel(p.speaker);
                    return (
                      <div
                        key={idx}
                        onClick={() => handleSeekTo(p.start)}
                        className="cursor-pointer rounded-xl border border-border/60 bg-background/40 p-3 hover:bg-muted/30 transition-all space-y-1"
                      >
                        <div className="flex items-center justify-between text-[11px]">
                          <span
                            className={cn(
                              "font-bold font-mono px-1.5 py-0.2 rounded",
                              role === "AGENT"
                                ? "text-blue-600 dark:text-blue-400"
                                : role === "CUSTOMER"
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-muted-foreground"
                            )}
                          >
                            {label}
                          </span>
                          <span className="font-mono text-[10px] text-muted-foreground">
                            {formatTime(p.start)} - {formatTime(p.end)}
                          </span>
                        </div>
                        <p className="text-xs text-foreground leading-relaxed">{p.text}</p>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Raw Full Text Mode */}
              {viewMode === "raw" && (
                <div className="rounded-xl border border-border/70 bg-background/50 p-4 max-h-[380px] overflow-y-auto">
                  <p className="text-xs text-foreground font-mono whitespace-pre-wrap leading-relaxed">
                    {data.fullTranscript}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: OPENROUTER AI INSIGHTS & SUMMARY */}
          {activeTab === "insights" && (
            <div className="space-y-4">
              {!data.aiAnalysis ? (
                <div className="flex flex-col items-center gap-3 py-8 text-center bg-muted/10 border border-dashed border-border/80 rounded-2xl">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-100 dark:bg-amber-950/40 shadow-neu-inset-sm">
                    <Sparkles className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div className="space-y-1 max-w-sm">
                    <h4 className="text-xs font-semibold text-foreground">Extract Call Insights with OpenRouter AI</h4>
                    <p className="text-[11px] text-muted-foreground">
                      Synthesize customer objections, purchase intent, agent communication quality, commitments, and summary from the verbatim transcript.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={isAnalyzing}
                    onClick={handleAnalyzeWithAi}
                    className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-neu-btn hover:opacity-90 active:scale-95 disabled:opacity-50 transition-all"
                  >
                    {isAnalyzing ? (
                      <>
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        Analyzing Transcript…
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-3.5 w-3.5" />
                        Analyze Transcript with OpenRouter
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <div className="space-y-3.5">
                  {/* AI Disclaimer Banner */}
                  <div className="flex items-center justify-between text-[11px] px-3 py-1.5 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 rounded-xl text-amber-800 dark:text-amber-300">
                    <span className="font-semibold flex items-center gap-1.5">
                      <Bot className="h-3.5 w-3.5 text-amber-600" />
                      AI-Generated Call Insights ({data.aiAnalysis.analyzedModel})
                    </span>
                    <button
                      type="button"
                      disabled={isAnalyzing}
                      onClick={handleAnalyzeWithAi}
                      className="text-primary hover:underline font-semibold"
                    >
                      Re-analyze
                    </button>
                  </div>

                  {/* Summary & Call Outcome */}
                  <div className="rounded-xl border border-border/70 bg-muted/20 p-3.5 space-y-2 shadow-neu-inset-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase font-bold tracking-wider font-mono text-muted-foreground">
                        Call Summary
                      </span>
                      {data.aiAnalysis.callOutcome && (
                        <span className="font-mono text-[10px] uppercase font-bold px-2 py-0.5 rounded-md border bg-primary/10 text-primary border-primary/30">
                          {data.aiAnalysis.callOutcome.replace(/_/g, " ")}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-foreground leading-relaxed">{data.aiAnalysis.summary}</p>
                  </div>

                  {/* 2-Column Grid: Objections & Commitments */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {/* Customer Objections */}
                    <div className="rounded-xl border border-border/70 p-3 bg-muted/10 space-y-1.5">
                      <span className="text-[10px] uppercase font-bold tracking-wider font-mono text-muted-foreground flex items-center gap-1.5">
                        <AlertTriangle className="h-3 w-3 text-amber-500" />
                        Customer Objections
                      </span>
                      {data.aiAnalysis.customerObjections && data.aiAnalysis.customerObjections.length > 0 ? (
                        <ul className="space-y-1 text-xs">
                          {data.aiAnalysis.customerObjections.map((obj, i) => (
                            <li key={i} className="text-muted-foreground leading-tight flex items-start gap-1.5">
                              <span className="text-amber-500 font-bold">•</span>
                              <span>{obj}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-[11px] text-muted-foreground italic">No objections identified</p>
                      )}
                    </div>

                    {/* Commitments Made */}
                    <div className="rounded-xl border border-border/70 p-3 bg-muted/10 space-y-1.5">
                      <span className="text-[10px] uppercase font-bold tracking-wider font-mono text-muted-foreground flex items-center gap-1.5">
                        <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                        Commitments Made
                      </span>
                      {data.aiAnalysis.commitments && data.aiAnalysis.commitments.length > 0 ? (
                        <ul className="space-y-1 text-xs">
                          {data.aiAnalysis.commitments.map((com, i) => (
                            <li key={i} className="text-muted-foreground leading-tight flex items-start gap-1.5">
                              <span className="text-emerald-500 font-bold">•</span>
                              <span>{com}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-[11px] text-muted-foreground italic">No explicit commitments noted</p>
                      )}
                    </div>
                  </div>

                  {/* Customer Intent & Agent Quality */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {data.aiAnalysis.customerInterestAndIntent && (
                      <div className="rounded-xl border border-border/70 p-3 bg-muted/10 space-y-1">
                        <span className="text-[10px] uppercase font-bold tracking-wider font-mono text-muted-foreground flex items-center gap-1.5">
                          <TrendingUp className="h-3 w-3 text-blue-500" />
                          Interest & Purchase Intent
                        </span>
                        <p className="text-xs text-foreground leading-relaxed">
                          {data.aiAnalysis.customerInterestAndIntent}
                        </p>
                      </div>
                    )}

                    {data.aiAnalysis.agentCommunicationQuality && (
                      <div className="rounded-xl border border-border/70 p-3 bg-muted/10 space-y-1">
                        <span className="text-[10px] uppercase font-bold tracking-wider font-mono text-muted-foreground flex items-center gap-1.5">
                          <UserCheck className="h-3 w-3 text-purple-500" />
                          Agent Communication Quality
                        </span>
                        <p className="text-xs text-foreground leading-relaxed">
                          {data.aiAnalysis.agentCommunicationQuality}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Suggested Next Actions */}
                  {data.aiAnalysis.suggestedNextActions && data.aiAnalysis.suggestedNextActions.length > 0 && (
                    <div className="rounded-xl border border-border/70 p-3 bg-muted/10 space-y-1.5">
                      <span className="text-[10px] uppercase font-bold tracking-wider font-mono text-muted-foreground flex items-center gap-1.5">
                        <ListTodo className="h-3 w-3 text-primary" />
                        Suggested Next Actions
                      </span>
                      <ul className="space-y-1 text-xs">
                        {data.aiAnalysis.suggestedNextActions.map((action, i) => (
                          <li key={i} className="text-muted-foreground leading-tight flex items-start gap-1.5">
                            <span className="text-primary font-bold">→</span>
                            <span>{action}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: SPEAKER MAPPING INTERFACE */}
          {activeTab === "mapping" && (
            <div className="space-y-3 p-1">
              <div className="flex items-center justify-between pb-2">
                <div>
                  <h4 className="text-xs font-bold text-foreground">Manual Speaker Identification</h4>
                  <p className="text-[11px] text-muted-foreground">
                    Assign detected speakers to Agent, Customer, or Unknown. Changes reflect across all transcript segments.
                  </p>
                </div>
                {isSavingMapping && (
                  <span className="text-[11px] text-primary flex items-center gap-1 animate-pulse">
                    <RefreshCw className="h-3 w-3 animate-spin" /> Saving…
                  </span>
                )}
              </div>

              <div className="space-y-2">
                {(data.speakers || []).length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">No speakers detected in this audio recording.</p>
                ) : (
                  (data.speakers || []).map((spk) => {
                    const currentMapping = (data.speakerMappings || []).find((m) => m.speakerId === spk.speakerId);
                    const currentRole = currentMapping?.role || spk.role || "UNKNOWN";

                    return (
                      <div
                        key={spk.speakerId}
                        className="flex items-center justify-between p-3 rounded-xl border border-border/70 bg-background/50 shadow-neu-raised-sm"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted text-muted-foreground font-mono text-xs font-bold">
                            #{spk.speakerId}
                          </div>
                          <div>
                            <span className="text-xs font-bold text-foreground">Speaker {spk.speakerId}</span>
                            <p className="text-[10px] text-muted-foreground">Original Deepgram Diarization ID</p>
                          </div>
                        </div>

                        {/* Role Selector */}
                        <div className="flex items-center gap-2">
                          <label className="text-[11px] text-muted-foreground">Role:</label>
                          <select
                            value={currentRole}
                            disabled={isSavingMapping}
                            onChange={(e) =>
                              handleSpeakerRoleChange(spk.speakerId, e.target.value as SpeakerRole)
                            }
                            className="rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer shadow-neu-btn"
                          >
                            <option value="UNKNOWN">Unknown</option>
                            <option value="AGENT">Agent (Officer)</option>
                            <option value="CUSTOMER">Customer</option>
                          </select>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* Footer Metadata Diagnostics */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/50 text-[10px] text-muted-foreground font-mono">
            <div className="flex items-center gap-3">
              <span>Model: {data.model || "nova-3"}</span>
              <span>•</span>
              <span>Language: {data.detectedLanguage || data.language || "multi"}</span>
              {typeof data.confidence === "number" && (
                <>
                  <span>•</span>
                  <span>Confidence: {(data.confidence * 100).toFixed(1)}%</span>
                </>
              )}
            </div>
            <span>VA Nexus Speech Intelligence Engine</span>
          </div>
        </div>
      )}
    </div>
  );
}
