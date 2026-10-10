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
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Button, Card, Input } from "../components/UI";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { colors, radius } from "../theme";
import type { LeaveBalance, LeaveRequest, StaffRecord } from "../types";

const LEAVE_TYPES = [
  { label: "Casual Leave", value: "Casual" },
  { label: "Sick Leave", value: "Sick" },
  { label: "Privilege Leave", value: "Earned" },
  { label: "Medical Leave", value: "Other" },
  { label: "Maternity Leave", value: "Maternity" },
  { label: "Emergency Leave", value: "Other" },
];
const STUDENT_LEAVE_TYPES = [
  { label: "Sick Leave", value: "Sick" },
  { label: "Casual Leave", value: "Casual" },
  { label: "Other Leave", value: "Other" },
];
const LEAVE_LABELS: Record<string, string> = {
  Casual: "Casual Leave",
  Sick: "Sick Leave",
  Earned: "Privilege Leave",
  Maternity: "Maternity Leave",
  Other: "Medical / Other",
};
const STATUS_FILTERS = ["All", "Approved", "Pending", "Rejected"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];
type LeaveTab = "requests" | "balance";
type LeaveForm = {
  leaveType: string;
  fromDate: string;
  toDate: string;
  reason: string;
};

const dateInputValue = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
const emptyForm = (): LeaveForm => {
  const fromDate = dateInputValue(new Date());
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return {
    leaveType: "Casual",
    fromDate,
    toDate: dateInputValue(tomorrow),
    reason: "",
  };
};
const isISODate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
};
const formatDate = (value?: string) => {
  if (!value) return "—";
  const date = value.slice(0, 10);
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return "—";
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
};
const countDays = (from: string, to: string) => {
  const start = Date.parse(`${from.slice(0, 10)}T00:00:00Z`);
  const end = Date.parse(`${to.slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(start) && Number.isFinite(end)
    ? Math.max(1, Math.round((end - start) / 86_400_000) + 1)
    : 1;
};
const statusColor = (status: string) => {
  if (status === "Approved") return colors.success;
  if (status === "Rejected") return colors.alert;
  return colors.amberDark;
};

export default function LeaveScreen() {
  const { user, can } = useAuth();
  const canApply = can("leaves:apply");
  const canApprove = can("leaves:approve");
  const canSeeBalance = ["teacher", "staff", "student"].includes(
    user?.role || "",
  );
  const leaveTypes =
    user?.role === "student" ? STUDENT_LEAVE_TYPES : LEAVE_TYPES;
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [staffNames, setStaffNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<LeaveTab>("requests");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  const [balance, setBalance] = useState<Record<string, LeaveBalance>>({});
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceError, setBalanceError] = useState("");
  const [modalVisible, setModalVisible] = useState(false);
  const [form, setForm] = useState<LeaveForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState("");

  const loadRequests = async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const [leaveResult, staffResult] = await Promise.allSettled([
        api.leaves.list("limit=500"),
        can("staff:read")
          ? api.staff.list("limit=500")
          : Promise.resolve({ data: [] as StaffRecord[] }),
      ]);
      if (leaveResult.status === "rejected") throw leaveResult.reason;
      setRequests(leaveResult.value.data || []);
      if (staffResult.status === "fulfilled") {
        setStaffNames(
          Object.fromEntries(
            staffResult.value.data
              .filter((staff) => staff.name)
              .map((staff) => [staff._id, staff.name as string]),
          ),
        );
      } else {
        setStaffNames({});
        setError("Leave requests loaded, but staff names could not be loaded.");
      }
    } catch (loadError) {
      setError(
        (loadError as Error).message || "Unable to load leave requests.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadBalance = async () => {
    setBalanceLoading(true);
    setBalanceError("");
    try {
      const result = await api.leaves.balance();
      setBalance(result.data || {});
    } catch (loadError) {
      setBalanceError(
        (loadError as Error).message || "Unable to load leave balance.",
      );
    } finally {
      setBalanceLoading(false);
    }
  };

  useEffect(() => {
    void loadRequests();
  }, []);

  useEffect(() => {
    if (tab === "balance" && canSeeBalance) void loadBalance();
  }, [tab, canSeeBalance]);

  const filteredRequests = useMemo(() => {
    const search = query.trim().toLowerCase();
    return requests.filter((item) => {
      const applicant = item.staffId
        ? staffNames[item.staffId] || user?.name || "Staff member"
        : item.studentId
          ? user?.role === "student"
            ? user.name
            : `Student ${item.studentId}`
          : user?.name || "Staff member";
      const matchesStatus =
        statusFilter === "All" || item.status === statusFilter;
      const matchesSearch =
        !search ||
        applicant.toLowerCase().includes(search) ||
        (LEAVE_LABELS[item.leaveType] || item.leaveType)
          .toLowerCase()
          .includes(search);
      return matchesStatus && matchesSearch;
    });
  }, [requests, query, staffNames, statusFilter, user]);

  const stats = useMemo(
    () => ({
      total: requests.length,
      pending: requests.filter((item) => item.status === "Pending").length,
      approved: requests.filter((item) => item.status === "Approved").length,
      days: requests
        .filter((item) => item.status === "Approved")
        .reduce(
          (sum, item) =>
            sum + countDays(item.fromDate, item.toDate),
          0,
        ),
    }),
    [requests],
  );

  const changeStatus = (item: LeaveRequest, status: "Approved" | "Rejected") => {
    const action = async () => {
      setUpdatingId(item._id);
      try {
        await api.leaves.updateStatus(item._id, status);
        await loadRequests(true);
      } catch (updateError) {
        Alert.alert(
          "Unable to update leave",
          (updateError as Error).message || "Please try again.",
        );
      } finally {
        setUpdatingId("");
      }
    };
    Alert.alert(
      `${status} leave?`,
      `This will ${status.toLowerCase()} this leave request.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: status,
          style: status === "Rejected" ? "destructive" : "default",
          onPress: () => void action(),
        },
      ],
    );
  };

  const submitLeave = async () => {
    if (!isISODate(form.fromDate) || !isISODate(form.toDate)) {
      Alert.alert("Check the dates", "Enter dates in YYYY-MM-DD format.");
      return;
    }
    if (form.toDate < form.fromDate) {
      Alert.alert("Check the dates", "To date must be on or after from date.");
      return;
    }
    if (!form.reason.trim()) {
      Alert.alert("Reason required", "Enter a reason for your leave.");
      return;
    }
    setSaving(true);
    try {
      await api.leaves.create({
        leaveType: form.leaveType,
        fromDate: form.fromDate,
        toDate: form.toDate,
        reason: form.reason.trim(),
      });
      setModalVisible(false);
      setForm(emptyForm());
      await loadRequests(true);
      Alert.alert("Request submitted", "Your leave request was submitted.");
    } catch (submitError) {
      Alert.alert(
        "Unable to submit leave",
        (submitError as Error).message || "Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const applicantName = (item: LeaveRequest) =>
    item.staffId
      ? staffNames[item.staffId] ||
        (user?.role === "teacher" || user?.role === "staff"
          ? user.name
          : "Staff member")
      : item.studentId
        ? user?.role === "student"
          ? user.name
          : `Student ${item.studentId}`
        : user?.name || "Staff member";

  return (
    <View style={s.screen}>
      <ScrollView
        contentContainerStyle={s.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void loadRequests(true)}
            tintColor={colors.ink}
          />
        }
      >
        <View style={s.intro}>
          <View style={s.introIcon}>
            <Ionicons name="airplane" size={23} color={colors.amberDark} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.eyebrow}>HUMAN RESOURCES</Text>
            <Text style={s.title}>Leave Management</Text>
            <Text style={s.subtitle}>
              Apply for leave and track request status.
            </Text>
          </View>
        </View>

        {canApply && (
          <Button
            title="Apply Leave"
            onPress={() => setModalVisible(true)}
          />
        )}

        <View style={s.stats}>
          <Stat label="Total Requests" value={stats.total} icon="documents" />
          <Stat label="Pending" value={stats.pending} icon="time" />
          <Stat
            label="Approved"
            value={stats.approved}
            icon="checkmark-circle"
          />
          {canSeeBalance && (
            <Stat label="Days Used" value={stats.days} icon="calendar" />
          )}
        </View>

        <View style={s.tabs}>
          <TabButton
            label="Requests"
            active={tab === "requests"}
            onPress={() => setTab("requests")}
          />
          {canSeeBalance && (
            <TabButton
              label="Leave Balance"
              active={tab === "balance"}
              onPress={() => setTab("balance")}
            />
          )}
        </View>

        {tab === "requests" ? (
          <Card style={{ gap: 12 }}>
            <Text style={s.sectionTitle}>Leave Requests</Text>
            {canApprove && (
              <Text style={s.helper}>
                Review pending requests and approve or reject them.
              </Text>
            )}
            <Input
              value={query}
              onChangeText={setQuery}
              placeholder="Search applicant or leave type..."
              autoCapitalize="none"
              accessibilityLabel="Search leave requests"
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.filters}
            >
              {STATUS_FILTERS.map((filter) => (
                <Pressable
                  key={filter}
                  onPress={() => setStatusFilter(filter)}
                  style={[
                    s.filter,
                    statusFilter === filter && s.activeFilter,
                  ]}
                >
                  <Text
                    style={[
                      s.filterText,
                      statusFilter === filter && s.activeFilterText,
                    ]}
                  >
                    {filter === "All" ? "All Status" : filter}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            {error ? (
              <Pressable onPress={() => void loadRequests()}>
                <Text style={s.error}>{error} Tap to retry.</Text>
              </Pressable>
            ) : null}
            {loading ? (
              <ActivityIndicator
                style={{ marginVertical: 28 }}
                color={colors.ink}
              />
            ) : filteredRequests.length === 0 ? (
              <View style={s.empty}>
                <Ionicons
                  name="calendar-outline"
                  size={36}
                  color={colors.muted}
                />
                <Text style={s.emptyTitle}>No leave requests found</Text>
                <Text style={s.helper}>
                  Adjust the filters or apply for a new leave.
                </Text>
              </View>
            ) : (
              <View style={{ gap: 10 }}>
                {filteredRequests.map((item) => (
                  <LeaveCard
                    key={item._id}
                    item={item}
                    applicant={applicantName(item)}
                    canApprove={canApprove}
                    updating={updatingId === item._id}
                    onStatus={changeStatus}
                  />
                ))}
              </View>
            )}
          </Card>
        ) : (
          <Card style={{ gap: 12 }}>
            <Text style={s.sectionTitle}>My Leave Balance</Text>
            {balanceError ? (
              <Pressable onPress={() => void loadBalance()}>
                <Text style={s.error}>{balanceError} Tap to retry.</Text>
              </Pressable>
            ) : balanceLoading ? (
              <ActivityIndicator
                style={{ marginVertical: 28 }}
                color={colors.ink}
              />
            ) : Object.keys(balance).length === 0 ? (
              <View style={s.empty}>
                <Text style={s.helper}>
                  No leave data available for this year.
                </Text>
              </View>
            ) : (
              Object.entries(balance).map(([type, item]) => (
                <BalanceCard key={type} type={type} item={item} />
              ))
            )}
          </Card>
        )}
      </ScrollView>

      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={s.modalBackdrop}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={s.modalCard}>
            <View style={s.modalHeader}>
              <View>
                <Text style={s.modalTitle}>Apply Leave</Text>
                <Text style={s.helper}>
                  The school administrator will review your request.
                </Text>
              </View>
              <Pressable
                onPress={() => setModalVisible(false)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Close leave form"
              >
                <Ionicons name="close" size={23} color={colors.muted} />
              </Pressable>
            </View>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={s.form}
            >
              <Text style={s.fieldLabel}>Leave Type</Text>
              <View style={s.typeGrid}>
                {leaveTypes.map((item) => (
                  <Pressable
                    key={`${item.value}-${item.label}`}
                    onPress={() =>
                      setForm((current) => ({
                        ...current,
                        leaveType: item.value,
                      }))
                    }
                    style={[
                      s.typeOption,
                      form.leaveType === item.value && s.typeOptionActive,
                    ]}
                  >
                    <Text
                      style={[
                        s.typeOptionText,
                        form.leaveType === item.value &&
                          s.typeOptionTextActive,
                      ]}
                    >
                      {item.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Text style={s.fieldLabel}>From date (YYYY-MM-DD) *</Text>
              <Input
                value={form.fromDate}
                onChangeText={(fromDate) =>
                  setForm((current) => ({ ...current, fromDate }))
                }
                placeholder="YYYY-MM-DD"
                keyboardType="numbers-and-punctuation"
                maxLength={10}
              />
              <Text style={s.fieldLabel}>To date (YYYY-MM-DD) *</Text>
              <Input
                value={form.toDate}
                onChangeText={(toDate) =>
                  setForm((current) => ({ ...current, toDate }))
                }
                placeholder="YYYY-MM-DD"
                keyboardType="numbers-and-punctuation"
                maxLength={10}
              />
              <Text style={s.fieldLabel}>Reason *</Text>
              <Input
                value={form.reason}
                onChangeText={(reason) =>
                  setForm((current) => ({ ...current, reason }))
                }
                placeholder="Reason for leave..."
                multiline
                textAlignVertical="top"
                style={s.reasonInput}
              />
            </ScrollView>
            <View style={s.modalActions}>
              <View style={{ flex: 1 }}>
                <Button
                  title="Cancel"
                  variant="ghost"
                  onPress={() => setModalVisible(false)}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  title="Submit Application"
                  loading={saving}
                  onPress={() => void submitLeave()}
                />
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function Stat({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: React.ComponentProps<typeof Ionicons>["name"];
}) {
  return (
    <Card style={s.stat}>
      <Ionicons name={icon} size={18} color={colors.info} />
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </Card>
  );
}

function TabButton({
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
      style={[s.tabButton, active && s.activeTabButton]}
    >
      <Text style={[s.tabText, active && s.activeTabText]}>{label}</Text>
    </Pressable>
  );
}

function LeaveCard({
  item,
  applicant,
  canApprove,
  updating,
  onStatus,
}: {
  item: LeaveRequest;
  applicant: string;
  canApprove: boolean;
  updating: boolean;
  onStatus: (item: LeaveRequest, status: "Approved" | "Rejected") => void;
}) {
  const isStudent = Boolean(item.studentId);
  const color = statusColor(item.status);
  return (
    <View style={s.requestCard}>
      <View style={s.requestIcon}>
        <Ionicons name="calendar" size={20} color={colors.info} />
      </View>
      <View style={{ flex: 1, gap: 5 }}>
        <View style={s.requestHeading}>
          <Text style={s.applicant} numberOfLines={1}>
            {applicant}
          </Text>
          <View
            style={[
              s.badge,
              { backgroundColor: isStudent ? "#EAF3FB" : "#FBF1DF" },
            ]}
          >
            <Text
              style={[
                s.badgeText,
                { color: isStudent ? colors.info : colors.amberDark },
              ]}
            >
              {isStudent ? "Student" : "Staff"}
            </Text>
          </View>
          <View style={[s.badge, { backgroundColor: `${color}18` }]}>
            <Text style={[s.badgeText, { color }]}>{item.status}</Text>
          </View>
        </View>
        <Text style={s.requestDates}>
          {LEAVE_LABELS[item.leaveType] || item.leaveType} ·{" "}
          {countDays(item.fromDate, item.toDate)} day(s)
        </Text>
        <Text style={s.requestDates}>
          {formatDate(item.fromDate)} — {formatDate(item.toDate)}
        </Text>
        {item.reason ? <Text style={s.reason}>{item.reason}</Text> : null}
        {item.remarks ? (
          <Text style={s.remarks}>Admin: {item.remarks}</Text>
        ) : null}
        {canApprove && item.status === "Pending" && (
          <View style={s.reviewActions}>
            {updating ? (
              <ActivityIndicator color={colors.ink} />
            ) : (
              <>
                <Pressable
                  onPress={() => onStatus(item, "Approved")}
                  style={s.approveAction}
                >
                  <Ionicons
                    name="checkmark-circle"
                    size={17}
                    color={colors.success}
                  />
                  <Text style={[s.actionText, { color: colors.success }]}>
                    Approve
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => onStatus(item, "Rejected")}
                  style={s.rejectAction}
                >
                  <Ionicons
                    name="close-circle"
                    size={17}
                    color={colors.alert}
                  />
                  <Text style={[s.actionText, { color: colors.alert }]}>
                    Reject
                  </Text>
                </Pressable>
              </>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

function BalanceCard({ type, item }: { type: string; item: LeaveBalance }) {
  const percentage =
    item.entitlement > 0
      ? Math.min(100, (item.remaining / item.entitlement) * 100)
      : 0;
  const progressColor = percentage <= 20 ? colors.alert : colors.success;
  return (
    <View style={s.balanceCard}>
      <View style={s.balanceHeading}>
        <Text style={s.balanceName}>{LEAVE_LABELS[type] || type}</Text>
        <Text style={s.balanceRemaining}>{item.remaining} days left</Text>
      </View>
      <Text style={s.balanceDetail}>
        {item.entitlement} entitled · {item.used} used
      </Text>
      <View style={s.progressTrack}>
        <View
          style={[
            s.progressFill,
            { width: `${percentage}%`, backgroundColor: progressColor },
          ]}
        />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 16, gap: 16, paddingBottom: 30 },
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
  stats: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  stat: { minWidth: "47%", flexGrow: 1, alignItems: "flex-start", gap: 4 },
  statValue: { color: colors.ink, fontSize: 22, fontWeight: "800" },
  statLabel: { color: colors.muted, fontSize: 11, fontWeight: "600" },
  tabs: {
    flexDirection: "row",
    alignSelf: "flex-start",
    gap: 6,
    padding: 4,
    borderRadius: 24,
    backgroundColor: "#ECE9E0",
  },
  tabButton: { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9 },
  activeTabButton: { backgroundColor: colors.ink },
  tabText: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  activeTabText: { color: "#fff" },
  sectionTitle: { color: colors.ink, fontSize: 16, fontWeight: "800" },
  helper: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  filters: { gap: 8, paddingVertical: 2 },
  filter: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: "#fff",
  },
  activeFilter: { backgroundColor: colors.ink, borderColor: colors.ink },
  filterText: { color: colors.muted, fontSize: 11, fontWeight: "700" },
  activeFilterText: { color: "#fff" },
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
  requestCard: {
    flexDirection: "row",
    gap: 10,
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#FCFBF8",
  },
  requestIcon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: "#EAF3FB",
    justifyContent: "center",
    alignItems: "center",
  },
  requestHeading: { flexDirection: "row", alignItems: "center", gap: 5 },
  applicant: { flexShrink: 1, color: colors.ink, fontSize: 13, fontWeight: "800" },
  badge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 10 },
  badgeText: { fontSize: 9, fontWeight: "800" },
  requestDates: { color: colors.muted, fontSize: 11 },
  reason: { color: colors.text, fontSize: 12, lineHeight: 17 },
  remarks: { color: colors.info, fontSize: 11, lineHeight: 16 },
  reviewActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    marginTop: 5,
  },
  approveAction: { flexDirection: "row", alignItems: "center", gap: 4 },
  rejectAction: { flexDirection: "row", alignItems: "center", gap: 4 },
  actionText: { fontSize: 12, fontWeight: "800" },
  balanceCard: {
    padding: 13,
    backgroundColor: "#FCFBF8",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    gap: 7,
  },
  balanceHeading: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  balanceName: { color: colors.ink, fontSize: 13, fontWeight: "800" },
  balanceRemaining: { color: colors.ink, fontSize: 12, fontWeight: "800" },
  balanceDetail: { color: colors.muted, fontSize: 11 },
  progressTrack: {
    height: 6,
    borderRadius: 4,
    backgroundColor: "#EAE7DF",
    overflow: "hidden",
  },
  progressFill: { height: "100%", borderRadius: 4 },
  modalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "#0007",
  },
  modalCard: {
    maxHeight: "92%",
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
  typeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  typeOption: {
    width: "48%",
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: "#fff",
  },
  typeOptionActive: {
    borderColor: colors.ink,
    backgroundColor: "#EAEFF6",
  },
  typeOptionText: { color: colors.muted, fontSize: 11, fontWeight: "600" },
  typeOptionTextActive: { color: colors.ink, fontWeight: "800" },
  reasonInput: { minHeight: 90, textAlignVertical: "top" },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
