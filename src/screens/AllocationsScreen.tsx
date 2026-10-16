import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { Card, Input } from "../components/UI";
import { api } from "../lib/api";
import type { Student, TransportRoute } from "../types";
import { useAuth } from "../context/AuthContext";
import { colors } from "../theme";

type RosterStudent = {
  admissionNo: string;
  name?: string | null;
  class?: string;
  section?: string;
};

function studentName(student: Student) {
  return (
    student.name ||
    [student.firstName, student.lastName].filter(Boolean).join(" ") ||
    "Name unavailable"
  );
}

function InfoMetric({
  label,
  value,
  icon,
  tint,
}: {
  label: string;
  value: number;
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
}) {
  return (
    <Card style={styles.metric}>
      <View style={[styles.metricIcon, { backgroundColor: `${tint}18` }]}>
        <Ionicons name={icon} size={17} color={tint} />
      </View>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </Card>
  );
}

export default function AllocationsScreen() {
  const { can } = useAuth();
  const canUpdate = can("transport:update");
  const [routes, setRoutes] = useState<TransportRoute[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState("");
  const [students, setStudents] = useState<Student[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const searchSequence = useRef(0);

  const loadRoutes = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const { data } = await api.transport.list();
      const nextRoutes = data || [];
      setRoutes(nextRoutes);
      setSelectedRouteId((current) =>
        nextRoutes.some((route) => route._id === current)
          ? current
          : nextRoutes[0]?._id || "",
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not load bus routes.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadRoutes();
    }, [loadRoutes]),
  );

  useEffect(() => {
    const sequence = ++searchSequence.current;
    const query = search.trim();
    if (query.length < 2 || !selectedRouteId) {
      setStudents([]);
      return undefined;
    }
    const timer = setTimeout(() => {
      void api.students
        .list(`q=${encodeURIComponent(query)}&limit=10`)
        .then(({ data }) => {
          if (sequence !== searchSequence.current) return;
          const assignedIds = new Set(
            activeRoute?.assignedStudents?.map(String) || [],
          );
          setStudents(
            (data || []).filter(
              (student) =>
                student.admissionNo &&
                !assignedIds.has(student.admissionNo),
            ),
          );
        })
        .catch((err: unknown) => {
          if (sequence !== searchSequence.current) return;
          setStudents([]);
          setError(
            err instanceof Error
              ? err.message
              : "Could not search for students.",
          );
        });
    }, 350);
    return () => clearTimeout(timer);
  }, [search, selectedRouteId]);

  const activeRoute = routes.find((route) => route._id === selectedRouteId);
  const roster = useMemo<RosterStudent[]>(() => {
    if (!activeRoute) return [];
    if (activeRoute.roster?.length) return activeRoute.roster;
    return (activeRoute.assignedStudents || []).map((admissionNo) => ({
      admissionNo: String(admissionNo),
    }));
  }, [activeRoute]);

  const totals = useMemo(
    () => ({
      allocated: routes.reduce(
        (total, route) => total + (route.assignedStudents?.length || 0),
        0,
      ),
      withStudents: routes.filter(
        (route) => (route.assignedStudents?.length || 0) > 0,
      ).length,
      empty: routes.filter(
        (route) => !(route.assignedStudents?.length || 0),
      ).length,
    }),
    [routes],
  );

  const assign = async (student: Student) => {
    if (!activeRoute || !student.admissionNo || busy) return;
    setBusy(true);
    setError("");
    try {
      await api.transport.assign(activeRoute._id, student.admissionNo);
      setSearch("");
      setStudents([]);
      await loadRoutes(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not assign the student.",
      );
    } finally {
      setBusy(false);
    }
  };

  const removeStudent = (student: RosterStudent) => {
    if (!activeRoute || !canUpdate) return;
    Alert.alert(
      "Remove student from route?",
      `${student.name || student.admissionNo} will be unassigned from Route ${activeRoute.routeNo || ""}.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            void (async () => {
              setBusy(true);
              setError("");
              try {
                await api.transport.unassign(
                  activeRoute._id,
                  student.admissionNo,
                );
                await loadRoutes(true);
              } catch (err) {
                setError(
                  err instanceof Error
                    ? err.message
                    : "Could not remove the student from this route.",
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
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void loadRoutes(true)}
          tintColor={colors.amberDark}
        />
      }
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Ionicons name="people" size={22} color={colors.amberDark} />
        </View>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>TRANSPORT WORKSPACE</Text>
          <Text style={styles.title}>Student Allocations</Text>
          <Text style={styles.subtitle}>Assign students to bus routes.</Text>
        </View>
      </View>

      <View style={styles.metrics}>
        <InfoMetric
          label="Students allocated"
          value={totals.allocated}
          icon="people-outline"
          tint={colors.info}
        />
        <InfoMetric
          label="Routes with students"
          value={totals.withStudents}
          icon="checkmark-circle-outline"
          tint={colors.success}
        />
        <InfoMetric
          label="Empty routes"
          value={totals.empty}
          icon="alert-circle-outline"
          tint={colors.alert}
        />
        <InfoMetric
          label="Routes"
          value={routes.length}
          icon="bus-outline"
          tint={colors.amberDark}
        />
      </View>

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable
            onPress={() => void loadRoutes(true)}
            accessibilityRole="button"
          >
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : null}

      <Card style={styles.panel}>
        <View style={styles.panelTitleRow}>
          <Ionicons name="person-add-outline" size={18} color={colors.amberDark} />
          <Text style={styles.panelTitle}>Assign students</Text>
        </View>
        <Text style={styles.fieldLabel}>Choose a route</Text>
        {loading ? (
          <ActivityIndicator color={colors.amberDark} />
        ) : routes.length ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.routeChoices}
          >
            {routes.map((route) => {
              const selected = route._id === selectedRouteId;
              return (
                <Pressable
                  key={route._id}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => {
                    setSelectedRouteId(route._id);
                    setSearch("");
                    setStudents([]);
                  }}
                  style={[
                    styles.routeChoice,
                    selected && styles.routeChoiceSelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.routeChoiceTitle,
                      selected && styles.routeChoiceTitleSelected,
                    ]}
                  >
                    Route {route.routeNo || "—"}
                  </Text>
                  <Text
                    style={[
                      styles.routeChoiceMeta,
                      selected && styles.routeChoiceMetaSelected,
                    ]}
                  >
                    {route.assignedStudents?.length || 0} students
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : (
          <Text style={styles.emptyText}>
            No bus routes available. Create a route before assigning students.
          </Text>
        )}

        {activeRoute && canUpdate ? (
          <View style={styles.searchGroup}>
            <Text style={styles.fieldLabel}>Find a student</Text>
            <View style={styles.searchInputRow}>
              <Ionicons name="search-outline" size={18} color={colors.muted} />
              <Input
                value={search}
                onChangeText={(value) => {
                  setSearch(value);
                  setError("");
                }}
                placeholder="Search name or admission number"
                autoCorrect={false}
                style={styles.searchInput}
              />
            </View>
            {search.trim().length === 1 ? (
              <Text style={styles.helperText}>
                Enter at least 2 characters to search.
              </Text>
            ) : null}
            {busy ? (
              <ActivityIndicator color={colors.amberDark} />
            ) : null}
            {students.length ? (
              <View style={styles.results}>
                {students.map((student) => (
                  <Pressable
                    key={student._id}
                    disabled={busy || !student.admissionNo}
                    onPress={() => void assign(student)}
                    style={styles.resultRow}
                  >
                    <View style={styles.studentAvatar}>
                      <Ionicons
                        name="person-outline"
                        size={17}
                        color={colors.info}
                      />
                    </View>
                    <View style={styles.studentCopy}>
                      <Text style={styles.studentName}>
                        {studentName(student)}
                      </Text>
                      <Text style={styles.studentMeta}>
                        {student.admissionNo || "No admission number"}
                        {student.class ? ` · Class ${student.class}` : ""}
                        {student.section ? `-${student.section}` : ""}
                      </Text>
                    </View>
                    <Text style={styles.assignAction}>Assign</Text>
                  </Pressable>
                ))}
              </View>
            ) : search.trim().length >= 2 && !busy && !error ? (
              <Text style={styles.emptyText}>
                No unassigned students found for this search.
              </Text>
            ) : null}
            {(activeRoute.assignedStudents?.length || 0) > 0 ? (
              <Text style={styles.helperText}>
                {activeRoute.assignedStudents?.length} students currently on
                Route {activeRoute.routeNo}.
              </Text>
            ) : null}
          </View>
        ) : null}
      </Card>

      <Card style={styles.panel}>
        <View style={styles.panelTitleRow}>
          <Ionicons name="people-outline" size={18} color={colors.amberDark} />
          <Text style={styles.panelTitle}>
            {activeRoute
              ? `Route ${activeRoute.routeNo || ""} students`
              : "Assigned students"}
          </Text>
          {activeRoute ? (
            <View style={styles.countBadge}>
              <Text style={styles.countText}>{roster.length}</Text>
            </View>
          ) : null}
        </View>
        {!activeRoute ? (
          <Text style={styles.emptyText}>
            Select a route to see its student roster.
          </Text>
        ) : roster.length === 0 ? (
          <View style={styles.emptyRoster}>
            <Ionicons name="people-outline" size={27} color={colors.muted} />
            <Text style={styles.emptyText}>
              No students assigned to this route yet.
            </Text>
          </View>
        ) : (
          <View style={styles.roster}>
            {roster.map((student) => (
              <View key={student.admissionNo} style={styles.rosterRow}>
                <View style={styles.studentAvatar}>
                  <Ionicons
                    name="person-outline"
                    size={17}
                    color={colors.muted}
                  />
                </View>
                <View style={styles.studentCopy}>
                  <Text style={styles.studentName}>
                    {student.name || "Name unavailable"}
                  </Text>
                  <Text style={styles.studentMeta}>
                    {student.admissionNo}
                    {student.class ? ` · Class ${student.class}` : ""}
                    {student.section ? `-${student.section}` : ""}
                  </Text>
                </View>
                {canUpdate ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${student.name || student.admissionNo} from route`}
                    disabled={busy}
                    onPress={() => removeStudent(student)}
                    style={styles.removeButton}
                  >
                    <Ionicons
                      name="person-remove-outline"
                      size={17}
                      color={colors.alert}
                    />
                    <Text style={styles.removeText}>Remove</Text>
                  </Pressable>
                ) : null}
              </View>
            ))}
          </View>
        )}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 16, gap: 14, paddingBottom: 36 },
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  headerIcon: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: "#FBF1DF",
    alignItems: "center",
    justifyContent: "center",
  },
  headerCopy: { flex: 1, gap: 3 },
  eyebrow: {
    color: colors.amberDark,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
  },
  title: { color: colors.ink, fontSize: 22, fontWeight: "800" },
  subtitle: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  metric: { width: "47%", flexGrow: 1, padding: 12, gap: 4 },
  metricIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  metricValue: { color: colors.ink, fontSize: 21, fontWeight: "800" },
  metricLabel: { color: colors.muted, fontSize: 10, fontWeight: "600" },
  errorBanner: {
    borderWidth: 1,
    borderColor: colors.alert,
    backgroundColor: "#FFF1EF",
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  errorText: { color: colors.alert, fontSize: 12, lineHeight: 17 },
  retryText: { color: colors.ink, fontSize: 12, fontWeight: "700" },
  panel: { gap: 12 },
  panelTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  panelTitle: { color: colors.ink, fontSize: 15, fontWeight: "800", flex: 1 },
  fieldLabel: { color: colors.muted, fontSize: 11, fontWeight: "700" },
  routeChoices: { gap: 8, paddingVertical: 2 },
  routeChoice: {
    minWidth: 112,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 11,
    backgroundColor: "#fff",
    paddingHorizontal: 11,
    paddingVertical: 9,
    gap: 4,
  },
  routeChoiceSelected: { backgroundColor: colors.ink, borderColor: colors.ink },
  routeChoiceTitle: { color: colors.ink, fontSize: 12, fontWeight: "800" },
  routeChoiceTitleSelected: { color: "#fff" },
  routeChoiceMeta: { color: colors.muted, fontSize: 10 },
  routeChoiceMetaSelected: { color: "#E2E6EF" },
  searchGroup: { gap: 9 },
  searchInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingLeft: 11,
  },
  searchInput: { flex: 1, borderWidth: 0, paddingLeft: 0 },
  helperText: { color: colors.muted, fontSize: 11, lineHeight: 16 },
  results: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    overflow: "hidden",
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 11,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: "#fff",
  },
  studentAvatar: {
    width: 33,
    height: 33,
    borderRadius: 11,
    backgroundColor: "#F0F2F5",
    alignItems: "center",
    justifyContent: "center",
  },
  studentCopy: { flex: 1, gap: 3 },
  studentName: { color: colors.ink, fontSize: 12, fontWeight: "700" },
  studentMeta: { color: colors.muted, fontSize: 10 },
  assignAction: { color: colors.info, fontSize: 11, fontWeight: "800" },
  emptyText: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  countBadge: {
    backgroundColor: "#FBF1DF",
    minWidth: 25,
    height: 25,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  countText: { color: colors.ink, fontSize: 11, fontWeight: "800" },
  emptyRoster: { alignItems: "center", gap: 8, paddingVertical: 12 },
  roster: { gap: 8 },
  rosterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: "#fff",
    padding: 10,
  },
  removeButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  removeText: { color: colors.alert, fontSize: 10, fontWeight: "700" },
});
