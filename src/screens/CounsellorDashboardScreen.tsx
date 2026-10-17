import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Card, Input } from "../components/UI";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import type { AdmissionEnquiry, Student } from "../types";
import type { RootStackParams } from "../../App";
import { colors } from "../theme";

type CounsellorStudent = Pick<
  Student,
  "_id" | "name" | "admissionNo" | "class" | "section" | "profileStatus" | "createdAt"
>;
type CounsellorStats = {
  total: number;
  incomplete: number;
  complete: number;
  recent: CounsellorStudent[];
};
type PipelineEnquiry = AdmissionEnquiry & { visitDate?: string };

const emptyStats: CounsellorStats = {
  total: 0,
  incomplete: 0,
  complete: 0,
  recent: [],
};
const isOpen = (enquiry: PipelineEnquiry) =>
  !["Admitted", "Rejected"].includes(enquiry.status || "");

function dateKey(value?: string | Date) {
  if (!value) return "";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function formatDate(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "Asia/Kolkata",
      });
}

function initials(value?: string) {
  return (
    (value || "Student")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "S"
  );
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function Metric({
  icon,
  label,
  value,
  hint,
  tint,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string | number;
  hint: string;
  tint: string;
}) {
  return (
    <Card style={styles.metric}>
      <View style={[styles.metricIcon, { backgroundColor: `${tint}18` }]}>
        <Ionicons name={icon} size={18} color={tint} />
      </View>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text numberOfLines={1} style={styles.metricHint}>
        {hint}
      </Text>
    </Card>
  );
}

function QuickLink({
  icon,
  title,
  detail,
  tint,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  detail: string;
  tint: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.quickLink, pressed && styles.pressed]}
    >
      <View style={[styles.quickIcon, { backgroundColor: `${tint}18` }]}>
        <Ionicons name={icon} size={19} color={tint} />
      </View>
      <View style={styles.quickCopy}>
        <Text style={styles.quickTitle}>{title}</Text>
        <Text style={styles.quickDetail}>{detail}</Text>
      </View>
      <Ionicons name="chevron-forward" size={17} color={colors.muted} />
    </Pressable>
  );
}

function SectionHeader({
  title,
  subtitle,
  onPress,
  actionLabel,
}: {
  title: string;
  subtitle?: string;
  onPress?: () => void;
  actionLabel?: string;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionCopy}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
      </View>
      {onPress && actionLabel ? (
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          style={styles.sectionAction}
        >
          <Text style={styles.sectionActionText}>{actionLabel}</Text>
          <Ionicons name="arrow-forward" size={14} color={colors.info} />
        </Pressable>
      ) : null}
    </View>
  );
}

export default function CounsellorDashboardScreen() {
  const { user } = useAuth();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParams>>();
  const [stats, setStats] = useState<CounsellorStats>(emptyStats);
  const [enquiries, setEnquiries] = useState<PipelineEnquiry[]>([]);
  const [students, setStudents] = useState<CounsellorStudent[]>([]);
  const [studentTotal, setStudentTotal] = useState(0);
  const [term, setTerm] = useState("");
  const [debouncedTerm, setDebouncedTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const searchSequence = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedTerm(term.trim()), 350);
    return () => clearTimeout(timer);
  }, [term]);

  const loadWorkspace = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    const results = await Promise.allSettled([
      api.students.counsellorStats(),
      api.admissions.list(),
      api.students.list("limit=50"),
    ]);
    const failures: string[] = [];
    if (results[0].status === "fulfilled") {
      setStats(results[0].value.data || emptyStats);
    } else {
      failures.push(
        `Student summary: ${
          results[0].reason instanceof Error
            ? results[0].reason.message
            : "Could not load student summary."
        }`,
      );
    }
    if (results[1].status === "fulfilled") {
      setEnquiries((results[1].value.data || []) as PipelineEnquiry[]);
    } else {
      failures.push(
        `Admission pipeline: ${
          results[1].reason instanceof Error
            ? results[1].reason.message
            : "Could not load admission enquiries."
        }`,
      );
    }
    if (results[2].status === "fulfilled") {
      setStudents(results[2].value.data || []);
      setStudentTotal(results[2].value.total || 0);
    } else {
      failures.push(
        `Student search: ${
          results[2].reason instanceof Error
            ? results[2].reason.message
            : "Could not load student records."
        }`,
      );
    }
    setError(failures.join("\n"));
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadWorkspace();
    }, [loadWorkspace]),
  );

  useEffect(() => {
    if (!debouncedTerm) {
      setStudents(stats.recent);
      setStudentTotal(stats.total);
      return undefined;
    }
    const sequence = ++searchSequence.current;
    let active = true;
    setSearching(true);
    api.students
      .list(`q=${encodeURIComponent(debouncedTerm)}&limit=50`)
      .then(({ data, total }) => {
        if (!active || sequence !== searchSequence.current) return;
        setStudents(data || []);
        setStudentTotal(total || 0);
      })
      .catch((searchError: unknown) => {
        if (!active || sequence !== searchSequence.current) return;
        setError(
          searchError instanceof Error
            ? `Student search: ${searchError.message}`
            : "Student search could not be completed.",
        );
      })
      .finally(() => {
        if (active && sequence === searchSequence.current) setSearching(false);
      });
    return () => {
      active = false;
    };
  }, [debouncedTerm, stats.recent, stats.total]);

  const today = dateKey(new Date());
  const openEnquiries = enquiries.filter(isOpen);
  const dueFollowUps = enquiries.filter(
    (enquiry) =>
      enquiry.followUpDate &&
      isOpen(enquiry) &&
      dateKey(enquiry.followUpDate) <= today,
  );
  const campusVisits = enquiries.filter(
    (enquiry) => enquiry.status === "Campus Visit Scheduled",
  );
  const admittedCount = enquiries.filter(
    (enquiry) => enquiry.status === "Admitted",
  ).length;
  const conversionRate = enquiries.length
    ? Math.round((admittedCount / enquiries.length) * 100)
    : 0;
  const recentEnquiries = useMemo(
    () =>
      [...enquiries]
        .sort((a, b) =>
          String(b.createdAt || "").localeCompare(String(a.createdAt || "")),
        )
        .slice(0, 5),
    [enquiries],
  );
  const dueRecent = recentEnquiries.filter(
    (enquiry) =>
      enquiry.followUpDate &&
      isOpen(enquiry) &&
      dateKey(enquiry.followUpDate) <= today,
  );
  const visitsRecent = recentEnquiries.filter(
    (enquiry) => enquiry.status === "Campus Visit Scheduled",
  );
  const incompleteVisible = students.filter(
    (student) => student.profileStatus !== "complete",
  ).length;
  const dateLabel = new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });

  const openStudentProfile = (student: CounsellorStudent) => {
    navigation.navigate("Detail", {
      title: student.name || "Student profile",
      row: {
        name: student.name || "—",
        admissionNo: student.admissionNo || "—",
        class: student.class || "—",
        section: student.section || "—",
        profileStatus: student.profileStatus || "incomplete",
        createdAt: student.createdAt || "",
      },
    });
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void loadWorkspace(true)}
          tintColor="#7257C8"
        />
      }
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.hero}>
        <View style={styles.heroTop}>
          <View style={styles.heroIcon}>
            <Ionicons name="school-outline" size={22} color="#fff" />
          </View>
          <Text style={styles.heroEyebrow}>
            {greeting()} · {user?.name || "ADMISSION COUNSELLOR"}
          </Text>
        </View>
        <Text style={styles.heroTitle}>Counsellor Workspace</Text>
        <Text style={styles.heroDescription}>
          Turn every enquiry into an admission—complete profiles, schedule
          campus visits and never miss a follow-up.
        </Text>
        <Text style={styles.heroDate}>{dateLabel}</Text>
        <View style={styles.heroStats}>
          <View style={styles.heroStat}>
            <Text style={styles.heroStatValue}>{stats.total}</Text>
            <Text style={styles.heroStatLabel}>Students</Text>
          </View>
          <View style={styles.heroDivider} />
          <View style={styles.heroStat}>
            <Text style={styles.heroStatValue}>{stats.incomplete}</Text>
            <Text style={styles.heroStatLabel}>Incomplete</Text>
          </View>
          <View style={styles.heroDivider} />
          <View style={styles.heroStat}>
            <Text style={styles.heroStatValue}>{conversionRate}%</Text>
            <Text style={styles.heroStatLabel}>Conversion</Text>
          </View>
        </View>
      </View>

      {error ? (
        <View style={styles.errorBanner} accessibilityRole="alert">
          <Ionicons name="warning-outline" size={19} color={colors.alert} />
          <Text style={styles.errorText}>{error}</Text>
          <Pressable
            onPress={() => void loadWorkspace(true)}
            accessibilityRole="button"
            hitSlop={8}
          >
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.section}>
        <SectionHeader title="Admissions shortcuts" subtitle="Common tasks" />
        <View style={styles.quickLinks}>
          <QuickLink
            icon="person-add-outline"
            title="New admission"
            detail="Add a student profile"
            tint={colors.info}
            onPress={() => navigation.navigate("StudentOnboard")}
          />
          <QuickLink
            icon="people-outline"
            title="All students"
            detail="Browse the school directory"
            tint={colors.success}
            onPress={() => navigation.navigate("StudentDatabase")}
          />
          <QuickLink
            icon="checkmark-done-outline"
            title="Complete profiles"
            detail={`${stats.incomplete} profile${stats.incomplete === 1 ? "" : "s"} need attention`}
            tint="#7257C8"
            onPress={() => navigation.navigate("StudentDatabase")}
          />
          <QuickLink
            icon="clipboard-outline"
            title="Admission pipeline"
            detail="Review and update enquiries"
            tint={colors.amberDark}
            onPress={() => navigation.navigate("AdmissionEnquiry")}
          />
        </View>
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color="#7257C8" />
          <Text style={styles.loadingText}>Loading counsellor workspace…</Text>
        </View>
      ) : (
        <>
          <View style={styles.metrics}>
            <Metric
              icon="people-outline"
              label="Total students"
              value={stats.total}
              hint="in this school"
              tint={colors.info}
            />
            <Metric
              icon="document-text-outline"
              label="Incomplete profiles"
              value={stats.incomplete}
              hint={stats.incomplete ? "need your attention" : "all caught up"}
              tint={stats.incomplete ? colors.amberDark : colors.success}
            />
            <Metric
              icon="checkmark-circle-outline"
              label="Completed profiles"
              value={stats.complete}
              hint="ready to use"
              tint={colors.success}
            />
            <Metric
              icon="trending-up-outline"
              label="Total enquiries"
              value={enquiries.length}
              hint={`${conversionRate}% converted to admission`}
              tint="#7257C8"
            />
            <Metric
              icon="call-outline"
              label="Follow-ups due"
              value={dueFollowUps.length}
              hint={dueFollowUps.length ? "call them today" : "none pending"}
              tint={dueFollowUps.length ? colors.alert : colors.success}
            />
            <Metric
              icon="calendar-outline"
              label="Campus visits"
              value={campusVisits.length}
              hint="scheduled"
              tint={colors.info}
            />
            <Metric
              icon="person-circle-outline"
              label="Profiles to finish"
              value={incompleteVisible}
              hint="in the student list"
              tint={colors.amberDark}
            />
            <Metric
              icon="sparkles-outline"
              label="Recently created"
              value={stats.recent.length}
              hint={stats.recent[0]?.name || "no students yet"}
              tint="#7257C8"
            />
          </View>

          {(dueFollowUps.length > 0 || campusVisits.length > 0) && (
            <View style={styles.twoPanels}>
              {dueFollowUps.length > 0 ? (
                <Card style={styles.panel}>
                  <View style={styles.panelTitleRow}>
                    <Ionicons
                      name="alarm-outline"
                      size={18}
                      color={colors.alert}
                    />
                    <Text style={styles.panelTitle}>Follow-ups due</Text>
                  </View>
                  <Text style={styles.panelHint}>
                    {dueFollowUps.length} enquiry
                    {dueFollowUps.length === 1 ? "" : "ies"} waiting on a call
                  </Text>
                  {dueRecent.length ? (
                    dueRecent.slice(0, 4).map((enquiry) => (
                      <View key={enquiry._id} style={styles.enquiryRow}>
                        <View style={styles.rowIcon}>
                          <Ionicons
                            name="call-outline"
                            size={16}
                            color={colors.alert}
                          />
                        </View>
                        <View style={styles.rowCopy}>
                          <Text style={styles.rowTitle}>
                            {enquiry.childName || "New enquiry"}
                          </Text>
                          <Text style={styles.rowHint}>
                            {enquiry.classApplied || "Class not set"} · follow
                            up {formatDate(enquiry.followUpDate)}
                          </Text>
                        </View>
                        <Text style={styles.dueBadge}>DUE</Text>
                      </View>
                    ))
                  ) : (
                    <Text style={styles.emptyText}>
                      No recent enquiries have an overdue follow-up.
                    </Text>
                  )}
                </Card>
              ) : null}
              {campusVisits.length > 0 ? (
                <Card style={styles.panel}>
                  <View style={styles.panelTitleRow}>
                    <Ionicons
                      name="location-outline"
                      size={18}
                      color="#7257C8"
                    />
                    <Text style={styles.panelTitle}>
                      Campus visits scheduled
                    </Text>
                  </View>
                  <Text style={styles.panelHint}>
                    {campusVisits.length} famil
                    {campusVisits.length === 1 ? "y" : "ies"} expected on campus
                  </Text>
                  {visitsRecent.length ? (
                    visitsRecent.slice(0, 4).map((enquiry) => (
                      <View key={enquiry._id} style={styles.enquiryRow}>
                        <View style={styles.rowIcon}>
                          <Ionicons
                            name="map-outline"
                            size={16}
                            color="#7257C8"
                          />
                        </View>
                        <View style={styles.rowCopy}>
                          <Text style={styles.rowTitle}>
                            {enquiry.childName || "New enquiry"}
                          </Text>
                          <Text style={styles.rowHint}>
                            {enquiry.classApplied || "Class not set"} ·{" "}
                            {enquiry.visitDate
                              ? formatDate(enquiry.visitDate)
                              : "date to confirm"}
                          </Text>
                        </View>
                        <Text style={styles.visitBadge}>VISIT</Text>
                      </View>
                    ))
                  ) : (
                    <Text style={styles.emptyText}>
                      No recent enquiries have a scheduled campus visit.
                    </Text>
                  )}
                </Card>
              ) : null}
            </View>
          )}

          <Card style={styles.panel}>
            <SectionHeader
              title="Search admitted students"
              subtitle={
                searching
                  ? "Searching…"
                  : `${studentTotal} result${studentTotal === 1 ? "" : "s"} · open a profile to review it`
              }
              onPress={() => navigation.navigate("StudentDatabase")}
              actionLabel="All students"
            />
            <View style={styles.searchBox}>
              <Ionicons name="search" size={17} color={colors.muted} />
              <Input
                placeholder="Search by Admission ID or name…"
                value={term}
                onChangeText={setTerm}
                style={styles.searchInput}
                accessibilityLabel="Search admitted students by name or admission ID"
              />
              {searching ? (
                <ActivityIndicator size="small" color="#7257C8" />
              ) : null}
            </View>
            {students.length ? (
              students.slice(0, 8).map((student) => (
                <Pressable
                  key={student._id}
                  onPress={() => openStudentProfile(student)}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.studentRow,
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{initials(student.name)}</Text>
                  </View>
                  <View style={styles.studentCopy}>
                    <Text numberOfLines={1} style={styles.rowTitle}>
                      {student.name || "Student"}
                    </Text>
                    <Text numberOfLines={1} style={styles.rowHint}>
                      {student.admissionNo || "No admission ID"} ·{" "}
                      {student.class
                        ? `${student.class}${student.section ? ` · ${student.section}` : ""}`
                        : "Class not set"}
                    </Text>
                  </View>
                  <View style={styles.studentEnd}>
                    <Text
                      style={[
                        styles.profileBadge,
                        student.profileStatus === "complete"
                          ? styles.completeBadge
                          : styles.incompleteBadge,
                      ]}
                    >
                      {student.profileStatus === "complete"
                        ? "Complete"
                        : "Incomplete"}
                    </Text>
                    <Ionicons
                      name="chevron-forward"
                      size={15}
                      color={colors.muted}
                    />
                  </View>
                </Pressable>
              ))
            ) : (
              <Text style={styles.emptyText}>
                {term.trim()
                  ? "No students match this search. Try another name or Admission ID."
                  : "No recently admitted students to show."}
              </Text>
            )}
          </Card>

          <Card style={styles.panel}>
            <SectionHeader
              title="Recent enquiries"
              subtitle={`${openEnquiries.length} open in the pipeline`}
              onPress={() => navigation.navigate("AdmissionEnquiry")}
              actionLabel="Open pipeline"
            />
            {recentEnquiries.length ? (
              recentEnquiries.map((enquiry, index) => (
                <Pressable
                  key={enquiry._id}
                  onPress={() => navigation.navigate("AdmissionEnquiry")}
                  style={[
                    styles.enquiryRow,
                    index === recentEnquiries.length - 1 &&
                      styles.lastEnquiryRow,
                  ]}
                >
                  <View style={styles.rowIcon}>
                    <Ionicons
                      name="person-add-outline"
                      size={16}
                      color={colors.info}
                    />
                  </View>
                  <View style={styles.rowCopy}>
                    <Text style={styles.rowTitle}>
                      {enquiry.childName || "New enquiry"}
                    </Text>
                    <Text style={styles.rowHint}>
                      {enquiry.classApplied || "Class not set"} ·{" "}
                      {enquiry.parentName || "Parent not set"} ·{" "}
                      {formatDate(enquiry.createdAt)}
                    </Text>
                  </View>
                  <Text style={styles.statusBadge}>
                    {enquiry.status || "New"}
                  </Text>
                </Pressable>
              ))
            ) : (
              <Text style={styles.emptyText}>
                No admission enquiries have been recorded yet.
              </Text>
            )}
          </Card>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 16, paddingBottom: 32, gap: 14 },
  hero: { padding: 20, borderRadius: 20, backgroundColor: "#54469A" },
  heroTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  heroIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#FFFFFF24",
    alignItems: "center",
    justifyContent: "center",
  },
  heroEyebrow: {
    color: "#E8E2FF",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
    flexShrink: 1,
  },
  heroTitle: { color: "#fff", fontSize: 23, fontWeight: "800", marginTop: 16 },
  heroDescription: {
    color: "#EFEAFF",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
  },
  heroDate: { color: "#E8E2FF", fontSize: 12, marginTop: 14 },
  heroStats: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#FFFFFF35",
    marginTop: 17,
    paddingTop: 14,
  },
  heroStat: { flex: 1, alignItems: "center" },
  heroStatValue: { color: "#fff", fontSize: 21, fontWeight: "800" },
  heroStatLabel: { color: "#E8E2FF", fontSize: 11, marginTop: 3 },
  heroDivider: { width: 1, height: 30, backgroundColor: "#FFFFFF35" },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#F0B9B2",
    backgroundColor: "#FFF1EF",
  },
  errorText: { flex: 1, color: colors.alert, fontSize: 12, lineHeight: 17 },
  retryText: { color: colors.alert, fontSize: 12, fontWeight: "800" },
  section: { gap: 0 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 11,
  },
  sectionCopy: { flex: 1 },
  sectionTitle: { color: colors.ink, fontSize: 16, fontWeight: "800" },
  sectionSubtitle: { color: colors.muted, fontSize: 12, marginTop: 3 },
  sectionAction: { flexDirection: "row", alignItems: "center", gap: 5 },
  sectionActionText: { color: colors.info, fontSize: 11, fontWeight: "700" },
  quickLinks: { gap: 9 },
  quickLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 13,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: colors.card,
  },
  quickIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  quickCopy: { flex: 1 },
  quickTitle: { color: colors.ink, fontSize: 13, fontWeight: "700" },
  quickDetail: { color: colors.muted, fontSize: 11, marginTop: 3 },
  pressed: { opacity: 0.72 },
  loading: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 34,
    gap: 10,
  },
  loadingText: { color: colors.muted, fontSize: 13 },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  metric: { width: "48%", flexGrow: 1, minHeight: 132 },
  metricIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  metricValue: {
    color: colors.ink,
    fontSize: 23,
    fontWeight: "800",
    marginTop: 9,
  },
  metricLabel: { color: colors.inkLight, fontSize: 12, fontWeight: "700", marginTop: 2 },
  metricHint: { color: colors.muted, fontSize: 10, marginTop: 5 },
  twoPanels: { gap: 12 },
  panel: { padding: 15 },
  panelTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 5,
  },
  panelTitle: { color: colors.ink, fontSize: 14, fontWeight: "800", flex: 1 },
  panelHint: { color: colors.muted, fontSize: 11, marginBottom: 8 },
  enquiryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  lastEnquiryRow: { borderBottomWidth: 0 },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "#EDF4FA",
    alignItems: "center",
    justifyContent: "center",
  },
  rowCopy: { flex: 1, minWidth: 0 },
  rowTitle: { color: colors.ink, fontSize: 12, fontWeight: "700" },
  rowHint: { color: colors.muted, fontSize: 10, marginTop: 4 },
  dueBadge: {
    color: colors.alert,
    backgroundColor: "#D65A4A18",
    borderRadius: 6,
    overflow: "hidden",
    paddingHorizontal: 7,
    paddingVertical: 4,
    fontSize: 9,
    fontWeight: "800",
  },
  visitBadge: {
    color: "#7257C8",
    backgroundColor: "#7257C818",
    borderRadius: 6,
    overflow: "hidden",
    paddingHorizontal: 7,
    paddingVertical: 4,
    fontSize: 9,
    fontWeight: "800",
  },
  emptyText: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
    paddingVertical: 16,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 11,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: "#fff",
    marginBottom: 7,
  },
  searchInput: { flex: 1, borderWidth: 0, paddingHorizontal: 0 },
  studentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EEEAFB",
  },
  avatarText: { color: "#54469A", fontWeight: "800", fontSize: 12 },
  studentCopy: { flex: 1, minWidth: 0 },
  studentEnd: { alignItems: "flex-end", gap: 5 },
  profileBadge: {
    overflow: "hidden",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
    fontSize: 9,
    fontWeight: "700",
  },
  completeBadge: { color: colors.success, backgroundColor: "#3F8F5F18" },
  incompleteBadge: { color: colors.amberDark, backgroundColor: "#E8A33D20" },
  statusBadge: {
    overflow: "hidden",
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 4,
    color: colors.info,
    backgroundColor: "#3B6FA018",
    fontSize: 9,
    fontWeight: "700",
  },
});
