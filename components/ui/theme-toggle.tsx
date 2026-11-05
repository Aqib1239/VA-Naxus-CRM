"use client";

import * as React from "react";
import { flushSync } from "react-dom";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "./button";

export type TransitionType = "diagonal" | "diagonal-split" | "horizontal" | "vertical";
export type TransitionDirection = "top-left-to-bottom-right" | "bottom-right-to-top-left";

const BUTTER_EASING =
  "linear(0, 0.004, 0.016 1.6%, 0.063 3.6%, 0.285 8.6%, 0.653 14.3%, 0.885 19.2%, 0.996 23.8%, 1.049 26.6%, 1.075 29.6%, 1.083 32.2%, 1.081 35%, 1.069 38.8%, 1.036 44.1%, 1.012 48.4%, 0.997 53.1%, 0.992 59.2%, 0.994 64.5%, 0.999 70.4%, 1.001 74.6%, 1.001 79.6%, 1)";
const FALLBACK_EASING = "cubic-bezier(0.16, 1, 0.3, 1)";

const WIPE_DURATION = 3800;
const ICON_DURATION_MS = 550;

function getEasing(): string {
  if (typeof CSS !== "undefined" && CSS.supports?.("animation-timing-function", BUTTER_EASING)) {
    return BUTTER_EASING;
  }
  return FALLBACK_EASING;
}

function getClipPaths(type: TransitionType, direction: TransitionDirection) {
  if (type === "diagonal" || type === "diagonal-split") {
    const o = direction === "bottom-right-to-top-left" ? "100% 100%" : "0% 0%";
    return { from: `circle(0% at ${o})`, to: `circle(300% at ${o})` };
  }
  if (type === "horizontal") {
    return { from: "inset(50% 0 50% 0 round 40px)", to: "inset(0 0 0 0 round 0px)" };
  }
  return { from: "inset(0 50% 0 50% round 40px)", to: "inset(0 0 0 0 round 0px)" };
}

function animateWipe(type: TransitionType, direction: TransitionDirection) {
  const root = document.documentElement;
  const easing = getEasing();
  const { from, to } = getClipPaths(type, direction);

  root.animate({ clipPath: [from, to] }, {
    duration: WIPE_DURATION,
    easing,
    fill: "both",
    pseudoElement: "::view-transition-new(root)",
  });

  root.animate(
    { opacity: [1, 0.9] },
    {
      duration: WIPE_DURATION,
      easing,
      fill: "both",
      pseudoElement: "::view-transition-old(root)",
    }
  );
}

export interface ThemeToggleProps {
  className?: string;
  type?: TransitionType;
}

export function ThemeToggle({ className, type = "diagonal" }: ThemeToggleProps) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  const busyRef = React.useRef(false);
  const transitionRef = React.useRef<any>(null);

  React.useEffect(() => setMounted(true), []);

  // Cancel the running wipe on any user input. The new theme is already
  // applied underneath, so skipping just jumps to the finished state and
  // gives the page back to the user immediately.
  React.useEffect(() => {
    const skip = () => transitionRef.current?.skipTransition();
    const events = ["pointerdown", "wheel", "touchstart", "keydown"] as const;
    const opts = { capture: true, passive: true } as const;

    events.forEach((e) => window.addEventListener(e, skip, opts));
    return () => events.forEach((e) => window.removeEventListener(e, skip, opts));
  }, []);

  const isDark = (resolvedTheme || theme) === "dark";

  const handleToggle = React.useCallback(() => {
    if (busyRef.current) return;
    busyRef.current = true;
    setTimeout(() => (busyRef.current = false), 300);

    const nextTheme = isDark ? "light" : "dark";
    const direction: TransitionDirection =
      nextTheme === "dark" ? "top-left-to-bottom-right" : "bottom-right-to-top-left";

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const doc = document as any;

    if (reducedMotion || !("startViewTransition" in doc)) {
      setTheme(nextTheme);
      return;
    }

    try {
      const transition = doc.startViewTransition(() => {
        flushSync(() => setTheme(nextTheme));
      });

      transitionRef.current = transition;
      transition.finished
        .catch(() => {})
        .finally(() => {
          if (transitionRef.current === transition) transitionRef.current = null;
        });

      transition.ready.then(() => animateWipe(type, direction)).catch(() => {});
    } catch {
      setTheme(nextTheme);
    }
  }, [isDark, setTheme, type]);

  if (!mounted) {
    return (
      <Button variant="ghost" size="icon" className="w-8 h-8 opacity-0">
        <Sun className="h-4 w-4" />
      </Button>
    );
  }

  const iconTransition = { duration: ICON_DURATION_MS / 1000, ease: [0.16, 1, 0.3, 1] as const };

  return (
    <Button
      variant="ghost"
      size="icon"
      className={className || "w-8 h-8 text-muted-foreground hover:text-foreground"}
      onClick={handleToggle}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      <AnimatePresence mode="wait" initial={false}>
        {isDark ? (
          <motion.span
            key="sun"
            initial={{ opacity: 0, scale: 0.4, rotate: 30, filter: "blur(5px)" }}
            animate={{ opacity: 1, scale: 1, rotate: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, scale: 0.4, rotate: -30, filter: "blur(5px)" }}
            transition={iconTransition}
            className="flex items-center justify-center text-amber-500 dark:text-amber-400"
          >
            <Sun className="h-4 w-4" />
          </motion.span>
        ) : (
          <motion.span
            key="moon"
            initial={{ opacity: 0, scale: 0.4, rotate: -30, filter: "blur(5px)" }}
            animate={{ opacity: 1, scale: 1, rotate: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, scale: 0.4, rotate: 30, filter: "blur(5px)" }}
            transition={iconTransition}
            className="flex items-center justify-center text-foreground"
          >
            <Moon className="h-4 w-4" />
          </motion.span>
        )}
      </AnimatePresence>
    </Button>
  );
}