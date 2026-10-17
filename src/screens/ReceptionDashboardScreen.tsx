import React, { useCallback, useMemo, useState } from "react";
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
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Card } from "../components/UI";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import type { AdmissionEnquiry, Notice } from "../types";
import type { RootStackParams } from "../../App";
import { colors } from "../theme";

const STATUS_TINT: Record<string, string> = {
  New: colors.info,
  "Follow Up": colors.amberDark,
  "Campus Visit Scheduled": "#7257C8",
  Admitted: colors.success,
  Rejected: colors.alert,
};

const dateKey = (value?: string | Date) => {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
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

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function formatDate(value?: string) {
  if (!value) return "Date not set";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "Asia/Kolkata",
      });
}

function SectionTitle({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <View style={styles.sectionHeading}>
      <View style={styles.sectionCopy}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
      </View>
      {action ? (
        <Pressable
          onPress={action.onPress}
          accessibilityRole="button"
          style={styles.sectionAction}
        >
          <Text style={styles.sectionActionText}>{action.label}</Text>
          <Ionicons name="chevron-forward" size={15} color={colors.info} />
        </Pressable>
      ) : null}
    </View>
  );
}

function Metric({
  label,
  value,
  icon,
  tint,
  detail,
}: {
  label: string;
  value: number;
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  detail: string;
}) {
  return (
    <Card style={styles.metric}>
      <View style={[styles.metricIcon, { backgroundColor: `${tint}18` }]}>
        <Ionicons name={icon} size={18} color={tint} />
      </View>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text numberOfLines={1} style={styles.metricDetail}>
        {detail}
      </Text>
    </Card>
  );
}

function QuickAction({
  title,
  description,
  icon,
  tint,
  onPress,
}: {
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.actionCard, pressed && styles.pressed]}
    >
      <View style={[styles.actionIcon, { backgroundColor: `${tint}18` }]}>
        <Ionicons name={icon} size={19} color={tint} />
      </View>
      <View style={styles.actionCopy}>
        <Text style={styles.actionTitle}>{title}</Text>
        <Text style={styles.actionDescription}>{description}</Text>
      </View>
      <Ionicons name="arrow-forward" size={16} color={colors.muted} />
    </Pressable>
  );
}

export default function ReceptionDashboardScreen() {
  const { school, user } = useAuth();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParams>>();
  const [enquiries, setEnquiries] = useState<AdmissionEnquiry[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError("");

    const [enquiryResult, noticeResult] = await Promise.allSettled([
      api.admissions.list(),
      api.notices.list(),
    ]);
    const failures: string[] = [];

    if (enquiryResult.status === "fulfilled") {
      setEnquiries(enquiryResult.value.data || []);
    } else {
      failures.push(
        `Enquiries: ${
          enquiryResult.reason instanceof Error
            ? enquiryResult.reason.message
            : "Could not load enquiries."
        }`,
      );
    }

    if (noticeResult.status === "fulfilled") {
      setNotices(noticeResult.value.data || []);
    } else {
      failures.push(
        `Notices: ${
          noticeResult.reason instanceof Error
            ? noticeResult.reason.message
            : "Could not load notices."
        }`,
      );
    }

    setError(failures.join("\n"));
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const stats = useMemo(() => {
    const byStatus: Record<string, number> = {};
    const bySource: Record<string, number> = {};
    enquiries.forEach((enquiry) => {
      const status = enquiry.status || "New";
      byStatus[status] = (byStatus[status] || 0) + 1;
      const source = enquiry.source?.trim();
      if (source) bySource[source] = (bySource[source] || 0) + 1;
    });
    return {
      total: enquiries.length,
      byStatus,
      bySource,
      newCount: byStatus.New || 0,
      admitted: byStatus.Admitted || 0,
    };
  }, [enquiries]);

  const today = dateKey(new Date());
  const conversionRate = stats.total
    ? Math.round((stats.admitted / stats.total) * 100)
    : 0;
  const todayEnquiries = enquiries.filter(
    (enquiry) => dateKey(enquiry.createdAt) === today,
  ).length;
  const followUpsDue = enquiries.filter(
    (enquiry) =>
      enquiry.followUpDate &&
      !["Admitted", "Rejected"].includes(enquiry.status || "") &&
      dateKey(enquiry.followUpDate) <= today,
  );
  const emergencyCount = notices.filter(
    (notice) => notice.priority === "emergency",
  ).length;
  const recentEnquiries = [...enquiries]
    .sort((a, b) =>
      String(b.createdAt || "").localeCompare(String(a.createdAt || "")),
    )
    .slice(0, 6);
  const statusItems = Object.entries(stats.byStatus)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);
  const sourceItems = Object.entries(stats.bySource)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const alerts = [
    stats.newCount
      ? `${stats.newCount} new lead${stats.newCount === 1 ? "" : "s"} to follow up`
      : "",
    followUpsDue.length
      ? `${followUpsDue.length} follow-up${followUpsDue.length === 1 ? "" : "s"} due today`
      : "",
    emergencyCount
      ? `${emergencyCount} emergency notice${emergencyCount === 1 ? "" : "s"} live`
      : "",
    stats.total > 0 && conversionRate < 50
      ? `Admission conversion is ${conversionRate}%`
      : "",
    todayEnquiries
      ? `${todayEnquiries} walk-in${todayEnquiries === 1 ? "" : "s"} logged today`
      : "",
  ].filter(Boolean);
  const displayDate = new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void load(true)}
          tintColor={colors.amberDark}
        />
      }
    >
      <View style={styles.hero}>
        <View style={styles.heroTop}>
          <View style={styles.heroIcon}>
            <Ionicons name="business-outline" size={22} color="#fff" />
          </View>
          <Text style={styles.heroEyebrow}>{greeting()} · RECEPTION</Text>
        </View>
        <Text style={styles.heroTitle}>{school?.name || "Front Desk"}</Text>
        <Text style={styles.heroDescription}>
          Welcome{user?.name ? `, ${user.name}` : ""}. Manage walk-ins, admission
          enquiries and school notices from one place.
        </Text>
        <Text style={styles.heroDate}>{displayDate}</Text>
        <View style={styles.heroStats}>
          <View style={styles.heroStat}>
            <Text style={styles.heroStatValue}>{stats.total}</Text>
            <Text style={styles.heroStatLabel}>Enquiries</Text>
          </View>
          <View style={styles.heroDivider} />
          <View style={styles.heroStat}>
            <Text style={styles.heroStatValue}>{stats.newCount}</Text>
            <Text style={styles.heroStatLabel}>To follow up</Text>
          </View>
          <View style={styles.heroDivider} />
          <View style={styles.heroStat}>
            <Text style={styles.heroStatValue}>{notices.length}</Text>
            <Text style={styles.heroStatLabel}>Notices</Text>
          </View>
        </View>
      </View>

      {error ? (
        <View style={styles.errorBanner} accessibilityRole="alert">
          <Ionicons name="warning-outline" size={19} color={colors.alert} />
          <Text style={styles.errorText}>{error}</Text>
          <Pressable
            onPress={() => void load(true)}
            accessibilityRole="button"
            hitSlop={8}
          >
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : null}

      <SectionTitle title="Front desk shortcuts" subtitle="Common tasks" />
      <View style={styles.actions}>
        <QuickAction
          title="Admission enquiries"
          description="Review leads and log walk-ins"
          icon="clipboard-outline"
          tint={colors.info}
          onPress={() => navigation.navigate("AdmissionEnquiry")}
        />
        <QuickAction
          title="Student lookup"
          description="Find a student record"
          icon="search-outline"
          tint={colors.success}
          onPress={() => navigation.navigate("StudentDatabase")}
        />
        <QuickAction
          title="Notice board"
          description="View and publish notices"
          icon="megaphone-outline"
          tint="#7257C8"
          onPress={() => navigation.navigate("NoticeBoard")}
        />
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.amberDark} />
          <Text style={styles.loadingText}>Loading reception workspace…</Text>
        </View>
      ) : (
        <>
          {alerts.length ? (
            <Card style={styles.alertCard}>
              <View style={styles.cardHeading}>
                <Ionicons
                  name="notifications-outline"
                  size={19}
                  color={colors.amberDark}
                />
                <Text style={styles.cardTitle}>Needs attention</Text>
              </View>
              {alerts.map((alert) => (
                <View key={alert} style={styles.alertRow}>
                  <View style={styles.alertDot} />
                  <Text style={styles.alertText}>{alert}</Text>
                </View>
              ))}
            </Card>
          ) : null}

          <View style={styles.metrics}>
            <Metric
              label="Total enquiries"
              value={stats.total}
              detail="all admission leads"
              icon="mail-unread-outline"
              tint={colors.info}
            />
            <Metric
              label="New to follow up"
              value={stats.newCount}
              detail={stats.newCount ? "uncontacted leads" : "all contacted"}
              icon="call-outline"
              tint={stats.newCount ? colors.amberDark : colors.success}
            />
            <Metric
              label="Admitted"
              value={stats.admitted}
              detail={`${conversionRate}% conversion rate`}
              icon="people-outline"
              tint={colors.success}
            />
            <Metric
              label="Active notices"
              value={notices.length}
              detail={
                emergencyCount
                  ? `${emergencyCount} emergency`
                  : "currently published"
              }
              icon="megaphone-outline"
              tint={emergencyCount ? colors.alert : "#7257C8"}
            />
          </View>

          <Card style={styles.panel}>
            <SectionTitle
              title="Recent enquiries"
              subtitle="Latest walk-ins and phone leads"
              action={{
                label: "View all",
                onPress: () => navigation.navigate("AdmissionEnquiry"),
              }}
            />
            {recentEnquiries.length ? (
              recentEnquiries.map((enquiry, index) => {
                const status = enquiry.status || "New";
                const due =
                  enquiry.followUpDate &&
                  !["Admitted", "Rejected"].includes(status) &&
                  dateKey(enquiry.followUpDate) <= today;
                return (
                  <Pressable
                    key={enquiry._id}
                    onPress={() => navigation.navigate("AdmissionEnquiry")}
                    style={[
                      styles.listRow,
                      index === recentEnquiries.length - 1 &&
                        styles.lastListRow,
                    ]}
                  >
                    <View
                      style={[
                        styles.listIcon,
                        {
                          backgroundColor: `${STATUS_TINT[status] || colors.muted}18`,
                        },
                      ]}
                    >
                      <Ionicons
                        name="person-add-outline"
                        size={17}
                        color={STATUS_TINT[status] || colors.muted}
                      />
                    </View>
                    <View style={styles.listCopy}>
                      <Text numberOfLines={1} style={styles.listTitle}>
                        {enquiry.childName || "Unnamed enquiry"}
                      </Text>
                      <Text numberOfLines={1} style={styles.listMeta}>
                        Class {enquiry.classApplied || "—"} ·{" "}
                        {enquiry.contact || "No contact"} ·{" "}
                        {formatDate(enquiry.createdAt)}
                      </Text>
                    </View>
                    <View style={styles.badgeColumn}>
                      {due ? (
                        <Text style={styles.followUpBadge}>Follow-up</Text>
                      ) : null}
                      <Text
                        style={[
                          styles.statusBadge,
                          {
                            color: STATUS_TINT[status] || colors.muted,
                            backgroundColor: `${STATUS_TINT[status] || colors.muted}18`,
                          },
                        ]}
                      >
                        {status}
                      </Text>
                    </View>
                  </Pressable>
                );
              })
            ) : (
              <Text style={styles.emptyText}>
                No enquiries yet. Log a walk-in or phone lead to get started.
              </Text>
            )}
            {!recentEnquiries.length ? (
              <Pressable
                style={styles.emptyAction}
                onPress={() => navigation.navigate("AdmissionEnquiry")}
              >
                <Text style={styles.emptyActionText}>Log an enquiry</Text>
                <Ionicons name="arrow-forward" size={15} color={colors.info} />
              </Pressable>
            ) : null}
          </Card>

          <Card style={styles.panel}>
            <View style={styles.cardHeading}>
              <Ionicons
                name="trending-up-outline"
                size={19}
                color={colors.success}
              />
              <Text style={styles.cardTitle}>Admission pipeline</Text>
            </View>
            <Text style={styles.panelSubtitle}>
              {stats.total
                ? `${stats.admitted} of ${stats.total} converted`
                : "Enquiry statuses will appear here"}
            </Text>
            {statusItems.length ? (
              statusItems.map(([status, count]) => (
                <View key={status} style={styles.pipelineRow}>
                  <View style={styles.pipelineLabelRow}>
                    <Text style={styles.pipelineLabel}>{status}</Text>
                    <Text style={styles.pipelineCount}>{count}</Text>
                  </View>
                  <View style={styles.progressTrack}>
                    <View
                      style={[
                        styles.progressFill,
                        {
                          width: `${Math.max(
                            6,
                            Math.round((count / stats.total) * 100),
                          )}%`,
                          backgroundColor: STATUS_TINT[status] || colors.muted,
                        },
                      ]}
                    />
                  </View>
                </View>
              ))
            ) : (
              <Text style={styles.emptyText}>No leads in the pipeline yet.</Text>
            )}
          </Card>

          <Card style={styles.panel}>
            <View style={styles.cardHeading}>
              <Ionicons
                name="location-outline"
                size={19}
                color="#7257C8"
              />
              <Text style={styles.cardTitle}>Enquiry sources</Text>
            </View>
            <Text style={styles.panelSubtitle}>
              Where families hear about the school
            </Text>
            {sourceItems.length ? (
              sourceItems.map(([source, count]) => (
                <View key={source} style={styles.sourceRow}>
                  <Text numberOfLines={1} style={styles.sourceLabel}>
                    {source}
                  </Text>
                  <View style={styles.sourceTrack}>
                    <View
                      style={[
                        styles.sourceFill,
                        {
                          width: `${Math.max(
                            6,
                            Math.round((count / stats.total) * 100),
                          )}%`,
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.sourceCount}>{count}</Text>
                </View>
              ))
            ) : (
              <Text style={styles.emptyText}>No enquiry source data yet.</Text>
            )}
          </Card>

          <Card style={styles.panel}>
            <SectionTitle
              title="Notice board"
              subtitle={`${notices.length} published`}
              action={{
                label: "Open",
                onPress: () => navigation.navigate("NoticeBoard"),
              }}
            />
            {notices.length ? (
              notices.slice(0, 4).map((notice, index) => (
                <Pressable
                  key={notice._id}
                  onPress={() => navigation.navigate("NoticeBoard")}
                  style={[
                    styles.listRow,
                    index === Math.min(notices.length, 4) - 1 &&
                      styles.lastListRow,
                  ]}
                >
                  <View
                    style={[
                      styles.listIcon,
                      {
                        backgroundColor:
                          notice.priority === "emergency"
                            ? "#D65A4A18"
                            : `${colors.info}18`,
                      },
                    ]}
                  >
                    <Ionicons
                      name={
                        notice.priority === "emergency"
                          ? "warning-outline"
                          : "megaphone-outline"
                      }
                      size={17}
                      color={
                        notice.priority === "emergency"
                          ? colors.alert
                          : colors.info
                      }
                    />
                  </View>
                  <View style={styles.listCopy}>
                    <Text numberOfLines={1} style={styles.listTitle}>
                      {notice.title}
                    </Text>
                    <Text style={styles.listMeta}>
                      {formatDate(notice.createdAt)}
                    </Text>
                  </View>
                  {notice.priority === "emergency" ? (
                    <Text style={styles.emergencyBadge}>Emergency</Text>
                  ) : notice.pinned ? (
                    <Text style={styles.pinnedBadge}>Pinned</Text>
                  ) : null}
                </Pressable>
              ))
            ) : (
              <Text style={styles.emptyText}>
                No notices published yet.
              </Text>
            )}
          </Card>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 16, paddingBottom: 32, gap: 14 },
  hero: {
    overflow: "hidden",
    padding: 20,
    borderRadius: 20,
    backgroundColor: "#225F87",
  },
  heroTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  heroIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#FFFFFF22",
    alignItems: "center",
    justifyContent: "center",
  },
  heroEyebrow: {
    color: "#D7EAF5",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  heroTitle: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "800",
    marginTop: 16,
  },
  heroDescription: {
    color: "#E4F0F7",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
  },
  heroDate: { color: "#D7EAF5", fontSize: 12, marginTop: 14 },
  heroStats: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#FFFFFF30",
    marginTop: 18,
    paddingTop: 14,
  },
  heroStat: { flex: 1, alignItems: "center" },
  heroStatValue: { color: "#fff", fontSize: 21, fontWeight: "800" },
  heroStatLabel: { color: "#D7EAF5", fontSize: 11, marginTop: 3 },
  heroDivider: { width: 1, height: 30, backgroundColor: "#FFFFFF30" },
  sectionHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 10,
  },
  sectionCopy: { flex: 1 },
  sectionTitle: { color: colors.ink, fontSize: 16, fontWeight: "800" },
  sectionSubtitle: { color: colors.muted, fontSize: 12, marginTop: 3 },
  sectionAction: { flexDirection: "row", alignItems: "center", gap: 2 },
  sectionActionText: { color: colors.info, fontSize: 12, fontWeight: "700" },
  actions: { gap: 9 },
  actionCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 13,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: colors.card,
  },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  actionCopy: { flex: 1 },
  actionTitle: { color: colors.ink, fontSize: 13, fontWeight: "700" },
  actionDescription: { color: colors.muted, fontSize: 11, marginTop: 3 },
  pressed: { opacity: 0.75 },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#F0B9B2",
    backgroundColor: "#FFF1EF",
  },
  errorText: { flex: 1, color: colors.alert, fontSize: 12, lineHeight: 17 },
  retryText: { color: colors.alert, fontSize: 12, fontWeight: "800" },
  loading: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 36,
    gap: 10,
  },
  loadingText: { color: colors.muted, fontSize: 13 },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  metric: { width: "48%", flexGrow: 1, minHeight: 134 },
  metricIcon: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  metricValue: { color: colors.ink, fontSize: 24, fontWeight: "800", marginTop: 10 },
  metricLabel: { color: colors.inkLight, fontSize: 12, fontWeight: "700", marginTop: 2 },
  metricDetail: { color: colors.muted, fontSize: 11, marginTop: 5 },
  panel: { padding: 15 },
  cardHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  cardTitle: { color: colors.ink, fontSize: 15, fontWeight: "800" },
  panelSubtitle: { color: colors.muted, fontSize: 12, marginBottom: 14 },
  alertCard: { borderColor: "#F0D6A8", backgroundColor: "#FFFBF3" },
  alertRow: { flexDirection: "row", alignItems: "center", gap: 9, marginTop: 9 },
  alertDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.amberDark },
  alertText: { color: colors.inkLight, fontSize: 12, flex: 1 },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  lastListRow: { borderBottomWidth: 0 },
  listIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  listCopy: { flex: 1, minWidth: 0 },
  listTitle: { color: colors.ink, fontSize: 12, fontWeight: "700" },
  listMeta: { color: colors.muted, fontSize: 10, marginTop: 4 },
  badgeColumn: { alignItems: "flex-end", gap: 4 },
  statusBadge: {
    overflow: "hidden",
    borderRadius: 7,
    fontSize: 9,
    fontWeight: "700",
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  followUpBadge: { color: colors.amberDark, fontSize: 9, fontWeight: "700" },
  emptyText: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
    paddingVertical: 18,
  },
  emptyAction: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingTop: 2,
  },
  emptyActionText: { color: colors.info, fontSize: 12, fontWeight: "700" },
  pipelineRow: { marginTop: 12 },
  pipelineLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  pipelineLabel: { color: colors.inkLight, fontSize: 12 },
  pipelineCount: { color: colors.muted, fontSize: 11, fontWeight: "700" },
  progressTrack: {
    height: 7,
    overflow: "hidden",
    borderRadius: 5,
    backgroundColor: "#EEF0F3",
  },
  progressFill: { height: "100%", borderRadius: 5 },
  sourceRow: { flexDirection: "row", alignItems: "center", gap: 9, marginTop: 12 },
  sourceLabel: { width: 75, color: colors.inkLight, fontSize: 11 },
  sourceTrack: {
    height: 7,
    flex: 1,
    overflow: "hidden",
    borderRadius: 5,
    backgroundColor: "#EEF0F3",
  },
  sourceFill: { height: "100%", borderRadius: 5, backgroundColor: "#7257C8" },
  sourceCount: { width: 22, color: colors.muted, fontSize: 11, textAlign: "right" },
  emergencyBadge: {
    overflow: "hidden",
    borderRadius: 7,
    backgroundColor: "#D65A4A18",
    color: colors.alert,
    fontSize: 9,
    fontWeight: "700",
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  pinnedBadge: {
    overflow: "hidden",
    borderRadius: 7,
    backgroundColor: `${colors.info}18`,
    color: colors.info,
    fontSize: 9,
    fontWeight: "700",
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
});
