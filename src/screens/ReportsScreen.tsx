import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Ionicons } from "@expo/vector-icons";
import { Button, Card, Input, Toast } from "../components/UI";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { colors, radius } from "../theme";
import type {
  AdmissionEnquiry,
  ApiResponse,
  AttendanceRecord,
  FeeInvoiceRecord,
  FeePayment,
  FeeReportsSummary,
  Student,
} from "../types";

type Tab = "analytics" | "generate";
type ReportField = "class" | "section" | "status" | "from" | "to" | "session";
type ReportDefinition = {
  id: string;
  title: string;
  description: string;
  permission: string;
  fields: ReportField[];
};
type CsvReport = { filename: string; headers: string[]; rows: unknown[][] };
type FeeTrendRow = { month: string; collected: number; pending?: number };
type Analytics = {
  studentStats: {
    total: number;
    active: number;
    byClass: { _id?: string; count?: number }[];
  };
  students: Student[];
  attendance: AttendanceRecord[];
  invoices: FeeInvoiceRecord[];
  payments: FeePayment[];
  admissions: AdmissionEnquiry[];
  feeReports: FeeReportsSummary;
};

const REPORTS: ReportDefinition[] = [
  {
    id: "students",
    title: "Student Roster",
    description: "Admission, class, section, guardian contact and status.",
    permission: "students:read",
    fields: ["class", "section", "status"],
  },
  {
    id: "attendance",
    title: "Attendance Summary",
    description: "Class-wise totals and attendance percentage for a period.",
    permission: "attendance:read",
    fields: ["class", "from", "to"],
  },
  {
    id: "payments",
    title: "Fee Collection Ledger",
    description: "Payment receipts, modes, amounts and collection dates.",
    permission: "fees:read",
    fields: [],
  },
  {
    id: "outstanding",
    title: "Outstanding Dues",
    description: "Unpaid invoice balances by student, fee type and due date.",
    permission: "fees:read",
    fields: ["class", "session"],
  },
  {
    id: "fee-statement",
    title: "Student Fee Statement",
    description: "Yearly package, invoiced, collected and balance per student.",
    permission: "fees:read",
    fields: ["session"],
  },
  {
    id: "enquiries",
    title: "Admission Enquiries",
    description: "Guardian, contact and current admission enquiry status.",
    permission: "enquiries:read",
    fields: ["status"],
  },
  {
    id: "staff",
    title: "Staff List",
    description: "Staff and teachers, designation, department and contact.",
    permission: "staff:read",
    fields: [],
  },
];

const FIELD_LABELS: Record<ReportField, string> = {
  class: "Class",
  section: "Section",
  status: "Status",
  from: "From (YYYY-MM-DD)",
  to: "To (YYYY-MM-DD)",
  session: "Academic session",
};

const EMPTY_ANALYTICS: Analytics = {
  studentStats: { total: 0, active: 0, byClass: [] },
  students: [],
  attendance: [],
  invoices: [],
  payments: [],
  admissions: [],
  feeReports: {},
};

const formatMoney = (value: number) =>
  `₹${Number(value || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 0,
  })}`;
const textOf = (value: unknown) => (value == null ? "" : String(value));
const fullDate = (value?: string) => {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "—"
    : parsed.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
};
const dateTime = (value?: string) => {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "—"
    : parsed.toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
};
const isValidDateInput = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
};
const csvCell = (value: unknown) => {
  let text = textOf(value);
  if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
};
const csvText = (headers: string[], rows: unknown[][]) =>
  [headers, ...rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n");
const queryFrom = (values: Partial<Record<ReportField, string>>) => {
  const params = new URLSearchParams();
  (Object.keys(values) as ReportField[]).forEach((key) => {
    const value = values[key]?.trim();
    if (value) params.set(key, value);
  });
  return params.toString();
};

async function readData<T>(
  request: Promise<ApiResponse<T>>,
  fallback: T,
): Promise<{ value: T; error: string }> {
  try {
    return { value: (await request).data, error: "" };
  } catch (requestError) {
    return {
      value: fallback,
      error: (requestError as Error).message || "Request failed.",
    };
  }
}

export default function ReportsScreen() {
  const { can } = useAuth();
  const [tab, setTab] = useState<Tab>("analytics");
  const [analytics, setAnalytics] = useState<Analytics>(EMPTY_ANALYTICS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [filters, setFilters] = useState<Partial<Record<ReportField, string>>>(
    {},
  );
  const [generating, setGenerating] = useState(false);
  const [generatedInfo, setGeneratedInfo] = useState("");
  const [feeSummaryError, setFeeSummaryError] = useState(false);

  const canStudents = can("students:read");
  const canFees = can("fees:read");
  const canFeeReports = can("fees:reports");
  const canAttendance = can("attendance:read") || can("attendance:mark");
  const canEnquiries =
    can("enquiries:read") || can("enquiries:write");
  const canStaff = can("staff:read");
  const availableReports = REPORTS.filter(
    (report) =>
      can(report.permission) ||
      (report.permission === "enquiries:read" && can("enquiries:write")),
  );

  const loadAnalytics = async () => {
    setLoading(true);
    setError("");
    const [
      studentStats,
      students,
      attendance,
      invoices,
      payments,
      admissions,
      feeReports,
    ] = await Promise.all([
      canStudents
        ? readData(api.students.stats(), EMPTY_ANALYTICS.studentStats)
        : Promise.resolve({ value: EMPTY_ANALYTICS.studentStats, error: "" }),
      canStudents
        ? readData(api.students.list("limit=1000"), [])
        : Promise.resolve({ value: [], error: "" }),
      canAttendance
        ? readData(api.attendance.list(), [])
        : Promise.resolve({ value: [], error: "" }),
      canFees
        ? readData(api.fees.invoices.list(), [])
        : Promise.resolve({ value: [], error: "" }),
      canFees
        ? readData(api.fees.payments.list(), [])
        : Promise.resolve({ value: [], error: "" }),
      canEnquiries
        ? readData(api.admissions.list(), [])
        : Promise.resolve({ value: [], error: "" }),
      canFeeReports
        ? readData(api.fees.reports.get(), {})
        : Promise.resolve({ value: {}, error: "" }),
    ]);
    setAnalytics({
      studentStats: {
        ...studentStats.value,
        byClass: studentStats.value.byClass || [],
      },
      students: students.value,
      attendance: attendance.value,
      invoices: invoices.value,
      payments: payments.value,
      admissions: admissions.value,
      feeReports: feeReports.value,
    });
    setFeeSummaryError(Boolean(feeReports.error));
    const failed = [
      ["student statistics", studentStats.error],
      ["student records", students.error],
      ["attendance", attendance.error],
      ["invoices", invoices.error],
      ["payments", payments.error],
      ["admission enquiries", admissions.error],
      ["fee reports", feeReports.error],
    ]
      .filter(([, message]) => Boolean(message))
      .map(([label, message]) => `${label}: ${message}`);
    if (failed.length) {
      setError(
        `Some analytics data could not be loaded: ${failed.slice(0, 4).join("; ")}.`,
      );
    }
    setLoading(false);
  };

  useEffect(() => {
    void loadAnalytics();
  }, [
    canStudents,
    canFees,
    canFeeReports,
    canAttendance,
    canEnquiries,
    canStaff,
  ]);

  const stats = useMemo(() => {
    const collected = analytics.payments.reduce(
      (sum, payment) => sum + Number(payment.amount || 0),
      0,
    );
    const invoiced = analytics.invoices.reduce(
      (sum, invoice) => sum + Number(invoice.amount || 0),
      0,
    );
    const pending = analytics.invoices.reduce(
      (sum, invoice) =>
        sum +
        Math.max(
          0,
          Number(invoice.amount || 0) - Number(invoice.paidAmount || 0),
        ),
      0,
    );
    const pendingCount = analytics.invoices.filter(
      (invoice) =>
        Number(invoice.amount || 0) - Number(invoice.paidAmount || 0) > 0,
    ).length;
    const presentCount = analytics.attendance.filter(
      (record) => record.status === "Present",
    ).length;
    const attendancePercent = analytics.attendance.length
      ? Math.round((presentCount / analytics.attendance.length) * 100)
      : 0;
    return {
      collected,
      invoiced,
      pending,
      pendingCount,
      presentCount,
      attendancePercent,
      collectionRate:
        invoiced > 0 ? Math.min(100, Math.round((collected / invoiced) * 100)) : 0,
    };
  }, [analytics]);

  const classBars = useMemo(() => {
    const entries = analytics.studentStats.byClass || [];
    const max = Math.max(1, ...entries.map((item) => Number(item.count || 0)));
    return entries.map((item) => ({
      name: item._id || "Unknown",
      count: Number(item.count || 0),
      percent: Math.round((Number(item.count || 0) / max) * 100),
    }));
  }, [analytics.studentStats]);
  const enquiryFunnel = useMemo(() => {
    const counts = new Map<string, number>();
    analytics.admissions.forEach((enquiry) => {
      const status = enquiry.status || "Unknown";
      counts.set(status, (counts.get(status) || 0) + 1);
    });
    return [...counts.entries()];
  }, [analytics.admissions]);
  const feeTrend = useMemo<FeeTrendRow[]>(() => {
    const months = new Map<string, { month: string; collected: number }>();
    analytics.payments.forEach((payment) => {
      if (!payment.paidOn) return;
      const date = new Date(payment.paidOn);
      if (Number.isNaN(date.getTime())) return;
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      const value = months.get(key) || {
        month: date.toLocaleDateString("en-IN", { month: "short" }),
        collected: 0,
      };
      value.collected += Number(payment.amount || 0);
      months.set(key, value);
    });
    const pending = stats.pending;
    const rows: FeeTrendRow[] = [...months.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([, value]) => value)
      .slice(-6);
    if (!rows.length && pending > 0) {
      return [{ month: "Current", collected: 0, pending }];
    }
    if (rows.length) rows[rows.length - 1].pending = pending;
    return rows;
  }, [analytics.payments, stats.pending]);

  const selectedReport = REPORTS.find((report) => report.id === selectedId);

  const setFilter = (key: ReportField, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setGeneratedInfo("");
    setError("");
  };

  const exportCsv = async (report: CsvReport) => {
    const csv = `\uFEFF${csvText(report.headers, report.rows)}`;
    if (!FileSystem.cacheDirectory || !(await Sharing.isAvailableAsync())) {
      await Share.share({ message: csv, title: report.filename });
      return;
    }
    const safeName = report.filename.replace(/[^\w.-]/g, "_");
    const uri = `${FileSystem.cacheDirectory}${safeName}`;
    await FileSystem.writeAsStringAsync(uri, csv, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    await Sharing.shareAsync(uri, {
      mimeType: "text/csv",
      dialogTitle: report.filename,
      UTI: "public.comma-separated-values-text",
    });
  };

  const generateReport = async () => {
    if (!selectedReport || generating) return;
    setGenerating(true);
    setError("");
    setGeneratedInfo("");
    const query = queryFrom(filters);
    try {
      let report: CsvReport;
      if (selectedReport.id === "students") {
        const studentQuery = queryFrom(filters);
        const response = await api.students.list(
          studentQuery ? `limit=1000&${studentQuery}` : "limit=1000",
        );
        report = {
          filename: "student-roster.csv",
          headers: [
            "Admission No",
            "Student Name",
            "Class",
            "Section",
            "Roll No",
            "Gender",
            "Date of Birth",
            "Parent Name",
            "Parent Contact",
            "Status",
          ],
          rows: response.data.map((student) => [
            student.admissionNo,
            student.name,
            student.class,
            student.section,
            student.rollNo,
            student.gender,
            fullDate(student.dob),
            student.parentName || student.fatherName,
            student.parentContact || student.phone,
            student.status || "Active",
          ]),
        };
      } else if (selectedReport.id === "attendance") {
        if (
          (filters.from && !isValidDateInput(filters.from)) ||
          (filters.to && !isValidDateInput(filters.to))
        ) {
          throw new Error("Enter dates using YYYY-MM-DD format.");
        }
        if (filters.from && filters.to && filters.to < filters.from) {
          throw new Error("The end date must be on or after the start date.");
        }
        const response = await api.attendance.report(query);
        report = {
          filename: "attendance-summary.csv",
          headers: ["Class", "Total Records", "Present", "Attendance %"],
          rows: (response.data.classWise || []).map((row) => [
            row.class,
            row.total,
            row.present,
            `${row.percentage ?? 0}%`,
          ]),
        };
      } else if (selectedReport.id === "payments") {
        const response = await api.fees.payments.list();
        report = {
          filename: "fee-collection-ledger.csv",
          headers: [
            "Receipt No",
            "Receipt Mode",
            "Source",
            "Student ID",
            "Payment Mode",
            "Amount (₹)",
            "Paid On",
            "Collected By",
            "Transaction ID",
          ],
          rows: response.data.map((payment) => [
            payment.receiptNo,
            payment.receiptMode || "auto",
            payment.source || "counter",
            payment.studentId,
            payment.mode,
            Number(payment.amount || 0).toFixed(2),
            dateTime(payment.paidOn),
            payment.collectedBy,
            payment.transactionId,
          ]),
        };
      } else if (selectedReport.id === "outstanding") {
        const response = await api.fees.invoices.list();
        const rows = response.data
          .filter(
            (invoice) =>
              (!filters.class || invoice.class === filters.class) &&
              (!filters.session || invoice.session === filters.session),
          )
          .filter(
            (invoice) =>
              Number(invoice.amount || 0) -
                Number(invoice.paidAmount || 0) >
              0,
          );
        report = {
          filename: "outstanding-dues.csv",
          headers: [
            "Student ID",
            "Class",
            "Fee Type",
            "Session",
            "Amount (₹)",
            "Paid (₹)",
            "Outstanding (₹)",
            "Due Date",
            "Status",
          ],
          rows: rows.map((invoice) => {
            const amount = Number(invoice.amount || 0);
            const paid = Number(invoice.paidAmount || 0);
            return [
              invoice.studentId,
              invoice.class,
              invoice.feeType,
              invoice.session,
              amount.toFixed(2),
              paid.toFixed(2),
              Math.max(0, amount - paid).toFixed(2),
              fullDate(invoice.dueDate),
              invoice.status,
            ];
          }),
        };
      } else if (selectedReport.id === "fee-statement") {
        const sessionQuery = filters.session
          ? `session=${encodeURIComponent(filters.session)}`
          : "";
        const [plans, invoices, payments] = await Promise.all([
          api.fees.plans.list(sessionQuery),
          api.fees.invoices.list(sessionQuery),
          api.fees.payments.list(),
        ]);
        const rows = new Map<
          string,
          {
            studentId: string;
            class: string;
            session: string;
            planned: number;
            invoiced: number;
            paid: number;
            receipts: number;
          }
        >();
        const rowFor = (studentId?: string) => {
          if (!studentId) return null;
          if (!rows.has(studentId)) {
            rows.set(studentId, {
              studentId,
              class: "",
              session: filters.session || "",
              planned: 0,
              invoiced: 0,
              paid: 0,
              receipts: 0,
            });
          }
          return rows.get(studentId) || null;
        };
        plans.data.forEach((plan) => {
          const row = rowFor(plan.studentId);
          if (!row) return;
          row.planned = Number(plan.totalAnnual || 0);
          row.class = plan.class || row.class;
          row.session = row.session || plan.session || "";
        });
        invoices.data.forEach((invoice) => {
          const row = rowFor(invoice.studentId);
          if (!row) return;
          row.invoiced += Number(invoice.amount || 0);
          row.paid += Number(invoice.paidAmount || 0);
          row.class = row.class || invoice.class || "";
          row.session = row.session || invoice.session || "";
        });
        const invoiceStudents = new Map(
          invoices.data.map((invoice) => [
            String(invoice._id),
            invoice.studentId,
          ]),
        );
        payments.data.forEach((payment) => {
          const row = rowFor(
            payment.studentId ||
              invoiceStudents.get(String(payment.invoiceId || "")),
          );
          if (row) row.receipts += 1;
        });
        report = {
          filename: "student-fee-statement.csv",
          headers: [
            "Student ID",
            "Class",
            "Session",
            "Package (Year, ₹)",
            "Invoiced (₹)",
            "Collected (₹)",
            "Balance (₹)",
            "Receipts",
          ],
          rows: [...rows.values()]
            .filter((row) => row.planned > 0 || row.invoiced > 0)
            .sort((left, right) =>
              left.studentId.localeCompare(right.studentId),
            )
            .map((row) => [
              row.studentId,
              row.class,
              row.session,
              row.planned.toFixed(2),
              row.invoiced.toFixed(2),
              row.paid.toFixed(2),
              Math.max(0, row.invoiced - row.paid).toFixed(2),
              row.receipts,
            ]),
        };
      } else if (selectedReport.id === "enquiries") {
        const response = await api.admissions.list(
          filters.status
            ? `?status=${encodeURIComponent(filters.status)}`
            : "",
        );
        report = {
          filename: "admission-enquiries.csv",
          headers: [
            "Child Name",
            "Class Applied",
            "Parent Name",
            "Section",
            "Contact",
            "Email",
            "Source",
            "Status",
            "Follow-Up Date",
          ],
          rows: response.data.map((enquiry) => [
            enquiry.childName,
            enquiry.classApplied,
            enquiry.parentName,
            enquiry.section,
            enquiry.contact,
            enquiry.email,
            enquiry.source,
            enquiry.status || "New",
            fullDate(enquiry.followUpDate),
          ]),
        };
      } else {
        const response = await api.staff.list();
        report = {
          filename: "staff-list.csv",
          headers: [
            "Employee ID",
            "Name",
            "Designation",
            "Department",
            "Role",
            "Subjects",
            "Classes Assigned",
            "Email",
            "Contact",
            "Joining Date",
            "Status",
          ],
          rows: response.data.map((staff) => [
            staff.employeeId,
            staff.name,
            staff.designation,
            staff.department,
            staff.role,
            (staff.subjects || []).join(" | "),
            (staff.classesAssigned || [])
              .map(
                (assignment) =>
                  `${assignment.class || ""}${assignment.section ? `-${assignment.section}` : ""}`,
              )
              .join(" | "),
            staff.email,
            staff.contact,
            fullDate(staff.joiningDate),
            staff.status || "Active",
          ]),
        };
      }
      await exportCsv(report);
      setGeneratedInfo(
        `${report.rows.length.toLocaleString("en-IN")} rows · ${report.filename}`,
      );
    } catch (generateError) {
      setError(
        (generateError as Error).message ||
          "Unable to generate and share the report.",
      );
    } finally {
      setGenerating(false);
    }
  };

  const selectReport = (report: ReportDefinition) => {
    setSelectedId(report.id);
    setFilters({});
    setGeneratedInfo("");
    setError("");
  };

  const pendingByClass = analytics.feeReports.outstanding || [];
  const collectionByDate = analytics.feeReports.collectionByDate || [];
  const classCollections = analytics.feeReports.classWiseCollection || [];
  const typeCollections = analytics.feeReports.feeTypeWiseCollection || [];

  return (
    <View style={s.root}>
      {!!error && <Toast message={error} onDismiss={() => setError("")} />}
      <ScrollView
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={s.heading}>
          <View style={s.headingText}>
            <Text style={s.eyebrow}>INSIGHTS</Text>
            <Text style={s.title}>Reports & Analytics</Text>
            <Text style={s.subtitle}>
              School performance and downloadable reports.
            </Text>
          </View>
          <View style={s.headingIcon}>
            <Ionicons name="bar-chart" size={23} color={colors.ink} />
          </View>
        </View>

        <View style={s.tabs}>
          {(["analytics", "generate"] as Tab[]).map((item) => (
            <Pressable
              key={item}
              onPress={() => setTab(item)}
              style={[s.tab, tab === item && s.activeTab]}
              accessibilityRole="button"
              accessibilityState={{ selected: tab === item }}
            >
              <Ionicons
                name={item === "analytics" ? "stats-chart" : "download"}
                size={16}
                color={tab === item ? colors.paper : colors.muted}
              />
              <Text style={[s.tabText, tab === item && s.activeTabText]}>
                {item === "analytics" ? "Analytics" : "Generate reports"}
              </Text>
            </Pressable>
          ))}
        </View>

        {tab === "analytics" ? (
          <View style={s.stack}>
            {loading ? (
              <Card>
                <ActivityIndicator color={colors.ink} />
                <Text style={s.empty}>Loading school analytics…</Text>
              </Card>
            ) : (
              <>
                <Pressable
                  style={s.refresh}
                  onPress={() => void loadAnalytics()}
                  accessibilityRole="button"
                >
                  <Ionicons name="refresh" size={16} color={colors.info} />
                  <Text style={s.refreshText}>Refresh analytics</Text>
                </Pressable>
                <View style={s.statGrid}>
                  {canStudents && (
                    <Stat
                      label="Total enrollment"
                      value={analytics.studentStats.total.toLocaleString(
                        "en-IN",
                      )}
                      detail={`${analytics.studentStats.active.toLocaleString("en-IN")} active students`}
                    />
                  )}
                  {canAttendance && (
                    <Stat
                      label="Avg. attendance"
                      value={`${stats.attendancePercent}%`}
                      detail={`${stats.presentCount.toLocaleString("en-IN")} present of ${analytics.attendance.length.toLocaleString("en-IN")} records`}
                      color={colors.success}
                    />
                  )}
                  {canFees && (
                    <Stat
                      label="Fee collection rate"
                      value={`${stats.collectionRate}%`}
                      detail={`${formatMoney(stats.collected)} collected`}
                      color={colors.info}
                    />
                  )}
                  {canFees && (
                    <Stat
                      label="Pending dues"
                      value={formatMoney(stats.pending)}
                      detail={`${stats.pendingCount.toLocaleString("en-IN")} unpaid invoices`}
                      color={colors.alert}
                    />
                  )}
                </View>

                {canStudents && (
                  <Card>
                    <SectionTitle title="Students by class" />
                    {classBars.length ? (
                      classBars.map((item) => (
                        <View key={item.name} style={s.barRow}>
                          <Text style={s.barLabel}>{item.name}</Text>
                          <View style={s.barTrack}>
                            <View
                              style={[s.barFill, { width: `${item.percent}%` }]}
                            />
                          </View>
                          <Text style={s.barValue}>{item.count}</Text>
                        </View>
                      ))
                    ) : (
                      <Text style={s.empty}>No enrollment data yet.</Text>
                    )}
                  </Card>
                )}

                {canFees && (
                  <Card>
                    <SectionTitle title="Fee collection vs pending" />
                    {feeTrend.length ? (
                      feeTrend.map((item) => {
                        const max = Math.max(
                          1,
                          ...feeTrend.map((entry) =>
                            Math.max(entry.collected, entry.pending || 0),
                          ),
                        );
                        return (
                          <View key={item.month} style={s.trendRow}>
                            <Text style={s.trendMonth}>{item.month}</Text>
                            <View style={s.trendBars}>
                              <View
                                style={[
                                  s.trendCollected,
                                  { width: `${Math.max(2, (item.collected / max) * 100)}%` },
                                ]}
                              />
                              <View
                                style={[
                                  s.trendPending,
                                  { width: `${Math.max(2, ((item.pending || 0) / max) * 100)}%` },
                                ]}
                              />
                            </View>
                            <Text style={s.trendValue}>
                              {formatMoney(item.collected)}
                            </Text>
                          </View>
                        );
                      })
                    ) : (
                      <Text style={s.empty}>No fee payments yet.</Text>
                    )}
                    <View style={s.legend}>
                      <View style={[s.legendDot, { backgroundColor: colors.success }]} />
                      <Text style={s.legendText}>Collected</Text>
                      <View style={[s.legendDot, { backgroundColor: colors.alert }]} />
                      <Text style={s.legendText}>Pending (latest period)</Text>
                    </View>
                  </Card>
                )}

                {canEnquiries && (
                  <Card>
                    <SectionTitle title="Admission enquiry funnel" />
                    {enquiryFunnel.length ? (
                      enquiryFunnel.map(([status, count]) => {
                        const percent = analytics.admissions.length
                          ? Math.round((count / analytics.admissions.length) * 100)
                          : 0;
                        return (
                          <View key={status} style={s.barRow}>
                            <Text style={s.statusLabel}>{status}</Text>
                            <View style={s.barTrack}>
                              <View style={[s.barFill, { width: `${percent}%` }]} />
                            </View>
                            <Text style={s.barValue}>{count}</Text>
                          </View>
                        );
                      })
                    ) : (
                      <Text style={s.empty}>No admission enquiries yet.</Text>
                    )}
                    <Text style={s.subtle}>
                      Total enquiries: {analytics.admissions.length}
                    </Text>
                  </Card>
                )}

                {canFeeReports && (
                  <View style={s.stack}>
                    <View>
                      <Text style={s.sectionHeading}>Fee reports</Text>
                      <Text style={s.subtle}>
                        Collection by day, outstanding dues and collection split.
                      </Text>
                    </View>
                    {feeSummaryError ? (
                      <Card>
                        <Text style={s.empty}>
                          Fee report data is temporarily unavailable. Refresh to try again.
                        </Text>
                      </Card>
                    ) : (
                      <>
                        <Card>
                          <SectionTitle title="Collection by day" />
                          {collectionByDate.length ? (
                            collectionByDate.slice(-8).map((row, index) => (
                              <DataRow
                                key={`${row._id || "date"}-${index}`}
                                label={fullDate(row._id)}
                                value={formatMoney(Number(row.total || 0))}
                              />
                            ))
                          ) : (
                            <Text style={s.empty}>No fee report data yet.</Text>
                          )}
                        </Card>
                        <Card>
                          <SectionTitle title="Outstanding by class & fee type" />
                          {pendingByClass.length ? (
                            pendingByClass.map((row, index) => (
                              <DataRow
                                key={`${row._id?.class || "class"}-${row._id?.feeType || index}`}
                                label={`${row._id?.class || "—"} · ${row._id?.feeType || "—"}`}
                                value={`${formatMoney(Number(row.outstanding || 0))} · ${row.count || 0} invoices`}
                              />
                            ))
                          ) : (
                            <Text style={s.empty}>No outstanding fee data.</Text>
                          )}
                        </Card>
                        <Card>
                          <SectionTitle title="Class-wise collection" />
                          {classCollections.length ? (
                            classCollections.map((row, index) => (
                              <DataRow
                                key={`${row._id || "class"}-${index}`}
                                label={row._id || "—"}
                                value={`${formatMoney(Number(row.total || 0))} · ${row.count || 0} payments`}
                              />
                            ))
                          ) : (
                            <Text style={s.empty}>No class collection data.</Text>
                          )}
                        </Card>
                        <Card>
                          <SectionTitle title="Fee type-wise collection" />
                          {typeCollections.length ? (
                            typeCollections.map((row, index) => (
                              <DataRow
                                key={`${row._id || "fee-type"}-${index}`}
                                label={row._id || "—"}
                                value={`${formatMoney(Number(row.total || 0))} · ${row.count || 0} payments`}
                              />
                            ))
                          ) : (
                            <Text style={s.empty}>No fee type collection data.</Text>
                          )}
                        </Card>
                      </>
                    )}
                  </View>
                )}
              </>
            )}
          </View>
        ) : (
          <View style={s.stack}>
            <Text style={s.helper}>
              Choose a report, add any optional filters and share the CSV file.
            </Text>
            {availableReports.length === 0 ? (
              <Card>
                <Text style={s.empty}>
                  Your account does not have permission to generate reports.
                </Text>
              </Card>
            ) : (
              availableReports.map((report) => (
                <Pressable
                  key={report.id}
                  onPress={() => selectReport(report)}
                  style={[
                    s.reportCard,
                    selectedId === report.id && s.reportCardSelected,
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: selectedId === report.id }}
                >
                  <View style={s.reportIcon}>
                    <Ionicons
                      name="document-text-outline"
                      size={19}
                      color={selectedId === report.id ? colors.ink : colors.info}
                    />
                  </View>
                  <View style={s.reportInfo}>
                    <Text style={s.reportTitle}>{report.title}</Text>
                    <Text style={s.reportDescription}>{report.description}</Text>
                  </View>
                  <Ionicons
                    name={selectedId === report.id ? "checkmark-circle" : "chevron-forward"}
                    size={20}
                    color={selectedId === report.id ? colors.success : colors.muted}
                  />
                </Pressable>
              ))
            )}
            {selectedReport && (
              <Card>
                <Text style={s.sectionHeading}>
                  {selectedReport.title} — Generate
                </Text>
                {selectedReport.fields.length === 0 ? (
                  <Text style={s.helper}>
                    No filters required. This report includes the full dataset.
                  </Text>
                ) : (
                  <View style={s.fields}>
                    {selectedReport.fields.map((field) => (
                      <View key={field} style={s.field}>
                        <Text style={s.fieldLabel}>{FIELD_LABELS[field]}</Text>
                        <Input
                          value={filters[field] || ""}
                          onChangeText={(value) => setFilter(field, value)}
                          placeholder={`Optional ${FIELD_LABELS[field].toLowerCase()}`}
                          autoCapitalize="none"
                        />
                      </View>
                    ))}
                  </View>
                )}
                {!!generatedInfo && (
                  <Text style={s.successMessage}>
                    {generatedInfo} ready to share.
                  </Text>
                )}
                <Button
                  title="Generate & share CSV"
                  onPress={() => void generateReport()}
                  loading={generating}
                />
              </Card>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function Stat({
  label,
  value,
  detail,
  color = colors.ink,
}: {
  label: string;
  value: string;
  detail: string;
  color?: string;
}) {
  return (
    <Card style={s.statCard}>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={[s.statValue, { color }]}>{value}</Text>
      <Text style={s.statDetail}>{detail}</Text>
    </Card>
  );
}

function SectionTitle({ title }: { title: string }) {
  return <Text style={s.cardTitle}>{title}</Text>;
}

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.dataRow}>
      <Text style={s.dataLabel}>{label}</Text>
      <Text style={s.dataValue}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 16, paddingBottom: 36, gap: 16 },
  heading: { flexDirection: "row", alignItems: "center", gap: 12 },
  headingText: { flex: 1 },
  eyebrow: {
    color: colors.info,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.1,
  },
  title: { color: colors.ink, fontSize: 23, fontWeight: "800", marginTop: 4 },
  subtitle: { color: colors.muted, fontSize: 13, marginTop: 4 },
  headingIcon: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: "#E9EEF8",
    alignItems: "center",
    justifyContent: "center",
  },
  tabs: {
    backgroundColor: "#E9EDF4",
    borderRadius: radius.md,
    padding: 4,
    flexDirection: "row",
    gap: 6,
  },
  tab: {
    flex: 1,
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderRadius: radius.sm,
  },
  activeTab: { backgroundColor: colors.ink },
  tabText: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  activeTabText: { color: colors.paper },
  stack: { gap: 12 },
  refresh: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-end",
    gap: 6,
    paddingVertical: 4,
  },
  refreshText: { color: colors.info, fontSize: 12, fontWeight: "700" },
  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  statCard: { width: "48%", flexGrow: 1, minHeight: 108 },
  statLabel: { color: colors.muted, fontSize: 11, fontWeight: "700" },
  statValue: { fontSize: 21, fontWeight: "800", marginTop: 8 },
  statDetail: { color: colors.muted, fontSize: 10, marginTop: 5 },
  cardTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "800",
    marginBottom: 12,
  },
  empty: {
    color: colors.muted,
    textAlign: "center",
    fontSize: 12,
    paddingVertical: 12,
  },
  barRow: { flexDirection: "row", alignItems: "center", gap: 9, marginTop: 10 },
  barLabel: { width: 52, color: colors.ink, fontSize: 11, fontWeight: "600" },
  statusLabel: { width: 105, color: colors.ink, fontSize: 11, fontWeight: "600" },
  barTrack: {
    flex: 1,
    height: 9,
    backgroundColor: "#EEF1F5",
    borderRadius: 6,
    overflow: "hidden",
  },
  barFill: { height: "100%", backgroundColor: colors.info, borderRadius: 6 },
  barValue: {
    width: 35,
    textAlign: "right",
    color: colors.ink,
    fontSize: 11,
    fontWeight: "700",
  },
  trendRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 9 },
  trendMonth: { width: 48, color: colors.muted, fontSize: 11 },
  trendBars: {
    flex: 1,
    gap: 3,
    alignItems: "flex-start",
  },
  trendCollected: {
    height: 7,
    backgroundColor: colors.success,
    borderRadius: 5,
  },
  trendPending: {
    height: 5,
    backgroundColor: colors.alert,
    borderRadius: 5,
  },
  trendValue: {
    width: 75,
    textAlign: "right",
    color: colors.ink,
    fontSize: 10,
    fontWeight: "700",
  },
  legend: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 14,
  },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { color: colors.muted, fontSize: 10, marginRight: 6 },
  subtle: { color: colors.muted, fontSize: 11, marginTop: 10 },
  sectionHeading: { color: colors.ink, fontSize: 16, fontWeight: "800" },
  dataRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E9EF",
    paddingVertical: 10,
  },
  dataLabel: { flex: 1, color: colors.ink, fontSize: 11, fontWeight: "600" },
  dataValue: {
    maxWidth: "58%",
    textAlign: "right",
    color: colors.muted,
    fontSize: 10,
    fontWeight: "600",
  },
  helper: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  reportCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E7EAF0",
    borderRadius: radius.md,
    padding: 13,
  },
  reportCardSelected: {
    borderColor: colors.info,
    backgroundColor: "#F6F9FF",
  },
  reportIcon: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#EEF3FB",
  },
  reportInfo: { flex: 1, gap: 3 },
  reportTitle: { color: colors.ink, fontSize: 13, fontWeight: "800" },
  reportDescription: { color: colors.muted, fontSize: 11, lineHeight: 16 },
  fields: { gap: 12, marginVertical: 14 },
  field: { gap: 5 },
  fieldLabel: { color: colors.ink, fontSize: 11, fontWeight: "700" },
  successMessage: {
    color: colors.success,
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 12,
  },
});
