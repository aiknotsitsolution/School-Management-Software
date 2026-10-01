import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../lib/api";
import { Card, Input, Toast } from "../components/UI";
import { colors } from "../theme";
import type { PlatformPlan, PlatformSubscription } from "../types";

const PAGE_SIZE = 20;
const statuses = [
  "trialing",
  "active",
  "past_due",
  "suspended",
  "cancelled",
  "expired",
];

export default function PlatformSubscriptionsScreen() {
  const [subscriptions, setSubscriptions] = useState<PlatformSubscription[]>(
    [],
  );
  const [plans, setPlans] = useState<PlatformPlan[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [plan, setPlan] = useState("");
  const [expiring, setExpiring] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState("");
  const [detail, setDetail] = useState<PlatformSubscription | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    let current = true;
    api.plans
      .list("limit=100")
      .then((response) => {
        if (current) setPlans(response.data || []);
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let current = true;
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      limit: String(PAGE_SIZE),
    });
    if (debouncedQuery) params.set("q", debouncedQuery);
    if (status) params.set("status", status);
    if (plan) params.set("plan", plan);
    if (expiring) params.set("expiringWithin", expiring);
    api.platform.subscriptions
      .list(params.toString())
      .then((response) => {
        if (!current) return;
        setSubscriptions(response.data || []);
        setTotal(response.total || 0);
        setPages(response.pages || 0);
        setError("");
      })
      .catch((loadError: unknown) => {
        if (current)
          setError(
            (loadError as Error).message || "Unable to load subscriptions.",
          );
      })
      .finally(() => {
        if (current) {
          setLoading(false);
          setRefreshing(false);
        }
      });
    return () => {
      current = false;
    };
  }, [debouncedQuery, status, plan, expiring, page, refreshKey]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    setRefreshKey((value) => value + 1);
  }, []);

  const openDetails = async (id: string) => {
    setSelected(id);
    setDetail(null);
    setDetailLoading(true);
    try {
      const response = await api.platform.subscriptions.details(id);
      setDetail(response.data);
    } catch (detailError) {
      setError(
        (detailError as Error).message ||
          "Unable to load subscription details.",
      );
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <View style={s.root}>
      {!!error && <Toast message={error} onDismiss={() => setError("")} />}
      <ScrollView
        contentContainerStyle={s.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} />
        }
        keyboardShouldPersistTaps="handled"
      >
        <View style={s.heading}>
          <View>
            <Text style={s.eyebrow}>PLATFORM OWNER · BILLING</Text>
            <Text style={s.title}>Subscriptions</Text>
            <Text style={s.subtitle}>
              {total.toLocaleString("en-IN")} subscriptions
            </Text>
          </View>
          <View style={s.headingIcon}>
            <Ionicons name="card" size={21} color={colors.ink} />
          </View>
        </View>

        <View style={s.expiringFilters}>
          {[
            ["7", "Next 7 days"],
            ["15", "Next 15 days"],
            ["30", "Next 30 days"],
          ].map(([value, label]) => (
            <Filter
              key={value}
              label={label}
              selected={expiring === value}
              onPress={() => {
                setExpiring(expiring === value ? "" : value);
                setStatus("");
                setPage(1);
              }}
            />
          ))}
        </View>

        <View style={s.searchBox}>
          <Ionicons name="search" size={17} color={colors.muted} />
          <Input
            placeholder="Search school name or code"
            value={query}
            onChangeText={(value) => {
              setQuery(value);
              setPage(1);
            }}
            style={s.searchInput}
            accessibilityLabel="Search subscriptions"
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
          <Filter
            label="All statuses"
            selected={!status}
            onPress={() => {
              setStatus("");
              setExpiring("");
              setPage(1);
            }}
          />
          {statuses.map((value) => (
            <Filter
              key={value}
              label={value.replace("_", " ")}
              selected={status === value}
              onPress={() => {
                setStatus(status === value ? "" : value);
                setExpiring("");
                setPage(1);
              }}
            />
          ))}
        </ScrollView>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.filters}
        >
          <Filter
            label="All plans"
            selected={!plan}
            onPress={() => {
              setPlan("");
              setPage(1);
            }}
          />
          {plans.map((item) => (
            <Filter
              key={item._id}
              label={item.name}
              selected={plan === item._id}
              onPress={() => {
                setPlan(plan === item._id ? "" : item._id);
                setPage(1);
              }}
            />
          ))}
        </ScrollView>

        <Text style={s.results}>
          Showing {subscriptions.length} of {total.toLocaleString("en-IN")}
        </Text>
        {loading ? (
          <ActivityIndicator
            size="large"
            color={colors.ink}
            style={s.loading}
          />
        ) : subscriptions.length ? (
          <View style={s.list}>
            {subscriptions.map((item) => (
              <Pressable
                key={item._id}
                onPress={() => void openDetails(item._id)}
                accessibilityRole="button"
                accessibilityLabel={`View subscription for ${item.school?.name || "school"}`}
              >
                <Card
                  style={
                    selected === item._id
                      ? { ...s.subscriptionCard, ...s.selectedCard }
                      : s.subscriptionCard
                  }
                >
                  <View style={s.subTop}>
                    <View style={s.schoolIcon}>
                      <Ionicons name="business" size={17} color={colors.ink} />
                    </View>
                    <View style={s.subIdentity}>
                      <Text style={s.schoolName}>
                        {item.school?.name || "—"}
                      </Text>
                      <Text style={s.subMeta}>
                        {item.school?.code || "—"} · {item.plan?.name || "—"}
                      </Text>
                    </View>
                    <StatusBadge status={item.status} />
                  </View>
                  <View style={s.subBottom}>
                    <Text style={s.price}>
                      {formatMoney(item.price, item.currency)}/
                      {item.billingCycle || "—"}
                    </Text>
                    <Text style={s.nextDate}>
                      {item.status === "trialing"
                        ? `Trial ends ${formatDate(item.trialEndDate)}`
                        : `Next billing ${formatDate(item.nextBillingDate)}`}
                    </Text>
                  </View>
                </Card>
              </Pressable>
            ))}
          </View>
        ) : (
          <Text style={s.empty}>
            {error
              ? "Could not load subscriptions."
              : "No subscriptions match these filters."}
          </Text>
        )}

        {pages > 1 && (
          <View style={s.pager}>
            <Pressable
              disabled={page <= 1}
              onPress={() => setPage((value) => value - 1)}
              accessibilityRole="button"
            >
              <Text style={[s.pageAction, page <= 1 && s.disabled]}>
                Previous
              </Text>
            </Pressable>
            <Text style={s.pageText}>
              Page {page} of {pages}
            </Text>
            <Pressable
              disabled={page >= pages}
              onPress={() => setPage((value) => value + 1)}
              accessibilityRole="button"
            >
              <Text style={[s.pageAction, page >= pages && s.disabled]}>
                Next
              </Text>
            </Pressable>
          </View>
        )}

        {!!selected && (
          <Card style={s.detailCard}>
            <View style={s.detailHeading}>
              <Text style={s.sectionTitle}>Subscription details</Text>
              <Pressable
                onPress={() => {
                  setSelected("");
                  setDetail(null);
                }}
                accessibilityRole="button"
                accessibilityLabel="Close details"
              >
                <Ionicons name="close" size={20} color={colors.muted} />
              </Pressable>
            </View>
            {detailLoading ? (
              <ActivityIndicator color={colors.ink} style={{ margin: 20 }} />
            ) : detail ? (
              <>
                <View style={s.detailSchool}>
                  <Text style={s.schoolName}>{detail.school?.name || "—"}</Text>
                  <Text style={s.subMeta}>
                    {detail.school?.code || "—"} ·{" "}
                    {detail.school?.status || "—"}
                  </Text>
                  <StatusBadge status={detail.status} />
                </View>
                <DetailRow label="Plan" value={detail.plan?.name || "—"} />
                <DetailRow
                  label="Amount"
                  value={`${formatMoney(detail.price, detail.currency)}/${detail.billingCycle || "—"}`}
                />
                <DetailRow
                  label="Started"
                  value={formatDate(detail.startDate)}
                />
                <DetailRow
                  label="Trial ends"
                  value={formatDate(detail.trialEndDate)}
                />
                <DetailRow
                  label="Next billing"
                  value={formatDate(detail.nextBillingDate)}
                />
                <DetailRow
                  label="Current period"
                  value={`${formatDate(detail.currentPeriodStart)} – ${formatDate(detail.currentPeriodEnd)}`}
                />
                <Text style={s.sectionTitle}>
                  Invoices ({detail.invoices?.length || 0})
                </Text>
                {detail.invoices?.length ? (
                  detail.invoices.slice(0, 10).map((invoice, index) => (
                    <View key={invoice._id || index} style={s.historyRow}>
                      <View style={s.historyMain}>
                        <Text style={s.historyTitle}>
                          {invoice.invoiceNumber || "Invoice"}
                        </Text>
                        <Text style={s.historyMeta}>
                          {formatDate(invoice.periodStart)} –{" "}
                          {formatDate(invoice.periodEnd)}
                        </Text>
                      </View>
                      <Text style={s.historyAmount}>
                        {formatMoney(invoice.amount, invoice.currency)}
                      </Text>
                      <StatusBadge status={invoice.status || "unknown"} />
                    </View>
                  ))
                ) : (
                  <Text style={s.emptyDetail}>No invoices.</Text>
                )}
                <Text style={s.sectionTitle}>
                  Plan history ({detail.history?.length || 0})
                </Text>
                {detail.history?.length ? (
                  detail.history.slice(0, 10).map((entry, index) => (
                    <View key={entry._id || index} style={s.historyRow}>
                      <View style={s.historyMain}>
                        <Text style={s.historyTitle}>
                          {entry.plan?.name || "—"}
                        </Text>
                        <Text style={s.historyMeta}>
                          {formatDate(entry.startDate)}
                        </Text>
                      </View>
                      <StatusBadge status={entry.status} />
                    </View>
                  ))
                ) : (
                  <Text style={s.emptyDetail}>No subscription history.</Text>
                )}
              </>
            ) : (
              <Text style={s.emptyDetail}>
                Could not load subscription details.
              </Text>
            )}
          </Card>
        )}
      </ScrollView>
    </View>
  );
}

function Filter({
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
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[s.filter, selected && s.selectedFilter]}
    >
      <Text style={[s.filterText, selected && s.selectedFilterText]}>
        {label}
      </Text>
    </Pressable>
  );
}

function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const tone =
    normalized === "active"
      ? s.activeBadge
      : normalized === "trialing"
        ? s.trialBadge
        : normalized === "past_due"
          ? s.dueBadge
          : normalized === "cancelled"
            ? s.cancelledBadge
            : s.neutralBadge;
  return (
    <View style={[s.statusBadge, tone]}>
      <Text style={s.statusText}>{status.replace("_", " ")}</Text>
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.detailRow}>
      <Text style={s.detailLabel}>{label}</Text>
      <Text style={s.detailValue}>{value || "—"}</Text>
    </View>
  );
}

function formatMoney(amount?: number, currency = "INR") {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount || 0);
  } catch {
    return `${currency} ${Number(amount || 0).toLocaleString("en-IN")}`;
  }
}

function formatDate(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
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
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: colors.amber,
    alignItems: "center",
    justifyContent: "center",
  },
  expiringFilters: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  filter: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 15,
    backgroundColor: colors.card,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  selectedFilter: { backgroundColor: colors.ink, borderColor: colors.ink },
  filterText: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  selectedFilterText: { color: "#fff" },
  searchBox: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 11,
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
    paddingVertical: 7,
    backgroundColor: "transparent",
  },
  filters: { flexDirection: "row", alignItems: "center", gap: 6 },
  results: { color: colors.muted, fontSize: 10 },
  loading: { marginTop: 30 },
  list: { gap: 9 },
  subscriptionCard: { padding: 12, gap: 9, borderRadius: 8 },
  selectedCard: { borderColor: colors.info },
  subTop: { flexDirection: "row", alignItems: "center", gap: 9 },
  schoolIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: "#F8EBD4",
    alignItems: "center",
    justifyContent: "center",
  },
  subIdentity: { flex: 1, gap: 3 },
  schoolName: { color: colors.ink, fontSize: 12, fontWeight: "700" },
  subMeta: { color: colors.muted, fontSize: 9 },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: "#F1F2F4",
  },
  statusText: {
    color: colors.ink,
    fontSize: 8,
    fontWeight: "800",
    textTransform: "capitalize",
  },
  activeBadge: { backgroundColor: "#E8F5EC" },
  trialBadge: { backgroundColor: "#EAF2F9" },
  dueBadge: { backgroundColor: "#FFF5DF" },
  cancelledBadge: { backgroundColor: "#FFF0ED" },
  neutralBadge: { backgroundColor: "#F1F2F4" },
  subBottom: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 7,
  },
  price: { color: colors.ink, fontSize: 11, fontWeight: "800" },
  nextDate: { color: colors.muted, fontSize: 9 },
  empty: {
    color: colors.muted,
    textAlign: "center",
    fontSize: 12,
    paddingVertical: 28,
  },
  pager: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  pageAction: {
    color: colors.info,
    fontSize: 11,
    fontWeight: "700",
    padding: 8,
  },
  pageText: { color: colors.muted, fontSize: 10 },
  disabled: { opacity: 0.4 },
  detailCard: { gap: 10, borderRadius: 8 },
  detailHeading: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "800",
    marginTop: 5,
  },
  detailSchool: {
    gap: 4,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 6,
  },
  detailLabel: { color: colors.muted, fontSize: 10 },
  detailValue: {
    color: colors.ink,
    flex: 1,
    textAlign: "right",
    fontSize: 10,
    fontWeight: "700",
  },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  historyMain: { flex: 1, gap: 3 },
  historyTitle: { color: colors.ink, fontSize: 10, fontWeight: "700" },
  historyMeta: { color: colors.muted, fontSize: 8 },
  historyAmount: { color: colors.ink, fontSize: 9, fontWeight: "700" },
  emptyDetail: { color: colors.muted, fontSize: 10, paddingVertical: 7 },
});
