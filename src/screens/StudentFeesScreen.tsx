import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Card } from "../components/UI";
import { API_BASE_URL, api, get, KEYS } from "../lib/api";
import type { FeeInvoiceRecord, FeePayment, FeePaymentOrder } from "../types";
import { colors } from "../theme";
import type { RootStackParams } from "../../App";

type SummaryHead = {
  feeType?: string;
  planned?: number;
  invoiced?: number;
  paid?: number;
  balance?: number;
};
type Concession = {
  _id?: string;
  name?: string;
  kind?: string;
  type?: string;
  value?: number;
};
type StudentInvoice = FeeInvoiceRecord & {
  grossAmount?: number;
  concessionAmount?: number;
};
type StudentFeeSummary = {
  session?: string | null;
  class?: string | null;
  plan?: { session?: string; class?: string; totalAnnual?: number } | null;
  totals?: {
    planned?: number | null;
    invoiced?: number;
    collected?: number;
    outstanding?: number;
    concession?: number;
  };
  headwise?: SummaryHead[];
  invoices?: StudentInvoice[];
  payments?: (FeePayment & {
    receiptMode?: string;
    source?: string;
    createdAt?: string;
  })[];
  concessions?: Concession[];
};

const amount = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const money = (value: unknown) =>
  `₹${amount(value).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const formatDate = (value?: string) => {
  if (!value) return "—";
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  const date = dateOnly
    ? new Date(
        Date.UTC(
          Number(dateOnly[1]),
          Number(dateOnly[2]) - 1,
          Number(dateOnly[3]),
          12,
        ),
      )
    : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};
const invoiceStatus = (invoice: FeeInvoiceRecord) => {
  const due = Math.max(0, amount(invoice.amount) - amount(invoice.paidAmount));
  if (!due) return "Paid";
  if (amount(invoice.paidAmount) > 0) return "Partial";
  if (String(invoice.status).toLowerCase() === "overdue") return "Overdue";
  return "Pending";
};

function Metric({
  label,
  value,
  tone = colors.ink,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <Card style={s.metric}>
      <Text style={[s.metricValue, { color: tone }]}>{value}</Text>
      <Text style={s.metricLabel}>{label}</Text>
    </Card>
  );
}

export default function StudentFeesScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParams>>();
  const [summary, setSummary] = useState<StudentFeeSummary | null>(null);
  const [orders, setOrders] = useState<FeePaymentOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [ordersWarning, setOrdersWarning] = useState("");
  const [downloadingReceipt, setDownloadingReceipt] = useState("");

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    setOrdersWarning("");
    const [summaryResult, ordersResult] = await Promise.allSettled([
      get<StudentFeeSummary>("/fees/plans/summary/me"),
      api.fees.payments.orders.list("limit=1000"),
    ]);
    if (summaryResult.status === "fulfilled") {
      setSummary(summaryResult.value.data);
    } else {
      setError(
        summaryResult.reason instanceof Error
          ? summaryResult.reason.message
          : "Could not load your fee statement.",
      );
    }
    if (ordersResult.status === "fulfilled") {
      setOrders(
        Array.isArray(ordersResult.value.data) ? ordersResult.value.data : [],
      );
    } else {
      setOrders([]);
      setOrdersWarning("Payment orders could not be loaded.");
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const invoices: StudentInvoice[] = Array.isArray(summary?.invoices)
    ? summary.invoices
    : [];
  const payments = Array.isArray(summary?.payments) ? summary.payments : [];
  const headwise = Array.isArray(summary?.headwise) ? summary.headwise : [];
  const concessions = Array.isArray(summary?.concessions)
    ? summary.concessions
    : [];
  const totals = useMemo(() => {
    const invoiced =
      summary?.totals?.invoiced ??
      invoices.reduce((sum, item) => sum + amount(item.amount), 0);
    const collected =
      summary?.totals?.collected ??
      payments.reduce((sum, item) => sum + amount(item.amount), 0);
    return {
      planned: summary?.totals?.planned,
      invoiced,
      collected,
      outstanding:
        summary?.totals?.outstanding ?? Math.max(0, invoiced - collected),
      concession: summary?.totals?.concession ?? 0,
    };
  }, [invoices, payments, summary]);
  const paidPercent = totals.invoiced
    ? Math.min(100, Math.round((totals.collected / totals.invoiced) * 100))
    : 0;

  const downloadReceipt = async (receiptNo: string) => {
    if (!FileSystem.cacheDirectory) {
      Alert.alert(
        "Download unavailable",
        "Temporary file storage is unavailable.",
      );
      return;
    }
    setDownloadingReceipt(receiptNo);
    try {
      const token = await AsyncStorage.getItem(KEYS.access);
      const safeReceipt = receiptNo.replace(/[^\w.-]/g, "_");
      const result = await FileSystem.downloadAsync(
        `${API_BASE_URL}/payments/receipt/${encodeURIComponent(receiptNo)}/pdf`,
        `${FileSystem.cacheDirectory}fee-receipt-${safeReceipt}.pdf`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      if (result.status < 200 || result.status >= 300) {
        await FileSystem.deleteAsync(result.uri, { idempotent: true });
        throw new Error(
          result.status === 403
            ? "You do not have permission to download this receipt."
            : `Receipt download failed (HTTP ${result.status}).`,
        );
      }
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(result.uri, {
          mimeType: "application/pdf",
          dialogTitle: "Payment receipt",
          UTI: "com.adobe.pdf",
        });
      } else {
        await Share.share({ url: result.uri, title: "Payment receipt" });
      }
    } catch (downloadError) {
      Alert.alert(
        "Receipt download failed",
        downloadError instanceof Error
          ? downloadError.message
          : "Please try again.",
      );
    } finally {
      setDownloadingReceipt("");
    }
  };

  return (
    <ScrollView
      style={s.screen}
      contentContainerStyle={s.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void load(true)}
          tintColor={colors.info}
        />
      }
    >
      <View style={s.hero}>
        <View style={s.heroTop}>
          <View style={s.heroIcon}>
            <Ionicons
              name="wallet-outline"
              size={23}
              color={colors.amberDark}
            />
          </View>
          <Pressable
            onPress={() => navigation.navigate("OnlinePayment")}
            style={s.payButton}
            accessibilityRole="button"
          >
            <Ionicons name="card-outline" size={16} color="#fff" />
            <Text style={s.payButtonText}>Pay Online</Text>
          </Pressable>
        </View>
        <Text style={s.eyebrow}>FINANCE</Text>
        <Text style={s.title}>Fees & Payments</Text>
        <Text style={s.subtitle}>
          {summary?.session ? `Session ${summary.session} · ` : ""}
          Your fee package, invoices and payment history.
        </Text>
      </View>

      {loading && !summary ? (
        <ActivityIndicator size="large" color={colors.info} style={s.loader} />
      ) : error && !summary ? (
        <Card style={s.stateCard}>
          <Ionicons
            name="cloud-offline-outline"
            size={32}
            color={colors.alert}
          />
          <Text style={s.stateTitle}>Could not load fees</Text>
          <Text style={s.stateText}>{error}</Text>
          <Pressable onPress={() => void load()} style={s.retryButton}>
            <Ionicons name="refresh" size={15} color="#fff" />
            <Text style={s.retryText}>Try again</Text>
          </Pressable>
        </Card>
      ) : summary ? (
        <>
          {error ? <Text style={s.inlineWarning}>{error}</Text> : null}
          {ordersWarning ? (
            <Text style={s.inlineWarning}>{ordersWarning}</Text>
          ) : null}
          <View style={s.metricGrid}>
            <Metric
              label="Annual package"
              value={totals.planned == null ? "—" : money(totals.planned)}
            />
            <Metric label="Invoiced" value={money(totals.invoiced)} />
            <Metric
              label="Paid"
              value={money(totals.collected)}
              tone={colors.success}
            />
            <Metric
              label="Balance due"
              value={money(totals.outstanding)}
              tone={totals.outstanding > 0 ? colors.alert : colors.success}
            />
          </View>

          <View style={s.sectionHeading}>
            <Text style={s.sectionTitle}>Yearly Fee Package</Text>
            <Text style={s.sectionMeta}>
              {summary.plan?.session || summary.session || ""}
            </Text>
          </View>
          <Card style={s.packageCard}>
            <View style={s.packageTop}>
              <View style={s.packageIcon}>
                <Ionicons name="school-outline" size={20} color={colors.info} />
              </View>
              <View style={s.packageCopy}>
                <Text style={s.packageTitle}>
                  {summary.plan?.class || summary.class
                    ? `Class ${summary.plan?.class || summary.class}`
                    : "Annual fee plan"}
                </Text>
                <Text style={s.packageSubtitle}>
                  {summary.plan
                    ? "Admission package · head-wise statement"
                    : "No fee package on record yet."}
                </Text>
              </View>
              {totals.concession > 0 ? (
                <View style={s.concessionBadge}>
                  <Text style={s.concessionBadgeText}>
                    −{money(totals.concession)}
                  </Text>
                </View>
              ) : null}
            </View>
            <View style={s.settlementRow}>
              <Text style={s.settlementLabel}>{paidPercent}% settled</Text>
              <Text style={s.settlementLabel}>
                {money(totals.collected)} of {money(totals.invoiced)}
              </Text>
            </View>
            <View style={s.progressTrack}>
              <View style={[s.progressFill, { width: `${paidPercent}%` }]} />
            </View>
            {headwise.length > 0 ? (
              <View style={s.headList}>
                {headwise.map((head, index) => (
                  <View
                    key={`${head.feeType || "head"}-${index}`}
                    style={s.headRow}
                  >
                    <View style={s.headCopy}>
                      <Text style={s.headTitle}>{head.feeType || "Fee"}</Text>
                      <Text style={s.headMeta}>
                        Annual {money(head.planned)} · Invoiced{" "}
                        {money(head.invoiced)}
                      </Text>
                    </View>
                    <View style={s.headAmounts}>
                      <Text style={s.headPaid}>{money(head.paid)}</Text>
                      <Text
                        style={[
                          s.headBalance,
                          amount(head.balance) > 0 && { color: colors.alert },
                        ]}
                      >
                        {amount(head.balance) > 0
                          ? `${money(head.balance)} due`
                          : "Settled"}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}
            {concessions.length > 0 ? (
              <View style={s.concessionBlock}>
                <Text style={s.concessionTitle}>Concession applied</Text>
                <Text style={s.concessionText}>
                  {concessions
                    .map(
                      (item) =>
                        `${item.name || item.kind || "Concession"} · ${item.type === "percent" ? `${item.value}%` : money(item.value)}`,
                    )
                    .join(", ")}
                </Text>
              </View>
            ) : null}
          </Card>

          <View style={s.sectionHeading}>
            <Text style={s.sectionTitle}>Invoices</Text>
            <Text style={s.sectionMeta}>{invoices.length}</Text>
          </View>
          {invoices.length ? (
            invoices.map((invoice) => {
              const due = Math.max(
                0,
                amount(invoice.amount) - amount(invoice.paidAmount),
              );
              const status = invoiceStatus(invoice);
              const statusColor =
                status === "Paid"
                  ? colors.success
                  : status === "Overdue"
                    ? colors.alert
                    : colors.amberDark;
              return (
                <Card key={invoice._id} style={s.recordCard}>
                  <View style={s.recordTop}>
                    <View style={s.recordIcon}>
                      <Ionicons
                        name="document-text-outline"
                        size={19}
                        color={colors.info}
                      />
                    </View>
                    <View style={s.recordCopy}>
                      <Text style={s.recordTitle}>
                        {invoice.feeType || "Fee invoice"}
                      </Text>
                      <Text style={s.recordMeta}>
                        {invoice.session || summary.session || ""}
                        {invoice.dueDate
                          ? ` · Due ${formatDate(invoice.dueDate)}`
                          : ""}
                      </Text>
                    </View>
                    <View
                      style={[
                        s.statusBadge,
                        {
                          backgroundColor:
                            status === "Paid"
                              ? "#E8F7EF"
                              : status === "Overdue"
                                ? "#FDECEC"
                                : "#FFF4DA",
                        },
                      ]}
                    >
                      <Text style={[s.statusText, { color: statusColor }]}>
                        {status}
                      </Text>
                    </View>
                  </View>
                  <View style={s.amountRow}>
                    <Text style={s.amountLine}>
                      Total{" "}
                      <Text style={s.amountStrong}>
                        {money(invoice.amount)}
                      </Text>
                    </Text>
                    <Text style={s.amountLine}>
                      Paid{" "}
                      <Text style={[s.amountStrong, { color: colors.success }]}>
                        {money(invoice.paidAmount)}
                      </Text>
                    </Text>
                    <Text style={s.amountLine}>
                      Due{" "}
                      <Text
                        style={[
                          s.amountStrong,
                          { color: due ? colors.alert : colors.success },
                        ]}
                      >
                        {money(due)}
                      </Text>
                    </Text>
                  </View>
                  {amount(invoice.concessionAmount) > 0 ? (
                    <Text style={s.invoiceConcession}>
                      Concession {money(invoice.concessionAmount)} · before
                      concession {money(invoice.grossAmount || invoice.amount)}
                    </Text>
                  ) : null}
                </Card>
              );
            })
          ) : (
            <Card style={s.emptyCard}>
              <Text style={s.emptyText}>No fee invoices yet.</Text>
            </Card>
          )}

          <View style={s.sectionHeading}>
            <Text style={s.sectionTitle}>Payment History</Text>
            <Text style={s.sectionMeta}>{payments.length}</Text>
          </View>
          {payments.length ? (
            payments.map((payment, index) => (
              <Card
                key={payment._id || payment.receiptNo || String(index)}
                style={s.recordCard}
              >
                <View style={s.recordTop}>
                  <View style={[s.recordIcon, s.paidIcon]}>
                    <Ionicons
                      name="checkmark-circle-outline"
                      size={19}
                      color={colors.success}
                    />
                  </View>
                  <View style={s.recordCopy}>
                    <Text style={s.recordTitle}>
                      {money(payment.amount)} received
                    </Text>
                    <Text style={s.recordMeta}>
                      {formatDate(payment.paidOn || payment.createdAt)} ·{" "}
                      {payment.mode || "Payment"}
                      {payment.source === "online" ? " · Online" : ""}
                    </Text>
                  </View>
                  {payment.receiptNo ? (
                    <Pressable
                      onPress={() => void downloadReceipt(payment.receiptNo!)}
                      disabled={downloadingReceipt === payment.receiptNo}
                      style={s.receiptButton}
                      accessibilityRole="button"
                      accessibilityLabel={`Download receipt ${payment.receiptNo}`}
                    >
                      {downloadingReceipt === payment.receiptNo ? (
                        <ActivityIndicator size="small" color={colors.info} />
                      ) : (
                        <Ionicons
                          name="download-outline"
                          size={18}
                          color={colors.info}
                        />
                      )}
                    </Pressable>
                  ) : null}
                </View>
                <Text style={s.receiptNo}>
                  Receipt {payment.receiptNo || "not issued"}
                </Text>
              </Card>
            ))
          ) : (
            <Card style={s.emptyCard}>
              <Text style={s.emptyText}>No payments recorded yet.</Text>
            </Card>
          )}

          <View style={s.sectionHeading}>
            <Text style={s.sectionTitle}>Payment Orders</Text>
            <Text style={s.sectionMeta}>{orders.length}</Text>
          </View>
          {orders.length ? (
            orders.map((order) => (
              <Card key={order._id} style={s.recordCard}>
                <View style={s.recordTop}>
                  <View style={[s.recordIcon, s.orderIcon]}>
                    <Ionicons
                      name="time-outline"
                      size={19}
                      color={colors.amberDark}
                    />
                  </View>
                  <View style={s.recordCopy}>
                    <Text style={s.recordTitle}>
                      {money(order.amount)} ·{" "}
                      {order.externalRef || "Payment order"}
                    </Text>
                    <Text style={s.recordMeta}>
                      {formatDate(order.createdAt)} ·{" "}
                      {order.gatewayMode || "Online payment"}
                    </Text>
                  </View>
                  <View
                    style={[
                      s.statusBadge,
                      String(order.status).toLowerCase().includes("complete")
                        ? s.paidBadge
                        : s.pendingBadge,
                    ]}
                  >
                    <Text
                      style={[
                        s.statusText,
                        String(order.status).toLowerCase().includes("complete")
                          ? s.paidText
                          : s.pendingText,
                      ]}
                    >
                      {order.status || "Pending"}
                    </Text>
                  </View>
                </View>
              </Card>
            ))
          ) : (
            <Card style={s.emptyCard}>
              <Text style={s.emptyText}>No open payment orders.</Text>
            </Card>
          )}
        </>
      ) : null}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 16, paddingBottom: 34, gap: 12 },
  hero: {
    padding: 19,
    borderRadius: 20,
    backgroundColor: colors.ink,
    marginBottom: 5,
    borderBottomWidth: 3,
    borderBottomColor: colors.amber,
  },
  heroTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  heroIcon: {
    width: 43,
    height: 43,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  payButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 10,
    backgroundColor: colors.success,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  payButtonText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  eyebrow: {
    color: "#F0C77F",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.4,
  },
  title: { color: "#fff", fontSize: 24, fontWeight: "900", marginTop: 4 },
  subtitle: { color: "#D7DCE8", fontSize: 12, lineHeight: 18, marginTop: 6 },
  loader: { marginVertical: 38 },
  stateCard: {
    minHeight: 200,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 22,
  },
  stateTitle: { color: colors.ink, fontSize: 15, fontWeight: "800" },
  stateText: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
  },
  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: colors.ink,
    borderRadius: 9,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  retryText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  inlineWarning: { color: colors.alert, fontSize: 11, lineHeight: 16 },
  metricGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  metric: {
    width: "48%",
    minHeight: 76,
    justifyContent: "center",
    padding: 12,
  },
  metricValue: { fontSize: 18, fontWeight: "900" },
  metricLabel: { color: colors.muted, fontSize: 10, marginTop: 4 },
  sectionHeading: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginTop: 7,
  },
  sectionTitle: { color: colors.ink, fontSize: 15, fontWeight: "800" },
  sectionMeta: { color: colors.muted, fontSize: 11, fontWeight: "700" },
  packageCard: { gap: 13 },
  packageTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  packageIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: "#EAF2F8",
    alignItems: "center",
    justifyContent: "center",
  },
  packageCopy: { flex: 1, minWidth: 0, gap: 3 },
  packageTitle: { color: colors.ink, fontSize: 13, fontWeight: "800" },
  packageSubtitle: { color: colors.muted, fontSize: 10, lineHeight: 14 },
  concessionBadge: {
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 5,
    backgroundColor: "#F3ECFC",
  },
  concessionBadgeText: { color: "#7541A8", fontSize: 9, fontWeight: "900" },
  settlementRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  settlementLabel: { color: colors.muted, fontSize: 10, fontWeight: "700" },
  progressTrack: {
    height: 7,
    borderRadius: 5,
    backgroundColor: "#EEF0F3",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 5,
    backgroundColor: colors.success,
  },
  headList: { borderTopWidth: 1, borderTopColor: "#EEF0F3" },
  headRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF0F3",
  },
  headCopy: { flex: 1, minWidth: 0, gap: 4 },
  headTitle: { color: colors.ink, fontSize: 11, fontWeight: "800" },
  headMeta: { color: colors.muted, fontSize: 9, lineHeight: 13 },
  headAmounts: { alignItems: "flex-end", gap: 3 },
  headPaid: { color: colors.success, fontSize: 11, fontWeight: "800" },
  headBalance: { color: colors.success, fontSize: 9, fontWeight: "700" },
  concessionBlock: {
    padding: 10,
    borderRadius: 9,
    backgroundColor: "#F7F0FC",
    gap: 4,
  },
  concessionTitle: { color: "#7541A8", fontSize: 10, fontWeight: "800" },
  concessionText: { color: "#7541A8", fontSize: 10, lineHeight: 15 },
  recordCard: { gap: 10, padding: 13 },
  recordTop: { flexDirection: "row", alignItems: "center", gap: 9 },
  recordIcon: {
    width: 37,
    height: 37,
    borderRadius: 12,
    backgroundColor: "#EAF2F8",
    alignItems: "center",
    justifyContent: "center",
  },
  paidIcon: { backgroundColor: "#E8F7EF" },
  orderIcon: { backgroundColor: "#FFF4DA" },
  recordCopy: { flex: 1, minWidth: 0, gap: 4 },
  recordTitle: { color: colors.ink, fontSize: 12, fontWeight: "800" },
  recordMeta: { color: colors.muted, fontSize: 10, lineHeight: 14 },
  statusBadge: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 5 },
  statusText: { fontSize: 9, fontWeight: "900" },
  paidBadge: { backgroundColor: "#E8F7EF" },
  pendingBadge: { backgroundColor: "#FFF4DA" },
  paidText: { color: colors.success },
  pendingText: { color: colors.amberDark },
  amountRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 7,
    paddingTop: 9,
    borderTopWidth: 1,
    borderTopColor: "#EEF0F3",
  },
  amountLine: { color: colors.muted, fontSize: 10 },
  amountStrong: { color: colors.ink, fontWeight: "800" },
  invoiceConcession: { color: "#7541A8", fontSize: 9, lineHeight: 14 },
  receiptButton: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
    backgroundColor: "#EAF2F8",
  },
  receiptNo: { color: colors.muted, fontSize: 9 },
  emptyCard: { padding: 15 },
  emptyText: { color: colors.muted, fontSize: 11, textAlign: "center" },
});
