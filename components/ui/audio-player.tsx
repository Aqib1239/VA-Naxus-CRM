"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Play,
  Pause,
  Volume2,
  Volume1,
  VolumeX,
  RotateCcw,
  RotateCw,
  CheckCircle2,
  FileAudio,
  ShieldCheck,
  Loader2,
  AlertCircle,
  Radio,
  Lock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Slider, clamp } from "@/components/ui/audio-slider";
import { LeadsService } from "@/services/leads.service";

// Re-export Slider and AudioSlider for backward compatibility
export { Slider, AudioSlider } from "@/components/ui/audio-slider";

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

export interface AudioPlayerProps {
  src?: string;
  /** Explicit trusted CRM lead ID for authorized backend streaming */
  leadId?: string;
  /** Backend-derived protection status based on asset deliveryType */
  protectionStatus?: "protected" | "legacy-public" | "private" | "unknown";
  fileName?: string;
  fileSize?: number;
  durationSeconds?: number;
  onNaturalEnd?: () => void;
  isCompleted?: boolean;
  requiredForAction?: string;
  /** When true, listener cannot skip past the furthest point already heard */
  disableForwardSeek?: boolean;
  /** Optional explicit MIME type (e.g. "audio/aac", "audio/wav", "audio/mpeg") */
  mimeType?: string;
  /** Pass the uploaded File/Blob directly */
  file?: File | Blob;
  className?: string;
  /** When true, allows fallback to synthetic demo audio if file is missing (default false for real leads) */
  allowDemoFallback?: boolean;
  /** Optional target timestamp in seconds to seek to */
  targetSeekTime?: number | null;
  /** Optional callback fired on playback time updates */
  onTimeUpdate?: (currentTime: number) => void;
  /** Optional non-secret recording identifier (e.g. leadCode or harmless reference like AUD-2026-4821) */
  recordingId?: string;
  /** Optional custom title override (defaults to "VA Nexus Secure Audio") */
  displayTitle?: string;
  /** Optional custom subtitle override (defaults to "Protected customer recording") */
  supportingText?: string;
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

const formatSeconds = (secs: number) => {
  if (!isFinite(secs) || isNaN(secs) || secs < 0) return "0:00";
  const minutes = Math.floor(secs / 60);
  const seconds = Math.floor(secs % 60);
  return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
};

/** Best-effort MIME type inference from file extension */
const inferMimeType = (name?: string) => {
  const ext = name?.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "aac":
    case "acc":
      return "audio/aac";
    case "m4a":
    case "mp4":
      return "audio/mp4";
    case "mp3":
      return "audio/mpeg";
    case "wav":
      return "audio/wav";
    case "ogg":
    case "oga":
      return "audio/ogg";
    case "opus":
      return "audio/ogg; codecs=opus";
    case "flac":
      return "audio/flac";
    case "webm":
      return "audio/webm";
    default:
      return "audio/wav";
  }
};
const SKIP_SECONDS = 10;
const BAR_COUNT = 56;
const DEFAULT_FALLBACK_AUDIO = "/audio/sample-call.wav";

/** Validates that lead IDs match expected MongoDB or alphanumeric slug format */
export function isValidLeadId(id: unknown): id is string {
  return typeof id === "string" && /^[a-zA-Z0-9_-]{1,64}$/.test(id) && !id.includes("..");
}

/** Helper to identify client-side demo mock lead IDs (e.g. "lead-011", "lead-001") */
export function isMockLeadId(id: unknown): boolean {
  return typeof id === "string" && /^lead-\d{3,4}$/i.test(id);
}

/**
 * Returns the resolved API base URL.
 * In production, never falls back silently to localhost:5000.
 */
export function getApiBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, "");
  }
  if (process.env.NODE_ENV === "production") {
    return "/api";
  }
  return "http://localhost:5000/api";
}

/**
 * Returns backend host origin for absolute proxy construction (empty string if using relative /api).
 */
export function getBackendOrigin(): string {
  const apiBase = getApiBaseUrl();
  return apiBase.replace(/\/api$/, "");
}

/**
 * Resolves an audio URL to a fully-qualified or safe relative endpoint.
 *
 * Rules:
 * 1. Never infer a CRM lead ID from Cloudinary public ID / path regex.
 * 2. Uses explicit trusted leadId when supplied.
 * 3. Strictly rejects direct Cloudinary CDN URLs (returns empty string if no valid leadId).
 * 4. Never allows browser audio player to request res.cloudinary.com directly.
 * 5. Validates lead IDs and expected playback formats.
 * 6. Prevents production localhost fallback.
 */
export function resolveAudioUrl(src?: string, leadId?: string): string {
  // 1. Pass-through for local Blob or data URLs
  if (src && (src.startsWith("blob:") || src.startsWith("data:"))) {
    return src;
  }

  // 2. Pass-through for safe local static public audio assets (e.g. /audio/sample-call.wav)
  if (src && src.startsWith("/audio/")) {
    return src;
  }

  const backendOrigin = getBackendOrigin();
  const apiBase = getApiBaseUrl();

  // 3. Client-side demo fixture leads (e.g. "lead-011") play local demo sample without hitting backend
  if (isMockLeadId(leadId)) {
    if (src && !src.includes("/api/leads/") && !src.includes("cloudinary.com")) {
      return src;
    }
    return DEFAULT_FALLBACK_AUDIO;
  }

  // 4. If a trusted leadId is supplied, construct canonical VA Nexus proxy route
  if (leadId) {
    if (isValidLeadId(leadId)) {
      return `${backendOrigin}/api/leads/${leadId}/audio`;
    }
    // Invalid lead ID format
    return "";
  }

  // 3. Strictly reject direct Cloudinary CDN URLs when no valid leadId is provided
  if (src && (src.startsWith("https://res.cloudinary.com/") || src.startsWith("http://res.cloudinary.com/"))) {
    return "";
  }

  // 4. Handle relative internal paths safely
  if (src && src.startsWith("/")) {
    if (src.startsWith("/api/leads/")) {
      const parts = src.split("?")[0].split("/");
      const idFromPath = parts[3];
      if (idFromPath && isValidLeadId(idFromPath)) {
        return `${backendOrigin}${src}`;
      }
      return "";
    }
    if (src.startsWith("/leads/")) {
      const parts = src.split("?")[0].split("/");
      const idFromPath = parts[2];
      if (idFromPath && isValidLeadId(idFromPath)) {
        return `${apiBase}${src}`;
      }
      return "";
    }
    // Safe static assets (e.g. /audio/sample-call.wav)
    return src;
  }

  // 5. If absolute URL, ensure it is not Cloudinary
  if (src && (src.startsWith("http://") || src.startsWith("https://"))) {
    try {
      const parsed = new URL(src);
      if (parsed.hostname === "res.cloudinary.com" || parsed.hostname.endsWith(".cloudinary.com")) {
        return "";
      }
      return src;
    } catch {
      return "";
    }
  }

  return "";
}

/* -------------------------------------------------------------------------- */
/*  Main AudioPlayer Component                                                */
/* -------------------------------------------------------------------------- */

export function AudioPlayer({
  src,
  leadId,
  protectionStatus = "unknown",
  fileName = "Lead_Verification_Call.mp3",
  fileSize,
  durationSeconds = 180,
  onNaturalEnd,
  isCompleted = false,
  requiredForAction,
  disableForwardSeek = false,
  mimeType,
  file,
  className,
  allowDemoFallback = false,
  targetSeekTime,
  onTimeUpdate,
  recordingId,
  displayTitle = "VA Nexus Secure Audio",
  supportingText,
}: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const maxReachedRef = useRef(0);
  const onNaturalEndRef = useRef(onNaturalEnd);
  const onTimeUpdateRef = useRef(onTimeUpdate);
  const previousVolumeRef = useRef(1);
  const isFallbackActiveRef = useRef(false);
  const renewalCountRef = useRef(0);
  const savedPlaybackPositionRef = useRef<number | null>(null);
  const wasPlayingBeforeRenewalRef = useRef(false);

  // Derive harmless non-secret display identifier (e.g. AUD-2026-4821 or AUD-9A8D)
  const displayId = useMemo(() => {
    if (recordingId && typeof recordingId === "string") {
      const clean = recordingId.trim().replace(/^VA-/, "");
      return `AUD-${clean}`;
    }
    if (file) {
      return "AUD-LOCAL";
    }
    if (leadId && isValidLeadId(leadId)) {
      return `AUD-${leadId.slice(-4).toUpperCase()}`;
    }
    if (src) {
      const match = src.match(/\/leads\/([a-zA-Z0-9_-]+)\/audio/);
      if (match) {
        return `AUD-${match[1].slice(-4).toUpperCase()}`;
      }
    }
    return undefined;
  }, [recordingId, file, leadId, src]);

  useEffect(() => {
    onTimeUpdateRef.current = onTimeUpdate;
  }, [onTimeUpdate]);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isUsingFallback, setIsUsingFallback] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [scrubTime, setScrubTime] = useState<number | null>(null);
  const [duration, setDuration] = useState(durationSeconds);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isEndedNaturally, setIsEndedNaturally] = useState(isCompleted);

  const [resolvedSrc, setResolvedSrc] = useState<string | undefined>(undefined);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    onNaturalEndRef.current = onNaturalEnd;
  }, [onNaturalEnd]);

  // Handle source resolution and automatic recovery
  useEffect(() => {
    let cancelled = false;
    let createdUrl: string | null = null;

    setResolvedSrc(undefined);
    setHasError(false);
    setErrorMessage(null);
    setIsUsingFallback(false);
    isFallbackActiveRef.current = false;
    setIsPlaying(false);
    setIsBuffering(false);
    setCurrentTime(0);
    setScrubTime(null);
    setDuration(durationSeconds);
    setIsEndedNaturally(isCompleted);
    maxReachedRef.current = 0;

    // 1. Direct file object provided (e.g. from local file input)
    if (file) {
      const name = fileName || (file as File).name;
      const type =
        mimeType || (file.type.startsWith("audio/") ? file.type : inferMimeType(name));
      createdUrl = URL.createObjectURL(
        type && file.type !== type ? new Blob([file], { type }) : file
      );
      setResolvedSrc(createdUrl);
      return () => {
        cancelled = true;
        if (createdUrl) URL.revokeObjectURL(createdUrl);
      };
    }

    // 2. Resolve target URL securely using trusted leadId or valid source
    const targetSrc = resolveAudioUrl(src, leadId);

    if (!targetSrc) {
      if (allowDemoFallback) {
        const fallbackUrl = DEFAULT_FALLBACK_AUDIO;
        createdUrl = fallbackUrl.startsWith("blob:") ? fallbackUrl : null;
        setResolvedSrc(fallbackUrl);
        setIsUsingFallback(true);
        isFallbackActiveRef.current = true;
      } else {
        setHasError(true);
        const isCloudinaryOrInvalid = (src && src.includes("cloudinary.com")) || (leadId && !isValidLeadId(leadId));
        setErrorMessage(
          isCloudinaryOrInvalid
            ? "Direct Cloudinary audio access is restricted. Valid CRM lead authorization required."
            : "Audio recording is not attached to this lead."
        );
      }
      return () => {
        cancelled = true;
        if (createdUrl) URL.revokeObjectURL(createdUrl);
      };
    }

    // 3. If targeting an internal lead audio endpoint without a ticket, request a short-lived media ticket
    const effectiveLeadId =
      leadId && isValidLeadId(leadId) && !isMockLeadId(leadId)
        ? leadId
        : targetSrc.match(/\/leads\/([a-zA-Z0-9_-]+)\/audio/)?.[1];

    const isInternalStreamingProxy =
      targetSrc.includes("/leads/") &&
      targetSrc.includes("/audio") &&
      effectiveLeadId &&
      !isMockLeadId(effectiveLeadId);

    if (effectiveLeadId && isInternalStreamingProxy && !/[?&]ticket=/.test(targetSrc)) {
      LeadsService.getAudioTicket(effectiveLeadId)
        .then((res) => {
          if (!cancelled) {
            const backendOrigin = getBackendOrigin();
            const fullStreamUrl = res.streamUrl.startsWith("http")
              ? res.streamUrl
              : `${backendOrigin}${res.streamUrl.startsWith("/") ? "" : "/"}${res.streamUrl}`;
            setResolvedSrc(fullStreamUrl);
          }
        })
        .catch((err) => {
          if (!cancelled) {
            const status = err?.status || err?.statusCode;
            if (allowDemoFallback) {
              setResolvedSrc(DEFAULT_FALLBACK_AUDIO);
              setIsUsingFallback(true);
            } else {
              setHasError(true);
              setErrorMessage(
                status === 404
                  ? "Audio recording not found for this lead."
                  : status === 403 || status === 401
                  ? "Access to this audio recording is restricted for your role."
                  : "Unable to retrieve audio playback session."
              );
            }
          }
        });
    } else {
      setResolvedSrc(targetSrc);
    }

    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [src, leadId, file, fileName, mimeType, durationSeconds, isCompleted, allowDemoFallback]);

  useEffect(() => {
    if (isCompleted) setIsEndedNaturally(true);
  }, [isCompleted]);

  /* ------------------------- Audio element wiring ------------------------- */

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onLoadedMetadata = () => {
      if (isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
      }
      setHasError(false);
      setErrorMessage(null);

      // Restore playback position after automatic session renewal
      if (savedPlaybackPositionRef.current !== null) {
        const restorePos = savedPlaybackPositionRef.current;
        audio.currentTime = restorePos;
        setCurrentTime(restorePos);
        savedPlaybackPositionRef.current = null;
        if (wasPlayingBeforeRenewalRef.current) {
          audio.play().catch(() => {});
          wasPlayingBeforeRenewalRef.current = false;
        }
      }
    };

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onWaiting = () => setIsBuffering(true);
    const onReady = () => {
      setIsBuffering(false);
      setHasError(false);
    };

    const onError = () => {
      // 1. Only switch to demo audio if explicitly permitted
      if (allowDemoFallback && !isFallbackActiveRef.current) {
        isFallbackActiveRef.current = true;
        setIsUsingFallback(true);
        setResolvedSrc(DEFAULT_FALLBACK_AUDIO);
        setHasError(false);
        setErrorMessage(null);
        return;
      }

      // 2. Automatic Playback Session Renewal: if ticket expired mid-playback or seeking
      const currentSrc = audio.src || resolvedSrc || src || "";
      const hadTicket = /[?&]ticket=/.test(currentSrc);
      const effectiveLeadId =
        leadId && isValidLeadId(leadId) && !isMockLeadId(leadId)
          ? leadId
          : currentSrc.match(/\/leads\/([a-zA-Z0-9_-]+)\/audio/)?.[1];

      if (hadTicket && effectiveLeadId && !isMockLeadId(effectiveLeadId) && renewalCountRef.current < 3) {
        renewalCountRef.current += 1;
        savedPlaybackPositionRef.current = audio.currentTime || currentTime;
        wasPlayingBeforeRenewalRef.current = isPlaying;

        LeadsService.getAudioTicket(effectiveLeadId)
          .then((res) => {
            const backendOrigin = getBackendOrigin();
            const fullStreamUrl = res.streamUrl.startsWith("http")
              ? res.streamUrl
              : `${backendOrigin}${res.streamUrl.startsWith("/") ? "" : "/"}${res.streamUrl}`;
            setResolvedSrc(fullStreamUrl);
            setHasError(false);
            setErrorMessage(null);
            audio.load();
          })
          .catch((err: any) => {
            const status = err?.status || err?.statusCode;
            if (status === 403 || status === 401) {
              setErrorMessage("Access to this call recording is restricted for your role or session revoked.");
            } else {
              setErrorMessage("Audio playback session expired. Please retry.");
            }
            setHasError(true);
            setIsPlaying(false);
            setIsBuffering(false);
          });
        return;
      }

      const code = audio.error?.code;
      setErrorMessage(
        code === 2
          ? "Network error occurred while loading audio."
          : code === 4
          ? "Audio recording is currently unavailable or format not supported."
          : "Audio file is temporarily unavailable."
      );
      setHasError(true);
      setIsPlaying(false);
      setIsBuffering(false);
    };

    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      onTimeUpdateRef.current?.(audio.currentTime);
    };

    const onEnded = () => {
      setIsPlaying(false);
      const finalDur = isFinite(audio.duration) && audio.duration > 0 ? audio.duration : duration;
      setCurrentTime(finalDur);
      maxReachedRef.current = finalDur;
      setIsEndedNaturally(true);
      onNaturalEndRef.current?.();
    };

    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("waiting", onWaiting);
    audio.addEventListener("canplay", onReady);
    audio.addEventListener("playing", onReady);
    audio.addEventListener("error", onError);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("waiting", onWaiting);
      audio.removeEventListener("canplay", onReady);
      audio.removeEventListener("playing", onReady);
      audio.removeEventListener("error", onError);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("ended", onEnded);
    };
  }, [resolvedSrc, allowDemoFallback, duration]);

  /* --------------- Smooth progress ticker during playback --------------- */

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !isPlaying) return;

    const tick = () => {
      const t = audio.currentTime;
      setCurrentTime(t);
      if (t - maxReachedRef.current < 1.5) {
        maxReachedRef.current = Math.max(maxReachedRef.current, t);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isPlaying]);

  /* ------------------------------- Controls ------------------------------- */

  const togglePlay = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || hasError) return;

    if (audio.paused) {
      try {
        await audio.play();
      } catch {
        setIsPlaying(false);
      }
    } else {
      audio.pause();
    }
  }, [hasError]);

  const limitSeek = useCallback(
    (t: number) => {
      const upper = disableForwardSeek ? Math.min(duration, maxReachedRef.current) : duration;
      return clamp(t, 0, upper);
    },
    [disableForwardSeek, duration]
  );

  const seekTo = useCallback(
    (t: number) => {
      const audio = audioRef.current;
      if (!audio) return;
      const target = limitSeek(t);
      audio.currentTime = target;
      setCurrentTime(target);
    },
    [limitSeek]
  );

  useEffect(() => {
    if (typeof targetSeekTime === "number" && isFinite(targetSeekTime) && audioRef.current) {
      seekTo(targetSeekTime);
      audioRef.current.play().catch(() => {});
    }
  }, [targetSeekTime, seekTo]);

  const handleRestart = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || hasError) return;
    audio.currentTime = 0;
    setCurrentTime(0);
    try {
      await audio.play();
    } catch {
      setIsPlaying(false);
    }
  }, [hasError]);

  const handleRetry = useCallback(() => {
    setHasError(false);
    setErrorMessage(null);
    const audio = audioRef.current;
    if (audio) {
      if (src) {
        setResolvedSrc(resolveAudioUrl(src));
      }
      audio.load();
    }
  }, [src]);

  const skipBy = (delta: number) => seekTo((audioRef.current?.currentTime ?? currentTime) + delta);

  const toggleMute = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isMuted || volume === 0) {
      const restored = previousVolumeRef.current > 0 ? previousVolumeRef.current : 0.7;
      audio.muted = false;
      audio.volume = restored;
      setVolume(restored);
      setIsMuted(false);
    } else {
      previousVolumeRef.current = volume;
      audio.muted = true;
      setIsMuted(true);
    }
  };

  const handleVolume = (val: number) => {
    const audio = audioRef.current;
    const v = clamp(val, 0, 1);
    setVolume(v);
    if (v > 0) previousVolumeRef.current = v;
    if (audio) {
      audio.volume = v;
      audio.muted = v === 0;
    }
    setIsMuted(v === 0);
  };

  /* -------------------------------- Derived -------------------------------- */

  const displayTime = scrubTime ?? currentTime;
  const progressPercent = duration > 0 ? clamp((displayTime / duration) * 100, 0, 100) : 0;
  const remainingTime = Math.max(duration - displayTime, 0);
  const effectiveVolume = isMuted ? 0 : volume;

  const VolumeIcon = effectiveVolume === 0 ? VolumeX : effectiveVolume < 0.5 ? Volume1 : Volume2;

  // Deterministic acoustic waveform bars
  const bars = useMemo(
    () =>
      Array.from({ length: BAR_COUNT }, (_, i) => {
        const v = Math.abs(Math.sin(i * 0.63) * 0.55 + Math.cos(i * 0.27 + 1.3) * 0.45);
        return 22 + v * 78;
      }),
    []
  );

  const accentFill = isEndedNaturally ? "bg-emerald-500" : "bg-primary";

  const renderBars = (colorClass: string) => (
    <div className="flex h-full w-full items-center gap-[2px]">
      {bars.map((h, i) => (
        <div
          key={i}
          style={{ height: `${h}%` }}
          className={cn("min-w-0 flex-1 rounded-full", colorClass)}
        />
      ))}
    </div>
  );

  /* --------------------------------- Render -------------------------------- */

  const defaultSupportingText =
    protectionStatus === "protected"
      ? "Protected customer recording"
      : protectionStatus === "private"
      ? "Private storage (Derived verification required)"
      : protectionStatus === "legacy-public"
      ? "Legacy customer recording (Public storage)"
      : "Customer call recording";
  const effectiveSupportingText = supportingText || defaultSupportingText;

  return (
    <div
      className={cn(
        "w-full rounded-2xl border bg-card p-4 shadow-neu-raised transition-all duration-300",
        isEndedNaturally ? "border-emerald-500/40 bg-emerald-500/5 shadow-[0_4px_16px_rgba(16,185,129,0.12)]" : "border-border/80",
        className
      )}
    >
      <audio
        ref={audioRef}
        src={resolvedSrc}
        preload="metadata"
      />

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-neu-inset-sm transition-colors duration-300",
              protectionStatus === "legacy-public"
                ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                : protectionStatus === "private"
                ? "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20"
                : protectionStatus === "protected" && isEndedNaturally
                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                : protectionStatus === "protected" && isPlaying
                ? "bg-primary/15 text-primary border border-primary/20"
                : protectionStatus === "protected"
                ? "bg-primary/10 text-primary border border-primary/20"
                : "bg-muted/80 text-muted-foreground border border-border/80"
            )}
          >
            {protectionStatus === "protected" ? (
              <ShieldCheck className="h-5 w-5" />
            ) : protectionStatus === "private" ? (
              <Lock className="h-5 w-5" />
            ) : protectionStatus === "legacy-public" ? (
              <AlertCircle className="h-5 w-5" />
            ) : (
              <FileAudio className="h-5 w-5" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="truncate text-[14px] font-semibold text-foreground tracking-tight">
                {displayTitle}
              </h4>
              {displayId && (
                <span className="inline-flex items-center rounded-md border border-border/70 bg-muted/70 px-1.5 py-0.5 font-mono text-[11px] font-medium text-muted-foreground shadow-2xs">
                  {displayId}
                </span>
              )}
            </div>
            <p className="text-[12px] text-muted-foreground tabular-nums flex items-center gap-1.5 flex-wrap">
              <span>{effectiveSupportingText}</span>
              <span className="opacity-40">•</span>
              <span className="font-mono">{formatSeconds(duration)}</span>
              {fileSize && (
                <>
                  <span className="opacity-40">•</span>
                  <span className="font-mono">{(fileSize / (1024 * 1024)).toFixed(2)} MB</span>
                </>
              )}
              {isUsingFallback && (
                <span className="ml-1 inline-flex items-center gap-1 text-[11px] text-primary/80 font-normal">
                  <Radio className="h-2.5 w-2.5 animate-pulse text-emerald-500" />
                  Local Demo Audio
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Status pill */}
        <div className="shrink-0">
          {hasError ? (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/30 bg-destructive/10 px-2.5 py-1 text-[11px] font-medium text-destructive shadow-2xs">
              <AlertCircle className="h-3 w-3" />
              Unavailable
            </span>
          ) : protectionStatus === "protected" ? (
            isEndedNaturally ? (
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 shadow-2xs">
                <CheckCircle2 className="h-3 w-3" />
                Protected • Verified
              </span>
            ) : isPlaying ? (
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-primary/25 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary shadow-2xs">
                <span className="flex h-3 items-end gap-[2px]" aria-hidden>
                  {[0, 150, 300].map((delay) => (
                    <span
                      key={delay}
                      className="w-[2px] animate-pulse rounded-full bg-primary"
                      style={{ height: `${60 + (delay / 300) * 40}%`, animationDelay: `${delay}ms` }}
                    />
                  ))}
                </span>
                Protected • Playing
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-lg border border-border/80 bg-muted/60 px-2.5 py-1 text-[11px] font-medium text-muted-foreground shadow-2xs">
                <ShieldCheck className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                Protected
              </span>
            )
          ) : protectionStatus === "private" ? (
            isEndedNaturally ? (
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-1 text-[11px] font-medium text-indigo-600 dark:text-indigo-400 shadow-2xs">
                <CheckCircle2 className="h-3 w-3 text-indigo-500" />
                Private • Verified
              </span>
            ) : isPlaying ? (
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-1 text-[11px] font-medium text-indigo-600 dark:text-indigo-400 shadow-2xs">
                <span className="flex h-3 items-end gap-[2px]" aria-hidden>
                  {[0, 150, 300].map((delay) => (
                    <span
                      key={delay}
                      className="w-[2px] animate-pulse rounded-full bg-indigo-500"
                      style={{ height: `${60 + (delay / 300) * 40}%`, animationDelay: `${delay}ms` }}
                    />
                  ))}
                </span>
                Private • Playing
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-1 text-[11px] font-medium text-indigo-700 dark:text-indigo-300 shadow-2xs">
                <Lock className="h-3 w-3 text-indigo-500" />
                Private • Verification Required
              </span>
            )
          ) : protectionStatus === "legacy-public" ? (
            isEndedNaturally ? (
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-600 dark:text-amber-400 shadow-2xs">
                <CheckCircle2 className="h-3 w-3 text-amber-500" />
                Legacy Public • Verified
              </span>
            ) : isPlaying ? (
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-600 dark:text-amber-400 shadow-2xs">
                <span className="flex h-3 items-end gap-[2px]" aria-hidden>
                  {[0, 150, 300].map((delay) => (
                    <span
                      key={delay}
                      className="w-[2px] animate-pulse rounded-full bg-amber-500"
                      style={{ height: `${60 + (delay / 300) * 40}%`, animationDelay: `${delay}ms` }}
                    />
                  ))}
                </span>
                Legacy Public • Playing
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-700 dark:text-amber-300 shadow-2xs">
                <AlertCircle className="h-3 w-3 text-amber-500" />
                Legacy Public
              </span>
            )
          ) : (
            isEndedNaturally ? (
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-border/80 bg-muted/60 px-2.5 py-1 text-[11px] font-medium text-muted-foreground shadow-2xs">
                <CheckCircle2 className="h-3 w-3 text-muted-foreground" />
                Storage Unverified • Verified
              </span>
            ) : isPlaying ? (
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-border/80 bg-muted/60 px-2.5 py-1 text-[11px] font-medium text-foreground shadow-2xs">
                <Radio className="h-3 w-3 animate-pulse text-muted-foreground" />
                Storage Unverified • Playing
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-border/80 bg-muted/60 px-2.5 py-1 text-[11px] font-medium text-muted-foreground shadow-2xs">
                <FileAudio className="h-3 w-3 text-muted-foreground" />
                Storage Unverified
              </span>
            )
          )}
        </div>
      </div>

      {/* Error explanation if any */}
      {hasError && errorMessage && (
        <div
          role="alert"
          className="mt-3 flex items-start justify-between gap-2 rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2 text-[12.5px] text-destructive shadow-2xs"
        >
          <div className="flex items-start gap-2 min-w-0">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div className="min-w-0">
              <span className="font-medium">{errorMessage}</span>
              <span className="mt-0.5 block truncate font-mono text-[11px] opacity-70">
                VA Nexus Protected Recording {displayId ? `• ${displayId}` : ""}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={handleRetry}
            className="shrink-0 text-[11px] font-semibold underline hover:no-underline text-destructive hover:opacity-80 px-1 py-0.5"
          >
            Retry
          </button>
        </div>
      )}

      {/* Waveform scrubber */}
      <div className="mt-4">
        <Slider
          value={displayTime}
          max={duration}
          step={1}
          ariaLabel="Seek audio position"
          ariaValueText={`${formatSeconds(displayTime)} of ${formatSeconds(duration)}`}
          className="h-14 rounded-xl shadow-neu-inset bg-muted/40 px-3 py-2 border border-border/60"
          onChange={(v) => setScrubTime(limitSeek(v))}
          onCommit={(v) => {
            seekTo(v);
            setScrubTime(null);
          }}
        >
          {({ dragging }) => (
            <div className="relative h-full w-full">
              {/* Base layer */}
              {renderBars("bg-muted-foreground/25")}

              {/* Played layer: smoothly clipped */}
              <div
                className="absolute inset-0"
                style={{ clipPath: `inset(0 ${100 - progressPercent}% 0 0)` }}
              >
                {renderBars(accentFill)}
              </div>

              {/* Playhead marker */}
              <div
                className={cn(
                  "pointer-events-none absolute -top-1 -bottom-1 w-[3px] -translate-x-1/2 rounded-full shadow-sm transition-opacity duration-200",
                  isEndedNaturally ? "bg-emerald-500" : "bg-primary",
                  dragging
                    ? "opacity-100"
                    : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
                )}
                style={{ left: `${progressPercent}%` }}
              />
            </div>
          )}
        </Slider>

        <div className="mt-2 flex items-center justify-between px-1 text-[13px] tabular-nums font-mono text-muted-foreground">
          <span>{formatSeconds(displayTime)}</span>
          <span>-{formatSeconds(remainingTime)}</span>
        </div>
      </div>

      {/* Controls Bar */}
      <div className="mt-3 flex items-center justify-between gap-3">
        {/* Transport */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleRestart}
            disabled={hasError}
            title="Restart"
            aria-label="Restart audio from the beginning"
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground border border-border/70 bg-card shadow-neu-btn hover:shadow-neu-btn-hover active:shadow-neu-inset transition-all duration-200 hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
          >
            <RotateCcw className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() => skipBy(-SKIP_SECONDS)}
            disabled={hasError}
            title={`Back ${SKIP_SECONDS} seconds`}
            aria-label={`Skip back ${SKIP_SECONDS} seconds`}
            className="relative flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground border border-border/70 bg-card shadow-neu-btn hover:shadow-neu-btn-hover active:shadow-neu-inset transition-all duration-200 hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
          >
            <RotateCcw className="h-[18px] w-[18px] -scale-x-100 rotate-180 opacity-0" aria-hidden />
            <span className="absolute text-[11px] font-semibold font-mono tabular-nums">-{SKIP_SECONDS}</span>
          </button>

          <button
            type="button"
            onClick={togglePlay}
            disabled={hasError}
            aria-label={isPlaying ? "Pause audio playback" : "Play audio playback"}
            className={cn(
              "relative mx-1.5 flex h-11 w-11 items-center justify-center rounded-full transition-all duration-300",
              "hover:scale-105 active:scale-95 disabled:pointer-events-none disabled:opacity-50",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              isEndedNaturally && !isPlaying
                ? "bg-emerald-500 text-white shadow-neu-btn hover:shadow-neu-btn-hover active:shadow-neu-inset"
                : "bg-primary text-primary-foreground shadow-neu-btn hover:shadow-neu-btn-hover active:shadow-neu-inset shadow-primary/30",
              isPlaying && "shadow-neu-inset"
            )}
          >
            <Play
              className={cn(
                "absolute h-5 w-5 fill-current transition-all duration-200",
                isPlaying || isBuffering
                  ? "scale-50 opacity-0 -rotate-90"
                  : "scale-100 opacity-100 rotate-0"
              )}
            />
            <Pause
              className={cn(
                "absolute h-5 w-5 fill-current transition-all duration-200",
                isPlaying && !isBuffering
                  ? "scale-100 opacity-100 rotate-0"
                  : "scale-50 opacity-0 rotate-90"
              )}
            />
            <Loader2
              className={cn(
                "absolute h-5 w-5 animate-spin transition-opacity duration-200",
                isBuffering && isPlaying ? "opacity-100" : "opacity-0"
              )}
            />
          </button>

          <button
            type="button"
            onClick={() => skipBy(SKIP_SECONDS)}
            disabled={hasError}
            title={`Forward ${SKIP_SECONDS} seconds`}
            aria-label={`Skip forward ${SKIP_SECONDS} seconds`}
            className="relative flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground border border-border/70 bg-card shadow-neu-btn hover:shadow-neu-btn-hover active:shadow-neu-inset transition-all duration-200 hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
          >
            <RotateCw className="h-[18px] w-[18px] opacity-0" aria-hidden />
            <span className="absolute text-[11px] font-semibold font-mono tabular-nums">+{SKIP_SECONDS}</span>
          </button>
        </div>

        {/* Volume */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={toggleMute}
            aria-label={effectiveVolume === 0 ? "Unmute audio" : "Mute audio"}
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground border border-border/70 bg-card shadow-neu-btn hover:shadow-neu-btn-hover active:shadow-neu-inset transition-all duration-200 hover:text-foreground"
          >
            <VolumeIcon className="h-[18px] w-[18px]" />
          </button>

          <Slider
            value={effectiveVolume}
            max={1}
            step={0.05}
            ariaLabel="Volume"
            ariaValueText={`${Math.round(effectiveVolume * 100)} percent`}
            className="mx-1.5 w-20 py-3 sm:w-24"
            onChange={handleVolume}
          >
            {({ percent, dragging }) => (
              <div className="relative h-2 w-full rounded-full shadow-neu-inset-sm bg-muted/70 border border-border/60">
                <div
                  className={cn(
                    "absolute inset-y-0 left-0 rounded-full bg-primary",
                    !dragging && "transition-[width] duration-150 ease-out"
                  )}
                  style={{ width: `${percent}%` }}
                />
                <div
                  className={cn(
                    "pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border border-border/80 bg-card shadow-neu-btn transition-transform duration-150",
                    dragging ? "scale-110 shadow-neu-inset" : "scale-100 group-hover:scale-105"
                  )}
                  style={{ left: `${percent}%` }}
                />
              </div>
            )}
          </Slider>
        </div>
      </div>

      {/* Compliance / Gating Note */}
      {requiredForAction && (
        <div className="mt-4 border-t border-border/70 pt-3">
          {!isEndedNaturally ? (
            <p className="flex items-center gap-2 text-[13px] font-medium text-amber-600 dark:text-amber-400">
              <span className="inline-block h-2 w-2 shrink-0 animate-pulse rounded-full bg-amber-500" />
              Listen to the full recording to enable {requiredForAction}.
            </p>
          ) : (
            <p className="flex items-center gap-2 text-[13px] font-medium text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
              Recording verified. {requiredForAction} is unlocked.
            </p>
          )}
        </div>
      )}
    </div>
  );
}