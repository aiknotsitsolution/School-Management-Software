import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { get, send } from "../lib/api";
import { extractList, Row } from "../lib/format";
import { Button, Card, Empty, Input } from "../components/UI";
import { useAuth } from "../context/AuthContext";
import { colors } from "../theme";

type ExamStatus = "draft" | "reviewed" | "published";
type Exam = Row & {
  _id?: string;
  id?: string;
  examName?: string;
  subject?: string;
  class?: string;
  section?: string;
  date?: string;
  status?: ExamStatus;
  maxMarks?: number;
  kind?: string;
  term?: string;
};
type Student = Row & {
  _id?: string;
  admissionNo?: string;
  name?: string;
  rollNo?: string | number;
};
type MarkEntry = { marksObtained: string; remarks: string };

const CLASS_FALLBACK = [
  "Nursery", "LKG", "UKG", "1", "2", "3", "4", "5", "6", "7", "8", "9",
  "10", "11-Sci", "11-Com", "12-Sci", "12-Com",
];
const SECTIONS_FALLBACK = ["A", "B", "C"];
const text = (value: unknown) => (value == null ? "" : String(value));
const examId = (exam: Exam) => text(exam._id || exam.id);
const examName = (exam: Exam) => text(exam.examName || exam.exam || "Exam");
const studentKey = (student: Student) =>
  text(student.admissionNo || student._id);
const formatClass = (value: string) =>
  ["Nursery", "LKG", "UKG"].includes(value) ? value : `Class ${value}`;
const formatDate = (value: unknown) => {
  const raw = text(value);
  if (!raw) return "Date not set";
  const date = new Date(raw);
  return Number.isNaN(date.getTime())
    ? raw
    : date.toLocaleDateString("en-IN", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
      });
};
const statusLabel = (status: unknown) => {
  if (status === "published") return "Published";
  if (status === "reviewed") return "Reviewed";
  return "Draft";
};
const getPercentage = (obtained: number, maximum: number) =>
  maximum > 0 ? (obtained / maximum) * 100 : 0;
const getGrade = (percentage: number) => {
  if (percentage >= 90) return "A+";
  if (percentage >= 80) return "A";
  if (percentage >= 70) return "B+";
  if (percentage >= 60) return "B";
  if (percentage >= 50) return "C";
  if (percentage >= 33) return "D";
  return "F";
};

export default function MarksEntryScreen() {
  const { can } = useAuth();
  const canEnterMarks = can("marks:write");
  const canPublish = can("exams:write");
  const [exams, setExams] = useState<Exam[]>([]);
  const [masterClasses, setMasterClasses] = useState<string[]>([]);
  const [masterSections, setMasterSections] = useState<Row[]>([]);
  const [classFilter, setClassFilter] = useState("All");
  const [sectionFilter, setSectionFilter] = useState("All");
  const [exam, setExam] = useState<Exam | null>(null);
  const [filterPicker, setFilterPicker] = useState<"class" | "section" | null>(null);
  const [filterSearch, setFilterSearch] = useState("");
  const [examPickerVisible, setExamPickerVisible] = useState(false);
  const [examSearch, setExamSearch] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [students, setStudents] = useState<Student[]>([]);
  const [entries, setEntries] = useState<Record<string, MarkEntry>>({});
  const [fillValue, setFillValue] = useState("");
  const [loading, setLoading] = useState(true);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");

  const loadExams = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const [examResult, classResult, sectionResult] = await Promise.allSettled([
        get("/exams?limit=1000"),
        get("/exam-masters/classes"),
        get("/exam-masters/sections"),
      ]);
      if (examResult.status === "rejected") {
        throw examResult.reason;
      }
      const examRows = extractList(examResult.value.data).map((row) => ({
        ...row,
        id: text(row._id || row.id),
        status: (row.status || "draft") as ExamStatus,
      })) as Exam[];
      setExams(examRows);

      const masterClasses =
        classResult.status === "fulfilled"
          ? extractList(classResult.value.data)
              .map((row) => text(row.name || row.className))
              .filter(Boolean)
          : [];
      const masterSections =
        sectionResult.status === "fulfilled"
          ? extractList(sectionResult.value.data)
          : [];
      setMasterClasses(masterClasses);
      setMasterSections(masterSections);
      if (classResult.status === "rejected" || sectionResult.status === "rejected") {
        setError("Exams loaded, but some class/section filters could not be loaded.");
      }
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load scheduled examinations.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadExams();
  }, [loadExams]);

  const classOptions = useMemo(
    () =>
      [
        "All",
        ...new Set([
          ...CLASS_FALLBACK,
          ...masterClasses,
          ...exams.map((item) => text(item.class)).filter(Boolean),
        ]),
      ],
    [exams, masterClasses],
  );
  const sectionOptions = useMemo(() => {
    const classSections = masterSections
      .filter(
        (item) =>
          classFilter === "All" ||
          !item.className ||
          text(item.className) === classFilter,
      )
      .map((item) => text(item.name))
      .filter(Boolean);
    const scheduledSections = exams
      .filter(
        (item) => classFilter === "All" || text(item.class) === classFilter,
      )
      .map((item) => text(item.section))
      .filter(Boolean);
    return [
      "All",
      ...new Set([...SECTIONS_FALLBACK, ...classSections, ...scheduledSections]),
    ];
  }, [classFilter, exams, masterSections]);
  const availableExams = useMemo(
    () =>
      exams
        .filter(
          (item) =>
            (classFilter === "All" || text(item.class) === classFilter) &&
            (sectionFilter === "All" ||
              text(item.section) === sectionFilter),
        )
        .sort((a, b) => text(a.date).localeCompare(text(b.date))),
    [classFilter, exams, sectionFilter],
  );
  const pickerExams = useMemo(() => {
    const query = examSearch.trim().toLowerCase();
    if (!query) return availableExams;
    return availableExams.filter((item) =>
      [
        examName(item),
        text(item.subject),
        text(item.class),
        text(item.section),
        text(item.kind),
        text(item.term),
      ].some((value) => value.toLowerCase().includes(query)),
    );
  }, [availableExams, examSearch]);
  const pickerFilterOptions = useMemo(() => {
    const options = filterPicker === "class" ? classOptions : sectionOptions;
    const query = filterSearch.trim().toLowerCase();
    return query
      ? options.filter((option) =>
          (option === "All" ? "all" : option).toLowerCase().includes(query),
        )
      : options;
  }, [classOptions, filterPicker, filterSearch, sectionOptions]);
  const closeFilterPicker = () => {
    setFilterPicker(null);
    setFilterSearch("");
  };
  const chooseFilterOption = (value: string) => {
    if (filterPicker === "class") {
      setClassFilter(value);
      setSectionFilter("All");
    } else if (filterPicker === "section") {
      setSectionFilter(value);
    }
    setExam(null);
    setStudents([]);
    setEntries({});
    closeFilterPicker();
  };

  const loadRoster = useCallback(async (selectedExam: Exam) => {
    setRosterLoading(true);
    setError("");
    try {
      const [studentResult, marksResult] = await Promise.all([
        get(
          `/students?class=${encodeURIComponent(text(selectedExam.class))}&section=${encodeURIComponent(text(selectedExam.section))}&limit=500`,
        ),
        get(`/marks?examId=${encodeURIComponent(examId(selectedExam))}&limit=1000`),
      ]);
      const roster = extractList(studentResult.data) as Student[];
      const prefilled: Record<string, MarkEntry> = {};
      extractList(marksResult.data).forEach((mark) => {
        const key = text(mark.studentId);
        if (!key) return;
        prefilled[key] = {
          marksObtained: text(mark.marksObtained),
          remarks: text(mark.remarks),
        };
      });
      setStudents(roster);
      setEntries(prefilled);
      setStudentSearch("");
      setFillValue("");
    } catch (loadError) {
      setStudents([]);
      setEntries({});
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load the class roster and saved marks.",
      );
    } finally {
      setRosterLoading(false);
    }
  }, []);

  const selectExam = (selected: Exam) => {
    setExam(selected);
    setExamPickerVisible(false);
    void loadRoster(selected);
  };

  const filteredStudents = useMemo(() => {
    const query = studentSearch.trim().toLowerCase();
    if (!query) return students;
    return students.filter((student) =>
      [
        text(student.name),
        text(student.admissionNo),
        text(student.rollNo),
      ].some((value) => value.toLowerCase().includes(query)),
    );
  }, [studentSearch, students]);

  const stats = useMemo(() => {
    const filledStudents = students.filter(
      (student) => (entries[studentKey(student)]?.marksObtained || "").trim() !== "",
    );
    const total = filledStudents.reduce(
      (sum, student) =>
        sum + Number(entries[studentKey(student)].marksObtained || 0),
      0,
    );
    return {
      total: students.length,
      filled: filledStudents.length,
      percentage: students.length
        ? Math.round((filledStudents.length / students.length) * 100)
        : 0,
      average: filledStudents.length
        ? (total / filledStudents.length).toFixed(1)
        : "0",
    };
  }, [entries, students]);

  const updateEntry = (
    student: Student,
    field: keyof MarkEntry,
    value: string,
  ) => {
    const key = studentKey(student);
    setEntries((current) => ({
      ...current,
      [key]: {
        marksObtained: current[key]?.marksObtained || "",
        remarks: current[key]?.remarks || "",
        [field]: value,
      },
    }));
  };

  const fillAll = () => {
    const value = fillValue.trim();
    if (!value || !exam) return;
    const maximum = Number(exam.maxMarks || 0);
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0 || numeric > maximum) {
      Alert.alert("Invalid marks", `Enter a value between 0 and ${maximum}.`);
      return;
    }
    setEntries((current) => {
      const next = { ...current };
      students.forEach((student) => {
        const key = studentKey(student);
        next[key] = {
          marksObtained: value,
          remarks: current[key]?.remarks || "",
        };
      });
      return next;
    });
  };

  const saveMarks = async () => {
    if (!exam || !canEnterMarks) return;
    const payload = students
      .filter(
        (student) =>
          (entries[studentKey(student)]?.marksObtained || "").trim() !== "",
      )
      .map((student) => {
        const entry = entries[studentKey(student)];
        return {
          studentId: studentKey(student),
          marksObtained: Number(entry.marksObtained),
          remarks: entry.remarks.trim() || undefined,
        };
      });
    if (!payload.length) {
      Alert.alert("Nothing to save", "Enter marks for at least one student.");
      return;
    }
    const maximum = Number(exam.maxMarks || 0);
    const invalid = payload.find(
      (item) =>
        !Number.isFinite(item.marksObtained) ||
        item.marksObtained < 0 ||
        item.marksObtained > maximum,
    );
    if (invalid) {
      Alert.alert("Invalid marks", `Marks must be between 0 and ${maximum}.`);
      return;
    }
    setSaving(true);
    try {
      const result = await send("/marks", "POST", {
        examId: examId(exam),
        entries: payload,
      });
      const savedCount = Array.isArray(result.data)
        ? result.data.length
        : payload.length;
      Alert.alert("Marks saved", `${savedCount} student mark(s) saved.`);
    } catch (saveError) {
      Alert.alert(
        "Could not save marks",
        saveError instanceof Error ? saveError.message : "Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const updateExamStatus = async (status: ExamStatus) => {
    if (!exam || !canPublish) return;
    const isPublish = status === "published";
    Alert.alert(
      isPublish ? "Publish results?" : "Unpublish results?",
      isPublish
        ? `Publish results for ${examName(exam)}? Students will be able to see their results and marks will be locked.`
        : `Unpublish results for ${examName(exam)}? Marks become editable and students will no longer see the results.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: isPublish ? "Publish" : "Unpublish",
          style: isPublish ? "default" : "destructive",
          onPress: () => {
            void (async () => {
              setPublishing(true);
              try {
                let updated = exam;
                if (isPublish && exam.status === "draft") {
                  const reviewed = await send(
                    `/exams/${encodeURIComponent(examId(exam))}/status`,
                    "PATCH",
                    { status: "reviewed" },
                  );
                  updated = {
                    ...exam,
                    ...(reviewed.data as Row),
                    status: "reviewed",
                  };
                }
                const result = await send(
                  `/exams/${encodeURIComponent(examId(exam))}/status`,
                  "PATCH",
                  { status },
                );
                const next = {
                  ...updated,
                  ...(result.data as Row),
                  status,
                } as Exam;
                setExam(next);
                setExams((current) =>
                  current.map((item) =>
                    examId(item) === examId(next) ? next : item,
                  ),
                );
                Alert.alert(
                  isPublish ? "Results published" : "Results unpublished",
                  isPublish
                    ? "Students can now view their marks."
                    : "Marks can be edited again.",
                );
              } catch (statusError) {
                Alert.alert(
                  "Could not update result status",
                  statusError instanceof Error
                    ? statusError.message
                    : "Please try again.",
                );
              } finally {
                setPublishing(false);
              }
            })();
          },
        },
      ],
    );
  };

  const published = exam?.status === "published";
  const maximum = Number(exam?.maxMarks || 0);
  const examDisplay = (item: Exam) =>
    `${examName(item)} · ${text(item.subject) || "Subject"} · ${formatClass(text(item.class))}${item.section ? `-${text(item.section)}` : ""}`;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void loadExams(true)}
        />
      }
    >
      <View style={styles.intro}>
        <View style={styles.headingIcon}>
          <Ionicons name="create-outline" size={22} color={colors.ink} />
        </View>
        <View style={styles.introCopy}>
          <Text style={styles.eyebrow}>ACADEMICS</Text>
          <Text style={styles.title}>Marks Entry</Text>
          <Text style={styles.subtitle}>
            Record and publish student marks for a scheduled examination.
          </Text>
        </View>
      </View>

      {!!error && (
        <View style={styles.errorBox}>
          <Ionicons name="warning-outline" size={18} color={colors.alert} />
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={() => void loadExams(true)} disabled={refreshing}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      )}

      <Card style={styles.filterCard}>
        <View style={styles.filterHeading}>
          <View style={styles.filterHeadingIcon}>
            <Ionicons name="options-outline" size={17} color={colors.info} />
          </View>
          <View style={styles.introCopy}>
            <Text style={styles.cardTitle}>Select Examination</Text>
            <Text style={styles.filterHint}>Filter the roster and choose an exam</Text>
          </View>
        </View>
        <View style={styles.searchWrap}>
          <Ionicons name="search-outline" size={17} color={colors.muted} />
          <Input
            style={styles.searchInput}
            value={studentSearch}
            onChangeText={setStudentSearch}
            placeholder="Search students…"
            autoCapitalize="none"
          />
          {studentSearch ? (
            <Pressable onPress={() => setStudentSearch("")} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>
        <View style={styles.filterSelectRow}>
          <Pressable
            style={styles.filterSelect}
            onPress={() => {
              setFilterSearch("");
              setFilterPicker("class");
            }}
          >
            <View style={styles.filterSelectCopy}>
              <Text style={styles.filterSelectCaption}>CLASS</Text>
              <Text style={styles.filterSelectValue} numberOfLines={1}>
                {classFilter === "All" ? "All Classes" : formatClass(classFilter)}
              </Text>
            </View>
            <Ionicons name="chevron-down" size={16} color={colors.muted} />
          </Pressable>
          <Pressable
            style={styles.filterSelect}
            onPress={() => {
              setFilterSearch("");
              setFilterPicker("section");
            }}
          >
            <View style={styles.filterSelectCopy}>
              <Text style={styles.filterSelectCaption}>SECTION</Text>
              <Text style={styles.filterSelectValue} numberOfLines={1}>
                {sectionFilter === "All" ? "All Sections" : `Section ${sectionFilter}`}
              </Text>
            </View>
            <Ionicons name="chevron-down" size={16} color={colors.muted} />
          </Pressable>
        </View>
        <Text style={styles.filterLabel}>Examination</Text>
        <Pressable
          style={styles.examPicker}
          onPress={() => setExamPickerVisible(true)}
          disabled={loading || !availableExams.length}
        >
          <View style={styles.examPickerIcon}>
            <Ionicons name="document-text-outline" size={18} color={colors.info} />
          </View>
          <View style={styles.examPickerCopy}>
            <Text style={styles.examPickerCaption}>Selected exam</Text>
            <Text style={styles.examPickerValue} numberOfLines={2}>
              {exam ? examDisplay(exam) : "Tap to choose a scheduled exam"}
            </Text>
          </View>
          <Ionicons name="chevron-down" size={18} color={colors.muted} />
        </Pressable>
        {loading ? (
          <ActivityIndicator color={colors.ink} style={styles.inlineLoading} />
        ) : availableExams.length === 0 ? (
          <Text style={styles.helperText}>
            No scheduled exams match these filters.
          </Text>
        ) : null}
      </Card>

      {!exam ? (
        <Card style={styles.emptyCard}>
          <View style={styles.emptyIcon}>
            <Ionicons name="clipboard-outline" size={27} color={colors.info} />
          </View>
          <Text style={styles.emptyTitle}>No examination selected</Text>
          <Text style={styles.emptyText}>
            Choose a class, section and exam above to load its student roster.
          </Text>
        </Card>
      ) : (
        <>
          <View style={styles.examHero}>
            <View style={styles.examHeroTop}>
              <View style={styles.examHeroIcon}>
                <Ionicons name="school-outline" size={21} color="#fff" />
              </View>
              <View style={styles.examHeroCopy}>
                <Text style={styles.examHeroTitle}>{examName(exam)}</Text>
                <Text style={styles.examHeroSubtitle}>
                  {formatClass(text(exam.class))}
                  {exam.section ? ` · Section ${text(exam.section)}` : ""} ·{" "}
                  {text(exam.subject) || "Subject"}
                </Text>
              </View>
              <View
                style={[
                  styles.statusPill,
                  published
                    ? styles.publishedStatus
                    : exam.status === "reviewed"
                      ? styles.reviewedStatus
                      : styles.draftStatus,
                ]}
              >
                <Text
                  style={[
                    styles.statusText,
                    published
                      ? styles.publishedStatusText
                      : exam.status === "reviewed"
                        ? styles.reviewedStatusText
                        : styles.draftStatusText,
                  ]}
                >
                  {statusLabel(exam.status)}
                </Text>
              </View>
            </View>
            <View style={styles.examHeroMeta}>
              <View style={styles.heroMetaItem}>
                <Ionicons name="calendar-outline" size={14} color="#D8E5F4" />
                <Text style={styles.heroMetaText}>{formatDate(exam.date)}</Text>
              </View>
              <View style={styles.heroMetaItem}>
                <Ionicons name="ribbon-outline" size={14} color="#D8E5F4" />
                <Text style={styles.heroMetaText}>Maximum {maximum} marks</Text>
              </View>
            </View>
          </View>

          <View style={styles.statsGrid}>
            <StatTile
              icon="people-outline"
              label="Students"
              value={stats.total}
              sub={`${formatClass(text(exam.class))}${exam.section ? `-${text(exam.section)}` : ""}`}
              color={colors.info}
            />
            <StatTile
              icon="checkmark-circle-outline"
              label="Filled"
              value={`${stats.filled}/${stats.total}`}
              sub={`${stats.percentage}% entered`}
              color={colors.amberDark}
            />
            <StatTile
              icon="analytics-outline"
              label="Average"
              value={stats.average}
              sub={`Max ${maximum} marks`}
              color={colors.success}
            />
            <StatTile
              icon={published ? "lock-closed-outline" : "create-outline"}
              label="Entry"
              value={published ? "Locked" : "Editable"}
              sub={statusLabel(exam.status)}
              color={published ? colors.alert : colors.info}
            />
          </View>

          <Card style={styles.rosterCard}>
            <View style={styles.rosterHeading}>
              <View style={styles.rosterHeadingCopy}>
                <Text style={styles.cardTitle}>Student Marks</Text>
                <Text style={styles.cardSubtitle}>
                  {text(exam.subject) || "Subject"} · Enter marks out of {maximum}
                </Text>
              </View>
              {published ? (
                <View style={styles.lockBadge}>
                  <Ionicons name="lock-closed" size={13} color={colors.alert} />
                  <Text style={styles.lockBadgeText}>Locked</Text>
                </View>
              ) : null}
            </View>

            {!published && canEnterMarks ? (
              <View style={styles.fillAllRow}>
                <Input
                  style={styles.fillAllInput}
                  value={fillValue}
                  onChangeText={setFillValue}
                  placeholder={`Fill all (0-${maximum})`}
                  keyboardType="decimal-pad"
                />
                <Pressable style={styles.fillAllButton} onPress={fillAll}>
                  <Ionicons name="arrow-down" size={16} color="#fff" />
                  <Text style={styles.fillAllButtonText}>Apply all</Text>
                </Pressable>
              </View>
            ) : null}

            {published ? (
              <View style={styles.lockedNotice}>
                <Ionicons name="lock-closed-outline" size={22} color={colors.alert} />
                <Text style={styles.lockedTitle}>Results are published</Text>
                <Text style={styles.helperText}>
                  Marks are read-only while published. Unpublish to revise marks.
                </Text>
              </View>
            ) : null}
            {rosterLoading ? (
              <View style={styles.rosterLoading}>
                <ActivityIndicator color={colors.ink} />
                <Text style={styles.helperText}>Loading class roster…</Text>
              </View>
            ) : students.length === 0 ? (
              <Empty text="No students are enrolled in this class and section." />
            ) : filteredStudents.length === 0 ? (
              <Empty text="No students match your search." />
            ) : (
              <View style={styles.studentList}>
                {filteredStudents.map((student, index) => {
                  const key = studentKey(student);
                  const value = entries[key]?.marksObtained || "";
                  const parsed = Number(value);
                  const hasValue = value.trim() !== "" && Number.isFinite(parsed);
                  const valid = hasValue && parsed >= 0 && parsed <= maximum;
                  const percentage = valid
                    ? getPercentage(parsed, maximum)
                    : null;
                  const grade =
                    valid && percentage !== null ? getGrade(percentage) : "";
                  return (
                    <View
                      key={key || `student-${index}`}
                      style={styles.studentCard}
                    >
                      <View style={styles.studentTop}>
                        <View style={styles.studentAvatar}>
                          <Text style={styles.studentInitial}>
                            {text(student.name).trim().charAt(0).toUpperCase() || "S"}
                          </Text>
                        </View>
                        <View style={styles.studentIdentity}>
                          <Text style={styles.studentName} numberOfLines={1}>
                            {text(student.name) || "Student"}
                          </Text>
                          <Text style={styles.studentMeta} numberOfLines={1}>
                            Adm. {text(student.admissionNo) || "—"} · Roll{" "}
                            {text(student.rollNo) || "—"}
                          </Text>
                        </View>
                        {hasValue ? (
                          <View
                            style={[
                              styles.gradeBadge,
                              !valid && styles.invalidGradeBadge,
                              valid && percentage !== null && percentage < 33
                                ? styles.failedGradeBadge
                                : null,
                            ]}
                          >
                            <Text
                              style={[
                                styles.gradeBadgeText,
                                !valid && styles.invalidGradeText,
                                valid && percentage !== null && percentage < 33
                                  ? styles.failedGradeText
                                  : null,
                              ]}
                            >
                              {valid ? grade : "Check"}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                      <View style={styles.marksEntryRow}>
                        <View style={styles.marksField}>
                          <Text style={styles.fieldLabel}>Marks obtained</Text>
                          <Input
                            style={[
                              styles.marksInput,
                              hasValue && !valid && styles.invalidInput,
                            ]}
                            value={value}
                            onChangeText={(next) =>
                              updateEntry(student, "marksObtained", next)
                            }
                            placeholder={`0-${maximum}`}
                            keyboardType="decimal-pad"
                            editable={canEnterMarks && !published}
                            maxLength={8}
                            accessibilityLabel={`Marks for ${text(student.name)}`}
                          />
                        </View>
                        <View style={styles.marksPreview}>
                          <Text style={styles.fieldLabel}>Percentage</Text>
                          <Text style={styles.percentageValue}>
                            {percentage === null
                              ? "—"
                              : `${percentage.toFixed(1)}%`}
                          </Text>
                        </View>
                      </View>
                      {!valid && hasValue ? (
                        <Text style={styles.validationHint}>
                          Marks must be between 0 and {maximum}.
                        </Text>
                      ) : null}
                      {!published && canEnterMarks ? (
                        <Input
                          style={styles.remarksInput}
                          value={entries[key]?.remarks || ""}
                          onChangeText={(next) =>
                            updateEntry(student, "remarks", next)
                          }
                          placeholder="Remarks (optional)"
                          maxLength={250}
                        />
                      ) : null}
                    </View>
                  );
                })}
              </View>
            )}

            {canEnterMarks && !published && students.length > 0 ? (
              <Button
                title={saving ? "Saving marks…" : "Save Marks"}
                onPress={() => void saveMarks()}
                loading={saving}
              />
            ) : null}
            {!published && canPublish ? (
              <Button
                title={publishing ? "Publishing…" : "Publish Result"}
                onPress={() => void updateExamStatus("published")}
                loading={publishing}
                variant="ghost"
              />
            ) : null}
            {published && canPublish ? (
              <Button
                title={publishing ? "Unpublishing…" : "Unpublish Results"}
                onPress={() => void updateExamStatus("reviewed")}
                loading={publishing}
                variant="ghost"
              />
            ) : null}
          </Card>
        </>
      )}

      <Modal
        visible={examPickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setExamPickerVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setExamPickerVisible(false)}
          />
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <View style={styles.introCopy}>
                <Text style={styles.modalTitle}>Choose examination</Text>
                <Text style={styles.helperText}>
                  {availableExams.length} scheduled exam
                  {availableExams.length === 1 ? "" : "s"}
                </Text>
              </View>
              <Pressable onPress={() => setExamPickerVisible(false)} hitSlop={10}>
                <Ionicons name="close" size={22} color={colors.ink} />
              </Pressable>
            </View>
            <View style={styles.modalSearch}>
              <Ionicons name="search-outline" size={17} color={colors.muted} />
              <Input
                style={styles.searchInput}
                value={examSearch}
                onChangeText={setExamSearch}
                placeholder="Search exam, subject or class"
                autoCapitalize="none"
              />
            </View>
            <ScrollView
              contentContainerStyle={styles.examOptions}
              keyboardShouldPersistTaps="handled"
            >
              {pickerExams.map((item) => (
                <Pressable
                  key={examId(item)}
                  style={styles.examOption}
                  onPress={() => selectExam(item)}
                >
                  <View style={styles.examOptionIcon}>
                    <Ionicons
                      name="document-text-outline"
                      size={18}
                      color={colors.info}
                    />
                  </View>
                  <View style={styles.examOptionCopy}>
                    <Text style={styles.examOptionTitle}>{examName(item)}</Text>
                    <Text style={styles.examOptionMeta}>
                      {text(item.subject) || "Subject"} ·{" "}
                      {formatClass(text(item.class))}
                      {item.section ? `-${text(item.section)}` : ""} ·{" "}
                      {formatDate(item.date)}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.examOptionStatus,
                      item.status === "published" && styles.examPublishedText,
                    ]}
                  >
                    {statusLabel(item.status)}
                  </Text>
                </Pressable>
              ))}
              {pickerExams.length === 0 ? (
                <Empty text="No exams found for this search and filter." />
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
      <Modal
        visible={filterPicker !== null}
        transparent
        animationType="slide"
        onRequestClose={closeFilterPicker}
      >
        <View style={styles.modalBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={closeFilterPicker}
          />
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <View style={styles.introCopy}>
                <Text style={styles.modalTitle}>
                  Choose {filterPicker || "filter"}
                </Text>
                <Text style={styles.helperText}>
                  {pickerFilterOptions.length} option
                  {pickerFilterOptions.length === 1 ? "" : "s"}
                </Text>
              </View>
              <Pressable onPress={closeFilterPicker} hitSlop={10}>
                <Ionicons name="close" size={22} color={colors.ink} />
              </Pressable>
            </View>
            <View style={styles.modalSearch}>
              <Ionicons name="search-outline" size={17} color={colors.muted} />
              <Input
                style={styles.searchInput}
                value={filterSearch}
                onChangeText={setFilterSearch}
                placeholder={`Search ${filterPicker || "options"}`}
                autoCapitalize="none"
              />
            </View>
            <ScrollView
              contentContainerStyle={styles.examOptions}
              keyboardShouldPersistTaps="handled"
            >
              {pickerFilterOptions.map((value) => {
                const selected =
                  filterPicker === "class"
                    ? classFilter === value
                    : sectionFilter === value;
                const label =
                  value === "All"
                    ? filterPicker === "class"
                      ? "All Classes"
                      : "All Sections"
                    : filterPicker === "class"
                      ? formatClass(value)
                      : `Section ${value}`;
                return (
                  <Pressable
                    key={value}
                    style={[
                      styles.examOption,
                      selected && styles.filterOptionSelected,
                    ]}
                    onPress={() => chooseFilterOption(value)}
                  >
                    <View style={styles.examOptionIcon}>
                      <Ionicons
                        name={
                          filterPicker === "class"
                            ? "school-outline"
                            : "people-outline"
                        }
                        size={18}
                        color={colors.info}
                      />
                    </View>
                    <View style={styles.examOptionCopy}>
                      <Text style={styles.examOptionTitle}>{label}</Text>
                    </View>
                    {selected ? (
                      <Ionicons
                        name="checkmark-circle"
                        size={20}
                        color={colors.info}
                      />
                    ) : null}
                  </Pressable>
                );
              })}
              {pickerFilterOptions.length === 0 ? (
                <Empty text={`No ${filterPicker || ""} options found.`} />
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function StatTile({
  icon,
  label,
  value,
  sub,
  color,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string | number;
  sub: string;
  color: string;
}) {
  return (
    <Card style={styles.statTile}>
      <View style={[styles.statIcon, { backgroundColor: `${color}18` }]}>
        <Ionicons name={icon} size={17} color={color} />
      </View>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color }]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.statSub} numberOfLines={1}>
        {sub}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 15, gap: 13, paddingBottom: 35 },
  intro: { flexDirection: "row", alignItems: "center", gap: 11 },
  introCopy: { flex: 1, gap: 2 },
  headingIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.amber,
  },
  eyebrow: {
    color: colors.amberDark,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1,
  },
  title: { color: colors.ink, fontSize: 21, fontWeight: "900" },
  subtitle: { color: colors.muted, fontSize: 11, lineHeight: 16 },
  cardTitle: { color: colors.ink, fontSize: 14, fontWeight: "900" },
  cardSubtitle: { color: colors.muted, fontSize: 10, marginTop: 3 },
  filterCard: { padding: 13, gap: 3 },
  filterHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginBottom: 4,
  },
  filterHeadingIcon: {
    width: 33,
    height: 33,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: "#EAF2F9",
  },
  filterHint: { color: colors.muted, fontSize: 9, marginTop: 2 },
  filterLabel: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "800",
    marginTop: 8,
    marginBottom: 2,
  },
  chips: { gap: 6, paddingVertical: 4 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: "#fff",
  },
  selectedChip: { borderColor: colors.ink, backgroundColor: colors.ink },
  chipText: { color: colors.muted, fontSize: 10, fontWeight: "700" },
  selectedChipText: { color: "#fff" },
  filterSelectRow: { flexDirection: "row", gap: 8, marginTop: 5 },
  filterSelect: {
    minHeight: 49,
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 5,
    paddingHorizontal: 9,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: "#fff",
  },
  filterSelectCopy: { flex: 1, gap: 3 },
  filterSelectCaption: {
    color: colors.muted,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  filterSelectValue: { color: colors.ink, fontSize: 10, fontWeight: "800" },
  examPicker: {
    minHeight: 61,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    padding: 9,
    marginTop: 4,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#fff",
  },
  examPickerIcon: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: "#EAF2F9",
  },
  examPickerCopy: { flex: 1, gap: 3 },
  examPickerCaption: { color: colors.muted, fontSize: 9 },
  examPickerValue: { color: colors.ink, fontSize: 11, fontWeight: "800" },
  inlineLoading: { marginVertical: 7 },
  helperText: { color: colors.muted, fontSize: 10, lineHeight: 15 },
  emptyCard: { alignItems: "center", paddingVertical: 23, gap: 7 },
  emptyIcon: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    backgroundColor: "#EAF2F9",
  },
  emptyTitle: { color: colors.ink, fontSize: 13, fontWeight: "800" },
  emptyText: {
    maxWidth: 260,
    color: colors.muted,
    fontSize: 11,
    lineHeight: 16,
    textAlign: "center",
  },
  examHero: {
    gap: 12,
    padding: 14,
    borderRadius: 15,
    backgroundColor: colors.ink,
  },
  examHeroTop: { flexDirection: "row", alignItems: "center", gap: 9 },
  examHeroIcon: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#FFFFFF20",
  },
  examHeroCopy: { flex: 1, gap: 3 },
  examHeroTitle: { color: "#fff", fontSize: 14, fontWeight: "900" },
  examHeroSubtitle: { color: "#D8E5F4", fontSize: 10, lineHeight: 15 },
  examHeroMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#FFFFFF25",
  },
  heroMetaItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  heroMetaText: { color: "#E6EDF7", fontSize: 10, fontWeight: "700" },
  statusPill: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 12 },
  statusText: { fontSize: 9, fontWeight: "900" },
  draftStatus: { backgroundColor: "#FFFFFF24" },
  draftStatusText: { color: "#F2F4F7" },
  reviewedStatus: { backgroundColor: "#D8EAFE" },
  reviewedStatusText: { color: colors.info },
  publishedStatus: { backgroundColor: "#DDF3E5" },
  publishedStatusText: { color: colors.success },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  statTile: { width: "48.5%", minHeight: 104, padding: 10, gap: 2 },
  statIcon: {
    width: 29,
    height: 29,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
    marginBottom: 3,
  },
  statLabel: { color: colors.muted, fontSize: 9, fontWeight: "700" },
  statValue: { fontSize: 19, fontWeight: "900" },
  statSub: { color: colors.muted, fontSize: 9 },
  rosterCard: { padding: 12, gap: 11 },
  rosterHeading: { flexDirection: "row", alignItems: "center", gap: 8 },
  rosterHeadingCopy: { flex: 1 },
  lockBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: "#FFF1EF",
  },
  lockBadgeText: { color: colors.alert, fontSize: 9, fontWeight: "800" },
  fillAllRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  fillAllInput: { flex: 1, minHeight: 39, paddingVertical: 8, fontSize: 11 },
  fillAllButton: {
    minHeight: 39,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: 10,
    borderRadius: 9,
    backgroundColor: colors.ink,
  },
  fillAllButtonText: { color: "#fff", fontSize: 10, fontWeight: "800" },
  searchWrap: {
    minHeight: 41,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 9,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: "#fff",
  },
  searchInput: { flex: 1, minHeight: 39, borderWidth: 0, paddingHorizontal: 0, paddingVertical: 7, fontSize: 11 },
  lockedNotice: {
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 20,
    borderRadius: 12,
    backgroundColor: "#FFF7F5",
  },
  lockedTitle: { color: colors.ink, fontSize: 13, fontWeight: "800" },
  rosterLoading: { alignItems: "center", gap: 8, paddingVertical: 25 },
  studentList: { gap: 8 },
  studentCard: {
    gap: 9,
    padding: 10,
    borderWidth: 1,
    borderColor: "#E9EDF2",
    borderRadius: 12,
    backgroundColor: "#FCFCFD",
  },
  studentTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  studentAvatar: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
    backgroundColor: "#EAF2F9",
  },
  studentInitial: { color: colors.info, fontSize: 13, fontWeight: "900" },
  studentIdentity: { flex: 1, gap: 3 },
  studentName: { color: colors.ink, fontSize: 12, fontWeight: "900" },
  studentMeta: { color: colors.muted, fontSize: 9 },
  gradeBadge: {
    minWidth: 35,
    alignItems: "center",
    paddingHorizontal: 7,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: "#E8F4EC",
  },
  gradeBadgeText: { color: colors.success, fontSize: 10, fontWeight: "900" },
  failedGradeBadge: { backgroundColor: "#FFF1EF" },
  failedGradeText: { color: colors.alert },
  invalidGradeBadge: { backgroundColor: "#FFF1EF" },
  invalidGradeText: { color: colors.alert },
  marksEntryRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  marksField: { flex: 1 },
  fieldLabel: { color: colors.muted, fontSize: 9, fontWeight: "700", marginBottom: 4 },
  marksInput: { minHeight: 38, paddingVertical: 7, fontSize: 11 },
  invalidInput: { borderColor: colors.alert },
  marksPreview: {
    width: 75,
    minHeight: 38,
    justifyContent: "center",
    paddingHorizontal: 9,
    borderRadius: 9,
    backgroundColor: "#F0F3F8",
  },
  percentageValue: { color: colors.ink, fontSize: 12, fontWeight: "900" },
  validationHint: { color: colors.alert, fontSize: 9 },
  remarksInput: { minHeight: 37, paddingVertical: 7, fontSize: 10 },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    padding: 10,
    borderWidth: 1,
    borderColor: "#F1C8C3",
    borderRadius: 10,
    backgroundColor: "#FFF1EF",
  },
  errorText: { flex: 1, color: colors.alert, fontSize: 10, lineHeight: 15 },
  retryText: { color: colors.info, fontSize: 10, fontWeight: "900" },
  modalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(15, 23, 42, 0.45)",
  },
  modalSheet: {
    maxHeight: "82%",
    paddingBottom: 12,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    backgroundColor: colors.paper,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: { color: colors.ink, fontSize: 15, fontWeight: "900" },
  modalSearch: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    margin: 12,
    paddingHorizontal: 9,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: "#fff",
  },
  examOptions: { paddingHorizontal: 12, paddingBottom: 12, gap: 7 },
  examOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 11,
    backgroundColor: "#fff",
  },
  filterOptionSelected: { borderColor: colors.info, backgroundColor: "#F3F8FC" },
  examOptionIcon: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
    backgroundColor: "#EAF2F9",
  },
  examOptionCopy: { flex: 1, gap: 3 },
  examOptionTitle: { color: colors.ink, fontSize: 11, fontWeight: "900" },
  examOptionMeta: { color: colors.muted, fontSize: 9, lineHeight: 14 },
  examOptionStatus: { color: colors.muted, fontSize: 8, fontWeight: "800" },
  examPublishedText: { color: colors.success },
});
