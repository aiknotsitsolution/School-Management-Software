import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
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
import { Button, Card, Input } from "../components/UI";
import { useAuth } from "../context/AuthContext";
import { API_BASE_URL, api, KEYS } from "../lib/api";
import { colors, radius } from "../theme";
import type {
  FeeInvoiceRecord,
  FeePaymentOrder,
  PaymentOrderCheckout,
  Student,
} from "../types";

type FeeLine = FeeInvoiceRecord & { due: number };
type Selection = Record<string, { selected: boolean; amount: string }>;
type ReceiptInfo = { receiptNo: string; amount?: number };
type ManualCheckout = PaymentOrderCheckout & { orderId: string };

const money = (value: number) =>
  `₹${Number(value || 0).toLocaleString("en-IN")}`;
const textOf = (value: unknown) => (value == null ? "" : String(value));
const studentName = (student?: Student | null) =>
  student?.name ||
  [student?.firstName, student?.lastName].filter(Boolean).join(" ") ||
  student?.admissionNo ||
  "Student";
const studentRef = (student?: Student | null) =>
  String(student?.admissionNo || student?._id || "");
const invoiceStatus = (invoice: FeeInvoiceRecord) => {
  const due = Math.max(
    0,
    Number(invoice.amount || 0) - Number(invoice.paidAmount || 0),
  );
  if (due <= 0) return "Paid";
  if (Number(invoice.paidAmount || 0) > 0) return "Partial";
  if (invoice.status === "Overdue") return "Overdue";
  return "Unpaid";
};
const isTuition = (invoice: FeeInvoiceRecord) =>
  /tuition/i.test(String(invoice.feeType || ""));
const clampAmount = (value: string, due: number) => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 0;
  return Math.min(Math.max(Math.round(amount), 0), due);
};
const validateAmount = (value: string, due: number) => {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return "Enter an amount.";
  if (amount > due) return `Maximum amount is ${money(due)}.`;
  if (amount === due) return "";
  if (amount < 1000) return "Partial Tuition payments must be at least ₹1,000.";
  if (amount % 100 !== 0)
    return "Partial Tuition payments must use ₹100 steps.";
  return "";
};
const dateLabel = (value?: string) => {
  if (!value) return "—";
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return "—";
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
};
const csvCell = (value: unknown) => {
  let cell = textOf(value);
  if (/^[\s]*[=+\-@]/.test(cell)) cell = `'${cell}`;
  return `"${cell.replace(/"/g, '""')}"`;
};

export default function OnlinePaymentScreen() {
  const { user, can } = useAuth();
  const isSelf = user?.role === "student";
  const canBrowseStudents = can("students:read");
  const [students, setStudents] = useState<Student[]>([]);
  const [invoices, setInvoices] = useState<FeeInvoiceRecord[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [studentPickerVisible, setStudentPickerVisible] = useState(false);
  const [studentQuery, setStudentQuery] = useState("");
  const [classFilter, setClassFilter] = useState("All");
  const [invoiceSelection, setInvoiceSelection] = useState<Selection>({});
  const [creating, setCreating] = useState(false);
  const [orderNotice, setOrderNotice] = useState<FeePaymentOrder[]>([]);
  const [manualCheckout, setManualCheckout] =
    useState<ManualCheckout | null>(null);
  const [receipt, setReceipt] = useState<ReceiptInfo | null>(null);
  const [previewInvoice, setPreviewInvoice] =
    useState<FeeInvoiceRecord | null>(null);
  const [downloading, setDownloading] = useState("");

  const load = async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const studentResponse = isSelf
        ? await api.students.me().then((result) => ({
            data: result?.data ? [result.data] : [],
          }))
        : canBrowseStudents
          ? await api.students.list("limit=1000")
          : null;
      if (!studentResponse) {
        throw new Error(
          "Your account does not have access to the student fee portal.",
        );
      }
      const invoiceResponse = await api.fees.invoices.list("limit=1000");
      const loadedStudents = studentResponse.data || [];
      setStudents(loadedStudents);
      setInvoices(invoiceResponse.data || []);
      setSelectedStudent((current) => {
        if (
          current &&
          loadedStudents.some(
            (student) => String(student._id) === String(current._id),
          )
        ) {
          return (
            loadedStudents.find(
              (student) => String(student._id) === String(current._id),
            ) || current
          );
        }
        return loadedStudents[0] || null;
      });
    } catch (loadError) {
      setError((loadError as Error).message || "Unable to load fee invoices.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void load();
  }, [isSelf, canBrowseStudents]);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void load(true);
    });
    return () => subscription.remove();
  }, [isSelf, canBrowseStudents]);

  const feeLines = useMemo<FeeLine[]>(() => {
    const reference = studentRef(selectedStudent);
    return invoices
      .filter((invoice) => String(invoice.studentId || "") === reference)
      .map((invoice) => ({
        ...invoice,
        due: Math.max(
          0,
          Number(invoice.amount || 0) - Number(invoice.paidAmount || 0),
        ),
      }));
  }, [invoices, selectedStudent]);
  useEffect(() => {
    setInvoiceSelection(
      Object.fromEntries(
        feeLines.map((invoice) => [
          invoice._id,
          { selected: invoice.due > 0, amount: String(invoice.due) },
        ]),
      ),
    );
    setOrderNotice([]);
    setManualCheckout(null);
    setReceipt(null);
  }, [feeLines]);

  const outstanding = useMemo(
    () => feeLines.reduce((sum, invoice) => sum + invoice.due, 0),
    [feeLines],
  );
  const paidInvoices = feeLines.filter(
    (invoice) => invoiceStatus(invoice) === "Paid",
  ).length;
  const pendingStudents = new Set(
    invoices
      .filter(
        (invoice) =>
          Number(invoice.amount || 0) - Number(invoice.paidAmount || 0) > 0,
      )
      .map((invoice) => String(invoice.studentId || "")),
  ).size;
  const selectedLines = feeLines
    .filter(
      (invoice) => invoice.due > 0 && invoiceSelection[invoice._id]?.selected,
    )
    .map((invoice) => {
      const rawAmount = isTuition(invoice)
        ? invoiceSelection[invoice._id]?.amount || ""
        : String(invoice.due);
      return {
        invoice,
        rawAmount,
        amount: clampAmount(rawAmount, invoice.due),
        error: isTuition(invoice)
          ? validateAmount(rawAmount, invoice.due)
          : "",
      };
    });
  const orderTotal = selectedLines.reduce(
    (sum, line) => sum + (line.error ? 0 : line.amount),
    0,
  );
  const hasInvalidAmount = selectedLines.some((line) => Boolean(line.error));
  const payableLines = feeLines.filter((invoice) => invoice.due > 0);
  const allSelected =
    payableLines.length > 0 &&
    payableLines.every(
      (invoice) => invoiceSelection[invoice._id]?.selected,
    );
  const onlyOneSelected = selectedLines.length === 1;

  const filteredStudents = useMemo(() => {
    const needle = studentQuery.trim().toLowerCase();
    return students.filter((student) => {
      const matchesClass =
        classFilter === "All" || String(student.class || "") === classFilter;
      const matchesQuery =
        !needle ||
        studentName(student).toLowerCase().includes(needle) ||
        studentRef(student).toLowerCase().includes(needle);
      return matchesClass && matchesQuery;
    });
  }, [students, studentQuery, classFilter]);
  const classOptions = useMemo(
    () => [
      "All",
      ...new Set(
        students
          .map((student) => String(student.class || "").trim())
          .filter(Boolean),
      ),
    ],
    [students],
  );

  const toggleAll = (selected: boolean) => {
    setInvoiceSelection((current) => {
      const next = { ...current };
      payableLines.forEach((invoice) => {
        next[invoice._id] = {
          selected,
          amount: current[invoice._id]?.amount || String(invoice.due),
        };
      });
      return next;
    });
  };
  const createPaymentOrder = async (lines = selectedLines) => {
    if (!selectedStudent || !lines.length || creating) return;
    if (lines.some((line) => line.error)) {
      setError("Correct the highlighted payment amount before continuing.");
      return;
    }
    setCreating(true);
    setError("");
    setOrderNotice([]);
    setManualCheckout(null);
    setReceipt(null);
    try {
      const createdOrders: FeePaymentOrder[] = [];
      for (const line of lines) {
        const result = await api.fees.payments.orders.create({
          invoiceId: line.invoice._id,
          amount: line.amount,
        });
        createdOrders.push(result.data);
      }
      setOrderNotice(createdOrders);
      if (createdOrders.length) {
        void initiateOrder(createdOrders[0]);
      }
    } catch (createError) {
      setError(
        (createError as Error).message || "Unable to create payment order.",
      );
    } finally {
      setCreating(false);
    }
  };

  const initiateOrder = async (order: FeePaymentOrder) => {
    try {
      const result = await api.fees.payments.orders.initiate(order._id);
      const initiated = result.data;
      const checkout = initiated.checkout;
      const updatedOrder = { ...order, ...initiated };
      setOrderNotice((current) =>
        current.map((item) =>
          item._id === updatedOrder._id ? updatedOrder : item,
        ),
      );
      if (!checkout) {
        setError("The payment gateway did not return checkout details.");
        return;
      }
      if (checkout.checkoutUrl) {
        await Linking.openURL(checkout.checkoutUrl);
        return;
      }
      if (checkout.upiIntent || checkout.upiId) {
        setManualCheckout({ ...checkout, orderId: order._id });
        if (checkout.upiIntent) {
          const canOpen = await Linking.canOpenURL(checkout.upiIntent);
          if (!canOpen) {
            Alert.alert(
              "UPI app unavailable",
              `No UPI app could open this payment. Share the UPI ID with a payment app and give the transaction reference to the school office.`,
            );
            return;
          }
          await Linking.openURL(checkout.upiIntent);
        }
        return;
      }
      if (checkout.keyId && checkout.providerOrderId) {
        setError(
          "This school gateway returned a provider order but no hosted checkout URL. Complete checkout using the school payment portal or contact the school office; this app will not mark it paid without provider verification.",
        );
        return;
      }
      setError(
        "The school payment gateway is not configured. Please complete payment at the school office.",
      );
    } catch (initiateError) {
      setError(
        (initiateError as Error).message ||
          "Unable to start payment checkout.",
      );
    }
  };

  const cancelOrder = async (order: FeePaymentOrder) => {
    try {
      await api.fees.payments.orders.cancel(order._id);
      setOrderNotice((current) =>
        current.map((item) =>
          item._id === order._id ? { ...item, status: "cancelled" } : item,
        ),
      );
      if (manualCheckout?.orderId === order._id) setManualCheckout(null);
    } catch (cancelError) {
      Alert.alert(
        "Unable to cancel payment order",
        (cancelError as Error).message || "Please try again.",
      );
    }
  };

  const downloadProtectedFile = async (
    path: string,
    fileName: string,
    mimeType: string,
    dialogTitle: string,
  ) => {
    if (!FileSystem.cacheDirectory) {
      throw new Error("Temporary file storage is unavailable.");
    }
    const token = await AsyncStorage.getItem(KEYS.access);
    const uri = `${FileSystem.cacheDirectory}${fileName}`;
    const result = await FileSystem.downloadAsync(
      `${API_BASE_URL}${path}`,
      uri,
      { headers: token ? { Authorization: `Bearer ${token}` } : {} },
    );
    if (result.status < 200 || result.status >= 300) {
      await FileSystem.deleteAsync(result.uri, { idempotent: true });
      throw new Error(
        result.status === 403
          ? "You do not have permission to download this document."
          : `Document download failed (HTTP ${result.status}).`,
      );
    }
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(result.uri, {
        mimeType,
        dialogTitle,
        UTI:
          mimeType === "application/pdf"
            ? "com.adobe.pdf"
            : "public.data",
      });
    } else {
      await Share.share({ url: result.uri, title: dialogTitle });
    }
  };
  const downloadInvoice = async (invoice: FeeInvoiceRecord) => {
    setDownloading(invoice._id);
    try {
      await downloadProtectedFile(
        `/fees/${encodeURIComponent(invoice._id)}/pdf`,
        `fee-invoice-${invoice._id}.pdf`,
        "application/pdf",
        "Fee invoice",
      );
    } catch (downloadError) {
      Alert.alert(
        "Invoice download failed",
        (downloadError as Error).message || "Please try again.",
      );
    } finally {
      setDownloading("");
    }
  };
  const downloadReceipt = async (receiptNo: string) => {
    setDownloading("receipt");
    try {
      await downloadProtectedFile(
        `/payments/receipt/${encodeURIComponent(receiptNo)}/pdf`,
        `fee-receipt-${receiptNo.replace(/[^\w.-]/g, "_")}.pdf`,
        "application/pdf",
        "Payment receipt",
      );
    } catch (downloadError) {
      Alert.alert(
        "Receipt download failed",
        (downloadError as Error).message || "Please try again.",
      );
    } finally {
      setDownloading("");
    }
  };
  const shareUpiId = async () => {
    if (!manualCheckout?.upiId) return;
    try {
      await Share.share({
        message: `UPI ID: ${manualCheckout.upiId}\nAmount: ${money(manualCheckout.amount || 0)}\nPayment reference: ${orderNotice.find((order) => order._id === manualCheckout.orderId)?.externalRef || manualCheckout.orderId}`,
      });
    } catch (shareError) {
      Alert.alert(
        "Unable to share UPI details",
        (shareError as Error).message || "Please try again.",
      );
    }
  };
  const exportInvoices = async () => {
    const csv = [
      [
        "Fee Type",
        "Session",
        "Total Amount",
        "Paid",
        "Outstanding",
        "Status",
        "Due Date",
        "Receipt",
      ],
      ...feeLines.map((invoice) => [
        invoice.feeType,
        invoice.session || "",
        invoice.amount,
        invoice.paidAmount || 0,
        invoice.due,
        invoiceStatus(invoice),
        invoice.dueDate || "",
        invoice.receiptNo || "",
      ]),
    ]
      .map((row) => row.map(csvCell).join(","))
      .join("\r\n");
    try {
      if (!FileSystem.cacheDirectory || !(await Sharing.isAvailableAsync())) {
        await Share.share({ message: csv, title: "Fee invoices" });
        return;
      }
      const uri = `${FileSystem.cacheDirectory}fee-invoices-${studentRef(selectedStudent) || "student"}.csv`;
      await FileSystem.writeAsStringAsync(uri, `\uFEFF${csv}`, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      await Sharing.shareAsync(uri, {
        mimeType: "text/csv",
        dialogTitle: "Fee invoices",
        UTI: "public.comma-separated-values-text",
      });
    } catch (exportError) {
      Alert.alert(
        "Export failed",
        (exportError as Error).message || "Unable to export fee invoices.",
      );
    }
  };

  const chooseStudent = (student: Student) => {
    setSelectedStudent(student);
    setStudentPickerVisible(false);
    setStudentQuery("");
    setClassFilter("All");
  };

  return (
    <View style={s.screen}>
      <ScrollView
        contentContainerStyle={s.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load(true)}
            tintColor={colors.ink}
          />
        }
      >
        <View style={s.intro}>
          <View style={s.introIcon}>
            <Ionicons
              name="card"
              size={23}
              color={colors.amberDark}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.eyebrow}>{isSelf ? "MY FEES" : "FINANCE"}</Text>
            <Text style={s.title}>
              {isSelf ? "Pay Fees Online" : "Online Fees Payment"}
            </Text>
            <Text style={s.subtitle}>
              {isSelf
                ? "Review fee invoices and pay your outstanding balance."
                : "Select a student to review invoices and create a payment order."}
            </Text>
          </View>
        </View>

        {error ? (
          <Card style={{ gap: 8 }}>
            <Text style={s.error}>{error}</Text>
            <Pressable onPress={() => void load()}>
              <Text style={s.retry}>Retry / refresh fee data</Text>
            </Pressable>
          </Card>
        ) : null}
        {receipt && (
          <Card style={s.receiptCard}>
            <Ionicons
              name="checkmark-circle"
              size={25}
              color={colors.success}
            />
            <View style={{ flex: 1 }}>
              <Text style={s.sectionTitle}>Payment received</Text>
              <Text style={s.helper}>
                {receipt.amount ? `${money(receipt.amount)} credited · ` : ""}
                Receipt {receipt.receiptNo}
              </Text>
            </View>
            <Pressable
              disabled={downloading === "receipt"}
              onPress={() => void downloadReceipt(receipt.receiptNo)}
              style={s.smallAction}
            >
              {downloading === "receipt" ? (
                <ActivityIndicator size="small" color={colors.info} />
              ) : (
                <>
                  <Ionicons
                    name="download-outline"
                    size={17}
                    color={colors.info}
                  />
                  <Text style={s.actionText}>Receipt</Text>
                </>
              )}
            </Pressable>
          </Card>
        )}
        {!!orderNotice.length && (
          <Card style={{ gap: 9 }}>
            <View style={s.row}>
              <Ionicons
                name="receipt-outline"
                size={20}
                color={colors.info}
              />
              <Text style={s.sectionTitle}>
                Payment {orderNotice.length === 1 ? "order" : "orders"} created
              </Text>
            </View>
            <Text style={s.helper}>
              An order is not a payment. Fees remain outstanding until the
              provider confirms payment or the school office verifies a manual
              payment.
            </Text>
            {orderNotice.map((order) => (
              <View key={order._id} style={s.orderLine}>
                <View style={{ flex: 1 }}>
                  <Text style={s.orderRef}>
                    {order.externalRef || order._id}
                  </Text>
                  <Text style={s.helper}>
                    {money(order.amount)} · {order.status}
                  </Text>
                </View>
                {order.status !== "completed" &&
                  order.status !== "cancelled" && (
                    <Pressable onPress={() => void cancelOrder(order)}>
                      <Text style={s.cancelText}>Cancel</Text>
                    </Pressable>
                  )}
              </View>
            ))}
          </Card>
        )}
        {manualCheckout && (
          <Card style={{ gap: 9 }}>
            <View style={s.row}>
              <Ionicons name="phone-portrait" size={20} color={colors.info} />
              <Text style={s.sectionTitle}>Pay by UPI</Text>
            </View>
            {manualCheckout.upiId ? (
              <Text style={s.helper}>
                UPI ID:{" "}
                <Text style={s.orderRef}>{manualCheckout.upiId}</Text>
              </Text>
            ) : null}
            <Text style={s.helper}>
              Pay {money(manualCheckout.amount || 0)} using your UPI app. The
              school office must verify your transaction reference before the
              invoice is marked paid.
            </Text>
            <View style={s.inlineActions}>
              {manualCheckout.upiIntent ? (
                <View style={{ flex: 1 }}>
                  <Button
                    title="Open UPI app"
                    onPress={() =>
                      manualCheckout.upiIntent
                        ? void Linking.openURL(manualCheckout.upiIntent)
                        : undefined
                    }
                  />
                </View>
              ) : null}
              {manualCheckout.upiId ? (
                <View style={{ flex: 1 }}>
                  <Button
                    title="Share UPI details"
                    variant="ghost"
                    onPress={() => void shareUpiId()}
                  />
                </View>
              ) : null}
            </View>
          </Card>
        )}

        <View style={s.stats}>
          <Stat
            label={isSelf ? "My invoices" : "Pending students"}
            value={isSelf ? feeLines.length : pendingStudents}
            icon="document-text"
          />
          <Stat
            label="Outstanding"
            value={money(outstanding)}
            icon="wallet"
          />
          <Stat label="Paid invoices" value={paidInvoices} icon="checkmark-circle" />
        </View>

        <Card style={{ gap: 13 }}>
          <View style={s.sectionHeader}>
            <View>
              <Text style={s.sectionTitle}>Fee Summary</Text>
              <Text style={s.helper}>Invoices and current dues</Text>
            </View>
            <Pressable
              onPress={() => void exportInvoices()}
              style={s.smallAction}
              accessibilityRole="button"
              accessibilityLabel="Export fee invoices"
            >
              <Ionicons
                name="download-outline"
                size={17}
                color={colors.info}
              />
              <Text style={s.actionText}>Export</Text>
            </Pressable>
          </View>
          <Pressable
            onPress={() => {
              if (!isSelf && students.length > 1) setStudentPickerVisible(true);
            }}
            disabled={isSelf || students.length <= 1}
            style={s.studentHeader}
          >
            <View style={s.studentAvatar}>
              <Ionicons name="person" size={20} color={colors.info} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.studentName}>
                {studentName(selectedStudent)}
              </Text>
              <Text style={s.helper}>
                {[
                  studentRef(selectedStudent),
                  selectedStudent?.class
                    ? `Class ${selectedStudent.class}${selectedStudent.section ? `-${selectedStudent.section}` : ""}`
                    : "",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
            </View>
            {!isSelf && students.length > 1 && (
              <Ionicons
                name="chevron-down"
                size={20}
                color={colors.muted}
              />
            )}
          </Pressable>
          {!isSelf && students.length === 0 && !loading ? (
            <Text style={s.helper}>
              No students are available to select.
            </Text>
          ) : null}
          {loading ? (
            <ActivityIndicator
              style={{ marginVertical: 24 }}
              color={colors.ink}
            />
          ) : feeLines.length === 0 ? (
            <View style={s.empty}>
              <Ionicons
                name="receipt-outline"
                size={34}
                color={colors.muted}
              />
              <Text style={s.emptyTitle}>No invoices</Text>
              <Text style={s.helper}>
                {isSelf
                  ? "No fee invoice has been raised for you yet."
                  : "No fee invoices are available for this student."}
              </Text>
            </View>
          ) : (
            <>
              {payableLines.length > 0 && (
                <Pressable
                  onPress={() => toggleAll(!allSelected)}
                  style={s.selectAll}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: allSelected }}
                >
                  <Ionicons
                    name={allSelected ? "checkbox" : "square-outline"}
                    size={20}
                    color={allSelected ? colors.info : colors.muted}
                  />
                  <Text style={s.selectAllText}>Select all outstanding dues</Text>
                </Pressable>
              )}
              <View style={{ gap: 10 }}>
                {feeLines.map((invoice) => (
                  <InvoiceCard
                    key={invoice._id}
                    invoice={invoice}
                    selection={invoiceSelection[invoice._id]}
                    onToggle={() =>
                      setInvoiceSelection((current) => ({
                        ...current,
                        [invoice._id]: {
                          selected: !current[invoice._id]?.selected,
                          amount:
                            current[invoice._id]?.amount ||
                            String(invoice.due),
                        },
                      }))
                    }
                    onAmountChange={(amount) =>
                      setInvoiceSelection((current) => ({
                        ...current,
                        [invoice._id]: {
                          selected: current[invoice._id]?.selected ?? true,
                          amount: amount.replace(/[^\d]/g, "").slice(0, 8),
                        },
                      }))
                    }
                    onPay={() =>
                      void createPaymentOrder([
                        {
                          invoice,
                          rawAmount: isTuition(invoice)
                            ? invoiceSelection[invoice._id]?.amount || ""
                            : String(invoice.due),
                          amount: isTuition(invoice)
                            ? clampAmount(
                                invoiceSelection[invoice._id]?.amount || "",
                                invoice.due,
                              )
                            : invoice.due,
                          error: isTuition(invoice)
                            ? validateAmount(
                                invoiceSelection[invoice._id]?.amount || "",
                                invoice.due,
                              )
                            : "",
                        },
                      ])
                    }
                    selected={Boolean(invoiceSelection[invoice._id]?.selected)}
                    creating={creating}
                    onView={() => setPreviewInvoice(invoice)}
                  />
                ))}
              </View>
              <View style={s.totalRow}>
                <Text style={s.totalLabel}>Total current dues</Text>
                <Text style={s.totalAmount}>{money(outstanding)}</Text>
              </View>
              {selectedLines.length > 1 && (
                <View style={s.totalRow}>
                  <Text style={[s.helper, { flex: 1 }]}>
                    Order amount ({selectedLines.length} fees selected)
                  </Text>
                  <Text style={s.orderTotal}>{money(orderTotal)}</Text>
                </View>
              )}
              {hasInvalidAmount && (
                <Text style={s.error}>
                  Partial Tuition payment must be at least ₹1,000 and use
                  ₹100 steps, or pay the exact full outstanding amount.
                </Text>
              )}
              {selectedLines.length > 1 && (
                <Button
                  title={
                    creating
                      ? "Creating order..."
                      : `Pay now · ${money(orderTotal)}`
                  }
                  loading={creating}
                  onPress={() => void createPaymentOrder()}
                />
              )}
              {!selectedLines.length && outstanding > 0 && (
                <Text style={[s.helper, { textAlign: "center" }]}>
                  Select at least one fee to create a payment order.
                </Text>
              )}
              {outstanding === 0 && (
                <View style={s.paidBanner}>
                  <Ionicons
                    name="checkmark-circle"
                    size={20}
                    color={colors.success}
                  />
                  <Text style={s.paidText}>All invoices are paid</Text>
                </View>
              )}
            </>
          )}
        </Card>

        <Card style={{ gap: 12 }}>
          <View style={s.sectionHeader}>
            <View>
              <Text style={s.sectionTitle}>Transaction History</Text>
              <Text style={s.helper}>Invoice status, receipts and due dates</Text>
            </View>
            <Ionicons
              name="shield-checkmark"
              size={20}
              color={colors.success}
            />
          </View>
          {feeLines.length === 0 ? (
            <Text style={s.helper}>No invoices have been raised.</Text>
          ) : (
            feeLines.map((invoice) => (
              <HistoryCard
                key={invoice._id}
                invoice={invoice}
                downloading={downloading === invoice._id}
                onView={() => setPreviewInvoice(invoice)}
                onDownload={() => void downloadInvoice(invoice)}
              />
            ))
          )}
          <Text style={s.helper}>
            A payment order is not recorded as paid until confirmed by the
            configured gateway or verified by the school office.
          </Text>
        </Card>
      </ScrollView>

      <Modal
        visible={studentPickerVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setStudentPickerVisible(false)}
      >
        <KeyboardAvoidingView
          style={s.modalBackdrop}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={s.modalCard}>
            <View style={s.modalHeader}>
              <View>
                <Text style={s.modalTitle}>Select Student</Text>
                <Text style={s.helper}>
                  Choose the student whose invoices you want to view.
                </Text>
              </View>
              <Pressable
                onPress={() => setStudentPickerVisible(false)}
                hitSlop={10}
              >
                <Ionicons name="close" size={23} color={colors.muted} />
              </Pressable>
            </View>
            <View style={s.pickerFilters}>
              <Input
                value={studentQuery}
                onChangeText={setStudentQuery}
                placeholder="Search by name or ID..."
                autoCapitalize="none"
              />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={s.chips}
              >
                {classOptions.map((className) => (
                  <Pressable
                    key={className}
                    onPress={() => setClassFilter(className)}
                    style={[
                      s.chip,
                      classFilter === className && s.activeChip,
                    ]}
                  >
                    <Text
                      style={[
                        s.chipText,
                        classFilter === className && s.activeChipText,
                      ]}
                    >
                      {className === "All" ? "All classes" : className}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={s.studentList}
            >
              {filteredStudents.length ? (
                filteredStudents.map((student) => (
                  <Pressable
                    key={student._id}
                    onPress={() => chooseStudent(student)}
                    style={[
                      s.studentOption,
                      selectedStudent?._id === student._id &&
                        s.studentOptionActive,
                    ]}
                  >
                    {student.photoUrl ? (
                      <Image
                        source={{ uri: student.photoUrl }}
                        style={s.studentPhoto}
                      />
                    ) : (
                      <View style={s.studentAvatar}>
                        <Ionicons
                          name="person"
                          size={18}
                          color={colors.info}
                        />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={s.studentName}>{studentName(student)}</Text>
                      <Text style={s.helper}>
                        {studentRef(student)} · Class {student.class || "—"}
                        {student.section ? `-${student.section}` : ""}
                      </Text>
                    </View>
                    <Text
                      style={[
                        s.statusText,
                        {
                          color: studentHasDues(student, invoices)
                            ? colors.amberDark
                            : colors.success,
                        },
                      ]}
                    >
                      {studentHasDues(student, invoices) ? "Pending" : "Paid"}
                    </Text>
                  </Pressable>
                ))
              ) : (
                <Text style={s.helper}>No students match your search.</Text>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <InvoiceModal
        invoice={previewInvoice}
        downloading={Boolean(previewInvoice && downloading === previewInvoice._id)}
        onClose={() => setPreviewInvoice(null)}
        onDownload={() =>
          previewInvoice && void downloadInvoice(previewInvoice)
        }
      />
    </View>
  );
}

function studentHasDues(
  student: Student,
  invoices: FeeInvoiceRecord[],
): boolean {
  const reference = studentRef(student);
  return invoices.some(
    (invoice) =>
      String(invoice.studentId || "") === reference &&
      Number(invoice.amount || 0) - Number(invoice.paidAmount || 0) > 0,
  );
}

function Stat({
  label,
  value,
  icon,
}: {
  label: string;
  value: number | string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
}) {
  return (
    <Card style={s.stat}>
      <Ionicons name={icon} size={18} color={colors.info} />
      <Text style={s.statValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={s.statLabel}>{label}</Text>
    </Card>
  );
}

function InvoiceCard({
  invoice,
  selection,
  onToggle,
  onAmountChange,
  onPay,
  selected,
  creating,
  onView,
}: {
  invoice: FeeLine;
  selection?: { selected: boolean; amount: string };
  onToggle: () => void;
  onAmountChange: (amount: string) => void;
  onPay: () => void;
  selected: boolean;
  creating: boolean;
  onView: () => void;
}) {
  const status = invoiceStatus(invoice);
  const color =
    status === "Paid"
      ? colors.success
      : status === "Overdue"
        ? colors.alert
        : colors.amberDark;
  const amountError =
    selected && isTuition(invoice)
      ? validateAmount(selection?.amount || "", invoice.due)
      : "";
  return (
    <View style={s.invoiceCard}>
      <View style={s.invoiceTop}>
        {invoice.due > 0 ? (
          <Pressable
            onPress={onToggle}
            style={s.checkboxHit}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: selected }}
            accessibilityLabel={`Select ${invoice.feeType}`}
          >
            <Ionicons
              name={selected ? "checkbox" : "square-outline"}
              size={21}
              color={selected ? colors.info : colors.muted}
            />
          </Pressable>
        ) : (
          <View style={s.checkboxHit}>
            <Ionicons
              name="checkmark-circle"
              size={21}
              color={colors.success}
            />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={s.invoiceTitle}>{invoice.feeType}</Text>
          <Text style={s.helper}>
            {invoice.session || "Current session"}
            {invoice.receiptNo ? ` · Receipt ${invoice.receiptNo}` : ""}
          </Text>
        </View>
        <View style={[s.statusBadge, { backgroundColor: `${color}18` }]}>
          <Text style={[s.statusText, { color }]}>{status}</Text>
        </View>
      </View>
      <View style={s.amountRow}>
        <View style={s.amountColumn}>
          <Text style={s.moneyLabel}>Total</Text>
          <Text style={s.amountValue}>{money(invoice.amount)}</Text>
        </View>
        <View style={s.amountColumn}>
          <Text style={s.moneyLabel}>Paid</Text>
          <Text style={s.amountValue}>
            {money(invoice.paidAmount || 0)}
          </Text>
        </View>
        <View style={s.amountColumn}>
          <Text style={s.moneyLabel}>Due</Text>
          <Text style={[s.amountValue, { color: colors.ink }]}>
            {money(invoice.due)}
          </Text>
        </View>
      </View>
      {invoice.due > 0 && isTuition(invoice) && selected && (
        <View style={{ gap: 5 }}>
          <Text style={s.fieldLabel}>Amount to pay (Tuition)</Text>
          <Input
            value={selection?.amount || ""}
            onChangeText={onAmountChange}
            keyboardType="number-pad"
            accessibilityLabel={`Amount for ${invoice.feeType}`}
          />
          <Text style={amountError ? s.errorSmall : s.helper}>
            {amountError ||
              `Partial payment: minimum ₹1,000 in ₹100 steps; full due ${money(invoice.due)} is always accepted.`}
          </Text>
        </View>
      )}
      {!isTuition(invoice) && invoice.due > 0 && (
        <Text style={s.helper}>This fee must be paid in full.</Text>
      )}
      <View style={s.invoiceBottom}>
        <Text style={s.helper}>Due date: {dateLabel(invoice.dueDate)}</Text>
        <View style={s.inlineActions}>
          <Pressable onPress={onView} style={s.smallAction}>
            <Ionicons
              name="eye-outline"
              size={16}
              color={colors.info}
            />
            <Text style={s.actionText}>View</Text>
          </Pressable>
          {selected && invoice.due > 0 && (
            <Pressable
              onPress={onPay}
              disabled={creating || Boolean(amountError)}
              style={[
                s.payButton,
                (creating || Boolean(amountError)) && { opacity: 0.55 },
              ]}
            >
              {creating ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons
                    name="card-outline"
                    size={15}
                    color="#fff"
                  />
                  <Text style={s.payButtonText}>Pay now</Text>
                </>
              )}
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

function HistoryCard({
  invoice,
  downloading,
  onView,
  onDownload,
}: {
  invoice: FeeInvoiceRecord;
  downloading: boolean;
  onView: () => void;
  onDownload: () => void;
}) {
  const due = Math.max(
    0,
    Number(invoice.amount || 0) - Number(invoice.paidAmount || 0),
  );
  const status = invoiceStatus(invoice);
  const color =
    status === "Paid"
      ? colors.success
      : status === "Overdue"
        ? colors.alert
        : colors.amberDark;
  return (
    <View style={s.historyCard}>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={s.invoiceTitle}>{invoice.feeType}</Text>
        <Text style={s.helper}>
          {invoice.session || "Current session"}
          {invoice.receiptNo ? ` · Receipt ${invoice.receiptNo}` : ""}
        </Text>
        <Text style={s.historyAmount}>
          Total {money(invoice.amount)} · Paid {money(invoice.paidAmount || 0)}
        </Text>
        <Text style={s.helper}>Due {money(due)} · {dateLabel(invoice.dueDate)}</Text>
        <Text style={[s.statusText, { color }]}>{status}</Text>
      </View>
      <View style={s.historyActions}>
        <Pressable onPress={onView} style={s.smallAction}>
          <Ionicons name="eye-outline" size={16} color={colors.info} />
          <Text style={s.actionText}>View</Text>
        </Pressable>
        <Pressable
          onPress={onDownload}
          disabled={downloading}
          style={s.smallAction}
        >
          {downloading ? (
            <ActivityIndicator size="small" color={colors.info} />
          ) : (
            <>
              <Ionicons
                name="download-outline"
                size={16}
                color={colors.info}
              />
              <Text style={s.actionText}>PDF</Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

function InvoiceModal({
  invoice,
  downloading,
  onClose,
  onDownload,
}: {
  invoice: FeeInvoiceRecord | null;
  downloading: boolean;
  onClose: () => void;
  onDownload: () => void;
}) {
  if (!invoice) return null;
  const paid = Number(invoice.paidAmount || 0);
  const due = Math.max(0, Number(invoice.amount || 0) - paid);
  return (
    <Modal
      visible={Boolean(invoice)}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={s.modalBackdrop}>
        <View style={s.previewCard}>
          <View style={s.modalHeader}>
            <View>
              <Text style={s.modalTitle}>Fee Invoice</Text>
              <Text style={s.helper}>
                {invoice.feeType} · {invoice.session || "Current session"}
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={10}
              accessibilityLabel="Close invoice preview"
            >
              <Ionicons name="close" size={23} color={colors.muted} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={s.previewBody}>
            <Detail label="Student ID" value={String(invoice.studentId || "—")} />
            <Detail label="Class" value={`${invoice.class || "—"}${invoice.section ? `-${invoice.section}` : ""}`} />
            <Detail label="Fee type" value={invoice.feeType} />
            <Detail label="Session" value={invoice.session || "—"} />
            <Detail label="Due date" value={dateLabel(invoice.dueDate)} />
            <Detail label="Total amount" value={money(invoice.amount)} />
            <Detail label="Paid amount" value={money(paid)} />
            <Detail label="Outstanding" value={money(due)} />
            <Detail label="Status" value={invoiceStatus(invoice)} />
            {invoice.receiptNo ? (
              <Detail label="Receipt" value={invoice.receiptNo} />
            ) : null}
            <Text style={s.helper}>
              Download the official invoice PDF to view the full document.
            </Text>
          </ScrollView>
          <View style={s.modalActions}>
            <View style={{ flex: 1 }}>
              <Button title="Close" variant="ghost" onPress={onClose} />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                title="Download invoice"
                loading={downloading}
                onPress={onDownload}
              />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.detailRow}>
      <Text style={s.helper}>{label}</Text>
      <Text style={s.detailValue}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 16, gap: 14, paddingBottom: 30 },
  intro: { flexDirection: "row", gap: 12, alignItems: "center" },
  introIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: "#FBF1DF",
    alignItems: "center",
    justifyContent: "center",
  },
  eyebrow: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  title: { color: colors.ink, fontSize: 21, fontWeight: "800", marginTop: 2 },
  subtitle: { color: colors.muted, fontSize: 12, marginTop: 3, lineHeight: 17 },
  stats: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  stat: { minWidth: "47%", flexGrow: 1, alignItems: "flex-start", gap: 4 },
  statValue: { color: colors.ink, fontSize: 18, fontWeight: "800" },
  statLabel: { color: colors.muted, fontSize: 10.5, fontWeight: "600" },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  sectionTitle: { color: colors.ink, fontSize: 15, fontWeight: "800" },
  helper: { color: colors.muted, fontSize: 11, lineHeight: 16 },
  error: {
    color: colors.alert,
    backgroundColor: "#FFF1EF",
    borderRadius: radius.sm,
    padding: 10,
    fontSize: 12,
    lineHeight: 18,
  },
  retry: { color: colors.info, fontSize: 12, fontWeight: "800" },
  errorSmall: { color: colors.alert, fontSize: 10.5, lineHeight: 15 },
  receiptCard: { flexDirection: "row", alignItems: "center", gap: 9 },
  smallAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: "#fff",
  },
  actionText: { color: colors.info, fontSize: 10, fontWeight: "800" },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  orderLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 8,
  },
  orderRef: { color: colors.ink, fontSize: 11, fontWeight: "800" },
  cancelText: { color: colors.alert, fontSize: 11, fontWeight: "800" },
  inlineActions: { flexDirection: "row", alignItems: "center", gap: 7 },
  studentHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  studentAvatar: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#EAF3FB",
    alignItems: "center",
    justifyContent: "center",
  },
  studentPhoto: { width: 40, height: 40, borderRadius: 12 },
  studentName: { color: colors.ink, fontSize: 13, fontWeight: "800" },
  empty: { alignItems: "center", gap: 7, paddingVertical: 22 },
  emptyTitle: { color: colors.ink, fontSize: 14, fontWeight: "800" },
  selectAll: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  selectAllText: { color: colors.ink, fontSize: 11, fontWeight: "700" },
  invoiceCard: {
    padding: 11,
    gap: 9,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: "#FCFBF8",
  },
  invoiceTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  checkboxHit: {
    width: 25,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  invoiceTitle: { color: colors.ink, fontSize: 12.5, fontWeight: "800" },
  statusBadge: { borderRadius: 14, paddingHorizontal: 7, paddingVertical: 4 },
  statusText: { fontSize: 10, fontWeight: "800" },
  amountRow: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  amountColumn: { flex: 1, gap: 3 },
  moneyLabel: { color: colors.muted, fontSize: 9.5 },
  amountValue: { color: colors.text, fontSize: 11, fontWeight: "700" },
  fieldLabel: { color: colors.ink, fontSize: 11, fontWeight: "700" },
  invoiceBottom: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 7,
  },
  payButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: colors.ink,
  },
  payButtonText: { color: "#fff", fontSize: 10.5, fontWeight: "800" },
  totalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingTop: 9,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  totalLabel: { color: colors.ink, fontSize: 12, fontWeight: "800" },
  totalAmount: { color: colors.ink, fontSize: 15, fontWeight: "900" },
  orderTotal: { color: colors.info, fontSize: 13, fontWeight: "900" },
  paidBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderRadius: radius.sm,
    backgroundColor: "#E9F5EC",
    padding: 10,
  },
  paidText: { color: colors.success, fontSize: 12, fontWeight: "800" },
  historyCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: "#FCFBF8",
  },
  historyAmount: { color: colors.ink, fontSize: 10.5, fontWeight: "700" },
  historyActions: { gap: 5 },
  modalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "#0007",
  },
  modalCard: {
    maxHeight: "90%",
    backgroundColor: colors.paper,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 17,
  },
  previewCard: {
    maxHeight: "82%",
    backgroundColor: colors.paper,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 17,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: { color: colors.ink, fontSize: 17, fontWeight: "800" },
  pickerFilters: { gap: 9, paddingVertical: 12 },
  chips: { flexDirection: "row", gap: 7 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#fff",
  },
  activeChip: { borderColor: colors.ink, backgroundColor: colors.ink },
  chipText: { color: colors.muted, fontSize: 10.5, fontWeight: "700" },
  activeChipText: { color: "#fff" },
  studentList: { gap: 7, paddingBottom: 16 },
  studentOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    padding: 9,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#fff",
  },
  studentOptionActive: {
    borderColor: colors.info,
    backgroundColor: "#EFF6FC",
  },
  modalActions: {
    flexDirection: "row",
    gap: 9,
    paddingTop: 11,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  previewBody: { gap: 11, paddingVertical: 15 },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  detailValue: {
    flex: 1,
    color: colors.ink,
    fontSize: 11.5,
    fontWeight: "700",
    textAlign: "right",
  },
});
