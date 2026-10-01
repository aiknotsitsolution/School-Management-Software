import React, { useEffect, useState } from "react";
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
import { api } from "../lib/api";
import { Button, Card, Input, Toast } from "../components/UI";
import { colors } from "../theme";
import type { School, User } from "../types";

const PAGE_SIZE = 20;
const roles: { value: User["role"] | ""; label: string }[] = [
  { value: "", label: "All roles" },
  { value: "super_admin", label: "Platform owner" },
  { value: "school_admin", label: "School admin" },
  { value: "teacher", label: "Teacher" },
  { value: "staff", label: "Staff" },
  { value: "student", label: "Student" },
  { value: "parent", label: "Parent" },
];
const designations = [
  ["admission_counsellor", "Admission counsellor"],
  ["accountant", "Accountant"],
  ["librarian", "Librarian"],
  ["receptionist", "Receptionist"],
  ["transport", "Transport coordinator"],
] as const;

type CreateForm = {
  name: string;
  email: string;
  password: string;
  role: User["role"];
  schoolId: string;
  designation: string;
  className: string;
  section: string;
  refId: string;
};
const emptyForm: CreateForm = {
  name: "",
  email: "",
  password: "",
  role: "school_admin",
  schoolId: "",
  designation: "",
  className: "",
  section: "",
  refId: "",
};
const roleNames: Record<User["role"], string> = {
  super_admin: "Platform owner",
  school_admin: "School admin",
  admin: "Admin",
  teacher: "Teacher",
  student: "Student",
  parent: "Parent",
  staff: "Staff",
};

export default function PlatformUsersScreen() {
  const [users, setUsers] = useState<User[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<User["role"] | "">("");
  const [schoolId, setSchoolId] = useState("");
  const [removed, setRemoved] = useState(false);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [creating, setCreating] = useState(false);
  const [creatingBusy, setCreatingBusy] = useState(false);
  const [form, setForm] = useState<CreateForm>(emptyForm);
  const [selected, setSelected] = useState<User | null>(null);
  const [details, setDetails] = useState<
    Awaited<ReturnType<typeof api.platform.users.details>>["data"] | null
  >(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    let active = true;
    api.platform.schools
      .list("limit=100")
      .then((response) => {
        if (active) setSchools(response.data || []);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      limit: String(PAGE_SIZE),
    });
    if (debouncedQuery) params.set("q", debouncedQuery);
    if (role) params.set("role", role);
    if (schoolId) params.set("schoolId", schoolId);
    if (removed) params.set("includeDeleted", "true");
    api.platform.users
      .list(params.toString())
      .then((response) => {
        if (!active) return;
        setUsers(response.data || []);
        setTotal(response.total || 0);
        setPages(response.pages || 0);
        setError("");
      })
      .catch((loadError: unknown) => {
        if (active)
          setError(
            (loadError as Error).message || "Unable to load platform users.",
          );
      })
      .finally(() => {
        if (active) {
          setLoading(false);
          setRefreshing(false);
        }
      });
    return () => {
      active = false;
    };
  }, [debouncedQuery, role, schoolId, removed, page, refreshKey]);

  const refresh = () => {
    setRefreshing(true);
    setRefreshKey((value) => value + 1);
  };
  const schoolName = (id?: string | null) =>
    schools.find((school) => String(school._id || school.id) === String(id))
      ?.name || "No school";

  const confirm = (
    title: string,
    message: string,
    action: () => Promise<void>,
    label = "Continue",
    destructive = false,
  ) => {
    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel" },
      {
        text: label,
        style: destructive ? "destructive" : "default",
        onPress: () => {
          void action();
        },
      },
    ]);
  };

  const mutate = async (
    user: User,
    action: "activate" | "deactivate" | "remove" | "restore",
  ) => {
    const id = user._id || user.id;
    if (!id) return;
    setBusyId(id);
    setError("");
    try {
      if (action === "activate" || action === "deactivate") {
        await api.platform.users.setStatus(id, action === "activate");
      } else if (action === "remove") {
        await api.platform.users.remove(id);
        if (selected?._id === id) setSelected(null);
      } else {
        await api.platform.users.restore(id);
      }
      setRefreshKey((value) => value + 1);
    } catch (mutationError) {
      setError((mutationError as Error).message || "User update failed.");
    } finally {
      setBusyId("");
    }
  };

  const openDetails = async (user: User) => {
    const id = user._id || user.id;
    if (!id) return;
    setSelected(user);
    setDetails(null);
    setDetailsLoading(true);
    try {
      const response = await api.platform.users.details(id);
      setDetails(response.data);
    } catch (detailError) {
      setError(
        (detailError as Error).message || "Unable to load user details.",
      );
    } finally {
      setDetailsLoading(false);
    }
  };

  const createUser = async () => {
    if (!form.name.trim() || !form.email.trim() || !form.password) {
      setError("Name, email and password are required.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setError("Enter a valid email address.");
      return;
    }
    if (form.password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (form.role !== "super_admin" && !form.schoolId) {
      setError("Select a school for this account.");
      return;
    }
    if (form.role === "student" && !form.refId.trim()) {
      setError("Admission ID is required for student accounts.");
      return;
    }
    setCreatingBusy(true);
    setError("");
    try {
      await api.platform.users.create({
        schoolId: form.role === "super_admin" ? undefined : form.schoolId,
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
        role: form.role,
        designation:
          form.role === "staff" ? form.designation || undefined : undefined,
        class:
          form.role === "teacher" ? form.className || undefined : undefined,
        section: form.section || undefined,
        refId: form.refId.trim() || undefined,
      });
      setForm(emptyForm);
      setCreating(false);
      setPage(1);
      setDebouncedQuery("");
      setQuery("");
      setRole("");
      setSchoolId("");
      setRemoved(false);
      setRefreshKey((value) => value + 1);
    } catch (createError) {
      setError((createError as Error).message || "Unable to create user.");
    } finally {
      setCreatingBusy(false);
    }
  };

  return (
    <View style={s.root}>
      {!!error && <Toast message={error} onDismiss={() => setError("")} />}
      <ScrollView
        contentContainerStyle={s.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} />
        }
        keyboardShouldPersistTaps="handled"
      >
        <View style={s.heading}>
          <View>
            <Text style={s.eyebrow}>PLATFORM OWNER · ACCESS & SECURITY</Text>
            <Text style={s.title}>Users & Access</Text>
            <Text style={s.subtitle}>
              {total.toLocaleString("en-IN")} platform users
            </Text>
          </View>
          <Pressable
            onPress={() => {
              setCreating((value) => !value);
              setError("");
            }}
            accessibilityRole="button"
            style={s.addButton}
          >
            <Ionicons
              name={creating ? "close" : "person-add"}
              size={18}
              color="#fff"
            />
          </Pressable>
        </View>

        {creating && (
          <Card style={s.createCard}>
            <Text style={s.sectionTitle}>Create platform user</Text>
            <Field
              label="Full name"
              value={form.name}
              onChangeText={(value) =>
                setForm((current) => ({ ...current, name: value }))
              }
              placeholder="Full name"
            />
            <Field
              label="Email"
              value={form.email}
              onChangeText={(value) =>
                setForm((current) => ({ ...current, email: value }))
              }
              placeholder="user@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <Field
              label="Password (min 8 characters)"
              value={form.password}
              onChangeText={(value) =>
                setForm((current) => ({ ...current, password: value }))
              }
              placeholder="Temporary password"
              secureTextEntry
              autoCapitalize="none"
            />
            <Text style={s.fieldLabel}>Role</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.chips}
            >
              {roles
                .filter((item) => item.value)
                .map((item) => (
                  <Chip
                    key={item.value}
                    label={item.label}
                    selected={form.role === item.value}
                    onPress={() =>
                      setForm((current) => ({
                        ...current,
                        role: item.value as User["role"],
                      }))
                    }
                  />
                ))}
            </ScrollView>
            {form.role !== "super_admin" && (
              <>
                <Text style={s.fieldLabel}>School *</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={s.chips}
                >
                  {schools.map((school) => {
                    const id = school._id || school.id || "";
                    return (
                      <Chip
                        key={id}
                        label={school.name || school.code || "School"}
                        selected={form.schoolId === id}
                        onPress={() =>
                          setForm((current) => ({ ...current, schoolId: id }))
                        }
                      />
                    );
                  })}
                </ScrollView>
              </>
            )}
            {form.role === "staff" && (
              <>
                <Text style={s.fieldLabel}>Designation</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={s.chips}
                >
                  {designations.map(([value, label]) => (
                    <Chip
                      key={value}
                      label={label}
                      selected={form.designation === value}
                      onPress={() =>
                        setForm((current) => ({
                          ...current,
                          designation: value,
                        }))
                      }
                    />
                  ))}
                </ScrollView>
              </>
            )}
            {form.role === "teacher" && (
              <Field
                label="Class"
                value={form.className}
                onChangeText={(value) =>
                  setForm((current) => ({ ...current, className: value }))
                }
                placeholder="Class taught"
              />
            )}
            {form.role === "student" && (
              <Field
                label="Admission ID *"
                value={form.refId}
                onChangeText={(value) =>
                  setForm((current) => ({ ...current, refId: value }))
                }
                placeholder="Admission ID"
              />
            )}
            {(form.role === "teacher" || form.role === "staff") && (
              <Field
                label="Section"
                value={form.section}
                onChangeText={(value) =>
                  setForm((current) => ({ ...current, section: value }))
                }
                placeholder="Optional"
              />
            )}
            <Button
              title={creatingBusy ? "Creating..." : "Create user"}
              onPress={createUser}
              loading={creatingBusy}
            />
          </Card>
        )}

        <View style={s.tabs}>
          <Chip
            label="Active users"
            selected={!removed}
            onPress={() => {
              setRemoved(false);
              setPage(1);
            }}
          />
          <Chip
            label="Removed users"
            selected={removed}
            onPress={() => {
              setRemoved(true);
              setPage(1);
            }}
          />
        </View>
        <View style={s.searchBox}>
          <Ionicons name="search" size={17} color={colors.muted} />
          <Input
            placeholder="Search name or email"
            value={query}
            onChangeText={(value) => {
              setQuery(value);
              setPage(1);
            }}
            style={s.searchInput}
            accessibilityLabel="Search platform users"
          />
          {!!query && (
            <Pressable
              onPress={() => setQuery("")}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
            >
              <Ionicons name="close-circle" size={18} color={colors.muted} />
            </Pressable>
          )}
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.chips}
        >
          {roles.map((item) => (
            <Chip
              key={item.value || "all-roles"}
              label={item.label}
              selected={role === item.value}
              onPress={() => {
                setRole(item.value);
                setPage(1);
              }}
            />
          ))}
        </ScrollView>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.chips}
        >
          <Chip
            label="All schools"
            selected={!schoolId}
            onPress={() => {
              setSchoolId("");
              setPage(1);
            }}
          />
          {schools.map((school) => {
            const id = school._id || school.id || "";
            return (
              <Chip
                key={id}
                label={school.name || "School"}
                selected={schoolId === id}
                onPress={() => {
                  setSchoolId(id);
                  setPage(1);
                }}
              />
            );
          })}
        </ScrollView>

        <Text style={s.results}>
          Showing {users.length} of {total.toLocaleString("en-IN")}
          {schoolId ? ` · ${schoolName(schoolId)}` : ""}
          {role ? ` · ${roleNames[role]}` : ""}
          {removed ? " · removed" : ""}
        </Text>

        {loading ? (
          <ActivityIndicator size="large" color={colors.ink} style={s.loader} />
        ) : users.length ? (
          <View style={s.list}>
            {users.map((user) => {
              const id = user._id || user.id || user.email;
              const isBusy = busyId === id;
              return (
                <Card key={id} style={s.userCard}>
                  <Pressable
                    onPress={() => void openDetails(user)}
                    style={s.userTop}
                    accessibilityRole="button"
                    accessibilityLabel={`View ${user.name} details`}
                  >
                    <View style={s.avatar}>
                      <Text style={s.initials}>{initials(user.name)}</Text>
                    </View>
                    <View style={s.userIdentity}>
                      <Text style={s.userName}>{user.name}</Text>
                      <Text style={s.userEmail}>{user.email}</Text>
                    </View>
                    <Ionicons
                      name="chevron-forward"
                      size={17}
                      color={colors.muted}
                    />
                  </Pressable>
                  <View style={s.userMeta}>
                    <Text style={s.roleBadge}>
                      {roleNames[user.role] || user.role}
                    </Text>
                    <Text style={s.userMetaText}>
                      {user.schoolId ? schoolName(user.schoolId) : "Platform"}
                    </Text>
                    <Text
                      style={[
                        s.userMetaText,
                        user.deletedAt
                          ? s.removedText
                          : user.isActive === false
                            ? s.inactiveText
                            : s.activeText,
                      ]}
                    >
                      {user.deletedAt
                        ? "Removed"
                        : user.isActive === false
                          ? "Inactive"
                          : "Active"}
                    </Text>
                  </View>
                  <Text style={s.loginText}>
                    Last login: {formatDate(user.lastLogin)}
                  </Text>
                  <View style={s.actions}>
                    {user.deletedAt ? (
                      <Action
                        label="Restore"
                        icon="refresh"
                        disabled={isBusy}
                        onPress={() =>
                          confirm(
                            "Restore user?",
                            `Restore access for ${user.name}?`,
                            () => mutate(user, "restore"),
                          )
                        }
                      />
                    ) : (
                      <>
                        <Action
                          label={
                            user.isActive === false ? "Activate" : "Deactivate"
                          }
                          icon={
                            user.isActive === false
                              ? "checkmark-circle-outline"
                              : "ban-outline"
                          }
                          disabled={isBusy}
                          onPress={() =>
                            confirm(
                              user.isActive === false
                                ? "Activate user?"
                                : "Deactivate user?",
                              `${user.isActive === false ? "Activate" : "Deactivate"} ${user.name}?`,
                              () =>
                                mutate(
                                  user,
                                  user.isActive === false
                                    ? "activate"
                                    : "deactivate",
                                ),
                            )
                          }
                        />
                        <Action
                          label="Remove"
                          icon="trash-outline"
                          destructive
                          disabled={isBusy}
                          onPress={() =>
                            confirm(
                              "Remove user?",
                              `Remove ${user.name} (${user.email})? They can be restored later.`,
                              () => mutate(user, "remove"),
                              "Remove",
                              true,
                            )
                          }
                        />
                      </>
                    )}
                  </View>
                  {isBusy && (
                    <ActivityIndicator color={colors.info} size="small" />
                  )}
                </Card>
              );
            })}
          </View>
        ) : (
          <Text style={s.empty}>
            {removed ? "No removed users." : "No users match these filters."}
          </Text>
        )}

        {pages > 1 && (
          <View style={s.pager}>
            <Pressable
              disabled={page <= 1}
              onPress={() => setPage((value) => value - 1)}
              accessibilityRole="button"
            >
              <Text style={[s.pageAction, page <= 1 && s.disabled]}>
                Previous
              </Text>
            </Pressable>
            <Text style={s.pageText}>
              Page {page} of {pages}
            </Text>
            <Pressable
              disabled={page >= pages}
              onPress={() => setPage((value) => value + 1)}
              accessibilityRole="button"
            >
              <Text style={[s.pageAction, page >= pages && s.disabled]}>
                Next
              </Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      {!!selected && (
        <View style={s.overlay}>
          <Pressable
            style={s.scrim}
            onPress={() => {
              setSelected(null);
              setDetails(null);
            }}
            accessibilityRole="button"
            accessibilityLabel="Close user details"
          />
          <View style={s.detailSheet}>
            <View style={s.sheetHeader}>
              <Text style={s.sectionTitle}>User details</Text>
              <Pressable
                onPress={() => {
                  setSelected(null);
                  setDetails(null);
                }}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={22} color={colors.muted} />
              </Pressable>
            </View>
            {detailsLoading ? (
              <ActivityIndicator color={colors.ink} style={{ margin: 24 }} />
            ) : details ? (
              <ScrollView contentContainerStyle={s.detailContent}>
                <DetailRow label="Name" value={details.user.name} />
                <DetailRow label="Email" value={details.user.email} />
                <DetailRow label="Role" value={roleNames[details.user.role]} />
                <DetailRow
                  label="School"
                  value={details.school?.name || "Platform"}
                />
                <DetailRow
                  label="Status"
                  value={
                    details.user.deletedAt
                      ? "Removed"
                      : details.user.isActive === false
                        ? "Inactive"
                        : "Active"
                  }
                />
                <DetailRow
                  label="Last login"
                  value={formatDate(details.user.lastLogin)}
                />
                <DetailRow
                  label="Created"
                  value={formatDate(details.user.createdAt)}
                />
                {details.subscription && (
                  <DetailRow
                    label="Subscription"
                    value={`${details.subscription.plan?.name || "—"} · ${details.subscription.status || "—"}`}
                  />
                )}
                <Text style={s.detailHeading}>Recent activity</Text>
                {details.recentAudits?.length ? (
                  details.recentAudits.slice(0, 6).map((entry, index) => (
                    <Text key={entry._id || index} style={s.auditText}>
                      {entry.message || entry.action || "Activity"} ·{" "}
                      {formatDate(entry.createdAt)}
                    </Text>
                  ))
                ) : (
                  <Text style={s.auditText}>No activity recorded.</Text>
                )}
              </ScrollView>
            ) : (
              <Text style={s.empty}>Could not load user details.</Text>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

function Field({
  label,
  ...props
}: { label: string } & React.ComponentProps<typeof Input>) {
  return (
    <View style={s.field}>
      <Text style={s.fieldLabel}>{label}</Text>
      <Input {...props} style={[s.input, props.style]} />
    </View>
  );
}

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[s.chip, selected && s.selectedChip]}
    >
      <Text style={[s.chipText, selected && s.selectedChipText]}>{label}</Text>
    </Pressable>
  );
}

function Action({
  label,
  icon,
  destructive,
  disabled,
  onPress,
}: {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  destructive?: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={[s.action, disabled && s.disabled]}
    >
      <Ionicons
        name={icon}
        size={15}
        color={destructive ? colors.alert : colors.info}
      />
      <Text style={[s.actionText, destructive && s.destructiveText]}>
        {label}
      </Text>
    </Pressable>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.detailRow}>
      <Text style={s.detailLabel}>{label}</Text>
      <Text style={s.detailValue}>{value || "—"}</Text>
    </View>
  );
}

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "U"
  );
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 16, paddingBottom: 30, gap: 13 },
  heading: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  eyebrow: { color: colors.amberDark, fontSize: 9, fontWeight: "800" },
  title: { color: colors.ink, fontSize: 23, fontWeight: "800", marginTop: 4 },
  subtitle: { color: colors.muted, fontSize: 11, marginTop: 3 },
  addButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.ink,
    borderRadius: 8,
  },
  createCard: { gap: 12, borderRadius: 8 },
  sectionTitle: { color: colors.ink, fontSize: 15, fontWeight: "800" },
  field: { gap: 5 },
  fieldLabel: { color: colors.ink, fontSize: 11, fontWeight: "700" },
  input: { minHeight: 42, fontSize: 12, borderRadius: 8, paddingVertical: 8 },
  chips: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingVertical: 2,
  },
  chip: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  selectedChip: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { color: colors.muted, fontSize: 10, fontWeight: "600" },
  selectedChipText: { color: "#fff" },
  tabs: { flexDirection: "row", gap: 7 },
  searchBox: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 11,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.card,
  },
  searchInput: {
    flex: 1,
    borderWidth: 0,
    borderRadius: 0,
    paddingHorizontal: 0,
    paddingVertical: 7,
    backgroundColor: "transparent",
  },
  results: { color: colors.muted, fontSize: 10 },
  loader: { marginTop: 28 },
  list: { gap: 9 },
  userCard: { padding: 12, gap: 9, borderRadius: 8 },
  userTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  avatar: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.ink,
    borderRadius: 20,
  },
  initials: { color: "#fff", fontSize: 12, fontWeight: "800" },
  userIdentity: { flex: 1, gap: 3 },
  userName: { color: colors.ink, fontSize: 13, fontWeight: "700" },
  userEmail: { color: colors.muted, fontSize: 10 },
  userMeta: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 7,
  },
  roleBadge: {
    color: colors.info,
    backgroundColor: "#EAF2F9",
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 10,
    fontSize: 9,
    fontWeight: "700",
  },
  userMetaText: { color: colors.muted, fontSize: 9 },
  activeText: { color: colors.success },
  inactiveText: { color: colors.amberDark },
  removedText: { color: colors.alert },
  loginText: { color: colors.muted, fontSize: 9 },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 6,
  },
  action: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 4,
  },
  actionText: { color: colors.info, fontSize: 10, fontWeight: "700" },
  destructiveText: { color: colors.alert },
  disabled: { opacity: 0.4 },
  empty: {
    color: colors.muted,
    fontSize: 12,
    textAlign: "center",
    paddingVertical: 28,
  },
  pager: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  pageAction: {
    color: colors.info,
    fontSize: 11,
    fontWeight: "700",
    padding: 8,
  },
  pageText: { color: colors.muted, fontSize: 10 },
  overlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: "flex-end",
    zIndex: 4,
  },
  scrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.42)",
  },
  detailSheet: {
    maxHeight: "82%",
    backgroundColor: colors.paper,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 18,
    gap: 12,
  },
  sheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  detailContent: { gap: 2, paddingBottom: 24 },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  detailLabel: { color: colors.muted, fontSize: 11 },
  detailValue: {
    color: colors.ink,
    fontSize: 11,
    fontWeight: "700",
    textAlign: "right",
    flex: 1,
  },
  detailHeading: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 14,
    marginBottom: 6,
  },
  auditText: { color: colors.muted, fontSize: 10, paddingVertical: 5 },
});
