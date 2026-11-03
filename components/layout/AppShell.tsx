
"use client";

import React, { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/auth-context";
import { MainContentLoader } from "@/components/ui/main-content-loader";
import { PageTransition } from "@/components/ui/page-transition";
import { AccessRestricted } from "@/components/ui/access-restricted";
import { Role } from "@/types/auth";

const DEPARTMENT_ROUTE_PERMISSIONS: Record<
  string,
  { title: string; allowedRoles: Role[] }
> = {
  "/marketing": {
    title: "Marketing Workspace",
    allowedRoles: ["ADMIN", "MARKETING"],
  },
  "/communication": {
    title: "Communication Workspace",
    allowedRoles: ["ADMIN", "COMMUNICATION"],
  },
  "/vigilance": {
    title: "Vigilance Workspace",
    allowedRoles: ["ADMIN", "VIGILANCE"],
  },
  "/support": {
    title: "Support Workspace",
    allowedRoles: ["ADMIN", "SUPPORT"],
  },
  "/sales": {
    title: "Sales Workspace",
    allowedRoles: ["ADMIN", "SALES"],
  },
};

export function AppShell({ children }: { children: React.ReactNode }) {
  // All hooks must execute in the same order on every render.
  const pathname = usePathname();
  const router = useRouter();
  const { user, isReady } = useAuth();

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  // Derived values: these are ordinary calculations, not hooks.
  const isAuthPage =
    pathname === "/login" || pathname === "/forgot-password";

  const matchedRoute = Object.keys(DEPARTMENT_ROUTE_PERMISSIONS).find(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );

  const routeRestriction = matchedRoute
    ? DEPARTMENT_ROUTE_PERMISSIONS[matchedRoute]
    : null;

  const isRoleAuthorized =
    !routeRestriction ||
    (!!user &&
      (user.role === "ADMIN" ||
        routeRestriction.allowedRoles.includes(user.role)));

  // Authentication redirect.
  useEffect(() => {
    if (isReady && !user && !isAuthPage) {
      router.replace("/login");
    }
  }, [isReady, user, isAuthPage, router]);

  // Authentication pages render without the CRM shell.
  if (isAuthPage) {
    return (
      <main className="min-h-screen bg-background">
        {children}
      </main>
    );
  }

  // Never mount protected dashboard content before authentication
  // has been verified.
  if (!isReady || !user) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center">
        <MainContentLoader
          label="Authenticating session..."
          description="Verifying security credentials"
        />
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground antialiased flex flex-col">
      {/* Sidebar (Desktop + Mobile) */}
      <Sidebar
        isCollapsed={isCollapsed}
        setIsCollapsed={setIsCollapsed}
        isMobileOpen={isMobileOpen}
        setIsMobileOpen={setIsMobileOpen}
      />

      {/* Main Layout Area */}
      <div
        className={cn(
          "flex flex-1 flex-col transition-[padding] duration-350 ease-[cubic-bezier(0.22,1,0.36,1)] min-w-0",
          isCollapsed ? "md:pl-[72px]" : "md:pl-[244px]"
        )}
      >
        {/* Top Header */}
        <Header
          onToggleMobileMenu={() =>
            setIsMobileOpen((previous) => !previous)
          }
        />

        {/* Main Content Area */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1440px] w-full mx-auto min-h-[calc(100vh-64px)] flex flex-col">
          {isRoleAuthorized ? (
            <PageTransition>{children}</PageTransition>
          ) : (
            <AccessRestricted
              departmentName={routeRestriction?.title}
              requiredRoles={routeRestriction?.allowedRoles || []}
              currentRole={user.role}
            />
          )}
        </main>
      </div>
    </div>
  );
}
