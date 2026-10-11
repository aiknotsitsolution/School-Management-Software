import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
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
import { get, send } from "../lib/api";
import { extractList, Row } from "../lib/format";
import { colors } from "../theme";

type GradeBand = { grade: string; minPct: number | string };
type GradingScale = Row & {
  _id: string;
  name: string;
  system: "default" | "cbse" | "icse" | "custom";
  bands: GradeBand[];
  passPct: number;
  isDefault: boolean;
  active: boolean;
};
type FormBand = { grade: string; minPct: string };
type ScaleForm = { name: string; passPct: string; bands: FormBand[] };

const TEMPLATE_BANDS: FormBand[] = [
  { grade: "A+", minPct: "90" },
  { grade: "A", minPct: "80" },
  { grade: "B+", minPct: "70" },
  { grade: "B", minPct: "60" },
  { grade: "C", minPct: "50" },
  { grade: "D", minPct: "33" },
  { grade: "F", minPct: "0" },
];
const EMPTY_FORM = (): ScaleForm => ({
  name: "",
  passPct: "33",
  bands: TEMPLATE_BANDS.map((band) => ({ ...band })),
});
const SYSTEM_LABELS: Record<string, string> = {
  default: "Default",
  cbse: "CBSE",
  icse: "ICSE",
  custom: "Custom",
};

const bandChipLabel = (bands: GradeBand[], index: number) => {
  const band = bands[index];
  const upper = index === 0 ? 100 : Number(bands[index - 1].minPct);
  const minimum = Number(band.minPct);
  return `${band.grade} ${minimum}${minimum === upper ? "" : `–${upper}` }%`;
};

function validateForm(form: ScaleForm): string {
  if (!form.name.trim()) return "Scale name is required.";
  const passPct = Number(form.passPct);
  if (!Number.isFinite(passPct) || passPct < 0 || passPct > 100) {
    return "Pass % must be between 0 and 100.";
  }
  if (!form.bands.length) return "At least one grade band is required.";
  if (form.bands.length > 12) return "A scale can have at most 12 grade bands.";
  for (let index = 0; index < form.bands.length; index += 1) {
    const band = form.bands[index];
    if (!band.grade.trim()) return `Band ${index + 1} needs a grade label.`;
    if (band.grade.trim().length > 12) {
      return `Grade label in band ${index + 1} is too long (max 12 characters).`;
    }
    const minimum = Number(band.minPct);
    if (!Number.isFinite(minimum) || minimum < 0 || minimum > 100) {
      return `Band ${index + 1}: min % must be between 0 and 100.`;
    }
    if (
      index > 0 &&
      !(minimum < Number(form.bands[index - 1].minPct))
    ) {
      return "Bands must be in descending order with no duplicate thresholds.";
    }
  }
  if (Number(form.bands[form.bands.length - 1].minPct) !== 0) {
    return "The lowest band must start at 0%.";
  }
  return "";
}

function formFromScale(scale: GradingScale): ScaleForm {
  return {
    name: scale.name || "",
    passPct: String(scale.passPct ?? 33),
    bands: (scale.bands ?? []).map((band) => ({
      grade: String(band.grade ?? ""),
      minPct: String(band.minPct ?? ""),
    })),
  };
}

export default function GradingScalesScreen() {
  const { can } = useAuth();
  const canWrite = can("exams:write");
  const [scales, setScales] = useState<GradingScale[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [form, setForm] = useState<ScaleForm>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setLoadError("");
    try {
      const response = await get<GradingScale[]>("/grading-scales");
      setScales(extractList(response.data) as GradingScale[]);
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Could not load grading scales.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const activeScale = useMemo(
    () => scales.find((scale) => scale.isDefault),
    [scales],
  );

  const openCreate = () => {
    setEditingId("");
    setForm(EMPTY_FORM());
    setModalVisible(true);
  };

  const openEdit = (scale: GradingScale) => {
    setEditingId(scale._id);
    setForm(formFromScale(scale));
    setModalVisible(true);
  };

  const updateBand = (index: number, field: keyof FormBand, value: string) => {
    setForm((current) => ({
      ...current,
      bands: current.bands.map((band, bandIndex) =>
        bandIndex === index ? { ...band, [field]: value } : band,
      ),
    }));
  };

  const addBand = () => {
    setForm((current) => {
      if (current.bands.length >= 12) return current;
      const thresholds = current.bands.map((band) => Number(band.minPct));
      const gaps = thresholds.map((lower, index) => {
        const upper = index === 0 ? 100 : thresholds[index - 1];
        return { index, upper, lower, width: upper - lower };
      });
      const gap = gaps
        .filter((item) => Number.isInteger(item.upper) && Number.isInteger(item.lower) && item.width > 1)
        .sort((a, b) => b.width - a.width)[0];
      if (!gap) {
        Alert.alert("Cannot add a band", "There is no whole-number percentage gap left between the current bands.");
        return current;
      }
      const minPct = String(Math.floor((gap.upper + gap.lower) / 2));
      const bands = [...current.bands];
      bands.splice(gap.index, 0, { grade: "", minPct });
      return { ...current, bands };
    });
  };

  const removeBand = (index: number) => {
    if (form.bands.length <= 1) {
      Alert.alert("At least one band is required", "A grading scale must have at least one grade band.");
      return;
    }
    setForm((current) => ({
      ...current,
      bands: current.bands.filter((_, bandIndex) => bandIndex !== index),
    }));
  };

  const save = async () => {
    const validation = validateForm(form);
    if (validation) {
      Alert.alert("Check grading scale", validation);
      return;
    }
    const payload = {
      name: form.name.trim(),
      passPct: Number(form.passPct),
      bands: form.bands.map((band) => ({
        grade: band.grade.trim(),
        minPct: Number(band.minPct),
      })),
    };
    setBusy(true);
    try {
      if (editingId) {
        await send(`/grading-scales/${encodeURIComponent(editingId)}`, "PATCH", payload);
      } else {
        await send("/grading-scales", "POST", payload);
      }
      setModalVisible(false);
      await load(true);
      Alert.alert("Saved", editingId ? "Grading scale updated." : "Grading scale created.");
    } catch (error) {
      Alert.alert(
        "Could not save grading scale",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  const activate = (scale: GradingScale) => {
    Alert.alert(
      scale.active ? "Activate grading scale?" : "Restore and activate scale?",
      scale.active
        ? `Make "${scale.name}" the active grading scale? New and re-entered marks will use its grade bands and pass percentage. Existing marks keep the saved grade.`
        : `Restore "${scale.name}" and make it the active grading scale? New and re-entered marks will use its grade bands and pass percentage. Existing marks keep the saved grade.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Activate",
          onPress: () => {
            void (async () => {
              setBusy(true);
              try {
                if (!scale.active) {
                  await send(
                    `/grading-scales/${encodeURIComponent(scale._id)}`,
                    "PATCH",
                    { active: true },
                  );
                }
                await send(`/grading-scales/${encodeURIComponent(scale._id)}/activate`, "POST", {});
                await load(true);
                Alert.alert("Activated", `${scale.name} is now the active grading scale.`);
              } catch (error) {
                Alert.alert(
                  "Could not activate scale",
                  error instanceof Error ? error.message : "Please try again.",
                );
              } finally {
                setBusy(false);
              }
            })();
          },
        },
      ],
    );
  };

  const remove = (scale: GradingScale) => {
    Alert.alert(
      "Delete grading scale?",
      `Delete "${scale.name}"? The active scale cannot be deleted.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void (async () => {
              setBusy(true);
              try {
                await send(`/grading-scales/${encodeURIComponent(scale._id)}`, "DELETE");
                await load(true);
                Alert.alert("Deleted", "Grading scale removed.");
              } catch (error) {
                Alert.alert(
                  "Could not delete scale",
                  error instanceof Error ? error.message : "Please try again.",
                );
              } finally {
                setBusy(false);
              }
            })();
          },
        },
      ],
    );
  };

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load(true)}
            tintColor={colors.ink}
          />
        }
      >
        <View style={styles.heading}>
          <Text style={styles.eyebrow}>EXAMINATION</Text>
          <Text style={styles.title}>Grading Scales</Text>
          <Text style={styles.subtitle}>
            Define how marks convert to grades and pass/fail. One scale is active per school.
            New and re-entered marks use the active scale; existing marks keep their saved grade.
          </Text>
        </View>

        {activeScale && (
          <Card style={styles.activeCard}>
            <View style={styles.activeIcon}>
              <Ionicons name="checkmark-circle" size={23} color={colors.success} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.activeLabel}>ACTIVE GRADING SCALE</Text>
              <Text style={styles.activeName}>{activeScale.name}</Text>
              <Text style={styles.subtitle}>
                Pass mark: {activeScale.passPct}% · {activeScale.bands?.length ?? 0} grade bands
              </Text>
            </View>
          </Card>
        )}

        <View style={styles.listHeading}>
          <View>
            <Text style={styles.listTitle}>Scales</Text>
            <Text style={styles.subtitle}>{scales.length} configured</Text>
          </View>
          {canWrite && (
            <Pressable onPress={openCreate} style={styles.newButton} accessibilityRole="button">
              <Ionicons name="add" size={19} color="#fff" />
              <Text style={styles.newButtonText}>New scale</Text>
            </Pressable>
          )}
        </View>

        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color={colors.ink} />
            <Text style={styles.subtitle}>Loading grading scales…</Text>
          </View>
        ) : loadError ? (
          <Card>
            <Text style={styles.error}>{loadError}</Text>
            <Button title="Try again" onPress={() => void load()} />
          </Card>
        ) : scales.length === 0 ? (
          <Card style={styles.emptyCard}>
            <Empty text="No grading scales yet. Default, CBSE and ICSE presets are seeded automatically." />
            {canWrite && (
              <Pressable onPress={openCreate} style={styles.emptyAction}>
                <Text style={styles.emptyActionText}>Create a custom scale</Text>
              </Pressable>
            )}
          </Card>
        ) : (
          scales.map((scale) => (
            <Card key={scale._id} style={styles.scaleCard}>
              <View style={styles.scaleTop}>
                <View style={styles.scaleTitleLine}>
                  <Text style={styles.scaleName}>{scale.name}</Text>
                  <View
                    style={[
                      styles.pill,
                      scale.isDefault ? styles.activePill : styles.neutralPill,
                    ]}
                  >
                    <Text
                      style={[
                        styles.pillText,
                        scale.isDefault && styles.activePillText,
                      ]}
                    >
                      {scale.isDefault ? "Active" : SYSTEM_LABELS[scale.system] || scale.system}
                    </Text>
                  </View>
                  {!scale.active && (
                    <View style={[styles.pill, styles.neutralPill]}>
                      <Text style={styles.pillText}>Inactive</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.scaleMeta}>
                  Pass mark: {scale.passPct}% · {scale.bands?.length ?? 0} grade bands
                </Text>
                <View style={styles.bandChips}>
                  {(scale.bands ?? []).map((band, index) => (
                    <View key={`${band.grade}-${index}`} style={styles.bandChip}>
                      <Text style={styles.bandChipText}>
                        {bandChipLabel(scale.bands, index)}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
              {canWrite && (
                <View style={styles.actions}>
                  <Pressable
                    onPress={() => openEdit(scale)}
                    disabled={busy}
                    style={styles.action}
                    accessibilityRole="button"
                    accessibilityLabel={`Edit ${scale.name}`}
                  >
                    <Ionicons name="create-outline" size={17} color={colors.info} />
                    <Text style={styles.editText}>Edit</Text>
                  </Pressable>
                  {!scale.isDefault && scale.active && (
                    <Pressable
                      onPress={() => activate(scale)}
                      disabled={busy}
                      style={styles.action}
                      accessibilityRole="button"
                      accessibilityLabel={`Activate ${scale.name}`}
                    >
                      <Ionicons name="play-outline" size={17} color={colors.success} />
                      <Text style={styles.activateText}>
                        {scale.active ? "Activate" : "Restore & activate"}
                      </Text>
                    </Pressable>
                  )}
                  {!scale.isDefault && (
                    <Pressable
                      onPress={() => remove(scale)}
                      disabled={busy}
                      style={styles.action}
                      accessibilityRole="button"
                      accessibilityLabel={`Delete ${scale.name}`}
                    >
                      <Ionicons name="trash-outline" size={17} color={colors.alert} />
                      <Text style={styles.deleteText}>Delete</Text>
                    </Pressable>
                  )}
                </View>
              )}
            </Card>
          ))
        )}
      </ScrollView>

      <Modal
        visible={modalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => !busy && setModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalRoot}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.modalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.modalTitle}>
                {editingId ? "Edit Grading Scale" : "New Grading Scale"}
              </Text>
              {!editingId && (
                <Text style={styles.subtitle}>New scales are created as custom presets.</Text>
              )}
            </View>
            <Pressable
              onPress={() => !busy && setModalVisible(false)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Close"
              disabled={busy}
            >
              <Ionicons name="close" size={24} color={colors.muted} />
            </Pressable>
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.modalContent}
          >
            <Text style={styles.fieldLabel}>Scale name *</Text>
            <Input
              value={form.name}
              onChangeText={(name) => setForm((current) => ({ ...current, name }))}
              placeholder="e.g. House Scale 2026, CBSE 9-10"
              maxLength={80}
              accessibilityLabel="Scale name"
            />
            <Text style={styles.helper}>
              Activate a custom scale to make it the school default.
            </Text>

            <Text style={styles.fieldLabel}>Pass mark (%) *</Text>
            <Input
              value={form.passPct}
              onChangeText={(passPct) => setForm((current) => ({ ...current, passPct }))}
              placeholder="33"
              keyboardType="decimal-pad"
              accessibilityLabel="Pass mark percentage"
            />
            <Text style={styles.helper}>
              An exam's explicit pass percentage can override this value.
            </Text>

            <View style={styles.bandHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Grade bands *</Text>
                <Text style={styles.helper}>
                  Keep thresholds in descending order; the lowest must be 0%.
                </Text>
              </View>
              <Text style={styles.bandCount}>{form.bands.length}/12</Text>
            </View>
            {form.bands.map((band, index) => (
              <View key={`band-${index}`} style={styles.formBand}>
                <Input
                  value={band.grade}
                  onChangeText={(value) => updateBand(index, "grade", value)}
                  placeholder="Grade"
                  maxLength={12}
                  style={styles.gradeField}
                  accessibilityLabel={`Grade label for band ${index + 1}`}
                />
                <Text style={styles.minLabel}>min %</Text>
                <Input
                  value={band.minPct}
                  onChangeText={(value) => updateBand(index, "minPct", value)}
                  placeholder="0"
                  keyboardType="decimal-pad"
                  style={styles.minField}
                  accessibilityLabel={`Minimum percentage for band ${index + 1}`}
                />
                <Pressable
                  onPress={() => removeBand(index)}
                  style={styles.removeBand}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove band ${index + 1}`}
                >
                  <Ionicons name="close-circle-outline" size={23} color={colors.alert} />
                </Pressable>
              </View>
            ))}
            <Pressable
              onPress={addBand}
              disabled={form.bands.length >= 12}
              style={[styles.addBand, form.bands.length >= 12 && styles.disabled]}
            >
              <Ionicons name="add-circle-outline" size={19} color={colors.ink} />
              <Text style={styles.addBandText}>Add band</Text>
            </Pressable>
          </ScrollView>
          <View style={styles.modalFooter}>
            <Pressable
              onPress={() => setModalVisible(false)}
              disabled={busy}
              style={styles.cancelButton}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <View style={styles.saveButtonWrap}>
              <Button
                title={busy ? "Saving…" : editingId ? "Save changes" : "Create scale"}
                onPress={() => void save()}
                loading={busy}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 16, paddingBottom: 34, gap: 12 },
  heading: { gap: 4, marginBottom: 4 },
  eyebrow: { color: colors.amberDark, fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  title: { color: colors.ink, fontSize: 25, fontWeight: "800" },
  subtitle: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  activeCard: { flexDirection: "row", alignItems: "center", gap: 12, borderColor: "#B9DEC7" },
  activeIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: "#E8F5EC", alignItems: "center", justifyContent: "center" },
  activeLabel: { color: colors.success, fontSize: 9.5, fontWeight: "800", letterSpacing: 0.7 },
  activeName: { color: colors.ink, fontSize: 15, fontWeight: "800", marginVertical: 2 },
  listHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 },
  listTitle: { color: colors.ink, fontSize: 17, fontWeight: "800" },
  newButton: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.ink, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 12 },
  newButtonText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  loading: { alignItems: "center", padding: 30, gap: 10 },
  error: { color: colors.alert, marginBottom: 12, fontSize: 13 },
  emptyCard: { alignItems: "center", paddingVertical: 24 },
  emptyAction: { marginTop: 18, paddingVertical: 9, paddingHorizontal: 14, borderRadius: 9, backgroundColor: colors.ink },
  emptyActionText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  scaleCard: { padding: 0, overflow: "hidden" },
  scaleTop: { padding: 15, gap: 7 },
  scaleTitleLine: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 7 },
  scaleName: { color: colors.ink, fontSize: 14, fontWeight: "800", flexShrink: 1 },
  pill: { borderRadius: 20, borderWidth: 1, paddingVertical: 3, paddingHorizontal: 8 },
  activePill: { backgroundColor: "#E8F5EC", borderColor: "#B9DEC7" },
  neutralPill: { backgroundColor: "#F2F4F7", borderColor: colors.border },
  pillText: { color: colors.muted, fontSize: 9.5, fontWeight: "700" },
  activePillText: { color: colors.success },
  scaleMeta: { color: colors.muted, fontSize: 11.5 },
  bandChips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 2 },
  bandChip: { backgroundColor: "#F2F4F7", borderRadius: 16, paddingVertical: 5, paddingHorizontal: 9 },
  bandChipText: { color: colors.muted, fontSize: 10.5, fontWeight: "600" },
  actions: { flexDirection: "row", alignItems: "center", gap: 15, paddingHorizontal: 14, paddingVertical: 9, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  action: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 4 },
  editText: { color: colors.info, fontSize: 11.5, fontWeight: "700" },
  activateText: { color: colors.success, fontSize: 11.5, fontWeight: "700" },
  deleteText: { color: colors.alert, fontSize: 11.5, fontWeight: "700" },
  modalRoot: { flex: 1, backgroundColor: colors.paper },
  modalHeader: { flexDirection: "row", alignItems: "center", gap: 12, padding: 18, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: colors.border },
  modalTitle: { color: colors.ink, fontSize: 17, fontWeight: "800", marginBottom: 3 },
  modalContent: { padding: 18, paddingBottom: 30 },
  fieldLabel: { color: colors.ink, fontSize: 12.5, fontWeight: "700", marginTop: 14, marginBottom: 7 },
  helper: { color: colors.muted, fontSize: 10.5, lineHeight: 15, marginTop: 5 },
  bandHeader: { flexDirection: "row", alignItems: "center", marginTop: 8, marginBottom: 2 },
  bandCount: { color: colors.muted, fontSize: 11, fontWeight: "700" },
  formBand: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 9 },
  gradeField: { flex: 1.1, paddingHorizontal: 10, paddingVertical: 10 },
  minLabel: { color: colors.muted, fontSize: 10.5 },
  minField: { flex: 0.8, paddingHorizontal: 10, paddingVertical: 10 },
  removeBand: { padding: 3 },
  addBand: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 10, paddingHorizontal: 5, marginTop: 5 },
  addBandText: { color: colors.ink, fontSize: 12, fontWeight: "700" },
  disabled: { opacity: 0.45 },
  modalFooter: { flexDirection: "row", alignItems: "center", gap: 10, padding: 16, backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: colors.border },
  cancelButton: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 20 },
  cancelText: { color: colors.ink, fontSize: 13, fontWeight: "700" },
  saveButtonWrap: { flex: 1 },
});
