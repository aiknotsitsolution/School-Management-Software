import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Button, Card, Input, Toast } from "../components/UI";
import { api } from "../lib/api";
import { pickImage, toFormData, type Picked } from "../lib/upload";
import { colors } from "../theme";

const classOptions = [
  "Nursery",
  "LKG",
  "UKG",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "11-Sci",
  "11-Com",
  "12-Sci",
  "12-Com",
];
const sectionOptions = ["A", "B", "C"];
const genderOptions = ["Male", "Female", "Other"];
const houseOptions = ["Red", "Blue", "Green", "Yellow"];
const bloodGroups = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const mediums = ["English", "Hindi"];
const feeCategories = ["General", "OBC", "SC", "ST", "EWS"];

interface StudentForm {
  name: string;
  admissionNo: string;
  rollNo: string;
  class: string;
  section: string;
  gender: string;
  dob: string;
  house: string;
  bloodGroup: string;
  medium: string;
  feeCategory: string;
  fatherName: string;
  motherName: string;
  phone: string;
  email: string;
  address: string;
}

const initialForm: StudentForm = {
  name: "",
  admissionNo: "",
  rollNo: "",
  class: "8",
  section: "A",
  gender: "Male",
  dob: "",
  house: "Red",
  bloodGroup: "O+",
  medium: "English",
  feeCategory: "General",
  fatherName: "",
  motherName: "",
  phone: "",
  email: "",
  address: "",
};

function formatClass(value: string) {
  return ["Nursery", "LKG", "UKG"].includes(value) ? value : `Class ${value}`;
}

function initials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join("") || "S"
  );
}

function dateIsValid(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const date = new Date(`${value}T00:00:00`);
  return (
    !Number.isNaN(date.getTime()) &&
    date.getFullYear() === Number(match[1]) &&
    date.getMonth() + 1 === Number(match[2]) &&
    date.getDate() === Number(match[3])
  );
}

function SectionTitle({
  icon,
  title,
  subtitle,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
}) {
  return (
    <View style={s.sectionTitleRow}>
      <View style={s.sectionTitleIcon}>
        <Ionicons name={icon} size={17} color={colors.info} />
      </View>
      <View style={s.sectionTitleCopy}>
        <Text style={s.sectionTitle}>{title}</Text>
        <Text style={s.sectionSubtitle}>{subtitle}</Text>
      </View>
    </View>
  );
}

function ChoiceField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <View style={s.field}>
      <Text style={s.label}>{label} *</Text>
      <View style={s.choiceWrap}>
        {options.map((option) => {
          const selected = value === option;
          return (
            <Pressable
              key={option}
              onPress={() => onChange(option)}
              style={[s.choice, selected && s.choiceActive]}
              accessibilityRole="button"
              accessibilityState={{ selected }}
            >
              <Text style={[s.choiceText, selected && s.choiceTextActive]}>
                {option}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function FormField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  multiline,
  autoCapitalize,
  hint,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "numeric" | "phone-pad" | "email-address" | "numbers-and-punctuation";
  multiline?: boolean;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  hint?: string;
}) {
  return (
    <View style={s.field}>
      <Text style={s.label}>{label} *</Text>
      <Input
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        keyboardType={keyboardType}
        multiline={multiline}
        autoCapitalize={autoCapitalize}
        style={multiline ? s.multilineInput : undefined}
        textAlignVertical={multiline ? "top" : "center"}
        accessibilityLabel={label}
      />
      {!!hint && <Text style={s.hint}>{hint}</Text>}
    </View>
  );
}

export default function StudentOnboardScreen() {
  const [form, setForm] = useState<StudentForm>(initialForm);
  const [photo, setPhoto] = useState<Picked | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const setField = <K extends keyof StudentForm>(key: K, value: StudentForm[K]) =>
    setForm((previous) => ({ ...previous, [key]: value }));

  const fieldsComplete = useMemo(
    () =>
      Object.values(form).every((value) => value.trim().length > 0) &&
      dateIsValid(form.dob),
    [form],
  );

  const choosePhoto = async () => {
    try {
      const selected = await pickImage();
      if (selected) {
        setPhoto(selected);
        setError("");
      }
    } catch (photoError) {
      setError((photoError as Error).message || "Unable to select student photo.");
    }
  };

  const resetForm = () => {
    setForm(initialForm);
    setPhoto(null);
    setError("");
  };

  const submit = async () => {
    const missing = Object.entries(form)
      .filter(([, value]) => !value.trim())
      .map(([key]) => key);
    if (missing.length) {
      setError(`Please complete all required fields (${missing.length} remaining).`);
      return;
    }
    if (!dateIsValid(form.dob)) {
      setError("Enter a valid date of birth in YYYY-MM-DD format.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setError("Enter a valid parent email address.");
      return;
    }
    if (form.phone.replace(/\D/g, "").length < 7) {
      setError("Enter a valid parent phone number.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      let photoUrl: string | undefined;
      if (photo) {
        const uploaded = await api.students.uploadPhoto(
          toFormData("photo", photo),
        );
        photoUrl = uploaded.data.url;
      }
      await api.students.create({
        name: form.name.trim(),
        admissionNo: form.admissionNo.trim(),
        rollNo: form.rollNo.trim(),
        class: form.class,
        section: form.section,
        gender: form.gender,
        dob: form.dob,
        house: form.house.trim(),
        bloodGroup: form.bloodGroup,
        medium: form.medium,
        feeCategory: form.feeCategory,
        fatherName: form.fatherName.trim(),
        motherName: form.motherName.trim(),
        phone: form.phone.trim(),
        email: form.email.trim().toLowerCase(),
        address: form.address.trim(),
        ...(photoUrl ? { photoUrl } : {}),
      });
      Alert.alert(
        "Student onboarded",
        `${form.name.trim()} has been added to ${formatClass(form.class)} · Section ${form.section}.`,
        [{ text: "Done", onPress: resetForm }],
      );
    } catch (submitError) {
      setError((submitError as Error).message || "Unable to add this student.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={s.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {!!error && <Toast message={error} onDismiss={() => setError("")} />}
      <ScrollView
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={s.heading}>
          <View style={s.headingIcon}>
            <Ionicons name="person-add" size={22} color={colors.amberDark} />
          </View>
          <View style={s.headingCopy}>
            <Text style={s.eyebrow}>STUDENT ADMISSIONS</Text>
            <Text style={s.title}>Student Onboard</Text>
            <Text style={s.subtitle}>
              Add the student profile and parent contact details.
            </Text>
          </View>
        </View>

        <Card style={s.sectionCard}>
          <SectionTitle
            icon="person-outline"
            title="Basic details"
            subtitle="Student identity and academics"
          />

          <View style={s.photoWrap}>
            <Pressable
              onPress={() => void choosePhoto()}
              style={s.photoButton}
              accessibilityRole="button"
              accessibilityLabel="Choose student photo"
            >
              {photo ? (
                <Image
                  source={{ uri: photo.uri }}
                  style={s.photo}
                  resizeMode="cover"
                />
              ) : (
                <View style={s.photoPlaceholder}>
                  <Text style={s.photoInitials}>{initials(form.name)}</Text>
                  <View style={s.photoAdd}>
                    <Ionicons name="camera" size={12} color="#fff" />
                  </View>
                </View>
              )}
            </Pressable>
            <Text style={s.photoTitle}>
              {photo ? "Student photo selected" : "Add student photo"}
            </Text>
            <Text style={s.photoHint}>Optional · JPG, PNG or WEBP · max 5 MB</Text>
            {photo && (
              <Pressable
                onPress={() => setPhoto(null)}
                style={s.removePhoto}
                accessibilityRole="button"
              >
                <Text style={s.removePhotoText}>Remove photo</Text>
              </Pressable>
            )}
          </View>

          <FormField
            label="Full name"
            value={form.name}
            onChangeText={(value) => setField("name", value)}
            placeholder="e.g. Aarav Sharma"
            autoCapitalize="words"
          />
          <View style={s.twoColumn}>
            <View style={s.column}>
              <FormField
                label="Roll number"
                value={form.rollNo}
                onChangeText={(value) => setField("rollNo", value)}
                placeholder="e.g. 15"
                keyboardType="numeric"
              />
            </View>
            <View style={s.column}>
              <FormField
                label="Admission ID"
                value={form.admissionNo}
                onChangeText={(value) => setField("admissionNo", value)}
                placeholder="e.g. STU-5A-001"
                autoCapitalize="characters"
                hint="Student login/admission ID."
              />
            </View>
          </View>

          <View style={s.field}>
            <Text style={s.label}>Class *</Text>
            <View style={s.choiceWrap}>
              {classOptions.map((option) => {
                const selected = form.class === option;
                return (
                  <Pressable
                    key={option}
                    onPress={() => setField("class", option)}
                    style={[s.choice, selected && s.choiceActive]}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                  >
                    <Text style={[s.choiceText, selected && s.choiceTextActive]}>
                      {["Nursery", "LKG", "UKG"].includes(option)
                        ? option
                        : `Class ${option}`}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <ChoiceField
            label="Section"
            value={form.section}
            options={sectionOptions}
            onChange={(value) => setField("section", value)}
          />
          <ChoiceField
            label="Gender"
            value={form.gender}
            options={genderOptions}
            onChange={(value) => setField("gender", value)}
          />
          <FormField
            label="Date of birth"
            value={form.dob}
            onChangeText={(value) => setField("dob", value)}
            placeholder="YYYY-MM-DD"
            keyboardType="numbers-and-punctuation"
            hint="Use year-month-day format, e.g. 2012-08-24."
          />
          <FormField
            label="House"
            value={form.house}
            onChangeText={(value) => setField("house", value)}
            placeholder="House name"
            autoCapitalize="words"
          />
          <ChoiceField
            label="Blood group"
            value={form.bloodGroup}
            options={bloodGroups}
            onChange={(value) => setField("bloodGroup", value)}
          />
          <ChoiceField
            label="Medium"
            value={form.medium}
            options={mediums}
            onChange={(value) => setField("medium", value)}
          />
          <ChoiceField
            label="Category"
            value={form.feeCategory}
            options={feeCategories}
            onChange={(value) => setField("feeCategory", value)}
          />
          <Text style={s.hint}>
            Category is used to apply eligible fee concessions.
          </Text>
        </Card>

        <Card style={s.sectionCard}>
          <SectionTitle
            icon="people-outline"
            title="Parent / guardian details"
            subtitle="Contact details for the student's family"
          />
          <FormField
            label="Father's name"
            value={form.fatherName}
            onChangeText={(value) => setField("fatherName", value)}
            placeholder="e.g. Rajesh Sharma"
            autoCapitalize="words"
          />
          <FormField
            label="Mother's name"
            value={form.motherName}
            onChangeText={(value) => setField("motherName", value)}
            placeholder="e.g. Priya Sharma"
            autoCapitalize="words"
          />
          <FormField
            label="Phone number"
            value={form.phone}
            onChangeText={(value) => setField("phone", value)}
            placeholder="e.g. 9876543210"
            keyboardType="phone-pad"
          />
          <FormField
            label="Parent email"
            value={form.email}
            onChangeText={(value) => setField("email", value)}
            placeholder="parent@email.com"
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <FormField
            label="Address"
            value={form.address}
            onChangeText={(value) => setField("address", value)}
            placeholder="House no., street, area, city..."
            multiline
          />
        </Card>

        <Card style={s.previewCard}>
          <View style={s.previewHeader}>
            <View style={s.previewHeaderCopy}>
              <Text style={s.previewEyebrow}>STUDENT ID · LIVE PREVIEW</Text>
              <Text numberOfLines={1} style={s.previewName}>
                {form.name.trim() || "New Student"}
              </Text>
            </View>
            {photo ? (
              <Image source={{ uri: photo.uri }} style={s.previewAvatar} />
            ) : (
              <View style={s.previewAvatarFallback}>
                <Text style={s.previewAvatarText}>{initials(form.name)}</Text>
              </View>
            )}
          </View>
          <View style={s.previewBadges}>
            <View style={s.previewBadge}>
              <Text style={s.previewBadgeText}>
                {formatClass(form.class)} · Section {form.section || "—"}
              </Text>
            </View>
            {!!form.rollNo && (
              <View style={s.previewBadgeMuted}>
                <Text style={s.previewBadgeMutedText}>Roll #{form.rollNo}</Text>
              </View>
            )}
            {!!form.admissionNo && (
              <View style={s.previewBadgeMuted}>
                <Text style={s.previewBadgeMutedText}>{form.admissionNo}</Text>
              </View>
            )}
          </View>
          <View style={s.previewGrid}>
            <Preview label="Gender" value={form.gender} />
            <Preview label="Date of birth" value={form.dob} />
            <Preview label="Blood group" value={form.bloodGroup} />
            <Preview label="Medium" value={form.medium} />
            <Preview label="House" value={form.house} />
            <Preview label="Father" value={form.fatherName} />
            <Preview label="Mother" value={form.motherName} />
            <Preview label="Parent phone" value={form.phone} />
            <Preview label="Parent email" value={form.email} full />
            <Preview label="Address" value={form.address} full />
          </View>
        </Card>

        <View style={s.tip}>
          <Ionicons
            name="information-circle-outline"
            size={17}
            color={colors.info}
          />
          <Text style={s.tipText}>
            All fields are required. After saving, the student is added to the
            selected class and section.
          </Text>
        </View>
        {!!error && (
          <View style={s.inlineError}>
            <Ionicons name="alert-circle-outline" size={17} color={colors.alert} />
            <Text style={s.inlineErrorText}>{error}</Text>
          </View>
        )}
        <View style={s.actions}>
          <Pressable
            onPress={resetForm}
            disabled={saving}
            style={s.clearButton}
            accessibilityRole="button"
          >
            <Ionicons name="close-outline" size={17} color={colors.ink} />
            <Text style={s.clearText}>Clear form</Text>
          </Pressable>
          <Pressable
            onPress={() => void submit()}
            disabled={saving}
            style={[s.submitButton, saving && s.submitDisabled]}
            accessibilityRole="button"
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="save-outline" size={17} color="#fff" />
            )}
            <Text style={s.submitText}>
              {saving ? "Saving..." : "Add student"}
            </Text>
          </Pressable>
        </View>
        {!fieldsComplete && (
          <Text style={s.completionHint}>
            Complete every required field and use a valid date to finish onboarding.
          </Text>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Preview({
  label,
  value,
  full,
}: {
  label: string;
  value: string;
  full?: boolean;
}) {
  return (
    <View style={[s.previewItem, full && s.previewItemFull]}>
      <Text style={s.previewLabel}>{label}</Text>
      <Text style={s.previewValue}>{value.trim() || "—"}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 16, paddingBottom: 34, gap: 14 },
  heading: { flexDirection: "row", alignItems: "center", gap: 11 },
  headingIcon: {
    width: 45,
    height: 45,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
    backgroundColor: "#FFF2D9",
  },
  headingCopy: { flex: 1, gap: 3 },
  eyebrow: {
    color: colors.amberDark,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  title: { color: colors.ink, fontSize: 21, fontWeight: "800" },
  subtitle: { color: colors.muted, fontSize: 10, lineHeight: 15 },
  sectionCard: { gap: 14, padding: 14, borderRadius: 16 },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginBottom: 2,
  },
  sectionTitleIcon: {
    width: 35,
    height: 35,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#EAF1FF",
  },
  sectionTitleCopy: { flex: 1, gap: 3 },
  sectionTitle: { color: colors.ink, fontSize: 13, fontWeight: "800" },
  sectionSubtitle: { color: colors.muted, fontSize: 9 },
  photoWrap: {
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
    marginBottom: 2,
  },
  photoButton: { width: 82, height: 82, borderRadius: 41 },
  photo: { width: 82, height: 82, borderRadius: 41, backgroundColor: "#EDF0F5" },
  photoPlaceholder: {
    width: 82,
    height: 82,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 41,
    backgroundColor: "#EAF1FF",
  },
  photoInitials: { color: colors.info, fontSize: 23, fontWeight: "800" },
  photoAdd: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 25,
    height: 25,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    borderWidth: 2,
    borderColor: "#fff",
    backgroundColor: colors.ink,
  },
  photoTitle: { color: colors.ink, fontSize: 10, fontWeight: "700", marginTop: 4 },
  photoHint: { color: colors.muted, fontSize: 8 },
  removePhoto: { padding: 5 },
  removePhotoText: { color: colors.alert, fontSize: 9, fontWeight: "700" },
  field: { gap: 7 },
  label: { color: colors.muted, fontSize: 10, fontWeight: "700" },
  hint: { color: colors.muted, fontSize: 8, lineHeight: 13 },
  twoColumn: { flexDirection: "row", alignItems: "flex-start", gap: 9 },
  column: { flex: 1, minWidth: 0 },
  choiceWrap: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  choice: {
    minHeight: 32,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: "#fff",
  },
  choiceActive: { borderColor: colors.info, backgroundColor: colors.info },
  choiceText: { color: colors.muted, fontSize: 9, fontWeight: "700" },
  choiceTextActive: { color: "#fff" },
  multilineInput: { minHeight: 82, maxHeight: 140, fontSize: 11, paddingTop: 10 },
  previewCard: {
    padding: 0,
    overflow: "hidden",
    borderRadius: 17,
    borderColor: "#D9DEE8",
    elevation: 2,
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 7,
  },
  previewHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 15,
    backgroundColor: colors.ink,
  },
  previewHeaderCopy: { flex: 1, gap: 5 },
  previewEyebrow: { color: "#D8E1F5", fontSize: 8, fontWeight: "800", letterSpacing: 0.8 },
  previewName: { color: "#fff", fontSize: 17, fontWeight: "800" },
  previewAvatar: { width: 48, height: 48, borderRadius: 24, borderWidth: 2, borderColor: "rgba(255,255,255,0.35)" },
  previewAvatarFallback: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 24,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.35)",
    backgroundColor: "rgba(255,255,255,0.17)",
  },
  previewAvatarText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  previewBadges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    paddingHorizontal: 13,
    paddingTop: 11,
  },
  previewBadge: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 12, backgroundColor: "#EAF1FF" },
  previewBadgeText: { color: colors.info, fontSize: 8, fontWeight: "800" },
  previewBadgeMuted: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 12, backgroundColor: "#F0F2F6" },
  previewBadgeMutedText: { color: colors.ink, fontSize: 8, fontWeight: "700" },
  previewGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    padding: 13,
    paddingTop: 14,
    gap: 13,
  },
  previewItem: { width: "47%", gap: 3 },
  previewItemFull: { width: "100%" },
  previewLabel: { color: colors.muted, fontSize: 8, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 },
  previewValue: { color: colors.ink, fontSize: 10, fontWeight: "700" },
  tip: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 11,
    borderWidth: 1,
    borderColor: "#D8E5F4",
    borderRadius: 12,
    backgroundColor: "#EEF5FC",
  },
  tipText: { flex: 1, color: colors.muted, fontSize: 9, lineHeight: 14 },
  inlineError: { flexDirection: "row", alignItems: "flex-start", gap: 7, paddingHorizontal: 2 },
  inlineErrorText: { flex: 1, color: colors.alert, fontSize: 10, lineHeight: 15 },
  actions: { flexDirection: "row", alignItems: "center", gap: 9 },
  clearButton: {
    minHeight: 44,
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: "#fff",
  },
  clearText: { color: colors.ink, fontSize: 10, fontWeight: "700" },
  submitButton: {
    minHeight: 44,
    flex: 1.4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderRadius: 12,
    backgroundColor: colors.ink,
  },
  submitDisabled: { opacity: 0.6 },
  submitText: { color: "#fff", fontSize: 10, fontWeight: "800" },
  completionHint: { color: colors.muted, fontSize: 8, lineHeight: 13, textAlign: "center" },
});
