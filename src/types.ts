export type Role =
  | "super_admin"
  | "school_admin"
  | "admin"
  | "teacher"
  | "student"
  | "parent"
  | "staff";
export interface User {
  _id?: string;
  id?: string;
  name: string;
  email: string;
  role: Role;
  schoolId?: string | null;
  phone?: string | null;
  class?: string | null;
  section?: string | null;
  isActive?: boolean;
  emailVerified?: boolean;
  deletedAt?: string | null;
  lastLogin?: string | null;
  lastActivity?: string | null;
  createdAt?: string;
  designation?: string;
  avatar?: string;
  permissions?: string[];
  photoUrl?: string;
  photo?: string;
}
export interface PlatformUserDetails {
  user: User;
  school?: { name?: string; code?: string; status?: string } | null;
  subscription?: {
    status?: string;
    nextBillingDate?: string;
    plan?: { name?: string };
  } | null;
  recentAudits?: {
    _id?: string;
    message?: string;
    action?: string;
    createdAt?: string;
  }[];
}
export interface School {
  id?: string;
  _id?: string;
  name?: string;
  shortName?: string;
  code?: string;
  plan?: string;
  status?: string;
  city?: string;
  createdAt?: string;
  isDeleted?: boolean;
  onboarding?: { status?: string };
  session?: string;
  currentSession?: { name: string };
}
export interface PlatformPlan {
  _id: string;
  name: string;
  code: string;
  description?: string;
  price?: number;
  currency?: string;
  billingCycle?: string;
  trialDays?: number;
  features?: string[];
  limits?: Record<string, number | null | undefined>;
  isActive?: boolean;
  isPublic?: boolean;
  sortOrder?: number;
}
export interface PlatformSubscription {
  _id: string;
  school?: {
    _id?: string;
    name?: string;
    code?: string;
    shortName?: string;
    status?: string;
  } | null;
  plan?: {
    _id?: string;
    name?: string;
    code?: string;
    price?: number;
    currency?: string;
    billingCycle?: string;
    trialDays?: number;
  } | null;
  status: string;
  startDate?: string;
  trialStartDate?: string;
  trialEndDate?: string;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  nextBillingDate?: string;
  cancelledAt?: string;
  suspendedAt?: string;
  endedAt?: string;
  billingCycle?: string;
  price?: number;
  currency?: string;
  createdAt?: string;
  invoices?: {
    _id?: string;
    invoiceNumber?: string;
    amount?: number;
    currency?: string;
    status?: string;
    periodStart?: string;
    periodEnd?: string;
  }[];
  history?: PlatformSubscription[];
}
export interface PlatformReportDefinition {
  id: string;
  title: string;
  category: string;
  description: string;
}
export interface PlatformReport {
  meta: { type: string; title: string; generatedAt: string; rowCount: number };
  columns: string[];
  rows: Record<string, unknown>[];
}
export interface PlatformSetting {
  key: string;
  label: string;
  section: "general" | "security" | "billing" | "notifications" | string;
  type: "string" | "number" | "boolean";
  value: string | number | boolean;
  default: string | number | boolean;
  min?: number;
  max?: number;
  options?: string[];
  help?: string;
  updatedAt?: string | null;
}
export interface Student {
  _id: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  class?: string;
  section?: string;
  rollNo?: string;
  admissionNo?: string;
  status?: string;
}
export interface Notice {
  _id: string;
  title: string;
  body: string;
  category?: string;
  createdAt?: string;
}
export interface PlatformAnalytics {
  generatedAt?: string;
  overview?: {
    schools?: { total?: number; active?: number };
    users?: { total?: number };
    subscriptions?: {
      total?: number;
      current?: number;
      byStatus?: Record<string, number>;
    };
    mrr?: number;
    arpu?: number;
    payingSchools?: number;
  };
  schoolGrowth?: { month?: string; label?: string; count: number }[];
  subscriptionDistribution?: { status: string; label: string; count: number }[];
  planDistribution?: { plan: string; count: number }[];
  onboarding?: { funnel?: { step: string; count: number }[] };
  expiringSubscriptions?: {
    in7?: number;
    in15?: number;
    in30?: number;
    total?: number;
    page?: number;
    pageSize?: number;
    items?: {
      _id?: string;
      school?: { name?: string };
      plan?: { name?: string };
      status?: string;
      reference?: string;
    }[];
  };
  revenue?: {
    collected?: number;
    outstanding?: number;
    invoices?: {
      paid?: number;
      issued?: number;
      overdue?: number;
      draft?: number;
    };
  };
  recentActivity?: {
    _id?: string;
    actorEmail?: string;
    actorRole?: string;
    action?: string;
    message?: string;
    createdAt?: string;
  }[];
  recentActivityTotal?: number;
  recentActivityPage?: number;
  recentActivityPageSize?: number;
  alerts?: { severity: string; message: string }[];
}
export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data: T;
  total?: number;
  page?: number;
  pages?: number;
  limit?: number;
}
