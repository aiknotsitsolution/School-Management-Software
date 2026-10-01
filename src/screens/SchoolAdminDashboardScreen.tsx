import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { BarChart, Point, TrendChart } from "../components/Charts";
import { Card } from "../components/UI";
import { colors } from "../theme";
import type {
  AdmissionEnquiry,
  AttendanceRecord,
  FeeInvoice,
  FeePayment,
  Notice,
  SchoolEvent,
  StaffRecord,
  Student,
  TransportRoute,
} from "../types";

interface StudentStats {
  total: number;
  active: number;
  byClass?: { _id?: string; count?: number }[];
}

interface DashboardData {
  studentStats: StudentStats;
  students: Student[];
  attendance: AttendanceRecord[];
  staffAttendance: AttendanceRecord[];
  invoices: FeeInvoice[];
  payments: FeePayment[];
  admissions: AdmissionEnquiry[];
  notices: Notice[];
  busRoutes: TransportRoute[];
  staff: StaffRecord[];
  events: SchoolEvent[];
}

const emptyData: DashboardData = {
  studentStats: { total: 0, active: 0, byClass: [] },
  students: [],
  attendance: [],
  staffAttendance: [],
  invoices: [],
  payments: [],
  admissions: [],
  notices: [],
  busRoutes: [],
  staff: [],
  events: [],
};

const todayKey = () => new Date().toISOString().slice(0, 10);
const dateKey = (value?: string) => {
  if (!value) return "";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? ""
    : parsed.toISOString().slice(0, 10);
};
export default function SchoolAdminDashboardScreen() {
  const { user, school } = useAuth();
  const [data, setData] = useState<DashboardData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setRefreshing(true);
    setError("");
    try {
      const results = await Promise.allSettled([
        api.students.stats(),
        api.students.list("limit=1000"),
        api.attendance.list("limit=2000"),
        api.fees.invoices.list("limit=1000"),
        api.fees.payments.list("limit=1000"),
        api.admissions.list(),
        api.notices.list(),
        api.transport.list("limit=1000"),
        api.staff.list("limit=1000"),
        api.events.list(),
        api.staff.attendance.list("limit=2000"),
      ]);
      const labels = [
        "Student totals",
        "Students",
        "Attendance",
        "Invoices",
        "Payments",
        "Admissions",
        "Notices",
        "Transport",
        "Staff",
        "Events",
        "Staff attendance",
      ];
      const failures = results.flatMap((result, index) =>
        result.status === "rejected"
          ? [
              `${labels[index]}: ${(result.reason as Error)?.message || "Request failed"}`,
            ]
          : [],
      );
      const dataAt = <T,>(index: number, previous: T, fallback: T): T => {
        const result = results[index];
        if (result.status === "fulfilled") {
          return (result.value.data as T | null | undefined) ?? fallback;
        }
        return previous ?? fallback;
      };
      setData((previous) => ({
        studentStats: dataAt(0, previous.studentStats, emptyData.studentStats),
        students: dataAt(1, previous.students, emptyData.students),
        attendance: dataAt(2, previous.attendance, emptyData.attendance),
        invoices: dataAt(3, previous.invoices, emptyData.invoices),
        payments: dataAt(4, previous.payments, emptyData.payments),
        admissions: dataAt(5, previous.admissions, emptyData.admissions),
        notices: dataAt(6, previous.notices, emptyData.notices),
        busRoutes: dataAt(7, previous.busRoutes, emptyData.busRoutes),
        staff: dataAt(8, previous.staff, emptyData.staff),
        events: dataAt(9, previous.events, emptyData.events),
        staffAttendance: dataAt(
          10,
          previous.staffAttendance,
          emptyData.staffAttendance,
        ),
      }));
      setError(failures.join(" · "));
    } catch (loadError) {
      setError(
        (loadError as Error).message || "Dashboard data could not be loaded.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const classStrength = useMemo(() => {
    const buckets = new Map<string, number>();
    data.students.forEach((student) => {
      const className = String(student.class || "Unassigned").trim();
      const section = String(student.section || "").trim();
      const label = section ? `${className}-${section}` : className;
      buckets.set(label, (buckets.get(label) || 0) + 1);
    });
    return [...buckets.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => a.label.localeCompare(b.label, "en", { numeric: true }));
  }, [data.students]);

  const todayAttendance = data.attendance.filter(
    (record) => dateKey(record.date) === todayKey(),
  );
  const presentToday = todayAttendance.filter((record) =>
    /^(present|late)$/i.test(record.status),
  ).length;
  const attendancePercent = todayAttendance.length
    ? Math.round((presentToday / todayAttendance.length) * 100)
    : 0;
  const collected = data.payments.reduce(
    (sum, payment) => sum + Number(payment.amount || 0),
    0,
  );
  const invoiced = data.invoices.reduce(
    (sum, invoice) => sum + Number(invoice.amount || 0),
    0,
  );
  const outstanding = data.invoices.reduce(
    (sum, invoice) =>
      sum +
      Math.max(
        0,
        Number(invoice.amount || 0) - Number(invoice.paidAmount || 0),
      ),
    0,
  );
  const pendingEnquiries = data.admissions.filter((item) =>
    /^(new|pending)$/i.test(item.status || ""),
  ).length;
  const teachers = data.staff.filter(
    (member) => member.role === "teacher",
  ).length;
  const staffToday = data.staffAttendance.filter(
    (record) => dateKey(record.date) === todayKey(),
  );
  const staffPresent = staffToday.filter((record) =>
    /^(present|late)$/i.test(record.status),
  ).length;
  const inactiveStudents = Math.max(
    0,
    data.studentStats.total - data.studentStats.active,
  );

  const attendanceWatchlist = useMemo(
    () =>
      data.students
        .map((student) => {
          const records = data.attendance.filter(
            (record) => String(record.studentId) === String(student._id),
          );
          const present = records.filter((record) =>
            /^(present|late)$/i.test(record.status),
          ).length;
          return {
            student,
            percentage: records.length
              ? Math.round((present / records.length) * 100)
              : 0,
          };
        })
        .filter((entry) => entry.percentage > 0)
        .sort((a, b) => a.percentage - b.percentage)
        .slice(0, 5),
    [data.attendance, data.students],
  );

  const attendanceTrend: Point[] = useMemo(() => {
    const daily = new Map<string, { marked: number; present: number }>();
    data.attendance.forEach((record) => {
      const key = dateKey(record.date);
      if (!key) return;
      const entry = daily.get(key) || { marked: 0, present: 0 };
      entry.marked += 1;
      if (/^(present|late)$/i.test(record.status)) entry.present += 1;
      else if (/half/i.test(record.status)) entry.present += 0.5;
      daily.set(key, entry);
    });
    return [...daily.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-14)
      .map(([key, entry]) => ({
        label: key.slice(5).replace("-", "/"),
        value: Math.round((entry.present / entry.marked) * 100),
      }));
  }, [data.attendance]);

  const staffAttendanceTrend: Point[] = useMemo(() => {
    const daily = new Map<string, { marked: number; present: number }>();
    data.staffAttendance.forEach((record) => {
      const key = dateKey(record.date);
      if (!key) return;
      const entry = daily.get(key) || { marked: 0, present: 0 };
      entry.marked += 1;
      if (/^(present|late)$/i.test(record.status)) entry.present += 1;
      daily.set(key, entry);
    });
    return [...daily.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-14)
      .map(([key, entry]) => ({
        label: key.slice(5).replace("-", "/"),
        value: Math.round((entry.present / entry.marked) * 100),
      }));
  }, [data.staffAttendance]);

  const feeTrend: Point[] = useMemo(() => {
    const months = new Map<string, number>();
    data.payments.forEach((payment) => {
      const parsed = new Date(payment.paidOn || "");
      if (Number.isNaN(parsed.getTime())) return;
      const key = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}`;
      months.set(key, (months.get(key) || 0) + Number(payment.amount || 0));
    });
    return [...months.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([key, value]) => ({ label: key.slice(5), value }));
  }, [data.payments]);

  const upcomingEvents = data.events
    .filter((event) => {
      const eventDate = new Date(event.date || "");
      return !Number.isNaN(eventDate.getTime()) && eventDate >= new Date();
    })
    .sort(
      (a, b) =>
        new Date(a.date || "").getTime() - new Date(b.date || "").getTime(),
    )
    .slice(0, 5);

  if (loading && data.students.length === 0 && data.staff.length === 0) {
    return (
      <View style={s.loading}>
        <ActivityIndicator size="large" color={colors.ink} />
      </View>
    );
  }

  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={s.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={load} />
      }
    >
      <View style={s.hero}>
        <Text style={s.eyebrow}>SCHOOL ADMINISTRATION</Text>
        <Text style={s.heroTitle}>
          Hello, {(user?.name || "Administrator").split(" ")[0]}
        </Text>
        <Text style={s.heroSubtitle}>
          {school?.name || "School dashboard"}
          {school?.currentSession?.name || school?.session
            ? ` · ${school.currentSession?.name || school.session}`
            : ""}
        </Text>
        <Text style={s.heroMeta}>
          {data.studentStats.total.toLocaleString("en-IN")} students ·{" "}
          {teachers} teachers · {data.staff.length - teachers} support staff
        </Text>
      </View>

      {!!error && (
        <View style={s.errorBox}>
          <Text style={s.errorText}>{error}</Text>
          <Pressable
            onPress={load}
            disabled={refreshing}
            accessibilityRole="button"
          >
            <Text style={s.retry}>{refreshing ? "Loading..." : "Retry"}</Text>
          </Pressable>
        </View>
      )}

      <View style={s.metrics}>
        <Metric
          icon="people"
          label="Students"
          value={data.studentStats.total.toLocaleString("en-IN")}
          detail={`${data.studentStats.active.toLocaleString("en-IN")} active`}
          accent={colors.info}
        />
        <Metric
          icon="calendar"
          label="Attendance today"
          value={`${attendancePercent}%`}
          detail={`${presentToday} of ${todayAttendance.length} marked`}
          accent={colors.success}
        />
        <Metric
          icon="wallet"
          label="Fees collected"
          value={shortMoney(collected)}
          detail={`of ${shortMoney(invoiced)} invoiced`}
          accent={colors.amberDark}
        />
        <Metric
          icon="person-add"
          label="Admission enquiries"
          value={String(data.admissions.length)}
          detail={`${pendingEnquiries} pending`}
          accent={colors.alert}
        />
      </View>

      <View style={s.metricStrip}>
        <MiniMetric label="Teachers" value={String(teachers)} icon="school" />
        <MiniMetric
          label="Support staff"
          value={String(Math.max(0, data.staff.length - teachers))}
          icon="briefcase"
        />
        <MiniMetric
          label="Class sections"
          value={String(classStrength.length)}
          icon="layers"
        />
        <MiniMetric
          label="Upcoming events"
          value={String(upcomingEvents.length)}
          icon="calendar"
        />
      </View>

      <Section
        title="Students by section"
        action={`${data.students.length} records`}
      >
        <Card style={s.panelCard}>
          <BarChart data={classStrength} color={colors.info} />
        </Card>
      </Section>

      <Section
        title="Staff presence today"
        action={`${staffPresent}/${data.staff.length} present`}
      >
        <View style={s.staffStats}>
          <SmallStat
            label="Present"
            value={staffPresent}
            color={colors.success}
          />
          <SmallStat
            label="Absent"
            value={
              staffToday.filter((record) => /absent/i.test(record.status))
                .length
            }
            color={colors.alert}
          />
          <SmallStat
            label="Not marked"
            value={Math.max(0, data.staff.length - staffToday.length)}
            color={colors.amberDark}
          />
        </View>
      </Section>

      <Section title="Staff attendance trend" action="Last 14 days">
        <Card style={s.panelCard}>
          <TrendChart data={staffAttendanceTrend} color={colors.info} />
        </Card>
      </Section>

      <Section title="Attendance trend" action="Last 14 days">
        <Card style={s.panelCard}>
          <TrendChart data={attendanceTrend} />
        </Card>
      </Section>

      <Section
        title="Fee collection"
        action={`${shortMoney(outstanding)} outstanding`}
      >
        <Card style={s.panelCard}>
          <View style={s.feeSummary}>
            <View>
              <Text style={s.summaryLabel}>Collected</Text>
              <Text style={[s.summaryValue, { color: colors.success }]}>
                {money(collected)}
              </Text>
            </View>
            <View>
              <Text style={s.summaryLabel}>Outstanding</Text>
              <Text style={[s.summaryValue, { color: colors.alert }]}>
                {money(outstanding)}
              </Text>
            </View>
          </View>
          <BarChart data={feeTrend} color={colors.success} />
        </Card>
      </Section>

      <Section
        title="Recent admission enquiries"
        action={`${data.admissions.length} total`}
      >
        {data.admissions.slice(0, 5).map((item, index) => (
          <Card key={item._id || index} style={s.listCard}>
            <View style={s.listTop}>
              <Text style={s.listTitle}>{item.childName || "New enquiry"}</Text>
              <StatusPill label={item.status || "New"} />
            </View>
            <Text style={s.listMeta}>
              Class {item.classApplied || "—"} · {dateLabel(item.createdAt)}
            </Text>
          </Card>
        ))}
        {!data.admissions.length && (
          <EmptyText text="No admission enquiries yet." />
        )}
      </Section>

      <Section title="Attendance watchlist" action="Lowest attendance">
        {attendanceWatchlist.map(({ student, percentage }) => (
          <Card key={student._id} style={s.watchlistCard}>
            <View style={s.watchlistTop}>
              <View style={s.watchlistIdentity}>
                <Text style={s.listTitle}>{student.name || "Student"}</Text>
                <Text style={s.listMeta}>
                  Class {student.class || "—"}
                  {student.section ? `-${student.section}` : ""}
                </Text>
              </View>
              <Text
                style={[
                  s.attendanceValue,
                  percentage < 60 ? s.lowAttendance : null,
                ]}
              >
                {percentage}%
              </Text>
            </View>
            <View style={s.progressTrack}>
              <View
                style={[
                  s.progressFill,
                  { width: `${Math.max(3, percentage)}%` },
                  percentage < 60 ? s.progressLow : null,
                ]}
              />
            </View>
          </Card>
        ))}
        {!attendanceWatchlist.length && (
          <EmptyText text="No attendance concerns found." />
        )}
      </Section>

      <Section title="Notices" action={`${data.notices.length} available`}>
        {data.notices.slice(0, 4).map((notice, index) => (
          <Card key={notice._id || index} style={s.listCard}>
            <Text style={s.listTitle}>{notice.title}</Text>
            <Text numberOfLines={2} style={s.listMeta}>
              {notice.body}
            </Text>
            <Text style={s.dateText}>{dateLabel(notice.createdAt)}</Text>
          </Card>
        ))}
        {!data.notices.length && <EmptyText text="No notices available." />}
      </Section>

      <Section title="Bus fleet" action={`${data.busRoutes.length} routes`}>
        {data.busRoutes.slice(0, 5).map((route, index) => (
          <Card key={route._id || index} style={s.listCard}>
            <View style={s.listTop}>
              <Text style={s.listTitle}>
                {route.routeNo || `Route ${index + 1}`}
              </Text>
              <StatusPill
                label={route.currentLocation ? "Live" : "Not tracking"}
              />
            </View>
            <Text style={s.listMeta}>
              {route.stops?.length || 0} stops ·{" "}
              {route.assignedStudents?.length || 0} assigned students
            </Text>
          </Card>
        ))}
        {!data.busRoutes.length && (
          <EmptyText text="No bus routes configured." />
        )}
      </Section>

      <Section
        title="Upcoming events"
        action={`${upcomingEvents.length} upcoming`}
      >
        {upcomingEvents.map((event, index) => (
          <Card key={event._id || index} style={s.listCard}>
            <Text style={s.listTitle}>{event.title}</Text>
            <Text style={s.listMeta}>
              {dateLabel(event.date)}
              {event.venue ? ` · ${event.venue}` : ""}
            </Text>
          </Card>
        ))}
        {!upcomingEvents.length && <EmptyText text="No upcoming events." />}
      </Section>

      <Section title="Enrolment mix" action="Active vs inactive students">
        <Card style={s.enrolmentCard}>
          <BarChart
            data={[
              { label: "Active", value: data.studentStats.active },
              { label: "Inactive", value: inactiveStudents },
            ]}
            color={colors.success}
          />
          <Text style={s.ratioText}>
            Student to staff ratio:{" "}
            {data.staff.length
              ? `1 : ${Math.round(data.studentStats.total / data.staff.length)}`
              : "—"}
          </Text>
        </Card>
      </Section>
    </ScrollView>
  );
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={s.section}>
      <View style={s.sectionHeading}>
        <Text style={s.sectionTitle}>{title}</Text>
        {!!action && <Text style={s.sectionAction}>{action}</Text>}
      </View>
      {children}
    </View>
  );
}

function Metric({
  icon,
  label,
  value,
  detail,
  accent,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  value: string;
  detail: string;
  accent: string;
}) {
  return (
    <Card style={s.metricCard}>
      <Ionicons name={icon} size={17} color={accent} />
      <Text style={s.metricLabel}>{label}</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit style={s.metricValue}>
        {value}
      </Text>
      <Text numberOfLines={1} style={s.metricDetail}>
        {detail}
      </Text>
    </Card>
  );
}

function MiniMetric({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
}) {
  return (
    <View style={s.miniMetric}>
      <Ionicons name={icon} size={15} color={colors.info} />
      <Text style={s.miniValue}>{value}</Text>
      <Text style={s.miniLabel}>{label}</Text>
    </View>
  );
}

function SmallStat({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <Card style={s.smallStat}>
      <Text style={[s.smallValue, { color }]}>{value}</Text>
      <Text style={s.smallLabel}>{label}</Text>
    </Card>
  );
}

function StatusPill({ label }: { label: string }) {
  const live = /live|present|active/i.test(label);
  return (
    <View style={[s.pill, live ? s.pillLive : s.pillNeutral]}>
      <Text style={[s.pillText, live ? s.pillLiveText : s.pillNeutralText]}>
        {label}
      </Text>
    </View>
  );
}

function EmptyText({ text }: { text: string }) {
  return <Text style={s.empty}>{text}</Text>;
}

function dateLabel(value?: string) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "—"
    : parsed.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function money(value: number) {
  return `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function shortMoney(value: number) {
  const amount = Number(value || 0);
  if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(1)}Cr`;
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
  return money(amount);
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 16, paddingBottom: 32, gap: 17 },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.paper,
  },
  hero: { padding: 18, borderRadius: 8, backgroundColor: colors.ink, gap: 5 },
  eyebrow: { color: colors.amber, fontSize: 9, fontWeight: "800" },
  heroTitle: { color: "#fff", fontSize: 23, fontWeight: "800" },
  heroSubtitle: { color: "rgba(255,255,255,0.78)", fontSize: 11 },
  heroMeta: { color: "rgba(255,255,255,0.58)", fontSize: 9, marginTop: 4 },
  errorBox: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    padding: 11,
    borderRadius: 8,
    backgroundColor: "#FFF1EF",
    borderWidth: 1,
    borderColor: colors.alert,
  },
  errorText: { color: colors.alert, flex: 1, fontSize: 10 },
  retry: { color: colors.info, fontSize: 10, fontWeight: "800", padding: 4 },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  metricCard: {
    width: "48%",
    minHeight: 113,
    justifyContent: "space-between",
    padding: 12,
    borderRadius: 8,
  },
  metricLabel: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: "600",
    marginTop: 3,
  },
  metricValue: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: "800",
    marginTop: 5,
  },
  metricDetail: { color: colors.muted, fontSize: 9, marginTop: 3 },
  metricStrip: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 5,
    paddingVertical: 12,
    paddingHorizontal: 9,
    borderRadius: 8,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.border,
  },
  miniMetric: { flex: 1, alignItems: "center", gap: 4 },
  miniValue: { color: colors.ink, fontSize: 14, fontWeight: "800" },
  miniLabel: { color: colors.muted, fontSize: 8, textAlign: "center" },
  section: { gap: 8 },
  sectionHeading: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: 8,
  },
  sectionTitle: { color: colors.ink, fontSize: 14, fontWeight: "800" },
  sectionAction: { color: colors.muted, fontSize: 9 },
  panelCard: { padding: 8, borderRadius: 8 },
  staffStats: { flexDirection: "row", gap: 8 },
  smallStat: {
    flex: 1,
    alignItems: "center",
    gap: 4,
    padding: 11,
    borderRadius: 8,
  },
  smallValue: { fontSize: 20, fontWeight: "800" },
  smallLabel: { color: colors.muted, fontSize: 9 },
  feeSummary: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: 8,
  },
  summaryLabel: { color: colors.muted, fontSize: 9 },
  summaryValue: { fontSize: 14, fontWeight: "800", marginTop: 3 },
  listCard: { padding: 11, borderRadius: 8, gap: 5 },
  listTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  listTitle: { flex: 1, color: colors.ink, fontSize: 11, fontWeight: "700" },
  listMeta: { color: colors.muted, fontSize: 9, lineHeight: 14 },
  dateText: { color: colors.muted, fontSize: 8 },
  pill: { borderRadius: 12, paddingHorizontal: 7, paddingVertical: 4 },
  pillLive: { backgroundColor: "#E8F5EC" },
  pillNeutral: { backgroundColor: "#F1F2F4" },
  pillText: { fontSize: 8, fontWeight: "700", textTransform: "capitalize" },
  pillLiveText: { color: colors.success },
  pillNeutralText: { color: colors.muted },
  watchlistCard: { padding: 11, borderRadius: 8, gap: 8 },
  watchlistTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  watchlistIdentity: { flex: 1, gap: 3 },
  attendanceValue: { color: colors.success, fontSize: 14, fontWeight: "800" },
  lowAttendance: { color: colors.alert },
  progressTrack: {
    height: 5,
    overflow: "hidden",
    borderRadius: 3,
    backgroundColor: colors.border,
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
    backgroundColor: colors.success,
  },
  progressLow: { backgroundColor: colors.alert },
  enrolmentCard: { padding: 9, borderRadius: 8 },
  ratioText: {
    color: colors.muted,
    textAlign: "center",
    fontSize: 10,
    marginTop: 3,
  },
  empty: {
    color: colors.muted,
    textAlign: "center",
    padding: 18,
    fontSize: 10,
  },
});
