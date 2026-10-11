import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { Ionicons } from "@expo/vector-icons";
import { Card, Input, Toast } from "../components/UI";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { colors } from "../theme";
import type { Student } from "../types";

const PAGE_SIZE = 20;
const classOrder = [
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
const statusOptions = ["All", "Active", "Inactive", "Alumni", "Transferred"];

const fullName = (student: Student) =>
  student.name ||
  [student.firstName, student.lastName].filter(Boolean).join(" ") ||
  "Student";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStudent(value: unknown): value is Student {
  return isRecord(value) && typeof value._id === "string";
}

function extractStudentRows(value: unknown): Student[] | null {
  if (Array.isArray(value)) {
    const rows: Student[] = [];
    for (const entry of value) {
      if (!isStudent(entry)) return null;
      rows.push(entry);
    }
    return rows;
  }
  if (!isRecord(value)) return null;
  const record = value;
  if (Array.isArray(record.data)) return extractStudentRows(record.data);
  if (Array.isArray(record.students)) return extractStudentRows(record.students);
  if (Array.isArray(record.items)) return extractStudentRows(record.items);
  return null;
}

function displayClass(value?: string) {
  if (!value) return "Class —";
  return ["Nursery", "LKG", "UKG"].includes(value)
    ? value
    : `Class ${value}`;
}

function fmtDate(value?: string) {
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

function statusTone(status?: string, deleted = false) {
  if (deleted) return { background: "#FFF0EE", color: colors.alert };
  switch ((status || "").toLowerCase()) {
    case "active":
      return { background: "#EAF7EF", color: colors.success };
    case "alumni":
    case "transferred":
      return { background: "#EEF2F6", color: colors.muted };
    default:
      return { background: "#FFF5E5", color: colors.amberDark };
  }
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
    <Card style={s.summaryCard}>
      <View style={[s.summaryIcon, { backgroundColor: `${tint}18` }]}>
        <Ionicons name={icon} size={16} color={tint} />
      </View>
      <Text style={s.summaryValue}>{value}</Text>
      <Text style={s.summaryLabel}>{label}</Text>
    </Card>
  );
}

function StudentAvatar({
  student,
  size = 44,
}: {
  student: Student;
  size?: number;
}) {
  const [imageError, setImageError] = useState(false);
  useEffect(() => setImageError(false), [student.photoUrl]);
  return student.photoUrl && !imageError ? (
    <Image
      source={{ uri: student.photoUrl }}
      onError={() => setImageError(true)}
      style={{ width: size, height: size, borderRadius: size / 2 }}
    />
  ) : (
    <View
      style={[
        s.avatarFallback,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <Text style={[s.avatarText, { fontSize: Math.max(13, size * 0.34) }]}>
        {initials(fullName(student))}
      </Text>
    </View>
  );
}

function DetailItem({
  label,
  value,
  icon,
}: {
  label: string;
  value?: string | number | null;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View style={s.detailItem}>
      <View style={s.detailLabelRow}>
        {!!icon && <Ionicons name={icon} size={13} color={colors.muted} />}
        <Text style={s.detailLabel}>{label}</Text>
      </View>
      <Text style={s.detailValue}>{value || "—"}</Text>
    </View>
  );
}

export default function StudentsScreen() {
  const { can } = useAuth();
  const canWrite = can("students:write");
  const [items, setItems] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [classFilter, setClassFilter] = useState("All");
  const [sectionFilter, setSectionFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Student | null>(null);
  const [busyAction, setBusyAction] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const deletedParam = includeDeleted ? "&includeDeleted=true" : "";
      const firstPage = await api.students.list(
        `page=1&limit=500${deletedParam}`,
      );
      const firstRows = extractStudentRows(firstPage.data);
      if (!firstRows) {
        throw new Error("Student list response was not in the expected format.");
      }
      const pages = Math.max(1, Number(firstPage.pages) || 1);
      const rows = [...firstRows];
      for (let currentPage = 2; currentPage <= pages; currentPage += 1) {
        const response = await api.students.list(
          `page=${currentPage}&limit=500${deletedParam}`,
        );
        const nextRows = extractStudentRows(response.data);
        if (!nextRows) {
          throw new Error(
            `Student list response for page ${currentPage} was not in the expected format.`,
          );
        }
        rows.push(...nextRows);
      }
      setItems(rows);
    } catch (loadError) {
      setError((loadError as Error).message || "Unable to load student records.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [includeDeleted]);

  useEffect(() => {
    void load();
  }, [load]);

  const availableClasses = useMemo(() => {
    const present = new Set(items.map((student) => student.class).filter(Boolean));
    const ordered = classOrder.filter((value) => present.has(value));
    const custom = [...present]
      .filter((value): value is string => !!value && !classOrder.includes(value))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    return ["All", ...ordered, ...custom];
  }, [items]);

  const availableSections = useMemo(() => {
    const present = new Set(
      items
        .filter(
          (student) =>
            classFilter === "All" || student.class === classFilter,
        )
        .map((student) => student.section)
        .filter(Boolean),
    );
    return [
      "All",
      ...[...present]
        .filter((section): section is string => !!section)
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    ];
  }, [classFilter, items]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items
      .filter((student) => {
        const matchesClass =
          classFilter === "All" || student.class === classFilter;
        const matchesSection =
          sectionFilter === "All" || student.section === sectionFilter;
        const matchesStatus =
          statusFilter === "All" ||
          (student.status || "Active").toLowerCase() ===
            statusFilter.toLowerCase();
        const contact = student.parentContact || student.phone || "";
        const matchesQuery =
          !needle ||
          [
            fullName(student),
            student.admissionNo,
            student.rollNo,
            contact,
            student.parentEmail,
            student.email,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(needle);
        return matchesClass && matchesSection && matchesStatus && matchesQuery;
      })
      .sort((a, b) =>
        String(a.rollNo || "").localeCompare(String(b.rollNo || ""), undefined, {
          numeric: true,
        }),
      );
  }, [classFilter, items, query, sectionFilter, statusFilter]);

  const liveItems = useMemo(
    () => items.filter((student) => !student.deletedAt),
    [items],
  );
  const averageAttendance = liveItems.length
    ? Math.round(
        liveItems.reduce(
          (total, student) => total + (Number(student.attendance) || 0),
          0,
        ) / liveItems.length,
      )
    : 0;
  const paidCount = liveItems.filter(
    (student) => (student.feeStatus || "").toLowerCase() === "paid",
  ).length;
  const visibleItems = filtered.slice(0, page * PAGE_SIZE);

  const selectClass = (value: string) => {
    setClassFilter(value);
    setSectionFilter("All");
    setPage(1);
  };

  const deleteStudent = () => {
    if (!selected) return;
    Alert.alert(
      "Move student to trash?",
      `“${fullName(selected)}” and their record history will be kept and can be restored within the retention period.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Move to trash",
          style: "destructive",
          onPress: () => {
            void (async () => {
              setBusyAction(true);
              setError("");
              try {
                await api.students.remove(selected._id);
                setSelected(null);
                await load(true);
              } catch (actionError) {
                setError(
                  (actionError as Error).message ||
                    "Unable to move this student to trash.",
                );
              } finally {
                setBusyAction(false);
              }
            })();
          },
        },
      ],
    );
  };

  const restoreStudent = async () => {
    if (!selected) return;
    setBusyAction(true);
    setError("");
    try {
      await api.students.restore(selected._id);
      setSelected(null);
      await load(true);
    } catch (actionError) {
      setError((actionError as Error).message || "Unable to restore this student.");
    } finally {
      setBusyAction(false);
    }
  };

  const listHeader = (
    <View style={s.headerContent}>
      {!!error && <Toast message={error} onDismiss={() => setError("")} />}
      <View style={s.heading}>
        <View style={s.headingIcon}>
          <Ionicons name="people" size={22} color={colors.amberDark} />
        </View>
        <View style={s.headingCopy}>
          <Text style={s.eyebrow}>ACADEMICS</Text>
          <Text style={s.title}>Student Database</Text>
          <Text style={s.subtitle}>
            {loading
              ? "Loading student records..."
              : `${liveItems.length} students enrolled across the school.`}
          </Text>
        </View>
      </View>

      <View style={s.summaryGrid}>
        <SummaryCard
          label="Total students"
          value={liveItems.length}
          icon="people-outline"
          tint={colors.info}
        />
        <SummaryCard
          label="Avg attendance"
          value={`${averageAttendance}%`}
          icon="checkmark-circle-outline"
          tint={colors.success}
        />
        <SummaryCard
          label="Fees paid"
          value={paidCount}
          icon="wallet-outline"
          tint={colors.amberDark}
        />
        <SummaryCard
          label="Showing"
          value={filtered.length}
          icon="filter-outline"
          tint={colors.info}
        />
      </View>

      <Card style={s.filterCard}>
        <View style={s.searchRow}>
          <Ionicons name="search" size={17} color={colors.muted} />
          <Input
            value={query}
            onChangeText={(value) => {
              setQuery(value);
              setPage(1);
            }}
            placeholder="Search name, ID, roll or phone..."
            style={s.searchInput}
            accessibilityLabel="Search student database"
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
              <Ionicons name="close-circle" size={17} color={colors.muted} />
            </Pressable>
          )}
        </View>
        <Text style={s.filterLabel}>CLASS</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.chipRow}
        >
          {availableClasses.map((value) => {
            const active = classFilter === value;
            return (
              <Pressable
                key={value}
                onPress={() => selectClass(value)}
                style={[s.filterChip, active && s.filterChipActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text style={[s.filterChipText, active && s.filterChipTextActive]}>
                  {value === "All" ? "All classes" : displayClass(value)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <Text style={s.filterLabel}>SECTION</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.chipRow}
        >
          {availableSections.map((value) => {
            const active = sectionFilter === value;
            return (
              <Pressable
                key={value}
                onPress={() => {
                  setSectionFilter(value);
                  setPage(1);
                }}
                style={[s.filterChip, active && s.filterChipActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text style={[s.filterChipText, active && s.filterChipTextActive]}>
                  {value === "All" ? "All sections" : `Section ${value}`}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <View style={s.statusFilterHeader}>
          <Text style={s.filterLabel}>STATUS</Text>
          {canWrite && (
            <Pressable
              onPress={() => setIncludeDeleted((value) => !value)}
              style={[s.deletedToggle, includeDeleted && s.deletedToggleActive]}
              accessibilityRole="switch"
              accessibilityState={{ checked: includeDeleted }}
            >
              <Ionicons
                name={includeDeleted ? "trash" : "trash-outline"}
                size={12}
                color={includeDeleted ? "#fff" : colors.muted}
              />
              <Text
                style={[
                  s.deletedToggleText,
                  includeDeleted && s.deletedToggleTextActive,
                ]}
              >
                {includeDeleted ? "Showing deleted" : "Show deleted"}
              </Text>
            </Pressable>
          )}
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.chipRow}
        >
          {statusOptions.map((value) => {
            const active = statusFilter === value;
            return (
              <Pressable
                key={value}
                onPress={() => {
                  setStatusFilter(value);
                  setPage(1);
                }}
                style={[s.filterChip, active && s.filterChipActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text style={[s.filterChipText, active && s.filterChipTextActive]}>
                  {value === "All" ? "All statuses" : value}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </Card>

      <View style={s.listHeader}>
        <View>
          <Text style={s.listTitle}>All students</Text>
          <Text style={s.listSubtitle}>
            {filtered.length} {filtered.length === 1 ? "record" : "records"}
          </Text>
        </View>
        <Pressable
          onPress={() => void load(true)}
          disabled={refreshing}
          style={s.refreshButton}
          accessibilityRole="button"
          accessibilityLabel="Refresh student list"
        >
          <Ionicons name="refresh" size={16} color={colors.info} />
        </Pressable>
      </View>
    </View>
  );

  return (
    <View style={s.root}>
      {loading && items.length === 0 ? (
        <View style={s.loadingWrap}>
          <ActivityIndicator size="large" color={colors.info} />
          <Text style={s.loadingText}>Loading student database...</Text>
        </View>
      ) : (
        <FlatList
          data={visibleItems}
          keyExtractor={(student) => student._id}
          contentContainerStyle={s.listContent}
          ListHeaderComponent={listHeader}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load(true)}
            />
          }
          onEndReached={() => {
            if (visibleItems.length < filtered.length) {
              setPage((current) => current + 1);
            }
          }}
          onEndReachedThreshold={0.35}
          ListEmptyComponent={
            error && items.length === 0 ? (
              <Card style={s.emptyCard}>
                <Ionicons
                  name="cloud-offline-outline"
                  size={27}
                  color={colors.alert}
                />
                <Text style={s.emptyTitle}>Couldn’t load students</Text>
                <Text style={s.emptyText}>{error}</Text>
                <Pressable
                  onPress={() => void load()}
                  style={s.retryButton}
                  accessibilityRole="button"
                >
                  <Text style={s.retryText}>Try again</Text>
                </Pressable>
              </Card>
            ) : (
              <Card style={s.emptyCard}>
                <View style={s.emptyIcon}>
                  <Ionicons name="people-outline" size={27} color={colors.info} />
                </View>
                <Text style={s.emptyTitle}>No students found</Text>
                <Text style={s.emptyText}>
                  Try changing the search or filters.
                </Text>
              </Card>
            )
          }
          renderItem={({ item }) => {
            const attendance = Number(item.attendance) || 0;
            const badge = statusTone(item.status, Boolean(item.deletedAt));
            return (
              <Pressable
                onPress={() => setSelected(item)}
                accessibilityRole="button"
                accessibilityLabel={`View profile for ${fullName(item)}`}
              >
                <Card style={s.studentCard}>
                  <StudentAvatar student={item} />
                  <View style={s.studentInfo}>
                    <View style={s.studentTopline}>
                      <Text numberOfLines={1} style={s.studentName}>
                        {fullName(item)}
                      </Text>
                      <View
                        style={[
                          s.statusBadge,
                          { backgroundColor: badge.background },
                        ]}
                      >
                        <Text style={[s.statusText, { color: badge.color }]}>
                          {item.deletedAt ? "Deleted" : item.status || "Active"}
                        </Text>
                      </View>
                    </View>
                    <Text numberOfLines={1} style={s.admission}>
                      ID {item.admissionNo || "—"}
                    </Text>
                    <Text numberOfLines={1} style={s.studentMeta}>
                      {displayClass(item.class)}
                      {item.section ? ` · Section ${item.section}` : ""}
                      {item.rollNo ? ` · Roll ${item.rollNo}` : ""}
                    </Text>
                    <View style={s.studentBottom}>
                      <View style={s.metric}>
                        <Ionicons
                          name="checkmark-circle-outline"
                          size={13}
                          color={
                            attendance >= 90
                              ? colors.success
                              : attendance >= 75
                                ? colors.amberDark
                                : colors.alert
                          }
                        />
                        <Text style={s.metricText}>{attendance}% attendance</Text>
                      </View>
                      <Text style={s.studentMedium}>
                        {item.medium || "Medium —"}
                      </Text>
                    </View>
                  </View>
                  <Ionicons
                    name="chevron-forward"
                    size={16}
                    color="#98A2B3"
                  />
                </Card>
              </Pressable>
            );
          }}
          ListFooterComponent={
            visibleItems.length > 0 && visibleItems.length < filtered.length ? (
              <View style={s.moreLoading}>
                <ActivityIndicator size="small" color={colors.info} />
                <Text style={s.loadingText}>Loading more students...</Text>
              </View>
            ) : visibleItems.length > 0 ? (
              <Text style={s.endText}>You’re viewing all matching students.</Text>
            ) : null
          }
        />
      )}

      <Modal
        visible={!!selected}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSelected(null)}
      >
        {selected && (
          <View style={s.modalRoot}>
            <View style={s.profileHero}>
              <Pressable
                onPress={() => setSelected(null)}
                style={s.closeButton}
                accessibilityRole="button"
                accessibilityLabel="Close student profile"
              >
                <Ionicons name="close" size={20} color="#fff" />
              </Pressable>
              <StudentAvatar student={selected} size={66} />
              <View style={s.profileNameWrap}>
                <Text numberOfLines={1} style={s.profileName}>
                  {fullName(selected)}
                </Text>
                <Text style={s.profileSub}>
                  {selected.admissionNo || "No admission ID"} ·{" "}
                  {displayClass(selected.class)}
                  {selected.section ? `-${selected.section}` : ""}
                  {selected.rollNo ? ` · Roll ${selected.rollNo}` : ""}
                </Text>
              </View>
              {selected.deletedAt && (
                <View style={s.deletedProfileBadge}>
                  <Text style={s.deletedProfileText}>DELETED</Text>
                </View>
              )}
              <View style={s.profileBadges}>
                <View style={s.profileBadge}>
                  <Text style={s.profileBadgeText}>
                    {selected.feeStatus || "Fees pending"}
                  </Text>
                </View>
                <View style={s.profileBadge}>
                  <Text style={s.profileBadgeText}>
                    {selected.house || "No house"} House
                  </Text>
                </View>
                <View style={s.profileBadge}>
                  <Text style={s.profileBadgeText}>
                    {Number(selected.attendance) || 0}% attendance
                  </Text>
                </View>
              </View>
            </View>
            <ScrollView
              contentContainerStyle={s.profileContent}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={s.profileSection}>ACADEMIC DETAILS</Text>
              <View style={s.detailGrid}>
                <DetailItem label="Admission ID" value={selected.admissionNo} />
                <DetailItem
                  label="Class & section"
                  value={`${displayClass(selected.class)} · ${selected.section || "—"}`}
                />
                <DetailItem label="Roll number" value={selected.rollNo} />
                <DetailItem label="Medium" value={selected.medium} />
                <DetailItem label="Gender" value={selected.gender} />
                <DetailItem label="Date of birth" value={fmtDate(selected.dob)} />
                <DetailItem label="Blood group" value={selected.bloodGroup} />
                <DetailItem label="Fee category" value={selected.feeCategory} />
                <DetailItem label="Status" value={selected.status || "Active"} />
                <DetailItem label="Fee status" value={selected.feeStatus} />
              </View>
              <View style={s.profileDivider} />
              <Text style={s.profileSection}>PARENT / GUARDIAN</Text>
              <View style={s.contactBlock}>
                <DetailItem
                  label="Father's name"
                  value={selected.parentName || selected.fatherName}
                  icon="person-outline"
                />
                <DetailItem
                  label="Mother's name"
                  value={selected.motherName}
                  icon="person-outline"
                />
                <DetailItem
                  label="Phone"
                  value={selected.parentContact || selected.phone}
                  icon="call-outline"
                />
                <DetailItem
                  label="Email"
                  value={selected.parentEmail || selected.email}
                  icon="mail-outline"
                />
                <DetailItem
                  label="Address"
                  value={selected.address}
                  icon="location-outline"
                />
              </View>
              {canWrite && (
                <View style={s.profileActions}>
                  {selected.deletedAt ? (
                    <Pressable
                      onPress={() => void restoreStudent()}
                      disabled={busyAction}
                      style={[s.restoreButton, busyAction && s.actionDisabled]}
                      accessibilityRole="button"
                    >
                      {busyAction ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Ionicons
                          name="refresh-circle-outline"
                          size={17}
                          color="#fff"
                        />
                      )}
                      <Text style={s.actionButtonText}>
                        {busyAction ? "Restoring..." : "Restore student"}
                      </Text>
                    </Pressable>
                  ) : (
                    <Pressable
                      onPress={deleteStudent}
                      disabled={busyAction}
                      style={[s.deleteButton, busyAction && s.actionDisabled]}
                      accessibilityRole="button"
                    >
                      <Ionicons
                        name="trash-outline"
                        size={16}
                        color={colors.alert}
                      />
                      <Text style={s.deleteButtonText}>
                        {busyAction ? "Moving..." : "Move to trash"}
                      </Text>
                    </Pressable>
                  )}
                </View>
              )}
            </ScrollView>
          </View>
        )}
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  listContent: { padding: 15, paddingBottom: 30, gap: 10 },
  headerContent: { gap: 13, paddingBottom: 3 },
  heading: { flexDirection: "row", alignItems: "center", gap: 10 },
  headingIcon: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
    backgroundColor: "#FFF2D9",
  },
  headingCopy: { flex: 1, gap: 3 },
  eyebrow: { color: colors.amberDark, fontSize: 8, fontWeight: "800", letterSpacing: 0.8 },
  title: { color: colors.ink, fontSize: 20, fontWeight: "800" },
  subtitle: { color: colors.muted, fontSize: 9, lineHeight: 14 },
  summaryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  summaryCard: { flexBasis: "47%", flexGrow: 1, minHeight: 82, padding: 10, borderRadius: 13, gap: 3 },
  summaryIcon: { width: 25, height: 25, alignItems: "center", justifyContent: "center", borderRadius: 8 },
  summaryValue: { color: colors.ink, fontSize: 16, fontWeight: "800" },
  summaryLabel: { color: colors.muted, fontSize: 8 },
  filterCard: { padding: 11, borderRadius: 14, gap: 10 },
  searchRow: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 9,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: "#fff",
  },
  searchInput: { flex: 1, borderWidth: 0, borderRadius: 0, paddingHorizontal: 0, paddingVertical: 5, backgroundColor: "transparent", fontSize: 10 },
  filterLabel: { color: colors.muted, fontSize: 8, fontWeight: "800", letterSpacing: 0.6 },
  chipRow: { gap: 6, paddingRight: 3 },
  filterChip: { paddingVertical: 6, paddingHorizontal: 9, borderWidth: 1, borderColor: colors.border, borderRadius: 15, backgroundColor: "#fff" },
  filterChipActive: { borderColor: colors.ink, backgroundColor: colors.ink },
  filterChipText: { color: colors.muted, fontSize: 8, fontWeight: "700" },
  filterChipTextActive: { color: "#fff" },
  statusFilterHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  deletedToggle: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 5, paddingHorizontal: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 12 },
  deletedToggleActive: { borderColor: colors.alert, backgroundColor: colors.alert },
  deletedToggleText: { color: colors.muted, fontSize: 8, fontWeight: "700" },
  deletedToggleTextActive: { color: "#fff" },
  listHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 3 },
  listTitle: { color: colors.ink, fontSize: 14, fontWeight: "800" },
  listSubtitle: { color: colors.muted, fontSize: 8, marginTop: 2 },
  refreshButton: { width: 31, height: 31, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: "#EAF1FF" },
  studentCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    padding: 11,
    borderRadius: 14,
    borderColor: "#E0E4EB",
    backgroundColor: "#fff",
    elevation: 1,
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
  },
  avatarFallback: { alignItems: "center", justifyContent: "center", backgroundColor: "#EAF1FF" },
  avatarText: { color: colors.info, fontWeight: "800" },
  studentInfo: { flex: 1, minWidth: 0, gap: 4 },
  studentTopline: { flexDirection: "row", alignItems: "center", gap: 5 },
  studentName: { flex: 1, color: colors.ink, fontSize: 11, fontWeight: "800" },
  statusBadge: { paddingHorizontal: 6, paddingVertical: 3, borderRadius: 9 },
  statusText: { fontSize: 7, fontWeight: "800" },
  admission: { color: colors.info, fontSize: 8, fontWeight: "700" },
  studentMeta: { color: colors.muted, fontSize: 8 },
  studentBottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 5, marginTop: 1 },
  metric: { flexDirection: "row", alignItems: "center", gap: 3 },
  metricText: { color: colors.muted, fontSize: 8 },
  studentMedium: { color: colors.muted, fontSize: 8 },
  emptyCard: { alignItems: "center", gap: 8, padding: 19, borderRadius: 14 },
  emptyIcon: { width: 50, height: 50, alignItems: "center", justifyContent: "center", borderRadius: 17, backgroundColor: "#EAF1FF" },
  emptyTitle: { color: colors.ink, fontSize: 12, fontWeight: "800" },
  emptyText: { color: colors.muted, fontSize: 9, textAlign: "center", lineHeight: 14 },
  retryButton: { marginTop: 4, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, backgroundColor: colors.ink },
  retryText: { color: "#fff", fontSize: 9, fontWeight: "700" },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  loadingText: { color: colors.muted, fontSize: 9 },
  moreLoading: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 7, paddingVertical: 15 },
  endText: { color: colors.muted, fontSize: 8, textAlign: "center", paddingVertical: 12 },
  modalRoot: { flex: 1, backgroundColor: colors.paper },
  profileHero: { position: "relative", flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 10, padding: 17, paddingTop: 42, backgroundColor: colors.ink },
  closeButton: { position: "absolute", top: 9, right: 12, width: 31, height: 31, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: "rgba(255,255,255,0.14)" },
  profileNameWrap: { flex: 1, minWidth: 0, gap: 4 },
  profileName: { color: "#fff", fontSize: 16, fontWeight: "800" },
  profileSub: { color: "rgba(255,255,255,0.75)", fontSize: 9, lineHeight: 14 },
  profileBadges: { width: "100%", flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 3 },
  profileBadge: { paddingHorizontal: 8, paddingVertical: 5, borderWidth: 1, borderColor: "rgba(255,255,255,0.2)", borderRadius: 12, backgroundColor: "rgba(255,255,255,0.12)" },
  profileBadgeText: { color: "#fff", fontSize: 8, fontWeight: "700" },
  deletedProfileBadge: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 9, backgroundColor: colors.alert },
  deletedProfileText: { color: "#fff", fontSize: 7, fontWeight: "800" },
  profileContent: { padding: 16, paddingBottom: 28, gap: 12 },
  profileSection: { color: colors.muted, fontSize: 8, fontWeight: "800", letterSpacing: 0.7 },
  detailGrid: { flexDirection: "row", flexWrap: "wrap", gap: 13 },
  detailItem: { flex: 1, minWidth: "43%", gap: 4 },
  detailLabelRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  detailLabel: { color: colors.muted, fontSize: 8, fontWeight: "700", textTransform: "uppercase" },
  detailValue: { color: colors.ink, fontSize: 10, fontWeight: "600" },
  profileDivider: { height: 1, backgroundColor: colors.border, marginVertical: 2 },
  contactBlock: { gap: 13 },
  profileActions: { flexDirection: "row", justifyContent: "flex-end", marginTop: 8 },
  restoreButton: { minHeight: 40, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 12, borderRadius: 11, backgroundColor: colors.success },
  deleteButton: { minHeight: 40, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 12, borderWidth: 1, borderColor: "#F1C8C3", borderRadius: 11, backgroundColor: "#FFF7F6" },
  actionButtonText: { color: "#fff", fontSize: 9, fontWeight: "800" },
  deleteButtonText: { color: colors.alert, fontSize: 9, fontWeight: "800" },
  actionDisabled: { opacity: 0.6 },
});
