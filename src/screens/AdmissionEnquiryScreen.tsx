import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
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
const feeCategories = ["General", "OBC", "SC", "ST", "EWS"];
const stages = [
  { key: "All", label: "All leads", color: colors.info },
  { key: "New", label: "New leads", color: "#1497D4" },
  { key: "Contacted", label: "Contacted", color: colors.amberDark },
  {
    key: "Campus Visit Scheduled",
    label: "Campus visit",
    color: "#7257C8",
  },
  { key: "Admission Confirmed", label: "Confirmed", color: colors.success },
  { key: "Declined", label: "Declined", color: colors.alert },
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
  feeCategory: string;
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
  feeCategory: "General",
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
  const [page, setPage] = useState(1);
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
  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visibleItems = filtered.slice((page - 1) * pageSize, page * pageSize);

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
      feeCategory: item.feeCategory || "General",
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
      feeCategory: feeCategories.includes(form.feeCategory)
        ? form.feeCategory
        : "General",
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
      setPage(1);
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
            <Text style={s.addButtonText}>New enquiry</Text>
          </Pressable>
        </View>

        <View style={s.stageGrid}>
          {stages.map((stage) => {
            const count =
              stage.key === "All"
                ? items.length
                : counts[stage.key] || 0;
            const selectedStage = statusFilter === stage.key;
            const percent = items.length
              ? Math.round((count / items.length) * 100)
              : 0;
            return (
              <Pressable
                key={stage.key}
                onPress={() => {
                  setStatusFilter(
                    selectedStage && stage.key !== "All" ? "All" : stage.key,
                  );
                  setPage(1);
                }}
                style={[s.stageCard, selectedStage && s.selectedStage]}
                accessibilityRole="button"
                accessibilityState={{ selected: selectedStage }}
              >
                <View style={s.stageTop}>
                  <Text
                    numberOfLines={1}
                    style={[s.stageLabel, selectedStage && s.selectedText]}
                  >
                    {stage.label}
                  </Text>
                  <View
                    style={[s.stageDot, { backgroundColor: stage.color }]}
                  />
                </View>
                <Text style={[s.stageCount, selectedStage && s.selectedText]}>
                  {count}
                </Text>
                <View style={s.stageProgressTrack}>
                  <View
                    style={[
                      s.stageProgressFill,
                      { width: `${percent}%`, backgroundColor: stage.color },
                    ]}
                  />
                </View>
                <Text
                  style={[s.stagePercent, selectedStage && s.selectedSubText]}
                >
                  {percent}% of leads
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={s.searchBox}>
          <Ionicons name="search" size={16} color={colors.muted} />
          <Input
            placeholder="Search child, parent, class or contact"
            value={query}
            onChangeText={(value) => {
              setQuery(value);
              setPage(1);
            }}
            style={s.searchInput}
            accessibilityLabel="Search enquiries"
          />
          {!!query && (
            <Pressable
              onPress={() => {
                setQuery("");
                setPage(1);
              }}
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
            onPress={() => {
              setStatusFilter("All");
              setPage(1);
            }}
          />
          {statuses.map((status) => (
            <FilterChip
              key={status}
              label={status}
              selected={statusFilter === status}
              onPress={() => {
                setStatusFilter(statusFilter === status ? "All" : status);
                setPage(1);
              }}
            />
          ))}
        </ScrollView>

        <Text style={s.resultCount}>
          Showing {filtered.length ? (page - 1) * pageSize + 1 : 0}–
          {Math.min(page * pageSize, filtered.length)} of {filtered.length}{" "}
          enquiries
        </Text>
        {loading ? (
          <ActivityIndicator size="large" color={colors.ink} style={s.loader} />
        ) : filtered.length ? (
          <View style={s.list}>
            {visibleItems.map((item) => (
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
                  <View style={s.categoryRow}>
                    <Ionicons
                      name="pricetag-outline"
                      size={12}
                      color={colors.amberDark}
                    />
                    <Text style={s.categoryLabel}>Category</Text>
                    <Text
                      style={[
                        s.categoryValue,
                        (item.feeCategory || "General") !== "General" &&
                          s.categoryValueSpecial,
                      ]}
                    >
                      {item.feeCategory || "General"}
                    </Text>
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
        {!loading && filtered.length > pageSize && (
          <View style={s.pagination}>
            <Text style={s.paginationInfo}>
              Page {page} of {pageCount}
            </Text>
            <View style={s.paginationActions}>
              <Pressable
                onPress={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page <= 1}
                style={[s.pageButton, page <= 1 && s.pageButtonDisabled]}
                accessibilityRole="button"
                accessibilityLabel="Previous page"
              >
                <Ionicons name="chevron-back" size={16} color={colors.ink} />
              </Pressable>
              <Pressable
                onPress={() =>
                  setPage((current) => Math.min(pageCount, current + 1))
                }
                disabled={page >= pageCount}
                style={[s.pageButton, page >= pageCount && s.pageButtonDisabled]}
                accessibilityRole="button"
                accessibilityLabel="Next page"
              >
                <Ionicons name="chevron-forward" size={16} color={colors.ink} />
              </Pressable>
            </View>
          </View>
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
            <Text style={s.fieldLabel}>Fee category</Text>
            <Text style={s.fieldHint}>
              Carried into student onboarding for fee concessions.
            </Text>
            <View style={s.categoryOptions}>
              {feeCategories.map((category) => (
                <FilterChip
                  key={category}
                  label={category}
                  selected={form.feeCategory === category}
                  onPress={() => setField("feeCategory", category)}
                />
              ))}
            </View>
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
                  label="Fee category"
                  value={selected.feeCategory || "General"}
                />
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
              <View style={s.pipelineHeading}>
                <Text style={s.sectionTitle}>
                  {selected.status === "Admission Confirmed"
                    ? "Pipeline completed"
                    : "Update pipeline"}
                </Text>
                {busyStatus && (
                  <ActivityIndicator size="small" color={colors.info} />
                )}
              </View>
              <View style={s.pipeline}>
                {statuses
                  .filter((status) => status !== "Declined")
                  .map((status, index) => {
                    const currentIndex = statuses
                      .filter((stage) => stage !== "Declined")
                      .indexOf(selected.status || "New");
                    const isCurrent = selected.status === status;
                    const isComplete =
                      currentIndex >= 0 && index < currentIndex;
                    const color =
                      status === "Admission Confirmed"
                        ? colors.success
                        : status === "Campus Visit Scheduled"
                          ? "#7257C8"
                          : status === "Contacted"
                            ? colors.amberDark
                            : colors.info;
                    return (
                      <Pressable
                        key={status}
                        disabled={
                          busyStatus ||
                          selected.status === "Admission Confirmed"
                        }
                        onPress={() => void changeStatus(selected, status)}
                        style={[
                          s.pipelineStep,
                          isCurrent && s.pipelineStepCurrent,
                        ]}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isCurrent }}
                      >
                        <View
                          style={[
                            s.pipelineNumber,
                            (isComplete || isCurrent) && {
                              backgroundColor: color,
                              borderColor: color,
                            },
                          ]}
                        >
                          <Ionicons
                            name={
                              isComplete ? "checkmark" : "ellipse"
                            }
                            size={isComplete ? 14 : 8}
                            color={
                              isComplete || isCurrent
                                ? "#fff"
                                : colors.muted
                            }
                          />
                        </View>
                        <Text
                          style={[
                            s.pipelineLabel,
                            isCurrent && s.pipelineLabelCurrent,
                          ]}
                        >
                          {status}
                        </Text>
                        {isCurrent && (
                          <View style={s.currentTag}>
                            <Text style={s.currentTagText}>CURRENT</Text>
                          </View>
                        )}
                      </Pressable>
                    );
                  })}
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
              {selected.status !== "Declined" &&
                selected.status !== "Admission Confirmed" && (
                  <Pressable
                    onPress={() => void changeStatus(selected, "Declined")}
                    disabled={busyStatus}
                    style={s.declineButton}
                    accessibilityRole="button"
                  >
                    <Ionicons
                      name="close-circle-outline"
                      size={16}
                      color={colors.alert}
                    />
                    <Text style={s.declineText}>Mark as declined</Text>
                  </Pressable>
                )}
              <View style={s.detailActions}>
                {!!selected.contact && (
                  <Pressable
                    onPress={() => {
                      void Linking.openURL(`tel:${selected.contact}`).catch(
                        (linkError: Error) =>
                          setError(
                            linkError.message || "Unable to open phone dialer.",
                          ),
                      );
                    }}
                    style={s.callButton}
                    accessibilityRole="button"
                    accessibilityLabel={`Call ${selected.parentName || "parent"}`}
                  >
                    <Ionicons name="call-outline" size={17} color={colors.info} />
                  </Pressable>
                )}
                {selected.status !== "Admission Confirmed" && (
                  <View style={s.actionGrow}>
                    <Button
                      title="Edit enquiry"
                      variant="ghost"
                      onPress={() => openEdit(selected)}
                    />
                  </View>
                )}
              </View>
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
    minHeight: 40,
    flexDirection: "row",
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: 11,
    borderRadius: 12,
    backgroundColor: colors.ink,
  },
  addButtonText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  stageGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  stageCard: {
    width: "48%",
    minHeight: 96,
    justifyContent: "center",
    gap: 5,
    padding: 11,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  selectedStage: { backgroundColor: colors.ink, borderColor: colors.ink },
  stageTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 5,
  },
  stageDot: { width: 7, height: 7, borderRadius: 4 },
  stageCount: { color: colors.ink, fontSize: 22, fontWeight: "800" },
  stageLabel: {
    flex: 1,
    color: colors.muted,
    fontSize: 9,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  selectedText: { color: "#fff" },
  selectedSubText: { color: "rgba(255,255,255,0.65)" },
  stageProgressTrack: {
    height: 4,
    overflow: "hidden",
    borderRadius: 3,
    backgroundColor: "#EEF0F3",
  },
  stageProgressFill: { height: "100%", borderRadius: 3 },
  stagePercent: { color: colors.muted, fontSize: 8 },
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
  pagination: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 4,
  },
  paginationInfo: { color: colors.muted, fontSize: 10, fontWeight: "600" },
  paginationActions: { flexDirection: "row", gap: 8 },
  pageButton: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  pageButtonDisabled: { opacity: 0.4 },
  sectionTitle: { color: colors.ink, fontSize: 13, fontWeight: "800" },
  list: { gap: 8 },
  enquiryCard: { padding: 13, borderRadius: 15, gap: 9 },
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
  categoryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  categoryLabel: { color: colors.muted, fontSize: 9 },
  categoryValue: {
    color: colors.muted,
    fontSize: 8,
    fontWeight: "700",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: "#F1F2F4",
  },
  categoryValueSpecial: {
    color: colors.amberDark,
    backgroundColor: "#FFF4D9",
  },
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
  fieldHint: { color: colors.muted, fontSize: 9, marginTop: -8 },
  input: { minHeight: 40, borderRadius: 8, fontSize: 11, paddingVertical: 7 },
  twoColumns: { flexDirection: "row", gap: 9 },
  column: { flex: 1 },
  statusGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  categoryOptions: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
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
  detailCard: { padding: 14, borderRadius: 14 },
  pipelineHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  pipeline: { gap: 4 },
  pipelineStep: {
    minHeight: 43,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 10,
    borderRadius: 11,
  },
  pipelineStepCurrent: { backgroundColor: "#F0F3FA" },
  pipelineNumber: {
    width: 23,
    height: 23,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: "#fff",
  },
  pipelineLabel: { flex: 1, color: colors.muted, fontSize: 11, fontWeight: "600" },
  pipelineLabelCurrent: { color: colors.ink, fontWeight: "800" },
  currentTag: {
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 9,
    backgroundColor: "#E5ECFA",
  },
  currentTagText: { color: colors.info, fontSize: 8, fontWeight: "800" },
  declineButton: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#F1D4D0",
    backgroundColor: "#FFF8F7",
  },
  declineText: { color: colors.alert, fontSize: 11, fontWeight: "700" },
  detailActions: { flexDirection: "row", alignItems: "center", gap: 9 },
  callButton: {
    width: 46,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
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
