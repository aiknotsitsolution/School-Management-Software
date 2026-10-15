import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../context/AuthContext";
import { Button, Card, Empty, Input } from "../components/UI";
import { api } from "../lib/api";
import { colors } from "../theme";
import type {
  FeeInvoice,
  FeePayment,
  FeeReconciliation,
  FeeStructure,
  Student,
} from "../types";

const TABS = ["Payments", "Invoices", "Structures"] as const;
const MODES = [
  "Cash",
  "Card",
  "UPI",
  "Net Banking",
  "Bank Transfer",
  "Cheque",
  "Online Gateway",
] as const;
const FREQUENCIES = ["Monthly", "Quarterly", "Annually", "One-time"] as const;
type Tab = (typeof TABS)[number];
type PaymentForm = {
  studentId: string;
  invoiceId: string;
  amount: string;
  mode: (typeof MODES)[number];
  transactionId: string;
  chequeNo: string;
  chequeDate: string;
  bankName: string;
};
type StructureForm = {
  class: string;
  feeType: string;
  session: string;
  amount: string;
  frequency: (typeof FREQUENCIES)[number];
  dueDate: string;
};
const emptyPayment = (): PaymentForm => ({
  studentId: "",
  invoiceId: "",
  amount: "",
  mode: "Cash",
  transactionId: "",
  chequeNo: "",
  chequeDate: "",
  bankName: "",
});
const emptyStructure = (): StructureForm => ({
  class: "",
  feeType: "",
  session: "",
  amount: "",
  frequency: "Monthly",
  dueDate: "",
});
const studentName = (student?: Student) =>
  student?.name ||
  [student?.firstName, student?.lastName].filter(Boolean).join(" ") ||
  student?.admissionNo ||
  "Student";
const invoiceBelongsToStudent = (invoice: FeeInvoice, student: Student) => {
  const studentId = String(invoice.studentId || "");
  return (
    studentId === String(student._id) ||
    studentId === String(student.admissionNo || "")
  );
};
const money = (value: number) =>
  `₹${Number(value || 0).toLocaleString("en-IN")}`;
const dateLabel = (value?: string) =>
  value
    ? new Date(value).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "—";

export default function FeesCollectionScreen() {
  const { user, can } = useAuth();
  const isSchoolAdmin = user?.role === "school_admin" || user?.role === "admin";
  const [students, setStudents] = useState<Student[]>([]);
  const [invoices, setInvoices] = useState<FeeInvoice[]>([]);
  const [payments, setPayments] = useState<FeePayment[]>([]);
  const [structures, setStructures] = useState<FeeStructure[]>([]);
  const [reconciliation, setReconciliation] =
    useState<FeeReconciliation | null>(null);
  const [tab, setTab] = useState<Tab>("Payments");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [paymentVisible, setPaymentVisible] = useState(false);
  const [structureVisible, setStructureVisible] = useState(false);
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [structureBusy, setStructureBusy] = useState(false);
  const [studentQuery, setStudentQuery] = useState("");
  const [paymentForm, setPaymentForm] = useState<PaymentForm>(emptyPayment);
  const [structureForm, setStructureForm] =
    useState<StructureForm>(emptyStructure);
  const canCollect = isSchoolAdmin && can("fees:collect");
  const canManageStructure = isSchoolAdmin && can("fees:structure");

  const load = async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    const results = await Promise.allSettled([
      api.students.list("limit=1000"),
      api.fees.invoices.list("limit=1000"),
      api.fees.payments.list("limit=1000"),
      api.fees.structures.list("limit=500"),
      api.fees.reports.reconciliation(),
    ]);
    const [
      studentResult,
      invoiceResult,
      paymentResult,
      structureResult,
      reconciliationResult,
    ] = results;
    if (studentResult.status === "fulfilled")
      setStudents(studentResult.value.data || []);
    if (invoiceResult.status === "fulfilled")
      setInvoices(invoiceResult.value.data || []);
    if (paymentResult.status === "fulfilled")
      setPayments(paymentResult.value.data || []);
    if (structureResult.status === "fulfilled")
      setStructures(structureResult.value.data || []);
    setReconciliation(
      reconciliationResult.status === "fulfilled"
        ? reconciliationResult.value.data
        : null,
    );
    const failures = results
      .slice(0, 4)
      .filter((result) => result.status === "rejected");
    setError(
      failures.length
        ? "Some fee data could not be loaded. Pull down to retry."
        : "",
    );
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const studentMap = useMemo(() => {
    const map = new Map<string, Student>();
    students.forEach((student) => {
      map.set(String(student._id), student);
      if (student.admissionNo) map.set(String(student.admissionNo), student);
    });
    return map;
  }, [students]);
  const invoiceMap = useMemo(
    () => new Map(invoices.map((invoice) => [String(invoice._id), invoice])),
    [invoices],
  );
  const totals = useMemo(() => {
    const fallbackCollected = payments
      .filter(
        (payment) =>
          payment.clearanceStatus !== "Bounced" &&
          (payment.mode !== "Cheque" || payment.clearanceStatus === "Cleared"),
      )
      .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    const collected = reconciliation?.netCollected ?? fallbackCollected;
    const outstanding = invoices.reduce(
      (sum, invoice) =>
        sum +
        Math.max(
          0,
          Number(invoice.amount || 0) - Number(invoice.paidAmount || 0),
        ),
      0,
    );
    const overdue = invoices.filter(
      (invoice) => invoice.status === "Overdue",
    ).length;
    return { collected, outstanding, overdue };
  }, [payments, invoices, reconciliation]);

  const filteredPayments = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return payments.filter((payment) => {
      if (!needle) return true;
      const student = studentMap.get(
        String(
          payment.studentId ||
            invoiceMap.get(String(payment.invoiceId))?.studentId ||
            "",
        ),
      );
      const invoice = invoiceMap.get(String(payment.invoiceId || ""));
      return [
        studentName(student),
        payment.receiptNo,
        invoice?.feeType,
        payment.mode,
      ].some((value) =>
        String(value || "")
          .toLowerCase()
          .includes(needle),
      );
    });
  }, [payments, query, studentMap, invoiceMap]);
  const filteredInvoices = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return invoices.filter((invoice) => {
      if (!needle) return true;
      const student = studentMap.get(String(invoice.studentId || ""));
      return [
        studentName(student),
        invoice.feeType,
        invoice.class,
        invoice.session,
        invoice.status,
      ].some((value) =>
        String(value || "")
          .toLowerCase()
          .includes(needle),
      );
    });
  }, [invoices, query, studentMap]);
  const filteredStructures = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return structures.filter(
      (structure) =>
        !needle ||
        [
          structure.class,
          structure.feeType,
          structure.session,
          structure.frequency,
        ].some((value) =>
          String(value || "")
            .toLowerCase()
            .includes(needle),
        ),
    );
  }, [structures, query]);

  const selectedInvoice = invoices.find(
    (invoice) => String(invoice._id) === paymentForm.invoiceId,
  );
  const selectedStudent = students.find(
    (student) => String(student._id) === paymentForm.studentId,
  );
  const remainingForInvoice = selectedInvoice
    ? Math.max(
        0,
        Number(selectedInvoice.amount || 0) -
          Number(selectedInvoice.paidAmount || 0),
      )
    : 0;
  const paymentStudents = useMemo(() => {
    const needle = studentQuery.trim().toLowerCase();
    return students
      .filter((student) =>
        invoices.some(
          (invoice) =>
            invoiceBelongsToStudent(invoice, student) &&
            Number(invoice.amount || 0) > Number(invoice.paidAmount || 0),
        ),
      )
      .filter(
        (student) =>
          !needle ||
          [studentName(student), student.admissionNo].some((value) =>
            String(value || "")
              .toLowerCase()
              .includes(needle),
          ),
      )
      .slice(0, 30);
  }, [students, invoices, studentQuery]);
  const studentInvoices = useMemo(
    () =>
      invoices.filter(
        (invoice) =>
          !!selectedStudent &&
          invoiceBelongsToStudent(invoice, selectedStudent) &&
          Number(invoice.amount || 0) > Number(invoice.paidAmount || 0),
      ),
    [invoices, selectedStudent],
  );

  const chooseStudent = (student: Student) => {
    const pending = invoices.find(
      (invoice) =>
        invoiceBelongsToStudent(invoice, student) &&
        Number(invoice.amount || 0) > Number(invoice.paidAmount || 0),
    );
    setPaymentForm((current) => ({
      ...current,
      studentId: String(student._id),
      invoiceId: pending?._id || "",
      amount: pending
        ? String(
            Math.max(
              0,
              Number(pending.amount || 0) - Number(pending.paidAmount || 0),
            ),
          )
        : "",
    }));
  };

  const chooseInvoice = (invoice: FeeInvoice) => {
    setPaymentForm((current) => ({
      ...current,
      invoiceId: invoice._id,
      amount: String(
        Math.max(
          0,
          Number(invoice.amount || 0) - Number(invoice.paidAmount || 0),
        ),
      ),
    }));
  };

  const recordPayment = async () => {
    if (!paymentForm.invoiceId) {
      Alert.alert("Invoice required", "Select a pending invoice first.");
      return;
    }
    const amount = Number(paymentForm.amount);
    if (
      !Number.isFinite(amount) ||
      amount <= 0 ||
      amount > remainingForInvoice
    ) {
      Alert.alert(
        "Invalid amount",
        `Enter an amount from ₹1 to ${money(remainingForInvoice)}.`,
      );
      return;
    }
    if (paymentForm.mode === "Cheque" && !paymentForm.chequeNo.trim()) {
      Alert.alert(
        "Cheque number required",
        "Enter the cheque number to continue.",
      );
      return;
    }
    setPaymentBusy(true);
    try {
      await api.fees.payments.create({
        invoiceId: paymentForm.invoiceId,
        amount,
        mode: paymentForm.mode,
        transactionId: paymentForm.transactionId.trim() || undefined,
        chequeNo:
          paymentForm.mode === "Cheque"
            ? paymentForm.chequeNo.trim()
            : undefined,
        chequeDate:
          paymentForm.mode === "Cheque" && paymentForm.chequeDate
            ? paymentForm.chequeDate
            : undefined,
        bankName:
          paymentForm.mode === "Cheque"
            ? paymentForm.bankName.trim() || undefined
            : undefined,
      });
      setPaymentVisible(false);
      setPaymentForm(emptyPayment());
      setStudentQuery("");
      await load(true);
      Alert.alert(
        "Payment recorded",
        "The payment has been added to the ledger.",
      );
    } catch (saveError) {
      Alert.alert("Unable to record payment", (saveError as Error).message);
    } finally {
      setPaymentBusy(false);
    }
  };

  const createStructure = async () => {
    const amount = Number(structureForm.amount);
    if (
      !structureForm.class.trim() ||
      !structureForm.feeType.trim() ||
      !structureForm.session.trim()
    ) {
      Alert.alert(
        "Required fields",
        "Class, fee type, and session are required.",
      );
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert("Invalid amount", "Enter a positive fee amount.");
      return;
    }
    setStructureBusy(true);
    try {
      await api.fees.structures.create({
        class: structureForm.class.trim(),
        feeType: structureForm.feeType.trim(),
        session: structureForm.session.trim(),
        amount,
        frequency: structureForm.frequency,
        dueDate: structureForm.dueDate || undefined,
      });
      setStructureVisible(false);
      setStructureForm(emptyStructure());
      await load(true);
    } catch (saveError) {
      Alert.alert("Unable to save fee structure", (saveError as Error).message);
    } finally {
      setStructureBusy(false);
    }
  };

  if (!isSchoolAdmin || !can("fees:read")) {
    return (
      <View style={s.center}>
        <Ionicons name="lock-closed-outline" size={28} color={colors.muted} />
        <Text style={s.emptyTitle}>Admin access required</Text>
        <Text style={s.emptyText}>
          Sign in with a school admin account to view fee collection.
        </Text>
      </View>
    );
  }
  if (loading)
    return <ActivityIndicator style={{ flex: 1 }} color={colors.ink} />;

  return (
    <View style={s.root}>
      <View style={s.hero}>
        <Text style={s.eyebrow}>FINANCE</Text>
        <View style={s.heroLine}>
          <Text style={s.title}>Fees Collection</Text>
          {canCollect && (
            <Pressable
              style={s.heroAction}
              onPress={() => setPaymentVisible(true)}
              accessibilityRole="button"
            >
              <Ionicons name="add" size={18} color={colors.ink} />
              <Text style={s.heroActionText}>Record</Text>
            </Pressable>
          )}
        </View>
        <Text style={s.subtitle}>Payments, invoices and fee structures</Text>
      </View>
      {error ? (
        <Pressable style={s.error} onPress={() => void load()}>
          <Text style={s.errorText}>{error}</Text>
        </Pressable>
      ) : null}

      <View style={s.stats}>
        <Stat
          label="COLLECTED"
          value={money(totals.collected)}
          tone={colors.success}
        />
        <Stat
          label="OUTSTANDING"
          value={money(totals.outstanding)}
          tone={colors.alert}
        />
        <Stat
          label="OVERDUE"
          value={String(totals.overdue)}
          tone={colors.amberDark}
        />
      </View>
      <View style={s.toolbar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.tabs}
        >
          {TABS.map((value) => (
            <Pressable
              key={value}
              onPress={() => setTab(value)}
              style={[s.tab, tab === value && s.tabActive]}
            >
              <Text style={[s.tabText, tab === value && s.tabTextActive]}>
                {value}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
        {tab === "Structures" && canManageStructure && (
          <Pressable
            style={s.addStructure}
            onPress={() => setStructureVisible(true)}
            accessibilityLabel="Add fee structure"
          >
            <Ionicons name="add" size={18} color={colors.ink} />
          </Pressable>
        )}
      </View>
      <View style={s.searchWrap}>
        <Ionicons name="search" size={16} color={colors.muted} />
        <Input
          value={query}
          onChangeText={setQuery}
          placeholder={`Search ${tab.toLowerCase()}`}
          style={s.search}
        />
        {!!query && (
          <Pressable onPress={() => setQuery("")}>
            <Ionicons name="close-circle" size={18} color={colors.muted} />
          </Pressable>
        )}
      </View>
      <Text style={s.resultText}>
        {tab === "Payments"
          ? `${filteredPayments.length} payments`
          : tab === "Invoices"
            ? `${filteredInvoices.length} invoices`
            : `${filteredStructures.length} fee structures`}
      </Text>

      <ScrollView
        style={s.list}
        contentContainerStyle={s.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load(true)}
            tintColor={colors.ink}
          />
        }
      >
        {tab === "Payments" &&
          (filteredPayments.length ? (
            filteredPayments.map((payment) => {
              const invoice = invoiceMap.get(String(payment.invoiceId || ""));
              const student = studentMap.get(
                String(payment.studentId || invoice?.studentId || ""),
              );
              return (
                <Card
                  key={payment._id || `${payment.invoiceId}-${payment.paidOn}`}
                  style={s.recordCard}
                >
                  <View style={s.recordTop}>
                    <View style={s.recordIcon}>
                      <Ionicons
                        name="receipt-outline"
                        size={18}
                        color={colors.info}
                      />
                    </View>
                    <View style={s.recordIdentity}>
                      <Text style={s.recordTitle}>{studentName(student)}</Text>
                      <Text style={s.recordMeta}>
                        {invoice?.feeType || "Fee payment"} ·{" "}
                        {payment.receiptNo || "No receipt"}
                      </Text>
                    </View>
                    <Text style={s.amount}>
                      {money(Number(payment.amount || 0))}
                    </Text>
                  </View>
                  <View style={s.recordFooter}>
                    <Text style={s.recordMeta}>
                      {payment.mode || "—"} · {dateLabel(payment.paidOn)}
                    </Text>
                    {payment.clearanceStatus ? (
                      <Text style={s.recordStatus}>
                        {payment.clearanceStatus}
                      </Text>
                    ) : null}
                  </View>
                </Card>
              );
            })
          ) : (
            <Empty text="No payments found" />
          ))}

        {tab === "Invoices" &&
          (filteredInvoices.length ? (
            filteredInvoices.map((invoice) => {
              const student = studentMap.get(String(invoice.studentId || ""));
              const due = Math.max(
                0,
                Number(invoice.amount || 0) - Number(invoice.paidAmount || 0),
              );
              return (
                <Card key={invoice._id} style={s.recordCard}>
                  <View style={s.recordTop}>
                    <View
                      style={[s.recordIcon, { backgroundColor: "#FBF1DF" }]}
                    >
                      <Ionicons
                        name="document-text-outline"
                        size={18}
                        color={colors.amberDark}
                      />
                    </View>
                    <View style={s.recordIdentity}>
                      <Text style={s.recordTitle}>{studentName(student)}</Text>
                      <Text style={s.recordMeta}>
                        {invoice.feeType || "Fee"} · {invoice.session || "—"}
                      </Text>
                    </View>
                    <Text style={s.amount}>{money(due)}</Text>
                  </View>
                  <View style={s.recordFooter}>
                    <Text style={s.recordMeta}>
                      Due {dateLabel(invoice.dueDate)} · Total{" "}
                      {money(Number(invoice.amount || 0))}
                    </Text>
                    <Text
                      style={[
                        s.invoiceStatus,
                        invoice.status === "Overdue" && { color: colors.alert },
                      ]}
                    >
                      {invoice.status || "Pending"}
                    </Text>
                  </View>
                </Card>
              );
            })
          ) : (
            <Empty text="No invoices found" />
          ))}

        {tab === "Structures" &&
          (filteredStructures.length ? (
            filteredStructures.map((structure) => (
              <Card key={structure._id} style={s.recordCard}>
                <View style={s.recordTop}>
                  <View style={[s.recordIcon, { backgroundColor: "#E8F3EA" }]}>
                    <Ionicons
                      name="wallet-outline"
                      size={18}
                      color={colors.success}
                    />
                  </View>
                  <View style={s.recordIdentity}>
                    <Text style={s.recordTitle}>
                      {structure.feeType || "Fee"}
                    </Text>
                    <Text style={s.recordMeta}>
                      Class {structure.class || "—"} ·{" "}
                      {structure.session || "—"}
                    </Text>
                  </View>
                  <Text style={s.amount}>
                    {money(Number(structure.amount || 0))}
                  </Text>
                </View>
                <View style={s.recordFooter}>
                  <Text style={s.recordMeta}>
                    {structure.frequency || "One-time"} · Due{" "}
                    {dateLabel(structure.dueDate)}
                  </Text>
                  <Text style={s.recordStatus}>
                    {structure.active === false ? "Inactive" : "Active"}
                  </Text>
                </View>
              </Card>
            ))
          ) : (
            <Empty text="No fee structures found" />
          ))}
      </ScrollView>

      <Modal
        visible={paymentVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setPaymentVisible(false)}
      >
        <KeyboardAvoidingView
          style={s.modalRoot}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={s.modalHeader}>
            <View>
              <Text style={s.eyebrow}>PAYMENTS</Text>
              <Text style={s.modalTitle}>Record Payment</Text>
            </View>
            <Pressable
              onPress={() => setPaymentVisible(false)}
              accessibilityLabel="Close payment form"
            >
              <Ionicons name="close" size={23} color={colors.ink} />
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={s.formContent}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={s.fieldLabel}>Student *</Text>
            {selectedStudent ? (
              <Pressable
                style={s.selectedStudent}
                onPress={() => {
                  setPaymentForm((current) => ({
                    ...current,
                    studentId: "",
                    invoiceId: "",
                    amount: "",
                  }));
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={s.recordTitle}>
                    {studentName(selectedStudent)}
                  </Text>
                  <Text style={s.recordMeta}>
                    {selectedStudent.admissionNo || ""}
                  </Text>
                </View>
                <Text style={s.changeText}>Change</Text>
              </Pressable>
            ) : (
              <>
                <Input
                  value={studentQuery}
                  onChangeText={setStudentQuery}
                  placeholder="Search student name or admission no."
                />
                <View style={s.studentChoices}>
                  {paymentStudents.slice(0, 8).map((student) => (
                    <Pressable
                      key={student._id}
                      onPress={() => chooseStudent(student)}
                      style={s.studentChoice}
                    >
                      <Text style={s.recordTitle}>{studentName(student)}</Text>
                      <Text style={s.recordMeta}>
                        {student.admissionNo || `Class ${student.class || "—"}`}
                      </Text>
                    </Pressable>
                  ))}
                  {!paymentStudents.length && (
                    <Text style={s.recordMeta}>
                      No students with pending invoices found.
                    </Text>
                  )}
                </View>
              </>
            )}
            {!!selectedStudent && (
              <>
                <Text style={s.fieldLabel}>Pending Invoice *</Text>
                <View style={s.studentChoices}>
                  {studentInvoices.map((invoice) => (
                    <Pressable
                      key={invoice._id}
                      onPress={() => chooseInvoice(invoice)}
                      style={[
                        s.invoiceChoice,
                        paymentForm.invoiceId === invoice._id &&
                          s.invoiceChoiceActive,
                      ]}
                    >
                      <Text
                        style={[
                          s.recordTitle,
                          paymentForm.invoiceId === invoice._id && {
                            color: "#fff",
                          },
                        ]}
                      >
                        {invoice.feeType || "Fee"} · {invoice.session || ""}
                      </Text>
                      <Text
                        style={[
                          s.recordMeta,
                          paymentForm.invoiceId === invoice._id && {
                            color: "#E6EAF0",
                          },
                        ]}
                      >
                        {money(
                          Math.max(
                            0,
                            Number(invoice.amount || 0) -
                              Number(invoice.paidAmount || 0),
                          ),
                        )}{" "}
                        remaining · due {dateLabel(invoice.dueDate)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={s.fieldLabel}>Amount (₹) *</Text>
                <Input
                  value={paymentForm.amount}
                  onChangeText={(amount) =>
                    setPaymentForm((current) => ({ ...current, amount }))
                  }
                  keyboardType="decimal-pad"
                  placeholder={
                    remainingForInvoice ? String(remainingForInvoice) : "0"
                  }
                />
                <Text style={s.fieldLabel}>Payment mode *</Text>
                <View style={s.chips}>
                  {MODES.map((mode) => (
                    <Pressable
                      key={mode}
                      onPress={() =>
                        setPaymentForm((current) => ({ ...current, mode }))
                      }
                      style={[
                        s.chip,
                        paymentForm.mode === mode && s.chipActive,
                      ]}
                    >
                      <Text
                        style={[
                          s.chipText,
                          paymentForm.mode === mode && s.chipTextActive,
                        ]}
                      >
                        {mode}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                {paymentForm.mode === "Cheque" && (
                  <>
                    <Text style={s.fieldLabel}>Cheque number *</Text>
                    <Input
                      value={paymentForm.chequeNo}
                      onChangeText={(chequeNo) =>
                        setPaymentForm((current) => ({ ...current, chequeNo }))
                      }
                      placeholder="Cheque number"
                    />
                    <Text style={s.fieldLabel}>Cheque date</Text>
                    <Input
                      value={paymentForm.chequeDate}
                      onChangeText={(chequeDate) =>
                        setPaymentForm((current) => ({
                          ...current,
                          chequeDate,
                        }))
                      }
                      placeholder="YYYY-MM-DD"
                    />
                    <Text style={s.fieldLabel}>Bank name</Text>
                    <Input
                      value={paymentForm.bankName}
                      onChangeText={(bankName) =>
                        setPaymentForm((current) => ({ ...current, bankName }))
                      }
                      placeholder="Issuing bank"
                    />
                  </>
                )}
                {paymentForm.mode !== "Cash" && (
                  <>
                    <Text style={s.fieldLabel}>Transaction ID</Text>
                    <Input
                      value={paymentForm.transactionId}
                      onChangeText={(transactionId) =>
                        setPaymentForm((current) => ({
                          ...current,
                          transactionId,
                        }))
                      }
                      placeholder="Optional UTR / payment reference"
                    />
                  </>
                )}
              </>
            )}
          </ScrollView>
          <View style={s.modalFooter}>
            <Button
              title="Record Payment"
              onPress={() => void recordPayment()}
              loading={paymentBusy}
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={structureVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setStructureVisible(false)}
      >
        <KeyboardAvoidingView
          style={s.modalRoot}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={s.modalHeader}>
            <View>
              <Text style={s.eyebrow}>FEE SETUP</Text>
              <Text style={s.modalTitle}>Add Fee Structure</Text>
            </View>
            <Pressable
              onPress={() => setStructureVisible(false)}
              accessibilityLabel="Close fee structure form"
            >
              <Ionicons name="close" size={23} color={colors.ink} />
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={s.formContent}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={s.fieldLabel}>Class *</Text>
            <Input
              value={structureForm.class}
              onChangeText={(value) =>
                setStructureForm((current) => ({ ...current, class: value }))
              }
              placeholder="e.g. Class 1"
            />
            <Text style={s.fieldLabel}>Fee type *</Text>
            <Input
              value={structureForm.feeType}
              onChangeText={(value) =>
                setStructureForm((current) => ({ ...current, feeType: value }))
              }
              placeholder="e.g. Tuition"
            />
            <Text style={s.fieldLabel}>Session *</Text>
            <Input
              value={structureForm.session}
              onChangeText={(value) =>
                setStructureForm((current) => ({ ...current, session: value }))
              }
              placeholder="e.g. 2026-27"
            />
            <Text style={s.fieldLabel}>Amount (₹) *</Text>
            <Input
              value={structureForm.amount}
              onChangeText={(amount) =>
                setStructureForm((current) => ({ ...current, amount }))
              }
              keyboardType="decimal-pad"
              placeholder="e.g. 25000"
            />
            <Text style={s.fieldLabel}>Frequency</Text>
            <View style={s.chips}>
              {FREQUENCIES.map((frequency) => (
                <Pressable
                  key={frequency}
                  onPress={() =>
                    setStructureForm((current) => ({ ...current, frequency }))
                  }
                  style={[
                    s.chip,
                    structureForm.frequency === frequency && s.chipActive,
                  ]}
                >
                  <Text
                    style={[
                      s.chipText,
                      structureForm.frequency === frequency && s.chipTextActive,
                    ]}
                  >
                    {frequency}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={s.fieldLabel}>Due date</Text>
            <Input
              value={structureForm.dueDate}
              onChangeText={(dueDate) =>
                setStructureForm((current) => ({ ...current, dueDate }))
              }
              placeholder="YYYY-MM-DD"
            />
          </ScrollView>
          <View style={s.modalFooter}>
            <Button
              title="Save Structure"
              onPress={() => void createStructure()}
              loading={structureBusy}
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <View style={s.stat}>
      <Text style={[s.statValue, { color: tone }]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.paper,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
    backgroundColor: colors.paper,
  },
  hero: {
    backgroundColor: colors.ink,
    borderRadius: 16,
    padding: 16,
    marginBottom: 13,
  },
  eyebrow: {
    color: colors.amber,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
  },
  heroLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 5,
  },
  title: { color: "#fff", fontSize: 21, fontWeight: "800", flex: 1 },
  subtitle: { color: "#D8DEEA", fontSize: 12, marginTop: 5 },
  heroAction: {
    backgroundColor: colors.amber,
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  heroActionText: { color: colors.ink, fontSize: 11, fontWeight: "800" },
  stats: { flexDirection: "row", gap: 8, marginBottom: 13 },
  stat: {
    flex: 1,
    minWidth: 0,
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 10,
  },
  statValue: { fontSize: 15, fontWeight: "800" },
  statLabel: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: "800",
    marginTop: 4,
  },
  toolbar: { flexDirection: "row", alignItems: "center", gap: 8 },
  tabs: { flexDirection: "row", gap: 7, paddingBottom: 8 },
  tab: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: "#EAE7DF",
  },
  tabActive: { backgroundColor: colors.ink },
  tabText: { color: colors.muted, fontSize: 11, fontWeight: "700" },
  tabTextActive: { color: "#fff" },
  addStructure: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.amber,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 11,
    paddingHorizontal: 12,
    marginBottom: 7,
  },
  search: {
    flex: 1,
    backgroundColor: "transparent",
    borderWidth: 0,
    paddingHorizontal: 0,
    paddingVertical: 10,
  },
  resultText: { color: colors.muted, fontSize: 11, marginBottom: 5 },
  list: { flex: 1 },
  listContent: { gap: 9, paddingBottom: 24, flexGrow: 1 },
  recordCard: { padding: 13, gap: 9, borderRadius: 12 },
  recordTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  recordIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: "#EAF0F5",
    alignItems: "center",
    justifyContent: "center",
  },
  recordIdentity: { flex: 1, minWidth: 0 },
  recordTitle: { color: colors.ink, fontSize: 13, fontWeight: "800" },
  recordMeta: {
    color: colors.muted,
    fontSize: 10.5,
    marginTop: 3,
    flexShrink: 1,
  },
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
  recordStatus: { color: colors.success, fontSize: 10, fontWeight: "800" },
  invoiceStatus: { color: colors.muted, fontSize: 10, fontWeight: "800" },
  error: {
    backgroundColor: "#FFF1EF",
    borderColor: colors.alert,
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  errorText: { color: colors.alert, fontSize: 11 },
  emptyTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "800",
    marginTop: 12,
  },
  emptyText: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 5,
    textAlign: "center",
  },
  modalRoot: { flex: 1, backgroundColor: colors.paper },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    color: colors.ink,
    fontSize: 19,
    fontWeight: "800",
    marginTop: 4,
  },
  formContent: { padding: 16, paddingBottom: 24, gap: 10 },
  fieldLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4,
  },
  modalFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  selectedStudent: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
  },
  changeText: { color: colors.info, fontSize: 11, fontWeight: "800" },
  studentChoices: { gap: 7 },
  studentChoice: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 9,
    padding: 10,
  },
  invoiceChoice: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 9,
    padding: 10,
  },
  invoiceChoiceActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  chipActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { color: colors.muted, fontSize: 10, fontWeight: "700" },
  chipTextActive: { color: "#fff" },
});
