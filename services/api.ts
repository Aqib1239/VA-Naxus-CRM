/**
 * API Service Client Abstraction
 *
 * Provides a unified HTTP client interface connected to the REST backend.
 * Includes automatic 401 session recovery interceptor.
 */

export interface ApiResponse<T> {
  data: T;
  message?: string;
  success: boolean;
  timestamp?: string;
  errors?: Record<string, string> | string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

class ApiClient {
  private baseUrl: string;
  private onAuthError?: () => Promise<string | null>;
  private refreshPromise: Promise<string | null> | null = null;

  constructor() {
    this.baseUrl =
      process.env.NEXT_PUBLIC_API_URL ||
      (process.env.NODE_ENV === "production" ? "/api" : "http://localhost:5000/api");
  }

  /** Register auth refresher callback to seamlessly recover from missing/expired session */
  setOnAuthError(fn: () => Promise<string | null>) {
    this.onAuthError = fn;
  }

  // Simulated latency helper if needed
  async delay(ms: number = 200): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Headers provider with JWT support
  getHeaders(isFormData: boolean = false): HeadersInit {
    const token =
      typeof window !== "undefined"
        ? localStorage.getItem("vibhanu_crm_token") || localStorage.getItem("vibhanu_auth_token")
        : null;

    const headers: Record<string, string> = {};
    if (!isFormData) {
      headers["Content-Type"] = "application/json";
    }
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    return headers;
  }

  private handleResponseError(status: number, data: any): never {
    let msg = data?.message || "An unexpected error occurred.";
    if (data?.errors) {
      if (typeof data.errors === "string") {
        msg = `${msg}: ${data.errors}`;
      } else if (typeof data.errors === "object") {
        const errorList = Object.entries(data.errors)
          .map(([k, v]) => `${k}: ${v}`)
          .join("; ");
        msg = `${msg} (${errorList})`;
      }
    }
    const error: any = new Error(msg);
    error.status = status;
    error.errors = data?.errors;
    throw error;
  }

  private async request<T>(
    endpoint: string,
    init: RequestInit,
    isRetry = false
  ): Promise<ApiResponse<T>> {
    const isFullUrl = endpoint.startsWith("http://") || endpoint.startsWith("https://");
    const url = isFullUrl
      ? endpoint
      : `${this.baseUrl}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;

    const res = await fetch(url, init);
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      const isAuthEndpoint =
        endpoint.includes("/auth/login") ||
        endpoint.includes("/auth/logout") ||
        endpoint.includes("/auth/refresh") ||
        endpoint.includes("/auth/register");

      if (res.status === 401 && !isRetry && !isAuthEndpoint && this.onAuthError) {
        // Deduplicate in-flight auth recovery across concurrent requests
        if (!this.refreshPromise) {
          this.refreshPromise = this.onAuthError().finally(() => {
            this.refreshPromise = null;
          });
        }

        try {
          const newToken = await this.refreshPromise;
          if (newToken) {
            const currentHeaders = new Headers(init.headers);
            currentHeaders.set("Authorization", `Bearer ${newToken}`);
            return await this.request<T>(endpoint, { ...init, headers: currentHeaders }, true);
          }
        } catch (_) {}
      }
      this.handleResponseError(res.status, json);
    }

    return json;
  }

  async get<T>(
    endpoint: string,
    params?: Record<string, string | number | boolean | undefined>
  ): Promise<ApiResponse<T>> {
    let fullEndpoint = endpoint;
    if (params) {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== "") {
          searchParams.append(key, String(value));
        }
      });
      const qs = searchParams.toString();
      if (qs) {
        fullEndpoint += `${fullEndpoint.includes("?") ? "&" : "?"}${qs}`;
      }
    }
    return this.request<T>(fullEndpoint, {
      method: "GET",
      headers: this.getHeaders(),
      credentials: "include",
    });
  }

  async post<T>(endpoint: string, data?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: "POST",
      headers: this.getHeaders(),
      credentials: "include",
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async patch<T>(endpoint: string, data?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: "PATCH",
      headers: this.getHeaders(),
      credentials: "include",
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async upload<T>(endpoint: string, formData: FormData): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: "POST",
      headers: this.getHeaders(true),
      credentials: "include",
      body: formData,
    });
  }

  async put<T>(endpoint: string, data?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: "PUT",
      headers: this.getHeaders(),
      credentials: "include",
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async delete<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: "DELETE",
      headers: this.getHeaders(),
      credentials: "include",
    });
  }
}

export const api = new ApiClient();
