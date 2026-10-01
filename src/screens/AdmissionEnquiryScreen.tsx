import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
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
import { Button, Card, Input, Toast } from "../components/UI";
import { colors } from "../theme";
import type { AdmissionEnquiry } from "../types";

const statuses = [
  "New",
  "Contacted",
  "Campus Visit Scheduled",
  "Admission Confirmed",
  "Declined",
];
const sources = ["Website", "Walk-in", "Referral", "Phone", "Other"];
const classes = [
  "Nursery",
  "LKG",
  "UKG",
  "Class 1",
  "Class 2",
  "Class 3",
  "Class 4",
  "Class 5",
  "Class 6",
  "Class 7",
  "Class 8",
  "Class 9",
  "Class 10",
  "Class 11",
  "Class 12",
];
const backendStatus: Record<string, string> = {
  "Admission Confirmed": "Admitted",
  Declined: "Rejected",
};
const uiStatus: Record<string, string> = {
  Admitted: "Admission Confirmed",
  Rejected: "Declined",
};

interface EnquiryForm {
  childName: string;
  parentName: string;
  classApplied: string;
  section: string;
  contact: string;
  email: string;
  source: string;
  status: string;
  followUpDate: string;
  admissionNo: string;
  notes: string;
}
type EnquiryRow = AdmissionEnquiry & { id: string; enquiryNo: string };

const blankForm = (): EnquiryForm => ({
  childName: "",
  parentName: "",
  classApplied: "Class 1",
  section: "",
  contact: "",
  email: "",
  source: "Website",
  status: "New",
  followUpDate: "",
  admissionNo: "",
  notes: "",
});

function normalize(item: AdmissionEnquiry): EnquiryRow {
  const id = item._id;
  return {
    ...item,
    id,
    enquiryNo: id
      ? `ENQ-${id
          .replace(/[^a-f0-9]/gi, "")
          .slice(-6)
          .toUpperCase()}`
      : "—",
    status: uiStatus[item.status || ""] || item.status || "New",
  };
}

export default function AdmissionEnquiryScreen() {
  const [items, setItems] = useState<EnquiryRow[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [formVisible, setFormVisible] = useState(false);
  const [editing, setEditing] = useState<EnquiryRow | null>(null);
  const [form, setForm] = useState<EnquiryForm>(blankForm());
  const [selected, setSelected] = useState<EnquiryRow | null>(null);
  const [pendingAdmissionId, setPendingAdmissionId] = useState("");
  const [needAdmissionId, setNeedAdmissionId] = useState(false);
  const [busyStatus, setBusyStatus] = useState(false);

  const load = async () => {
    setRefreshing(true);
    setError("");
    try {
      const response = await api.admissions.list();
      setItems((response.data || []).map(normalize));
    } catch (loadError) {
      setError(
        (loadError as Error).message || "Unable to load admission enquiries.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const counts = useMemo(() => {
    const values: Record<string, number> = { All: items.length };
    statuses.forEach((status) => {
      values[status] = 0;
    });
    items.forEach((item) => {
      values[item.status || "New"] = (values[item.status || "New"] || 0) + 1;
    });
    return values;
  }, [items]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      const matchesStatus =
        statusFilter === "All" || item.status === statusFilter;
      const matchesQuery =
        !needle ||
        [
          item.childName,
          item.parentName,
          item.classApplied,
          item.id,
          item.enquiryNo,
          item.admissionNo,
          item.contact,
        ].some((value) =>
          String(value || "")
            .toLowerCase()
            .includes(needle),
        );
      return matchesStatus && matchesQuery;
    });
  }, [items, query, statusFilter]);

  const openCreate = () => {
    setEditing(null);
    setForm(blankForm());
    setError("");
    setFormVisible(true);
  };

  const openEdit = (item: EnquiryRow) => {
    setEditing(item);
    setForm({
      childName: item.childName || "",
      parentName: item.parentName || "",
      classApplied: item.classApplied || "Class 1",
      section: item.section || "",
      contact: item.contact || "",
      email: item.email || "",
      source: item.source || "Other",
      status: item.status || "New",
      followUpDate: item.followUpDate
        ? String(item.followUpDate).slice(0, 10)
        : "",
      admissionNo: item.admissionNo || "",
      notes: item.notes || "",
    });
    setSelected(null);
    setError("");
    setFormVisible(true);
  };

  const setField = (key: keyof EnquiryForm, value: string) =>
    setForm((previous) => ({ ...previous, [key]: value }));

  const save = async () => {
    if (saving) return;
    if (form.childName.trim().length < 2)
      return setError("Child name must be at least 2 characters.");
    if (form.parentName.trim().length < 2)
      return setError("Parent or guardian name is required.");
    if (!form.classApplied.trim())
      return setError("Select or enter the class applied for.");
    if (!/^[+]?[0-9\s-]{10,15}$/.test(form.contact.trim()))
      return setError("Enter a valid 10–15 digit contact number.");
    if (
      form.email.trim() &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())
    )
      return setError("Enter a valid email address.");
    if (form.followUpDate && !/^\d{4}-\d{2}-\d{2}$/.test(form.followUpDate))
      return setError("Follow-up date must use YYYY-MM-DD format.");
    if (form.status === "Admission Confirmed" && !form.admissionNo.trim())
      return setError("Admission ID is required to confirm admission.");

    setSaving(true);
    setError("");
    const payload: Partial<AdmissionEnquiry> = {
      childName: form.childName.trim(),
      parentName: form.parentName.trim(),
      classApplied: form.classApplied.trim(),
      section: form.section.trim() || undefined,
      contact: form.contact.trim(),
      email: form.email.trim().toLowerCase() || undefined,
      source: form.source,
      status: backendStatus[form.status] || form.status,
      followUpDate: form.followUpDate || undefined,
      admissionNo: form.admissionNo.trim() || undefined,
      notes: form.notes.trim() || undefined,
    };
    try {
      const response = editing
        ? await api.admissions.update(editing.id, payload)
        : await api.admissions.create(payload);
      const updated = normalize(response.data);
      setItems((previous) =>
        editing
          ? previous.map((item) => (item.id === editing.id ? updated : item))
          : [updated, ...previous],
      );
      setFormVisible(false);
      setEditing(null);
      setForm(blankForm());
    } catch (saveError) {
      setError((saveError as Error).message || "Unable to save this enquiry.");
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (
    item: EnquiryRow,
    nextStatus: string,
    admissionNo?: string,
  ) => {
    if (
      nextStatus === "Admission Confirmed" &&
      !(admissionNo || item.admissionNo)
    ) {
      setSelected(item);
      setNeedAdmissionId(true);
      setError("");
      return;
    }
    setBusyStatus(true);
    setError("");
    try {
      const payload: Partial<AdmissionEnquiry> = {
        status: backendStatus[nextStatus] || nextStatus,
        ...(nextStatus === "Admission Confirmed"
          ? { admissionNo: (admissionNo || item.admissionNo || "").trim() }
          : {}),
      };
      const response = await api.admissions.update(item.id, payload);
      const updated = normalize(response.data);
      setItems((previous) =>
        previous.map((entry) => (entry.id === item.id ? updated : entry)),
      );
      setSelected(updated);
      setNeedAdmissionId(false);
      setPendingAdmissionId("");
    } catch (statusError) {
      setError(
        (statusError as Error).message || "Unable to update enquiry status.",
      );
    } finally {
      setBusyStatus(false);
    }
  };

  return (
    <View style={s.root}>
      {!!error && <Toast message={error} onDismiss={() => setError("")} />}
      <ScrollView
        contentContainerStyle={s.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={load} />
        }
        keyboardShouldPersistTaps="handled"
      >
        <View style={s.heading}>
          <View style={s.headingCopy}>
            <Text style={s.eyebrow}>ADMISSIONS & OUTREACH</Text>
            <Text style={s.title}>Admission Enquiry</Text>
            <Text style={s.subtitle}>
              Track enquiries through the admission pipeline.
            </Text>
          </View>
          <Pressable
            onPress={openCreate}
            style={s.addButton}
            accessibilityRole="button"
            accessibilityLabel="New enquiry"
          >
            <Ionicons name="add" size={21} color="#fff" />
          </Pressable>
        </View>

        <View style={s.stageGrid}>
          {statuses.map((status) => (
            <Pressable
              key={status}
              onPress={() =>
                setStatusFilter(statusFilter === status ? "All" : status)
              }
              style={[s.stageChip, statusFilter === status && s.selectedStage]}
              accessibilityRole="button"
              accessibilityState={{ selected: statusFilter === status }}
            >
              <Text
                style={[
                  s.stageCount,
                  statusFilter === status && s.selectedText,
                ]}
              >
                {counts[status] || 0}
              </Text>
              <Text
                numberOfLines={2}
                style={[
                  s.stageLabel,
                  statusFilter === status && s.selectedText,
                ]}
              >
                {status}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={s.searchBox}>
          <Ionicons name="search" size={16} color={colors.muted} />
          <Input
            placeholder="Search child, parent, class or contact"
            value={query}
            onChangeText={setQuery}
            style={s.searchInput}
            accessibilityLabel="Search enquiries"
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
          contentContainerStyle={s.statusFilters}
        >
          <FilterChip
            label={`All · ${counts.All}`}
            selected={statusFilter === "All"}
            onPress={() => setStatusFilter("All")}
          />
          {statuses.map((status) => (
            <FilterChip
              key={status}
              label={status}
              selected={statusFilter === status}
              onPress={() =>
                setStatusFilter(statusFilter === status ? "All" : status)
              }
            />
          ))}
        </ScrollView>

        <Text style={s.resultCount}>
          Showing {filtered.length} of {items.length} enquiries
        </Text>
        {loading ? (
          <ActivityIndicator size="large" color={colors.ink} style={s.loader} />
        ) : filtered.length ? (
          <View style={s.list}>
            {filtered.map((item) => (
              <Pressable
                key={item.id}
                onPress={() => {
                  setSelected(item);
                  setNeedAdmissionId(false);
                  setError("");
                }}
                accessibilityRole="button"
              >
                <Card style={s.enquiryCard}>
                  <View style={s.cardTop}>
                    <View style={s.enquiryIcon}>
                      <Ionicons
                        name="person-add"
                        size={18}
                        color={colors.ink}
                      />
                    </View>
                    <View style={s.identity}>
                      <Text style={s.childName}>{item.childName || "—"}</Text>
                      <Text style={s.parentName}>
                        {item.parentName || "Parent / guardian"}
                      </Text>
                    </View>
                    <StatusPill status={item.status || "New"} />
                  </View>
                  <View style={s.infoRow}>
                    <Info label="Enquiry" value={item.enquiryNo} />
                    <Info label="Class" value={item.classApplied || "—"} />
                    <Info
                      label="Follow-up"
                      value={formatDate(item.followUpDate)}
                    />
                  </View>
                  <View style={s.cardBottom}>
                    <Text style={s.contact}>
                      {item.contact || "No contact"}
                    </Text>
                    <Text style={s.source}>{item.source || "Other"}</Text>
                    <Text style={s.openLabel}>Details ›</Text>
                  </View>
                </Card>
              </Pressable>
            ))}
          </View>
        ) : (
          <EmptyState onAdd={openCreate} />
        )}
      </ScrollView>

      <Modal
        visible={formVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setFormVisible(false)}
      >
        <View style={s.modalRoot}>
          <View style={s.modalHeader}>
            <View style={s.headingCopy}>
              <Text style={s.eyebrow}>ADMISSIONS & OUTREACH</Text>
              <Text style={s.modalTitle}>
                {editing ? "Edit enquiry" : "New admission enquiry"}
              </Text>
            </View>
            <Pressable
              onPress={() => setFormVisible(false)}
              accessibilityRole="button"
              accessibilityLabel="Close form"
            >
              <Ionicons name="close" size={22} color={colors.muted} />
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={s.formContent}
            keyboardShouldPersistTaps="handled"
          >
            <Field
              label="Child name *"
              value={form.childName}
              onChangeText={(value) => setField("childName", value)}
              placeholder="Child's full name"
            />
            <Field
              label="Parent / guardian *"
              value={form.parentName}
              onChangeText={(value) => setField("parentName", value)}
              placeholder="Parent or guardian name"
            />
            <Field
              label="Class applied *"
              value={form.classApplied}
              onChangeText={(value) => setField("classApplied", value)}
              placeholder="Select or enter class"
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.statusFilters}
            >
              {classes.map((item) => (
                <FilterChip
                  key={item}
                  label={item}
                  selected={form.classApplied === item}
                  onPress={() => setField("classApplied", item)}
                />
              ))}
            </ScrollView>
            <View style={s.twoColumns}>
              <View style={s.column}>
                <Field
                  label="Section"
                  value={form.section}
                  onChangeText={(value) => setField("section", value)}
                  placeholder="Optional"
                />
              </View>
              <View style={s.column}>
                <Field
                  label="Contact *"
                  value={form.contact}
                  onChangeText={(value) => setField("contact", value)}
                  placeholder="Phone number"
                  keyboardType="phone-pad"
                />
              </View>
            </View>
            <Field
              label="Student email"
              value={form.email}
              onChangeText={(value) => setField("email", value)}
              placeholder="Optional"
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <Field
              label="Follow-up date (YYYY-MM-DD)"
              value={form.followUpDate}
              onChangeText={(value) => setField("followUpDate", value)}
              placeholder="Optional"
            />
            <Field
              label="Admission ID"
              value={form.admissionNo}
              onChangeText={(value) => setField("admissionNo", value)}
              placeholder="Required when confirming admission"
              autoCapitalize="characters"
            />
            <Text style={s.fieldLabel}>Source</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.statusFilters}
            >
              {sources.map((source) => (
                <FilterChip
                  key={source}
                  label={source}
                  selected={form.source === source}
                  onPress={() => setField("source", source)}
                />
              ))}
            </ScrollView>
            <Text style={s.fieldLabel}>Pipeline status</Text>
            <View style={s.statusGrid}>
              {statuses.map((status) => (
                <FilterChip
                  key={status}
                  label={status}
                  selected={form.status === status}
                  onPress={() => setField("status", status)}
                />
              ))}
            </View>
            <Field
              label="Notes"
              value={form.notes}
              onChangeText={(value) => setField("notes", value)}
              placeholder="Optional notes"
              multiline
            />
          </ScrollView>
          <View style={s.modalActions}>
            <Button
              title="Cancel"
              variant="ghost"
              onPress={() => setFormVisible(false)}
            />
            <View style={s.actionGrow}>
              <Button
                title={
                  saving
                    ? "Saving..."
                    : editing
                      ? "Save changes"
                      : "Save enquiry"
                }
                onPress={save}
                loading={saving}
              />
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!selected}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSelected(null)}
      >
        {!!selected && (
          <View style={s.modalRoot}>
            <View style={s.modalHeader}>
              <View style={s.headingCopy}>
                <Text style={s.eyebrow}>{selected.enquiryNo}</Text>
                <Text style={s.modalTitle}>
                  {selected.childName || "Enquiry details"}
                </Text>
                <Text style={s.subtitle}>
                  {selected.parentName} · {selected.contact}
                </Text>
              </View>
              <Pressable
                onPress={() => setSelected(null)}
                accessibilityRole="button"
                accessibilityLabel="Close details"
              >
                <Ionicons name="close" size={22} color={colors.muted} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={s.detailContent}>
              <Card style={s.detailCard}>
                <Info
                  label="Class applied"
                  value={`${selected.classApplied || "—"}${selected.section ? ` · Section ${selected.section}` : ""}`}
                />
                <Info label="Source" value={selected.source || "Other"} />
                <Info
                  label="Enquiry date"
                  value={formatDate(selected.createdAt)}
                />
                <Info
                  label="Follow-up"
                  value={formatDate(selected.followUpDate)}
                />
                {!!selected.email && (
                  <Info label="Email" value={selected.email} />
                )}
                {!!selected.admissionNo && (
                  <Info label="Admission ID" value={selected.admissionNo} />
                )}
                {!!selected.notes && (
                  <Info label="Notes" value={selected.notes} />
                )}
                <View style={s.currentStatus}>
                  <Text style={s.fieldLabel}>Current status</Text>
                  <StatusPill status={selected.status || "New"} />
                </View>
              </Card>
              <Text style={s.sectionTitle}>Update pipeline</Text>
              <View style={s.statusGrid}>
                {statuses
                  .filter(
                    (status) =>
                      status !== "Admission Confirmed" ||
                      selected.status === status,
                  )
                  .map((status) => (
                    <FilterChip
                      key={status}
                      label={status}
                      selected={selected.status === status}
                      onPress={() => {
                        if (status !== "Admission Confirmed")
                          void changeStatus(selected, status);
                      }}
                    />
                  ))}
                {selected.status !== "Admission Confirmed" && (
                  <FilterChip
                    label="Admission Confirmed"
                    selected={false}
                    onPress={() => {
                      setNeedAdmissionId(true);
                      setPendingAdmissionId(selected.admissionNo || "");
                    }}
                  />
                )}
              </View>
              {needAdmissionId && (
                <Card style={s.detailCard}>
                  <Field
                    label="Admission ID required to confirm"
                    value={pendingAdmissionId}
                    onChangeText={setPendingAdmissionId}
                    placeholder="Enter Admission ID"
                    autoCapitalize="characters"
                  />
                  <Button
                    title={busyStatus ? "Confirming..." : "Confirm admission"}
                    onPress={() => {
                      if (!pendingAdmissionId.trim()) {
                        setError("Admission ID is required.");
                        return;
                      }
                      void changeStatus(
                        selected,
                        "Admission Confirmed",
                        pendingAdmissionId,
                      );
                    }}
                    loading={busyStatus}
                  />
                </Card>
              )}
              <Button
                title="Edit enquiry"
                variant="ghost"
                onPress={() => openEdit(selected)}
              />
            </ScrollView>
          </View>
        )}
      </Modal>
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

function FilterChip({
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
      style={[s.filterChip, selected && s.selectedChip]}
    >
      <Text style={[s.filterText, selected && s.selectedFilterText]}>
        {label}
      </Text>
    </Pressable>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.infoItem}>
      <Text style={s.infoLabel}>{label}</Text>
      <Text style={s.infoValue}>{value || "—"}</Text>
    </View>
  );
}

function StatusPill({ status }: { status: string }) {
  const color =
    status === "Admission Confirmed"
      ? colors.success
      : status === "Declined"
        ? colors.alert
        : status === "New"
          ? colors.info
          : colors.amberDark;
  return (
    <View style={[s.pill, { backgroundColor: `${color}18` }]}>
      <Text style={[s.pillText, { color }]}>{status}</Text>
    </View>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <View style={s.emptyState}>
      <Ionicons name="people-outline" size={32} color={colors.muted} />
      <Text style={s.emptyTitle}>No enquiries found</Text>
      <Text style={s.emptyText}>Try another filter or add a new enquiry.</Text>
      <Button title="New enquiry" onPress={onAdd} />
    </View>
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
    gap: 10,
  },
  headingCopy: { flex: 1 },
  eyebrow: { color: colors.amberDark, fontSize: 9, fontWeight: "800" },
  title: { color: colors.ink, fontSize: 22, fontWeight: "800", marginTop: 4 },
  modalTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "800",
    marginTop: 4,
  },
  subtitle: { color: colors.muted, fontSize: 10, marginTop: 3 },
  addButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: colors.ink,
  },
  stageGrid: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  stageChip: {
    width: "31%",
    minHeight: 68,
    justifyContent: "center",
    gap: 4,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  selectedStage: { backgroundColor: colors.ink, borderColor: colors.ink },
  stageCount: { color: colors.ink, fontSize: 18, fontWeight: "800" },
  stageLabel: { color: colors.muted, fontSize: 9, fontWeight: "600" },
  selectedText: { color: "#fff" },
  searchBox: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
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
    paddingVertical: 6,
    backgroundColor: "transparent",
  },
  statusFilters: { flexDirection: "row", gap: 6, paddingVertical: 2 },
  filterChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 15,
    paddingHorizontal: 9,
    paddingVertical: 6,
    backgroundColor: colors.card,
  },
  selectedChip: { backgroundColor: colors.ink, borderColor: colors.ink },
  filterText: { color: colors.muted, fontSize: 9, fontWeight: "600" },
  selectedFilterText: { color: "#fff" },
  loader: { marginTop: 24 },
  resultCount: { color: colors.muted, fontSize: 9 },
  sectionTitle: { color: colors.ink, fontSize: 13, fontWeight: "800" },
  list: { gap: 8 },
  enquiryCard: { padding: 11, borderRadius: 8, gap: 9 },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 9 },
  enquiryIcon: {
    width: 35,
    height: 35,
    borderRadius: 8,
    backgroundColor: "#F8EBD4",
    alignItems: "center",
    justifyContent: "center",
  },
  identity: { flex: 1, gap: 3 },
  childName: { color: colors.ink, fontSize: 12, fontWeight: "800" },
  parentName: { color: colors.muted, fontSize: 9 },
  pill: { borderRadius: 12, paddingHorizontal: 7, paddingVertical: 4 },
  pillText: { fontSize: 8, fontWeight: "700" },
  infoRow: { flexDirection: "row", justifyContent: "space-between", gap: 6 },
  infoItem: { flex: 1, gap: 3, paddingVertical: 4 },
  infoLabel: { color: colors.muted, fontSize: 8, fontWeight: "600" },
  infoValue: { color: colors.ink, fontSize: 9, fontWeight: "700" },
  cardBottom: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 7,
  },
  contact: { color: colors.muted, flex: 1, fontSize: 9 },
  source: { color: colors.muted, fontSize: 8 },
  openLabel: { color: colors.info, fontSize: 9, fontWeight: "700" },
  empty: {
    color: colors.muted,
    textAlign: "center",
    fontSize: 11,
    paddingVertical: 22,
  },
  emptyState: { alignItems: "center", gap: 8, paddingVertical: 30 },
  emptyTitle: { color: colors.ink, fontSize: 13, fontWeight: "800" },
  emptyText: { color: colors.muted, fontSize: 10, textAlign: "center" },
  modalRoot: { flex: 1, backgroundColor: colors.paper, paddingTop: 18 },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 13,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  formContent: { padding: 16, paddingBottom: 28, gap: 13 },
  field: { gap: 5 },
  fieldLabel: { color: colors.ink, fontSize: 10, fontWeight: "700" },
  input: { minHeight: 40, borderRadius: 8, fontSize: 11, paddingVertical: 7 },
  twoColumns: { flexDirection: "row", gap: 9 },
  column: { flex: 1 },
  statusGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  modalActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  actionGrow: { flex: 1 },
  detailContent: { padding: 16, paddingBottom: 30, gap: 13 },
  detailCard: { padding: 12, borderRadius: 8 },
  currentStatus: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 7,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
