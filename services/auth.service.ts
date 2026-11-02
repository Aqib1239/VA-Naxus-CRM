import { User, Role, AuthSession, Permission } from "@/types/auth";
import { ROLE_CONFIGS } from "@/constants/roles";
import { api } from "./api";

const STORAGE_KEY_USER = "vibhanu_crm_user";
const STORAGE_KEY_TOKEN = "vibhanu_crm_token";

export class AuthService {
  /**
   * Get currently logged-in user from local persistence or null if not logged in
   */
  static getCurrentUser(): User | null {
    if (typeof window === "undefined") {
      return null;
    }

    try {
      const savedUser = localStorage.getItem(STORAGE_KEY_USER);
      if (savedUser) {
        return JSON.parse(savedUser);
      }
    } catch (e) {
      console.error("Failed to parse stored user", e);
    }

    return null;
  }

  static getToken(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(STORAGE_KEY_TOKEN);
  }

  static clearAuth(): void {
    if (typeof window !== "undefined") {
      localStorage.removeItem(STORAGE_KEY_USER);
      localStorage.removeItem(STORAGE_KEY_TOKEN);
    }
  }

  static setCurrentUser(user: User, token?: string): void {
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(user));
      if (token) {
        localStorage.setItem(STORAGE_KEY_TOKEN, token);
      }
    }
  }

  private static sessionPromise: Promise<string | null> | null = null;

  /**
   * Ensures a valid backend JWT session exists.
   * Deduplicates concurrent calls to prevent multiple simultaneous login requests.
   * Returns token if valid, or null if missing/expired.
   */
  static async ensureSession(): Promise<string | null> {
    if (typeof window === "undefined") return null;

    if (this.sessionPromise) {
      return this.sessionPromise;
    }

    this.sessionPromise = (async () => {
      try {
        const existingToken = localStorage.getItem(STORAGE_KEY_TOKEN);
        if (existingToken && existingToken.split(".").length === 3) {
          try {
            const payloadBase64 = existingToken.split(".")[1];
            const payloadJson = JSON.parse(atob(payloadBase64));
            if (payloadJson.exp && payloadJson.exp * 1000 > Date.now() + 60000) {
              return existingToken;
            }
          } catch (_) {}
        }

        // Token is missing, expired, or invalid — clear invalid session
        this.clearAuth();
        return null;
      } catch (err) {
        console.warn("[AuthService] ensureSession check failed:", err);
        this.clearAuth();
        return null;
      } finally {
        this.sessionPromise = null;
      }
    })();

    return this.sessionPromise;
  }

  /**
   * Login user with real REST backend API
   */
  static async login(email: string, password: string): Promise<AuthSession> {
    const response = await api.post<{ user: User; token: string }>("/auth/login", {
      email: email.trim(),
      password,
    });

    const user = response.data.user;
    const token = response.data.token;

    this.setCurrentUser(user, token);

    return {
      user,
      token,
    };
  }

  /**
   * Logout user
   */
  static async logout(): Promise<void> {
    try {
      await api.post("/auth/logout");
    } catch {
      // Ignore network logout errors
    } finally {
      this.clearAuth();
    }
  }

  /**
   * Verify if a role has specific permission
   */
  static hasPermission(role: Role, permission: Permission): boolean {
    const config = ROLE_CONFIGS[role];
    if (!config) return false;
    return config.permissions.includes(permission);
  }

  /**
   * Verify if a role can access a department
   */
  static canAccessDepartment(role: Role, department: string): boolean {
    if (role === "ADMIN") return true;
    const config = ROLE_CONFIGS[role];
    return config?.allowedDepartments.includes(department) ?? false;
  }
}

if (typeof window !== "undefined") {
  api.setOnAuthError(async () => {
    return await AuthService.ensureSession();
  });
}
