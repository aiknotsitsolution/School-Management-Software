import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
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
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Ionicons } from "@expo/vector-icons";
import { Button, Card, Input } from "../components/UI";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { colors, radius } from "../theme";
import type { PayrollRecord, StaffRecord } from "../types";

const MONTHS = [
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
  "January",
  "February",
  "March",
];
const CALENDAR_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
type EntryForm = {
  staffId: string;
  basic: string;
  allowances: string;
  deductions: string;
  deductionReason: string;
  adjustForAttendance: boolean;
};
type PayrollRow = PayrollRecord & {
  employeeId: string;
  name: string;
  department: string;
  designation: string;
  salary: number;
};

const currentPeriod = () => {
  const now = new Date();
  return { month: CALENDAR_MONTHS[now.getMonth()], year: now.getFullYear() };
};
const emptyForm = (): EntryForm => ({
  staffId: "",
  basic: "",
  allowances: "",
  deductions: "",
  deductionReason: "",
  adjustForAttendance: false,
});
const currency = (amount: number) =>
  `₹${Math.round(amount || 0).toLocaleString("en-IN")}`;
const numberValue = (value: string) =>
  value.trim() === "" ? 0 : Number(value);
const csvCell = (value: unknown) => {
  let text = String(value ?? "");
  if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
};
const dateLabel = (value?: string) => {
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

export default function PayrollScreen() {
  const { can, school, user } = useAuth();
  const canAdmin = can("payroll:admin");
  const canReadStaff = can("staff:read");
  const [period, setPeriod] = useState(currentPeriod);
  const [records, setRecords] = useState<PayrollRow[]>([]);
  const [staff, setStaff] = useState<StaffRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState("All");
  const [staffQuery, setStaffQuery] = useState("");
  const [modalVisible, setModalVisible] = useState(false);
  const [form, setForm] = useState<EntryForm>(emptyForm);
  const [editing, setEditing] = useState<PayrollRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [attendanceForAll, setAttendanceForAll] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [payslip, setPayslip] = useState<PayrollRow | null>(null);

  const loadPayroll = async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    const queryString = `month=${encodeURIComponent(period.month)}&year=${period.year}&limit=500`;
    try {
      const [payrollResult, staffResult] = await Promise.allSettled([
        api.payroll.list(queryString),
        canAdmin && canReadStaff
          ? api.staff.list("limit=500")
          : Promise.resolve({ data: [] as StaffRecord[] }),
      ]);
      if (payrollResult.status === "rejected") throw payrollResult.reason;
      const staffRows =
        staffResult.status === "fulfilled" ? staffResult.value.data || [] : [];
      setStaff(staffRows);
      const staffById = new Map(
        staffRows.map((person) => [person._id, person]),
      );
      setRecords(
        (payrollResult.value.data || []).map((entry) => {
          const person = staffById.get(String(entry.staffId));
          return {
            ...entry,
            employeeId: person?.employeeId || "—",
            name:
              person?.name ||
              (["teacher", "staff"].includes(user?.role || "")
                ? user?.name
                : undefined) ||
              "Staff member",
            department: person?.department || "—",
            designation: person?.designation || "—",
            salary: person?.salary || 0,
          };
        }),
      );
      if (staffResult.status === "rejected" && canAdmin && canReadStaff) {
        setError(
          "Payroll loaded, but the staff directory could not be loaded. Names may be unavailable.",
        );
      }
    } catch (loadError) {
      setError((loadError as Error).message || "Unable to load payroll.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadPayroll();
  }, [period.month, period.year, canAdmin, canReadStaff, user]);

  const departments = useMemo(
    () => ["All", ...new Set(records.map((item) => item.department))],
    [records],
  );
  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return records.filter((item) => {
      const matchesDepartment =
        department === "All" || item.department === department;
      const matchesQuery =
        !normalizedQuery ||
        item.name.toLowerCase().includes(normalizedQuery) ||
        item.employeeId.toLowerCase().includes(normalizedQuery) ||
        item.designation.toLowerCase().includes(normalizedQuery);
      return matchesDepartment && matchesQuery;
    });
  }, [records, query, department]);
  const stats = useMemo(() => {
    const gross = records.reduce(
      (sum, row) => sum + Number(row.basic || 0) + Number(row.allowances || 0),
      0,
    );
    const deductions = records.reduce(
      (sum, row) => sum + Number(row.deductions || 0),
      0,
    );
    const paid = records.filter((row) => row.status === "Paid").length;
    return {
      gross,
      deductions,
      net: records.reduce(
        (sum, row) =>
          sum +
          (row.netPay ??
            Number(row.basic || 0) +
              Number(row.allowances || 0) -
              Number(row.deductions || 0)),
        0,
      ),
      paid,
      unpaid: records.length - paid,
    };
  }, [records]);
  const visibleStaff = useMemo(() => {
    const normalizedQuery = staffQuery.trim().toLowerCase();
    return staff
      .filter((person) => person.status === "Active")
      .filter(
        (person) =>
          !normalizedQuery ||
          (person.name || "").toLowerCase().includes(normalizedQuery) ||
          (person.employeeId || "").toLowerCase().includes(normalizedQuery),
      )
      .slice(0, 30);
  }, [staff, staffQuery]);

  const changeMonth = (amount: number) => {
    const index = CALENDAR_MONTHS.indexOf(period.month);
    const next = new Date(period.year, index + amount, 1);
    setPeriod({
      month: CALENDAR_MONTHS[next.getMonth()],
      year: next.getFullYear(),
    });
    setDepartment("All");
  };
  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setStaffQuery("");
    setModalVisible(true);
  };
  const openEdit = (row: PayrollRow) => {
    setEditing(row);
    setForm({
      staffId: row.staffId,
      basic: String(row.basic || ""),
      allowances: String(row.allowances || 0),
      deductions: String(row.deductions || 0),
      deductionReason: row.deductionReason || "",
      adjustForAttendance: false,
    });
    setModalVisible(true);
  };
  const chooseStaff = (person: StaffRecord) => {
    setForm((current) => ({
      ...current,
      staffId: person._id,
      basic: person.salary ? String(person.salary) : current.basic,
    }));
  };
  const saveEntry = async () => {
    if (!editing && !form.staffId) {
      Alert.alert("Select an employee", "Choose a staff member first.");
      return;
    }
    const basic = numberValue(form.basic);
    const allowances = numberValue(form.allowances);
    const deductions = numberValue(form.deductions);
    if (!Number.isFinite(basic) || basic <= 0) {
      Alert.alert("Invalid basic salary", "Enter a positive basic salary.");
      return;
    }
    if (!Number.isFinite(allowances) || allowances < 0) {
      Alert.alert("Invalid allowances", "Enter zero or a positive amount.");
      return;
    }
    if (!Number.isFinite(deductions) || deductions < 0) {
      Alert.alert("Invalid deductions", "Enter zero or a positive amount.");
      return;
    }
    if (deductions > 0 && !form.deductionReason.trim()) {
      Alert.alert(
        "Deduction reason required",
        "Please provide a reason for the deduction.",
      );
      return;
    }
    setSaving(true);
    try {
      const payload = {
        basic,
        allowances,
        deductions,
        deductionReason: form.deductionReason.trim(),
      };
      if (editing) {
        await api.payroll.update(editing._id, payload);
      } else {
        await api.payroll.create({
          staffId: form.staffId,
          month: period.month,
          year: period.year,
          ...payload,
          adjustForAttendance: form.adjustForAttendance,
        });
      }
      setModalVisible(false);
      setEditing(null);
      await loadPayroll(true);
      Alert.alert(
        editing ? "Payroll updated" : "Payroll created",
        editing
          ? "The payroll entry has been updated."
          : "The payroll entry was created successfully.",
      );
    } catch (saveError) {
      Alert.alert(
        editing ? "Unable to update payroll" : "Unable to create payroll",
        (saveError as Error).message || "Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const releaseSalary = (row: PayrollRow) => {
    Alert.alert(
      "Release salary?",
      `Mark ${row.name}'s ${row.month} ${row.year} salary as paid?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Release salary",
          onPress: () => {
            void (async () => {
              setBusyId(row._id);
              try {
                await api.payroll.markPaid(row._id);
                await loadPayroll(true);
              } catch (paymentError) {
                Alert.alert(
                  "Unable to release salary",
                  (paymentError as Error).message || "Please try again.",
                );
              } finally {
                setBusyId("");
              }
            })();
          },
        },
      ],
    );
  };

  const generateAll = () => {
    const attendanceMessage = attendanceForAll
      ? " Attendance-based deductions will be applied."
      : "";
    Alert.alert(
      "Generate payroll for all staff?",
      `Create entries for active staff for ${period.month} ${period.year}. Existing entries will be skipped.${attendanceMessage}`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Generate",
          onPress: () => {
            void (async () => {
              setGenerating(true);
              try {
                const result = await api.payroll.generateAll(
                  period.month,
                  period.year,
                  { adjustForAttendance: attendanceForAll },
                );
                await loadPayroll(true);
                Alert.alert(
                  "Payroll generated",
                  `${result.data.created} new entries created; ${result.data.skipped} already existed.`,
                );
              } catch (generateError) {
                Alert.alert(
                  "Unable to generate payroll",
                  (generateError as Error).message || "Please try again.",
                );
              } finally {
                setGenerating(false);
              }
            })();
          },
        },
      ],
    );
  };

  const exportCsv = async () => {
    const header = [
      "Employee ID",
      "Name",
      "Department",
      "Basic",
      "Allowances",
      "Deductions",
      "Net",
      "Status",
    ];
    const rows = filtered.map((row) => [
      row.employeeId,
      row.name,
      row.department,
      row.basic,
      row.allowances || 0,
      row.deductions || 0,
      row.netPay ??
        Number(row.basic || 0) +
          Number(row.allowances || 0) -
          Number(row.deductions || 0),
      row.status,
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map(csvCell).join(","))
      .join("\r\n");
    try {
      if (!FileSystem.cacheDirectory || !(await Sharing.isAvailableAsync())) {
        await Share.share({
          message: csv,
          title: `Payroll ${period.month} ${period.year}`,
        });
        return;
      }
      const uri = `${FileSystem.cacheDirectory}payroll-${period.month}-${period.year}.csv`;
      await FileSystem.writeAsStringAsync(uri, `\uFEFF${csv}`, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      await Sharing.shareAsync(uri, {
        mimeType: "text/csv",
        dialogTitle: `Payroll ${period.month} ${period.year}`,
        UTI: "public.comma-separated-values-text",
      });
    } catch (exportError) {
      Alert.alert(
        "Unable to export payroll",
        (exportError as Error).message || "Please try again.",
      );
    }
  };

  const sharePayslip = async (row: PayrollRow) => {
    const gross = Number(row.basic || 0) + Number(row.allowances || 0);
    const net =
      row.netPay ??
      gross - Number(row.deductions || 0);
    const address = [school?.address, school?.city, school?.state]
      .filter(Boolean)
      .join(", ");
    const details = [
      school?.name || "School",
      address,
      "",
      "SALARY SLIP",
      `${row.month} ${row.year}`,
      "",
      `Employee: ${row.name}`,
      `Employee ID: ${row.employeeId}`,
      `Department: ${row.department}`,
      `Designation: ${row.designation}`,
      "",
      `Basic salary: ${currency(row.basic)}`,
      `Allowances: ${currency(row.allowances || 0)}`,
      `Gross earnings: ${currency(gross)}`,
      `Deductions: ${currency(row.deductions || 0)}`,
      ...(row.deductionReason ? [`Deduction reason: ${row.deductionReason}`] : []),
      ...(row.attendancePct != null
        ? [`Attendance: ${row.attendancePct}%`]
        : []),
      `Net payable: ${currency(net)}`,
      `Status: ${row.status}`,
      `Payment date: ${row.status === "Paid" ? dateLabel(row.paidOn) : "—"}`,
      "",
      "This is a computer-generated payslip.",
      "Authorized Signatory",
    ].filter((line) => line !== undefined);
    try {
      await Share.share({
        title: `Salary slip - ${row.name}`,
        message: details.join("\n"),
      });
    } catch (shareError) {
      Alert.alert(
        "Unable to share payslip",
        (shareError as Error).message || "Please try again.",
      );
    }
  };

  return (
    <View style={s.screen}>
      <ScrollView
        contentContainerStyle={s.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void loadPayroll(true)}
            tintColor={colors.ink}
          />
        }
      >
        <View style={s.intro}>
          <View style={s.introIcon}>
            <Ionicons name="wallet" size={23} color={colors.amberDark} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.eyebrow}>HUMAN RESOURCES</Text>
            <Text style={s.title}>Payroll Management</Text>
            <Text style={s.subtitle}>
              Staff salaries, payslips and monthly payments.
            </Text>
          </View>
        </View>

        <Card style={{ gap: 12 }}>
          <View style={s.periodHeader}>
            <Pressable
              onPress={() => changeMonth(-1)}
              style={s.periodArrow}
              accessibilityRole="button"
              accessibilityLabel="Previous month"
            >
              <Ionicons name="chevron-back" size={20} color={colors.ink} />
            </Pressable>
            <View style={s.periodLabel}>
              <Text style={s.periodTitle}>
                {period.month} {period.year}
              </Text>
              <Text style={s.helper}>Payroll period</Text>
            </View>
            <Pressable
              onPress={() => changeMonth(1)}
              style={s.periodArrow}
              accessibilityRole="button"
              accessibilityLabel="Next month"
            >
              <Ionicons name="chevron-forward" size={20} color={colors.ink} />
            </Pressable>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.monthChips}
          >
            {MONTHS.map((month) => (
              <Chip
                key={month}
                label={month.slice(0, 3)}
                active={period.month === month}
                onPress={() => setPeriod((current) => ({ ...current, month }))}
              />
            ))}
          </ScrollView>
          <View style={s.periodActions}>
            <Pressable
              onPress={() =>
                setPeriod((current) => ({
                  ...current,
                  year: current.year - 1,
                }))
              }
              style={s.yearControl}
            >
              <Ionicons name="remove" size={17} color={colors.ink} />
            </Pressable>
            <Text style={s.yearText}>{period.year}</Text>
            <Pressable
              onPress={() =>
                setPeriod((current) => ({
                  ...current,
                  year: current.year + 1,
                }))
              }
              style={s.yearControl}
            >
              <Ionicons name="add" size={17} color={colors.ink} />
            </Pressable>
            <View style={{ flex: 1 }} />
            <Pressable
              onPress={() => void exportCsv()}
              style={s.iconAction}
              accessibilityRole="button"
              accessibilityLabel="Export payroll CSV"
            >
              <Ionicons name="download-outline" size={18} color={colors.ink} />
              <Text style={s.iconActionText}>Export CSV</Text>
            </Pressable>
          </View>
        </Card>

        {canAdmin && (
          <View style={s.adminActions}>
            <Button
              title="Create Entry"
              onPress={openCreate}
            />
            <Button
              title={generating ? "Generating..." : "Generate All"}
              loading={generating}
              variant="ghost"
              onPress={generateAll}
            />
          </View>
        )}
        {canAdmin && (
          <Pressable
            onPress={() => setAttendanceForAll((value) => !value)}
            style={s.attendanceToggle}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: attendanceForAll }}
          >
            <Ionicons
              name={attendanceForAll ? "checkbox" : "square-outline"}
              size={20}
              color={attendanceForAll ? colors.info : colors.muted}
            />
            <Text style={s.attendanceText}>
              Adjust generated payroll for attendance
            </Text>
          </Pressable>
        )}

        <View style={s.stats}>
          <Stat label="Gross Payroll" value={currency(stats.gross)} icon="wallet" />
          <Stat label="Net Payable" value={currency(stats.net)} icon="cash" />
          <Stat
            label="Paid"
            value={`${stats.paid} / ${records.length}`}
            icon="checkmark-circle"
            color={colors.success}
          />
          <Stat
            label="Unpaid"
            value={stats.unpaid}
            icon="time"
            color={colors.alert}
          />
        </View>
        <Card style={s.deductionSummary}>
          <Text style={s.helper}>Deductions this period</Text>
          <Text style={[s.statValue, { color: colors.alert }]}>
            {currency(stats.deductions)}
          </Text>
        </Card>

        <Card style={{ gap: 12 }}>
          <View>
            <Text style={s.sectionTitle}>
              Payroll Sheet — {period.month} {period.year}
            </Text>
            <Text style={s.helper}>
              Net payable: {currency(stats.net)}
            </Text>
          </View>
          <Input
            value={query}
            onChangeText={setQuery}
            placeholder="Search employee..."
            autoCapitalize="none"
            accessibilityLabel="Search payroll employees"
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.monthChips}
          >
            {departments.map((item) => (
              <Chip
                key={item}
                label={item === "All" ? "All departments" : item}
                active={department === item}
                onPress={() => setDepartment(item)}
              />
            ))}
          </ScrollView>
          {error ? (
            <Pressable onPress={() => void loadPayroll()}>
              <Text style={s.error}>{error} Tap to retry.</Text>
            </Pressable>
          ) : null}
          {loading ? (
            <ActivityIndicator
              style={{ marginVertical: 28 }}
              color={colors.ink}
            />
          ) : filtered.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="wallet-outline" size={36} color={colors.muted} />
              <Text style={s.emptyTitle}>No payroll entries found</Text>
              <Text style={s.helper}>
                Change the period or create a payroll entry.
              </Text>
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              {filtered.map((row) => (
                <PayrollCard
                  key={row._id}
                  row={row}
                  canAdmin={canAdmin}
                  busy={busyId === row._id}
                  onPayslip={() => setPayslip(row)}
                  onEdit={() => openEdit(row)}
                  onRelease={() => releaseSalary(row)}
                />
              ))}
            </View>
          )}
        </Card>
      </ScrollView>

      <EntryModal
        visible={modalVisible}
        editing={editing}
        form={form}
        staffQuery={staffQuery}
        staffOptions={visibleStaff}
        selectedStaff={staff.find((person) => person._id === form.staffId)}
        period={period}
        saving={saving}
        onClose={() => {
          if (!saving) {
            setModalVisible(false);
            setEditing(null);
          }
        }}
        onFormChange={setForm}
        onStaffQuery={setStaffQuery}
        onSelectStaff={chooseStaff}
        onSave={() => void saveEntry()}
      />

      <PayslipModal
        row={payslip}
        school={school}
        onClose={() => setPayslip(null)}
        onShare={() => payslip && void sharePayslip(payslip)}
      />
    </View>
  );
}

function Chip({
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
      style={[s.chip, active && s.activeChip]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={[s.chipText, active && s.activeChipText]}>{label}</Text>
    </Pressable>
  );
}

function Stat({
  label,
  value,
  icon,
  color = colors.info,
}: {
  label: string;
  value: string | number;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  color?: string;
}) {
  return (
    <Card style={s.stat}>
      <Ionicons name={icon} size={18} color={color} />
      <Text style={s.statValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={s.statLabel}>{label}</Text>
    </Card>
  );
}

function PayrollCard({
  row,
  canAdmin,
  busy,
  onPayslip,
  onEdit,
  onRelease,
}: {
  row: PayrollRow;
  canAdmin: boolean;
  busy: boolean;
  onPayslip: () => void;
  onEdit: () => void;
  onRelease: () => void;
}) {
  const gross = Number(row.basic || 0) + Number(row.allowances || 0);
  const net = row.netPay ?? gross - Number(row.deductions || 0);
  const isPaid = row.status === "Paid";
  return (
    <View style={s.payrollCard}>
      <View style={s.employeeHeader}>
        <View style={s.employeeAvatar}>
          <Ionicons name="person" size={19} color={colors.info} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.employeeName}>{row.name}</Text>
          <Text style={s.employeeMeta}>
            {row.employeeId} · {row.designation}
          </Text>
          <Text style={s.employeeMeta}>{row.department}</Text>
        </View>
        <View
          style={[
            s.statusBadge,
            { backgroundColor: isPaid ? "#E9F5EC" : "#FBF1DF" },
          ]}
        >
          <Text
            style={[
              s.statusText,
              { color: isPaid ? colors.success : colors.amberDark },
            ]}
          >
            {row.status}
          </Text>
        </View>
      </View>
      <View style={s.moneyGrid}>
        <Money label="Basic" amount={Number(row.basic || 0)} />
        <Money label="Allowances" amount={Number(row.allowances || 0)} />
        <Money
          label="Deductions"
          amount={Number(row.deductions || 0)}
          negative
        />
        <Money label="Net pay" amount={net} strong />
      </View>
      {row.attendancePct != null && (
        <Text style={s.employeeMeta}>
          Attendance: {row.attendancePct}%
          {Number(row.attendanceDeduction || 0) > 0
            ? ` · ${currency(row.attendanceDeduction || 0)} deduction`
            : ""}
        </Text>
      )}
      <View style={s.rowActions}>
        <Action
          label="Payslip"
          icon="document-text-outline"
          onPress={onPayslip}
        />
        {canAdmin && !isPaid && (
          <>
            {busy ? (
              <ActivityIndicator color={colors.ink} />
            ) : (
              <>
                <Action
                  label="Edit"
                  icon="create-outline"
                  onPress={onEdit}
                />
                <Action
                  label="Release"
                  icon="checkmark-circle-outline"
                  color={colors.success}
                  onPress={onRelease}
                />
              </>
            )}
          </>
        )}
      </View>
    </View>
  );
}

function Money({
  label,
  amount,
  negative = false,
  strong = false,
}: {
  label: string;
  amount: number;
  negative?: boolean;
  strong?: boolean;
}) {
  return (
    <View style={s.moneyItem}>
      <Text style={s.moneyLabel}>{label}</Text>
      <Text
        style={[
          s.moneyAmount,
          strong && s.moneyStrong,
          negative && { color: colors.alert },
        ]}
      >
        {negative ? "−" : ""}
        {currency(amount)}
      </Text>
    </View>
  );
}

function Action({
  label,
  icon,
  color = colors.info,
  onPress,
}: {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  color?: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={s.actionButton}>
      <Ionicons name={icon} size={16} color={color} />
      <Text style={[s.actionText, { color }]}>{label}</Text>
    </Pressable>
  );
}

function EntryModal({
  visible,
  editing,
  form,
  staffQuery,
  staffOptions,
  selectedStaff,
  period,
  saving,
  onClose,
  onFormChange,
  onStaffQuery,
  onSelectStaff,
  onSave,
}: {
  visible: boolean;
  editing: PayrollRow | null;
  form: EntryForm;
  staffQuery: string;
  staffOptions: StaffRecord[];
  selectedStaff?: StaffRecord;
  period: { month: string; year: number };
  saving: boolean;
  onClose: () => void;
  onFormChange: React.Dispatch<React.SetStateAction<EntryForm>>;
  onStaffQuery: (value: string) => void;
  onSelectStaff: (person: StaffRecord) => void;
  onSave: () => void;
}) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={s.modalBackdrop}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={s.modalCard}>
          <View style={s.modalHeader}>
            <View>
              <Text style={s.modalTitle}>
                {editing ? "Edit Payroll Entry" : "Create Payroll Entry"}
              </Text>
              <Text style={s.helper}>
                {period.month} {period.year}
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Close payroll form"
            >
              <Ionicons name="close" size={23} color={colors.muted} />
            </Pressable>
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={s.form}
          >
            {!editing && (
              <>
                <Text style={s.fieldLabel}>Employee *</Text>
                <Input
                  value={
                    selectedStaff
                      ? `${selectedStaff.name || "Staff"}${selectedStaff.employeeId ? ` (${selectedStaff.employeeId})` : ""}`
                      : staffQuery
                  }
                  onChangeText={(value) => {
                    onStaffQuery(value);
                    if (selectedStaff) {
                      onFormChange((current) => ({
                        ...current,
                        staffId: "",
                      }));
                    }
                  }}
                  placeholder="Search employee name or ID..."
                />
                {!form.staffId && (
                  <View style={s.staffOptions}>
                    {staffOptions.map((person) => (
                      <Pressable
                        key={person._id}
                        onPress={() => onSelectStaff(person)}
                        style={s.staffOption}
                      >
                        <Text style={s.staffOptionName}>
                          {person.name || "Staff member"}
                        </Text>
                        <Text style={s.employeeMeta}>
                          {person.employeeId || "—"} ·{" "}
                          {person.designation || "Staff"}
                        </Text>
                      </Pressable>
                    ))}
                    {staffOptions.length === 0 && (
                      <Text style={s.helper}>
                        No active staff match this search.
                      </Text>
                    )}
                  </View>
                )}
                <Text style={s.helper}>
                  Creates payroll for the selected staff member for this
                  period.
                </Text>
              </>
            )}
            <Text style={s.fieldLabel}>Basic Salary *</Text>
            <Input
              value={form.basic}
              onChangeText={(basic) =>
                onFormChange((current) => ({ ...current, basic }))
              }
              placeholder="Basic salary amount"
              keyboardType="numbers-and-punctuation"
            />
            <Text style={s.fieldLabel}>Allowances</Text>
            <Input
              value={form.allowances}
              onChangeText={(allowances) =>
                onFormChange((current) => ({ ...current, allowances }))
              }
              placeholder="0"
              keyboardType="numbers-and-punctuation"
            />
            <Text style={s.fieldLabel}>Deductions</Text>
            <Input
              value={form.deductions}
              onChangeText={(deductions) =>
                onFormChange((current) => ({ ...current, deductions }))
              }
              placeholder="0"
              keyboardType="numbers-and-punctuation"
            />
            {numberValue(form.deductions) > 0 && (
              <>
                <Text style={s.fieldLabel}>Deduction Reason *</Text>
                <Input
                  value={form.deductionReason}
                  onChangeText={(deductionReason) =>
                    onFormChange((current) => ({
                      ...current,
                      deductionReason,
                    }))
                  }
                  placeholder="Reason for deduction"
                  multiline
                />
              </>
            )}
            {!editing && (
              <Pressable
                onPress={() =>
                  onFormChange((current) => ({
                    ...current,
                    adjustForAttendance: !current.adjustForAttendance,
                  }))
                }
                style={s.checkRow}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: form.adjustForAttendance }}
              >
                <Ionicons
                  name={
                    form.adjustForAttendance ? "checkbox" : "square-outline"
                  }
                  size={20}
                  color={
                    form.adjustForAttendance ? colors.info : colors.muted
                  }
                />
                <Text style={s.attendanceText}>
                  Adjust for attendance deductions
                </Text>
              </Pressable>
            )}
          </ScrollView>
          <View style={s.modalActions}>
            <View style={{ flex: 1 }}>
              <Button title="Cancel" variant="ghost" onPress={onClose} />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                title={editing ? "Save Changes" : "Create Entry"}
                loading={saving}
                onPress={onSave}
              />
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function PayslipModal({
  row,
  school,
  onClose,
  onShare,
}: {
  row: PayrollRow | null;
  school: ReturnType<typeof useAuth>["school"];
  onClose: () => void;
  onShare: () => void;
}) {
  if (!row) return null;
  const gross = Number(row.basic || 0) + Number(row.allowances || 0);
  const net = row.netPay ?? gross - Number(row.deductions || 0);
  return (
    <Modal
      visible={Boolean(row)}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={s.modalBackdrop}>
        <View style={s.modalCard}>
          <ScrollView contentContainerStyle={{ gap: 14, paddingBottom: 8 }}>
            <View style={s.schoolHeader}>
              <Ionicons name="school" size={26} color={colors.amber} />
              <View style={{ flex: 1 }}>
                <Text style={s.schoolName}>{school?.name || "School Name"}</Text>
                <Text style={s.schoolAddress}>
                  {[school?.address, school?.city, school?.state]
                    .filter(Boolean)
                    .join(", ")}
                </Text>
              </View>
            </View>
            <View style={s.slipTitleRow}>
              <View>
                <Text style={s.sectionTitle}>Salary Slip</Text>
                <Text style={s.helper}>
                  {row.month} {row.year}
                </Text>
              </View>
              <Text
                style={[
                  s.statusText,
                  { color: row.status === "Paid" ? colors.success : colors.amberDark },
                ]}
              >
                {row.status}
              </Text>
            </View>
            <View style={s.employeeDetails}>
              <Detail label="Employee Name" value={row.name} />
              <Detail label="Employee ID" value={row.employeeId} />
              <Detail label="Department" value={row.department} />
              <Detail label="Designation" value={row.designation} />
              <Detail
                label="Payment Date"
                value={row.status === "Paid" ? dateLabel(row.paidOn) : "—"}
              />
              {school?.board ? <Detail label="Board" value={school.board} /> : null}
            </View>
            <Text style={s.fieldLabel}>Earnings</Text>
            <Money label="Basic Salary" amount={Number(row.basic || 0)} />
            <Money
              label="Allowances"
              amount={Number(row.allowances || 0)}
            />
            <Money label="Gross Earnings" amount={gross} strong />
            <Text style={s.fieldLabel}>Deductions</Text>
            <Money
              label="Deductions"
              amount={Number(row.deductions || 0)}
              negative
            />
            {row.deductionReason ? (
              <Text style={s.helper}>Reason: {row.deductionReason}</Text>
            ) : null}
            {row.attendancePct != null ? (
              <Text style={s.helper}>
                Attendance this period: {row.attendancePct}%
                {Number(row.attendanceDeduction || 0) > 0
                  ? ` · attendance deduction ${currency(row.attendanceDeduction || 0)}`
                  : ""}
              </Text>
            ) : null}
            <View style={s.netPayPanel}>
              <View>
                <Text style={s.netPayLabel}>Net Payable</Text>
                <Text style={s.netPaySub}>After all deductions</Text>
              </View>
              <Text style={s.netPayValue}>{currency(net)}</Text>
            </View>
            <Text style={s.helper}>
              This is a computer-generated payslip.
            </Text>
          </ScrollView>
          <View style={s.modalActions}>
            <View style={{ flex: 1 }}>
              <Button title="Close" variant="ghost" onPress={onClose} />
            </View>
            <View style={{ flex: 1 }}>
              <Button title="Share Payslip" onPress={onShare} />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.detailItem}>
      <Text style={s.moneyLabel}>{label}</Text>
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
  subtitle: { color: colors.muted, fontSize: 12, marginTop: 3 },
  periodHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  periodArrow: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  periodLabel: { alignItems: "center" },
  periodTitle: { color: colors.ink, fontSize: 17, fontWeight: "800" },
  helper: { color: colors.muted, fontSize: 11, lineHeight: 16 },
  monthChips: { flexDirection: "row", gap: 7 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    backgroundColor: "#fff",
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  activeChip: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { color: colors.muted, fontSize: 11, fontWeight: "700" },
  activeChipText: { color: "#fff" },
  periodActions: { flexDirection: "row", alignItems: "center", gap: 9 },
  yearControl: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: colors.paper,
    alignItems: "center",
    justifyContent: "center",
  },
  yearText: { color: colors.ink, fontSize: 12, fontWeight: "800" },
  iconAction: { flexDirection: "row", alignItems: "center", gap: 5 },
  iconActionText: { color: colors.ink, fontSize: 11, fontWeight: "700" },
  adminActions: { gap: 8 },
  attendanceToggle: { flexDirection: "row", alignItems: "center", gap: 8 },
  attendanceText: { flex: 1, color: colors.muted, fontSize: 12 },
  stats: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  stat: { minWidth: "47%", flexGrow: 1, alignItems: "flex-start", gap: 4 },
  statValue: { color: colors.ink, fontSize: 19, fontWeight: "800" },
  statLabel: { color: colors.muted, fontSize: 11, fontWeight: "600" },
  deductionSummary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: { color: colors.ink, fontSize: 16, fontWeight: "800" },
  error: {
    color: colors.alert,
    backgroundColor: "#FFF1EF",
    borderRadius: radius.sm,
    padding: 10,
    fontSize: 12,
    lineHeight: 18,
  },
  empty: { alignItems: "center", gap: 7, paddingVertical: 22 },
  emptyTitle: { color: colors.ink, fontSize: 14, fontWeight: "700" },
  payrollCard: {
    padding: 12,
    gap: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#FCFBF8",
  },
  employeeHeader: { flexDirection: "row", alignItems: "center", gap: 9 },
  employeeAvatar: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#EAF3FB",
    alignItems: "center",
    justifyContent: "center",
  },
  employeeName: { color: colors.ink, fontSize: 13, fontWeight: "800" },
  employeeMeta: { color: colors.muted, fontSize: 10.5, marginTop: 2 },
  statusBadge: { borderRadius: 14, paddingHorizontal: 8, paddingVertical: 5 },
  statusText: { fontSize: 10, fontWeight: "800" },
  moneyGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingVertical: 9,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  moneyItem: { flex: 1, minWidth: "43%", gap: 3 },
  moneyLabel: { color: colors.muted, fontSize: 10.5 },
  moneyAmount: { color: colors.text, fontSize: 12, fontWeight: "600" },
  moneyStrong: { color: colors.ink, fontWeight: "800" },
  rowActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    flexWrap: "wrap",
  },
  actionButton: { flexDirection: "row", alignItems: "center", gap: 4 },
  actionText: { fontSize: 11, fontWeight: "800" },
  modalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "#0007",
  },
  modalCard: {
    maxHeight: "94%",
    backgroundColor: colors.paper,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 18,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: { color: colors.ink, fontSize: 18, fontWeight: "800" },
  form: { gap: 10, paddingVertical: 15 },
  fieldLabel: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 3,
  },
  staffOptions: {
    maxHeight: 180,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: "#fff",
    overflow: "hidden",
  },
  staffOption: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  staffOptionName: { color: colors.ink, fontSize: 12, fontWeight: "700" },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  schoolHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.ink,
    padding: 14,
    borderRadius: radius.md,
  },
  schoolName: { color: "#fff", fontSize: 15, fontWeight: "800" },
  schoolAddress: { color: "#D0D5DD", fontSize: 10, marginTop: 3 },
  slipTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  employeeDetails: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#fff",
  },
  detailItem: { minWidth: "45%", flexGrow: 1, gap: 3 },
  detailValue: { color: colors.ink, fontSize: 12, fontWeight: "700" },
  netPayPanel: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    padding: 15,
    backgroundColor: colors.ink,
    borderRadius: radius.md,
  },
  netPayLabel: { color: "#fff", fontSize: 13, fontWeight: "800" },
  netPaySub: { color: "#D0D5DD", fontSize: 10, marginTop: 3 },
  netPayValue: { color: colors.amber, fontSize: 21, fontWeight: "900" },
});
