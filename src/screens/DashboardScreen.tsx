import React, { useCallback, useEffect, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { Card, StatCard } from "../components/UI";
import { colors } from "../theme";
import type { Notice } from "../types";
import { TrendChart, Point } from "../components/Charts";
import PlatformDashboardScreen from "./PlatformDashboardScreen";

export default function DashboardScreen() {
  const { user } = useAuth();
  return user?.role === "super_admin" ? (
    <PlatformDashboardScreen />
  ) : (
    <SchoolDashboardScreen />
  );
}

function SchoolDashboardScreen() {
  const { user, school } = useAuth();
  const [stats, setStats] = useState<{
    students?: number;
    active?: number;
    staff?: number;
    present?: number;
  }>({});
  const [trend, setTrend] = useState<Point[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState("");

  const load = useCallback(async () => {
    setRefreshing(true);
    const [st, staff, att, nt] = await Promise.allSettled([
      api.students.stats(),
      api.staff.list(),
      api.attendance.list(),
      api.notices.list(),
    ]);
    setStats((current) => ({
      students:
        st.status === "fulfilled" ? st.value.data.total : current.students,
      active: st.status === "fulfilled" ? st.value.data.active : current.active,
      staff:
        staff.status === "fulfilled" ? staff.value.data.length : current.staff,
      present:
        att.status === "fulfilled"
          ? att.value.data.filter((a) => a.status === "present").length
          : current.present,
    }));
    const failures = [
      ["Students", st],
      ["Staff", staff],
      ["Attendance", att],
      ["Notices", nt],
    ] as const;
    const messages = failures
      .filter(([, result]) => result.status === "rejected")
      .map(
        ([label, result]) =>
          `${label}: ${(result as PromiseRejectedResult).reason?.message || "Unable to load"}`,
      );
    setLoadError(messages.join(" · "));
    if (att.status === "fulfilled") {
      const byDay: Record<string, { p: number; t: number }> = {};
      (
        att.value.data as unknown as { date?: string; status: string }[]
      ).forEach((a) => {
        if (!a.date) return;
        const k = String(a.date).slice(0, 10);
        const b = (byDay[k] ??= { p: 0, t: 0 });
        b.t += 1;
        if (/present/i.test(a.status)) b.p += 1;
        else if (/half/i.test(a.status)) b.p += 0.5;
      });
      setTrend(
        Object.keys(byDay)
          .sort()
          .slice(-14)
          .map((k) => ({
            label: k.slice(5).replace("-", "/"),
            value: Math.round((byDay[k].p / byDay[k].t) * 100),
          })),
      );
    }
    if (nt.status === "fulfilled") setNotices(nt.value.data.slice(0, 3));
    setRefreshing(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  const onRefresh = load;

  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={{ padding: 16, gap: 14 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <Text style={s.hi}>Hello, {user?.name} 👋</Text>
      <Text style={s.sub}>
        {school?.name ?? "Zipschool OS"} ·{" "}
        {school?.currentSession?.name ?? school?.session ?? ""}
      </Text>
      {!!loadError && (
        <View style={s.errorBox}>
          <Text style={s.errorText}>{loadError}</Text>
          <Pressable
            onPress={load}
            accessibilityRole="button"
            disabled={refreshing}
          >
            <Text style={s.retry}>{refreshing ? "Loading..." : "Retry"}</Text>
          </Pressable>
        </View>
      )}
      <View style={s.grid}>
        <StatCard label="Students" value={stats.students ?? "—"} />
        <StatCard
          label="Active"
          value={stats.active ?? "—"}
          color={colors.success}
        />
        <StatCard
          label="Staff"
          value={stats.staff ?? "—"}
          color={colors.info}
        />
        <StatCard
          label="Present today"
          value={stats.present ?? "—"}
          color={colors.amberDark}
        />
      </View>
      <Text style={s.section}>Attendance trend (last 14 days)</Text>
      <Card>
        <TrendChart data={trend} />
      </Card>
      <Text style={s.section}>Latest notices</Text>
      {notices.map((n) => (
        <Card key={n._id}>
          <Text style={s.nt}>{n.title}</Text>
          <Text numberOfLines={2} style={s.nb}>
            {n.body}
          </Text>
        </Card>
      ))}
    </ScrollView>
  );
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  hi: { fontSize: 24, fontWeight: "800", color: colors.ink },
  sub: { color: colors.muted, marginBottom: 4 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  section: { fontSize: 16, fontWeight: "700", color: colors.ink, marginTop: 8 },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.alert,
    backgroundColor: "#FFF1EF",
  },
  errorText: { flex: 1, color: colors.alert, fontSize: 12 },
  retry: { color: colors.info, fontSize: 12, fontWeight: "700", padding: 4 },
  nt: { fontWeight: "700", color: colors.ink },
  nb: { color: colors.muted, marginTop: 4 },
});
