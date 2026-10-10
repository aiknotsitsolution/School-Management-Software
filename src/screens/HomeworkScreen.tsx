import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Button, Card, Empty, Input } from "../components/UI";
import { useAuth } from "../context/AuthContext";
import { extractList, Row } from "../lib/format";
import { get, send, uploadForm } from "../lib/api";
import { pickDocument, toFormData, type Picked } from "../lib/upload";
import { colors, radius } from "../theme";

type Homework = Row & {
  _id?: string;
  id?: string;
  title?: string;
  description?: string;
  class?: string;
  section?: string;
  subject?: string;
  dueDate?: string;
  maxMarks?: number;
  assignType?: string;
  status?: string;
};

type Submission = Row & {
  _id?: string;
  homeworkId?: string;
  admissionNo?: string;
  studentName?: string;
  content?: string;
  status?: string;
  marks?: number;
  teacherFeedback?: string;
  attachments?: { fileName?: string; fileUrl?: string }[];
};

type Scope = { class: string; section: string };
type HomeworkForm = {
  title: string;
  description: string;
  subject: string;
  dueDate: string;
  maxMarks: string;
};

const emptyForm: HomeworkForm = {
  title: "",
  description: "",
  subject: "",
  dueDate: "",
  maxMarks: "",
};

const idOf = (row: Row) => String(row._id || row.id || "");
const dateLabel = (value: unknown) => {
  if (!value) return "No due date";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
};
const isOverdue = (row: Homework) =>
  Boolean(row.dueDate && new Date(String(row.dueDate)).getTime() < Date.now());

export default function HomeworkScreen() {
  const { user, can } = useAuth();
  const role = String(user?.role || "");
  const isStudent = role === "student";
  const canWrite = can("homework:write") && !isStudent;
  const canReview = canWrite;
  const [homework, setHomework] = useState<Homework[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [scopes, setScopes] = useState<Scope[]>([]);
  const [scope, setScope] = useState<Scope | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"All" | "Upcoming" | "Overdue">("All");
  const [formVisible, setFormVisible] = useState(false);
  const [editing, setEditing] = useState<Homework | null>(null);
  const [form, setForm] = useState<HomeworkForm>(emptyForm);
  const [reviewing, setReviewing] = useState<Submission | null>(null);
  const [reviewMarks, setReviewMarks] = useState("");
  const [reviewFeedback, setReviewFeedback] = useState("");
  const [answering, setAnswering] = useState<Homework | null>(null);
  const [answer, setAnswer] = useState("");
  const [answerFile, setAnswerFile] = useState<Picked | null>(null);
  const [mySubmissions, setMySubmissions] = useState<Submission[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const queryString = !isStudent && scope
        ? `?class=${encodeURIComponent(scope.class)}${scope.section ? `&section=${encodeURIComponent(scope.section)}` : ""}`
        : "";
      const listResult = await get<unknown>(`/homework${queryString}`);
      const items = extractList(listResult.data) as Homework[];
      setHomework(items);

      if (isStudent) {
        const own = await get<unknown>("/homework/submissions");
        setMySubmissions(extractList(own.data) as Submission[]);
        setSubmissions([]);
      } else if (canReview && scope) {
        const q = `?class=${encodeURIComponent(scope.class)}${scope.section ? `&section=${encodeURIComponent(scope.section)}` : ""}`;
        const result = await get<unknown>(`/homework/submissions/class/list${q}`);
        setSubmissions(extractList(result.data) as Submission[]);
      } else {
        setSubmissions([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load homework.");
    } finally {
      setLoading(false);
    }
  }, [canReview, isStudent, scope]);

  useEffect(() => {
    let alive = true;
    const loadScopes = async () => {
      if (isStudent) return;
      try {
        const result = await get<unknown>("/assignments/me");
        const data = result.data as Row | null;
        const raw = data && typeof data === "object"
          ? [...extractList(data.teaching), ...extractList(data.classTeacher), ...extractList(data.teachingScopes)]
          : [];
        const map = new Map<string, Scope>();
        raw.forEach((item) => {
          const cls = String(item.class || "").trim();
          const section = String(item.section || "").trim();
          if (cls) map.set(`${cls}::${section}`, { class: cls, section });
        });
        const nextScopes = Array.from(map.values());
        if (alive) {
          setScopes(nextScopes);
          if (nextScopes.length) {
            setScope((current) =>
              current && nextScopes.some((item) => item.class === current.class && item.section === current.section)
                ? current
                : nextScopes[0],
            );
          } else if (!["teacher", "staff"].includes(role)) {
            const classes = await get<unknown>("/exam-masters/classes");
            const classRows = extractList(classes.data);
            if (alive) {
              const adminScopes = classRows.map((row) => ({
                class: String(row.name || row.label || row.class || "").trim(),
                section: "",
              })).filter((item) => item.class);
              setScopes(adminScopes);
              setScope((current) => {
                if (current && adminScopes.some((item) => item.class === current.class)) return current;
                return adminScopes.length === 1 ? adminScopes[0] : null;
              });
            }
          }
        }
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : "Unable to load class assignments.");
      }
    };
    void loadScopes();
    return () => { alive = false; };
  }, [isStudent, role]);

  useEffect(() => {
    void load();
  }, [load]);

  const currentSubmissionByHomework = useMemo(() => {
    const map = new Map<string, Submission>();
    mySubmissions.forEach((item) => {
      if (item.homeworkId) map.set(String(item.homeworkId), item);
    });
    return map;
  }, [mySubmissions]);

  const visibleHomework = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return homework.filter((item) => {
      const matchesQuery = !normalized ||
        `${item.title || ""} ${item.subject || ""} ${item.description || ""}`.toLowerCase().includes(normalized);
      const overdue = isOverdue(item);
      return matchesQuery &&
        (filter === "All" || (filter === "Overdue" ? overdue : !overdue));
    });
  }, [filter, homework, query]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setFormVisible(true);
  };

  const openEdit = (item: Homework) => {
    setEditing(item);
    setForm({
      title: String(item.title || ""),
      description: String(item.description || ""),
      subject: String(item.subject || ""),
      dueDate: item.dueDate ? String(item.dueDate).slice(0, 10) : "",
      maxMarks: item.maxMarks == null ? "" : String(item.maxMarks),
    });
    setFormVisible(true);
  };

  const saveHomework = async () => {
    if (!form.title.trim()) {
      Alert.alert("Title required", "Enter a homework title before saving.");
      return;
    }
    if (!scope && !editing) {
      Alert.alert("Class required", "Select an assigned class and section first.");
      return;
    }
    if (form.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(form.dueDate)) {
      Alert.alert("Invalid due date", "Use YYYY-MM-DD format.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        assignType: "student",
        class: scope?.class || editing?.class,
        section: scope?.section || editing?.section,
        subject: form.subject.trim(),
        title: form.title.trim(),
        description: form.description.trim(),
        dueDate: form.dueDate || null,
        maxMarks: form.maxMarks ? Number(form.maxMarks) : null,
      };
      if (editing) await send(`/homework/${idOf(editing)}`, "PUT", payload);
      else await send("/homework", "POST", payload);
      setFormVisible(false);
      await load();
    } catch (err) {
      Alert.alert("Could not save homework", err instanceof Error ? err.message : "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const deleteHomework = (item: Homework) => {
    Alert.alert("Delete homework?", `“${item.title || "Homework"}” will be removed.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await send(`/homework/${idOf(item)}`, "DELETE");
            await load();
          } catch (err) {
            Alert.alert("Could not delete homework", err instanceof Error ? err.message : "Please try again.");
          }
        },
      },
    ]);
  };

  const openReview = (submission: Submission) => {
    setReviewing(submission);
    setReviewMarks(submission.marks == null ? "" : String(submission.marks));
    setReviewFeedback(String(submission.teacherFeedback || ""));
  };

  const saveReview = async () => {
    if (!reviewing) return;
    if (reviewMarks && (!Number.isFinite(Number(reviewMarks)) || Number(reviewMarks) < 0)) {
      Alert.alert("Invalid marks", "Enter a valid non-negative mark.");
      return;
    }
    setSaving(true);
    try {
      await send(`/homework/submissions/review/${idOf(reviewing)}`, "PATCH", {
        marks: reviewMarks ? Number(reviewMarks) : null,
        teacherFeedback: reviewFeedback.trim() || null,
      });
      setReviewing(null);
      await load();
    } catch (err) {
      Alert.alert("Could not review submission", err instanceof Error ? err.message : "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const startAnswer = (item: Homework) => {
    setAnswering(item);
    setAnswer("");
    setAnswerFile(null);
  };

  const submitAnswer = async () => {
    if (!answer.trim() && !answerFile) {
      Alert.alert("Answer required", "Write an answer or attach a file before submitting.");
      return;
    }
    if (!answering) return;
    setSaving(true);
    try {
      if (answerFile) {
        const formData = toFormData("file", answerFile, { content: answer.trim() });
        await uploadForm(`/homework/submissions/${idOf(answering)}`, formData);
      } else {
        await send(`/homework/submissions/${idOf(answering)}`, "POST", { content: answer.trim() });
      }
      setAnswering(null);
      await load();
    } catch (err) {
      Alert.alert("Could not submit homework", err instanceof Error ? err.message : "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const loadError = error ? (
    <Card style={styles.errorCard}>
      <Text style={styles.errorText}>{error}</Text>
      <Pressable onPress={() => void load()}><Text style={styles.retry}>Try again</Text></Pressable>
    </Card>
  ) : null;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.heading}>
          <View style={styles.headingCopy}>
            <Text style={styles.title}>{isStudent ? "My Homework" : "Homework"}</Text>
            <Text style={styles.subtitle}>
              {isStudent ? "Assignments and submission status" : "Manage assignments and review student work"}
            </Text>
          </View>
          {canWrite ? (
            <Pressable style={styles.addButton} onPress={openCreate} accessibilityRole="button">
              <Ionicons name="add" size={20} color="#fff" />
              <Text style={styles.addText}>Add</Text>
            </Pressable>
          ) : null}
        </View>

        {!isStudent && scopes.length > 1 ? (
          <Card style={styles.scopeCard}>
            <Text style={styles.fieldLabel}>CLASS / SECTION</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scopeOptions}>
              {!["teacher", "staff"].includes(role) ? (
                <Pressable
                  style={[styles.scopeChip, !scope && styles.scopeChipSelected]}
                  onPress={() => setScope(null)}
                >
                  <Text style={[styles.scopeChipText, !scope && styles.scopeChipTextSelected]}>All classes</Text>
                </Pressable>
              ) : null}
              {scopes.map((item) => {
                const selected = scope?.class === item.class && scope?.section === item.section;
                return (
                  <Pressable
                    key={`${item.class}::${item.section}`}
                    style={[styles.scopeChip, selected && styles.scopeChipSelected]}
                    onPress={() => setScope(item)}
                  >
                    <Text style={[styles.scopeChipText, selected && styles.scopeChipTextSelected]}>
                      {item.class}{item.section ? ` - ${item.section}` : ""}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </Card>
        ) : null}

        <Card style={styles.filterCard}>
          <Input value={query} onChangeText={setQuery} placeholder="Search homework or subject" />
          <View style={styles.filters}>
            {(["All", "Upcoming", "Overdue"] as const).map((item) => (
              <Pressable
                key={item}
                style={[styles.filterChip, filter === item && styles.filterChipSelected]}
                onPress={() => setFilter(item)}
              >
                <Text style={[styles.filterText, filter === item && styles.filterTextSelected]}>{item}</Text>
              </Pressable>
            ))}
          </View>
        </Card>

        {loadError}
        {loading ? <ActivityIndicator color={colors.info} style={styles.loading} /> : null}
        {!loading && !visibleHomework.length && !error ? (
          <Empty text={query ? "No homework matches your search." : "No homework assigned yet."} />
        ) : null}

        {visibleHomework.map((item) => {
          const id = idOf(item);
          const own = currentSubmissionByHomework.get(id);
          const overdue = isOverdue(item);
          const status = String(own?.status || "");
          const locked = status === "Reviewed";
          return (
            <Card key={id || String(item.title)} style={styles.homeworkCard}>
              <View style={styles.cardTop}>
                <View style={styles.cardHeading}>
                  <Text style={styles.homeworkTitle}>{item.title || "Untitled homework"}</Text>
                  <Text style={styles.subject}>{item.subject || "General"} · Class {item.class || "—"}{item.section ? `-${item.section}` : ""}</Text>
                </View>
                <View style={[styles.statusBadge, overdue ? styles.overdueBadge : styles.upcomingBadge]}>
                  <Text style={[styles.statusText, overdue ? styles.overdueText : styles.upcomingText]}>
                    {overdue ? "Overdue" : status || "Upcoming"}
                  </Text>
                </View>
              </View>
              {item.description ? <Text style={styles.description}>{item.description}</Text> : null}
              <View style={styles.metadata}>
                <Ionicons name="calendar-outline" size={15} color={colors.muted} />
                <Text style={styles.metaText}>Due {dateLabel(item.dueDate)}</Text>
                {item.maxMarks != null ? (
                  <>
                    <Text style={styles.metaDot}>·</Text>
                    <Text style={styles.metaText}>{item.maxMarks} marks</Text>
                  </>
                ) : null}
              </View>
              {isStudent && own ? (
                <View style={styles.submissionStatus}>
                  <Text style={styles.submissionTitle}>Submission: {status || "Submitted"}</Text>
                  {own.marks != null ? <Text style={styles.metaText}>Marks: {own.marks}{item.maxMarks ? ` / ${item.maxMarks}` : ""}</Text> : null}
                  {own.teacherFeedback ? <Text style={styles.feedback}>{own.teacherFeedback}</Text> : null}
                </View>
              ) : null}
              {canWrite ? (
                <View style={styles.actions}>
                  <Pressable style={styles.actionButton} onPress={() => openEdit(item)}>
                    <Ionicons name="create-outline" size={17} color={colors.info} />
                    <Text style={styles.actionText}>Edit</Text>
                  </Pressable>
                  <Pressable style={styles.actionButton} onPress={() => deleteHomework(item)}>
                    <Ionicons name="trash-outline" size={17} color={colors.alert} />
                    <Text style={[styles.actionText, { color: colors.alert }]}>Delete</Text>
                  </Pressable>
                  {canReview ? <Text style={styles.reviewCount}>
                    {submissions.filter((entry) => String(entry.homeworkId) === id).length} submissions
                  </Text> : null}
                </View>
              ) : null}
              {isStudent && !locked ? (
                <Pressable style={styles.submitButton} onPress={() => startAnswer(item)}>
                  <Text style={styles.submitButtonText}>{own ? "Update submission" : "Submit homework"}</Text>
                  <Ionicons name="arrow-forward" size={17} color="#fff" />
                </Pressable>
              ) : null}
            </Card>
          );
        })}

        {canReview && scope ? (
          <View style={styles.reviewSection}>
            <View style={styles.sectionHeading}>
              <Text style={styles.sectionTitle}>Submission review</Text>
              <Text style={styles.sectionCount}>{submissions.length}</Text>
            </View>
            {!loading && submissions.length === 0 ? (
              <Card><Text style={styles.emptyReview}>No student submissions for this class yet.</Text></Card>
            ) : null}
            {submissions.map((item) => {
              const related = homework.find((entry) => idOf(entry) === String(item.homeworkId));
              return (
                <Pressable key={idOf(item)} onPress={() => openReview(item)}>
                  <Card style={styles.submissionCard}>
                    <View style={styles.submissionRow}>
                      <View style={styles.studentAvatar}>
                        <Text style={styles.avatarText}>{String(item.studentName || "S").slice(0, 1).toUpperCase()}</Text>
                      </View>
                      <View style={styles.submissionCopy}>
                        <Text style={styles.studentName}>{item.studentName || item.admissionNo || "Student"}</Text>
                        <Text style={styles.metaText}>{related?.title || "Homework"} · {item.status || "Submitted"}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
                    </View>
                    {item.content ? <Text numberOfLines={2} style={styles.answerPreview}>{item.content}</Text> : null}
                  </Card>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </ScrollView>

      <FormModal
        visible={formVisible}
        title={editing ? "Edit homework" : "Add homework"}
        onClose={() => setFormVisible(false)}
        onSave={saveHomework}
        saving={saving}
      >
        {!editing ? (
          <Text style={styles.formScope}>
            {scope ? `Class ${scope.class}${scope.section ? ` · Section ${scope.section}` : ""}` : "Select a class from your assigned scope"}
          </Text>
        ) : null}
        <Text style={styles.fieldLabel}>TITLE *</Text>
        <Input value={form.title} onChangeText={(title) => setForm((current) => ({ ...current, title }))} placeholder="e.g. Chapter 4 exercise" />
        <Text style={styles.fieldLabel}>SUBJECT</Text>
        <Input value={form.subject} onChangeText={(subject) => setForm((current) => ({ ...current, subject }))} placeholder="Subject" />
        <Text style={styles.fieldLabel}>INSTRUCTIONS</Text>
        <Input
          value={form.description}
          onChangeText={(description) => setForm((current) => ({ ...current, description }))}
          placeholder="Describe the homework"
          multiline
          textAlignVertical="top"
          style={styles.multiline}
        />
        <Text style={styles.fieldLabel}>DUE DATE (YYYY-MM-DD)</Text>
        <Input value={form.dueDate} onChangeText={(dueDate) => setForm((current) => ({ ...current, dueDate }))} placeholder="2026-06-30" />
        <Text style={styles.fieldLabel}>MAXIMUM MARKS (OPTIONAL)</Text>
        <Input value={form.maxMarks} onChangeText={(maxMarks) => setForm((current) => ({ ...current, maxMarks }))} placeholder="100" keyboardType="numeric" />
      </FormModal>

      <FormModal
        visible={Boolean(reviewing)}
        title="Review submission"
        onClose={() => setReviewing(null)}
        onSave={saveReview}
        saveTitle="Save review"
        saving={saving}
      >
        <Text style={styles.reviewStudent}>{reviewing?.studentName || reviewing?.admissionNo || "Student"}</Text>
        {reviewing?.content ? <Text style={styles.answerText}>{reviewing.content}</Text> : null}
        {reviewing?.attachments?.map((file, index) => (
          <Pressable key={`${file.fileUrl || file.fileName}-${index}`} style={styles.fileLink} onPress={() => file.fileUrl && Linking.openURL(file.fileUrl)}>
            <Ionicons name="document-outline" size={18} color={colors.info} />
            <Text style={styles.fileName}>{file.fileName || "Open attachment"}</Text>
          </Pressable>
        ))}
        <Text style={styles.fieldLabel}>MARKS</Text>
        <Input value={reviewMarks} onChangeText={setReviewMarks} placeholder="Enter marks" keyboardType="numeric" />
        <Text style={styles.fieldLabel}>FEEDBACK</Text>
        <Input value={reviewFeedback} onChangeText={setReviewFeedback} placeholder="Feedback for student" multiline style={styles.multiline} />
      </FormModal>

      <FormModal
        visible={Boolean(answering)}
        title="Submit homework"
        onClose={() => setAnswering(null)}
        onSave={submitAnswer}
        saveTitle="Submit"
        saving={saving}
      >
        <Text style={styles.reviewStudent}>{answering?.title}</Text>
        <Input value={answer} onChangeText={setAnswer} placeholder="Write your answer" multiline textAlignVertical="top" style={styles.multiline} />
        <Pressable
          style={styles.attachButton}
          onPress={async () => {
            try {
              const file = await pickDocument();
              if (file) setAnswerFile(file);
            } catch (err) {
              Alert.alert("Could not select file", err instanceof Error ? err.message : "Please try again.");
            }
          }}
        >
          <Ionicons name="attach-outline" size={18} color={colors.info} />
          <Text style={styles.attachText}>{answerFile?.name || "Attach a file (optional)"}</Text>
        </Pressable>
      </FormModal>
    </View>
  );
}

function FormModal({
  visible,
  title,
  children,
  onClose,
  onSave,
  saveTitle = "Save",
  saving,
}: {
  visible: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  onSave: () => void;
  saveTitle?: string;
  saving: boolean;
}) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.modal}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>{title}</Text>
          <Pressable onPress={onClose} hitSlop={8}><Ionicons name="close" size={24} color={colors.ink} /></Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
          {children}
          <Button title={saveTitle} onPress={onSave} loading={saving} />
          <Pressable style={styles.cancelButton} onPress={onClose}><Text style={styles.cancelText}>Cancel</Text></Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 16, paddingBottom: 36, gap: 12 },
  heading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 2 },
  headingCopy: { flex: 1 },
  title: { color: colors.ink, fontSize: 24, fontWeight: "800" },
  subtitle: { color: colors.muted, fontSize: 13, marginTop: 4 },
  addButton: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.info, borderRadius: radius.md, paddingHorizontal: 13, paddingVertical: 10 },
  addText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  scopeCard: { paddingVertical: 12 },
  scopeOptions: { gap: 8, paddingTop: 8 },
  scopeChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: "#fff" },
  scopeChipSelected: { backgroundColor: colors.info, borderColor: colors.info },
  scopeChipText: { fontSize: 12, fontWeight: "700", color: colors.text },
  scopeChipTextSelected: { color: "#fff" },
  filterCard: { gap: 10, padding: 12 },
  filters: { flexDirection: "row", gap: 8 },
  filterChip: { borderRadius: 18, backgroundColor: colors.paper, paddingHorizontal: 13, paddingVertical: 8 },
  filterChipSelected: { backgroundColor: colors.ink },
  filterText: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  filterTextSelected: { color: "#fff" },
  loading: { marginVertical: 24 },
  errorCard: { borderColor: colors.alert },
  errorText: { color: colors.alert, fontSize: 13 },
  retry: { color: colors.info, fontWeight: "700", marginTop: 8 },
  homeworkCard: { gap: 10 },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  cardHeading: { flex: 1 },
  homeworkTitle: { color: colors.ink, fontWeight: "800", fontSize: 16 },
  subject: { color: colors.muted, fontSize: 12, marginTop: 4 },
  statusBadge: { borderRadius: 12, paddingHorizontal: 9, paddingVertical: 5 },
  upcomingBadge: { backgroundColor: "#EAF2FF" },
  overdueBadge: { backgroundColor: "#FFF0EE" },
  statusText: { fontSize: 10, fontWeight: "800" },
  upcomingText: { color: colors.info },
  overdueText: { color: colors.alert },
  description: { color: colors.text, fontSize: 13, lineHeight: 19 },
  metadata: { flexDirection: "row", alignItems: "center", gap: 6 },
  metaText: { color: colors.muted, fontSize: 12 },
  metaDot: { color: colors.muted, marginHorizontal: 1 },
  actions: { flexDirection: "row", alignItems: "center", borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10, gap: 16 },
  actionButton: { flexDirection: "row", alignItems: "center", gap: 4 },
  actionText: { color: colors.info, fontSize: 12, fontWeight: "700" },
  reviewCount: { color: colors.muted, fontSize: 11, marginLeft: "auto" },
  submitButton: { backgroundColor: colors.info, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 11, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8 },
  submitButtonText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  submissionStatus: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 9, gap: 4 },
  submissionTitle: { color: colors.ink, fontSize: 12, fontWeight: "700" },
  feedback: { color: colors.text, fontSize: 12, marginTop: 2 },
  reviewSection: { gap: 10, marginTop: 8 },
  sectionHeading: { flexDirection: "row", alignItems: "center", gap: 8 },
  sectionTitle: { color: colors.ink, fontSize: 17, fontWeight: "800" },
  sectionCount: { color: colors.info, fontSize: 12, fontWeight: "800", backgroundColor: "#EAF2FF", borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 },
  emptyReview: { color: colors.muted, textAlign: "center", fontSize: 13 },
  submissionCard: { padding: 13, gap: 8 },
  submissionRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  studentAvatar: { width: 36, height: 36, alignItems: "center", justifyContent: "center", backgroundColor: "#EAF2FF", borderRadius: 18 },
  avatarText: { color: colors.info, fontSize: 14, fontWeight: "800" },
  submissionCopy: { flex: 1, gap: 3 },
  studentName: { color: colors.ink, fontSize: 13, fontWeight: "700" },
  answerPreview: { color: colors.text, fontSize: 12, lineHeight: 17 },
  fieldLabel: { color: colors.muted, fontSize: 10, fontWeight: "800", letterSpacing: 0.6 },
  formScope: { color: colors.info, fontSize: 13, fontWeight: "700" },
  modal: { flex: 1, backgroundColor: colors.paper },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18, paddingTop: 20, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: "#fff" },
  modalTitle: { color: colors.ink, fontSize: 18, fontWeight: "800" },
  modalContent: { padding: 16, gap: 10, paddingBottom: 36 },
  multiline: { minHeight: 88 },
  cancelButton: { paddingVertical: 12, alignItems: "center" },
  cancelText: { color: colors.muted, fontWeight: "700", fontSize: 13 },
  reviewStudent: { color: colors.ink, fontSize: 14, fontWeight: "800" },
  answerText: { color: colors.text, fontSize: 13, lineHeight: 19, backgroundColor: "#fff", borderRadius: 10, padding: 12 },
  fileLink: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8 },
  fileName: { color: colors.info, fontWeight: "700", flex: 1 },
  attachButton: { flexDirection: "row", gap: 8, alignItems: "center", padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: "#fff" },
  attachText: { color: colors.info, fontSize: 13, fontWeight: "700", flex: 1 },
});
