"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { User, Role, Permission } from "@/types/auth";
import { AuthService } from "@/services/auth.service";
import { api } from "@/services/api";
import { toast } from "sonner";

interface AuthContextType {
  user: User | null;
  role: Role | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isReady: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  hasPermission: (permission: Permission) => boolean;
  canAccessDepartment: (department: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Deterministic initial render: null unauthenticated state until session validation completes
  const [user, setUser] = useState<User | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    let isMounted = true;
    const initAuth = async () => {
      try {
        const storedUser = AuthService.getCurrentUser();
        const storedToken = AuthService.getToken();
        if (storedUser && storedToken) {
          // Validate existing session token against expiration
          const validToken = await AuthService.ensureSession();
          if (validToken && isMounted) {
            // Authoritatively verify session with the backend
            try {
              const res = await api.get<{ user: User }>("/auth/me");
              if (res.data?.user && isMounted) {
                setUser(res.data.user);
                AuthService.setCurrentUser(res.data.user, validToken);
              } else if (isMounted) {
                AuthService.clearAuth();
                setUser(null);
              }
            } catch (err) {
              console.warn("[AuthContext] Backend session verification failed, clearing auth:", err);
              if (isMounted) {
                AuthService.clearAuth();
                setUser(null);
              }
            }
          } else if (isMounted) {
            AuthService.clearAuth();
            setUser(null);
          }
        } else if (isMounted) {
          AuthService.clearAuth();
          setUser(null);
        }
      } catch (e) {
        console.error("Auth init error", e);
        if (isMounted) {
          AuthService.clearAuth();
          setUser(null);
        }
      } finally {
        if (isMounted) {
          setIsHydrated(true);
          setIsReady(true);
        }
      }
    };
    initAuth();
    return () => {
      isMounted = false;
    };
  }, []);

  const login = async (email: string, password: string) => {
    setIsAuthLoading(true);
    try {
      const session = await AuthService.login(email, password);
      setUser(session.user);
      toast.success(`Welcome back, ${session.user.name}`, {
        description: `Logged in with ${session.user.role} privileges`,
      });
    } catch (e: any) {
      toast.error("Login failed", { description: e?.message || "Invalid credentials" });
      throw e;
    } finally {
      setIsAuthLoading(false);
    }
  };

  const logout = async () => {
    try {
      await AuthService.logout();
    } catch (_) {
      // ignore backend errors on logout – clear locally regardless
    }
    setUser(null);
    toast.info("Logged out", { description: "You have been signed out." });
    router.push("/login");
  };

  const hasPermission = (permission: Permission): boolean => {
    if (!user) return false;
    return AuthService.hasPermission(user.role, permission);
  };

  const canAccessDepartment = (department: string): boolean => {
    if (!user) return false;
    return AuthService.canAccessDepartment(user.role, department);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        role: user ? user.role : null,
        isAuthenticated: !!user && isReady,
        isLoading: !isHydrated || !isReady || isAuthLoading,
        isReady,
        login,
        logout,
        hasPermission,
        canAccessDepartment,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
