import React, { useCallback, useEffect, useMemo, useState } from "react";
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
import { api } from "../lib/api";
import { Button, Card, Input, Toast } from "../components/UI";
import { useAuth } from "../context/AuthContext";
import { colors } from "../theme";
import type { Notice } from "../types";

const categories = [
  "Academic",
  "Holiday",
  "Sports",
  "Fees",
  "Event",
  "Transport",
  "General",
];
const audiences = [
  { label: "Everyone", value: "all" },
  { label: "Parents", value: "parent" },
  { label: "Students", value: "student" },
  { label: "Teachers", value: "teacher" },
  { label: "Staff", value: "staff" },
];
const blankForm = () => ({
  title: "",
  body: "",
  category: "Academic",
  audience: "all",
  expiryDate: new Date().toISOString().slice(0, 10),
  pinned: false,
  priority: "normal",
});

type NoticeForm = ReturnType<typeof blankForm>;

function normalizeNotice(notice: Notice): Notice {
  return {
    ...notice,
    body: notice.body || notice.description || "",
    category: notice.category || "General",
    audience: notice.audience?.length ? notice.audience : ["all"],
    pinned: Boolean(notice.pinned),
    priority: notice.priority || "normal",
  };
}

function noticeAudience(notice: Notice) {
  const audience = notice.audience || [];
  if (audience.includes("all")) return "Everyone";
  return audience
    .map(
      (role) =>
        audiences.find((option) => option.value === role)?.label || role,
    )
    .join(", ") || "Everyone";
}

function formatDate(value?: string) {
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

export default function NoticesScreen() {
  const { can } = useAuth();
  const canPublish = can("notices:publish");
  const [items, setItems] = useState<Notice[]>([]);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [formVisible, setFormVisible] = useState(false);
  const [editing, setEditing] = useState<Notice | null>(null);
  const [form, setForm] = useState<NoticeForm>(blankForm());

  const load = useCallback(async () => {
    setRefreshing(true);
    setError("");
    try {
      const response = await api.notices.list();
      setItems((response.data || []).map(normalizeNotice));
    } catch (loadError) {
      setError(
        (loadError as Error).message || "Unable to load school notices.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const sortedItems = useMemo(
    () =>
      [...items].sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return (
          new Date(b.expiryDate || b.createdAt || 0).getTime() -
          new Date(a.expiryDate || a.createdAt || 0).getTime()
        );
      }),
    [items],
  );

  const filteredItems = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return sortedItems.filter((item) => {
      const matchesCategory =
        categoryFilter === "All" || item.category === categoryFilter;
      const matchesQuery =
        !needle ||
        [item.title, item.body, noticeAudience(item)]
          .join(" ")
          .toLowerCase()
          .includes(needle);
      return matchesCategory && matchesQuery;
    });
  }, [categoryFilter, query, sortedItems]);

  const pinnedCount = items.filter((item) => item.pinned).length;
  const monthCount = items.filter((item) => {
    const date = new Date(item.createdAt || "");
    const now = new Date();
    return (
      !Number.isNaN(date.getTime()) &&
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear()
    );
  }).length;
  const categoryCount = new Set(items.map((item) => item.category)).size;

  const openCreate = () => {
    setEditing(null);
    setForm(blankForm());
    setError("");
    setFormVisible(true);
  };

  const openEdit = (notice: Notice) => {
    setEditing(notice);
    setForm({
      title: notice.title,
      body: notice.body || notice.description || "",
      category: notice.category || "General",
      audience: notice.audience?.[0] || "all",
      expiryDate: (notice.expiryDate || "").slice(0, 10),
      pinned: Boolean(notice.pinned),
      priority: notice.priority || "normal",
    });
    setError("");
    setFormVisible(true);
  };

  const setField = <K extends keyof NoticeForm>(
    key: K,
    value: NoticeForm[K],
  ) => setForm((previous) => ({ ...previous, [key]: value }));

  const save = async () => {
    if (!form.title.trim() || !form.body.trim()) {
      setError("Notice title and message are required.");
      return;
    }
    if (form.expiryDate && !/^\d{4}-\d{2}-\d{2}$/.test(form.expiryDate)) {
      setError("Date must use YYYY-MM-DD format.");
      return;
    }

    setSaving(true);
    setError("");
    const payload: Partial<Notice> = {
      title: form.title.trim(),
      description: form.body.trim(),
      category: form.category,
      audience: [form.audience],
      classTags: [],
      pinned: form.pinned,
      priority: form.priority,
      expiryDate: form.expiryDate || undefined,
    };
    try {
      const response = editing
        ? await api.notices.update(editing._id, payload)
        : await api.notices.create(payload);
      const updated = normalizeNotice(response.data);
      setItems((previous) =>
        editing
          ? previous.map((item) =>
              item._id === editing._id ? updated : item,
            )
          : [updated, ...previous],
      );
      setFormVisible(false);
      setEditing(null);
      setForm(blankForm());
    } catch (saveError) {
      setError((saveError as Error).message || "Unable to save this notice.");
    } finally {
      setSaving(false);
    }
  };

  const togglePin = async (notice: Notice) => {
    try {
      const response = await api.notices.update(notice._id, {
        pinned: !notice.pinned,
      });
      const updated = normalizeNotice(response.data);
      setItems((previous) =>
        previous.map((item) => (item._id === notice._id ? updated : item)),
      );
    } catch (pinError) {
      setError((pinError as Error).message || "Unable to update pin status.");
    }
  };

  const deleteNotice = (notice: Notice) => {
    Alert.alert(
      "Delete notice?",
      `“${notice.title}” will be permanently removed.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await api.notices.remove(notice._id);
              setItems((previous) =>
                previous.filter((item) => item._id !== notice._id),
              );
            } catch (deleteError) {
              setError(
                (deleteError as Error).message || "Unable to delete notice.",
              );
            }
          },
        },
      ],
    );
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
            <Text style={s.eyebrow}>SCHOOL COMMUNICATION</Text>
            <Text style={s.title}>Notice Board</Text>
            <Text style={s.subtitle}>
              Circulars and announcements for your school community.
            </Text>
          </View>
          {canPublish && (
            <Pressable
              onPress={openCreate}
              style={s.addButton}
              accessibilityRole="button"
              accessibilityLabel="Post notice"
            >
              <Ionicons name="add" size={19} color="#fff" />
              <Text style={s.addButtonText}>Post notice</Text>
            </Pressable>
          )}
        </View>

        <View style={s.stats}>
          <Stat icon="documents-outline" label="Total notices" value={items.length} color={colors.info} />
          <Stat icon="pin-outline" label="Pinned" value={pinnedCount} color={colors.amberDark} />
          <Stat icon="calendar-outline" label="This month" value={monthCount} color={colors.success} />
          <Stat icon="albums-outline" label="Categories" value={categoryCount} color="#7257C8" />
        </View>

        <View style={s.searchBox}>
          <Ionicons name="search" size={17} color={colors.muted} />
          <Input
            value={query}
            onChangeText={setQuery}
            placeholder="Search notices..."
            accessibilityLabel="Search notices"
            style={s.searchInput}
          />
          {!!query && (
            <Pressable
              onPress={() => setQuery("")}
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
          contentContainerStyle={s.filters}
        >
          {["All", ...categories].map((category) => (
            <Pressable
              key={category}
              onPress={() => setCategoryFilter(category)}
              style={[
                s.filter,
                categoryFilter === category && s.filterSelected,
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: categoryFilter === category }}
            >
              <Text
                style={[
                  s.filterText,
                  categoryFilter === category && s.filterTextSelected,
                ]}
              >
                {category}
                {category === "All" ? ` · ${items.length}` : ""}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>
            {categoryFilter === "All" ? "All announcements" : categoryFilter}
          </Text>
          <Text style={s.resultCount}>{filteredItems.length} notices</Text>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color={colors.ink} style={s.loader} />
        ) : filteredItems.length ? (
          <View style={s.list}>
            {filteredItems.map((item) => (
              <Card
                key={item._id}
                style={{
                  ...s.noticeCard,
                  ...(item.pinned ? s.noticeCardPinned : {}),
                  ...(item.priority === "emergency"
                    ? s.noticeCardEmergency
                    : {}),
                }}
              >
                <View style={s.noticeTop}>
                  <View
                    style={[
                      s.categoryIcon,
                      { backgroundColor: categoryColor(item.category) + "18" },
                    ]}
                  >
                    <Ionicons
                      name="megaphone-outline"
                      size={17}
                      color={categoryColor(item.category)}
                    />
                  </View>
                  <View style={s.noticeTags}>
                    <Text
                      style={[
                        s.categoryTag,
                        { color: categoryColor(item.category) },
                      ]}
                    >
                      {item.category}
                    </Text>
                    {item.priority === "emergency" && (
                      <View style={s.emergencyTag}>
                        <Text style={s.emergencyTagText}>EMERGENCY</Text>
                      </View>
                    )}
                    {item.pinned && (
                      <View style={s.pinnedTag}>
                        <Ionicons name="pin" size={10} color={colors.info} />
                        <Text style={s.pinnedTagText}>Pinned</Text>
                      </View>
                    )}
                  </View>
                  {canPublish && (
                    <View style={s.noticeActions}>
                      <Pressable
                        onPress={() => void togglePin(item)}
                        style={s.iconButton}
                        accessibilityRole="button"
                        accessibilityLabel={item.pinned ? "Unpin notice" : "Pin notice"}
                      >
                        <Ionicons
                          name={item.pinned ? "pin" : "pin-outline"}
                          size={16}
                          color={item.pinned ? colors.info : colors.muted}
                        />
                      </Pressable>
                      <Pressable
                        onPress={() => openEdit(item)}
                        style={s.iconButton}
                        accessibilityRole="button"
                        accessibilityLabel="Edit notice"
                      >
                        <Ionicons
                          name="create-outline"
                          size={17}
                          color={colors.info}
                        />
                      </Pressable>
                      <Pressable
                        onPress={() => deleteNotice(item)}
                        style={s.iconButton}
                        accessibilityRole="button"
                        accessibilityLabel="Delete notice"
                      >
                        <Ionicons
                          name="trash-outline"
                          size={16}
                          color={colors.alert}
                        />
                      </Pressable>
                    </View>
                  )}
                </View>
                <Text style={s.noticeTitle}>{item.title}</Text>
                <Text style={s.noticeBody}>{item.body}</Text>
                <View style={s.noticeFooter}>
                  <View style={s.audience}>
                    <Ionicons
                      name="people-outline"
                      size={13}
                      color={colors.muted}
                    />
                    <Text numberOfLines={1} style={s.audienceText}>
                      {noticeAudience(item)}
                    </Text>
                  </View>
                  <Text style={s.date}>{formatDate(item.expiryDate || item.createdAt)}</Text>
                </View>
              </Card>
            ))}
          </View>
        ) : (
          <View style={s.emptyState}>
            <View style={s.emptyIcon}>
              <Ionicons name="megaphone-outline" size={27} color={colors.amberDark} />
            </View>
            <Text style={s.emptyTitle}>
              {query || categoryFilter !== "All"
                ? "No matching notices"
                : "No notices yet"}
            </Text>
            <Text style={s.emptyText}>
              {query || categoryFilter !== "All"
                ? "Try another search or category."
                : "School circulars and announcements will appear here."}
            </Text>
            {canPublish && !query && categoryFilter === "All" && (
              <Button title="Post first notice" onPress={openCreate} />
            )}
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
              <Text style={s.eyebrow}>SCHOOL COMMUNICATION</Text>
              <Text style={s.modalTitle}>
                {editing ? "Edit notice" : "Post notice"}
              </Text>
              <Text style={s.subtitle}>
                Create an official circular or announcement.
              </Text>
            </View>
            <Pressable
              onPress={() => setFormVisible(false)}
              accessibilityRole="button"
              accessibilityLabel="Close form"
            >
              <Ionicons name="close" size={23} color={colors.muted} />
            </Pressable>
          </View>
          {!!error && (
            <View style={s.formError}>
              <Text style={s.formErrorText}>{error}</Text>
            </View>
          )}
          <ScrollView
            contentContainerStyle={s.formContent}
            keyboardShouldPersistTaps="handled"
          >
            <Field
              label="Notice title *"
              value={form.title}
              onChangeText={(value) => setField("title", value)}
              placeholder="Notice title"
            />
            <Field
              label="Message *"
              value={form.body}
              onChangeText={(value) => setField("body", value)}
              placeholder="Write the full notice..."
              multiline
              numberOfLines={5}
              textAlignVertical="top"
            />
            <Text style={s.fieldLabel}>Category</Text>
            <View style={s.optionGrid}>
              {categories.map((category) => (
                <Choice
                  key={category}
                  label={category}
                  selected={form.category === category}
                  onPress={() => setField("category", category)}
                />
              ))}
            </View>
            <Text style={s.fieldLabel}>Audience</Text>
            <View style={s.optionGrid}>
              {audiences.map((audience) => (
                <Choice
                  key={audience.value}
                  label={audience.label}
                  selected={form.audience === audience.value}
                  onPress={() => setField("audience", audience.value)}
                />
              ))}
            </View>
            <Field
              label="Expiry date (YYYY-MM-DD)"
              value={form.expiryDate}
              onChangeText={(value) => setField("expiryDate", value)}
              placeholder="Optional"
            />
            <Pressable
              onPress={() => setField("pinned", !form.pinned)}
              style={s.toggleRow}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: form.pinned }}
            >
              <View style={[s.checkbox, form.pinned && s.checkboxSelected]}>
                {form.pinned && (
                  <Ionicons name="checkmark" size={14} color="#fff" />
                )}
              </View>
              <View style={s.toggleCopy}>
                <Text style={s.toggleTitle}>Pin this notice</Text>
                <Text style={s.toggleHint}>Keep it at the top of the board.</Text>
              </View>
            </Pressable>
            <Pressable
              onPress={() =>
                setField(
                  "priority",
                  form.priority === "emergency" ? "normal" : "emergency",
                )
              }
              style={[
                s.emergencyToggle,
                form.priority === "emergency" && s.emergencyToggleSelected,
              ]}
              accessibilityRole="checkbox"
              accessibilityState={{
                checked: form.priority === "emergency",
              }}
            >
              <View style={s.toggleCopy}>
                <Text style={s.emergencyTitle}>Emergency notice</Text>
                <Text style={s.toggleHint}>
                  Sends a priority alert to the selected audience.
                </Text>
              </View>
              <View
                style={[
                  s.checkbox,
                  form.priority === "emergency" && s.emergencyCheckbox,
                ]}
              >
                {form.priority === "emergency" && (
                  <Ionicons name="checkmark" size={14} color="#fff" />
                )}
              </View>
            </Pressable>
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
                  saving ? "Saving..." : editing ? "Save changes" : "Publish notice"
                }
                onPress={() => void save()}
                loading={saving}
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function categoryColor(category?: string) {
  switch (category) {
    case "Academic":
    case "Event":
      return colors.info;
    case "Holiday":
      return colors.success;
    case "Sports":
      return "#7257C8";
    case "Fees":
      return colors.alert;
    case "Transport":
      return colors.amberDark;
    default:
      return colors.muted;
  }
}

function Stat({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  value: number;
  color: string;
}) {
  return (
    <Card style={s.statCard}>
      <View style={[s.statIcon, { backgroundColor: `${color}18` }]}>
        <Ionicons name={icon} size={16} color={color} />
      </View>
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </Card>
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

function Choice({
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
      style={[s.choice, selected && s.choiceSelected]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      <Text style={[s.choiceText, selected && s.choiceTextSelected]}>
        {label}
      </Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 16, paddingBottom: 32, gap: 15 },
  heading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  headingCopy: { flex: 1 },
  eyebrow: {
    color: colors.amberDark,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  title: { color: colors.ink, fontSize: 23, fontWeight: "800", marginTop: 4 },
  modalTitle: { color: colors.ink, fontSize: 19, fontWeight: "800", marginTop: 4 },
  subtitle: { color: colors.muted, fontSize: 10, marginTop: 3, lineHeight: 15 },
  addButton: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: colors.ink,
  },
  addButtonText: { color: "#fff", fontSize: 9, fontWeight: "700" },
  stats: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  statCard: {
    width: "48%",
    minHeight: 86,
    padding: 11,
    borderRadius: 14,
    gap: 3,
  },
  statIcon: {
    width: 27,
    height: 27,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
  },
  statValue: { color: colors.ink, fontSize: 17, fontWeight: "800" },
  statLabel: { color: colors.muted, fontSize: 9 },
  searchBox: {
    minHeight: 43,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 11,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: "#fff",
  },
  searchInput: {
    flex: 1,
    borderWidth: 0,
    borderRadius: 0,
    paddingHorizontal: 0,
    paddingVertical: 5,
    backgroundColor: "transparent",
    fontSize: 12,
  },
  filters: { flexDirection: "row", gap: 7 },
  filter: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: "#fff",
  },
  filterSelected: { backgroundColor: colors.ink, borderColor: colors.ink },
  filterText: { color: colors.muted, fontSize: 9, fontWeight: "600" },
  filterTextSelected: { color: "#fff" },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
  },
  sectionTitle: { color: colors.ink, fontSize: 14, fontWeight: "800" },
  resultCount: { color: colors.muted, fontSize: 9 },
  loader: { marginTop: 25 },
  list: { gap: 11 },
  noticeCard: { padding: 14, borderRadius: 16, gap: 9 },
  noticeCardPinned: { borderColor: "#C9D8F9", backgroundColor: "#FCFDFF" },
  noticeCardEmergency: { borderColor: "#F0B6B0", borderWidth: 1.5 },
  noticeTop: { flexDirection: "row", alignItems: "center", gap: 7 },
  categoryIcon: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
  },
  noticeTags: { flex: 1, flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 },
  categoryTag: { fontSize: 9, fontWeight: "800", textTransform: "uppercase" },
  emergencyTag: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: "#FDECEA",
  },
  emergencyTagText: { color: colors.alert, fontSize: 7, fontWeight: "900" },
  pinnedTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 5,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: "#EAF1FF",
  },
  pinnedTagText: { color: colors.info, fontSize: 8, fontWeight: "700" },
  noticeActions: { flexDirection: "row", alignItems: "center", gap: 1 },
  iconButton: {
    width: 28,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  noticeTitle: { color: colors.ink, fontSize: 14, fontWeight: "800", lineHeight: 19 },
  noticeBody: { color: colors.muted, fontSize: 11, lineHeight: 17 },
  noticeFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 9,
  },
  audience: { flex: 1, flexDirection: "row", alignItems: "center", gap: 5 },
  audienceText: { flex: 1, color: colors.muted, fontSize: 9 },
  date: { color: colors.muted, fontSize: 9 },
  emptyState: { alignItems: "center", gap: 8, paddingVertical: 35 },
  emptyIcon: {
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 19,
    backgroundColor: "#FFF4D9",
  },
  emptyTitle: { color: colors.ink, fontSize: 14, fontWeight: "800" },
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
  formError: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#F0B6B0",
    backgroundColor: "#FFF1EF",
  },
  formErrorText: { color: colors.alert, fontSize: 10 },
  formContent: { padding: 16, paddingBottom: 28, gap: 12 },
  field: { gap: 5 },
  fieldLabel: { color: colors.ink, fontSize: 10, fontWeight: "700" },
  input: { minHeight: 41, borderRadius: 10, fontSize: 11, paddingVertical: 9 },
  optionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  choice: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: "#fff",
  },
  choiceSelected: { borderColor: colors.ink, backgroundColor: colors.ink },
  choiceText: { color: colors.muted, fontSize: 9, fontWeight: "600" },
  choiceTextSelected: { color: "#fff" },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 11,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#fff",
  },
  toggleCopy: { flex: 1, gap: 3 },
  toggleTitle: { color: colors.ink, fontSize: 10, fontWeight: "700" },
  toggleHint: { color: colors.muted, fontSize: 9, lineHeight: 14 },
  checkbox: {
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    backgroundColor: "#fff",
  },
  checkboxSelected: { borderColor: colors.info, backgroundColor: colors.info },
  emergencyToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 11,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#F0D1CE",
    backgroundColor: "#FFF8F7",
  },
  emergencyToggleSelected: { borderColor: colors.alert, backgroundColor: "#FFF1EF" },
  emergencyTitle: { color: colors.alert, fontSize: 10, fontWeight: "800" },
  emergencyCheckbox: { borderColor: colors.alert, backgroundColor: colors.alert },
  modalActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  actionGrow: { flex: 1 },
});
