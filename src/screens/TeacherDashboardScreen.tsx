import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { Card } from "../components/UI";
import { useAuth } from "../context/AuthContext";
import { api, get, send } from "../lib/api";
import { extractList, type Row } from "../lib/format";
import { colors } from "../theme";
import type { Notice, StaffRecord, Student } from "../types";
import type { RootStackParams } from "../../App";

type TeachingScope = {
  class: string;
  section: string;
  subjects: string[];
  classTeacher: boolean;
};

type AssignmentData = {
  classTeacher?: Row[];
  teaching?: Row[];
  teachingScopes?: Row[];
  staff?: StaffRecord;
};

type DashboardData = {
  students: Student[];
  attendance: Row[];
  homework: Row[];
  exams: Row[];
  timetable: Row[];
  achievements: Row[];
  notices: Notice[];
};

type AttendanceStatus = "Present" | "Absent" | "Leave";

const STATUS_OPTIONS: AttendanceStatus[] = ["Present", "Absent", "Leave"];
const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const EMPTY_DATA: DashboardData = {
  students: [],
  attendance: [],
  homework: [],
  exams: [],
  timetable: [],
  achievements: [],
  notices: [],
};

const textValue = (value: unknown) =>
  value == null ? "" : String(value).trim();

const dateKey = (value?: unknown) => {
  const raw = textValue(value);
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const date = new Date(raw);
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
};

const todayKey = () => dateKey(new Date().toISOString());

const greeting = () => {
  const hour = Number(
    new Intl.DateTimeFormat("en-IN", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone: "Asia/Kolkata",
    }).format(new Date()),
  );
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
};

const formatDate = (value?: unknown) => {
  const key = dateKey(value);
  if (!key) return "—";
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
};

const shortDate = (value?: unknown) => {
  const key = dateKey(value);
  if (!key) return "Date not set";
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
};

const formatTime = (value?: unknown) => {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)/.exec(textValue(value));
  if (!match) return textValue(value) || "Time not set";
  const hour = Number(match[1]);
  return `${((hour + 11) % 12) + 1}:${match[2]} ${hour >= 12 ? "PM" : "AM"}`;
};

const periodState = (period: Row, minutesNow: number) => {
  const startMatch = /^([01]?\d|2[0-3]):([0-5]\d)/.exec(
    textValue(period.startTime),
  );
  const endMatch = /^([01]?\d|2[0-3]):([0-5]\d)/.exec(
    textValue(period.endTime),
  );
  if (!startMatch) return "Scheduled";
  const start = Number(startMatch[1]) * 60 + Number(startMatch[2]);
  let end = endMatch
    ? Number(endMatch[1]) * 60 + Number(endMatch[2])
    : null;
  if (end != null && end <= start) end += 1440;
  if (minutesNow < start) {
    const untilStart = start - minutesNow;
    return untilStart <= 30 ? `Starts in ${untilStart} min` : "Upcoming";
  }
  if (end == null || minutesNow < end) return "In session";
  return "Completed";
};

function makeScopes(assignments: AssignmentData | null, user?: {
  class?: string | null;
  section?: string | null;
}): TeachingScope[] {
  const scopes = new Map<string, TeachingScope>();
  const addScope = (value: Row, classTeacher: boolean) => {
    const className = textValue(value.class);
    if (!className) return;
    const section = textValue(value.section);
    const key = `${className}::${section}`;
    const current = scopes.get(key) || {
      class: className,
      section,
      subjects: [],
      classTeacher: false,
    };
    current.classTeacher ||= classTeacher;
    const subjects = Array.isArray(value.subjects)
      ? value.subjects.map(textValue)
      : [textValue(value.subject)];
    current.subjects = [...new Set([...current.subjects, ...subjects].filter(Boolean))];
    scopes.set(key, current);
  };
  (assignments?.classTeacher || []).forEach((scope) => addScope(scope, true));
  (assignments?.teachingScopes || []).forEach((scope) => addScope(scope, false));
  if (!scopes.size && (user?.class || user?.section)) {
    addScope(
      { class: user.class, section: user.section },
      false,
    );
  }
  return [...scopes.values()];
}

const rowName = (row: Row) =>
  textValue(row.title || row.subject || row.examName || row.name) || "Untitled";

function SectionHeader({
  title,
  subtitle,
  action,
  onPress,
}: {
  title: string;
  subtitle?: string;
  action?: string;
  onPress?: () => void;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.flex}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
      </View>
      {action && onPress ? (
        <Pressable onPress={onPress} accessibilityRole="button">
          <Text style={styles.link}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function Metric({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string | number;
  hint: string;
  tone: string;
}) {
  return (
    <Card style={styles.metric}>
      <Ionicons name={icon} size={19} color={tone} />
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricHint} numberOfLines={1}>
        {hint}
      </Text>
    </Card>
  );
}

function QuickAction({
  icon,
  label,
  detail,
  tone,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  detail: string;
  tone: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.action, pressed && styles.pressed]}
      accessibilityRole="button"
    >
      <View style={[styles.actionIcon, { backgroundColor: `${tone}18` }]}>
        <Ionicons name={icon} size={20} color={tone} />
      </View>
      <View style={styles.flex}>
        <Text style={styles.actionTitle}>{label}</Text>
        <Text style={styles.actionDetail}>{detail}</Text>
      </View>
      <Ionicons name="chevron-forward" size={17} color={colors.muted} />
    </Pressable>
  );
}

export default function TeacherDashboardScreen() {
  const { user, school, can } = useAuth();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParams>>();
  const [scopes, setScopes] = useState<TeachingScope[]>([]);
  const [activeScopeIndex, setActiveScopeIndex] = useState(0);
  const [staffRecord, setStaffRecord] = useState<StaffRecord | null>(null);
  const [staffError, setStaffError] = useState("");
  const [data, setData] = useState<DashboardData>(EMPTY_DATA);
  const [marks, setMarks] = useState<Record<string, AttendanceStatus>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [assignmentsError, setAssignmentsError] = useState("");
  const [dataErrors, setDataErrors] = useState<string[]>([]);
  const [clockNow, setClockNow] = useState(() => Date.now());

  const activeScope = scopes[activeScopeIndex] || null;
  const scopeQuery = useMemo(() => {
    if (!activeScope) return "";
    return `class=${encodeURIComponent(activeScope.class)}${
      activeScope.section
        ? `&section=${encodeURIComponent(activeScope.section)}`
        : ""
    }`;
  }, [activeScope]);

  const loadAssignments = useCallback(async () => {
    const [assignmentResult, staffResult] = await Promise.allSettled([
      api.assignments.me(),
      get<StaffRecord>("/staff/me"),
    ]);
    if (assignmentResult.status === "fulfilled") {
      const assignmentData = assignmentResult.value.data;
      setScopes(makeScopes(assignmentData, user ?? undefined));
      setAssignmentsError("");
    } else {
      setScopes(makeScopes(null, user ?? undefined));
      setAssignmentsError(
        assignmentResult.reason instanceof Error
          ? `Teaching assignments: ${assignmentResult.reason.message}`
          : "Teaching assignments could not be loaded.",
      );
    }
    if (staffResult.status === "fulfilled") {
      setStaffRecord(staffResult.value.data);
      setStaffError("");
    } else {
      setStaffRecord(null);
      setStaffError(
        staffResult.reason instanceof Error
          ? `Teacher profile: ${staffResult.reason.message}`
          : "Teacher profile could not be loaded.",
      );
    }
  }, [user]);

  const loadScopeData = useCallback(async () => {
    if (!activeScope) {
      setData(EMPTY_DATA);
      setMarks({});
      setDataErrors([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    setLoading(true);
    const requests: Promise<unknown>[] = [
      api.students.list(`${scopeQuery}&limit=500`),
      api.attendance.list(`${scopeQuery}&limit=2000`),
      api.notices.list(),
    ];
    const labels = ["Students", "Attendance", "Notices"];
    const optionalIndexes: { homework?: number; exams?: number; timetable?: number; achievements?: number } = {};
    if (can("homework:read")) {
      optionalIndexes.homework = requests.length;
      requests.push(api.homework.list(scopeQuery));
      labels.push("Homework");
    }
    if (can("exams:read")) {
      optionalIndexes.exams = requests.length;
      requests.push(get<unknown>(`/exams?${scopeQuery}`));
      labels.push("Examinations");
    }
    if (can("timetable:read")) {
      optionalIndexes.timetable = requests.length;
      requests.push(api.timetable.list(scopeQuery));
      labels.push("Timetable");
    }
    if (can("achievements:read")) {
      optionalIndexes.achievements = requests.length;
      requests.push(get<unknown>(`/achievements?${scopeQuery}&limit=50`));
      labels.push("Achievements");
    }
    const results = await Promise.allSettled(requests);
    const at = <T,>(index: number, fallback: T): T => {
      const result = results[index];
      if (result.status !== "fulfilled") return fallback;
      const response = result.value as { data?: unknown };
      return (response.data as T | undefined) ?? fallback;
    };
    const students: Student[] = extractList(at<unknown>(0, [])).flatMap(
      (student) =>
        typeof student._id === "string"
          ? [{ ...student, _id: student._id }]
          : [],
    );
    const attendance = extractList(at<unknown>(1, []));
    const notices: Notice[] = extractList(at<unknown>(2, [])).flatMap(
      (notice) =>
        typeof notice._id === "string" &&
        typeof notice.title === "string" &&
        typeof notice.body === "string"
          ? [
              {
                ...notice,
                _id: notice._id,
                title: notice.title,
                body: notice.body,
              },
            ]
          : [],
    );
    setData({
      students,
      attendance,
      notices,
      homework:
        optionalIndexes.homework == null
          ? []
          : extractList(at<unknown>(optionalIndexes.homework, [])),
      exams:
        optionalIndexes.exams == null
          ? []
          : extractList(at<unknown>(optionalIndexes.exams, [])),
      timetable:
        optionalIndexes.timetable == null
          ? []
          : extractList(at<unknown>(optionalIndexes.timetable, [])),
      achievements:
        optionalIndexes.achievements == null
          ? []
          : extractList(at<unknown>(optionalIndexes.achievements, [])),
    });
    const failures = results.flatMap((result, index) =>
      result.status === "rejected"
        ? [
            `${labels[index]}: ${
              result.reason instanceof Error
                ? result.reason.message
                : "Unable to load"
            }`,
          ]
        : [],
    );
    setDataErrors(failures);
    const today = todayKey();
    const nextMarks: Record<string, AttendanceStatus> = {};
    attendance.forEach((record) => {
      if (dateKey(record.date) !== today) return;
      const student = students.find((item) =>
        [item._id, item.admissionNo].some(
          (id) => textValue(id) === textValue(record.studentId),
        ),
      );
      if (
        student &&
        STATUS_OPTIONS.includes(record.status as AttendanceStatus)
      ) {
        nextMarks[student._id] = record.status as AttendanceStatus;
      }
    });
    setMarks(nextMarks);
    setEditing(false);
    setLoading(false);
    setRefreshing(false);
  }, [activeScope, can, scopeQuery]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await loadAssignments();
  }, [loadAssignments]);

  useEffect(() => {
    setLoading(true);
    void loadAssignments().finally(() => {
      setLoading(false);
    });
  }, [loadAssignments]);

  useEffect(() => {
    const interval = setInterval(() => setClockNow(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    void loadScopeData();
  }, [loadScopeData]);

  const todayAttendance = useMemo(() => {
    const statuses: Record<string, string> = {};
    data.attendance.forEach((record) => {
      if (dateKey(record.date) === todayKey()) {
        statuses[textValue(record.studentId)] = textValue(record.status);
      }
    });
    return statuses;
  }, [data.attendance]);
  const attendanceCounts = useMemo(() => {
    const values = Object.values(marks);
    return {
      present: values.filter((status) => status === "Present").length,
      absent: values.filter((status) => status === "Absent").length,
      leave: values.filter((status) => status === "Leave").length,
      marked: values.length,
    };
  }, [marks]);
  const unmarkedCount = Math.max(
    0,
    data.students.length - attendanceCounts.marked,
  );
  const hasTodayAttendance = Object.keys(todayAttendance).length > 0;
  const attendanceRate = data.attendance.length
    ? Math.round(
        (data.attendance.filter((record) => record.status === "Present").length /
          data.attendance.length) *
          100,
      )
    : null;
  const today = todayKey();
  const todayPeriods = useMemo(() => {
    const currentDay = new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      timeZone: "Asia/Kolkata",
    }).format(new Date());
    const matchingDay = data.timetable.find(
      (item) => textValue(item.day) === currentDay,
    );
    return Array.isArray(matchingDay?.periods)
      ? (matchingDay.periods as Row[])
      : [];
  }, [data.timetable]);
  const minutesNow = useMemo(() => {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(clockNow));
    const hour = Number(parts.find((part) => part.type === "hour")?.value);
    const minute = Number(parts.find((part) => part.type === "minute")?.value);
    return Number.isFinite(hour) && Number.isFinite(minute)
      ? hour * 60 + minute
      : 0;
  }, [clockNow]);
  const upcomingExams = useMemo(
    () =>
      data.exams
        .filter((exam) => dateKey(exam.date) >= today)
        .sort((a, b) =>
          dateKey(a.date).localeCompare(dateKey(b.date)),
        ),
    [data.exams, today],
  );
  const openHomeworkCount = useMemo(
    () =>
      data.homework.filter(
        (item) => dateKey(item.dueDate) >= today,
      ).length,
    [data.homework, today],
  );
  const overdueHomework = useMemo(
    () =>
      data.homework.filter(
        (item) => !!dateKey(item.dueDate) && dateKey(item.dueDate) < today,
      ),
    [data.homework, today],
  );
  const academicAchievements = data.achievements.filter(
    (item) => item.category === "academic",
  ).length;
  const nextClassDay = useMemo(() => {
    if (!data.timetable.length) return "";
    const currentDay = new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      timeZone: "Asia/Kolkata",
    }).format(new Date());
    const dayIndex = WEEKDAYS.indexOf(currentDay);
    for (let offset = 1; offset <= 7; offset += 1) {
      const day = WEEKDAYS[(dayIndex + offset) % WEEKDAYS.length];
      const schedule = data.timetable.find(
        (item) => textValue(item.day) === day,
      );
      if (Array.isArray(schedule?.periods) && schedule.periods.length) return day;
    }
    return "";
  }, [data.timetable]);

  const setStudentStatus = (studentId: string, status: AttendanceStatus) => {
    setMarks((current) => {
      if (current[studentId] !== status) {
        return { ...current, [studentId]: status };
      }
      const next = { ...current };
      delete next[studentId];
      return next;
    });
  };

  const markAllPresent = () => {
    setMarks((current) => {
      const next = { ...current };
      data.students.forEach((student) => {
        next[student._id] = "Present";
      });
      return next;
    });
  };

  const resetAttendance = () => {
    const savedMarks: Record<string, AttendanceStatus> = {};
    data.students.forEach((student) => {
      const status =
        todayAttendance[textValue(student.admissionNo)] ||
        todayAttendance[textValue(student._id)];
      if (STATUS_OPTIONS.includes(status as AttendanceStatus)) {
        savedMarks[student._id] = status as AttendanceStatus;
      }
    });
    setMarks(savedMarks);
    setEditing(false);
  };

  const saveAttendance = async () => {
    if (!can("attendance:mark")) {
      Alert.alert("Permission required", "You cannot mark attendance.");
      return;
    }
    const records = data.students
      .filter((student) => marks[student._id])
      .map((student) => ({
        studentId:
          data.attendance.find(
            (record) =>
              dateKey(record.date) === today &&
              [student.admissionNo, student._id]
                .filter(Boolean)
                .map(textValue)
                .includes(textValue(record.studentId)),
          )?.studentId ||
          student.admissionNo ||
          student._id,
        class: activeScope?.class || textValue(student.class),
        section: activeScope?.section || textValue(student.section),
        date: today,
        status: marks[student._id],
      }));
    if (!records.length) {
      Alert.alert("Nothing to save", "Select an attendance status first.");
      return;
    }
    setSaving(true);
    try {
      await send("/attendance/mark", "POST", { records });
      setEditing(false);
      await loadScopeData();
      Alert.alert(
        "Attendance saved",
        `Attendance saved for ${records.length} student${records.length === 1 ? "" : "s"}.`,
      );
    } catch (error) {
      Alert.alert(
        "Could not save attendance",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const openAttendance = () => navigation.navigate("MarkAttendance");
  const openHomework = () => navigation.navigate("Homework");
  const openExams = () => navigation.navigate("Examination");
  const openTimetable = () => navigation.navigate("Timetable");

  const displayName = user?.name?.trim().split(/\s+/)[0] || "Teacher";
  const isDayOff =
    data.timetable.length > 0 &&
    todayPeriods.length === 0;
  const isWeekend =
    new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      timeZone: "Asia/Kolkata",
    }).format(new Date()) === "Sunday";

  if (loading && !data.students.length && !scopes.length) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.success} />
        <Text style={styles.bodyMuted}>Loading your teacher workspace…</Text>
      </View>
    );
  }

  if (!scopes.length && !loading) {
    return (
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />
        }
      >
        <View style={styles.noAssignment}>
          <View style={styles.noAssignmentIcon}>
            <Ionicons name="school-outline" size={28} color={colors.info} />
          </View>
          <Text style={styles.noAssignmentTitle}>
            {assignmentsError ? "Could not load teaching assignment" : "No teaching assignment yet"}
          </Text>
          <Text style={styles.bodyMuted}>
            {assignmentsError ||
              "Contact the school administrator to assign you a class, section and subject."}
          </Text>
          <Pressable
            onPress={() => void refresh()}
            style={styles.primaryButton}
            accessibilityRole="button"
          >
            <Text style={styles.primaryButtonText}>Refresh</Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  }

  const firstScope = activeScope
    ? `Class ${activeScope.class}${activeScope.section ? `-${activeScope.section}` : ""}`
    : "Teacher";
  const assignmentLabel = activeScope?.classTeacher
    ? `Class Teacher · ${firstScope}`
    : firstScope;
  const dashboardImage =
    typeof school?.settings?.bannerImage === "string"
      ? school.settings.bannerImage
      : undefined;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />
      }
    >
      <ImageBackground
        source={dashboardImage ? { uri: dashboardImage } : undefined}
        imageStyle={styles.heroImage}
        style={styles.hero}
      >
        <View style={styles.heroOverlay}>
          <Text style={styles.eyebrow}>{greeting()}</Text>
          <Text style={styles.heroTitle}>Hello, {displayName}</Text>
          <Text style={styles.heroMeta}>
            {assignmentLabel}
            {activeScope?.subjects.length
              ? ` · ${activeScope.subjects.join(", ")}`
              : ""}
            {staffRecord?.designation ? ` · ${staffRecord.designation}` : ""}
          </Text>
          <Text style={styles.heroDate}>{formatDate(new Date().toISOString())}</Text>
          <View style={styles.heroStats}>
            <HeroStat label="Present today" value={attendanceCounts.present} />
            <HeroStat label="Open homework" value={openHomework.length} />
            <HeroStat label="Students" value={data.students.length} />
          </View>
        </View>
      </ImageBackground>

      {scopes.length > 1 && (
        <Card>
          <SectionHeader
            title="Active class"
            subtitle="Switch between your assigned classes"
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.scopeRow}>
              {scopes.map((scope, index) => {
                const selected = index === activeScopeIndex;
                return (
                  <Pressable
                    key={`${scope.class}-${scope.section}`}
                    onPress={() => setActiveScopeIndex(index)}
                    style={[styles.scopeChip, selected && styles.scopeChipActive]}
                  >
                    <Text
                      style={[
                        styles.scopeText,
                        selected && styles.scopeTextActive,
                      ]}
                    >
                      {scope.class}-{scope.section || "?"}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        </Card>
      )}

      {assignmentsError ? (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle-outline" size={18} color={colors.alert} />
          <Text style={styles.errorText}>{assignmentsError}</Text>
        </View>
      ) : null}
      {staffError ? (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle-outline" size={18} color={colors.alert} />
          <Text style={styles.errorText}>{staffError}</Text>
        </View>
      ) : null}

      <Card>
        <SectionHeader
          title="Quick actions"
          subtitle="Common teaching tasks"
          action="Timetable"
          onPress={openTimetable}
        />
        <View style={styles.actionList}>
          {can("attendance:mark") && (
            <QuickAction
              icon="calendar-outline"
              label="Mark Attendance"
              detail="Record today's class attendance"
              tone={colors.success}
              onPress={openAttendance}
            />
          )}
          {can("homework:write") && (
            <QuickAction
              icon="book-outline"
              label="Assign Homework"
              detail="Create or review assignments"
              tone="#7856B5"
              onPress={openHomework}
            />
          )}
          {can("exams:read") && (
            <QuickAction
              icon="clipboard-outline"
              label="Examinations"
              detail="View exam schedule and marks"
              tone={colors.alert}
              onPress={openExams}
            />
          )}
          <QuickAction
            icon="time-outline"
            label="My Timetable"
            detail="View your weekly schedule"
            tone={colors.info}
            onPress={openTimetable}
          />
        </View>
      </Card>

      {dataErrors.length > 0 && (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle-outline" size={18} color={colors.alert} />
          <Text style={styles.errorText}>
            Some dashboard data could not be loaded: {dataErrors.join(" · ")}
          </Text>
        </View>
      )}

      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={colors.success} />
          <Text style={styles.bodyMuted}>Updating class data…</Text>
        </View>
      ) : (
        <>
          <View style={styles.metrics}>
            <Metric
              icon="people-outline"
              label="Students"
              value={data.students.length}
              hint={firstScope}
              tone={colors.info}
            />
            <Metric
              icon="checkmark-circle-outline"
              label="Present today"
              value={attendanceCounts.present}
              hint={`${attendanceCounts.absent} absent · ${unmarkedCount} unmarked`}
              tone={colors.success}
            />
            <Metric
              icon="clipboard-outline"
              label="Upcoming exams"
              value={upcomingExams.length}
              hint={upcomingExams.slice(0, 2).map(rowName).join(" · ") || "No exams"}
              tone={colors.alert}
            />
            <Metric
              icon="book-outline"
              label="Open homework"
              value={openHomework.length}
              hint={
                overdueHomework.length
                  ? `${overdueHomework.length} overdue`
                  : "Nothing overdue"
              }
              tone="#7856B5"
            />
          </View>

          {can("achievements:read") && (
            <Metric
              icon="trophy-outline"
              label="Achievements"
              value={data.achievements.length}
              hint={`${academicAchievements} academic`}
              tone={colors.amberDark}
            />
          )}

          <Card>
            <SectionHeader
              title="Today's teaching"
              subtitle={
                isDayOff
                  ? isWeekend
                    ? "Weekend — enjoy the break"
                    : "Day off — no periods"
                  : `${todayPeriods.length} period${todayPeriods.length === 1 ? "" : "s"} scheduled`
              }
              action="Full timetable"
              onPress={openTimetable}
            />
            {isDayOff ? (
              <View style={styles.emptyBlock}>
                <Ionicons name="sunny-outline" size={24} color={colors.success} />
                <Text style={styles.emptyTitle}>
                  {isWeekend ? "Weekend — no classes" : "Day off — no classes"}
                </Text>
                <Text style={styles.bodyMuted}>
                  {nextClassDay
                    ? `Your next scheduled classes are on ${nextClassDay}.`
                    : "No periods are scheduled today."}
                </Text>
              </View>
            ) : todayPeriods.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.periodRow}>
                  {todayPeriods.map((period, index) => {
                    const state = periodState(period, minutesNow);
                    const isLive = state === "In session" || state.startsWith("Starts");
                    return (
                      <View
                        key={`${textValue(period.subject)}-${textValue(period.startTime)}-${index}`}
                        style={styles.periodCard}
                      >
                        <View style={styles.periodTop}>
                          <Text style={styles.periodNumber}>
                            P{textValue(period.periodNo) || index + 1}
                          </Text>
                          <Text style={styles.periodTime}>
                            {formatTime(period.startTime)}
                            {period.endTime
                              ? ` – ${formatTime(period.endTime)}`
                              : ""}
                          </Text>
                        </View>
                        <Text numberOfLines={1} style={styles.periodSubject}>
                          {textValue(period.subject) || "—"}
                        </Text>
                        <Text
                          style={[
                            styles.periodState,
                            isLive && styles.periodStateLive,
                          ]}
                        >
                          {state}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </ScrollView>
            ) : (
              <View style={styles.emptyBlock}>
                <Ionicons
                  name="calendar-outline"
                  size={23}
                  color={colors.muted}
                />
                <Text style={styles.emptyTitle}>No timetable published yet</Text>
                <Text style={styles.bodyMuted}>
                  Published periods for today will appear here.
                </Text>
              </View>
            )}
          </Card>

          <Card>
            <SectionHeader
              title="Mark attendance · Today"
              subtitle={today}
              action={
                hasTodayAttendance && !editing
                  ? "Edit"
                  : "Open attendance"
              }
              onPress={
                hasTodayAttendance && !editing
                  ? () => setEditing(true)
                  : openAttendance
              }
            />
            {data.students.length === 0 ? (
              <View style={styles.emptyBlock}>
                <Text style={styles.bodyMuted}>
                  No students found for {firstScope}.
                </Text>
              </View>
            ) : (
              <>
                <View style={styles.attendanceSummary}>
                  <AttendanceCount label="Marked" value={`${attendanceCounts.marked}/${data.students.length}`} tone={colors.info} />
                  <AttendanceCount label="Present" value={attendanceCounts.present} tone={colors.success} />
                  <AttendanceCount label="Absent" value={attendanceCounts.absent} tone={colors.alert} />
                  <AttendanceCount label="Leave" value={attendanceCounts.leave} tone={colors.info} />
                </View>
                {can("attendance:mark") && (
                  <View style={styles.attendanceActions}>
                    <Pressable
                      onPress={markAllPresent}
                      disabled={hasTodayAttendance && !editing}
                      style={[
                        styles.smallAction,
                        styles.presentAction,
                        hasTodayAttendance && !editing && styles.disabled,
                      ]}
                    >
                      <Text style={[styles.smallActionText, { color: colors.success }]}>
                        All present
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={resetAttendance}
                      disabled={hasTodayAttendance && !editing}
                      style={[
                        styles.smallAction,
                        hasTodayAttendance && !editing && styles.disabled,
                      ]}
                    >
                      <Text style={styles.smallActionText}>Reset</Text>
                    </Pressable>
                  </View>
                )}
                {data.students.slice(0, 30).map((student) => {
                  const studentStatus = marks[student._id];
                  const disabled = hasTodayAttendance && !editing;
                  return (
                    <View key={student._id} style={styles.studentRow}>
                      <View style={styles.studentIdentity}>
                        <Text numberOfLines={1} style={styles.studentName}>
                          {student.name || "Student"}
                        </Text>
                        <Text style={styles.studentMeta}>
                          {student.admissionNo || "No admission number"}
                        </Text>
                      </View>
                      <View style={styles.statusOptions}>
                        {STATUS_OPTIONS.map((status) => {
                          const selected = studentStatus === status;
                          return (
                            <Pressable
                              key={status}
                              onPress={() =>
                                setStudentStatus(student._id, status)
                              }
                              disabled={disabled || !can("attendance:mark")}
                              style={[
                                styles.statusChip,
                                selected && statusStyle[status],
                                disabled && styles.disabled,
                              ]}
                              accessibilityRole="button"
                              accessibilityState={{
                                selected,
                                disabled: disabled || !can("attendance:mark"),
                              }}
                            >
                              <Text
                                style={[
                                  styles.statusText,
                                  selected && styles.statusTextSelected,
                                ]}
                              >
                                {status === "Present"
                                  ? "P"
                                  : status === "Absent"
                                    ? "A"
                                    : "L"}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  );
                })}
                {data.students.length > 30 && (
                  <Text style={styles.bodyMuted}>
                    Showing 30 of {data.students.length} students. Open Attendance to manage the full class.
                  </Text>
                )}
                <View style={styles.saveRow}>
                  <Text style={styles.bodyMuted}>
                    {unmarkedCount} unmarked today
                  </Text>
                  {can("attendance:mark") ? (
                    hasTodayAttendance && !editing ? (
                      <Pressable
                        onPress={() => setEditing(true)}
                        style={styles.primaryButton}
                      >
                        <Text style={styles.primaryButtonText}>Edit Attendance</Text>
                      </Pressable>
                    ) : (
                      <View style={styles.buttonRow}>
                        {editing && (
                          <Pressable
                            onPress={resetAttendance}
                            disabled={saving}
                            style={styles.secondaryButton}
                          >
                            <Text style={styles.secondaryButtonText}>Cancel</Text>
                          </Pressable>
                        )}
                        <Pressable
                          onPress={() => void saveAttendance()}
                          disabled={saving}
                          style={[
                            styles.primaryButton,
                            saving && styles.disabled,
                          ]}
                        >
                          {saving ? (
                            <ActivityIndicator color="#fff" size="small" />
                          ) : (
                            <Text style={styles.primaryButtonText}>
                              {editing ? "Save Changes" : "Save Attendance"}
                            </Text>
                          )}
                        </Pressable>
                      </View>
                    )
                  ) : null}
                </View>
              </>
            )}
          </Card>

          <View style={styles.twoColumns}>
            <Card style={styles.columnCard}>
              <SectionHeader
                title="Homework & assignments"
                subtitle={`${openHomeworkCount} open · ${overdueHomework.length} overdue`}
                action="Manage"
                onPress={openHomework}
              />
              {data.homework.length ? (
                data.homework.slice(0, 6).map((item, index) => (
                  <View
                    key={textValue(item._id) || `${rowName(item)}-${index}`}
                    style={styles.listRow}
                  >
                    <Ionicons name="book-outline" size={17} color="#7856B5" />
                    <View style={styles.flex}>
                      <Text numberOfLines={1} style={styles.rowTitle}>
                        {rowName(item)}
                      </Text>
                      <Text style={styles.rowMeta}>
                        Due {shortDate(item.dueDate)}
                        {item.subject ? ` · ${textValue(item.subject)}` : ""}
                      </Text>
                    </View>
                    {dateKey(item.dueDate) < today && (
                      <Text style={styles.overdueLabel}>Overdue</Text>
                    )}
                  </View>
                ))
              ) : (
                <EmptyText text="Nothing assigned yet." />
              )}
            </Card>

            <Card style={styles.columnCard}>
              <SectionHeader
                title="Upcoming exams"
                action="View all"
                onPress={openExams}
              />
              {upcomingExams.length ? (
                upcomingExams.slice(0, 6).map((exam, index) => (
                  <View
                    key={textValue(exam._id) || `${rowName(exam)}-${index}`}
                    style={styles.listRow}
                  >
                    <Ionicons
                      name="clipboard-outline"
                      size={17}
                      color={colors.alert}
                    />
                    <View style={styles.flex}>
                      <Text numberOfLines={1} style={styles.rowTitle}>
                        {rowName(exam)}
                      </Text>
                      <Text style={styles.rowMeta}>
                        {textValue(exam.examName) || "Examination"}
                      </Text>
                    </View>
                    <Text style={styles.dateBadge}>{shortDate(exam.date)}</Text>
                  </View>
                ))
              ) : (
                <EmptyText text="No exams scheduled." />
              )}
            </Card>
          </View>

          <Card>
            <SectionHeader
              title="Class insights"
              subtitle={`${school?.name || "School"} · Session ${school?.currentSession?.name || school?.session || "—"}`}
              action="Attendance"
              onPress={openAttendance}
            />
            <View style={styles.insights}>
              <View style={styles.rateCircle}>
                <Text style={styles.rateValue}>
                  {attendanceRate == null ? "—" : `${attendanceRate}%`}
                </Text>
                <Text style={styles.rateLabel}>Attendance</Text>
              </View>
              <View style={styles.insightBars}>
                <InsightBar label="Present today" value={attendanceCounts.present} max={data.students.length} tone={colors.success} />
                <InsightBar label="Absent today" value={attendanceCounts.absent} max={data.students.length} tone={colors.alert} />
                <InsightBar label="On leave" value={attendanceCounts.leave} max={data.students.length} tone={colors.info} />
                <InsightBar label="Not marked" value={unmarkedCount} max={data.students.length} tone="#98A2B3" />
              </View>
            </View>
          </Card>

          <Card>
            <SectionHeader
              title="My teaching"
              subtitle={`${scopes.length} teaching scope${scopes.length === 1 ? "" : "s"}`}
            />
            {scopes.slice(0, 6).map((scope, index) => (
              <View key={`${scope.class}-${scope.section}-${index}`} style={styles.listRow}>
                <Ionicons name="school-outline" size={18} color={colors.info} />
                <View style={styles.flex}>
                  <Text style={styles.rowTitle}>
                    Class {scope.class}{scope.section ? `-${scope.section}` : ""}
                    {scope.classTeacher ? " · Class Teacher" : ""}
                  </Text>
                  <Text style={styles.rowMeta}>
                    {scope.subjects.join(", ") || "All subjects"}
                  </Text>
                </View>
                <Pressable
                  onPress={() => {
                    navigation.navigate("Timetable");
                  }}
                  accessibilityRole="button"
                >
                  <Ionicons name="calendar-outline" size={18} color={colors.info} />
                </Pressable>
              </View>
            ))}
          </Card>

          <Card>
            <SectionHeader title="Notices" subtitle="Announcements from school" />
            {data.notices.length ? (
              data.notices.slice(0, 6).map((notice) => (
                <View key={notice._id} style={styles.noticeRow}>
                  <View style={styles.noticeIcon}>
                    <Ionicons name="megaphone-outline" size={17} color={colors.amberDark} />
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.rowTitle}>{notice.title}</Text>
                    <Text style={styles.rowMeta} numberOfLines={2}>
                      {notice.description || notice.body || "School announcement"}
                    </Text>
                    <Text style={styles.noticeDate}>{shortDate(notice.createdAt)}</Text>
                  </View>
                </View>
              ))
            ) : (
              <EmptyText text="No school notices yet." />
            )}
          </Card>
        </>
      )}
    </ScrollView>
  );
}

function HeroStat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.heroStat}>
      <Text style={styles.heroStatValue}>{value}</Text>
      <Text style={styles.heroStatLabel}>{label}</Text>
    </View>
  );
}

function AttendanceCount({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone: string;
}) {
  return (
    <View style={styles.attendanceCount}>
      <Text style={[styles.attendanceCountValue, { color: tone }]}>{value}</Text>
      <Text style={styles.attendanceCountLabel}>{label}</Text>
    </View>
  );
}

function InsightBar({
  label,
  value,
  max,
  tone,
}: {
  label: string;
  value: number;
  max: number;
  tone: string;
}) {
  return (
    <View style={styles.insightBarRow}>
      <Text style={styles.insightLabel}>{label}</Text>
      <View style={styles.barTrack}>
        <View
          style={[
            styles.barFill,
            {
              backgroundColor: tone,
              width: `${max ? Math.min(100, (value / max) * 100) : 0}%`,
            },
          ]}
        />
      </View>
      <Text style={styles.insightValue}>{value}</Text>
    </View>
  );
}

function EmptyText({ text }: { text: string }) {
  return <Text style={styles.bodyMuted}>{text}</Text>;
}

const statusStyle: Record<AttendanceStatus, object> = {
  Present: { backgroundColor: "#E6F4EA", borderColor: "#A6D9B2" },
  Absent: { backgroundColor: "#FDECEA", borderColor: "#F2B8B3" },
  Leave: { backgroundColor: "#E8F2FA", borderColor: "#B5D4EC" },
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 14, paddingBottom: 30, gap: 12 },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.paper,
  },
  flex: { flex: 1, minWidth: 0 },
  bodyMuted: { color: colors.muted, fontSize: 11, lineHeight: 17 },
  hero: {
    minHeight: 198,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: "#145B45",
  },
  heroImage: { borderRadius: 20 },
  heroOverlay: {
    flex: 1,
    padding: 18,
    gap: 5,
    backgroundColor: "#113B31D9",
    justifyContent: "center",
  },
  eyebrow: { color: "#BDE8D1", fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
  heroTitle: { color: "#fff", fontSize: 24, fontWeight: "900" },
  heroMeta: { color: "#E0F2E9", fontSize: 11, lineHeight: 17 },
  heroDate: { color: "#C8F1D9", fontSize: 10, marginTop: 2 },
  heroStats: { flexDirection: "row", gap: 18, marginTop: 10 },
  heroStat: { minWidth: 72 },
  heroStatValue: { color: "#fff", fontSize: 19, fontWeight: "900" },
  heroStatLabel: { color: "#D3F1DF", fontSize: 10, marginTop: 2 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 11,
  },
  sectionTitle: { color: colors.ink, fontSize: 15, fontWeight: "800" },
  sectionSubtitle: { color: colors.muted, fontSize: 10, marginTop: 2 },
  link: { color: colors.info, fontSize: 11, fontWeight: "800" },
  scopeRow: { flexDirection: "row", gap: 8, paddingTop: 5 },
  scopeChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: "#F2F4F7",
    borderWidth: 1,
    borderColor: colors.border,
  },
  scopeChipActive: { backgroundColor: colors.success, borderColor: colors.success },
  scopeText: { color: colors.ink, fontSize: 11, fontWeight: "700" },
  scopeTextActive: { color: "#fff" },
  actionList: { gap: 8 },
  action: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 9,
    backgroundColor: "#fff",
  },
  pressed: { opacity: 0.75 },
  actionIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  actionTitle: { color: colors.ink, fontSize: 12, fontWeight: "800" },
  actionDetail: { color: colors.muted, fontSize: 10, marginTop: 2 },
  errorBox: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
    padding: 11,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#F0C2BC",
    backgroundColor: "#FFF1EF",
  },
  errorText: { flex: 1, color: colors.alert, fontSize: 11, lineHeight: 17 },
  loadingRow: { flexDirection: "row", justifyContent: "center", gap: 9, padding: 14 },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  metric: { flexGrow: 1, flexBasis: "47%", gap: 4, padding: 12 },
  metricValue: { color: colors.ink, fontSize: 20, fontWeight: "900" },
  metricLabel: { color: colors.muted, fontSize: 10, fontWeight: "800" },
  metricHint: { color: colors.muted, fontSize: 9 },
  emptyBlock: { alignItems: "center", paddingVertical: 20, gap: 6 },
  emptyTitle: { color: colors.ink, fontSize: 13, fontWeight: "800" },
  periodRow: { flexDirection: "row", gap: 9 },
  periodCard: {
    width: 188,
    minHeight: 116,
    padding: 12,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#FCFDFE",
    justifyContent: "space-between",
  },
  periodTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 5 },
  periodNumber: {
    color: "#6741A5",
    backgroundColor: "#F0EAFE",
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 3,
    fontSize: 9,
    fontWeight: "900",
  },
  periodTime: { color: colors.muted, fontSize: 9, fontWeight: "700" },
  periodSubject: { color: colors.ink, fontSize: 14, fontWeight: "900", marginTop: 8 },
  periodState: { color: colors.muted, fontSize: 10, fontWeight: "700", marginTop: 7 },
  periodStateLive: { color: colors.success },
  attendanceSummary: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginBottom: 10 },
  attendanceCount: {
    flex: 1,
    minWidth: "22%",
    borderRadius: 9,
    backgroundColor: "#F8FAFC",
    padding: 8,
  },
  attendanceCountValue: { fontSize: 14, fontWeight: "900" },
  attendanceCountLabel: { color: colors.muted, fontSize: 9, marginTop: 2 },
  attendanceActions: { flexDirection: "row", gap: 7, marginBottom: 7 },
  smallAction: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  presentAction: { backgroundColor: "#E6F4EA", borderColor: "#A6D9B2" },
  smallActionText: { color: colors.muted, fontSize: 10, fontWeight: "800" },
  disabled: { opacity: 0.55 },
  studentRow: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  studentIdentity: { flex: 1, minWidth: 0 },
  studentName: { color: colors.ink, fontSize: 11, fontWeight: "800" },
  studentMeta: { color: colors.muted, fontSize: 9, marginTop: 2 },
  statusOptions: { flexDirection: "row", gap: 5 },
  statusChip: {
    minWidth: 30,
    height: 30,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#fff",
  },
  statusText: { color: colors.muted, fontSize: 10, fontWeight: "900" },
  statusTextSelected: { color: colors.ink },
  saveRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 9,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 11,
    marginTop: 3,
  },
  buttonRow: { flexDirection: "row", gap: 7 },
  primaryButton: {
    backgroundColor: colors.ink,
    borderRadius: 9,
    paddingHorizontal: 12,
    paddingVertical: 9,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 80,
  },
  primaryButtonText: { color: "#fff", fontSize: 10, fontWeight: "800" },
  secondaryButton: {
    borderRadius: 9,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: { color: colors.ink, fontSize: 10, fontWeight: "800" },
  twoColumns: { gap: 12 },
  columnCard: { flex: 1 },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 51,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingVertical: 7,
  },
  rowTitle: { color: colors.ink, fontSize: 11, fontWeight: "800" },
  rowMeta: { color: colors.muted, fontSize: 9, marginTop: 2 },
  overdueLabel: { color: colors.alert, fontSize: 9, fontWeight: "800" },
  dateBadge: {
    color: colors.amberDark,
    backgroundColor: "#FBF1DF",
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 8,
    fontSize: 9,
    fontWeight: "800",
  },
  insights: { flexDirection: "row", alignItems: "center", gap: 14 },
  rateCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 8,
    borderColor: colors.success,
    alignItems: "center",
    justifyContent: "center",
  },
  rateValue: { color: colors.success, fontSize: 18, fontWeight: "900" },
  rateLabel: { color: colors.muted, fontSize: 8 },
  insightBars: { flex: 1, gap: 9 },
  insightBarRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  insightLabel: { color: colors.muted, fontSize: 9, width: 78 },
  barTrack: { flex: 1, height: 7, borderRadius: 5, backgroundColor: "#EEF0F3", overflow: "hidden" },
  barFill: { height: 7, borderRadius: 5 },
  insightValue: { color: colors.ink, fontSize: 9, fontWeight: "800", width: 18, textAlign: "right" },
  noticeRow: { flexDirection: "row", gap: 9, borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: 10 },
  noticeIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: "#FBF1DF", alignItems: "center", justifyContent: "center" },
  noticeDate: { color: colors.muted, fontSize: 9, marginTop: 4 },
  noAssignment: {
    alignItems: "center",
    paddingHorizontal: 22,
    paddingVertical: 42,
    gap: 10,
    borderRadius: 20,
    backgroundColor: "#F3F7F6",
  },
  noAssignmentIcon: {
    width: 58,
    height: 58,
    borderRadius: 16,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  noAssignmentTitle: { color: colors.ink, fontSize: 18, fontWeight: "900", textAlign: "center" },
});
