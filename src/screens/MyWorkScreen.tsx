import React, { useCallback, useMemo, useState } from "react";
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
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { Card, Input } from "../components/UI";
import { api } from "../lib/api";
import { extractList, type Row } from "../lib/format";
import { colors, radius } from "../theme";

type WorkStatus = "Pending" | "In Progress" | "Completed" | "Overdue";
type WorkType = "teaching" | "external";
type WorkItem = Row & {
  id: string;
  title: string;
  description?: string;
  dueDate?: string;
  assignedBy?: string;
  category: WorkType;
  priority: string;
  storedStatus: WorkStatus;
  status: WorkStatus;
};
type StatusFilter = "All" | WorkStatus;
type TypeFilter = "All" | WorkType;

const STATUS_FILTERS: StatusFilter[] = [
  "All",
  "Pending",
  "In Progress",
  "Completed",
  "Overdue",
];
const STATUS_CHOICES: WorkStatus[] = [
  "Pending",
  "In Progress",
  "Completed",
  "Overdue",
];
const TYPES: { value: TypeFilter; label: string }[] = [
  { value: "All", label: "All types" },
  { value: "teaching", label: "Teaching" },
  { value: "external", label: "External" },
];

const textValue = (value: unknown) =>
  value == null ? "" : String(value).trim();

function dateKey(value: unknown) {
  const raw = textValue(value);
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (name: string) =>
    parts.find((item) => item.type === name)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function formatDate(value: unknown) {
  const key = dateKey(value);
  if (!key) return "No deadline";
  const [year, month, day] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function normalizeItem(row: Row): WorkItem | null {
  const id = textValue(row._id || row.id);
  if (!id) return null;
  const storedStatus = STATUS_CHOICES.includes(row.status as WorkStatus)
    ? (row.status as WorkStatus)
    : "Pending";
  const due = dateKey(row.dueDate);
  const today = dateKey(new Date().toISOString());
  const overdue =
    due !== "" && due < today && storedStatus !== "Completed";
  const category: WorkType = row.category === "teaching" ? "teaching" : "external";
  return {
    ...row,
    id,
    title: textValue(row.title) || "Untitled work",
    description: textValue(row.description) || undefined,
    dueDate: textValue(row.dueDate) || undefined,
    assignedBy: textValue(row.assignedBy) || undefined,
    category,
    priority: textValue(row.priority) || "Medium",
    storedStatus,
    status: overdue && storedStatus === "Pending" ? "Overdue" : storedStatus,
  };
}

function statusColor(status: WorkStatus) {
  switch (status) {
    case "Pending":
      return { backgroundColor: "#FFF4DB", color: colors.amberDark };
    case "In Progress":
      return { backgroundColor: "#EAF2FB", color: colors.info };
    case "Completed":
      return { backgroundColor: "#EAF5EE", color: colors.success };
    case "Overdue":
      return { backgroundColor: "#FFF0ED", color: colors.alert };
  }
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
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.filterChip, selected && styles.filterChipSelected]}
    >
      <Text
        style={[
          styles.filterChipText,
          selected && styles.filterChipTextSelected,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function CountCard({
  title,
  count,
  subtitle,
  icon,
  tint,
}: {
  title: string;
  count: number;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
}) {
  return (
    <Card style={styles.countCard}>
      <View style={[styles.countIcon, { backgroundColor: `${tint}18` }]}>
        <Ionicons name={icon} size={18} color={tint} />
      </View>
      <Text style={styles.countValue}>{count}</Text>
      <Text style={styles.countTitle}>{title}</Text>
      <Text numberOfLines={1} style={styles.countSubtitle}>
        {subtitle}
      </Text>
    </Card>
  );
}

export default function MyWorkScreen() {
  const [items, setItems] = useState<WorkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("All");
  const [statusItem, setStatusItem] = useState<WorkItem | null>(null);
  const [updatingIds, setUpdatingIds] = useState<Record<string, boolean>>({});

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const result = await api.homework.mine();
      setItems(
        extractList(result.data)
          .map(normalizeItem)
          .filter((item): item is WorkItem => item !== null),
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't load your assigned work.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const counts = useMemo(() => {
    const result: Record<StatusFilter, number> = {
      All: items.length,
      Pending: 0,
      "In Progress": 0,
      Completed: 0,
      Overdue: 0,
    };
    items.forEach((item) => {
      result[item.status] += 1;
    });
    return result;
  }, [items]);

  const filtered = useMemo(() => {
    const search = query.trim().toLocaleLowerCase();
    return items
      .filter((item) => {
        if (typeFilter !== "All" && item.category !== typeFilter) return false;
        if (statusFilter !== "All" && item.status !== statusFilter) return false;
        if (!search) return true;
        return [
          item.title,
          item.description,
          item.assignedBy,
          item.category === "teaching" ? "Teaching" : "External",
        ]
          .map(textValue)
          .join(" ")
          .toLocaleLowerCase()
          .includes(search);
      })
      .sort((a, b) => {
        const left = dateKey(a.dueDate) || "9999-12-31";
        const right = dateKey(b.dueDate) || "9999-12-31";
        return left.localeCompare(right);
      });
  }, [items, query, statusFilter, typeFilter]);

  const filtersActive =
    query.trim() !== "" || statusFilter !== "All" || typeFilter !== "All";

  const changeStatus = async (item: WorkItem, status: WorkStatus) => {
    if (item.storedStatus === status || updatingIds[item.id]) {
      setStatusItem(null);
      return;
    }
    const previous = item;
    const today = dateKey(new Date().toISOString());
    const due = dateKey(item.dueDate);
    const displayed =
      due && due < today && status === "Pending" ? "Overdue" : status;
    setItems((current) =>
      current.map((row) =>
        row.id === item.id
          ? { ...row, storedStatus: status, status: displayed }
          : row,
      ),
    );
    setUpdatingIds((current) => ({ ...current, [item.id]: true }));
    setStatusItem(null);
    try {
      await api.homework.updateMyStatus(item.id, status);
    } catch (err) {
      setItems((current) =>
        current.map((row) => (row.id === item.id ? previous : row)),
      );
      setError(
        err instanceof Error ? err.message : "Couldn't update work status.",
      );
    } finally {
      setUpdatingIds((current) => {
        const next = { ...current };
        delete next[item.id];
        return next;
      });
    }
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load(true)}
            tintColor={colors.info}
          />
        }
      >
        <View style={styles.intro}>
          <Text style={styles.eyebrow}>MY ACCOUNT</Text>
          <Text style={styles.title}>My Work</Text>
          <Text style={styles.description}>
            Assignments, deadlines, and progress in one place.
          </Text>
        </View>

        <View style={styles.countGrid}>
          <CountCard
            title="Total"
            count={counts.All}
            subtitle="Assigned to me"
            icon="briefcase-outline"
            tint={colors.info}
          />
          <CountCard
            title="Pending"
            count={counts.Pending}
            subtitle="Not yet started"
            icon="time-outline"
            tint={colors.amberDark}
          />
          <CountCard
            title="In Progress"
            count={counts["In Progress"]}
            subtitle="Currently active"
            icon="trending-up-outline"
            tint={colors.info}
          />
          <CountCard
            title="Completed"
            count={counts.Completed}
            subtitle={`${counts.Overdue} overdue`}
            icon="checkmark-circle-outline"
            tint={colors.success}
          />
        </View>

        <Card style={styles.workCard}>
          <View style={styles.sectionHeading}>
            <View style={styles.headingIcon}>
              <Ionicons name="briefcase-outline" size={18} color={colors.info} />
            </View>
            <View style={styles.headingCopy}>
              <Text style={styles.sectionTitle}>Assigned Work</Text>
              <Text style={styles.sectionSubtitle}>
                {filtered.length} {filtered.length === 1 ? "item" : "items"}
              </Text>
            </View>
          </View>

          <View style={styles.searchBox}>
            <Ionicons name="search-outline" size={18} color={colors.muted} />
            <Input
              value={query}
              onChangeText={setQuery}
              placeholder="Search work..."
              accessibilityLabel="Search assigned work"
              style={styles.searchInput}
              returnKeyType="search"
            />
            {query.length > 0 && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Clear search"
                onPress={() => setQuery("")}
                hitSlop={8}
              >
                <Ionicons name="close-circle" size={19} color={colors.muted} />
              </Pressable>
            )}
          </View>

          <Text style={styles.filterLabel}>TYPE</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
          >
            {TYPES.map((type) => (
              <FilterChip
                key={type.value}
                label={type.label}
                selected={typeFilter === type.value}
                onPress={() => setTypeFilter(type.value)}
              />
            ))}
          </ScrollView>

          <Text style={styles.filterLabel}>STATUS</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
          >
            {STATUS_FILTERS.map((status) => (
              <FilterChip
                key={status}
                label={status === "All" ? "All status" : status}
                selected={statusFilter === status}
                onPress={() => setStatusFilter(status)}
              />
            ))}
          </ScrollView>

          {filtersActive && (
            <Pressable
              onPress={() => {
                setQuery("");
                setTypeFilter("All");
                setStatusFilter("All");
              }}
              style={styles.clearFilters}
              accessibilityRole="button"
            >
              <Ionicons name="close-circle-outline" size={16} color={colors.info} />
              <Text style={styles.clearFiltersText}>Clear filters</Text>
            </Pressable>
          )}
        </Card>

        {error ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle-outline" size={19} color={colors.alert} />
            <Text style={styles.errorText}>{error}</Text>
            <Pressable
              onPress={() => void load()}
              accessibilityRole="button"
              hitSlop={8}
            >
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : null}

        {loading ? (
          <Card style={styles.loadingCard}>
            <ActivityIndicator size="large" color={colors.info} />
            <Text style={styles.loadingText}>Loading your work...</Text>
          </Card>
        ) : filtered.length === 0 ? (
          <Card style={styles.emptyCard}>
            <View style={styles.emptyIcon}>
              <Ionicons name="file-tray-outline" size={27} color={colors.muted} />
            </View>
            <Text style={styles.emptyTitle}>
              {filtersActive
                ? "Nothing matches these filters"
                : "No work assigned yet"}
            </Text>
            <Text style={styles.emptyDescription}>
              {filtersActive
                ? "Try a different search or clear the filters."
                : "Work assigned to you will show up here."}
            </Text>
          </Card>
        ) : (
          <View style={styles.itemList}>
            {filtered.map((item) => {
              const badge = statusColor(item.status);
              const priorityColor =
                item.priority === "High"
                  ? colors.alert
                  : item.priority === "Low"
                    ? colors.success
                    : colors.info;
              return (
                <Card key={item.id} style={styles.itemCard}>
                  <View style={styles.itemTop}>
                    <View style={styles.itemIcon}>
                      <Ionicons
                        name="briefcase-outline"
                        size={20}
                        color={colors.info}
                      />
                    </View>
                    <View style={styles.itemBody}>
                      <Text style={styles.itemTitle}>{item.title}</Text>
                      <View style={styles.badges}>
                        <View
                          style={[
                            styles.badge,
                            item.category === "teaching"
                              ? styles.teachingBadge
                              : styles.externalBadge,
                          ]}
                        >
                          <Text
                            style={[
                              styles.badgeText,
                              {
                                color:
                                  item.category === "teaching"
                                    ? colors.info
                                    : colors.amberDark,
                              },
                            ]}
                          >
                            {item.category === "teaching"
                              ? "Teaching"
                              : "External"}
                          </Text>
                        </View>
                        <View style={[styles.badge, { backgroundColor: badge.backgroundColor }]}>
                          <Text style={[styles.badgeText, { color: badge.color }]}>
                            {item.status}
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.badge,
                            { backgroundColor: `${priorityColor}18` },
                          ]}
                        >
                          <Text style={[styles.badgeText, { color: priorityColor }]}>
                            {item.priority}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </View>

                  {item.description ? (
                    <Text numberOfLines={3} style={styles.itemDescription}>
                      {item.description}
                    </Text>
                  ) : null}

                  <View style={styles.metaRow}>
                    <View style={styles.metaItem}>
                      <Ionicons
                        name="calendar-outline"
                        size={15}
                        color={colors.muted}
                      />
                      <Text style={styles.metaText}>
                        {item.dueDate
                          ? `Due ${formatDate(item.dueDate)}`
                          : "No deadline"}
                      </Text>
                    </View>
                    {item.assignedBy ? (
                      <View style={styles.metaItem}>
                        <Ionicons
                          name="person-outline"
                          size={15}
                          color={colors.muted}
                        />
                        <Text numberOfLines={1} style={styles.metaText}>
                          From {item.assignedBy}
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  <Pressable
                    onPress={() => setStatusItem(item)}
                    disabled={Boolean(updatingIds[item.id])}
                    accessibilityRole="button"
                    accessibilityLabel={`Change status for ${item.title}`}
                    style={[
                      styles.statusButton,
                      updatingIds[item.id] && styles.disabled,
                    ]}
                  >
                    {updatingIds[item.id] ? (
                      <ActivityIndicator size="small" color={colors.info} />
                    ) : (
                      <>
                        <Ionicons
                          name="create-outline"
                          size={16}
                          color={colors.info}
                        />
                        <Text style={styles.statusButtonText}>
                          Update status
                        </Text>
                        <Ionicons
                          name="chevron-down"
                          size={15}
                          color={colors.info}
                        />
                      </>
                    )}
                  </Pressable>
                </Card>
              );
            })}
          </View>
        )}
      </ScrollView>

      <Modal
        visible={statusItem !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setStatusItem(null)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setStatusItem(null)}
        >
          <Pressable style={styles.statusModal} onPress={() => undefined}>
            <Text style={styles.modalTitle}>Update work status</Text>
            {statusItem ? (
              <Text numberOfLines={2} style={styles.modalSubtitle}>
                {statusItem.title}
              </Text>
            ) : null}
            {STATUS_CHOICES.filter(
              (status) =>
                status !== "Overdue" || statusItem?.storedStatus === "Overdue",
            ).map((status) => {
              const selected = statusItem?.storedStatus === status;
              const badge = statusColor(status);
              return (
                <Pressable
                  key={status}
                  onPress={() => {
                    if (statusItem) void changeStatus(statusItem, status);
                  }}
                  style={styles.statusOption}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                >
                  <View style={[styles.badge, { backgroundColor: badge.backgroundColor }]}>
                    <Text style={[styles.badgeText, { color: badge.color }]}>
                      {status}
                    </Text>
                  </View>
                  <View style={styles.flex} />
                  <Ionicons
                    name={selected ? "radio-button-on" : "radio-button-off"}
                    size={20}
                    color={selected ? colors.info : colors.muted}
                  />
                </Pressable>
              );
            })}
            <Pressable
              onPress={() => setStatusItem(null)}
              style={styles.cancelButton}
              accessibilityRole="button"
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 16, paddingBottom: 32, gap: 14 },
  intro: { gap: 4, paddingBottom: 2 },
  eyebrow: {
    color: colors.info,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.4,
  },
  title: { color: colors.ink, fontSize: 27, fontWeight: "800" },
  description: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  countGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  countCard: { width: "48%", flexGrow: 1, minWidth: "44%", gap: 3 },
  countIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  countValue: { color: colors.ink, fontSize: 24, fontWeight: "800" },
  countTitle: { color: colors.text, fontSize: 12, fontWeight: "700" },
  countSubtitle: { color: colors.muted, fontSize: 10 },
  workCard: { padding: 14, gap: 12 },
  sectionHeading: { flexDirection: "row", alignItems: "center", gap: 10 },
  headingIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: "#EAF2FB",
    alignItems: "center",
    justifyContent: "center",
  },
  headingCopy: { flex: 1, gap: 2 },
  sectionTitle: { color: colors.ink, fontSize: 16, fontWeight: "800" },
  sectionSubtitle: { color: colors.muted, fontSize: 11 },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: "#fff",
    paddingHorizontal: 11,
  },
  searchInput: {
    flex: 1,
    borderWidth: 0,
    backgroundColor: "transparent",
    paddingHorizontal: 0,
    paddingVertical: 10,
    fontSize: 13,
  },
  filterLabel: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.7,
    marginBottom: -5,
  },
  filterRow: { gap: 7, paddingRight: 2 },
  filterChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  filterChipSelected: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  filterChipText: { color: colors.muted, fontSize: 11, fontWeight: "600" },
  filterChipTextSelected: { color: "#fff" },
  clearFilters: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    paddingVertical: 2,
  },
  clearFiltersText: { color: colors.info, fontSize: 12, fontWeight: "700" },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: "#F2C6BF",
    borderRadius: radius.md,
    backgroundColor: "#FFF0ED",
  },
  errorText: { flex: 1, color: colors.alert, fontSize: 12, lineHeight: 17 },
  retryText: { color: colors.info, fontSize: 12, fontWeight: "800" },
  loadingCard: { minHeight: 130, alignItems: "center", justifyContent: "center", gap: 10 },
  loadingText: { color: colors.muted, fontSize: 13 },
  emptyCard: { alignItems: "center", paddingVertical: 28, gap: 8 },
  emptyIcon: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: "#F0F1F3",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: { color: colors.ink, fontSize: 14, fontWeight: "800", textAlign: "center" },
  emptyDescription: { color: colors.muted, fontSize: 12, textAlign: "center" },
  itemList: { gap: 10 },
  itemCard: { padding: 14, gap: 11 },
  itemTop: { flexDirection: "row", alignItems: "flex-start", gap: 11 },
  itemIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#EAF2FB",
    alignItems: "center",
    justifyContent: "center",
  },
  itemBody: { flex: 1, minWidth: 0, gap: 7 },
  itemTitle: { color: colors.ink, fontSize: 14, fontWeight: "800" },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  badge: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { fontSize: 10, fontWeight: "700" },
  teachingBadge: { backgroundColor: "#EAF2FB" },
  externalBadge: { backgroundColor: "#FFF4DB" },
  itemDescription: { color: colors.text, fontSize: 12, lineHeight: 18 },
  metaRow: { gap: 7 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  metaText: { color: colors.muted, fontSize: 11, flexShrink: 1 },
  statusButton: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderWidth: 1,
    borderColor: "#C9D9E9",
    borderRadius: radius.md,
    backgroundColor: "#F7FAFD",
    paddingHorizontal: 12,
  },
  statusButtonText: { color: colors.info, fontSize: 12, fontWeight: "700" },
  disabled: { opacity: 0.55 },
  modalBackdrop: {
    flex: 1,
    justifyContent: "center",
    padding: 20,
    backgroundColor: "rgba(22,33,62,0.48)",
  },
  statusModal: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 18,
    gap: 7,
  },
  modalTitle: { color: colors.ink, fontSize: 17, fontWeight: "800" },
  modalSubtitle: { color: colors.muted, fontSize: 12, marginBottom: 4 },
  statusOption: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingVertical: 6,
  },
  flex: { flex: 1 },
  cancelButton: {
    alignItems: "center",
    paddingVertical: 12,
    marginTop: 4,
    borderRadius: radius.md,
    backgroundColor: "#F3F4F6",
  },
  cancelButtonText: { color: colors.ink, fontSize: 13, fontWeight: "700" },
});
