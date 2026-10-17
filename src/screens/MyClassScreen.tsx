import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { Card, Input } from "../components/UI";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { colors } from "../theme";
import type { Student } from "../types";

type TeacherScope = {
  class: string;
  section: string;
  classTeacher: boolean;
};

type AssignmentProfile = {
  classTeacher?: Record<string, unknown>[];
  teachingScopes?: Record<string, unknown>[];
  primaryScope?: { class?: string; section?: string | null } | null;
};

function getScopes(
  profile: AssignmentProfile,
  userClass?: string | null,
  userSection?: string | null,
) {
  const scopes = new Map<string, TeacherScope>();
  const add = (value: Record<string, unknown>, classTeacher: boolean) => {
    const className = typeof value.class === "string" ? value.class.trim() : "";
    if (!className) return;
    const section = typeof value.section === "string" ? value.section.trim() : "";
    const key = `${className}::${section}`;
    const existing = scopes.get(key);
    scopes.set(key, {
      class: className,
      section,
      classTeacher: classTeacher || existing?.classTeacher === true,
    });
  };

  (profile.classTeacher || []).forEach((scope) => add(scope, true));
  (profile.teachingScopes || []).forEach((scope) => add(scope, false));

  const primary = profile.primaryScope;
  if (primary?.class) {
    add({ class: primary.class, section: primary.section }, false);
  }
  if (!scopes.size && (userClass || userSection)) {
    add({ class: userClass, section: userSection }, false);
  }
  return [...scopes.values()];
}

function isStudent(value: unknown): value is Student {
  return (
    !!value &&
    typeof value === "object" &&
    "_id" in value &&
    typeof value._id === "string"
  );
}

function extractStudents(value: unknown): Student[] | null {
  if (Array.isArray(value)) {
    const rows: Student[] = [];
    for (const item of value) {
      if (!isStudent(item)) return null;
      rows.push(item);
    }
    return rows;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["data", "students", "items"]) {
      if (Array.isArray(record[key])) return extractStudents(record[key]);
    }
  }
  return null;
}

const fullName = (student: Student) =>
  student.name ||
  [student.firstName, student.lastName].filter(Boolean).join(" ") ||
  "Student";

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

function StudentAvatar({ student, size = 46 }: { student: Student; size?: number }) {
  const [failed, setFailed] = useState(false);
  const name = fullName(student);
  return student.photoUrl && !failed ? (
    <Image
      source={{ uri: student.photoUrl }}
      onError={() => setFailed(true)}
      style={{ width: size, height: size, borderRadius: size / 2 }}
    />
  ) : (
    <View
      style={[
        styles.avatarFallback,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <Text style={[styles.avatarText, { fontSize: Math.max(14, size * 0.34) }]}>
        {initials(name)}
      </Text>
    </View>
  );
}

function SummaryCard({
  label,
  value,
  icon,
  tint,
}: {
  label: string;
  value: string | number;
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
}) {
  return (
    <Card style={styles.summaryCard}>
      <View style={[styles.summaryIcon, { backgroundColor: `${tint}18` }]}>
        <Ionicons name={icon} size={17} color={tint} />
      </View>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </Card>
  );
}

function ProfileField({ label, value }: { label: string; value?: string | null }) {
  return (
    <View style={styles.profileField}>
      <Text style={styles.profileFieldLabel}>{label}</Text>
      <Text style={styles.profileFieldValue}>{value || "—"}</Text>
    </View>
  );
}

export default function MyClassScreen() {
  const { user } = useAuth();
  const [scopes, setScopes] = useState<TeacherScope[]>([]);
  const [activeScope, setActiveScope] = useState<TeacherScope | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const requestId = useRef(0);

  const loadRoster = useCallback(async (scope: TeacherScope, refresh = false) => {
    const currentRequest = ++requestId.current;
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({
        class: scope.class,
        ...(scope.section ? { section: scope.section } : {}),
        page: "1",
        limit: "500",
      }).toString();
      const firstPage = await api.students.list(query);
      const firstRows = extractStudents(firstPage.data);
      if (!firstRows) throw new Error("Student roster response was not in the expected format.");
      const rows = [...firstRows];
      const pages = Math.max(1, Number(firstPage.pages) || 1);
      for (let page = 2; page <= pages; page += 1) {
        const response = await api.students.list(
          new URLSearchParams({
            class: scope.class,
            ...(scope.section ? { section: scope.section } : {}),
            page: String(page),
            limit: "500",
          }).toString(),
        );
        const nextRows = extractStudents(response.data);
        if (!nextRows) {
          throw new Error(`Student roster response for page ${page} was not in the expected format.`);
        }
        rows.push(...nextRows);
      }
      if (currentRequest === requestId.current) setStudents(rows);
    } catch (loadError) {
      if (currentRequest === requestId.current) {
        setError((loadError as Error).message || "Could not load the class roster.");
        setStudents([]);
      }
    } finally {
      if (currentRequest === requestId.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  const loadAssignments = useCallback(async () => {
    setLoading(true);
    setError("");
    setScopes([]);
    setActiveScope(null);
    setStudents([]);
    try {
      const { data } = await api.assignments.me();
      const nextScopes = getScopes(data, user?.class, user?.section);
      setScopes(nextScopes);
      const preferred =
        nextScopes.find((scope) => scope.classTeacher) || nextScopes[0] || null;
      setActiveScope(preferred);
      if (preferred) {
        await loadRoster(preferred);
      } else {
        setStudents([]);
        setLoading(false);
      }
    } catch (loadError) {
      setError((loadError as Error).message || "Could not load your teaching assignments.");
      setLoading(false);
    }
  }, [loadRoster, user?.class, user?.section]);

  useFocusEffect(
    useCallback(() => {
      void loadAssignments();
      return () => {
        requestId.current += 1;
      };
    }, [loadAssignments]),
  );

  const visibleStudents = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return students
      .filter(
        (student) =>
          !needle ||
          [
            fullName(student),
            student.admissionNo,
            student.rollNo,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(needle),
      )
      .sort((a, b) =>
        String(a.rollNo || "").localeCompare(String(b.rollNo || ""), undefined, {
          numeric: true,
        }),
      );
  }, [search, students]);

  const chooseScope = (scope: TeacherScope) => {
    if (scope.class === activeScope?.class && scope.section === activeScope.section) return;
    setActiveScope(scope);
    setStudents([]);
    setSearch("");
    void loadRoster(scope);
  };

  const activeCount = students.filter(
    (student) => (student.status || "Active").toLowerCase() === "active",
  ).length;
  const boys = students.filter((student) => student.gender?.toLowerCase() === "male").length;
  const girls = students.filter((student) => student.gender?.toLowerCase() === "female").length;
  const completeProfiles = students.filter(
    (student) => student.profileStatus === "complete",
  ).length;
  const scopeLabel = activeScope
    ? `${activeScope.class}${activeScope.section ? `-${activeScope.section}` : ""}`
    : "";

  const header = (
    <View style={styles.content}>
      <View style={styles.heading}>
        <View style={styles.headingIcon}>
          <Ionicons name="people" size={22} color={colors.amberDark} />
        </View>
        <View style={styles.headingCopy}>
          <Text style={styles.eyebrow}>MY TEACHING</Text>
          <Text style={styles.title}>My Class</Text>
          <Text style={styles.subtitle}>
            {activeScope
              ? `${activeScope.classTeacher ? "Class Teacher" : "Teaching"} · Class ${scopeLabel}`
              : "View the students in your assigned class."}
          </Text>
        </View>
      </View>

      {scopes.length > 1 && (
        <View style={styles.scopeSection}>
          <Text style={styles.sectionLabel}>YOUR CLASSES</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {scopes.map((scope) => {
              const selected =
                scope.class === activeScope?.class && scope.section === activeScope.section;
              const label = `${scope.class}${scope.section ? `-${scope.section}` : ""}`;
              return (
                <Pressable
                  key={`${scope.class}::${scope.section}`}
                  onPress={() => chooseScope(scope)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={[styles.scopeChip, selected && styles.scopeChipSelected]}
                >
                  <Text style={[styles.scopeChipText, selected && styles.scopeChipTextSelected]}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      {!loading && !activeScope && !error && (
        <Card style={styles.emptyCard}>
          <Ionicons name="school-outline" size={30} color={colors.info} />
          <Text style={styles.emptyTitle}>No class assigned yet</Text>
          <Text style={styles.emptyText}>
            Ask your school administrator to assign you a class and section. Your student roster will appear here once it is assigned.
          </Text>
        </Card>
      )}

      {!!error && (
        <Card style={styles.errorCard}>
          <Ionicons name="cloud-offline-outline" size={25} color={colors.alert} />
          <Text style={styles.emptyTitle}>
            {activeScope ? "Could not load the class roster" : "Could not load your class"}
          </Text>
          <Text style={styles.emptyText}>{error}</Text>
          <Pressable
            onPress={() => {
              if (activeScope) void loadRoster(activeScope);
              else void loadAssignments();
            }}
            style={styles.retryButton}
            accessibilityRole="button"
          >
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </Card>
      )}

      {activeScope && !error && (
        <>
          <View style={styles.summaryGrid}>
            <SummaryCard label="Total students" value={students.length} icon="people-outline" tint={colors.info} />
            <SummaryCard label="Active" value={activeCount} icon="checkmark-circle-outline" tint={colors.success} />
            <SummaryCard label="Boys / Girls" value={`${boys} / ${girls}`} icon="people-circle-outline" tint={colors.amberDark} />
            <SummaryCard label="Profiles complete" value={`${completeProfiles}/${students.length}`} icon="person-circle-outline" tint={colors.ink} />
          </View>
          <Card style={styles.searchCard}>
            <Ionicons name="search" size={17} color={colors.muted} />
            <Input
              value={search}
              onChangeText={setSearch}
              placeholder="Search name, admission no. or roll no."
              style={styles.searchInput}
              accessibilityLabel="Search class roster"
            />
            {!!search && (
              <Pressable onPress={() => setSearch("")} accessibilityRole="button" accessibilityLabel="Clear search">
                <Ionicons name="close-circle" size={17} color={colors.muted} />
              </Pressable>
            )}
          </Card>
          <View style={styles.listHeading}>
            <View>
              <Text style={styles.listTitle}>Student Roster</Text>
              <Text style={styles.listSubtitle}>
                {loading ? "Loading students..." : `${visibleStudents.length} students`}
              </Text>
            </View>
            <Pressable
              onPress={() => void loadRoster(activeScope, true)}
              style={styles.refreshButton}
              accessibilityRole="button"
              accessibilityLabel="Refresh student roster"
            >
              <Ionicons name="refresh" size={17} color={colors.info} />
            </Pressable>
          </View>
        </>
      )}
    </View>
  );

  return (
    <View style={styles.root}>
      {loading && students.length === 0 && !error ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.ink} />
          <Text style={styles.emptyText}>Loading your class...</Text>
        </View>
      ) : (
        <FlatList
          data={visibleStudents}
          keyExtractor={(student) => student._id}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={header}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => {
              if (activeScope) void loadRoster(activeScope, true);
              else void loadAssignments();
            }} />
          }
          ListEmptyComponent={
            activeScope && !loading && !error ? (
              <Card style={styles.emptyCard}>
                <View style={styles.emptyIcon}>
                  <Ionicons name="people-outline" size={27} color={colors.info} />
                </View>
                <Text style={styles.emptyTitle}>No students found</Text>
                <Text style={styles.emptyText}>
                  {search
                    ? "Try another name, admission number or roll number."
                    : "There are no students in this class and section yet."}
                </Text>
              </Card>
            ) : null
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => setSelectedStudent(item)}
              accessibilityRole="button"
              accessibilityLabel={`View profile for ${fullName(item)}`}
            >
              <Card style={styles.studentCard}>
                <StudentAvatar student={item} />
                <View style={styles.studentInfo}>
                  <View style={styles.studentTopline}>
                    <Text numberOfLines={1} style={styles.studentName}>{fullName(item)}</Text>
                    <View
                      style={[
                        styles.statusBadge,
                        (item.status || "Active").toLowerCase() === "active"
                          ? styles.activeBadge
                          : styles.inactiveBadge,
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusText,
                          (item.status || "Active").toLowerCase() === "active"
                            ? styles.activeText
                            : styles.inactiveText,
                        ]}
                      >
                        {item.status || "Active"}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.admission}>Admission No. {item.admissionNo || "—"}</Text>
                  <Text style={styles.studentMeta}>
                    Class {item.class || activeScope?.class || "—"}
                    {item.section || activeScope?.section ? ` · Section ${item.section || activeScope?.section}` : ""}
                    {item.rollNo ? ` · Roll ${item.rollNo}` : ""}
                  </Text>
                  <Text numberOfLines={1} style={styles.parentText}>
                    Parent: {item.parentName || item.fatherName || item.motherName || "—"}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={17} color="#98A2B3" />
              </Card>
            </Pressable>
          )}
        />
      )}

      <Modal
        visible={!!selectedStudent}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSelectedStudent(null)}
      >
        {selectedStudent && (
          <View style={styles.modalRoot}>
            <View style={styles.profileHero}>
              <Pressable
                onPress={() => setSelectedStudent(null)}
                style={styles.closeButton}
                accessibilityRole="button"
                accessibilityLabel="Close student profile"
              >
                <Ionicons name="close" size={20} color="#fff" />
              </Pressable>
              <StudentAvatar student={selectedStudent} size={68} />
              <Text style={styles.profileName}>{fullName(selectedStudent)}</Text>
              <Text style={styles.profileSubtitle}>
                {selectedStudent.admissionNo || "No admission number"}
                {selectedStudent.rollNo ? ` · Roll ${selectedStudent.rollNo}` : ""}
              </Text>
              <View style={styles.profileStatus}>
                <Text style={styles.profileStatusText}>{selectedStudent.status || "Active"}</Text>
              </View>
            </View>
            <ScrollView contentContainerStyle={styles.profileContent}>
              <Text style={styles.profileSection}>ACADEMIC DETAILS</Text>
              <View style={styles.profileGrid}>
                <ProfileField label="Admission number" value={selectedStudent.admissionNo} />
                <ProfileField
                  label="Class & section"
                  value={`${selectedStudent.class || activeScope?.class || "—"}${selectedStudent.section || activeScope?.section ? ` · ${selectedStudent.section || activeScope?.section}` : ""}`}
                />
                <ProfileField label="Roll number" value={selectedStudent.rollNo} />
                <ProfileField label="Gender" value={selectedStudent.gender} />
                <ProfileField label="Date of birth" value={selectedStudent.dob} />
                <ProfileField label="Profile" value={selectedStudent.profileStatus === "complete" ? "Complete" : "Incomplete"} />
              </View>
              <Text style={styles.profileSection}>PARENT / GUARDIAN</Text>
              <View style={styles.profileGrid}>
                <ProfileField label="Parent name" value={selectedStudent.parentName || selectedStudent.fatherName || selectedStudent.motherName} />
                <ProfileField label="Contact" value={selectedStudent.parentContact || selectedStudent.phone} />
                <ProfileField label="Email" value={selectedStudent.parentEmail || selectedStudent.email} />
                <ProfileField label="Address" value={selectedStudent.address} />
              </View>
            </ScrollView>
          </View>
        )}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  listContent: { padding: 15, paddingBottom: 28, gap: 9 },
  content: { gap: 13, paddingBottom: 3 },
  heading: { flexDirection: "row", alignItems: "center", gap: 11 },
  headingIcon: {
    width: 46,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
    backgroundColor: "#FFF2D9",
  },
  headingCopy: { flex: 1, gap: 3 },
  eyebrow: { color: colors.amberDark, fontSize: 9, fontWeight: "800", letterSpacing: 0.8 },
  title: { color: colors.ink, fontSize: 21, fontWeight: "800" },
  subtitle: { color: colors.muted, fontSize: 11, lineHeight: 16 },
  scopeSection: { gap: 7 },
  sectionLabel: { color: colors.muted, fontSize: 9, fontWeight: "800", letterSpacing: 0.6 },
  chips: { gap: 7, paddingRight: 3 },
  scopeChip: { paddingVertical: 7, paddingHorizontal: 11, borderWidth: 1, borderColor: colors.border, borderRadius: 16, backgroundColor: "#fff" },
  scopeChipSelected: { borderColor: colors.ink, backgroundColor: colors.ink },
  scopeChipText: { color: colors.muted, fontSize: 10, fontWeight: "700" },
  scopeChipTextSelected: { color: "#fff" },
  summaryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  summaryCard: { flexBasis: "47%", flexGrow: 1, minHeight: 87, padding: 11, borderRadius: 14, gap: 4 },
  summaryIcon: { width: 27, height: 27, alignItems: "center", justifyContent: "center", borderRadius: 9 },
  summaryValue: { color: colors.ink, fontSize: 17, fontWeight: "800" },
  summaryLabel: { color: colors.muted, fontSize: 9 },
  searchCard: { minHeight: 44, paddingHorizontal: 11, paddingVertical: 5, borderRadius: 13, flexDirection: "row", alignItems: "center", gap: 8 },
  searchInput: { flex: 1, borderWidth: 0, borderRadius: 0, paddingHorizontal: 0, paddingVertical: 6, backgroundColor: "transparent", fontSize: 11 },
  listHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 2 },
  listTitle: { color: colors.ink, fontSize: 15, fontWeight: "800" },
  listSubtitle: { color: colors.muted, fontSize: 9, marginTop: 2 },
  refreshButton: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: "#EAF1FF" },
  studentCard: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 14, borderColor: "#E0E4EB", backgroundColor: "#fff" },
  avatarFallback: { alignItems: "center", justifyContent: "center", backgroundColor: "#EAF1FF" },
  avatarText: { color: colors.info, fontWeight: "800" },
  studentInfo: { flex: 1, minWidth: 0, gap: 4 },
  studentTopline: { flexDirection: "row", alignItems: "center", gap: 6 },
  studentName: { flex: 1, color: colors.ink, fontSize: 12, fontWeight: "800" },
  statusBadge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 10 },
  activeBadge: { backgroundColor: "#EAF7EF" },
  inactiveBadge: { backgroundColor: "#EEF2F6" },
  statusText: { fontSize: 8, fontWeight: "800" },
  activeText: { color: colors.success },
  inactiveText: { color: colors.muted },
  admission: { color: colors.info, fontSize: 9, fontWeight: "700" },
  studentMeta: { color: colors.muted, fontSize: 9 },
  parentText: { color: colors.muted, fontSize: 9 },
  emptyCard: { alignItems: "center", gap: 9, padding: 20, borderRadius: 14 },
  emptyIcon: { width: 50, height: 50, alignItems: "center", justifyContent: "center", borderRadius: 17, backgroundColor: "#EAF1FF" },
  emptyTitle: { color: colors.ink, fontSize: 13, fontWeight: "800", textAlign: "center" },
  emptyText: { color: colors.muted, fontSize: 10, lineHeight: 15, textAlign: "center" },
  errorCard: { alignItems: "center", gap: 8, padding: 18, borderRadius: 14 },
  retryButton: { marginTop: 3, paddingVertical: 9, paddingHorizontal: 15, borderRadius: 10, backgroundColor: colors.ink },
  retryText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  modalRoot: { flex: 1, backgroundColor: colors.paper },
  profileHero: { alignItems: "center", gap: 8, paddingTop: 35, paddingBottom: 22, paddingHorizontal: 18, backgroundColor: colors.ink },
  closeButton: { position: "absolute", top: 12, right: 14, width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 17, backgroundColor: "#FFFFFF24" },
  profileName: { maxWidth: "90%", color: "#fff", fontSize: 19, fontWeight: "800", textAlign: "center" },
  profileSubtitle: { color: "#E5EAF3", fontSize: 10, textAlign: "center" },
  profileStatus: { marginTop: 2, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, backgroundColor: "#FFFFFF24" },
  profileStatusText: { color: "#fff", fontSize: 9, fontWeight: "700" },
  profileContent: { padding: 16, gap: 10 },
  profileSection: { marginTop: 6, color: colors.amberDark, fontSize: 9, fontWeight: "800", letterSpacing: 0.7 },
  profileGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  profileField: { flexBasis: "47%", flexGrow: 1, minHeight: 55, padding: 10, borderRadius: 11, backgroundColor: "#fff" },
  profileFieldLabel: { color: colors.muted, fontSize: 9 },
  profileFieldValue: { marginTop: 5, color: colors.ink, fontSize: 11, fontWeight: "700" },
});
