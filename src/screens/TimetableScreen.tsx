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
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { get, api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { extractList, Row } from "../lib/format";
import { Card, Empty, Input } from "../components/UI";
import { colors } from "../theme";
import type { TimetableSubstitution } from "../types";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const NON_ACADEMIC_SUBJECTS: NamedOption[] = [
  "Break",
  "Lunch",
  "Library",
  "Assembly",
  "Sports",
  "Games",
  "Free",
  "Recess",
].map((name) => ({ id: `non-academic:${name.toLowerCase()}`, name }));
const DAY_COLORS = ["#5266D8", "#8A63C7", "#168A84", "#2984B9", "#C0782B", "#37885C"];
const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const dateString = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
const dayForDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return "";
  }
  return WEEKDAY_NAMES[date.getDay()] || "";
};
const formatTime = (value: unknown) => {
  if (!value) return "—";
  const [hourValue, minuteValue] = String(value).split(":").map(Number);
  if (Number.isNaN(hourValue)) return String(value);
  const hour = ((hourValue + 11) % 12) + 1;
  return `${hour}:${String(minuteValue ?? 0).padStart(2, "0")} ${
    hourValue >= 12 ? "PM" : "AM"
  }`;
};
const recordName = (item: Row) => String(item.name || item.className || "").trim();
type PeriodDraft = {
  day: string;
  days: string[];
  index?: number;
  subject: string;
  teacherId: string;
  teacherName: string;
  roomId: string;
  roomName: string;
  startTime: string;
  endTime: string;
};
type NamedOption = { id: string; name: string; rawName?: string };
type SubstitutionDraft = {
  date: string;
  periodKey: string;
  substituteTeacherId: string;
  reason: string;
};

export default function TimetableScreen() {
  const { user, can } = useAuth();
  const isStudent = user?.role === "student";
  const isTeacher = user?.role === "teacher";
  const canWrite = can("timetable:write") && !isStudent;
  const [className, setClassName] = useState("");
  const [section, setSection] = useState("");
  const [substitutionExpanded, setSubstitutionExpanded] = useState(false);
  const [classes, setClasses] = useState<string[]>([]);
  const [sectionRows, setSectionRows] = useState<Row[]>([]);
  const [teacherScopes, setTeacherScopes] = useState<
    { class: string; section: string }[]
  >([]);
  const [subjects, setSubjects] = useState<NamedOption[]>([]);
  const [rooms, setRooms] = useState<NamedOption[]>([]);
  const [teachers, setTeachers] = useState<NamedOption[]>([]);
  const [slots, setSlots] = useState<Row[]>([]);
  const [loadingMasters, setLoadingMasters] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [masterError, setMasterError] = useState("");
  const [picker, setPicker] = useState<"class" | "section" | null>(null);
  const [draft, setDraft] = useState<PeriodDraft | null>(null);
  const [periodSaveErrors, setPeriodSaveErrors] = useState<string[]>([]);
  const [periodConflicts, setPeriodConflicts] = useState<string[]>([]);
  const [periodSaveNotice, setPeriodSaveNotice] = useState("");
  const [copySource, setCopySource] = useState("");
  const [copyTargets, setCopyTargets] = useState<string[]>([]);
  const [copyOverwrite, setCopyOverwrite] = useState(false);
  const [copyBusy, setCopyBusy] = useState(false);
  const [copyErrors, setCopyErrors] = useState<string[]>([]);
  const [copyNotice, setCopyNotice] = useState("");
  const [substitutionDraft, setSubstitutionDraft] =
    useState<SubstitutionDraft | null>(null);
  const [choicePicker, setChoicePicker] = useState<
    "subject" | "teacher" | "room" | "substitute-teacher" | null
  >(null);
  const [saving, setSaving] = useState(false);
  const [substitutionDate, setSubstitutionDate] = useState(() =>
    dateString(new Date()),
  );
  const [substitutions, setSubstitutions] = useState<TimetableSubstitution[]>([]);
  const [substitutionLoading, setSubstitutionLoading] = useState(false);
  const [substitutionError, setSubstitutionError] = useState("");
  const [substitutionSaving, setSubstitutionSaving] = useState(false);
  const [substitutionBusyId, setSubstitutionBusyId] = useState("");
  const [substitutionRefreshKey, setSubstitutionRefreshKey] = useState(0);

  const classSections = useMemo(() => {
    if (isTeacher) {
      return teacherScopes
        .filter((scope) => scope.class === className)
        .map((scope) => scope.section)
        .filter(Boolean);
    }
    const matching = sectionRows
      .filter((item) => !item.className || String(item.className) === className)
      .map(recordName)
      .filter(Boolean);
    return [...new Set(matching)].sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true }),
    );
  }, [className, isTeacher, sectionRows, teacherScopes]);

  const loadTimetable = useCallback(
    async (selectedClass: string, selectedSection: string, refresh = false) => {
      if (!selectedClass || !selectedSection) {
        setSlots([]);
        setError("");
        return;
      }
      setLoading(true);
      if (refresh) setRefreshing(true);
      setError("");
      try {
        const query = `class=${encodeURIComponent(selectedClass)}&section=${encodeURIComponent(selectedSection)}`;
        const response = await api.timetable.list(query);
        setSlots(extractList(response.data));
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load this timetable.",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [],
  );

  useEffect(() => {
    let active = true;
    if (isStudent) {
      setLoading(true);
      get<Row>("/students/me")
        .then((response) => {
          if (!active) return;
          const nextClass = String(response.data.class || "");
          const nextSection = String(response.data.section || "");
          setClassName(nextClass);
          setSection(nextSection);
          void loadTimetable(nextClass, nextSection);
        })
        .catch((loadError: unknown) => {
          if (active) {
            setError(
              loadError instanceof Error
                ? loadError.message
                : "Could not load your class information.",
            );
            setLoading(false);
          }
        });
      return () => {
        active = false;
      };
    }

    if (isTeacher) {
      setLoadingMasters(true);
      setMasterError("");
      api.assignments
        .me()
        .then(({ data }) => {
          if (!active) return;
          const scopes = [
            ...(Array.isArray(data.classTeacher) ? data.classTeacher : []),
            ...(Array.isArray(data.teachingScopes) ? data.teachingScopes : []),
          ]
            .map((scope) => ({
              class: String(scope.class || "").trim(),
              section: String(scope.section || "").trim(),
            }))
            .filter((scope) => scope.class && scope.section)
            .filter(
              (scope, index, all) =>
                all.findIndex(
                  (item) =>
                    item.class === scope.class &&
                    item.section === scope.section,
                ) === index,
            )
            .sort(
              (a, b) =>
                a.class.localeCompare(b.class, undefined, { numeric: true }) ||
                a.section.localeCompare(b.section, undefined, { numeric: true }),
            );
          setTeacherScopes(scopes);
          setClasses([...new Set(scopes.map((scope) => scope.class))]);
          setSectionRows(
            scopes.map((scope) => ({
              className: scope.class,
              name: scope.section,
            })),
          );
          const primaryClass = String(data.primaryScope?.class || "");
          const primarySection = String(data.primaryScope?.section || "");
          const initialScope =
            scopes.find(
              (scope) =>
                scope.class === primaryClass &&
                scope.section === primarySection,
            ) || scopes[0];
          if (initialScope) {
            setClassName(initialScope.class);
            setSection(initialScope.section);
          } else {
            setClassName("");
            setSection("");
            setMasterError(
              "No active class or subject assignment was found. Contact your school admin.",
            );
          }
        })
        .catch((loadError: unknown) => {
          if (!active) return;
          setMasterError(
            loadError instanceof Error
              ? loadError.message
              : "Could not load your teaching assignments.",
          );
        })
        .finally(() => {
          if (active) setLoadingMasters(false);
        });
      return () => {
        active = false;
      };
    }

    setLoadingMasters(true);
    setMasterError("");
    Promise.all([
      api.examMasters.list("classes"),
      api.examMasters.list("sections"),
    ])
      .then(async ([classResponse, sectionResponse]) => {
        if (!active) return;
        const [subjectResult, roomResult, staffResult] = await Promise.allSettled([
          api.examMasters.list("subjects"),
          api.examMasters.list("rooms"),
          api.staff.list(),
        ]);
        const classRows = classResponse.data || [];
        const nextClasses = [...new Set(classRows.map(recordName).filter(Boolean))]
          .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
        const nextSections = sectionResponse.data || [];
        const nextSubjects =
          subjectResult.status === "fulfilled" ? subjectResult.value.data || [] : [];
        const nextRooms =
          roomResult.status === "fulfilled" ? roomResult.value.data || [] : [];
        const staffRows =
          staffResult.status === "fulfilled" ? staffResult.value.data || [] : [];
        setClasses(nextClasses);
        setSectionRows(nextSections);
        setSubjects(
          nextSubjects
            .map((item) => ({
              id: String(item._id || item.id || recordName(item)),
              name: recordName(item),
            }))
            .filter((item) => item.name),
        );
        setRooms(
          nextRooms
            .map((item) => ({
              id: String(item._id || item.id || recordName(item)),
              name: recordName(item),
            }))
            .filter((item) => item.name),
        );
        setTeachers(
          staffRows
            .filter(
              (item) =>
                item.role === "teacher" ||
                String(item.designation || "").toLowerCase().includes("teacher"),
            )
            .map((item) => ({
              id: String(item._id || ""),
              name: `${String(item.name || "Teacher")}${
                item.employeeId ? ` (${String(item.employeeId)})` : ""
              }`,
              rawName: String(item.name || "Teacher"),
            }))
            .filter((item) => item.id),
        );
        if (nextClasses.length) {
          const defaultClass = nextClasses.includes("1") ? "1" : nextClasses[0];
          const options = [...new Set(
            nextSections
              .filter((item) => !item.className || String(item.className) === defaultClass)
              .map(recordName)
              .filter(Boolean),
          )].sort();
          setClassName(defaultClass);
          setSection(options[0] || "");
        } else {
          setMasterError("No school classes are configured yet.");
        }
      })
      .catch((loadError: unknown) => {
        if (!active) return;
        setMasterError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load school classes and sections.",
        );
      })
      .finally(() => {
        if (active) setLoadingMasters(false);
      });
    return () => {
      active = false;
    };
  }, [isStudent, isTeacher, loadTimetable]);

  useEffect(() => {
    if (!isStudent && className && section) {
      void loadTimetable(className, section);
    }
  }, [className, section, isStudent, loadTimetable]);

  useEffect(() => {
    if (!can("timetable:read") || !className || !section || !dayForDate(substitutionDate)) {
      setSubstitutions([]);
      setSubstitutionError("");
      setSubstitutionLoading(false);
      return undefined;
    }
    let active = true;
    setSubstitutionLoading(true);
    setSubstitutionError("");
    const query = new URLSearchParams({
      class: className,
      section,
      date: substitutionDate,
    });
    api.timetable.substitutions
      .list(query.toString())
      .then((response) => {
        if (active) setSubstitutions(response.data || []);
      })
      .catch((loadError: unknown) => {
        if (!active) return;
        setSubstitutionError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load substitutions.",
        );
      })
      .finally(() => {
        if (active) setSubstitutionLoading(false);
      });
    return () => {
      active = false;
    };
  }, [can, className, section, substitutionDate, substitutionRefreshKey]);

  const periodsForDay = (selectedDay: string) => {
    const timetableForDay = slots.find((slot) => slot.day === selectedDay);
    return [...((timetableForDay?.periods as Row[]) || [])].sort((a, b) =>
      String(a.startTime || "").localeCompare(String(b.startTime || "")),
    );
  };
  const totalPeriods = useMemo(
    () =>
      slots.reduce(
        (sum, slot) =>
          sum +
          (Array.isArray(slot.periods) ? slot.periods.length : 0),
        0,
      ),
    [slots],
  );
  const selectClass = (value: string) => {
    if (isTeacher) {
      const nextSection =
        teacherScopes.find((scope) => scope.class === value)?.section || "";
      setClassName(value);
      setSection(nextSection);
      setPicker(null);
      return;
    }
    const nextSections = [...new Set(
      sectionRows
        .filter((item) => !item.className || String(item.className) === value)
        .map(recordName)
        .filter(Boolean),
    )].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    setClassName(value);
    setSection(nextSections[0] || "");
    setPicker(null);
  };

  const options = picker === "class" ? classes : classSections;
  const openAddPeriod = (selectedDay: string | string[]) => {
    const days = Array.isArray(selectedDay) ? selectedDay : [selectedDay];
    setPeriodSaveErrors([]);
    setPeriodConflicts([]);
    setPeriodSaveNotice("");
    setDraft({
      day: days[0] || DAYS[0],
      days,
      subject: "",
      teacherId: "",
      teacherName: "",
      roomId: "",
      roomName: "",
      startTime: "",
      endTime: "",
    });
  };
  const openAddToday = () => {
    openAddPeriod(DAYS);
  };
  const toggleDraftDay = (day: string) => {
    setDraft((current) => {
      if (!current || current.index !== undefined) return current;
      const selected = current.days.includes(day)
        ? current.days.filter((item) => item !== day)
        : [...current.days, day];
      return { ...current, days: selected, day: selected[0] || current.day };
    });
  };
  const openEditPeriod = (selectedDay: string, index: number, period: Row) => {
    setPeriodSaveErrors([]);
    setPeriodConflicts([]);
    setPeriodSaveNotice("");
    setDraft({
      day: selectedDay,
      days: [selectedDay],
      index,
      subject: String(period.subject || ""),
      teacherId: String(period.teacherId || ""),
      teacherName: String(period.teacherName || ""),
      roomId: String(period.roomId || ""),
      roomName: String(period.roomName || period.room || ""),
      startTime: String(period.startTime || ""),
      endTime: String(period.endTime || ""),
    });
  };
  const savePeriod = async () => {
    if (!draft || !className || !section) return;
    if (!draft.subject.trim()) {
      Alert.alert("Subject required", "Select or enter a subject.");
      return;
    }
    if (
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.startTime) ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.endTime) ||
      draft.endTime <= draft.startTime
    ) {
      Alert.alert(
        "Check period time",
        "Enter valid 24-hour times (HH:MM), with the end time after the start time.",
      );
      return;
    }
    const targetDays = draft.index === undefined ? draft.days : [draft.day];
    if (!targetDays.length) {
      Alert.alert("Choose days", "Select at least one day for this period.");
      return;
    }
    const nextPeriod = {
      subject: draft.subject.trim(),
      teacherId: draft.teacherId,
      teacherName: draft.teacherName,
      roomId: draft.roomId,
      roomName: draft.roomName,
      startTime: draft.startTime,
      endTime: draft.endTime,
    };
    setSaving(true);
    setPeriodSaveErrors([]);
    setPeriodConflicts([]);
    setPeriodSaveNotice("");
    const savedDays: string[] = [];
    const failedDays: { day: string; message: string }[] = [];
    try {
      for (const day of targetDays) {
        const currentSlot = slots.find((slot) => slot.day === day);
        const currentPeriods = [...((currentSlot?.periods as Row[]) || [])].sort((a, b) =>
          String(a.startTime || "").localeCompare(String(b.startTime || "")),
        );
        const updatedPeriods =
          draft.index === undefined
            ? [...currentPeriods, nextPeriod]
            : currentPeriods.map((period, index) =>
                index === draft.index ? nextPeriod : period,
              );
        try {
          const response = await api.timetable.save({
            class: className,
            section,
            day,
            periods: updatedPeriods.sort((a, b) =>
              String(a.startTime || "").localeCompare(String(b.startTime || "")),
            ),
          });
          setSlots((current) => [
            ...current.filter((slot) => slot.day !== day),
            response.data,
          ]);
          savedDays.push(day);
        } catch (error) {
          const requestError = error as Error & { conflicts?: string[] };
          failedDays.push({ day, message: requestError.message });
          if (requestError.conflicts?.length) {
            setPeriodConflicts((current) => [
              ...current,
              ...requestError.conflicts!.map((conflict) => `${day}: ${conflict}`),
            ]);
          }
        }
      }
      if (failedDays.length) {
        setPeriodSaveNotice(
          savedDays.length
            ? `Saved successfully on ${savedDays.join(", ")}. Retry the remaining days below.`
            : "",
        );
        setPeriodSaveErrors(failedDays.map(({ day, message }) => `${day}: ${message}`));
        setDraft((current) =>
          current
            ? { ...current, day: failedDays[0].day, days: failedDays.map((item) => item.day) }
            : current,
        );
      } else {
        setDraft(null);
        Alert.alert(
          "Timetable saved",
          draft.index === undefined
            ? `Period added on ${savedDays.join(", ")}.`
            : "Period updated.",
        );
      }
    } catch (saveError) {
      Alert.alert(
        "Could not save period",
        saveError instanceof Error ? saveError.message : "Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };
  const removePeriod = (selectedDay: string, index: number, period: Row) => {
    Alert.alert(
      "Remove period?",
      `Remove ${String(period.subject || "this period")} from ${selectedDay}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            void (async () => {
              const slot = slots.find((item) => item.day === selectedDay);
              if (!slot) return;
              const currentPeriods = [...((slot.periods as Row[]) || [])].sort((a, b) =>
                String(a.startTime || "").localeCompare(String(b.startTime || "")),
              );
              const remaining = currentPeriods.filter((_, periodIndex) => periodIndex !== index);
              setSaving(true);
              try {
                if (!remaining.length) {
                  await api.timetable.remove(String(slot._id || slot.id || ""));
                  setSlots((current) => current.filter((item) => item.day !== selectedDay));
                } else {
                  const response = await api.timetable.save({
                    class: className,
                    section,
                    day: selectedDay,
                    periods: remaining,
                  });
                  setSlots((current) => [
                    ...current.filter((item) => item.day !== selectedDay),
                    response.data,
                  ]);
                }
              } catch (removeError) {
                Alert.alert(
                  "Could not remove period",
                  removeError instanceof Error
                    ? removeError.message
                    : "Please try again.",
                );
              } finally {
                setSaving(false);
              }
            })();
          },
        },
      ],
    );
  };
  const openCopyDay = (day: string) => {
    if (!periodsForDay(day).length) {
      Alert.alert("No periods to copy", `Add periods to ${day} first.`);
      return;
    }
    setCopySource(day);
    setCopyTargets(
      DAYS.filter((target) => target !== day && !periodsForDay(target).length),
    );
    setCopyOverwrite(false);
    setCopyErrors([]);
    setCopyNotice("");
  };
  const toggleCopyTarget = (day: string) => {
    setCopyTargets((current) =>
      current.includes(day)
        ? current.filter((item) => item !== day)
        : [...current, day],
    );
  };
  const copyDaySchedule = async () => {
    if (!copySource || !copyTargets.length) {
      Alert.alert("Choose days", "Select at least one day to copy this timetable to.");
      return;
    }
    const sourcePeriods = periodsForDay(copySource);
    if (!sourcePeriods.length) {
      Alert.alert("No periods to copy", `Add periods to ${copySource} first.`);
      setCopySource("");
      return;
    }
    setCopyBusy(true);
    setCopyErrors([]);
    setCopyNotice("");
    const copied: string[] = [];
    const failed: { day: string; message: string }[] = [];
    try {
      for (const day of copyTargets) {
        try {
          const response = await api.timetable.save({
            class: className,
            section,
            day,
            periods: sourcePeriods,
          });
          setSlots((current) => [
            ...current.filter((slot) => slot.day !== day),
            response.data,
          ]);
          copied.push(day);
        } catch (requestError) {
          const error = requestError as Error & { conflicts?: string[] };
          failed.push({ day, message: error.message });
        }
      }
      if (failed.length) {
        setCopyErrors(failed.map(({ day, message }) => `${day}: ${message}`));
        setCopyTargets(failed.map(({ day }) => day));
        setCopyNotice(
          copied.length
            ? `Copied successfully to ${copied.join(", ")}. Retry the remaining days.`
            : "",
        );
      } else {
        setCopySource("");
        Alert.alert(
          "Timetable copied",
          `Copied ${copySource} to ${copied.join(", ")}.`,
        );
      }
    } finally {
      setCopyBusy(false);
    }
  };
  const substitutionDay = dayForDate(substitutionDate);
  const substitutionPeriods = useMemo(() => {
    const slot = slots.find((item) => item.day === substitutionDay);
    return [...((slot?.periods as Row[]) || [])]
      .filter((period) => Boolean(period.teacherId))
      .sort((a, b) =>
        String(a.startTime || "").localeCompare(String(b.startTime || "")),
      )
      .map((period) => ({
        value: `${String(period.startTime || "")}|${String(period.endTime || "")}`,
        period,
      }));
  }, [slots, substitutionDay]);

  const openSubstitution = () => {
    if (!dayForDate(substitutionDate)) {
      Alert.alert("Check date", "Enter a valid date in YYYY-MM-DD format.");
      return;
    }
    if (!DAYS.includes(substitutionDay)) {
      Alert.alert(
        "No school timetable",
        "Substitutions can only be created Monday through Saturday.",
      );
      return;
    }
    if (!substitutionPeriods.length) {
      Alert.alert(
        "No periods to cover",
        `There are no periods with an assigned teacher for ${substitutionDay}.`,
      );
      return;
    }
    setSubstitutionDraft({
      date: substitutionDate,
      periodKey: substitutionPeriods[0].value,
      substituteTeacherId: "",
      reason: "",
    });
  };

  const createSubstitution = async () => {
    if (!substitutionDraft) return;
    const selectedPeriod = substitutionPeriods.find(
      (item) => item.value === substitutionDraft.periodKey,
    );
    if (!selectedPeriod) {
      Alert.alert("Select a period", "Choose a period from the timetable.");
      return;
    }
    const substitute = teachers.find(
      (teacher) => teacher.id === substitutionDraft.substituteTeacherId,
    );
    if (!substitute) {
      Alert.alert("Select a substitute", "Choose a substitute teacher.");
      return;
    }
    if (substitute.id === String(selectedPeriod.period.teacherId || "")) {
      Alert.alert(
        "Choose another teacher",
        "The substitute must be different from the original teacher.",
      );
      return;
    }
    setSubstitutionSaving(true);
    try {
      const response = await api.timetable.substitutions.create({
        date: substitutionDraft.date,
        class: className,
        section,
        startTime: String(selectedPeriod.period.startTime || ""),
        endTime: String(selectedPeriod.period.endTime || ""),
        substituteTeacherId: substitute.id,
        substituteTeacherName: substitute.rawName || substitute.name,
        reason: substitutionDraft.reason.trim(),
      });
      setSubstitutions((current) => [
        ...current.filter((item) => item._id !== response.data._id),
        response.data,
      ].sort((a, b) => a.startTime.localeCompare(b.startTime)));
      setSubstitutionDraft(null);
      Alert.alert(
        "Substitution assigned",
        "Substitute teacher has been notified.",
      );
    } catch (createError) {
      Alert.alert(
        "Could not create substitution",
        createError instanceof Error
          ? createError.message
          : "Please check the schedule and teacher availability.",
      );
    } finally {
      setSubstitutionSaving(false);
    }
  };

  const updateSubstitutionStatus = async (
    substitution: TimetableSubstitution,
    status: "completed" | "cancelled",
  ) => {
    setSubstitutionBusyId(substitution._id);
    try {
      const response = await api.timetable.substitutions.setStatus(
        substitution._id,
        status,
      );
      setSubstitutions((current) =>
        current.map((item) =>
          item._id === substitution._id ? response.data : item,
        ),
      );
    } catch (statusError) {
      Alert.alert(
        "Could not update substitution",
        statusError instanceof Error ? statusError.message : "Please try again.",
      );
    } finally {
      setSubstitutionBusyId("");
    }
  };

  const deleteSubstitution = (substitution: TimetableSubstitution) => {
    Alert.alert(
      "Delete substitution?",
      `Remove ${substitution.subject || "this period"} coverage on ${substitution.date}?`,
      [
        { text: "Keep", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void (async () => {
              setSubstitutionBusyId(substitution._id);
              try {
                await api.timetable.substitutions.remove(substitution._id);
                setSubstitutions((current) =>
                  current.filter((item) => item._id !== substitution._id),
                );
              } catch (deleteError) {
                Alert.alert(
                  "Could not delete substitution",
                  deleteError instanceof Error
                    ? deleteError.message
                    : "Please try again.",
                );
              } finally {
                setSubstitutionBusyId("");
              }
            })();
          },
        },
      ],
    );
  };

  const choiceOptions =
    choicePicker === "subject"
      ? [
          ...subjects.filter(
            (item, index, all) =>
              all.findIndex(
                (candidate) =>
                  candidate.name.trim().toLowerCase() ===
                  item.name.trim().toLowerCase(),
              ) === index,
          ),
          ...NON_ACADEMIC_SUBJECTS,
        ]
      : choicePicker === "teacher"
        ? teachers
        : choicePicker === "substitute-teacher"
          ? teachers.filter((teacher) => {
              const period = substitutionPeriods.find(
                (item) => item.value === substitutionDraft?.periodKey,
              );
              return !period || teacher.id !== String(period.period.teacherId || "");
            })
          : choicePicker === "room"
            ? rooms
            : [];
  const choosePeriodOption = (option: NamedOption) => {
    if (choicePicker === "substitute-teacher" && substitutionDraft) {
      setSubstitutionDraft((current) =>
        current
          ? { ...current, substituteTeacherId: option.id }
          : current,
      );
      setChoicePicker(null);
      return;
    }
    if (!draft) return;
    if (choicePicker === "subject") {
      setDraft((current) =>
        current
          ? { ...current, subject: option.name }
          : current,
      );
    } else if (choicePicker === "teacher") {
      setDraft((current) =>
        current
          ? {
              ...current,
              teacherId: option.id,
              teacherName: option.rawName || option.name,
            }
          : current,
      );
    } else if (choicePicker === "room") {
      setDraft((current) =>
        current
          ? { ...current, roomId: option.id, roomName: option.name }
          : current,
      );
    }
    setChoicePicker(null);
  };

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void loadTimetable(className, section, true)}
          />
        }
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.heading}>
          <View style={styles.headingIcon}>
            <Ionicons name="calendar" size={22} color={colors.ink} />
          </View>
          <View style={styles.headingCopy}>
            <Text style={styles.eyebrow}>ACADEMICS</Text>
            <Text style={styles.title}>Timetable</Text>
            <Text style={styles.subtitle}>Weekly class schedule</Text>
          </View>
        </View>

        {isStudent ? (
          <View style={styles.classContext}>
            <Ionicons name="school-outline" size={16} color={colors.ink} />
            <Text style={styles.classContextText}>
              Class {className || "—"} · Section {section || "—"}
            </Text>
          </View>
        ) : (
          <Card style={styles.selectorCard}>
            <Text style={styles.selectorLabel}>SELECT CLASS & SECTION</Text>
            <View style={styles.selectorRow}>
              <Pressable
                style={styles.selector}
                onPress={() => setPicker("class")}
                disabled={!classes.length}
              >
                <View style={styles.selectorCopy}>
                  <Text style={styles.selectorCaption}>Class</Text>
                  <Text style={styles.selectorValue}>{className || "Choose class"}</Text>
                </View>
                <Ionicons name="chevron-down" size={17} color={colors.muted} />
              </Pressable>
              <Pressable
                style={styles.selector}
                onPress={() => setPicker("section")}
                disabled={!classSections.length}
              >
                <View style={styles.selectorCopy}>
                  <Text style={styles.selectorCaption}>Section</Text>
                  <Text style={styles.selectorValue}>{section || "Choose section"}</Text>
                </View>
                <Ionicons name="chevron-down" size={17} color={colors.muted} />
              </Pressable>
            </View>
            {loadingMasters ? (
              <View style={styles.inlineLoading}>
                <ActivityIndicator size="small" color={colors.ink} />
                <Text style={styles.muted}>Loading classes…</Text>
              </View>
            ) : masterError ? (
              <Text style={styles.errorText}>{masterError}</Text>
            ) : !classSections.length && className ? (
              <Text style={styles.muted}>
                No sections are configured for this class.
              </Text>
            ) : null}
          </Card>
        )}

        {can("timetable:read") && className && section ? (
          <Card style={styles.substitutionCard}>
            <View style={styles.substitutionHeading}>
              <Pressable
                style={styles.substitutionTitleRow}
                onPress={() => setSubstitutionExpanded((expanded) => !expanded)}
                accessibilityRole="button"
                accessibilityState={{ expanded: substitutionExpanded }}
              >
                <View style={styles.substitutionIcon}>
                  <Ionicons
                    name="people-outline"
                    size={18}
                    color={colors.info}
                  />
                </View>
                <View style={styles.headingCopy}>
                  <Text style={styles.substitutionTitle}>Substitutions</Text>
                  <Text style={styles.subtitle}>Teacher coverage and changes</Text>
                </View>
                <Ionicons
                  name={substitutionExpanded ? "chevron-up" : "chevron-down"}
                  size={17}
                  color={colors.muted}
                />
              </Pressable>
              {canWrite ? (
                <Pressable
                  style={styles.newSubstitutionButton}
                  onPress={openSubstitution}
                  disabled={substitutionSaving}
                >
                  <Ionicons name="add" size={17} color="#fff" />
                  <Text style={styles.newSubstitutionText}>New</Text>
                </Pressable>
              ) : null}
            </View>
            {substitutionExpanded ? (
              <>
            <View style={styles.substitutionDateRow}>
              <View style={styles.dateInputWrap}>
                <Ionicons name="calendar-outline" size={16} color={colors.muted} />
                <Input
                  value={substitutionDate}
                  onChangeText={setSubstitutionDate}
                  placeholder="YYYY-MM-DD"
                  keyboardType="numbers-and-punctuation"
                  maxLength={10}
                  accessibilityLabel="Substitution date"
                />
              </View>
              <Pressable
                style={styles.todayButton}
                onPress={() => setSubstitutionDate(dateString(new Date()))}
              >
                <Text style={styles.todayButtonText}>Today</Text>
              </Pressable>
            </View>
            {!dayForDate(substitutionDate) ? (
              <Text style={styles.errorText}>
                Enter a valid date as YYYY-MM-DD to view substitutions.
              </Text>
            ) : !DAYS.includes(substitutionDay) ? (
              <Text style={styles.muted}>
                {substitutionDay} has no school timetable.
              </Text>
            ) : substitutionLoading ? (
              <ActivityIndicator color={colors.ink} style={styles.substitutionLoading} />
            ) : substitutionError ? (
              <View style={styles.substitutionError}>
                <Text style={styles.errorText}>{substitutionError}</Text>
                <Pressable
                  style={styles.retryButton}
                  onPress={() => setSubstitutionRefreshKey((value) => value + 1)}
                >
                  <Text style={styles.retryText}>Retry</Text>
                </Pressable>
              </View>
            ) : substitutions.length ? (
              <View style={styles.substitutionList}>
                {substitutions.map((item) => {
                  const busy = substitutionBusyId === item._id;
                  return (
                    <View key={item._id} style={styles.substitutionItem}>
                      <View style={styles.substitutionItemHeading}>
                        <Text style={styles.substitutionSubject}>
                          {item.subject || "Class period"}
                        </Text>
                        <Text
                          style={[
                            styles.substitutionStatus,
                            item.status === "completed"
                              ? styles.substitutionComplete
                              : item.status === "cancelled"
                                ? styles.substitutionCancelled
                                : styles.substitutionScheduled,
                          ]}
                        >
                          {item.status}
                        </Text>
                      </View>
                      <View style={styles.substitutionDetailRow}>
                        <Ionicons name="time-outline" size={14} color={colors.muted} />
                        <Text style={styles.substitutionDetail}>
                          {item.day} · {formatTime(item.startTime)} – {formatTime(item.endTime)}
                        </Text>
                      </View>
                      <View style={styles.substitutionDetailRow}>
                        <Ionicons name="people-outline" size={14} color={colors.muted} />
                        <Text style={styles.substitutionDetail}>
                          {item.originalTeacherName || "Original teacher"} →{" "}
                          {item.substituteTeacherName || "Substitute teacher"}
                        </Text>
                      </View>
                      {item.roomName ? (
                        <View style={styles.substitutionDetailRow}>
                          <Ionicons
                            name="location-outline"
                            size={14}
                            color={colors.muted}
                          />
                          <Text style={styles.substitutionDetail}>{item.roomName}</Text>
                        </View>
                      ) : null}
                      {item.reason ? (
                        <Text style={styles.substitutionReason}>
                          Reason: {item.reason}
                        </Text>
                      ) : null}
                      {canWrite ? (
                        <View style={styles.substitutionActions}>
                          {item.status === "scheduled" ? (
                            <>
                              <Pressable
                                style={styles.completeSubstitution}
                                disabled={busy}
                                onPress={() =>
                                  void updateSubstitutionStatus(item, "completed")
                                }
                              >
                                {busy ? (
                                  <ActivityIndicator size="small" color={colors.success} />
                                ) : (
                                  <Ionicons
                                    name="checkmark-circle-outline"
                                    size={16}
                                    color={colors.success}
                                  />
                                )}
                                <Text style={styles.completeText}>Mark complete</Text>
                              </Pressable>
                              <Pressable
                                style={styles.cancelSubstitution}
                                disabled={busy}
                                onPress={() =>
                                  Alert.alert(
                                    "Cancel substitution?",
                                    "The substitute teacher will be notified.",
                                    [
                                      { text: "Keep", style: "cancel" },
                                      {
                                        text: "Cancel substitution",
                                        style: "destructive",
                                        onPress: () =>
                                          void updateSubstitutionStatus(
                                            item,
                                            "cancelled",
                                          ),
                                      },
                                    ],
                                  )
                                }
                              >
                                <Text style={styles.cancelText}>Cancel</Text>
                              </Pressable>
                            </>
                          ) : null}
                          <Pressable
                            style={styles.deleteSubstitution}
                            disabled={busy}
                            onPress={() => deleteSubstitution(item)}
                            accessibilityLabel="Delete substitution"
                          >
                            <Ionicons
                              name="trash-outline"
                              size={16}
                              color={colors.alert}
                            />
                          </Pressable>
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            ) : (
              <Text style={styles.noPeriods}>
                No substitutions scheduled for {substitutionDate}.
              </Text>
            )}
              </>
            ) : null}
          </Card>
        ) : null}

        {loading || loadingMasters ? (
          <ActivityIndicator color={colors.ink} style={styles.loading} />
        ) : error ? (
          <Card style={styles.errorCard}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable
              style={styles.retryButton}
              onPress={() => void loadTimetable(className, section)}
            >
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </Card>
        ) : !className || !section ? (
          <Empty text="Choose a class and section to view the timetable." />
        ) : (
          <Card style={styles.weekList}>
            <View style={styles.weekCardHeader}>
              <View style={styles.summaryIcon}>
                <Ionicons name="time-outline" size={18} color={colors.info} />
              </View>
              <View style={styles.weekCardHeading}>
                <Text style={styles.weekCardTitle}>Weekly timetable</Text>
                <Text style={styles.weekCardSubtitle}>
                  Class {className} · Section {section} · {totalPeriods} periods
                </Text>
              </View>
              {canWrite ? (
                <Pressable
                  style={styles.addDayButton}
                  onPress={openAddToday}
                  disabled={saving}
                >
                  <Ionicons name="add" size={19} color={colors.ink} />
                  <Text style={styles.addDayText}>Add</Text>
                </Pressable>
              ) : null}
            </View>
            {DAYS.map((selectedDay, dayIndex) => {
              const dayPeriods = periodsForDay(selectedDay);
              const dayColor = DAY_COLORS[dayIndex];
              return (
                <View
                  key={selectedDay}
                  style={[
                    styles.daySection,
                    dayIndex > 0 && styles.daySectionDivider,
                  ]}
                >
                  <View style={styles.dayCardHeader}>
                    <View style={[styles.dayHeadingIcon, { backgroundColor: `${dayColor}18` }]}>
                      <Ionicons name="calendar-outline" size={17} color={dayColor} />
                    </View>
                    <View style={styles.dayHeadingCopy}>
                      <View style={styles.dayTitleRow}>
                        <Text style={styles.dayTitle}>{selectedDay}</Text>
                        {selectedDay === WEEKDAY_NAMES[new Date().getDay()] ? (
                          <Text style={styles.todayBadge}>TODAY</Text>
                        ) : null}
                      </View>
                      <Text style={styles.daySubtitle}>
                        {dayPeriods.length} period{dayPeriods.length === 1 ? "" : "s"} scheduled
                      </Text>
                    </View>
                    {canWrite ? (
                      <View style={styles.dayHeaderActions}>
                        {dayPeriods.length ? (
                          <Pressable
                            style={styles.dayIconAction}
                            onPress={() => openCopyDay(selectedDay)}
                            disabled={saving || copyBusy}
                            accessibilityLabel={`Copy ${selectedDay} schedule`}
                          >
                            <Ionicons name="copy-outline" size={16} color={colors.ink} />
                          </Pressable>
                        ) : null}
                        <Pressable
                          style={styles.addDayButton}
                          onPress={() => openAddPeriod(selectedDay)}
                          accessibilityLabel={`Add period on ${selectedDay}`}
                        >
                          <Ionicons name="add" size={19} color={colors.ink} />
                          <Text style={styles.addDayText}>Add</Text>
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                  {dayPeriods.length ? (
                    <View style={styles.periodList}>
                      {dayPeriods.map((period, index) => (
                        <View
                          key={`${selectedDay}-${index}`}
                          style={styles.periodRow}
                        >
                          <View style={styles.periodTimeline}>
                            <Text style={styles.periodStart}>
                              {formatTime(period.startTime)}
                            </Text>
                            <View style={styles.timelineRule} />
                            <Text style={styles.periodEnd}>
                              {formatTime(period.endTime)}
                            </Text>
                          </View>
                          <View style={[styles.periodDivider, { backgroundColor: dayColor }]} />
                          <View style={styles.periodDetails}>
                            <Text style={styles.periodNumber}>PERIOD {index + 1}</Text>
                            <Text style={styles.subject}>
                              {String(period.subject || "—")}
                            </Text>
                            <View style={styles.periodMeta}>
                              <View style={styles.metaItem}>
                                <Ionicons
                                  name="person-outline"
                                  size={13}
                                  color={colors.muted}
                                />
                                <Text style={styles.metaText}>
                                  {String(period.teacherName || "Not assigned")}
                                </Text>
                              </View>
                              {period.roomName || period.room ? (
                                <View style={styles.metaItem}>
                                  <Ionicons
                                    name="location-outline"
                                    size={13}
                                    color={colors.muted}
                                  />
                                  <Text style={styles.metaText}>
                                    {String(period.roomName || period.room)}
                                  </Text>
                                </View>
                              ) : null}
                            </View>
                          </View>
                          {canWrite ? (
                            <View style={styles.periodActions}>
                              <Pressable
                                style={styles.periodAction}
                                onPress={() =>
                                  openEditPeriod(selectedDay, index, period)
                                }
                                accessibilityLabel={`Edit ${String(period.subject || "period")}`}
                              >
                                <Ionicons
                                  name="create-outline"
                                  size={17}
                                  color={colors.ink}
                                />
                              </Pressable>
                              <Pressable
                                style={[styles.periodAction, styles.removeAction]}
                                onPress={() =>
                                  removePeriod(selectedDay, index, period)
                                }
                                accessibilityLabel={`Remove ${String(period.subject || "period")}`}
                              >
                                <Ionicons
                                  name="trash-outline"
                                  size={16}
                                  color={colors.alert}
                                />
                              </Pressable>
                            </View>
                          ) : null}
                        </View>
                      ))}
                    </View>
                  ) : (
                    <Text style={styles.noPeriods}>
                      {canWrite
                        ? "No periods yet. Add a period to this day."
                        : "No periods scheduled."}
                    </Text>
                  )}
                </View>
              );
            })}
          </Card>
        )}
      </ScrollView>

      <Modal
        visible={Boolean(picker)}
        transparent
        animationType="slide"
        onRequestClose={() => setPicker(null)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setPicker(null)}
          />
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>
                  Choose {picker === "class" ? "class" : "section"}
                </Text>
                <Text style={styles.muted}>
                  {picker === "section" ? `Class ${className}` : "School classes"}
                </Text>
              </View>
              <Pressable onPress={() => setPicker(null)} hitSlop={10}>
                <Ionicons name="close" size={22} color={colors.ink} />
              </Pressable>
            </View>
            <ScrollView style={styles.optionList}>
              {options.map((value) => (
                <Pressable
                  key={value}
                  style={styles.option}
                  onPress={() =>
                    picker === "class"
                      ? selectClass(value)
                      : (setSection(value), setPicker(null))
                  }
                >
                  <Text style={styles.optionText}>{value}</Text>
                  {(picker === "class" ? className : section) === value ? (
                    <Ionicons name="checkmark-circle" size={19} color={colors.ink} />
                  ) : null}
                </Pressable>
              ))}
              {!options.length ? (
                <Text style={styles.muted}>No options configured.</Text>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
      <Modal
        visible={Boolean(draft)}
        transparent
        animationType="slide"
        onRequestClose={() => !saving && setDraft(null)}
      >
        {draft ? (
          <View style={styles.modalBackdrop}>
            <View style={styles.modalSheet}>
              <View style={styles.modalHeader}>
                <View>
                  <Text style={styles.modalTitle}>
                    {draft.index === undefined ? "Add Period" : "Edit Period"}
                  </Text>
                  <Text style={styles.muted}>
                    Class {className} · Section {section}
                  </Text>
                </View>
                <Pressable
                  onPress={() => !saving && setDraft(null)}
                  disabled={saving}
                  hitSlop={10}
                >
                  <Ionicons name="close" size={22} color={colors.ink} />
                </Pressable>
              </View>
              <ScrollView
                contentContainerStyle={styles.formContent}
                keyboardShouldPersistTaps="handled"
              >
                {periodSaveNotice ? (
                  <View style={styles.saveNoticeBox}>
                    <Ionicons name="checkmark-circle-outline" size={17} color={colors.success} />
                    <Text style={styles.saveNoticeText}>{periodSaveNotice}</Text>
                  </View>
                ) : null}
                {periodConflicts.length > 0 || periodSaveErrors.length > 0 ? (
                  <View style={styles.saveErrorBox}>
                    <View style={styles.saveErrorHeading}>
                      <Ionicons name="warning-outline" size={17} color={colors.alert} />
                      <Text style={styles.saveErrorTitle}>
                        Could not save every selected day
                      </Text>
                    </View>
                    {[...periodConflicts, ...periodSaveErrors].map((message, index) => (
                      <Text key={`${index}-${message}`} style={styles.saveErrorText}>
                        {message}
                      </Text>
                    ))}
                  </View>
                ) : null}
                <View style={styles.dayLabelRow}>
                  <Text style={styles.formLabel}>
                    {draft.index === undefined ? "Repeat on days" : "Day"}
                  </Text>
                  {draft.index === undefined ? (
                    <View style={styles.dayQuickActions}>
                      <Pressable
                        onPress={() =>
                          setDraft((current) => current
                            ? { ...current, days: [...DAYS], day: current.day }
                            : current)
                        }
                      >
                        <Text style={styles.dayQuickActionText}>All days</Text>
                      </Pressable>
                      <Pressable
                        onPress={() =>
                          setDraft((current) => current
                            ? { ...current, days: [] }
                            : current)
                        }
                      >
                        <Text style={styles.dayQuickActionText}>Clear</Text>
                      </Pressable>
                    </View>
                  ) : null}
                </View>
                <View style={styles.dayChoices}>
                  {DAYS.map((name) => (
                    <Pressable
                      key={name}
                      style={[
                        styles.dayChoice,
                        draft.days.includes(name) && styles.dayChoiceActive,
                        draft.index !== undefined && styles.dayChoiceLocked,
                      ]}
                      disabled={saving || draft.index !== undefined}
                      onPress={() => toggleDraftDay(name)}
                    >
                      <Text
                        style={[
                          styles.dayChoiceText,
                          draft.days.includes(name) && styles.dayChoiceTextActive,
                        ]}
                      >
                        {name.slice(0, 3)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                {draft.index === undefined ? (
                  <Text style={styles.formHint}>
                    Choose every day this lesson repeats. The selected days will be saved together.
                  </Text>
                ) : null}
                <Text style={styles.formLabel}>Subject</Text>
                <View style={styles.formPickerRow}>
                  <Input
                    value={draft.subject}
                    onChangeText={(subject) =>
                      setDraft((current) =>
                        current ? { ...current, subject } : current,
                      )
                    }
                    placeholder="Enter subject"
                    style={styles.formInput}
                  />
                  <Pressable
                    style={styles.pickButton}
                    onPress={() => setChoicePicker("subject")}
                    accessibilityLabel="Choose from subjects"
                  >
                    <Ionicons name="list-outline" size={19} color={colors.ink} />
                  </Pressable>
                </View>
                <Text style={styles.formLabel}>Teacher (optional)</Text>
                <Pressable
                  style={styles.formSelect}
                  onPress={() => setChoicePicker("teacher")}
                >
                  <Text style={styles.formSelectText}>
                    {draft.teacherName || "Not assigned"}
                  </Text>
                  <Ionicons name="chevron-down" size={17} color={colors.muted} />
                </Pressable>
                <Text style={styles.formLabel}>Room (optional)</Text>
                <Pressable
                  style={styles.formSelect}
                  onPress={() => setChoicePicker("room")}
                >
                  <Text style={styles.formSelectText}>
                    {draft.roomName || "No room selected"}
                  </Text>
                  <Ionicons name="chevron-down" size={17} color={colors.muted} />
                </Pressable>
                <View style={styles.timeFields}>
                  <View style={styles.timeField}>
                    <Text style={styles.formLabel}>Start time</Text>
                    <Input
                      value={draft.startTime}
                      onChangeText={(startTime) =>
                        setDraft((current) =>
                          current ? { ...current, startTime } : current,
                        )
                      }
                      placeholder="09:00"
                      keyboardType="numbers-and-punctuation"
                      maxLength={5}
                    />
                  </View>
                  <View style={styles.timeField}>
                    <Text style={styles.formLabel}>End time</Text>
                    <Input
                      value={draft.endTime}
                      onChangeText={(endTime) =>
                        setDraft((current) =>
                          current ? { ...current, endTime } : current,
                        )
                      }
                      placeholder="09:45"
                      keyboardType="numbers-and-punctuation"
                      maxLength={5}
                    />
                  </View>
                </View>
                <Pressable
                  style={[styles.saveButton, saving && styles.buttonDisabled]}
                  onPress={() => void savePeriod()}
                  disabled={saving || (draft.index === undefined && draft.days.length === 0)}
                >
                  {saving ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.saveButtonText}>
                      {saving
                        ? "Saving…"
                        : draft.index === undefined
                          ? `Add period${draft.days.length > 1 ? ` to ${draft.days.length} days` : ""}`
                          : "Save changes"}
                    </Text>
                  )}
                </Pressable>
              </ScrollView>
            </View>
          </View>
        ) : null}
      </Modal>
      <Modal
        visible={Boolean(copySource)}
        transparent
        animationType="slide"
        onRequestClose={() => !copyBusy && setCopySource("")}
      >
        {copySource ? (
          <View style={styles.modalBackdrop}>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => !copyBusy && setCopySource("")}
            />
            <View style={styles.modalSheet}>
              <View style={styles.modalHeader}>
                <View style={styles.headingCopy}>
                  <Text style={styles.modalTitle}>Copy day schedule</Text>
                  <Text style={styles.muted}>
                    Copy {copySource} periods to another day
                  </Text>
                </View>
                <Pressable
                  onPress={() => !copyBusy && setCopySource("")}
                  disabled={copyBusy}
                  hitSlop={10}
                >
                  <Ionicons name="close" size={22} color={colors.ink} />
                </Pressable>
              </View>
              <ScrollView
                contentContainerStyle={styles.formContent}
                keyboardShouldPersistTaps="handled"
              >
                {copyNotice ? (
                  <View style={styles.saveNoticeBox}>
                    <Ionicons
                      name="checkmark-circle-outline"
                      size={17}
                      color={colors.success}
                    />
                    <Text style={styles.saveNoticeText}>{copyNotice}</Text>
                  </View>
                ) : null}
                {copyErrors.length ? (
                  <View style={styles.saveErrorBox}>
                    <Text style={styles.saveErrorTitle}>
                      Some days could not be copied
                    </Text>
                    {copyErrors.map((message) => (
                      <Text key={message} style={styles.saveErrorText}>
                        {message}
                      </Text>
                    ))}
                  </View>
                ) : null}
                <Text style={styles.formLabel}>Choose destination days</Text>
                {DAYS.filter((day) => day !== copySource).map((day) => {
                  const hasSchedule = periodsForDay(day).length > 0;
                  const disabled = hasSchedule && !copyOverwrite;
                  const checked = copyTargets.includes(day);
                  return (
                    <Pressable
                      key={day}
                      style={[
                        styles.copyTarget,
                        checked && styles.copyTargetSelected,
                        disabled && styles.copyTargetDisabled,
                      ]}
                      disabled={copyBusy || disabled}
                      onPress={() => toggleCopyTarget(day)}
                    >
                      <View style={styles.copyTargetCopy}>
                        <Text style={styles.copyTargetDay}>{day}</Text>
                        <Text style={styles.copyTargetMeta}>
                          {hasSchedule
                            ? `${periodsForDay(day).length} current period(s)${copyOverwrite ? " · will be replaced" : ""}`
                            : "Empty day"}
                        </Text>
                      </View>
                      <Ionicons
                        name={checked ? "checkbox" : disabled ? "lock-closed-outline" : "square-outline"}
                        size={21}
                        color={checked ? colors.ink : colors.muted}
                      />
                    </Pressable>
                  );
                })}
                {DAYS.some((day) => day !== copySource && periodsForDay(day).length > 0) ? (
                  <Pressable
                    style={styles.overwriteToggle}
                    onPress={() => {
                      setCopyOverwrite((current) => !current);
                      if (copyOverwrite) {
                        setCopyTargets((current) =>
                          current.filter((day) => !periodsForDay(day).length),
                        );
                      }
                    }}
                    disabled={copyBusy}
                  >
                    <Ionicons
                      name={copyOverwrite ? "checkbox" : "square-outline"}
                      size={20}
                      color={copyOverwrite ? colors.alert : colors.muted}
                    />
                    <Text style={styles.overwriteText}>
                      Allow replacing destination days that already have periods
                    </Text>
                  </Pressable>
                ) : null}
                <Pressable
                  style={[
                    styles.saveButton,
                    (copyBusy || !copyTargets.length) && styles.buttonDisabled,
                  ]}
                  onPress={() => void copyDaySchedule()}
                  disabled={copyBusy || !copyTargets.length}
                >
                  {copyBusy ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.saveButtonText}>
                      Copy to {copyTargets.length} day{copyTargets.length === 1 ? "" : "s"}
                    </Text>
                  )}
                </Pressable>
              </ScrollView>
            </View>
          </View>
        ) : null}
      </Modal>
      <Modal
        visible={Boolean(substitutionDraft)}
        transparent
        animationType="slide"
        onRequestClose={() =>
          !substitutionSaving && setSubstitutionDraft(null)
        }
      >
        {substitutionDraft ? (
          <View style={styles.modalBackdrop}>
            <View style={styles.modalSheet}>
              <View style={styles.modalHeader}>
                <View style={styles.headingCopy}>
                  <Text style={styles.modalTitle}>New substitution</Text>
                  <Text style={styles.muted}>
                    Class {className} · Section {section} ·{" "}
                    {dayForDate(substitutionDraft.date)} · {substitutionDraft.date}
                  </Text>
                </View>
                <Pressable
                  onPress={() =>
                    !substitutionSaving && setSubstitutionDraft(null)
                  }
                  disabled={substitutionSaving}
                  hitSlop={10}
                >
                  <Ionicons name="close" size={22} color={colors.ink} />
                </Pressable>
              </View>
              <ScrollView
                contentContainerStyle={styles.formContent}
                keyboardShouldPersistTaps="handled"
              >
                <Text style={styles.formLabel}>Period to cover</Text>
                <View style={styles.substitutionPeriodChoices}>
                  {substitutionPeriods.map(({ value, period }, index) => (
                    <Pressable
                      key={value}
                      style={[
                        styles.substitutionPeriodChoice,
                        substitutionDraft.periodKey === value &&
                          styles.substitutionPeriodChoiceActive,
                      ]}
                      onPress={() =>
                        setSubstitutionDraft((current) =>
                          current ? { ...current, periodKey: value } : current,
                        )
                      }
                    >
                      <View style={styles.periodChoiceTop}>
                        <Text style={styles.periodChoiceTitle}>
                          {String(period.subject || `Period ${index + 1}`)}
                        </Text>
                        {substitutionDraft.periodKey === value ? (
                          <Ionicons
                            name="checkmark-circle"
                            size={18}
                            color={colors.ink}
                          />
                        ) : null}
                      </View>
                      <Text style={styles.periodChoiceMeta}>
                        {formatTime(period.startTime)} – {formatTime(period.endTime)}
                      </Text>
                      <Text style={styles.periodChoiceMeta}>
                        Original teacher: {String(period.teacherName || "Not assigned")}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.formLabel}>Substitute teacher</Text>
                <Pressable
                  style={styles.formSelect}
                  onPress={() => setChoicePicker("substitute-teacher")}
                >
                  <Text style={styles.formSelectText}>
                    {teachers.find(
                      (teacher) =>
                        teacher.id === substitutionDraft.substituteTeacherId,
                    )?.name || "Select substitute teacher"}
                  </Text>
                  <Ionicons name="chevron-down" size={17} color={colors.muted} />
                </Pressable>
                <Text style={styles.formLabel}>Reason (optional)</Text>
                <Input
                  value={substitutionDraft.reason}
                  onChangeText={(reason) =>
                    setSubstitutionDraft((current) =>
                      current ? { ...current, reason } : current,
                    )
                  }
                  placeholder="e.g. Medical leave"
                  maxLength={500}
                  multiline
                  numberOfLines={3}
                  style={styles.reasonInput}
                />
                <Pressable
                  style={[
                    styles.saveButton,
                    substitutionSaving && styles.buttonDisabled,
                  ]}
                  onPress={() => void createSubstitution()}
                  disabled={substitutionSaving}
                >
                  {substitutionSaving ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.saveButtonText}>
                      Create substitution
                    </Text>
                  )}
                </Pressable>
              </ScrollView>
            </View>
          </View>
        ) : null}
      </Modal>
      <Modal
        visible={Boolean(choicePicker)}
        transparent
        animationType="slide"
        onRequestClose={() => setChoicePicker(null)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setChoicePicker(null)}
          />
          <View style={styles.choiceSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {choicePicker === "subject"
                  ? "Choose a subject"
                  : choicePicker === "substitute-teacher"
                    ? "Choose substitute teacher"
                    : `Select ${choicePicker || "value"}`}
              </Text>
              <Pressable onPress={() => setChoicePicker(null)} hitSlop={10}>
                <Ionicons name="close" size={22} color={colors.ink} />
              </Pressable>
            </View>
            <ScrollView style={styles.optionList}>
              {choicePicker === "teacher" ||
              choicePicker === "room" ||
              choicePicker === "substitute-teacher" ? (
                <Pressable
                  style={styles.option}
                  onPress={() => {
                    if (choicePicker === "teacher") {
                      setDraft((current) =>
                        current
                          ? { ...current, teacherId: "", teacherName: "" }
                          : current,
                      );
                    } else if (choicePicker === "substitute-teacher") {
                      setSubstitutionDraft((current) =>
                        current
                          ? { ...current, substituteTeacherId: "" }
                          : current,
                      );
                    } else {
                      setDraft((current) =>
                        current
                          ? { ...current, roomId: "", roomName: "" }
                          : current,
                      );
                    }
                    setChoicePicker(null);
                  }}
                >
                  <Text style={styles.optionText}>
                    {choicePicker === "teacher"
                      ? "Not assigned"
                      : choicePicker === "substitute-teacher"
                        ? "Clear selection"
                        : "No room"}
                  </Text>
                  <Ionicons name="close-circle-outline" size={18} color={colors.muted} />
                </Pressable>
              ) : null}
              {choiceOptions.map((option) => (
                <Pressable
                  key={option.id}
                  style={styles.option}
                  onPress={() => choosePeriodOption(option)}
                >
                  <Text style={styles.optionText}>{option.name}</Text>
                </Pressable>
              ))}
              {!choiceOptions.length ? (
                <Text style={styles.muted}>
                  {choicePicker === "substitute-teacher"
                    ? "No substitute teachers are available. Add or activate a teacher account first."
                    : choicePicker === "teacher"
                      ? "No teachers are available."
                      : choicePicker === "room"
                        ? "No rooms are configured. You can leave the room unassigned."
                        : "No options are available. Enter a subject manually or use a standard activity."}
                </Text>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 14, paddingBottom: 28, gap: 12 },
  heading: { flexDirection: "row", alignItems: "center", gap: 11 },
  headingIcon: {
    width: 45,
    height: 45,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.amber,
  },
  headingCopy: { flex: 1 },
  eyebrow: { color: colors.muted, fontSize: 9, fontWeight: "800", letterSpacing: 0.9 },
  title: { color: colors.ink, fontSize: 20, fontWeight: "800", marginTop: 2 },
  subtitle: { color: colors.muted, fontSize: 11, marginTop: 2 },
  substitutionCard: { padding: 13, gap: 10 },
  substitutionHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  substitutionTitleRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: 9 },
  substitutionIcon: {
    width: 35,
    height: 35,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
    backgroundColor: "#EAF2F9",
  },
  substitutionTitle: { color: colors.ink, fontSize: 14, fontWeight: "800" },
  newSubstitutionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 9,
    backgroundColor: colors.ink,
  },
  newSubstitutionText: { color: "#fff", fontSize: 10, fontWeight: "800" },
  substitutionDateRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  dateInputWrap: {
    minHeight: 40,
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 9,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 9,
    backgroundColor: "#fff",
  },
  todayButton: {
    minHeight: 38,
    justifyContent: "center",
    paddingHorizontal: 11,
    borderRadius: 9,
    backgroundColor: "#F1F3F7",
  },
  todayButtonText: { color: colors.ink, fontSize: 10, fontWeight: "800" },
  substitutionLoading: { paddingVertical: 8 },
  substitutionError: { gap: 4 },
  substitutionList: { gap: 8 },
  substitutionItem: {
    gap: 6,
    padding: 10,
    borderWidth: 1,
    borderColor: "#EAECEF",
    borderRadius: 10,
    backgroundColor: "#fff",
  },
  substitutionItemHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  substitutionSubject: { flex: 1, color: colors.ink, fontSize: 12, fontWeight: "800" },
  substitutionStatus: {
    overflow: "hidden",
    borderRadius: 12,
    paddingHorizontal: 7,
    paddingVertical: 4,
    fontSize: 9,
    fontWeight: "800",
    textTransform: "capitalize",
  },
  substitutionScheduled: { color: colors.info, backgroundColor: "#EAF2F9" },
  substitutionComplete: { color: "#16804A", backgroundColor: "#E9F6EF" },
  substitutionCancelled: { color: colors.alert, backgroundColor: "#FCEDEA" },
  substitutionDetailRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  substitutionDetail: { flex: 1, color: colors.muted, fontSize: 10, lineHeight: 15 },
  substitutionReason: {
    color: colors.text,
    fontSize: 10,
    lineHeight: 15,
    fontStyle: "italic",
  },
  substitutionActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 7,
    marginTop: 3,
  },
  completeSubstitution: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#E9F6EF",
  },
  completeText: { color: colors.success, fontSize: 9, fontWeight: "800" },
  cancelSubstitution: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#FBF1DF",
  },
  cancelText: { color: colors.amberDark, fontSize: 9, fontWeight: "800" },
  deleteSubstitution: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: "#FCEDEA",
  },
  selectorCard: { padding: 12, gap: 9 },
  selectorLabel: { color: colors.muted, fontSize: 9, fontWeight: "800", letterSpacing: 0.7 },
  selectorRow: { flexDirection: "row", gap: 8 },
  selector: {
    minHeight: 52,
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#fff",
  },
  selectorCopy: { flex: 1 },
  selectorCaption: { color: colors.muted, fontSize: 9 },
  selectorValue: { color: colors.ink, fontSize: 12, fontWeight: "800", marginTop: 3 },
  inlineLoading: { flexDirection: "row", alignItems: "center", gap: 8 },
  muted: { color: colors.muted, fontSize: 11, lineHeight: 16 },
  classContext: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 11,
    borderRadius: 10,
    backgroundColor: "#fff",
  },
  classContextText: { color: colors.ink, fontSize: 12, fontWeight: "700" },
  summary: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#E8ECF2",
    backgroundColor: "#fff",
  },
  summaryIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EAF2F9",
  },
  summaryText: { flex: 1, color: colors.ink, fontSize: 12, fontWeight: "800" },
  summaryClass: { color: colors.muted, fontSize: 10, fontWeight: "700" },
  weekCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E9EDF2",
  },
  weekCardHeading: { flex: 1, gap: 3 },
  weekCardTitle: { color: colors.ink, fontSize: 15, fontWeight: "900" },
  weekCardSubtitle: { color: colors.muted, fontSize: 10, fontWeight: "600" },
  daySection: { gap: 9, paddingTop: 13, paddingBottom: 12 },
  daySectionDivider: {
    borderTopWidth: 1,
    borderTopColor: "#E9EDF2",
  },
  dayHeaderActions: { flexDirection: "row", alignItems: "center", gap: 6 },
  dayIconAction: {
    width: 31,
    height: 31,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: "#F1F3F7",
  },
  weekSelector: {
    gap: 8,
    padding: 12,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#E8ECF2",
    backgroundColor: "#fff",
  },
  weekSelectorTitle: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  weekDayList: { gap: 8, paddingRight: 2 },
  weekDay: {
    width: 53,
    minHeight: 61,
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#E8ECF2",
    backgroundColor: "#F8F9FB",
  },
  weekDayActive: {
    borderColor: colors.ink,
    backgroundColor: colors.ink,
  },
  weekDayLabelRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  weekDayLabel: { color: colors.muted, fontSize: 9, fontWeight: "900" },
  weekDayLabelActive: { color: "#fff" },
  weekDayCount: { color: colors.ink, fontSize: 15, fontWeight: "900" },
  weekDayCountActive: { color: "#fff" },
  todayDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.success },
  addPeriodButton: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderRadius: 10,
    backgroundColor: colors.ink,
  },
  addPeriodButtonText: { color: "#fff", fontSize: 12, fontWeight: "800" },
  scheduleActions: { flexDirection: "row", gap: 8 },
  scheduleActionPrimary: { flex: 1 },
  copyDayButton: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: "#fff",
  },
  copyDayButtonText: { color: colors.ink, fontSize: 11, fontWeight: "800" },
  weekList: { gap: 10 },
  dayCard: {
    padding: 14,
    gap: 11,
    borderColor: "#E6EAF0",
    borderRadius: 15,
    backgroundColor: "#fff",
  },
  dayCardHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  dayHeadingCopy: { flex: 1 },
  dayHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 2,
    paddingTop: 3,
  },
  dayTitle: { color: colors.ink, fontSize: 18, fontWeight: "900" },
  dayTitleRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  todayBadge: {
    overflow: "hidden",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: "#E9F6EF",
    color: colors.success,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  daySubtitle: { color: colors.muted, fontSize: 11, marginTop: 3 },
  addDayButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: "#F1F3F7",
  },
  addDayText: { color: colors.ink, fontSize: 10, fontWeight: "800" },
  dayHeadingIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "#FBF1DF",
    alignItems: "center",
    justifyContent: "center",
  },
  loading: { marginTop: 25 },
  periodList: { gap: 8 },
  periodRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    minHeight: 82,
    padding: 9,
    borderWidth: 1,
    borderColor: "#EDF0F4",
    borderRadius: 12,
    backgroundColor: "#FCFCFD",
  },
  periodTimeline: {
    width: 65,
    minHeight: 56,
    gap: 4,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
    backgroundColor: "#F0F3F8",
  },
  periodStart: { color: colors.ink, fontSize: 10, fontWeight: "900" },
  timelineRule: { width: 22, height: 2, borderRadius: 1, backgroundColor: colors.amber },
  periodEnd: { color: colors.muted, fontSize: 9, fontWeight: "700" },
  periodDivider: { width: 3, alignSelf: "stretch", borderRadius: 3, backgroundColor: colors.amber },
  periodDetails: { flex: 1, gap: 4 },
  periodActions: { gap: 5 },
  periodAction: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: "#F1F3F7",
  },
  removeAction: { backgroundColor: "#FCEDEA" },
  noPeriods: {
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: "#EEF0F3",
    color: colors.muted,
    fontSize: 10,
  },
  periodNumber: { color: colors.muted, fontSize: 8, fontWeight: "800", letterSpacing: 0.7 },
  subject: { color: colors.ink, fontSize: 14, fontWeight: "900" },
  periodMeta: { flexDirection: "column", flexWrap: "wrap", gap: 4, marginTop: 1 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  metaText: { color: colors.muted, fontSize: 10, flexShrink: 1 },
  errorCard: { padding: 13, borderColor: colors.alert, gap: 8 },
  errorText: { color: colors.alert, fontSize: 11, lineHeight: 16 },
  retryButton: { alignSelf: "flex-start", paddingVertical: 5, paddingHorizontal: 8 },
  retryText: { color: colors.ink, fontSize: 11, fontWeight: "800" },
  modalBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(15, 23, 42, 0.42)" },
  modalSheet: {
    maxHeight: "80%",
    paddingBottom: 14,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    backgroundColor: colors.paper,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: { color: colors.ink, fontSize: 17, fontWeight: "800", marginBottom: 3 },
  formContent: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 20, gap: 9 },
  formLabel: { color: colors.ink, fontSize: 11, fontWeight: "700", marginTop: 3 },
  dayLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dayQuickActions: { flexDirection: "row", alignItems: "center", gap: 14 },
  dayQuickActionText: { color: colors.info, fontSize: 10, fontWeight: "800" },
  formHint: { color: colors.muted, fontSize: 10, lineHeight: 15 },
  copyTarget: {
    minHeight: 53,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: "#fff",
  },
  copyTargetSelected: {
    borderColor: colors.info,
    backgroundColor: "#F5F9FC",
  },
  copyTargetDisabled: { opacity: 0.6 },
  copyTargetCopy: { flex: 1, gap: 3 },
  copyTargetDay: { color: colors.ink, fontSize: 12, fontWeight: "800" },
  copyTargetMeta: { color: colors.muted, fontSize: 10 },
  overwriteToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 5,
  },
  overwriteText: { flex: 1, color: colors.text, fontSize: 10, lineHeight: 15 },
  saveErrorBox: {
    gap: 5,
    padding: 10,
    borderWidth: 1,
    borderColor: "#F0C8C2",
    borderRadius: 10,
    backgroundColor: "#FFF7F5",
  },
  saveNoticeBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    padding: 10,
    borderRadius: 10,
    backgroundColor: "#E9F6EF",
  },
  saveNoticeText: { flex: 1, color: colors.success, fontSize: 10, lineHeight: 15, fontWeight: "700" },
  saveErrorHeading: { flexDirection: "row", alignItems: "center", gap: 6 },
  saveErrorTitle: { flex: 1, color: colors.alert, fontSize: 11, fontWeight: "800" },
  saveErrorText: { color: colors.alert, fontSize: 10, lineHeight: 15 },
  substitutionPeriodChoices: { gap: 7 },
  substitutionPeriodChoice: {
    gap: 4,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 9,
    backgroundColor: "#fff",
  },
  substitutionPeriodChoiceActive: {
    borderColor: colors.info,
    backgroundColor: "#F5F9FC",
  },
  periodChoiceTop: { flexDirection: "row", alignItems: "center", gap: 6 },
  periodChoiceTitle: { flex: 1, color: colors.ink, fontSize: 11, fontWeight: "800" },
  periodChoiceMeta: { color: colors.muted, fontSize: 9 },
  reasonInput: { minHeight: 74, textAlignVertical: "top" },
  dayChoices: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  dayChoice: {
    minWidth: 45,
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#fff",
  },
  dayChoiceActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  dayChoiceLocked: { opacity: 0.85 },
  dayChoiceText: { color: colors.ink, fontSize: 10, fontWeight: "700" },
  dayChoiceTextActive: { color: "#fff" },
  formPickerRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  formInput: { flex: 1 },
  pickButton: {
    width: 43,
    height: 43,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: "#fff",
  },
  formSelect: {
    minHeight: 43,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 11,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: "#fff",
  },
  formSelectText: { flex: 1, color: colors.text, fontSize: 12 },
  timeFields: { flexDirection: "row", gap: 9 },
  timeField: { flex: 1, gap: 5 },
  saveButton: {
    minHeight: 43,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
    borderRadius: 10,
    backgroundColor: colors.ink,
  },
  saveButtonText: { color: "#fff", fontSize: 12, fontWeight: "800" },
  buttonDisabled: { opacity: 0.6 },
  choiceSheet: {
    maxHeight: "65%",
    paddingBottom: 12,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    backgroundColor: colors.paper,
  },
  optionList: { paddingHorizontal: 14 },
  option: {
    minHeight: 47,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#EAE7DF",
  },
  optionText: { color: colors.text, fontSize: 13, fontWeight: "600" },
});
