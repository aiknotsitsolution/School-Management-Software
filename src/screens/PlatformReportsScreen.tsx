import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../lib/api";
import { Card, Input, Toast } from "../components/UI";
import { colors } from "../theme";
import type { PlatformReport, PlatformReportDefinition } from "../types";

const PAGE_SIZE = 50;

export default function PlatformReportsScreen() {
  const [catalog, setCatalog] = useState<PlatformReportDefinition[]>([]);
  const [type, setType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [report, setReport] = useState<PlatformReport | null>(null);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState("");
  const [ascending, setAscending] = useState(true);
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");

  useEffect(() => {
    let current = true;
    api.platform.reports
      .catalog()
      .then((response) => {
        if (!current) return;
        setCatalog(response.data || []);
        if (response.data?.length) setType(response.data[0].id);
      })
      .catch((loadError: unknown) => {
        if (current)
          setError(
            (loadError as Error).message || "Unable to load report catalog.",
          );
      })
      .finally(() => {
        if (current) setLoadingCatalog(false);
      });
    return () => {
      current = false;
    };
  }, []);

  const columns = report?.columns || [];
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    let output = (report?.rows || []).filter(
      (row) =>
        !needle ||
        Object.values(row).some((value) =>
          displayValue(value).toLowerCase().includes(needle),
        ),
    );
    if (sortKey) {
      output = [...output].sort(
        (left, right) =>
          compareValues(left[sortKey], right[sortKey]) * (ascending ? 1 : -1),
      );
    }
    return output;
  }, [ascending, query, report, sortKey]);
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const visibleRows = rows.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  const generate = async () => {
    if (!type) return;
    if ((from && !validDate(from)) || (to && !validDate(to))) {
      setError("Enter report dates using YYYY-MM-DD format.");
      return;
    }
    if (from && to && new Date(to) < new Date(from)) {
      setError("The end date must be on or after the start date.");
      return;
    }
    setGenerating(true);
    setError("");
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    try {
      const response = await api.platform.reports.generate(
        type,
        params.toString(),
      );
      setReport(response.data);
      setPage(1);
      setQuery("");
      setSortKey("");
      setAscending(true);
    } catch (generateError) {
      setError(
        (generateError as Error).message || "Unable to generate report.",
      );
    } finally {
      setGenerating(false);
    }
  };

  const chooseReport = (item: PlatformReportDefinition) => {
    setType(item.id);
    setReport(null);
    setError("");
  };

  const toggleSort = (column: string) => {
    setPage(1);
    if (sortKey === column) setAscending((value) => !value);
    else {
      setSortKey(column);
      setAscending(true);
    }
  };

  return (
    <View style={s.root}>
      {!!error && <Toast message={error} onDismiss={() => setError("")} />}
      <ScrollView
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={s.heading}>
          <View>
            <Text style={s.eyebrow}>PLATFORM OWNER · INSIGHTS</Text>
            <Text style={s.title}>Reports</Text>
            <Text style={s.subtitle}>Live reports from platform data.</Text>
          </View>
          <View style={s.headingIcon}>
            <Ionicons name="bar-chart" size={22} color={colors.ink} />
          </View>
        </View>

        <Text style={s.sectionTitle}>Report catalog</Text>
        {loadingCatalog ? (
          <ActivityIndicator color={colors.ink} style={s.loader} />
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.catalog}
          >
            {catalog.map((item) => (
              <Pressable
                key={item.id}
                onPress={() => chooseReport(item)}
                accessibilityRole="button"
                accessibilityState={{ selected: type === item.id }}
                style={[s.catalogItem, type === item.id && s.selectedCatalog]}
              >
                <View style={s.catalogIcon}>
                  <Ionicons
                    name="document-text-outline"
                    size={16}
                    color={type === item.id ? colors.ink : colors.info}
                  />
                </View>
                <View style={s.catalogCopy}>
                  <Text
                    numberOfLines={1}
                    style={[
                      s.catalogTitle,
                      type === item.id && s.selectedCatalogText,
                    ]}
                  >
                    {item.title}
                  </Text>
                  <Text style={s.catalogCategory}>{item.category}</Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        )}

        {!!type && (
          <Card style={s.generateCard}>
            <Text style={s.sectionTitle}>Generate report</Text>
            <Text style={s.description}>
              {catalog.find((item) => item.id === type)?.description ||
                "Generate a report from live platform records."}
            </Text>
            <View style={s.dateFields}>
              <View style={s.dateField}>
                <Field
                  label="From (YYYY-MM-DD)"
                  value={from}
                  onChangeText={setFrom}
                  placeholder="Optional"
                />
              </View>
              <View style={s.dateField}>
                <Field
                  label="To (YYYY-MM-DD)"
                  value={to}
                  onChangeText={setTo}
                  placeholder="Optional"
                />
              </View>
            </View>
            <Pressable
              onPress={generate}
              disabled={generating || loadingCatalog}
              accessibilityRole="button"
              style={[
                s.generateButton,
                (generating || loadingCatalog) && s.disabled,
              ]}
            >
              {generating ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Ionicons name="play" size={16} color="#fff" />
              )}
              <Text style={s.generateText}>
                {generating ? "Generating..." : "Generate"}
              </Text>
            </Pressable>
            {report && (
              <Text style={s.reportMeta}>
                {report.meta.title} ·{" "}
                {report.meta.rowCount.toLocaleString("en-IN")} rows ·{" "}
                {formatDateTime(report.meta.generatedAt)}
              </Text>
            )}
          </Card>
        )}

        {report && (
          <View style={s.results}>
            <View style={s.resultsHeader}>
              <Text style={s.sectionTitle}>Results</Text>
              <Text style={s.rowCount}>
                {rows.length.toLocaleString("en-IN")} rows
              </Text>
            </View>
            <View style={s.searchBox}>
              <Ionicons name="search" size={16} color={colors.muted} />
              <Input
                placeholder="Filter report rows"
                value={query}
                onChangeText={(value) => {
                  setQuery(value);
                  setPage(1);
                }}
                style={s.searchInput}
                accessibilityLabel="Filter report rows"
              />
              {!!query && (
                <Pressable
                  onPress={() => setQuery("")}
                  accessibilityRole="button"
                  accessibilityLabel="Clear filter"
                >
                  <Ionicons
                    name="close-circle"
                    size={18}
                    color={colors.muted}
                  />
                </Pressable>
              )}
            </View>
            {columns.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={s.sortColumns}
              >
                {columns.map((column) => (
                  <Pressable
                    key={column}
                    onPress={() => toggleSort(column)}
                    style={[s.sortChip, sortKey === column && s.selectedSort]}
                  >
                    <Text
                      style={[
                        s.sortText,
                        sortKey === column && s.selectedSortText,
                      ]}
                    >
                      {column}
                      {sortKey === column ? (ascending ? " ↑" : " ↓") : ""}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
            {visibleRows.length ? (
              <View style={s.rows}>
                {visibleRows.map((row, index) => (
                  <Card key={`${safePage}-${index}`} style={s.rowCard}>
                    {columns.map((column) => (
                      <View key={column} style={s.dataLine}>
                        <Text style={s.dataLabel}>{column}</Text>
                        <Text selectable style={s.dataValue}>
                          {displayValue(row[column])}
                        </Text>
                      </View>
                    ))}
                  </Card>
                ))}
              </View>
            ) : (
              <Text style={s.empty}>
                {report.rows.length
                  ? "No rows match this filter."
                  : "This report returned no rows."}
              </Text>
            )}
            {pageCount > 1 && (
              <View style={s.pager}>
                <Pressable
                  disabled={safePage <= 1}
                  onPress={() => setPage((value) => Math.max(1, value - 1))}
                  accessibilityRole="button"
                >
                  <Text style={[s.pageAction, safePage <= 1 && s.disabled]}>
                    Previous
                  </Text>
                </Pressable>
                <Text style={s.pageText}>
                  Page {safePage} of {pageCount}
                </Text>
                <Pressable
                  disabled={safePage >= pageCount}
                  onPress={() =>
                    setPage((value) => Math.min(pageCount, value + 1))
                  }
                  accessibilityRole="button"
                >
                  <Text
                    style={[s.pageAction, safePage >= pageCount && s.disabled]}
                  >
                    Next
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </View>
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

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value);
  if (typeof value === "string" && value.includes("T")) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime()))
      return parsed.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
  }
  return String(value);
}

function compareValues(a: unknown, b: unknown) {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return displayValue(a).localeCompare(displayValue(b), "en", {
    numeric: true,
    sensitivity: "base",
  });
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 16, paddingBottom: 30, gap: 13 },
  heading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  eyebrow: { color: colors.amberDark, fontSize: 9, fontWeight: "800" },
  title: { color: colors.ink, fontSize: 23, fontWeight: "800", marginTop: 4 },
  subtitle: { color: colors.muted, fontSize: 11, marginTop: 3 },
  headingIcon: {
    width: 42,
    height: 42,
    borderRadius: 8,
    backgroundColor: colors.amber,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTitle: { color: colors.ink, fontSize: 14, fontWeight: "800" },
  loader: { marginVertical: 18 },
  catalog: { gap: 8, paddingVertical: 2 },
  catalogItem: {
    width: 190,
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  selectedCatalog: { borderColor: colors.ink, backgroundColor: "#F1F3F6" },
  catalogIcon: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: "#EAF2F9",
  },
  catalogCopy: { flex: 1, gap: 3 },
  catalogTitle: { color: colors.ink, fontSize: 11, fontWeight: "700" },
  selectedCatalogText: { color: colors.info },
  catalogCategory: { color: colors.muted, fontSize: 9 },
  generateCard: { gap: 11, borderRadius: 8 },
  description: { color: colors.muted, fontSize: 11, lineHeight: 16 },
  dateFields: { flexDirection: "row", gap: 9 },
  dateField: { flex: 1 },
  field: { gap: 5 },
  fieldLabel: { color: colors.ink, fontSize: 10, fontWeight: "700" },
  input: { minHeight: 40, paddingVertical: 8, fontSize: 11, borderRadius: 8 },
  generateButton: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 8,
    backgroundColor: colors.ink,
  },
  generateText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  disabled: { opacity: 0.4 },
  reportMeta: { color: colors.muted, fontSize: 9 },
  results: { gap: 10 },
  resultsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rowCount: { color: colors.muted, fontSize: 10 },
  searchBox: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.card,
  },
  searchInput: {
    flex: 1,
    borderWidth: 0,
    borderRadius: 0,
    paddingHorizontal: 0,
    paddingVertical: 6,
    backgroundColor: "transparent",
  },
  sortColumns: { gap: 6 },
  sortChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 9,
    paddingVertical: 6,
    backgroundColor: colors.card,
  },
  selectedSort: { backgroundColor: colors.ink, borderColor: colors.ink },
  sortText: { color: colors.muted, fontSize: 9 },
  selectedSortText: { color: "#fff", fontWeight: "700" },
  rows: { gap: 8 },
  rowCard: { padding: 11, borderRadius: 8, gap: 7 },
  dataLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  dataLabel: { flex: 0.8, color: colors.muted, fontSize: 9, fontWeight: "600" },
  dataValue: { flex: 1.4, color: colors.ink, fontSize: 10, textAlign: "right" },
  empty: {
    color: colors.muted,
    textAlign: "center",
    paddingVertical: 26,
    fontSize: 11,
  },
  pager: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  pageAction: {
    color: colors.info,
    fontSize: 11,
    fontWeight: "700",
    padding: 8,
  },
  pageText: { color: colors.muted, fontSize: 10 },
});
