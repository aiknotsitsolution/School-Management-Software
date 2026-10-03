import React, { useCallback, useEffect, useState } from "react";
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
import { api } from "../lib/api";
import { Button, Card, Empty, Input } from "../components/UI";
import { colors } from "../theme";
import type { ApiResponse, User } from "../types";

type Section = "accounts" | "students" | "teachers";
type ManagedRole = "teacher" | "staff" | "student" | "parent";
type PendingRecord = Record<string, unknown>;
type PageResult<T> = ApiResponse<T[]> & { total?: number; pages?: number };
type UserForm = {
  name: string;
  email: string;
  password: string;
  role: ManagedRole;
  refId: string;
  className: string;
  section: string;
  designation: string;
  linkedStudents: string;
};

const PAGE_SIZE = 20;
const roles = [
  { value: "", label: "All roles" },
  { value: "school_admin", label: "School admin" },
  { value: "teacher", label: "Teacher" },
  { value: "staff", label: "Staff" },
  { value: "student", label: "Student" },
  { value: "parent", label: "Parent" },
] as const;
const roleOptions: { value: ManagedRole; label: string }[] = [
  { value: "teacher", label: "Teacher" },
  { value: "staff", label: "Staff" },
  { value: "student", label: "Student" },
  { value: "parent", label: "Parent" },
];
const blankForm = (): UserForm => ({
  name: "",
  email: "",
  password: "",
  role: "teacher",
  refId: "",
  className: "",
  section: "",
  designation: "",
  linkedStudents: "",
});
const asText = (value: unknown) =>
  value === undefined || value === null ? "" : String(value);
const labelRole = (role?: string) =>
  role?.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) ||
  "User";
const formatDate = (value?: string | null) =>
  value && !Number.isNaN(new Date(value).getTime())
    ? new Date(value).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : value || "—";
const userId = (user: User) => user._id || user.id || "";
const hiddenDetailKey = /(password|salt|token|otp|secret)|^__v$/i;

function detailLabel(key: string) {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function detailValue(value: unknown): string {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    return value
      .map((item) =>
        item && typeof item === "object"
          ? Object.entries(item as Record<string, unknown>)
              .filter(([key, entry]) => !hiddenDetailKey.test(key) && entry != null)
              .map(([key, entry]) => `${detailLabel(key)}: ${detailValue(entry)}`)
              .join(" · ")
          : detailValue(item),
      )
      .filter(Boolean)
      .join("\n");
  }
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .filter(([key, entry]) => !hiddenDetailKey.test(key) && entry != null)
      .map(([key, entry]) => `${detailLabel(key)}: ${detailValue(entry)}`)
      .join("\n");
  }
  return "";
}

function detailRows(record: Record<string, unknown>) {
  return Object.entries(record)
    .filter(([key, value]) => !hiddenDetailKey.test(key) && value != null && value !== "")
    .map(([key, value]) => ({
      label: detailLabel(key),
      value: detailValue(value) || "—",
    }));
}

function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
      accessibilityRole="button"
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <Text style={styles.fieldLabel}>{children}</Text>;
}

export default function UsersAccessScreen() {
  const [section, setSection] = useState<Section>("accounts");
  const [users, setUsers] = useState<User[]>([]);
  const [pending, setPending] = useState<PendingRecord[]>([]);
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("");
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState("");
  const [rolePickerVisible, setRolePickerVisible] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [form, setForm] = useState<UserForm>(blankForm);
  const [lockedRef, setLockedRef] = useState(false);
  const [selected, setSelected] = useState<User | null>(null);
  const [selectedPending, setSelectedPending] = useState<{
    record: PendingRecord;
    section: "students" | "teachers";
  } | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editDraft, setEditDraft] = useState({
    name: "",
    phone: "",
    designation: "",
    className: "",
    section: "",
    refId: "",
  });
  const [busyId, setBusyId] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    setRefreshKey((value) => value + 1);
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    const load = async () => {
      try {
        if (section === "accounts") {
          const params = new URLSearchParams({
            page: String(page),
            limit: String(PAGE_SIZE),
          });
          if (debouncedQuery) params.set("q", debouncedQuery);
          if (role) params.set("role", role);
          if (includeDeleted) params.set("includeDeleted", "true");
          const result = (await api.users.list(
            params.toString(),
          )) as PageResult<User>;
          if (!active) return;
          setUsers(result.data || []);
          setTotal(result.total || 0);
          setPages(result.pages || 0);
        } else {
          const params = `page=${page}&limit=10${
            section === "teachers" ? "&role=teacher" : ""
          }`;
          const result = (section === "students"
            ? await api.students.pendingRegistrations(params)
            : await api.staff.pendingRegistrations(params)) as PageResult<PendingRecord>;
          if (!active) return;
          setPending(result.data || []);
          setTotal(result.total || 0);
          setPages(result.pages || 0);
        }
      } catch (loadError) {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load Users & Access.",
          );
        }
      } finally {
        if (active) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [
    section,
    page,
    role,
    includeDeleted,
    debouncedQuery,
    refreshKey,
  ]);

  const openCreate = (preset?: Partial<UserForm>) => {
    setLockedRef(Boolean(preset?.refId));
    setForm({ ...blankForm(), ...preset });
    setCreating(true);
  };

  const openUser = (user: User) => {
    setSelected(user);
    setEditMode(false);
    setEditDraft({
      name: user.name || "",
      phone: user.phone || "",
      designation: user.designation || "",
      className: user.class || "",
      section: user.section || "",
      refId: (user as User & { refId?: string }).refId || "",
    });
  };

  const mutateUser = async (
    user: User,
    action: "activate" | "deactivate" | "remove" | "restore" | "reset",
  ) => {
    const id = userId(user);
    if (!id) {
      Alert.alert("Unable to update", "This account has no user ID.");
      return;
    }
    setBusyId(id);
    try {
      if (action === "activate" || action === "deactivate") {
        await api.users.setStatus(id, action === "activate");
      } else if (action === "remove") {
        await api.users.remove(id);
      } else if (action === "restore") {
        await api.users.restore(id);
      } else {
        const { data } = await api.users.sendResetOtp(id);
        Alert.alert(
          "Password reset OTP sent",
          data?.maskedEmail
            ? `OTP sent to ${data.maskedEmail}. It is valid for 10 minutes.`
            : "OTP sent to the user's email. It is valid for 10 minutes.",
        );
        return;
      }
      if (selected && userId(selected) === id) {
        if (action === "remove" || action === "restore") setSelected(null);
        else setSelected({ ...selected, isActive: action === "activate" });
      }
      refresh();
    } catch (mutationError) {
      Alert.alert(
        "Action failed",
        mutationError instanceof Error
          ? mutationError.message
          : "Unable to update this account.",
      );
    } finally {
      setBusyId("");
    }
  };

  const confirmMutation = (
    user: User,
    action: "activate" | "deactivate" | "remove" | "restore" | "reset",
  ) => {
    const actionText: Record<typeof action, string> = {
      activate: "Activate",
      deactivate: "Deactivate",
      remove: "Remove",
      restore: "Restore",
      reset: "Send a password reset OTP to",
    };
    Alert.alert(
      `${actionText[action]} ${action === "reset" ? "" : "account"}?`,
      `${actionText[action]} ${user.name}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: actionText[action],
          style: action === "remove" ? "destructive" : "default",
          onPress: () => void mutateUser(user, action),
        },
      ],
    );
  };

  const createAccount = async () => {
    if (!form.name.trim() || !form.email.trim() || !form.password) {
      Alert.alert("Missing details", "Name, email and password are required.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      Alert.alert("Invalid email", "Enter a valid email address.");
      return;
    }
    if (
      (form.role === "student" || form.role === "teacher" || form.role === "staff") &&
      !form.refId.trim()
    ) {
      Alert.alert(
        "Required ID",
        form.role === "student"
          ? "Admission ID is required for student accounts."
          : "Staff ID is required for teacher and staff accounts.",
      );
      return;
    }
    const linkedStudentIds = form.linkedStudents
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    if (form.role === "parent" && linkedStudentIds.length === 0) {
      Alert.alert("Required", "Add at least one linked student Admission ID.");
      return;
    }
    setCreateBusy(true);
    try {
      await api.users.create({
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
        role: form.role,
        refId: form.refId.trim() || undefined,
        designation: form.role === "staff" ? form.designation.trim() || undefined : undefined,
        class: form.role === "student" ? form.className.trim() || undefined : undefined,
        section: form.role === "student" ? form.section.trim() || undefined : undefined,
        linkedStudentIds:
          form.role === "parent" ? linkedStudentIds : undefined,
      });
      setCreating(false);
      setForm(blankForm());
      Alert.alert(
        "Account created",
        `Share these credentials now; the password cannot be viewed again.\n\n${form.name.trim()}\n${form.email.trim().toLowerCase()}\nPassword: ${form.password}`,
      );
      refresh();
    } catch (createError) {
      Alert.alert(
        "Could not create account",
        createError instanceof Error
          ? createError.message
          : "Please check the account details and try again.",
      );
    } finally {
      setCreateBusy(false);
    }
  };

  const saveEdit = async () => {
    if (!selected) return;
    const id = userId(selected);
    if (!id) return;
    setBusyId(id);
    try {
      const patch: Partial<User> & { refId?: string } = {
        name: editDraft.name.trim(),
        phone: editDraft.phone.trim() || undefined,
        designation: editDraft.designation.trim() || undefined,
        class: editDraft.className.trim() || undefined,
        section: editDraft.section.trim() || undefined,
        refId: editDraft.refId.trim() || undefined,
      };
      await api.users.update(id, patch);
      setSelected({ ...selected, ...patch });
      setEditMode(false);
      refresh();
    } catch (saveError) {
      Alert.alert(
        "Could not save changes",
        saveError instanceof Error ? saveError.message : "Please try again.",
      );
    } finally {
      setBusyId("");
    }
  };

  const registerPending = (record: PendingRecord, target: "students" | "teachers") => {
    const firstClass = Array.isArray(record.classesAssigned)
      ? (record.classesAssigned[0] as Record<string, unknown> | undefined)
      : undefined;
    openCreate({
      name: asText(record.name),
      role: target === "students" ? "student" : "teacher",
      refId: asText(target === "students" ? record.admissionNo : record.employeeId),
      className: asText(target === "students" ? record.class : firstClass?.class),
      section: asText(target === "students" ? record.section : firstClass?.section),
    });
  };

  const tabs: { key: Section; label: string }[] = [
    { key: "accounts", label: "Accounts" },
    { key: "students", label: "Pending Students" },
    { key: "teachers", label: "Pending Teachers" },
  ];
  return (
    <View style={styles.screen}>
      <View style={styles.heading}>
        <View>
          <Text style={styles.title}>Users & Access</Text>
          <Text style={styles.subtitle}>
            {section === "accounts"
              ? `${total} account${total === 1 ? "" : "s"} · Manage school access`
              : `${total} pending ${section === "students" ? "student" : "teacher"} registration${total === 1 ? "" : "s"}`}
          </Text>
        </View>
        {section === "accounts" && (
          <Pressable
            style={styles.addButton}
            onPress={() => openCreate()}
            accessibilityLabel="Create user account"
          >
            <Ionicons name="add" size={22} color={colors.ink} />
          </Pressable>
        )}
      </View>
      <View style={styles.tabs}>
        {tabs.map((item) => (
          <Pressable
            key={item.key}
            style={[styles.sectionTab, section === item.key && styles.sectionTabActive]}
            onPress={() => {
              setSection(item.key);
              setPage(1);
              setError("");
            }}
            accessibilityRole="button"
          >
            <Text
              numberOfLines={1}
              style={[
                styles.sectionTabText,
                section === item.key && styles.sectionTabTextActive,
              ]}
            >
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>
      {section === "accounts" ? (
        <>
          <Input
            value={query}
            onChangeText={(value) => {
              setQuery(value);
              setPage(1);
            }}
            placeholder="Search name or email"
            returnKeyType="search"
            style={[styles.search, styles.compactInput]}
          />
          <View style={styles.filters}>
            <Pressable
              style={styles.roleDropdown}
              onPress={() => setRolePickerVisible(true)}
              accessibilityRole="button"
              accessibilityLabel={`Filter by role, currently ${roles.find((item) => item.value === role)?.label || "All roles"}`}
            >
              <Ionicons name="filter-outline" size={17} color={colors.ink} />
              <Text style={styles.roleDropdownText}>
                {roles.find((item) => item.value === role)?.label || "All roles"}
              </Text>
              <Ionicons name="chevron-down" size={17} color={colors.muted} />
            </Pressable>
            <Pressable
              style={[
                styles.deletedToggle,
                includeDeleted && styles.deletedToggleActive,
              ]}
              onPress={() => {
                setIncludeDeleted((value) => !value);
                setPage(1);
              }}
              accessibilityRole="button"
            >
              <Ionicons
                name={includeDeleted ? "checkbox" : "square-outline"}
                size={17}
                color={includeDeleted ? colors.ink : colors.muted}
              />
              <Text style={styles.deletedToggleText}>Removed</Text>
            </Pressable>
          </View>
        </>
      ) : (
        <Text style={styles.helper}>
          {section === "students"
            ? "Confirmed admissions awaiting a login account."
            : "Teacher records awaiting a linked login account."}
        </Text>
      )}
      {error ? (
        <Card style={styles.errorCard}>
          <Text style={styles.errorText}>{error}</Text>
          <Button title="Try again" onPress={refresh} variant="ghost" />
        </Card>
      ) : null}
      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} />
        }
      >
        {loading ? (
          <ActivityIndicator color={colors.ink} style={{ marginTop: 36 }} />
        ) : section === "accounts" ? (
          users.length ? (
            users.map((user) => {
              const identity = (user as User & { refId?: string }).refId;
              const contextLine = [
                user.class || user.section
                  ? `Class ${[user.class, user.section].filter(Boolean).join("-")}`
                  : "",
                user.designation,
                identity ? `ID ${identity}` : "",
                user.phone,
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <Pressable key={userId(user)} onPress={() => openUser(user)}>
                  <Card style={styles.rowCard}>
                    <View style={styles.rowTop}>
                      <View style={styles.avatar}>
                        <Text style={styles.avatarText}>
                          {(user.name || "?").slice(0, 1).toUpperCase()}
                        </Text>
                      </View>
                      <View style={styles.rowMain}>
                        <Text style={styles.rowTitle}>{user.name}</Text>
                        <Text style={styles.rowSub}>{user.email}</Text>
                      </View>
                      <Ionicons
                        name="chevron-forward"
                        size={18}
                        color={colors.muted}
                      />
                    </View>
                    {contextLine ? (
                      <Text style={styles.contextLine} numberOfLines={2}>
                        {contextLine}
                      </Text>
                    ) : null}
                    <View style={styles.rowMeta}>
                      <Text style={styles.roleBadge}>{labelRole(user.role)}</Text>
                      <Text
                        style={[
                          styles.status,
                          user.deletedAt
                            ? styles.removed
                            : user.isActive
                              ? styles.active
                              : styles.inactive,
                        ]}
                      >
                        {user.deletedAt
                          ? "Removed"
                          : user.isActive
                            ? "Active"
                            : "Inactive"}
                      </Text>
                      {user.emailVerified === false ? (
                        <Text style={styles.unverified}>Email not verified</Text>
                      ) : null}
                    </View>
                  </Card>
                </Pressable>
              );
            })
          ) : (
            <Empty text="No accounts match these filters." />
          )
        ) : pending.length ? (
          pending.map((record, index) => {
            const name = asText(record.name) || "Unnamed";
            const identity =
              section === "students"
                ? asText(record.admissionNo)
                : asText(record.employeeId);
            const assigned = Array.isArray(record.classesAssigned)
              ? (record.classesAssigned[0] as Record<string, unknown> | undefined)
              : undefined;
            const classLabel =
              section === "students"
                ? [asText(record.class), asText(record.section)].filter(Boolean).join("-")
                : [asText(assigned?.class), asText(assigned?.section)]
                    .filter(Boolean)
                    .join("-");
            return (
              <Card key={asText(record._id) || `${identity}-${index}`} style={styles.rowCard}>
                <Pressable
                  style={styles.pendingSummary}
                  onPress={() =>
                    setSelectedPending({
                      record,
                      section: section as "students" | "teachers",
                    })
                  }
                >
                  <View style={[styles.avatar, styles.pendingAvatar]}>
                    <Ionicons
                      name={section === "students" ? "school-outline" : "person-outline"}
                      size={20}
                      color={colors.ink}
                    />
                  </View>
                  <View style={styles.rowMain}>
                    <Text style={styles.rowTitle}>{name}</Text>
                    <Text style={styles.rowSub}>
                      {section === "students" ? "Admission ID" : "Staff ID"}: {identity || "—"}
                    </Text>
                    <Text style={styles.contextLine}>
                      {classLabel ? `Class ${classLabel}` : "Tap to view registration details"}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.muted} />
                </Pressable>
                {section === "teachers" && record.designation ? (
                  <Text style={styles.pendingDesignation}>
                    {asText(record.designation)}
                  </Text>
                ) : null}
                <Pressable
                  style={styles.registerButton}
                  onPress={() => registerPending(record, section)}
                >
                  <Ionicons name="person-add-outline" size={16} color={colors.ink} />
                  <Text style={styles.registerText}>Register User</Text>
                </Pressable>
              </Card>
            );
          })
        ) : (
          <Empty text="No pending registrations." />
        )}
      </ScrollView>
      {!loading && pages > 1 ? (
        <View style={styles.pagination}>
          <Pressable
            disabled={page <= 1}
            onPress={() => setPage((value) => Math.max(1, value - 1))}
          >
            <Text style={[styles.pageAction, page <= 1 && styles.disabled]}>
              Previous
            </Text>
          </Pressable>
          <Text style={styles.pageText}>
            Page {page} of {pages} · {total} total
          </Text>
          <Pressable
            disabled={page >= pages}
            onPress={() => setPage((value) => Math.min(pages, value + 1))}
          >
            <Text style={[styles.pageAction, page >= pages && styles.disabled]}>
              Next
            </Text>
          </Pressable>
        </View>
      ) : null}

      <Modal
        visible={rolePickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setRolePickerVisible(false)}
      >
        <Pressable
          style={styles.pickerBackdrop}
          onPress={() => setRolePickerVisible(false)}
        >
          <View style={styles.pickerSheet}>
            <View style={styles.pickerHeading}>
              <View>
                <Text style={styles.pickerTitle}>Filter accounts</Text>
                <Text style={styles.pickerSubtitle}>Choose an account role</Text>
              </View>
              <Pressable
                onPress={() => setRolePickerVisible(false)}
                hitSlop={10}
                accessibilityLabel="Close role filter"
              >
                <Ionicons name="close" size={23} color={colors.muted} />
              </Pressable>
            </View>
            {roles.map((item) => (
              <Pressable
                key={item.value || "all"}
                style={styles.pickerOption}
                onPress={() => {
                  setRole(item.value);
                  setPage(1);
                  setRolePickerVisible(false);
                }}
                accessibilityRole="button"
              >
                <Text
                  style={[
                    styles.pickerOptionText,
                    role === item.value && styles.pickerOptionTextActive,
                  ]}
                >
                  {item.label}
                </Text>
                <Ionicons
                  name={role === item.value ? "radio-button-on" : "radio-button-off"}
                  size={20}
                  color={role === item.value ? colors.ink : colors.muted}
                />
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={creating}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setCreating(false)}
      >
        <View style={styles.modal}>
          <View style={styles.modalHeading}>
            <Text style={styles.modalTitle}>Create user account</Text>
            <Pressable onPress={() => setCreating(false)} hitSlop={10}>
              <Ionicons name="close" size={24} color={colors.ink} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.form}>
            <FieldLabel>Account role</FieldLabel>
            <View style={styles.roleChoices}>
              {roleOptions.map((item) => (
                <Chip
                  key={item.value}
                  label={item.label}
                  active={form.role === item.value}
                  onPress={() => !lockedRef && setForm({ ...form, role: item.value })}
                />
              ))}
            </View>
            <FieldLabel>Full name</FieldLabel>
            <Input
              value={form.name}
              onChangeText={(name) => setForm({ ...form, name })}
              placeholder="Full name"
              autoCapitalize="words"
            />
            <FieldLabel>Email</FieldLabel>
            <Input
              value={form.email}
              onChangeText={(email) => setForm({ ...form, email })}
              placeholder="name@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <FieldLabel>Temporary password</FieldLabel>
            <Input
              value={form.password}
              onChangeText={(password) => setForm({ ...form, password })}
              placeholder="Set a temporary password"
              secureTextEntry
            />
            {form.role !== "parent" ? (
              <>
                <FieldLabel>
                  {form.role === "student" ? "Admission ID" : "Staff ID"}
                  {lockedRef ? " (linked record)" : ""}
                </FieldLabel>
                <Input
                  value={form.refId}
                  onChangeText={(refId) => setForm({ ...form, refId })}
                  placeholder={form.role === "student" ? "Admission ID" : "Staff ID"}
                  editable={!lockedRef}
                  autoCapitalize="characters"
                />
              </>
            ) : (
              <>
                <FieldLabel>Linked student Admission IDs</FieldLabel>
                <Input
                  value={form.linkedStudents}
                  onChangeText={(linkedStudents) =>
                    setForm({ ...form, linkedStudents })
                  }
                  placeholder="Separate multiple IDs with commas"
                  autoCapitalize="characters"
                />
              </>
            )}
            {form.role === "student" ? (
              <View style={styles.twoColumns}>
                <View style={styles.column}>
                  <FieldLabel>Class</FieldLabel>
                  <Input
                    value={form.className}
                    onChangeText={(className) => setForm({ ...form, className })}
                    placeholder="Class"
                  />
                </View>
                <View style={styles.column}>
                  <FieldLabel>Section</FieldLabel>
                  <Input
                    value={form.section}
                    onChangeText={(sectionValue) =>
                      setForm({ ...form, section: sectionValue })
                    }
                    placeholder="Section"
                  />
                </View>
              </View>
            ) : null}
            {form.role === "staff" ? (
              <>
                <FieldLabel>Designation</FieldLabel>
                <Input
                  value={form.designation}
                  onChangeText={(designation) => setForm({ ...form, designation })}
                  placeholder="Designation (optional)"
                />
              </>
            ) : null}
            <Button
              title="Create account"
              onPress={() => void createAccount()}
              loading={createBusy}
            />
          </ScrollView>
        </View>
      </Modal>

      <Modal
        visible={Boolean(selected)}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSelected(null)}
      >
        {selected ? (
          <View style={styles.modal}>
            <View style={styles.modalHeading}>
              <Text style={styles.modalTitle}>Account details</Text>
              <Pressable onPress={() => setSelected(null)} hitSlop={10}>
                <Ionicons name="close" size={24} color={colors.ink} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.form}>
              <Card>
                <Text style={styles.rowTitle}>{selected.name}</Text>
                <Text style={styles.rowSub}>{selected.email}</Text>
                <View style={styles.rowMeta}>
                  <Text style={styles.roleBadge}>{labelRole(selected.role)}</Text>
                  <Text style={styles.status}>
                    {selected.deletedAt
                      ? `Removed ${formatDate(selected.deletedAt)}`
                      : selected.isActive
                        ? "Active"
                        : "Inactive"}
                  </Text>
                </View>
                {!editMode ? (
                  <View style={styles.detailsGrid}>
                    {detailRows(
                      selected as unknown as Record<string, unknown>,
                    ).map((item, index) => (
                      <View key={`${item.label}-${index}`} style={styles.detailItem}>
                        <Text style={styles.detailLabel}>{item.label}</Text>
                        <Text selectable style={styles.detailValue}>
                          {item.label === "Last Login" ||
                          item.label === "Last Activity" ||
                          item.label === "Created At" ||
                          item.label === "Deleted At"
                            ? formatDate(item.value)
                            : item.value}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <>
                    <FieldLabel>Name</FieldLabel>
                    <Input
                      value={editDraft.name}
                      onChangeText={(name) => setEditDraft({ ...editDraft, name })}
                    />
                    <FieldLabel>Phone</FieldLabel>
                    <Input
                      value={editDraft.phone}
                      onChangeText={(phone) => setEditDraft({ ...editDraft, phone })}
                      keyboardType="phone-pad"
                    />
                    <FieldLabel>Designation</FieldLabel>
                    <Input
                      value={editDraft.designation}
                      onChangeText={(designation) =>
                        setEditDraft({ ...editDraft, designation })
                      }
                    />
                    <FieldLabel>Class</FieldLabel>
                    <Input
                      value={editDraft.className}
                      onChangeText={(className) =>
                        setEditDraft({ ...editDraft, className })
                      }
                    />
                    <FieldLabel>Section</FieldLabel>
                    <Input
                      value={editDraft.section}
                      onChangeText={(sectionValue) =>
                        setEditDraft({ ...editDraft, section: sectionValue })
                      }
                    />
                    <FieldLabel>Reference ID</FieldLabel>
                    <Input
                      value={editDraft.refId}
                      onChangeText={(refId) => setEditDraft({ ...editDraft, refId })}
                    />
                    <Button
                      title="Save changes"
                      onPress={() => void saveEdit()}
                      loading={busyId === userId(selected)}
                    />
                  </>
                )}
              </Card>
              {selected.role !== "school_admin" && !editMode ? (
                <View style={styles.actionList}>
                  {!selected.deletedAt ? (
                    <>
                      <Button
                        title="Edit profile"
                        onPress={() => setEditMode(true)}
                        variant="ghost"
                      />
                      <Button
                        title={selected.isActive ? "Deactivate" : "Activate"}
                        onPress={() =>
                          confirmMutation(
                            selected,
                            selected.isActive ? "deactivate" : "activate",
                          )
                        }
                        variant="ghost"
                      />
                      <Button
                        title="Send password reset OTP"
                        onPress={() => confirmMutation(selected, "reset")}
                        variant="ghost"
                      />
                      <Button
                        title="Remove account"
                        onPress={() => confirmMutation(selected, "remove")}
                        variant="ghost"
                      />
                    </>
                  ) : (
                    <Button
                      title="Restore account"
                      onPress={() => confirmMutation(selected, "restore")}
                    />
                  )}
                </View>
              ) : selected.role === "school_admin" ? (
                <Text style={styles.readOnly}>
                  School admin accounts are read-only here. Only a Platform Owner can manage them.
                </Text>
              ) : null}
            </ScrollView>
          </View>
        ) : null}
      </Modal>

      <Modal
        visible={Boolean(selectedPending)}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSelectedPending(null)}
      >
        {selectedPending ? (
          <View style={styles.modal}>
            <View style={styles.modalHeading}>
              <View>
                <Text style={styles.modalTitle}>
                  {selectedPending.section === "students"
                    ? "Pending student"
                    : "Pending teacher"}
                </Text>
                <Text style={styles.modalSubtitle}>
                  Complete registration record
                </Text>
              </View>
              <Pressable onPress={() => setSelectedPending(null)} hitSlop={10}>
                <Ionicons name="close" size={24} color={colors.ink} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.form}>
              <View style={styles.pendingHero}>
                <View style={[styles.avatar, styles.pendingAvatar, styles.largeAvatar]}>
                  <Ionicons
                    name={
                      selectedPending.section === "students"
                        ? "school-outline"
                        : "person-outline"
                    }
                    size={26}
                    color={colors.ink}
                  />
                </View>
                <Text style={styles.pendingHeroName}>
                  {asText(selectedPending.record.name) || "Unnamed"}
                </Text>
                <Text style={styles.pendingHeroMeta}>
                  {selectedPending.section === "students"
                    ? `Admission ID · ${asText(selectedPending.record.admissionNo) || "—"}`
                    : `Staff ID · ${asText(selectedPending.record.employeeId) || "—"}`}
                </Text>
              </View>
              <View style={styles.detailsGrid}>
                {detailRows(selectedPending.record).map((item, index) => (
                  <View key={`${item.label}-${index}`} style={styles.detailItem}>
                    <Text style={styles.detailLabel}>{item.label}</Text>
                    <Text selectable style={styles.detailValue}>
                      {item.label.toLowerCase().includes("date")
                        ? formatDate(item.value)
                        : item.value}
                    </Text>
                  </View>
                ))}
              </View>
              <Button
                title="Register user account"
                onPress={() => {
                  registerPending(
                    selectedPending.record,
                    selectedPending.section,
                  );
                  setSelectedPending(null);
                }}
              />
            </ScrollView>
          </View>
        ) : null}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  heading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 12,
    marginBottom: 8,
    backgroundColor: colors.ink,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  title: { color: "#fff", fontSize: 20, fontWeight: "800" },
  subtitle: { color: "#D5DAE5", fontSize: 11, marginTop: 3 },
  addButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.amber,
    alignItems: "center",
    justifyContent: "center",
  },
  tabs: {
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 14,
    paddingBottom: 9,
  },
  sectionTab: {
    flex: 1,
    minHeight: 36,
    paddingHorizontal: 5,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionTabActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  sectionTabText: {
    color: colors.text,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "700",
    textAlign: "center",
  },
  sectionTabTextActive: { color: "#fff" },
  filters: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 16,
    paddingBottom: 9,
  },
  roleDropdown: {
    flex: 1,
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 12,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
  },
  roleDropdownText: { flex: 1, color: colors.ink, fontSize: 13, fontWeight: "600" },
  deletedToggle: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: "#fff",
  },
  deletedToggleActive: { backgroundColor: "#EEF1F6", borderColor: colors.ink },
  deletedToggleText: { color: colors.text, fontSize: 12, fontWeight: "600" },
  compactInput: { minHeight: 40, paddingVertical: 8, fontSize: 14 },
  pickerBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(15, 23, 42, 0.42)",
  },
  pickerSheet: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 28,
    backgroundColor: colors.paper,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  pickerHeading: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 10,
    marginBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pickerTitle: { color: colors.ink, fontSize: 17, fontWeight: "800" },
  pickerSubtitle: { color: colors.muted, fontSize: 12, marginTop: 3 },
  pickerOption: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#EAE7DF",
  },
  pickerOptionText: { color: colors.text, fontSize: 14 },
  pickerOptionTextActive: { color: colors.ink, fontWeight: "700" },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 13,
    paddingVertical: 9,
    backgroundColor: "#fff",
  },
  chipActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { color: colors.text, fontSize: 12, fontWeight: "600" },
  chipTextActive: { color: "#fff" },
  search: { marginHorizontal: 16, marginBottom: 10 },
  helper: {
    color: colors.muted,
    fontSize: 13,
    paddingHorizontal: 16,
    paddingBottom: 12,
    lineHeight: 19,
  },
  list: { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingBottom: 36, gap: 9 },
  rowCard: {
    padding: 12,
    borderColor: "#E8E5DD",
    shadowColor: "#16213E",
    shadowOpacity: 0.045,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 9 },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#E8ECF4",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: colors.ink, fontWeight: "800", fontSize: 16 },
  rowMain: { flex: 1 },
  rowTitle: { color: colors.ink, fontWeight: "700", fontSize: 14 },
  rowSub: { color: colors.muted, fontSize: 11, marginTop: 3 },
  contextLine: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 6,
    fontWeight: "500",
  },
  rowMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    flexWrap: "wrap",
    marginTop: 8,
  },
  roleBadge: {
    color: colors.ink,
    backgroundColor: "#EEF1F6",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    fontSize: 10,
    fontWeight: "700",
    overflow: "hidden",
  },
  status: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "700",
    backgroundColor: "#F1F2F4",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    overflow: "hidden",
  },
  active: { color: "#16804A", backgroundColor: "#E9F6EF" },
  inactive: { color: "#A45A00", backgroundColor: "#FFF3DE" },
  removed: { color: colors.alert, backgroundColor: "#FCEDEA" },
  unverified: { color: colors.alert, fontSize: 11, fontWeight: "600" },
  pendingAvatar: { backgroundColor: "#F3EBD9" },
  pendingSummary: { flexDirection: "row", alignItems: "center", gap: 11 },
  pendingDesignation: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 9,
    marginLeft: 51,
  },
  registerButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    alignSelf: "flex-start",
    marginTop: 13,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: "#F2F4F7",
    borderRadius: 10,
  },
  registerText: { color: colors.ink, fontSize: 12, fontWeight: "700" },
  pagination: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.paper,
  },
  pageAction: { color: colors.ink, fontWeight: "700", fontSize: 12 },
  pageText: { color: colors.muted, fontSize: 11 },
  disabled: { color: "#B8BEC8" },
  errorCard: { marginHorizontal: 16, marginBottom: 8, borderColor: colors.alert },
  errorText: { color: colors.alert, marginBottom: 10, fontSize: 13 },
  modal: { flex: 1, backgroundColor: colors.paper, paddingTop: 6 },
  modalHeading: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 13,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: "#fff",
  },
  modalTitle: { fontSize: 19, color: colors.ink, fontWeight: "800" },
  modalSubtitle: { fontSize: 12, color: colors.muted, marginTop: 3 },
  form: { padding: 16, gap: 10, paddingBottom: 30 },
  fieldLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    marginTop: 3,
  },
  roleChoices: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginBottom: 4 },
  twoColumns: { flexDirection: "row", gap: 10 },
  column: { flex: 1, gap: 8 },
  detailsGrid: { gap: 8, marginTop: 18 },
  detailItem: {
    padding: 11,
    backgroundColor: "#F8F9FB",
    borderWidth: 1,
    borderColor: "#ECEEF2",
    borderRadius: 10,
  },
  detailLabel: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    marginBottom: 5,
  },
  detailValue: { color: colors.text, fontSize: 13, lineHeight: 19 },
  pendingHero: {
    alignItems: "center",
    padding: 18,
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  largeAvatar: { width: 56, height: 56, borderRadius: 28, marginBottom: 10 },
  pendingHeroName: { color: colors.ink, fontSize: 18, fontWeight: "800" },
  pendingHeroMeta: { color: colors.muted, fontSize: 12, marginTop: 5 },
  actionList: { gap: 9, marginTop: 4 },
  readOnly: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    paddingHorizontal: 4,
  },
});
