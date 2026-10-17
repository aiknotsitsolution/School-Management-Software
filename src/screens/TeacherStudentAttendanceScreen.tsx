import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { Card, Input } from "../components/UI";
import { TrendChart, type Point } from "../components/Charts";
import { useAuth } from "../context/AuthContext";
import { api, send } from "../lib/api";
import { colors } from "../theme";
import type { AttendanceRecord, Student } from "../types";

type AttendanceStatus = "Present" | "Absent" | "Leave";
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

const STATUS_OPTIONS: {
  value: AttendanceStatus;
  short: string;
  color: string;
}[] = [
  { value: "Present", short: "P", color: colors.success },
  { value: "Absent", short: "A", color: colors.alert },
  { value: "Leave", short: "L", color: colors.info },
];

function todayISO() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

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
  (profile.classTeacher || []).forEach((scope) => addScope(scope, true));
  (profile.teachingScopes || []).forEach((scope) => addScope(scope, false));
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
  return [...scopes.values()];
}

function isStudent(value: unknown): value is Student {
  return (
    !!value &&
    typeof value === "object" &&
    "_id" in value &&
    typeof value._id === "string"
  );
}

function extractStudents(value: unknown): Student[] | null {
  if (Array.isArray(value)) {
    const rows: Student[] = [];
    for (const item of value) {
      if (!isStudent(item)) return null;
      rows.push(item);
    }
    return rows;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["data", "students", "items"]) {
      if (Array.isArray(record[key])) return extractStudents(record[key]);
    }
  }
  return null;
}

function extractRecords(value: unknown): AttendanceRecord[] | null {
  if (Array.isArray(value)) {
    const rows: AttendanceRecord[] = [];
    for (const item of value) {
      if (!item || typeof item !== "object") return null;
      rows.push(item as AttendanceRecord);
    }
    return rows;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["data", "records", "items"]) {
      if (Array.isArray(record[key])) return extractRecords(record[key]);
    }
  }
  return null;
}

function dateKey(value?: string) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
}

function displayDate(value: string) {
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleDateString("en-IN", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
      });
}

const studentKey = (student: Student) => student.admissionNo || student._id;
const studentName = (student: Student) =>
  student.name ||
  [student.firstName, student.lastName].filter(Boolean).join(" ") ||
  "Student";

function initials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join("") || "S"
  );
}

function StudentAvatar({ student }: { student: Student }) {
  const [imageFailed, setImageFailed] = useState(false);
  return student.photoUrl && !imageFailed ? (
    <Image
      source={{ uri: student.photoUrl }}
      onError={() => setImageFailed(true)}
      style={styles.avatar}
    />
  ) : (
    <View style={styles.avatarFallback}>
      <Text style={styles.avatarText}>{initials(studentName(student))}</Text>
    </View>
  );
}

function Metric({
  label,
  value,
  icon,
  tint,
}: {
  label: string;
  value: number;
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
}) {
  return (
    <Card style={styles.metricCard}>
      <View style={[styles.metricIcon, { backgroundColor: `${tint}18` }]}>
        <Ionicons name={icon} size={17} color={tint} />
      </View>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </Card>
  );
}

export default function TeacherStudentAttendanceScreen() {
  const { user } = useAuth();
  const [scopes, setScopes] = useState<TeacherScope[]>([]);
  const [scope, setScope] = useState<TeacherScope | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [marks, setMarks] = useState<Record<string, AttendanceStatus>>({});
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const requestVersion = useRef(0);
  const date = todayISO();

  const loadRoster = useCallback(
    async (selectedScope: TeacherScope, refresh = false) => {
      const version = ++requestVersion.current;
      if (refresh) setRefreshing(true);
      else setLoading(true);
      setError("");
      try {
        const query = new URLSearchParams({
          class: selectedScope.class,
          ...(selectedScope.section ? { section: selectedScope.section } : {}),
        }).toString();
        const [studentResponse, attendanceResponse] = await Promise.all([
          api.students.list(`${query}&limit=500`),
          api.attendance.list(`${query}&limit=5000`),
        ]);
        const studentRows = extractStudents(studentResponse.data);
        const attendanceRows = extractRecords(attendanceResponse.data);
        if (!studentRows) {
          throw new Error("Student roster response was not in the expected format.");
        }
        if (!attendanceRows) {
          throw new Error("Attendance response was not in the expected format.");
        }
        if (version !== requestVersion.current) return;
        setStudents(studentRows);
        setRecords(attendanceRows);
        const idByReference = new Map<string, string>();
        studentRows.forEach((student) => {
          idByReference.set(student._id, student._id);
          if (student.admissionNo) {
            idByReference.set(student.admissionNo, student._id);
          }
        });
        const savedMarks: Record<string, AttendanceStatus> = {};
        attendanceRows.forEach((record) => {
          const id = idByReference.get(String(record.studentId || ""));
          if (
            id &&
            dateKey(record.date) === date &&
            ["Present", "Absent", "Leave"].includes(record.status)
          ) {
            savedMarks[id] = record.status as AttendanceStatus;
          }
        });
        setMarks(savedMarks);
        setEditing(false);
      } catch (loadError) {
        if (version === requestVersion.current) {
          setError(
            (loadError as Error).message || "Could not load attendance data.",
          );
          setStudents([]);
          setRecords([]);
          setMarks({});
        }
      } finally {
        if (version === requestVersion.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [date],
  );

  const loadAssignments = useCallback(async () => {
    setLoading(true);
    setError("");
    setScopes([]);
    setScope(null);
    setStudents([]);
    setRecords([]);
    try {
      const { data } = await api.assignments.me();
      const nextScopes = getScopes(data, user?.class, user?.section);
      setScopes(nextScopes);
      const preferred =
        nextScopes.find((item) => item.classTeacher) || nextScopes[0] || null;
      setScope(preferred);
      if (preferred) {
        await loadRoster(preferred);
      } else {
        setMarks({});
        setLoading(false);
      }
    } catch (loadError) {
      setError(
        (loadError as Error).message ||
          "Could not load your teaching assignments.",
      );
      setLoading(false);
    }
  }, [loadRoster, user?.class, user?.section]);

  useFocusEffect(
    useCallback(() => {
      void loadAssignments();
      return () => {
        requestVersion.current += 1;
      };
    }, [loadAssignments]),
  );

  const todayRecords = useMemo(
    () => records.filter((record) => dateKey(record.date) === date),
    [date, records],
  );
  const hasTodayAttendance = todayRecords.length > 0;
  const canEdit = !hasTodayAttendance || editing;

  const visibleStudents = useMemo(() => {
    const query = search.trim().toLowerCase();
    return students
      .filter((student) => {
        const values = [
          studentName(student),
          student.admissionNo,
          student.rollNo,
        ];
        return values.some((value) => String(value || "").toLowerCase().includes(query));
      })
      .sort((a, b) =>
        String(a.rollNo || "").localeCompare(String(b.rollNo || ""), undefined, {
          numeric: true,
        }),
      );
  }, [search, students]);

  const counts = useMemo(() => {
    const result: Record<AttendanceStatus | "Unmarked", number> = {
      Present: 0,
      Absent: 0,
      Leave: 0,
      Unmarked: 0,
    };
    students.forEach((student) => {
      result[marks[student._id] || "Unmarked"] += 1;
    });
    return result;
  }, [marks, students]);

  const history = useMemo(() => {
    const grouped = new Map<
      string,
      { total: number; present: number; absent: number; leave: number }
    >();
    records.forEach((record) => {
      const day = dateKey(record.date);
      if (!day) return;
      const item = grouped.get(day) || {
        total: 0,
        present: 0,
        absent: 0,
        leave: 0,
      };
      item.total += 1;
      if (record.status === "Present") item.present += 1;
      else if (record.status === "Absent") item.absent += 1;
      else if (record.status === "Leave") item.leave += 1;
      grouped.set(day, item);
    });
    return [...grouped.entries()]
      .map(([day, item]) => ({ day, ...item }))
      .sort((a, b) => b.day.localeCompare(a.day));
  }, [records]);

  const trend: Point[] = useMemo(() => {
    const grouped = new Map<string, { total: number; present: number }>();
    records.forEach((record) => {
      const month = dateKey(record.date).slice(0, 7);
      if (!month) return;
      const item = grouped.get(month) || { total: 0, present: 0 };
      item.total += 1;
      if (record.status === "Present") item.present += 1;
      grouped.set(month, item);
    });
    return [...grouped.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-8)
      .map(([month, item]) => ({
        label: new Date(`${month}-01T00:00:00`).toLocaleDateString("en-IN", {
          month: "short",
        }),
        value: item.total ? Math.round((item.present / item.total) * 100) : 0,
      }));
  }, [records]);

  const updateMark = (id: string, status: AttendanceStatus) => {
    if (!canEdit) return;
    setMarks((previous) => {
      if (hasTodayAttendance && editing && previous[id] === status) {
        return previous;
      }
      if (previous[id] === status) {
        const next = { ...previous };
        delete next[id];
        return next;
      }
      return { ...previous, [id]: status };
    });
  };

  const markAll = (status: AttendanceStatus) => {
    if (!canEdit) return;
    setMarks((previous) => {
      const next = { ...previous };
      students.forEach((student) => {
        next[student._id] = status;
      });
      return next;
    });
  };

  const cancelEdit = () => {
    const idByReference = new Map<string, string>();
    students.forEach((student) => {
      idByReference.set(student._id, student._id);
      if (student.admissionNo) idByReference.set(student.admissionNo, student._id);
    });
    const saved: Record<string, AttendanceStatus> = {};
    todayRecords.forEach((record) => {
      const id = idByReference.get(String(record.studentId || ""));
      if (
        id &&
        ["Present", "Absent", "Leave"].includes(record.status)
      ) {
        saved[id] = record.status as AttendanceStatus;
      }
    });
    setMarks(saved);
    setEditing(false);
  };

  const save = async () => {
    if (!scope) return;
    const changedStudents = students.filter((student) => {
      if (!marks[student._id]) return false;
      if (!hasTodayAttendance || editing) return true;
      return !todayRecords.some((record) =>
        [student._id, student.admissionNo]
          .filter(Boolean)
          .includes(String(record.studentId || "")),
      );
    });
    if (!changedStudents.length) {
      Alert.alert(
        "Nothing to save",
        "Choose at least one attendance status before saving.",
      );
      return;
    }
    setSaving(true);
    try {
      const updates = changedStudents.map((student) => ({
        studentId:
          todayRecords.find((record) =>
            [student.admissionNo, student._id]
              .filter(Boolean)
              .includes(String(record.studentId || "")),
          )?.studentId || studentKey(student),
        class: scope.class,
        section: scope.section,
        date,
        status: marks[student._id],
      }));
      await send("/attendance/mark", "POST", { records: updates });
      await loadRoster(scope, true);
      Alert.alert(
        "Attendance saved",
        `Saved attendance for ${changedStudents.length} student${changedStudents.length === 1 ? "" : "s"}.`,
      );
    } catch (saveError) {
      Alert.alert(
        "Could not save attendance",
        (saveError as Error).message || "Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const chooseScope = (nextScope: TeacherScope) => {
    if (
      nextScope.class === scope?.class &&
      nextScope.section === scope.section
    ) {
      return;
    }
    setScope(nextScope);
    setSearch("");
    setStudents([]);
    setRecords([]);
    setMarks({});
    void loadRoster(nextScope);
  };

  const header = (
    <View style={styles.headerContent}>
      <View style={styles.heading}>
        <View style={styles.headingIcon}>
          <Ionicons name="calendar" size={22} color={colors.amberDark} />
        </View>
        <View style={styles.headingText}>
          <Text style={styles.eyebrow}>MY TEACHING</Text>
          <Text style={styles.title}>Student Attendance</Text>
          <Text style={styles.subtitle}>
            {scope
              ? `Daily register · Class ${scope.class}${scope.section ? `-${scope.section}` : ""}`
              : "Mark and review your students’ attendance."}
          </Text>
        </View>
      </View>

      {scopes.length > 1 && (
        <View style={styles.scopeSection}>
          <Text style={styles.sectionLabel}>YOUR CLASSES</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {scopes.map((item) => {
              const selected =
                item.class === scope?.class && item.section === scope.section;
              return (
                <Pressable
                  key={`${item.class}::${item.section}`}
                  onPress={() => chooseScope(item)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={[styles.scopeChip, selected && styles.scopeChipSelected]}
                >
                  <Text style={[styles.scopeChipText, selected && styles.scopeChipTextSelected]}>
                    {item.class}
                    {item.section ? `-${item.section}` : ""}
                    {item.classTeacher ? " · Class Teacher" : ""}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      {!loading && !scope && !error && (
        <Card style={styles.emptyCard}>
          <Ionicons name="school-outline" size={30} color={colors.info} />
          <Text style={styles.emptyTitle}>No class assigned yet</Text>
          <Text style={styles.emptyText}>
            Contact your school administrator to assign you a class and section.
          </Text>
        </Card>
      )}

      {!!error && (
        <Card style={styles.errorCard}>
          <Ionicons name="cloud-offline-outline" size={26} color={colors.alert} />
          <Text style={styles.emptyTitle}>Could not load attendance</Text>
          <Text style={styles.emptyText}>{error}</Text>
          <Pressable
            onPress={() => {
              if (scope) void loadRoster(scope);
              else void loadAssignments();
            }}
            style={styles.retryButton}
            accessibilityRole="button"
          >
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </Card>
      )}

      {scope && !error && (
        <>
          <View style={styles.metricsGrid}>
            <Metric label="Marked today" value={students.length - counts.Unmarked} icon="calendar" tint={colors.success} />
            <Metric label="Present" value={counts.Present} icon="checkmark-circle" tint={colors.success} />
            <Metric label="Absent" value={counts.Absent} icon="close-circle" tint={colors.alert} />
            <Metric label="Leave" value={counts.Leave} icon="time" tint={colors.info} />
          </View>

          <Card style={styles.trendCard}>
            <Text style={styles.cardTitle}>Monthly Attendance Trend</Text>
            <Text style={styles.cardSubtitle}>Present rate across the last 8 months</Text>
            <TrendChart data={trend} />
          </Card>

          <Card style={styles.registerCard}>
            <View style={styles.registerHeader}>
              <View style={styles.registerTitleWrap}>
                <Text style={styles.cardTitle}>Mark Today’s Attendance</Text>
                <Text style={styles.cardSubtitle}>{displayDate(date)}</Text>
              </View>
              {hasTodayAttendance && !editing && (
                <Pressable
                  onPress={() => setEditing(true)}
                  style={styles.editButton}
                  accessibilityRole="button"
                >
                  <Ionicons name="create-outline" size={16} color={colors.info} />
                  <Text style={styles.editText}>Edit</Text>
                </Pressable>
              )}
            </View>
            <Text style={styles.hintText}>
              {hasTodayAttendance
                ? editing
                  ? "Change student statuses, then save your updates."
                  : "Attendance is saved. Tap Edit to make changes."
                : "Choose a status per student or mark the entire class."}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.markAllRow}>
              {STATUS_OPTIONS.map((option) => (
                <Pressable
                  key={option.value}
                  disabled={!canEdit || !students.length}
                  onPress={() => markAll(option.value)}
                  style={[styles.markAllButton, (!canEdit || !students.length) && styles.disabled]}
                >
                  <Text style={[styles.markAllText, { color: option.color }]}>Mark all {option.value}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <View style={styles.searchRow}>
              <Ionicons name="search" size={16} color={colors.muted} />
              <Input
                value={search}
                onChangeText={setSearch}
                placeholder="Search name, admission or roll no."
                style={styles.searchInput}
                accessibilityLabel="Search students for attendance"
              />
              {!!search && (
                <Pressable onPress={() => setSearch("")} accessibilityRole="button">
                  <Ionicons name="close-circle" size={17} color={colors.muted} />
                </Pressable>
              )}
            </View>
            <View style={styles.rosterHeader}>
              <Text style={styles.rosterTitle}>Class Roster</Text>
              <Text style={styles.rosterCount}>{visibleStudents.length} students</Text>
            </View>
          </Card>
        </>
      )}
    </View>
  );

  return (
    <View style={styles.root}>
      {loading && !students.length && !error ? (
        <View style={styles.loadingState}>
          <ActivityIndicator size="large" color={colors.ink} />
          <Text style={styles.emptyText}>Loading class attendance...</Text>
        </View>
      ) : (
        <FlatList
          data={scope && !error ? visibleStudents : []}
          keyExtractor={(student) => student._id}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={header}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                if (scope) void loadRoster(scope, true);
                else void loadAssignments();
              }}
            />
          }
          ListEmptyComponent={
            scope && !loading && !error ? (
              <Card style={styles.emptyCard}>
                <View style={styles.emptyIcon}>
                  <Ionicons name="people-outline" size={27} color={colors.info} />
                </View>
                <Text style={styles.emptyTitle}>
                  {search ? "No matching students" : "No students in this class"}
                </Text>
                <Text style={styles.emptyText}>
                  {search
                    ? "Try another name, admission number or roll number."
                    : "No students are enrolled in this class and section yet."}
                </Text>
              </Card>
            ) : null
          }
          renderItem={({ item }) => (
            <Card style={styles.studentCard}>
              <StudentAvatar student={item} />
              <View style={styles.studentInfo}>
                <Text numberOfLines={1} style={styles.studentName}>{studentName(item)}</Text>
                <Text numberOfLines={1} style={styles.studentMeta}>
                  {item.admissionNo || "No admission no."} · Roll {item.rollNo || "—"}
                </Text>
              </View>
              <View style={styles.statusRow}>
                {STATUS_OPTIONS.map((option) => {
                  const selected = marks[item._id] === option.value;
                  return (
                    <Pressable
                      key={option.value}
                      accessibilityRole="button"
                      accessibilityLabel={`${studentName(item)}: ${option.value}`}
                      accessibilityState={{ selected, disabled: !canEdit }}
                      disabled={!canEdit}
                      onPress={() => updateMark(item._id, option.value)}
                      style={[
                        styles.statusButton,
                        { borderColor: option.color },
                        selected && { backgroundColor: option.color },
                        !canEdit && styles.disabled,
                      ]}
                    >
                      <Text style={[styles.statusText, { color: selected ? "#fff" : option.color }]}>
                        {option.short}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </Card>
          )}
          ListFooterComponent={
            scope && !error && students.length > 0 ? (
              <View style={styles.footer}>
                <View style={styles.countRow}>
                  <Text style={[styles.countText, { color: colors.success }]}>Present {counts.Present}</Text>
                  <Text style={[styles.countText, { color: colors.alert }]}>Absent {counts.Absent}</Text>
                  <Text style={[styles.countText, { color: colors.info }]}>Leave {counts.Leave}</Text>
                  <Text style={styles.countText}>Unmarked {counts.Unmarked}</Text>
                </View>
                {editing && (
                  <Pressable
                    disabled={saving}
                    onPress={cancelEdit}
                    style={styles.cancelButton}
                    accessibilityRole="button"
                  >
                    <Text style={styles.cancelText}>Cancel</Text>
                  </Pressable>
                )}
                {canEdit && (
                  <Pressable
                    disabled={saving || !Object.keys(marks).length}
                    onPress={() => void save()}
                    style={[styles.saveButton, (saving || !Object.keys(marks).length) && styles.disabled]}
                    accessibilityRole="button"
                  >
                    {saving ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="save-outline" size={17} color="#fff" />
                        <Text style={styles.saveText}>{editing ? "Save Changes" : "Save Attendance"}</Text>
                      </>
                    )}
                  </Pressable>
                )}
                <View style={styles.historySection}>
                  <Text style={styles.historyTitle}>Attendance History</Text>
                  {history.length === 0 ? (
                    <Card style={styles.emptyCard}>
                      <Text style={styles.emptyText}>No attendance records yet.</Text>
                    </Card>
                  ) : (
                    history.slice(0, 15).map((item) => {
                      const percentage = item.total
                        ? Math.round((item.present / item.total) * 100)
                        : 0;
                      return (
                        <Card key={item.day} style={styles.historyCard}>
                          <View style={styles.historyIcon}>
                            <Ionicons name="calendar-outline" size={16} color={colors.info} />
                          </View>
                          <View style={styles.historyInfo}>
                            <Text style={styles.historyDate}>{displayDate(item.day)}</Text>
                            <View style={styles.progressTrack}>
                              <View style={[styles.progressFill, { width: `${percentage}%` }]} />
                            </View>
                            <Text style={styles.historySummary}>
                              {item.present} present · {item.absent} absent · {item.leave} leave
                            </Text>
                          </View>
                          <Text style={styles.historyPercent}>{percentage}%</Text>
                        </Card>
                      );
                    })
                  )}
                </View>
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  listContent: { padding: 15, paddingBottom: 25, gap: 8 },
  headerContent: { gap: 12, paddingBottom: 3 },
  heading: { flexDirection: "row", alignItems: "center", gap: 11 },
  headingIcon: { width: 46, height: 46, alignItems: "center", justifyContent: "center", borderRadius: 15, backgroundColor: "#FFF2D9" },
  headingText: { flex: 1, gap: 3 },
  eyebrow: { color: colors.amberDark, fontSize: 9, fontWeight: "800", letterSpacing: 0.8 },
  title: { color: colors.ink, fontSize: 20, fontWeight: "800" },
  subtitle: { color: colors.muted, fontSize: 10, lineHeight: 15 },
  scopeSection: { gap: 7 },
  sectionLabel: { color: colors.muted, fontSize: 9, fontWeight: "800", letterSpacing: 0.6 },
  chipRow: { gap: 7, paddingRight: 3 },
  scopeChip: { paddingVertical: 7, paddingHorizontal: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 16, backgroundColor: "#fff" },
  scopeChipSelected: { borderColor: colors.ink, backgroundColor: colors.ink },
  scopeChipText: { color: colors.muted, fontSize: 9, fontWeight: "700" },
  scopeChipTextSelected: { color: "#fff" },
  metricsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  metricCard: { flexBasis: "47%", flexGrow: 1, minHeight: 82, padding: 10, borderRadius: 14, gap: 3 },
  metricIcon: { width: 26, height: 26, alignItems: "center", justifyContent: "center", borderRadius: 8 },
  metricValue: { color: colors.ink, fontSize: 17, fontWeight: "800" },
  metricLabel: { color: colors.muted, fontSize: 9 },
  trendCard: { padding: 12, gap: 3 },
  cardTitle: { color: colors.ink, fontSize: 13, fontWeight: "800" },
  cardSubtitle: { color: colors.muted, fontSize: 9 },
  registerCard: { padding: 12, gap: 10 },
  registerHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  registerTitleWrap: { flex: 1, gap: 3 },
  editButton: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 9, paddingVertical: 7, borderWidth: 1, borderColor: colors.info, borderRadius: 9 },
  editText: { color: colors.info, fontSize: 10, fontWeight: "700" },
  hintText: { color: colors.muted, fontSize: 9, lineHeight: 14 },
  markAllRow: { gap: 7, paddingVertical: 1 },
  markAllButton: { paddingVertical: 7, paddingHorizontal: 9, borderRadius: 9, backgroundColor: colors.paper },
  markAllText: { fontSize: 9, fontWeight: "700" },
  searchRow: { minHeight: 40, flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 9, borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: "#fff" },
  searchInput: { flex: 1, borderWidth: 0, borderRadius: 0, paddingHorizontal: 0, paddingVertical: 5, backgroundColor: "transparent", fontSize: 10 },
  rosterHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  rosterTitle: { color: colors.ink, fontSize: 12, fontWeight: "800" },
  rosterCount: { color: colors.muted, fontSize: 9 },
  studentCard: { flexDirection: "row", alignItems: "center", gap: 8, padding: 9, borderRadius: 13 },
  avatar: { width: 38, height: 38, borderRadius: 19 },
  avatarFallback: { width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: 19, backgroundColor: "#EAF1FF" },
  avatarText: { color: colors.info, fontSize: 12, fontWeight: "800" },
  studentInfo: { flex: 1, minWidth: 0, gap: 4 },
  studentName: { color: colors.ink, fontSize: 10, fontWeight: "800" },
  studentMeta: { color: colors.muted, fontSize: 8 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  statusButton: { width: 30, height: 30, alignItems: "center", justifyContent: "center", borderWidth: 1, borderRadius: 8, backgroundColor: "#fff" },
  statusText: { fontSize: 9, fontWeight: "800" },
  disabled: { opacity: 0.5 },
  footer: { gap: 10, marginTop: 6, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border },
  countRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 11 },
  countText: { color: colors.muted, fontSize: 9, fontWeight: "700" },
  cancelButton: { minHeight: 40, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.ink, borderRadius: 11 },
  cancelText: { color: colors.ink, fontSize: 11, fontWeight: "700" },
  saveButton: { minHeight: 43, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderRadius: 11, backgroundColor: colors.ink },
  saveText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  historySection: { gap: 8, marginTop: 10 },
  historyTitle: { color: colors.ink, fontSize: 14, fontWeight: "800", marginBottom: 1 },
  historyCard: { flexDirection: "row", alignItems: "center", gap: 9, padding: 10, borderRadius: 12 },
  historyIcon: { width: 32, height: 32, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: "#EAF1FF" },
  historyInfo: { flex: 1, gap: 4 },
  historyDate: { color: colors.ink, fontSize: 9, fontWeight: "700" },
  progressTrack: { height: 5, overflow: "hidden", borderRadius: 3, backgroundColor: "#EEF0F4" },
  progressFill: { height: "100%", borderRadius: 3, backgroundColor: colors.success },
  historySummary: { color: colors.muted, fontSize: 8 },
  historyPercent: { color: colors.success, fontSize: 10, fontWeight: "800" },
  loadingState: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  emptyCard: { alignItems: "center", gap: 8, padding: 18, borderRadius: 14 },
  emptyIcon: { width: 46, height: 46, alignItems: "center", justifyContent: "center", borderRadius: 16, backgroundColor: "#EAF1FF" },
  emptyTitle: { color: colors.ink, fontSize: 12, fontWeight: "800", textAlign: "center" },
  emptyText: { color: colors.muted, fontSize: 9, lineHeight: 14, textAlign: "center" },
  errorCard: { alignItems: "center", gap: 8, padding: 17, borderRadius: 14 },
  retryButton: { marginTop: 2, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, backgroundColor: colors.ink },
  retryText: { color: "#fff", fontSize: 9, fontWeight: "700" },
});
