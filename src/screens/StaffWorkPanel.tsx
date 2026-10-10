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
import { api } from "../lib/api";
import { extractList, Row } from "../lib/format";
import { colors } from "../theme";
import type { StaffRecord, TeacherAssignment, User } from "../types";

type WorkStatus = "Pending" | "In Progress" | "Completed";
type StaffTask = Row & {
  _id: string;
  title: string;
  description?: string;
  assignedTo?: string;
  assignedToRole?: string;
  category?: string;
  priority?: string;
  status?: string;
  dueDate?: string;
};
type WorkForm = {
  title: string;
  description: string;
  assignedToUserId: string;
  category: "teaching" | "external";
  priority: "Low" | "Medium" | "High";
  dueDate: string;
  status: WorkStatus;
};
type DutyForm = {
  staffId: string;
  session: string;
  type: "teaching" | "class_teacher";
  subject: string;
  class: string;
  section: string;
};
type Filter = "All" | "Pending" | "In Progress" | "Completed" | "Overdue";

const EMPTY_WORK: WorkForm = {
  title: "",
  description: "",
  assignedToUserId: "",
  category: "teaching",
  priority: "Medium",
  dueDate: "",
  status: "Pending",
};

const todayKey = () => new Date().toISOString().slice(0, 10);
const dateLabel = (value?: string) => {
  if (!value) return "No deadline";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
};
const initials = (name?: string) =>
  (name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
const isPastDue = (dueDate?: string, status?: string) =>
  Boolean(
    dueDate &&
      dueDate.slice(0, 10) < todayKey() &&
      status !== "Completed",
  );
const idOfUser = (user: User) => user._id || user.id || "";
const userLabel = (user: User) =>
  `${user.name} (${user.role === "teacher" ? "Teacher" : "Staff"})`;

function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: "default" | "numeric";
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#98A2B3"
        keyboardType={keyboardType}
        multiline={multiline}
        textAlignVertical={multiline ? "top" : "center"}
        style={[styles.input, multiline && styles.multiline]}
      />
    </View>
  );
}

export default function StaffWorkPanel() {
  const { can, school } = useAuth();
  const canWrite = can("homework:write");
  const canManageDuties = can("staff:write");
  const [tab, setTab] = useState<"teacher" | "staff">("teacher");
  const [staff, setStaff] = useState<StaffRecord[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [tasks, setTasks] = useState<StaffTask[]>([]);
  const [duties, setDuties] = useState<TeacherAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<Filter | "All">("All");
  const [priorityFilter, setPriorityFilter] = useState("All");
  const [typeFilter, setTypeFilter] = useState("All");
  const [dueFilter, setDueFilter] = useState<"All" | "Overdue" | "Next 7 days">("All");
  const [openTasks, setOpenTasks] = useState(false);
  const [openPerson, setOpenPerson] = useState<string | null>(null);
  const [workModal, setWorkModal] = useState(false);
  const [editingTask, setEditingTask] = useState<StaffTask | null>(null);
  const [workForm, setWorkForm] = useState<WorkForm>(EMPTY_WORK);
  const [dutyModal, setDutyModal] = useState(false);
  const [dutyForm, setDutyForm] = useState<DutyForm>({
    staffId: "",
    session: school?.currentSession?.name || String(new Date().getFullYear()),
    type: "teaching",
    subject: "",
    class: "",
    section: "A",
  });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const [taskResult, dutyResult, staffResult, userResult] =
        await Promise.allSettled([
          api.homework.list("assignType=staff&limit=500"),
          api.assignments.list("limit=500"),
          api.staff.list("limit=500"),
          api.users.list("limit=500"),
        ]);
      if (taskResult.status === "rejected") throw taskResult.reason;
      setTasks(
        extractList(taskResult.value.data).filter(
          (item) => typeof item._id === "string",
        ) as StaffTask[],
      );
      setDuties(
        dutyResult.status === "fulfilled"
          ? (dutyResult.value.data || [])
          : [],
      );
      setStaff(
        staffResult.status === "fulfilled" ? staffResult.value.data || [] : [],
      );
      setUsers(
        userResult.status === "fulfilled"
          ? (userResult.value.data || []).filter(
              (person) =>
                ["teacher", "staff"].includes(person.role) &&
                person.isActive !== false,
            )
          : [],
      );
      if (dutyResult.status === "rejected") {
        setError("Staff work loaded, but academic duties could not be loaded.");
      } else if (staffResult.status === "rejected") {
        setError("Staff work loaded, but the staff roster could not be loaded.");
      }
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load staff work.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [school?.currentSession?.name]);

  useEffect(() => {
    void load();
  }, [load]);

  const roster = useMemo(
    () =>
      staff
        .filter((person) =>
          tab === "teacher"
            ? person.role === "teacher"
            : person.role !== "teacher",
        )
        .filter((person) => (person.status || "Active") === "Active"),
    [staff, tab],
  );
  const tabTasks = useMemo(
    () =>
      tasks.filter((task) =>
        tab === "teacher"
          ? task.assignedToRole === "teacher"
          : task.assignedToRole !== "teacher",
      ),
    [tasks, tab],
  );
  const tabDuties =
    tab === "teacher"
      ? duties.filter((duty) => duty.type === "teaching" || duty.type === "class_teacher")
      : [];
  const activeDuties = tabDuties.filter((duty) => duty.status === "active");
  const counts = useMemo(
    () => ({
      total: tabTasks.length,
      pending: tabTasks.filter((task) => (task.status || "Pending") === "Pending").length,
      progress: tabTasks.filter((task) => task.status === "In Progress").length,
      completed: tabTasks.filter((task) => task.status === "Completed").length,
      overdue: tabTasks.filter((task) => isPastDue(task.dueDate, task.status)).length,
    }),
    [tabTasks],
  );
  const filteredTasks = useMemo(() => {
    const search = query.trim().toLowerCase();
    const now = Date.now();
    const weekEnd = now + 7 * 24 * 60 * 60 * 1000;
    return tabTasks.filter((task) => {
      const status = isPastDue(task.dueDate, task.status)
        ? "Overdue"
        : task.status || "Pending";
      if (statusFilter !== "All" && status !== statusFilter) return false;
      if (priorityFilter !== "All" && (task.priority || "Medium") !== priorityFilter) return false;
      if (typeFilter !== "All" && (task.category || "external") !== typeFilter) return false;
      if (dueFilter !== "All") {
        if (!task.dueDate) return false;
        const due = new Date(task.dueDate).getTime();
        if (dueFilter === "Overdue" && !isPastDue(task.dueDate, task.status)) return false;
        if (dueFilter === "Next 7 days" && !(due >= now && due <= weekEnd)) return false;
      }
      if (search) {
        const haystack = `${task.title} ${task.description || ""} ${task.assignedTo || ""} ${task.category || ""}`.toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      return true;
    });
  }, [dueFilter, priorityFilter, query, statusFilter, tabTasks, typeFilter]);

  const userForPerson = (person: StaffRecord) =>
    users.find(
      (user) =>
        user.name === person.name &&
        user.role === (person.role === "teacher" ? "teacher" : "staff"),
    );
  const dutiesForPerson = (person: StaffRecord) =>
    tabDuties.filter((duty) => String(duty.staffId) === person._id);

  const openWork = (person?: StaffRecord, task?: StaffTask) => {
    const account = person ? userForPerson(person) : undefined;
    setEditingTask(task || null);
    setWorkForm(
      task
        ? {
            title: task.title || "",
            description: task.description || "",
            assignedToUserId: String(task.assignedToUserId || ""),
            category: task.category === "teaching" ? "teaching" : "external",
            priority: ["Low", "Medium", "High"].includes(task.priority || "")
              ? (task.priority as WorkForm["priority"])
              : "Medium",
            dueDate: task.dueDate ? String(task.dueDate).slice(0, 10) : "",
            status: ["Pending", "In Progress", "Completed"].includes(task.status || "")
              ? (task.status as WorkStatus)
              : "Pending",
          }
        : {
            ...EMPTY_WORK,
            category: tab === "teacher" ? "teaching" : "external",
            assignedToUserId: account ? idOfUser(account) : "",
          },
    );
    setWorkModal(true);
  };

  const saveWork = async () => {
    const selectedUser = users.find(
      (person) => idOfUser(person) === workForm.assignedToUserId,
    );
    if (!workForm.title.trim() || !selectedUser) {
      Alert.alert("Required details", "Enter a title and choose an active assignee.");
      return;
    }
    if (workForm.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(workForm.dueDate)) {
      Alert.alert("Invalid due date", "Use YYYY-MM-DD date format.");
      return;
    }
    setSaving(true);
    try {
      const isTeacher = selectedUser.role === "teacher";
      const payload = {
        assignType: "staff",
        title: workForm.title.trim(),
        description: workForm.description.trim(),
        assignedTo: userLabel(selectedUser),
        assignedToRole: selectedUser.role,
        assignedToUserId: idOfUser(selectedUser),
        category: isTeacher ? workForm.category : "external",
        priority: workForm.priority,
        dueDate: workForm.dueDate || null,
        status: workForm.status,
        class: "staff",
        section: userLabel(selectedUser),
        subject: workForm.title.trim(),
      };
      if (editingTask) {
        await api.homework.update(editingTask._id, payload);
      } else {
        await api.homework.create(payload);
      }
      setWorkModal(false);
      await load(true);
    } catch (saveError) {
      Alert.alert(
        "Could not save work",
        saveError instanceof Error ? saveError.message : "Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (task: StaffTask, status: WorkStatus) => {
    try {
      await api.homework.update(task._id, { status });
      await load(true);
    } catch (updateError) {
      Alert.alert(
        "Could not update status",
        updateError instanceof Error ? updateError.message : "Please try again.",
      );
    }
  };

  const removeTask = (task: StaffTask) => {
    Alert.alert("Delete task?", `Remove "${task.title}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void api.homework
            .remove(task._id)
            .then(() => void load(true))
            .catch((deleteError: unknown) =>
              Alert.alert(
                "Could not delete task",
                deleteError instanceof Error ? deleteError.message : "Please try again.",
              ),
            );
        },
      },
    ]);
  };

  const openDuty = (person?: StaffRecord) => {
    setDutyForm({
      staffId: person?._id || "",
      session: school?.currentSession?.name || String(new Date().getFullYear()),
      type: "teaching",
      subject: "",
      class: "",
      section: "A",
    });
    setDutyModal(true);
  };

  const saveDuty = async () => {
    if (!dutyForm.staffId || !dutyForm.session.trim() || !dutyForm.class.trim()) {
      Alert.alert("Required details", "Choose a teacher and enter session and class.");
      return;
    }
    if (dutyForm.type === "teaching" && !dutyForm.subject.trim()) {
      Alert.alert("Subject required", "Enter a subject for a teaching duty.");
      return;
    }
    setSaving(true);
    try {
      await api.assignments.create({
        staffId: dutyForm.staffId,
        session: dutyForm.session.trim(),
        type: dutyForm.type,
        ...(dutyForm.type === "teaching" ? { subject: dutyForm.subject.trim() } : {}),
        class: dutyForm.class.trim(),
        section: dutyForm.section.trim(),
      });
      setDutyModal(false);
      await load(true);
    } catch (createError) {
      Alert.alert(
        "Could not assign duty",
        createError instanceof Error ? createError.message : "Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const endDuty = (duty: TeacherAssignment) => {
    Alert.alert("End academic duty?", "The assignment history will be preserved.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "End duty",
        onPress: () => {
          void api.assignments
            .end(duty._id)
            .then(() => void load(true))
            .catch((endError: unknown) =>
              Alert.alert(
                "Could not end duty",
                endError instanceof Error ? endError.message : "Please try again.",
              ),
            );
        },
      },
    ]);
  };

  if (!canWrite && !can("staff:read")) {
    return (
      <Card style={styles.denied}>
        <Ionicons name="lock-closed-outline" size={25} color={colors.muted} />
        <Text style={styles.emptyTitle}>Staff work access required</Text>
        <Text style={styles.emptyCopy}>Ask your school administrator for access.</Text>
      </Card>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Ionicons name="briefcase-outline" size={21} color="#fff" />
        </View>
        <Text style={styles.eyebrow}>HUMAN RESOURCES</Text>
        <Text style={styles.title}>Assign Work</Text>
        <Text style={styles.subtitle}>
          Assign tasks, manage teaching duties, and track staff work.
        </Text>
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load(true)}
            tintColor={colors.ink}
          />
        }
      >
        <View style={styles.tabs}>
          {([
            ["teacher", "Teachers", staff.filter((item) => item.role === "teacher").length],
            ["staff", "Other Staff", staff.filter((item) => item.role !== "teacher").length],
          ] as const).map(([key, label, count]) => (
            <Chip
              key={key}
              label={`${label} (${count})`}
              active={tab === key}
              onPress={() => setTab(key)}
            />
          ))}
        </View>

        <View style={styles.stats}>
          <Stat label="Total Tasks" value={counts.total} color={colors.info} />
          <Stat label="Pending" value={counts.pending} color="#B77912" />
          <Stat label="In Progress" value={counts.progress} color={colors.info} />
          <Stat label="Overdue" value={counts.overdue} color={colors.alert} />
        </View>

        {canWrite && (
          <View style={styles.topActions}>
            {tab === "teacher" && canManageDuties && (
              <Pressable style={styles.secondaryButton} onPress={() => openDuty()}>
                <Ionicons name="link-outline" size={16} color={colors.ink} />
                <Text style={styles.secondaryButtonText}>Academic duty</Text>
              </Pressable>
            )}
            <Pressable style={styles.primaryButton} onPress={() => openWork()}>
              <Ionicons name="add" size={17} color="#fff" />
              <Text style={styles.primaryButtonText}>Assign work</Text>
            </Pressable>
          </View>
        )}

        {error ? (
          <Pressable style={styles.errorBox} onPress={() => void load()}>
            <Text style={styles.errorText}>{error}</Text>
            <Text style={styles.retryText}>Tap to retry</Text>
          </Pressable>
        ) : null}
        {loading ? (
          <ActivityIndicator color={colors.info} style={{ marginVertical: 20 }} />
        ) : (
          <>
            <Card style={styles.filterCard}>
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search work, person or class..."
                placeholderTextColor="#98A2B3"
                style={styles.search}
              />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
                {(["All", "Pending", "In Progress", "Completed", "Overdue"] as const).map((item) => (
                  <Chip key={item} label={item} active={statusFilter === item} onPress={() => setStatusFilter(item)} />
                ))}
              </ScrollView>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
                {["All", "Low", "Medium", "High"].map((item) => (
                  <Chip key={item} label={item === "All" ? "All priorities" : item} active={priorityFilter === item} onPress={() => setPriorityFilter(item)} />
                ))}
              </ScrollView>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
                {["All", "teaching", "external"].map((item) => (
                  <Chip key={item} label={item === "All" ? "All types" : item === "teaching" ? "Teaching" : "External"} active={typeFilter === item} onPress={() => setTypeFilter(item)} />
                ))}
                {(["All", "Overdue", "Next 7 days"] as const).map((item) => (
                  <Chip key={item} label={item === "All" ? "Any deadline" : item} active={dueFilter === item} onPress={() => setDueFilter(item)} />
                ))}
              </ScrollView>
              <Text style={styles.filterResult}>{filteredTasks.length} work items</Text>
            </Card>

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{tab === "teacher" ? "Teachers" : "Staff"} ({roster.length})</Text>
              <Pressable onPress={() => setOpenTasks((value) => !value)}>
                <Text style={styles.linkText}>{openTasks ? "Hide tasks" : `View tasks (${filteredTasks.length})`}</Text>
              </Pressable>
            </View>

            {roster.length ? roster.map((person) => {
              const personDuties = dutiesForPerson(person);
              const active = personDuties.filter((duty) => duty.status === "active");
              const expanded = openPerson === person._id;
              return (
                <Card key={person._id} style={styles.personCard}>
                  <View style={styles.personTop}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>{initials(person.name)}</Text>
                    </View>
                    <View style={styles.personIdentity}>
                      <Text style={styles.personName}>{person.name || "Staff member"}</Text>
                      <Text style={styles.personMeta}>{person.designation || "—"}{person.employeeId ? ` · ID ${person.employeeId}` : ""}</Text>
                      {!!person.subjects?.length && <Text style={styles.personMeta}>{person.subjects.join(", ")}</Text>}
                    </View>
                  </View>
                  <View style={styles.personActions}>
                    {tab === "teacher" && canManageDuties && (
                      <Pressable
                        style={[styles.outlineAction, active.length > 0 && styles.dutyAssignedAction]}
                        onPress={() => active.length ? setOpenPerson(expanded ? null : person._id) : openDuty(person)}
                      >
                        <Ionicons name={active.length ? "checkmark-circle-outline" : "link-outline"} size={15} color={active.length ? colors.success : colors.ink} />
                        <Text style={[styles.outlineActionText, active.length > 0 && { color: colors.success }]}>
                          {active.length ? `Duties (${active.length})` : "Academic duty"}
                        </Text>
                      </Pressable>
                    )}
                    {canWrite && (
                      <Pressable style={styles.assignAction} onPress={() => openWork(person)}>
                        <Ionicons name="add" size={15} color="#fff" />
                        <Text style={styles.assignActionText}>Assign work</Text>
                      </Pressable>
                    )}
                  </View>
                  {expanded && personDuties.map((duty) => (
                    <View key={duty._id} style={styles.dutyRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.dutyTitle}>
                          {duty.type === "class_teacher" ? "Class Teacher" : duty.subject || "Teaching"} · Class {duty.class || "—"}{duty.section ? `-${duty.section}` : ""}
                        </Text>
                        <Text style={styles.dutyMeta}>Session {duty.session || "—"} · {duty.status === "active" ? "Active" : "Ended"}</Text>
                      </View>
                      {duty.status === "active" && canManageDuties && (
                        <Pressable onPress={() => endDuty(duty)}>
                          <Text style={styles.endDutyText}>End duty</Text>
                        </Pressable>
                      )}
                    </View>
                  ))}
                </Card>
              );
            }) : <Card><Text style={styles.emptyCopy}>No active {tab === "teacher" ? "teachers" : "staff"} found.</Text></Card>}

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{tab === "teacher" ? "Teacher Work" : "Other Staff Work"}</Text>
              <Text style={styles.filterResult}>{filteredTasks.length}</Text>
            </View>
            {openTasks && filteredTasks.map((task) => {
              const overdue = isPastDue(task.dueDate, task.status);
              const status = overdue ? "Overdue" : task.status || "Pending";
              return (
                <Card key={task._id} style={styles.taskCard}>
                  <View style={styles.taskTitleRow}>
                    <Text style={styles.taskTitle}>{task.title}</Text>
                    <Text style={[styles.badge, overdue ? styles.overdueBadge : status === "Completed" ? styles.completedBadge : styles.pendingBadge]}>{status}</Text>
                  </View>
                  <Text style={styles.taskMeta}>{task.assignedTo || "Unassigned"} · {task.category === "teaching" ? "Teaching" : "External"} · {task.priority || "Medium"} priority</Text>
                  {!!task.description && <Text style={styles.taskDescription}>{task.description}</Text>}
                  <Text style={styles.taskMeta}>Due {dateLabel(task.dueDate)}</Text>
                  {canWrite && (
                    <View style={styles.taskActions}>
                      {(["Pending", "In Progress", "Completed"] as const).map((nextStatus) => (
                        <Chip key={nextStatus} label={nextStatus} active={(task.status || "Pending") === nextStatus} onPress={() => void updateStatus(task, nextStatus)} />
                      ))}
                      <Pressable onPress={() => openWork(undefined, task)} hitSlop={8}>
                        <Ionicons name="create-outline" size={18} color={colors.info} />
                      </Pressable>
                      <Pressable onPress={() => removeTask(task)} hitSlop={8}>
                        <Ionicons name="trash-outline" size={18} color={colors.alert} />
                      </Pressable>
                    </View>
                  )}
                </Card>
              );
            })}
            {openTasks && !filteredTasks.length && <Card><Text style={styles.emptyCopy}>No work matches the selected filters.</Text></Card>}
          </>
        )}
      </ScrollView>

      <Modal visible={workModal} animationType="slide" onRequestClose={() => setWorkModal(false)}>
        <View style={styles.modal}>
          <ModalHeader title={editingTask ? "Edit work" : "Assign work"} onClose={() => setWorkModal(false)} />
          <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
            <Field label="Task title *" value={workForm.title} onChangeText={(title) => setWorkForm((current) => ({ ...current, title }))} placeholder="e.g. Prepare annual day material" />
            <Field label="Description" value={workForm.description} onChangeText={(description) => setWorkForm((current) => ({ ...current, description }))} placeholder="Task details" multiline />
            <Text style={styles.fieldLabel}>ASSIGNEE *</Text>
            <View style={styles.selectOptions}>
              {users.filter((person) => tab === "teacher" ? person.role === "teacher" : person.role === "staff").map((person) => (
                <Chip key={idOfUser(person)} label={userLabel(person)} active={workForm.assignedToUserId === idOfUser(person)} onPress={() => setWorkForm((current) => ({ ...current, assignedToUserId: idOfUser(person) }))} />
              ))}
            </View>
            {users.filter((person) => tab === "teacher" ? person.role === "teacher" : person.role === "staff").length === 0 && (
              <Text style={styles.emptyCopy}>No linked active accounts for this staff type.</Text>
            )}
            {tab === "teacher" && (
              <>
                <Text style={styles.fieldLabel}>TASK TYPE</Text>
                <View style={styles.selectOptions}>
                  {(["teaching", "external"] as const).map((category) => <Chip key={category} label={category === "teaching" ? "Teaching" : "External"} active={workForm.category === category} onPress={() => setWorkForm((current) => ({ ...current, category }))} />)}
                </View>
              </>
            )}
            <Text style={styles.fieldLabel}>PRIORITY</Text>
            <View style={styles.selectOptions}>
              {(["Low", "Medium", "High"] as const).map((priority) => <Chip key={priority} label={priority} active={workForm.priority === priority} onPress={() => setWorkForm((current) => ({ ...current, priority }))} />)}
            </View>
            <Field label="Due date (YYYY-MM-DD)" value={workForm.dueDate} onChangeText={(dueDate) => setWorkForm((current) => ({ ...current, dueDate }))} placeholder="2026-12-31" />
            <Text style={styles.fieldLabel}>STATUS</Text>
            <View style={styles.selectOptions}>
              {(["Pending", "In Progress", "Completed"] as const).map((status) => <Chip key={status} label={status} active={workForm.status === status} onPress={() => setWorkForm((current) => ({ ...current, status }))} />)}
            </View>
            <Button title={editingTask ? "Save changes" : "Assign work"} onPress={() => void saveWork()} loading={saving} />
            <Button title="Cancel" variant="ghost" onPress={() => setWorkModal(false)} />
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={dutyModal} animationType="slide" onRequestClose={() => setDutyModal(false)}>
        <View style={styles.modal}>
          <ModalHeader title="Academic duty" onClose={() => setDutyModal(false)} />
          <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
            <Text style={styles.fieldLabel}>TEACHER *</Text>
            <View style={styles.selectOptions}>
              {staff.filter((person) => person.role === "teacher").map((person) => (
                <Chip key={person._id} label={person.name || person.employeeId || "Teacher"} active={dutyForm.staffId === person._id} onPress={() => setDutyForm((current) => ({ ...current, staffId: person._id }))} />
              ))}
            </View>
            <Field label="Session *" value={dutyForm.session} onChangeText={(session) => setDutyForm((current) => ({ ...current, session }))} placeholder="2026-2027" />
            <Text style={styles.fieldLabel}>DUTY TYPE</Text>
            <View style={styles.selectOptions}>
              <Chip label="Teaching" active={dutyForm.type === "teaching"} onPress={() => setDutyForm((current) => ({ ...current, type: "teaching" }))} />
              <Chip label="Class teacher" active={dutyForm.type === "class_teacher"} onPress={() => setDutyForm((current) => ({ ...current, type: "class_teacher" }))} />
            </View>
            {dutyForm.type === "teaching" && <Field label="Subject *" value={dutyForm.subject} onChangeText={(subject) => setDutyForm((current) => ({ ...current, subject }))} placeholder="Mathematics" />}
            <Field label="Class *" value={dutyForm.class} onChangeText={(cls) => setDutyForm((current) => ({ ...current, class: cls }))} placeholder="e.g. 8" />
            <Field label="Section" value={dutyForm.section} onChangeText={(section) => setDutyForm((current) => ({ ...current, section }))} placeholder="A" />
            <Button title="Assign academic duty" onPress={() => void saveDuty()} loading={saving} />
            <Button title="Cancel" variant="ghost" onPress={() => setDutyModal(false)} />
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <Card style={styles.statCard}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </Card>
  );
}

function ModalHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <View style={styles.modalHeader}>
      <Text style={styles.modalTitle}>{title}</Text>
      <Pressable onPress={onClose} hitSlop={10}>
        <Ionicons name="close" size={24} color={colors.ink} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  header: { padding: 18, backgroundColor: colors.ink },
  headerIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.16)", alignItems: "center", justifyContent: "center", marginBottom: 12 },
  eyebrow: { color: "#FFD58A", fontSize: 10, fontWeight: "800", letterSpacing: 1.2 },
  title: { color: "#fff", fontSize: 23, fontWeight: "800", marginTop: 3 },
  subtitle: { color: "rgba(255,255,255,0.75)", fontSize: 12, lineHeight: 17, marginTop: 5 },
  content: { padding: 15, paddingBottom: 32, gap: 11 },
  tabs: { flexDirection: "row", gap: 7 },
  chip: { borderRadius: 18, backgroundColor: "#F0F2F5", paddingHorizontal: 11, paddingVertical: 7 },
  chipActive: { backgroundColor: colors.ink },
  chipText: { color: colors.muted, fontSize: 10, fontWeight: "700" },
  chipTextActive: { color: "#fff" },
  stats: { flexDirection: "row", gap: 7 },
  statCard: { flex: 1, paddingHorizontal: 9, paddingVertical: 11 },
  statValue: { fontSize: 19, fontWeight: "800" },
  statLabel: { color: colors.muted, fontSize: 9, marginTop: 4 },
  topActions: { flexDirection: "row", justifyContent: "flex-end", gap: 8 },
  primaryButton: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 9, backgroundColor: colors.ink, paddingHorizontal: 12, paddingVertical: 9 },
  primaryButtonText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  secondaryButton: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderColor: colors.border, borderRadius: 9, backgroundColor: "#fff", paddingHorizontal: 11, paddingVertical: 8 },
  secondaryButtonText: { color: colors.ink, fontSize: 11, fontWeight: "700" },
  errorBox: { padding: 11, borderRadius: 10, backgroundColor: "#FFF1EF" },
  errorText: { color: colors.alert, fontSize: 11 },
  retryText: { color: colors.ink, fontWeight: "700", fontSize: 10, marginTop: 4 },
  filterCard: { padding: 11, gap: 9 },
  search: { minHeight: 40, borderWidth: 1, borderColor: colors.border, borderRadius: 9, paddingHorizontal: 10, color: colors.ink, fontSize: 12 },
  filterRow: { gap: 6, paddingRight: 8 },
  filterResult: { color: colors.muted, fontSize: 10, fontWeight: "600" },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 3 },
  sectionTitle: { color: colors.ink, fontSize: 14, fontWeight: "800" },
  linkText: { color: colors.info, fontSize: 10, fontWeight: "700" },
  personCard: { padding: 12, gap: 10 },
  personTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  avatar: { width: 39, height: 39, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#EAF2FF" },
  avatarText: { color: colors.info, fontSize: 12, fontWeight: "800" },
  personIdentity: { flex: 1 },
  personName: { color: colors.ink, fontSize: 13, fontWeight: "800" },
  personMeta: { color: colors.muted, fontSize: 10, marginTop: 3 },
  personActions: { flexDirection: "row", justifyContent: "flex-end", gap: 7 },
  outlineAction: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 7 },
  dutyAssignedAction: { borderColor: "#A9D5BD", backgroundColor: "#E8F7EF" },
  outlineActionText: { color: colors.ink, fontSize: 10, fontWeight: "700" },
  assignAction: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 8, backgroundColor: colors.ink, paddingHorizontal: 9, paddingVertical: 7 },
  assignActionText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  dutyRow: { flexDirection: "row", alignItems: "center", gap: 8, borderTopWidth: 1, borderColor: colors.border, paddingTop: 9 },
  dutyTitle: { color: colors.ink, fontSize: 11, fontWeight: "700" },
  dutyMeta: { color: colors.muted, fontSize: 9, marginTop: 3 },
  endDutyText: { color: colors.alert, fontSize: 10, fontWeight: "800" },
  taskCard: { padding: 12, gap: 8 },
  taskTitleRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 },
  taskTitle: { flex: 1, color: colors.ink, fontSize: 13, fontWeight: "800" },
  badge: { overflow: "hidden", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, fontSize: 9, fontWeight: "800" },
  overdueBadge: { color: colors.alert, backgroundColor: "#FFF1EF" },
  completedBadge: { color: colors.success, backgroundColor: "#E8F7EF" },
  pendingBadge: { color: colors.info, backgroundColor: "#EAF2FF" },
  taskMeta: { color: colors.muted, fontSize: 10 },
  taskDescription: { color: colors.text, fontSize: 11, lineHeight: 16 },
  taskActions: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6, borderTopWidth: 1, borderColor: colors.border, paddingTop: 8 },
  emptyTitle: { color: colors.ink, fontSize: 14, fontWeight: "800", marginTop: 8, textAlign: "center" },
  emptyCopy: { color: colors.muted, fontSize: 11, textAlign: "center", paddingVertical: 8 },
  denied: { margin: 16, alignItems: "center", padding: 18 },
  modal: { flex: 1, backgroundColor: colors.paper, paddingHorizontal: 16, paddingTop: 14 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingBottom: 13, borderBottomWidth: 1, borderColor: colors.border },
  modalTitle: { color: colors.ink, fontSize: 18, fontWeight: "800" },
  modalContent: { paddingTop: 16, paddingBottom: 30, gap: 11 },
  field: { gap: 6 },
  fieldLabel: { color: colors.muted, fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  input: { minHeight: 41, borderWidth: 1, borderColor: colors.border, borderRadius: 9, paddingHorizontal: 10, color: colors.ink, backgroundColor: "#fff", fontSize: 12 },
  multiline: { minHeight: 74, paddingTop: 10 },
  selectOptions: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
});
