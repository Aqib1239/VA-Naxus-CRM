"use client";

import * as React from "react";
import { Button } from "./button";
import { X, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "primary" | "destructive" | "success";
  isLoading?: boolean;
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "primary",
  isLoading = false,
}: ConfirmDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="relative w-full max-w-md rounded-2xl border border-border/80 bg-card p-6 shadow-neu-raised-lg space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            {variant === "destructive" && (
              <div className="p-2 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 shadow-neu-inset-sm">
                <AlertCircle className="w-5 h-5" />
              </div>
            )}
            <h3 className="text-base font-semibold text-foreground tracking-tight">{title}</h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="text-muted-foreground hover:text-foreground rounded-xl p-1.5 hover:bg-muted/60 border border-border/60 shadow-neu-btn active:shadow-neu-inset transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed">
          {description}
        </p>

        <div className="flex items-center justify-end gap-2.5 pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={isLoading}
          >
            {cancelText}
          </Button>
          <Button
            variant={variant === "destructive" ? "destructive" : variant === "success" ? "success" : "primary"}
            size="sm"
            onClick={onConfirm}
            isLoading={isLoading}
          >
            {confirmText}
          </Button>
        </div>
      </div>
    </div>
  );
}
