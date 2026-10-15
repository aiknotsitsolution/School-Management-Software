import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  AppState,
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
import { BarChart } from "../components/Charts";
import { api } from "../lib/api";
import type { RootStackParams } from "../../App";
import type { TransportRoute } from "../types";
import { useAuth } from "../context/AuthContext";
import { colors } from "../theme";

const REFRESH_MS = 30_000;
const DAY_MS = 24 * 60 * 60 * 1000;

function Metric({
  icon,
  label,
  value,
  detail,
  tint,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string | number;
  detail: string;
  tint: string;
}) {
  return (
    <Card style={s.metric}>
      <View style={[s.metricIcon, { backgroundColor: `${tint}18` }]}>
        <Ionicons name={icon} size={17} color={tint} />
      </View>
      <Text numberOfLines={1} style={s.metricValue}>
        {value}
      </Text>
      <Text style={s.metricLabel}>{label}</Text>
      <Text numberOfLines={1} style={s.metricDetail}>
        {detail}
      </Text>
    </Card>
  );
}

function relativeTime(value?: string) {
  if (!value) return "No GPS update";
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "GPS time unavailable";
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function RouteRow({
  route,
  live,
  last,
}: {
  route: TransportRoute;
  live: boolean;
  last: boolean;
}) {
  return (
    <View style={[s.routeRow, last && s.lastRouteRow]}>
      <View
        style={[s.routeIcon, { backgroundColor: live ? "#E8F7EF" : "#F0F2F5" }]}
      >
        <Ionicons
          name="navigate-outline"
          size={17}
          color={live ? colors.success : colors.muted}
        />
      </View>
      <View style={s.routeCopy}>
        <Text numberOfLines={1} style={s.routeTitle}>
          Route {route.routeNo || "—"}
          {route.vehicleNo ? ` · ${route.vehicleNo}` : " · no vehicle"}
        </Text>
        <Text numberOfLines={1} style={s.routeMeta}>
          {route.driverName || "No driver"} · {route.stops?.length || 0} stops
        </Text>
        <Text style={s.routePing}>
          {relativeTime(route.currentLocation?.updatedAt)}
        </Text>
      </View>
      <View style={[s.liveBadge, live ? s.liveBadgeOn : s.liveBadgeOff]}>
        <Text style={[s.liveBadgeText, live ? s.liveTextOn : s.liveTextOff]}>
          {live ? "LIVE" : "IDLE"}
        </Text>
      </View>
    </View>
  );
}

export default function TransportDashboardScreen() {
  const { school } = useAuth();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParams>>();
  const [routes, setRoutes] = useState<TransportRoute[]>([]);
  const [providerReady, setProviderReady] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (refresh = false, silent = false) => {
    if (refresh && !silent) setRefreshing(true);
    if (!silent) setError("");
    const [routeResult, providerResult] = await Promise.allSettled([
      api.transport.list(),
      api.transport.trackingStatus(),
    ]);
    if (routeResult.status === "fulfilled") {
      setRoutes(routeResult.value.data || []);
    } else if (!silent) {
      setError(
        routeResult.reason instanceof Error
          ? routeResult.reason.message
          : "Could not load transport routes.",
      );
    }
    if (providerResult.status === "fulfilled") {
      const provider = providerResult.value.data?.providers?.traccar;
      setProviderReady(Boolean(provider?.enabled && provider?.configured));
    } else {
      setProviderReady(null);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    void load();
    let active = AppState.currentState === "active";
    const appStateSubscription = AppState.addEventListener(
      "change",
      (state) => {
        active = state === "active";
        if (active) void load(true, true);
      },
    );
    const timer = setInterval(() => {
      if (active) void load(true, true);
    }, REFRESH_MS);
    return () => {
      clearInterval(timer);
      appStateSubscription.remove();
    };
  }, [load]);

  const now = Date.now();
  const liveRoutes = useMemo(
    () =>
      routes.filter((route) => {
        const updated = route.currentLocation?.updatedAt;
        const timestamp = updated ? new Date(updated).getTime() : Number.NaN;
        return Number.isFinite(timestamp) && now - timestamp < DAY_MS;
      }),
    [now, routes],
  );
  const drivers = new Set(
    routes.map((route) => route.driverName).filter(Boolean),
  );
  const trackedRoutes = routes.filter(
    (route) => route.tracking?.enabled,
  ).length;
  const studentCount = routes.reduce(
    (total, route) => total + (route.assignedStudents?.length || 0),
    0,
  );
  const totalStops = routes.reduce(
    (total, route) => total + (route.stops?.length || 0),
    0,
  );
  const movingRoutes = routes.filter(
    (route) =>
      liveRoutes.some((liveRoute) => liveRoute._id === route._id) &&
      Number(route.currentLocation?.speedKmh || route.live?.speedKmh || 0) > 0,
  );
  const averageSpeed = movingRoutes.length
    ? Math.round(
        movingRoutes.reduce(
          (total, route) =>
            total +
            Number(
              route.currentLocation?.speedKmh || route.live?.speedKmh || 0,
            ),
          0,
        ) / movingRoutes.length,
      )
    : 0;
  const readiness = {
    noVehicle: routes.filter((route) => !route.vehicleNo).length,
    noDriver: routes.filter((route) => !route.driverName).length,
    noStops: routes.filter((route) => !route.stops?.length).length,
    noStudents: routes.filter((route) => !route.assignedStudents?.length)
      .length,
  };
  const plannedKm = Math.round(
    routes.reduce(
      (total, route) => total + Number(route.routePlan?.totalKm || 0),
      0,
    ),
  );
  const routeLoads = routes
    .filter((route) => route.routeNo)
    .map((route) => ({
      label: String(route.routeNo),
      value: route.assignedStudents?.length || 0,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);
  const livePercent = routes.length
    ? Math.round((liveRoutes.length / routes.length) * 100)
    : 0;
  const newestPing = routes
    .map((route) => route.currentLocation?.updatedAt)
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
  const alerts = [
    ...(routes.length && liveRoutes.length === 0
      ? ["No route has reported GPS in the last 24 hours."]
      : []),
    ...(readiness.noDriver
      ? [
          `${readiness.noDriver} route${readiness.noDriver === 1 ? "" : "s"} missing a driver.`,
        ]
      : []),
    ...(readiness.noVehicle
      ? [
          `${readiness.noVehicle} route${readiness.noVehicle === 1 ? "" : "s"} missing a vehicle.`,
        ]
      : []),
    ...(readiness.noStops
      ? [
          `${readiness.noStops} route${readiness.noStops === 1 ? "" : "s"} without stops.`,
        ]
      : []),
    ...(readiness.noStudents
      ? [
          `${readiness.noStudents} route${readiness.noStudents === 1 ? "" : "s"} without students.`,
        ]
      : []),
  ];

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
            <Ionicons name="bus-outline" size={23} color={colors.amberDark} />
          </View>
          <Pressable
            onPress={() => navigation.navigate("BusTracking")}
            style={s.mapButton}
            accessibilityRole="button"
          >
            <Ionicons name="map-outline" size={15} color="#fff" />
            <Text style={s.mapButtonText}>Fleet map</Text>
          </Pressable>
        </View>
        <Text style={s.eyebrow}>
          {new Date().getHours() < 12
            ? "Good morning"
            : new Date().getHours() < 17
              ? "Good afternoon"
              : "Good evening"}{" "}
          · Transport Workspace
        </Text>
        <Text style={s.heroName}>Fleet & Routes</Text>
        <Text style={s.title}>{school?.name || "Transport"}</Text>
        <Text style={s.subtitle}>
          {new Date().toLocaleDateString("en-IN", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
          {"\n"}Live fleet overview, route readiness and student allocations.
        </Text>
        <View style={s.heroStats}>
          <View style={s.heroStat}>
            <Text style={s.heroStatValue}>{routes.length}</Text>
            <Text style={s.heroStatLabel}>Routes</Text>
          </View>
          <View style={s.heroStatDivider} />
          <View style={s.heroStat}>
            <Text style={s.heroStatValue}>{liveRoutes.length}</Text>
            <Text style={s.heroStatLabel}>Live now</Text>
          </View>
          <View style={s.heroStatDivider} />
          <View style={s.heroStat}>
            <Text style={s.heroStatValue}>{studentCount}</Text>
            <Text style={s.heroStatLabel}>Students</Text>
          </View>
        </View>
      </View>

      {error ? (
        <Card style={s.errorCard}>
          <Ionicons
            name="cloud-offline-outline"
            size={22}
            color={colors.alert}
          />
          <Text style={s.errorText}>{error}</Text>
          <Pressable onPress={() => void load()} style={s.retryButton}>
            <Ionicons name="refresh" size={15} color={colors.info} />
            <Text style={s.retryText}>Try again</Text>
          </Pressable>
        </Card>
      ) : null}

      <View style={s.quickActions}>
        <Pressable
          onPress={() =>
            navigation.navigate("Module", {
              title: "Bus / Transport",
              endpoint: "/transport",
            })
          }
          style={s.quickAction}
          accessibilityRole="button"
        >
          <View style={[s.quickIcon, { backgroundColor: "#EAF2F8" }]}>
            <Ionicons name="git-branch-outline" size={17} color={colors.info} />
          </View>
          <Text style={s.quickActionText}>Route records</Text>
          <Ionicons name="chevron-forward" size={15} color={colors.muted} />
        </Pressable>
        <Pressable
          onPress={() => navigation.navigate("BusTracking")}
          style={s.quickAction}
          accessibilityRole="button"
        >
          <View style={[s.quickIcon, { backgroundColor: "#E8F7EF" }]}>
            <Ionicons name="map-outline" size={17} color={colors.success} />
          </View>
          <Text style={s.quickActionText}>Live fleet map</Text>
          <Ionicons name="chevron-forward" size={15} color={colors.muted} />
        </Pressable>
      </View>

      {loading && !routes.length ? (
        <ActivityIndicator size="large" color={colors.info} style={s.loader} />
      ) : (
        <>
          <View style={s.metrics}>
            <Metric
              icon="car-outline"
              label="Vehicles"
              value={routes.filter((route) => route.vehicleNo).length}
              detail="registered buses"
              tint={colors.info}
            />
            <Metric
              icon="person-outline"
              label="Drivers"
              value={drivers.size}
              detail="across routes"
              tint={colors.success}
            />
            <Metric
              icon="radio-outline"
              label="Tracked routes"
              value={`${trackedRoutes} / ${routes.length}`}
              detail="GPS tracking enabled"
              tint={colors.amberDark}
            />
            <Metric
              icon="speedometer-outline"
              label="Average speed"
              value={`${averageSpeed} km/h`}
              detail={`${liveRoutes.length} routes reporting`}
              tint="#37827D"
            />
          </View>

          <View style={s.sectionHeading}>
            <View>
              <Text style={s.sectionTitle}>Fleet status</Text>
              <Text style={s.sectionSubtitle}>
                {providerReady === null
                  ? `${trackedRoutes} tracked · ${livePercent}% reported in the last 24 hours`
                  : providerReady
                    ? `GPS provider connected · ${trackedRoutes} tracked · ${livePercent}% reporting`
                    : `Manual GPS positions · ${trackedRoutes} tracked · ${livePercent}% reporting`}
              </Text>
            </View>
            <View
              style={[
                s.statusBadge,
                liveRoutes.length ? s.statusBadgeLive : s.statusBadgeIdle,
              ]}
            >
              <Text
                style={[
                  s.statusBadgeText,
                  liveRoutes.length ? s.statusTextLive : s.statusTextIdle,
                ]}
              >
                {liveRoutes.length} LIVE
              </Text>
            </View>
          </View>
          <View style={s.progressTrack}>
            <View style={[s.progressFill, { width: `${livePercent}%` }]} />
          </View>
          <View style={s.lastPingRow}>
            <Text style={s.lastPingLabel}>Last fleet ping</Text>
            <Text style={s.lastPingValue}>{relativeTime(newestPing)}</Text>
          </View>
          <View style={s.activityMetrics}>
            <View style={s.activityMetric}>
              <Text style={s.activityValue}>{movingRoutes.length}</Text>
              <Text style={s.activityLabel}>Moving now</Text>
            </View>
            <View style={s.activityDivider} />
            <View style={s.activityMetric}>
              <Text style={s.activityValue}>{averageSpeed} km/h</Text>
              <Text style={s.activityLabel}>Average speed</Text>
            </View>
            <View style={s.activityDivider} />
            <View style={s.activityMetric}>
              <Text style={s.activityValue}>{totalStops}</Text>
              <Text style={s.activityLabel}>Total stops</Text>
            </View>
          </View>

          {alerts.length ? (
            <View style={s.alertList}>
              {alerts.slice(0, 4).map((alert) => (
                <View key={alert} style={s.alertRow}>
                  <Ionicons
                    name="alert-circle-outline"
                    size={16}
                    color={colors.amberDark}
                  />
                  <Text style={s.alertText}>{alert}</Text>
                </View>
              ))}
            </View>
          ) : routes.length ? (
            <View style={s.successRow}>
              <Ionicons
                name="checkmark-circle-outline"
                size={17}
                color={colors.success}
              />
              <Text style={s.successText}>
                All routes have a driver, vehicle, stops and students.
              </Text>
            </View>
          ) : null}

          {plannedKm > 0 ? (
            <View style={s.plannedRow}>
              <Ionicons
                name="trail-sign-outline"
                size={17}
                color={colors.info}
              />
              <Text style={s.plannedText}>
                {plannedKm} km planned across the fleet
              </Text>
            </View>
          ) : null}

          <View style={s.sectionHeading}>
            <View>
              <Text style={s.sectionTitle}>Students per route</Text>
              <Text style={s.sectionSubtitle}>Allocation across the fleet</Text>
            </View>
          </View>
          <Card style={s.chartCard}>
            {routeLoads.length ? (
              <BarChart data={routeLoads} color={colors.info} />
            ) : (
              <Text style={s.emptyChart}>No routes to compare yet.</Text>
            )}
          </Card>

          <View style={s.sectionHeading}>
            <View>
              <Text style={s.sectionTitle}>Route overview</Text>
              <Text style={s.sectionSubtitle}>{routes.length} configured</Text>
            </View>
            <Pressable
              onPress={() => navigation.navigate("BusTracking")}
              style={s.viewAllButton}
              accessibilityRole="button"
            >
              <Text style={s.viewAllText}>View fleet</Text>
              <Ionicons name="chevron-forward" size={14} color={colors.info} />
            </Pressable>
          </View>
          {routes.length ? (
            <Card style={s.routesCard}>
              {routes.slice(0, 8).map((route, index) => {
                const isLive = liveRoutes.some(
                  (item) => item._id === route._id,
                );
                return (
                  <View
                    key={route._id}
                    style={[
                      s.routeRow,
                      index === Math.min(routes.length, 8) - 1 &&
                        s.lastRouteRow,
                    ]}
                  >
                    <View
                      style={[
                        s.routeIcon,
                        isLive ? s.routeIconLive : s.routeIconIdle,
                      ]}
                    >
                      <Ionicons
                        name="navigate-outline"
                        size={17}
                        color={isLive ? colors.success : colors.muted}
                      />
                    </View>
                    <View style={s.routeCopy}>
                      <Text numberOfLines={1} style={s.routeTitle}>
                        Route {route.routeNo || "—"}
                        {route.vehicleNo
                          ? ` · ${route.vehicleNo}`
                          : " · no vehicle"}
                      </Text>
                      <Text numberOfLines={1} style={s.routeMeta}>
                        {route.driverName || "No driver"} ·{" "}
                        {route.stops?.length || 0} stops ·{" "}
                        {route.assignedStudents?.length || 0} students
                      </Text>
                      <Text style={s.routePing}>
                        {relativeTime(route.currentLocation?.updatedAt)}
                      </Text>
                    </View>
                    <View
                      style={[
                        s.routeLiveDot,
                        {
                          backgroundColor: isLive
                            ? colors.success
                            : colors.border,
                        },
                      ]}
                    />
                  </View>
                );
              })}
            </Card>
          ) : (
            <Card style={s.emptyRoutes}>
              <Ionicons name="bus-outline" size={30} color={colors.muted} />
              <Text style={s.emptyTitle}>No routes configured yet</Text>
              <Text style={s.emptyCopy}>
                Transport routes will appear here when they are set up.
              </Text>
            </Card>
          )}

          <View style={s.heartbeatHeading}>
            <View>
              <Text style={s.sectionTitle}>Fleet heartbeat</Text>
              <Text style={s.sectionSubtitle}>Every route, live or idle</Text>
            </View>
            <Text style={s.heartbeatCount}>{routes.length} routes</Text>
          </View>
          {routes.length ? (
            <Card style={s.routesCard}>
              {routes.map((route, index) => (
                <RouteRow
                  key={route._id}
                  route={route}
                  live={liveRoutes.some(
                    (liveRoute) => liveRoute._id === route._id,
                  )}
                  last={index === routes.length - 1}
                />
              ))}
            </Card>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 16, paddingBottom: 32, gap: 13 },
  hero: {
    padding: 18,
    borderRadius: 19,
    backgroundColor: colors.ink,
    borderBottomWidth: 3,
    borderBottomColor: colors.amber,
  },
  heroTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  heroIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  mapButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 9,
    backgroundColor: "#37827D",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  mapButtonText: { color: "#fff", fontSize: 10, fontWeight: "800" },
  heroName: { color: "#D7DCE8", fontSize: 11, fontWeight: "800", marginTop: 3 },
  quickActions: { gap: 8 },
  quickAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    minHeight: 48,
    paddingHorizontal: 10,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#fff",
  },
  quickIcon: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
  },
  quickActionText: {
    flex: 1,
    color: colors.ink,
    fontSize: 10,
    fontWeight: "800",
  },
  eyebrow: {
    color: "#F0C77F",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.3,
  },
  title: { color: "#fff", fontSize: 23, fontWeight: "900", marginTop: 4 },
  subtitle: { color: "#D7DCE8", fontSize: 11, lineHeight: 16, marginTop: 5 },
  heroStats: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 15,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.18)",
  },
  heroStat: { flex: 1, gap: 2 },
  heroStatValue: { color: "#fff", fontSize: 18, fontWeight: "900" },
  heroStatLabel: { color: "#D7DCE8", fontSize: 9, fontWeight: "700" },
  heroStatDivider: {
    width: 1,
    height: 28,
    backgroundColor: "rgba(255,255,255,0.2)",
    marginHorizontal: 12,
  },
  loader: { marginVertical: 30 },
  errorCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderColor: "#F2C6C2",
  },
  errorText: { flex: 1, color: colors.alert, fontSize: 10, lineHeight: 15 },
  retryButton: { flexDirection: "row", alignItems: "center", gap: 4 },
  retryText: { color: colors.info, fontSize: 10, fontWeight: "800" },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  metric: { width: "48%", minHeight: 105, padding: 11, gap: 4 },
  metricIcon: {
    width: 31,
    height: 31,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    marginBottom: 2,
  },
  metricValue: { color: colors.ink, fontSize: 18, fontWeight: "900" },
  metricLabel: { color: colors.ink, fontSize: 10, fontWeight: "800" },
  metricDetail: { color: colors.muted, fontSize: 9 },
  sectionHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 3,
  },
  sectionTitle: { color: colors.ink, fontSize: 14, fontWeight: "900" },
  sectionSubtitle: { color: colors.muted, fontSize: 9, marginTop: 3 },
  statusBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 },
  statusBadgeLive: { backgroundColor: "#E8F7EF" },
  statusBadgeIdle: { backgroundColor: "#F0F2F5" },
  statusBadgeText: { fontSize: 8, fontWeight: "900" },
  statusTextLive: { color: colors.success },
  statusTextIdle: { color: colors.muted },
  liveBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 },
  liveBadgeOn: { backgroundColor: "#E8F7EF" },
  liveBadgeOff: { backgroundColor: "#F0F2F5" },
  liveBadgeText: { fontSize: 8, fontWeight: "900" },
  liveTextOn: { color: colors.success },
  liveTextOff: { color: colors.muted },
  progressTrack: {
    height: 7,
    borderRadius: 5,
    backgroundColor: "#E9ECEF",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 5,
    backgroundColor: colors.success,
  },
  lastPingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  lastPingLabel: { color: colors.muted, fontSize: 9 },
  lastPingValue: { color: colors.ink, fontSize: 9, fontWeight: "700" },
  activityMetrics: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  activityMetric: { flex: 1, alignItems: "center", gap: 3 },
  activityValue: { color: colors.ink, fontSize: 11, fontWeight: "900" },
  activityLabel: { color: colors.muted, fontSize: 8 },
  activityDivider: { width: 1, height: 24, backgroundColor: colors.border },
  alertList: { gap: 7 },
  alertRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderRadius: 9,
    backgroundColor: "#FFF4DF",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  alertText: {
    flex: 1,
    color: colors.amberDark,
    fontSize: 9,
    fontWeight: "700",
  },
  successRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderRadius: 9,
    backgroundColor: "#E8F7EF",
    padding: 10,
  },
  successText: {
    flex: 1,
    color: colors.success,
    fontSize: 9,
    fontWeight: "700",
  },
  plannedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderRadius: 9,
    backgroundColor: "#EAF2F8",
    padding: 10,
  },
  plannedText: { color: colors.info, fontSize: 9, fontWeight: "700" },
  chartCard: { paddingHorizontal: 5, paddingVertical: 8 },
  emptyChart: {
    color: colors.muted,
    fontSize: 10,
    textAlign: "center",
    padding: 20,
  },
  viewAllButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    padding: 5,
  },
  viewAllText: { color: colors.info, fontSize: 9, fontWeight: "800" },
  heartbeatHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  heartbeatCount: { color: colors.muted, fontSize: 9, fontWeight: "700" },
  routesCard: { paddingVertical: 2 },
  routeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  lastRouteRow: { borderBottomWidth: 0 },
  routeIcon: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  routeIconLive: { backgroundColor: "#E8F7EF" },
  routeIconIdle: { backgroundColor: "#F0F2F5" },
  routeCopy: { flex: 1, minWidth: 0, gap: 3 },
  routeTitle: { color: colors.ink, fontSize: 10, fontWeight: "800" },
  routeMeta: { color: colors.muted, fontSize: 9 },
  routePing: { color: colors.muted, fontSize: 8 },
  routeLiveDot: { width: 8, height: 8, borderRadius: 4 },
  emptyRoutes: {
    minHeight: 145,
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  emptyTitle: { color: colors.ink, fontSize: 12, fontWeight: "800" },
  emptyCopy: { color: colors.muted, fontSize: 10, textAlign: "center" },
});
