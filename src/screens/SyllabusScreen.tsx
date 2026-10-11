import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "../components/UI";
import { get } from "../lib/api";
import { extractList, Row } from "../lib/format";
import { colors } from "../theme";

type Topic = {
  title?: string;
  description?: string;
  status?: "completed" | "in_progress" | "pending" | string;
};
type SyllabusRow = Row & {
  _id: string;
  subject: string;
  class?: string;
  section?: string;
  term?: string;
  totalHours?: number;
  topics?: Topic[];
};

const TERM_FILTERS = ["All Terms", "Term 1", "Term 2", "Full Year"];
const STATUS_STYLE: Record<string, { label: string; color: string; bg: string; icon: keyof typeof Ionicons.glyphMap }> = {
  completed: { label: "Done", color: "#15966A", bg: "#E8F7EF", icon: "checkmark-circle" },
  in_progress: { label: "Ongoing", color: "#C47A08", bg: "#FFF4DA", icon: "time" },
  pending: { label: "Pending", color: "#758195", bg: "#F0F2F5", icon: "ellipse-outline" },
};
const TERM_STYLE: Record<string, { color: string; bg: string }> = {
  "Term 1": { color: "#2563C7", bg: "#EAF2FF" },
  "Term 2": { color: "#7A46B7", bg: "#F3ECFC" },
  "Full Year": { color: "#B77912", bg: "#FFF5DF" },
};

const statusOf = (value: unknown) =>
  value === "completed" || value === "in_progress" ? value : "pending";
const textOf = (value: unknown, fallback = "") =>
  value == null || value === "" ? fallback : String(value);

function SyllabusCard({ item }: { item: SyllabusRow }) {
  const [expanded, setExpanded] = useState(true);
  const topics = Array.isArray(item.topics) ? item.topics : [];
  const completed = topics.filter((topic) => statusOf(topic.status) === "completed").length;
  const inProgress = topics.filter((topic) => statusOf(topic.status) === "in_progress").length;
  const progress = topics.length ? Math.round((completed / topics.length) * 100) : 0;
  const termStyle = TERM_STYLE[item.term || ""] || TERM_STYLE["Full Year"];

  return (
    <Card style={s.subjectCard}>
      <Pressable
        onPress={() => setExpanded((value) => !value)}
        style={s.cardHeader}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
      >
        <View style={s.subjectIcon}>
          <Ionicons name="book-outline" size={21} color={colors.amberDark} />
        </View>
        <View style={s.subjectInfo}>
          <Text style={s.subjectName}>{textOf(item.subject, "Subject")}</Text>
          <Text style={s.classLine}>
            Class {textOf(item.class, "—")}
            {item.section ? ` · Section ${item.section}` : ""}
          </Text>
        </View>
        <View style={[s.termBadge, { backgroundColor: termStyle.bg }]}>
          <Text style={[s.termText, { color: termStyle.color }]}>
            {textOf(item.term, "Full Year")}
          </Text>
        </View>
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={18}
          color={colors.muted}
        />
      </Pressable>

      <View style={s.statsRow}>
        <View style={s.stat}>
          <Text style={s.statValue}>{topics.length}</Text>
          <Text style={s.statLabel}>Topics</Text>
        </View>
        <View style={s.stat}>
          <Text style={[s.statValue, { color: "#15966A" }]}>{completed}</Text>
          <Text style={s.statLabel}>Done</Text>
        </View>
        <View style={s.stat}>
          <Text style={[s.statValue, { color: "#C47A08" }]}>{inProgress}</Text>
          <Text style={s.statLabel}>Ongoing</Text>
        </View>
        <View style={s.progressStat}>
          <View style={s.progressLabel}>
            <Text style={s.statLabel}>Progress</Text>
            <Text style={s.progressPct}>{progress}%</Text>
          </View>
          <View
            style={s.progressTrack}
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: 100, now: progress }}
          >
            <View style={[s.progressFill, { width: `${progress}%` }]} />
          </View>
        </View>
      </View>

      {expanded && topics.length > 0 && (
        <View style={s.topicList}>
          {topics.map((topic, index) => {
            const status = STATUS_STYLE[statusOf(topic.status)];
            return (
              <View key={`${item._id}-${index}`} style={s.topicRow}>
                <Ionicons
                  name={status.icon}
                  size={20}
                  color={status.color}
                  style={s.topicIcon}
                />
                <View style={s.topicBody}>
                  <Text
                    style={[
                      s.topicTitle,
                      status.label === "Done" && s.completedTopic,
                    ]}
                  >
                    {textOf(topic.title, `Topic ${index + 1}`)}
                  </Text>
                  {!!topic.description && (
                    <Text style={s.topicDescription}>{topic.description}</Text>
                  )}
                </View>
                <View style={[s.statusBadge, { backgroundColor: status.bg }]}>
                  <Text style={[s.statusText, { color: status.color }]}>
                    {status.label}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      )}
      {expanded && topics.length === 0 && (
        <Text style={s.noTopics}>No topics added for this subject yet.</Text>
      )}
    </Card>
  );
}

export default function SyllabusScreen() {
  const [rows, setRows] = useState<SyllabusRow[]>([]);
  const [subjectFilter, setSubjectFilter] = useState("All Subjects");
  const [termFilter, setTermFilter] = useState("All Terms");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const response = await get("/syllabus");
      setRows(extractList(response.data) as SyllabusRow[]);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load syllabus.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const subjects = useMemo(
    () => [...new Set(rows.map((row) => row.subject).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [rows],
  );
  const visibleRows = useMemo(
    () =>
      rows.filter(
        (row) =>
          (subjectFilter === "All Subjects" || row.subject === subjectFilter) &&
          (termFilter === "All Terms" || (row.term || "Full Year") === termFilter),
      ),
    [rows, subjectFilter, termFilter],
  );
  const totalTopics = visibleRows.reduce(
    (total, row) => total + (Array.isArray(row.topics) ? row.topics.length : 0),
    0,
  );
  const totalCompleted = visibleRows.reduce(
    (total, row) =>
      total +
      (Array.isArray(row.topics)
        ? row.topics.filter((topic) => statusOf(topic.status) === "completed").length
        : 0),
    0,
  );

  return (
    <FlatList
      style={s.screen}
      contentContainerStyle={s.content}
      data={loading || error || rows.length === 0 ? [] : visibleRows}
      keyExtractor={(item) => item._id}
      renderItem={({ item }) => <SyllabusCard item={item} />}
      ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
      ListHeaderComponent={
        <View>
          <View style={s.hero}>
            <View style={s.heroIcon}>
              <Ionicons name="library-outline" size={25} color="#fff" />
            </View>
            <Text style={s.eyebrow}>LEARNING</Text>
            <Text style={s.title}>My Syllabus</Text>
            <Text style={s.subtitle}>
              Track topics and progress across all your subjects.
            </Text>
          </View>
          {!loading && !error && rows.length > 0 && (
            <View style={s.summaryRow}>
              <Card style={s.summaryCard}>
                <Text style={s.summaryValue}>{visibleRows.length}</Text>
                <Text style={s.summaryLabel}>Subjects</Text>
              </Card>
              <Card style={s.summaryCard}>
                <Text style={s.summaryValue}>{totalTopics}</Text>
                <Text style={s.summaryLabel}>Topics</Text>
              </Card>
              <Card style={s.summaryCard}>
                <Text style={[s.summaryValue, { color: "#15966A" }]}>
                  {totalCompleted}
                </Text>
                <Text style={s.summaryLabel}>Completed</Text>
              </Card>
            </View>
          )}
          {!loading && !error && rows.length > 0 && (
            <>
              <Text style={s.filterHeading}>SUBJECT</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={s.chipRow}
              >
                {["All Subjects", ...subjects].map((subject) => {
                  const active = subjectFilter === subject;
                  return (
                    <Pressable
                      key={subject}
                      onPress={() => setSubjectFilter(subject)}
                      style={[s.filterChip, active && s.activeChip]}
                    >
                      <Text style={[s.filterText, active && s.activeFilterText]}>
                        {subject === "All Subjects"
                          ? `${subject} (${rows.length})`
                          : subject}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              <Text style={s.filterHeading}>TERM</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={s.chipRow}
              >
                {TERM_FILTERS.map((term) => {
                  const active = termFilter === term;
                  return (
                    <Pressable
                      key={term}
                      onPress={() => setTermFilter(term)}
                      style={[s.filterChip, active && s.activeChip]}
                    >
                      <Text style={[s.filterText, active && s.activeFilterText]}>
                        {term}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              <Text style={s.resultsHeading}>
                {visibleRows.length} {visibleRows.length === 1 ? "subject" : "subjects"}
              </Text>
            </>
          )}
        </View>
      }
      ListEmptyComponent={
        <View style={s.stateContainer}>
          {loading ? (
            <ActivityIndicator size="large" color={colors.amberDark} />
          ) : error ? (
            <>
              <Ionicons name="cloud-offline-outline" size={38} color={colors.alert} />
              <Text style={s.stateTitle}>Could not load syllabus</Text>
              <Text style={s.stateText}>{error}</Text>
              <Pressable onPress={() => void load()} style={s.retryButton}>
                <Text style={s.retryText}>Retry</Text>
              </Pressable>
            </>
          ) : rows.length === 0 ? (
            <>
              <Ionicons name="library-outline" size={42} color={colors.amberDark} />
              <Text style={s.stateTitle}>No syllabus available</Text>
              <Text style={s.stateText}>
                Syllabus for your class will appear here once uploaded by the school.
              </Text>
            </>
          ) : (
            <>
              <Ionicons name="search-outline" size={38} color={colors.muted} />
              <Text style={s.stateTitle}>No syllabus matches these filters</Text>
              <Text style={s.stateText}>Try choosing another subject or term.</Text>
            </>
          )}
        </View>
      }
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void load(true)}
          tintColor={colors.amberDark}
        />
      }
    />
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 16, paddingBottom: 32 },
  hero: {
    padding: 20,
    borderRadius: 20,
    backgroundColor: colors.ink,
    marginBottom: 12,
  },
  heroIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 15,
  },
  eyebrow: { color: "#FFD58A", fontSize: 10, fontWeight: "800", letterSpacing: 1.5 },
  title: { color: "#fff", fontSize: 25, fontWeight: "800", marginTop: 4 },
  subtitle: { color: "rgba(255,255,255,0.76)", fontSize: 13, lineHeight: 19, marginTop: 5 },
  summaryRow: { flexDirection: "row", gap: 8, marginBottom: 20 },
  summaryCard: { flex: 1, padding: 12, alignItems: "center" },
  summaryValue: { color: colors.ink, fontSize: 21, fontWeight: "800" },
  summaryLabel: { color: colors.muted, fontSize: 10, fontWeight: "600", marginTop: 2 },
  filterHeading: { color: colors.muted, fontSize: 10, fontWeight: "800", letterSpacing: 1, marginBottom: 8 },
  chipRow: { gap: 8, paddingBottom: 14 },
  filterChip: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#fff",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  activeChip: { backgroundColor: "#FFF4DF", borderColor: "#F1D39A" },
  filterText: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  activeFilterText: { color: colors.amberDark },
  resultsHeading: { color: colors.muted, fontSize: 12, fontWeight: "700", marginBottom: 10 },
  subjectCard: { padding: 14 },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 9 },
  subjectIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#FFF4DF",
    alignItems: "center",
    justifyContent: "center",
  },
  subjectInfo: { flex: 1, minWidth: 0 },
  subjectName: { color: colors.ink, fontSize: 15, fontWeight: "800" },
  classLine: { color: colors.muted, fontSize: 11, marginTop: 3 },
  termBadge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 5 },
  termText: { fontSize: 10, fontWeight: "800" },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    marginTop: 16,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  stat: { alignItems: "center", minWidth: 38 },
  statValue: { color: colors.ink, fontSize: 16, fontWeight: "800" },
  statLabel: { color: colors.muted, fontSize: 9, fontWeight: "600", marginTop: 2 },
  progressStat: { flex: 1 },
  progressLabel: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  progressPct: { color: colors.ink, fontSize: 10, fontWeight: "800" },
  progressTrack: { height: 7, overflow: "hidden", borderRadius: 5, backgroundColor: "#EEF0F3" },
  progressFill: { height: "100%", borderRadius: 5, backgroundColor: "#E7A52B" },
  topicList: { gap: 13, paddingTop: 14 },
  topicRow: { flexDirection: "row", alignItems: "flex-start", gap: 9 },
  topicIcon: { marginTop: 1 },
  topicBody: { flex: 1 },
  topicTitle: { color: colors.ink, fontSize: 12, fontWeight: "700", lineHeight: 18 },
  completedTopic: { color: colors.muted, textDecorationLine: "line-through" },
  topicDescription: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 2 },
  statusBadge: { borderRadius: 10, paddingHorizontal: 7, paddingVertical: 4 },
  statusText: { fontSize: 9, fontWeight: "800" },
  noTopics: { color: colors.muted, fontSize: 12, paddingTop: 14 },
  stateContainer: { alignItems: "center", paddingHorizontal: 20, paddingVertical: 36, gap: 9 },
  stateTitle: { color: colors.ink, fontSize: 15, fontWeight: "800", textAlign: "center" },
  stateText: { color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: "center" },
  retryButton: { marginTop: 5, borderRadius: 10, backgroundColor: colors.ink, paddingHorizontal: 22, paddingVertical: 10 },
  retryText: { color: "#fff", fontSize: 13, fontWeight: "800" },
});
