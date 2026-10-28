"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, LoginFormData } from "@/schemas/auth.schema";
import { useAuth } from "@/context/auth-context";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Role } from "@/types/auth";
import { MOCK_USERS, ROLE_CONFIGS } from "@/constants/roles";
import {
  Building2,
  Lock,
  Mail,
  Eye,
  EyeOff,
  Sparkles,
  ArrowRight,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { VANexusLogo } from "@/components/ui/va-nexus-logo";

export default function LoginPage() {
  const router = useRouter();
  const { login, user, isReady } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedRole, setSelectedRole] = useState<Role>("ADMIN");

  React.useEffect(() => {
    if (isReady && user) {
      router.replace("/");
    }
  }, [isReady, user, router]);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "admin@vibhanu.com",
      password: "VibhAnu@123",
      rememberMe: true,
    },
  });

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true);
    try {
      await login(data.email, data.password);
      router.push("/");
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRolePreset = (role: Role) => {
    const user = MOCK_USERS[role];

    setSelectedRole(role);

    setValue("email", user.email, {
      shouldValidate: true,
    });

    setValue("password", "VibhAnu@123", {
      shouldValidate: true,
    });
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center p-4 bg-background relative selection:bg-primary/20">
      {/* Top Right Controls */}
      <div className="absolute top-4 right-4 flex items-center gap-2">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-3">
          <div className="flex justify-center">
            <VANexusLogo variant="full" size="lg" />
          </div>
          <p className="text-[13px] text-muted-foreground font-medium">
            AI-Powered Customer & Business Operations Platform
          </p>
        </div>

        {/* Login Form Card */}
        <div className="rounded-2xl border border-border/80 bg-card p-6 sm:p-8 shadow-neu-raised-lg space-y-5">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4.5">
            {/* Email Field */}
            <div className="space-y-1.5">
              <Label htmlFor="login-email" required className="text-[14px]">
                Corporate Email / Username
              </Label>
              <Input
                id="login-email"
                type="email"
                placeholder="name@vanexus.ai"
                leftIcon={<Mail className="w-4 h-4" />}
                error={errors.email?.message}
                {...register("email")}
              />
              {errors.email && (
                <p className="text-[12px] text-destructive">
                  {errors.email.message}
                </p>
              )}
            </div>

            {/* Password Field */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label
                  htmlFor="login-password"
                  required
                  className="text-[14px]"
                >
                  Password
                </Label>
                <Link
                  href="/forgot-password"
                  className="text-[13px] text-primary hover:underline font-medium"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  leftIcon={<Lock className="w-4 h-4" />}
                  rightIcon={
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={
                        showPassword ? "Hide password" : "Show password"
                      }
                      className="text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  }
                  error={errors.password?.message}
                  {...register("password")}
                />
              </div>
              {errors.password && (
                <p className="text-[12px] text-destructive">
                  {errors.password.message}
                </p>
              )}
            </div>

            {/* Remember Me */}
            <div className="flex items-center gap-2 pt-0.5">
              <input
                id="rememberMe"
                type="checkbox"
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary accent-primary"
                {...register("rememberMe")}
              />
              <Label
                htmlFor="rememberMe"
                className="text-[13px] font-normal text-muted-foreground cursor-pointer"
              >
                Remember my login credentials on this workstation
              </Label>
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              className="w-full text-[15px] h-11"
              isLoading={isLoading}
              rightIcon={<ArrowRight className="w-4 h-4" />}
            >
              Sign In to VA Nexus
            </Button>
          </form>

          {/* Quick Demo Role Presets */}
          <div className="pt-4 border-t border-border/70 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                Demo Role Presets
              </span>
              <span className="text-[11px] text-muted-foreground">
                Click to fill
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  "ADMIN",
                  "MARKETING",
                  "COMMUNICATION",
                  "VIGILANCE",
                  "SUPPORT",
                  "SALES",
                ] as Role[]
              ).map((r) => {
                const cfg = ROLE_CONFIGS[r];
                const isSelected = selectedRole === r;

                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => handleRolePreset(r)}
                    aria-pressed={isSelected}
                    className={cn(
                      "p-2.5 rounded-xl border text-[12px] font-semibold text-center transition-all duration-200 truncate",
                      isSelected
                        ? "bg-primary/10 text-primary border-primary/40 shadow-neu-inset"
                        : "border-border/70 bg-card text-foreground shadow-neu-btn hover:shadow-neu-btn-hover active:shadow-neu-inset"
                    )}
                  >
                    {cfg.badgeLabel}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Security Footer */}
        <div className="text-center text-[13px] text-muted-foreground flex items-center justify-center gap-1.5">
          <ShieldCheck className="w-4 h-4 text-muted-foreground/80" />
          <span>Role-Based Access Control Protected Frontend Architecture</span>
        </div>
      </div>
    </div>
  );
}
