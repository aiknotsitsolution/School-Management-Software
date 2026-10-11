import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Ionicons } from "@expo/vector-icons";
import { Button, Card } from "../components/UI";
import { useAuth } from "../context/AuthContext";
import { API_BASE_URL, get, KEYS, send } from "../lib/api";
import { extractList, Row } from "../lib/format";
import { colors } from "../theme";

type Student = Row & {
  _id: string;
  admissionNo: string;
  name: string;
  class?: string;
  section?: string;
  status?: string;
};
type ClassItem = Row & { name: string; active?: boolean; status?: string };
type SectionItem = Row & { name: string; className?: string; active?: boolean; status?: string };
type TransferRecord = Row & {
  _id: string;
  studentName: string;
  studentId?: string;
  fromClass?: string;
  fromSection?: string;
  toClass?: string;
  toSection?: string;
  session?: string;
  remarks?: string;
  actedByName?: string;
  createdAt?: string;
};
type TransferCertificate = Row & {
  _id: string;
  tcNumber: string;
  studentId: string;
  issueDate?: string;
  conduct?: string;
  issuedByName?: string;
  snapshot?: { name?: string; class?: string; section?: string };
};
type PickerState = {
  title: string;
  options: string[];
  onSelect: (option: string) => void;
} | null;

const FALLBACK_CLASSES = [
  "Nursery", "LKG", "UKG", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10",
  "11-Sci", "11-Com", "12-Sci", "12-Com",
];
const CONDUCT_OPTIONS = ["Excellent", "Good", "Satisfactory", "Needs Improvement"];
const classLabel = (value?: string) =>
  !value ? "—" : ["Nursery", "LKG", "UKG"].includes(value) ? value : `Class ${value}`;

function formatDate(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function PickerModal({
  picker,
  onClose,
}: {
  picker: PickerState;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  useEffect(() => setQuery(""), [picker?.title]);
  const options = picker?.options.filter((option) =>
    option.toLowerCase().includes(query.trim().toLowerCase()),
  ) || [];
  if (!picker) return null;
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.modalBackdrop}>
        <View style={s.modalCard}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>{picker.title}</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={23} color={colors.muted} />
            </Pressable>
          </View>
          <View style={s.searchBox}>
            <Ionicons name="search" size={17} color={colors.muted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search..."
              placeholderTextColor="#98A2B3"
              style={s.searchInput}
              autoCorrect={false}
            />
          </View>
          <FlatList
            data={options}
            keyExtractor={(item, index) => `${item}-${index}`}
            style={{ maxHeight: 420 }}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable
                style={s.optionRow}
                onPress={() => {
                  picker.onSelect(item);
                  onClose();
                }}
              >
                <Text style={s.optionText}>{item}</Text>
                <Ionicons name="chevron-forward" size={17} color={colors.muted} />
              </Pressable>
            )}
            ListEmptyComponent={<Text style={s.emptyText}>No matching options.</Text>}
          />
        </View>
      </View>
    </Modal>
  );
}

function SelectField({
  label,
  value,
  placeholder,
  onPress,
}: {
  label: string;
  value: string;
  placeholder: string;
  onPress: () => void;
}) {
  return (
    <View style={s.fieldWrap}>
      <Text style={s.fieldLabel}>{label}</Text>
      <Pressable style={s.selectField} onPress={onPress}>
        <Text style={[s.selectValue, !value && s.placeholder]} numberOfLines={1}>
          {value || placeholder}
        </Text>
        <Ionicons name="chevron-down" size={17} color={colors.muted} />
      </Pressable>
    </View>
  );
}

export default function TransfersScreen() {
  const { can } = useAuth();
  const canReadTransfer = can("transfer:read");
  const canWriteTransfer = can("transfer:write");
  const canReadStudents = can("students:read");
  const [tab, setTab] = useState<"transfer" | "certificates">("transfer");
  const [transferType, setTransferType] = useState<"class_section" | "school">("class_section");
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [sections, setSections] = useState<SectionItem[]>([]);
  const [history, setHistory] = useState<TransferRecord[]>([]);
  const [certificates, setCertificates] = useState<TransferCertificate[]>([]);
  const [studentId, setStudentId] = useState("");
  const [toClass, setToClass] = useState("");
  const [toSection, setToSection] = useState("");
  const [session, setSession] = useState("");
  const [remarks, setRemarks] = useState("");
  const [tcStudentId, setTcStudentId] = useState("");
  const [tcReason, setTcReason] = useState("");
  const [tcConduct, setTcConduct] = useState("Good");
  const [tcLeavingDate, setTcLeavingDate] = useState("");
  const [tcRemarks, setTcRemarks] = useState("");
  const [picker, setPicker] = useState<PickerState>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [issuingTc, setIssuingTc] = useState(false);
  const [loadingPdfId, setLoadingPdfId] = useState("");
  const [dataError, setDataError] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [tcError, setTcError] = useState("");

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setDataError("");
    const tasks: Promise<{ data: unknown }>[] = [];
    let classTaskIndex = -1;
    let sectionTaskIndex = -1;
    let studentTaskIndex = -1;
    let historyTaskIndex = -1;
    let tcTaskIndex = -1;
    if (canWriteTransfer) {
      classTaskIndex = tasks.length;
      tasks.push(get<unknown>("/exam-masters/classes"));
      sectionTaskIndex = tasks.length;
      tasks.push(get<unknown>("/exam-masters/sections"));
    }
    if (canReadStudents && canWriteTransfer) {
      studentTaskIndex = tasks.length;
      tasks.push(get<unknown>("/students?limit=1000"));
    }
    if (canReadTransfer) {
      historyTaskIndex = tasks.length;
      tasks.push(get<unknown>("/transfers/history?limit=100"));
      tcTaskIndex = tasks.length;
      tasks.push(get<unknown>("/students/transfer-certificates?limit=100"));
    }
    const results = await Promise.allSettled(tasks);
    const errors: string[] = [];
    if (classTaskIndex >= 0) {
      const result = results[classTaskIndex];
      if (result.status === "fulfilled") {
        setClasses(extractList(result.value.data) as ClassItem[]);
      } else {
        errors.push("Class list could not be loaded.");
      }
    }
    if (sectionTaskIndex >= 0) {
      const result = results[sectionTaskIndex];
      if (result.status === "fulfilled") {
        setSections(extractList(result.value.data) as SectionItem[]);
      } else {
        errors.push("Section list could not be loaded.");
      }
    }
    if (studentTaskIndex >= 0) {
      const result = results[studentTaskIndex];
      if (result.status === "fulfilled") {
        setStudents(extractList(result.value.data) as Student[]);
      } else {
        errors.push(result.reason instanceof Error ? `Student list: ${result.reason.message}` : "Student list could not be loaded.");
      }
    }
    if (historyTaskIndex >= 0) {
      const result = results[historyTaskIndex];
      if (result.status === "fulfilled") {
        setHistory(extractList(result.value.data) as TransferRecord[]);
        setHistoryError("");
      } else {
        setHistoryError(result.reason instanceof Error ? result.reason.message : "Transfer history could not be loaded.");
      }
    }
    if (tcTaskIndex >= 0) {
      const result = results[tcTaskIndex];
      if (result.status === "fulfilled") {
        setCertificates(extractList(result.value.data) as TransferCertificate[]);
        setTcError("");
      } else {
        setTcError(result.reason instanceof Error ? result.reason.message : "Transfer Certificates could not be loaded.");
      }
    }
    setDataError(errors.join(" "));
    setLoading(false);
    setRefreshing(false);
  }, [canReadStudents, canReadTransfer, canWriteTransfer]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeClasses = useMemo(() => {
    const names = classes
      .filter((item) => item.active !== false && item.status !== "inactive")
      .map((item) => item.name)
      .filter(Boolean);
    return [...new Set(names.length ? names : FALLBACK_CLASSES)].sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true }),
    );
  }, [classes]);
  const studentOptions = useMemo(
    () =>
      students
        .filter((item) => item.status !== "Transferred" && item.status !== "Alumni")
        .map((item) => ({
          label: `${item.name} · ${item.admissionNo} · ${classLabel(item.class)}${item.section ? `-${item.section}` : ""}`,
          value: item.admissionNo || item._id,
        })),
    [students],
  );
  const selectedStudent = students.find(
    (item) => item.admissionNo === studentId || item._id === studentId,
  );
  const selectedTcStudent = students.find(
    (item) => item.admissionNo === tcStudentId || item._id === tcStudentId,
  );
  const existingTc = certificates.find((item) => item.studentId === tcStudentId);
  const targetSections = useMemo(
    () => [
      ...new Set(
        sections
          .filter((item) => item.active !== false && item.status !== "inactive")
          .filter((item) => !toClass || item.className === toClass)
          .map((item) => item.name)
          .filter(Boolean),
      ),
    ].sort((a, b) => a.localeCompare(b)),
    [sections, toClass],
  );

  const recordTransfer = useCallback(async () => {
    if (!studentId) {
      Alert.alert("Select a student", "Choose a student before recording the transfer.");
      return;
    }
    if (transferType === "class_section" && !toClass) {
      Alert.alert("Target class required", "Select the class the student is moving to.");
      return;
    }
    const studentName = selectedStudent?.name || studentId;
    Alert.alert(
      "Confirm transfer",
      transferType === "school"
        ? `Record ${studentName} as transferred out of this school?`
        : `Move ${studentName} to ${classLabel(toClass)}${toSection ? `-${toSection}` : ""}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Record",
          style: "destructive",
          onPress: async () => {
            setSaving(true);
            try {
              await send("/transfers", "POST", {
                studentId,
                type: transferType,
                ...(session.trim() ? { session: session.trim() } : {}),
                ...(remarks.trim() ? { remarks: remarks.trim() } : {}),
                ...(transferType === "class_section"
                  ? { toClass, ...(toSection ? { toSection } : {}) }
                  : {}),
              });
              Alert.alert("Transfer recorded", `Transfer recorded for ${studentName}.`);
              setStudentId("");
              setToClass("");
              setToSection("");
              setSession("");
              setRemarks("");
              await load(true);
            } catch (error) {
              Alert.alert("Transfer failed", error instanceof Error ? error.message : "Could not record transfer.");
            } finally {
              setSaving(false);
            }
          },
        },
      ],
    );
  }, [load, remarks, selectedStudent?.name, session, studentId, toClass, toSection, transferType]);

  const issueTc = useCallback(async () => {
    if (!tcStudentId) {
      Alert.alert("Select a student", "Choose a student before issuing a certificate.");
      return;
    }
    if (existingTc) {
      Alert.alert(
        "Certificate already issued",
        `${selectedTcStudent?.name || tcStudentId} already has TC ${existingTc.tcNumber}. Download the existing certificate instead.`,
      );
      return;
    }
    if (tcLeavingDate.trim()) {
      const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(tcLeavingDate.trim());
      const parsedDate = dateMatch
        ? new Date(Date.UTC(Number(dateMatch[1]), Number(dateMatch[2]) - 1, Number(dateMatch[3])))
        : null;
      if (
        !dateMatch ||
        !parsedDate ||
        parsedDate.getUTCFullYear() !== Number(dateMatch[1]) ||
        parsedDate.getUTCMonth() !== Number(dateMatch[2]) - 1 ||
        parsedDate.getUTCDate() !== Number(dateMatch[3])
      ) {
        Alert.alert("Invalid leaving date", "Enter a valid date in YYYY-MM-DD format.");
        return;
      }
    }
    setIssuingTc(true);
    try {
      const response = await send<{ message?: string }>(
        "/students/transfer-certificates",
        "POST",
        {
          studentId: tcStudentId,
          reason: tcReason.trim() || undefined,
          conduct: tcConduct,
          leavingDate: tcLeavingDate.trim() || undefined,
          remarks: tcRemarks.trim() || undefined,
        },
      );
      Alert.alert("Certificate issued", response.message || "Transfer Certificate issued.");
      setTcStudentId("");
      setTcReason("");
      setTcConduct("Good");
      setTcLeavingDate("");
      setTcRemarks("");
      await load(true);
    } catch (error) {
      Alert.alert("Could not issue certificate", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setIssuingTc(false);
    }
  }, [existingTc, load, selectedTcStudent?.name, tcConduct, tcLeavingDate, tcReason, tcRemarks, tcStudentId]);

  const downloadTc = useCallback(async (tc: TransferCertificate) => {
    if (!FileSystem.cacheDirectory) {
      Alert.alert("Download unavailable", "Temporary file storage is unavailable.");
      return;
    }
    setLoadingPdfId(tc._id);
    try {
      const [[, token], [, role], [, activeSchoolId]] = await AsyncStorage.multiGet([
        KEYS.access,
        KEYS.role,
        KEYS.activeSchoolId,
      ]);
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      if (role === "super_admin" && activeSchoolId) headers["X-School-Id"] = activeSchoolId;
      const safeNumber = tc.tcNumber.replace(/[^\w.-]/g, "_");
      const result = await FileSystem.downloadAsync(
        `${API_BASE_URL}/students/transfer-certificates/${encodeURIComponent(tc._id)}/pdf`,
        `${FileSystem.cacheDirectory}transfer-certificate-${safeNumber}.pdf`,
        { headers },
      );
      if (result.status < 200 || result.status >= 300) {
        await FileSystem.deleteAsync(result.uri, { idempotent: true });
        throw new Error(result.status === 403
          ? "You do not have permission to download this certificate."
          : "Could not download the certificate. Please try again.");
      }
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(result.uri, {
          mimeType: "application/pdf",
          dialogTitle: `Transfer Certificate ${tc.tcNumber}`,
          UTI: "com.adobe.pdf",
        });
      } else {
        await Share.share({ url: result.uri, title: `Transfer Certificate ${tc.tcNumber}` });
      }
    } catch (error) {
      Alert.alert("Download failed", error instanceof Error ? error.message : "Could not download the certificate.");
    } finally {
      setLoadingPdfId("");
    }
  }, []);

  const exportHistory = useCallback(async () => {
    try {
      await Share.share({ title: "Transfer history", message: JSON.stringify(history, null, 2) });
    } catch (error) {
      Alert.alert("Export failed", error instanceof Error ? error.message : "Could not share transfer history.");
    }
  }, [history]);

  if (loading) {
    return <ActivityIndicator style={{ flex: 1 }} size="large" color={colors.ink} />;
  }

  return (
    <View style={s.screen}>
      <ScrollView
        contentContainerStyle={s.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.ink} />}
      >
        <View style={s.hero}>
          <View style={s.heroIcon}><Ionicons name="git-compare-outline" size={24} color="#fff" /></View>
          <Text style={s.eyebrow}>ACADEMICS</Text>
          <Text style={s.title}>Transfers</Text>
          <Text style={s.subtitle}>Move students between classes or schools, and issue Transfer Certificates.</Text>
        </View>
        {!!dataError && (
          <View style={s.errorBox}>
            <Ionicons name="warning-outline" size={18} color={colors.alert} />
            <Text style={s.errorText}>{dataError}</Text>
            <Pressable onPress={() => void load()}><Text style={s.retryText}>Retry</Text></Pressable>
          </View>
        )}
        <View style={s.tabs}>
          {([
            ["transfer", "Student Transfers"],
            ["certificates", "Transfer Certificates"],
          ] as const).map(([key, label]) => {
            const active = tab === key;
            const count = key === "transfer" ? history.length : certificates.length;
            return (
              <Pressable
                key={key}
                onPress={() => setTab(key)}
                style={[s.tabButton, active && s.activeTab]}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
              >
                <Text style={[s.tabText, active && s.activeTabText]}>{label} ({count})</Text>
              </Pressable>
            );
          })}
        </View>

        {tab === "transfer" ? (
          <>
            <Card style={s.panel}>
              <Text style={s.panelTitle}>New Transfer</Text>
              {canWriteTransfer ? (
                <>
                  {!canReadStudents ? (
                    <Text style={s.mutedText}>Student search requires students:read access. Contact your administrator to enable it.</Text>
                  ) : (
                    <SelectField
                      label="STUDENT"
                      value={studentOptions.find((option) => option.value === studentId)?.label || ""}
                      placeholder={students.length ? "Search by name or admission no." : "No active students available"}
                      onPress={() => setPicker({
                        title: "Select student",
                        options: studentOptions.map(({ label }) => label),
                        onSelect: (value) => {
                          const index = studentOptions.findIndex((option) => option.label === value);
                          setStudentId(index >= 0 ? studentOptions[index].value : "");
                        },
                      })}
                    />
                  )}
                  <Text style={s.fieldLabel}>TRANSFER TYPE</Text>
                  <View style={s.typeRow}>
                    {([
                      ["class_section", "Class / Section"],
                      ["school", "Out of School"],
                    ] as const).map(([value, label]) => {
                      const active = transferType === value;
                      return (
                        <Pressable
                          key={value}
                          onPress={() => setTransferType(value)}
                          style={[s.typeOption, active && s.typeOptionActive]}
                        >
                          <Ionicons name={value === "school" ? "exit-outline" : "swap-horizontal"} size={17} color={active ? colors.ink : colors.muted} />
                          <Text style={[s.typeText, active && s.typeTextActive]}>{label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  {transferType === "class_section" && (
                    <View style={s.fieldsRow}>
                      <SelectField
                        label="TO CLASS"
                        value={toClass ? classLabel(toClass) : ""}
                        placeholder="Select target class"
                        onPress={() => setPicker({
                          title: "Target class",
                          options: activeClasses,
                          onSelect: (value) => { setToClass(value); setToSection(""); },
                        })}
                      />
                      <SelectField
                        label="TO SECTION"
                        value={toSection ? `Section ${toSection}` : ""}
                        placeholder="Keep current section"
                        onPress={() => setPicker({ title: "Target section", options: targetSections, onSelect: setToSection })}
                      />
                    </View>
                  )}
                  <View style={s.fieldWrap}>
                    <Text style={s.fieldLabel}>SESSION (OPTIONAL)</Text>
                    <TextInput style={s.textField} value={session} onChangeText={setSession} placeholder="e.g. 2025-26" placeholderTextColor="#98A2B3" />
                  </View>
                  <View style={s.fieldWrap}>
                    <Text style={s.fieldLabel}>REMARKS (OPTIONAL)</Text>
                    <TextInput
                      style={[s.textField, s.multilineField]}
                      value={remarks}
                      onChangeText={setRemarks}
                      placeholder={transferType === "school" ? "Reason for leaving, destination school..." : "Reason for the class change..."}
                      placeholderTextColor="#98A2B3"
                      multiline
                      textAlignVertical="top"
                    />
                  </View>
                  {selectedStudent && (
                    <View style={s.previewNote}>
                      <Ionicons name="information-circle-outline" size={17} color={colors.info} />
                      <Text style={s.previewText}>
                        Transferring {selectedStudent.name}
                        {transferType === "school"
                          ? " out of school. Their status will be set to Transferred."
                          : ` from ${classLabel(selectedStudent.class)}${selectedStudent.section ? `-${selectedStudent.section}` : ""} to ${classLabel(toClass || "?")}${toSection ? `-${toSection}` : ""}.`}
                        {" "}A permanent academic record will be created.
                      </Text>
                    </View>
                  )}
                  <Button title={saving ? "Recording transfer..." : "Record Transfer"} onPress={() => void recordTransfer()} loading={saving} />
                </>
              ) : (
                <Text style={s.mutedText}>You have read-only access. Only users with transfer write permission can record transfers.</Text>
              )}
            </Card>
            <Card style={s.panel}>
              <View style={s.sectionHeader}>
                <View><Text style={s.panelTitle}>Transfer History</Text><Text style={s.panelSubtitle}>{history.length} recent records</Text></View>
                <Pressable style={s.iconButton} onPress={() => void exportHistory()} disabled={!history.length} accessibilityLabel="Share transfer history">
                  <Ionicons name="share-outline" size={18} color={history.length ? colors.ink : colors.muted} />
                </Pressable>
              </View>
              {!canReadTransfer ? (
                <Text style={s.mutedText}>You do not have permission to view transfer history.</Text>
              ) : historyError ? (
                <View style={s.emptyState}><Text style={s.errorText}>{historyError}</Text><Pressable onPress={() => void load(true)}><Text style={s.retryText}>Retry</Text></Pressable></View>
              ) : history.length === 0 ? (
                <Text style={s.emptyText}>No transfers recorded yet.</Text>
              ) : history.map((record) => (
                <View key={record._id} style={s.historyItem}>
                  <View style={s.historyIcon}><Ionicons name="swap-horizontal" size={18} color={colors.amberDark} /></View>
                  <View style={s.recordInfo}>
                    <Text style={s.studentName}>{record.studentName || record.studentId}</Text>
                    <Text style={s.recordMeta}>{classLabel(record.fromClass)}{record.fromSection ? `-${record.fromSection}` : ""}{" → "}{record.toClass ? `${classLabel(record.toClass)}${record.toSection ? `-${record.toSection}` : ""}` : "Left school"}</Text>
                    <Text style={s.recordMeta}>{record.session || "No session"} · {record.actedByName || "—"}</Text>
                    {!!record.remarks && <Text style={s.recordRemarks} numberOfLines={2}>{record.remarks}</Text>}
                  </View>
                  <Text style={s.dateText}>{formatDate(record.createdAt)}</Text>
                </View>
              ))}
            </Card>
          </>
        ) : (
          <>
            <Card style={s.panel}>
              <Text style={s.panelTitle}>Issue Transfer Certificate</Text>
              {canWriteTransfer ? (
                <>
                  {!canReadStudents ? (
                    <Text style={s.mutedText}>Student selection requires students:read access.</Text>
                  ) : (
                    <SelectField
                      label="STUDENT"
                      value={studentOptions.find((option) => option.value === tcStudentId)?.label || ""}
                      placeholder="Search by name or admission no."
                      onPress={() => setPicker({
                        title: "Select student for certificate",
                        options: studentOptions.map(({ label }) => label),
                        onSelect: (value) => {
                          const index = studentOptions.findIndex((option) => option.label === value);
                          setTcStudentId(index >= 0 ? studentOptions[index].value : "");
                        },
                      })}
                    />
                  )}
                  {!!existingTc && (
                    <View style={s.warningBox}>
                      <Ionicons name="document-text-outline" size={18} color="#A66500" />
                      <Text style={s.warningText}>{selectedTcStudent?.name || tcStudentId} already has TC {existingTc.tcNumber}. Download the existing certificate below.</Text>
                    </View>
                  )}
                  <View style={s.fieldsRow}>
                    <View style={s.fieldWrap}>
                      <Text style={s.fieldLabel}>DATE OF LEAVING (OPTIONAL)</Text>
                      <TextInput style={s.textField} value={tcLeavingDate} onChangeText={setTcLeavingDate} placeholder="YYYY-MM-DD" placeholderTextColor="#98A2B3" maxLength={10} />
                    </View>
                    <SelectField label="CONDUCT" value={tcConduct} placeholder="Select conduct" onPress={() => setPicker({ title: "Student conduct", options: CONDUCT_OPTIONS, onSelect: setTcConduct })} />
                  </View>
                  <View style={s.fieldWrap}>
                    <Text style={s.fieldLabel}>REASON FOR LEAVING</Text>
                    <TextInput style={s.textField} value={tcReason} onChangeText={setTcReason} placeholder="e.g. Family relocation, transfer to another school..." placeholderTextColor="#98A2B3" />
                  </View>
                  <View style={s.fieldWrap}>
                    <Text style={s.fieldLabel}>REMARKS (OPTIONAL)</Text>
                    <TextInput style={[s.textField, s.multilineField]} value={tcRemarks} onChangeText={setTcRemarks} placeholder="Additional remarks" placeholderTextColor="#98A2B3" multiline textAlignVertical="top" />
                  </View>
                  <Button title={issuingTc ? "Issuing certificate..." : "Issue Certificate"} onPress={() => void issueTc()} loading={issuingTc} />
                </>
              ) : (
                <Text style={s.mutedText}>Read-only access: only users with transfer write permission can issue certificates.</Text>
              )}
            </Card>
            <Card style={s.panel}>
              <View style={s.sectionHeader}>
                <View><Text style={s.panelTitle}>Transfer Certificates</Text><Text style={s.panelSubtitle}>{certificates.length} issued</Text></View>
              </View>
              {!canReadTransfer ? (
                <Text style={s.mutedText}>You do not have permission to view Transfer Certificates.</Text>
              ) : tcError ? (
                <View style={s.emptyState}><Text style={s.errorText}>{tcError}</Text><Pressable onPress={() => void load(true)}><Text style={s.retryText}>Retry</Text></Pressable></View>
              ) : certificates.length === 0 ? (
                <Text style={s.emptyText}>No Transfer Certificates issued yet.</Text>
              ) : certificates.map((tc) => (
                <View key={tc._id} style={s.tcItem}>
                  <View style={s.historyIcon}><Ionicons name="document-text-outline" size={18} color={colors.amberDark} /></View>
                  <View style={s.recordInfo}>
                    <Text style={s.studentName}>{tc.tcNumber}</Text>
                    <Text style={s.recordMeta}>{tc.snapshot?.name || tc.studentId}</Text>
                    <Text style={s.recordMeta}>{tc.snapshot?.class ? `${classLabel(tc.snapshot.class)}${tc.snapshot.section ? `-${tc.snapshot.section}` : ""}` : "—"} · {tc.conduct || "—"}</Text>
                    <Text style={s.recordMeta}>Issued {formatDate(tc.issueDate)} · {tc.issuedByName || "—"}</Text>
                  </View>
                  <Pressable style={s.pdfButton} onPress={() => void downloadTc(tc)} disabled={loadingPdfId === tc._id} accessibilityRole="button" accessibilityLabel={`Download ${tc.tcNumber} PDF`}>
                    {loadingPdfId === tc._id ? <ActivityIndicator size="small" color={colors.ink} /> : <><Ionicons name="download-outline" size={17} color={colors.ink} /><Text style={s.pdfText}>PDF</Text></>}
                  </Pressable>
                </View>
              ))}
            </Card>
          </>
        )}
      </ScrollView>
      <PickerModal picker={picker} onClose={() => setPicker(null)} />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 16, paddingBottom: 34, gap: 14 },
  hero: { padding: 20, borderRadius: 20, backgroundColor: colors.ink },
  heroIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.16)", alignItems: "center", justifyContent: "center", marginBottom: 14 },
  eyebrow: { color: "#FFD58A", fontSize: 10, fontWeight: "800", letterSpacing: 1.5 },
  title: { color: "#fff", fontSize: 25, fontWeight: "800", marginTop: 4 },
  subtitle: { color: "rgba(255,255,255,0.76)", fontSize: 13, lineHeight: 19, marginTop: 5 },
  tabs: { flexDirection: "row", gap: 8, borderBottomWidth: 1, borderColor: colors.border },
  tabButton: { paddingHorizontal: 11, paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: "transparent" },
  activeTab: { borderBottomColor: colors.ink },
  tabText: { color: colors.muted, fontSize: 11, fontWeight: "700" },
  activeTabText: { color: colors.ink },
  panel: { gap: 13 },
  panelTitle: { color: colors.ink, fontSize: 16, fontWeight: "800" },
  panelSubtitle: { color: colors.muted, fontSize: 10, marginTop: 3 },
  fieldWrap: { flex: 1, gap: 6 },
  fieldLabel: { color: colors.muted, fontSize: 9, fontWeight: "800", letterSpacing: 0.45 },
  selectField: { minHeight: 43, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 7, borderWidth: 1, borderColor: colors.border, borderRadius: 11, backgroundColor: "#fff", paddingHorizontal: 10 },
  selectValue: { flex: 1, color: colors.ink, fontSize: 11, fontWeight: "600" },
  placeholder: { color: "#98A2B3", fontWeight: "500" },
  textField: { minHeight: 43, borderWidth: 1, borderColor: colors.border, borderRadius: 11, backgroundColor: "#fff", paddingHorizontal: 11, paddingVertical: 10, color: colors.ink, fontSize: 12 },
  multilineField: { minHeight: 75, paddingTop: 11 },
  typeRow: { flexDirection: "row", gap: 9 },
  typeOption: { flex: 1, minHeight: 43, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: 11, backgroundColor: "#fff", paddingHorizontal: 7 },
  typeOptionActive: { backgroundColor: "#FFF4DF", borderColor: "#F1D39A" },
  typeText: { color: colors.muted, fontSize: 10, fontWeight: "700" },
  typeTextActive: { color: colors.ink },
  fieldsRow: { flexDirection: "row", gap: 10 },
  previewNote: { flexDirection: "row", alignItems: "flex-start", gap: 7, backgroundColor: "#EFF6FF", borderRadius: 10, padding: 10 },
  previewText: { flex: 1, color: colors.info, fontSize: 10, lineHeight: 15 },
  mutedText: { color: colors.muted, fontSize: 11, lineHeight: 17 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  iconButton: { width: 36, height: 36, borderRadius: 11, backgroundColor: colors.paper, alignItems: "center", justifyContent: "center" },
  historyItem: { flexDirection: "row", alignItems: "flex-start", gap: 9, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingVertical: 12 },
  historyIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: "#FFF4DF", alignItems: "center", justifyContent: "center" },
  recordInfo: { flex: 1, minWidth: 0 },
  studentName: { color: colors.ink, fontSize: 12, fontWeight: "800" },
  recordMeta: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 2 },
  recordRemarks: { color: colors.text, fontSize: 10, lineHeight: 15, marginTop: 4 },
  dateText: { color: colors.muted, fontSize: 9, marginTop: 3 },
  tcItem: { flexDirection: "row", alignItems: "center", gap: 9, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingVertical: 12 },
  pdfButton: { minWidth: 54, minHeight: 36, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, borderRadius: 9, backgroundColor: colors.paper, paddingHorizontal: 8 },
  pdfText: { color: colors.ink, fontSize: 10, fontWeight: "800" },
  emptyText: { color: colors.muted, fontSize: 11, textAlign: "center", paddingVertical: 18 },
  emptyState: { alignItems: "center", gap: 8, paddingVertical: 15 },
  errorBox: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: "#F4C7C2", backgroundColor: "#FFF1EF", borderRadius: 11, padding: 11 },
  errorText: { flex: 1, color: colors.alert, fontSize: 10, lineHeight: 15 },
  retryText: { color: colors.info, fontSize: 11, fontWeight: "800" },
  warningBox: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: "#F0D394", backgroundColor: "#FFF8E8", borderRadius: 11, padding: 10 },
  warningText: { flex: 1, color: "#855300", fontSize: 10, lineHeight: 15 },
  modalBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(12,20,35,0.4)" },
  modalCard: { backgroundColor: colors.card, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, paddingBottom: 28 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  modalTitle: { color: colors.ink, fontSize: 17, fontWeight: "800" },
  searchBox: { minHeight: 42, flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 11, paddingHorizontal: 10, marginBottom: 8 },
  searchInput: { flex: 1, color: colors.ink, fontSize: 12, paddingVertical: 8 },
  optionRow: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  optionText: { color: colors.ink, fontSize: 12, fontWeight: "600" },
});
