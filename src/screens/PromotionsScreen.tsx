import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Button, Card } from "../components/UI";
import { useAuth } from "../context/AuthContext";
import { extractList, Row } from "../lib/format";
import { get, send } from "../lib/api";
import { colors } from "../theme";

const STATUSES = [
  "Promoted",
  "Promoted with Conditions",
  "Detained",
  "Transferred",
  "Graduated",
] as const;
type PromotionStatus = (typeof STATUSES)[number];
type AcademicSession = Row & { _id?: string; name?: string; isCurrent?: boolean };
type SchoolClass = Row & { _id?: string; name: string; active?: boolean; status?: string };
type SchoolSection = Row & {
  _id?: string;
  name: string;
  className?: string;
  classId?: string;
  active?: boolean;
  status?: string;
};
type PreviewRow = {
  studentId: string;
  name: string;
  rollNo?: string;
  class: string;
  section?: string;
  suggestedStatus: PromotionStatus;
  pct: string;
  failed: number;
  include: boolean;
};
type PromotionPreview = {
  fromSession: string;
  toSession: string;
  rows: Row[];
};
type PromotionHistory = Row & {
  _id: string;
  studentName: string;
  fromClass?: string;
  fromSection?: string;
  toClass?: string;
  toSection?: string;
  session: string;
  status: PromotionStatus;
  actedByName?: string;
  createdAt?: string;
};
type PickerState = {
  title: string;
  options: string[];
  onSelect: (value: string) => void;
} | null;

const classLabel = (value: string) =>
  ["Nursery", "LKG", "UKG"].includes(value) ? value : `Class ${value}`;
const movingStatuses: PromotionStatus[] = ["Promoted", "Promoted with Conditions"];

function suggestedStatus(summary: Row | undefined): PromotionStatus {
  const subjects = Array.isArray(summary?.subjects) ? summary.subjects : [];
  const failed = Number(summary?.failedSubjects || 0);
  if (subjects.length === 0) return "Promoted";
  if (failed >= 3) return "Detained";
  if (failed >= 1) return "Promoted with Conditions";
  return "Promoted";
}

function statusColors(status: string) {
  if (status === "Promoted") return { bg: "#E8F7EF", text: "#15966A" };
  if (status === "Promoted with Conditions") return { bg: "#EAF2FF", text: "#2563C7" };
  if (status === "Detained") return { bg: "#FDECEC", text: colors.alert };
  return { bg: "#F0F2F5", text: colors.muted };
}

function PickerModal({
  picker,
  onClose,
}: {
  picker: PickerState;
  onClose: () => void;
}) {
  if (!picker) return null;
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.modalBackdrop}>
        <View style={s.modalCard}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>{picker.title}</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={23} color={colors.muted} />
            </Pressable>
          </View>
          <FlatList
            data={picker.options}
            keyExtractor={(item, index) => `${item}-${index}`}
            style={{ maxHeight: 420 }}
            renderItem={({ item }) => (
              <Pressable
                style={s.optionRow}
                onPress={() => {
                  picker.onSelect(item);
                  onClose();
                }}
              >
                <Text style={s.optionText}>{item}</Text>
                <Ionicons name="chevron-forward" size={17} color={colors.muted} />
              </Pressable>
            )}
            ListEmptyComponent={<Text style={s.emptyOptions}>No options available.</Text>}
          />
        </View>
      </View>
    </Modal>
  );
}

function SelectField({
  label,
  value,
  placeholder,
  onPress,
}: {
  label: string;
  value: string;
  placeholder: string;
  onPress: () => void;
}) {
  return (
    <View style={s.fieldWrap}>
      <Text style={s.fieldLabel}>{label}</Text>
      <Pressable style={s.selectField} onPress={onPress}>
        <Text style={[s.selectValue, !value && s.placeholder]}>
          {value || placeholder}
        </Text>
        <Ionicons name="chevron-down" size={17} color={colors.muted} />
      </Pressable>
    </View>
  );
}

export default function PromotionsScreen() {
  const { can } = useAuth();
  const canPromote = can("promotion:write");
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [sections, setSections] = useState<SchoolSection[]>([]);
  const [fromSession, setFromSession] = useState("");
  const [toSession, setToSession] = useState("");
  const [classFilter, setClassFilter] = useState("All");
  const [sectionFilter, setSectionFilter] = useState("All");
  const [toClass, setToClass] = useState("");
  const [toSection, setToSection] = useState("");
  const [preview, setPreview] = useState<PromotionPreview | null>(null);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [history, setHistory] = useState<PromotionHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const [masterError, setMasterError] = useState("");
  const [picker, setPicker] = useState<PickerState>(null);

  const loadReferenceData = useCallback(async () => {
    setLoading(true);
    setMasterError("");
    const results = await Promise.allSettled([
      get("/auth/sessions"),
      get("/exam-masters/classes"),
      get("/exam-masters/sections"),
    ]);
    if (results[0].status === "fulfilled") {
      const available = extractList(results[0].value.data) as AcademicSession[];
      const current = available.find((item) => item.isCurrent);
      if (current?.name) setFromSession((value) => value || current.name || "");
    } else {
      setMasterError(
        results[0].reason instanceof Error
          ? `Could not load academic sessions: ${results[0].reason.message}`
          : "Could not load academic sessions.",
      );
    }
    const errors: string[] = [];
    if (results[1].status === "fulfilled") {
      setClasses(extractList(results[1].value.data) as SchoolClass[]);
    } else {
      errors.push("Class options could not be loaded.");
    }
    if (results[2].status === "fulfilled") {
      setSections(extractList(results[2].value.data) as SchoolSection[]);
    } else {
      errors.push("Section options could not be loaded.");
    }
    if (errors.length) setMasterError((value) => [value, ...errors].filter(Boolean).join(" "));
    setLoading(false);
  }, []);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const response = await get("/promotions/history?limit=25");
      setHistory(extractList(response.data) as PromotionHistory[]);
    } catch (error) {
      setHistoryError(
        error instanceof Error ? error.message : "Could not load promotion history.",
      );
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    await Promise.all([loadReferenceData(), loadHistory()]);
    setRefreshing(false);
  }, [loadHistory, loadReferenceData]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeClasses = useMemo(
    () =>
      classes
        .filter((item) => item.active !== false && item.status !== "inactive")
        .map((item) => item.name)
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    [classes],
  );
  const activeSections = useMemo(
    () => sections.filter((item) => item.active !== false && item.status !== "inactive"),
    [sections],
  );
  const sectionsFor = useCallback(
    (className: string) =>
      [...new Set(
        activeSections
          .filter((item) => !className || item.className === className)
          .map((item) => item.name)
          .filter(Boolean),
      )].sort((a, b) => a.localeCompare(b)),
    [activeSections],
  );
  const filteredSections = useMemo(
    () => sectionsFor(classFilter),
    [classFilter, sectionsFor],
  );
  const targetSections = useMemo(
    () => sectionsFor(toClass),
    [toClass, sectionsFor],
  );

  const runPreview = useCallback(async () => {
    if (!fromSession.trim() || !toSession.trim()) {
      Alert.alert("Sessions required", "Enter both the current and next academic session.");
      return;
    }
    if (fromSession.trim() === toSession.trim()) {
      Alert.alert("Invalid sessions", "From and to sessions must be different.");
      return;
    }
    setPreviewLoading(true);
    setPreview(null);
    setRows([]);
    try {
      const params = new URLSearchParams({
        fromSession: fromSession.trim(),
        toSession: toSession.trim(),
      });
      if (classFilter !== "All") params.set("class", classFilter);
      if (sectionFilter !== "All") params.set("section", sectionFilter);
      const response = await get(`/promotions/preview?${params.toString()}`);
      const data = response.data as PromotionPreview;
      setPreview(data);
      setRows(
        (data.rows || []).map((item) => {
          const summary = item.summary as Row | undefined;
          const status = String(item.suggestedStatus || suggestedStatus(summary));
          return {
            studentId: String(item.studentId || ""),
            name: String(item.name || "Student"),
            rollNo: item.rollNo ? String(item.rollNo) : "",
            class: String(item.class || ""),
            section: item.section ? String(item.section) : "",
            suggestedStatus: STATUSES.includes(status as PromotionStatus)
              ? (status as PromotionStatus)
              : "Promoted",
            pct:
              summary?.percentage == null
                ? "—"
                : Number(summary.percentage).toFixed(2),
            failed: Number(summary?.failedSubjects || 0),
            include: true,
          };
        }),
      );
    } catch (error) {
      Alert.alert(
        "Preview failed",
        error instanceof Error ? error.message : "Could not preview promotions.",
      );
    } finally {
      setPreviewLoading(false);
    }
  }, [classFilter, fromSession, sectionFilter, toSession]);

  const includedRows = rows.filter((row) => row.include);
  const counts = useMemo(
    () =>
      Object.fromEntries(
        STATUSES.map((status) => [
          status,
          includedRows.filter((row) => row.suggestedStatus === status).length,
        ]),
      ) as Record<PromotionStatus, number>,
    [includedRows],
  );

  const commit = useCallback(async () => {
    if (!preview || !canPromote) return;
    if (!includedRows.length) {
      Alert.alert("No students selected", "Select at least one student to promote.");
      return;
    }
    const decisions = includedRows.map((row) => {
      const moving = movingStatuses.includes(row.suggestedStatus);
      return {
        studentId: row.studentId,
        status: row.suggestedStatus,
        ...(moving
          ? {
              toClass:
                toClass ||
                String(Number(row.class) + 1 || row.class),
              toSection: toSection || row.section || "A",
            }
          : {}),
      };
    });
    setCommitting(true);
    try {
      const response = await send<Row[]>(
        "/promotions",
        "POST",
        {
          fromSession: preview.fromSession,
          toSession: preview.toSession,
          decisions,
        },
      );
      const count = extractList(response.data).length || decisions.length;
      Alert.alert("Promotions recorded", `Promotion recorded for ${count} student(s).`);
      setPreview(null);
      setRows([]);
      await loadHistory();
    } catch (error) {
      Alert.alert(
        "Could not commit promotions",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setCommitting(false);
    }
  }, [canPromote, includedRows, loadHistory, preview, toClass, toSection]);

  const exportHistory = useCallback(async () => {
    try {
      await Share.share({
        title: "Promotion history",
        message: JSON.stringify(history, null, 2),
      });
    } catch (error) {
      Alert.alert(
        "Export failed",
        error instanceof Error ? error.message : "Could not share promotion history.",
      );
    }
  }, [history]);

  const setRowStatus = useCallback((studentId: string, status: PromotionStatus) => {
    setRows((current) =>
      current.map((row) =>
        row.studentId === studentId ? { ...row, suggestedStatus: status } : row,
      ),
    );
  }, []);
  const toggleRow = useCallback((studentId: string) => {
    setRows((current) =>
      current.map((row) =>
        row.studentId === studentId ? { ...row, include: !row.include } : row,
      ),
    );
  }, []);

  if (loading) {
    return <ActivityIndicator style={{ flex: 1 }} size="large" color={colors.ink} />;
  }

  return (
    <View style={s.screen}>
      <ScrollView
        contentContainerStyle={s.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load(true)}
            tintColor={colors.ink}
          />
        }
      >
        <View style={s.hero}>
          <View style={s.heroIcon}>
            <Ionicons name="school-outline" size={24} color="#fff" />
          </View>
          <Text style={s.eyebrow}>ACADEMICS</Text>
          <Text style={s.title}>Promotions</Text>
          <Text style={s.subtitle}>
            Review suggested decisions from recorded marks before changing student sessions.
          </Text>
        </View>

        {!!masterError && (
          <View style={s.warningBox}>
            <Ionicons name="warning-outline" size={18} color="#A66500" />
            <Text style={s.warningText}>{masterError}</Text>
          </View>
        )}

        <Card style={s.panel}>
          <Text style={s.panelTitle}>Promotion Preview</Text>
          <Text style={s.sectionLabel}>CURRENT & NEXT SESSION</Text>
          <View style={s.fieldsRow}>
            <View style={s.fieldWrap}>
              <Text style={s.fieldLabel}>From session</Text>
              <TextInput
                style={s.textField}
                value={fromSession}
                onChangeText={setFromSession}
                placeholder="e.g. 2025-26"
                placeholderTextColor="#98A2B3"
              />
            </View>
            <View style={s.fieldWrap}>
              <Text style={s.fieldLabel}>To session</Text>
              <TextInput
                style={s.textField}
                value={toSession}
                onChangeText={setToSession}
                placeholder="e.g. 2026-27"
                placeholderTextColor="#98A2B3"
              />
            </View>
          </View>
          <Text style={[s.sectionLabel, { marginTop: 14 }]}>OPTIONAL ROSTER FILTER</Text>
          <View style={s.fieldsRow}>
            <SelectField
              label="Class"
              value={classFilter === "All" ? "" : classLabel(classFilter)}
              placeholder="All Classes"
              onPress={() =>
                setPicker({
                  title: "Filter by class",
                  options: ["All", ...activeClasses],
                  onSelect: (value) => {
                    setClassFilter(value);
                    setSectionFilter("All");
                  },
                })
              }
            />
            <SelectField
              label="Section"
              value={sectionFilter === "All" ? "" : `Section ${sectionFilter}`}
              placeholder="All Sections"
              onPress={() =>
                setPicker({
                  title: "Filter by section",
                  options: ["All", ...filteredSections],
                  onSelect: setSectionFilter,
                })
              }
            />
          </View>
          <Button
            title={previewLoading ? "Preparing preview..." : "Preview promotions"}
            onPress={() => void runPreview()}
            loading={previewLoading}
          />
        </Card>

        {preview && (
          <>
            <View style={s.summaryGrid}>
              <Card style={s.summaryCard}>
                <Text style={s.summaryValue}>{rows.length}</Text>
                <Text style={s.summaryLabel}>Students</Text>
              </Card>
              <Card style={s.summaryCard}>
                <Text style={[s.summaryValue, { color: "#15966A" }]}>{counts.Promoted}</Text>
                <Text style={s.summaryLabel}>Promoted</Text>
              </Card>
              <Card style={s.summaryCard}>
                <Text style={[s.summaryValue, { color: "#2563C7" }]}>
                  {counts["Promoted with Conditions"]}
                </Text>
                <Text style={s.summaryLabel}>Conditional</Text>
              </Card>
              <Card style={s.summaryCard}>
                <Text style={[s.summaryValue, { color: colors.alert }]}>{counts.Detained}</Text>
                <Text style={s.summaryLabel}>Detained</Text>
              </Card>
            </View>
            <Card style={s.panel}>
              <Text style={s.panelTitle}>Decision Table</Text>
              <Text style={s.sessionRange}>
                {preview.fromSession}  →  {preview.toSession}
              </Text>
              {canPromote && (
                <View style={s.targetFields}>
                  <SelectField
                    label="Target class for promoted students"
                    value={toClass ? classLabel(toClass) : ""}
                    placeholder="Auto: next class"
                    onPress={() =>
                      setPicker({
                        title: "Target class",
                        options: activeClasses,
                        onSelect: (value) => {
                          setToClass(value);
                          setToSection("");
                        },
                      })
                    }
                  />
                  <SelectField
                    label="Target section"
                    value={toSection ? `Section ${toSection}` : ""}
                    placeholder="Keep current section"
                    onPress={() =>
                      setPicker({
                        title: "Target section",
                        options: targetSections.length ? targetSections : sectionsFor(""),
                        onSelect: setToSection,
                      })
                    }
                  />
                </View>
              )}
              {!canPromote && (
                <Text style={s.readOnlyNote}>
                  Read-only access: only users with promotion write permission can edit or commit decisions.
                </Text>
              )}
              {rows.length === 0 ? (
                <Text style={s.noRows}>No students found for this session and class filter.</Text>
              ) : (
                rows.map((row) => {
                  const tone = statusColors(row.suggestedStatus);
                  return (
                    <View key={row.studentId} style={s.studentRow}>
                      {canPromote && (
                        <Pressable
                          onPress={() => toggleRow(row.studentId)}
                          hitSlop={6}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: row.include }}
                          accessibilityLabel={`Include ${row.name}`}
                        >
                          <Ionicons
                            name={row.include ? "checkbox" : "square-outline"}
                            size={21}
                            color={row.include ? colors.ink : colors.muted}
                          />
                        </Pressable>
                      )}
                      <View style={s.studentInfo}>
                        <Text style={s.studentName}>{row.name}</Text>
                        <Text style={s.studentMeta}>
                          {row.studentId}{row.rollNo ? ` · Roll ${row.rollNo}` : ""}
                        </Text>
                        <Text style={s.studentMeta}>
                          {classLabel(row.class)}{row.section ? `-${row.section}` : ""}
                          {" · "}{row.pct}% · {row.failed} failed
                        </Text>
                      </View>
                      {canPromote ? (
                        <Pressable
                          onPress={() =>
                            setPicker({
                              title: `Decision for ${row.name}`,
                              options: [...STATUSES],
                              onSelect: (value) => setRowStatus(row.studentId, value as PromotionStatus),
                            })
                          }
                          style={[s.statusSelect, { backgroundColor: tone.bg }]}
                        >
                          <Text style={[s.statusSelectText, { color: tone.text }]} numberOfLines={2}>
                            {row.suggestedStatus}
                          </Text>
                          <Ionicons name="chevron-down" size={14} color={tone.text} />
                        </Pressable>
                      ) : (
                        <View style={[s.statusSelect, { backgroundColor: tone.bg }]}>
                          <Text style={[s.statusSelectText, { color: tone.text }]}>
                            {row.suggestedStatus}
                          </Text>
                        </View>
                      )}
                    </View>
                  );
                })
              )}
              {canPromote && rows.length > 0 && (
                <Button
                  title={committing ? "Committing..." : `Commit ${includedRows.length} promotion(s)`}
                  onPress={() =>
                    Alert.alert(
                      "Confirm promotions",
                      `Commit promotion decisions for ${includedRows.length} student(s) from ${preview.fromSession} to ${preview.toSession}?`,
                      [
                        { text: "Cancel", style: "cancel" },
                        { text: "Commit", style: "destructive", onPress: () => void commit() },
                      ],
                    )
                  }
                  loading={committing}
                />
              )}
            </Card>
          </>
        )}

        <Card style={s.panel}>
          <View style={s.historyHeader}>
            <View>
              <Text style={s.panelTitle}>Promotion History</Text>
              <Text style={s.panelSubtitle}>{history.length} recent records</Text>
            </View>
            <Pressable
              style={s.shareButton}
              onPress={() => void exportHistory()}
              disabled={!history.length}
              accessibilityRole="button"
              accessibilityLabel="Share promotion history"
            >
              <Ionicons
                name="share-outline"
                size={18}
                color={history.length ? colors.ink : colors.muted}
              />
            </Pressable>
          </View>
          {historyLoading ? (
            <ActivityIndicator color={colors.ink} style={{ paddingVertical: 20 }} />
          ) : historyError ? (
            <View style={s.historyError}>
              <Text style={s.errorText}>{historyError}</Text>
              <Pressable onPress={() => void loadHistory()}>
                <Text style={s.retryText}>Retry</Text>
              </Pressable>
            </View>
          ) : history.length === 0 ? (
            <Text style={s.noRows}>No promotions recorded yet.</Text>
          ) : (
            history.map((item) => {
              const tone = statusColors(item.status);
              return (
                <View key={item._id} style={s.historyRow}>
                  <View style={s.historyIcon}>
                    <Ionicons name="school-outline" size={17} color={colors.amberDark} />
                  </View>
                  <View style={s.studentInfo}>
                    <Text style={s.studentName}>{item.studentName}</Text>
                    <Text style={s.studentMeta}>
                      {classLabel(item.fromClass || "")}
                      {item.fromSection ? `-${item.fromSection}` : ""}
                      {" → "}
                      {item.toClass ? classLabel(item.toClass) : "—"}
                      {item.toSection ? `-${item.toSection}` : ""}
                    </Text>
                    <Text style={s.studentMeta}>
                      {item.session} · {item.actedByName || "—"}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 5 }}>
                    <Text style={[s.historyStatus, { color: tone.text, backgroundColor: tone.bg }]}>
                      {item.status}
                    </Text>
                    <Text style={s.dateText}>
                      {item.createdAt ? new Date(item.createdAt).toLocaleDateString("en-IN") : "—"}
                    </Text>
                  </View>
                </View>
              );
            })
          )}
        </Card>
      </ScrollView>
      <PickerModal picker={picker} onClose={() => setPicker(null)} />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 16, paddingBottom: 36, gap: 14 },
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
  title: { color: "#fff", fontSize: 25, fontWeight: "800", marginTop: 4 },
  subtitle: { color: "rgba(255,255,255,0.76)", fontSize: 13, lineHeight: 19, marginTop: 5 },
  warningBox: {
    flexDirection: "row",
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#F0D394",
    backgroundColor: "#FFF8E8",
    padding: 12,
  },
  warningText: { flex: 1, color: "#855300", fontSize: 11, lineHeight: 17 },
  panel: { gap: 12 },
  panelTitle: { color: colors.ink, fontSize: 16, fontWeight: "800" },
  panelSubtitle: { color: colors.muted, fontSize: 11, marginTop: 3 },
  sectionLabel: { color: colors.muted, fontSize: 9, fontWeight: "800", letterSpacing: 1 },
  fieldsRow: { flexDirection: "row", gap: 10 },
  fieldWrap: { flex: 1, gap: 6 },
  fieldLabel: { color: colors.muted, fontSize: 10, fontWeight: "700" },
  selectField: {
    minHeight: 43,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 11,
    backgroundColor: "#fff",
    paddingHorizontal: 10,
  },
  selectValue: { flex: 1, color: colors.ink, fontSize: 11, fontWeight: "600" },
  placeholder: { color: "#98A2B3", fontWeight: "500" },
  textField: {
    minHeight: 43,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 11,
    backgroundColor: "#fff",
    paddingHorizontal: 10,
    color: colors.ink,
    fontSize: 11,
  },
  summaryGrid: { flexDirection: "row", gap: 7 },
  summaryCard: { flex: 1, alignItems: "center", paddingHorizontal: 5, paddingVertical: 12 },
  summaryValue: { color: colors.ink, fontSize: 20, fontWeight: "800" },
  summaryLabel: { color: colors.muted, fontSize: 9, fontWeight: "600", textAlign: "center", marginTop: 3 },
  sessionRange: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  targetFields: { gap: 9 },
  readOnlyNote: { color: colors.muted, fontSize: 11, lineHeight: 17 },
  studentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingVertical: 11,
  },
  studentInfo: { flex: 1, minWidth: 0 },
  studentName: { color: colors.ink, fontSize: 12, fontWeight: "800" },
  studentMeta: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 2 },
  statusSelect: {
    maxWidth: 128,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 7,
  },
  statusSelectText: { flexShrink: 1, fontSize: 9, fontWeight: "800" },
  noRows: { color: colors.muted, fontSize: 12, textAlign: "center", paddingVertical: 17 },
  historyHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  shareButton: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: colors.paper,
    alignItems: "center",
    justifyContent: "center",
  },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingVertical: 11,
  },
  historyIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: "#FFF4DF",
    alignItems: "center",
    justifyContent: "center",
  },
  historyStatus: { fontSize: 8, fontWeight: "800", paddingHorizontal: 7, paddingVertical: 5, borderRadius: 8, overflow: "hidden" },
  dateText: { color: colors.muted, fontSize: 9 },
  historyError: { alignItems: "center", gap: 8, paddingVertical: 15 },
  errorText: { color: colors.alert, fontSize: 11, textAlign: "center" },
  retryText: { color: colors.info, fontSize: 12, fontWeight: "800" },
  modalBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(12,20,35,0.4)" },
  modalCard: { backgroundColor: colors.card, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, paddingBottom: 28 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  modalTitle: { color: colors.ink, fontSize: 17, fontWeight: "800" },
  optionRow: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  optionText: { color: colors.ink, fontSize: 13, fontWeight: "600" },
  emptyOptions: { color: colors.muted, fontSize: 12, textAlign: "center", paddingVertical: 20 },
});
