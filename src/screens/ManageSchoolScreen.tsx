import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as ImagePicker from "expo-image-picker";
import { Button, Card, Empty, Input } from "../components/UI";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { colors } from "../theme";
import type { School } from "../types";
import type { RootStackParams } from "../../App";

type MasterKind =
  | "classes"
  | "sections"
  | "subjects"
  | "fee-types"
  | "attendance-statuses"
  | "leave-types"
  | "notice-categories"
  | "notice-audiences"
  | "event-categories"
  | "hostel-blocks";
type MasterItem = Record<string, unknown> & {
  _id?: string;
  id?: string;
  name?: string;
  description?: string;
  active?: boolean;
  status?: string;
};
type TabKey = "school-profile" | "school-board" | "syllabus" | MasterKind;
type Tab = { key: TabKey; title: string; singular: string };
type ProfileForm = {
  name: string;
  shortName: string;
  email: string;
  phone: string;
  website: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  recognitionNumber: string;
  recognitionAuthority: string;
};
type ExamFormat = { name: string; types: string[] };
type MasterForm = {
  name: string;
  description: string;
  classId: string;
  sectionId: string;
};

const TABS: Tab[] = [
  { key: "school-profile", title: "School Profile", singular: "School Profile" },
  { key: "school-board", title: "School Board", singular: "School Board" },
  { key: "classes", title: "Classes", singular: "Class" },
  { key: "sections", title: "Sections", singular: "Section" },
  { key: "subjects", title: "Subjects", singular: "Subject" },
  { key: "syllabus", title: "Syllabus", singular: "Syllabus" },
  { key: "fee-types", title: "Fee Types", singular: "Fee Type" },
  { key: "attendance-statuses", title: "Attendance Statuses", singular: "Attendance Status" },
  { key: "leave-types", title: "Leave Types", singular: "Leave Type" },
  { key: "notice-categories", title: "Notice Categories", singular: "Notice Category" },
  { key: "notice-audiences", title: "Notice Audiences", singular: "Notice Audience" },
  { key: "event-categories", title: "Event Categories", singular: "Event Category" },
  { key: "hostel-blocks", title: "Hostel Blocks", singular: "Hostel Block" },
];
const MASTER_KINDS = TABS.slice(1).map((tab) => tab.key as MasterKind);
const BOARD_OPTIONS = [
  "CBSE",
  "ICSE",
  "State Board",
  "IGCSE",
  "IB",
  "NIOS",
  "Other",
];
const AUTHORITY_OPTIONS = [
  "CBSE",
  "CISCE",
  "State Education Dept",
  "UGC",
  "AICTE",
  "Other",
];
const emptyProfile = (school?: School | null): ProfileForm => ({
  name: school?.name || "",
  shortName: school?.shortName || "",
  email: school?.email || "",
  phone: school?.phone || "",
  website: school?.website || "",
  address: school?.address || "",
  city: school?.city || "",
  state: school?.state || "",
  pincode: school?.pincode || "",
  recognitionNumber: school?.recognitionNumber || "",
  recognitionAuthority: school?.recognitionAuthority || "",
});
const isActive = (item: MasterItem) =>
  "status" in item ? item.status === "active" : item.active !== false;
const itemId = (item: MasterItem) => String(item._id || item.id || "");
const validDate = (value?: string) =>
  value && !Number.isNaN(new Date(value).getTime())
    ? new Date(value).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : value || "";
const displayLabel = (value: string) =>
  value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
const masterValue = (value: unknown): string => {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(masterValue).filter(Boolean).join(", ");
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !["_id", "id", "schoolId", "__v"].includes(key))
      .map(([key, nested]) => `${displayLabel(key)}: ${masterValue(nested)}`)
      .filter((row) => !row.endsWith(": "))
      .join(" · ");
  }
  return "";
};
const masterDetails = (item: MasterItem) =>
  Object.entries(item)
    .filter(
      ([key, value]) =>
        !["_id", "id", "schoolId", "__v", "name", "active", "status"].includes(
          key,
        ) &&
        value !== undefined &&
        value !== null &&
        value !== "",
    )
    .map(([key, value]) => ({
      label: displayLabel(key),
      value: masterValue(value),
    }))
    .filter((row) => row.value);

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
  editable = true,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  editable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Field label={label}>
        <Pressable
          style={[styles.select, !editable && styles.disabledSelect]}
          onPress={() => editable && setOpen(true)}
          disabled={!editable}
        >
          <Text style={[styles.selectText, !value && styles.placeholder]}>
            {value || `Select ${label.toLowerCase()}`}
          </Text>
          <Ionicons name="chevron-down" size={17} color={colors.muted} />
        </Pressable>
      </Field>
      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.selectBackdrop} onPress={() => setOpen(false)}>
          <View style={styles.selectSheet}>
            <Text style={styles.selectTitle}>Select {label}</Text>
            {["", ...options].map((option) => (
              <Pressable
                key={option || "none"}
                style={styles.selectOption}
                onPress={() => {
                  onChange(option);
                  setOpen(false);
                }}
              >
                <Text style={styles.selectText}>{option || `No ${label.toLowerCase()}`}</Text>
                {value === option ? (
                  <Ionicons name="checkmark" size={19} color={colors.ink} />
                ) : null}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

export default function ManageSchoolScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParams>>();
  const { user, school, selectSchool, can } = useAuth();
  const [activeTab, setActiveTab] = useState<TabKey>("school-profile");
  const [items, setItems] = useState<Partial<Record<MasterKind, MasterItem[]>>>({});
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [form, setForm] = useState<ProfileForm>(() => emptyProfile(school));
  const [profileRefreshing, setProfileRefreshing] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileLoadError, setProfileLoadError] = useState("");
  const [tabPickerVisible, setTabPickerVisible] = useState(false);
  const [imageBusy, setImageBusy] = useState<"logo" | "banner" | "">("");
  const [masterModal, setMasterModal] = useState<{
    kind: MasterKind;
    item?: MasterItem;
  } | null>(null);
  const [bulkSubjectsVisible, setBulkSubjectsVisible] = useState(false);
  const [bulkClassId, setBulkClassId] = useState("");
  const [bulkSectionIds, setBulkSectionIds] = useState<string[]>([]);
  const [bulkSubjectName, setBulkSubjectName] = useState("");
  const [bulkSubjectDescription, setBulkSubjectDescription] = useState("");
  const [savingBulkSubjects, setSavingBulkSubjects] = useState(false);
  const [masterForm, setMasterForm] = useState<MasterForm>({
    name: "",
    description: "",
    classId: "",
    sectionId: "",
  });
  const [savingMaster, setSavingMaster] = useState(false);
  const [busyItem, setBusyItem] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [sectionFilter, setSectionFilter] = useState("");
  const [board, setBoard] = useState(school?.board || "");
  const [examFormats, setExamFormats] = useState<ExamFormat[]>([]);
  const [savingBoard, setSavingBoard] = useState(false);

  useEffect(() => {
    setForm(emptyProfile(school));
  }, [
    school?.name,
    school?.shortName,
    school?.email,
    school?.phone,
    school?.website,
    school?.address,
    school?.city,
    school?.state,
    school?.pincode,
    school?.recognitionNumber,
    school?.recognitionAuthority,
  ]);

  useEffect(() => {
    setBoard(school?.board || "");
    setExamFormats(
      school?.examFormats?.length
        ? school.examFormats.map((format) => ({
            name: format.name || "",
            types: format.types?.length ? [...format.types] : [""],
          }))
        : school?.examFormat
          ? [
              {
                name: school.examFormat,
                types: school.examFormatType ? [school.examFormatType] : [""],
              },
            ]
          : [{ name: "", types: [""] }],
    );
  }, [
    school?.board,
    school?.examFormat,
    school?.examFormatType,
    school?.examFormats,
  ]);

  const loadMasters = useCallback(
    async (refresh = false) => {
      if (!can("exams:read")) {
        setLoadError("You do not have permission to view school master data.");
        return;
      }
      setLoading(true);
      setRefreshing(refresh);
      setLoadError("");
      try {
        const results = await Promise.allSettled(
          MASTER_KINDS.map((kind) => api.examMasters.list(kind)),
        );
        const nextItems: Partial<Record<MasterKind, MasterItem[]>> = {};
        const errors: string[] = [];
        results.forEach((result, index) => {
          const kind = MASTER_KINDS[index];
          if (result.status === "fulfilled") {
            nextItems[kind] = result.value.data || [];
          } else {
            errors.push(
              `${TABS.find((tab) => tab.key === kind)?.title}: ${
                result.reason instanceof Error
                  ? result.reason.message
                  : "Could not load records."
              }`,
            );
          }
        });
        setItems((current) => ({ ...current, ...nextItems }));
        setLoadError(errors.join("\n"));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [can],
  );

  useEffect(() => {
    if (activeTab !== "school-profile" && activeTab !== "school-board" && activeTab !== "syllabus") {
      void loadMasters();
    }
  }, [activeTab, loadMasters]);

  const activeKind =
    MASTER_KINDS.includes(activeTab as MasterKind)
      ? (activeTab as MasterKind)
      : null;
  const activeTabInfo = TABS.find((tab) => tab.key === activeTab);
  const activeClasses = (items.classes || []).filter(isActive);
  const sectionsForClass = (classId: string) => {
    const selectedClass = activeClasses.find((item) => itemId(item) === classId);
    if (!selectedClass) return [];
    return (items.sections || []).filter(
      (section) =>
        isActive(section) &&
        (String(section.classId || "") === classId ||
          (!section.classId && section.className === selectedClass.name)),
    );
  };
  const activeSections = classFilter ? sectionsForClass(classFilter) : [];
  const activeItems = activeKind
    ? (items[activeKind] || []).filter((item) => {
        if (activeKind === "sections" && classFilter) {
          const schoolClass = activeClasses.find(
            (candidate) => itemId(candidate) === classFilter,
          );
          return (
            String(item.classId || "") === classFilter ||
            (!item.classId && item.className === schoolClass?.name)
          );
        }
        if (activeKind === "subjects") {
          if (!classFilter && !sectionFilter) return true;
          return (items.sections || []).some(
            (section) =>
              itemId(section) === String(item.sectionId || "") &&
              (!classFilter ||
                String(section.classId || "") === classFilter ||
                (!section.classId &&
                  activeClasses.find((candidate) => itemId(candidate) === classFilter)?.name ===
                    section.className)) &&
              (!sectionFilter || itemId(section) === sectionFilter),
          );
        }
        return true;
      })
    : [];
  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return normalized
      ? activeItems.filter((item) =>
          Object.entries(item).some(([key, value]) => {
            if (["_id", "id", "schoolId", "__v"].includes(key)) return false;
            return masterValue(value).toLowerCase().includes(normalized);
          }),
        )
      : activeItems;
  }, [activeItems, query]);
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const visibleItems = filteredItems.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize,
  );

  const changeTab = (key: TabKey) => {
    if (key === "syllabus") {
      setTabPickerVisible(false);
      navigation.navigate("Syllabus");
      return;
    }
    setActiveTab(key);
    setQuery("");
    setPage(1);
    setClassFilter("");
    setSectionFilter("");
    setTabPickerVisible(false);
  };

  const saveBoard = async () => {
    const formats = examFormats
      .map((format) => ({
        name: format.name.trim(),
        types: format.types.map((type) => type.trim()).filter(Boolean),
      }))
      .filter((format) => format.name);
    if (!board && formats.length) {
      Alert.alert("Board required", "Select a board before adding exam formats.");
      return;
    }
    if (examFormats.some((format) => !format.name.trim() && format.types.some((type) => type.trim()))) {
      Alert.alert("Exam format required", "Give each result type a format name.");
      return;
    }
    setSavingBoard(true);
    try {
      const response = await api.school.update({
        board,
        examFormats: formats,
        examFormat: formats[0]?.name || "",
        examFormatType: formats[0]?.types[0] || "",
      });
      await selectSchool(response.data);
      Alert.alert("Saved", "School board configuration updated.");
    } catch (saveError) {
      Alert.alert(
        "Could not save school board configuration",
        saveError instanceof Error ? saveError.message : "Please try again.",
      );
    } finally {
      setSavingBoard(false);
    }
  };

  const selectBulkClass = (className: string) => {
    const selectedClass = activeClasses.find((item) => item.name === className);
    const classId = selectedClass ? itemId(selectedClass) : "";
    setBulkClassId(classId);
    setBulkSectionIds(
      classId ? sectionsForClass(classId).map(itemId) : [],
    );
  };

  const saveBulkSubjects = async () => {
    if (!bulkClassId) {
      Alert.alert("Class required", "Select a class before adding a subject.");
      return;
    }
    if (!bulkSectionIds.length) {
      Alert.alert("Section required", "Select at least one section.");
      return;
    }
    if (!bulkSubjectName.trim()) {
      Alert.alert("Subject name required", "Enter a subject name.");
      return;
    }
    setSavingBulkSubjects(true);
    try {
      const response = await api.examMasters.createSubjectsForSections({
        name: bulkSubjectName.trim(),
        description: bulkSubjectDescription.trim(),
        sectionIds: bulkSectionIds,
      });
      const { created, existing } = response.data;
      setItems((current) => {
        const currentSubjects = current.subjects || [];
        const merged = [...currentSubjects];
        created.forEach((subject) => {
          const id = itemId(subject);
          if (!merged.some((item) => itemId(item) === id)) {
            merged.push(subject);
          }
        });
        return { ...current, subjects: merged };
      });
      setBulkSubjectsVisible(false);
      setBulkSubjectName("");
      setBulkSubjectDescription("");
      Alert.alert(
        "Subjects added",
        `Added to ${created.length} section${created.length === 1 ? "" : "s"}${
          existing.length
            ? `; already present in ${existing.length} section${existing.length === 1 ? "" : "s"}`
            : ""
        }.`,
      );
    } catch (saveError) {
      Alert.alert(
        "Could not add subject",
        saveError instanceof Error ? saveError.message : "Please try again.",
      );
    } finally {
      setSavingBulkSubjects(false);
    }
  };

  const saveProfile = async () => {
    const email = form.email.trim();
    const phone = form.phone.trim();
    const pincode = form.pincode.trim();
    const website = form.website.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      Alert.alert("Check school email", "Enter a valid school email address.");
      return;
    }
    if (phone && !/^[+]?[(]?[0-9]{1,4}[)]?[-\s./0-9]*$/.test(phone)) {
      Alert.alert("Check phone number", "Enter a valid school phone number.");
      return;
    }
    if (pincode && !/^[1-9][0-9]{5}$/.test(pincode)) {
      Alert.alert("Check pincode", "Enter a valid 6-digit pincode.");
      return;
    }
    if (website && !/^https?:\/\/.+/i.test(website)) {
      Alert.alert("Check website", "Website must start with http:// or https://.");
      return;
    }
    if (!form.name.trim()) {
      Alert.alert("School name required", "Enter the school name before saving.");
      return;
    }
    setSavingProfile(true);
    try {
      const response = await api.school.update({
        name: form.name.trim(),
        shortName: form.shortName.trim(),
        email,
        phone,
        website,
        address: form.address.trim(),
        city: form.city.trim(),
        state: form.state.trim(),
        pincode,
        recognitionNumber: form.recognitionNumber.trim(),
        recognitionAuthority: form.recognitionAuthority.trim(),
      });
      await selectSchool(response.data);
      setForm(emptyProfile(response.data));
      Alert.alert("Saved", "School profile updated successfully.");
    } catch (saveError) {
      Alert.alert(
        "Could not save school profile",
        saveError instanceof Error ? saveError.message : "Please try again.",
      );
    } finally {
      setSavingProfile(false);
    }
  };

  const refreshProfile = useCallback(async () => {
    setProfileRefreshing(true);
    setProfileLoadError("");
    try {
      const response = await api.school.me();
      await selectSchool(response.data);
    } catch (refreshError) {
      setProfileLoadError(
        refreshError instanceof Error
          ? refreshError.message
          : "Could not load school profile.",
      );
    } finally {
      setProfileRefreshing(false);
      setProfileLoading(false);
    }
  }, [selectSchool]);

  useEffect(() => {
    void refreshProfile();
  }, [refreshProfile]);

  const chooseSchoolImage = async (kind: "logo" | "banner") => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Photo access required",
        "Allow photo library access to choose a school image.",
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: kind === "logo" ? [1, 1] : [16, 5],
      quality: 0.7,
      base64: true,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset.base64 || !asset.mimeType?.startsWith("image/")) {
      Alert.alert("Invalid image", "Choose a valid PNG, JPEG or WebP image.");
      return;
    }
    const limit = kind === "logo" ? 1024 * 1024 : 2 * 1024 * 1024;
    const estimatedSize = Math.ceil((asset.base64.length * 3) / 4);
    if (estimatedSize > limit) {
      Alert.alert(
        "Image too large",
        `${kind === "logo" ? "Logo" : "Banner"} must be smaller than ${
          kind === "logo" ? "1MB" : "2MB"
        }. Choose a smaller image.`,
      );
      return;
    }
    const dataUrl = `data:${asset.mimeType};base64,${asset.base64}`;
    setImageBusy(kind);
    try {
      const response = await api.school.update(
        kind === "logo" ? { logo: dataUrl } : { bannerImage: dataUrl },
      );
      await selectSchool({ ...school, ...response.data });
      Alert.alert(
        "Image updated",
        kind === "logo" ? "School logo updated." : "Dashboard banner updated.",
      );
    } catch (uploadError) {
      Alert.alert(
        "Could not upload image",
        uploadError instanceof Error ? uploadError.message : "Please try another image.",
      );
    } finally {
      setImageBusy("");
    }
  };

  const openMasterForm = (item?: MasterItem) => {
    if (!activeKind) return;
    const section = (items.sections || []).find(
      (record) => itemId(record) === String(item?.sectionId || ""),
    );
    const itemClass = activeClasses.find(
      (record) =>
        itemId(record) === String(item?.classId || "") ||
        record.name === item?.className ||
        record.name === section?.className ||
        itemId(record) === String(section?.classId || ""),
    );
    setMasterForm({
      name: item?.name || "",
      description: item?.description || "",
      classId: itemClass ? itemId(itemClass) : classFilter,
      sectionId: String(item?.sectionId || sectionFilter || ""),
    });
    setMasterModal({ kind: activeKind, item });
  };

  const saveMaster = async () => {
    if (!masterModal) return;
    if (!masterForm.name.trim()) {
      Alert.alert("Name required", "Enter a name for this master value.");
      return;
    }
    if (masterModal.kind === "sections" && !masterForm.classId) {
      Alert.alert("Class required", "Select the class this section belongs to.");
      return;
    }
    if (masterModal.kind === "subjects" && !masterForm.sectionId) {
      Alert.alert("Section required", "Select the section this subject belongs to.");
      return;
    }
    setSavingMaster(true);
    try {
      const payload: Record<string, unknown> = { name: masterForm.name.trim() };
      if (masterModal.kind === "subjects")
        payload.description = masterForm.description.trim();
      if (masterModal.kind === "sections") {
        const selectedClass = activeClasses.find(
          (item) => itemId(item) === masterForm.classId,
        );
        payload.classId = masterForm.classId;
        if (selectedClass?.name) payload.className = selectedClass.name;
      }
      if (masterModal.kind === "subjects") {
        const selectedSection = (items.sections || []).find(
          (item) => itemId(item) === masterForm.sectionId,
        );
        payload.sectionId = masterForm.sectionId;
        if (selectedSection?.name) payload.sectionName = selectedSection.name;
        if (selectedSection?.classId) payload.classId = selectedSection.classId;
        if (selectedSection?.className) payload.className = selectedSection.className;
      }
      const response = masterModal.item
        ? await api.examMasters.update(
            masterModal.kind,
            itemId(masterModal.item),
            payload,
          )
        : await api.examMasters.create(masterModal.kind, payload);
      const updated = response.data as MasterItem;
      setItems((current) => {
        const currentItems = current[masterModal.kind] || [];
        const index = currentItems.findIndex(
          (item) => itemId(item) === itemId(updated),
        );
        return {
          ...current,
          [masterModal.kind]:
            index < 0
              ? [...currentItems, updated]
              : currentItems.map((item, itemIndex) =>
                  itemIndex === index ? updated : item,
                ),
        };
      });
      setMasterModal(null);
      setMasterForm({ name: "", description: "", classId: "", sectionId: "" });
    } catch (saveError) {
      Alert.alert(
        "Could not save master value",
        saveError instanceof Error ? saveError.message : "Please try again.",
      );
    } finally {
      setSavingMaster(false);
    }
  };

  const changeLifecycle = async (item: MasterItem) => {
    if (!activeKind) return;
    const id = itemId(item);
    if (!id) {
      Alert.alert("Unable to update", "This master value has no record ID.");
      return;
    }
    setBusyItem(id);
    try {
      const active = !isActive(item);
      const response = active
        ? await api.examMasters.restore(activeKind, id)
        : await api.examMasters.deactivate(activeKind, id);
      const updated = response.data as MasterItem;
      setItems((current) => ({
        ...current,
        [activeKind]: (current[activeKind] || []).map((record) =>
          itemId(record) === id
            ? { ...record, ...updated, active, status: active ? "active" : "inactive" }
            : record,
        ),
      }));
    } catch (updateError) {
      Alert.alert(
        "Could not update status",
        updateError instanceof Error ? updateError.message : "Please try again.",
      );
    } finally {
      setBusyItem("");
    }
  };

  const profileCanSave = can("school:settings");
  const mastersCanRead = can("exams:read");
  const mastersCanWrite = can("exams:write");

  return (
    <View style={styles.screen}>
      <View style={styles.hero}>
        <View style={styles.heroIcon}>
          <Ionicons name="settings-outline" size={20} color={colors.ink} />
        </View>
        <View style={styles.heroText}>
          <Text style={styles.title}>Manage School</Text>
          <Text style={styles.subtitle}>
            School profile, academics and shared settings
          </Text>
        </View>
      </View>
      <Pressable
        style={styles.categoryPicker}
        onPress={() => setTabPickerVisible(true)}
      >
        <View style={styles.categoryPickerIcon}>
          <Ionicons name="grid-outline" size={17} color={colors.ink} />
        </View>
        <View style={styles.categoryPickerText}>
          <Text style={styles.categoryPickerLabel}>MANAGE CATEGORY</Text>
          <Text style={styles.categoryPickerValue}>{activeTabInfo?.title}</Text>
        </View>
        {activeKind ? (
          <Text style={styles.categoryCount}>
            {activeItems.filter(isActive).length} active
          </Text>
        ) : activeTab === "school-board" ? (
          <Text style={styles.categoryCount}>
            {school?.board ? "Configured" : "Set up"}
          </Text>
        ) : null}
        <Ionicons name="chevron-down" size={18} color={colors.muted} />
      </Pressable>

      <Modal
        visible={tabPickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setTabPickerVisible(false)}
      >
        <Pressable
          style={styles.categoryBackdrop}
          onPress={() => setTabPickerVisible(false)}
        >
          <View style={styles.categorySheet}>
            <View style={styles.categorySheetHeader}>
              <View>
                <Text style={styles.categorySheetTitle}>Manage school</Text>
                <Text style={styles.cardSubtitle}>Choose a section to view or edit</Text>
              </View>
              <Pressable onPress={() => setTabPickerVisible(false)} hitSlop={10}>
                <Ionicons name="close" size={22} color={colors.ink} />
              </Pressable>
            </View>
            <ScrollView style={styles.categoryOptions}>
              {TABS.map((tab) => {
                const count =
                  MASTER_KINDS.includes(tab.key as MasterKind)
                    ? (items[tab.key as MasterKind]?.filter(isActive).length ?? 0)
                    : undefined;
                return (
                  <Pressable
                    key={tab.key}
                    style={[
                      styles.categoryOption,
                      activeTab === tab.key && styles.categoryOptionActive,
                    ]}
                    onPress={() => changeTab(tab.key)}
                  >
                    <Text
                      style={[
                        styles.categoryOptionText,
                        activeTab === tab.key && styles.categoryOptionTextActive,
                      ]}
                    >
                      {tab.title}
                    </Text>
                    {count !== undefined ? (
                      <Text style={styles.categoryOptionCount}>{count} active</Text>
                      ) : tab.key === "school-board" ? (
                        <Text style={styles.categoryOptionCount}>
                          {school?.board ? "Configured" : "Set up"}
                        </Text>
                      ) : tab.key === "syllabus" ? (
                        <Text style={styles.categoryOptionCount}>
                          Open syllabus manager
                        </Text>
                      ) : null}
                    {activeTab === tab.key ? (
                      <Ionicons name="checkmark-circle" size={19} color={colors.ink} />
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      {activeTab === "school-profile" ? (
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={profileRefreshing}
              onRefresh={() => void refreshProfile()}
            />
          }
        >
          {profileLoadError ? (
            <Card style={styles.errorCard}>
              <Text style={styles.errorText}>{profileLoadError}</Text>
              <Button
                title="Retry"
                variant="ghost"
                onPress={() => void refreshProfile()}
              />
            </Card>
          ) : profileLoading ? (
            <View style={styles.profileLoading}>
              <ActivityIndicator color={colors.ink} />
              <Text style={styles.cardSubtitle}>Loading complete school profile…</Text>
            </View>
          ) : null}
          <Card style={styles.profileCard}>
            <View style={styles.sectionDivider}>
              <Text style={styles.sectionTitle}>School overview</Text>
              <View style={styles.readOnlyRow}>
                <Text style={styles.fieldLabel}>School code</Text>
                <Text style={styles.readOnlyValue}>{school?.code || "—"}</Text>
              </View>
              <View style={styles.readOnlyRow}>
                <Text style={styles.fieldLabel}>Academic session</Text>
                <Text style={styles.readOnlyValue}>
                  {school?.currentSession?.name || school?.session || "—"}
                </Text>
              </View>
              <View style={styles.readOnlyRow}>
                <Text style={styles.fieldLabel}>Session dates</Text>
                <Text style={styles.readOnlyValue}>
                  {school?.currentSession?.startDate && school.currentSession.endDate
                    ? `${validDate(school.currentSession.startDate)} – ${validDate(
                        school.currentSession.endDate,
                      )}`
                    : "—"}
                </Text>
              </View>
              <View style={styles.readOnlyRow}>
                <Text style={styles.fieldLabel}>Website domain</Text>
                <Text style={styles.readOnlyValue}>{school?.domain || "—"}</Text>
              </View>
              <View style={styles.readOnlyRow}>
                <Text style={styles.fieldLabel}>Subscription plan</Text>
                <Text style={styles.readOnlyValue}>{school?.plan || "—"}</Text>
              </View>
              <View style={styles.readOnlyRow}>
                <Text style={styles.fieldLabel}>School status</Text>
                <Text style={styles.readOnlyValue}>{school?.status || "—"}</Text>
              </View>
              <View style={styles.readOnlyRow}>
                <Text style={styles.fieldLabel}>Onboarding</Text>
                <Text style={styles.readOnlyValue}>
                  {school?.onboarding?.status || "—"}
                </Text>
              </View>
              <View style={styles.readOnlyRow}>
                <Text style={styles.fieldLabel}>Academic setup</Text>
                <Text style={styles.readOnlyValue}>
                  {school?.academicConfigConfirmed ? "Configured" : "Pending"}
                </Text>
              </View>
              <View style={styles.readOnlyRow}>
                <Text style={styles.fieldLabel}>Onboarding applied</Text>
                <Text style={styles.readOnlyValue}>
                  {validDate(school?.onboarding?.appliedAt) || "—"}
                </Text>
              </View>
              <View style={styles.readOnlyRow}>
                <Text style={styles.fieldLabel}>Onboarding completed</Text>
                <Text style={styles.readOnlyValue}>
                  {validDate(school?.onboarding?.completedAt) || "—"}
                </Text>
              </View>
              <View style={styles.readOnlyRow}>
                <Text style={styles.fieldLabel}>Onboarding notes</Text>
                <Text style={styles.readOnlyValue}>
                  {school?.onboarding?.notes || "—"}
                </Text>
              </View>
              <View style={styles.readOnlyRow}>
                <Text style={styles.fieldLabel}>Created</Text>
                <Text style={styles.readOnlyValue}>
                  {validDate(school?.createdAt) || "—"}
                </Text>
              </View>
              <View style={styles.readOnlyRow}>
                <Text style={styles.fieldLabel}>Last updated</Text>
                <Text style={styles.readOnlyValue}>
                  {validDate(school?.updatedAt) || "—"}
                </Text>
              </View>
              {school?.isDeleted || school?.deletedAt ? (
                <View style={styles.readOnlyRow}>
                  <Text style={styles.fieldLabel}>Deleted</Text>
                  <Text style={styles.readOnlyValue}>
                    {validDate(school.deletedAt || undefined) || "Yes"}
                  </Text>
                </View>
              ) : null}
            </View>
            <View style={styles.profileHeading}>
              <View style={styles.schoolMark}>
                {school?.logo ? (
                  <Image source={{ uri: school.logo }} style={styles.logoImage} />
                ) : (
                  <Text style={styles.schoolInitial}>
                    {(school?.shortName || school?.name || "S").slice(0, 1).toUpperCase()}
                  </Text>
                )}
              </View>
              <View style={styles.profileHeadingText}>
                <Text style={styles.cardTitle}>School Profile</Text>
                <Text style={styles.cardSubtitle}>
                  Update the school's public contact and location details.
                </Text>
              </View>
              <Pressable
                style={styles.imageButton}
                onPress={() => void chooseSchoolImage("logo")}
                disabled={Boolean(imageBusy) || !profileCanSave}
              >
                {imageBusy === "logo" ? (
                  <ActivityIndicator color={colors.ink} size="small" />
                ) : (
                  <Ionicons name="camera-outline" size={18} color={colors.ink} />
                )}
              </Pressable>
            </View>
            <Text style={styles.imageHint}>Logo image up to 1MB</Text>
            <Field label="School name">
              <Input
                value={form.name}
                onChangeText={(name) => setForm((current) => ({ ...current, name }))}
                placeholder="School name"
                editable={profileCanSave}
              />
            </Field>
            <Field label="Short name">
              <Input
                value={form.shortName}
                onChangeText={(shortName) =>
                  setForm((current) => ({ ...current, shortName }))
                }
                placeholder="Name used in the sidebar"
                editable={profileCanSave}
              />
            </Field>
            <Field label="School email">
              <Input
                value={form.email}
                onChangeText={(email) => setForm((current) => ({ ...current, email }))}
                placeholder="school@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                editable={profileCanSave}
              />
            </Field>
            <Field label="Phone">
              <Input
                value={form.phone}
                onChangeText={(phone) => setForm((current) => ({ ...current, phone }))}
                placeholder="Phone number"
                keyboardType="phone-pad"
                editable={profileCanSave}
              />
            </Field>
            <Field label="Website">
              <Input
                value={form.website}
                onChangeText={(website) =>
                  setForm((current) => ({ ...current, website }))
                }
                placeholder="https://school.example.com"
                autoCapitalize="none"
                keyboardType="url"
                editable={profileCanSave}
              />
            </Field>
            <Field label="Address">
              <Input
                value={form.address}
                onChangeText={(address) => setForm((current) => ({ ...current, address }))}
                placeholder="Street address"
                editable={profileCanSave}
              />
            </Field>
            <View style={styles.twoColumns}>
              <View style={styles.column}>
                <Field label="City">
                  <Input
                    value={form.city}
                    onChangeText={(city) => setForm((current) => ({ ...current, city }))}
                    placeholder="City"
                    editable={profileCanSave}
                  />
                </Field>
              </View>
              <View style={styles.column}>
                <Field label="State">
                  <Input
                    value={form.state}
                    onChangeText={(state) => setForm((current) => ({ ...current, state }))}
                    placeholder="State"
                    editable={profileCanSave}
                  />
                </Field>
              </View>
            </View>
            <Field label="Pincode">
              <Input
                value={form.pincode}
                onChangeText={(pincode) =>
                  setForm((current) => ({
                    ...current,
                    pincode: pincode.replace(/\D/g, "").slice(0, 6),
                  }))
                }
                placeholder="6-digit pincode"
                keyboardType="number-pad"
                maxLength={6}
                editable={profileCanSave}
              />
            </Field>
            <View style={styles.sectionDivider}>
              <Text style={styles.sectionTitle}>Dashboard banner</Text>
              <Text style={styles.cardSubtitle}>
                Used as the background on the admin dashboard.
              </Text>
              <Pressable
                style={styles.banner}
                onPress={() => void chooseSchoolImage("banner")}
                disabled={Boolean(imageBusy) || !profileCanSave}
              >
                {school?.settings?.bannerImage ? (
                  <Image
                    source={{ uri: school.settings.bannerImage }}
                    style={styles.bannerImage}
                  />
                ) : null}
                <View style={styles.bannerOverlay}>
                  {imageBusy === "banner" ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Ionicons name="camera-outline" size={20} color="#fff" />
                  )}
                  <Text style={styles.bannerText}>
                    {imageBusy === "banner" ? "Uploading…" : "Change banner image"}
                  </Text>
                </View>
              </Pressable>
              <Text style={styles.imageHint}>Banner image up to 2MB</Text>
            </View>
            <View style={styles.sectionDivider}>
              <Text style={styles.sectionTitle}>Affiliation & recognition</Text>
              <Text style={styles.cardSubtitle}>
                Recognition details are managed with your school profile.
              </Text>
              <Field label="Recognition number">
                <Input
                  value={form.recognitionNumber}
                  onChangeText={(recognitionNumber) =>
                    setForm((current) => ({ ...current, recognitionNumber }))
                  }
                  placeholder="Recognition / affiliation number"
                  editable={profileCanSave}
                />
              </Field>
              <SelectField
                label="Issuing authority"
                value={form.recognitionAuthority}
                options={AUTHORITY_OPTIONS}
                onChange={(recognitionAuthority) =>
                  setForm((current) => ({ ...current, recognitionAuthority }))
                }
                editable={profileCanSave}
              />
              <View style={styles.verifiedRow}>
                <Ionicons
                  name={
                    school?.recognitionVerified
                      ? "checkmark-circle"
                      : "alert-circle-outline"
                  }
                  size={17}
                  color={school?.recognitionVerified ? colors.success : colors.muted}
                />
                <Text
                  style={[
                    styles.verifiedText,
                    !school?.recognitionVerified && styles.unverifiedText,
                  ]}
                >
                  {school?.recognitionVerified ? "Verified" : "Not verified"}
                  {school?.recognitionVerifiedAt
                    ? ` on ${validDate(school.recognitionVerifiedAt)}`
                    : ""}
                </Text>
              </View>
            </View>
            {profileCanSave ? (
              <Button
                title="Save school profile"
                onPress={() => void saveProfile()}
                loading={savingProfile}
              />
            ) : (
              <Text style={styles.permissionHint}>
                You have read-only access to school profile settings.
              </Text>
            )}
            <View style={styles.accountFooter}>
              <Text style={styles.accountFooterText}>
                Signed in as {user?.name || "School administrator"} ·{" "}
                {user?.email || "—"}
              </Text>
            </View>
          </Card>
        </ScrollView>
      ) : activeTab === "school-board" ? (
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Card style={styles.profileCard}>
            <Text style={styles.cardTitle}>School Board Configuration</Text>
            <Text style={styles.cardSubtitle}>
              Set the board and exam formats and result types used by your school.
            </Text>
            <SelectField
              label="School board"
              value={board}
              options={BOARD_OPTIONS}
              onChange={(nextBoard) => {
                setBoard(nextBoard);
                if (nextBoard !== board) setExamFormats([{ name: "", types: [""] }]);
              }}
              editable={profileCanSave}
            />
            {examFormats.map((format, formatIndex) => (
              <View key={`format-${formatIndex}`} style={styles.formatCard}>
                <View style={styles.formatHeading}>
                  <Text style={styles.sectionTitle}>
                    Exam format {formatIndex + 1}
                  </Text>
                  {examFormats.length > 1 && profileCanSave ? (
                    <Pressable
                      onPress={() =>
                        setExamFormats((current) =>
                          current.filter((_, index) => index !== formatIndex),
                        )
                      }
                      accessibilityRole="button"
                      accessibilityLabel={`Remove exam format ${formatIndex + 1}`}
                    >
                      <Ionicons name="trash-outline" size={18} color={colors.alert} />
                    </Pressable>
                  ) : null}
                </View>
                <Field label="Format name">
                  <Input
                    value={format.name}
                    onChangeText={(name) =>
                      setExamFormats((current) =>
                        current.map((item, index) =>
                          index === formatIndex ? { ...item, name } : item,
                        ),
                      )
                    }
                    placeholder="e.g. Annual, Semester or Term-based"
                    editable={profileCanSave && Boolean(board)}
                  />
                </Field>
                {format.types.map((type, typeIndex) => (
                  <View
                    key={`format-${formatIndex}-type-${typeIndex}`}
                    style={styles.formatTypeRow}
                  >
                    <Field label={`Result type ${typeIndex + 1}`}>
                      <Input
                        value={type}
                        onChangeText={(value) =>
                          setExamFormats((current) =>
                            current.map((item, index) =>
                              index === formatIndex
                                ? {
                                    ...item,
                                    types: item.types.map((entry, entryIndex) =>
                                      entryIndex === typeIndex ? value : entry,
                                    ),
                                  }
                                : item,
                            ),
                          )
                        }
                        placeholder="e.g. Marks, Grades or GPA"
                        editable={profileCanSave && Boolean(board)}
                      />
                    </Field>
                    {format.types.length > 1 && profileCanSave ? (
                      <Pressable
                        style={styles.removeType}
                        onPress={() =>
                          setExamFormats((current) =>
                            current.map((item, index) =>
                              index === formatIndex
                                ? {
                                    ...item,
                                    types: item.types.filter(
                                      (_, entryIndex) => entryIndex !== typeIndex,
                                    ),
                                  }
                                : item,
                            ),
                          )
                        }
                        accessibilityRole="button"
                        accessibilityLabel={`Remove result type ${typeIndex + 1}`}
                      >
                        <Ionicons
                          name="remove-circle-outline"
                          size={20}
                          color={colors.alert}
                        />
                      </Pressable>
                    ) : null}
                  </View>
                ))}
                {profileCanSave ? (
                  <Pressable
                    style={styles.addInline}
                    onPress={() =>
                      setExamFormats((current) =>
                        current.map((item, index) =>
                          index === formatIndex
                            ? { ...item, types: [...item.types, ""] }
                            : item,
                        ),
                      )
                    }
                    disabled={!board}
                  >
                    <Ionicons name="add-circle-outline" size={17} color={colors.info} />
                    <Text style={styles.addInlineText}>Add result type</Text>
                  </Pressable>
                ) : null}
              </View>
            ))}
            {profileCanSave ? (
              <>
                <Button
                  title="Add exam format"
                  variant="ghost"
                  onPress={() =>
                    setExamFormats((current) => [
                      ...current,
                      { name: "", types: [""] },
                    ])
                  }
                  disabled={!board}
                />
                <Button
                  title="Save board configuration"
                  onPress={() => void saveBoard()}
                  loading={savingBoard}
                />
              </>
            ) : (
              <Text style={styles.permissionHint}>
                You have read-only access to school settings.
              </Text>
            )}
          </Card>
        </ScrollView>
      ) : (
        <>
          <View style={styles.masterHeader}>
            <View style={styles.masterHeading}>
              <Text style={styles.masterTitle}>{activeTabInfo?.title}</Text>
              <Text style={styles.masterSubtitle}>
                {activeItems.filter(isActive).length} active · {activeItems.length} total
              </Text>
            </View>
            {activeKind === "subjects" && mastersCanWrite ? (
              <Pressable
                style={styles.bulkButton}
                onPress={() => {
                  setBulkClassId(classFilter);
                  setBulkSectionIds(
                    classFilter ? sectionsForClass(classFilter).map(itemId) : [],
                  );
                  setBulkSubjectName("");
                  setBulkSubjectDescription("");
                  setBulkSubjectsVisible(true);
                }}
                accessibilityRole="button"
                accessibilityLabel="Add a subject to multiple sections"
              >
                <Ionicons name="layers-outline" size={17} color={colors.ink} />
              </Pressable>
            ) : null}
            {mastersCanWrite ? (
              <Pressable
                style={styles.addButton}
                onPress={() => openMasterForm()}
                accessibilityLabel={`Add ${activeTabInfo?.singular}`}
              >
                <Ionicons name="add" size={22} color="#fff" />
              </Pressable>
            ) : null}
          </View>
          {activeKind === "sections" || activeKind === "subjects" ? (
            <View style={styles.filterFields}>
              <SelectField
                label="Filter by class"
                value={
                  activeClasses.find((item) => itemId(item) === classFilter)
                    ?.name || ""
                }
                options={activeClasses
                  .map((item) => item.name || "")
                  .filter(Boolean)}
                onChange={(className) => {
                  const selectedClass = activeClasses.find(
                    (item) => item.name === className,
                  );
                  setClassFilter(selectedClass ? itemId(selectedClass) : "");
                  setSectionFilter("");
                  setPage(1);
                }}
              />
              {activeKind === "subjects" ? (
                <SelectField
                  label="Filter by section"
                  value={
                    activeSections.find((item) => itemId(item) === sectionFilter)
                      ?.name || ""
                  }
                  options={activeSections
                    .map((item) => item.name || "")
                    .filter(Boolean)}
                  onChange={(sectionName) => {
                    const selectedSection = activeSections.find(
                      (item) => item.name === sectionName,
                    );
                    setSectionFilter(
                      selectedSection ? itemId(selectedSection) : "",
                    );
                    setPage(1);
                  }}
                  editable={Boolean(classFilter)}
                />
              ) : null}
            </View>
          ) : null}
          <Input
            value={query}
            onChangeText={(value) => {
              setQuery(value);
              setPage(1);
            }}
            placeholder={`Search ${activeTabInfo?.title.toLowerCase()}...`}
            style={styles.search}
          />
          {!mastersCanRead ? (
            <Card style={styles.permissionCard}>
              <Text style={styles.permissionHint}>
                You do not have permission to view school master data.
              </Text>
            </Card>
          ) : loadError ? (
            <Card style={styles.errorCard}>
              <Text style={styles.errorText}>{loadError}</Text>
              <Button
                title="Retry"
                variant="ghost"
                onPress={() => void loadMasters(true)}
              />
            </Card>
          ) : null}
          <ScrollView
            style={styles.masterList}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => void loadMasters(true)}
              />
            }
          >
            {loading ? (
              <ActivityIndicator color={colors.ink} style={{ marginTop: 32 }} />
            ) : !mastersCanRead ? null : visibleItems.length ? (
              visibleItems.map((item, index) => {
                const id = itemId(item);
                const active = isActive(item);
                return (
                  <Card key={id || `${item.name}-${index}`} style={styles.masterCard}>
                    <View style={styles.masterItemTop}>
                      <View style={styles.masterItemIcon}>
                        <Ionicons
                          name={active ? "albums-outline" : "archive-outline"}
                          size={19}
                          color={colors.ink}
                        />
                      </View>
                      <View style={styles.masterItemMain}>
                        <Text style={styles.masterItemName}>{item.name || "Unnamed"}</Text>
                      </View>
                      <Text
                        style={[
                          styles.stateBadge,
                          active ? styles.stateActive : styles.stateInactive,
                        ]}
                      >
                        {active ? "Active" : "Inactive"}
                      </Text>
                    </View>
                    {masterDetails(item).length ? (
                      <View style={styles.masterDetails}>
                        {masterDetails(item).map((detail) => (
                          <View
                            key={`${id}-${detail.label}`}
                            style={styles.masterDetailRow}
                          >
                            <Text style={styles.masterDetailLabel}>
                              {detail.label}
                            </Text>
                            <Text style={styles.masterDetailValue}>
                              {detail.value}
                            </Text>
                          </View>
                        ))}
                      </View>
                    ) : (
                      <Text style={styles.masterItemDescription}>
                        No additional details available.
                      </Text>
                    )}
                    {mastersCanWrite ? (
                      <View style={styles.masterActions}>
                        {active ? (
                          <Pressable
                            style={styles.editAction}
                            onPress={() => openMasterForm(item)}
                          >
                            <Ionicons name="create-outline" size={16} color={colors.ink} />
                            <Text style={styles.editActionText}>Edit</Text>
                          </Pressable>
                        ) : null}
                        <Pressable
                          style={[
                            styles.lifecycleAction,
                            active ? styles.deactivateAction : styles.restoreAction,
                          ]}
                          disabled={busyItem === id}
                          onPress={() =>
                            Alert.alert(
                              active ? "Deactivate this item?" : "Reactivate this item?",
                              `${active ? "Deactivate" : "Reactivate"} "${item.name || "item"}"?`,
                              [
                                { text: "Cancel", style: "cancel" },
                                {
                                  text: active ? "Deactivate" : "Reactivate",
                                  style: active ? "destructive" : "default",
                                  onPress: () => void changeLifecycle(item),
                                },
                              ],
                            )
                          }
                        >
                          {busyItem === id ? (
                            <ActivityIndicator
                              size="small"
                              color={active ? colors.alert : colors.success}
                            />
                          ) : (
                            <Ionicons
                              name={active ? "remove-circle-outline" : "refresh-outline"}
                              size={16}
                              color={active ? colors.alert : colors.success}
                            />
                          )}
                          <Text
                            style={[
                              styles.lifecycleText,
                              active ? styles.deactivateText : styles.restoreText,
                            ]}
                          >
                            {active ? "Deactivate" : "Reactivate"}
                          </Text>
                        </Pressable>
                      </View>
                    ) : null}
                  </Card>
                );
              })
            ) : (
              <Empty
                text={
                  query
                    ? `No ${activeTabInfo?.title.toLowerCase()} match "${query}".`
                    : `No ${activeTabInfo?.title.toLowerCase()} configured yet.`
                }
              />
            )}
          </ScrollView>
          {!loading && filteredItems.length > 0 ? (
            <View style={styles.pagination}>
              <Text style={styles.pageInfo}>
                {Math.min((safePage - 1) * pageSize + 1, filteredItems.length)}–
                {Math.min(safePage * pageSize, filteredItems.length)} of{" "}
                {filteredItems.length}
              </Text>
              <View style={styles.pageControls}>
                <Pressable
                  style={styles.pageSizeButton}
                  onPress={() => {
                    const nextSize = pageSize === 10 ? 20 : pageSize === 20 ? 5 : 10;
                    setPageSize(nextSize);
                    setPage(1);
                  }}
                >
                  <Text style={styles.pageSizeText}>{pageSize} / page</Text>
                </Pressable>
                <Pressable
                  disabled={safePage <= 1}
                  onPress={() => setPage((value) => Math.max(1, value - 1))}
                  style={styles.pageArrow}
                >
                  <Ionicons
                    name="chevron-back"
                    size={18}
                    color={safePage <= 1 ? "#B8BEC8" : colors.ink}
                  />
                </Pressable>
                <Text style={styles.pageInfo}>
                  {safePage}/{totalPages}
                </Text>
                <Pressable
                  disabled={safePage >= totalPages}
                  onPress={() => setPage((value) => Math.min(totalPages, value + 1))}
                  style={styles.pageArrow}
                >
                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={safePage >= totalPages ? "#B8BEC8" : colors.ink}
                  />
                </Pressable>
              </View>
            </View>
          ) : null}
        </>
      )}

      <Modal
        visible={bulkSubjectsVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => !savingBulkSubjects && setBulkSubjectsVisible(false)}
      >
        <View style={styles.modal}>
          <View style={styles.modalHeading}>
            <View>
              <Text style={styles.modalTitle}>Add Subject to Class</Text>
              <Text style={styles.modalSubtitle}>
                Add one subject to multiple sections at once.
              </Text>
            </View>
            <Pressable
              onPress={() => setBulkSubjectsVisible(false)}
              disabled={savingBulkSubjects}
              hitSlop={10}
            >
              <Ionicons name="close" size={23} color={colors.ink} />
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={styles.modalContent}
            keyboardShouldPersistTaps="handled"
          >
            <SelectField
              label="Class"
              value={
                activeClasses.find((item) => itemId(item) === bulkClassId)
                  ?.name || ""
              }
              options={activeClasses
                .map((item) => item.name || "")
                .filter(Boolean)}
              onChange={selectBulkClass}
              editable={!savingBulkSubjects}
            />
            {bulkClassId ? (
              <View style={styles.bulkSectionBox}>
                <Text style={styles.fieldLabel}>Sections</Text>
                {sectionsForClass(bulkClassId).length ? (
                  sectionsForClass(bulkClassId).map((section) => {
                    const sectionId = itemId(section);
                    const selected = bulkSectionIds.includes(sectionId);
                    return (
                      <Pressable
                        key={sectionId}
                        style={styles.bulkSectionOption}
                        onPress={() =>
                          setBulkSectionIds((current) =>
                            selected
                              ? current.filter((id) => id !== sectionId)
                              : [...current, sectionId],
                          )
                        }
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: selected }}
                      >
                        <Ionicons
                          name={selected ? "checkbox" : "square-outline"}
                          size={20}
                          color={selected ? colors.info : colors.muted}
                        />
                        <Text style={styles.selectText}>
                          Section {section.name || "—"}
                        </Text>
                      </Pressable>
                    );
                  })
                ) : (
                  <Text style={styles.imageHint}>
                    No active sections found for this class.
                  </Text>
                )}
              </View>
            ) : null}
            <Field label="Subject name">
              <Input
                value={bulkSubjectName}
                onChangeText={setBulkSubjectName}
                placeholder="e.g. Mathematics"
                editable={!savingBulkSubjects}
              />
            </Field>
            <Field label="Description (optional)">
              <Input
                value={bulkSubjectDescription}
                onChangeText={setBulkSubjectDescription}
                placeholder="Subject description"
                multiline
                numberOfLines={3}
                style={styles.multilineInput}
                editable={!savingBulkSubjects}
              />
            </Field>
            <Button
              title="Add subject to selected sections"
              onPress={() => void saveBulkSubjects()}
              loading={savingBulkSubjects}
            />
            <Button
              title="Cancel"
              variant="ghost"
              onPress={() => setBulkSubjectsVisible(false)}
              disabled={savingBulkSubjects}
            />
          </ScrollView>
        </View>
      </Modal>

      <Modal
        visible={Boolean(masterModal)}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setMasterModal(null)}
      >
        {masterModal ? (
          <View style={styles.modal}>
            <View style={styles.modalHeading}>
              <View>
                <Text style={styles.modalTitle}>
                  {masterModal.item ? "Edit" : "Add"}{" "}
                  {TABS.find((tab) => tab.key === masterModal.kind)?.singular}
                </Text>
                <Text style={styles.modalSubtitle}>
                  This value is shared in school records.
                </Text>
              </View>
              <Pressable onPress={() => setMasterModal(null)} hitSlop={10}>
                <Ionicons name="close" size={23} color={colors.ink} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.modalContent}>
              <Field
                label={`${TABS.find((tab) => tab.key === masterModal.kind)?.singular} name`}
              >
                <Input
                  value={masterForm.name}
                  onChangeText={(name) =>
                    setMasterForm((current) => ({ ...current, name }))
                  }
                  placeholder="Enter name"
                  autoFocus
                />
              </Field>
              {masterModal.kind === "sections" ? (
                <SelectField
                  label="Class"
                  value={
                    activeClasses.find(
                      (item) => itemId(item) === masterForm.classId,
                    )?.name || ""
                  }
                  options={activeClasses
                    .map((item) => item.name || "")
                    .filter(Boolean)}
                  onChange={(className) => {
                    const selectedClass = activeClasses.find(
                      (item) => item.name === className,
                    );
                    setMasterForm((current) => ({
                      ...current,
                      classId: selectedClass ? itemId(selectedClass) : "",
                    }));
                  }}
                  editable={mastersCanWrite}
                />
              ) : null}
              {masterModal.kind === "subjects" ? (
                <>
                  <SelectField
                    label="Class"
                    value={
                      activeClasses.find(
                        (item) => itemId(item) === masterForm.classId,
                      )?.name || ""
                    }
                    options={activeClasses
                      .map((item) => item.name || "")
                      .filter(Boolean)}
                    onChange={(className) => {
                      const selectedClass = activeClasses.find(
                        (item) => item.name === className,
                      );
                      setMasterForm((current) => ({
                        ...current,
                        classId: selectedClass ? itemId(selectedClass) : "",
                        sectionId: "",
                      }));
                    }}
                    editable={mastersCanWrite}
                  />
                  <SelectField
                    label="Section"
                    value={
                      sectionsForClass(masterForm.classId).find(
                        (item) => itemId(item) === masterForm.sectionId,
                      )?.name || ""
                    }
                    options={sectionsForClass(masterForm.classId)
                      .map((item) => item.name || "")
                      .filter(Boolean)}
                    onChange={(sectionName) => {
                      const selectedSection = sectionsForClass(
                        masterForm.classId,
                      ).find((item) => item.name === sectionName);
                      setMasterForm((current) => ({
                        ...current,
                        sectionId: selectedSection
                          ? itemId(selectedSection)
                          : "",
                      }));
                    }}
                    editable={mastersCanWrite && Boolean(masterForm.classId)}
                  />
                </>
              ) : null}
              {masterModal.kind === "subjects" ? (
                <Field label="Description (optional)">
                  <Input
                    value={masterForm.description}
                    onChangeText={(description) =>
                      setMasterForm((current) => ({ ...current, description }))
                    }
                    placeholder="Subject description"
                    multiline
                    numberOfLines={3}
                    style={styles.multilineInput}
                  />
                </Field>
              ) : null}
              <Button
                title={masterModal.item ? "Save changes" : "Add item"}
                onPress={() => void saveMaster()}
                loading={savingMaster}
              />
              <Button
                title="Cancel"
                variant="ghost"
                onPress={() => setMasterModal(null)}
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
  hero: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.ink,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  heroIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.amber,
    alignItems: "center",
    justifyContent: "center",
  },
  heroText: { flex: 1 },
  title: { color: "#fff", fontSize: 19, fontWeight: "800" },
  subtitle: { color: "#D5DAE5", fontSize: 11, marginTop: 3 },
  categoryPicker: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 14,
    marginVertical: 10,
    paddingHorizontal: 11,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 13,
    backgroundColor: "#fff",
  },
  categoryPickerIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "#F1F3F7",
    alignItems: "center",
    justifyContent: "center",
  },
  categoryPickerText: { flex: 1 },
  categoryPickerLabel: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  categoryPickerValue: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 2,
  },
  categoryCount: { color: colors.muted, fontSize: 10, fontWeight: "600" },
  categoryBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(15, 23, 42, 0.42)",
  },
  categorySheet: {
    maxHeight: "82%",
    paddingTop: 18,
    paddingBottom: 12,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    backgroundColor: colors.paper,
  },
  categorySheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  categorySheetTitle: { color: colors.ink, fontSize: 18, fontWeight: "800" },
  categoryOptions: { paddingHorizontal: 14, paddingTop: 6 },
  categoryOption: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 11,
    borderRadius: 10,
    marginTop: 5,
  },
  categoryOptionActive: { backgroundColor: "#E9ECF2" },
  categoryOptionText: { flex: 1, color: colors.text, fontSize: 13, fontWeight: "600" },
  categoryOptionTextActive: { color: colors.ink, fontWeight: "800" },
  categoryOptionCount: { color: colors.muted, fontSize: 10 },
  content: { paddingHorizontal: 14, paddingBottom: 30 },
  profileLoading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    paddingVertical: 12,
  },
  profileCard: { gap: 13, padding: 15 },
  profileHeading: { flexDirection: "row", alignItems: "center", gap: 10 },
  schoolMark: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  logoImage: { width: "100%", height: "100%", resizeMode: "contain" },
  schoolInitial: { color: colors.amber, fontSize: 23, fontWeight: "800" },
  profileHeadingText: { flex: 1 },
  cardTitle: { color: colors.ink, fontSize: 16, fontWeight: "800" },
  cardSubtitle: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 3 },
  imageButton: {
    width: 37,
    height: 37,
    borderRadius: 12,
    backgroundColor: "#F1F3F7",
    alignItems: "center",
    justifyContent: "center",
  },
  imageHint: { color: colors.muted, fontSize: 11, lineHeight: 16 },
  field: { gap: 6 },
  fieldLabel: {
    color: colors.ink,
    fontSize: 11,
    fontWeight: "700",
  },
  readOnlyRow: {
    minHeight: 40,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 9,
    backgroundColor: "#F6F7F9",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  readOnlyValue: {
    flex: 1,
    textAlign: "right",
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600",
  },
  twoColumns: { flexDirection: "row", gap: 10 },
  column: { flex: 1 },
  sectionDivider: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 13,
    marginTop: 4,
    gap: 10,
  },
  sectionTitle: { color: colors.ink, fontSize: 13, fontWeight: "800" },
  formatCard: {
    gap: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: "#FAFBFD",
  },
  formatHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  formatTypeRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  removeType: { paddingBottom: 11 },
  addInline: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    paddingVertical: 4,
  },
  addInlineText: { color: colors.info, fontSize: 11, fontWeight: "700" },
  filterFields: { paddingHorizontal: 14, gap: 10 },
  banner: {
    height: 108,
    borderRadius: 12,
    backgroundColor: colors.ink,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  bannerImage: { ...StyleSheet.absoluteFill, resizeMode: "cover", opacity: 0.48 },
  bannerOverlay: { alignItems: "center", gap: 6 },
  bannerText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  verifiedRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  verifiedText: { color: colors.success, fontSize: 12, fontWeight: "600" },
  permissionHint: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  accountFooter: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 },
  accountFooterText: { color: colors.muted, fontSize: 11 },
  masterHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 5,
    gap: 10,
  },
  masterHeading: { flex: 1 },
  masterTitle: { color: colors.ink, fontSize: 16, fontWeight: "800" },
  masterSubtitle: { color: colors.muted, fontSize: 11, marginTop: 3 },
  addButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  bulkButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  search: { marginHorizontal: 16, marginTop: 8, marginBottom: 8 },
  masterList: { flex: 1 },
  listContent: { paddingHorizontal: 14, paddingBottom: 20, gap: 8 },
  masterCard: { padding: 12 },
  masterItemTop: { flexDirection: "row", alignItems: "center", gap: 9 },
  masterItemIcon: {
    width: 35,
    height: 35,
    borderRadius: 11,
    backgroundColor: "#EEF1F6",
    alignItems: "center",
    justifyContent: "center",
  },
  masterItemMain: { flex: 1 },
  masterItemName: { color: colors.ink, fontSize: 13, fontWeight: "700" },
  masterItemDescription: { color: colors.muted, fontSize: 11, marginTop: 3 },
  stateBadge: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 12,
    overflow: "hidden",
    fontSize: 10,
    fontWeight: "700",
  },
  stateActive: { color: "#16804A", backgroundColor: "#E9F6EF" },
  stateInactive: { color: colors.muted, backgroundColor: "#EEF0F3" },
  masterActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 10,
  },
  editAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: "#F2F4F7",
  },
  editActionText: { color: colors.ink, fontSize: 11, fontWeight: "700" },
  lifecycleAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 8,
  },
  deactivateAction: { backgroundColor: "#FCEDEA" },
  restoreAction: { backgroundColor: "#E9F6EF" },
  lifecycleText: { fontSize: 11, fontWeight: "700" },
  deactivateText: { color: colors.alert },
  restoreText: { color: colors.success },
  errorCard: { marginHorizontal: 14, marginBottom: 8, borderColor: colors.alert },
  errorText: { color: colors.alert, fontSize: 12, lineHeight: 17, marginBottom: 10 },
  permissionCard: { marginHorizontal: 14 },
  pagination: {
    minHeight: 46,
    paddingHorizontal: 14,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.paper,
  },
  pageInfo: { color: colors.muted, fontSize: 11 },
  pageControls: { flexDirection: "row", alignItems: "center", gap: 8 },
  pageSizeButton: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 7,
    backgroundColor: "#fff",
  },
  pageSizeText: { color: colors.ink, fontSize: 10, fontWeight: "600" },
  pageArrow: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: "#fff",
  },
  modal: { flex: 1, paddingTop: 8, backgroundColor: colors.paper },
  modalHeading: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: "#fff",
  },
  modalTitle: { color: colors.ink, fontSize: 18, fontWeight: "800" },
  modalSubtitle: { color: colors.muted, fontSize: 11, marginTop: 3 },
  modalContent: { padding: 16, gap: 14 },
  multilineInput: { minHeight: 90, textAlignVertical: "top" },
  select: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  disabledSelect: { backgroundColor: "#F6F7F9" },
  selectText: { color: colors.text, fontSize: 13 },
  placeholder: { color: "#98A2B3" },
  selectBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(15, 23, 42, 0.42)",
  },
  selectSheet: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 28,
    backgroundColor: colors.paper,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  selectTitle: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: "800",
    marginBottom: 10,
  },
  selectOption: {
    minHeight: 45,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#EAE7DF",
  },
  bulkSectionBox: {
    gap: 4,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    backgroundColor: "#fff",
  },
  bulkSectionOption: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  unverifiedText: { color: colors.muted },
  masterDetails: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#EEF0F3",
    paddingTop: 8,
    gap: 7,
  },
  masterDetailRow: { gap: 2 },
  masterDetailLabel: { color: colors.muted, fontSize: 10, fontWeight: "700" },
  masterDetailValue: { color: colors.text, fontSize: 11, lineHeight: 16 },
});
