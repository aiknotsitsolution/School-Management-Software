import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { BarChart, TrendChart, type Point } from "../components/Charts";
import { Card, Input } from "../components/UI";
import { useAuth } from "../context/AuthContext";
import { api, get } from "../lib/api";
import { extractList, type Row } from "../lib/format";
import { colors } from "../theme";

type TeacherScope = {
  class: string;
  section: string;
  classTeacher: boolean;
};

type AssignmentProfile = {
  classTeacher?: Record<string, unknown>[];
  teachingScopes?: Record<string, unknown>[];
  primaryScope?: { class?: string; section?: string | null } | null;
};

type StudentResult = Row & {
  studentId?: string;
  subjects?: Row[];
  total?: number;
  maxTotal?: number;
  pct?: number;
  grade?: string;
};

type SubjectAverage = {
  subject?: string;
  averagePct?: number;
};

type PerformanceSummary = {
  classAveragePct?: number;
  students?: StudentResult[];
  subjectAverages?: SubjectAverage[];
};

type AttendanceEntry = Row & {
  date?: string;
  status?: string;
};

const SUBJECT_COLORS = [
  "#2563EB",
  "#16A34A",
  "#4338CA",
  "#9A5FB0",
  "#DC2626",
  "#4AA3A3",
  "#8A7A4F",
];

function getScopes(
  profile: AssignmentProfile,
  userClass?: string | null,
  userSection?: string | null,
) {
  const scopes = new Map<string, TeacherScope>();
  const addScope = (value: Record<string, unknown>, classTeacher: boolean) => {
    const className = typeof value.class === "string" ? value.class.trim() : "";
    if (!className) return;
    const section =
      typeof value.section === "string" ? value.section.trim() : "";
    const key = `${className}::${section}`;
    const previous = scopes.get(key);
    scopes.set(key, {
      class: className,
      section,
      classTeacher: classTeacher || previous?.classTeacher === true,
    });
  };
  (profile.classTeacher || []).forEach((item) => addScope(item, true));
  (profile.teachingScopes || []).forEach((item) => addScope(item, false));
  if (profile.primaryScope?.class) {
    addScope(
      {
        class: profile.primaryScope.class,
        section: profile.primaryScope.section,
      },
      false,
    );
  }
  if (!scopes.size && (userClass || userSection)) {
    addScope({ class: userClass, section: userSection }, false);
  }
  return [...scopes.values()].sort(
    (a, b) =>
      a.class.localeCompare(b.class, undefined, { numeric: true }) ||
      a.section.localeCompare(b.section, undefined, { numeric: true }),
  );
}

const dateKey = (value?: string) => {
  const raw = String(value || "");
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const getPart = (type: string) =>
    parts.find((part) => part.type === type)?.value || "";
  return `${getPart("year")}-${getPart("month")}-${getPart("day")}`;
};

const number = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const fullName = (student: Row) =>
  String(
    student.name ||
      [student.firstName, student.lastName].filter(Boolean).join(" ") ||
      student.studentId ||
      "Student",
  );

function Metric({
  label,
  value,
  detail,
  icon,
  tint,
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
}) {
  return (
    <Card style={styles.metricCard}>
      <View style={[styles.metricIcon, { backgroundColor: `${tint}18` }]}>
        <Ionicons name={icon} size={17} color={tint} />
      </View>
      <Text numberOfLines={1} style={styles.metricValue}>
        {value}
      </Text>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text numberOfLines={1} style={styles.metricDetail}>
        {detail}
      </Text>
    </Card>
  );
}

function ScopeChips({
  scopes,
  selected,
  onSelect,
}: {
  scopes: TeacherScope[];
  selected: TeacherScope | null;
  onSelect: (scope: TeacherScope) => void;
}) {
  if (scopes.length < 2) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chips}
    >
      {scopes.map((scope) => {
        const active =
          scope.class === selected?.class && scope.section === selected.section;
        return (
          <Pressable
            key={`${scope.class}::${scope.section}`}
            onPress={() => onSelect(scope)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={[styles.chip, active && styles.chipSelected]}
          >
            <Text style={[styles.chipText, active && styles.chipTextSelected]}>
              {scope.class}
              {scope.section ? `-${scope.section}` : ""}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export default function StudentPerformanceScreen() {
  const { user } = useAuth();
  const [scopes, setScopes] = useState<TeacherScope[]>([]);
  const [scope, setScope] = useState<TeacherScope | null>(null);
  const [students, setStudents] = useState<Row[]>([]);
  const [attendance, setAttendance] = useState<AttendanceEntry[]>([]);
  const [examNames, setExamNames] = useState<string[]>([]);
  const [examName, setExamName] = useState("");
  const [summary, setSummary] = useState<PerformanceSummary | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [summaryError, setSummaryError] = useState("");
  const baseRequest = useRef(0);
  const summaryRequest = useRef(0);

  const loadScope = useCallback(
    async (selectedScope: TeacherScope, refresh = false) => {
      const request = ++baseRequest.current;
      if (refresh) setRefreshing(true);
      else setLoading(true);
      setError("");
      setSummaryError("");
      try {
        const scopeQuery = new URLSearchParams({
          class: selectedScope.class,
          ...(selectedScope.section ? { section: selectedScope.section } : {}),
        }).toString();
        const [studentsResult, attendanceResult, examsResult] =
          await Promise.allSettled([
            get<unknown>(`/students?${scopeQuery}&limit=500`),
            api.attendance.list(`${scopeQuery}&limit=5000`),
            get<unknown>(`/exams?${scopeQuery}&limit=500`),
          ]);
        if (request !== baseRequest.current) return;

        const errors: string[] = [];
        if (studentsResult.status === "fulfilled") {
          setStudents(extractList(studentsResult.value.data));
        } else {
          setStudents([]);
          errors.push(
            `Students: ${studentsResult.reason?.message || "Unable to load."}`,
          );
        }
        if (attendanceResult.status === "fulfilled") {
          setAttendance(extractList(attendanceResult.value.data));
        } else {
          setAttendance([]);
          errors.push(
            `Attendance: ${attendanceResult.reason?.message || "Unable to load."}`,
          );
        }
        if (examsResult.status === "fulfilled") {
          const names = [
            ...new Set(
              extractList(examsResult.value.data)
                .map((exam) => String(exam.examName || "").trim())
                .filter(Boolean),
            ),
          ];
          setExamNames(names);
          setExamName(names[0] || "");
        } else {
          setExamNames([]);
          setExamName("");
          errors.push(
            `Exams: ${examsResult.reason?.message || "Unable to load."}`,
          );
        }
        setSummary(null);
        setError(errors.join("\n"));
      } catch (loadError) {
        if (request === baseRequest.current) {
          setError(
            (loadError as Error).message ||
              "Could not load class performance data.",
          );
          setStudents([]);
          setAttendance([]);
          setExamNames([]);
          setExamName("");
        }
      } finally {
        if (request === baseRequest.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [],
  );

  const loadAssignments = useCallback(async () => {
    setLoading(true);
    setError("");
    setScopes([]);
    setScope(null);
    setStudents([]);
    setAttendance([]);
    setExamNames([]);
    setExamName("");
    setSummary(null);
    try {
      const { data } = await api.assignments.me();
      const nextScopes = getScopes(data, user?.class, user?.section);
      setScopes(nextScopes);
      const primary = data.primaryScope;
      const selected =
        nextScopes.find(
          (item) =>
            item.class === primary?.class &&
            item.section === (primary?.section || ""),
        ) ||
        nextScopes.find((item) => item.classTeacher) ||
        nextScopes[0] ||
        null;
      setScope(selected);
      if (selected) {
        await loadScope(selected);
      } else {
        setLoading(false);
      }
    } catch (loadError) {
      setError(
        (loadError as Error).message ||
          "Could not load your teaching assignments.",
      );
      setLoading(false);
    }
  }, [loadScope, user?.class, user?.section]);

  useFocusEffect(
    useCallback(() => {
      void loadAssignments();
      return () => {
        baseRequest.current += 1;
        summaryRequest.current += 1;
      };
    }, [loadAssignments]),
  );

  React.useEffect(() => {
    if (!scope || !examName) {
      setSummary(null);
      setSummaryError("");
      return;
    }
    const request = ++summaryRequest.current;
    setSummary(null);
    setSummaryError("");
    setSummaryLoading(true);
    const query = new URLSearchParams({
      class: scope.class,
      ...(scope.section ? { section: scope.section } : {}),
      examName,
    }).toString();
    get<PerformanceSummary>(`/marks/class-summary?${query}`)
      .then((response) => {
        if (request === summaryRequest.current) setSummary(response.data);
      })
      .catch((loadError: unknown) => {
        if (request === summaryRequest.current) {
          setSummaryError(
            loadError instanceof Error
              ? loadError.message
              : "Could not load academic results.",
          );
        }
      })
      .finally(() => {
        if (request === summaryRequest.current) setSummaryLoading(false);
      });
  }, [examName, scope]);

  const studentsById = useMemo(() => {
    const result = new Map<string, string>();
    students.forEach((student) => {
      const name = fullName(student);
      if (student.admissionNo) result.set(String(student.admissionNo), name);
      if (student._id) result.set(String(student._id), name);
      if (student.id) result.set(String(student.id), name);
    });
    return result;
  }, [students]);

  const resultRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return [...(summary?.students || [])]
      .sort((a, b) => number(b.pct) - number(a.pct))
      .map((student) => ({
        ...student,
        displayName:
          studentsById.get(String(student.studentId || "")) ||
          String(student.studentId || "Student"),
      }))
      .filter((student) => {
        const query = `${student.displayName} ${student.studentId || ""}`.toLowerCase();
        return !needle || query.includes(needle);
      });
  }, [search, studentsById, summary]);

  const allResults = summary?.students || [];
  const lowScorers = [...allResults]
    .filter((student) => number(student.pct) < 50)
    .sort((a, b) => number(a.pct) - number(b.pct));

  const attendanceTrend: Point[] = useMemo(() => {
    const months = new Map<string, { total: number; present: number }>();
    attendance.forEach((record) => {
      const month = dateKey(record.date).slice(0, 7);
      if (!month) return;
      const item = months.get(month) || { total: 0, present: 0 };
      item.total += 1;
      if (String(record.status).toLowerCase() === "present") item.present += 1;
      months.set(month, item);
    });
    return [...months.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-8)
      .map(([month, item]) => ({
        label: new Date(`${month}-01T00:00:00`).toLocaleDateString("en-IN", {
          month: "short",
        }),
        value: item.total ? Math.round((item.present / item.total) * 100) : 0,
      }));
  }, [attendance]);

  const attendanceRate = attendance.length
    ? Math.round(
        (attendance.filter(
          (record) => String(record.status).toLowerCase() === "present",
        ).length /
          attendance.length) *
          100,
      )
    : null;
  const subjectAverages: Point[] = (summary?.subjectAverages || []).map(
    (item) => ({
      label: String(item.subject || "Subject"),
      value: number(item.averagePct),
    }),
  );

  const topScorer = allResults.length
    ? [...allResults].sort((a, b) => number(b.pct) - number(a.pct))[0]
    : null;

  const chooseScope = (nextScope: TeacherScope) => {
    if (
      nextScope.class === scope?.class &&
      nextScope.section === scope.section
    ) {
      return;
    }
    setScope(nextScope);
    setSearch("");
    setSummary(null);
    setExamName("");
    setExamNames([]);
    setStudents([]);
    setAttendance([]);
    void loadScope(nextScope);
  };

  const refresh = () => {
    if (scope) void loadScope(scope, true);
    else void loadAssignments();
  };

  return (
    <View style={styles.root}>
      {loading && !students.length && !attendance.length && !error ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.ink} />
          <Text style={styles.emptyText}>Loading student performance...</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refresh} />
          }
        >
          <View style={styles.heading}>
            <View style={styles.headingIcon}>
              <Ionicons name="stats-chart" size={22} color={colors.amberDark} />
            </View>
            <View style={styles.headingCopy}>
              <Text style={styles.eyebrow}>MY TEACHING</Text>
              <Text style={styles.title}>Student Performance</Text>
              <Text style={styles.subtitle}>
                {scope
                  ? `Academic results and attendance · Class ${scope.class}${scope.section ? `-${scope.section}` : ""}`
                  : "Review academic progress for your assigned class."}
              </Text>
            </View>
          </View>

          <ScopeChips scopes={scopes} selected={scope} onSelect={chooseScope} />

          {!loading && !scope && !error && (
            <Card style={styles.emptyCard}>
              <Ionicons name="school-outline" size={30} color={colors.info} />
              <Text style={styles.emptyTitle}>No class assigned yet</Text>
              <Text style={styles.emptyText}>
                Contact your school administrator to assign a class and section.
              </Text>
            </Card>
          )}

          {!!error && (
            <Card style={styles.errorCard}>
              <Ionicons
                name="cloud-offline-outline"
                size={25}
                color={colors.alert}
              />
              <Text style={styles.emptyTitle}>Some performance data did not load</Text>
              <Text style={styles.emptyText}>{error}</Text>
              <Pressable
                onPress={refresh}
                style={styles.retryButton}
                accessibilityRole="button"
              >
                <Text style={styles.retryText}>Try again</Text>
              </Pressable>
            </Card>
          )}

          {scope && (
            <>
              <View style={styles.metricGrid}>
                <Metric
                  label="Class average"
                  value={
                    summary
                      ? `${number(summary.classAveragePct).toFixed(
                          Number.isInteger(number(summary.classAveragePct))
                            ? 0
                            : 1,
                        )}%`
                      : "—"
                  }
                  detail={examName || "Select an exam"}
                  icon="trending-up"
                  tint={colors.success}
                />
                <Metric
                  label="Students assessed"
                  value={allResults.length}
                  detail="In this exam"
                  icon="people"
                  tint={colors.info}
                />
                <Metric
                  label="Top scorer"
                  value={
                    topScorer
                      ? studentsById.get(String(topScorer.studentId || "")) ||
                        String(topScorer.studentId || "—")
                      : "—"
                  }
                  detail={
                    topScorer
                      ? `${number(topScorer.pct)}% · ${topScorer.grade || "—"}`
                      : "Awaiting marks"
                  }
                  icon="trophy"
                  tint={colors.amberDark}
                />
                <Metric
                  label="Need support"
                  value={lowScorers.length}
                  detail="Scored below 50%"
                  icon="alert-circle"
                  tint={colors.alert}
                />
              </View>

              <Card style={styles.summaryCard}>
                <View style={styles.sectionHeading}>
                  <View style={styles.flex}>
                    <Text style={styles.sectionTitle}>Academic Summary</Text>
                    <Text style={styles.sectionSubtitle}>
                      {summary
                        ? `Class average ${number(summary.classAveragePct).toFixed(1)}%`
                        : "Marks and subject averages"}
                    </Text>
                  </View>
                  <Pressable
                    onPress={refresh}
                    accessibilityRole="button"
                    accessibilityLabel="Refresh student performance"
                    style={styles.refreshButton}
                  >
                    <Ionicons
                      name="refresh-outline"
                      size={18}
                      color={colors.info}
                    />
                  </Pressable>
                </View>
                <Text style={styles.filterLabel}>EXAM</Text>
                {examNames.length ? (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.chips}
                  >
                    {examNames.map((name) => {
                      const active = examName === name;
                      return (
                        <Pressable
                          key={name}
                          onPress={() => setExamName(name)}
                          accessibilityRole="button"
                          accessibilityState={{ selected: active }}
                          style={[styles.chip, active && styles.chipSelected]}
                        >
                          <Text
                            style={[
                              styles.chipText,
                              active && styles.chipTextSelected,
                            ]}
                          >
                            {name}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                ) : (
                  <Text style={styles.emptyText}>
                    No exams are scheduled for this class and section yet.
                  </Text>
                )}
                {summaryLoading ? (
                  <View style={styles.inlineLoading}>
                    <ActivityIndicator color={colors.info} />
                    <Text style={styles.emptyText}>Loading results...</Text>
                  </View>
                ) : summaryError ? (
                  <View style={styles.errorInline}>
                    <Text style={styles.errorText}>{summaryError}</Text>
                    <Pressable
                      onPress={() => {
                        if (scope && examName) {
                          const query = new URLSearchParams({
                            class: scope.class,
                            ...(scope.section
                              ? { section: scope.section }
                              : {}),
                            examName,
                          }).toString();
                          setSummaryLoading(true);
                          setSummaryError("");
                          get<PerformanceSummary>(
                            `/marks/class-summary?${query}`,
                          )
                            .then((response) => setSummary(response.data))
                            .catch((loadError: unknown) =>
                              setSummaryError(
                                loadError instanceof Error
                                  ? loadError.message
                                  : "Could not load academic results.",
                              ),
                            )
                            .finally(() => setSummaryLoading(false));
                        }
                      }}
                      accessibilityRole="button"
                    >
                      <Text style={styles.retryText}>Retry</Text>
                    </Pressable>
                  </View>
                ) : summary && allResults.length ? (
                  <>
                    <Text style={styles.chartTitle}>Subject Averages</Text>
                    <BarChart data={subjectAverages} color={colors.info} />
                    <View style={styles.resultHeading}>
                      <View style={styles.flex}>
                        <Text style={styles.sectionTitle}>Student Results</Text>
                        <Text style={styles.sectionSubtitle}>
                          Ranked by percentage
                        </Text>
                      </View>
                    </View>
                    <View style={styles.searchRow}>
                      <Ionicons
                        name="search"
                        size={16}
                        color={colors.muted}
                      />
                      <Input
                        value={search}
                        onChangeText={setSearch}
                        placeholder="Search student..."
                        style={styles.searchInput}
                        accessibilityLabel="Search student performance"
                      />
                      {!!search && (
                        <Pressable
                          onPress={() => setSearch("")}
                          accessibilityRole="button"
                          accessibilityLabel="Clear search"
                        >
                          <Ionicons
                            name="close-circle"
                            size={17}
                            color={colors.muted}
                          />
                        </Pressable>
                      )}
                    </View>
                    {resultRows.length ? (
                      resultRows.map((student, index) => {
                        const pct = number(student.pct);
                        const tint =
                          pct >= 60
                            ? colors.success
                            : pct >= 50
                              ? colors.amberDark
                              : colors.alert;
                        return (
                          <View
                            key={String(student.studentId || index)}
                            style={styles.resultRow}
                          >
                            <View style={styles.rankBadge}>
                              <Text style={styles.rankText}>#{index + 1}</Text>
                            </View>
                            <View style={styles.resultStudent}>
                              <Text numberOfLines={1} style={styles.studentName}>
                                {student.displayName}
                              </Text>
                              <Text style={styles.studentMeta}>
                                {Array.isArray(student.subjects)
                                  ? student.subjects.length
                                  : 0}{" "}
                                subjects · {student.total ?? 0}/
                                {student.maxTotal ?? 0}
                              </Text>
                            </View>
                            <Text style={[styles.percentage, { color: tint }]}>
                              {pct}%
                            </Text>
                            <View
                              style={[
                                styles.gradeBadge,
                                student.grade === "F"
                                  ? styles.gradeFail
                                  : styles.gradePass,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.gradeText,
                                  student.grade === "F"
                                    ? styles.gradeTextFail
                                    : styles.gradeTextPass,
                                ]}
                              >
                                {student.grade || "—"}
                              </Text>
                            </View>
                          </View>
                        );
                      })
                    ) : (
                      <Text style={styles.emptyText}>
                        No students match your search.
                      </Text>
                    )}
                  </>
                ) : (
                  <View style={styles.noMarks}>
                    <Ionicons
                      name="document-text-outline"
                      size={24}
                      color={colors.muted}
                    />
                    <Text style={styles.emptyTitle}>No marks available</Text>
                    <Text style={styles.emptyText}>
                      Results appear here once marks have been entered for this
                      exam.
                    </Text>
                  </View>
                )}
              </Card>

              <Card style={styles.attendanceCard}>
                <Text style={styles.sectionTitle}>Attendance Trend</Text>
                <Text style={styles.sectionSubtitle}>
                  Overall attendance rate: {attendanceRate ?? "—"}%
                </Text>
                <TrendChart data={attendanceTrend} color={colors.info} />
              </Card>

              <Card style={styles.supportCard}>
                <View style={styles.sectionHeading}>
                  <View style={styles.flex}>
                    <Text style={styles.sectionTitle}>
                      Students Needing Support
                    </Text>
                    <Text style={styles.sectionSubtitle}>
                      Below 50% in {examName || "selected exam"}
                    </Text>
                  </View>
                  <View style={styles.supportCount}>
                    <Text style={styles.supportCountText}>
                      {lowScorers.length}
                    </Text>
                  </View>
                </View>
                {summaryLoading ? (
                  <ActivityIndicator color={colors.info} />
                ) : lowScorers.length ? (
                  lowScorers.map((student, index) => (
                    <View
                      key={String(student.studentId || index)}
                      style={styles.supportRow}
                    >
                      <View style={styles.flex}>
                        <Text numberOfLines={1} style={styles.studentName}>
                          {studentsById.get(String(student.studentId || "")) ||
                            String(student.studentId || "Student")}
                        </Text>
                        <Text style={styles.studentMeta}>
                          Grade {student.grade || "—"} ·{" "}
                          {Array.isArray(student.subjects)
                            ? student.subjects.length
                            : 0}{" "}
                          subjects
                        </Text>
                      </View>
                      <Text style={styles.supportPercentage}>
                        {number(student.pct)}%
                      </Text>
                    </View>
                  ))
                ) : summary ? (
                  <View style={styles.noMarks}>
                    <Ionicons
                      name="checkmark-circle-outline"
                      size={25}
                      color={colors.success}
                    />
                    <Text style={styles.emptyText}>
                      Great job — no students scored below 50%.
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.emptyText}>
                    Select an exam to view students who may need support.
                  </Text>
                )}
              </Card>
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 15, paddingBottom: 28, gap: 11 },
  heading: { flexDirection: "row", alignItems: "center", gap: 11 },
  headingIcon: {
    width: 46,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
    backgroundColor: "#FFF2D9",
  },
  headingCopy: { flex: 1, gap: 3 },
  eyebrow: {
    color: colors.amberDark,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  title: { color: colors.ink, fontSize: 20, fontWeight: "800" },
  subtitle: { color: colors.muted, fontSize: 10, lineHeight: 15 },
  chips: { flexDirection: "row", gap: 7, paddingRight: 3 },
  chip: {
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    backgroundColor: "#fff",
  },
  chipSelected: { borderColor: colors.ink, backgroundColor: colors.ink },
  chipText: { color: colors.muted, fontSize: 9, fontWeight: "700" },
  chipTextSelected: { color: "#fff" },
  metricGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  metricCard: {
    flexBasis: "47%",
    flexGrow: 1,
    minHeight: 99,
    padding: 10,
    borderRadius: 14,
    gap: 3,
  },
  metricIcon: {
    width: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
  metricValue: { color: colors.ink, fontSize: 16, fontWeight: "800" },
  metricLabel: { color: colors.muted, fontSize: 9, fontWeight: "700" },
  metricDetail: { color: colors.muted, fontSize: 8 },
  summaryCard: { gap: 10, padding: 12, borderRadius: 14 },
  sectionHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  flex: { flex: 1, minWidth: 0 },
  sectionTitle: { color: colors.ink, fontSize: 13, fontWeight: "800" },
  sectionSubtitle: { color: colors.muted, fontSize: 9, marginTop: 3 },
  refreshButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: "#EAF1FF",
  },
  filterLabel: {
    color: colors.muted,
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.7,
  },
  chartTitle: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  resultHeading: { paddingTop: 3 },
  searchRow: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 9,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: "#fff",
  },
  searchInput: {
    flex: 1,
    borderWidth: 0,
    borderRadius: 0,
    paddingHorizontal: 0,
    paddingVertical: 5,
    backgroundColor: "transparent",
    fontSize: 10,
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 48,
    paddingVertical: 7,
    borderTopWidth: 1,
    borderTopColor: "#F0F0F0",
  },
  rankBadge: {
    minWidth: 31,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: "#EEF2F6",
  },
  rankText: { color: colors.muted, fontSize: 9, fontWeight: "800" },
  resultStudent: { flex: 1, minWidth: 0, gap: 3 },
  studentName: { color: colors.ink, fontSize: 10, fontWeight: "800" },
  studentMeta: { color: colors.muted, fontSize: 8 },
  percentage: { fontSize: 10, fontWeight: "800" },
  gradeBadge: {
    minWidth: 29,
    alignItems: "center",
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 8,
  },
  gradeFail: { backgroundColor: "#FFF0ED" },
  gradePass: { backgroundColor: "#EAF7EF" },
  gradeText: { fontSize: 8, fontWeight: "800" },
  gradeTextFail: { color: colors.alert },
  gradeTextPass: { color: colors.success },
  attendanceCard: { gap: 5, padding: 12, borderRadius: 14 },
  supportCard: { gap: 10, padding: 12, borderRadius: 14 },
  supportCount: {
    minWidth: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
    backgroundColor: "#FFF0ED",
  },
  supportCountText: { color: colors.alert, fontSize: 10, fontWeight: "800" },
  supportRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: "#F8DEDA",
    borderRadius: 11,
    backgroundColor: "#FFF9F8",
  },
  supportPercentage: { color: colors.alert, fontSize: 14, fontWeight: "800" },
  inlineLoading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 15,
  },
  errorInline: { gap: 7, padding: 9, borderRadius: 9, backgroundColor: "#FFF0ED" },
  errorText: { color: colors.alert, fontSize: 9, lineHeight: 14 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  emptyCard: { alignItems: "center", gap: 8, padding: 18, borderRadius: 14 },
  noMarks: { alignItems: "center", gap: 7, paddingVertical: 12 },
  emptyTitle: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: "800",
    textAlign: "center",
  },
  emptyText: { color: colors.muted, fontSize: 9, lineHeight: 14, textAlign: "center" },
  errorCard: { alignItems: "center", gap: 8, padding: 16, borderRadius: 14 },
  retryButton: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: colors.ink,
  },
  retryText: { color: colors.info, fontSize: 9, fontWeight: "800" },
});
