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
  Loader2,
  AlertCircle,
  Radio,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Slider, clamp } from "@/components/ui/audio-slider";

// Re-export Slider and AudioSlider for backward compatibility
export { Slider, AudioSlider } from "@/components/ui/audio-slider";

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

export interface AudioPlayerProps {
  src?: string;
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

/**
 * Resolves an audio URL to a fully-qualified authenticated endpoint if targeting backend.
 * Never appends duplicate tokens and expands relative endpoints to the backend API origin.
 */
function resolveAudioUrl(src: string): string {
  if (!src || src.startsWith("blob:") || src.startsWith("data:")) {
    return src;
  }

  // Cloudinary direct CDN URLs should never have local tokens appended or be rewritten
  if (src.startsWith("https://res.cloudinary.com/")) {
    return src;
  }

  const token =
    typeof window !== "undefined"
      ? localStorage.getItem("vibhanu_crm_token") || localStorage.getItem("vibhanu_auth_token")
      : null;

  let resolved = src;

  // 1. If relative URL, expand to backend API server
  if (resolved.startsWith("/")) {
    const apiBase = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api").replace(/\/$/, "");
    const backendOrigin = apiBase.replace(/\/api$/, "");
    if (resolved.startsWith("/api/")) {
      resolved = `${backendOrigin}${resolved}`;
    } else if (resolved.startsWith("/leads/")) {
      resolved = `${apiBase}${resolved}`;
    }
  }

  // 2. If it is an authenticated /audio endpoint and token is missing, append token once
  const isAudioEndpoint = resolved.includes("/leads/") && resolved.includes("/audio");
  if (isAudioEndpoint && token) {
    const hasToken = /[?&]token=/.test(resolved);
    if (!hasToken) {
      resolved = `${resolved}${resolved.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}`;
    }
  }

  return resolved;
}

/* -------------------------------------------------------------------------- */
/*  Main AudioPlayer Component                                                */
/* -------------------------------------------------------------------------- */

export function AudioPlayer({
  src,
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
}: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const maxReachedRef = useRef(0);
  const onNaturalEndRef = useRef(onNaturalEnd);
  const onTimeUpdateRef = useRef(onTimeUpdate);
  const previousVolumeRef = useRef(1);
  const isFallbackActiveRef = useRef(false);

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

    // 2. No source provided
    if (!src) {
      if (allowDemoFallback) {
        const fallbackUrl = DEFAULT_FALLBACK_AUDIO;
        createdUrl = fallbackUrl.startsWith("blob:") ? fallbackUrl : null;
        setResolvedSrc(fallbackUrl);
        setIsUsingFallback(true);
        isFallbackActiveRef.current = true;
      } else {
        setHasError(true);
        setErrorMessage("Audio recording is not attached to this lead.");
      }
      return () => {
        cancelled = true;
        if (createdUrl) URL.revokeObjectURL(createdUrl);
      };
    }

    // 3. Resolve target URL directly with single token
    const targetSrc = resolveAudioUrl(src);
    setResolvedSrc(targetSrc);

    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [src, file, fileName, mimeType, durationSeconds, isCompleted, allowDemoFallback]);

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
    };

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onWaiting = () => setIsBuffering(true);
    const onReady = () => {
      setIsBuffering(false);
      setHasError(false);
    };

    const onError = () => {
      // Only switch to demo audio if explicitly permitted
      if (allowDemoFallback && !isFallbackActiveRef.current) {
        isFallbackActiveRef.current = true;
        setIsUsingFallback(true);
        setResolvedSrc(DEFAULT_FALLBACK_AUDIO);
        setHasError(false);
        setErrorMessage(null);
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
              isEndedNaturally
                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                : isPlaying
                ? "bg-primary/15 text-primary border border-primary/20"
                : "bg-muted/70 text-muted-foreground border border-border/60"
            )}
          >
            <FileAudio className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h4 className="truncate text-[14px] font-semibold text-foreground">{fileName}</h4>
            <p className="text-[12.5px] text-muted-foreground tabular-nums font-mono">
              {fileSize ? `${(fileSize / (1024 * 1024)).toFixed(2)} MB` : "Audio stream"}
              <span className="mx-1.5 opacity-50">/</span>
              {formatSeconds(duration)}
              {isUsingFallback && (
                <span className="ml-2 inline-flex items-center gap-1 text-[11px] text-primary/80 font-normal">
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
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/30 bg-destructive/10 px-2.5 py-0.5 text-[11px] font-medium text-destructive shadow-2xs">
              <AlertCircle className="h-3 w-3" />
              Unavailable
            </span>
          ) : isEndedNaturally ? (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 shadow-2xs">
              <CheckCircle2 className="h-3 w-3" />
              Verified
            </span>
          ) : isPlaying ? (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-primary/25 bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary shadow-2xs">
              <span className="flex h-3 items-end gap-[2px]" aria-hidden>
                {[0, 150, 300].map((delay) => (
                  <span
                    key={delay}
                    className="w-[2px] animate-pulse rounded-full bg-primary"
                    style={{ height: `${60 + (delay / 300) * 40}%`, animationDelay: `${delay}ms` }}
                  />
                ))}
              </span>
              Playing
            </span>
          ) : (
            <span className="inline-flex items-center rounded-lg border border-border/80 bg-muted/60 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground shadow-2xs">
              {currentTime > 0 ? "Paused" : "Ready"}
            </span>
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
                File: {fileName || "audio recording"}
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