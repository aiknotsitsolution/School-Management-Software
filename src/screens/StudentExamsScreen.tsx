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
import { Card, Empty } from "../components/UI";
import { get } from "../lib/api";
import { extractList, Row } from "../lib/format";
import { colors } from "../theme";

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
  maxMarks?: number;
};

const PAGE_SIZE = 100;
const MAX_PAGES = 20;
const dateKey = (value: unknown) => {
  if (!value) return "";
  const raw = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (name: string) =>
    parts.find((item) => item.type === name)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
};

const formatDate = (value: unknown) => {
  const key = dateKey(value);
  if (!key) return "Date not available";
  const [year, month, day] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
};

function ExamCard({ exam, completed }: { exam: Exam; completed: boolean }) {
  const examName = String(exam.examName || exam.exam || "Exam");
  return (
    <Card style={styles.examCard}>
      <View style={styles.examTop}>
        <View style={styles.examIcon}>
          <Ionicons
            name={completed ? "checkmark-done" : "clipboard-outline"}
            size={19}
            color={completed ? colors.success : colors.info}
          />
        </View>
        <View style={styles.examCopy}>
          <Text style={styles.subject}>{exam.subject || "General"}</Text>
          <Text style={styles.examName}>{examName}</Text>
        </View>
        <View
          style={[
            styles.statusPill,
            completed ? styles.completedPill : styles.upcomingPill,
          ]}
        >
          <Text
            style={[
              styles.statusText,
              completed ? styles.completedText : styles.upcomingText,
            ]}
          >
            {completed ? "Completed" : "Upcoming"}
          </Text>
        </View>
      </View>
      <View style={styles.examDetails}>
        <View style={styles.detail}>
          <Ionicons
            name="calendar-outline"
            size={15}
            color={completed ? colors.muted : colors.alert}
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
            <Text style={styles.detailText}>{exam.maxMarks} marks</Text>
          </View>
        ) : null}
      </View>
    </Card>
  );
}

export default function StudentExamsScreen() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const allExams: Exam[] = [];
      let page = 1;
      let pages = 1;
      do {
        const response = await get<Exam[]>(
          `/exams?limit=${PAGE_SIZE}&page=${page}`,
        );
        allExams.push(...extractList(response.data) as Exam[]);
        pages = Math.max(1, Number(response.pages) || 1);
        if (pages > MAX_PAGES) {
          throw new Error(
            `More than ${PAGE_SIZE * MAX_PAGES} exams are available. Please contact your school to review the schedule.`,
          );
        }
        page += 1;
      } while (page <= pages);
      setExams(allExams);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load your exams. Please try again.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const { upcoming, completed } = useMemo(() => {
    const currentDay = dateKey(new Date());
    const validExams = exams.filter((exam) => dateKey(exam.date));
    return {
      upcoming: validExams
        .filter((exam) => dateKey(exam.date) >= currentDay)
        .sort((a, b) => dateKey(a.date).localeCompare(dateKey(b.date))),
      completed: validExams
        .filter((exam) => dateKey(exam.date) < currentDay)
        .sort((a, b) => dateKey(b.date).localeCompare(dateKey(a.date))),
    };
  }, [exams]);

  const upcomingBySubject = useMemo(() => {
    const counts = new Map<string, number>();
    upcoming.forEach((exam) => {
      const subject = String(exam.subject || "General");
      counts.set(subject, (counts.get(subject) || 0) + 1);
    });
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [upcoming]);

  const donePercentage = exams.length
    ? Math.round((completed.length / exams.length) * 100)
    : 0;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void load(true)}
          tintColor={colors.ink}
        />
      }
    >
      <View style={styles.hero}>
        <View style={styles.heroIcon}>
          <Ionicons name="school-outline" size={24} color={colors.amberDark} />
        </View>
        <Text style={styles.eyebrow}>ACADEMICS</Text>
        <Text style={styles.title}>My Examinations</Text>
        <Text style={styles.subtitle}>
          Your class exam schedule and upcoming papers.
        </Text>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.info} style={styles.loading} />
      ) : error ? (
        <Card style={styles.stateCard}>
          <Ionicons name="cloud-offline-outline" size={30} color={colors.alert} />
          <Text style={styles.stateTitle}>Couldn’t load your exams</Text>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void load()}
            style={styles.retryButton}
          >
            <Ionicons name="refresh" size={16} color="#fff" />
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </Card>
      ) : exams.length === 0 ? (
        <Card style={styles.stateCard}>
          <Ionicons name="clipboard-outline" size={38} color={colors.muted} />
          <Text style={styles.stateTitle}>No exams scheduled</Text>
          <Text style={styles.detailText}>
            The exam schedule for your class will appear here.
          </Text>
        </Card>
      ) : (
        <>
          <View style={styles.statsRow}>
            <Card style={styles.statCard}>
              <Text style={styles.statValue}>{exams.length}</Text>
              <Text style={styles.statLabel}>Total exams</Text>
            </Card>
            <Card style={styles.statCard}>
              <Text style={[styles.statValue, { color: colors.info }]}>
                {upcoming.length}
              </Text>
              <Text style={styles.statLabel}>Upcoming</Text>
            </Card>
            <Card style={styles.statCard}>
              <Text style={[styles.statValue, { color: colors.success }]}>
                {donePercentage}%
              </Text>
              <Text style={styles.statLabel}>Completed</Text>
            </Card>
          </View>

          {upcomingBySubject.length ? (
            <Card style={styles.subjectCard}>
              <View style={styles.sectionHeading}>
                <View style={styles.sectionIcon}>
                  <Ionicons name="bar-chart-outline" size={17} color={colors.info} />
                </View>
                <View style={styles.subjectHeadingCopy}>
                  <Text style={styles.sectionTitle}>Upcoming by Subject</Text>
                  <Text style={styles.sectionSubtitle}>
                    Remaining exams for each subject
                  </Text>
                </View>
              </View>
              <View style={styles.subjectList}>
                {upcomingBySubject.map(([subject, count]) => (
                  <View key={subject} style={styles.subjectRow}>
                    <Text numberOfLines={1} style={styles.subjectRowName}>
                      {subject}
                    </Text>
                    <View style={styles.subjectCount}>
                      <Text style={styles.subjectCountText}>{count}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </Card>
          ) : null}

          <View style={styles.sectionHeading}>
            <View style={styles.sectionIcon}>
              <Ionicons name="alarm-outline" size={17} color={colors.info} />
            </View>
            <View style={styles.subjectHeadingCopy}>
              <Text style={styles.sectionTitle}>Upcoming Exams</Text>
              <Text style={styles.sectionSubtitle}>
                {upcoming.length} {upcoming.length === 1 ? "exam" : "exams"} scheduled
              </Text>
            </View>
          </View>
          {upcoming.length ? (
            upcoming.map((exam, index) => (
              <ExamCard
                key={String(exam._id || `${exam.subject}-${exam.date}-${index}`)}
                exam={exam}
                completed={false}
              />
            ))
          ) : (
            <Card style={styles.emptyCard}>
              <Empty text="Nothing scheduled ahead." />
            </Card>
          )}

          <View style={styles.sectionHeading}>
            <View style={[styles.sectionIcon, styles.completedIcon]}>
              <Ionicons name="checkmark-done-outline" size={17} color={colors.success} />
            </View>
            <View style={styles.subjectHeadingCopy}>
              <Text style={styles.sectionTitle}>Completed Exams</Text>
              <Text style={styles.sectionSubtitle}>
                {completed.length} {completed.length === 1 ? "exam" : "exams"} completed
              </Text>
            </View>
          </View>
          {completed.length ? (
            completed.map((exam, index) => (
              <ExamCard
                key={String(exam._id || `${exam.subject}-${exam.date}-${index}`)}
                exam={exam}
                completed
              />
            ))
          ) : (
            <Card style={styles.emptyCard}>
              <Empty text="No completed exams yet." />
            </Card>
          )}
        </>
      )}

      <Card style={styles.note}>
        <Ionicons name="information-circle-outline" size={18} color={colors.info} />
        <Text style={styles.noteText}>
          Exam schedules are published by your school. Arrive on time and check
          your subject, date and room before each paper.
        </Text>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 16, paddingBottom: 30, gap: 12 },
  hero: { padding: 19, borderRadius: 20, backgroundColor: colors.ink, marginBottom: 4 },
  heroIcon: {
    width: 46,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
    backgroundColor: "#fff",
    marginBottom: 13,
  },
  eyebrow: { color: "#F0C77F", fontSize: 10, fontWeight: "900", letterSpacing: 1.5 },
  title: { color: "#fff", fontSize: 24, fontWeight: "900", marginTop: 4 },
  subtitle: { color: "#D7DCE8", fontSize: 12, lineHeight: 18, marginTop: 6 },
  loading: { marginVertical: 32 },
  stateCard: { minHeight: 200, alignItems: "center", justifyContent: "center", gap: 10 },
  stateTitle: { color: colors.ink, fontSize: 15, fontWeight: "800", textAlign: "center" },
  errorText: { color: colors.alert, fontSize: 12, lineHeight: 17, textAlign: "center" },
  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 10,
    backgroundColor: colors.ink,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  retryText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  statsRow: { flexDirection: "row", gap: 8 },
  statCard: { flex: 1, padding: 12 },
  statValue: { color: colors.ink, fontSize: 22, fontWeight: "900" },
  statLabel: { color: colors.muted, fontSize: 10, marginTop: 4 },
  subjectCard: { gap: 14 },
  sectionHeading: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4 },
  sectionIcon: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#EAF2F8",
  },
  completedIcon: { backgroundColor: "#EAF5EE" },
  subjectHeadingCopy: { flex: 1, gap: 2 },
  sectionTitle: { color: colors.ink, fontSize: 15, fontWeight: "800" },
  sectionSubtitle: { color: colors.muted, fontSize: 11 },
  subjectList: { gap: 11 },
  subjectRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  subjectRowName: { flex: 1, color: colors.text, fontSize: 12, fontWeight: "700" },
  subjectCount: {
    minWidth: 27,
    height: 25,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    backgroundColor: "#EAF2F8",
    paddingHorizontal: 8,
  },
  subjectCountText: { color: colors.info, fontSize: 11, fontWeight: "800" },
  examCard: { gap: 12 },
  examTop: { flexDirection: "row", alignItems: "flex-start", gap: 9 },
  examIcon: {
    width: 36,
    height: 36,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#EAF2F8",
  },
  examCopy: { flex: 1, minWidth: 0, gap: 3 },
  subject: { color: colors.ink, fontSize: 13, fontWeight: "800" },
  examName: { color: colors.muted, fontSize: 11 },
  statusPill: { borderRadius: 14, paddingHorizontal: 8, paddingVertical: 5 },
  upcomingPill: { backgroundColor: "#FCEDEA" },
  completedPill: { backgroundColor: "#EAF5EE" },
  statusText: { fontSize: 9, fontWeight: "800" },
  upcomingText: { color: colors.alert },
  completedText: { color: colors.success },
  examDetails: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  detail: { flexDirection: "row", alignItems: "center", gap: 5 },
  detailText: { color: colors.muted, fontSize: 10 },
  emptyCard: { minHeight: 80, justifyContent: "center" },
  note: { flexDirection: "row", alignItems: "flex-start", gap: 9 },
  noteText: { flex: 1, color: colors.muted, fontSize: 11, lineHeight: 16 },
});
