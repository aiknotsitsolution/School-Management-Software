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
import { Card, Empty } from "../components/UI";
import { get } from "../lib/api";
import { extractList, Row } from "../lib/format";
import { colors } from "../theme";

type StudentProfile = Row & {
  name?: string;
  admissionNo?: string;
  class?: string;
  section?: string;
  rollNo?: string;
};

type ResultSubject = Row & {
  subject?: string;
  examName?: string;
  marksObtained?: number;
  maxMarks?: number;
  pct?: number;
  grade?: string;
  passed?: boolean;
  remarks?: string;
  status?: string;
  session?: string;
};

type Report = Row & {
  examName?: string;
  session?: string;
  class?: string;
  section?: string;
  classRank?: number | null;
  totalStudents?: number;
  attendance?: Row | null;
  totalObtained?: number;
  totalMax?: number;
  percentage?: number | string;
  subjects?: ResultSubject[];
  gradeBands?: Row[];
  passPct?: number;
};

type Exam = Row & {
  _id?: string;
  examName?: string;
  date?: string;
  term?: string;
  session?: string;
  kind?: string;
  cceTool?: string;
};

type AssessmentKind = "fa" | "sa" | "term" | "other";

type TermSummary = {
  examName: string;
  termLabel: string;
  assessmentLabel: string;
  assessmentKind: AssessmentKind;
  count: number;
  obtained: number;
  max: number;
  percentage: number;
  grade: string;
  date: string;
};

const number = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const dateKey = (value: unknown) => {
  if (!value) return "";
  const raw = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (name: string) =>
    parts.find((item) => item.type === name)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
};

const formatDate = (value: unknown) => {
  const key = dateKey(value);
  if (!key) return "";
  const [year, month, day] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
};

const termLabelFor = (examName: string, exam?: Exam) => {
  if (exam?.term) return String(exam.term);
  const match = /term\s*([12])/i.exec(examName);
  if (match) return `Term ${match[1]}`;
  return /final/i.test(examName) ? "Final" : examName;
};

const assessmentFor = (examName: string, exam?: Exam) => {
  const termLabel = termLabelFor(examName, exam);
  const assessment = /\b(FA|SA)\s*([1-4])\b/i.exec(
    `${exam?.cceTool || ""} ${examName}`,
  );
  if (assessment) {
    const kind = assessment[1].toLowerCase() as "fa" | "sa";
    return {
      assessmentKind: kind,
      assessmentLabel: `${assessment[1].toUpperCase()} ${assessment[2]}`,
      termLabel,
    };
  }
  if (exam?.kind === "fa" || exam?.kind === "sa") {
    return {
      assessmentKind: exam.kind as "fa" | "sa",
      assessmentLabel: exam.kind.toUpperCase(),
      termLabel,
    };
  }
  if (exam?.kind === "term" || termLabel !== examName) {
    return {
      assessmentKind: "term" as const,
      assessmentLabel: termLabel,
      termLabel,
    };
  }
  return {
    assessmentKind: "other" as const,
    assessmentLabel: examName,
    termLabel,
  };
};

const gradeFor = (percentage: number, report?: Report | null) => {
  const bands = Array.isArray(report?.gradeBands)
    ? (report.gradeBands as Row[])
        .filter((band) => typeof band.grade === "string")
        .sort((a, b) => number(b.minPct) - number(a.minPct))
    : [
        { grade: "A+", minPct: 90 },
        { grade: "A", minPct: 80 },
        { grade: "B+", minPct: 70 },
        { grade: "B", minPct: 60 },
        { grade: "C", minPct: 50 },
        { grade: "D", minPct: 33 },
        { grade: "F", minPct: 0 },
      ];
  return String(
    bands.find((band) => percentage >= number(band.minPct))?.grade || "F",
  );
};

function Stat({
  label,
  value,
  color = colors.ink,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <Card style={styles.stat}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </Card>
  );
}

export default function StudentResultsScreen() {
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [summary, setSummary] = useState<Report | null>(null);
  const [exams, setExams] = useState<Exam[]>([]);
  const [selectedExam, setSelectedExam] = useState("");
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const [metadataWarning, setMetadataWarning] = useState("");
  const [detailError, setDetailError] = useState("");

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    setMetadataWarning("");
    setSelectedExam("");
    setSelectedReport(null);

    try {
      const [profileResult, summaryResult, examsResult] =
        await Promise.allSettled([
          get<StudentProfile>("/students/me"),
          get<Report>("/marks/report-card"),
          get<Exam[]>("/exams?limit=500"),
        ]);
      if (summaryResult.status === "rejected") throw summaryResult.reason;
      setProfile(
        profileResult.status === "fulfilled" ? profileResult.value.data : null,
      );
      setSummary(summaryResult.value.data);
      setExams(
        examsResult.status === "fulfilled"
          ? (extractList(examsResult.value.data) as Exam[])
          : [],
      );
      const warnings = [
        profileResult.status === "rejected"
          ? "Student profile details could not be loaded."
          : "",
        examsResult.status === "rejected"
          ? "Exam dates are unavailable; result totals are still shown."
          : "",
      ].filter(Boolean);
      setMetadataWarning(warnings.join(" "));
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load your results. Please try again.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const terms = useMemo(() => {
    const groups = new Map<string, ResultSubject[]>();
    (Array.isArray(summary?.subjects) ? summary.subjects : []).forEach(
      (row) => {
        const key = String(row.examName || "All");
        const group = groups.get(key) || [];
        group.push(row);
        groups.set(key, group);
      },
    );
    const examByName = new Map<string, Exam>();
    exams.forEach((exam) => {
      const name = String(exam.examName || "");
      if (name && !examByName.has(name)) examByName.set(name, exam);
    });
    return [...groups.entries()]
      .map(([examName, subjects]): TermSummary => {
        const obtained = subjects.reduce(
          (total, subject) => total + number(subject.marksObtained),
          0,
        );
        const max = subjects.reduce(
          (total, subject) => total + number(subject.maxMarks),
          0,
        );
        const percentage = max ? Math.round((obtained / max) * 100) : 0;
        const exam = examByName.get(examName);
        const assessment = assessmentFor(examName, exam);
        return {
          examName,
          ...assessment,
          count: subjects.length,
          obtained,
          max,
          percentage,
          grade: gradeFor(percentage, summary),
          date: String(exam?.date || ""),
        };
      })
      .sort((a, b) => dateKey(b.date).localeCompare(dateKey(a.date)));
  }, [exams, summary]);

  const openTerm = async (term: TermSummary) => {
    setSelectedExam(term.examName);
    setSelectedReport(null);
    setDetailError("");
    setDetailLoading(true);
    try {
      const params = new URLSearchParams({
        examName: term.examName,
      });
      if (summary?.session) params.set("session", String(summary.session));
      const response = await get<Report>(
        `/marks/report-card?${params.toString()}`,
      );
      setSelectedReport(response.data);
    } catch (loadError) {
      setDetailError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load this report card. Please try again.",
      );
    } finally {
      setDetailLoading(false);
    }
  };

  const goBack = () => {
    setSelectedExam("");
    setSelectedReport(null);
    setDetailError("");
  };

  const detailSubjects = Array.isArray(selectedReport?.subjects)
    ? selectedReport.subjects
    : [];
  const reportTotal = number(selectedReport?.totalObtained);
  const reportMax = number(selectedReport?.totalMax);
  const reportPercentage = reportMax
    ? (reportTotal / reportMax) * 100
    : number(selectedReport?.percentage);
  const reportPassed =
    detailSubjects.length > 0 &&
    detailSubjects.every((subject) =>
      typeof subject.passed === "boolean"
        ? subject.passed
        : number(subject.maxMarks) > 0 &&
          (number(subject.marksObtained) / number(subject.maxMarks)) * 100 >=
            number(subject.passingMarks ?? selectedReport?.passPct ?? 33),
    );
  const attendance =
    selectedReport?.attendance && typeof selectedReport.attendance === "object"
      ? selectedReport.attendance
      : null;
  const selectedTerm = terms.find((term) => term.examName === selectedExam);
  const assessmentEyebrow =
    selectedTerm?.assessmentKind === "fa"
      ? "FORMATIVE ASSESSMENT"
      : selectedTerm?.assessmentKind === "sa"
        ? "SUMMATIVE ASSESSMENT"
        : selectedTerm?.assessmentKind === "term"
          ? "TERM REPORT"
          : "ACADEMICS";

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
      <View style={styles.hero}>
        <View style={styles.heroIcon}>
          <Ionicons name="bar-chart" size={24} color={colors.amberDark} />
        </View>
        <Text style={styles.eyebrow}>
          {selectedExam ? assessmentEyebrow : "ACADEMICS"}
        </Text>
        <Text style={styles.title}>
          {selectedExam
            ? selectedTerm?.assessmentLabel || "Report Card"
            : "My Results"}
        </Text>
        <Text style={styles.subtitle}>
          {selectedExam
            ? [
                selectedTerm?.termLabel !== selectedTerm?.assessmentLabel &&
                selectedTerm?.termLabel !== selectedExam
                  ? selectedTerm?.termLabel
                  : "",
                selectedExam,
              ]
                .filter(Boolean)
                .join(" · ")
            : "Your published report cards for this session."}
        </Text>
      </View>

      {selectedExam ? (
        <>
          {metadataWarning ? (
            <Card style={styles.warningCard}>
              <Text style={styles.warningText}>{metadataWarning}</Text>
            </Card>
          ) : null}
          <Pressable
            accessibilityRole="button"
            onPress={goBack}
            style={styles.backButton}
          >
            <Ionicons name="arrow-back" size={17} color={colors.info} />
            <Text style={styles.backText}>All results</Text>
          </Pressable>
          {detailLoading ? (
            <ActivityIndicator
              size="large"
              color={colors.info}
              style={styles.loading}
            />
          ) : detailError ? (
            <Card style={styles.stateCard}>
              <Ionicons
                name="cloud-offline-outline"
                size={30}
                color={colors.alert}
              />
              <Text style={styles.errorText}>{detailError}</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  const term = terms.find(
                    (item) => item.examName === selectedExam,
                  );
                  if (term) void openTerm(term);
                }}
                style={styles.retryButton}
              >
                <Ionicons name="refresh" size={16} color="#fff" />
                <Text style={styles.retryText}>Try again</Text>
              </Pressable>
            </Card>
          ) : selectedReport ? (
            <>
              <Card style={styles.studentCard}>
                <View style={styles.studentAvatar}>
                  <Ionicons name="person" size={20} color={colors.info} />
                </View>
                <View style={styles.studentIdentity}>
                  <Text numberOfLines={1} style={styles.studentName}>
                    {profile?.name || "Student"}
                  </Text>
                  <Text style={styles.studentDetails}>
                    Class {selectedReport.class || profile?.class || "—"}
                    {selectedReport.section || profile?.section
                      ? `-${selectedReport.section || profile?.section}`
                      : ""}{" "}
                    · Roll {profile?.rollNo || "—"}
                  </Text>
                  <Text style={styles.studentDetails}>
                    Admission No. {profile?.admissionNo || "—"}
                  </Text>
                </View>
                {selectedReport.session ? (
                  <View style={styles.sessionBadge}>
                    <Text style={styles.sessionBadgeText}>
                      {selectedReport.session}
                    </Text>
                  </View>
                ) : null}
              </Card>
              <Card style={styles.scoreCard}>
                <View style={styles.scoreTop}>
                  <View style={styles.scoreCopy}>
                    <Text style={styles.scoreEyebrow}>OVERALL SCORE</Text>
                    <Text
                      style={[
                        styles.scorePercentage,
                        {
                          color:
                            reportPercentage >= 40
                              ? colors.success
                              : colors.alert,
                        },
                      ]}
                    >
                      {reportMax ? `${reportPercentage.toFixed(1)}%` : "—"}
                    </Text>
                    <Text style={styles.scoreMarks}>
                      {reportMax
                        ? `${reportTotal} of ${reportMax} marks`
                        : "Marks are not available yet"}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.resultBadge,
                      reportMax
                        ? reportPassed
                          ? styles.gradePass
                          : styles.gradeFail
                        : styles.resultPending,
                    ]}
                  >
                    <Ionicons
                      name={
                        reportMax
                          ? reportPassed
                            ? "checkmark-circle"
                            : "alert-circle"
                          : "time"
                      }
                      size={15}
                      color={
                        reportMax
                          ? reportPassed
                            ? colors.success
                            : colors.alert
                          : colors.muted
                      }
                    />
                    <Text
                      style={[
                        styles.resultBadgeText,
                        {
                          color: reportMax
                            ? reportPassed
                              ? colors.success
                              : colors.alert
                            : colors.muted,
                        },
                      ]}
                    >
                      {reportMax
                        ? reportPassed
                          ? "PASS"
                          : "NEEDS WORK"
                        : "PENDING"}
                    </Text>
                  </View>
                </View>
                <View style={styles.scoreTrack}>
                  <View
                    style={[
                      styles.scoreFill,
                      {
                        width: `${Math.min(100, Math.max(0, reportPercentage))}%`,
                        backgroundColor:
                          reportPercentage >= 40
                            ? colors.success
                            : colors.alert,
                      },
                    ]}
                  />
                </View>
                <Text style={styles.scoreCaption}>
                  {detailSubjects.length}{" "}
                  {detailSubjects.length === 1 ? "subject" : "subjects"}{" "}
                  included
                </Text>
              </Card>
              <View style={styles.statsGrid}>
                <Stat
                  label="Grade"
                  value={
                    reportMax ? gradeFor(reportPercentage, selectedReport) : "—"
                  }
                  color={colors.info}
                />
                <Stat
                  label="Class Rank"
                  value={
                    selectedReport.classRank
                      ? `${selectedReport.classRank}${selectedReport.totalStudents ? ` / ${selectedReport.totalStudents}` : ""}`
                      : "—"
                  }
                />
              </View>
              {attendance ? (
                <Card style={styles.attendanceCard}>
                  <View style={styles.sectionHeader}>
                    <Ionicons
                      name="calendar-outline"
                      size={18}
                      color={colors.info}
                    />
                    <Text style={styles.sectionTitle}>Attendance</Text>
                  </View>
                  <Text style={styles.attendanceValue}>
                    {number(attendance.pct)}%
                  </Text>
                  <View style={styles.attendanceTrack}>
                    <View
                      style={[
                        styles.attendanceFill,
                        {
                          width: `${Math.min(100, Math.max(0, number(attendance.pct)))}%`,
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.studentDetails}>
                    {number(attendance.present)} present ·{" "}
                    {number(attendance.absent)} absent ·{" "}
                    {number(attendance.leave)} leave ·{" "}
                    {number(attendance.workingDays)} working days
                  </Text>
                </Card>
              ) : null}
              <Card style={styles.subjectsCard}>
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionHeaderCopy}>
                    <Text style={styles.sectionTitle}>Subject Results</Text>
                    <Text style={styles.sectionSubtitle}>
                      Marks and grades for each subject
                    </Text>
                  </View>
                  <View style={styles.countBadge}>
                    <Text style={styles.countText}>
                      {detailSubjects.length}
                    </Text>
                  </View>
                </View>
                {detailSubjects.length ? (
                  <>
                    {detailSubjects.map((subject, index) => {
                      const subjectMax = number(subject.maxMarks);
                      const subjectPercentage = number(
                        subject.pct ??
                          (subjectMax
                            ? (number(subject.marksObtained) / subjectMax) * 100
                            : 0),
                      );
                      const passed =
                        typeof subject.passed === "boolean"
                          ? subject.passed
                          : subjectPercentage >=
                            number(
                              subject.passingMarks ??
                                selectedReport.passPct ??
                                33,
                            );
                      return (
                        <View
                          key={`${subject.subject || "subject"}-${index}`}
                          style={[
                            styles.subjectRow,
                            index === detailSubjects.length - 1
                              ? styles.lastSubjectRow
                              : null,
                          ]}
                        >
                          <View style={styles.subjectCopy}>
                            <View style={styles.subjectTopRow}>
                              <Text style={styles.subjectName}>
                                {subject.subject || "Subject"}
                              </Text>
                              <Text style={styles.marks}>
                                {number(subject.marksObtained)} / {subjectMax}
                              </Text>
                            </View>
                            <View style={styles.subjectScoreTrack}>
                              <View
                                style={[
                                  styles.subjectScoreFill,
                                  {
                                    width: `${Math.min(100, Math.max(0, subjectPercentage))}%`,
                                    backgroundColor: passed
                                      ? colors.success
                                      : colors.alert,
                                  },
                                ]}
                              />
                            </View>
                            {subject.remarks ? (
                              <Text style={styles.remark}>
                                {subject.remarks}
                              </Text>
                            ) : null}
                          </View>
                          <View
                            style={[
                              styles.gradeBadge,
                              passed ? styles.gradePass : styles.gradeFail,
                            ]}
                          >
                            <Text
                              style={[
                                styles.gradeText,
                                passed
                                  ? styles.gradePassText
                                  : styles.gradeFailText,
                              ]}
                            >
                              {subject.grade ||
                                gradeFor(subjectPercentage, selectedReport)}
                            </Text>
                          </View>
                        </View>
                      );
                    })}
                    <View style={styles.totalRow}>
                      <Text style={styles.totalLabel}>Total</Text>
                      <Text style={styles.totalMarks}>
                        {reportTotal} / {reportMax}
                      </Text>
                    </View>
                  </>
                ) : (
                  <Empty
                    text={`No published marks recorded for ${selectedExam}.`}
                  />
                )}
              </Card>
              <Card style={styles.note}>
                <Ionicons
                  name="information-circle-outline"
                  size={18}
                  color={colors.info}
                />
                <Text style={styles.noteText}>
                  Results are published by your teachers. Contact the school
                  office if you have a question about these marks.
                </Text>
              </Card>
            </>
          ) : null}
        </>
      ) : loading ? (
        <ActivityIndicator
          size="large"
          color={colors.info}
          style={styles.loading}
        />
      ) : error ? (
        <Card style={styles.stateCard}>
          <Ionicons
            name="cloud-offline-outline"
            size={30}
            color={colors.alert}
          />
          <Text style={styles.errorText}>{error}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void load()}
            style={styles.retryButton}
          >
            <Ionicons name="refresh" size={16} color="#fff" />
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </Card>
      ) : terms.length === 0 ? (
        <>
          {metadataWarning ? (
            <Card style={styles.warningCard}>
              <Text style={styles.warningText}>{metadataWarning}</Text>
            </Card>
          ) : null}
          <Card style={styles.stateCard}>
            <Ionicons
              name="document-text-outline"
              size={38}
              color={colors.muted}
            />
            <Text style={styles.stateTitle}>No results published</Text>
            <Text style={styles.stateMessage}>
              Your report cards will appear here once teachers publish them.
            </Text>
          </Card>
        </>
      ) : (
        <>
          {metadataWarning ? (
            <Card style={styles.warningCard}>
              <Text style={styles.warningText}>{metadataWarning}</Text>
            </Card>
          ) : null}
          <View style={styles.listHeading}>
            <View style={styles.listIcon}>
              <Ionicons
                name="documents-outline"
                size={18}
                color={colors.info}
              />
            </View>
            <View style={styles.listHeadingCopy}>
              <Text style={styles.sectionTitle}>Published Results</Text>
              <Text style={styles.sectionSubtitle}>
                {summary?.session
                  ? `Session ${summary.session}`
                  : "Tap a result to open its report card."}
              </Text>
            </View>
          </View>
          {terms.map((term) => (
            <Pressable
              key={term.examName}
              accessibilityRole="button"
              accessibilityLabel={`Open ${term.examName} results`}
              onPress={() => void openTerm(term)}
              style={({ pressed }) =>
                pressed ? styles.termPressed : undefined
              }
            >
              <Card style={styles.termCard}>
                <View style={styles.termTop}>
                  <View style={styles.termIcon}>
                    <Ionicons
                      name="document-text"
                      size={19}
                      color={colors.info}
                    />
                  </View>
                  <View style={styles.termCopy}>
                    <Text numberOfLines={1} style={styles.termName}>
                      {term.examName}
                    </Text>
                    {term.assessmentKind !== "other" ? (
                      <View
                        style={[
                          styles.assessmentBadge,
                          term.assessmentKind === "fa"
                            ? styles.faBadge
                            : term.assessmentKind === "sa"
                              ? styles.saBadge
                              : styles.termBadge,
                        ]}
                      >
                        <Text
                          style={[
                            styles.assessmentBadgeText,
                            term.assessmentKind === "fa"
                              ? styles.faBadgeText
                              : term.assessmentKind === "sa"
                                ? styles.saBadgeText
                                : styles.termBadgeText,
                          ]}
                        >
                          {term.assessmentLabel}
                          {term.assessmentKind === "fa" ||
                          term.assessmentKind === "sa"
                            ? term.termLabel !== term.examName &&
                              term.termLabel !== term.assessmentLabel
                              ? ` · ${term.termLabel}`
                              : ""
                            : ""}
                        </Text>
                      </View>
                    ) : null}
                    <Text style={styles.termMeta}>
                      {term.count} {term.count === 1 ? "subject" : "subjects"}
                      {term.date ? ` · ${formatDate(term.date)}` : ""}
                    </Text>
                  </View>
                  <View style={styles.termScore}>
                    <Text style={styles.termPercentage}>
                      {term.percentage}%
                    </Text>
                    <View
                      style={[
                        styles.gradeBadge,
                        term.percentage >= 40
                          ? styles.gradePass
                          : styles.gradeFail,
                      ]}
                    >
                      <Text
                        style={[
                          styles.gradeText,
                          term.percentage >= 40
                            ? styles.gradePassText
                            : styles.gradeFailText,
                        ]}
                      >
                        {term.grade}
                      </Text>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={17} color="#98A2B3" />
                </View>
                <View style={styles.termProgressTrack}>
                  <View
                    style={[
                      styles.termProgressFill,
                      {
                        width: `${Math.min(100, Math.max(0, term.percentage))}%`,
                        backgroundColor:
                          term.percentage >= 40 ? colors.success : colors.alert,
                      },
                    ]}
                  />
                </View>
                <Text style={styles.termMarks}>
                  {term.obtained} of {term.max} marks
                </Text>
              </Card>
            </Pressable>
          ))}
          <Card style={styles.note}>
            <Ionicons
              name="information-circle-outline"
              size={18}
              color={colors.info}
            />
            <Text style={styles.noteText}>
              Results are published by teachers for your class. Contact the
              school office for any discrepancy.
            </Text>
          </Card>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 16, paddingBottom: 34, gap: 14 },
  hero: {
    padding: 20,
    borderRadius: 22,
    backgroundColor: colors.ink,
    marginBottom: 3,
    borderBottomWidth: 3,
    borderBottomColor: colors.amber,
  },
  heroIcon: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    marginBottom: 14,
  },
  eyebrow: {
    color: "#F0C77F",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  title: { color: "#fff", fontSize: 25, fontWeight: "900", marginTop: 5 },
  subtitle: { color: "#D7DCE8", fontSize: 12, lineHeight: 18, marginTop: 7 },
  loading: { marginVertical: 30 },
  stateCard: {
    minHeight: 210,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 22,
  },
  stateTitle: { color: colors.ink, fontSize: 15, fontWeight: "800" },
  stateMessage: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    textAlign: "center",
  },
  errorText: {
    color: colors.alert,
    fontSize: 12,
    lineHeight: 17,
    textAlign: "center",
  },
  warningCard: { borderColor: colors.amber },
  warningText: { color: colors.amberDark, fontSize: 11, lineHeight: 16 },
  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 10,
    backgroundColor: colors.ink,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  retryText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 7,
    borderRadius: 18,
    backgroundColor: "#EAF2F8",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  backText: { color: colors.info, fontSize: 12, fontWeight: "800" },
  studentCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
  },
  studentAvatar: {
    width: 46,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    backgroundColor: "#EAF2F8",
  },
  studentIdentity: { flex: 1, minWidth: 0, gap: 3 },
  studentName: { color: colors.ink, fontSize: 15, fontWeight: "800" },
  studentDetails: { color: colors.muted, fontSize: 10, lineHeight: 15 },
  sessionBadge: {
    maxWidth: 88,
    borderRadius: 10,
    backgroundColor: "#FBF1DF",
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  sessionBadgeText: {
    color: colors.amberDark,
    fontSize: 9,
    fontWeight: "800",
    textAlign: "center",
  },
  scoreCard: { gap: 12, padding: 17 },
  scoreTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  scoreCopy: { flex: 1, gap: 3 },
  scoreEyebrow: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  scorePercentage: { fontSize: 34, lineHeight: 40, fontWeight: "900" },
  scoreMarks: { color: colors.muted, fontSize: 11 },
  resultBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 14,
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  resultPending: { backgroundColor: "#F0F1F3" },
  resultBadgeText: { fontSize: 9, fontWeight: "900" },
  scoreTrack: {
    height: 8,
    borderRadius: 6,
    backgroundColor: "#EEF0F3",
    overflow: "hidden",
  },
  scoreFill: { height: "100%", borderRadius: 6 },
  scoreCaption: { color: colors.muted, fontSize: 10 },
  statsGrid: { flexDirection: "row", gap: 9 },
  stat: {
    flex: 1,
    minHeight: 72,
    justifyContent: "center",
    borderRadius: 15,
    padding: 13,
  },
  statValue: { fontSize: 19, fontWeight: "900" },
  statLabel: { color: colors.muted, fontSize: 10, marginTop: 4 },
  attendanceCard: { gap: 8 },
  attendanceValue: { color: colors.info, fontSize: 24, fontWeight: "900" },
  attendanceTrack: {
    height: 6,
    borderRadius: 5,
    backgroundColor: "#EEF0F3",
    overflow: "hidden",
  },
  attendanceFill: {
    height: "100%",
    borderRadius: 5,
    backgroundColor: colors.info,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF0F3",
  },
  sectionHeaderCopy: { flex: 1, gap: 3 },
  sectionTitle: { color: colors.ink, fontSize: 15, fontWeight: "800" },
  sectionSubtitle: { color: colors.muted, fontSize: 10 },
  countBadge: {
    minWidth: 28,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    backgroundColor: "#EAF2F8",
    paddingHorizontal: 7,
  },
  countText: { color: colors.info, fontSize: 10, fontWeight: "900" },
  subjectsCard: { gap: 5 },
  subjectRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF0F3",
  },
  lastSubjectRow: { borderBottomWidth: 0 },
  subjectCopy: { flex: 1, minWidth: 0, gap: 7 },
  subjectTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  subjectName: { flex: 1, color: colors.ink, fontSize: 12, fontWeight: "800" },
  remark: { color: colors.muted, fontSize: 10, lineHeight: 14 },
  subjectScoreTrack: {
    height: 5,
    borderRadius: 4,
    backgroundColor: "#EEF0F3",
    overflow: "hidden",
  },
  subjectScoreFill: { height: "100%", borderRadius: 4 },
  marks: { color: colors.ink, fontSize: 11, fontWeight: "800" },
  gradeBadge: {
    minWidth: 36,
    alignItems: "center",
    borderRadius: 9,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  gradePass: { backgroundColor: "#EAF5EE" },
  gradeFail: { backgroundColor: "#FCEDEA" },
  gradeText: { fontSize: 10, fontWeight: "900" },
  gradePassText: { color: colors.success },
  gradeFailText: { color: colors.alert },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  totalLabel: { color: colors.ink, fontSize: 13, fontWeight: "800" },
  totalMarks: { color: colors.ink, fontSize: 13, fontWeight: "900" },
  note: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    backgroundColor: "#F0F6FA",
    borderColor: "#DCEAF3",
  },
  noteText: { flex: 1, color: colors.muted, fontSize: 11, lineHeight: 16 },
  listHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 5,
    marginBottom: 1,
  },
  listIcon: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#EAF2F8",
  },
  listHeadingCopy: { flex: 1, gap: 2 },
  termPressed: { opacity: 0.86, transform: [{ scale: 0.99 }] },
  termCard: { gap: 10, padding: 14 },
  termTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  termIcon: {
    width: 42,
    height: 42,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: "#EAF2F8",
  },
  termCopy: { flex: 1, minWidth: 0, gap: 4 },
  termName: { color: colors.ink, fontSize: 13, fontWeight: "800" },
  assessmentBadge: {
    alignSelf: "flex-start",
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  faBadge: { backgroundColor: "#FFF1DD" },
  saBadge: { backgroundColor: "#EAF5EE" },
  termBadge: { backgroundColor: "#EAF2F8" },
  assessmentBadgeText: { fontSize: 9, fontWeight: "900" },
  faBadgeText: { color: colors.amberDark },
  saBadgeText: { color: colors.success },
  termBadgeText: { color: colors.info },
  termMeta: { color: colors.muted, fontSize: 10, lineHeight: 14 },
  termScore: { alignItems: "flex-end", gap: 5 },
  termPercentage: { color: colors.ink, fontSize: 18, fontWeight: "900" },
  termProgressTrack: {
    height: 6,
    borderRadius: 5,
    backgroundColor: "#EEF0F3",
    overflow: "hidden",
  },
  termProgressFill: { height: "100%", borderRadius: 5 },
  termMarks: {
    alignSelf: "flex-end",
    color: colors.muted,
    fontSize: 10,
    fontWeight: "600",
  },
});
