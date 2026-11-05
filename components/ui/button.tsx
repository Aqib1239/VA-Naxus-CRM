import * as React from "react";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "destructive" | "success";
  size?: "sm" | "md" | "lg" | "icon";
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      isLoading = false,
      leftIcon,
      rightIcon,
      children,
      disabled,
      ...props
    },
    ref
  ) => {
    const baseStyles =
      "inline-flex items-center justify-center font-medium transition-all duration-150 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1 disabled:opacity-50 disabled:pointer-events-none active:translate-y-0 select-none text-sm";

    const variants = {
      primary:
        "bg-primary text-primary-foreground shadow-[3px_3px_10px_rgba(97,75,238,0.35),-3px_-3px_8px_rgba(255,255,255,0.9)] dark:shadow-[3px_3px_10px_rgba(0,0,0,0.5),-1px_-1px_4px_rgba(255,255,255,0.06)] hover:brightness-105 active:shadow-[inset_2px_2px_4px_rgba(0,0,0,0.25)] border border-primary/20 font-semibold",
      secondary:
        "bg-card text-secondary-foreground shadow-neu-btn hover:shadow-neu-btn-hover active:shadow-neu-inset border border-border/70 font-medium",
      outline:
        "border border-border/80 bg-card hover:bg-muted/40 text-foreground shadow-neu-btn hover:shadow-neu-btn-hover active:shadow-neu-inset font-medium",
      ghost:
        "text-muted-foreground hover:text-foreground hover:bg-muted/60 active:shadow-neu-inset-sm transition-colors",
      destructive:
        "bg-destructive text-destructive-foreground shadow-[3px_3px_8px_rgba(239,68,68,0.3),-2px_-2px_6px_rgba(255,255,255,0.8)] dark:shadow-[3px_3px_8px_rgba(0,0,0,0.5)] hover:brightness-105 active:shadow-[inset_2px_2px_4px_rgba(0,0,0,0.25)] border border-transparent font-semibold",
      success:
        "bg-success text-success-foreground shadow-[3px_3px_8px_rgba(16,185,129,0.3),-2px_-2px_6px_rgba(255,255,255,0.8)] dark:shadow-[3px_3px_8px_rgba(0,0,0,0.5)] hover:brightness-105 active:shadow-[inset_2px_2px_4px_rgba(0,0,0,0.25)] border border-transparent font-semibold",
    };

    const sizes = {
      sm: "h-8 px-3 text-ui-sm gap-1.5 rounded-lg",
      md: "h-10 px-4 text-sm gap-2 rounded-xl",
      lg: "h-11 px-5 text-base gap-2.5 font-semibold rounded-xl",
      icon: "h-9 w-9 p-0 rounded-xl",
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        {...props}
      >
        {isLoading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
        ) : (
          leftIcon && <span className="shrink-0">{leftIcon}</span>
        )}
        {children}
        {!isLoading && rightIcon && <span className="shrink-0">{rightIcon}</span>}
      </button>
    );
  }
);

Button.displayName = "Button";
