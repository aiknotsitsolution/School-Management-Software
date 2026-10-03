import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { get, send } from "../lib/api";
import { extractList, Row } from "../lib/format";
import { Button, Card, Empty, Input, StatCard } from "../components/UI";
import { TrendChart, Point } from "../components/Charts";
import { useAuth } from "../context/AuthContext";
import { colors } from "../theme";

type AttendanceStatus = "Present" | "Absent" | "Half Day" | "Leave";
type AttendanceTab = "Students" | "Staff";
type AttendanceRecord = Row & {
  studentId?: string;
  staffId?: string;
  status?: string;
  date?: string;
};

const STATUS_OPTIONS: {
  value: AttendanceStatus;
  short: string;
  color: string;
}[] = [
  { value: "Present", short: "P", color: colors.success },
  { value: "Absent", short: "A", color: colors.alert },
  { value: "Half Day", short: "HD", color: colors.amberDark },
  { value: "Leave", short: "L", color: colors.info },
];

const CLASS_FALLBACK = [
  "Nursery", "LKG", "UKG", "1", "2", "3", "4", "5", "6", "7", "8", "9",
  "10", "11-Sci", "11-Com", "12-Sci", "12-Com",
];
const SECTION_FALLBACK = ["A", "B", "C"];
const PAGE_SIZE = 20;
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const textOf = (value: unknown) => (value == null ? "" : String(value));
const attendanceDate = (value: unknown) => {
  const raw = textOf(value);
  return /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : "";
};
const isValidDate = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
  new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const statusOf = (value: unknown): AttendanceStatus | undefined => {
  const normalized = textOf(value).toLowerCase().replace(/[_-]/g, " ");
  if (normalized === "present") return "Present";
  if (normalized === "absent") return "Absent";
  if (normalized === "half day" || normalized === "late") return "Half Day";
  if (normalized === "leave") return "Leave";
  return undefined;
};
const csvCell = (value: unknown) => {
  const text = textOf(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
const statusLabel = (status: AttendanceStatus | undefined) => status ?? "Present";

function PersonStatusButtons({
  value,
  onChange,
}: {
  value: AttendanceStatus;
  onChange: (value: AttendanceStatus) => void;
}) {
  return (
    <View style={styles.statusRow}>
      {STATUS_OPTIONS.map((option) => {
        const active = value === option.value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityLabel={option.value}
            accessibilityState={{ selected: active }}
            onPress={() => onChange(option.value)}
            style={[
              styles.statusButton,
              { borderColor: option.color },
              active && { backgroundColor: option.color },
            ]}
          >
            <Text style={[styles.statusText, { color: active ? "#fff" : option.color }]}>
              {option.short}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function FilterChips({
  values,
  selected,
  onSelect,
}: {
  values: string[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChips}>
      {values.map((value) => {
        const active = value === selected;
        return (
          <Pressable
            key={value}
            onPress={() => onSelect(value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={[styles.filterChip, active && styles.selectedFilterChip]}
          >
            <Text style={[styles.filterChipText, active && styles.selectedFilterChipText]}>
              {value === "All" ? "All" : value}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export default function MarkAttendanceScreen() {
  const { user } = useAuth();
  const isSchoolAdmin = user?.role === "school_admin" || user?.role === "admin";
  const [activeTab, setActiveTab] = useState<AttendanceTab>("Students");
  const [date, setDate] = useState(today());
  const [students, setStudents] = useState<Row[]>([]);
  const [studentRecords, setStudentRecords] = useState<AttendanceRecord[]>([]);
  const [staff, setStaff] = useState<Row[]>([]);
  const [staffRecords, setStaffRecords] = useState<AttendanceRecord[]>([]);
  const [classTeacherMap, setClassTeacherMap] = useState<Record<string, string>>({});
  const [staffAssignments, setStaffAssignments] = useState<Record<string, string[]>>({});
  const [studentMarks, setStudentMarks] = useState<Record<string, AttendanceStatus>>({});
  const [staffMarks, setStaffMarks] = useState<Record<string, AttendanceStatus>>({});
  const [selectedClass, setSelectedClass] = useState("All");
  const [selectedSection, setSelectedSection] = useState("All");
  const [studentSearch, setStudentSearch] = useState("");
  const [staffSearch, setStaffSearch] = useState("");
  const [studentPage, setStudentPage] = useState(1);
  const [staffPage, setStaffPage] = useState(1);
  const [studentLoading, setStudentLoading] = useState(true);
  const [staffLoading, setStaffLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [studentError, setStudentError] = useState("");
  const [staffError, setStaffError] = useState("");
  const [saving, setSaving] = useState(false);
  const [staffSaving, setStaffSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [staffSaved, setStaffSaved] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [monthlyStaff, setMonthlyStaff] = useState<Row[]>([]);
  const [monthlyLoading, setMonthlyLoading] = useState(false);
  const [monthlyError, setMonthlyError] = useState("");

  const studentIdOf = useCallback((student: Row) => textOf(student.admissionNo || student._id), []);
  const staffIdOf = useCallback((member: Row) => textOf(member._id), []);

  const loadData = useCallback(async () => {
    setRefreshing(true);
    setStudentLoading(true);
    setStaffLoading(true);
    const results = await Promise.allSettled([
      get("/students?limit=1000"),
      get("/attendance?limit=5000"),
      get("/assignments?status=active&limit=1000"),
      get("/staff?limit=1000"),
      get("/staff/attendance?limit=2000"),
    ]);

    const [studentsResult, attendanceResult, assignmentsResult, staffResult, staffAttendanceResult] = results;
    const studentFailures: string[] = [];
    const staffFailures: string[] = [];

    if (studentsResult.status === "fulfilled") {
      setStudents(extractList(studentsResult.value.data));
    } else {
      studentFailures.push(`Students: ${studentsResult.reason?.message || "Unable to load"}`);
    }
    if (attendanceResult.status === "fulfilled") {
      setStudentRecords(extractList(attendanceResult.value.data) as AttendanceRecord[]);
    } else {
      studentFailures.push(`Attendance: ${attendanceResult.reason?.message || "Unable to load"}`);
    }
    if (assignmentsResult.status === "fulfilled") {
      const teacherMap: Record<string, string> = {};
      const assignmentMap: Record<string, string[]> = {};
      extractList(assignmentsResult.value.data).forEach((assignment) => {
        const staffId = textOf(assignment.staffId);
        const className = textOf(assignment.class);
        const section = textOf(assignment.section);
        if (assignment.type === "class_teacher") {
          const key = `${className}__${section}`;
          if (!teacherMap[key]) teacherMap[key] = textOf(assignment.staffName) || "—";
          if (staffId) {
            assignmentMap[staffId] = [
              ...(assignmentMap[staffId] ?? []),
              `Class Teacher · ${className}-${section}`,
            ];
          }
        } else if (staffId && assignment.subject) {
          assignmentMap[staffId] = [
            ...(assignmentMap[staffId] ?? []),
            `${textOf(assignment.subject)} · ${className}-${section}`,
          ];
        }
      });
      setClassTeacherMap(teacherMap);
      setStaffAssignments(assignmentMap);
    } else {
      studentFailures.push(`Class assignments: ${assignmentsResult.reason?.message || "Unable to load"}`);
    }
    if (staffResult.status === "fulfilled") {
      setStaff(extractList(staffResult.value.data).filter(
        (member) => !member.status || member.status === "Active",
      ));
    } else {
      staffFailures.push(`Staff: ${staffResult.reason?.message || "Unable to load"}`);
    }
    if (staffAttendanceResult.status === "fulfilled") {
      setStaffRecords(extractList(staffAttendanceResult.value.data) as AttendanceRecord[]);
    } else {
      staffFailures.push(`Staff attendance: ${staffAttendanceResult.reason?.message || "Unable to load"}`);
    }

    setStudentError(studentFailures.join("\n"));
    setStaffError(staffFailures.join("\n"));
    setStudentLoading(false);
    setStaffLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const classOptions = useMemo(
    () => ["All", ...new Set([...CLASS_FALLBACK, ...students.map((s) => textOf(s.class)).filter(Boolean)])],
    [students],
  );
  const sectionOptions = useMemo(() => {
    const available = students
      .filter((s) => selectedClass === "All" || textOf(s.class) === selectedClass)
      .map((s) => textOf(s.section).toUpperCase())
      .filter(Boolean);
    return ["All", ...new Set([...SECTION_FALLBACK, ...available])];
  }, [selectedClass, students]);

  const filteredStudents = useMemo(() => students
    .filter((student) =>
      (selectedClass === "All" || textOf(student.class) === selectedClass) &&
      (selectedSection === "All" || textOf(student.section).toUpperCase() === selectedSection),
    )
    .filter((student) => {
      const query = studentSearch.trim().toLowerCase();
      return !query || [
        student.name,
        student.firstName,
        student.lastName,
        student.rollNo,
        student.admissionNo,
        student._id,
      ].some((field) => textOf(field).toLowerCase().includes(query));
    })
    .sort((a, b) => textOf(a.rollNo).localeCompare(textOf(b.rollNo))),
  [students, selectedClass, selectedSection, studentSearch]);

  const filteredStaff = useMemo(() => staff.filter((member) => {
    const query = staffSearch.trim().toLowerCase();
    return !query || [member.name, member.employeeId, member.designation, member.role]
      .some((field) => textOf(field).toLowerCase().includes(query));
  }), [staff, staffSearch]);

  useEffect(() => {
    setStudentPage(1);
    setSaved(false);
  }, [selectedClass, selectedSection, studentSearch]);
  useEffect(() => {
    setStaffPage(1);
    setStaffSaved(false);
  }, [staffSearch]);
  useEffect(() => {
    const admissionToId = new Map<string, string>();
    students.forEach((student) => {
      if (student.admissionNo) admissionToId.set(textOf(student.admissionNo), studentIdOf(student));
    });
    const marks: Record<string, AttendanceStatus> = {};
    studentRecords.forEach((record) => {
      if (attendanceDate(record.date) !== date) return;
      const key = admissionToId.get(textOf(record.studentId)) ?? textOf(record.studentId);
      const value = statusOf(record.status);
      if (value && key) marks[key] = value;
    });
    students.forEach((student) => {
      const key = studentIdOf(student);
      if (key && !marks[key]) marks[key] = "Present";
    });
    setStudentMarks(marks);
    setSaved(false);
  }, [date, studentRecords, students, studentIdOf]);

  useEffect(() => {
    const marks: Record<string, AttendanceStatus> = {};
    staffRecords.forEach((record) => {
      if (attendanceDate(record.date) !== date) return;
      const value = statusOf(record.status);
      if (value && record.staffId) marks[textOf(record.staffId)] = value;
    });
    staff.forEach((member) => {
      const key = staffIdOf(member);
      if (key && !marks[key]) marks[key] = "Present";
    });
    setStaffMarks(marks);
    setStaffSaved(false);
  }, [date, staffRecords, staff, staffIdOf]);

  useEffect(() => {
    if (activeTab !== "Staff") return;
    let current = true;
    setMonthlyLoading(true);
    setMonthlyError("");
    get(`/staff/attendance/monthly?month=${selectedMonth}&year=${selectedYear}`)
      .then(({ data }) => {
        if (current) setMonthlyStaff(extractList(data));
      })
      .catch((error: Error) => {
        if (current) setMonthlyError(error.message);
      })
      .finally(() => {
        if (current) setMonthlyLoading(false);
      });
    return () => {
      current = false;
    };
  }, [activeTab, selectedMonth, selectedYear]);

  const studentPageCount = Math.max(1, Math.ceil(filteredStudents.length / PAGE_SIZE));
  const safeStudentPage = Math.min(studentPage, studentPageCount);
  const visibleStudents = filteredStudents.slice((safeStudentPage - 1) * PAGE_SIZE, safeStudentPage * PAGE_SIZE);
  const staffPageCount = Math.max(1, Math.ceil(filteredStaff.length / PAGE_SIZE));
  const safeStaffPage = Math.min(staffPage, staffPageCount);
  const visibleStaff = filteredStaff.slice((safeStaffPage - 1) * PAGE_SIZE, safeStaffPage * PAGE_SIZE);

  const studentCounts = useMemo(() => {
    const counts: Record<AttendanceStatus, number> = { Present: 0, Absent: 0, "Half Day": 0, Leave: 0 };
    filteredStudents.forEach((student) => {
      counts[studentMarks[studentIdOf(student)] ?? "Present"] += 1;
    });
    return counts;
  }, [filteredStudents, studentMarks, studentIdOf]);
  const staffCounts = useMemo(() => {
    const counts: Record<AttendanceStatus, number> = { Present: 0, Absent: 0, "Half Day": 0, Leave: 0 };
    filteredStaff.forEach((member) => {
      counts[staffMarks[staffIdOf(member)] ?? "Present"] += 1;
    });
    return counts;
  }, [filteredStaff, staffMarks, staffIdOf]);

  const studentTrend = useMemo(() => trendFromRecords(studentRecords), [studentRecords]);
  const staffTrend = useMemo(() => trendFromRecords(staffRecords), [staffRecords]);

  const changeMonth = (amount: number) => {
    const date = new Date(selectedYear, selectedMonth - 1 + amount, 1);
    setSelectedMonth(date.getMonth() + 1);
    setSelectedYear(date.getFullYear());
  };

  const saveStudents = async () => {
    if (!filteredStudents.length) return;
    if (!isValidDate(date)) {
      Alert.alert("Invalid date", "Enter a valid date in YYYY-MM-DD format.");
      return;
    }
    setSaving(true);
    try {
      const records = filteredStudents.map((student) => ({
        studentId: studentIdOf(student),
        class: textOf(student.class),
        section: textOf(student.section),
        date,
        status: studentMarks[studentIdOf(student)] ?? "Present",
      }));
      await send("/attendance/mark", "POST", { records });
      setStudentRecords((previous) => {
        const updates = new Map(records.map((record) => [record.studentId, record]));
        const kept = previous.filter((record) =>
          attendanceDate(record.date) !== date || !updates.has(textOf(record.studentId)),
        );
        return [...kept, ...records];
      });
      setStudentError("");
      setSaved(true);
      Alert.alert("Saved", "Student attendance saved");
    } catch (error) {
      setStudentError((error as Error).message);
      Alert.alert("Could not save attendance", (error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const saveStaff = async () => {
    if (!filteredStaff.length) return;
    if (!isValidDate(date)) {
      Alert.alert("Invalid date", "Enter a valid date in YYYY-MM-DD format.");
      return;
    }
    setStaffSaving(true);
    try {
      const updates = filteredStaff.map((member) => ({
        staffId: staffIdOf(member),
        date,
        status: staffMarks[staffIdOf(member)] ?? "Present",
      }));
      await Promise.all(updates.map((record) => send("/staff/attendance", "POST", record)));
      setStaffRecords((previous) => {
        const ids = new Set(updates.map((record) => record.staffId));
        return [
          ...previous.filter((record) =>
            attendanceDate(record.date) !== date || !ids.has(textOf(record.staffId)),
          ),
          ...updates,
        ];
      });
      setStaffError("");
      setStaffSaved(true);
      Alert.alert("Saved", "Staff attendance saved");
    } catch (error) {
      setStaffError((error as Error).message);
      Alert.alert("Could not save staff attendance", (error as Error).message);
    } finally {
      setStaffSaving(false);
    }
  };

  const exportRegister = async (kind: AttendanceTab) => {
    if (!isValidDate(date)) {
      Alert.alert("Invalid date", "Enter a valid date in YYYY-MM-DD format.");
      return;
    }
    const isStudents = kind === "Students";
    const rows = isStudents
      ? filteredStudents.map((student) => [
        student.admissionNo || student._id,
        student.name || `${textOf(student.firstName)} ${textOf(student.lastName)}`.trim(),
        student.class,
        student.section,
        student.rollNo,
        statusLabel(studentMarks[studentIdOf(student)]),
      ])
      : filteredStaff.map((member) => [
        member.employeeId || "—",
        member.name,
        member.designation || member.role || "—",
        member.department || "—",
        statusLabel(staffMarks[staffIdOf(member)]),
      ]);
    if (!rows.length) {
      Alert.alert("Nothing to export", `No ${kind.toLowerCase()} match the selected filters.`);
      return;
    }
    const headers = isStudents
      ? ["Admission No", "Name", "Class", "Section", "Roll", "Status"]
      : ["Employee ID", "Name", "Designation", "Department", "Status"];
    const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
    try {
      if (!FileSystem.cacheDirectory || !(await Sharing.isAvailableAsync())) {
        await Share.share({ message: csv, title: `${kind} attendance register` });
        return;
      }
      const fileName = `${kind.toLowerCase()}-attendance-${date}.csv`;
      const uri = `${FileSystem.cacheDirectory}${fileName}`;
      await FileSystem.writeAsStringAsync(uri, `\uFEFF${csv}`, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      await Sharing.shareAsync(uri, {
        mimeType: "text/csv",
        dialogTitle: `${kind} attendance register`,
        UTI: "public.comma-separated-values-text",
      });
    } catch (error) {
      Alert.alert("Export failed", (error as Error).message);
    }
  };

  const renderStats = (
    counts: Record<AttendanceStatus, number>,
    total: number,
    label: string,
  ) => (
    <View style={styles.statsGrid}>
      {STATUS_OPTIONS.map((option) => {
        const count = counts[option.value];
        return (
          <StatCard
            key={option.value}
            label={option.value}
            value={count}
            color={option.color}
          />
        );
      })}
      <Text style={styles.statsNote}>
        {counts.Present} present · {total ? Math.round((counts.Present / total) * 100) : 0}% of {label}
      </Text>
    </View>
  );

  const renderTrend = (data: Point[], title: string, error: string) => (
    <Card>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardSubtitle}>Daily attendance rate · last 14 recorded days</Text>
      {error ? <Text style={styles.errorText}>{error}</Text> : <TrendChart data={data} />}
    </Card>
  );

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.intro}>
        <Text style={styles.eyebrow}>ACADEMICS</Text>
        <Text style={styles.title}>Attendance</Text>
        <Text style={styles.subtitle}>
          Mark and monitor daily attendance across classes, sections and staff.
        </Text>
      </View>

      {isSchoolAdmin && (
        <View style={styles.tabs}>
          {(["Students", "Staff"] as const).map((tab) => (
            <Pressable
              key={tab}
              onPress={() => setActiveTab(tab)}
              accessibilityRole="button"
              accessibilityState={{ selected: activeTab === tab }}
              style={[styles.tab, activeTab === tab && styles.activeTab]}
            >
              <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>
                {tab === "Students" ? "Student Attendance" : "Staff Attendance"}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      <Card>
        <Text style={styles.cardTitle}>Attendance date</Text>
        <View style={styles.dateRow}>
          <Input
            accessibilityLabel="Attendance date in YYYY-MM-DD format"
            placeholder="YYYY-MM-DD"
            value={date}
            onChangeText={setDate}
            autoCapitalize="none"
            keyboardType="numbers-and-punctuation"
            maxLength={10}
          />
          <Pressable style={styles.todayButton} onPress={() => setDate(today())}>
            <Text style={styles.todayButtonText}>Today</Text>
          </Pressable>
        </View>
      </Card>

      {activeTab === "Students" ? (
        <>
          {!!studentError && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{studentError}</Text>
              <Pressable onPress={() => void loadData()} disabled={refreshing}>
                <Text style={styles.retryText}>{refreshing ? "Loading..." : "Retry"}</Text>
              </Pressable>
            </View>
          )}
          {renderStats(studentCounts, filteredStudents.length, "students")}
          {renderTrend(studentTrend, "Student Attendance Trend", studentLoading ? "Loading attendance trend..." : "")}
          <Card>
            <View style={styles.panelHeader}>
              <View style={styles.flex}>
                <Text style={styles.cardTitle}>Daily Attendance Register</Text>
                <Text style={styles.cardSubtitle}>{filteredStudents.length} students · {date}</Text>
              </View>
              <Pressable style={styles.exportButton} onPress={() => void exportRegister("Students")}>
                <Text style={styles.exportText}>Export CSV</Text>
              </Pressable>
            </View>
            <Input
              placeholder="Search name, roll or admission no."
              value={studentSearch}
              onChangeText={setStudentSearch}
              autoCapitalize="none"
            />
            <Text style={styles.filterLabel}>Class</Text>
            <FilterChips
              values={classOptions}
              selected={selectedClass}
              onSelect={(value) => {
                setSelectedClass(value);
                setSelectedSection("All");
              }}
            />
            <Text style={styles.filterLabel}>Section</Text>
            <FilterChips
              values={sectionOptions}
              selected={selectedSection}
              onSelect={setSelectedSection}
            />
            {studentLoading ? (
              <ActivityIndicator color={colors.ink} style={styles.loader} />
            ) : visibleStudents.length === 0 ? (
              <Empty text={students.length ? "No students match these filters." : "No students found."} />
            ) : (
              visibleStudents.map((student) => {
                const id = studentIdOf(student);
                const name = textOf(student.name) ||
                  `${textOf(student.firstName)} ${textOf(student.lastName)}`.trim() || "—";
                const assignment = classTeacherMap[`${textOf(student.class)}__${textOf(student.section)}`];
                return (
                  <View key={id} style={styles.personRow}>
                    <View style={styles.personDetails}>
                      <Text style={styles.personName}>{name}</Text>
                      <Text style={styles.personMeta}>
                        #{textOf(student.rollNo) || "—"} · {textOf(student.class)}-{textOf(student.section)}
                      </Text>
                      <Text style={styles.personMeta}>
                        {textOf(student.admissionNo) || "—"}{student.gender ? ` · ${textOf(student.gender)}` : ""}
                      </Text>
                      {!!assignment && <Text style={styles.assignment}>{`Class Teacher: ${assignment}`}</Text>}
                    </View>
                    <PersonStatusButtons
                      value={studentMarks[id] ?? "Present"}
                      onChange={(value) => {
                        setStudentMarks((previous) => ({ ...previous, [id]: value }));
                        setSaved(false);
                      }}
                    />
                  </View>
                );
              })
            )}
            {filteredStudents.length > PAGE_SIZE && (
              <Pagination
                page={safeStudentPage}
                pages={studentPageCount}
                total={filteredStudents.length}
                onPrevious={() => setStudentPage((page) => Math.max(1, page - 1))}
                onNext={() => setStudentPage((page) => Math.min(studentPageCount, page + 1))}
              />
            )}
            {filteredStudents.length > 0 && (
              <View style={styles.footer}>
                <Text style={styles.footerSummary}>
                  {filteredStudents.length} students · P {studentCounts.Present} · A {studentCounts.Absent} · HD {studentCounts["Half Day"]} · L {studentCounts.Leave}
                </Text>
                {saved && <Text style={styles.savedText}>Attendance saved</Text>}
                <Button title="Save Student Attendance" onPress={() => void saveStudents()} loading={saving} />
              </View>
            )}
          </Card>
          <Text style={styles.tip}>
            Default status is Present. Select P, A, HD or L for each student, then save the register.
          </Text>
        </>
      ) : (
        <>
          {!!staffError && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{staffError}</Text>
              <Pressable onPress={() => void loadData()} disabled={refreshing}>
                <Text style={styles.retryText}>{refreshing ? "Loading..." : "Retry"}</Text>
              </Pressable>
            </View>
          )}
          {renderStats(staffCounts, filteredStaff.length, "staff")}
          {renderTrend(staffTrend, "Staff Attendance Trend", staffLoading ? "Loading attendance trend..." : "")}
          <Card>
            <View style={styles.panelHeader}>
              <View style={styles.flex}>
                <Text style={styles.cardTitle}>Monthly Staff Attendance</Text>
                <Text style={styles.cardSubtitle}>{new Date(selectedYear, selectedMonth - 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</Text>
              </View>
              <View style={styles.monthControls}>
                <Pressable onPress={() => changeMonth(-1)} style={styles.monthButton}>
                  <Text style={styles.monthButtonText}>‹</Text>
                </Pressable>
                <Pressable onPress={() => changeMonth(1)} style={styles.monthButton}>
                  <Text style={styles.monthButtonText}>›</Text>
                </Pressable>
              </View>
            </View>
            {monthlyLoading ? (
              <ActivityIndicator color={colors.ink} style={styles.loader} />
            ) : monthlyError ? (
              <Text style={styles.errorText}>{monthlyError}</Text>
            ) : monthlyStaff.length === 0 ? (
              <Empty text="No monthly staff attendance data found." />
            ) : (
              monthlyStaff.map((row) => (
                <View key={textOf(row.staffId)} style={styles.monthlyRow}>
                  <View style={styles.flex}>
                    <Text style={styles.personName}>{textOf(row.name) || "—"}</Text>
                    <Text style={styles.personMeta}>{textOf(row.designation || row.role) || "Staff"}</Text>
                  </View>
                  <View style={styles.monthlyStats}>
                    <Text style={styles.monthlyStat}>P {textOf(row.present) || "0"}</Text>
                    <Text style={styles.monthlyStat}>A {textOf(row.absent) || "0"}</Text>
                    <Text style={styles.monthlyStat}>L {textOf(row.leave) || "0"}</Text>
                    <Text style={styles.monthlyStat}>HD {textOf(row.halfDay) || "0"}</Text>
                    <Text style={styles.monthlyPercent}>{textOf(row.attendancePct) || "0"}%</Text>
                  </View>
                </View>
              ))
            )}
          </Card>
          <Card>
            <View style={styles.panelHeader}>
              <View style={styles.flex}>
                <Text style={styles.cardTitle}>Staff Daily Attendance</Text>
                <Text style={styles.cardSubtitle}>{filteredStaff.length} staff · {date}</Text>
              </View>
              <Pressable style={styles.exportButton} onPress={() => void exportRegister("Staff")}>
                <Text style={styles.exportText}>Export CSV</Text>
              </Pressable>
            </View>
            <Input
              placeholder="Search staff, ID or designation"
              value={staffSearch}
              onChangeText={setStaffSearch}
              autoCapitalize="none"
            />
            {staffLoading ? (
              <ActivityIndicator color={colors.ink} style={styles.loader} />
            ) : visibleStaff.length === 0 ? (
              <Empty text={staff.length ? "No staff match your search." : "No staff found."} />
            ) : (
              visibleStaff.map((member) => {
                const id = staffIdOf(member);
                return (
                  <View key={id} style={styles.personRow}>
                    <View style={styles.personDetails}>
                      <Text style={styles.personName}>{textOf(member.name) || "—"}</Text>
                      <Text style={styles.personMeta}>
                        {textOf(member.designation || member.role) || "Staff"}
                        {member.employeeId ? ` · ${textOf(member.employeeId)}` : ""}
                      </Text>
                      {!!staffAssignments[id]?.length && (
                        <Text style={styles.assignment}>{staffAssignments[id].join(" | ")}</Text>
                      )}
                    </View>
                    <PersonStatusButtons
                      value={staffMarks[id] ?? "Present"}
                      onChange={(value) => {
                        setStaffMarks((previous) => ({ ...previous, [id]: value }));
                        setStaffSaved(false);
                      }}
                    />
                  </View>
                );
              })
            )}
            {filteredStaff.length > PAGE_SIZE && (
              <Pagination
                page={safeStaffPage}
                pages={staffPageCount}
                total={filteredStaff.length}
                onPrevious={() => setStaffPage((page) => Math.max(1, page - 1))}
                onNext={() => setStaffPage((page) => Math.min(staffPageCount, page + 1))}
              />
            )}
            {filteredStaff.length > 0 && (
              <View style={styles.footer}>
                <Text style={styles.footerSummary}>
                  {filteredStaff.length} staff · P {staffCounts.Present} · A {staffCounts.Absent} · HD {staffCounts["Half Day"]} · L {staffCounts.Leave}
                </Text>
                {staffSaved && <Text style={styles.savedText}>Attendance saved</Text>}
                <Button title="Save Staff Attendance" onPress={() => void saveStaff()} loading={staffSaving} />
              </View>
            )}
          </Card>
          <Text style={styles.tip}>
            Staff attendance is saved per individual. Choose a status and save the register.
          </Text>
        </>
      )}
    </ScrollView>
  );
}

function Pagination({
  page,
  pages,
  total,
  onPrevious,
  onNext,
}: {
  page: number;
  pages: number;
  total: number;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const start = (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, total);
  return (
    <View style={styles.pagination}>
      <Text style={styles.paginationLabel}>{start}–{end} of {total}</Text>
      <Pressable
        onPress={onPrevious}
        disabled={page <= 1}
        style={[styles.pageButton, page <= 1 && styles.disabledPageButton]}
      >
        <Text style={styles.pageButtonText}>Prev</Text>
      </Pressable>
      <Text style={styles.pageNumber}>{page}/{pages}</Text>
      <Pressable
        onPress={onNext}
        disabled={page >= pages}
        style={[styles.pageButton, page >= pages && styles.disabledPageButton]}
      >
        <Text style={styles.pageButtonText}>Next</Text>
      </Pressable>
    </View>
  );
}

function trendFromRecords(records: AttendanceRecord[]): Point[] {
  const byDay: Record<string, { present: number; total: number }> = {};
  records.forEach((record) => {
    const day = attendanceDate(record.date);
    if (!day) return;
    const bucket = byDay[day] ??= { present: 0, total: 0 };
    bucket.total += 1;
    if (statusOf(record.status) === "Present") bucket.present += 1;
    else if (statusOf(record.status) === "Half Day") bucket.present += 0.5;
  });
  return Object.keys(byDay)
    .sort()
    .slice(-14)
    .map((day) => ({
      label: day.slice(5).replace("-", "/"),
      value: Math.round((byDay[day].present / byDay[day].total) * 100),
    }));
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 16, gap: 14, paddingBottom: 32 },
  intro: { gap: 3 },
  eyebrow: { color: colors.amberDark, fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  title: { color: colors.ink, fontSize: 26, fontWeight: "800" },
  subtitle: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  tabs: { flexDirection: "row", backgroundColor: "#EEEAE1", borderRadius: 12, padding: 3 },
  tab: { flex: 1, alignItems: "center", paddingHorizontal: 6, paddingVertical: 10, borderRadius: 9 },
  activeTab: { backgroundColor: "#fff" },
  tabText: { color: colors.muted, fontSize: 12, fontWeight: "600" },
  activeTabText: { color: colors.ink, fontWeight: "800" },
  cardTitle: { color: colors.ink, fontSize: 16, fontWeight: "800" },
  cardSubtitle: { color: colors.muted, fontSize: 12, marginTop: 3 },
  dateRow: { flexDirection: "row", gap: 8, alignItems: "center", marginTop: 8 },
  todayButton: { paddingHorizontal: 14, paddingVertical: 12, borderRadius: 10, backgroundColor: "#FBF1DF" },
  todayButtonText: { color: colors.amberDark, fontWeight: "800" },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  statsNote: { width: "100%", color: colors.muted, fontSize: 12, marginLeft: 2 },
  panelHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  flex: { flex: 1 },
  exportButton: { borderWidth: 1, borderColor: colors.border, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 8 },
  exportText: { color: colors.ink, fontWeight: "700", fontSize: 11 },
  filterLabel: { color: colors.muted, fontWeight: "700", fontSize: 12, marginTop: 10, marginBottom: 3 },
  filterChips: { gap: 7, paddingVertical: 4 },
  filterChip: { borderWidth: 1, borderColor: colors.border, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: "#fff" },
  selectedFilterChip: { backgroundColor: colors.ink, borderColor: colors.ink },
  filterChipText: { color: colors.muted, fontSize: 12, fontWeight: "600" },
  selectedFilterChipText: { color: "#fff" },
  loader: { marginVertical: 28 },
  personRow: { borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: 12, gap: 8 },
  personDetails: { flex: 1 },
  personName: { color: colors.ink, fontWeight: "800", fontSize: 14 },
  personMeta: { color: colors.muted, fontSize: 11, marginTop: 3 },
  assignment: { color: colors.info, fontSize: 11, marginTop: 3, fontWeight: "600" },
  statusRow: { flexDirection: "row", gap: 7 },
  statusButton: { flex: 1, minHeight: 36, borderWidth: 1.5, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  statusText: { fontSize: 12, fontWeight: "800" },
  pagination: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12, marginTop: 8 },
  paginationLabel: { color: colors.muted, fontSize: 11 },
  pageButton: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: "#fff" },
  disabledPageButton: { opacity: 0.4 },
  pageButtonText: { color: colors.ink, fontWeight: "700", fontSize: 11 },
  pageNumber: { color: colors.ink, fontWeight: "700", fontSize: 12 },
  footer: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12, marginTop: 10, gap: 10 },
  footerSummary: { color: colors.muted, fontSize: 11 },
  savedText: { color: colors.success, fontWeight: "700", fontSize: 12 },
  tip: { color: colors.muted, backgroundColor: "#F0EFEA", borderRadius: 11, padding: 13, fontSize: 12, lineHeight: 18 },
  errorBox: { borderWidth: 1, borderColor: colors.alert, backgroundColor: "#FFF1EF", borderRadius: 10, padding: 12, gap: 8 },
  errorText: { color: colors.alert, fontSize: 12 },
  retryText: { color: colors.info, fontSize: 12, fontWeight: "800" },
  monthControls: { flexDirection: "row", gap: 8 },
  monthButton: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 9, borderWidth: 1, borderColor: colors.border, backgroundColor: "#fff" },
  monthButtonText: { color: colors.ink, fontSize: 22, lineHeight: 24, fontWeight: "600" },
  monthlyRow: { borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: 11, gap: 7 },
  monthlyStats: { flexDirection: "row", flexWrap: "wrap", gap: 10, alignItems: "center" },
  monthlyStat: { color: colors.muted, fontSize: 11, fontWeight: "600" },
  monthlyPercent: { color: colors.success, fontSize: 12, fontWeight: "800" },
});
