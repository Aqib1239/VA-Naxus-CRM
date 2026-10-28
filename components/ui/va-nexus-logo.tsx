"use client";

import React, { useId } from "react";
import { cn } from "@/lib/utils";

interface VANexusLogoProps {
  variant?: "icon" | "wordmark" | "full";
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

export function VANexusLogo({
  variant = "full",
  size = "md",
  className,
}: VANexusLogoProps) {
  const sizeMap = {
    sm: { icon: 24, font: "text-sm", tagline: "text-[9px]" },
    md: { icon: 32, font: "text-base", tagline: "text-[10px]" },
    lg: { icon: 40, font: "text-xl", tagline: "text-xs" },
    xl: { icon: 52, font: "text-2xl", tagline: "text-sm" },
  };

  const currentSize = sizeMap[size];

  const uid = useId().replace(/:/g, ""); // unique ids so multiple logos on one page don't clash
  const g = (name: string) => `${name}-${uid}`;

  // Stylized Geometric "VA" Monogram with Nexus Connection Nodes
  const IconSvg = (
    <svg
      width={currentSize.icon}
      height={currentSize.icon}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="shrink-0 transition-transform duration-300 group-hover:scale-105"
      role="img"
      aria-label="VA Nexus Logo Icon"
    >
      <defs>
        {/* userSpaceOnUse so gradients also work on straight/horizontal strokes */}
        <linearGradient id={g("mark")} gradientUnits="userSpaceOnUse" x1="10" y1="12" x2="38" y2="36">
          <stop offset="0%" stopColor="#93C5FD" />
          <stop offset="55%" stopColor="#3B82F6" />
          <stop offset="100%" stopColor="#2563EB" />
        </linearGradient>
        <linearGradient id={g("bg")} gradientUnits="userSpaceOnUse" x1="4" y1="2" x2="44" y2="46">
          <stop offset="0%" stopColor="#1E293B" />
          <stop offset="100%" stopColor="#020617" />
        </linearGradient>
        <linearGradient id={g("rim")} gradientUnits="userSpaceOnUse" x1="2" y1="2" x2="46" y2="46">
          <stop offset="0%" stopColor="#60A5FA" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#1D4ED8" stopOpacity="0.15" />
        </linearGradient>
        <filter id={g("glow")} x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="1.5" stdDeviation="2.5" floodColor="#3B82F6" floodOpacity="0.55" />
        </filter>
      </defs>

      {/* Container */}
      <rect x="1.5" y="1.5" width="45" height="45" rx="12" fill={`url(#${g("bg")})`} />
      <rect x="1.5" y="1.5" width="45" height="45" rx="12" stroke={`url(#${g("rim")})`} strokeWidth="1.25" />

      {/* Subtle top highlight */}
      <path d="M 8 1.8 H 40" stroke="#FFFFFF" strokeOpacity="0.12" strokeWidth="1" strokeLinecap="round" />

      {/* V + A zigzag: V (left) shares its right arm with A's left leg */}
      <path
        d="M 10.5 12 L 19.5 36 L 28.5 12 L 37.5 36"
        stroke={`url(#${g("mark")})`}
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
        filter={`url(#${g("glow")})`}
      />

      {/* A crossbar (sits exactly on the A's legs at y=28) */}
      <path d="M 22.5 28 L 34.5 28" stroke="#BFDBFE" strokeWidth="2.5" strokeLinecap="round" />

      {/* Nexus core node on the crossbar */}
      <circle cx="28.5" cy="28" r="3.2" fill="#FFFFFF" />
      <circle cx="28.5" cy="28" r="1.5" fill="#2563EB" />

      {/* Connection nodes at the vertices */}
      <circle cx="10.5" cy="12" r="1.9" fill="#BFDBFE" />
      <circle cx="28.5" cy="12" r="1.9" fill="#93C5FD" />
      <circle cx="19.5" cy="36" r="1.9" fill="#60A5FA" />
      <circle cx="37.5" cy="36" r="1.9" fill="#3B82F6" />
    </svg>
  );

  if (variant === "icon") {
    return <div className={cn("inline-flex items-center justify-center", className)}>{IconSvg}</div>;
  }

  if (variant === "wordmark") {
    return (
      <div className={cn("flex flex-col leading-none", className)}>
        <span className={cn("font-black tracking-tight text-foreground font-sans", currentSize.font)}>
          VA <span className="text-primary font-extrabold">NEXUS</span>
        </span>
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-3 select-none group", className)}>
      {IconSvg}
      <div className="flex flex-col">
        <div className="flex items-center gap-1.5 leading-none">
          <span className={cn("font-black tracking-tight text-foreground font-sans", currentSize.font)}>
            VA <span className="text-primary font-extrabold">NEXUS</span>
          </span>
          <span className="rounded-[4px] bg-primary/10 px-1 py-0.2 font-mono text-[9px] font-bold text-primary uppercase tracking-wider">
            OS
          </span>
        </div>
        <span className={cn("font-medium tracking-wide text-muted-foreground", currentSize.tagline)}>
          Connect. Automate. Accelerate.
        </span>
      </div>
    </div>
  );
}
