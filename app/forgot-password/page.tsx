"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { forgotPasswordSchema, ForgotPasswordFormData } from "@/schemas/auth.schema";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Mail, ArrowLeft, CheckCircle2 } from "lucide-react";
import { VANexusLogo } from "@/components/ui/va-nexus-logo";

export default function ForgotPasswordPage() {
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordFormData>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: "",
    },
  });

  const onSubmit = async (data: ForgotPasswordFormData) => {
    setIsLoading(true);
    await new Promise((r) => setTimeout(r, 600));
    setIsLoading(false);
    setIsSubmitted(true);
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center p-4 bg-background relative selection:bg-primary/20">
      <div className="absolute top-4 right-4 flex items-center gap-2">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="flex justify-center mb-1">
            <VANexusLogo variant="icon" size="lg" />
          </div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Account Recovery</h1>
          <p className="text-xs text-muted-foreground">
            Enter your registered email to receive access credentials
          </p>
        </div>

        <div className="rounded-2xl border border-border/80 bg-card p-6 sm:p-8 shadow-neu-raised-lg space-y-4">
          {isSubmitted ? (
            <div className="text-center space-y-3 py-2">
              <div className="h-12 w-12 rounded-2xl bg-card border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto shadow-neu-btn">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-semibold text-foreground">Password Reset Link Dispatched</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Instructions have been dispatched to your corporate inbox.
              </p>
              <Link href="/login" className="inline-block pt-2">
                <Button variant="outline" size="sm">
                  Back to Sign In
                </Button>
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="reset-email" required>
                  Corporate Email
                </Label>
                <Input
                  id="reset-email"
                  type="email"
                  placeholder="name@vanexus.ai"
                  leftIcon={<Mail className="w-4 h-4" />}
                  error={errors.email?.message}
                  {...register("email")}
                />
                {errors.email && (
                  <p className="text-[11px] text-destructive">{errors.email.message}</p>
                )}
              </div>

              <Button type="submit" className="w-full" isLoading={isLoading}>
                Send Recovery Instructions
              </Button>

              <div className="text-center pt-2">
                <Link
                  href="/login"
                  className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Back to Sign In
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
