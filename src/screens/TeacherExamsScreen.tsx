import React, { useCallback, useMemo, useState } from "react";
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
import { Card } from "../components/UI";
import { useAuth } from "../context/AuthContext";
import { api, get } from "../lib/api";
import { extractList, type Row } from "../lib/format";
import { colors } from "../theme";

type TeacherScope = {
  class: string;
  section: string;
  classTeacher: boolean;
};
type Exam = Row & {
  _id?: string;
  examName?: string;
  exam?: string;
  class?: string;
  section?: string;
  subject?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  room?: string;
  maxMarks?: number | string;
};
type AssignmentProfile = {
  classTeacher?: Record<string, unknown>[];
  teachingScopes?: Record<string, unknown>[];
  primaryScope?: { class?: string; section?: string | null } | null;
};

const dateKey = (value: unknown) => {
  const raw = String(value || "");
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
};

const today = () => dateKey(new Date());
const examName = (exam: Exam) => String(exam.examName || exam.exam || "Exam");

function formatDate(value: unknown) {
  const key = dateKey(value);
  if (!key) return "Date not set";
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12)).toLocaleDateString(
    "en-IN",
    {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    },
  );
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

function ExamCard({ exam }: { exam: Exam }) {
  const isPast = dateKey(exam.date) !== "" && dateKey(exam.date) < today();
  return (
    <Card style={styles.examCard}>
      <View style={styles.examTop}>
        <View
          style={[
            styles.examIcon,
            isPast ? styles.examIconPast : styles.examIconUpcoming,
          ]}
        >
          <Ionicons
            name={isPast ? "checkmark-done" : "clipboard-outline"}
            size={19}
            color={isPast ? colors.success : colors.info}
          />
        </View>
        <View style={styles.examCopy}>
          <Text numberOfLines={1} style={styles.subject}>
            {exam.subject || "General"}
          </Text>
          <Text numberOfLines={1} style={styles.examName}>
            {examName(exam)}
          </Text>
        </View>
        <View
          style={[
            styles.statusPill,
            isPast ? styles.completedPill : styles.upcomingPill,
          ]}
        >
          <Text
            style={[
              styles.statusText,
              isPast ? styles.completedText : styles.upcomingText,
            ]}
          >
            {isPast ? "Completed" : "Upcoming"}
          </Text>
        </View>
      </View>
      <View style={styles.details}>
        <View style={styles.detail}>
          <Ionicons
            name="calendar-outline"
            size={15}
            color={isPast ? colors.muted : colors.alert}
          />
          <Text style={styles.detailText}>{formatDate(exam.date)}</Text>
        </View>
        {exam.startTime || exam.endTime ? (
          <View style={styles.detail}>
            <Ionicons name="time-outline" size={15} color={colors.muted} />
            <Text style={styles.detailText}>
              {exam.startTime || "Time TBA"}
              {exam.endTime ? ` – ${exam.endTime}` : ""}
            </Text>
          </View>
        ) : null}
        {exam.room ? (
          <View style={styles.detail}>
            <Ionicons name="location-outline" size={15} color={colors.muted} />
            <Text style={styles.detailText}>Room {exam.room}</Text>
          </View>
        ) : null}
        {exam.maxMarks != null ? (
          <View style={styles.detail}>
            <Ionicons name="ribbon-outline" size={15} color={colors.muted} />
            <Text style={styles.detailText}>Max marks: {exam.maxMarks}</Text>
          </View>
        ) : null}
      </View>
    </Card>
  );
}

function ExamFilter({
  values,
  selected,
  onSelect,
}: {
  values: string[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.filterRow}
    >
      {values.map((value) => {
        const active = selected === value;
        return (
          <Pressable
            key={value}
            onPress={() => onSelect(value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={[styles.filterChip, active && styles.filterChipSelected]}
          >
            <Text
              style={[
                styles.filterChipText,
                active && styles.filterChipTextSelected,
              ]}
            >
              {value === "All" ? "All exams" : value}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export default function TeacherExamsScreen() {
  const { user } = useAuth();
  const [scopes, setScopes] = useState<TeacherScope[]>([]);
  const [scope, setScope] = useState<TeacherScope | null>(null);
  const [exams, setExams] = useState<Exam[]>([]);
  const [selectedExam, setSelectedExam] = useState("All");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const requestVersion = React.useRef(0);

  const loadExams = useCallback(async (selectedScope: TeacherScope) => {
    const version = ++requestVersion.current;
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({
        class: selectedScope.class,
        ...(selectedScope.section
          ? { section: selectedScope.section }
          : {}),
        limit: "1000",
      }).toString();
      const response = await get<Exam[]>(`/exams?${query}`);
      if (version !== requestVersion.current) return;
      const examRows = extractList(response.data) as Exam[];
      setExams(examRows);
      setSelectedExam("All");
    } catch (loadError) {
      if (version === requestVersion.current) {
        setExams([]);
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load exams for your class.",
        );
      }
    } finally {
      if (version === requestVersion.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  const loadAssignments = useCallback(async () => {
    setLoading(true);
    setError("");
    setScopes([]);
    setScope(null);
    setExams([]);
    try {
      const { data } = await api.assignments.me();
      const nextScopes = getScopes(data, user?.class, user?.section);
      setScopes(nextScopes);
      const preferred =
        nextScopes.find((item) => item.classTeacher) || nextScopes[0] || null;
      setScope(preferred);
      if (preferred) {
        await loadExams(preferred);
      } else {
        setLoading(false);
      }
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load your teaching assignments.",
      );
      setLoading(false);
    }
  }, [loadExams, user?.class, user?.section]);

  useFocusEffect(
    useCallback(() => {
      void loadAssignments();
      return () => {
        requestVersion.current += 1;
      };
    }, [loadAssignments]),
  );

  const examNames = useMemo(
    () => [
      "All",
      ...new Set(exams.map((exam) => examName(exam)).filter(Boolean)),
    ],
    [exams],
  );
  const filtered = useMemo(
    () =>
      exams
        .filter(
          (exam) =>
            selectedExam === "All" || examName(exam) === selectedExam,
        )
        .sort((a, b) => dateKey(a.date).localeCompare(dateKey(b.date))),
    [exams, selectedExam],
  );
  const today = dateKey(new Date());
  const upcomingCount = filtered.filter(
    (exam) => dateKey(exam.date) && dateKey(exam.date) >= today,
  ).length;
  const subjectCount = new Set(
    exams.map((exam) => exam.subject).filter(Boolean),
  ).size;
  const termCount = new Set(exams.map(examName)).size;

  const refresh = () => {
    if (scope) {
      setRefreshing(true);
      void loadExams(scope);
    } else {
      void loadAssignments();
    }
  };

  const header = (
    <View style={styles.headerContent}>
      <View style={styles.heading}>
        <View style={styles.headingIcon}>
          <Ionicons name="clipboard-outline" size={22} color={colors.amberDark} />
        </View>
        <View style={styles.headingCopy}>
          <Text style={styles.eyebrow}>MY TEACHING</Text>
          <Text style={styles.title}>Exam</Text>
          <Text style={styles.subtitle}>
            {scope
              ? `Exam schedule for Class ${scope.class}${scope.section ? `-${scope.section}` : ""}. Marks entry is handled by the school office.`
              : "Exam schedule for your assigned class."}
          </Text>
        </View>
      </View>

      {scopes.length > 1 && (
        <View style={styles.scopeSection}>
          <Text style={styles.sectionLabel}>YOUR CLASSES</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
          >
            {scopes.map((item) => {
              const active =
                item.class === scope?.class && item.section === scope.section;
              return (
                <Pressable
                  key={`${item.class}::${item.section}`}
                  onPress={() => {
                    if (active) return;
                    setScope(item);
                    void loadExams(item);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  style={[styles.filterChip, active && styles.filterChipSelected]}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      active && styles.filterChipTextSelected,
                    ]}
                  >
                    {item.class}
                    {item.section ? `-${item.section}` : ""}
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
          <Text style={styles.emptyTitle}>Could not load exams</Text>
          <Text style={styles.emptyText}>{error}</Text>
          <Pressable
            onPress={() => {
              if (scope) void loadExams(scope);
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
            <Metric
              icon="clipboard-outline"
              label="Total exams"
              value={exams.length}
              tint={colors.info}
            />
            <Metric
              icon="calendar-outline"
              label="Upcoming"
              value={upcomingCount}
              tint={colors.success}
            />
            <Metric
              icon="trophy-outline"
              label="Subjects"
              value={subjectCount}
              tint={colors.amberDark}
            />
            <Metric
              icon="time-outline"
              label="Exam terms"
              value={termCount}
              tint={colors.ink}
            />
          </View>
          {examNames.length > 1 && (
            <View style={styles.filters}>
              <Text style={styles.sectionLabel}>FILTER BY EXAM</Text>
              <ExamFilter
                values={examNames}
                selected={selectedExam}
                onSelect={setSelectedExam}
              />
            </View>
          )}
          <View style={styles.listHeading}>
            <View>
              <Text style={styles.listTitle}>Exam Schedule</Text>
              <Text style={styles.listSubtitle}>
                {filtered.length} {filtered.length === 1 ? "exam" : "exams"}
              </Text>
            </View>
            <Pressable
              onPress={refresh}
              style={styles.refreshButton}
              accessibilityRole="button"
              accessibilityLabel="Refresh exam schedule"
            >
              <Ionicons name="refresh-outline" size={18} color={colors.info} />
            </Pressable>
          </View>
        </>
      )}
    </View>
  );

  return (
    <View style={styles.root}>
      {loading && !exams.length && !error ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.ink} />
          <Text style={styles.emptyText}>Loading exam schedule...</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refresh} />
          }
        >
          {header}
          {scope && !error && !loading && filtered.length === 0 ? (
            <Card style={styles.emptyCard}>
              <View style={styles.emptyIcon}>
                <Ionicons
                  name="calendar-clear-outline"
                  size={27}
                  color={colors.info}
                />
              </View>
              <Text style={styles.emptyTitle}>No exams scheduled</Text>
              <Text style={styles.emptyText}>
                {selectedExam === "All"
                  ? "There are no exams scheduled for your class and section."
                  : `No ${selectedExam} exams are scheduled for your class.`}
              </Text>
            </Card>
          ) : (
            filtered.map((exam, index) => (
              <ExamCard
                key={String(exam._id || `${examName(exam)}-${exam.date}-${index}`)}
                exam={exam}
              />
            ))
          )}
        </ScrollView>
      )}
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

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 15, paddingBottom: 28, gap: 10 },
  headerContent: { gap: 12, paddingBottom: 3 },
  heading: { flexDirection: "row", alignItems: "center", gap: 11 },
  headingIcon: { width: 46, height: 46, alignItems: "center", justifyContent: "center", borderRadius: 15, backgroundColor: "#FFF2D9" },
  headingCopy: { flex: 1, gap: 3 },
  eyebrow: { color: colors.amberDark, fontSize: 9, fontWeight: "800", letterSpacing: 0.8 },
  title: { color: colors.ink, fontSize: 21, fontWeight: "800" },
  subtitle: { color: colors.muted, fontSize: 10, lineHeight: 15 },
  scopeSection: { gap: 7 },
  sectionLabel: { color: colors.muted, fontSize: 9, fontWeight: "800", letterSpacing: 0.6 },
  filterRow: { flexDirection: "row", gap: 7, paddingRight: 4 },
  filterChip: { paddingVertical: 7, paddingHorizontal: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 16, backgroundColor: "#fff" },
  filterChipSelected: { borderColor: colors.ink, backgroundColor: colors.ink },
  filterChipText: { color: colors.muted, fontSize: 9, fontWeight: "700" },
  filterChipTextSelected: { color: "#fff" },
  metricsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  metricCard: { flexBasis: "47%", flexGrow: 1, minHeight: 82, padding: 10, borderRadius: 14, gap: 3 },
  metricIcon: { width: 26, height: 26, alignItems: "center", justifyContent: "center", borderRadius: 8 },
  metricValue: { color: colors.ink, fontSize: 17, fontWeight: "800" },
  metricLabel: { color: colors.muted, fontSize: 9 },
  filters: { gap: 6 },
  listHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 1 },
  listTitle: { color: colors.ink, fontSize: 14, fontWeight: "800" },
  listSubtitle: { color: colors.muted, fontSize: 9, marginTop: 2 },
  refreshButton: { width: 33, height: 33, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: "#EAF1FF" },
  examCard: { gap: 10, padding: 12, borderRadius: 14 },
  examTop: { flexDirection: "row", alignItems: "center", gap: 9 },
  examIcon: { width: 39, height: 39, alignItems: "center", justifyContent: "center", borderRadius: 12 },
  examIconPast: { backgroundColor: "#EAF7EF" },
  examIconUpcoming: { backgroundColor: "#EAF1FF" },
  examCopy: { flex: 1, minWidth: 0, gap: 3 },
  subject: { color: colors.ink, fontSize: 12, fontWeight: "800" },
  examName: { color: colors.muted, fontSize: 9 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 12 },
  completedPill: { backgroundColor: "#EEF2F6" },
  upcomingPill: { backgroundColor: "#FFF0ED" },
  statusText: { fontSize: 8, fontWeight: "800" },
  completedText: { color: colors.muted },
  upcomingText: { color: colors.alert },
  details: { flexDirection: "row", flexWrap: "wrap", gap: 9, paddingTop: 9, borderTopWidth: 1, borderTopColor: colors.border },
  detail: { flexDirection: "row", alignItems: "center", gap: 4 },
  detailText: { color: colors.muted, fontSize: 9 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  emptyCard: { alignItems: "center", gap: 8, padding: 18, borderRadius: 14 },
  emptyIcon: { width: 46, height: 46, alignItems: "center", justifyContent: "center", borderRadius: 16, backgroundColor: "#EAF1FF" },
  emptyTitle: { color: colors.ink, fontSize: 12, fontWeight: "800", textAlign: "center" },
  emptyText: { color: colors.muted, fontSize: 9, lineHeight: 14, textAlign: "center" },
  errorCard: { alignItems: "center", gap: 8, padding: 17, borderRadius: 14 },
  retryButton: { marginTop: 2, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, backgroundColor: colors.ink },
  retryText: { color: "#fff", fontSize: 9, fontWeight: "700" },
});
