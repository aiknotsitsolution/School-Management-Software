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
import { api } from "../lib/api";
import { BarChart, Point } from "../components/Charts";
import { Card } from "../components/UI";
import { colors } from "../theme";
import type { PlatformAnalytics } from "../types";

const PAGE_SIZE = 5;
const chartColors = [
  colors.info,
  colors.success,
  colors.amberDark,
  colors.alert,
];

const count = (value?: number) => Number(value || 0).toLocaleString("en-IN");
const money = (value?: number) =>
  `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const date = (value?: string) => {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "—"
    : parsed.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
};

export default function PlatformDashboardScreen() {
  const [data, setData] = useState<PlatformAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [expPage, setExpPage] = useState(1);
  const [actPage, setActPage] = useState(1);

  const load = useCallback(async () => {
    setRefreshing(true);
    setError("");
    const query = `expPage=${expPage}&expLimit=${PAGE_SIZE}&actPage=${actPage}&actLimit=${PAGE_SIZE}`;
    try {
      const response = await api.platform.analytics(query);
      setData(response.data);
    } catch (loadError) {
      setError(
        (loadError as Error).message || "Unable to load platform analytics.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [actPage, expPage]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !data) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={colors.ink} />
      </View>
    );
  }

  if (!data) {
    return (
      <View style={s.center}>
        <Text style={s.errorTitle}>Platform analytics unavailable</Text>
        <Text style={s.error}>
          {error || "No analytics data was returned."}
        </Text>
        <Pressable
          onPress={load}
          style={s.retryButton}
          accessibilityRole="button"
        >
          <Text style={s.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  const overview = data.overview || {};
  const expiring = data.expiringSubscriptions || {};
  const revenue = data.revenue || {};
  const invoices = revenue.invoices || {};
  const schools = overview.schools || {};
  const growth: Point[] = (data.schoolGrowth || []).map((entry) => ({
    label: entry.label || entry.month || "—",
    value: entry.count,
  }));
  const plans: Point[] = (data.planDistribution || []).map((entry) => ({
    label: entry.plan.toUpperCase(),
    value: entry.count,
  }));
  const funnel: Point[] = (data.onboarding?.funnel || []).map((entry) => ({
    label: entry.step,
    value: entry.count,
  }));
  const activityPageSize = data.recentActivityPageSize || PAGE_SIZE;
  const activityTotal = data.recentActivityTotal || 0;
  const expiringTotal = expiring.total || 0;

  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={s.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={load} />
      }
    >
      <View style={s.hero}>
        <Text style={s.eyebrow}>PLATFORM OWNER</Text>
        <Text style={s.heroTitle}>Platform dashboard</Text>
        <Text style={s.heroSubtitle}>
          Network-wide schools, subscriptions, revenue and operations.
        </Text>
        <Text style={s.generated}>Updated {date(data.generatedAt)}</Text>
      </View>

      {!!error && (
        <Text style={s.warning}>{error} Showing the last loaded data.</Text>
      )}

      {!!data.alerts?.length && (
        <View style={s.section}>
          <Text style={s.sectionTitle}>Operator alerts</Text>
          {data.alerts.map((alert, index) => (
            <View
              key={`${alert.message}-${index}`}
              style={[s.alert, alert.severity === "warning" && s.warningAlert]}
            >
              <Text style={s.alertText}>{alert.message}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={s.section}>
        <Text style={s.sectionTitle}>Network overview</Text>
        <View style={s.metrics}>
          <Metric
            label="Schools"
            value={count(schools.total)}
            detail={`${count(schools.active)} active`}
          />
          <Metric
            label="Users"
            value={count(overview.users?.total)}
            detail="Across all schools"
          />
          <Metric
            label="Paying schools"
            value={count(overview.payingSchools)}
            detail={`${count(overview.subscriptions?.current)} current subscriptions`}
          />
          <Metric
            label="Monthly revenue"
            value={money(overview.mrr)}
            detail={`ARPU ${money(overview.arpu)}`}
          />
        </View>
      </View>

      <View style={s.section}>
        <Text style={s.sectionTitle}>School growth</Text>
        <Card>
          <BarChart data={growth} color={colors.info} />
        </Card>
      </View>

      <View style={s.section}>
        <Text style={s.sectionTitle}>Subscriptions</Text>
        <Card>
          {(data.subscriptionDistribution || []).map((item, index) => (
            <DataRow
              key={item.status}
              label={item.label}
              value={count(item.count)}
              color={chartColors[index % chartColors.length]}
            />
          ))}
          {!data.subscriptionDistribution?.length && (
            <Text style={s.empty}>No subscription data.</Text>
          )}
        </Card>
        <Text style={s.subheading}>Plan distribution</Text>
        <Card>
          <BarChart data={plans} color={colors.amberDark} />
        </Card>
      </View>

      <View style={s.section}>
        <Text style={s.sectionTitle}>Onboarding funnel</Text>
        <Card>
          <BarChart data={funnel} color={colors.success} />
        </Card>
      </View>

      <View style={s.section}>
        <Text style={s.sectionTitle}>Revenue</Text>
        <View style={s.metrics}>
          <Metric
            label="Collected"
            value={money(revenue.collected)}
            detail={`${count(invoices.paid)} paid invoices`}
          />
          <Metric
            label="Outstanding"
            value={money(revenue.outstanding)}
            detail={`${count(invoices.overdue)} overdue`}
          />
        </View>
        <Card style={s.invoiceCard}>
          <DataRow
            label="Paid"
            value={count(invoices.paid)}
            color={colors.success}
          />
          <DataRow
            label="Issued"
            value={count(invoices.issued)}
            color={colors.info}
          />
          <DataRow
            label="Overdue"
            value={count(invoices.overdue)}
            color={colors.alert}
          />
          <DataRow
            label="Draft"
            value={count(invoices.draft)}
            color={colors.muted}
          />
        </Card>
      </View>

      <View style={s.section}>
        <Text style={s.sectionTitle}>Expiring subscriptions</Text>
        <Card style={s.bucketRow}>
          <Bucket label="7 days" value={expiring.in7} />
          <Bucket label="15 days" value={expiring.in15} />
          <Bucket label="30 days" value={expiring.in30} />
        </Card>
        {(expiring.items || []).map((item, index) => (
          <Card
            key={item._id || `${item.school?.name}-${index}`}
            style={s.listCard}
          >
            <Text style={s.rowTitle}>
              {item.school?.name || "Unknown school"}
            </Text>
            <Text style={s.rowDetail}>
              {item.plan?.name || "No plan"} · {item.status || "—"}
            </Text>
            <Text style={s.rowDetail}>Due {date(item.reference)}</Text>
          </Card>
        ))}
        <Pager
          page={expPage}
          pageSize={expiring.pageSize || PAGE_SIZE}
          total={expiringTotal}
          disabled={refreshing}
          onChange={setExpPage}
        />
      </View>

      <View style={s.section}>
        <Text style={s.sectionTitle}>Recent platform activity</Text>
        {(data.recentActivity || []).map((entry, index) => (
          <Card
            key={entry._id || `${entry.createdAt}-${index}`}
            style={s.listCard}
          >
            <Text style={s.rowTitle}>{entry.actorEmail || "system"}</Text>
            <Text style={s.rowDetail}>
              {entry.message || entry.action || "Platform activity"}
            </Text>
            <Text style={s.rowDetail}>
              {entry.action || "—"} · {date(entry.createdAt)}
            </Text>
          </Card>
        ))}
        {!data.recentActivity?.length && (
          <Text style={s.empty}>No platform activity yet.</Text>
        )}
        <Pager
          page={actPage}
          pageSize={activityPageSize}
          total={activityTotal}
          disabled={refreshing}
          onChange={setActPage}
        />
      </View>
    </ScrollView>
  );
}

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <Card style={s.metric}>
      <Text style={s.metricLabel}>{label}</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit style={s.metricValue}>
        {value}
      </Text>
      <Text numberOfLines={1} style={s.metricDetail}>
        {detail}
      </Text>
    </Card>
  );
}

function DataRow({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <View style={s.dataRow}>
      <View style={[s.dot, { backgroundColor: color }]} />
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={s.rowValue}>{value}</Text>
    </View>
  );
}

function Bucket({ label, value }: { label: string; value?: number }) {
  return (
    <View style={s.bucket}>
      <Text style={s.bucketValue}>{count(value)}</Text>
      <Text style={s.bucketLabel}>{label}</Text>
    </View>
  );
}

function Pager({
  page,
  pageSize,
  total,
  disabled,
  onChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  disabled: boolean;
  onChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <View style={s.pager}>
      <Pressable
        disabled={disabled || page <= 1}
        onPress={() => onChange(page - 1)}
        accessibilityRole="button"
      >
        <Text style={[s.pageAction, (disabled || page <= 1) && s.disabled]}>
          Previous
        </Text>
      </Pressable>
      <Text style={s.pageLabel}>
        {page} / {pages}
      </Text>
      <Pressable
        disabled={disabled || page >= pages}
        onPress={() => onChange(page + 1)}
        accessibilityRole="button"
      >
        <Text style={[s.pageAction, (disabled || page >= pages) && s.disabled]}>
          Next
        </Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 16, paddingBottom: 32, gap: 18 },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    gap: 12,
    backgroundColor: colors.paper,
  },
  hero: { backgroundColor: colors.ink, padding: 20, borderRadius: 8, gap: 6 },
  eyebrow: { color: colors.amber, fontSize: 10, fontWeight: "800" },
  heroTitle: { color: "#fff", fontSize: 23, fontWeight: "800" },
  heroSubtitle: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 12,
    lineHeight: 18,
  },
  generated: { color: "rgba(255,255,255,0.55)", fontSize: 10, marginTop: 4 },
  section: { gap: 9 },
  sectionTitle: { color: colors.ink, fontSize: 16, fontWeight: "800" },
  subheading: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4,
  },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  metric: {
    width: "48%",
    minHeight: 104,
    justifyContent: "space-between",
    padding: 12,
  },
  metricLabel: { color: colors.muted, fontSize: 11, fontWeight: "600" },
  metricValue: {
    color: colors.ink,
    fontSize: 21,
    fontWeight: "800",
    marginTop: 7,
  },
  metricDetail: { color: colors.muted, fontSize: 10, marginTop: 4 },
  alert: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.info,
    backgroundColor: "#EFF7FC",
    padding: 12,
  },
  warningAlert: { borderColor: colors.amberDark, backgroundColor: "#FFF8EB" },
  alertText: { color: colors.ink, fontSize: 12, fontWeight: "600" },
  dataRow: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dot: { width: 9, height: 9, borderRadius: 5 },
  rowLabel: { flex: 1, color: colors.muted, fontSize: 12 },
  rowValue: { color: colors.ink, fontSize: 13, fontWeight: "700" },
  invoiceCard: { paddingVertical: 8, paddingHorizontal: 12 },
  bucketRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: 12,
  },
  bucket: { alignItems: "center", minWidth: 60 },
  bucketValue: { color: colors.ink, fontSize: 19, fontWeight: "800" },
  bucketLabel: { color: colors.muted, fontSize: 10, marginTop: 3 },
  listCard: { padding: 12, gap: 4 },
  rowTitle: { color: colors.ink, fontSize: 13, fontWeight: "700" },
  rowDetail: { color: colors.muted, fontSize: 11 },
  pager: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 4,
    paddingVertical: 8,
  },
  pageAction: {
    color: colors.info,
    fontSize: 12,
    fontWeight: "700",
    padding: 6,
  },
  pageLabel: { color: colors.muted, fontSize: 11 },
  disabled: { opacity: 0.4 },
  empty: { color: colors.muted, fontSize: 12, padding: 8 },
  warning: {
    color: colors.alert,
    fontSize: 12,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.alert,
    backgroundColor: "#FFF1EF",
  },
  errorTitle: {
    color: colors.ink,
    fontWeight: "800",
    fontSize: 18,
    textAlign: "center",
  },
  error: { color: colors.alert, fontSize: 12, textAlign: "center" },
  retryButton: {
    backgroundColor: colors.ink,
    borderRadius: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  retryText: { color: "#fff", fontSize: 12, fontWeight: "700" },
});
