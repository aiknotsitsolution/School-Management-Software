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
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Card } from "../components/UI";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { colors } from "../theme";
import type { FeeInvoiceRecord, FeePayment } from "../types";
import type { RootStackParams } from "../../App";

type FinanceData = {
  invoices: FeeInvoiceRecord[];
  payments: FeePayment[];
};

const EMPTY_DATA: FinanceData = { invoices: [], payments: [] };

const dateKey = (value?: string) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
};

const money = (value: number) =>
  `₹${Number(value || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 0,
  })}`;

const shortMoney = (value: number) => {
  if (value >= 10000000) return `₹${(value / 10000000).toFixed(1)}Cr`;
  if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
  if (value >= 1000) return `₹${(value / 1000).toFixed(1)}k`;
  return money(value);
};

const formatDate = (value?: string) => {
  const key = dateKey(value);
  if (!key) return "Date not set";
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
};

const greeting = () => {
  const hour = Number(
    new Intl.DateTimeFormat("en-IN", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone: "Asia/Kolkata",
    }).format(new Date()),
  );
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
};

const monthKey = (offset: number) => {
  const [year, currentMonth] = dateKey(new Date().toISOString())
    .split("-")
    .map(Number);
  const month = new Date(Date.UTC(year, currentMonth - 1 - offset, 1));
  return {
    key: `${month.getUTCFullYear()}-${String(month.getUTCMonth() + 1).padStart(2, "0")}`,
    label: month.toLocaleDateString("en-IN", {
      month: "short",
      timeZone: "UTC",
    }),
  };
};

export default function AccountantDashboardScreen() {
  const { user, school } = useAuth();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParams>>();
  const [data, setData] = useState<FinanceData>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setRefreshing(true);
    setError("");
    try {
      const results = await Promise.allSettled([
        api.fees.payments.list("limit=1000"),
        api.fees.invoices.list("limit=1000"),
      ]);
      const [paymentsResult, invoicesResult] = results;
      setData((previous) => ({
        payments:
          paymentsResult.status === "fulfilled"
            ? paymentsResult.value.data || []
            : previous.payments,
        invoices:
          invoicesResult.status === "fulfilled"
            ? invoicesResult.value.data || []
            : previous.invoices,
      }));
      const failures = results.flatMap((result, index) =>
        result.status === "rejected"
          ? [
              `${index === 0 ? "Payments" : "Invoices"}: ${
                result.reason instanceof Error
                  ? result.reason.message
                  : "Unable to load"
              }`,
            ]
          : [],
      );
      setError(failures.join(" · "));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const today = dateKey(new Date().toISOString());
  const thisMonth = today.slice(0, 7);
  const stats = useMemo(() => {
    const todayPaid = data.payments
      .filter((payment) => dateKey(payment.paidOn) === today)
      .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    const monthPaid = data.payments
      .filter((payment) => dateKey(payment.paidOn).startsWith(thisMonth))
      .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    const dueInvoices = data.invoices.filter(
      (invoice) => invoice.status !== "Paid",
    );
    const outstanding = dueInvoices.reduce(
      (sum, invoice) =>
        sum +
        Number(invoice.amount || 0) -
        Number(invoice.paidAmount || 0),
      0,
    );
    const byStatus: Record<string, number> = {};
    data.invoices.forEach((invoice) => {
      const status = invoice.status || "Unpaid";
      byStatus[status] = (byStatus[status] || 0) + 1;
    });
    const byMode: Record<string, number> = {};
    data.payments.forEach((payment) => {
      const mode = payment.mode || "Not set";
      byMode[mode] = (byMode[mode] || 0) + 1;
    });
    const totalCollected = data.payments.reduce(
      (sum, payment) => sum + Number(payment.amount || 0),
      0,
    );
    const invoicedTotal = data.invoices.reduce(
      (sum, invoice) => sum + Number(invoice.amount || 0),
      0,
    );
    return {
      todayPaid,
      monthPaid,
      outstanding,
      dueCount: dueInvoices.length,
      byStatus,
      byMode,
      totalCollected,
      invoicedTotal,
      collectionRate:
        invoicedTotal > 0 ? (totalCollected / invoicedTotal) * 100 : 0,
    };
  }, [data, thisMonth, today]);

  const trend = useMemo(() => {
    const months = Array.from({ length: 6 }, (_, index) => monthKey(5 - index));
    const totals = new Map(months.map((month) => [month.key, 0]));
    data.payments.forEach((payment) => {
      const key = dateKey(payment.paidOn).slice(0, 7);
      if (totals.has(key)) {
        totals.set(key, (totals.get(key) || 0) + Number(payment.amount || 0));
      }
    });
    return months.map((month) => ({
      ...month,
      value: totals.get(month.key) || 0,
    }));
  }, [data.payments]);
  const trendMax = Math.max(1, ...trend.map((month) => month.value));
  const recentPayments = useMemo(
    () =>
      [...data.payments]
        .sort(
          (a, b) =>
            new Date(b.paidOn || 0).getTime() -
            new Date(a.paidOn || 0).getTime(),
        )
        .slice(0, 7),
    [data.payments],
  );

  const openFees = () => navigation.navigate("FeesCollection");

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => void load()} />
      }
    >
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>{greeting()} · Accountant Workspace</Text>
        <Text style={styles.heroTitle}>{school?.name || "Fee Collection"}</Text>
        <Text style={styles.heroText}>
          Track fee collections, outstanding invoices and recent receipts.
        </Text>
        <View style={styles.heroStats}>
          <HeroStat label="Today" value={money(stats.todayPaid)} />
          <HeroStat label="This month" value={money(stats.monthPaid)} />
          <HeroStat label="Outstanding" value={money(stats.outstanding)} />
        </View>
      </View>

      {error ? (
        <View style={styles.errorBox} accessibilityRole="alert">
          <Ionicons name="alert-circle-outline" size={20} color={colors.alert} />
          <Text style={styles.errorText}>
            Some finance data could not be loaded: {error}. Pull down to retry.
          </Text>
        </View>
      ) : null}

      <View style={styles.actionRow}>
        <ActionButton
          icon="wallet-outline"
          label="Manage fees"
          onPress={openFees}
        />
        <ActionButton
          icon="card-outline"
          label="Collect payment"
          onPress={openFees}
        />
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.success} />
          <Text style={styles.muted}>Loading fee dashboard…</Text>
        </View>
      ) : (
        <>
          <View style={styles.metrics}>
            <MetricCard
              label="Lifetime collected"
              value={money(stats.totalCollected)}
              detail={`${data.payments.length} transactions`}
              icon="trending-up-outline"
              tone={colors.success}
            />
            <MetricCard
              label="Outstanding"
              value={money(stats.outstanding)}
              detail={`${stats.dueCount} unpaid invoices`}
              icon="alert-circle-outline"
              tone={stats.outstanding > 0 ? colors.alert : colors.success}
            />
            <MetricCard
              label="Collection rate"
              value={`${Math.round(stats.collectionRate)}%`}
              detail="collected against invoiced"
              icon="pie-chart-outline"
              tone={colors.info}
            />
          </View>

          {stats.byStatus.Overdue ? (
            <View style={styles.alertRow}>
              <Ionicons name="warning-outline" size={19} color="#9A5B00" />
              <Text style={styles.alertText}>
                {stats.byStatus.Overdue} overdue invoice
                {stats.byStatus.Overdue === 1 ? "" : "s"} need follow-up.
              </Text>
            </View>
          ) : null}

          <Card>
            <SectionHeading
              title="Collections by month"
              subtitle="Fee payments received over the last six months"
            />
            {error && !data.payments.length ? (
              <Text style={styles.muted}>Collection trend is unavailable.</Text>
            ) : (
              <View style={styles.chart}>
                {trend.map((month) => (
                  <View key={month.key} style={styles.chartColumn}>
                    <Text style={styles.chartValue}>
                      {month.value ? shortMoney(month.value) : "—"}
                    </Text>
                    <View style={styles.barTrack}>
                      <View
                        style={[
                          styles.bar,
                          {
                            height: Math.max(
                              month.value ? 6 : 3,
                              (month.value / trendMax) * 88,
                            ),
                          },
                        ]}
                      />
                    </View>
                    <Text style={styles.chartLabel}>{month.label}</Text>
                  </View>
                ))}
              </View>
            )}
          </Card>

          <Card>
            <SectionHeading
              title="Invoice status"
              subtitle={`${data.invoices.length} invoices on record`}
            />
            {["Paid", "Partial", "Unpaid", "Overdue"].map((status) => {
              const count = stats.byStatus[status] || 0;
              return (
                <View key={status} style={styles.summaryRow}>
                  <View
                    style={[
                      styles.statusDot,
                      { backgroundColor: statusColor(status) },
                    ]}
                  />
                  <Text style={styles.summaryLabel}>{status}</Text>
                  <Text style={styles.summaryCount}>{count}</Text>
                </View>
              );
            })}
          </Card>

          <Card>
            <SectionHeading
              title="Payment modes"
              subtitle="How families pay"
            />
            {Object.keys(stats.byMode).length ? (
              Object.entries(stats.byMode)
                .sort((a, b) => b[1] - a[1])
                .map(([mode, count]) => (
                  <View key={mode} style={styles.modeRow}>
                    <Text style={styles.summaryLabel}>{mode}</Text>
                    <Text style={styles.modeCount}>
                      {count} {count === 1 ? "payment" : "payments"}
                    </Text>
                  </View>
                ))
            ) : (
              <Text style={styles.muted}>No payment data recorded yet.</Text>
            )}
          </Card>

          <Card>
            <View style={styles.sectionHeader}>
              <SectionHeading
                title="Recent transactions"
                subtitle="Latest payments recorded"
              />
              <Pressable
                onPress={openFees}
                accessibilityRole="button"
                accessibilityLabel="Open fee management"
              >
                <Ionicons
                  name="arrow-forward"
                  size={20}
                  color={colors.info}
                />
              </Pressable>
            </View>
            {recentPayments.length ? (
              recentPayments.map((payment, index) => (
                <View
                  key={payment._id || `${payment.receiptNo || "payment"}-${index}`}
                  style={styles.paymentRow}
                >
                  <View style={styles.paymentIcon}>
                    <Ionicons
                      name="receipt-outline"
                      size={19}
                      color={colors.success}
                    />
                  </View>
                  <View style={styles.paymentInfo}>
                    <Text style={styles.paymentAmount}>
                      {money(Number(payment.amount || 0))}
                    </Text>
                    <Text style={styles.paymentMeta}>
                      {payment.studentId || "—"} · {payment.mode || "Mode not set"}
                    </Text>
                  </View>
                  <View style={styles.receiptInfo}>
                    <Text style={styles.receiptNo}>
                      {payment.receiptNo || formatDate(payment.paidOn)}
                    </Text>
                    <Text style={styles.paymentDate}>
                      {formatDate(payment.paidOn)}
                    </Text>
                  </View>
                </View>
              ))
            ) : (
              <Text style={styles.muted}>No payments recorded yet.</Text>
            )}
          </Card>
        </>
      )}
      <Text style={styles.footer}>Signed in as {user?.name || "Accountant"}</Text>
    </ScrollView>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.heroStat}>
      <Text style={styles.heroStatValue} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.heroStatLabel}>{label}</Text>
    </View>
  );
}

function ActionButton({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}
      accessibilityRole="button"
    >
      <Ionicons name={icon} size={20} color={colors.success} />
      <Text style={styles.actionLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={17} color={colors.muted} />
    </Pressable>
  );
}

function MetricCard({
  label,
  value,
  detail,
  icon,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone: string;
}) {
  return (
    <Card style={styles.metricCard}>
      <Ionicons name={icon} size={20} color={tone} />
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricDetail}>{detail}</Text>
    </Card>
  );
}

function SectionHeading({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <View style={styles.sectionHeading}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionSubtitle}>{subtitle}</Text>
    </View>
  );
}

function statusColor(status: string) {
  if (status === "Paid") return colors.success;
  if (status === "Partial") return colors.info;
  if (status === "Overdue") return colors.alert;
  return "#98A2B3";
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 16, paddingBottom: 32, gap: 14 },
  hero: {
    backgroundColor: "#145B45",
    borderRadius: 20,
    padding: 20,
    gap: 8,
  },
  eyebrow: {
    color: "#C8F1D9",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  heroTitle: { color: "#FFFFFF", fontSize: 22, fontWeight: "800" },
  heroText: { color: "#E0F2E9", fontSize: 13, lineHeight: 19 },
  heroStats: {
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
  },
  heroStat: { flex: 1, minWidth: 0 },
  heroStatValue: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
  heroStatLabel: { color: "#C8F1D9", fontSize: 11, marginTop: 4 },
  actionRow: { gap: 9 },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    backgroundColor: colors.card,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  pressed: { opacity: 0.75 },
  actionLabel: { flex: 1, color: colors.ink, fontSize: 14, fontWeight: "700" },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  metricCard: { flexGrow: 1, flexBasis: "47%", gap: 5, padding: 13 },
  metricLabel: { color: colors.muted, fontSize: 11, fontWeight: "600" },
  metricValue: { color: colors.ink, fontSize: 19, fontWeight: "800" },
  metricDetail: { color: colors.muted, fontSize: 10 },
  errorBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    backgroundColor: "#FFF1EF",
    borderColor: "#F3C3BC",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  errorText: { flex: 1, color: "#9F3025", fontSize: 12, lineHeight: 18 },
  alertRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    backgroundColor: "#FFF6E5",
    borderRadius: 12,
    padding: 13,
  },
  alertText: { flex: 1, color: "#7C4A00", fontSize: 13, fontWeight: "600" },
  sectionHeading: { flex: 1, gap: 3 },
  sectionTitle: { color: colors.ink, fontSize: 16, fontWeight: "800" },
  sectionSubtitle: { color: colors.muted, fontSize: 11 },
  chart: {
    height: 135,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 6,
    marginTop: 18,
  },
  chartColumn: { flex: 1, alignItems: "center", gap: 5 },
  chartValue: { color: colors.muted, fontSize: 9, fontWeight: "600" },
  barTrack: {
    height: 90,
    width: "100%",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  bar: {
    width: "58%",
    minHeight: 3,
    backgroundColor: colors.success,
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
  },
  chartLabel: { color: colors.muted, fontSize: 10 },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  statusDot: { width: 9, height: 9, borderRadius: 5, marginRight: 10 },
  summaryLabel: { flex: 1, color: colors.text, fontSize: 13 },
  summaryCount: { color: colors.ink, fontSize: 14, fontWeight: "800" },
  modeRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modeCount: { color: colors.muted, fontSize: 12, fontWeight: "600" },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  paymentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingVertical: 12,
  },
  paymentIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#E8F5EC",
    alignItems: "center",
    justifyContent: "center",
  },
  paymentInfo: { flex: 1, gap: 3 },
  paymentAmount: { color: colors.success, fontSize: 14, fontWeight: "800" },
  paymentMeta: { color: colors.muted, fontSize: 10 },
  receiptInfo: { alignItems: "flex-end", gap: 3 },
  receiptNo: { color: colors.ink, fontSize: 10, fontWeight: "700" },
  paymentDate: { color: colors.muted, fontSize: 10 },
  muted: { color: colors.muted, fontSize: 13, paddingVertical: 12 },
  loading: { alignItems: "center", gap: 10, paddingVertical: 40 },
  footer: {
    color: colors.muted,
    fontSize: 11,
    textAlign: "center",
    paddingVertical: 4,
  },
});
