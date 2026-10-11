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
import { Button, Card, Empty, Input } from "../components/UI";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { colors, radius } from "../theme";
import type { Branch, BranchQuota } from "../types";

type BranchForm = {
  _id?: string;
  name: string;
  code: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
};
type BranchField = keyof Omit<BranchForm, "_id">;
type BranchErrors = Partial<Record<BranchField, string>>;

const EMPTY_FORM: BranchForm = {
  name: "",
  code: "",
  phone: "",
  email: "",
  address: "",
  city: "",
  state: "",
  pincode: "",
};

const validate = (form: BranchForm): BranchErrors => {
  const errors: BranchErrors = {};
  const name = form.name.trim();
  if (!name) errors.name = "Branch name is required.";
  else if (name.length > 80) errors.name = "Branch name must be 80 characters or fewer.";

  const code = form.code.trim();
  if (code && !/^[A-Za-z0-9-]{2,20}$/.test(code)) {
    errors.code = "Use 2–20 letters, numbers or hyphens.";
  }
  const phone = form.phone.trim();
  if (phone && !/^\d{10}$/.test(phone)) {
    errors.phone = /\D/.test(phone)
      ? "Phone number must contain digits only."
      : "Phone number must be exactly 10 digits.";
  }
  const email = form.email.trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = "Enter a valid email address.";
  }
  const pincode = form.pincode.trim();
  if (pincode && !/^\d{4,10}$/.test(pincode)) {
    errors.pincode = "PIN code must contain 4–10 digits.";
  }
  return errors;
};

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={s.field}>
      <Text style={s.fieldLabel}>
        {label}
        {required ? <Text style={s.required}> *</Text> : null}
      </Text>
      {children}
      {error ? <Text style={s.fieldError}>{error}</Text> : null}
    </View>
  );
}

export default function BranchesScreen() {
  const { can } = useAuth();
  const canRead = can("branches:read");
  const canWrite = can("branches:write");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [quota, setQuota] = useState<BranchQuota | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [quotaError, setQuotaError] = useState("");
  const [form, setForm] = useState<BranchForm | null>(null);
  const [fieldErrors, setFieldErrors] = useState<BranchErrors>({});
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState("");

  const load = useCallback(async (pullToRefresh = false) => {
    if (pullToRefresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    setQuotaError("");
    try {
      const [branchResult, quotaResult] = await Promise.allSettled([
        api.branches.list("all=true"),
        api.branches.quota(),
      ]);
      if (branchResult.status === "rejected") throw branchResult.reason;
      setBranches(branchResult.value.data || []);
      if (quotaResult.status === "fulfilled") {
        setQuota(quotaResult.value.data || null);
      } else {
        setQuota(null);
        setQuotaError(
          quotaResult.reason instanceof Error
            ? `Branch plan usage is unavailable: ${quotaResult.reason.message}`
            : "Branch plan usage is unavailable.",
        );
      }
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Could not load branches.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (canRead) void load();
    else setLoading(false);
  }, [canRead, load]);

  const activeCount = branches.filter((branch) => branch.isActive).length;
  const setField = (key: BranchField, value: string) => {
    setForm((current) => (current ? { ...current, [key]: value } : current));
    setFieldErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  const openCreate = () => {
    setFieldErrors({});
    setForm({ ...EMPTY_FORM });
  };
  const openEdit = (branch: Branch) => {
    setFieldErrors({});
    setForm({
      _id: branch._id,
      name: branch.name || "",
      code: branch.code || "",
      phone: branch.phone || "",
      email: branch.email || "",
      address: branch.address || "",
      city: branch.city || "",
      state: branch.state || "",
      pincode: branch.pincode || "",
    });
  };

  const save = async () => {
    if (!form || saving) return;
    const errors = validate(form);
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      Alert.alert("Check branch details", "Please correct the highlighted fields.");
      return;
    }
    const payload = {
      name: form.name.trim(),
      code: form.code.trim() || undefined,
      phone: form.phone.trim() || undefined,
      email: form.email.trim() || undefined,
      address: form.address.trim() || undefined,
      city: form.city.trim() || undefined,
      state: form.state.trim() || undefined,
      pincode: form.pincode.trim() || undefined,
    };
    setSaving(true);
    try {
      if (form._id) await api.branches.update(form._id, payload);
      else await api.branches.create(payload);
      setForm(null);
      await load();
      Alert.alert("Saved", form._id ? "Branch updated." : "Branch created.");
    } catch (saveError) {
      Alert.alert(
        "Could not save branch",
        saveError instanceof Error ? saveError.message : "Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const setHeadOffice = async (branch: Branch) => {
    setBusyId(branch._id);
    try {
      await api.branches.setHeadOffice(branch._id);
      await load();
      Alert.alert("Head office updated", `${branch.name} is now the head office.`);
    } catch (actionError) {
      Alert.alert(
        "Could not update head office",
        actionError instanceof Error ? actionError.message : "Please try again.",
      );
    } finally {
      setBusyId("");
    }
  };

  const remove = (branch: Branch) => {
    if (activeCount <= 1) {
      Alert.alert("Cannot delete branch", "A school must keep at least one active branch.");
      return;
    }
    if (branch.isHeadOffice) {
      Alert.alert(
        "Head office required",
        "Make another branch the head office before deleting this one.",
      );
      return;
    }
    Alert.alert(
      `Delete ${branch.name}?`,
      "The branch will be archived and can no longer be selected. Its students and staff records will be kept.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void (async () => {
              setBusyId(branch._id);
              try {
                await api.branches.remove(branch._id);
                await load();
                Alert.alert("Branch deleted", `${branch.name} was archived.`);
              } catch (deleteError) {
                Alert.alert(
                  "Could not delete branch",
                  deleteError instanceof Error
                    ? deleteError.message
                    : "Please try again.",
                );
              } finally {
                setBusyId("");
              }
            })();
          },
        },
      ],
    );
  };

  if (!canRead) {
    return (
      <View style={s.root}>
        <Empty text="You do not have access to branch management." />
      </View>
    );
  }

  return (
    <View style={s.root}>
      <ScrollView
        contentContainerStyle={s.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />
        }
        keyboardShouldPersistTaps="handled"
      >
        <View style={s.heading}>
          <View style={s.headingIcon}>
            <Ionicons name="business-outline" size={23} color={colors.ink} />
          </View>
          <View style={s.headingText}>
            <Text style={s.eyebrow}>SCHOOL SETUP</Text>
            <Text style={s.title}>Branches</Text>
          </View>
          {canWrite ? (
            <Pressable
              style={s.addButton}
              onPress={openCreate}
              accessibilityRole="button"
              accessibilityLabel="Add branch"
            >
              <Ionicons name="add" size={22} color="#fff" />
            </Pressable>
          ) : null}
        </View>
        <Text style={s.subtitle}>
          Manage your school campuses. Branch selection controls the campus data you work with.
        </Text>

        {quota ? (
          <Card style={s.quotaCard}>
            <View style={s.quotaIcon}>
              <Ionicons name="layers-outline" size={19} color={colors.info} />
            </View>
            <View style={s.quotaCopy}>
              <Text style={s.quotaTitle}>Branch plan usage</Text>
              <Text style={s.quotaDetail}>
                {quota.limit === null
                  ? `${quota.used} branch${quota.used === 1 ? "" : "es"} on an unlimited plan`
                  : `${quota.used} of ${quota.limit} branches used`}
              </Text>
            </View>
            {quota.limit !== null ? (
              <Text style={s.quotaRemaining}>{quota.remaining} left</Text>
            ) : null}
          </Card>
        ) : null}
        {quotaError ? <Text style={s.quotaError}>{quotaError}</Text> : null}

        {loading ? (
          <ActivityIndicator color={colors.ink} style={s.loader} />
        ) : error ? (
          <Card style={s.errorCard}>
            <Text style={s.errorText}>{error}</Text>
            <Button title="Retry" variant="ghost" onPress={() => void load()} />
          </Card>
        ) : branches.length === 0 ? (
          <Card>
            <Empty text="No branches yet. Add your first campus to get started." />
          </Card>
        ) : (
          <View style={s.branchList}>
            <Text style={s.listSummary}>
              {activeCount} active · {branches.length} total
            </Text>
            {branches.map((branch) => {
              const location = [
                branch.address,
                branch.city,
                branch.state,
                branch.pincode,
              ]
                .filter(Boolean)
                .join(", ");
              const busy = busyId === branch._id;
              return (
                <Card key={branch._id} style={s.branchCard}>
                  <View style={s.branchHeading}>
                    <View style={s.branchIcon}>
                      <Ionicons name="business" size={19} color={colors.info} />
                    </View>
                    <View style={s.branchTitleGroup}>
                      <Text style={s.branchName}>{branch.name}</Text>
                      {branch.code ? (
                        <Text style={s.branchCode}>{branch.code}</Text>
                      ) : null}
                    </View>
                    {branch.isHeadOffice ? (
                      <View style={s.headBadge}>
                        <Ionicons name="star" size={12} color={colors.success} />
                        <Text style={s.headBadgeText}>Head office</Text>
                      </View>
                    ) : !branch.isActive ? (
                      <View style={s.inactiveBadge}>
                        <Text style={s.inactiveText}>Inactive</Text>
                      </View>
                    ) : null}
                  </View>
                  {location ? (
                    <View style={s.infoRow}>
                      <Ionicons name="location-outline" size={15} color={colors.muted} />
                      <Text style={s.infoText}>{location}</Text>
                    </View>
                  ) : null}
                  {branch.phone ? (
                    <View style={s.infoRow}>
                      <Ionicons name="call-outline" size={15} color={colors.muted} />
                      <Text style={s.infoText}>{branch.phone}</Text>
                    </View>
                  ) : null}
                  {branch.email ? (
                    <View style={s.infoRow}>
                      <Ionicons name="mail-outline" size={15} color={colors.muted} />
                      <Text style={s.infoText}>{branch.email}</Text>
                    </View>
                  ) : null}
                  {canWrite ? (
                    <View style={s.actions}>
                      <Pressable
                        style={s.actionButton}
                        onPress={() => openEdit(branch)}
                        disabled={busy}
                        accessibilityRole="button"
                      >
                        <Ionicons name="create-outline" size={16} color={colors.ink} />
                        <Text style={s.actionText}>Edit</Text>
                      </Pressable>
                      {!branch.isHeadOffice && branch.isActive ? (
                        <Pressable
                          style={s.actionButton}
                          onPress={() =>
                            Alert.alert(
                              "Make head office?",
                              `${branch.name} will replace the current head office.`,
                              [
                                { text: "Cancel", style: "cancel" },
                                {
                                  text: "Continue",
                                  onPress: () => void setHeadOffice(branch),
                                },
                              ],
                            )
                          }
                          disabled={busy}
                          accessibilityRole="button"
                        >
                          {busy ? (
                            <ActivityIndicator size="small" color={colors.ink} />
                          ) : (
                            <Ionicons name="star-outline" size={16} color={colors.ink} />
                          )}
                          <Text style={s.actionText}>Make head office</Text>
                        </Pressable>
                      ) : null}
                      <Pressable
                        style={[s.actionButton, s.deleteAction]}
                        onPress={() => remove(branch)}
                        disabled={busy}
                        accessibilityRole="button"
                      >
                        {busy ? (
                          <ActivityIndicator size="small" color={colors.alert} />
                        ) : (
                          <Ionicons name="trash-outline" size={16} color={colors.alert} />
                        )}
                        <Text style={s.deleteText}>Delete</Text>
                      </Pressable>
                    </View>
                  ) : null}
                </Card>
              );
            })}
          </View>
        )}
      </ScrollView>

      <Modal
        visible={Boolean(form)}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => !saving && setForm(null)}
      >
        {form ? (
          <View style={s.modal}>
            <View style={s.modalHeader}>
              <View style={s.modalHeaderText}>
                <Text style={s.modalTitle}>
                  {form._id ? `Edit ${form.name || "branch"}` : "Add branch"}
                </Text>
                <Text style={s.modalSubtitle}>Add campus details below.</Text>
              </View>
              <Pressable
                onPress={() => setForm(null)}
                disabled={saving}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={23} color={colors.ink} />
              </Pressable>
            </View>
            <ScrollView
              contentContainerStyle={s.formContent}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={s.formSection}>CAMPUS</Text>
              <Field label="Name" required error={fieldErrors.name}>
                <Input
                  value={form.name}
                  onChangeText={(value) => setField("name", value)}
                  placeholder="North Campus"
                  maxLength={80}
                  editable={!saving}
                />
              </Field>
              <Field label="Code" error={fieldErrors.code}>
                <Input
                  value={form.code}
                  onChangeText={(value) => setField("code", value)}
                  placeholder="north-campus"
                  maxLength={20}
                  autoCapitalize="none"
                  editable={!saving}
                />
                <Text style={s.helperText}>
                  Optional; used by imports, exports and campus selection.
                </Text>
              </Field>
              <Text style={s.formSection}>CONTACT</Text>
              <Field label="Phone" error={fieldErrors.phone}>
                <Input
                  value={form.phone}
                  onChangeText={(value) =>
                    setField("phone", value.replace(/\D/g, "").slice(0, 10))
                  }
                  placeholder="9876543210"
                  keyboardType="phone-pad"
                  maxLength={10}
                  editable={!saving}
                />
              </Field>
              <Field label="Email" error={fieldErrors.email}>
                <Input
                  value={form.email}
                  onChangeText={(value) => setField("email", value)}
                  placeholder="campus@school.edu"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  editable={!saving}
                />
              </Field>
              <Text style={s.formSection}>LOCATION</Text>
              <Field label="Address">
                <Input
                  value={form.address}
                  onChangeText={(value) => setField("address", value)}
                  placeholder="Street, area, landmark"
                  editable={!saving}
                />
              </Field>
              <View style={s.twoColumns}>
                <View style={s.column}>
                  <Field label="City">
                    <Input
                      value={form.city}
                      onChangeText={(value) => setField("city", value)}
                      placeholder="City"
                      editable={!saving}
                    />
                  </Field>
                </View>
                <View style={s.column}>
                  <Field label="State">
                    <Input
                      value={form.state}
                      onChangeText={(value) => setField("state", value)}
                      placeholder="State"
                      editable={!saving}
                    />
                  </Field>
                </View>
              </View>
              <Field label="PIN code" error={fieldErrors.pincode}>
                <Input
                  value={form.pincode}
                  onChangeText={(value) =>
                    setField("pincode", value.replace(/\D/g, "").slice(0, 10))
                  }
                  placeholder="462001"
                  keyboardType="number-pad"
                  maxLength={10}
                  editable={!saving}
                />
              </Field>
              <Button
                title={form._id ? "Save changes" : "Create branch"}
                onPress={() => void save()}
                loading={saving}
              />
              <Button
                title="Cancel"
                variant="ghost"
                onPress={() => setForm(null)}
                disabled={saving}
              />
            </ScrollView>
          </View>
        ) : null}
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 16, paddingBottom: 32, gap: 13 },
  heading: { flexDirection: "row", alignItems: "center", gap: 11 },
  headingIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "#E9EEF8",
    alignItems: "center",
    justifyContent: "center",
  },
  headingText: { flex: 1 },
  eyebrow: { color: colors.info, fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  title: { color: colors.ink, fontSize: 23, fontWeight: "800", marginTop: 2 },
  subtitle: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  quotaCard: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12 },
  quotaIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: "#E9F1FA",
    alignItems: "center",
    justifyContent: "center",
  },
  quotaCopy: { flex: 1 },
  quotaTitle: { color: colors.ink, fontSize: 12, fontWeight: "800" },
  quotaDetail: { color: colors.muted, fontSize: 11, marginTop: 3 },
  quotaRemaining: { color: colors.info, fontSize: 11, fontWeight: "800" },
  quotaError: { color: colors.alert, fontSize: 11 },
  loader: { paddingVertical: 36 },
  errorCard: { borderColor: colors.alert, gap: 10 },
  errorText: { color: colors.alert, fontSize: 12, lineHeight: 18 },
  branchList: { gap: 10 },
  listSummary: { color: colors.muted, fontSize: 11, fontWeight: "700" },
  branchCard: { gap: 10 },
  branchHeading: { flexDirection: "row", alignItems: "center", gap: 9 },
  branchIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: "#EEF3FA",
    alignItems: "center",
    justifyContent: "center",
  },
  branchTitleGroup: { flex: 1 },
  branchName: { color: colors.ink, fontSize: 14, fontWeight: "800" },
  branchCode: {
    color: colors.muted,
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginTop: 3,
  },
  headBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: "#E9F6EF",
  },
  headBadgeText: { color: colors.success, fontSize: 9, fontWeight: "800" },
  inactiveBadge: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: "#FFF4DA",
  },
  inactiveText: { color: colors.amberDark, fontSize: 9, fontWeight: "800" },
  infoRow: { flexDirection: "row", alignItems: "flex-start", gap: 7 },
  infoText: { flex: 1, color: colors.muted, fontSize: 11, lineHeight: 16 },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: 10,
    marginTop: 2,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: "#F2F4F7",
  },
  actionText: { color: colors.ink, fontSize: 10, fontWeight: "700" },
  deleteAction: { backgroundColor: "#FCEDEA" },
  deleteText: { color: colors.alert, fontSize: 10, fontWeight: "700" },
  modal: { flex: 1, backgroundColor: colors.paper },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 15,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalHeaderText: { flex: 1 },
  modalTitle: { color: colors.ink, fontSize: 18, fontWeight: "800" },
  modalSubtitle: { color: colors.muted, fontSize: 11, marginTop: 3 },
  formContent: { padding: 16, paddingBottom: 30, gap: 13 },
  formSection: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
    marginTop: 4,
  },
  field: { gap: 5 },
  fieldLabel: { color: colors.text, fontSize: 12, fontWeight: "700" },
  required: { color: colors.alert },
  fieldError: { color: colors.alert, fontSize: 10 },
  helperText: { color: colors.muted, fontSize: 10, lineHeight: 15 },
  twoColumns: { flexDirection: "row", gap: 10 },
  column: { flex: 1 },
});
