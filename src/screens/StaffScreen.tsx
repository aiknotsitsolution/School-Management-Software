import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../context/AuthContext";
import { Button, Card, Empty, Input } from "../components/UI";
import { api } from "../lib/api";
import { colors } from "../theme";
import type { StaffRecord, TeacherAssignment } from "../types";

const ROLE_FILTERS = [
  { value: "all", label: "All staff" },
  { value: "teacher", label: "Teachers" },
  { value: "staff", label: "Non-teaching staff" },
] as const;
const STAFF_ROLES = ["teacher", "staff"] as const;
const STATUS_FILTERS = ["All", "Active", "Inactive", "Resigned"] as const;
const roleLabels: Record<string, string> = {
  teacher: "Teacher",
  staff: "Non-teaching staff",
};
type StaffForm = {
  employeeId: string;
  name: string;
  designation: string;
  department: string;
  role: (typeof STAFF_ROLES)[number];
  contact: string;
  email: string;
  address: string;
  qualification: string;
  joiningDate: string;
  salary: string;
  subjects: string;
  status: "Active" | "Inactive" | "Resigned";
};
type CompleteProfileForm = {
  dob: string;
  gender: "" | "Male" | "Female" | "Other";
  contact: string;
  address: string;
};
const emptyStaffForm = (): StaffForm => ({
  employeeId: "",
  name: "",
  designation: "",
  department: "",
  role: "teacher",
  contact: "",
  email: "",
  address: "",
  qualification: "",
  joiningDate: "",
  salary: "",
  subjects: "",
  status: "Active",
});
const staffPlaceholders: Partial<Record<keyof StaffForm, string>> = {
  name: "e.g. Ananya Sharma",
  employeeId: "e.g. EMP-001",
  contact: "98765 43210",
  email: "name@school.edu.in",
  address: "Residential address",
  designation: "e.g. PGT Mathematics",
  department: "e.g. Science",
  qualification: "e.g. M.Sc., B.Ed.",
  joiningDate: "YYYY-MM-DD",
  salary: "e.g. 25000",
  subjects: "Mathematics, Physics",
};
const teacherFieldGroups: {
  title: string;
  fields: { key: keyof StaffForm; label: string }[];
}[] = [
  {
    title: "PERSONAL DETAILS",
    fields: [
      { key: "name", label: "Full name *" },
      { key: "employeeId", label: "Employee ID *" },
      { key: "contact", label: "Contact number" },
      { key: "email", label: "Email" },
      { key: "address", label: "Address" },
    ],
  },
  {
    title: "ROLE & EMPLOYMENT",
    fields: [
      { key: "designation", label: "Designation *" },
      { key: "department", label: "Department" },
      { key: "qualification", label: "Qualification" },
      { key: "joiningDate", label: "Joining date (YYYY-MM-DD)" },
      { key: "salary", label: "Monthly salary" },
    ],
  },
  {
    title: "TEACHING",
    fields: [{ key: "subjects", label: "Subjects (comma separated)" }],
  },
];

const displayName = (staff: StaffRecord) =>
  staff.name?.trim() || "Unnamed staff";
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

export default function StaffScreen() {
  const { can } = useAuth();
  const [items, setItems] = useState<StaffRecord[]>([]);
  const [assignments, setAssignments] = useState<TeacherAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] =
    useState<(typeof ROLE_FILTERS)[number]["value"]>("all");
  const [statusFilter, setStatusFilter] =
    useState<(typeof STATUS_FILTERS)[number]>("All");
  const [formVisible, setFormVisible] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<StaffRecord | null>(null);
  const [editingStaff, setEditingStaff] = useState<StaffRecord | null>(null);
  const [completeProfileVisible, setCompleteProfileVisible] = useState(false);
  const [completeProfileForm, setCompleteProfileForm] =
    useState<CompleteProfileForm>({ dob: "", gender: "", contact: "", address: "" });
  const [profileActionBusy, setProfileActionBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<StaffForm>(emptyStaffForm);
  const canWriteStaff = can("staff:write");
  const canAddStaff = canWriteStaff;

  const loadStaff = async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    try {
      const [staffResult, assignmentResult] = await Promise.allSettled([
        api.staff.list("limit=500"),
        api.assignments.list("limit=500"),
      ]);
      if (staffResult.status === "rejected") throw staffResult.reason;
      setItems(staffResult.value.data || []);
      if (assignmentResult.status === "fulfilled") {
        setAssignments(assignmentResult.value.data || []);
        setError("");
      } else {
        setAssignments([]);
        setError("Class teacher counts are unavailable. Tap to retry.");
      }
    } catch (loadError) {
      setError((loadError as Error).message || "Unable to load staff records.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadStaff();
  }, []);

  const saveTeacher = async () => {
    if (saving) return;
    if (
      !form.name.trim() ||
      !form.employeeId.trim() ||
      !form.designation.trim()
    ) {
      Alert.alert(
        "Required fields",
        "Enter the teacher's name, employee ID, and designation.",
      );
      return;
    }
    if (
      form.email.trim() &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())
    ) {
      Alert.alert("Invalid email", "Enter a valid email address.");
      return;
    }
    if (form.contact.trim() && !/^\d{10}$/.test(form.contact.trim())) {
      Alert.alert(
        "Invalid contact",
        "Enter exactly 10 digits for an Indian mobile number.",
      );
      return;
    }
    if (
      form.salary.trim() &&
      (!Number.isFinite(Number(form.salary)) || Number(form.salary) <= 0)
    ) {
      Alert.alert(
        "Invalid salary",
        "Monthly salary must be a positive number.",
      );
      return;
    }
    setSaving(true);
    try {
      const payload = {
        employeeId: form.employeeId.trim(),
        name: form.name.trim(),
        designation: form.designation.trim(),
        department: form.department.trim() || undefined,
        role: form.role,
        contact: form.contact.trim() ? `+91${form.contact.trim()}` : undefined,
        email: form.email.trim() || undefined,
        address: form.address.trim() || undefined,
        qualification: form.qualification.trim() || undefined,
        joiningDate: form.joiningDate.trim() || undefined,
        salary: form.salary.trim() ? Number(form.salary) : undefined,
        subjects:
          form.role === "teacher"
            ? form.subjects
                .split(",")
                .map((subject) => subject.trim())
                .filter(Boolean)
            : [],
        status: form.status,
      };
      const response = editingStaff
        ? await api.staff.update(editingStaff._id, payload)
        : await api.staff.create(payload);
      setItems((current) =>
        editingStaff
          ? current.map((staff) => staff._id === editingStaff._id ? response.data : staff)
          : [response.data, ...current],
      );
      setRoleFilter(form.role);
      setStatusFilter("All");
      setQuery("");
      setForm(emptyStaffForm());
      setEditingStaff(null);
      setFormVisible(false);
      Alert.alert(editingStaff ? "Staff updated" : "Staff added", editingStaff ? "The staff record has been updated." : "The staff member is now in your directory.");
    } catch (saveError) {
      Alert.alert("Unable to add staff", (saveError as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const openEditStaff = (staff: StaffRecord) => {
    setEditingStaff(staff);
    setForm({
      employeeId: staff.employeeId || "",
      name: staff.name || "",
      designation: staff.designation || "",
      department: staff.department || "",
      role: staff.role === "teacher" ? "teacher" : "staff",
      contact: (staff.contact || "").replace(/\D/g, "").slice(-10),
      email: staff.email || "",
      address: staff.address || "",
      qualification: staff.qualification || "",
      joiningDate: staff.joiningDate ? String(staff.joiningDate).slice(0, 10) : "",
      salary: staff.salary == null ? "" : String(staff.salary),
      subjects: staff.subjects?.join(", ") || "",
      status: staff.status || "Active",
    });
    setFormVisible(true);
    setSelectedStaff(null);
  };

  const resignStaff = (staff: StaffRecord) => {
    Alert.alert(
      "Mark staff as resigned?",
      `Mark ${displayName(staff)} as Resigned? Employment history will be preserved.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Mark Resigned",
          style: "destructive",
          onPress: () => {
            void api.staff.remove(staff._id)
              .then(({ data }) => {
                setItems((current) => current.map((item) => item._id === staff._id ? data : item));
                setSelectedStaff(data);
              })
              .catch((error: unknown) => Alert.alert("Unable to update staff status", error instanceof Error ? error.message : "Please try again."));
          },
        },
      ],
    );
  };

  const completeProfile = async () => {
    if (!selectedStaff) return;
    if (
      !completeProfileForm.dob.trim() ||
      !completeProfileForm.gender ||
      !completeProfileForm.contact.trim() ||
      !completeProfileForm.address.trim()
    ) {
      Alert.alert(
        "Profile details required",
        "Enter date of birth, gender, contact number, and address.",
      );
      return;
    }
    setProfileActionBusy(true);
    try {
      const { data } = await api.staff.completeProfile(selectedStaff._id, {
        dob: completeProfileForm.dob.trim(),
        gender: completeProfileForm.gender,
        contact: completeProfileForm.contact.trim(),
        address: completeProfileForm.address.trim(),
      });
      setItems((current) =>
        current.map((staff) => staff._id === data._id ? data : staff),
      );
      setSelectedStaff(data);
      setCompleteProfileVisible(false);
      Alert.alert("Profile completed", "The staff profile has been updated.");
    } catch (error) {
      Alert.alert(
        "Could not complete profile",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setProfileActionBusy(false);
    }
  };

  const issueIdCard = async (staff: StaffRecord) => {
    setProfileActionBusy(true);
    try {
      const { data } = await api.staff.issueIdCard(staff._id);
      setItems((current) =>
        current.map((item) => item._id === data._id ? data : item),
      );
      setSelectedStaff(data);
      Alert.alert(
        "ID card issued",
        `ID card ${data.idCardNumber || ""} is ready.`,
      );
    } catch (error) {
      Alert.alert(
        "Could not issue ID card",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setProfileActionBusy(false);
    }
  };

  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase();
    return items
      .filter((staff) => {
        if (roleFilter !== "all" && staff.role !== roleFilter) return false;
        if (
          statusFilter !== "All" &&
          (staff.status || "Active") !== statusFilter
        )
          return false;
        if (!search) return true;
        return [
          staff.name,
          staff.employeeId,
          staff.designation,
          staff.department,
          staff.email,
          staff.contact,
        ].some((value) =>
          String(value || "")
            .toLowerCase()
            .includes(search),
        );
      })
      .sort((a, b) => displayName(a).localeCompare(displayName(b)));
  }, [items, query, roleFilter, statusFilter]);

  if (!can("staff:read")) {
    return (
      <View style={styles.centered}>
        <Ionicons name="lock-closed-outline" size={28} color={colors.muted} />
        <Text style={styles.emptyTitle}>Admin access required</Text>
        <Text style={styles.emptyText}>
          Sign in with a school admin account to view staff.
        </Text>
      </View>
    );
  }

  if (loading) {
    return <ActivityIndicator style={{ flex: 1 }} color={colors.ink} />;
  }

  const activeCount = items.filter(
    (staff) => (staff.status || "Active") === "Active",
  ).length;
  const teacherCount = items.filter((staff) => staff.role === "teacher").length;
  const classTeacherCount = new Set(
    assignments
      .filter(
        (assignment) =>
          assignment.type === "class_teacher" && assignment.status === "active",
      )
      .map((assignment) => String(assignment.staffId)),
  ).size;
  const adminSupportCount = items.filter(
    (staff) => staff.role !== "teacher",
  ).length;

  return (
    <View style={styles.root}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>HUMAN RESOURCES</Text>
        <View style={styles.heroTitleRow}>
          <Text style={styles.title}>Teachers & Staff</Text>
          {canAddStaff && (
            <Pressable
              style={({ pressed }) => [
                styles.addButton,
                pressed && styles.pressed,
              ]}
              onPress={() => {
                setEditingStaff(null);
                setForm(emptyStaffForm());
                setFormVisible(true);
              }}
              accessibilityRole="button"
              accessibilityLabel="Add staff"
            >
              <Ionicons
                name="person-add-outline"
                size={16}
                color={colors.ink}
              />
              <Text style={styles.addButtonText}>Add Staff</Text>
            </Pressable>
          )}
        </View>
        <Text style={styles.subtitle}>Your school staff directory</Text>
        <View style={styles.heroFooter}>
          <View style={styles.heroDivider} />
          <Text style={styles.heroMeta}>
            {items.length} staff members <Text style={styles.heroDot}>·</Text>{" "}
            {activeCount} active
          </Text>
        </View>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCell}>
          <Text style={styles.statValue}>{teacherCount}</Text>
          <Text style={styles.statLabel}>Teachers</Text>
        </View>
        <View style={styles.statCell}>
          <Text style={styles.statValue}>{classTeacherCount}</Text>
          <Text style={styles.statLabel}>Class Teachers</Text>
        </View>
        <View style={styles.statCell}>
          <Text style={styles.statValue}>{adminSupportCount}</Text>
          <Text style={styles.statLabel}>Admin / Support</Text>
        </View>
      </View>

      {error ? (
        <Pressable
          style={styles.errorBox}
          onPress={() => void loadStaff()}
          accessibilityRole="button"
        >
          <Text style={styles.errorText}>{error}</Text>
          <Text style={styles.retryText}>Tap to retry</Text>
        </Pressable>
      ) : null}

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={17} color={colors.muted} />
        <Input
          value={query}
          onChangeText={setQuery}
          placeholder="Search name, ID, role or contact"
          autoCapitalize="none"
          returnKeyType="search"
          style={styles.search}
        />
        {query.length > 0 && (
          <Pressable
            onPress={() => setQuery("")}
            hitSlop={8}
            accessibilityLabel="Clear search"
          >
            <Ionicons name="close-circle" size={18} color={colors.muted} />
          </Pressable>
        )}
      </View>

      <View style={styles.filterSection}>
        <Text style={styles.filterHeading}>STAFF TYPE</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filters}
        >
          {ROLE_FILTERS.map((filter) => {
            const active = roleFilter === filter.value;
            const count =
              filter.value === "all"
                ? items.length
                : items.filter((staff) => staff.role === filter.value).length;
            return (
              <Pressable
                key={filter.value}
                onPress={() => setRoleFilter(filter.value)}
                style={({ pressed }) => [
                  styles.filterChip,
                  active && styles.filterChipActive,
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text
                  style={[styles.filterText, active && styles.filterTextActive]}
                >
                  {filter.label}{" "}
                  <Text
                    style={[
                      styles.filterCount,
                      active && styles.filterCountActive,
                    ]}
                  >
                    {count}
                  </Text>
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.statusFilters}
        >
          {STATUS_FILTERS.map((status) => {
            const active = statusFilter === status;
            return (
              <Pressable
                key={status}
                onPress={() => setStatusFilter(status)}
                style={({ pressed }) => [
                  styles.statusChip,
                  active && styles.statusChipActive,
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text
                  style={[styles.statusText, active && styles.statusTextActive]}
                >
                  {status}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <View style={styles.resultSummary}>
        <Text style={styles.resultLabel}>DIRECTORY</Text>
        <Text style={styles.resultCount}>{filtered.length} results</Text>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item._id}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void loadStaff(true)}
            tintColor={colors.ink}
          />
        }
        ListEmptyComponent={
          <Empty
            text={
              error
                ? "Staff records unavailable"
                : "No staff match these filters"
            }
          />
        }
        renderItem={({ item }) => {
          const name = displayName(item);
          const staffAssignments = assignments.filter(
            (assignment) =>
              String(assignment.staffId) === item._id &&
              assignment.status === "active",
          );
          const status = item.status || "Active";
          const tone =
            status === "Active"
              ? colors.success
              : status === "Resigned"
                ? colors.alert
                : colors.muted;
          const statusBackground =
            status === "Active"
              ? "#E8F3EA"
              : status === "Resigned"
                ? "#FFF1EF"
                : "#EEF0F3";
          const details = [item.designation, item.department]
            .filter(Boolean)
            .join(" · ");
          return (
            <Pressable
              onPress={() => setSelectedStaff(item)}
              accessibilityRole="button"
              accessibilityLabel={`View full profile for ${name}`}
            >
              <Card style={styles.staffCard}>
                <View style={styles.cardTop}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>
                      {initials(name) || "?"}
                    </Text>
                  </View>
                  <View style={styles.identity}>
                    <Text style={styles.name}>{name}</Text>
                    <Text style={styles.designation}>
                      {details || roleLabels[item.role || ""] || "Staff member"}
                    </Text>
                    <View style={styles.badges}>
                      <Text style={styles.roleBadge}>
                        {roleLabels[item.role || ""] || item.role || "Staff"}
                      </Text>
                      <Text
                        style={
                          item.profileStatus === "complete"
                            ? styles.profileBadge
                            : styles.incompleteBadge
                        }
                      >
                        {item.profileStatus === "complete"
                          ? "Profile complete"
                          : "Profile incomplete"}
                      </Text>
                    </View>
                  </View>
                  <View
                    style={[
                      styles.statusPill,
                      { backgroundColor: statusBackground },
                    ]}
                  >
                    <View
                      style={[styles.statusDot, { backgroundColor: tone }]}
                    />
                    <Text style={[styles.statusPillText, { color: tone }]}>
                      {status}
                    </Text>
                  </View>
                </View>
                {item.employeeId ? (
                  <Detail
                    icon="id-card-outline"
                    value={`ID  ${item.employeeId}`}
                  />
                ) : null}
                {item.contact ? (
                  <Detail icon="call-outline" value={item.contact} />
                ) : null}
                {item.email ? (
                  <Detail icon="mail-outline" value={item.email} />
                ) : null}
                {item.subjects?.length ? (
                  <Detail
                    icon="book-outline"
                    value={item.subjects.join(", ")}
                  />
                ) : null}
                {item.qualification ? (
                  <Detail icon="ribbon-outline" value={item.qualification} />
                ) : null}
                {staffAssignments.length > 0 && (
                  <>
                    {staffAssignments.map((assignment) => (
                      <Detail
                        key={assignment._id}
                        icon={assignment.type === "class_teacher" ? "school-outline" : "book-outline"}
                        value={
                          assignment.type === "class_teacher"
                            ? `Class teacher · Class ${assignment.class || "—"}${assignment.section ? `-${assignment.section}` : ""}`
                            : `${assignment.subject || "Teaching"} · Class ${assignment.class || "—"}${assignment.section ? `-${assignment.section}` : ""}`
                        }
                      />
                    ))}
                  </>
                )}
                {canWriteStaff && (
                  <Pressable
                    style={styles.editStaffButton}
                    onPress={() => openEditStaff(item)}
                    accessibilityRole="button"
                    accessibilityLabel={`Edit ${name}`}
                  >
                    <Ionicons name="create-outline" size={15} color={colors.info} />
                    <Text style={styles.editStaffText}>Edit staff record</Text>
                  </Pressable>
                )}
                <View style={styles.cardAction}>
                  <Text style={styles.cardActionText}>View full profile</Text>
                  <Ionicons
                    name="chevron-forward"
                    size={14}
                    color={colors.info}
                  />
                </View>
              </Card>
            </Pressable>
          );
        }}
      />

      <Modal
        visible={formVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setFormVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalRoot}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setFormVisible(false)}
            accessibilityLabel="Close staff form"
          />
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalEyebrow}>{editingStaff ? "UPDATE STAFF RECORD" : "NEW STAFF RECORD"}</Text>
                <Text style={styles.modalTitle}>{editingStaff ? "Edit Staff" : "Add Staff"}</Text>
              </View>
              <Pressable
                onPress={() => setFormVisible(false)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={24} color={colors.ink} />
              </Pressable>
            </View>
            <ScrollView
              contentContainerStyle={styles.formFields}
              keyboardShouldPersistTaps="handled"
            >
              {teacherFieldGroups.map((group) => (
                <View key={group.title} style={styles.formGroup}>
                  <Text style={styles.formSectionTitle}>{group.title}</Text>
                  {group.fields.map((field) => (
                    <View key={field.key} style={styles.formField}>
                      <Text style={styles.formLabel}>{field.label}</Text>
                      {field.key === "contact" ? (
                        <View style={styles.phoneInputWrap}>
                          <View style={styles.phonePrefix}>
                            <Text style={styles.phoneCountry}>IN</Text>
                            <Text style={styles.phoneCode}>+91</Text>
                          </View>
                          <Input
                            value={form.contact}
                            onChangeText={(value) =>
                              setForm((current) => ({
                                ...current,
                                contact: value.replace(/\D/g, "").slice(0, 10),
                              }))
                            }
                            keyboardType="number-pad"
                            maxLength={10}
                            placeholder={staffPlaceholders.contact}
                            style={styles.phoneNumberInput}
                          />
                        </View>
                      ) : (
                        <Input
                          value={form[field.key]}
                          onChangeText={(value) =>
                            setForm((current) => ({
                              ...current,
                              [field.key]: value,
                            }))
                          }
                          autoCapitalize={
                            field.key === "email" ? "none" : "words"
                          }
                          keyboardType={
                            field.key === "email"
                              ? "email-address"
                              : field.key === "salary"
                                ? "decimal-pad"
                                : "default"
                          }
                          multiline={field.key === "address"}
                          placeholder={staffPlaceholders[field.key]}
                          style={
                            field.key === "address"
                              ? styles.addressInput
                              : undefined
                          }
                        />
                      )}
                    </View>
                  ))}
                  {group.title === "ROLE & EMPLOYMENT" && (
                    <>
                      <View style={styles.formField}>
                        <Text style={styles.formLabel}>Role *</Text>
                        <View style={styles.choiceRow}>
                          {STAFF_ROLES.map((role) => (
                            <Pressable
                              key={role}
                              onPress={() =>
                                setForm((current) => ({ ...current, role }))
                              }
                              style={[
                                styles.choiceChip,
                                form.role === role && styles.choiceChipActive,
                              ]}
                              accessibilityRole="button"
                              accessibilityState={{
                                selected: form.role === role,
                              }}
                            >
                              <Text
                                style={[
                                  styles.choiceText,
                                  form.role === role && styles.choiceTextActive,
                                ]}
                              >
                                {roleLabels[role]}
                              </Text>
                            </Pressable>
                          ))}
                        </View>
                      </View>
                      <View style={styles.formField}>
                        <Text style={styles.formLabel}>Status</Text>
                        <View style={styles.choiceRow}>
                          {(["Active", "Inactive", "Resigned"] as const).map(
                            (status) => (
                              <Pressable
                                key={status}
                                onPress={() =>
                                  setForm((current) => ({ ...current, status }))
                                }
                                style={[
                                  styles.choiceChip,
                                  form.status === status &&
                                    styles.choiceChipActive,
                                ]}
                                accessibilityRole="button"
                                accessibilityState={{
                                  selected: form.status === status,
                                }}
                              >
                                <Text
                                  style={[
                                    styles.choiceText,
                                    form.status === status &&
                                      styles.choiceTextActive,
                                  ]}
                                >
                                  {status}
                                </Text>
                              </Pressable>
                            ),
                          )}
                        </View>
                      </View>
                      {form.role === "teacher" && (
                        <View style={styles.teacherSubjects}>
                          <Text style={styles.formSectionTitle}>
                            TEACHING SCOPE
                          </Text>
                          <View style={styles.formField}>
                            <Text style={styles.formLabel}>
                              Subjects (comma separated)
                            </Text>
                            <Input
                              value={form.subjects}
                              onChangeText={(subjects) =>
                                setForm((current) => ({ ...current, subjects }))
                              }
                              placeholder="Mathematics, Physics"
                            />
                          </View>
                        </View>
                      )}
                    </>
                  )}
                </View>
              ))}
            </ScrollView>
            <View style={styles.modalFooter}>
              <Button
                title="Save Staff"
                onPress={() => void saveTeacher()}
                loading={saving}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={selectedStaff !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedStaff(null)}
      >
        <View style={styles.modalRoot}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setSelectedStaff(null)}
            accessibilityLabel="Close staff profile"
          />
          {selectedStaff && (
            <View style={styles.profileSheet}>
              <View style={styles.modalHeader}>
                <View style={styles.profileHeading}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>
                      {initials(displayName(selectedStaff)) || "?"}
                    </Text>
                  </View>
                  <View style={styles.profileHeadingText}>
                    <Text style={styles.modalTitle}>
                      {displayName(selectedStaff)}
                    </Text>
                    <Text style={styles.profileSubtitle}>
                      {selectedStaff.designation || "Staff member"}
                    </Text>
                  </View>
                </View>
                <Pressable
                  onPress={() => setSelectedStaff(null)}
                  hitSlop={10}
                  accessibilityLabel="Close"
                >
                  <Ionicons name="close" size={24} color={colors.ink} />
                </Pressable>
              </View>
              <ScrollView contentContainerStyle={styles.profileFields}>
                <View style={styles.profileBadges}>
                  <Text style={styles.roleBadge}>
                    {roleLabels[selectedStaff.role || ""] ||
                      selectedStaff.role ||
                      "Staff"}
                  </Text>
                  <Text
                    style={
                      selectedStaff.profileStatus === "complete"
                        ? styles.profileBadge
                        : styles.incompleteBadge
                    }
                  >
                    {selectedStaff.profileStatus === "complete"
                      ? "Profile complete"
                      : "Profile incomplete"}
                  </Text>
                  <Text
                    style={[
                      styles.statusPillText,
                      {
                        color:
                          selectedStaff.status === "Resigned"
                            ? colors.alert
                            : selectedStaff.status === "Inactive"
                              ? colors.muted
                              : colors.success,
                      },
                    ]}
                  >
                    {selectedStaff.status || "Active"}
                  </Text>
                </View>
                <Text style={styles.profileSectionTitle}>PERSONAL DETAILS</Text>
                <ProfileValue
                  label="Employee ID"
                  value={selectedStaff.employeeId}
                />
                <ProfileValue label="Contact" value={selectedStaff.contact} />
                <ProfileValue label="Email" value={selectedStaff.email} />
                <ProfileValue label="Address" value={selectedStaff.address} />
                <ProfileValue
                  label="Date of birth"
                  value={formatDate(selectedStaff.dob)}
                />
                <ProfileValue label="Gender" value={selectedStaff.gender} />
                <Text style={styles.profileSectionTitle}>
                  ROLE & EMPLOYMENT
                </Text>
                <ProfileValue
                  label="Designation"
                  value={selectedStaff.designation}
                />
                <ProfileValue
                  label="Department"
                  value={selectedStaff.department}
                />
                <ProfileValue
                  label="Qualification"
                  value={selectedStaff.qualification}
                />
                <ProfileValue
                  label="Joining date"
                  value={formatDate(selectedStaff.joiningDate)}
                />
                <ProfileValue
                  label="Monthly salary"
                  value={
                    selectedStaff.salary == null
                      ? undefined
                      : `₹${selectedStaff.salary.toLocaleString("en-IN")}`
                  }
                />
                {selectedStaff.role === "teacher" && (
                  <>
                    <Text style={styles.profileSectionTitle}>TEACHING</Text>
                    <ProfileValue
                      label="Subjects"
                      value={selectedStaff.subjects?.join(", ")}
                    />
                  </>
                )}
                <Text style={styles.profileSectionTitle}>
                  ACCOUNT & ID CARD
                </Text>
                <ProfileValue
                  label="Account"
                  value={selectedStaff.userId ? "Linked" : "Not linked"}
                />
                <ProfileValue
                  label="ID card number"
                  value={selectedStaff.idCardNumber}
                />
                <ProfileValue
                  label="ID card issued"
                  value={formatDate(selectedStaff.idCardIssuedAt)}
                />
                {canWriteStaff && (
                  <View style={styles.profileActions}>
                    {selectedStaff.profileStatus !== "complete" && (
                      <Pressable
                        style={styles.profileActionButton}
                        onPress={() => {
                          setCompleteProfileForm({
                            dob: selectedStaff.dob
                              ? String(selectedStaff.dob).slice(0, 10)
                              : "",
                            gender: selectedStaff.gender || "",
                            contact: selectedStaff.contact || "",
                            address: selectedStaff.address || "",
                          });
                          setCompleteProfileVisible(true);
                        }}
                      >
                        <Ionicons
                          name="checkmark-circle-outline"
                          size={16}
                          color="#fff"
                        />
                        <Text style={styles.profileActionText}>
                          Complete profile
                        </Text>
                      </Pressable>
                    )}
                    {selectedStaff.profileStatus === "complete" &&
                      !selectedStaff.idCardNumber && (
                        <Pressable
                          style={styles.profileActionButton}
                          onPress={() => void issueIdCard(selectedStaff)}
                          disabled={profileActionBusy}
                        >
                          <Ionicons
                            name="card-outline"
                            size={16}
                            color="#fff"
                          />
                          <Text style={styles.profileActionText}>
                            {profileActionBusy ? "Issuing..." : "Issue ID card"}
                          </Text>
                        </Pressable>
                      )}
                    <Pressable
                      style={styles.profileActionButton}
                      onPress={() => openEditStaff(selectedStaff)}
                    >
                      <Ionicons name="create-outline" size={16} color="#fff" />
                      <Text style={styles.profileActionText}>Edit profile</Text>
                    </Pressable>
                    {selectedStaff.status !== "Resigned" && (
                      <Pressable
                        style={[
                          styles.profileActionButton,
                          styles.resignActionButton,
                        ]}
                        onPress={() => resignStaff(selectedStaff)}
                      >
                        <Ionicons
                          name="person-remove-outline"
                          size={16}
                          color={colors.alert}
                        />
                        <Text
                          style={[
                            styles.profileActionText,
                            { color: colors.alert },
                          ]}
                        >
                          Mark resigned
                        </Text>
                      </Pressable>
                    )}
                  </View>
                )}
              </ScrollView>
            </View>
          )}
        </View>
      </Modal>

      <Modal
        visible={completeProfileVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setCompleteProfileVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalRoot}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setCompleteProfileVisible(false)}
            accessibilityLabel="Close complete profile form"
          />
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalEyebrow}>STAFF PROFILE</Text>
                <Text style={styles.modalTitle}>Complete Profile</Text>
              </View>
              <Pressable
                onPress={() => setCompleteProfileVisible(false)}
                hitSlop={10}
              >
                <Ionicons name="close" size={24} color={colors.ink} />
              </Pressable>
            </View>
            <ScrollView
              contentContainerStyle={styles.formFields}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.formField}>
                <Text style={styles.formLabel}>Date of birth (YYYY-MM-DD)</Text>
                <Input
                  value={completeProfileForm.dob}
                  onChangeText={(dob) =>
                    setCompleteProfileForm((current) => ({ ...current, dob }))
                  }
                  placeholder="YYYY-MM-DD"
                />
              </View>
              <View style={styles.formField}>
                <Text style={styles.formLabel}>Gender</Text>
                <View style={styles.choiceRow}>
                  {(["Male", "Female", "Other"] as const).map((gender) => (
                    <Pressable
                      key={gender}
                      onPress={() =>
                        setCompleteProfileForm((current) => ({
                          ...current,
                          gender,
                        }))
                      }
                      style={[
                        styles.choiceChip,
                        completeProfileForm.gender === gender &&
                          styles.choiceChipActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.choiceText,
                          completeProfileForm.gender === gender &&
                            styles.choiceTextActive,
                        ]}
                      >
                        {gender}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              <View style={styles.formField}>
                <Text style={styles.formLabel}>Contact number</Text>
                <Input
                  value={completeProfileForm.contact}
                  onChangeText={(contact) =>
                    setCompleteProfileForm((current) => ({
                      ...current,
                      contact,
                    }))
                  }
                  keyboardType="phone-pad"
                  placeholder="+91 98765 43210"
                />
              </View>
              <View style={styles.formField}>
                <Text style={styles.formLabel}>Address</Text>
                <Input
                  value={completeProfileForm.address}
                  onChangeText={(address) =>
                    setCompleteProfileForm((current) => ({
                      ...current,
                      address,
                    }))
                  }
                  multiline
                  placeholder="Residential address"
                  style={styles.addressInput}
                />
              </View>
            </ScrollView>
            <View style={styles.modalFooter}>
              <Button
                title="Save Profile"
                onPress={() => void completeProfile()}
                loading={profileActionBusy}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function Detail({
  icon,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
}) {
  return (
    <View style={styles.detail}>
      <Ionicons name={icon} size={15} color={colors.muted} />
      <Text style={styles.detailText}>{value}</Text>
    </View>
  );
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
}

function ProfileValue({
  label,
  value,
}: {
  label: string;
  value?: string | number | null;
}) {
  return (
    <View style={styles.profileValueRow}>
      <Text style={styles.profileValueLabel}>{label}</Text>
      <Text style={styles.profileValueText}>{value || "—"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.paper,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
    backgroundColor: colors.paper,
  },
  hero: {
    backgroundColor: colors.ink,
    borderRadius: 16,
    paddingHorizontal: 17,
    paddingTop: 16,
    paddingBottom: 14,
    marginBottom: 13,
    overflow: "hidden",
  },
  eyebrow: {
    color: colors.amber,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
  },
  heroTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 6,
  },
  title: {
    color: "#fff",
    fontSize: 21,
    lineHeight: 27,
    fontWeight: "800",
    flex: 1,
  },
  subtitle: { color: "#D8DEEA", fontSize: 12, marginTop: 4 },
  heroFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 13,
  },
  heroDivider: {
    width: 24,
    height: 2,
    backgroundColor: colors.amber,
    borderRadius: 1,
  },
  heroMeta: { color: "#E6EAF0", fontSize: 11, fontWeight: "600" },
  heroDot: { color: colors.amber, fontWeight: "900" },
  addButton: {
    backgroundColor: colors.amber,
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  addButtonText: { color: colors.ink, fontSize: 11, fontWeight: "800" },
  pressed: { opacity: 0.78 },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 11,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  search: {
    flex: 1,
    backgroundColor: "transparent",
    borderWidth: 0,
    paddingHorizontal: 0,
    paddingVertical: 11,
  },
  filterSection: { marginBottom: 5 },
  filterHeading: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.8,
    marginBottom: 7,
  },
  filters: { gap: 7, paddingBottom: 9 },
  filterChip: {
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  filterChipActive: { borderColor: colors.ink, backgroundColor: colors.ink },
  filterText: { color: colors.muted, fontSize: 11, fontWeight: "700" },
  filterTextActive: { color: "#fff" },
  filterCount: { color: colors.amberDark, fontWeight: "800" },
  filterCountActive: { color: colors.amber },
  statusFilters: { gap: 6, paddingBottom: 8 },
  statusChip: {
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: 14,
    backgroundColor: "#EAE7DF",
  },
  statusChipActive: { backgroundColor: "#F2D7AE" },
  statusText: { color: colors.muted, fontSize: 10, fontWeight: "700" },
  statusTextActive: { color: colors.ink },
  resultSummary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 8,
    paddingBottom: 9,
  },
  resultLabel: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.9,
  },
  resultCount: { color: colors.muted, fontSize: 11, fontWeight: "600" },
  statsRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  statCell: {
    flex: 1,
    minWidth: 0,
    backgroundColor: colors.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 9,
    paddingHorizontal: 8,
  },
  statValue: { color: colors.ink, fontSize: 17, fontWeight: "800" },
  statLabel: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: "700",
    marginTop: 3,
  },
  listContent: { paddingBottom: 24, flexGrow: 1 },
  staffCard: { padding: 14, gap: 9, borderRadius: 14 },
  cardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 2,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: "#F8E8CB",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: colors.amberDark, fontSize: 14, fontWeight: "800" },
  identity: { flex: 1, minWidth: 0 },
  name: { color: colors.ink, fontSize: 14, lineHeight: 19, fontWeight: "800" },
  designation: { color: colors.muted, fontSize: 11, marginTop: 2 },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 5, marginTop: 7 },
  roleBadge: {
    color: colors.info,
    backgroundColor: "#EAF0F5",
    overflow: "hidden",
    borderRadius: 9,
    paddingVertical: 3,
    paddingHorizontal: 7,
    fontSize: 9,
    fontWeight: "700",
  },
  profileBadge: {
    color: colors.success,
    backgroundColor: "#E8F3EA",
    overflow: "hidden",
    borderRadius: 9,
    paddingVertical: 3,
    paddingHorizontal: 7,
    fontSize: 9,
    fontWeight: "700",
  },
  incompleteBadge: {
    color: colors.muted,
    backgroundColor: "#EEF0F3",
    overflow: "hidden",
    borderRadius: 9,
    paddingVertical: 3,
    paddingHorizontal: 7,
    fontSize: 9,
    fontWeight: "700",
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 12,
    paddingVertical: 5,
    paddingHorizontal: 8,
    marginLeft: 2,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusPillText: { fontSize: 9, fontWeight: "800" },
  detail: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  detailText: { color: colors.text, fontSize: 11, flex: 1 },
  cardAction: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 8,
    marginTop: 2,
    gap: 4,
  },
  cardActionText: { color: colors.info, fontSize: 11, fontWeight: "700" },
  editStaffButton: { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", paddingVertical: 4 },
  editStaffText: { color: colors.info, fontSize: 11, fontWeight: "700" },
  emptyTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "800",
    marginTop: 12,
  },
  emptyText: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 5,
    textAlign: "center",
  },
  errorBox: {
    backgroundColor: "#FFF1EF",
    borderColor: colors.alert,
    borderWidth: 1,
    padding: 12,
    borderRadius: 8,
    marginBottom: 10,
  },
  errorText: { color: colors.alert, fontSize: 12 },
  retryText: {
    color: colors.ink,
    fontWeight: "700",
    fontSize: 11,
    marginTop: 5,
  },
  modalRoot: { flex: 1, justifyContent: "flex-end", backgroundColor: "#0007" },
  modalSheet: {
    maxHeight: "88%",
    backgroundColor: colors.paper,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingTop: 18,
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  profileSheet: {
    maxHeight: "88%",
    backgroundColor: colors.paper,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingTop: 18,
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  profileHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    flex: 1,
  },
  profileHeadingText: { flex: 1, minWidth: 0 },
  profileSubtitle: { color: colors.muted, fontSize: 12, marginTop: 3 },
  profileFields: { paddingTop: 15, paddingBottom: 12, gap: 7 },
  profileActions: { flexDirection: "row", flexWrap: "wrap", gap: 9, marginTop: 14 },
  profileActionButton: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 9, backgroundColor: colors.ink, paddingHorizontal: 12, paddingVertical: 9 },
  profileActionText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  resignActionButton: { backgroundColor: "#FFF1EF", borderWidth: 1, borderColor: "#F2C4C0" },
  profileBadges: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    marginBottom: 5,
  },
  profileSectionTitle: {
    color: colors.amberDark,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 7,
    marginTop: 10,
  },
  profileValueRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 14,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#ECE8DF",
  },
  profileValueLabel: { color: colors.muted, fontSize: 12, flex: 0.8 },
  profileValueText: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: "600",
    flex: 1.2,
    textAlign: "right",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalEyebrow: {
    color: colors.amberDark,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  modalTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "800",
    marginTop: 3,
  },
  formFields: { paddingTop: 16, paddingBottom: 8, gap: 13 },
  formGroup: { gap: 12 },
  formSectionTitle: {
    color: colors.amberDark,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 7,
  },
  formField: { gap: 6 },
  formLabel: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  teacherSubjects: { gap: 12, paddingTop: 4 },
  phoneInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingLeft: 11,
  },
  phonePrefix: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    paddingRight: 10,
  },
  phoneCountry: { color: colors.muted, fontSize: 10, fontWeight: "800" },
  phoneCode: { color: colors.ink, fontSize: 13, fontWeight: "700" },
  phoneNumberInput: {
    flex: 1,
    backgroundColor: "transparent",
    borderWidth: 0,
  },
  addressInput: { minHeight: 72, textAlignVertical: "top" },
  choiceRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choiceChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    backgroundColor: colors.card,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  choiceChipActive: { borderColor: colors.ink, backgroundColor: colors.ink },
  choiceText: { color: colors.muted, fontSize: 11, fontWeight: "700" },
  choiceTextActive: { color: "#fff" },
  modalFooter: { paddingTop: 12 },
});
