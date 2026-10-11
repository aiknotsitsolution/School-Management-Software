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
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Button, Card } from "../components/UI";
import { useAuth } from "../context/AuthContext";
import { get, send } from "../lib/api";
import { Row } from "../lib/format";
import { colors } from "../theme";

type AcademicSession = Row & {
  _id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: "planned" | "active" | "ended" | string;
  isCurrent: boolean;
  metadata?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
};
type SessionForm = { name: string; startDate: string; endDate: string };
const EMPTY_FORM: SessionForm = { name: "", startDate: "", endDate: "" };

function dateInputValue(value?: string) {
  if (!value) return "";
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return match ? match[1] : "";
}

function dateLabel(value?: string) {
  const dateValue = dateInputValue(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue);
  if (!match) return "—";
  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12),
  );
  return date.toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function isValidDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function validate(form: SessionForm) {
  if (!form.startDate || !form.endDate) return "Start and end dates are required.";
  if (!isValidDate(form.startDate) || !isValidDate(form.endDate)) {
    return "Enter valid dates in YYYY-MM-DD format.";
  }
  if (form.endDate <= form.startDate) return "End date must be after start date.";
  return "";
}

function statusTone(status: string) {
  if (status === "active") return { bg: "#E8F7EF", color: "#15966A", label: "Active" };
  if (status === "ended") return { bg: "#F0F2F5", color: colors.muted, label: "Ended" };
  return { bg: "#EAF2FF", color: "#2563C7", label: "Planned" };
}

function parseSessions(payload: unknown): AcademicSession[] {
  let rows: unknown = payload;
  if (!Array.isArray(rows) && rows && typeof rows === "object") {
    const response = rows as Row;
    rows = Array.isArray(response.data)
      ? response.data
      : Array.isArray(response.sessions)
        ? response.sessions
        : null;
  }
  if (!Array.isArray(rows)) {
    throw new Error("The sessions response did not contain a session list.");
  }
  return rows.map((value) => {
    if (!value || typeof value !== "object") {
      throw new Error("The sessions response contains an invalid session.");
    }
    const row = value as Row;
    if (
      typeof row._id !== "string" ||
      typeof row.name !== "string" ||
      typeof row.startDate !== "string" ||
      typeof row.endDate !== "string"
    ) {
      throw new Error("A session is missing its name or date details.");
    }
    return {
      ...row,
      _id: row._id,
      name: row.name,
      startDate: row.startDate,
      endDate: row.endDate,
      status: typeof row.status === "string" ? row.status : "planned",
      isCurrent: row.isCurrent === true,
      metadata:
        row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
          ? (row.metadata as Record<string, unknown>)
          : undefined,
    } as AcademicSession;
  });
}

function detailValue(value: unknown) {
  if (value == null || value === "") return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export default function AcademicSessionsScreen() {
  const { can } = useAuth();
  const canWrite = can("sessions:write");
  const [sessions, setSessions] = useState<AcademicSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<AcademicSession | null>(null);
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const [form, setForm] = useState<SessionForm>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setLoadError("");
    try {
      const response = await get("/auth/sessions");
      const rows = parseSessions(response.data);
      setSessions(
        rows.sort(
          (a, b) =>
            dateInputValue(b.startDate).localeCompare(dateInputValue(a.startDate)),
        ),
      );
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Could not load academic sessions.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const currentCount = useMemo(
    () => sessions.filter((session) => session.isCurrent).length,
    [sessions],
  );
  const plannedCount = useMemo(
    () => sessions.filter((session) => session.status === "planned").length,
    [sessions],
  );

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setModalVisible(true);
  };

  const openEdit = (session: AcademicSession) => {
    setEditing(session);
    setForm({
      name: session.name || "",
      startDate: dateInputValue(session.startDate),
      endDate: dateInputValue(session.endDate),
    });
    setModalVisible(true);
  };

  const formatMetadataKey = (key: string) =>
    key.replace(/([A-Z])/g, " $1").replace(/[_-]/g, " ").replace(/^\w/, (c) => c.toUpperCase());

  const save = useCallback(async () => {
    const validationMessage = validate(form);
    if (validationMessage) {
      Alert.alert("Check session details", validationMessage);
      return;
    }
    setBusy(true);
    try {
      const payload = {
        name: form.name.trim(),
        startDate: form.startDate,
        endDate: form.endDate,
      };
      const response = editing
        ? await send<AcademicSession>(
            `/auth/sessions/${encodeURIComponent(editing._id)}`,
            "PATCH",
            payload,
          )
        : await send<AcademicSession>("/auth/sessions", "POST", payload);
      const savedSession = response.data;
      setModalVisible(false);
      setEditing(null);
      setForm(EMPTY_FORM);
      Alert.alert(
        editing ? "Session updated" : "Session created",
        savedSession?.isCurrent
          ? "This session is now the current academic session."
          : undefined,
      );
      await load(true);
    } catch (error) {
      Alert.alert(
        "Could not save session",
        error instanceof Error ? error.message : "Please check the dates and try again.",
      );
    } finally {
      setBusy(false);
    }
  }, [editing, form, load]);

  const performAction = useCallback(
    async (
      session: AcademicSession,
      action: "activate" | "end" | "delete",
    ) => {
      if (!canWrite || busy) return;
      const actionText = {
        activate: `Make "${session.name}" the current academic session? The previous current session will be marked as ended.`,
        end: `End "${session.name}"? Existing records are preserved for this session.`,
        delete: `Delete "${session.name}"? Only future, never-started sessions can be removed.`,
      }[action];
      Alert.alert(
        action === "activate"
          ? "Activate session"
          : action === "end"
            ? "End session"
            : "Delete session",
        actionText,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: action === "delete" ? "Delete" : action === "end" ? "End session" : "Activate",
            style: action === "delete" || action === "end" ? "destructive" : "default",
            onPress: async () => {
              setBusy(true);
              try {
                if (action === "activate") {
                  await send(`/auth/sessions/${encodeURIComponent(session._id)}/activate`, "POST", {});
                } else if (action === "end") {
                  await send(`/auth/sessions/${encodeURIComponent(session._id)}/end`, "POST", {});
                } else {
                  await send(`/auth/sessions/${encodeURIComponent(session._id)}`, "DELETE");
                }
                Alert.alert(
                  "Success",
                  action === "activate"
                    ? "Session activated."
                    : action === "end"
                      ? "Session ended."
                      : "Session deleted.",
                );
                await load(true);
              } catch (error) {
                Alert.alert(
                  "Action failed",
                  error instanceof Error ? error.message : "Please try again.",
                );
              } finally {
                setBusy(false);
              }
            },
          },
        ],
      );
    },
    [busy, canWrite, load],
  );

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
          <View style={s.heroTop}>
            <View style={s.heroIcon}>
              <Ionicons name="calendar-outline" size={24} color="#fff" />
            </View>
            {canWrite && (
              <Pressable style={s.heroAddButton} onPress={openCreate}>
                <Ionicons name="add" size={18} color={colors.ink} />
                <Text style={s.heroAddText}>New Session</Text>
              </Pressable>
            )}
          </View>
          <Text style={s.eyebrow}>ACADEMICS</Text>
          <Text style={s.title}>Academic Sessions</Text>
          <Text style={s.subtitle}>
            Set school-year dates. The current session is used across fees,
            assignments, marks and report cards.
          </Text>
        </View>

        <View style={s.summaryRow}>
          <Card style={s.summaryCard}>
            <Text style={s.summaryValue}>{sessions.length}</Text>
            <Text style={s.summaryLabel}>Total sessions</Text>
          </Card>
          <Card style={s.summaryCard}>
            <Text style={[s.summaryValue, { color: "#15966A" }]}>{currentCount}</Text>
            <Text style={s.summaryLabel}>Current</Text>
          </Card>
          <Card style={s.summaryCard}>
            <Text style={[s.summaryValue, { color: "#2563C7" }]}>{plannedCount}</Text>
            <Text style={s.summaryLabel}>Planned</Text>
          </Card>
        </View>

        <View style={s.listHeader}>
          <View>
            <Text style={s.sectionTitle}>Sessions</Text>
            <Text style={s.sectionSubtitle}>
              {currentCount === 1 ? "One session is active" : "No current session configured"}
            </Text>
          </View>
        </View>

        {!!loadError && (
          <Card style={s.errorCard}>
            <Ionicons name="cloud-offline-outline" size={25} color={colors.alert} />
            <Text style={s.errorText}>{loadError}</Text>
            <Pressable onPress={() => void load()}>
              <Text style={s.retryText}>Retry</Text>
            </Pressable>
          </Card>
        )}

        {!loadError && sessions.length === 0 ? (
          <Card style={s.emptyCard}>
            <View style={s.emptyIcon}>
              <Ionicons name="calendar-outline" size={29} color={colors.amberDark} />
            </View>
            <Text style={s.emptyTitle}>No academic session configured</Text>
            <Text style={s.emptyDescription}>
              Create or activate a session to set the school calendar and session used by academic records.
            </Text>
            {canWrite && (
              <Button title="Create First Session" onPress={openCreate} />
            )}
          </Card>
        ) : !loadError ? (
          sessions.map((session) => {
            const tone = statusTone(session.status);
            const current = session.isCurrent && session.status === "active";
            return (
              <Card
                key={session._id}
                style={
                  current
                    ? {
                        gap: 10,
                        padding: 14,
                        borderColor: "#B7E8CE",
                        borderWidth: 1,
                      }
                    : s.sessionCard
                }
              >
                <View style={s.sessionHeader}>
                  <View style={s.sessionIcon}>
                    <Ionicons
                      name={current ? "checkmark-circle" : "calendar"}
                      size={21}
                      color={current ? "#15966A" : colors.amberDark}
                    />
                  </View>
                  <View style={s.sessionInfo}>
                    <Text style={s.sessionName}>{session.name}</Text>
                    <Text style={s.dateRange}>
                      {dateLabel(session.startDate)}  →  {dateLabel(session.endDate)}
                    </Text>
                  </View>
                </View>
                <Pressable
                  style={s.detailsToggle}
                  accessibilityRole="button"
                  accessibilityLabel={
                    expandedSessionId === session._id
                      ? `Hide details for ${session.name}`
                      : `View details for ${session.name}`
                  }
                  onPress={() =>
                    setExpandedSessionId((current) =>
                      current === session._id ? null : session._id,
                    )
                  }
                >
                  <Text style={s.detailsToggleText}>
                    {expandedSessionId === session._id ? "Hide details" : "View full details"}
                  </Text>
                  <Ionicons
                    name={expandedSessionId === session._id ? "chevron-up" : "chevron-down"}
                    size={15}
                    color={colors.info}
                  />
                </Pressable>
                {expandedSessionId === session._id && (
                  <View style={s.detailPanel}>
                    <View style={s.detailRow}>
                      <Text style={s.detailLabel}>Session name</Text>
                      <Text style={s.detailValue}>{session.name}</Text>
                    </View>
                    <View style={s.detailRow}>
                      <Text style={s.detailLabel}>Start date</Text>
                      <Text style={s.detailValue}>{dateLabel(session.startDate)}</Text>
                    </View>
                    <View style={s.detailRow}>
                      <Text style={s.detailLabel}>End date</Text>
                      <Text style={s.detailValue}>{dateLabel(session.endDate)}</Text>
                    </View>
                    <View style={s.detailRow}>
                      <Text style={s.detailLabel}>Status</Text>
                      <Text style={s.detailValue}>{tone.label}</Text>
                    </View>
                    <View style={s.detailRow}>
                      <Text style={s.detailLabel}>Current session</Text>
                      <Text style={s.detailValue}>{session.isCurrent ? "Yes" : "No"}</Text>
                    </View>
                    {session.createdAt && (
                      <View style={s.detailRow}>
                        <Text style={s.detailLabel}>Created</Text>
                        <Text style={s.detailValue}>{dateLabel(session.createdAt)}</Text>
                      </View>
                    )}
                    {session.updatedAt && (
                      <View style={s.detailRow}>
                        <Text style={s.detailLabel}>Last updated</Text>
                        <Text style={s.detailValue}>{dateLabel(session.updatedAt)}</Text>
                      </View>
                    )}
                    {Object.entries(session.metadata || {}).map(([key, value]) => (
                      <View key={key} style={s.detailRow}>
                        <Text style={s.detailLabel}>{formatMetadataKey(key)}</Text>
                        <Text style={s.detailValue}>{detailValue(value) || "—"}</Text>
                      </View>
                    ))}
                  </View>
                )}
                <View style={s.badges}>
                  {current && (
                    <View style={s.currentBadge}>
                      <Ionicons name="checkmark-circle" size={13} color="#15966A" />
                      <Text style={s.currentBadgeText}>Current</Text>
                    </View>
                  )}
                  <View style={[s.statusBadge, { backgroundColor: tone.bg }]}>
                    <Text style={[s.statusText, { color: tone.color }]}>{tone.label}</Text>
                  </View>
                </View>
                {canWrite && (
                  <View style={s.actions}>
                    {session.status !== "ended" && (
                      <Pressable style={s.actionButton} onPress={() => openEdit(session)}>
                        <Ionicons name="create-outline" size={16} color={colors.ink} />
                        <Text style={s.actionText}>Edit</Text>
                      </Pressable>
                    )}
                    {session.status !== "ended" && !session.isCurrent && (
                      <Pressable
                        style={[s.actionButton, s.activateAction]}
                        onPress={() => void performAction(session, "activate")}
                      >
                        <Ionicons name="play" size={14} color="#15966A" />
                        <Text style={[s.actionText, { color: "#15966A" }]}>Activate</Text>
                      </Pressable>
                    )}
                    {session.status === "active" && (
                      <Pressable
                        style={s.actionButton}
                        onPress={() => void performAction(session, "end")}
                      >
                        <Ionicons name="flag-outline" size={15} color={colors.muted} />
                        <Text style={s.actionText}>End</Text>
                      </Pressable>
                    )}
                    {session.status === "planned" && (
                      <Pressable
                        style={[s.actionButton, s.deleteAction]}
                        onPress={() => void performAction(session, "delete")}
                      >
                        <Ionicons name="trash-outline" size={15} color={colors.alert} />
                        <Text style={[s.actionText, { color: colors.alert }]}>Delete</Text>
                      </Pressable>
                    )}
                  </View>
                )}
              </Card>
            );
          })
        ) : null}

        {!canWrite && !loadError && (
          <Text style={s.readOnlyNote}>
            Read-only access. Contact your school administrator to manage academic sessions.
          </Text>
        )}
      </ScrollView>

      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => !busy && setModalVisible(false)}
      >
        <View style={s.modalBackdrop}>
          <View style={s.modalCard}>
            <View style={s.modalHeader}>
              <View>
                <Text style={s.modalTitle}>
                  {editing ? "Edit Academic Session" : "New Academic Session"}
                </Text>
                <Text style={s.modalSubtitle}>
                  Set the calendar dates for a school year.
                </Text>
              </View>
              <Pressable
                onPress={() => setModalVisible(false)}
                disabled={busy}
                hitSlop={10}
              >
                <Ionicons name="close" size={23} color={colors.muted} />
              </Pressable>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled">
              <View style={s.formFields}>
                <View style={s.fieldWrap}>
                  <Text style={s.fieldLabel}>SESSION NAME (OPTIONAL)</Text>
                  <TextInput
                    value={form.name}
                    onChangeText={(name) => setForm((current) => ({ ...current, name }))}
                    editable={!busy && editing?.status !== "active"}
                    placeholder="e.g. 2026-27"
                    placeholderTextColor="#98A2B3"
                    style={[s.textField, editing?.status === "active" && s.disabledField]}
                  />
                  <Text style={s.hintText}>
                    {editing?.status === "active"
                      ? "The current session name is locked. Adjust its dates instead."
                      : "Leave blank to derive the session name from its dates (e.g. 2026-27)."}
                  </Text>
                </View>
                <View style={s.fieldWrap}>
                  <Text style={s.fieldLabel}>START DATE *</Text>
                  <TextInput
                    value={form.startDate}
                    onChangeText={(startDate) => setForm((current) => ({ ...current, startDate }))}
                    editable={!busy}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor="#98A2B3"
                    style={s.textField}
                    maxLength={10}
                    keyboardType="numbers-and-punctuation"
                  />
                </View>
                <View style={s.fieldWrap}>
                  <Text style={s.fieldLabel}>END DATE *</Text>
                  <TextInput
                    value={form.endDate}
                    onChangeText={(endDate) => setForm((current) => ({ ...current, endDate }))}
                    editable={!busy}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor="#98A2B3"
                    style={s.textField}
                    maxLength={10}
                    keyboardType="numbers-and-punctuation"
                  />
                </View>
                <View style={s.infoNote}>
                  <Ionicons name="information-circle-outline" size={17} color={colors.info} />
                  <Text style={s.infoText}>
                    Sessions cannot overlap. The first live session becomes current automatically.
                  </Text>
                </View>
              </View>
            </ScrollView>
            <View style={s.modalActions}>
              <Pressable
                style={s.cancelButton}
                onPress={() => setModalVisible(false)}
                disabled={busy}
              >
                <Text style={s.cancelText}>Cancel</Text>
              </Pressable>
              <View style={s.saveButton}>
                <Button
                  title={busy ? "Saving..." : editing ? "Save Changes" : "Create Session"}
                  onPress={() => void save()}
                  loading={busy}
                />
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 16, paddingBottom: 32, gap: 13 },
  hero: { padding: 20, borderRadius: 20, backgroundColor: colors.ink },
  heroTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  heroIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  heroAddButton: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 10, backgroundColor: "#fff", paddingHorizontal: 11, paddingVertical: 8 },
  heroAddText: { color: colors.ink, fontSize: 10, fontWeight: "800" },
  eyebrow: { color: "#FFD58A", fontSize: 10, fontWeight: "800", letterSpacing: 1.5 },
  title: { color: "#fff", fontSize: 23, fontWeight: "800", marginTop: 4 },
  subtitle: { color: "rgba(255,255,255,0.76)", fontSize: 12, lineHeight: 18, marginTop: 5 },
  summaryRow: { flexDirection: "row", gap: 8 },
  summaryCard: { flex: 1, paddingVertical: 12, paddingHorizontal: 7, alignItems: "center" },
  summaryValue: { color: colors.ink, fontSize: 20, fontWeight: "800" },
  summaryLabel: { color: colors.muted, fontSize: 9, fontWeight: "600", marginTop: 3 },
  listHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 3 },
  sectionTitle: { color: colors.ink, fontSize: 17, fontWeight: "800" },
  sectionSubtitle: { color: colors.muted, fontSize: 10, marginTop: 3 },
  sessionCard: { gap: 10, padding: 14 },
  currentCard: { borderColor: "#B7E8CE", borderWidth: 1 },
  sessionHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  sessionIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: "#FFF4DF", alignItems: "center", justifyContent: "center" },
  sessionInfo: { flex: 1 },
  sessionName: { color: colors.ink, fontSize: 15, fontWeight: "800" },
  dateRange: { color: colors.muted, fontSize: 11, marginTop: 4 },
  detailsToggle: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 4, marginLeft: 50, paddingVertical: 3 },
  detailsToggleText: { color: colors.info, fontSize: 10, fontWeight: "700" },
  detailPanel: { marginLeft: 50, borderLeftWidth: 2, borderLeftColor: "#D9E6F5", paddingLeft: 10, gap: 7 },
  detailRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10 },
  detailLabel: { flex: 1, color: colors.muted, fontSize: 10 },
  detailValue: { flex: 1.4, color: colors.ink, fontSize: 10, fontWeight: "700", textAlign: "right" },
  badges: { flexDirection: "row", alignItems: "center", gap: 7, marginLeft: 50 },
  currentBadge: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 10, backgroundColor: "#E8F7EF", paddingHorizontal: 8, paddingVertical: 5 },
  currentBadgeText: { color: "#15966A", fontSize: 9, fontWeight: "800" },
  statusBadge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 5 },
  statusText: { fontSize: 9, fontWeight: "800" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 2, marginLeft: 50 },
  actionButton: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderColor: colors.border, borderRadius: 9, backgroundColor: "#fff", paddingHorizontal: 9, paddingVertical: 7 },
  activateAction: { borderColor: "#B7E8CE", backgroundColor: "#F5FCF8" },
  deleteAction: { borderColor: "#F4C7C2", backgroundColor: "#FFF8F7" },
  actionText: { color: colors.ink, fontSize: 10, fontWeight: "700" },
  emptyCard: { alignItems: "center", gap: 10, padding: 20 },
  emptyIcon: { width: 52, height: 52, borderRadius: 17, backgroundColor: "#FFF4DF", alignItems: "center", justifyContent: "center" },
  emptyTitle: { color: colors.ink, fontSize: 14, fontWeight: "800", textAlign: "center" },
  emptyDescription: { color: colors.muted, fontSize: 11, lineHeight: 17, textAlign: "center" },
  errorCard: { alignItems: "center", gap: 9 },
  errorText: { color: colors.alert, fontSize: 11, textAlign: "center", lineHeight: 16 },
  retryText: { color: colors.info, fontSize: 12, fontWeight: "800" },
  readOnlyNote: { color: colors.muted, fontSize: 10, textAlign: "center", lineHeight: 15, paddingHorizontal: 12 },
  modalBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(12,20,35,0.45)" },
  modalCard: { maxHeight: "90%", backgroundColor: colors.card, borderTopLeftRadius: 23, borderTopRightRadius: 23, paddingTop: 18, paddingHorizontal: 18, paddingBottom: 26 },
  modalHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10, paddingBottom: 15, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  modalTitle: { color: colors.ink, fontSize: 17, fontWeight: "800" },
  modalSubtitle: { color: colors.muted, fontSize: 10, marginTop: 4 },
  formFields: { gap: 15, paddingVertical: 16 },
  fieldWrap: { gap: 6 },
  fieldLabel: { color: colors.muted, fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
  textField: { minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: 11, backgroundColor: "#fff", paddingHorizontal: 12, color: colors.ink, fontSize: 12 },
  disabledField: { backgroundColor: "#F0F2F5", color: colors.muted },
  hintText: { color: colors.muted, fontSize: 10, lineHeight: 15 },
  infoNote: { flexDirection: "row", gap: 7, alignItems: "flex-start", backgroundColor: "#EFF6FF", borderRadius: 10, padding: 10 },
  infoText: { flex: 1, color: colors.info, fontSize: 10, lineHeight: 15 },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 10, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingTop: 13 },
  cancelButton: { minHeight: 43, justifyContent: "center", paddingHorizontal: 14 },
  cancelText: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  saveButton: { minWidth: 150 },
});
