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
import { get } from "../lib/api";
import { colors } from "../theme";

const SKILLS = [
  { key: "academic", label: "Academic", icon: "star", color: "#0C47CF" },
  { key: "sports", label: "Sports", icon: "medal", color: "#16A34A" },
  { key: "arts", label: "Arts", icon: "ribbon", color: "#E9424E" },
  { key: "citizenship", label: "Citizenship", icon: "trophy", color: "#C9832A" },
  { key: "attendance", label: "Attendance", icon: "calendar", color: "#14B8A6" },
] as const;

const CATEGORY_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  academic: "star",
  sports: "medal",
  arts: "ribbon",
  citizenship: "trophy",
  attendance: "trophy",
  other: "trophy",
};

type Achievement = {
  _id: string;
  title?: string;
  category?: string;
  description?: string;
  date?: string;
};

const PAGE_SIZE = 100;

function formatDate(value?: string) {
  if (!value) return "Date not available";
  const raw = String(value);
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  const date = dateOnly
    ? new Date(Date.UTC(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]), 12))
    : new Date(raw);
  if (Number.isNaN(date.getTime())) return "Date not available";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(date);
}

function categoryStyle(category?: string) {
  switch (String(category || "").toLowerCase()) {
    case "academic":
    case "attendance":
      return { color: colors.info, backgroundColor: "#EAF2F8" };
    case "sports":
    case "citizenship":
      return { color: colors.success, backgroundColor: "#EAF5EE" };
    case "arts":
      return { color: colors.alert, backgroundColor: "#FCEDEA" };
    default:
      return { color: colors.amberDark, backgroundColor: "#FBF1DF" };
  }
}

export default function StudentAchievementsScreen() {
  const [items, setItems] = useState<Achievement[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError("");

    try {
      const allItems: Achievement[] = [];
      let page = 1;
      let totalPages = 1;
      do {
        const response = await get<Achievement[]>(
          `/achievements?limit=${PAGE_SIZE}&page=${page}`,
        );
        const batch = Array.isArray(response.data) ? response.data : [];
        allItems.push(...batch);
        totalPages = Math.max(1, Number(response.pages) || 1);
        page += 1;
      } while (page <= totalPages);
      setItems(allItems);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load your achievements. Please try again.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => {
    const result: Record<string, number> = { total: items.length };
    items.forEach((item) => {
      const category = String(item.category || "other").toLowerCase();
      result[category] = (result[category] || 0) + 1;
    });
    return result;
  }, [items]);

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
      <View style={styles.intro}>
        <View style={styles.heroIcon}>
          <Ionicons name="trophy" size={25} color={colors.amberDark} />
        </View>
        <Text style={styles.eyebrow}>MY PROFILE</Text>
        <Text style={styles.title}>My Achievements</Text>
        <Text style={styles.description}>
          Track your accomplishments across academics, sports, arts and more.
        </Text>
      </View>

      <View style={styles.sectionHeading}>
        <View style={styles.sectionTitleWrap}>
          <View style={styles.sectionLabelRow}>
            <Ionicons name="locate-outline" size={15} color={colors.info} />
            <Text style={styles.sectionLabel}>SKILL AREAS</Text>
          </View>
          <Text style={styles.sectionTitle}>Where your strengths are showing</Text>
        </View>
        <View style={[styles.totalPill, counts.total ? styles.totalPillActive : null]}>
          <Text style={[styles.totalText, counts.total ? styles.totalTextActive : null]}>
            {counts.total} {counts.total === 1 ? "record" : "records"}
          </Text>
        </View>
      </View>

      <View style={styles.skillGrid}>
        {SKILLS.map((skill) => {
          const count = counts[skill.key] || 0;
          const share = counts.total ? Math.round((count / counts.total) * 100) : 0;
          return (
            <View key={skill.key} style={styles.skillCard}>
              <View style={[styles.skillIcon, { backgroundColor: `${skill.color}18` }]}>
                <Ionicons
                  name={skill.icon}
                  size={22}
                  color={skill.color}
                />
              </View>
              <Text style={styles.skillCount}>{count}</Text>
              <Text style={styles.skillLabel}>{skill.label.toUpperCase()}</Text>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${count ? Math.max(6, share) : 0}%`,
                      backgroundColor: skill.color,
                    },
                  ]}
                />
              </View>
            </View>
          );
        })}
      </View>

      <View style={styles.recordsCard}>
        <View style={styles.recordsHeading}>
          <View style={styles.recordsHeadingIcon}>
            <Ionicons name="ribbon-outline" size={19} color={colors.amberDark} />
          </View>
          <Text style={styles.recordsTitle}>Achievement Records</Text>
        </View>
        {loading ? (
          <View style={styles.state}>
            <ActivityIndicator color={colors.ink} />
            <Text style={styles.stateText}>Loading achievements…</Text>
          </View>
        ) : error ? (
          <View style={styles.state}>
            <Ionicons name="cloud-offline-outline" size={28} color={colors.alert} />
            <Text style={styles.errorText}>{error}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void load()}
              style={styles.retryButton}
            >
              <Ionicons name="refresh" size={16} color="#fff" />
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : items.length === 0 ? (
          <View style={styles.state}>
            <View style={styles.emptyIcon}>
              <Ionicons name="trophy-outline" size={27} color={colors.muted} />
            </View>
            <Text style={styles.emptyTitle}>No achievements yet</Text>
            <Text style={styles.stateText}>
              Your achievements will appear here when they are recorded by your school.
            </Text>
          </View>
        ) : (
          <View style={styles.recordsList}>
            {items.map((item, index) => {
              const category = String(item.category || "other").toLowerCase();
              const tone = categoryStyle(category);
              const icon = CATEGORY_ICONS[category] || "trophy";
              return (
                <View
                  key={item._id || `${item.title || "achievement"}-${index}`}
                  style={[
                    styles.record,
                    index === items.length - 1 ? styles.lastRecord : null,
                  ]}
                >
                  <View style={[styles.recordIcon, { backgroundColor: tone.backgroundColor }]}>
                    <Ionicons name={icon} size={19} color={tone.color} />
                  </View>
                  <View style={styles.recordDetails}>
                    <Text style={styles.recordTitle}>
                      {item.title || "Achievement"}
                    </Text>
                    <View style={styles.recordMeta}>
                      <View style={[styles.categoryPill, { backgroundColor: tone.backgroundColor }]}>
                        <Text style={[styles.categoryText, { color: tone.color }]}>
                          {category}
                        </Text>
                      </View>
                      <Text style={styles.recordDate}>{formatDate(item.date)}</Text>
                    </View>
                    {item.description ? (
                      <Text numberOfLines={2} style={styles.recordDescription}>
                        {item.description}
                      </Text>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 16, paddingBottom: 30, gap: 20 },
  intro: {
    backgroundColor: colors.ink,
    borderRadius: 20,
    padding: 20,
    overflow: "hidden",
  },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    marginBottom: 14,
  },
  eyebrow: {
    color: "#F0C77F",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.6,
  },
  title: { color: "#fff", fontSize: 25, fontWeight: "900", marginTop: 5 },
  description: {
    color: "#D7DCE8",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 7,
  },
  sectionHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  sectionTitleWrap: { flex: 1, gap: 5 },
  sectionLabelRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  sectionLabel: {
    color: colors.info,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  sectionTitle: { color: colors.ink, fontSize: 16, fontWeight: "800" },
  totalPill: {
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#ECEDEF",
  },
  totalPillActive: { backgroundColor: "#EAF5EE" },
  totalText: { color: colors.muted, fontSize: 11, fontWeight: "700" },
  totalTextActive: { color: colors.success },
  skillGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  skillCard: {
    width: "31.5%",
    minHeight: 137,
    flexGrow: 1,
    flexBasis: "29%",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 17,
    paddingHorizontal: 9,
    paddingVertical: 13,
  },
  skillIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 9,
  },
  skillCount: { color: colors.ink, fontSize: 23, fontWeight: "900" },
  skillLabel: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.4,
    marginTop: 4,
  },
  progressTrack: {
    height: 5,
    alignSelf: "stretch",
    backgroundColor: "#EEF0F3",
    borderRadius: 4,
    overflow: "hidden",
    marginTop: 10,
  },
  progressFill: { height: "100%", borderRadius: 4 },
  recordsCard: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    padding: 15,
  },
  recordsHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF0F3",
  },
  recordsHeadingIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FBF1DF",
  },
  recordsTitle: { color: colors.ink, fontSize: 15, fontWeight: "800" },
  state: { alignItems: "center", paddingHorizontal: 15, paddingVertical: 28, gap: 10 },
  stateText: { color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: "center" },
  errorText: { color: colors.alert, fontSize: 12, lineHeight: 18, textAlign: "center" },
  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.ink,
    borderRadius: 10,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  retryText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  emptyIcon: {
    width: 52,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    backgroundColor: "#F1F2F4",
  },
  emptyTitle: { color: colors.ink, fontSize: 14, fontWeight: "800" },
  recordsList: { paddingTop: 4 },
  record: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 11,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F1F3",
  },
  lastRecord: { borderBottomWidth: 0, paddingBottom: 2 },
  recordIcon: {
    width: 40,
    height: 40,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  recordDetails: { flex: 1, minWidth: 0, gap: 6 },
  recordTitle: { color: colors.ink, fontSize: 13, fontWeight: "700" },
  recordMeta: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
  categoryPill: { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4 },
  categoryText: { fontSize: 9, fontWeight: "800", textTransform: "capitalize" },
  recordDate: { color: colors.muted, fontSize: 10 },
  recordDescription: { color: "#667085", fontSize: 11, lineHeight: 16 },
});
