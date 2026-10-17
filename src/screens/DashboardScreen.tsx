import React, { useCallback, useEffect, useState } from "react";
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
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuth } from "../context/AuthContext";
import { api, get } from "../lib/api";
import { Card, StatCard } from "../components/UI";
import { colors } from "../theme";
import { extractList, type Row } from "../lib/format";
import type { RootStackParams } from "../../App";
import type {
  AttendanceRecord,
  FeeInvoiceRecord,
  FeePayment,
  Notice,
  SchoolEvent,
  Student,
} from "../types";
import { TrendChart, Point } from "../components/Charts";
import PlatformDashboardScreen from "./PlatformDashboardScreen";
import SchoolAdminDashboardScreen from "./SchoolAdminDashboardScreen";
import ReceptionDashboardScreen from "./ReceptionDashboardScreen";
import CounsellorDashboardScreen from "./CounsellorDashboardScreen";
import AccountantDashboardScreen from "./AccountantDashboardScreen";
import TeacherDashboardScreen from "./TeacherDashboardScreen";

export default function DashboardScreen() {
  const { user } = useAuth();
  if (user?.role === "super_admin") return <PlatformDashboardScreen />;
  if (user?.role === "school_admin" || user?.role === "admin") {
    return <SchoolAdminDashboardScreen />;
  }
  if (user?.role === "teacher") return <TeacherDashboardScreen />;
  if (user?.role === "student") return <StudentDashboardScreen />;
  if (user?.role === "staff" && user.designation === "receptionist") {
    return <ReceptionDashboardScreen />;
  }
  if (user?.role === "staff" && user.designation === "admission_counsellor") {
    return <CounsellorDashboardScreen />;
  }
  if (user?.role === "staff" && user.designation === "accountant") {
    return <AccountantDashboardScreen />;
  }
  return <SchoolDashboardScreen />;
}

type StudentDashboardData = {
  profile: Student | null;
  attendance: AttendanceRecord[];
  timetable: Row[];
  homework: Row[];
  exams: Row[];
  holidays: CalendarHoliday[];
  marks: Row | null;
  submissions: Row[];
  invoices: FeeInvoiceRecord[];
  payments: FeePayment[];
  notices: Notice[];
  events: SchoolEvent[];
};

type CalendarHoliday = SchoolEvent & { source?: string };

const emptyStudentData: StudentDashboardData = {
  profile: null,
  attendance: [],
  timetable: [],
  homework: [],
  exams: [],
  holidays: [],
  marks: null,
  submissions: [],
  invoices: [],
  payments: [],
  notices: [],
  events: [],
};

const INDIA_TIME_ZONE = "Asia/Kolkata";

const dateKeyInTimeZone = (date: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
};

const indiaDateKey = (date = new Date()) =>
  dateKeyInTimeZone(date, INDIA_TIME_ZONE);

const dateKeyFromParts = (year: number, month: number, day: number) =>
  `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

const dateKeyOf = (value?: string) => {
  const dateValue = String(value || "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) return dateValue;
  const date = new Date(dateValue);
  return Number.isNaN(date.getTime())
    ? dateValue.slice(0, 10)
    : dateKeyInTimeZone(date, INDIA_TIME_ZONE);
};

const WEEK_DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const formatPeriodTime = (value: unknown) => {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(value || ""));
  if (!match) return String(value || "");
  const hour = Number(match[1]);
  return `${((hour + 11) % 12) + 1}:${match[2]} ${hour >= 12 ? "PM" : "AM"}`;
};

const formatStudentDate = (value?: string) => {
  if (!value) return "Date not set";
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(isDateOnly ? `${value}T12:00:00Z` : value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        timeZone: isDateOnly ? "UTC" : INDIA_TIME_ZONE,
      });
};

function StudentDashboardScreen() {
  const { user, school } = useAuth();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParams>>();
  const [data, setData] = useState<StudentDashboardData>(emptyStudentData);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [selectedTimetableDay, setSelectedTimetableDay] = useState(() => {
    const currentDay = new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      timeZone: INDIA_TIME_ZONE,
    }).format(new Date());
    return WEEK_DAYS.includes(currentDay) ? currentDay : WEEK_DAYS[0];
  });
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const [year, month] = indiaDateKey().split("-").map(Number);
    return new Date(year, month - 1, 1);
  });
  const [selectedDate, setSelectedDate] = useState(() => indiaDateKey());

  const moveCalendarMonth = (offset: number) => {
    const next = new Date(
      calendarMonth.getFullYear(),
      calendarMonth.getMonth() + offset,
      1,
    );
    const selectedDay = Number(selectedDate.split("-")[2]) || 1;
    const day = Math.min(
      selectedDay,
      new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate(),
    );
    setCalendarMonth(next);
    setSelectedDate(dateKeyFromParts(next.getFullYear(), next.getMonth() + 1, day));
  };

  const load = useCallback(async () => {
    setRefreshing(true);
    setLoadError("");
    try {
      const profile = (await api.students.me()).data;
      const studentClass = profile.class || user?.class || "";
      const section = profile.section || user?.section || "";
      const scope = studentClass
        ? `class=${encodeURIComponent(studentClass)}${section ? `&section=${encodeURIComponent(section)}` : ""}`
        : "";
      const examQuery = scope ? `?${scope}` : "";
      const results = await Promise.allSettled([
        api.attendance.list(),
        api.timetable.list(scope),
        api.homework.list(),
        get<unknown>(`/exams${examQuery}`),
        get<Row>("/marks/report-card"),
        api.fees.invoices.list(),
        api.fees.payments.list(),
        api.notices.list(),
        get<unknown>("/homework/submissions"),
        api.events.list(),
        get<CalendarHoliday[]>("/events/india-holidays"),
      ]);
      const labels = [
        "Attendance",
        "Timetable",
        "Homework",
        "Examinations",
        "Results",
        "Fees",
        "Fee payments",
        "Notices",
        "Homework submissions",
        "School events",
        "India holidays",
      ];
      const failures = results.flatMap((result, index) =>
        result.status === "rejected"
          ? [
              `${labels[index]}: ${
                result.reason instanceof Error
                  ? result.reason.message
                  : "Unable to load"
              }`,
            ]
          : [],
      );
      const valueAt = <T,>(index: number, fallback: T): T => {
        const result = results[index];
        return result.status === "fulfilled"
          ? (result.value.data as T)
          : fallback;
      };
      setData({
        profile,
        attendance: valueAt(0, []),
        timetable: extractList(valueAt<unknown>(1, [])),
        homework: extractList(valueAt<unknown>(2, [])),
        exams: extractList(valueAt<unknown>(3, [])),
        marks: valueAt<Row | null>(4, null),
        invoices: valueAt(5, []),
        payments: valueAt(6, []),
        notices: valueAt(7, []),
        submissions: extractList(valueAt<unknown>(8, [])),
        events: valueAt(9, []),
        holidays: valueAt(10, []),
      });
      setLoadError(failures.join(" · "));
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? `Student profile: ${error.message}`
          : "Your student profile could not be loaded. Please sign in again.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.class, user?.section]);

  useEffect(() => {
    void load();
  }, [load]);

  const today = indiaDateKey();
  const className = data.profile?.class || user?.class || "";
  const section = data.profile?.section || user?.section || "";
  const attendancePercent = data.attendance.length
    ? Math.round(
        (data.attendance.filter((item) => /present|half/i.test(item.status))
          .length /
          data.attendance.length) *
          100,
      )
    : 0;
  const submissionIds = new Set(
    data.submissions.map((submission) => {
      const homework = submission.homework;
      const nestedId =
        homework && typeof homework === "object" && "_id" in homework
          ? homework._id
          : "";
      return String(submission.homeworkId || nestedId);
    }),
  );
  const upcomingHomework = data.homework
    .filter((item) => {
      const dueDate = String(item.dueDate || "").slice(0, 10);
      return dueDate;
    })
    .sort((a, b) => {
      const rank = (item: Row) => {
        const dueDate = String(item.dueDate || "").slice(0, 10);
        const submitted = submissionIds.has(String(item._id || ""));
        return dueDate < today ? (submitted ? 2 : 0) : submitted ? 3 : 1;
      };
      return (
        rank(a) - rank(b) ||
        String(a.dueDate || "").localeCompare(String(b.dueDate || ""))
      );
    })
    .slice(0, 3);
  const upcomingExams = data.exams
    .filter((item) => {
      const date = dateKeyOf(String(item.date || ""));
      return date && date >= today;
    })
    .sort((a, b) =>
      dateKeyOf(String(a.date || "")).localeCompare(
        dateKeyOf(String(b.date || "")),
      ),
    )
    .slice(0, 2);
  const outstandingFees = data.invoices.reduce(
    (total, invoice) =>
      total + Math.max(0, Number(invoice.amount || 0) - Number(invoice.paidAmount || 0)),
    0,
  );
  const unpaidInvoices = data.invoices
    .filter(
      (invoice) =>
        Number(invoice.amount || 0) - Number(invoice.paidAmount || 0) > 0,
    )
    .sort((a, b) => {
      const aDue = String(a.dueDate || "");
      const bDue = String(b.dueDate || "");
      return aDue.localeCompare(bDue);
    })
    .slice(0, 3);
  const recentPayments = [...data.payments]
    .sort((a, b) =>
      String(b.paidOn || "").localeCompare(String(a.paidOn || "")),
    )
    .slice(0, 3);
  const todayName = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    timeZone: INDIA_TIME_ZONE,
  }).format(new Date());
  const weekSchedules = WEEK_DAYS.map((day) => {
    const schedule = data.timetable.find(
      (item) => String(item.day || "").toLowerCase() === day.toLowerCase(),
    );
    return {
      day,
      periods: Array.isArray(schedule?.periods)
        ? [...(schedule.periods as Row[])].sort((a, b) =>
            String(a.startTime || "").localeCompare(String(b.startTime || "")),
          )
        : [],
    };
  });
  const selectedSchedule = weekSchedules.find(
    (schedule) => schedule.day === selectedTimetableDay,
  );
  const pendingHomework = data.homework.filter((item) => {
    const dueDate = String(item.dueDate || "").slice(0, 10);
    return dueDate >= today && !submissionIds.has(String(item._id || ""));
  }).length;
  const attendanceTrend: Point[] = (() => {
    const byMonth = new Map<number, { present: number; total: number }>();
    data.attendance.forEach((record) => {
      if (!record.date) return;
      const date = new Date(record.date);
      if (Number.isNaN(date.getTime())) return;
      const key = date.getFullYear() * 12 + date.getMonth();
      const bucket = byMonth.get(key) || { present: 0, total: 0 };
      bucket.total += 1;
      if (/^present$/i.test(record.status)) bucket.present += 1;
      byMonth.set(key, bucket);
    });
    return [...byMonth.entries()]
      .sort(([a], [b]) => a - b)
      .slice(-6)
      .map(([monthKey, bucket]) => {
        const year = Math.floor(monthKey / 12);
        const month = monthKey % 12;
        return {
          label: new Date(year, month).toLocaleDateString("en-IN", {
            month: "short",
          }),
          value: Math.round((bucket.present / bucket.total) * 100),
        };
      });
  })();
  const resultSubjects = Array.isArray(data.marks?.subjects)
    ? (data.marks.subjects as Row[])
    : [];
  const latestResult = (() => {
    if (!resultSubjects.length) return null;
    const grouped = new Map<string, Row[]>();
    resultSubjects.forEach((subject) => {
      const examName = String(subject.examName || "Latest results");
      grouped.set(examName, [...(grouped.get(examName) || []), subject]);
    });
    return [...grouped.entries()]
      .map(([examName, subjects]) => ({
        examName,
        subjects,
        max: subjects.reduce((sum, item) => sum + Number(item.maxMarks || 0), 0),
        obtained: subjects.reduce(
          (sum, item) => sum + Number(item.marksObtained || 0),
          0,
        ),
      }))
      .sort((a, b) => {
        const examDate = (examName: string) =>
          data.exams.find((exam) => exam.examName === examName)?.date || "";
        return String(examDate(b.examName)).localeCompare(
          String(examDate(a.examName)),
        );
      })[0];
  })();
  const upcomingEvents = data.events
    .filter((event) => event.date && dateKeyOf(event.date) >= today)
    .sort((a, b) => dateKeyOf(a.date).localeCompare(dateKeyOf(b.date)))
    .slice(0, 3);
  const latestNotices = [...data.notices]
    .sort((a, b) =>
      String(b.createdAt || "").localeCompare(String(a.createdAt || "")),
    )
    .slice(0, 3);
  const monthYear = new Date(
    Date.UTC(calendarMonth.getFullYear(), calendarMonth.getMonth(), 15, 12),
  ).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const calendarCells: ({ day: number; dateKey: string } | null)[] = (() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const leadingDays = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    return [
      ...Array.from({ length: leadingDays }, () => null),
      ...Array.from({ length: daysInMonth }, (_, index) => {
        const day = index + 1;
        return {
          day,
          dateKey: dateKeyFromParts(year, month + 1, day),
        };
      }),
    ];
  })();
  const selectedDateObject = (() => {
    const [year, month, day] = selectedDate.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day, 12));
  })();
  const selectedDateLabel = selectedDateObject.toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
  const selectedAttendance = data.attendance.find(
    (record) => dateKeyOf(record.date) === selectedDate,
  );
  const selectedEvents = data.events.filter(
    (event) =>
      dateKeyOf(event.date) === selectedDate &&
      String(event.category || "").toLowerCase() !== "holiday",
  );
  const selectedHolidayCandidates = [
    ...data.holidays.filter(
      (holiday) => dateKeyOf(holiday.date) === selectedDate,
    ),
    ...data.events.filter(
      (event) =>
        dateKeyOf(event.date) === selectedDate &&
        String(event.category || "").toLowerCase() === "holiday",
    ),
  ];
  const selectedHolidays = selectedHolidayCandidates.filter(
    (holiday, index, holidays) =>
      holidays.findIndex(
        (candidate) =>
          candidate.title === holiday.title &&
          dateKeyOf(candidate.date) === dateKeyOf(holiday.date),
      ) === index,
  );
  const selectedExams = data.exams.filter(
    (exam) => dateKeyOf(String(exam.date || "")) === selectedDate,
  );
  const selectedHomework = data.homework.filter(
    (item) => dateKeyOf(String(item.dueDate || "")) === selectedDate,
  );

  const indicatorsForDate = (dateKey: string) => {
    const indicators: { color: string; label: string }[] = [];
    const attendance = data.attendance.find(
      (record) => dateKeyOf(record.date) === dateKey,
    );
    if (attendance) {
      indicators.push({
        color: /^present$/i.test(attendance.status)
          ? colors.success
          : colors.alert,
        label: "Attendance",
      });
    }
    if (
      data.events.some(
        (event) =>
          dateKeyOf(event.date) === dateKey &&
          String(event.category || "").toLowerCase() !== "holiday",
      )
    ) {
      indicators.push({ color: colors.amber, label: "School event" });
    }
    if (
      data.holidays.some((holiday) => dateKeyOf(holiday.date) === dateKey) ||
      data.events.some(
        (event) =>
          dateKeyOf(event.date) === dateKey &&
          String(event.category || "").toLowerCase() === "holiday",
      )
    ) {
      indicators.push({ color: "#7B61A8", label: "Holiday" });
    }
    if (
      data.exams.some(
        (exam) => dateKeyOf(String(exam.date || "")) === dateKey,
      )
    ) {
      indicators.push({ color: "#8B5CF6", label: "Exam" });
    }
    if (
      data.homework.some(
        (item) => dateKeyOf(String(item.dueDate || "")) === dateKey,
      )
    ) {
      indicators.push({ color: colors.info, label: "Homework due" });
    }
    return indicators;
  };

  const quickActions: {
    title: string;
    route: "AttendanceHistory" | "Timetable" | "Homework" | "ReportCard" | "OnlinePayment";
    icon: keyof typeof Ionicons.glyphMap;
    color: string;
  }[] = [
    { title: "Attendance", route: "AttendanceHistory", icon: "calendar-outline", color: colors.success },
    { title: "Timetable", route: "Timetable", icon: "calendar-outline", color: colors.info },
    { title: "Homework", route: "Homework", icon: "book-outline", color: colors.amberDark },
    { title: "Results", route: "ReportCard", icon: "trophy-outline", color: colors.success },
    { title: "Fees", route: "OnlinePayment", icon: "card-outline", color: colors.alert },
  ];

  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={s.studentContent}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={load} />
      }
    >
      <View style={s.studentHero}>
        <Text style={s.studentEyebrow}>{school?.name || "ZIPSchool"}</Text>
        <Text style={s.studentHi}>
          Hello, {data.profile?.name || user?.name || "Student"}!
        </Text>
        <Text style={s.studentSub}>
          {className ? `Class ${className}` : "Your student dashboard"}
          {section ? ` · Section ${section}` : ""}
          {data.profile?.rollNo ? ` · Roll no. ${data.profile.rollNo}` : ""}
        </Text>
        <Text style={s.studentSession}>
          {school?.currentSession?.name || school?.session || "Have a great day"}
        </Text>
      </View>

      <View style={s.calendarCard}>
        <View style={s.calendarHeader}>
          <View style={s.calendarTitleGroup}>
            <View style={s.calendarIcon}>
              <Ionicons name="calendar" size={18} color={colors.info} />
            </View>
            <View>
              <Text style={s.calendarTitle}>School calendar</Text>
              <Text style={s.calendarSubtitle}>
                Events · India time · Monday start
              </Text>
            </View>
          </View>
          <View style={s.calendarControls}>
            <Pressable
              onPress={() =>
                moveCalendarMonth(-1)
              }
              accessibilityRole="button"
              accessibilityLabel="Previous month"
              hitSlop={8}
              style={s.monthButton}
            >
              <Ionicons name="chevron-back" size={18} color={colors.ink} />
            </Pressable>
            <Pressable
              onPress={() => {
                const [year, month] = indiaDateKey().split("-").map(Number);
                setCalendarMonth(new Date(year, month - 1, 1));
                setSelectedDate(indiaDateKey());
              }}
              accessibilityRole="button"
              accessibilityLabel="Go to current month"
              style={s.monthButton}
            >
              <Ionicons name="today-outline" size={18} color={colors.info} />
            </Pressable>
            <Pressable
              onPress={() =>
                moveCalendarMonth(1)
              }
              accessibilityRole="button"
              accessibilityLabel="Next month"
              hitSlop={8}
              style={s.monthButton}
            >
              <Ionicons name="chevron-forward" size={18} color={colors.ink} />
            </Pressable>
          </View>
        </View>
        <Text style={s.monthLabel}>{monthYear}</Text>
        <View style={s.calendarGrid}>
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((weekday) => (
            <Text key={weekday} style={s.weekdayLabel}>
              {weekday}
            </Text>
          ))}
          {calendarCells.map((cell, index) =>
            cell ? (
              <Pressable
                key={cell.dateKey}
                onPress={() => setSelectedDate(cell.dateKey)}
                accessibilityRole="button"
                accessibilityLabel={`${cell.dateKey}${indicatorsForDate(cell.dateKey).map((item) => `, ${item.label}`).join("")}`}
                accessibilityState={{ selected: selectedDate === cell.dateKey }}
                style={s.calendarCell}
              >
                <View
                  style={[
                    s.calendarDay,
                    cell.dateKey === today && s.calendarToday,
                    cell.dateKey === selectedDate && s.calendarSelected,
                  ]}
                >
                  <Text
                    style={[
                      s.calendarDayText,
                      cell.dateKey === today && s.calendarTodayText,
                      cell.dateKey === selectedDate && s.calendarSelectedText,
                    ]}
                  >
                    {cell.day}
                  </Text>
                </View>
                <View style={s.calendarDots}>
                  {indicatorsForDate(cell.dateKey)
                    .slice(0, 3)
                    .map((item, dotIndex) => (
                      <View
                        key={`${item.label}-${dotIndex}`}
                        style={[s.calendarDot, { backgroundColor: item.color }]}
                      />
                    ))}
                </View>
              </Pressable>
            ) : (
              <View key={`empty-${index}`} style={s.calendarCell} />
            ),
          )}
        </View>
        <View style={s.calendarLegend}>
          {[
            { label: "Attendance", color: colors.success },
            { label: "Event", color: colors.amber },
            { label: "Holiday", color: "#7B61A8" },
            { label: "Exam", color: "#8B5CF6" },
            { label: "Homework", color: colors.info },
          ].map((item) => (
            <View key={item.label} style={s.legendItem}>
              <View style={[s.calendarDot, { backgroundColor: item.color }]} />
              <Text style={s.legendText}>{item.label}</Text>
            </View>
          ))}
        </View>
        <View style={s.agenda}>
          <View style={s.agendaHeading}>
            <Text style={s.agendaDate}>{selectedDateLabel}</Text>
            {selectedDate === today && (
              <Text style={s.todayBadge}>TODAY</Text>
            )}
          </View>
          {selectedAttendance && (
            <View style={s.agendaItem}>
              <View
                style={[
                  s.agendaMarker,
                  {
                    backgroundColor: /^present$/i.test(selectedAttendance.status)
                      ? colors.success
                      : colors.alert,
                  },
                ]}
              />
              <Text style={s.agendaText}>
                Attendance: {selectedAttendance.status}
              </Text>
            </View>
          )}
          {selectedHolidays.map((holiday, index) => (
            <View
              key={`holiday-${holiday._id || index}`}
              style={s.agendaItem}
            >
              <View
                style={[s.agendaMarker, { backgroundColor: "#7B61A8" }]}
              />
              <Text style={s.agendaText}>
                {holiday.title || "India holiday"}
              </Text>
            </View>
          ))}
          {selectedEvents.map((event, index) => (
            <View key={`event-${event._id || index}`} style={s.agendaItem}>
              <View
                style={[s.agendaMarker, { backgroundColor: colors.amberDark }]}
              />
              <Text style={s.agendaText}>
                {event.title}
                {event.time ? ` · ${event.time}` : ""}
              </Text>
            </View>
          ))}
          {selectedExams.map((exam, index) => (
            <View key={`exam-${String(exam._id || index)}`} style={s.agendaItem}>
              <View
                style={[s.agendaMarker, { backgroundColor: "#8B5CF6" }]}
              />
              <Text style={s.agendaText}>
                {String(exam.examName || "Examination")}
                {exam.subject ? ` · ${String(exam.subject)}` : ""}
              </Text>
            </View>
          ))}
          {selectedHomework.map((item, index) => (
            <View key={`homework-${String(item._id || index)}`} style={s.agendaItem}>
              <View
                style={[s.agendaMarker, { backgroundColor: colors.info }]}
              />
              <Text style={s.agendaText}>
                {String(item.title || item.subject || "Homework due")}
              </Text>
            </View>
          ))}
          {!selectedAttendance &&
            !selectedHolidays.length &&
            !selectedEvents.length &&
            !selectedExams.length &&
            !selectedHomework.length && (
              <Text style={s.agendaEmpty}>
                Nothing scheduled for this date.
              </Text>
            )}
        </View>
      </View>

      {!!loadError && (
        <View style={s.errorBox}>
          <Text style={s.errorText}>{loadError}</Text>
          <Pressable
            onPress={() => void load()}
            accessibilityRole="button"
            disabled={refreshing}
          >
            <Text style={s.retry}>{refreshing ? "Loading..." : "Retry"}</Text>
          </Pressable>
        </View>
      )}

      {loading && !data.profile ? (
        <View style={s.loading}>
          <ActivityIndicator color={colors.ink} />
          <Text style={s.nb}>Loading your school day...</Text>
        </View>
      ) : (
        <>
          <View style={s.grid}>
            <StatCard
              label="Attendance"
              value={data.attendance.length ? `${attendancePercent}%` : "—"}
              color={colors.success}
            />
            <StatCard
              label="To submit"
              value={pendingHomework}
              color={colors.info}
            />
            <StatCard
              label="Upcoming exams"
              value={upcomingExams.length}
              color={colors.amberDark}
            />
            <StatCard
              label="Fees due"
              value={
                outstandingFees
                  ? `₹${Math.round(outstandingFees).toLocaleString("en-IN")}`
                  : "₹0"
              }
              color={outstandingFees ? colors.alert : colors.success}
            />
          </View>

          <Text style={s.section}>Quick actions</Text>
          <View style={s.actions}>
            {quickActions.map((action) => (
              <Pressable
                key={action.route}
                style={({ pressed }) => [
                  s.action,
                  pressed && { opacity: 0.75 },
                ]}
                onPress={() => navigation.navigate(action.route)}
                accessibilityRole="button"
              >
                <Ionicons name={action.icon} size={22} color={action.color} />
                <Text style={s.actionText}>{action.title}</Text>
              </Pressable>
            ))}
          </View>

          <View style={s.sectionRow}>
            <Text style={s.section}>Weekly timetable</Text>
            <Pressable
              onPress={() => navigation.navigate("Timetable")}
              accessibilityRole="button"
            >
              <Text style={s.seeAll}>Full timetable</Text>
            </Pressable>
          </View>
          <Card>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.timetableDayFilters}
              nestedScrollEnabled
              accessibilityLabel="Filter timetable by day"
            >
              {WEEK_DAYS.map((day) => {
                const isSelected = day === selectedTimetableDay;
                const isToday = day === todayName;
                const dayPeriodCount =
                  weekSchedules.find((schedule) => schedule.day === day)
                    ?.periods.length || 0;
                return (
                  <Pressable
                    key={day}
                    onPress={() => setSelectedTimetableDay(day)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    accessibilityLabel={`${day}${isToday ? ", today" : ""}, ${dayPeriodCount} classes`}
                    style={[
                      s.timetableDayFilter,
                      isSelected && s.timetableDayFilterSelected,
                    ]}
                  >
                    <Text
                      style={[
                        s.timetableDayFilterText,
                        isSelected && s.timetableDayFilterTextSelected,
                      ]}
                    >
                      {isToday ? "Today" : day.slice(0, 3)}
                    </Text>
                    <Text
                      style={[
                        s.timetableDayCount,
                        isSelected && s.timetableDayCountSelected,
                      ]}
                    >
                      {dayPeriodCount}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            {selectedSchedule?.periods.length ? (
              <View style={s.selectedDaySchedule}>
                <View style={s.dayHeader}>
                  <View
                    style={[
                      s.dayBadge,
                      selectedTimetableDay === todayName && s.todayDayBadge,
                    ]}
                  >
                    <Text
                      style={[
                        s.dayHeading,
                        selectedTimetableDay === todayName && s.todayHeading,
                      ]}
                    >
                      {selectedTimetableDay.slice(0, 3)}
                    </Text>
                  </View>
                  <Text style={s.dayFullName}>
                    {selectedTimetableDay === todayName
                      ? "Today’s classes"
                      : `${selectedTimetableDay} classes`}
                  </Text>
                  <Text style={s.periodCount}>
                    {selectedSchedule.periods.length}{" "}
                    {selectedSchedule.periods.length === 1 ? "class" : "classes"}
                  </Text>
                </View>
                <View style={s.periodList}>
                  {selectedSchedule.periods.map((period, index) => (
                    <View
                      key={`${String(period.startTime || index)}-${index}`}
                      style={s.periodCard}
                    >
                      <View style={s.periodTimeBlock}>
                        <Text style={s.periodStart}>
                          {formatPeriodTime(period.startTime)}
                        </Text>
                        {!!period.endTime && (
                          <Text style={s.periodEnd}>
                            {formatPeriodTime(period.endTime)}
                          </Text>
                        )}
                      </View>
                      <View style={s.periodDivider} />
                      <View style={s.periodDetails}>
                        <Text style={s.periodSubject} numberOfLines={1}>
                          {String(period.subject || "Class")}
                        </Text>
                        <View style={s.periodMeta}>
                          {!!period.teacherName && (
                            <View style={s.periodMetaItem}>
                              <Ionicons
                                name="person-outline"
                                size={12}
                                color={colors.muted}
                              />
                              <Text style={s.periodMetaText} numberOfLines={1}>
                                {String(period.teacherName)}
                              </Text>
                            </View>
                          )}
                          {!!period.roomName && (
                            <View style={s.periodMetaItem}>
                              <Ionicons
                                name="location-outline"
                                size={12}
                                color={colors.muted}
                              />
                              <Text style={s.periodMetaText} numberOfLines={1}>
                                {String(period.roomName)}
                              </Text>
                            </View>
                          )}
                        </View>
                      </View>
                      <View style={s.periodNumber}>
                        <Text style={s.periodNumberText}>{index + 1}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            ) : (
              <View style={s.timetableEmpty}>
                <View style={s.timetableEmptyIcon}>
                  <Ionicons
                    name="calendar-outline"
                    size={22}
                    color={colors.info}
                  />
                </View>
                <Text style={s.emptyTitle}>
                  {data.timetable.length
                    ? `No classes on ${selectedTimetableDay}`
                    : "No timetable yet"}
                </Text>
                <Text style={s.timetableEmptyText}>
                  {data.timetable.length
                    ? `There are no periods scheduled for ${selectedTimetableDay}. Choose another day above to see its classes.`
                    : "Your weekly timetable has not been published yet."}
                </Text>
              </View>
            )}
            <Pressable
              onPress={() => navigation.navigate("Timetable")}
              accessibilityRole="button"
              style={s.openTimetableButton}
            >
              <Text style={s.openTimetableText}>Open full timetable</Text>
              <Ionicons name="arrow-forward" size={16} color={colors.info} />
            </Pressable>
          </Card>

          <View style={s.sectionRow}>
            <Text style={s.section}>Upcoming homework</Text>
            <Pressable
              onPress={() => navigation.navigate("Homework")}
              accessibilityRole="button"
            >
              <Text style={s.seeAll}>View all</Text>
            </Pressable>
          </View>
          <Card>
            {upcomingHomework.length ? (
              upcomingHomework.map((item, index) => (
                <View key={String(item._id || index)} style={s.listRow}>
                  <View style={[s.dot, { backgroundColor: colors.amber }]} />
                  <View style={s.listCopy}>
                    <Text style={s.nt}>
                      {String(item.title || item.subject || "Homework")}
                    </Text>
                    <Text style={s.nb}>
                      {String(item.subject || "Assignment")} · Due{" "}
                      {formatStudentDate(String(item.dueDate))}
                      {String(item.dueDate || "").slice(0, 10) < today
                        ? " · Overdue"
                        : submissionIds.has(String(item._id || ""))
                          ? " · Submitted"
                          : " · Pending"}
                    </Text>
                  </View>
                </View>
              ))
            ) : (
              <Text style={s.nb}>No upcoming homework. You’re all caught up!</Text>
            )}
          </Card>

          <View style={s.sectionRow}>
            <Text style={s.section}>Upcoming Exams</Text>
            <Text style={s.seeAll}>{upcomingExams.length} scheduled</Text>
          </View>
          <Card>
            {upcomingExams.length ? (
              upcomingExams.map((exam, index) => (
                <View key={String(exam._id || index)} style={s.listRow}>
                  <View style={[s.dot, { backgroundColor: "#8B5CF6" }]} />
                  <View style={s.listCopy}>
                    <Text style={s.nt}>
                      {String(
                        exam.name || exam.title || exam.examName || "Examination",
                      )}
                    </Text>
                    <Text style={s.nb}>
                      {String(exam.subject || "School examination")} ·{" "}
                      {formatStudentDate(String(exam.date))}
                    </Text>
                  </View>
                </View>
              ))
            ) : (
              <Text style={s.nb}>No upcoming exams have been scheduled.</Text>
            )}
          </Card>

          <View style={s.sectionRow}>
            <Text style={s.section}>Fees &amp; Payments</Text>
            <Pressable
              onPress={() => navigation.navigate("OnlinePayment")}
              accessibilityRole="button"
            >
              <Text style={s.seeAll}>View all</Text>
            </Pressable>
          </View>
          <Card>
            <View style={s.feeSummary}>
              <View style={s.feeSummaryCopy}>
                <Text style={s.nb}>Outstanding balance</Text>
                <Text
                  style={[
                    s.feeBalance,
                    { color: outstandingFees ? colors.alert : colors.success },
                  ]}
                >
                  ₹{Math.round(outstandingFees).toLocaleString("en-IN")}
                </Text>
              </View>
              <Pressable
                onPress={() => navigation.navigate("OnlinePayment")}
                accessibilityRole="button"
                style={s.payFeesButton}
              >
                <Ionicons name="card-outline" size={15} color="#FFFFFF" />
                <Text style={s.payFeesButtonText}>
                  {outstandingFees ? "Pay fees" : "Fee portal"}
                </Text>
              </Pressable>
            </View>
            <Text style={s.feeSubheading}>Unpaid invoices</Text>
            {unpaidInvoices.length ? (
              unpaidInvoices.map((invoice, index) => {
                const remaining =
                  Number(invoice.amount || 0) - Number(invoice.paidAmount || 0);
                return (
                  <View
                    key={String(invoice._id || index)}
                    style={s.listRow}
                  >
                    <View style={[s.dot, { backgroundColor: colors.amber }]} />
                    <View style={s.listCopy}>
                      <Text style={s.nt}>
                        {String(invoice.feeType || "School fees")}
                      </Text>
                      <Text style={s.nb}>
                        {invoice.dueDate
                          ? `Due ${formatStudentDate(invoice.dueDate)}`
                          : "Due date not set"}
                      </Text>
                    </View>
                    <Text style={s.feeInvoiceAmount}>
                      {invoice.currency || "₹"}
                      {Math.round(remaining).toLocaleString("en-IN")}
                    </Text>
                  </View>
                );
              })
            ) : (
              <Text style={s.nb}>No outstanding invoices.</Text>
            )}
            <Text style={s.feeSubheading}>Recent payments</Text>
            {recentPayments.length ? (
              recentPayments.map((payment, index) => (
                <View
                  key={String(payment._id || payment.receiptNo || index)}
                  style={s.listRow}
                >
                  <View style={[s.dot, { backgroundColor: colors.success }]} />
                  <View style={s.listCopy}>
                    <Text style={s.nt}>
                      {payment.receiptNo
                        ? `Receipt ${payment.receiptNo}`
                        : "Fee payment"}
                    </Text>
                    <Text style={s.nb}>
                      {payment.paidOn
                        ? formatStudentDate(payment.paidOn)
                        : "Date not available"}
                      {payment.mode ? ` · ${payment.mode}` : ""}
                    </Text>
                  </View>
                  <Text style={[s.feeInvoiceAmount, { color: colors.success }]}>
                    ₹{Math.round(Number(payment.amount || 0)).toLocaleString("en-IN")}
                  </Text>
                </View>
              ))
            ) : (
              <Text style={s.nb}>No payments recorded yet.</Text>
            )}
          </Card>

          <View style={s.sectionRow}>
            <Text style={s.section}>Attendance overview</Text>
            <Pressable
              onPress={() => navigation.navigate("AttendanceHistory")}
              accessibilityRole="button"
            >
              <Text style={s.seeAll}>
                {data.attendance.length
                  ? `${attendancePercent}% · View history`
                  : "View attendance"}
              </Text>
            </Pressable>
          </View>
          <Card>
            <TrendChart data={attendanceTrend} color={colors.info} />
            {[...data.attendance]
              .sort((a, b) =>
                String(b.date || "").localeCompare(String(a.date || "")),
              )
              .slice(0, 3)
              .map((record, index) => (
                <View
                  key={`${String(record.date || index)}-${index}`}
                  style={s.listRow}
                >
                  <Text style={s.listCopy}>
                    {formatStudentDate(record.date)}
                  </Text>
                  <Text
                    style={[
                      s.nt,
                      {
                        color: /^present$/i.test(record.status)
                          ? colors.success
                          : colors.alert,
                      },
                    ]}
                  >
                    {record.status}
                  </Text>
                </View>
              ))}
          </Card>

          <View style={s.sectionRow}>
            <Text style={s.section}>Latest results</Text>
            <Pressable
              onPress={() => navigation.navigate("ReportCard")}
              accessibilityRole="button"
            >
              <Text style={s.seeAll}>View report card</Text>
            </Pressable>
          </View>
          <Card>
            {latestResult ? (
              <>
                <Text style={s.nt}>{latestResult.examName}</Text>
                <Text style={s.resultTotal}>
                  {latestResult.obtained} / {latestResult.max}
                  {latestResult.max
                    ? ` · ${Math.round((latestResult.obtained / latestResult.max) * 100)}%`
                    : ""}
                </Text>
                {latestResult.subjects.slice(0, 4).map((subject, index) => (
                  <View
                    key={`${String(subject.subject || index)}-${index}`}
                    style={s.listRow}
                  >
                    <Text style={s.listCopy}>
                      {String(subject.subject || "Subject")}
                    </Text>
                    <Text style={s.nt}>
                      {String(subject.marksObtained ?? "—")} /{" "}
                      {String(subject.maxMarks ?? "—")}
                    </Text>
                  </View>
                ))}
              </>
            ) : (
              <Text style={s.nb}>Published results will appear here.</Text>
            )}
          </Card>

          {!!upcomingEvents.length && (
            <>
              <Text style={s.section}>Upcoming school events</Text>
              {upcomingEvents.map((event) => (
                <Card key={event._id}>
                  <Text style={s.nt}>{event.title}</Text>
                  <Text style={s.nb}>
                    {formatStudentDate(event.date)}
                    {event.venue ? ` · ${event.venue}` : ""}
                  </Text>
                </Card>
              ))}
            </>
          )}

          <Text style={s.section}>Latest notices</Text>
          {latestNotices.length ? (
            latestNotices.map((notice) => (
              <Card key={notice._id}>
                <Text style={s.nt}>{notice.title}</Text>
                <Text numberOfLines={3} style={s.nb}>
                  {notice.body || notice.description || "No additional details"}
                </Text>
              </Card>
            ))
          ) : (
            <Card>
              <Text style={s.nb}>No notices have been posted yet.</Text>
            </Card>
          )}
        </>
      )}
    </ScrollView>
  );
}

function SchoolDashboardScreen() {
  const { user, school } = useAuth();
  const [stats, setStats] = useState<{
    students?: number;
    active?: number;
    staff?: number;
    present?: number;
  }>({});
  const [trend, setTrend] = useState<Point[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState("");

  const load = useCallback(async () => {
    setRefreshing(true);
    const [st, staff, att, nt] = await Promise.allSettled([
      api.students.stats(),
      api.staff.list(),
      api.attendance.list(),
      api.notices.list(),
    ]);
    setStats((current) => ({
      students:
        st.status === "fulfilled" ? st.value.data.total : current.students,
      active: st.status === "fulfilled" ? st.value.data.active : current.active,
      staff:
        staff.status === "fulfilled" ? staff.value.data.length : current.staff,
      present:
        att.status === "fulfilled"
          ? att.value.data.filter((a) => a.status === "present").length
          : current.present,
    }));
    const failures = [
      ["Students", st],
      ["Staff", staff],
      ["Attendance", att],
      ["Notices", nt],
    ] as const;
    const messages = failures
      .filter(([, result]) => result.status === "rejected")
      .map(
        ([label, result]) =>
          `${label}: ${(result as PromiseRejectedResult).reason?.message || "Unable to load"}`,
      );
    setLoadError(messages.join(" · "));
    if (att.status === "fulfilled") {
      const byDay: Record<string, { p: number; t: number }> = {};
      (
        att.value.data as unknown as { date?: string; status: string }[]
      ).forEach((a) => {
        if (!a.date) return;
        const k = String(a.date).slice(0, 10);
        const b = (byDay[k] ??= { p: 0, t: 0 });
        b.t += 1;
        if (/present/i.test(a.status)) b.p += 1;
        else if (/half/i.test(a.status)) b.p += 0.5;
      });
      setTrend(
        Object.keys(byDay)
          .sort()
          .slice(-14)
          .map((k) => ({
            label: k.slice(5).replace("-", "/"),
            value: Math.round((byDay[k].p / byDay[k].t) * 100),
          })),
      );
    }
    if (nt.status === "fulfilled") setNotices(nt.value.data.slice(0, 3));
    setRefreshing(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  const onRefresh = load;

  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={{ padding: 16, gap: 14 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <Text style={s.hi}>Hello, {user?.name} 👋</Text>
      <Text style={s.sub}>
        {school?.name ?? "Zipschool OS"} ·{" "}
        {school?.currentSession?.name ?? school?.session ?? ""}
      </Text>
      {!!loadError && (
        <View style={s.errorBox}>
          <Text style={s.errorText}>{loadError}</Text>
          <Pressable
            onPress={load}
            accessibilityRole="button"
            disabled={refreshing}
          >
            <Text style={s.retry}>{refreshing ? "Loading..." : "Retry"}</Text>
          </Pressable>
        </View>
      )}
      <View style={s.grid}>
        <StatCard label="Students" value={stats.students ?? "—"} />
        <StatCard
          label="Active"
          value={stats.active ?? "—"}
          color={colors.success}
        />
        <StatCard
          label="Staff"
          value={stats.staff ?? "—"}
          color={colors.info}
        />
        <StatCard
          label="Present today"
          value={stats.present ?? "—"}
          color={colors.amberDark}
        />
      </View>
      <Text style={s.section}>Attendance trend (last 14 days) swss</Text>
      <Card>
        <TrendChart data={trend} />
      </Card>
      <Text style={s.section}>Latest notices</Text>
      {notices.map((n) => (
        <Card key={n._id}>
          <Text style={s.nt}>{n.title}</Text>
          <Text numberOfLines={2} style={s.nb}>
            {n.body}
          </Text>
        </Card>
      ))}
    </ScrollView>
  );
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  studentContent: { padding: 16, gap: 14, paddingBottom: 28 },
  studentHero: {
    backgroundColor: colors.ink,
    borderRadius: 18,
    padding: 20,
    gap: 6,
  },
  studentEyebrow: { color: "#D7DFEF", fontSize: 12, fontWeight: "700" },
  studentHi: { color: "#fff", fontSize: 25, fontWeight: "800" },
  studentSub: { color: "#E9EDF5", fontSize: 14 },
  studentSession: { color: "#F2C477", fontSize: 12, fontWeight: "700", marginTop: 4 },
  calendarCard: {
    backgroundColor: colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    shadowColor: "#16213E",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
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
    gap: 10,
    flex: 1,
  },
  calendarIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#EAF2FA",
    alignItems: "center",
    justifyContent: "center",
  },
  calendarTitle: { color: colors.ink, fontSize: 15, fontWeight: "800" },
  calendarSubtitle: { color: colors.muted, fontSize: 11, marginTop: 2 },
  calendarControls: { flexDirection: "row", alignItems: "center", gap: 4 },
  monthButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: colors.paper,
    alignItems: "center",
    justifyContent: "center",
  },
  monthLabel: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: "800",
    marginTop: 18,
    marginBottom: 10,
  },
  calendarGrid: { flexDirection: "row", flexWrap: "wrap" },
  weekdayLabel: {
    width: "14.2857%",
    color: colors.muted,
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
    paddingVertical: 8,
  },
  calendarCell: {
    width: "14.2857%",
    height: 48,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: 2,
  },
  calendarDay: {
    width: 31,
    height: 31,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  calendarToday: { borderWidth: 1.5, borderColor: colors.info },
  calendarSelected: { backgroundColor: colors.ink, borderColor: colors.ink },
  calendarDayText: { color: colors.text, fontSize: 12, fontWeight: "600" },
  calendarTodayText: { color: colors.info, fontWeight: "800" },
  calendarSelectedText: { color: "#fff", fontWeight: "800" },
  calendarDots: {
    height: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  calendarDot: { width: 5, height: 5, borderRadius: 3 },
  calendarLegend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    paddingTop: 12,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendText: { color: colors.muted, fontSize: 10 },
  agenda: {
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    padding: 12,
    marginTop: 14,
    gap: 8,
  },
  agendaHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  agendaDate: { color: colors.ink, fontSize: 13, fontWeight: "800" },
  todayBadge: {
    color: colors.info,
    backgroundColor: "#EAF2FA",
    fontSize: 9,
    fontWeight: "800",
    overflow: "hidden",
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  agendaItem: { flexDirection: "row", alignItems: "center", gap: 8 },
  agendaMarker: { width: 7, height: 7, borderRadius: 4 },
  agendaText: { flex: 1, color: colors.text, fontSize: 12 },
  agendaEmpty: { color: colors.muted, fontSize: 12 },
  loading: { alignItems: "center", gap: 10, paddingVertical: 32 },
  hi: { fontSize: 24, fontWeight: "800", color: colors.ink },
  sub: { color: colors.muted, marginBottom: 4 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  section: { fontSize: 16, fontWeight: "700", color: colors.ink, marginTop: 8 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  action: {
    flex: 1,
    minWidth: "45%",
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionText: { color: colors.ink, fontSize: 13, fontWeight: "700" },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  seeAll: { color: colors.info, fontSize: 13, fontWeight: "700" },
  inlineLink: { alignSelf: "flex-start", paddingTop: 10 },
  resultTotal: { color: colors.success, fontWeight: "800", fontSize: 18, marginTop: 5 },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  listCopy: { flex: 1, gap: 3 },
  feeSummary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingBottom: 14,
    marginBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  feeSummaryCopy: { flex: 1, gap: 3 },
  feeBalance: { fontSize: 21, fontWeight: "800" },
  payFeesButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: colors.info,
  },
  payFeesButtonText: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
  feeSubheading: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 10,
  },
  feeInvoiceAmount: { color: colors.ink, fontSize: 12, fontWeight: "800" },
  timetableDayFilters: {
    gap: 8,
    paddingBottom: 14,
    paddingRight: 4,
  },
  timetableDayFilter: {
    minWidth: 58,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.paper,
  },
  timetableDayFilterSelected: {
    borderColor: colors.info,
    backgroundColor: colors.info,
  },
  timetableDayFilterText: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "700",
  },
  timetableDayFilterTextSelected: { color: "#FFFFFF" },
  timetableDayCount: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "600",
  },
  timetableDayCountSelected: { color: "#EAF2FA" },
  selectedDaySchedule: {
    paddingTop: 2,
  },
  dayHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginBottom: 10,
  },
  dayBadge: {
    width: 38,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F0F2F5",
  },
  todayDayBadge: { backgroundColor: "#EAF2FA" },
  dayHeading: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "800",
  },
  todayHeading: { color: colors.info },
  dayFullName: { flex: 1, color: colors.ink, fontSize: 13, fontWeight: "800" },
  periodCount: { color: colors.muted, fontSize: 11, fontWeight: "600" },
  periodList: { gap: 8, paddingLeft: 4 },
  periodCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 66,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E9EDF2",
    backgroundColor: "#FBFCFE",
  },
  periodTimeBlock: {
    width: 62,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  periodStart: { color: colors.info, fontSize: 11, fontWeight: "800" },
  periodEnd: { color: colors.muted, fontSize: 10, fontWeight: "500" },
  periodDivider: {
    width: 3,
    alignSelf: "stretch",
    minHeight: 34,
    borderRadius: 2,
    backgroundColor: "#D8E6F3",
  },
  periodDetails: { flex: 1, gap: 5 },
  periodSubject: { color: colors.ink, fontSize: 13, fontWeight: "800" },
  periodMeta: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  periodMetaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    maxWidth: "100%",
  },
  periodMetaText: { color: colors.muted, fontSize: 10, flexShrink: 1 },
  periodNumber: {
    width: 23,
    height: 23,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EEF2F6",
  },
  periodNumberText: { color: colors.muted, fontSize: 10, fontWeight: "800" },
  timetableEmpty: { alignItems: "center", paddingVertical: 18, gap: 8 },
  timetableEmptyIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EAF2FA",
  },
  emptyTitle: { color: colors.ink, fontSize: 14, fontWeight: "800" },
  timetableEmptyText: {
    color: colors.muted,
    textAlign: "center",
    fontSize: 12,
    lineHeight: 18,
    maxWidth: 260,
  },
  openTimetableButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 14,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#EAF2FA",
  },
  openTimetableText: { color: colors.info, fontSize: 13, fontWeight: "800" },
  dot: { width: 9, height: 9, borderRadius: 5 },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.alert,
    backgroundColor: "#FFF1EF",
  },
  errorText: { flex: 1, color: colors.alert, fontSize: 12 },
  retry: { color: colors.info, fontSize: 12, fontWeight: "700", padding: 4 },
  nt: { fontWeight: "700", color: colors.ink },
  nb: { color: colors.muted, marginTop: 4 },
});
