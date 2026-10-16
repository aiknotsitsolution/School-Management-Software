import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { Button, Card, Input } from "../components/UI";
import { api } from "../lib/api";
import type { AttendanceRecord } from "../types";
import { useAuth } from "../context/AuthContext";
import { colors } from "../theme";

const STATUSES = ["Present", "Absent", "Leave", "Half Day", "Late"] as const;
type AttendanceStatus = (typeof STATUSES)[number];
type AttendanceDraft = {
  date: string;
  status: AttendanceStatus;
  checkIn: string;
  checkOut: string;
  note: string;
};

function todayISO() {
  const date = new Date();
  const localDate = new Date(
    date.getTime() - date.getTimezoneOffset() * 60_000,
  );
  return localDate.toISOString().slice(0, 10);
}

function dateKey(value?: string) {
  const raw = String(value || "");
  const match = raw.match(/^\d{4}-\d{2}-\d{2}/);
  return match?.[0] || "";
}

function formatDate(value?: string) {
  const key = dateKey(value);
  if (!key) return "Date unavailable";
  const [year, month, day] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function isValidDate(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
  );
}

function statusColor(status: string) {
  switch (status) {
    case "Present":
      return colors.success;
    case "Late":
      return colors.amberDark;
    case "Absent":
      return colors.alert;
    case "Leave":
      return colors.info;
    default:
      return colors.muted;
  }
}

function Metric({
  label,
  value,
  icon,
  tint,
}: {
  label: string;
  value: string | number;
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
}) {
  return (
    <Card style={styles.metric}>
      <View style={[styles.metricIcon, { backgroundColor: `${tint}18` }]}>
        <Ionicons name={icon} size={17} color={tint} />
      </View>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </Card>
  );
}

export default function MyAttendanceScreen() {
  const { user } = useAuth();
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [today, setToday] = useState(todayISO);
  const [draft, setDraft] = useState<AttendanceDraft>({
    date: todayISO(),
    status: "Present",
    checkIn: "",
    checkOut: "",
    note: "",
  });

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const { data } = await api.staff.attendance.list("limit=2000");
      setRecords(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not load your attendance history.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      const currentDay = todayISO();
      setToday(currentDay);
      void load();
    }, [load]),
  );

  const todaysRecord = useMemo(
    () => records.find((record) => dateKey(record.date) === draft.date),
    [draft.date, records],
  );
  useEffect(() => {
    if (todaysRecord) {
      const status = STATUSES.includes(
        todaysRecord.status as AttendanceStatus,
      )
        ? (todaysRecord.status as AttendanceStatus)
        : "Present";
      setDraft((current) => ({
        ...current,
        status,
        checkIn: todaysRecord.checkIn || "",
        checkOut: todaysRecord.checkOut || "",
        note: todaysRecord.note || "",
      }));
    } else {
      setDraft((current) => ({
        ...current,
        status: "Present",
        checkIn: "",
        checkOut: "",
        note: "",
      }));
    }
  }, [todaysRecord]);
  const monthRecords = useMemo(
    () =>
      records.filter((record) =>
        dateKey(record.date).startsWith(today.slice(0, 7)),
      ),
    [records, today],
  );
  const summary = useMemo(() => {
    const count = (status: string) =>
      monthRecords.filter((record) => record.status === status).length;
    const present = count("Present");
    const late = count("Late");
    const absent = count("Absent");
    const leave = count("Leave") + count("Half Day");
    const [year, month] = today.slice(0, 7).split("-").map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    return {
      present,
      late,
      absent,
      leave,
      total: monthRecords.length,
      percentage: daysInMonth
        ? Math.round(((present + late) / daysInMonth) * 1000) / 10
        : 0,
    };
  }, [monthRecords, today]);
  const sortedRecords = useMemo(
    () =>
      [...records]
        .sort((a, b) => dateKey(b.date).localeCompare(dateKey(a.date)))
        .slice(0, 30),
    [records],
  );

  const setDate = (date: string) => {
    setDraft({
      date,
      status: "Present",
      checkIn: "",
      checkOut: "",
      note: "",
    });
  };

  const markAttendance = async () => {
    if (!isValidDate(draft.date)) {
      Alert.alert("Invalid date", "Enter a valid date in YYYY-MM-DD format.");
      return;
    }
    if (draft.date > todayISO()) {
      Alert.alert("Date is in the future", "Attendance cannot be marked for a future date.");
      return;
    }
    const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
    if (
      (draft.checkIn && !timePattern.test(draft.checkIn)) ||
      (draft.checkOut && !timePattern.test(draft.checkOut))
    ) {
      Alert.alert("Invalid time", "Enter check-in and check-out as HH:mm.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api.staff.attendance.mark({
        date: draft.date,
        status: draft.status,
        checkIn: draft.checkIn,
        checkOut: draft.checkOut,
        note: draft.note.trim(),
      });
      await load(true);
      Alert.alert(
        "Attendance saved",
        todaysRecord
          ? "Your attendance entry has been updated."
          : "Your attendance has been marked.",
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not mark attendance.";
      setError(message);
      Alert.alert("Could not save attendance", message);
    } finally {
      setSaving(false);
    }
  };

  const displayedStatus = (status: string) => {
    if (status === "Present") return styles.presentBadge;
    if (status === "Late") return styles.lateBadge;
    if (status === "Absent") return styles.absentBadge;
    if (status === "Leave") return styles.leaveBadge;
    return styles.neutralBadge;
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void load(true)}
          tintColor={colors.amberDark}
        />
      }
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Ionicons
            name="calendar-outline"
            size={22}
            color={colors.amberDark}
          />
        </View>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>STAFF TOOLS</Text>
          <Text style={styles.title}>My Attendance</Text>
          <Text style={styles.subtitle}>
            Mark and track your own daily attendance, {user?.name}.
          </Text>
        </View>
      </View>

      <View style={styles.metrics}>
        <Metric
          label={`Present · ${summary.total} days`}
          value={summary.present}
          icon="checkmark-circle-outline"
          tint={colors.success}
        />
        <Metric
          label="Late"
          value={summary.late}
          icon="time-outline"
          tint={colors.amberDark}
        />
        <Metric
          label="Absent"
          value={summary.absent}
          icon="close-circle-outline"
          tint={colors.alert}
        />
        <Metric
          label="Leave / Half Day"
          value={summary.leave}
          icon="sunny-outline"
          tint={colors.info}
        />
        <Metric
          label={`Attendance · ${today.slice(5, 7)}/${today.slice(0, 4)}`}
          value={`${summary.percentage}%`}
          icon="calendar-outline"
          tint={colors.info}
        />
      </View>

      {error ? (
        <View style={styles.errorBanner}>
          <Ionicons
            name="alert-circle-outline"
            size={17}
            color={colors.alert}
          />
          <Text style={styles.errorText}>{error}</Text>
          <Pressable
            onPress={() => void load(true)}
            accessibilityRole="button"
          >
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : null}

      <Card style={styles.panel}>
        <View style={styles.panelTitleRow}>
          <Ionicons
            name="today-outline"
            size={18}
            color={colors.amberDark}
          />
          <Text style={styles.panelTitle}>Mark attendance</Text>
        </View>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Date · YYYY-MM-DD</Text>
          <Input
            value={draft.date}
            onChangeText={setDate}
            placeholder="2026-10-15"
            keyboardType="numbers-and-punctuation"
            autoCapitalize="none"
            maxLength={10}
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Status</Text>
          <View style={styles.statusGrid}>
            {STATUSES.map((status) => {
              const active = draft.status === status;
              const tint = statusColor(status);
              return (
                <Pressable
                  key={status}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() =>
                    setDraft((current) => ({ ...current, status }))
                  }
                  style={[
                    styles.statusButton,
                    { borderColor: tint },
                    active && { backgroundColor: tint },
                  ]}
                >
                  <Text
                    style={[
                      styles.statusText,
                      { color: active ? "#fff" : tint },
                    ]}
                  >
                    {status}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        <View style={styles.timeFields}>
          <View style={styles.timeField}>
            <Text style={styles.fieldLabel}>Check-in</Text>
            <Input
              value={draft.checkIn}
              onChangeText={(checkIn) =>
                setDraft((current) => ({ ...current, checkIn }))
              }
              placeholder="09:00"
              keyboardType="numbers-and-punctuation"
              maxLength={5}
            />
          </View>
          <View style={styles.timeField}>
            <Text style={styles.fieldLabel}>Check-out</Text>
            <Input
              value={draft.checkOut}
              onChangeText={(checkOut) =>
                setDraft((current) => ({ ...current, checkOut }))
              }
              placeholder="17:00"
              keyboardType="numbers-and-punctuation"
              maxLength={5}
            />
          </View>
        </View>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Note · optional</Text>
          <Input
            value={draft.note}
            onChangeText={(note) =>
              setDraft((current) => ({ ...current, note }))
            }
            placeholder="Add a note"
            multiline
            style={styles.noteInput}
          />
        </View>
        <Button
          title={todaysRecord ? "Update Attendance" : "Mark Attendance"}
          onPress={() => void markAttendance()}
          loading={saving}
        />
        <Text style={styles.helperText}>
          {todaysRecord
            ? "An entry already exists for this date. Saving will update it."
            : "Your attendance entry is saved to your staff profile."}
        </Text>
      </Card>

      <Card style={styles.panel}>
        <View style={styles.panelTitleRow}>
          <Ionicons
            name="time-outline"
            size={18}
            color={colors.amberDark}
          />
          <Text style={styles.panelTitle}>Attendance history</Text>
          <Text style={styles.historyCount}>
            {monthRecords.length} days this month
          </Text>
        </View>
        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.amberDark} />
            <Text style={styles.helperText}>Loading attendance…</Text>
          </View>
        ) : records.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons
              name="calendar-outline"
              size={32}
              color={colors.muted}
            />
            <Text style={styles.emptyTitle}>No attendance recorded yet</Text>
            <Text style={styles.helperText}>
              Mark an attendance entry above to get started.
            </Text>
          </View>
        ) : (
          <View style={styles.historyList}>
            {sortedRecords.map((record, index) => (
              <View
                key={record._id || `${record.date}-${index}`}
                style={styles.historyRow}
              >
                <View style={styles.historyDate}>
                  <Text style={styles.historyDateText}>
                    {formatDate(record.date)}
                  </Text>
                  <Text style={styles.historyTimes}>
                    In {record.checkIn || "—"} · Out {record.checkOut || "—"}
                  </Text>
                  {record.note ? (
                    <Text style={styles.historyNote}>{record.note}</Text>
                  ) : null}
                </View>
                <View style={[styles.statusBadge, displayedStatus(record.status)]}>
                  <Text
                    style={[
                      styles.statusBadgeText,
                      { color: statusColor(record.status) },
                    ]}
                  >
                    {record.status}
                  </Text>
                </View>
              </View>
            ))}
            {records.length > sortedRecords.length ? (
              <Text style={styles.helperText}>
                Showing the 30 most recent records.
              </Text>
            ) : null}
          </View>
        )}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 16, gap: 14, paddingBottom: 36 },
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  headerIcon: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: "#FBF1DF",
    alignItems: "center",
    justifyContent: "center",
  },
  headerCopy: { flex: 1, gap: 3 },
  eyebrow: {
    color: colors.amberDark,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
  },
  title: { color: colors.ink, fontSize: 22, fontWeight: "800" },
  subtitle: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  metric: { width: "31%", flexGrow: 1, padding: 11, gap: 4 },
  metricIcon: {
    width: 29,
    height: 29,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  metricValue: { color: colors.ink, fontSize: 19, fontWeight: "800" },
  metricLabel: { color: colors.muted, fontSize: 9, fontWeight: "600" },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: colors.alert,
    backgroundColor: "#FFF1EF",
    borderRadius: 12,
    padding: 11,
  },
  errorText: { flex: 1, color: colors.alert, fontSize: 11, lineHeight: 16 },
  retryText: { color: colors.ink, fontSize: 11, fontWeight: "700" },
  panel: { gap: 13 },
  panelTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  panelTitle: { flex: 1, color: colors.ink, fontSize: 15, fontWeight: "800" },
  historyCount: { color: colors.muted, fontSize: 10, fontWeight: "600" },
  field: { gap: 6 },
  fieldLabel: { color: colors.muted, fontSize: 11, fontWeight: "700" },
  statusGrid: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  statusButton: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  statusText: { fontSize: 11, fontWeight: "700" },
  timeFields: { flexDirection: "row", gap: 10 },
  timeField: { flex: 1, gap: 6 },
  noteInput: { minHeight: 76, textAlignVertical: "top" },
  helperText: { color: colors.muted, fontSize: 10, lineHeight: 15 },
  loading: { alignItems: "center", gap: 8, paddingVertical: 18 },
  emptyState: { alignItems: "center", gap: 8, paddingVertical: 20 },
  emptyTitle: { color: colors.ink, fontSize: 14, fontWeight: "700" },
  historyList: { gap: 8 },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 11,
    backgroundColor: "#fff",
    padding: 10,
  },
  historyDate: { flex: 1, gap: 4 },
  historyDateText: { color: colors.ink, fontSize: 12, fontWeight: "700" },
  historyTimes: { color: colors.muted, fontSize: 10 },
  historyNote: { color: colors.muted, fontSize: 10, lineHeight: 14 },
  statusBadge: { borderRadius: 20, paddingHorizontal: 9, paddingVertical: 6 },
  presentBadge: { backgroundColor: "#E8F7EF" },
  lateBadge: { backgroundColor: "#FBF1DF" },
  absentBadge: { backgroundColor: "#FFF1EF" },
  leaveBadge: { backgroundColor: "#EEF5FC" },
  neutralBadge: { backgroundColor: "#F0F2F5" },
  statusBadgeText: { fontSize: 10, fontWeight: "800" },
});
