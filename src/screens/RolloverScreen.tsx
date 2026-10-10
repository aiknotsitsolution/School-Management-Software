import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Button, Card } from "../components/UI";
import { useAuth } from "../context/AuthContext";
import { send } from "../lib/api";
import { Row } from "../lib/format";
import { colors } from "../theme";

const STATUSES = [
  "Promoted",
  "Promoted with Conditions",
  "Detained",
  "Transferred",
  "Graduated",
] as const;

type ClassPosture = {
  class: string;
  students: number;
  counts: Partial<Record<(typeof STATUSES)[number], number>>;
};

type RolloverPreview = {
  fromSession: string;
  toSession: string;
  totalStudents: number;
  classes: ClassPosture[];
};

type RolloverResponse = { data?: RolloverPreview } & Row;

function formatClass(value: string) {
  return ["Nursery", "LKG", "UKG"].includes(value) ? value : `Class ${value}`;
}

function statusTone(status: string) {
  if (status === "Promoted") return { bg: "#E8F7EF", color: "#15966A" };
  if (status === "Promoted with Conditions") return { bg: "#EAF2FF", color: "#2563C7" };
  if (status === "Detained") return { bg: "#FDECEC", color: colors.alert };
  return { bg: "#F0F2F5", color: colors.muted };
}

function parsePreview(value: unknown): RolloverPreview {
  if (!value || typeof value !== "object") {
    throw new Error("The server returned an invalid rollover preview.");
  }
  const payload = value as Row;
  const source =
    payload.data && typeof payload.data === "object"
      ? (payload.data as Row)
      : payload;
  if (
    typeof source.fromSession !== "string" ||
    typeof source.toSession !== "string" ||
    !Array.isArray(source.classes) ||
    typeof source.totalStudents !== "number"
  ) {
    throw new Error("The rollover preview is missing session or class details.");
  }
  const classes = source.classes.map((value) => {
    if (!value || typeof value !== "object") {
      throw new Error("The rollover response contains an invalid class summary.");
    }
    const row = value as Row;
    const rawCounts = row.counts && typeof row.counts === "object"
      ? (row.counts as Row)
      : {};
    const counts: ClassPosture["counts"] = {};
    for (const status of STATUSES) {
      const count = rawCounts[status];
      if (count !== undefined && typeof count !== "number") {
        throw new Error(`Invalid ${status} count in class summary.`);
      }
      counts[status] = typeof count === "number" ? count : 0;
    }
    if (typeof row.class !== "string" || typeof row.students !== "number") {
      throw new Error("A class summary is missing its name or student count.");
    }
    return { class: row.class, students: row.students, counts };
  });
  return {
    fromSession: source.fromSession,
    toSession: source.toSession,
    totalStudents: source.totalStudents,
    classes,
  };
}

export default function RolloverScreen() {
  const { can } = useAuth();
  const canPrepare = can("rollover:read");
  const [fromSession, setFromSession] = useState("");
  const [toSession, setToSession] = useState("");
  const [preview, setPreview] = useState<RolloverPreview | null>(null);
  const [loading, setLoading] = useState(false);

  const totals = useMemo(() => {
    if (!preview) return { promotable: 0, detained: 0 };
    return preview.classes.reduce(
      (result, item) => ({
        promotable:
          result.promotable +
          (item.counts.Promoted || 0) +
          (item.counts["Promoted with Conditions"] || 0),
        detained: result.detained + (item.counts.Detained || 0),
      }),
      { promotable: 0, detained: 0 },
    );
  }, [preview]);

  const prepare = async () => {
    const sourceSession = fromSession.trim();
    if (!sourceSession) {
      Alert.alert("Session required", "Enter the closing academic session first.");
      return;
    }
    if (!canPrepare || loading) return;
    setLoading(true);
    try {
      const response = await send<RolloverResponse>("/rollover/prepare", "POST", {
        fromSession: sourceSession,
        toSession: toSession.trim() || undefined,
      });
      const result = parsePreview(response.data);
      setPreview(result);
    } catch (error) {
      setPreview(null);
      Alert.alert(
        "Could not prepare rollover",
        error instanceof Error ? error.message : "Please verify the session and try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView
      style={s.screen}
      contentContainerStyle={s.content}
      refreshControl={
        <RefreshControl
          refreshing={loading}
          onRefresh={() => {
            if (fromSession.trim()) void prepare();
          }}
          tintColor={colors.ink}
        />
      }
    >
      <View style={s.hero}>
        <View style={s.heroIcon}>
          <Ionicons name="sync" size={24} color="#fff" />
        </View>
        <Text style={s.eyebrow}>ACADEMICS</Text>
        <Text style={s.title}>Academic Rollover</Text>
        <Text style={s.subtitle}>
          Review each enrolled class and its suggested promotion posture before
          moving to the next academic session.
        </Text>
      </View>

      <Card style={s.formCard}>
        <View style={s.sectionHeading}>
          <View style={s.headingIcon}>
            <Ionicons name="calendar-outline" size={18} color={colors.amberDark} />
          </View>
          <View style={s.headingCopy}>
            <Text style={s.sectionTitle}>Session Rollover</Text>
            <Text style={s.sectionSubtitle}>Prepare a read-only class summary</Text>
          </View>
        </View>
        <View style={s.infoNote}>
          <Ionicons name="information-circle-outline" size={18} color={colors.info} />
          <Text style={s.infoText}>
            Preparing a rollover does not change student records. Commit
            promotions separately, then activate the new session in Academic Sessions.
          </Text>
        </View>
        <View style={s.fieldWrap}>
          <Text style={s.fieldLabel}>FROM SESSION *</Text>
          <TextInput
            value={fromSession}
            onChangeText={setFromSession}
            editable={!loading}
            placeholder="e.g. 2025-26"
            placeholderTextColor="#98A2B3"
            autoCapitalize="none"
            style={s.input}
          />
        </View>
        <View style={s.fieldWrap}>
          <Text style={s.fieldLabel}>TO SESSION (OPTIONAL)</Text>
          <TextInput
            value={toSession}
            onChangeText={setToSession}
            editable={!loading}
            placeholder="Auto-derived if blank"
            placeholderTextColor="#98A2B3"
            autoCapitalize="none"
            style={s.input}
          />
          <Text style={s.hint}>
            For example, 2025-26 automatically rolls over to 2026-27.
          </Text>
        </View>
        {!canPrepare ? (
          <Text style={s.readOnlyNote}>
            You do not have permission to prepare a rollover. Contact your school administrator.
          </Text>
        ) : (
          <Button
            title={loading ? "Preparing..." : "Prepare Rollover"}
            onPress={() => void prepare()}
            loading={loading}
          />
        )}
      </Card>

      {!preview ? (
        <Card style={s.emptyCard}>
          <View style={s.emptyIcon}>
            <Ionicons name="people-outline" size={28} color={colors.amberDark} />
          </View>
          <Text style={s.emptyTitle}>Rollover preview will appear here</Text>
          <Text style={s.emptyText}>
            Enter the closing session to see enrolled students and suggested
            decisions for every class.
          </Text>
        </Card>
      ) : (
        <>
          <View style={s.statsGrid}>
            <Card style={{ ...s.statCard, ...s.statWide }}>
              <View style={[s.statIcon, { backgroundColor: "#EAF2FF" }]}>
                <Ionicons name="sync" size={18} color={colors.info} />
              </View>
              <Text style={s.statLabel}>ROLLOVER</Text>
              <Text style={s.statValueSmall}>
                {preview.fromSession} → {preview.toSession}
              </Text>
              <Text style={s.statHint}>New session target</Text>
            </Card>
            <Card style={s.statCard}>
              <View style={[s.statIcon, { backgroundColor: "#F0F2F5" }]}>
                <Ionicons name="people" size={18} color={colors.ink} />
              </View>
              <Text style={s.statLabel}>TOTAL STUDENTS</Text>
              <Text style={s.statValue}>{preview.totalStudents}</Text>
              <Text style={s.statHint}>Across enrolled classes</Text>
            </Card>
            <Card style={s.statCard}>
              <View style={[s.statIcon, { backgroundColor: "#E8F7EF" }]}>
                <Ionicons name="school" size={18} color="#15966A" />
              </View>
              <Text style={s.statLabel}>PROMOTABLE</Text>
              <Text style={[s.statValue, { color: "#15966A" }]}>{totals.promotable}</Text>
              <Text style={s.statHint}>Clear or conditional</Text>
            </Card>
            <Card style={s.statCard}>
              <View style={[s.statIcon, { backgroundColor: "#FDECEC" }]}>
                <Ionicons name="alert-circle-outline" size={18} color={colors.alert} />
              </View>
              <Text style={s.statLabel}>DETAINED</Text>
              <Text style={[s.statValue, { color: colors.alert }]}>{totals.detained}</Text>
              <Text style={s.statHint}>Suggested to repeat</Text>
            </Card>
          </View>

          <View style={s.listHeading}>
            <View>
              <Text style={s.sectionTitle}>Per-Class Posture</Text>
              <Text style={s.sectionSubtitle}>
                {preview.classes.length} enrolled {preview.classes.length === 1 ? "class" : "classes"}
              </Text>
            </View>
            <Pressable
              onPress={() => void prepare()}
              disabled={loading}
              style={s.refreshButton}
              accessibilityRole="button"
              accessibilityLabel="Refresh rollover preview"
            >
              {loading ? (
                <ActivityIndicator size="small" color={colors.ink} />
              ) : (
                <Ionicons name="refresh" size={18} color={colors.ink} />
              )}
            </Pressable>
          </View>
          {preview.classes.length === 0 ? (
            <Card style={s.noClasses}>
              <Ionicons name="people-outline" size={24} color={colors.muted} />
              <Text style={s.noClassesText}>
                No enrolled classes found for {preview.fromSession}.
              </Text>
            </Card>
          ) : (
            preview.classes.map((item) => {
              const passRate = item.students
                ? Math.round(((item.counts.Promoted || 0) / item.students) * 100)
                : 0;
              return (
                <Card key={item.class} style={s.classCard}>
                  <View style={s.classHeader}>
                    <View style={s.classIcon}>
                      <Ionicons name="people" size={17} color={colors.amberDark} />
                    </View>
                    <Text style={s.classTitle}>{formatClass(item.class)}</Text>
                    <View style={s.studentBadge}>
                      <Text style={s.studentBadgeText}>{item.students} students</Text>
                    </View>
                  </View>
                  <View style={s.countList}>
                    {STATUSES.map((status) => {
                      const tone = statusTone(status);
                      return (
                        <View key={status} style={s.countRow}>
                          <View style={s.countLabelWrap}>
                            <View style={[s.statusDot, { backgroundColor: tone.color }]} />
                            <Text style={s.countLabel}>{status}</Text>
                          </View>
                          <View style={s.countValueWrap}>
                            <Ionicons name="arrow-forward" size={12} color="#98A2B3" />
                            <Text style={s.countValue}>{item.counts[status] || 0}</Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                  <View style={s.passRateRow}>
                    <Text style={s.passRateLabel}>Predicted clear pass rate</Text>
                    <Text style={s.passRateValue}>{passRate}%</Text>
                  </View>
                </Card>
              );
            })
          )}

          <Card style={s.nextStepsCard}>
            <View style={s.sectionHeading}>
              <View style={s.headingIcon}>
                <Ionicons name="list-outline" size={18} color={colors.amberDark} />
              </View>
              <View>
                <Text style={s.sectionTitle}>Recommended Next Steps</Text>
                <Text style={s.sectionSubtitle}>Complete the rollover carefully</Text>
              </View>
            </View>
            {[
              ["1", "Open Promotions and commit the suggested decisions for each class."],
              ["2", `Open Academic Sessions and activate ${preview.toSession} as current.`],
              ["3", "Verify report cards and marks now point to the new session."],
            ].map(([number, text]) => (
              <View key={number} style={s.stepRow}>
                <View style={s.stepNumber}>
                  <Text style={s.stepNumberText}>{number}</Text>
                </View>
                <Text style={s.stepText}>{text}</Text>
              </View>
            ))}
          </Card>
        </>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 16, paddingBottom: 32, gap: 14 },
  hero: { padding: 20, borderRadius: 20, backgroundColor: colors.ink },
  heroIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  eyebrow: { color: "#FFD58A", fontSize: 10, fontWeight: "800", letterSpacing: 1.5 },
  title: { color: "#fff", fontSize: 23, fontWeight: "800", marginTop: 4 },
  subtitle: { color: "rgba(255,255,255,0.76)", fontSize: 12, lineHeight: 18, marginTop: 5 },
  formCard: { gap: 14, padding: 16 },
  sectionHeading: { flexDirection: "row", alignItems: "center", gap: 10 },
  headingIcon: { width: 36, height: 36, borderRadius: 11, backgroundColor: "#FFF4DF", alignItems: "center", justifyContent: "center" },
  headingCopy: { flex: 1 },
  sectionTitle: { color: colors.ink, fontSize: 16, fontWeight: "800" },
  sectionSubtitle: { color: colors.muted, fontSize: 10, marginTop: 3 },
  infoNote: { flexDirection: "row", gap: 8, alignItems: "flex-start", backgroundColor: "#EFF6FF", borderRadius: 10, padding: 11 },
  infoText: { flex: 1, color: colors.info, fontSize: 10, lineHeight: 15 },
  fieldWrap: { gap: 6 },
  fieldLabel: { color: colors.muted, fontSize: 9, fontWeight: "800", letterSpacing: 0.6 },
  input: { minHeight: 45, borderWidth: 1, borderColor: colors.border, borderRadius: 11, backgroundColor: "#fff", paddingHorizontal: 12, color: colors.ink, fontSize: 12 },
  hint: { color: colors.muted, fontSize: 10 },
  readOnlyNote: { color: colors.alert, fontSize: 11, lineHeight: 16, textAlign: "center" },
  emptyCard: { alignItems: "center", gap: 9, padding: 22 },
  emptyIcon: { width: 52, height: 52, borderRadius: 17, backgroundColor: "#FFF4DF", alignItems: "center", justifyContent: "center" },
  emptyTitle: { color: colors.ink, fontSize: 13, fontWeight: "800", textAlign: "center" },
  emptyText: { color: colors.muted, fontSize: 11, textAlign: "center", lineHeight: 16 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  statCard: { width: "48%", minHeight: 135, padding: 13, gap: 4 },
  statWide: { width: "100%", minHeight: 122 },
  statIcon: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: 3 },
  statLabel: { color: colors.muted, fontSize: 8, fontWeight: "800", letterSpacing: 0.5 },
  statValue: { color: colors.ink, fontSize: 23, fontWeight: "800" },
  statValueSmall: { color: colors.ink, fontSize: 16, fontWeight: "800", marginTop: 2 },
  statHint: { color: colors.muted, fontSize: 9 },
  listHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 2 },
  refreshButton: { width: 36, height: 36, borderRadius: 11, backgroundColor: "#fff", borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  noClasses: { flexDirection: "row", alignItems: "center", gap: 9 },
  noClassesText: { flex: 1, color: colors.muted, fontSize: 11, lineHeight: 16 },
  classCard: { padding: 14, gap: 11 },
  classHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  classIcon: { width: 33, height: 33, borderRadius: 10, backgroundColor: "#FFF4DF", alignItems: "center", justifyContent: "center" },
  classTitle: { flex: 1, color: colors.ink, fontSize: 14, fontWeight: "800" },
  studentBadge: { backgroundColor: "#EAF2FF", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 5 },
  studentBadgeText: { color: colors.info, fontSize: 9, fontWeight: "800" },
  countList: { gap: 9 },
  countRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  countLabelWrap: { flexDirection: "row", alignItems: "center", gap: 7 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  countLabel: { color: colors.muted, fontSize: 10 },
  countValueWrap: { flexDirection: "row", alignItems: "center", gap: 7 },
  countValue: { minWidth: 17, color: colors.ink, fontSize: 11, fontWeight: "800", textAlign: "right" },
  passRateRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingTop: 10 },
  passRateLabel: { color: colors.muted, fontSize: 10 },
  passRateValue: { color: "#15966A", fontSize: 13, fontWeight: "800" },
  nextStepsCard: { padding: 15, gap: 13 },
  stepRow: { flexDirection: "row", alignItems: "flex-start", gap: 9 },
  stepNumber: { width: 22, height: 22, borderRadius: 7, backgroundColor: "#FFF4DF", alignItems: "center", justifyContent: "center" },
  stepNumberText: { color: colors.amberDark, fontSize: 10, fontWeight: "800" },
  stepText: { flex: 1, color: colors.text, fontSize: 11, lineHeight: 16, paddingTop: 2 },
});
