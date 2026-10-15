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
import { Card } from "../components/UI";
import { TrendChart, type Point } from "../components/Charts";
import { api, get } from "../lib/api";
import { colors } from "../theme";
import type { AttendanceRecord, SchoolEvent } from "../types";

const INDIA_TIME_ZONE = "Asia/Kolkata";
const MAX_ATTENDANCE_PAGES = 10;
const MONTH_LABEL_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const DATE_LABEL_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type CalendarHoliday = SchoolEvent & { source?: string };

function dateKeyOf(value?: string) {
  const dateValue = String(value || "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) return dateValue;
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: INDIA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (name: string) =>
    parts.find((item) => item.type === name)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function monthKeyOf(date = new Date()) {
  return dateKeyOf(date.toISOString()).slice(0, 7);
}

function monthKeyLabel(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  return `${year}-${String(month).padStart(2, "0")}`;
}

function dateKeyFromParts(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function monthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  return MONTH_LABEL_FORMATTER.format(
    new Date(Date.UTC(year, month - 1, 15, 12)),
  );
}

function dateLabel(value?: string) {
  const key = dateKeyOf(value);
  if (!key) return "Date not available";
  const [year, month, day] = key.split("-").map(Number);
  return DATE_LABEL_FORMATTER.format(
    new Date(Date.UTC(year, month - 1, day, 12)),
  );
}

function statusColor(status?: string) {
  switch (String(status || "").toLowerCase()) {
    case "present":
      return colors.success;
    case "absent":
      return colors.alert;
    case "leave":
      return colors.info;
    case "half day":
    case "half-day":
    case "late":
      return colors.amberDark;
    default:
      return colors.muted;
  }
}

export default function StudentAttendanceScreen() {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(() => monthKeyOf());
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const [year, month] = monthKeyOf().split("-").map(Number);
    return new Date(year, month - 1, 1);
  });
  const [selectedDate, setSelectedDate] = useState(() =>
    dateKeyOf(new Date().toISOString()),
  );
  const [events, setEvents] = useState<SchoolEvent[]>([]);
  const [holidays, setHolidays] = useState<CalendarHoliday[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [calendarError, setCalendarError] = useState("");

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    setCalendarError("");

    try {
      const allRecords: AttendanceRecord[] = [];
      let hasMore = false;
      for (let page = 1; page <= MAX_ATTENDANCE_PAGES; page += 1) {
        const response = await api.attendance.list(
          `limit=1000&page=${page}`,
        );
        const batch = Array.isArray(response.data) ? response.data : [];
        allRecords.push(...batch);
        const totalPages = Number(response.pages || 0);
        hasMore =
          batch.length === 1000 &&
          (!totalPages || page < totalPages);
        if (!hasMore) break;
      }
      if (hasMore) {
        throw new Error(
          "More than 10,000 attendance records are available. Please contact your school to review your attendance history.",
        );
      }
      setRecords(allRecords);
      const [eventsResult, holidaysResult] = await Promise.allSettled([
        api.events.list(),
        get<CalendarHoliday[]>("/events/india-holidays"),
      ]);
      setEvents(
        eventsResult.status === "fulfilled" &&
          Array.isArray(eventsResult.value.data)
          ? eventsResult.value.data
          : [],
      );
      setHolidays(
        holidaysResult.status === "fulfilled" &&
          Array.isArray(holidaysResult.value.data)
          ? holidaysResult.value.data
          : [],
      );
      setCalendarError(
        [
          eventsResult.status === "rejected"
            ? eventsResult.reason instanceof Error
              ? `School events: ${eventsResult.reason.message}`
              : "School events could not be loaded."
            : "",
          holidaysResult.status === "rejected"
            ? holidaysResult.reason instanceof Error
              ? `India holidays: ${holidaysResult.reason.message}`
              : "India holidays could not be loaded."
            : "",
        ]
          .filter(Boolean)
          .join(" "),
      );
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load your attendance records. Please try again.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(() => {
    const present = records.filter(
      (record) => String(record.status).toLowerCase() === "present",
    ).length;
    const absent = records.filter(
      (record) => String(record.status).toLowerCase() === "absent",
    ).length;
    const leave = records.filter(
      (record) => String(record.status).toLowerCase() === "leave",
    ).length;
    return {
      present,
      absent,
      leave,
      total: records.length,
      percentage: records.length ? Math.round((present / records.length) * 100) : 0,
    };
  }, [records]);

  const months = useMemo(() => {
    const availableMonths = new Set(
      records.map((record) => dateKeyOf(record.date).slice(0, 7)).filter(Boolean),
    );
    availableMonths.add(monthKeyOf());
    return [...availableMonths].sort((a, b) => b.localeCompare(a));
  }, [records]);

  const monthRecords = useMemo(
    () =>
      records
        .filter((record) => dateKeyOf(record.date).startsWith(selectedMonth))
        .sort((a, b) => dateKeyOf(b.date).localeCompare(dateKeyOf(a.date))),
    [records, selectedMonth],
  );

  const calendarCells = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const leadingDays =
      (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;
    const daysInMonth = new Date(
      Date.UTC(year, month + 1, 0),
    ).getUTCDate();
    return [
      ...Array.from({ length: leadingDays }, () => null),
      ...Array.from({ length: daysInMonth }, (_, index) => {
        const day = index + 1;
        return { day, dateKey: dateKeyFromParts(year, month + 1, day) };
      }),
    ];
  }, [calendarMonth]);

  const today = dateKeyOf(new Date().toISOString());
  const selectedDayAttendance = records.find(
    (record) => dateKeyOf(record.date) === selectedDate,
  );
  const selectedDayEvents = events.filter(
    (event) =>
      dateKeyOf(event.date) === selectedDate &&
      String(event.category || "").toLowerCase() !== "holiday",
  );
  const selectedDayHolidays = [
    ...holidays.filter((holiday) => dateKeyOf(holiday.date) === selectedDate),
    ...events.filter(
      (event) =>
        dateKeyOf(event.date) === selectedDate &&
        String(event.category || "").toLowerCase() === "holiday",
    ),
  ].filter(
    (holiday, index, matches) =>
      matches.findIndex(
        (candidate) =>
          candidate.title === holiday.title &&
          dateKeyOf(candidate.date) === dateKeyOf(holiday.date),
      ) === index,
  );
  const selectedDateEvents = [...selectedDayHolidays, ...selectedDayEvents];

  const calendarMarksForDate = (dateKey: string) => {
    const record = records.find((item) => dateKeyOf(item.date) === dateKey);
    const isHoliday =
      holidays.some((holiday) => dateKeyOf(holiday.date) === dateKey) ||
      events.some(
        (event) =>
          dateKeyOf(event.date) === dateKey &&
          String(event.category || "").toLowerCase() === "holiday",
      );
    const hasEvent = events.some(
      (event) =>
        dateKeyOf(event.date) === dateKey &&
        String(event.category || "").toLowerCase() !== "holiday",
    );
    return { record, isHoliday, hasEvent };
  };

  const moveCalendarMonth = (offset: number) => {
    const next = new Date(
      calendarMonth.getFullYear(),
      calendarMonth.getMonth() + offset,
      1,
    );
    setCalendarMonth(next);
    const selectedDay = Number(selectedDate.split("-")[2]);
    const day = Math.min(
      selectedDay || 1,
      new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate(),
    );
    setSelectedDate(dateKeyFromParts(next.getFullYear(), next.getMonth() + 1, day));
    setSelectedMonth(
      dateKeyFromParts(next.getFullYear(), next.getMonth() + 1, 1).slice(0, 7),
    );
  };

  const weeklyTrend = useMemo<Point[]>(() => {
    const weeks = new Map<string, { present: number; total: number }>();
    records.forEach((record) => {
      const key = dateKeyOf(record.date);
      if (!key) return;
      const [year, month, day] = key.split("-").map(Number);
      const date = new Date(Date.UTC(year, month - 1, day, 12));
      const mondayOffset = (date.getUTCDay() + 6) % 7;
      date.setUTCDate(date.getUTCDate() - mondayOffset);
      const weekKey = date.toISOString().slice(0, 10);
      const bucket = weeks.get(weekKey) || { present: 0, total: 0 };
      bucket.total += 1;
      if (String(record.status).toLowerCase() === "present") bucket.present += 1;
      weeks.set(weekKey, bucket);
    });
    return [...weeks.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-8)
      .map(([week, bucket]) => ({
        label: dateLabel(week).split(" ").slice(1, 3).join(" "),
        value: Math.round((bucket.present / bucket.total) * 100),
      }));
  }, [records]);

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />
      }
    >
      <View style={styles.hero}>
        <View style={styles.heroIcon}>
          <Ionicons name="calendar-outline" size={23} color="#FFFFFF" />
        </View>
        <Text style={styles.heroTitle}>My Attendance</Text>
        <Text style={styles.heroSubtitle}>
          Your attendance record for this school session
        </Text>
        <View style={styles.rateRow}>
          <Text style={styles.rateValue}>{summary.percentage}%</Text>
          <View style={styles.rateCopy}>
            <Text style={styles.rateLabel}>Overall attendance</Text>
            <Text style={styles.rateMeta}>
              {summary.present} present out of {summary.total} recorded days
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.calendarCard}>
        <View style={styles.calendarHeader}>
          <View style={styles.calendarTitleGroup}>
            <View style={styles.calendarIcon}>
              <Ionicons name="calendar" size={18} color={colors.info} />
            </View>
            <View>
              <Text style={styles.calendarTitle}>Attendance Calendar</Text>
              <Text style={styles.calendarSubtitle}>India time · Monday start</Text>
            </View>
          </View>
          <View style={styles.calendarControls}>
            <Pressable
              onPress={() => moveCalendarMonth(-1)}
              accessibilityRole="button"
              accessibilityLabel="Previous month"
              hitSlop={8}
              style={styles.monthButton}
            >
              <Ionicons name="chevron-back" size={18} color={colors.ink} />
            </Pressable>
            <Pressable
              onPress={() => {
                const currentMonth = monthKeyOf();
                const [year, month] = currentMonth.split("-").map(Number);
                setCalendarMonth(new Date(year, month - 1, 1));
                setSelectedDate(today);
                setSelectedMonth(currentMonth);
              }}
              accessibilityRole="button"
              accessibilityLabel="Go to current month"
              hitSlop={8}
              style={styles.monthButton}
            >
              <Ionicons name="today-outline" size={18} color={colors.info} />
            </Pressable>
            <Pressable
              onPress={() => moveCalendarMonth(1)}
              accessibilityRole="button"
              accessibilityLabel="Next month"
              hitSlop={8}
              style={styles.monthButton}
            >
              <Ionicons name="chevron-forward" size={18} color={colors.ink} />
            </Pressable>
          </View>
        </View>
        <Text style={styles.calendarMonthTitle}>
          {monthLabel(monthKeyLabel(
            `${calendarMonth.getFullYear()}-${calendarMonth.getMonth() + 1}`,
          ))}
        </Text>
        <View style={styles.calendarGrid}>
          {WEEKDAY_LABELS.map((weekday) => (
            <Text key={weekday} style={styles.weekdayLabel}>
              {weekday}
            </Text>
          ))}
          {calendarCells.map((cell, index) =>
            cell ? (
              <Pressable
                key={cell.dateKey}
                onPress={() => {
                  setSelectedDate(cell.dateKey);
                  setSelectedMonth(cell.dateKey.slice(0, 7));
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: selectedDate === cell.dateKey }}
                accessibilityLabel={`${dateLabel(cell.dateKey)}${calendarMarksForDate(cell.dateKey).record ? `, ${calendarMarksForDate(cell.dateKey).record?.status}` : ""}${calendarMarksForDate(cell.dateKey).isHoliday ? ", holiday" : ""}`}
                style={styles.calendarCell}
              >
                <View
                  style={[
                    styles.calendarDay,
                    cell.dateKey === today && styles.calendarToday,
                    cell.dateKey === selectedDate && styles.calendarSelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.calendarDayText,
                      cell.dateKey === today && styles.calendarTodayText,
                      cell.dateKey === selectedDate && styles.calendarSelectedText,
                    ]}
                  >
                    {cell.day}
                  </Text>
                </View>
                <View style={styles.calendarDots}>
                  {(() => {
                    const marks = calendarMarksForDate(cell.dateKey);
                    const dots = [
                      ...(marks.record
                        ? [{ key: "attendance", color: statusColor(marks.record.status) }]
                        : []),
                      ...(marks.isHoliday
                        ? [{ key: "holiday", color: "#7B61A8" }]
                        : []),
                      ...(marks.hasEvent
                        ? [{ key: "event", color: colors.amberDark }]
                        : []),
                    ];
                    return dots.slice(0, 3).map((dot) => (
                      <View
                        key={dot.key}
                        style={[styles.calendarDot, { backgroundColor: dot.color }]}
                      />
                    ));
                  })()}
                </View>
              </Pressable>
            ) : (
              <View key={`empty-${index}`} style={styles.calendarCell} />
            ),
          )}
        </View>
        <View style={styles.calendarLegend}>
          {[
            { label: "Present", color: colors.success },
            { label: "Absent", color: colors.alert },
            { label: "Holiday", color: "#7B61A8" },
            { label: "Event", color: colors.amberDark },
          ].map((item) => (
            <View key={item.label} style={styles.legendItem}>
              <View style={[styles.calendarDot, { backgroundColor: item.color }]} />
              <Text style={styles.legendText}>{item.label}</Text>
            </View>
          ))}
        </View>
        <View style={styles.selectedDay}>
          <View style={styles.selectedDayHeading}>
            <Text style={styles.selectedDayDate}>{dateLabel(selectedDate)}</Text>
            {selectedDate === today && (
              <Text style={styles.todayBadge}>TODAY</Text>
            )}
          </View>
          {selectedDayAttendance ? (
            <View style={styles.selectedDayRow}>
              <View
                style={[
                  styles.calendarDot,
                  { backgroundColor: statusColor(selectedDayAttendance.status) },
                ]}
              />
              <Text style={styles.selectedDayText}>
                Attendance: {selectedDayAttendance.status}
                {selectedDayAttendance.remarks
                  ? ` · ${selectedDayAttendance.remarks}`
                  : ""}
              </Text>
            </View>
          ) : (
            <Text style={styles.selectedDayEmpty}>No attendance marked for this date.</Text>
          )}
          {selectedDateEvents.map((event, index) => (
            <View
              key={`${event._id || event.title}-${index}`}
              style={styles.selectedDayRow}
            >
              <View
                style={[
                  styles.calendarDot,
                  {
                    backgroundColor:
                      String(event.category || "").toLowerCase() === "holiday"
                        ? "#7B61A8"
                        : colors.amberDark,
                  },
                ]}
              />
              <Text style={styles.selectedDayText}>
                {event.title}
                {event.time ? ` · ${event.time}` : ""}
              </Text>
            </View>
          ))}
          {!!calendarError && (
            <Text style={styles.calendarErrorText}>
              Holiday/event details could not be fully loaded: {calendarError}
            </Text>
          )}
          {!selectedDayAttendance && !selectedDateEvents.length && (
            <Text style={styles.selectedDayEmpty}>No holidays or events scheduled.</Text>
          )}
        </View>
      </View>

      {!!error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable
            onPress={() => void load()}
            disabled={loading}
            accessibilityRole="button"
          >
            <Text style={styles.retryText}>{loading ? "Loading..." : "Retry"}</Text>
          </Pressable>
        </View>
      )}

      <View style={styles.summaryGrid}>
        {[
          { label: "Present", value: summary.present, color: colors.success },
          { label: "Absent", value: summary.absent, color: colors.alert },
          { label: "Leave", value: summary.leave, color: colors.info },
        ].map((item) => (
          <Card key={item.label} style={styles.summaryCard}>
            <Text style={[styles.summaryValue, { color: item.color }]}>
              {item.value}
            </Text>
            <Text style={styles.summaryLabel}>{item.label}</Text>
          </Card>
        ))}
      </View>

      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.sectionTitle}>Weekly Trend</Text>
          <Text style={styles.sectionSubtitle}>Attendance percentage by week</Text>
        </View>
      </View>
      <Card style={styles.chartCard}>
        <TrendChart data={weeklyTrend} color={colors.success} />
      </Card>

      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.sectionTitle}>Attendance History</Text>
          <Text style={styles.sectionSubtitle}>
            {monthRecords.length} {monthRecords.length === 1 ? "record" : "records"}
          </Text>
        </View>
        <Pressable
          onPress={() => void load(true)}
          accessibilityRole="button"
          accessibilityLabel="Refresh attendance"
          hitSlop={8}
        >
          <Ionicons name="refresh-outline" size={20} color={colors.info} />
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.monthFilters}
        accessibilityLabel="Filter attendance by month"
      >
        {months.map((month) => {
          const active = selectedMonth === month;
          return (
            <Pressable
              key={month}
              onPress={() => {
                setSelectedMonth(month);
                const [year, monthNumber] = month.split("-").map(Number);
                setCalendarMonth(new Date(year, monthNumber - 1, 1));
                const day = Math.min(
                  Number(selectedDate.split("-")[2]) || 1,
                  new Date(year, monthNumber, 0).getDate(),
                );
                setSelectedDate(dateKeyFromParts(year, monthNumber, day));
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={[styles.monthChip, active && styles.monthChipActive]}
            >
              <Text style={[styles.monthChipText, active && styles.monthChipTextActive]}>
                {monthLabel(month)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <Card style={styles.historyCard}>
        {loading && !records.length ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.info} />
            <Text style={styles.emptyText}>Loading attendance...</Text>
          </View>
        ) : !records.length ? (
          <View style={styles.empty}>
            <Ionicons name="calendar-clear-outline" size={28} color={colors.muted} />
            <Text style={styles.emptyTitle}>No attendance records yet</Text>
            <Text style={styles.emptyText}>
              Records will appear here once your school marks attendance.
            </Text>
          </View>
        ) : !monthRecords.length ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No records for {monthLabel(selectedMonth)}</Text>
            <Text style={styles.emptyText}>Choose another month to view attendance.</Text>
          </View>
        ) : (
          monthRecords.map((record, index) => (
            <View
              key={record._id || `${dateKeyOf(record.date)}-${index}`}
              style={[
                styles.recordRow,
                index === monthRecords.length - 1 && styles.lastRecordRow,
              ]}
            >
              <View style={[styles.recordDot, { backgroundColor: statusColor(record.status) }]} />
              <View style={styles.recordCopy}>
                <Text style={styles.recordDate}>{dateLabel(record.date)}</Text>
                <Text style={styles.recordRemarks}>
                  {record.remarks || "No remarks"}
                </Text>
              </View>
              <View
                style={[
                  styles.statusPill,
                  { backgroundColor: `${statusColor(record.status)}18` },
                ]}
              >
                <Text style={[styles.statusText, { color: statusColor(record.status) }]}>
                  {record.status}
                </Text>
              </View>
            </View>
          ))
        )}
      </Card>

      <View style={styles.note}>
        <Ionicons name="information-circle-outline" size={17} color={colors.muted} />
        <Text style={styles.noteText}>
          Attendance is recorded by school staff. You can view your record but cannot change it.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 16, gap: 14, paddingBottom: 32 },
  hero: {
    backgroundColor: colors.ink,
    borderRadius: 18,
    padding: 20,
    gap: 7,
  },
  heroIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF22",
    marginBottom: 4,
  },
  heroTitle: { color: "#FFFFFF", fontSize: 22, fontWeight: "800" },
  heroSubtitle: { color: "#D7DFEF", fontSize: 12 },
  rateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    marginTop: 10,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: "#FFFFFF25",
  },
  rateValue: { color: "#8FE0A6", fontSize: 30, fontWeight: "800" },
  rateCopy: { flex: 1, gap: 3 },
  rateLabel: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
  rateMeta: { color: "#D7DFEF", fontSize: 11 },
  calendarCard: {
    backgroundColor: colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 15,
  },
  calendarHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  calendarTitleGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    flex: 1,
  },
  calendarIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: "#EAF2FA",
    alignItems: "center",
    justifyContent: "center",
  },
  calendarTitle: { color: colors.ink, fontSize: 14, fontWeight: "800" },
  calendarSubtitle: { color: colors.muted, fontSize: 10, marginTop: 2 },
  calendarControls: { flexDirection: "row", alignItems: "center", gap: 2 },
  monthButton: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: colors.paper,
    alignItems: "center",
    justifyContent: "center",
  },
  calendarMonthTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "800",
    marginTop: 16,
    marginBottom: 8,
  },
  calendarGrid: { flexDirection: "row", flexWrap: "wrap" },
  weekdayLabel: {
    width: "14.2857%",
    color: colors.muted,
    fontSize: 10,
    fontWeight: "700",
    textAlign: "center",
    paddingVertical: 7,
  },
  calendarCell: {
    width: "14.2857%",
    height: 43,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: 2,
  },
  calendarDay: {
    width: 29,
    height: 29,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  calendarToday: { borderWidth: 1.5, borderColor: colors.info },
  calendarSelected: { backgroundColor: colors.ink },
  calendarDayText: { color: colors.text, fontSize: 11, fontWeight: "600" },
  calendarTodayText: { color: colors.info, fontWeight: "800" },
  calendarSelectedText: { color: "#FFFFFF", fontWeight: "800" },
  calendarDots: {
    height: 7,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  calendarDot: { width: 5, height: 5, borderRadius: 3 },
  calendarLegend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 11,
    paddingTop: 11,
    marginTop: 3,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendText: { color: colors.muted, fontSize: 9 },
  selectedDay: {
    backgroundColor: "#F8FAFC",
    borderRadius: 11,
    padding: 11,
    marginTop: 12,
    gap: 7,
  },
  selectedDayHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 1,
  },
  selectedDayDate: { color: colors.ink, fontSize: 12, fontWeight: "800" },
  todayBadge: {
    color: colors.info,
    backgroundColor: "#EAF2FA",
    fontSize: 8,
    fontWeight: "800",
    overflow: "hidden",
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  selectedDayRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  selectedDayText: { flex: 1, color: colors.text, fontSize: 11, lineHeight: 16 },
  selectedDayEmpty: { color: colors.muted, fontSize: 10, lineHeight: 15 },
  calendarErrorText: { color: colors.alert, fontSize: 10, lineHeight: 15 },
  errorBox: {
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#F3C5BD",
    backgroundColor: "#FFF5F3",
  },
  errorText: { color: colors.alert, fontSize: 12, lineHeight: 18 },
  retryText: { alignSelf: "flex-start", color: colors.info, fontSize: 12, fontWeight: "800" },
  summaryGrid: { flexDirection: "row", gap: 9 },
  summaryCard: { flex: 1, alignItems: "center", paddingVertical: 13, paddingHorizontal: 8 },
  summaryValue: { fontSize: 20, fontWeight: "800" },
  summaryLabel: { marginTop: 3, color: colors.muted, fontSize: 11, fontWeight: "600" },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: { color: colors.ink, fontSize: 16, fontWeight: "800" },
  sectionSubtitle: { color: colors.muted, fontSize: 11, marginTop: 3 },
  chartCard: { paddingHorizontal: 8, paddingVertical: 12 },
  monthFilters: { gap: 8, paddingRight: 6 },
  monthChip: {
    borderRadius: 11,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  monthChipActive: { borderColor: colors.info, backgroundColor: colors.info },
  monthChipText: { color: colors.muted, fontSize: 11, fontWeight: "700" },
  monthChipTextActive: { color: "#FFFFFF" },
  historyCard: { paddingVertical: 4 },
  loading: { alignItems: "center", gap: 10, paddingVertical: 24 },
  empty: { alignItems: "center", gap: 8, paddingVertical: 24 },
  emptyTitle: { color: colors.ink, fontSize: 13, fontWeight: "800", textAlign: "center" },
  emptyText: { color: colors.muted, fontSize: 11, textAlign: "center", lineHeight: 17 },
  recordRow: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  lastRecordRow: { borderBottomWidth: 0 },
  recordDot: { width: 9, height: 9, borderRadius: 5 },
  recordCopy: { flex: 1, gap: 4 },
  recordDate: { color: colors.ink, fontSize: 12, fontWeight: "700" },
  recordRemarks: { color: colors.muted, fontSize: 10 },
  statusPill: { borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5 },
  statusText: { fontSize: 10, fontWeight: "800" },
  note: { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingHorizontal: 2 },
  noteText: { flex: 1, color: colors.muted, fontSize: 11, lineHeight: 16 },
});
