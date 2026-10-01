import React, { useCallback, useEffect, useMemo, useState } from "react";
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
import { Card } from "../components/UI";
import { colors } from "../theme";
import type { PlatformPlan } from "../types";

const limitLabels: Record<string, string> = {
  students: "Students",
  staff: "Staff",
  teachers: "Teachers",
  adminUsers: "Admin users",
  branches: "Branches",
  storageGB: "Storage (GB)",
};

export default function PlatformPlansScreen() {
  const [plans, setPlans] = useState<PlatformPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "inactive">("all");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let current = true;
    setLoading(true);
    api.plans
      .list("limit=100")
      .then((response) => {
        if (!current) return;
        setPlans(response.data || []);
        setError("");
      })
      .catch((loadError: unknown) => {
        if (current)
          setError((loadError as Error).message || "Unable to load plans.");
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
  }, [refreshKey]);

  const visiblePlans = useMemo(
    () =>
      plans.filter(
        (plan) =>
          filter === "all" ||
          (filter === "active"
            ? plan.isActive !== false
            : plan.isActive === false),
      ),
    [filter, plans],
  );
  const refresh = useCallback(() => {
    setRefreshing(true);
    setRefreshKey((value) => value + 1);
  }, []);

  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={s.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} />
      }
    >
      <View style={s.header}>
        <View>
          <Text style={s.eyebrow}>PLATFORM OWNER · BILLING</Text>
          <Text style={s.title}>Plans & Pricing</Text>
          <Text style={s.subtitle}>{plans.length} subscription plans</Text>
        </View>
        <View style={s.headerIcon}>
          <Ionicons name="pricetag" size={21} color={colors.ink} />
        </View>
      </View>

      <View style={s.filters}>
        <Filter
          label={`All (${plans.length})`}
          selected={filter === "all"}
          onPress={() => setFilter("all")}
        />
        <Filter
          label={`Active (${plans.filter((plan) => plan.isActive !== false).length})`}
          selected={filter === "active"}
          onPress={() => setFilter("active")}
        />
        <Filter
          label={`Inactive (${plans.filter((plan) => plan.isActive === false).length})`}
          selected={filter === "inactive"}
          onPress={() => setFilter("inactive")}
        />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.ink} style={s.loading} />
      ) : error ? (
        <View style={s.emptyState}>
          <Text style={s.errorTitle}>Plans unavailable</Text>
          <Text style={s.errorText}>{error}</Text>
          <Pressable
            onPress={refresh}
            accessibilityRole="button"
            style={s.retryButton}
          >
            <Text style={s.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : visiblePlans.length ? (
        <View style={s.list}>
          {visiblePlans.map((plan) => {
            const finiteLimits = Object.entries(plan.limits || {}).filter(
              ([, value]) => value !== null && value !== undefined,
            );
            return (
              <Card key={plan._id} style={s.planCard}>
                <View style={s.planHeading}>
                  <View style={s.planIdentity}>
                    <Text style={s.planName}>{plan.name}</Text>
                    <Text style={s.planCode}>{plan.code}</Text>
                  </View>
                  <View style={s.badges}>
                    <Badge
                      label={plan.isActive === false ? "Inactive" : "Active"}
                      tone={plan.isActive === false ? "inactive" : "active"}
                    />
                    <Badge
                      label={plan.isPublic === false ? "Hidden" : "Public"}
                      tone={plan.isPublic === false ? "neutral" : "public"}
                    />
                  </View>
                </View>

                <View style={s.priceRow}>
                  <Text style={s.price}>
                    {formatPrice(plan.price, plan.currency)}
                  </Text>
                  <Text style={s.cycle}>
                    / {plan.billingCycle || "monthly"}
                  </Text>
                </View>
                <Text style={s.description}>
                  {plan.description || "No description provided."}
                </Text>

                <View style={s.divider} />
                <Text style={s.sectionLabel}>Features</Text>
                {plan.features?.length ? (
                  plan.features.map((feature, index) => (
                    <View key={`${feature}-${index}`} style={s.featureRow}>
                      <Ionicons
                        name="checkmark-circle"
                        size={15}
                        color={colors.success}
                      />
                      <Text style={s.featureText}>{feature}</Text>
                    </View>
                  ))
                ) : (
                  <Text style={s.mutedText}>No listed features.</Text>
                )}

                <View style={s.trialRow}>
                  <Ionicons name="time-outline" size={15} color={colors.info} />
                  <Text style={s.trialText}>
                    {plan.trialDays
                      ? `${plan.trialDays}-day trial`
                      : "No trial"}
                  </Text>
                </View>
                <Text style={s.sectionLabel}>Limits</Text>
                {finiteLimits.length ? (
                  finiteLimits.map(([key, value]) => (
                    <View key={key} style={s.limitRow}>
                      <Text style={s.limitLabel}>
                        {limitLabels[key] || key}
                      </Text>
                      <Text style={s.limitValue}>
                        {Number(value).toLocaleString("en-IN")}
                      </Text>
                    </View>
                  ))
                ) : (
                  <Text style={s.mutedText}>Unlimited limits</Text>
                )}
              </Card>
            );
          })}
        </View>
      ) : (
        <Text style={s.emptyText}>No plans in this category.</Text>
      )}
    </ScrollView>
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

function Badge({
  label,
  tone,
}: {
  label: string;
  tone: "active" | "inactive" | "public" | "neutral";
}) {
  const toneStyle =
    tone === "active"
      ? s.activeBadge
      : tone === "inactive"
        ? s.inactiveBadge
        : tone === "public"
          ? s.publicBadge
          : s.neutralBadge;
  return (
    <View style={[s.badge, toneStyle]}>
      <Text
        style={[
          s.badgeText,
          tone === "active"
            ? s.activeText
            : tone === "inactive"
              ? s.inactiveText
              : tone === "public"
                ? s.publicText
                : s.neutralText,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

function formatPrice(value?: number, currency = "INR") {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value || 0);
  } catch {
    return `${currency} ${Number(value || 0).toLocaleString("en-IN")}`;
  }
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 16, paddingBottom: 30, gap: 14 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  eyebrow: { color: colors.amberDark, fontSize: 9, fontWeight: "800" },
  title: { color: colors.ink, fontSize: 23, fontWeight: "800", marginTop: 4 },
  subtitle: { color: colors.muted, fontSize: 11, marginTop: 3 },
  headerIcon: {
    width: 42,
    height: 42,
    borderRadius: 8,
    backgroundColor: colors.amber,
    alignItems: "center",
    justifyContent: "center",
  },
  filters: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  filter: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingHorizontal: 11,
    paddingVertical: 7,
    backgroundColor: colors.card,
  },
  selectedFilter: { backgroundColor: colors.ink, borderColor: colors.ink },
  filterText: { color: colors.muted, fontSize: 10, fontWeight: "600" },
  selectedFilterText: { color: "#fff" },
  loading: { marginTop: 32 },
  list: { gap: 11 },
  planCard: { borderRadius: 8, padding: 14, gap: 9 },
  planHeading: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  planIdentity: { flex: 1, gap: 2 },
  planName: { color: colors.ink, fontSize: 15, fontWeight: "800" },
  planCode: { color: colors.muted, fontSize: 10 },
  badges: { flexDirection: "row", gap: 5 },
  badge: { borderRadius: 12, paddingHorizontal: 7, paddingVertical: 4 },
  badgeText: { fontSize: 8, fontWeight: "700" },
  activeBadge: { backgroundColor: "#E8F5EC" },
  inactiveBadge: { backgroundColor: "#FFF0ED" },
  publicBadge: { backgroundColor: "#EAF2F9" },
  neutralBadge: { backgroundColor: "#F1F2F4" },
  activeText: { color: colors.success },
  inactiveText: { color: colors.alert },
  publicText: { color: colors.info },
  neutralText: { color: colors.muted },
  priceRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 6,
    marginTop: 2,
  },
  price: { color: colors.ink, fontSize: 24, fontWeight: "800" },
  cycle: { color: colors.muted, fontSize: 11 },
  description: { color: colors.muted, fontSize: 11, lineHeight: 16 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 1 },
  sectionLabel: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: "800",
    textTransform: "uppercase",
    marginTop: 2,
  },
  featureRow: { flexDirection: "row", alignItems: "flex-start", gap: 7 },
  featureText: { flex: 1, color: colors.text, fontSize: 11, lineHeight: 16 },
  trialRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#EFF7FC",
    borderRadius: 6,
    padding: 8,
    marginTop: 2,
  },
  trialText: { color: colors.info, fontSize: 10, fontWeight: "700" },
  limitRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
  },
  limitLabel: { color: colors.muted, fontSize: 10 },
  limitValue: { color: colors.ink, fontSize: 10, fontWeight: "700" },
  mutedText: { color: colors.muted, fontSize: 10 },
  emptyText: {
    color: colors.muted,
    fontSize: 12,
    textAlign: "center",
    paddingVertical: 26,
  },
  emptyState: { alignItems: "center", gap: 10, padding: 24 },
  errorTitle: { color: colors.ink, fontSize: 16, fontWeight: "800" },
  errorText: { color: colors.alert, fontSize: 11, textAlign: "center" },
  retryButton: {
    backgroundColor: colors.ink,
    borderRadius: 8,
    paddingHorizontal: 18,
    paddingVertical: 9,
  },
  retryText: { color: "#fff", fontSize: 11, fontWeight: "700" },
});
