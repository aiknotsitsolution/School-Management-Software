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
  email?: string;
  phone?: string;
  location?: { lat?: number; lng?: number };
  address?: string;
  website?: string;
  domain?: string;
  plan?: string;
  status?: string;
  city?: string;
  state?: string;
  pincode?: string;
  board?: string;
  recognitionNumber?: string;
  recognitionAuthority?: string;
  recognitionVerified?: boolean;
  recognitionVerifiedAt?: string;
  logo?: string;
  settings?: { bannerImage?: string; [key: string]: unknown };
  createdAt?: string;
  updatedAt?: string;
  isDeleted?: boolean;
  deletedAt?: string | null;
  academicConfigConfirmed?: boolean;
  onboarding?: {
    status?: string;
    appliedAt?: string;
    completedAt?: string;
    notes?: string;
  };
  session?: string;
  currentSession?: { name: string; startDate?: string; endDate?: string };
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
export interface SchoolSubscription {
  _id: string;
  plan?: PlatformPlan | null;
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
  durationPeriods?: number;
  createdAt?: string;
  updatedAt?: string;
}
export interface SchoolSubscriptionInvoice {
  _id: string;
  invoiceNumber?: string;
  amount?: number;
  currency?: string;
  taxAmount?: number;
  totalAmount?: number;
  gstRate?: number;
  cgstAmount?: number;
  sgstAmount?: number;
  status?: string;
  periodStart?: string;
  periodEnd?: string;
  dueDate?: string;
  paidAt?: string;
  planName?: string;
  planCode?: string;
  durationPeriods?: number;
  createdAt?: string;
}
export interface SchoolSubscriptionUsage {
  students?: number;
  teachers?: number;
  staff?: number;
  adminUsers?: number;
  total?: number;
}
export interface TimetableSubstitution {
  _id: string;
  date: string;
  day: string;
  class: string;
  section: string;
  startTime: string;
  endTime: string;
  subject?: string;
  originalTeacherId?: string;
  originalTeacherName?: string;
  substituteTeacherId?: string;
  substituteTeacherName?: string;
  roomId?: string;
  roomName?: string;
  reason?: string;
  status: "scheduled" | "completed" | "cancelled";
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
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
export interface AttendanceRecord {
  _id?: string;
  studentId?: string;
  staffId?: string;
  date?: string;
  status: string;
}
export interface FeeInvoice {
  _id: string;
  studentId?: string;
  class?: string;
  section?: string;
  feeType?: string;
  amount?: number;
  paidAmount?: number;
  dueDate?: string;
  status?: string;
  session?: string;
}
export interface FeeStructure {
  _id: string;
  class?: string;
  feeType?: string;
  session?: string;
  amount?: number;
  frequency?: string;
  dueDate?: string;
  active?: boolean;
}
export interface FeePayment {
  _id?: string;
  receiptNo?: string;
  studentId?: string;
  invoiceId?: string;
  amount?: number;
  transactionId?: string;
  collectedBy?: string;
  clearanceStatus?: string;
  paidOn?: string;
  mode?: string;
}
export interface FeeReconciliation {
  totalRecorded?: number;
  bouncedAmount?: number;
  pendingChequeAmount?: number;
  netCollected?: number;
}
export interface AdmissionEnquiry {
  _id: string;
  childName?: string;
  classApplied?: string;
  parentName?: string;
  section?: string;
  contact?: string;
  email?: string;
  feeCategory?: string;
  source?: string;
  status?: string;
  admissionNo?: string;
  followUpDate?: string;
  notes?: string;
  createdAt?: string;
}
export interface TransportStop {
  name?: string;
}
export interface TransportRoute {
  _id: string;
  routeNo?: string;
  vehicleNo?: string;
  driverName?: string;
  driverContact?: string;
  stops?: (TransportStop | string)[];
  assignedStudents?: unknown[];
  currentLocation?: {
    lat?: number | string;
    lng?: number | string;
    updatedAt?: string;
  } | null;
}
export interface SchoolEvent {
  _id: string;
  title: string;
  description?: string;
  date?: string;
  time?: string;
  venue?: string;
  category?: string;
  image?: string;
  audience?: string[];
  createdAt?: string;
}
export interface StaffRecord {
  _id: string;
  employeeId?: string;
  name?: string;
  designation?: string;
  department?: string;
  role?: string;
  userId?: string | null;
  subjects?: string[];
  qualification?: string;
  joiningDate?: string;
  dob?: string;
  gender?: "Male" | "Female" | "Other";
  salary?: number;
  contact?: string;
  email?: string;
  address?: string;
  photoUrl?: string;
  idCardNumber?: string | null;
  idCardIssuedAt?: string | null;
  status?: "Active" | "Inactive" | "Resigned";
  profileStatus?: "complete" | "incomplete";
}
export interface TeacherAssignment {
  _id: string;
  staffId: string;
  type: "teaching" | "class_teacher";
  status: "active" | "ended";
}
export interface Notice {
  _id: string;
  title: string;
  body: string;
  description?: string;
  category?: string;
  audience?: string[];
  classTags?: string[];
  expiryDate?: string;
  pinned?: boolean;
  priority?: "normal" | "emergency" | string;
  createdAt?: string;
}
export interface ConversationParticipant {
  userId: string;
  name: string;
  role: Role | string;
  lastReadAt?: string | null;
}
export interface ConversationMessage {
  _id?: string;
  senderId: string;
  senderName?: string;
  senderRole?: Role | string;
  body: string;
  at?: string;
}
export interface Conversation {
  _id: string;
  participants?: ConversationParticipant[];
  messages?: ConversationMessage[];
  with?: { userId?: string | null; name?: string; role?: Role | string };
  lastMessage?: string;
  lastMessageAt?: string;
  lastSenderId?: string;
  unread?: number;
}
export interface ConversationPerson {
  _id: string;
  name: string;
  role: Role | string;
  designation?: string;
  email?: string;
}
export interface BroadcastLog {
  _id: string;
  channel: "sms" | "email" | string;
  subject?: string | null;
  body?: string;
  recipients?: string[];
  sent?: number;
  failed?: number;
  skipped?: number;
  dryRun?: boolean;
  status?: "sent" | "partial" | "failed" | "dry_run" | string;
  createdAt?: string;
}
export interface BroadcastResult {
  recipients: number;
  sent: number;
  failed: number;
  skipped?: number;
  dryRun?: boolean;
  logId?: string;
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
