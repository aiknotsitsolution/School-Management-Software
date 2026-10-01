import { fetch as streamFetch } from "expo/fetch";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import type {
  ApiResponse,
  Notice,
  PlatformAnalytics,
  PlatformPlan,
  PlatformReport,
  PlatformReportDefinition,
  PlatformSetting,
  PlatformSubscription,
  PlatformUserDetails,
  School,
  Student,
  User,
} from "../types";

const localApiUrl =
  Platform.OS === "android"
    ? "http://192.168.1.21:5000/api"
    : "http://localhost:5000/api";
export const API_BASE_URL = (
  process.env.EXPO_PUBLIC_API_URL ||
  (__DEV__ ? localApiUrl : "https://zipschool-backend.onrender.com/api")
).replace(/\/+$/, "");
export const KEYS = {
  access: "erp_access_token",
  refresh: "erp_refresh_token",
  user: "erp_user",
  school: "erp_school",
};

let onLogout: (() => void) | null = null;
export const setLogoutHandler = (fn: () => void) => {
  onLogout = fn;
};

let refreshing: Promise<boolean> | null = null;
async function refreshToken(): Promise<boolean> {
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const rt = await AsyncStorage.getItem(KEYS.refresh);
        if (!rt) return false;
        const r = await fetch(`${API_BASE_URL}/auth/refresh-token`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken: rt }),
        });
        const b = await r.json();
        if (!r.ok || !b.data?.accessToken) return false;
        await AsyncStorage.setItem(KEYS.access, b.data.accessToken);
        if (b.data.refreshToken)
          await AsyncStorage.setItem(KEYS.refresh, b.data.refreshToken);
        return true;
      } catch {
        return false;
      } finally {
        refreshing = null;
      }
    })();
  }
  return refreshing;
}

const PUBLIC = ["/auth/login", "/auth/refresh-token", "/auth/forgot-password"];

async function request<T>(
  path: string,
  options: RequestInit & { _retry?: boolean } = {},
): Promise<ApiResponse<T>> {
  const [[, token], [, userValue], [, schoolValue]] =
    await AsyncStorage.multiGet([KEYS.access, KEYS.user, KEYS.school]);
  let schoolHeader: Record<string, string> = {};
  let user: User | null = null;
  let schoolId: string | undefined;
  try {
    user = userValue ? JSON.parse(userValue) : null;
    const school = schoolValue ? JSON.parse(schoolValue) : null;
    schoolId = school?.id || school?._id;
    if (user?.role === "super_admin" && schoolId) {
      schoolHeader = { "X-School-Id": String(schoolId) };
    }
  } catch {
    // Ignore malformed cached context; the server will reject missing tenant context.
  }
  if (
    user?.role === "super_admin" &&
    !schoolId &&
    !path.startsWith("/auth/") &&
    !path.startsWith("/platform/")
  ) {
    throw new Error("Select a school before loading school dashboard data.");
  }
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        ...(options.body instanceof FormData
          ? {}
          : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...schoolHeader,
        ...(options.headers as object),
      },
    });
  } catch {
    throw new Error(
      `Could not connect to the school server at ${API_BASE_URL}. Check your connection and API URL. On a physical device, use your computer's LAN IP in EXPO_PUBLIC_API_URL.`,
    );
  }
  if (res.status === 401 && !options._retry && !PUBLIC.includes(path)) {
    if (await refreshToken())
      return request<T>(path, { ...options, _retry: true });
    onLogout?.();
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.success === false) {
    const statusMessage =
      res.status === 401
        ? "Invalid email or password."
        : res.status === 403
          ? "Access denied. Contact your school administrator."
          : res.status === 429
            ? "Too many attempts. Please wait and try again."
            : res.status >= 500
              ? "The school server is temporarily unavailable. Please try again."
              : "Request failed. Please check your details and try again.";
    const err = new Error(body.message || statusMessage) as Error & {
      status?: number;
    };
    err.status = res.status;
    throw err;
  }
  return body as ApiResponse<T>;
}

export const get = <T = unknown>(path: string) => request<T>(path);
export const send = <T = unknown>(
  path: string,
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  body?: unknown,
) =>
  request<T>(path, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const q = (p?: string) => (p ? `?${p}` : "");
export const api = {
  login: (c: { email: string; password: string }) =>
    request<{
      accessToken: string;
      refreshToken: string;
      user: User;
      school: School;
    }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ ...c, email: c.email.trim().toLowerCase() }),
    }),
  me: () => request<{ user: User; school: School | null }>("/auth/me"),
  updateMe: (patch: Partial<Pick<User, "name" | "phone" | "avatar">>) =>
    send<User>("/auth/me", "PATCH", patch),
  changePassword: (payload: { oldPassword: string; newPassword: string }) =>
    send<unknown>("/auth/change-password", "POST", payload),
  students: {
    list: (p?: string) => request<Student[]>(`/students${q(p)}`),
    stats: () =>
      request<{ total: number; active: number }>("/students/stats/summary"),
  },
  notices: { list: () => request<Notice[]>("/notices") },
  attendance: {
    list: (p?: string) => request<{ status: string }[]>(`/attendance${q(p)}`),
  },
  staff: { list: () => request<unknown[]>("/staff") },
  schools: { list: () => request<School[]>("/auth/schools") },
  plans: {
    list: (query = "") =>
      request<PlatformPlan[]>(`/platform/plans${query ? `?${query}` : ""}`),
  },
  platform: {
    settings: {
      get: () => request<PlatformSetting[]>("/platform/settings"),
      update: (payload: Record<string, unknown>) =>
        request<PlatformSetting[]>("/platform/settings", {
          method: "PATCH",
          body: JSON.stringify(payload),
        }),
    },
    analytics: (query = "") =>
      request<PlatformAnalytics>(
        `/platform/analytics${query ? `?${query}` : ""}`,
      ),
    schools: {
      list: (query = "") =>
        request<School[]>(`/platform/schools${query ? `?${query}` : ""}`),
      setStatus: (id: string, status: string, reason = "") =>
        send(`/platform/schools/${id}/status`, "PATCH", { status, reason }),
      softDelete: (id: string, reason = "") =>
        send(`/platform/schools/${id}/soft-delete`, "PATCH", { reason }),
      restore: (id: string) =>
        send(`/platform/schools/${id}/restore`, "PATCH", {}),
      updateOnboarding: (id: string, status: string) =>
        send(`/platform/schools/${id}/onboarding`, "PATCH", { status }),
      sendWelcomeEmail: (id: string) =>
        send(`/platform/schools/${id}/welcome-email`, "POST"),
    },
    users: {
      list: (query = "") =>
        request<User[]>(`/platform/users${query ? `?${query}` : ""}`),
      details: (id: string) =>
        request<PlatformUserDetails>(`/platform/users/${id}`),
      setStatus: (id: string, isActive: boolean) =>
        send(`/auth/users/${id}/status`, "PATCH", { isActive }),
      remove: (id: string) => send(`/auth/users/${id}`, "DELETE"),
      restore: (id: string) => send(`/auth/users/${id}/restore`, "POST"),
      create: (payload: Record<string, unknown>) =>
        send<User>("/auth/users", "POST", payload),
    },
    subscriptions: {
      list: (query = "") =>
        request<PlatformSubscription[]>(
          `/platform/subscriptions${query ? `?${query}` : ""}`,
        ),
      details: (id: string) =>
        request<PlatformSubscription>(`/platform/subscriptions/${id}`),
    },
    reports: {
      catalog: () => request<PlatformReportDefinition[]>("/platform/reports"),
      generate: (type: string, query = "") =>
        request<PlatformReport>(
          `/platform/reports/${type}${query ? `?${query}` : ""}`,
        ),
    },
    assignSubscription: (schoolId: string, planId: string) =>
      send("/platform/subscriptions", "POST", { schoolId, planId }),
  },
  createSchool: (school: Record<string, unknown>) =>
    send<School>("/auth/schools", "POST", school),
  createUser: (user: Record<string, unknown>) =>
    send("/auth/users", "POST", user),
};

// ── Live stream (SSE) ─────────────────────────────────────────────────────
// expo/fetch supports streaming bodies, so the Authorization header can be sent
// (EventSource cannot). Auto-reconnects; onStatus reports connection state.
export function sseSubscribe(
  path: string,
  h: {
    onData?: (d: unknown) => void;
    onStatus?: (s: string) => void;
    delay?: number;
  },
) {
  let running = true;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const ctrl = new AbortController();
  const again = () => {
    h.onStatus?.("reconnecting");
    if (running) timer = setTimeout(connect, h.delay ?? 3000);
  };

  async function connect() {
    try {
      const token = await AsyncStorage.getItem(KEYS.access);
      const res = await streamFetch(`${API_BASE_URL}${path}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        signal: ctrl.signal,
      });
      if (res.status === 401) {
        await refreshToken();
        return again();
      }
      if (!res.ok || !res.body) throw new Error(`SSE ${res.status}`);
      h.onStatus?.("connected");
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i: number;
        while ((i = buf.indexOf("\n\n")) !== -1) {
          const block = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const line = block.split("\n").find((l) => l.startsWith("data: "));
          if (line) {
            try {
              h.onData?.(JSON.parse(line.slice(6)));
            } catch {
              /* ignore bad frame */
            }
          }
        }
      }
      again();
    } catch {
      if (!ctrl.signal.aborted) again();
    }
  }
  connect();
  return () => {
    running = false;
    if (timer) clearTimeout(timer);
    ctrl.abort();
  };
}

export const authApi = {
  forgotPassword: (email: string) =>
    request<{ maskedEmail?: string }>("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
  verifyOtp: (email: string, otp: string) =>
    request<{ resetToken?: string }>("/auth/verify-reset-otp", {
      method: "POST",
      body: JSON.stringify({ email, otp }),
    }),
  resetPassword: (token: string, newPassword: string) =>
    request("/auth/reset-password-otp", {
      method: "POST",
      body: JSON.stringify({ token, newPassword }),
    }),
};
export const notificationsApi = {
  list: (p = "") => request<Row[]>(`/notifications${p ? `?${p}` : ""}`),
  unreadCount: () =>
    request<{ unreadCount: number }>("/notifications/unread-count"),
  markRead: (id: string) =>
    request(`/notifications/${id}/read`, { method: "PATCH", body: "{}" }),
  markAllRead: () =>
    request("/notifications/read-all", { method: "PATCH", body: "{}" }),
  subscribe: (h: Parameters<typeof sseSubscribe>[1]) =>
    sseSubscribe("/notifications/stream", h),
};
type Row = Record<string, unknown>;

export const uploadForm = <T = unknown>(
  path: string,
  form: FormData,
  method: "POST" | "PUT" = "POST",
) => request<T>(path, { method, body: form });
