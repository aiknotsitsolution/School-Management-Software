import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { get, send } from "../lib/api";
import { extractList, Row } from "../lib/format";
import { Button, Card, Empty, Input, StatCard } from "../components/UI";
import { useAuth } from "../context/AuthContext";
import { colors } from "../theme";

type ExamStatus = "draft" | "reviewed" | "published";
type ExamKind =
  | "unit_test"
  | "fa"
  | "sa"
  | "term"
  | "quiz"
  | "practical"
  | "other";
type Exam = Row & {
  _id?: string;
  id?: string;
  examName?: string;
  exam?: string;
  class?: string;
  section?: string;
  subject?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  time?: string;
  room?: string;
  maxMarks?: number;
  passingMarks?: number | null;
  session?: string;
  status?: ExamStatus;
  kind?: ExamKind;
  term?: string;
};
type MasterItem = Row & {
  _id?: string;
  name?: string;
  label?: string;
  startTime?: string;
  endTime?: string;
};
type FormValues = {
  examTypeId: string;
  exam: string;
  classId: string;
  class: string;
  sectionId: string;
  section: string;
  subjectId: string;
  subject: string;
  date: string;
  timeSlotId: string;
  startTime: string;
  endTime: string;
  roomId: string;
  room: string;
  maxMarks: string;
  passingMarks: string;
  session: string;
  kind: ExamKind;
  term: string;
  cceTool: string;
};
type RollupStudent = Row & {
  studentId?: string;
  rank?: number;
  obtained?: number;
  max?: number;
  pct?: number;
  grade?: string;
  failedSubjects?: number;
};
type TermRollup = Row & {
  students?: RollupStudent[];
  classAveragePct?: number;
  totalStudents?: number;
  exams?: Row[];
  class?: string;
  section?: string;
  term?: string;
  session?: string;
};

const CLASS_FALLBACK = [
  "Nursery", "LKG", "UKG", "1", "2", "3", "4", "5", "6", "7", "8", "9",
  "10", "11-Sci", "11-Com", "12-Sci", "12-Com",
];
const SECTION_FALLBACK = ["A", "B", "C"];
const KINDS: { value: ExamKind; label: string }[] = [
  { value: "unit_test", label: "Unit Test" },
  { value: "fa", label: "FA" },
  { value: "sa", label: "SA" },
  { value: "term", label: "Term" },
  { value: "quiz", label: "Quiz" },
  { value: "practical", label: "Practical" },
  { value: "other", label: "Other" },
];
const TERMS = ["Term 1", "Term 2", "Final"];
const STATUSES: { value: "All" | ExamStatus; label: string }[] = [
  { value: "All", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "reviewed", label: "Reviewed" },
  { value: "published", label: "Published" },
];
const MASTER_KINDS = ["exam-types", "classes", "sections", "subjects", "time-slots", "rooms"] as const;
type MasterKind = (typeof MASTER_KINDS)[number];
type MasterCatalog = Record<MasterKind, MasterItem[]>;
const EMPTY_CATALOG: MasterCatalog = {
  "exam-types": [],
  classes: [],
  sections: [],
  subjects: [],
  "time-slots": [],
  rooms: [],
};

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const textOf = (value: unknown) => (value == null ? "" : String(value));
const examId = (exam: Exam) => textOf(exam._id || exam.id);
const examName = (exam: Exam) => textOf(exam.examName || exam.exam || "Exam");
const statusText = (status: unknown) => {
  const key = textOf(status || "draft");
  return ({ draft: "Draft", reviewed: "Reviewed", published: "Published" } as Record<string, string>)[key] ?? key;
};
const kindText = (kind: unknown) =>
  KINDS.find((item) => item.value === kind)?.label ?? textOf(kind);
const formatClass = (value: string) =>
  ["Nursery", "LKG", "UKG"].includes(value) ? value : `Class ${value}`;
const formatDate = (value: unknown) => {
  const raw = textOf(value);
  if (!raw) return "—";
  const date = new Date(raw);
  return Number.isNaN(date.getTime())
    ? raw
    : date.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
};
const isValidDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};
const emptyForm = (): FormValues => ({
  examTypeId: "",
  exam: "",
  classId: "",
  class: "",
  sectionId: "",
  section: "",
  subjectId: "",
  subject: "",
  date: "",
  timeSlotId: "",
  startTime: "",
  endTime: "",
  roomId: "",
  room: "",
  maxMarks: "80",
  passingMarks: "",
  session: "",
  kind: "other",
  term: "",
  cceTool: "",
});
const normalizeExam = (row: Exam): Exam => ({
  ...row,
  id: row._id || row.id,
  examName: examName(row),
  status: row.status || "draft",
  kind: row.kind || "other",
  time: row.time || [row.startTime, row.endTime].filter(Boolean).join(" – ") || "—",
  room: row.room || "Room to be announced",
});

function ChoiceChips({
  items,
  selected,
  onSelect,
  allLabel,
}: {
  items: string[];
  selected: string;
  onSelect: (value: string) => void;
  allLabel?: string;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
      {items.map((item) => (
        <Pressable
          key={item}
          onPress={() => onSelect(item)}
          accessibilityRole="button"
          accessibilityState={{ selected: selected === item }}
          style={[styles.chip, selected === item && styles.selectedChip]}
        >
          <Text style={[styles.chipText, selected === item && styles.selectedChipText]}>
            {item === "All" ? allLabel ?? "All" : item}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function MasterChoices({
  items,
  onSelect,
  display,
}: {
  items: MasterItem[];
  onSelect: (item: MasterItem) => void;
  display?: (item: MasterItem) => string;
}) {
  if (!items.length) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
      {items.slice(0, 30).map((item, index) => {
        const label = display ? display(item) : textOf(item.name);
        return (
          <Pressable key={textOf(item._id) || `${label}-${index}`} onPress={() => onSelect(item)} style={styles.masterChip}>
            <Text style={styles.masterChipText}>{label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export default function ExaminationScreen() {
  const { can } = useAuth();
  const canManage = can("exams:write");
  const [exams, setExams] = useState<Exam[]>([]);
  const [catalog, setCatalog] = useState<MasterCatalog>(EMPTY_CATALOG);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [classFilter, setClassFilter] = useState("All");
  const [sectionFilter, setSectionFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState<"All" | ExamStatus>("All");
  const [kindFilter, setKindFilter] = useState("All");
  const [query, setQuery] = useState("");
  const [modalVisible, setModalVisible] = useState(false);
  const [form, setForm] = useState<FormValues>(emptyForm());
  const [editingId, setEditingId] = useState("");
  const [viewingExam, setViewingExam] = useState<Exam | null>(null);
  const [saving, setSaving] = useState(false);
  const [rollupClass, setRollupClass] = useState("");
  const [rollupSection, setRollupSection] = useState("All");
  const [rollupTerm, setRollupTerm] = useState("Term 1");
  const [rollup, setRollup] = useState<TermRollup | null>(null);
  const [rollupLoading, setRollupLoading] = useState(false);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    const [examResult, ...masterResults] = await Promise.allSettled([
      get("/exams?limit=1000"),
      ...MASTER_KINDS.map((kind) => get(`/exam-masters/${kind}`)),
    ]);
    const loadErrors: string[] = [];
    if (examResult.status === "fulfilled") {
      setExams(extractList(examResult.value.data).map((row) => normalizeExam(row as Exam)));
    } else {
      loadErrors.push(examResult.reason?.message || "Could not load examinations.");
    }
    const nextCatalog = { ...EMPTY_CATALOG };
    masterResults.forEach((result, index) => {
      if (result.status === "fulfilled") {
        nextCatalog[MASTER_KINDS[index]] = extractList(result.value.data) as MasterItem[];
      } else {
        loadErrors.push(
          `${MASTER_KINDS[index]}: ${result.reason?.message || "Unable to load exam options."}`,
        );
      }
    });
    setCatalog(nextCatalog);
    setError(loadErrors.join("\n"));
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const classOptions = useMemo(
    () => ["All", ...new Set([...CLASS_FALLBACK, ...exams.map((exam) => textOf(exam.class)).filter(Boolean), ...catalog.classes.map((item) => textOf(item.name)).filter(Boolean)])],
    [exams, catalog.classes],
  );
  const sectionOptions = useMemo(() => {
    const sectionNames = catalog.sections
      .filter((item) => classFilter === "All" || !item.className || item.className === classFilter)
      .map((item) => textOf(item.name));
    const existingSections = exams
      .filter((exam) => classFilter === "All" || exam.class === classFilter)
      .map((exam) => textOf(exam.section));
    return ["All", ...new Set([...SECTION_FALLBACK, ...sectionNames, ...existingSections].filter(Boolean))];
  }, [catalog.sections, exams, classFilter]);
  const rollupSectionOptions = useMemo(() => {
    const sections = catalog.sections
      .filter((item) => !item.className || item.className === rollupClass)
      .map((item) => textOf(item.name));
    const scheduled = exams
      .filter((exam) => exam.class === rollupClass)
      .map((exam) => textOf(exam.section));
    return ["All", ...new Set([...SECTION_FALLBACK, ...sections, ...scheduled].filter(Boolean))];
  }, [catalog.sections, exams, rollupClass]);
  const kindOptions = useMemo(
    () => ["All", ...new Set([...KINDS.map((kind) => kind.value), ...exams.map((exam) => textOf(exam.kind)).filter(Boolean)])],
    [exams],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return exams.filter((exam) =>
      (classFilter === "All" || exam.class === classFilter) &&
      (sectionFilter === "All" || (exam.section || "") === sectionFilter) &&
      (statusFilter === "All" || exam.status === statusFilter) &&
      (kindFilter === "All" || (exam.kind || "other") === kindFilter) &&
      (!q || [exam.subject, examName(exam), exam.room, exam.class, exam.section]
        .some((value) => textOf(value).toLowerCase().includes(q))),
    ).sort((a, b) => textOf(a.date).localeCompare(textOf(b.date)));
  }, [exams, classFilter, sectionFilter, statusFilter, kindFilter, query]);

  const grouped = useMemo(() => {
    const groups = new Map<string, { className: string; section: string; name: string; exams: Exam[] }>();
    filtered.forEach((exam) => {
      const section = textOf(exam.section);
      const name = examName(exam);
      const key = `${exam.class}||${section}||${name}`;
      const group = groups.get(key) ?? {
        className: textOf(exam.class),
        section,
        name,
        exams: [],
      };
      group.exams.push(exam);
      groups.set(key, group);
    });
    return [...groups.values()];
  }, [filtered]);

  const stats = useMemo(() => {
    const classes = new Set(exams.map((exam) => `${exam.class}|${exam.section || ""}`));
    const subjects = new Set(exams.map((exam) => exam.subject).filter(Boolean));
    const todayKey = today();
    return {
      total: exams.length,
      classes: classes.size,
      subjects: subjects.size,
      upcoming: exams.filter((exam) => textOf(exam.date).slice(0, 10) >= todayKey).length,
    };
  }, [exams]);

  const updateForm = (field: keyof FormValues, value: string) => {
    setForm((previous) => {
      const next = { ...previous, [field]: value };
      if (field === "exam") next.examTypeId = "";
      if (field === "class") next.classId = "";
      if (field === "section") next.sectionId = "";
      if (field === "subject") next.subjectId = "";
      if (field === "room") next.roomId = "";
      if (field === "startTime" || field === "endTime") next.timeSlotId = "";
      return next;
    });
  };

  const openCreate = () => {
    setEditingId("");
    setForm(emptyForm());
    setModalVisible(true);
  };

  const openEdit = (exam: Exam) => {
    setEditingId(examId(exam));
    setForm({
      ...emptyForm(),
      examTypeId: textOf(exam.examTypeId),
      exam: examName(exam),
      classId: textOf(exam.classId),
      class: textOf(exam.class),
      sectionId: textOf(exam.sectionId),
      section: textOf(exam.section),
      subjectId: textOf(exam.subjectId),
      subject: textOf(exam.subject),
      date: textOf(exam.date).slice(0, 10),
      timeSlotId: textOf(exam.timeSlotId),
      startTime: textOf(exam.startTime),
      endTime: textOf(exam.endTime),
      roomId: textOf(exam.roomId),
      room: textOf(exam.room),
      maxMarks: textOf(exam.maxMarks || 80),
      passingMarks: textOf(exam.passingMarks),
      session: textOf(exam.session),
      kind: (exam.kind || "other") as ExamKind,
      term: textOf(exam.term),
      cceTool: textOf(exam.cceTool),
    });
    setModalVisible(true);
  };

  const saveExam = async () => {
    if (!form.exam.trim() || !form.class.trim() || !form.subject.trim() || !form.date.trim()) {
      Alert.alert("Required details", "Enter exam name, class, subject and date.");
      return;
    }
    if (!isValidDate(form.date)) {
      Alert.alert("Invalid date", "Use a valid date in YYYY-MM-DD format.");
      return;
    }
    const maxMarks = Number(form.maxMarks);
    if (!Number.isFinite(maxMarks) || maxMarks <= 0) {
      Alert.alert("Invalid marks", "Maximum marks must be a positive number.");
      return;
    }
    const passingMarks = form.passingMarks.trim() ? Number(form.passingMarks) : null;
    if (passingMarks !== null && (!Number.isFinite(passingMarks) || passingMarks < 0 || passingMarks > 100)) {
      Alert.alert("Invalid passing marks", "Passing marks must be a percentage between 0 and 100.");
      return;
    }
    const payload = {
      examName: form.exam.trim(),
      class: form.class.trim(),
      section: form.section.trim(),
      subject: form.subject.trim(),
      date: form.date,
      startTime: form.startTime || undefined,
      endTime: form.endTime || undefined,
      room: form.room.trim(),
      maxMarks,
      passingMarks,
      session: form.session.trim(),
      kind: form.kind || "other",
      term: form.term,
      cceTool: form.kind === "fa" || form.kind === "sa" ? form.cceTool : "",
      ...(form.examTypeId ? { examTypeId: form.examTypeId } : {}),
      ...(form.classId ? { classId: form.classId } : {}),
      ...(form.sectionId ? { sectionId: form.sectionId } : {}),
      ...(form.subjectId ? { subjectId: form.subjectId } : {}),
      ...(form.timeSlotId ? { timeSlotId: form.timeSlotId } : {}),
      ...(form.roomId ? { roomId: form.roomId } : {}),
    };
    setSaving(true);
    try {
      const result = editingId
        ? await send(`/exams/${editingId}`, "PUT", payload)
        : await send("/exams", "POST", payload);
      const savedExam = normalizeExam(result.data as Exam);
      setExams((previous) => editingId
        ? previous.map((item) => examId(item) === editingId ? savedExam : item)
        : [...previous, savedExam]);
      setModalVisible(false);
      setEditingId("");
      Alert.alert("Saved", editingId ? "Exam updated." : "Exam scheduled.");
    } catch (error) {
      Alert.alert("Could not save exam", (error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (exam: Exam, status: ExamStatus) => {
    try {
      const result = await send(`/exams/${examId(exam)}/status`, "PATCH", { status });
      const updated = normalizeExam(result.data as Exam);
      setExams((previous) => previous.map((item) =>
        examId(item) === examId(exam) ? updated : item,
      ));
    } catch (error) {
      Alert.alert("Could not update exam", (error as Error).message);
    }
  };

  const deleteExam = (exam: Exam) => {
    Alert.alert("Delete exam?", `Delete ${examName(exam)} — ${textOf(exam.subject)}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void send(`/exams/${examId(exam)}`, "DELETE")
            .then(() => setExams((previous) => previous.filter((item) => examId(item) !== examId(exam))))
            .catch((error: Error) => Alert.alert("Could not delete exam", error.message));
        },
      },
    ]);
  };

  const loadRollup = async () => {
    if (!rollupClass) {
      Alert.alert("Choose a class", "Select a class before loading the term rollup.");
      return;
    }
    setRollupLoading(true);
    try {
      const params = new URLSearchParams({ class: rollupClass, term: rollupTerm });
      if (rollupSection !== "All") params.set("section", rollupSection);
      const response = await get(`/exams/term-rollup?${params.toString()}`);
      setRollup(response.data as TermRollup);
    } catch (error) {
      Alert.alert("Could not load rollup", (error as Error).message);
    } finally {
      setRollupLoading(false);
    }
  };

  const chooseMaster = (kind: MasterKind, item: MasterItem) => {
    const id = textOf(item._id);
    const name = textOf(item.name);
    setForm((previous) => {
      if (kind === "exam-types") return { ...previous, examTypeId: id, exam: name };
      if (kind === "classes") return { ...previous, classId: id, class: name };
      if (kind === "sections") return { ...previous, sectionId: id, section: name };
      if (kind === "subjects") return { ...previous, subjectId: id, subject: name };
      if (kind === "rooms") return { ...previous, roomId: id, room: name };
      return {
        ...previous,
        timeSlotId: id,
        startTime: textOf(item.startTime),
        endTime: textOf(item.endTime),
      };
    });
  };

  const renderManagementActions = (exam: Exam) => {
    if (!canManage) return null;
    return (
      <View style={styles.actions}>
        {exam.status === "draft" && (
          <>
            <ActionButton label="Mark reviewed" onPress={() => void updateStatus(exam, "reviewed")} />
            <ActionButton label="Edit" onPress={() => openEdit(exam)} />
            <ActionButton label="Delete" danger onPress={() => deleteExam(exam)} />
          </>
        )}
        {exam.status === "reviewed" && (
          <>
            <ActionButton label="Back to draft" onPress={() => void updateStatus(exam, "draft")} />
            <ActionButton label="Publish results" success onPress={() => void updateStatus(exam, "published")} />
            <ActionButton label="Edit" onPress={() => openEdit(exam)} />
          </>
        )}
        {exam.status === "published" && (
          <ActionButton label="Unpublish" onPress={() => void updateStatus(exam, "reviewed")} />
        )}
      </View>
    );
  };

  const formSections = form.class
    ? catalog.sections.filter((item) => !item.className || item.className === form.class)
    : catalog.sections;

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.intro}>
        <Text style={styles.eyebrow}>ACADEMICS</Text>
        <Text style={styles.title}>Examination</Text>
        <Text style={styles.subtitle}>Schedule and manage examinations across classes.</Text>
      </View>
      {canManage && (
        <Button title="+  Schedule Exam" onPress={openCreate} />
      )}
      {!!error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={() => void load(true)} disabled={refreshing}>
            <Text style={styles.link}>{refreshing ? "Loading..." : "Retry"}</Text>
          </Pressable>
        </View>
      )}
      <View style={styles.statsGrid}>
        <StatCard label="Total Exams" value={stats.total} color={colors.info} />
        <StatCard label="Classes Covered" value={stats.classes} color={colors.ink} />
        <StatCard label="Subjects" value={stats.subjects} color={colors.success} />
        <StatCard label="Upcoming" value={stats.upcoming} color={colors.alert} />
      </View>

      <Card>
        <Text style={styles.cardTitle}>Exam Schedule</Text>
        <Input
          style={styles.search}
          placeholder="Search subject, exam, class or room"
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
        />
        <Text style={styles.filterLabel}>Class</Text>
        <ChoiceChips
          items={classOptions}
          selected={classFilter}
          onSelect={(value) => {
            setClassFilter(value);
            setSectionFilter("All");
          }}
          allLabel="All classes"
        />
        <Text style={styles.filterLabel}>Section</Text>
        <ChoiceChips
          items={sectionOptions}
          selected={sectionFilter}
          onSelect={setSectionFilter}
          allLabel="All sections"
        />
        <Text style={styles.filterLabel}>Status</Text>
        <ChoiceChips
          items={STATUSES.map((status) => status.value)}
          selected={statusFilter}
          onSelect={(value) => setStatusFilter(value as "All" | ExamStatus)}
          allLabel="All statuses"
        />
        <Text style={styles.filterLabel}>Exam kind</Text>
        <ChoiceChips
          items={kindOptions}
          selected={kindFilter}
          onSelect={setKindFilter}
          allLabel="All kinds"
        />
        {loading ? (
          <ActivityIndicator color={colors.ink} style={styles.loading} />
        ) : grouped.length === 0 ? (
          <Empty text={exams.length ? "No exams match these filters." : "No exams scheduled yet."} />
        ) : grouped.map((group) => (
          <View key={`${group.className}-${group.section}-${group.name}`} style={styles.examGroup}>
            <Text style={styles.groupHeading}>
              {formatClass(group.className)}{group.section ? ` · Section ${group.section}` : ""}
            </Text>
            <View style={styles.groupTags}>
              <Text style={styles.examTag}>{group.name}</Text>
              {!!group.exams[0].kind && group.exams[0].kind !== "other" && (
                <Text style={styles.kindTag}>{kindText(group.exams[0].kind)}</Text>
              )}
              {!!group.exams[0].term && <Text style={styles.termTag}>{textOf(group.exams[0].term)}</Text>}
              <Text style={styles.paperCount}>{group.exams.length} paper{group.exams.length === 1 ? "" : "s"}</Text>
            </View>
            {group.exams.map((exam) => (
              <View key={examId(exam)} style={styles.examItem}>
                <Text style={styles.subject}>{textOf(exam.subject) || "—"}</Text>
                <View style={styles.examDetails}>
                  <Text style={styles.detail}>Date: {formatDate(exam.date)}</Text>
                  <Text style={styles.detail}>
                    Time: {textOf(exam.time) || "—"}
                  </Text>
                  <Text style={styles.detail}>Room: {textOf(exam.room) || "Room to be announced"}</Text>
                  <Text style={styles.detail}>Max marks: {textOf(exam.maxMarks) || "—"}</Text>
                </View>
                <View style={styles.statusLine}>
                  <Text style={[styles.statusPill, exam.status === "published" ? styles.published : exam.status === "reviewed" ? styles.reviewed : styles.draft]}>
                    {statusText(exam.status)}
                  </Text>
                </View>
                <ActionButton label="View full details" onPress={() => setViewingExam(exam)} />
                {renderManagementActions(exam)}
              </View>
            ))}
          </View>
        ))}
      </Card>

      <Card>
        <Text style={styles.cardTitle}>Term Rollup</Text>
        <Text style={styles.cardSubtitle}>
          View ranked standings, grades and aggregate scores across exams tagged with the selected term.
        </Text>
        <Text style={styles.filterLabel}>Class</Text>
        <ChoiceChips
          items={classOptions.filter((value) => value !== "All")}
          selected={rollupClass}
          onSelect={(value) => {
            setRollupClass(value);
            setRollupSection("All");
          }}
        />
        <Text style={styles.filterLabel}>Section</Text>
        <ChoiceChips
          items={rollupSectionOptions}
          selected={rollupSection}
          onSelect={setRollupSection}
          allLabel="All sections"
        />
        <Text style={styles.filterLabel}>Term</Text>
        <ChoiceChips items={TERMS} selected={rollupTerm} onSelect={setRollupTerm} />
        <Button
          title="Load Term Rollup"
          variant="ghost"
          onPress={() => void loadRollup()}
          loading={rollupLoading}
        />
        {rollup && (
          <View style={styles.rollupResult}>
            {rollup.students?.length ? (
              <>
                {rollup.students.map((row) => (
                  <View key={textOf(row.studentId)} style={styles.rollupRow}>
                    <View style={styles.rankCircle}>
                      <Text style={styles.rankText}>{textOf(row.rank) || "—"}</Text>
                    </View>
                    <View style={styles.flex}>
                      <Text style={styles.personName}>{textOf(row.studentId) || "—"}</Text>
                      <Text style={styles.personMeta}>
                        Score {textOf(row.obtained)} / {textOf(row.max)} · {textOf(row.pct)}% · Grade {textOf(row.grade)}
                      </Text>
                    </View>
                    <Text style={[styles.failed, Number(row.failedSubjects) > 0 && styles.hasFailed]}>
                      Failed {textOf(row.failedSubjects) || "0"}
                    </Text>
                  </View>
                ))}
                <Text style={styles.rollupSummary}>
                  Class average: {textOf(rollup.classAveragePct) || "—"}% · {textOf(rollup.totalStudents)} students · {rollup.exams?.length ?? 0} exams{rollup.session ? ` · ${textOf(rollup.session)}` : ""}
                </Text>
              </>
            ) : (
              <Text style={styles.emptyRollup}>
                No {textOf(rollup.term) || rollupTerm} exams with marks found for {formatClass(textOf(rollup.class) || rollupClass)}.
              </Text>
            )}
          </View>
        )}
      </Card>

      <Modal visible={modalVisible} animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <ScrollView style={styles.modalRoot} contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>{editingId ? "Edit Exam" : "Schedule Exam"}</Text>
          <Text style={styles.subtitle}>Add exam schedule information and save.</Text>
          <FormField label="Exam type / name">
            <Input value={form.exam} onChangeText={(value) => updateForm("exam", value)} placeholder="e.g. Term 1 Mid Term" />
            <MasterChoices items={catalog["exam-types"]} onSelect={(item) => chooseMaster("exam-types", item)} />
          </FormField>
          <FormField label="Kind">
            <ChoiceChips
              items={KINDS.map((kind) => kind.value)}
              selected={form.kind}
              onSelect={(value) => updateForm("kind", value as ExamKind)}
            />
          </FormField>
          <FormField label="Term">
            <ChoiceChips
              items={["None", ...TERMS]}
              selected={form.term || "None"}
              onSelect={(value) => updateForm("term", value === "None" ? "" : value)}
            />
          </FormField>
          {(form.kind === "fa" || form.kind === "sa") && (
            <FormField label="CCE tool">
              <ChoiceChips
                items={["None", "FA1", "FA2", "FA3", "FA4", "SA1", "SA2"]}
                selected={form.cceTool || "None"}
                onSelect={(value) => updateForm("cceTool", value === "None" ? "" : value)}
              />
            </FormField>
          )}
          <FormField label="Class">
            <Input value={form.class} onChangeText={(value) => updateForm("class", value)} placeholder="Select or type class" />
            <MasterChoices items={catalog.classes} onSelect={(item) => chooseMaster("classes", item)} />
          </FormField>
          <FormField label="Section">
            <Input value={form.section} onChangeText={(value) => updateForm("section", value)} placeholder="Section" />
            <MasterChoices items={formSections} onSelect={(item) => chooseMaster("sections", item)} />
          </FormField>
          <FormField label="Subject">
            <Input value={form.subject} onChangeText={(value) => updateForm("subject", value)} placeholder="Subject" />
            <MasterChoices items={catalog.subjects} onSelect={(item) => chooseMaster("subjects", item)} />
          </FormField>
          <FormField label="Date (YYYY-MM-DD)">
            <Input value={form.date} onChangeText={(value) => updateForm("date", value)} placeholder="YYYY-MM-DD" maxLength={10} />
          </FormField>
          <FormField label="Time slot">
            <View style={styles.timeRow}>
              <Input style={styles.flex} value={form.startTime} onChangeText={(value) => updateForm("startTime", value)} placeholder="Start HH:MM" />
              <Input style={styles.flex} value={form.endTime} onChangeText={(value) => updateForm("endTime", value)} placeholder="End HH:MM" />
            </View>
            <MasterChoices
              items={catalog["time-slots"]}
              display={(item) => textOf(item.label) || `${textOf(item.startTime)}–${textOf(item.endTime)}`}
              onSelect={(item) => chooseMaster("time-slots", item)}
            />
          </FormField>
          <FormField label="Room">
            <Input value={form.room} onChangeText={(value) => updateForm("room", value)} placeholder="Room" />
            <MasterChoices items={catalog.rooms} onSelect={(item) => chooseMaster("rooms", item)} />
          </FormField>
          <FormField label="Maximum marks">
            <Input value={form.maxMarks} onChangeText={(value) => updateForm("maxMarks", value)} keyboardType="numeric" />
          </FormField>
          <FormField label="Passing marks (%) — optional">
            <Input
              value={form.passingMarks}
              onChangeText={(value) => updateForm("passingMarks", value)}
              keyboardType="numeric"
              placeholder="Uses school grading scale when blank"
            />
          </FormField>
          <FormField label="Academic session — optional">
            <Input
              value={form.session}
              onChangeText={(value) => updateForm("session", value)}
              placeholder="e.g. 2026-27"
            />
          </FormField>
          <View style={styles.modalActions}>
            <Pressable style={styles.cancelButton} onPress={() => setModalVisible(false)}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <View style={styles.flex}>
              <Button title={editingId ? "Update Exam" : "Schedule Exam"} onPress={() => void saveExam()} loading={saving} />
            </View>
          </View>
        </ScrollView>
      </Modal>
      <Modal
        visible={viewingExam !== null}
        animationType="slide"
        onRequestClose={() => setViewingExam(null)}
      >
        <ScrollView style={styles.modalRoot} contentContainerStyle={styles.modalContent}>
          {viewingExam && (
            <>
              <Text style={styles.eyebrow}>EXAM DETAILS</Text>
              <Text style={styles.title}>{examName(viewingExam)}</Text>
              <Text style={styles.subtitle}>
                {formatClass(textOf(viewingExam.class))}
                {viewingExam.section ? ` · Section ${textOf(viewingExam.section)}` : ""}
              </Text>
              <Card style={styles.detailCard}>
                <DetailRow label="Subject" value={viewingExam.subject} />
                <DetailRow label="Exam type" value={viewingExam.examName || viewingExam.exam} />
                <DetailRow label="Kind" value={kindText(viewingExam.kind)} />
                <DetailRow label="Term" value={viewingExam.term} />
                <DetailRow label="CCE tool" value={viewingExam.cceTool} />
                <DetailRow label="Class" value={viewingExam.class} />
                <DetailRow label="Section" value={viewingExam.section} />
                <DetailRow label="Date" value={formatDate(viewingExam.date)} />
                <DetailRow label="Start time" value={viewingExam.startTime} />
                <DetailRow label="End time" value={viewingExam.endTime} />
                <DetailRow label="Room" value={viewingExam.room} />
                <DetailRow label="Maximum marks" value={viewingExam.maxMarks} />
                <DetailRow
                  label="Passing marks"
                  value={viewingExam.passingMarks == null ? "School grading scale" : `${viewingExam.passingMarks}%`}
                />
                <DetailRow label="Status" value={statusText(viewingExam.status)} />
                <DetailRow label="Academic session" value={viewingExam.session} />
                <DetailRow label="Exam ID" value={examId(viewingExam)} />
                <DetailRow label="Created" value={formatDate(viewingExam.createdAt)} />
                <DetailRow label="Last updated" value={formatDate(viewingExam.updatedAt)} />
              </Card>
              <View style={styles.modalActions}>
                {canManage && (viewingExam.status === "draft" || viewingExam.status === "reviewed") && (
                  <View style={styles.flex}>
                    <Button
                      title="Edit Exam"
                      variant="ghost"
                      onPress={() => {
                        const selected = viewingExam;
                        setViewingExam(null);
                        openEdit(selected);
                      }}
                    />
                  </View>
                )}
                <View style={styles.flex}>
                  <Button title="Close" onPress={() => setViewingExam(null)} />
                </View>
              </View>
            </>
          )}
        </ScrollView>
      </Modal>
    </ScrollView>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.formField}>
      <Text style={styles.filterLabel}>{label}</Text>
      {children}
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: unknown }) {
  const text = textOf(value).trim();
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text selectable style={styles.detailValue}>{text || "—"}</Text>
    </View>
  );
}

function ActionButton({
  label,
  onPress,
  danger = false,
  success = false,
}: {
  label: string;
  onPress: () => void;
  danger?: boolean;
  success?: boolean;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.actionButton, danger && styles.dangerButton, success && styles.successButton]}>
      <Text style={[styles.actionText, danger && styles.dangerText, success && styles.successText]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 16, gap: 14, paddingBottom: 32 },
  intro: { gap: 3 },
  eyebrow: { color: colors.amberDark, fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  title: { color: colors.ink, fontSize: 25, fontWeight: "800" },
  subtitle: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  cardTitle: { color: colors.ink, fontSize: 16, fontWeight: "800" },
  cardSubtitle: { color: colors.muted, fontSize: 12, marginTop: 4, lineHeight: 17 },
  search: { marginTop: 10 },
  filterLabel: { color: colors.muted, fontSize: 12, fontWeight: "700", marginTop: 10, marginBottom: 3 },
  chips: { gap: 7, paddingVertical: 4 },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 18, paddingHorizontal: 11, paddingVertical: 7, backgroundColor: "#fff" },
  selectedChip: { borderColor: colors.ink, backgroundColor: colors.ink },
  chipText: { color: colors.muted, fontSize: 11, fontWeight: "700" },
  selectedChipText: { color: "#fff" },
  loading: { marginVertical: 28 },
  examGroup: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 13, marginTop: 12 },
  groupHeading: { color: colors.ink, fontWeight: "800", fontSize: 14 },
  groupTags: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6, marginTop: 8, marginBottom: 8 },
  examTag: { backgroundColor: "#E8EFF7", color: colors.info, borderRadius: 12, paddingHorizontal: 9, paddingVertical: 5, fontSize: 11, fontWeight: "800" },
  kindTag: { backgroundColor: "#FBF1DF", color: colors.amberDark, borderRadius: 12, paddingHorizontal: 9, paddingVertical: 5, fontSize: 11, fontWeight: "700" },
  termTag: { backgroundColor: "#F0EFEA", color: colors.muted, borderRadius: 12, paddingHorizontal: 9, paddingVertical: 5, fontSize: 11, fontWeight: "700" },
  paperCount: { color: colors.muted, fontSize: 11 },
  examItem: { borderTopWidth: 1, borderTopColor: "#F0EEE8", paddingVertical: 11, gap: 7 },
  subject: { color: colors.ink, fontSize: 14, fontWeight: "800" },
  examDetails: { gap: 3 },
  detail: { color: colors.muted, fontSize: 12 },
  statusLine: { flexDirection: "row" },
  statusPill: { overflow: "hidden", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5, fontSize: 11, fontWeight: "800" },
  draft: { color: colors.muted, backgroundColor: "#F0EFEA" },
  reviewed: { color: colors.info, backgroundColor: "#E8EFF7" },
  published: { color: colors.success, backgroundColor: "#E8F4EC" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 2 },
  actionButton: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 7, backgroundColor: "#fff" },
  actionText: { color: colors.info, fontSize: 11, fontWeight: "700" },
  dangerButton: { borderColor: "#F1C8C3" },
  dangerText: { color: colors.alert },
  successButton: { borderColor: "#B7D9C1" },
  successText: { color: colors.success },
  errorBox: { padding: 12, borderWidth: 1, borderColor: colors.alert, borderRadius: 10, backgroundColor: "#FFF1EF", gap: 6 },
  errorText: { color: colors.alert, fontSize: 12 },
  link: { color: colors.info, fontWeight: "800", fontSize: 12 },
  rollupResult: { marginTop: 12 },
  rollupRow: { flexDirection: "row", alignItems: "center", gap: 9, borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: 10 },
  rankCircle: { width: 30, height: 30, borderRadius: 15, backgroundColor: "#E8EFF7", alignItems: "center", justifyContent: "center" },
  rankText: { color: colors.info, fontWeight: "800", fontSize: 12 },
  flex: { flex: 1 },
  personName: { color: colors.ink, fontWeight: "800", fontSize: 13 },
  personMeta: { color: colors.muted, fontSize: 11, marginTop: 3 },
  failed: { color: colors.success, fontSize: 10, fontWeight: "700" },
  hasFailed: { color: colors.alert },
  rollupSummary: { color: colors.ink, fontWeight: "800", fontSize: 12, paddingTop: 10 },
  emptyRollup: { color: colors.muted, fontSize: 12, paddingVertical: 12 },
  modalRoot: { flex: 1, backgroundColor: colors.paper },
  modalContent: { padding: 18, gap: 7, paddingBottom: 40 },
  formField: { gap: 4 },
  masterChip: { borderWidth: 1, borderColor: colors.border, borderRadius: 16, backgroundColor: "#fff", paddingHorizontal: 10, paddingVertical: 7 },
  masterChipText: { color: colors.info, fontWeight: "600", fontSize: 11 },
  timeRow: { flexDirection: "row", gap: 8 },
  modalActions: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 14 },
  cancelButton: { paddingHorizontal: 14, paddingVertical: 13, borderWidth: 1, borderColor: colors.border, borderRadius: 10 },
  cancelText: { color: colors.ink, fontWeight: "700" },
  detailCard: { marginTop: 10 },
  detailRow: { flexDirection: "row", justifyContent: "space-between", gap: 12, borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 10 },
  detailLabel: { flex: 0.9, color: colors.muted, fontSize: 12, fontWeight: "600" },
  detailValue: { flex: 1.1, color: colors.ink, fontSize: 12, fontWeight: "700", textAlign: "right" },
});
