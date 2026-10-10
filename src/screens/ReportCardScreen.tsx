import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Ionicons } from "@expo/vector-icons";
import { Button, Card, Empty, Input } from "../components/UI";
import { useAuth } from "../context/AuthContext";
import { extractList, Row } from "../lib/format";
import { API_BASE_URL, get, KEYS, send } from "../lib/api";
import { colors } from "../theme";

const TERMS = ["Term 1", "Term 2", "Final"];
const CCE_GRADES = ["", "A1", "A2", "B1", "B2", "C", "D"];
const DEFAULT_CCE_AREAS = [
  "Work Education",
  "Art Education",
  "Health & Physical Education",
];
const DEFAULT_GRADES = [
  { grade: "A+", minPct: 90 },
  { grade: "A", minPct: 80 },
  { grade: "B+", minPct: 70 },
  { grade: "B", minPct: 60 },
  { grade: "C", minPct: 50 },
  { grade: "D", minPct: 33 },
  { grade: "F", minPct: 0 },
];
const DEFAULT_ACCENT = "#0C47CF";

type CceArea = { area: string; grade?: string; remark?: string };
type CceRecord = Row & { areas?: CceArea[]; comments?: string };

const text = (value: unknown, fallback = "—") =>
  value == null || value === "" ? fallback : String(value);
const number = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const initials = (name: unknown) =>
  String(name ?? "?")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("") || "?";
const formatDate = (value: unknown) => {
  if (!value) return "—";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
};
const remarkFor = (pct: number) => {
  if (pct >= 90) return "Outstanding performance. Keep up the excellent work!";
  if (pct >= 80) return "Very good performance. Continue the hard work.";
  if (pct >= 70)
    return "Good performance. Focus on weaker subjects for better results.";
  if (pct >= 60)
    return "Satisfactory. Needs more regular practice and revision.";
  return "Needs significant improvement. Extra attention and support recommended.";
};
const getGrade = (pct: number, report: Row | null) => {
  const bands = Array.isArray(report?.gradeBands)
    ? (report.gradeBands as Row[])
        .filter((band) => typeof band.grade === "string")
        .sort((a, b) => number(b.minPct) - number(a.minPct))
    : DEFAULT_GRADES;
  return String(
    bands.find((band) => pct >= number(band.minPct))?.grade ?? "F",
  );
};
const mergeCceAreas = (saved: CceArea[] | undefined) => [
  ...DEFAULT_CCE_AREAS.map((area) => {
    const row = saved?.find((item) => item.area === area);
    return { area, grade: row?.grade ?? "", remark: row?.remark ?? "" };
  }),
  ...(saved ?? []).filter((row) => !DEFAULT_CCE_AREAS.includes(row.area)),
];

function InfoLine({ label, value }: { label: string; value: unknown }) {
  return (
    <View style={s.infoLine}>
      <Text style={s.infoLabel}>{label}</Text>
      <Text style={s.infoValue}>{text(value)}</Text>
    </View>
  );
}

export default function ReportCardScreen() {
  const { user, school, can } = useAuth();
  const isStudent = user?.role === "student";
  const canManageCce = can("exams:write");
  const [students, setStudents] = useState<Row[]>([]);
  const [student, setStudent] = useState<Row | null>(null);
  const [query, setQuery] = useState("");
  const [term, setTerm] = useState(TERMS[0]);
  const [sessions, setSessions] = useState<Row[]>([]);
  const [sessionFilter, setSessionFilter] = useState("");
  const [includeDrafts, setIncludeDrafts] = useState(true);
  const [report, setReport] = useState<Row | null>(null);
  const [cce, setCce] = useState<CceRecord | null>(null);
  const [cceAreas, setCceAreas] = useState<CceArea[]>([]);
  const [cceComments, setCceComments] = useState("");
  const [studentsLoading, setStudentsLoading] = useState(true);
  const [reportLoading, setReportLoading] = useState(false);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [cceLoading, setCceLoading] = useState(false);
  const [savingCce, setSavingCce] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [studentsError, setStudentsError] = useState("");
  const [reportError, setReportError] = useState("");
  const [sessionsError, setSessionsError] = useState("");
  const [cceError, setCceError] = useState("");
  const [studentReload, setStudentReload] = useState(0);
  const [reportReload, setReportReload] = useState(0);

  useEffect(() => {
    let active = true;
    setStudentsLoading(true);
    setStudentsError("");
    const load = async () => {
      try {
        if (isStudent) {
          const response = await get<Row>("/students/me");
          if (active) setStudent(response.data);
        } else {
          const response = await get("/students?limit=1000");
          if (active) setStudents(extractList(response.data));
        }
      } catch (loadError) {
        if (active)
          setStudentsError(
            loadError instanceof Error
              ? loadError.message
              : "Could not load students.",
          );
      } finally {
        if (active) setStudentsLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [isStudent, studentReload]);

  useEffect(() => {
    let active = true;
    setSessionsLoading(true);
    setSessionsError("");
    get("/auth/sessions")
      .then((response) => {
        if (!active) return;
        const rows = extractList(response.data);
        setSessions(rows);
        const current = rows.find((row) => row.isCurrent);
        setSessionFilter(
          String(
            current?.name ??
              school?.currentSession?.name ??
              school?.session ??
              "",
          ),
        );
      })
      .catch((loadError: unknown) => {
        if (!active) return;
        setSessionsError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load academic sessions.",
        );
      })
      .finally(() => {
        if (active) setSessionsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [school?.currentSession?.name, school?.session]);

  const studentId = String(student?.admissionNo ?? student?._id ?? "");
  const reportQuery = useMemo(() => {
    if (!studentId) return "";
    const params = [
      `studentId=${encodeURIComponent(studentId)}`,
      `examName=${encodeURIComponent(term)}`,
      `includeDrafts=${includeDrafts ? "1" : "0"}`,
    ];
    if (sessionFilter) params.push(`session=${encodeURIComponent(sessionFilter)}`);
    return params.join("&");
  }, [includeDrafts, sessionFilter, studentId, term]);

  useEffect(() => {
    if (!reportQuery) {
      setReport(null);
      setCce(null);
      return;
    }
    let active = true;
    setReport(null);
    setReportLoading(true);
    setReportError("");
    get<Row>(`/marks/report-card?${reportQuery}`)
      .then((response) => {
        if (active) setReport(response.data);
      })
      .catch((loadError: unknown) => {
        if (active)
          setReportError(
            loadError instanceof Error
              ? loadError.message
              : "Could not load this report card.",
          );
      })
      .finally(() => {
        if (active) setReportLoading(false);
      });
    return () => {
      active = false;
    };
  }, [reportQuery, reportReload]);

  useEffect(() => {
    if (!studentId) {
      setCce(null);
      return;
    }
    let active = true;
    const params = [
      `studentId=${encodeURIComponent(studentId)}`,
      `term=${encodeURIComponent(term)}`,
      `session=${encodeURIComponent(sessionFilter)}`,
    ].join("&");
    setCce(null);
    setCceLoading(true);
    setCceError("");
    get<CceRecord>(`/cce/co-scholastic?${params}`)
      .then((response) => {
        if (!active) return;
        const record = response.data ?? null;
        setCce(record);
        setCceAreas(mergeCceAreas(record?.areas));
        setCceComments(record?.comments ?? "");
      })
      .catch((loadError: unknown) => {
        if (active)
          setCceError(
            loadError instanceof Error
              ? loadError.message
              : "Could not load co-scholastic results.",
          );
      })
      .finally(() => {
        if (active) setCceLoading(false);
      });
    return () => {
      active = false;
    };
  }, [sessionFilter, studentId, term]);

  const filteredStudents = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return students
      .filter((item) =>
        [
          item.name,
          item.admissionNo,
          item.rollNo,
          item.roll,
        ].some((value) => String(value ?? "").toLowerCase().includes(needle)),
      )
      .slice(0, 60);
  }, [query, students]);

  const subjects = (Array.isArray(report?.subjects)
    ? report.subjects
    : []) as Row[];
  const totals = subjects.reduce<{ obtained: number; max: number }>(
    (sum, item) => ({
      obtained: sum.obtained + number(item.marksObtained),
      max: sum.max + number(item.maxMarks),
    }),
    { obtained: 0, max: 0 },
  );
  const totalObtained = number(report?.totalObtained ?? totals.obtained);
  const totalMax = number(report?.totalMax ?? totals.max);
  const percentage = totalMax ? (totalObtained / totalMax) * 100 : 0;
  const overallGrade = totalMax ? getGrade(percentage, report) : "—";
  const accentSetting = (
    school?.settings?.reportCard as Row | undefined
  )?.accent;
  const accent =
    typeof accentSetting === "string" &&
    /^#[0-9a-fA-F]{6}$/.test(accentSetting)
      ? accentSetting
      : DEFAULT_ACCENT;
  const settings = school?.settings?.reportCard as Row | undefined;
  const schoolName = school?.name || "Zipschool OS";
  const reportClass = report?.class ?? student?.class;
  const reportSection = report?.section ?? student?.section;

  const selectStudent = (item: Row) => {
    setStudent({
      ...item,
      roll: item.roll ?? item.rollNo,
      fatherName: item.fatherName ?? item.parentName,
    });
    setReport(null);
    setQuery("");
  };

  const downloadPdf = async () => {
    if (!reportQuery || downloadingPdf) return;
    if (!FileSystem.cacheDirectory) {
      Alert.alert("Download unavailable", "Temporary file storage is unavailable.");
      return;
    }
    setDownloadingPdf(true);
    try {
      const [[, token], [, role], [, activeSchoolId]] =
        await AsyncStorage.multiGet([
          KEYS.access,
          KEYS.role,
          KEYS.activeSchoolId,
        ]);
      const headers: Record<string, string> = token
        ? { Authorization: `Bearer ${token}` }
        : {};
      if (role === "super_admin" && activeSchoolId)
        headers["X-School-Id"] = activeSchoolId;
      const fileName = `report-card-${String(student?.name ?? "student")
        .replace(/[^\w.-]/g, "_")
        .toLowerCase()}.pdf`;
      const result = await FileSystem.downloadAsync(
        `${API_BASE_URL}/marks/report-card/pdf?${reportQuery}`,
        `${FileSystem.cacheDirectory}${fileName}`,
        { headers },
      );
      if (result.status < 200 || result.status >= 300) {
        await FileSystem.deleteAsync(result.uri, { idempotent: true });
        throw new Error(
          result.status === 403
            ? "You do not have permission to download this report card."
            : "Could not download the report card. Please try again.",
        );
      }
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(result.uri, {
          mimeType: "application/pdf",
          dialogTitle: "Report Card",
          UTI: "com.adobe.pdf",
        });
      } else {
        await Share.share({ url: result.uri, title: "Report Card" });
      }
    } catch (downloadError) {
      Alert.alert(
        "Report card download failed",
        downloadError instanceof Error
          ? downloadError.message
          : "Please try again.",
      );
    } finally {
      setDownloadingPdf(false);
    }
  };

  const saveCce = async () => {
    if (!studentId) return;
    setSavingCce(true);
    try {
      const response = await send<CceRecord>("/cce/co-scholastic", "PUT", {
        studentId,
        term,
        session: sessionFilter,
        class: String(student?.class ?? ""),
        section: String(student?.section ?? ""),
        areas: cceAreas,
        comments: cceComments,
      });
      setCce(response.data);
      setCceAreas(mergeCceAreas(response.data?.areas));
      setCceComments(response.data?.comments ?? "");
      Alert.alert("Saved", "Co-scholastic assessment has been saved.");
    } catch (saveError) {
      Alert.alert(
        "Could not save CCE",
        saveError instanceof Error ? saveError.message : "Please try again.",
      );
    } finally {
      setSavingCce(false);
    }
  };

  if (!student) {
    if (studentsLoading)
      return (
        <View style={s.centered}>
          <ActivityIndicator size="large" color={colors.ink} />
          <Text style={s.muted}>Loading students…</Text>
        </View>
      );
    return (
      <View style={s.root}>
        {studentsError ? (
          <Card>
            <Text style={s.error}>{studentsError}</Text>
            <Button
              title="Try again"
              onPress={() => setStudentReload((count) => count + 1)}
            />
          </Card>
        ) : isStudent ? (
          <Empty text="Your student profile could not be found." />
        ) : (
          <>
            <Text style={s.pageTitle}>Report Card</Text>
            <Text style={s.muted}>Search by student name, admission ID or roll number.</Text>
            <Input
              placeholder="Search student"
              value={query}
              onChangeText={setQuery}
              accessibilityLabel="Search students"
            />
            <FlatList
              data={filteredStudents}
              keyExtractor={(item, index) =>
                String(item._id ?? item.admissionNo ?? index)
              }
              contentContainerStyle={{ gap: 10, paddingTop: 12, paddingBottom: 28 }}
              ListEmptyComponent={
                <Empty
                  text={
                    students.length
                      ? "No students match your search."
                      : "No students are available for a report card."
                  }
                />
              }
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => selectStudent(item)}
                  accessibilityRole="button"
                  accessibilityLabel={`Open report card for ${text(item.name, "student")}`}
                >
                  <Card style={s.studentChoice}>
                    <View style={s.studentInitial}>
                      <Text style={s.initialText}>{initials(item.name)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.studentName}>{text(item.name)}</Text>
                      <Text style={s.muted}>
                        Class {text(item.class)}{item.section ? `-${String(item.section)}` : ""} · Roll {text(item.rollNo)}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={colors.muted} />
                  </Card>
                </Pressable>
              )}
            />
          </>
        )}
      </View>
    );
  }

  const attendance =
    report?.attendance && typeof report.attendance === "object"
      ? (report.attendance as Row)
      : null;
  const hasMarks = subjects.length > 0;
  const resultPassed =
    hasMarks &&
    subjects.every((item) => {
      if (typeof item.passed === "boolean") return item.passed;
      const max = number(item.maxMarks);
      return max > 0 && number(item.marksObtained) / max * 100 >= number(item.passingMarks ?? report?.passPct ?? 33);
    });
  const reportSettingsAffiliation =
    settings?.affiliation || school?.recognitionAuthority || school?.board;
  const footerNote =
    settings?.footerNote ||
    "This is a computer-generated report card for demonstration purposes.";

  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={s.page}
      keyboardShouldPersistTaps="handled"
    >
      {!isStudent && (
        <Pressable
          onPress={() => {
            setStudent(null);
            setReport(null);
            setCce(null);
          }}
          style={s.backButton}
          accessibilityRole="button"
        >
          <Ionicons name="arrow-back" size={17} color={colors.info} />
          <Text style={s.backText}>Change student</Text>
        </Pressable>
      )}

      <View style={s.titleBlock}>
        <Text style={s.eyebrow}>ACADEMICS</Text>
        <Text style={s.pageTitle}>Report Card</Text>
        <Text style={s.muted}>Term-wise student progress and results.</Text>
      </View>

      <Card>
        <Text style={s.sectionTitle}>Report options</Text>
        {!isStudent && (
          <>
            <Input
              placeholder="Find another student"
              value={query}
              onChangeText={setQuery}
              accessibilityLabel="Search students"
            />
            {!!query.trim() && (
              <View style={s.suggestions}>
                {filteredStudents.slice(0, 5).map((item, index) => (
                  <Pressable
                    key={String(item._id ?? item.admissionNo ?? index)}
                    onPress={() => selectStudent(item)}
                    style={s.suggestion}
                  >
                    <Text style={s.studentName}>{text(item.name)}</Text>
                    <Text style={s.muted}>
                      Class {text(item.class)} · Roll {text(item.rollNo)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </>
        )}
        <Text style={s.controlLabel}>Term</Text>
        <View style={s.chips}>
          {TERMS.map((item) => (
            <Pressable
              key={item}
              onPress={() => setTerm(item)}
              style={[s.chip, term === item && { backgroundColor: accent, borderColor: accent }]}
              accessibilityRole="button"
              accessibilityState={{ selected: term === item }}
            >
              <Text style={[s.chipText, term === item && s.chipTextActive]}>
                {item}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={s.controlLabel}>Academic session</Text>
        {sessionsLoading ? (
          <ActivityIndicator color={colors.ink} />
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={s.chips}>
              <Pressable
                onPress={() => setSessionFilter("")}
                style={[s.chip, !sessionFilter && { backgroundColor: accent, borderColor: accent }]}
              >
                <Text style={[s.chipText, !sessionFilter && s.chipTextActive]}>
                  All sessions
                </Text>
              </Pressable>
              {sessions.map((item, index) => {
                const name = String(item.name ?? "");
                return (
                  <Pressable
                    key={String(item._id ?? name ?? index)}
                    onPress={() => setSessionFilter(name)}
                    style={[s.chip, sessionFilter === name && { backgroundColor: accent, borderColor: accent }]}
                  >
                    <Text style={[s.chipText, sessionFilter === name && s.chipTextActive]}>
                      {name || "Unnamed session"}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        )}
        {!!sessionsError && <Text style={s.warning}>{sessionsError}</Text>}
        <View style={s.draftRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.studentName}>Include draft results</Text>
            <Text style={s.muted}>Turn off to show published results only.</Text>
          </View>
          <Switch
            value={includeDrafts}
            onValueChange={setIncludeDrafts}
            trackColor={{ false: colors.border, true: accent }}
            accessibilityLabel="Include draft results"
          />
        </View>
        <Button
          title={downloadingPdf ? "Preparing PDF…" : "Download / share PDF"}
          onPress={downloadPdf}
          loading={downloadingPdf}
        />
      </Card>

      {reportLoading ? (
        <View style={s.loadingRow}>
          <ActivityIndicator color={colors.ink} />
          <Text style={s.muted}>Preparing report card…</Text>
        </View>
      ) : reportError ? (
        <Card>
          <Text style={s.error}>{reportError}</Text>
          <Button title="Retry" onPress={() => setReportReload((count) => count + 1)} />
        </Card>
      ) : (
        <Card style={s.reportSheet}>
          <View style={[s.reportHeader, { borderBottomColor: accent }]}>
            {school?.logo ? (
              <Image source={{ uri: school.logo }} style={s.schoolLogo} resizeMode="contain" />
            ) : (
              <View style={[s.schoolInitial, { backgroundColor: accent }]}>
                <Text style={s.schoolInitialText}>
                  {String(school?.shortName || schoolName).slice(0, 1).toUpperCase()}
                </Text>
              </View>
            )}
            <Text style={s.schoolName}>{schoolName}</Text>
            {!!school?.address && <Text style={s.schoolAddress}>{school.address}</Text>}
            {!!reportSettingsAffiliation && (
              <Text style={s.schoolAddress}>{String(reportSettingsAffiliation)}</Text>
            )}
            <Text style={[s.reportTerm, { color: accent }]}>
              {text(report?.examName, term).toUpperCase()} — PROGRESS REPORT
            </Text>
            <Text style={s.sessionText}>
              {sessionFilter ||
                text(report?.session, school?.currentSession?.name || school?.session || String(new Date().getFullYear()))}
            </Text>
          </View>

          <View style={s.studentBlock}>
            {student.photoUrl || student.photo ? (
              <Image
                source={{ uri: String(student.photoUrl ?? student.photo) }}
                style={s.studentPhoto}
              />
            ) : (
              <View style={s.studentPhotoPlaceholder}>
                <Text style={s.studentPhotoInitial}>{initials(student.name)}</Text>
              </View>
            )}
            <View style={s.studentDetails}>
              <InfoLine label="Student Name" value={student.name} />
              <InfoLine label="Admission ID" value={student.admissionNo} />
              <InfoLine
                label="Class / Section"
                value={`${text(reportClass)}${reportSection ? `-${String(reportSection)}` : ""}`}
              />
              <InfoLine label="Roll No." value={student.roll ?? student.rollNo} />
              <InfoLine label="Father's Name" value={student.fatherName ?? student.parentName} />
              <InfoLine label="Date of Birth" value={formatDate(student.dob)} />
            </View>
          </View>

          <Text style={s.sectionTitle}>Subject results</Text>
          {!hasMarks && (
            <View style={s.noMarks}>
              <Ionicons name="document-text-outline" size={24} color={colors.muted} />
              <Text style={s.studentName}>No marks recorded for {term} yet</Text>
              <Text style={s.muted}>Enter marks for this exam to generate a report card.</Text>
            </View>
          )}
          {subjects.map((item, index) => {
            const obtained = number(item.marksObtained);
            const max = number(item.maxMarks);
            const pct = number(item.pct ?? (max ? (obtained / max) * 100 : 0));
            const passed =
              typeof item.passed === "boolean"
                ? item.passed
                : pct >= number(item.passingMarks ?? report?.passPct ?? 33);
            return (
              <View key={String(item._id ?? item.subject ?? index)} style={s.subjectRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.subjectName}>{text(item.subject)}</Text>
                  {!!item.status && item.status !== "published" && (
                    <Text style={s.draftStatus}>{String(item.status).toUpperCase()}</Text>
                  )}
                </View>
                <Text style={s.marksValue}>{obtained} / {max}</Text>
                <View style={s.gradeBadge}>
                  <Text style={s.gradeText}>{text(item.grade, getGrade(pct, report))}</Text>
                </View>
                {item.remarks ? (
                  <Text style={s.subjectRemark}>{String(item.remarks)}</Text>
                ) : null}
                {!passed && <Text style={s.failText}>Below passing marks</Text>}
              </View>
            );
          })}
          {hasMarks && (
            <View style={s.totalRow}>
              <Text style={[s.studentName, { flex: 1 }]}>Total</Text>
              <Text style={s.studentName}>{totalObtained} / {totalMax}</Text>
              <View style={[s.gradeBadge, { backgroundColor: accent }]}>
                <Text style={s.totalGrade}>{overallGrade}</Text>
              </View>
            </View>
          )}

          <View style={s.statsGrid}>
            <Stat label="Percentage" value={hasMarks ? `${percentage.toFixed(1)}%` : "—"} />
            <Stat label="Overall Grade" value={overallGrade} />
            <Stat
              label="Class Rank"
              value={report?.classRank ? `${text(report.classRank)}${number(report.totalStudents) ? ` / ${number(report.totalStudents)}` : ""}` : "—"}
            />
            <Stat
              label="Attendance"
              value={attendance?.pct != null ? `${text(attendance.pct)}%` : "—"}
              detail={
                attendance
                  ? `${number(attendance.present)}P · ${number(attendance.absent)}A · ${number(attendance.leave)}L`
                  : undefined
              }
            />
            <Stat
              label="Result"
              value={!hasMarks ? "—" : resultPassed ? "PASS" : "FAIL"}
              valueColor={!hasMarks ? colors.muted : resultPassed ? colors.success : colors.alert}
            />
          </View>

          {(cce || canManageCce) && (
            <View style={s.cceSection}>
              <Text style={s.sectionTitle}>Co-scholastic assessment</Text>
              {cceLoading ? (
                <ActivityIndicator color={colors.ink} />
              ) : (
                <>
                  {!!cceError && <Text style={s.warning}>{cceError}</Text>}
                  {cceAreas.map((area, index) => (
                    <View key={`${area.area}-${index}`} style={s.cceRow}>
                      <View style={{ flex: 1, gap: 7 }}>
                        <Text style={s.subjectName}>{area.area}</Text>
                        {canManageCce ? (
                          <>
                            <View style={s.gradeOptions}>
                              {CCE_GRADES.map((grade) => (
                                <Pressable
                                  key={grade || "blank"}
                                  onPress={() =>
                                    setCceAreas((previous) =>
                                      previous.map((row, rowIndex) =>
                                        rowIndex === index ? { ...row, grade } : row,
                                      ),
                                    )
                                  }
                                  style={[
                                    s.gradeOption,
                                    (area.grade ?? "") === grade && s.gradeOptionActive,
                                  ]}
                                  accessibilityRole="button"
                                  accessibilityState={{ selected: (area.grade ?? "") === grade }}
                                  accessibilityLabel={`${area.area}: ${grade || "no grade"}`}
                                >
                                  <Text
                                    style={[
                                      s.gradeOptionText,
                                      (area.grade ?? "") === grade && s.gradeOptionTextActive,
                                    ]}
                                  >
                                    {grade || "—"}
                                  </Text>
                                </Pressable>
                              ))}
                            </View>
                            <Input
                              value={area.remark ?? ""}
                              onChangeText={(value) =>
                                setCceAreas((previous) =>
                                  previous.map((row, rowIndex) =>
                                    rowIndex === index ? { ...row, remark: value } : row,
                                  ),
                                )
                              }
                              placeholder="Remark (optional)"
                              accessibilityLabel={`${area.area} remark`}
                            />
                          </>
                        ) : (
                          <View style={s.cceReadRow}>
                            <View style={s.gradeBadge}>
                              <Text style={s.gradeText}>{area.grade || "—"}</Text>
                            </View>
                            <Text style={[s.muted, { flex: 1 }]}>{area.remark || "—"}</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  ))}
                  {canManageCce && (
                    <>
                      <Input
                        value={cceComments}
                        onChangeText={setCceComments}
                        placeholder="Overall co-scholastic comments"
                        multiline
                        accessibilityLabel="Overall co-scholastic comments"
                      />
                      <Button
                        title={savingCce ? "Saving…" : "Save CCE"}
                        onPress={saveCce}
                        loading={savingCce}
                      />
                    </>
                  )}
                  {!canManageCce && cce?.comments ? (
                    <Text style={s.cceComment}>
                      <Text style={s.studentName}>Comments: </Text>
                      {cce.comments}
                    </Text>
                  ) : null}
                </>
              )}
            </View>
          )}

          <View style={s.remarkBox}>
            <Text style={s.controlLabel}>Class teacher's remarks</Text>
            <Text style={s.remarkText}>
              {hasMarks ? remarkFor(percentage) : "Remarks will appear after marks are entered."}
            </Text>
          </View>

          <View style={s.signatureRow}>
            {["Class Teacher", "Principal", "Parent / Guardian"].map((label) => (
              <View key={label} style={s.signature}>
                <View style={s.signatureSpace} />
                <View style={s.signatureLine} />
                <Text style={s.signatureText}>{label}</Text>
              </View>
            ))}
          </View>
          <Text style={s.footer}>{String(footerNote)}</Text>
        </Card>
      )}
    </ScrollView>
  );
}

function Stat({
  label,
  value,
  detail,
  valueColor = colors.ink,
}: {
  label: string;
  value: string;
  detail?: string;
  valueColor?: string;
}) {
  return (
    <View style={s.stat}>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={[s.statValue, { color: valueColor }]}>{value}</Text>
      {!!detail && <Text style={s.statDetail}>{detail}</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  page: { padding: 16, gap: 14, paddingBottom: 36 },
  centered: {
    flex: 1,
    gap: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.paper,
  },
  titleBlock: { gap: 3 },
  eyebrow: { color: colors.amberDark, fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  pageTitle: { color: colors.ink, fontSize: 26, fontWeight: "800" },
  muted: { color: colors.muted, fontSize: 12.5 },
  error: { color: colors.alert, fontSize: 13, marginBottom: 12 },
  warning: { color: colors.alert, fontSize: 12, marginTop: 8 },
  backButton: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start" },
  backText: { color: colors.info, fontWeight: "700", fontSize: 13 },
  sectionTitle: { color: colors.ink, fontSize: 15, fontWeight: "800", marginBottom: 10 },
  controlLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginTop: 10,
    marginBottom: 7,
  },
  chips: { flexDirection: "row", gap: 8, alignItems: "center" },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#fff",
    borderRadius: 24,
    paddingVertical: 8,
    paddingHorizontal: 13,
  },
  chipText: { color: colors.ink, fontWeight: "700", fontSize: 12 },
  chipTextActive: { color: "#fff" },
  draftRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    marginBottom: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  suggestions: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    marginTop: 6,
    overflow: "hidden",
  },
  suggestion: { padding: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  studentChoice: { flexDirection: "row", alignItems: "center", gap: 12 },
  studentInitial: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FBF1DF",
  },
  initialText: { color: colors.amberDark, fontSize: 16, fontWeight: "800" },
  studentName: { color: colors.ink, fontWeight: "700", fontSize: 13 },
  loadingRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, padding: 18 },
  reportSheet: { padding: 18 },
  reportHeader: { alignItems: "center", borderBottomWidth: 2, paddingBottom: 14, marginBottom: 14 },
  schoolLogo: { width: 80, height: 64, marginBottom: 6 },
  schoolInitial: { width: 56, height: 56, borderRadius: 16, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  schoolInitialText: { color: "#fff", fontSize: 26, fontWeight: "800" },
  schoolName: { color: colors.ink, fontSize: 21, fontWeight: "800", textAlign: "center" },
  schoolAddress: { color: colors.muted, fontSize: 11.5, textAlign: "center", marginTop: 3 },
  reportTerm: { fontSize: 12, fontWeight: "800", textAlign: "center", marginTop: 11 },
  sessionText: { color: colors.muted, fontSize: 11, marginTop: 4 },
  studentBlock: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 18 },
  studentPhoto: { width: 66, height: 66, borderRadius: 13, backgroundColor: colors.paper },
  studentPhotoPlaceholder: {
    width: 66,
    height: 66,
    borderRadius: 13,
    backgroundColor: "#EAF0FC",
    alignItems: "center",
    justifyContent: "center",
  },
  studentPhotoInitial: { color: colors.ink, fontSize: 22, fontWeight: "800" },
  studentDetails: { flex: 1, gap: 7 },
  infoLine: { flexDirection: "row", alignItems: "flex-start", gap: 4 },
  infoLabel: { width: 92, flexShrink: 0, color: colors.muted, fontSize: 10.5 },
  infoValue: { flex: 1, color: colors.ink, fontSize: 11.5, fontWeight: "700" },
  noMarks: {
    alignItems: "center",
    gap: 6,
    padding: 18,
    backgroundColor: colors.paper,
    borderRadius: 12,
    marginBottom: 12,
  },
  subjectRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    minHeight: 48,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  subjectName: { color: colors.ink, fontSize: 12.5, fontWeight: "700" },
  marksValue: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  gradeBadge: {
    minWidth: 38,
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 7,
    backgroundColor: "#EAF0FC",
  },
  gradeText: { color: colors.ink, fontSize: 11.5, fontWeight: "800" },
  draftStatus: { color: colors.amberDark, fontSize: 9, fontWeight: "800", marginTop: 3 },
  subjectRemark: { width: "100%", color: colors.muted, fontSize: 11 },
  failText: { width: "100%", color: colors.alert, fontSize: 10, fontWeight: "700" },
  totalRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    borderTopWidth: 2,
    borderTopColor: colors.border,
  },
  totalGrade: { color: "#fff", fontSize: 11.5, fontWeight: "800" },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8, marginBottom: 18 },
  stat: {
    width: "48%",
    minHeight: 78,
    alignItems: "center",
    justifyContent: "center",
    padding: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: "#fff",
  },
  statLabel: { color: colors.muted, fontSize: 9.5, fontWeight: "800", textTransform: "uppercase", textAlign: "center" },
  statValue: { fontSize: 19, fontWeight: "800", marginTop: 4, textAlign: "center" },
  statDetail: { color: colors.muted, fontSize: 9.5, marginTop: 2 },
  cceSection: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 15, gap: 9 },
  cceRow: { paddingVertical: 7, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  cceReadRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  gradeOptions: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  gradeOption: { borderWidth: 1, borderColor: colors.border, borderRadius: 7, paddingVertical: 5, paddingHorizontal: 8, backgroundColor: "#fff" },
  gradeOptionActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  gradeOptionText: { color: colors.ink, fontSize: 10.5, fontWeight: "700" },
  gradeOptionTextActive: { color: "#fff" },
  cceComment: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  remarkBox: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 13, marginTop: 8 },
  remarkText: { color: colors.ink, fontSize: 12.5, lineHeight: 19 },
  signatureRow: { flexDirection: "row", gap: 12, marginTop: 18, paddingTop: 10 },
  signature: { flex: 1, alignItems: "center" },
  signatureSpace: { height: 32 },
  signatureLine: { width: "100%", height: 1, backgroundColor: "#98A2B3" },
  signatureText: { color: colors.ink, fontSize: 9.5, fontWeight: "700", textAlign: "center", marginTop: 6 },
  footer: { color: colors.muted, fontSize: 9.5, textAlign: "center", marginTop: 17 },
});
