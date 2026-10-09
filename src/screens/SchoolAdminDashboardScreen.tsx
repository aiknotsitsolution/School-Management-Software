import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ImageBackground,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { BarChart, PieChart, Point, TrendChart } from "../components/Charts";
import { Card } from "../components/UI";
import { colors } from "../theme";
import type { RootStackParams } from "../../App";
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
  const { user, school, can } = useAuth();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParams>>();
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

  const quickActions = [
    {
      label: "Add student",
      icon: "person-add" as const,
      color: colors.info,
      permission: "students:write",
      onPress: () => navigation.navigate("Form", { form: "student" }),
    },
    {
      label: "Staff",
      icon: "briefcase" as const,
      color: "#7257C8",
      permission: "staff:read",
      onPress: () => navigation.navigate("Staff"),
    },
    {
      label: "Collect fee",
      icon: "wallet" as const,
      color: colors.success,
      permission: "fees:collect",
      onPress: () => navigation.navigate("FeesCollection"),
    },
    {
      label: "Publish notice",
      icon: "megaphone" as const,
      color: colors.amberDark,
      permission: "notices:publish",
      onPress: () => navigation.navigate("Form", { form: "notice" }),
    },
    {
      label: "New event",
      icon: "calendar" as const,
      color: colors.alert,
      permission: "events:publish",
      onPress: () =>
        navigation.navigate("Module", {
          title: "Events",
          endpoint: "/events",
        }),
    },
    {
      label: "Homework",
      icon: "book" as const,
      color: "#168C84",
      permission: "homework:read",
      onPress: () =>
        navigation.navigate("Module", {
          title: "Homework",
          endpoint: "/homework",
        }),
    },
  ].filter((action) => can(action.permission));

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
      <ImageBackground
        source={
          school?.settings?.bannerImage
            ? { uri: school.settings.bannerImage }
            : undefined
        }
        style={s.hero}
        imageStyle={s.heroImage}
      >
        <View style={s.heroOverlay} />
        <View style={s.heroTopline}>
          <Text style={s.eyebrow}>SCHOOL ADMINISTRATION</Text>
          <Text style={s.heroDate}>
            {new Date().toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </Text>
        </View>
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
          {data.studentStats.active.toLocaleString("en-IN")} active · {teachers}{" "}
          teachers · {Math.max(0, data.staff.length - teachers)} staff
        </Text>
        <View style={s.heroStats}>
          <HeroStat
            value={`${attendancePercent}%`}
            label="Attendance today"
          />
          <HeroStat
            value={String(pendingEnquiries)}
            label="New enquiries"
          />
          <HeroStat
            value={data.studentStats.total.toLocaleString("en-IN")}
            label="Students"
          />
        </View>
      </ImageBackground>

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

      {!!quickActions.length && (
        <Section title="Quick actions" action="Common tasks">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.quickActions}
          >
            {quickActions.map((action) => (
              <Pressable
                key={action.label}
                onPress={action.onPress}
                accessibilityRole="button"
                accessibilityLabel={action.label}
                style={({ pressed }) => [
                  s.quickAction,
                  pressed && s.quickActionPressed,
                ]}
              >
                <View
                  style={[
                    s.quickActionIcon,
                    { backgroundColor: `${action.color}18` },
                  ]}
                >
                  <Ionicons
                    name={action.icon}
                    size={19}
                    color={action.color}
                  />
                </View>
                <Text numberOfLines={1} style={s.quickActionLabel}>
                  {action.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </Section>
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
          <PieChart data={classStrength} />
        </Card>
      </Section>

      <Section
        title="Staff presence today"
        action={`${staffPresent}/${data.staff.length} present`}
      >
        <Card style={s.panelCard}>
          <PieChart
            data={[
              { label: "Present", value: staffPresent },
              {
                label: "Absent",
                value: staffToday.filter((record) =>
                  /absent/i.test(record.status),
                ).length,
              },
              {
                label: "Not marked",
                value: Math.max(0, data.staff.length - staffToday.length),
              },
            ]}
            palette={[colors.success, colors.alert, colors.amberDark]}
          />
        </Card>
      </Section>

      <Section title="Staff attendance trend" action="Last 14 days">
        <Card style={s.panelCard}>
          <TrendChart
            data={staffAttendanceTrend}
            color={colors.info}
            showArea={false}
          />
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
              <View
                style={[
                  s.watchlistAvatar,
                  percentage < 60
                    ? s.watchlistAvatarLow
                    : percentage < 75
                      ? s.watchlistAvatarMedium
                      : null,
                ]}
              >
                <Text style={s.watchlistAvatarText}>
                  {(student.name || "S").trim().charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={s.watchlistIdentity}>
                <Text style={s.listTitle}>{student.name || "Student"}</Text>
                <Text style={s.listMeta}>
                  Class {student.class || "—"}
                  {student.section ? `-${student.section}` : ""}
                </Text>
              </View>
              <View style={s.watchlistScore}>
                <Text
                  style={[
                    s.attendanceValue,
                    percentage < 60
                      ? s.lowAttendance
                      : percentage < 75
                        ? s.mediumAttendance
                        : null,
                  ]}
                >
                  {percentage}%
                </Text>
                <Text style={s.watchlistScoreLabel}>attendance</Text>
              </View>
            </View>
            <View style={s.watchlistProgressRow}>
              <View style={s.progressTrack}>
                <View
                  style={[
                    s.progressFill,
                    { width: `${Math.max(3, percentage)}%` },
                    percentage < 60
                      ? s.progressLow
                      : percentage < 75
                        ? s.progressMedium
                        : null,
                  ]}
                />
              </View>
              <View
                style={[
                  s.watchlistBadge,
                  percentage < 60
                    ? s.watchlistBadgeLow
                    : percentage < 75
                      ? s.watchlistBadgeMedium
                      : s.watchlistBadgeGood,
                ]}
              >
                <Ionicons
                  name={percentage < 75 ? "alert-circle" : "checkmark-circle"}
                  size={12}
                  color={
                    percentage < 60
                      ? colors.alert
                      : percentage < 75
                        ? colors.amberDark
                        : colors.success
                  }
                />
                <Text
                  style={[
                    s.watchlistBadgeText,
                    percentage < 60
                      ? s.lowAttendance
                      : percentage < 75
                        ? s.mediumAttendance
                        : s.goodAttendance,
                  ]}
                >
                  {percentage < 60
                    ? "Critical"
                    : percentage < 75
                      ? "Needs attention"
                      : "On track"}
                </Text>
              </View>
            </View>
          </Card>
        ))}
        {!attendanceWatchlist.length && (
          <Card style={s.watchlistEmpty}>
            <View style={s.watchlistEmptyIcon}>
              <Ionicons
                name="checkmark-circle"
                size={21}
                color={colors.success}
              />
            </View>
            <View style={s.watchlistIdentity}>
              <Text style={s.listTitle}>All students are on track</Text>
              <Text style={s.listMeta}>
                No attendance concerns found.
              </Text>
            </View>
          </Card>
        )}
      </Section>

      <Section title="Pinned Notices" action="All">
        {data.notices.slice(0, 4).map((notice, index) => {
          const audience = notice.audience?.[0] || notice.category || "All";
          return (
            <Card key={notice._id || index} style={s.pinnedNotice}>
              <View style={s.pinnedNoticeIcon}>
                <Ionicons
                  name="megaphone"
                  size={17}
                  color={colors.amberDark}
                />
              </View>
              <View style={s.pinnedNoticeContent}>
                <Text numberOfLines={1} style={s.listTitle}>
                  {notice.title}
                </Text>
                <Text numberOfLines={1} style={s.listMeta}>
                  {audience} · {dateLabel(notice.createdAt)}
                </Text>
              </View>
              {notice.pinned && (
                <Ionicons name="pin" size={15} color={colors.amberDark} />
              )}
            </Card>
          );
        })}
        {!data.notices.length && (
          <Card style={s.pinnedNoticeEmpty}>
            <View style={s.pinnedNoticeIcon}>
              <Ionicons
                name="megaphone"
                size={17}
                color={colors.amberDark}
              />
            </View>
            <View style={s.pinnedNoticeContent}>
              <Text style={s.listTitle}>No pinned notices</Text>
              <Text style={s.listMeta}>
                School announcements will appear here.
              </Text>
            </View>
          </Card>
        )}
      </Section>

      <Section title="Bus fleet" action={`${data.busRoutes.length} routes`}>
        {data.busRoutes.slice(0, 5).map((route, index) => {
          const stops = route.stops || [];
          const stopName = (stop: (typeof stops)[number] | undefined) =>
            typeof stop === "string" ? stop : stop?.name;
          const firstStop = stopName(stops[0]);
          const lastStop =
            stops.length > 1 ? stopName(stops[stops.length - 1]) : undefined;
          const isTracking = Boolean(route.currentLocation);

          return (
            <Card key={route._id || index} style={s.busCard}>
              <View style={s.busCardHeader}>
                <View style={s.busIcon}>
                  <Ionicons name="bus" size={20} color={colors.info} />
                </View>
                <View style={s.busRouteInfo}>
                  <Text style={s.busRouteLabel}>SCHOOL BUS</Text>
                  <Text style={s.busRouteTitle}>
                    {route.routeNo || `Route ${index + 1}`}
                  </Text>
                </View>
                <View
                  style={[
                    s.busStatus,
                    isTracking ? s.busStatusLive : s.busStatusIdle,
                  ]}
                >
                  <View
                    style={[
                      s.busStatusDot,
                      isTracking ? s.busStatusDotLive : s.busStatusDotIdle,
                    ]}
                  />
                  <Text
                    style={[
                      s.busStatusText,
                      isTracking ? s.busStatusTextLive : s.busStatusTextIdle,
                    ]}
                  >
                    {isTracking ? "Live" : "Offline"}
                  </Text>
                </View>
              </View>

              {(firstStop || lastStop || route.vehicleNo) && (
                <View style={s.busRouteDetails}>
                  <Ionicons
                    name="navigate-outline"
                    size={14}
                    color={colors.info}
                  />
                  <Text numberOfLines={1} style={s.busRoutePath}>
                    {firstStop && lastStop
                      ? `${firstStop}  →  ${lastStop}`
                      : firstStop || lastStop || route.vehicleNo}
                  </Text>
                  {!!route.vehicleNo && (
                    <Text style={s.busVehicleNo}>{route.vehicleNo}</Text>
                  )}
                </View>
              )}

              <View style={s.busCardDivider} />
              <View style={s.busStats}>
                <View style={s.busStat}>
                  <Ionicons
                    name="location-outline"
                    size={14}
                    color={colors.muted}
                  />
                  <Text style={s.busStatValue}>{stops.length}</Text>
                  <Text style={s.busStatLabel}>Stops</Text>
                </View>
                <View style={s.busStatDivider} />
                <View style={s.busStat}>
                  <Ionicons
                    name="people-outline"
                    size={14}
                    color={colors.muted}
                  />
                  <Text style={s.busStatValue}>
                    {route.assignedStudents?.length || 0}
                  </Text>
                  <Text style={s.busStatLabel}>Students</Text>
                </View>
                {!!route.driverName && (
                  <>
                    <View style={s.busStatDivider} />
                    <View style={[s.busStat, s.busDriverStat]}>
                      <Ionicons
                        name="person-outline"
                        size={14}
                        color={colors.muted}
                      />
                      <Text numberOfLines={1} style={s.busDriverName}>
                        {route.driverName}
                      </Text>
                      <Text style={s.busStatLabel}>Driver</Text>
                    </View>
                  </>
                )}
              </View>
            </Card>
          );
        })}
        {!data.busRoutes.length && (
          <Card style={s.busEmpty}>
            <View style={s.busEmptyIcon}>
              <Ionicons name="bus-outline" size={21} color={colors.info} />
            </View>
            <View style={s.busRouteInfo}>
              <Text style={s.listTitle}>No routes configured</Text>
              <Text style={s.listMeta}>
                School transport routes will appear here.
              </Text>
            </View>
          </Card>
        )}
      </Section>

      <Section
        title="Upcoming events"
        action={`${upcomingEvents.length} upcoming`}
      >
        {upcomingEvents.map((event, index) => (
          <Card key={event._id || index} style={s.eventCard}>
            <View style={s.eventDateTile}>
              <Text style={s.eventDateDay}>
                {event.date
                  ? new Date(event.date).toLocaleDateString("en-IN", {
                      day: "2-digit",
                    })
                  : "—"}
              </Text>
              <Text style={s.eventDateMonth}>
                {event.date
                  ? new Date(event.date).toLocaleDateString("en-IN", {
                      month: "short",
                    })
                  : ""}
              </Text>
            </View>
            <View style={s.eventDetails}>
              <View style={s.eventTitleRow}>
                <Text numberOfLines={2} style={s.eventTitle}>
                  {event.title}
                </Text>
                <Ionicons
                  name="calendar"
                  size={15}
                  color={colors.info}
                />
              </View>
              <View style={s.eventMetaRow}>
                {event.category ? (
                  <View style={s.eventCategory}>
                    <Text numberOfLines={1} style={s.eventCategoryText}>
                      {event.category}
                    </Text>
                  </View>
                ) : null}
                {event.venue ? (
                  <View style={s.eventVenue}>
                    <Ionicons
                      name="location-outline"
                      size={12}
                      color={colors.muted}
                    />
                    <Text numberOfLines={1} style={s.eventVenueText}>
                      {event.venue}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          </Card>
        ))}
        {!upcomingEvents.length && (
          <Card style={s.eventEmpty}>
            <View style={s.eventEmptyIcon}>
              <Ionicons
                name="calendar-outline"
                size={21}
                color={colors.info}
              />
            </View>
            <View style={s.eventDetails}>
              <Text style={s.eventTitle}>No upcoming events</Text>
              <Text style={s.listMeta}>
                School events will appear here when scheduled.
              </Text>
            </View>
          </Card>
        )}
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

function HeroStat({ value, label }: { value: string; label: string }) {
  return (
    <View style={s.heroStat}>
      <Text numberOfLines={1} adjustsFontSizeToFit style={s.heroStatValue}>
        {value}
      </Text>
      <Text numberOfLines={1} style={s.heroStatLabel}>
        {label}
      </Text>
    </View>
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
  hero: {
    padding: 18,
    borderRadius: 18,
    backgroundColor: colors.ink,
    gap: 6,
    overflow: "hidden",
  },
  heroImage: { borderRadius: 18 },
  heroOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(16, 27, 56, 0.82)",
  },
  heroTopline: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
    marginBottom: 3,
  },
  eyebrow: { color: "#F5C879", fontSize: 9, fontWeight: "800", letterSpacing: 1 },
  heroDate: { color: "rgba(255,255,255,0.72)", fontSize: 10 },
  heroTitle: { color: "#fff", fontSize: 24, fontWeight: "800" },
  heroSubtitle: { color: "rgba(255,255,255,0.86)", fontSize: 12 },
  heroMeta: { color: "rgba(255,255,255,0.68)", fontSize: 10, marginTop: 1 },
  heroStats: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.18)",
  },
  heroStat: { flex: 1, gap: 3 },
  heroStatValue: { color: "#fff", fontSize: 19, fontWeight: "800" },
  heroStatLabel: { color: "rgba(255,255,255,0.68)", fontSize: 9 },
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
  quickActions: { gap: 10, paddingRight: 4 },
  quickAction: {
    width: 92,
    minHeight: 88,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 10,
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickActionPressed: { opacity: 0.72, transform: [{ scale: 0.97 }] },
  quickActionIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  quickActionLabel: { color: colors.ink, fontSize: 10, fontWeight: "700" },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  metricCard: {
    width: "48%",
    minHeight: 113,
    justifyContent: "space-between",
    padding: 12,
    borderRadius: 14,
  },
  metricLabel: {
    color: colors.muted,
    fontSize: 10,
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
  section: { gap: 9 },
  sectionHeading: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: 8,
  },
  sectionTitle: { color: colors.ink, fontSize: 15, fontWeight: "800" },
  sectionAction: { color: colors.muted, fontSize: 10 },
  panelCard: { padding: 10, borderRadius: 14 },
  feeSummary: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: 8,
  },
  summaryLabel: { color: colors.muted, fontSize: 9 },
  summaryValue: { fontSize: 14, fontWeight: "800", marginTop: 3 },
  listCard: { padding: 11, borderRadius: 8, gap: 5 },
  busCard: {
    padding: 13,
    borderRadius: 16,
    gap: 11,
    borderColor: "#E9EAF0",
  },
  busCardHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  busIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EAF1FF",
  },
  busRouteInfo: { flex: 1, gap: 2 },
  busRouteLabel: {
    color: colors.muted,
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  busRouteTitle: { color: colors.ink, fontSize: 14, fontWeight: "800" },
  busStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 10,
  },
  busStatusLive: { backgroundColor: "#EAF6EE" },
  busStatusIdle: { backgroundColor: "#F1F2F4" },
  busStatusDot: { width: 6, height: 6, borderRadius: 3 },
  busStatusDotLive: { backgroundColor: colors.success },
  busStatusDotIdle: { backgroundColor: colors.muted },
  busStatusText: { fontSize: 9, fontWeight: "700" },
  busStatusTextLive: { color: colors.success },
  busStatusTextIdle: { color: colors.muted },
  busRouteDetails: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    minHeight: 24,
  },
  busRoutePath: { flex: 1, color: colors.text, fontSize: 10, fontWeight: "600" },
  busVehicleNo: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: "700",
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 7,
    backgroundColor: "#F4F5F7",
  },
  busCardDivider: { height: 1, backgroundColor: "#EEF0F3" },
  busStats: { flexDirection: "row", alignItems: "center", gap: 10 },
  busStat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  busStatValue: { color: colors.ink, fontSize: 10, fontWeight: "800" },
  busStatLabel: { color: colors.muted, fontSize: 9 },
  busStatDivider: { width: 1, height: 17, backgroundColor: "#E6E8ED" },
  busDriverStat: { flex: 1, minWidth: 0 },
  busDriverName: {
    flexShrink: 1,
    color: colors.ink,
    fontSize: 9,
    fontWeight: "700",
  },
  busEmpty: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    padding: 14,
    borderRadius: 16,
  },
  busEmptyIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EAF1FF",
  },
  eventCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 16,
    borderColor: "#E9EAF0",
  },
  eventDateTile: {
    width: 48,
    height: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EAF1FF",
  },
  eventDateDay: { color: colors.info, fontSize: 18, fontWeight: "800" },
  eventDateMonth: {
    color: colors.info,
    fontSize: 9,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  eventDetails: { flex: 1, gap: 7 },
  eventTitleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  eventTitle: { flex: 1, color: colors.ink, fontSize: 12, fontWeight: "800" },
  eventMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 7,
  },
  eventCategory: {
    maxWidth: "55%",
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 7,
    backgroundColor: "#F0F3FF",
  },
  eventCategoryText: { color: colors.info, fontSize: 9, fontWeight: "700" },
  eventVenue: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    flexShrink: 1,
  },
  eventVenueText: { flexShrink: 1, color: colors.muted, fontSize: 9 },
  eventEmpty: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    padding: 14,
    borderRadius: 16,
  },
  eventEmptyIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EAF1FF",
  },
  pinnedNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 11,
    borderRadius: 14,
  },
  pinnedNoticeEmpty: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderRadius: 14,
    backgroundColor: "#FFFCF5",
  },
  pinnedNoticeIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF4D9",
  },
  pinnedNoticeContent: { flex: 1, gap: 4 },
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
  watchlistCard: {
    padding: 13,
    borderRadius: 16,
    gap: 12,
    borderColor: "#E9EAF0",
  },
  watchlistTop: { flexDirection: "row", alignItems: "center", gap: 11 },
  watchlistAvatar: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EAF1FF",
  },
  watchlistAvatarLow: { backgroundColor: "#FFF0EE" },
  watchlistAvatarMedium: { backgroundColor: "#FFF6E6" },
  watchlistAvatarText: { color: colors.info, fontSize: 16, fontWeight: "800" },
  watchlistIdentity: { flex: 1, gap: 4 },
  watchlistScore: { alignItems: "flex-end", gap: 2 },
  attendanceValue: { color: colors.success, fontSize: 18, fontWeight: "800" },
  watchlistScoreLabel: { color: colors.muted, fontSize: 9 },
  lowAttendance: { color: colors.alert },
  mediumAttendance: { color: colors.amberDark },
  goodAttendance: { color: colors.success },
  watchlistProgressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  progressTrack: {
    flex: 1,
    height: 5,
    overflow: "hidden",
    borderRadius: 3,
    backgroundColor: "#ECEEF2",
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
    backgroundColor: colors.success,
  },
  progressLow: { backgroundColor: colors.alert },
  progressMedium: { backgroundColor: colors.amberDark },
  watchlistBadge: {
    minWidth: 100,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 5,
    borderRadius: 9,
  },
  watchlistBadgeLow: { backgroundColor: "#FFF0EE" },
  watchlistBadgeMedium: { backgroundColor: "#FFF6E6" },
  watchlistBadgeGood: { backgroundColor: "#EAF6EE" },
  watchlistBadgeText: { fontSize: 9, fontWeight: "700" },
  watchlistEmpty: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    padding: 14,
    borderRadius: 16,
  },
  watchlistEmptyIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EAF6EE",
  },
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
