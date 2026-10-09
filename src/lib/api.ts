import { fetch as streamFetch } from "expo/fetch";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import type {
  ApiResponse,
  AdmissionEnquiry,
  AttendanceRecord,
  BroadcastLog,
  BroadcastResult,
  Conversation,
  ConversationPerson,
  FeeInvoice,
  FeePayment,
  FeeReconciliation,
  FeeStructure,
  Notice,
  PlatformAnalytics,
  PlatformPlan,
  PlatformReport,
  PlatformReportDefinition,
  PlatformSetting,
  PlatformSubscription,
  PlatformUserDetails,
  SchoolEvent,
  School,
  SchoolSubscription,
  SchoolSubscriptionInvoice,
  SchoolSubscriptionUsage,
  Student,
  StaffRecord,
  TeacherAssignment,
  TimetableSubstitution,
  TransportRoute,
  User,
} from "../types";

const localApiUrl =
  Platform.OS === "android"
    ? "http://192.168.1.17:5000/api"
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
  role: "erp_user_role",
  activeSchoolId: "erp_active_school_id",
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
  const [[, token], [, role], [, activeSchoolId]] = await AsyncStorage.multiGet(
    [KEYS.access, KEYS.role, KEYS.activeSchoolId],
  );
  let schoolHeader: Record<string, string> = {};
  if (role === "super_admin" && activeSchoolId) {
    schoolHeader = { "X-School-Id": activeSchoolId };
  }
  if (
    role === "super_admin" &&
    !activeSchoolId &&
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
      conflicts?: string[];
    };
    err.status = res.status;
    if (Array.isArray(body.conflicts)) {
      err.conflicts = body.conflicts.map(String);
    }
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
    create: (payload: Partial<Student> & Record<string, unknown>) =>
      send<Student>("/students", "POST", payload),
    update: (id: string, payload: Partial<Student> & Record<string, unknown>) =>
      send<Student>(`/students/${encodeURIComponent(id)}`, "PUT", payload),
    remove: (id: string) =>
      send(`/students/${encodeURIComponent(id)}`, "DELETE"),
    restore: (id: string) =>
      send<Student>(`/students/${encodeURIComponent(id)}/restore`, "POST"),
    uploadPhoto: (form: FormData) =>
      uploadForm<{ url: string }>("/students/upload-photo", form),
    stats: () =>
      request<{ total: number; active: number }>("/students/stats/summary"),
    pendingRegistrations: (p?: string) =>
      request<Record<string, unknown>[]>(`/students/pending-registrations${q(p)}`),
  },
  users: {
    list: (p?: string) => request<User[]>(`/auth/users${q(p)}`),
    create: (payload: Record<string, unknown>) =>
      send<User>("/auth/users", "POST", payload),
    update: (id: string, payload: Partial<User>) =>
      send<User>(`/auth/users/${encodeURIComponent(id)}`, "PATCH", payload),
    setStatus: (id: string, isActive: boolean) =>
      send<User>(`/auth/users/${encodeURIComponent(id)}/status`, "PATCH", {
        isActive,
      }),
    remove: (id: string) =>
      send(`/auth/users/${encodeURIComponent(id)}`, "DELETE"),
    restore: (id: string) =>
      send(`/auth/users/${encodeURIComponent(id)}/restore`, "POST"),
    sendResetOtp: (id: string) =>
      send<{ maskedEmail?: string }>(
        `/auth/users/${encodeURIComponent(id)}/send-reset-otp`,
        "POST",
      ),
  },
  fees: {
    structures: {
      list: (query = "") =>
        request<FeeStructure[]>(`/fees/structure${query ? `?${query}` : ""}`),
      create: (payload: Partial<FeeStructure>) =>
        send<FeeStructure>("/fees/structure", "POST", payload),
    },
    invoices: {
      list: (query = "") =>
        request<FeeInvoice[]>(`/fees${query ? `?${query}` : ""}`),
    },
    payments: {
      list: (query = "") =>
        request<FeePayment[]>(`/payments${query ? `?${query}` : ""}`),
      create: (payload: {
        invoiceId: string;
        amount: number;
        mode: string;
        transactionId?: string;
        chequeNo?: string;
        chequeDate?: string;
        bankName?: string;
      }) => send<FeePayment>("/payments", "POST", payload),
    },
    reports: {
      reconciliation: (query = "") =>
        request<FeeReconciliation>(
          `/payments/reconciliation${query ? `?${query}` : ""}`,
        ),
    },
  },
  admissions: {
    list: (query = "") =>
      request<AdmissionEnquiry[]>(`/admissions${query ? `?${query}` : ""}`),
    create: (payload: Partial<AdmissionEnquiry>) =>
      send<AdmissionEnquiry>("/admissions", "POST", payload),
    update: (id: string, payload: Partial<AdmissionEnquiry>) =>
      send<AdmissionEnquiry>(`/admissions/${id}`, "PUT", payload),
    remove: (id: string) => send(`/admissions/${id}`, "DELETE"),
  },
  notices: {
    list: () => request<Notice[]>("/notices"),
    create: (payload: Partial<Notice>) =>
      send<Notice>("/notices", "POST", payload),
    update: (id: string, payload: Partial<Notice>) =>
      send<Notice>(`/notices/${id}`, "PUT", payload),
    remove: (id: string) => send(`/notices/${id}`, "DELETE"),
  },
  conversations: {
    list: (query = "") =>
      request<Conversation[]>(`/conversations${query ? `?${query}` : ""}`),
    people: (query: string) =>
      request<ConversationPerson[]>(
        `/conversations/people?q=${encodeURIComponent(query)}`,
      ),
    open: (payload: { participantId: string; body?: string }) =>
      send<Conversation>("/conversations", "POST", payload),
    get: (id: string) => request<Conversation>(`/conversations/${id}`),
    reply: (id: string, body: string) =>
      send<Conversation>(`/conversations/${id}/reply`, "POST", { body }),
  },
  broadcast: {
    sms: (payload: {
      audience?: string[];
      studentIds?: string[];
      classTags?: string[];
      numbers?: string[];
      message: string;
    }) => send<BroadcastResult>("/broadcast/sms", "POST", payload),
    email: (payload: {
      audience?: string[];
      studentIds?: string[];
      classTags?: string[];
      emails?: string[];
      subject: string;
      html: string;
    }) => send<BroadcastResult>("/broadcast/email", "POST", payload),
    logs: (query = "") =>
      request<BroadcastLog[]>(`/broadcast/logs${query ? `?${query}` : ""}`),
  },
  attendance: {
    list: (p?: string) => request<AttendanceRecord[]>(`/attendance${q(p)}`),
  },
  timetable: {
    list: (query = "") =>
      request<Record<string, unknown>[]>(
        `/timetable${query ? `?${query}` : ""}`,
      ),
    save: (payload: Record<string, unknown>) =>
      send<Record<string, unknown>>("/timetable", "POST", payload),
    remove: (id: string) =>
      send(`/timetable/${encodeURIComponent(id)}`, "DELETE"),
    substitutions: {
      list: (query = "") =>
        request<TimetableSubstitution[]>(
          `/timetable/substitutions${query ? `?${query}` : ""}`,
        ),
      create: (payload: {
        date: string;
        class: string;
        section: string;
        startTime: string;
        endTime: string;
        substituteTeacherId: string;
        substituteTeacherName: string;
        reason?: string;
      }) =>
        send<TimetableSubstitution>(
          "/timetable/substitutions",
          "POST",
          payload,
        ),
      setStatus: (
        id: string,
        status: "completed" | "cancelled",
      ) =>
        send<TimetableSubstitution>(
          `/timetable/substitutions/${encodeURIComponent(id)}/status`,
          "PATCH",
          { status },
        ),
      remove: (id: string) =>
        send(`/timetable/substitutions/${encodeURIComponent(id)}`, "DELETE"),
    },
  },
  staff: {
    list: (query = "") =>
      request<StaffRecord[]>(`/staff${query ? `?${query}` : ""}`),
    pendingRegistrations: (query = "") =>
      request<Record<string, unknown>[]>(
        `/staff/pending-registrations${query ? `?${query}` : ""}`,
      ),
    create: (payload: Partial<StaffRecord>) =>
      send<StaffRecord>("/staff", "POST", payload),
    attendance: {
      list: (query = "") =>
        request<AttendanceRecord[]>(
          `/staff/attendance${query ? `?${query}` : ""}`,
        ),
    },
  },
  assignments: {
    list: (query = "") =>
      request<TeacherAssignment[]>(`/assignments${query ? `?${query}` : ""}`),
    me: () =>
      request<{
        classTeacher?: Record<string, unknown>[];
        teaching?: Record<string, unknown>[];
        teachingScopes?: { class: string; section?: string | null }[];
        primaryScope?: { class?: string; section?: string | null } | null;
      }>("/assignments/me"),
  },
  transport: {
    list: (query = "") =>
      request<TransportRoute[]>(`/transport${query ? `?${query}` : ""}`),
  },
  events: {
    list: () => request<SchoolEvent[]>("/events"),
    create: (payload: Partial<SchoolEvent>) =>
      send<SchoolEvent>("/events", "POST", payload),
    update: (id: string, payload: Partial<SchoolEvent>) =>
      send<SchoolEvent>(`/events/${encodeURIComponent(id)}`, "PUT", payload),
    remove: (id: string) =>
      send(`/events/${encodeURIComponent(id)}`, "DELETE"),
    uploadImage: (form: FormData) =>
      uploadForm<{ url: string }>("/events/upload-image", form),
  },
  schools: { list: () => request<School[]>("/auth/schools") },
  plans: {
    list: (query = "") =>
      request<PlatformPlan[]>(`/platform/plans${query ? `?${query}` : ""}`),
  },
  schoolSubscription: {
    me: () => request<SchoolSubscription | null>("/auth/school/me/subscription"),
    scheduled: () =>
      request<SchoolSubscription | null>(
        "/auth/school/me/subscription/scheduled",
      ),
    plans: () => request<PlatformPlan[]>("/auth/school/me/plans"),
    usage: () => request<SchoolSubscriptionUsage>("/auth/school/me/usage"),
    upgrade: (
      planId: string,
      durationPeriods = 1,
      switchMode: "immediate" | "advance" = "immediate",
    ) =>
      send<SchoolSubscription | { requiresPayment: true; [key: string]: unknown }>(
        "/auth/school/me/upgrade",
        "POST",
        { planId, durationPeriods, switchMode },
      ),
  },
  schoolSubscriptionInvoices: {
    list: (query = "") =>
      request<{
        invoices: SchoolSubscriptionInvoice[];
        total: number;
        page: number;
        pages: number;
      }>(`/auth/school/me/invoices${query ? `?${query}` : ""}`),
    get: (id: string) =>
      request<SchoolSubscriptionInvoice>(
        `/auth/school/me/invoices/${encodeURIComponent(id)}`,
      ),
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
  school: {
    me: () => request<School>("/auth/school/me"),
    update: (payload: Record<string, unknown>) =>
      send<School>("/auth/school/me", "PATCH", payload),
  },
  examMasters: {
    list: (kind: string) =>
      request<Record<string, unknown>[]>(`/exam-masters/${encodeURIComponent(kind)}`),
    create: (kind: string, payload: Record<string, unknown>) =>
      send<Record<string, unknown>>(
        `/exam-masters/${encodeURIComponent(kind)}`,
        "POST",
        payload,
      ),
    update: (kind: string, id: string, payload: Record<string, unknown>) =>
      send<Record<string, unknown>>(
        `/exam-masters/${encodeURIComponent(kind)}/${encodeURIComponent(id)}`,
        "PATCH",
        payload,
      ),
    deactivate: (kind: string, id: string) =>
      send<Record<string, unknown>>(
        `/exam-masters/${encodeURIComponent(kind)}/${encodeURIComponent(id)}/deactivate`,
        "PATCH",
        { active: false },
      ),
    restore: (kind: string, id: string) =>
      send<Record<string, unknown>>(
        `/exam-masters/${encodeURIComponent(kind)}/${encodeURIComponent(id)}/restore`,
        "PATCH",
        {},
      ),
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
