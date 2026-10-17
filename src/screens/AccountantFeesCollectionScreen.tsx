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
import { Card, Input } from "../components/UI";
import { useAuth } from "../context/AuthContext";
import { api, get } from "../lib/api";
import { colors } from "../theme";
import type {
  FeeInvoiceRecord,
  FeePayment,
  FeeStructure,
  Student,
} from "../types";

type CollectionData = {
  session: string;
  students: Student[];
  invoices: FeeInvoiceRecord[];
  payments: FeePayment[];
  structures: FeeStructure[];
};

type CollectionView = "Overview" | "Receipts" | "Dues" | "Structures";
type PaymentMode = "Cash" | "Card" | "UPI" | "Net Banking" | "Cheque";

const VIEWS: CollectionView[] = ["Overview", "Receipts", "Dues", "Structures"];
const MODES: PaymentMode[] = ["Cash", "Card", "UPI", "Net Banking", "Cheque"];
const EMPTY_DATA: CollectionData = {
  session: "",
  students: [],
  invoices: [],
  payments: [],
  structures: [],
};

const money = (value: number) =>
  `₹${Number(value || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 0,
  })}`;

const formatDate = (value?: string) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
};

const studentName = (student?: Student, fallback?: string) =>
  student?.name ||
  [student?.firstName, student?.lastName].filter(Boolean).join(" ") ||
  student?.admissionNo ||
  fallback ||
  "Student";

const remaining = (invoice: FeeInvoiceRecord) =>
  Math.max(
    0,
    Number(invoice.amount || 0) - Number(invoice.paidAmount || 0),
  );

export default function AccountantFeesCollectionScreen() {
  const { user, can } = useAuth();
  const isAccountant =
    user?.role === "staff" && user.designation === "accountant";
  const canCollect = isAccountant && can("fees:collect");
  const canManageStructure = isAccountant && can("fees:structure");
  const [data, setData] = useState<CollectionData>(EMPTY_DATA);
  const [view, setView] = useState<CollectionView>("Overview");
  const [classFilter, setClassFilter] = useState("");
  const [feeFilter, setFeeFilter] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [paymentInvoice, setPaymentInvoice] =
    useState<FeeInvoiceRecord | null>(null);
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<PaymentMode>("Cash");
  const [receiptNo, setReceiptNo] = useState("");
  const [transactionId, setTransactionId] = useState("");
  const [chequeNo, setChequeNo] = useState("");
  const [chequeDate, setChequeDate] = useState("");
  const [bankName, setBankName] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const sessionResponse = await get<{ name?: string }>(
        "/auth/sessions/current",
      );
      const session = String(sessionResponse.data?.name || "");
      const sessionQuery = session
        ? `session=${encodeURIComponent(session)}`
        : "";
      const results = await Promise.allSettled([
        api.students.list("limit=1000"),
        api.fees.invoices.list(
          [sessionQuery, "limit=1000"].filter(Boolean).join("&"),
        ),
        api.fees.payments.list(
          [sessionQuery, "limit=1000"].filter(Boolean).join("&"),
        ),
        api.fees.structures.list(sessionQuery),
      ]);
      const labels = ["Students", "Invoices", "Payments", "Fee structures"];
      const failures = results.flatMap((result, index) =>
        result.status === "rejected"
          ? [
              `${labels[index]}: ${
                result.reason instanceof Error
                  ? result.reason.message
                  : "Unable to load"
              }`,
            ]
          : [],
      );
      const valueAt = <T,>(index: number): T => {
        const result = results[index];
        return result.status === "fulfilled"
          ? ((result.value.data || []) as T)
          : ([] as T);
      };
      setData({
        session,
        students: valueAt<Student[]>(0),
        invoices: valueAt<FeeInvoiceRecord[]>(1),
        payments: valueAt<FeePayment[]>(2),
        structures: valueAt<FeeStructure[]>(3),
      });
      setError(failures.join(" · "));
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load the active academic session.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const studentMap = useMemo(() => {
    const map = new Map<string, Student>();
    data.students.forEach((student) => {
      map.set(String(student._id), student);
      if (student.admissionNo) map.set(String(student.admissionNo), student);
    });
    return map;
  }, [data.students]);
  const invoiceMap = useMemo(
    () => new Map(data.invoices.map((invoice) => [String(invoice._id), invoice])),
    [data.invoices],
  );
  const classes = useMemo(
    () =>
      [...new Set(data.students.map((student) => String(student.class || "")).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, "en", { numeric: true })),
    [data.students],
  );
  const feeTypes = useMemo(
    () =>
      [...new Set(data.structures.map((structure) => structure.feeType || "").filter(Boolean))]
        .sort(),
    [data.structures],
  );

  const invoices = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return data.invoices.filter((invoice) => {
      const student = studentMap.get(String(invoice.studentId || ""));
      if (classFilter && String(invoice.class || student?.class || "") !== classFilter) {
        return false;
      }
      if (feeFilter && invoice.feeType !== feeFilter) return false;
      if (
        statusFilter === "active" &&
        invoice.status !== "Paid" &&
        invoice.status !== "Overdue"
      ) {
        return false;
      }
      if (statusFilter === "paid" && invoice.status !== "Paid") return false;
      if (statusFilter === "overdue" && invoice.status !== "Overdue") return false;
      if (statusFilter === "due" && remaining(invoice) <= 0) return false;
      if (!needle) return true;
      return [
        studentName(student, invoice.studentId),
        student?.admissionNo,
        invoice.studentId,
        invoice.class,
        invoice.feeType,
        invoice.status,
      ].some((value) =>
        String(value || "")
          .toLowerCase()
          .includes(needle),
      );
    });
  }, [data.invoices, studentMap, classFilter, feeFilter, statusFilter, search]);

  const payments = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return data.payments.filter((payment) => {
      const invoice = invoiceMap.get(String(payment.invoiceId || ""));
      const student = studentMap.get(
        String(payment.studentId || invoice?.studentId || ""),
      );
      if (classFilter && String(student?.class || invoice?.class || "") !== classFilter) {
        return false;
      }
      if (feeFilter && invoice?.feeType !== feeFilter) return false;
      if (!needle) return true;
      return [
        studentName(student, payment.studentId),
        student?.admissionNo,
        payment.receiptNo,
        payment.mode,
        invoice?.feeType,
      ].some((value) =>
        String(value || "")
          .toLowerCase()
          .includes(needle),
      );
    });
  }, [data.payments, invoiceMap, studentMap, classFilter, feeFilter, search]);

  const filteredStructures = useMemo(
    () =>
      data.structures.filter(
        (structure) =>
          (!classFilter || structure.class === classFilter) &&
          (!feeFilter || structure.feeType === feeFilter),
      ),
    [data.structures, classFilter, feeFilter],
  );
  const totals = useMemo(() => {
    const collected = payments
      .filter((payment) => payment.clearanceStatus !== "Bounced")
      .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    const outstanding = invoices.reduce((sum, invoice) => sum + remaining(invoice), 0);
    const paidCount = invoices.filter(
      (invoice) => invoice.status === "Paid" || remaining(invoice) === 0,
    ).length;
    const overdue = invoices.filter(
      (invoice) => invoice.status === "Overdue",
    ).length;
    const partial = invoices.filter(
      (invoice) =>
        Number(invoice.paidAmount || 0) > 0 && remaining(invoice) > 0,
    ).length;
    const rate =
      collected + outstanding > 0
        ? Math.min(100, Math.round((collected / (collected + outstanding)) * 100))
        : 0;
    return { collected, outstanding, paidCount, overdue, partial, rate };
  }, [invoices, payments]);

  const openPayment = (invoice: FeeInvoiceRecord) => {
    setPaymentInvoice(invoice);
    setAmount(String(remaining(invoice)));
    setMode("Cash");
    setReceiptNo("");
    setTransactionId("");
    setChequeNo("");
    setChequeDate("");
    setBankName("");
  };

  const recordPayment = async () => {
    if (!paymentInvoice) return;
    const paymentAmount = Number(amount);
    if (!Number.isFinite(paymentAmount) || paymentAmount <= 0 || paymentAmount > remaining(paymentInvoice)) {
      Alert.alert(
        "Invalid amount",
        `Enter an amount from ₹1 to ${money(remaining(paymentInvoice))}.`,
      );
      return;
    }
    if (mode === "Cheque" && !chequeNo.trim()) {
      Alert.alert("Cheque number required", "Enter the cheque number to continue.");
      return;
    }
    const receipt = receiptNo.trim();
    if ((mode === "Cash" || mode === "Cheque") && !receipt) {
      Alert.alert("Receipt number required", `Enter your receipt book number for ${mode} payments.`);
      return;
    }
    if (receipt && !/^[A-Za-z0-9][A-Za-z0-9/_#.-]{2,39}$/.test(receipt)) {
      Alert.alert(
        "Invalid receipt number",
        "Use 3–40 letters, digits, or - _ / . # characters.",
      );
      return;
    }
    setSaving(true);
    try {
      await api.fees.payments.create({
        invoiceId: paymentInvoice._id,
        amount: paymentAmount,
        mode,
        receiptNo: receipt || undefined,
        transactionId: transactionId.trim() || undefined,
        chequeNo: mode === "Cheque" ? chequeNo.trim() : undefined,
        chequeDate: mode === "Cheque" && chequeDate ? chequeDate : undefined,
        bankName: mode === "Cheque" ? bankName.trim() || undefined : undefined,
      });
      setPaymentInvoice(null);
      await load(true);
      Alert.alert("Payment recorded", "The payment has been added to the ledger.");
    } catch (saveError) {
      Alert.alert(
        "Unable to record payment",
        saveError instanceof Error ? saveError.message : "Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  if (!isAccountant || !can("fees:read")) {
    return (
      <View style={styles.center}>
        <Ionicons name="lock-closed-outline" size={30} color={colors.muted} />
        <Text style={styles.sectionTitle}>Collection access required</Text>
        <Text style={styles.muted}>Sign in with an authorized accountant account.</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.success} />
        <Text style={styles.muted}>Loading collection data…</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />
        }
      >
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>FINANCE · COLLECTION DESK</Text>
          <Text style={styles.title}>Fees Collection</Text>
          <Text style={styles.subtitle}>
            Track payments, outstanding dues and receipts across the school.
          </Text>
          <View style={styles.sessionBadge}>
            <Ionicons name="calendar-outline" size={14} color="#D8E4F5" />
            <Text style={styles.sessionText}>
              {data.session || "No active session"}
            </Text>
          </View>
          {canCollect && (
            <Text style={styles.actionHint}>
              To collect a fee, open Dues and choose a pending invoice.
            </Text>
          )}
        </View>

        {error ? (
          <Pressable
            style={styles.error}
            onPress={() => void load(true)}
            accessibilityRole="button"
            accessibilityLabel="Retry loading collection data"
          >
            <Ionicons name="alert-circle-outline" size={18} color={colors.alert} />
            <Text style={styles.errorText}>{error}. Tap to retry.</Text>
          </Pressable>
        ) : null}

        <View style={styles.stats}>
          <Metric
            label="COLLECTED"
            value={money(totals.collected)}
            icon="wallet-outline"
            tone={colors.success}
          />
          <Metric
            label="OUTSTANDING"
            value={money(totals.outstanding)}
            icon="trending-up-outline"
            tone={colors.alert}
          />
          <Metric
            label="COLLECTION RATE"
            value={`${totals.rate}%`}
            icon="pie-chart-outline"
            tone={colors.info}
          />
          <Metric
            label="OVERDUE"
            value={String(totals.overdue)}
            icon="alert-circle-outline"
            tone={colors.amberDark}
          />
        </View>

        <Card>
          <Text style={styles.sectionTitle}>Collection filters</Text>
          <Text style={styles.muted}>Filter the active-session overview.</Text>
          <Text style={styles.filterLabel}>Class</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.chips}>
              <FilterChip label="All classes" active={!classFilter} onPress={() => setClassFilter("")} />
              {classes.map((name) => (
                <FilterChip
                  key={name}
                  label={name}
                  active={classFilter === name}
                  onPress={() => setClassFilter(classFilter === name ? "" : name)}
                />
              ))}
            </View>
          </ScrollView>
          <Text style={styles.filterLabel}>Fee type</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.chips}>
              <FilterChip label="All fee types" active={!feeFilter} onPress={() => setFeeFilter("")} />
              {feeTypes.map((name) => (
                <FilterChip
                  key={name}
                  label={name}
                  active={feeFilter === name}
                  onPress={() => setFeeFilter(feeFilter === name ? "" : name)}
                />
              ))}
            </View>
          </ScrollView>
          <Input
            value={search}
            onChangeText={setSearch}
            placeholder="Search student, admission no. or receipt"
            returnKeyType="search"
            style={styles.searchInput}
          />
          <View style={styles.chips}>
            {[
              ["all", "All"],
              ["due", "Due"],
              ["paid", "Paid"],
              ["overdue", "Overdue"],
            ].map(([value, label]) => (
              <FilterChip
                key={value}
                label={label}
                active={statusFilter === value}
                onPress={() => setStatusFilter(value)}
              />
            ))}
            {(classFilter || feeFilter || search || statusFilter !== "all") && (
              <FilterChip
                label="Clear filters"
                active={false}
                onPress={() => {
                  setClassFilter("");
                  setFeeFilter("");
                  setSearch("");
                  setStatusFilter("all");
                }}
              />
            )}
          </View>
        </Card>

        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.viewTabs}>
            {VIEWS.map((item) => (
              <Pressable
                key={item}
                onPress={() => setView(item)}
                style={[styles.viewTab, view === item && styles.viewTabActive]}
              >
                <Text style={[styles.viewTabText, view === item && styles.viewTabTextActive]}>
                  {item}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>

        {view === "Overview" && (
          <Card>
            <Text style={styles.sectionTitle}>Collection summary</Text>
            <Text style={styles.muted}>
              {invoices.length} invoices · {payments.length} receipts ·{" "}
              {totals.paidCount} paid · {totals.partial} partially paid
            </Text>
            <View style={styles.summaryGrid}>
              <SummaryValue label="Successful payments" value={String(payments.filter((payment) => payment.clearanceStatus !== "Bounced").length)} />
              <SummaryValue label="Paid invoices" value={String(totals.paidCount)} />
              <SummaryValue label="Partially paid" value={String(totals.partial)} />
              <SummaryValue label="Pending balance" value={money(totals.outstanding)} />
            </View>
            {totals.overdue > 0 && (
              <View style={styles.alert}>
                <Ionicons name="warning-outline" size={18} color={colors.alert} />
                <Text style={styles.alertText}>
                  {totals.overdue} overdue invoice{totals.overdue === 1 ? "" : "s"} need follow-up.
                </Text>
              </View>
            )}
          </Card>
        )}

        {view === "Receipts" &&
          (payments.length ? (
            payments
              .slice()
              .sort(
                (a, b) =>
                  new Date(b.paidOn || 0).getTime() -
                  new Date(a.paidOn || 0).getTime(),
              )
              .map((payment, index) => {
                const invoice = invoiceMap.get(String(payment.invoiceId || ""));
                const student = studentMap.get(
                  String(payment.studentId || invoice?.studentId || ""),
                );
                return (
                  <Card
                    key={payment._id || `${payment.receiptNo || "receipt"}-${index}`}
                    style={styles.record}
                  >
                    <View style={styles.recordTop}>
                      <View style={styles.recordIcon}>
                        <Ionicons name="receipt-outline" size={18} color={colors.success} />
                      </View>
                      <View style={styles.recordDetails}>
                        <Text style={styles.recordTitle}>
                          {studentName(student, payment.studentId)}
                        </Text>
                        <Text style={styles.muted}>
                          {invoice?.feeType || "Fee"} · {invoice?.class ? `Class ${invoice.class} · ` : ""}
                          {payment.receiptNo || "No receipt"}
                        </Text>
                      </View>
                      <Text style={styles.amount}>{money(Number(payment.amount || 0))}</Text>
                    </View>
                    <View style={styles.recordFooter}>
                      <Text style={styles.muted}>
                        {payment.mode || "Mode not set"} · {formatDate(payment.paidOn)}
                      </Text>
                      <Text
                        style={[
                          styles.status,
                          payment.clearanceStatus === "Bounced" && { color: colors.alert },
                        ]}
                      >
                        {payment.clearanceStatus || payment.source || "Recorded"}
                      </Text>
                    </View>
                  </Card>
                );
              })
          ) : (
            <EmptyCard title="No receipts yet" message="Recorded payments will appear here." />
          ))}

        {view === "Dues" &&
          (invoices.filter((invoice) => remaining(invoice) > 0).length ? (
            invoices
              .filter((invoice) => remaining(invoice) > 0)
              .map((invoice) => (
                <InvoiceCard
                  key={invoice._id}
                  invoice={invoice}
                  student={studentMap.get(String(invoice.studentId || ""))}
                  canCollect={canCollect}
                  onCollect={() => openPayment(invoice)}
                />
              ))
          ) : (
            <EmptyCard title="No outstanding invoices" message="There are no due invoices for these filters." />
          ))}

        {view === "Structures" &&
          (filteredStructures.length ? (
            filteredStructures.map((structure) => (
              <Card key={structure._id} style={styles.record}>
                <View style={styles.recordTop}>
                  <View style={[styles.recordIcon, styles.structureIcon]}>
                    <Ionicons name="wallet-outline" size={18} color={colors.success} />
                  </View>
                  <View style={styles.recordDetails}>
                    <Text style={styles.recordTitle}>{structure.feeType || "Fee"}</Text>
                    <Text style={styles.muted}>
                      Class {structure.class || "—"} · {structure.session || data.session || "—"}
                    </Text>
                  </View>
                  <Text style={styles.amount}>{money(Number(structure.amount || 0))}</Text>
                </View>
                <View style={styles.recordFooter}>
                  <Text style={styles.muted}>
                    {structure.frequency || "One-time"} · Due {formatDate(structure.dueDate)}
                  </Text>
                  <Text style={styles.status}>
                    {structure.active === false ? "Inactive" : "Active"}
                  </Text>
                </View>
              </Card>
            ))
          ) : (
            <EmptyCard title="No fee structures" message="No structures match the selected class and fee type." />
          ))}
      </ScrollView>

      <Modal
        visible={!!paymentInvoice}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setPaymentInvoice(null)}
      >
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.eyebrow}>COLLECTION DESK</Text>
              <Text style={styles.modalTitle}>Record payment</Text>
            </View>
            <Pressable
              onPress={() => setPaymentInvoice(null)}
              accessibilityLabel="Close payment form"
            >
              <Ionicons name="close" size={24} color={colors.ink} />
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={styles.modalBody}
            keyboardShouldPersistTaps="handled"
          >
            {paymentInvoice && (
              <>
                <Text style={styles.recordTitle}>
                  {studentName(
                    studentMap.get(String(paymentInvoice.studentId || "")),
                    paymentInvoice.studentId,
                  )}
                </Text>
                <Text style={styles.muted}>
                  {paymentInvoice.feeType || "Fee"} · Balance {money(remaining(paymentInvoice))}
                </Text>
              </>
            )}
            <Text style={styles.fieldLabel}>Amount (₹) *</Text>
            <Input
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholder={String(paymentInvoice ? remaining(paymentInvoice) : 0)}
            />
            <Text style={styles.fieldLabel}>Payment mode *</Text>
            <View style={styles.chips}>
              {MODES.map((item) => (
                <FilterChip
                  key={item}
                  label={item}
                  active={mode === item}
                  onPress={() => setMode(item)}
                />
              ))}
            </View>
            <Text style={styles.fieldLabel}>
              Receipt number{" "}
              {mode === "Cash" || mode === "Cheque" ? "*" : "(optional)"}
            </Text>
            <Input
              value={receiptNo}
              onChangeText={setReceiptNo}
              autoCapitalize="characters"
              placeholder="Receipt book number"
            />
            {mode === "Cheque" && (
              <>
                <Text style={styles.fieldLabel}>Cheque number *</Text>
                <Input value={chequeNo} onChangeText={setChequeNo} placeholder="Cheque number" />
                <Text style={styles.fieldLabel}>Cheque date</Text>
                <Input value={chequeDate} onChangeText={setChequeDate} placeholder="YYYY-MM-DD" />
                <Text style={styles.fieldLabel}>Bank name</Text>
                <Input value={bankName} onChangeText={setBankName} placeholder="Issuing bank" />
              </>
            )}
            {mode !== "Cash" && (
              <>
                <Text style={styles.fieldLabel}>Transaction ID</Text>
                <Input
                  value={transactionId}
                  onChangeText={setTransactionId}
                  placeholder="Optional UTR / payment reference"
                />
              </>
            )}
          </ScrollView>
          <Pressable
            onPress={() => void recordPayment()}
            disabled={saving}
            style={[styles.saveButton, saving && { opacity: 0.65 }]}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.saveText}>Record Payment</Text>
            )}
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

function Metric({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
  tone: string;
}) {
  return (
    <View style={styles.metric}>
      <Ionicons name={icon} size={18} color={tone} />
      <Text style={[styles.metricValue, { color: tone }]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
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
      style={[styles.chip, active && styles.chipActive]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function SummaryValue({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryValue}>
      <Text style={styles.muted}>{label}</Text>
      <Text style={styles.summaryAmount}>{value}</Text>
    </View>
  );
}

function InvoiceCard({
  invoice,
  student,
  canCollect,
  onCollect,
}: {
  invoice: FeeInvoiceRecord;
  student?: Student;
  canCollect: boolean;
  onCollect: () => void;
}) {
  return (
    <Card style={styles.record}>
      <View style={styles.recordTop}>
        <View style={[styles.recordIcon, styles.invoiceIcon]}>
          <Ionicons name="document-text-outline" size={18} color={colors.amberDark} />
        </View>
        <View style={styles.recordDetails}>
          <Text style={styles.recordTitle}>
            {studentName(student, invoice.studentId)}
          </Text>
          <Text style={styles.muted}>
            {invoice.feeType || "Fee"} · Class {invoice.class || student?.class || "—"}
          </Text>
        </View>
        <Text style={[styles.amount, { color: remaining(invoice) > 0 ? colors.alert : colors.success }]}>
          {money(remaining(invoice))}
        </Text>
      </View>
      <View style={styles.recordFooter}>
        <Text style={styles.muted}>
          Paid {money(Number(invoice.paidAmount || 0))} · Due {formatDate(invoice.dueDate)}
        </Text>
        <Text
          style={[
            styles.status,
            invoice.status === "Overdue" && { color: colors.alert },
          ]}
        >
          {invoice.status || "Pending"}
        </Text>
      </View>
      {canCollect && remaining(invoice) > 0 && (
        <Pressable
          onPress={onCollect}
          style={styles.collectButton}
          accessibilityRole="button"
        >
          <Ionicons name="cash-outline" size={16} color="#fff" />
          <Text style={styles.collectText}>Collect payment</Text>
        </Pressable>
      )}
    </Card>
  );
}

function EmptyCard({ title, message }: { title: string; message: string }) {
  return (
    <Card style={styles.emptyCard}>
      <Ionicons name="receipt-outline" size={24} color={colors.muted} />
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.muted}>{message}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 14, paddingBottom: 28, gap: 12 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 24,
    backgroundColor: colors.paper,
  },
  hero: { backgroundColor: colors.ink, borderRadius: 18, padding: 18, gap: 7 },
  eyebrow: { color: colors.amber, fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  title: { color: "#fff", fontSize: 22, fontWeight: "800" },
  subtitle: { color: "#D8DEEA", fontSize: 12, lineHeight: 18 },
  sessionBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 16,
    backgroundColor: "#FFFFFF1A",
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 5,
  },
  sessionText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  actionHint: { color: "#D8DEEA", fontSize: 11, marginTop: 3 },
  error: {
    flexDirection: "row",
    gap: 8,
    borderColor: "#EBC5C0",
    borderWidth: 1,
    borderRadius: 10,
    backgroundColor: "#FFF1EF",
    padding: 11,
  },
  errorText: { flex: 1, color: colors.alert, fontSize: 11, lineHeight: 17 },
  stats: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  metric: {
    flexGrow: 1,
    flexBasis: "47%",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 11,
    gap: 4,
  },
  metricValue: { fontSize: 17, fontWeight: "800" },
  metricLabel: { color: colors.muted, fontSize: 9, fontWeight: "800" },
  sectionTitle: { color: colors.ink, fontSize: 15, fontWeight: "800" },
  muted: { color: colors.muted, fontSize: 11, lineHeight: 17 },
  filterLabel: { color: colors.muted, fontSize: 10, fontWeight: "800", marginTop: 10 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 7, paddingVertical: 7 },
  chip: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    backgroundColor: "#fff",
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  chipActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { color: colors.muted, fontSize: 10, fontWeight: "700" },
  chipTextActive: { color: "#fff" },
  searchInput: { marginTop: 8, marginBottom: 4 },
  viewTabs: { flexDirection: "row", gap: 7 },
  viewTab: {
    borderRadius: 9,
    paddingHorizontal: 13,
    paddingVertical: 9,
    backgroundColor: "#EAE7DF",
  },
  viewTabActive: { backgroundColor: colors.ink },
  viewTabText: { color: colors.muted, fontSize: 11, fontWeight: "700" },
  viewTabTextActive: { color: "#fff" },
  summaryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 16 },
  summaryValue: { flexGrow: 1, flexBasis: "45%" },
  summaryAmount: { color: colors.ink, fontSize: 15, fontWeight: "800", marginTop: 3 },
  alert: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FFF1EF",
    borderRadius: 9,
    padding: 10,
    marginTop: 12,
  },
  alertText: { flex: 1, color: colors.alert, fontSize: 11, fontWeight: "600" },
  record: { padding: 13, gap: 9 },
  recordTop: { flexDirection: "row", alignItems: "center", gap: 9 },
  recordIcon: {
    width: 35,
    height: 35,
    borderRadius: 11,
    backgroundColor: "#E8F5EC",
    alignItems: "center",
    justifyContent: "center",
  },
  invoiceIcon: { backgroundColor: "#FBF1DF" },
  structureIcon: { backgroundColor: "#E8F3EA" },
  recordDetails: { flex: 1, minWidth: 0, gap: 2 },
  recordTitle: { color: colors.ink, fontSize: 13, fontWeight: "800" },
  amount: { color: colors.ink, fontSize: 14, fontWeight: "800" },
  recordFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 8,
  },
  status: { color: colors.success, fontSize: 10, fontWeight: "800" },
  collectButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    backgroundColor: colors.success,
    borderRadius: 9,
    paddingVertical: 10,
  },
  collectText: { color: "#fff", fontSize: 12, fontWeight: "800" },
  emptyCard: { alignItems: "center", gap: 8, paddingVertical: 25 },
  modal: { flex: 1, backgroundColor: colors.paper },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: { color: colors.ink, fontSize: 20, fontWeight: "800", marginTop: 4 },
  modalBody: { padding: 16, paddingBottom: 24, gap: 10 },
  fieldLabel: { color: colors.muted, fontSize: 12, fontWeight: "700", marginTop: 5 },
  saveButton: {
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 50,
    borderRadius: 11,
    margin: 16,
  },
  saveText: { color: "#fff", fontSize: 14, fontWeight: "800" },
});
