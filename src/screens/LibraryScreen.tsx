import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "../components/UI";
import { get } from "../lib/api";
import { extractList, Row } from "../lib/format";
import { colors } from "../theme";

type Issue = Row & {
  _id: string;
  bookTitle?: string;
  bookId?: { title?: string; author?: string; isbn?: string } | string;
  issueDate?: string;
  dueDate?: string;
  returnDate?: string;
  fine?: number;
  status?: string;
};
type Material = Row & {
  _id: string;
  title: string;
  description?: string;
  subject: string;
  class: string;
  section?: string;
  type?: string;
  fileUrl?: string;
  linkUrl?: string;
  fileName?: string;
  fileSize?: number;
  pageCount?: number;
  createdAt?: string;
};
type Tab = "issued" | "materials";
type TypeInfo = { label: string; icon: keyof typeof Ionicons.glyphMap; color: string; bg: string };

const TYPE_INFO: Record<string, TypeInfo> = {
  notes: { label: "Notes", icon: "document-text-outline", color: "#2563C7", bg: "#EAF2FF" },
  worksheet: { label: "Worksheet", icon: "reader-outline", color: "#7A46B7", bg: "#F3ECFC" },
  ebook: { label: "E-Book", icon: "book-outline", color: "#15966A", bg: "#E8F7EF" },
  video: { label: "Video", icon: "play-circle-outline", color: "#D35454", bg: "#FDECEC" },
  link: { label: "Link", icon: "link-outline", color: "#B77912", bg: "#FFF5DF" },
  other: { label: "Other", icon: "document-outline", color: "#667085", bg: "#F0F2F5" },
};

function dateKey(value: unknown): string {
  if (!value) return "";
  const raw = String(value);
  const dateOnly = /^(\d{4}-\d{2}-\d{2})$/.exec(raw);
  if (dateOnly) return dateOnly[1];
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
  return `${values.year}-${values.month}-${values.day}`;
}

function formatDate(value: unknown): string {
  const key = dateKey(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return value ? String(value) : "—";
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
  return date.toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function issueBookTitle(issue: Issue): string {
  if (issue.bookTitle) return issue.bookTitle;
  if (issue.bookId && typeof issue.bookId === "object" && issue.bookId.title) {
    return issue.bookId.title;
  }
  return "Book";
}

function isOverdue(issue: Issue, today: string): boolean {
  return !issue.returnDate && !!issue.dueDate && dateKey(issue.dueDate) < today;
}

function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[s.filterChip, active && s.filterChipActive]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={[s.filterChipText, active && s.filterChipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function IssueCard({
  issue,
  overdue,
}: {
  issue: Issue;
  overdue: boolean;
}) {
  const book =
    issue.bookId && typeof issue.bookId === "object" ? issue.bookId : undefined;
  const returned = Boolean(issue.returnDate) || issue.status === "Returned";
  return (
    <Card style={s.recordCard}>
      <View style={s.recordTop}>
        <View style={s.bookIcon}>
          <Ionicons name="book" size={20} color={colors.amberDark} />
        </View>
        <View style={s.recordInfo}>
          <Text style={s.bookTitle}>{issueBookTitle(issue)}</Text>
          {!!(book?.author || book?.isbn) && (
            <Text style={s.bookMeta}>
              {[book.author, book.isbn ? `ISBN ${book.isbn}` : ""].filter(Boolean).join(" · ")}
            </Text>
          )}
        </View>
        <View
          style={[
            s.statusBadge,
            overdue ? s.overdueBadge : returned ? s.returnedBadge : s.issuedBadge,
          ]}
        >
          <Text
            style={[
              s.statusText,
              overdue ? s.overdueText : returned ? s.returnedText : s.issuedText,
            ]}
          >
            {overdue ? "Overdue" : returned ? "Returned" : "Issued"}
          </Text>
        </View>
      </View>
      <View style={s.dateInfoRow}>
        <View style={s.dateInfo}>
          <Ionicons name="log-in-outline" size={14} color={colors.muted} />
          <Text style={s.dateLabel}>Issued {formatDate(issue.issueDate || issue.createdAt)}</Text>
        </View>
        {returned ? (
          <View style={s.dateInfo}>
            <Ionicons name="checkmark-circle-outline" size={14} color="#15966A" />
            <Text style={s.dateLabel}>Returned {formatDate(issue.returnDate)}</Text>
          </View>
        ) : (
          <View style={s.dateInfo}>
            <Ionicons
              name="calendar-outline"
              size={14}
              color={overdue ? colors.alert : colors.muted}
            />
            <Text style={[s.dateLabel, overdue && { color: colors.alert, fontWeight: "700" }]}>
              Due {formatDate(issue.dueDate)}
            </Text>
          </View>
        )}
      </View>
      {returned && Number(issue.fine) > 0 && (
        <Text style={s.fineText}>Fine: ₹{Number(issue.fine).toLocaleString("en-IN")}</Text>
      )}
    </Card>
  );
}

function MaterialCard({
  material,
  onOpen,
}: {
  material: Material;
  onOpen: (url: string) => void;
}) {
  const type = TYPE_INFO[material.type || "other"] || TYPE_INFO.other;
  const files = Number(material.fileSize);
  const fileSize = Number.isFinite(files) && files > 0
    ? files >= 1024 * 1024
      ? `${(files / (1024 * 1024)).toFixed(1)} MB`
      : `${Math.max(1, Math.round(files / 1024))} KB`
    : "";
  return (
    <Card style={s.materialCard}>
      <View style={s.materialTop}>
        <View style={[s.materialIcon, { backgroundColor: type.bg }]}>
          <Ionicons name={type.icon} size={21} color={type.color} />
        </View>
        <View style={s.recordInfo}>
          <Text style={s.materialTitle}>{material.title}</Text>
          <Text style={s.bookMeta}>
            {material.subject} · Class {material.class}
            {material.section ? ` ${material.section}` : ""}
          </Text>
        </View>
        <View style={[s.typeBadge, { backgroundColor: type.bg }]}>
          <Text style={[s.typeText, { color: type.color }]}>{type.label}</Text>
        </View>
      </View>
      {!!material.description && (
        <Text style={s.description} numberOfLines={3}>{material.description}</Text>
      )}
      {!!(material.fileName || material.pageCount || fileSize) && (
        <Text style={s.fileMeta} numberOfLines={1}>
          {[material.fileName, material.pageCount ? `${material.pageCount} pages` : "", fileSize]
            .filter(Boolean)
            .join(" · ")}
        </Text>
      )}
      <View style={s.materialActions}>
        {!!material.fileUrl && (
          <Pressable
            onPress={() => onOpen(material.fileUrl!)}
            style={[s.openButton, { backgroundColor: type.bg }]}
            accessibilityRole="button"
          >
            <Ionicons name="open-outline" size={15} color={type.color} />
            <Text style={[s.openButtonText, { color: type.color }]}>
              {material.type === "ebook" ? "Read / Open" : "Open file"}
            </Text>
          </Pressable>
        )}
        {!!material.linkUrl && (
          <Pressable
            onPress={() => onOpen(material.linkUrl!)}
            style={[s.openButton, { backgroundColor: "#EAF2FF" }]}
            accessibilityRole="button"
          >
            <Ionicons name="link-outline" size={15} color="#2563C7" />
            <Text style={[s.openButtonText, { color: "#2563C7" }]}>Open link</Text>
          </Pressable>
        )}
        {!!material.createdAt && (
          <Text style={s.createdDate}>{formatDate(material.createdAt)}</Text>
        )}
      </View>
    </Card>
  );
}

export default function LibraryScreen() {
  const [tab, setTab] = useState<Tab>("issued");
  const [issues, setIssues] = useState<Issue[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [issuesLoading, setIssuesLoading] = useState(true);
  const [materialsLoading, setMaterialsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [issuesError, setIssuesError] = useState("");
  const [materialsError, setMaterialsError] = useState("");
  const [search, setSearch] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else {
      setIssuesLoading(true);
      setMaterialsLoading(true);
    }
    setIssuesError("");
    setMaterialsError("");
    const results = await Promise.allSettled([
      get("/library/issues?limit=1000"),
      get("/study-materials?limit=100"),
    ]);
    if (results[0].status === "fulfilled") {
      setIssues(extractList(results[0].value.data) as Issue[]);
    } else {
      setIssuesError(
        results[0].reason instanceof Error
          ? results[0].reason.message
          : "Could not load issued books.",
      );
    }
    if (results[1].status === "fulfilled") {
      setMaterials(extractList(results[1].value.data) as Material[]);
    } else {
      setMaterialsError(
        results[1].reason instanceof Error
          ? results[1].reason.message
          : "Could not load study materials.",
      );
    }
    setIssuesLoading(false);
    setMaterialsLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const today = dateKey(new Date());
  const activeIssues = useMemo(
    () => issues.filter((issue) => !issue.returnDate && issue.status !== "Returned"),
    [issues],
  );
  const returnedIssues = useMemo(
    () => issues.filter((issue) => Boolean(issue.returnDate) || issue.status === "Returned"),
    [issues],
  );
  const overdueCount = activeIssues.filter((issue) => isOverdue(issue, today)).length;

  const subjects = useMemo(
    () => [...new Set(materials.map((item) => item.subject).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [materials],
  );
  const types = useMemo(
    () => [...new Set(materials.map((item) => item.type || "other"))].sort(),
    [materials],
  );
  const filteredMaterials = useMemo(() => {
    const query = search.trim().toLowerCase();
    return materials.filter((item) => {
      const searchable = `${item.title} ${item.subject} ${item.description || ""}`.toLowerCase();
      return (
        (!query || searchable.includes(query)) &&
        (!subjectFilter || item.subject === subjectFilter) &&
        (!typeFilter || (item.type || "other") === typeFilter)
      );
    });
  }, [materials, search, subjectFilter, typeFilter]);

  const openUrl = useCallback(async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert("Unable to open", "This file or link could not be opened on this device.");
    }
  }, []);

  const loading = tab === "issued" ? issuesLoading : materialsLoading;
  const error = tab === "issued" ? issuesError : materialsError;
  const empty = tab === "issued" ? activeIssues.length === 0 : filteredMaterials.length === 0;

  return (
    <FlatList
      style={s.screen}
      contentContainerStyle={s.content}
      data={
        loading || error || empty
          ? []
          : tab === "issued"
            ? activeIssues
            : filteredMaterials
      }
      keyExtractor={(item) => item._id}
      renderItem={({ item }) =>
        tab === "issued" ? (
          <IssueCard issue={item as Issue} overdue={isOverdue(item as Issue, today)} />
        ) : (
          <MaterialCard material={item as Material} onOpen={(url) => void openUrl(url)} />
        )
      }
      ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
      ListHeaderComponent={
        <View>
          <View style={s.hero}>
            <View style={s.heroIcon}>
              <Ionicons name="library-outline" size={25} color="#fff" />
            </View>
            <Text style={s.eyebrow}>LIBRARY</Text>
            <Text style={s.title}>My Library</Text>
            <Text style={s.subtitle}>
              Issued books, e-books and study materials shared with your class.
            </Text>
          </View>
          <View style={s.tabRow}>
            {([
              ["issued", "Issued Books"],
              ["materials", "Study Materials"],
            ] as const).map(([key, label]) => {
              const active = tab === key;
              const count = key === "issued" ? activeIssues.length : materials.length;
              return (
                <Pressable
                  key={key}
                  onPress={() => setTab(key)}
                  style={[s.tabButton, active && s.activeTabButton]}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[s.tabText, active && s.activeTabText]}>
                    {label} ({count})
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {tab === "issued" ? (
            <View style={s.summaryRow}>
              <Card style={s.summaryCard}>
                <Text style={s.summaryValue}>{activeIssues.length}</Text>
                <Text style={s.summaryLabel}>Books with you</Text>
              </Card>
              <Card style={s.summaryCard}>
                <Text style={[s.summaryValue, { color: colors.alert }]}>{overdueCount}</Text>
                <Text style={s.summaryLabel}>Overdue</Text>
              </Card>
            </View>
          ) : (
            <>
              <Card style={s.searchCard}>
                <View style={s.searchRow}>
                  <Ionicons name="search" size={18} color={colors.muted} />
                  <TextInput
                    value={search}
                    onChangeText={setSearch}
                    placeholder="Search materials..."
                    placeholderTextColor="#98A2B3"
                    style={s.searchInput}
                    returnKeyType="search"
                    accessibilityLabel="Search materials"
                  />
                  {!!search && (
                    <Pressable onPress={() => setSearch("")} hitSlop={8}>
                      <Ionicons name="close-circle" size={18} color={colors.muted} />
                    </Pressable>
                  )}
                </View>
              </Card>
              {!!subjects.length && (
                <>
                  <Text style={s.filterHeading}>SUBJECT</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={s.filterRow}
                  >
                    <FilterChip
                      label="All Subjects"
                      active={!subjectFilter}
                      onPress={() => setSubjectFilter("")}
                    />
                    {subjects.map((subject) => (
                      <FilterChip
                        key={subject}
                        label={subject}
                        active={subjectFilter === subject}
                        onPress={() => setSubjectFilter(subject)}
                      />
                    ))}
                  </ScrollView>
                </>
              )}
              {!!types.length && (
                <>
                  <Text style={s.filterHeading}>TYPE</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={s.filterRow}
                  >
                    <FilterChip
                      label="All Types"
                      active={!typeFilter}
                      onPress={() => setTypeFilter("")}
                    />
                    {types.map((type) => (
                      <FilterChip
                        key={type}
                        label={(TYPE_INFO[type] || TYPE_INFO.other).label}
                        active={typeFilter === type}
                        onPress={() => setTypeFilter(type)}
                      />
                    ))}
                  </ScrollView>
                </>
              )}
              <Text style={s.resultsText}>
                {filteredMaterials.length} {filteredMaterials.length === 1 ? "material" : "materials"} found
              </Text>
            </>
          )}
        </View>
      }
      ListEmptyComponent={
        <View style={s.stateContainer}>
          {loading ? (
            <ActivityIndicator size="large" color={colors.amberDark} />
          ) : error ? (
            <>
              <Ionicons name="cloud-offline-outline" size={38} color={colors.alert} />
              <Text style={s.stateTitle}>
                {tab === "issued" ? "Could not load your books" : "Could not load study materials"}
              </Text>
              <Text style={s.stateText}>{error}</Text>
              <Pressable onPress={() => void load()} style={s.retryButton}>
                <Text style={s.retryText}>Retry</Text>
              </Pressable>
            </>
          ) : tab === "issued" ? (
            <>
              <Ionicons name="book-outline" size={42} color={colors.amberDark} />
              <Text style={s.stateTitle}>No books issued</Text>
              <Text style={s.stateText}>
                Books you borrow from the library will show here.
              </Text>
            </>
          ) : materials.length === 0 ? (
            <>
              <Ionicons name="documents-outline" size={42} color={colors.amberDark} />
              <Text style={s.stateTitle}>No materials yet</Text>
              <Text style={s.stateText}>
                Your teacher will upload notes, worksheets and e-books here.
              </Text>
            </>
          ) : (
            <>
              <Ionicons name="search-outline" size={38} color={colors.muted} />
              <Text style={s.stateTitle}>No matches found</Text>
              <Text style={s.stateText}>Try changing your search or filters.</Text>
            </>
          )}
        </View>
      }
      ListFooterComponent={
        tab === "issued" && returnedIssues.length > 0 ? (
          <View style={s.historySection}>
            <Text style={s.sectionTitle}>Returned ({returnedIssues.length})</Text>
            {returnedIssues.map((issue) => (
              <IssueCard
                key={issue._id}
                issue={issue}
                overdue={false}
              />
            ))}
            <Text style={s.footerNote}>
              Return books by the due date to avoid fines. For new issues or renewals, visit the school library.
            </Text>
          </View>
        ) : tab === "issued" ? (
          <Text style={s.footerNote}>
            Return books by the due date to avoid fines. For new issues or renewals, visit the school library.
          </Text>
        ) : null
      }
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void load(true)}
          tintColor={colors.amberDark}
        />
      }
    />
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 16, paddingBottom: 32 },
  hero: { padding: 20, borderRadius: 20, backgroundColor: colors.ink, marginBottom: 14 },
  heroIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 15,
  },
  eyebrow: { color: "#FFD58A", fontSize: 10, fontWeight: "800", letterSpacing: 1.5 },
  title: { color: "#fff", fontSize: 25, fontWeight: "800", marginTop: 4 },
  subtitle: { color: "rgba(255,255,255,0.76)", fontSize: 13, lineHeight: 19, marginTop: 5 },
  tabRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 15,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  tabButton: {
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  activeTabButton: { borderBottomColor: colors.ink },
  tabText: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  activeTabText: { color: colors.ink },
  summaryRow: { flexDirection: "row", gap: 10, marginBottom: 14 },
  summaryCard: { flex: 1, padding: 14 },
  summaryValue: { color: colors.ink, fontSize: 24, fontWeight: "800" },
  summaryLabel: { color: colors.muted, fontSize: 11, marginTop: 3 },
  recordCard: { padding: 14 },
  recordTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  bookIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#FFF4DF",
    justifyContent: "center",
    alignItems: "center",
  },
  recordInfo: { flex: 1, minWidth: 0 },
  bookTitle: { color: colors.ink, fontSize: 14, fontWeight: "800" },
  bookMeta: { color: colors.muted, fontSize: 11, marginTop: 3 },
  statusBadge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 5 },
  overdueBadge: { backgroundColor: "#FDECEC" },
  returnedBadge: { backgroundColor: "#E8F7EF" },
  issuedBadge: { backgroundColor: "#F0F2F5" },
  statusText: { fontSize: 10, fontWeight: "800" },
  overdueText: { color: colors.alert },
  returnedText: { color: "#15966A" },
  issuedText: { color: colors.muted },
  dateInfoRow: { flexDirection: "row", flexWrap: "wrap", gap: 14, marginTop: 12 },
  dateInfo: { flexDirection: "row", alignItems: "center", gap: 5 },
  dateLabel: { color: colors.muted, fontSize: 10 },
  fineText: { color: colors.alert, fontSize: 11, fontWeight: "700", marginTop: 9 },
  searchCard: { paddingHorizontal: 12, paddingVertical: 2, marginBottom: 15 },
  searchRow: { minHeight: 42, flexDirection: "row", alignItems: "center", gap: 8 },
  searchInput: { flex: 1, color: colors.ink, fontSize: 13, paddingVertical: 8 },
  filterHeading: { color: colors.muted, fontSize: 10, fontWeight: "800", letterSpacing: 1, marginBottom: 7 },
  filterRow: { flexDirection: "row", gap: 7, paddingBottom: 13 },
  filterChip: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#fff",
    borderRadius: 18,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  filterChipActive: { backgroundColor: "#FFF4DF", borderColor: "#F1D39A" },
  filterChipText: { color: colors.muted, fontSize: 11, fontWeight: "700" },
  filterChipTextActive: { color: colors.amberDark },
  resultsText: { color: colors.muted, fontSize: 11, fontWeight: "600", marginBottom: 10 },
  materialCard: { padding: 14 },
  materialTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  materialIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  materialTitle: { color: colors.ink, fontSize: 13, fontWeight: "800" },
  typeBadge: { borderRadius: 9, paddingHorizontal: 8, paddingVertical: 5 },
  typeText: { fontSize: 9, fontWeight: "800" },
  description: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 11 },
  fileMeta: { color: colors.muted, fontSize: 10, marginTop: 7 },
  materialActions: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 12 },
  openButton: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 7 },
  openButtonText: { fontSize: 10, fontWeight: "800" },
  createdDate: { marginLeft: "auto", color: colors.muted, fontSize: 10 },
  stateContainer: { alignItems: "center", paddingHorizontal: 20, paddingVertical: 36, gap: 9 },
  stateTitle: { color: colors.ink, fontSize: 15, fontWeight: "800", textAlign: "center" },
  stateText: { color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: "center" },
  retryButton: { marginTop: 5, borderRadius: 10, backgroundColor: colors.ink, paddingHorizontal: 22, paddingVertical: 10 },
  retryText: { color: "#fff", fontSize: 13, fontWeight: "800" },
  historySection: { gap: 10, marginTop: 24 },
  sectionTitle: { color: colors.ink, fontSize: 15, fontWeight: "800", marginBottom: 2 },
  footerNote: { color: colors.muted, fontSize: 11, lineHeight: 17, marginTop: 16 },
});
