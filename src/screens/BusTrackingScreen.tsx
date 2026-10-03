import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import MapView, { Marker, PROVIDER_DEFAULT } from "react-native-maps";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import type { TransportRoute, TransportStop } from "../types";
import { colors } from "../theme";

const DEFAULT_CENTER = { latitude: 20.5937, longitude: 78.9629 };

function coordinate(lat: unknown, lng: unknown) {
  if (lat == null || lng == null || lat === "" || lng === "") return null;
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }
  return { latitude, longitude };
}

function routePosition(route: TransportRoute) {
  return coordinate(route.currentLocation?.lat, route.currentLocation?.lng);
}

function routeName(route: TransportRoute) {
  return route.routeNo || "Unnamed route";
}

function stopName(stop: TransportStop | string) {
  if (typeof stop === "string") return stop;
  return stop.name || "Stop";
}

function lastUpdated(value?: string) {
  if (!value) return "No GPS update";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "GPS update time unavailable";
  return `Updated ${date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

export default function BusTrackingScreen() {
  const { school } = useAuth();
  const [routes, setRoutes] = useState<TransportRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const map = useRef<MapView>(null);
  const schoolLocation = coordinate(
    school?.location?.lat,
    school?.location?.lng,
  );
  const initialCenter = schoolLocation || DEFAULT_CENTER;

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    setError("");
    try {
      const response = await api.transport.list();
      setRoutes(response.data || []);
      setSelectedId((current) => {
        const stillExists = response.data?.some(
          (route) => (route._id || route.routeNo) === current,
        );
        return stillExists
          ? current
          : response.data?.[0]?._id || response.data?.[0]?.routeNo || null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load bus routes.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(true), 10_000);
    return () => clearInterval(timer);
  }, [load]);

  const buses = useMemo(
    () =>
      routes
        .map((route) => ({
          route,
          id: route._id || route.routeNo || routeName(route),
          position: routePosition(route),
        }))
        .filter(
          (bus): bus is typeof bus & { position: NonNullable<typeof bus.position> } =>
            bus.position !== null,
        ),
    [routes],
  );
  const selectedRoute = routes.find(
    (route) => (route._id || route.routeNo) === selectedId,
  );
  const liveCount = buses.length;
  const studentCount = routes.reduce(
    (total, route) => total + (route.assignedStudents?.length || 0),
    0,
  );

  const focusRoute = (route: TransportRoute) => {
    const id = route._id || route.routeNo || routeName(route);
    setSelectedId(id);
    const position = routePosition(route);
    if (position) {
      map.current?.animateToRegion(
        { ...position, latitudeDelta: 0.025, longitudeDelta: 0.025 },
        450,
      );
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.amberDark} size="large" />
        <Text style={styles.muted}>Loading bus routes…</Text>
      </View>
    );
  }

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
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>TRANSPORT</Text>
          <Text style={styles.title}>Bus Tracking</Text>
          <Text style={styles.subtitle}>
            Route, vehicle, driver and latest available GPS information.
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => void load(true)}
          disabled={refreshing}
          style={({ pressed }) => [styles.refreshButton, pressed && styles.pressed]}
        >
          <Text style={styles.refreshText}>{refreshing ? "Loading…" : "Refresh"}</Text>
        </Pressable>
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={() => void load(true)} style={styles.retryButton}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.stats}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{liveCount} / {routes.length}</Text>
          <Text style={styles.statLabel}>Buses reporting GPS</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{studentCount}</Text>
          <Text style={styles.statLabel}>Assigned students</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Live map</Text>
        <View style={styles.mapFrame}>
          <MapView
            ref={map}
            style={StyleSheet.absoluteFill}
            provider={PROVIDER_DEFAULT}
            initialRegion={{
              ...initialCenter,
              latitudeDelta: 0.08,
              longitudeDelta: 0.08,
            }}
          >
            {schoolLocation ? (
              <Marker coordinate={schoolLocation} title={school?.name || "School"} pinColor={colors.ink} />
            ) : null}
            {buses.map(({ route, id, position }) => (
              <Marker
                key={id}
                coordinate={position}
                title={routeName(route)}
                description={`${route.vehicleNo || "Vehicle not assigned"} · ${route.driverName || "Driver not assigned"}`}
                pinColor={selectedId === id ? colors.amberDark : "#3F8F5F"}
                onPress={() => setSelectedId(id)}
              />
            ))}
          </MapView>
          {!buses.length ? (
            <View pointerEvents="none" style={styles.mapNotice}>
              <Text style={styles.mapNoticeText}>
                No bus GPS positions are available yet.
              </Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.mapCaption}>
          Positions reflect the latest GPS updates received from buses.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>All routes ({routes.length})</Text>
        {!routes.length ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No transport routes found</Text>
            <Text style={styles.muted}>
              Routes will appear here after they are configured for the school.
            </Text>
          </View>
        ) : (
          routes.map((route) => {
            const id = route._id || route.routeNo || routeName(route);
            const position = routePosition(route);
            const stops = (route.stops || []).map(stopName).filter(Boolean);
            const active = selectedId === id;
            return (
              <Pressable
                key={id}
                onPress={() => focusRoute(route)}
                style={[styles.routeCard, active && styles.routeCardActive]}
              >
                <View style={styles.routeTop}>
                  <View style={styles.routeHeading}>
                    <Text style={styles.routeName}>Route {routeName(route)}</Text>
                    <Text style={[styles.status, position ? styles.statusLive : styles.statusNoGps]}>
                      {position ? "Live GPS" : "No GPS signal"}
                    </Text>
                  </View>
                  <Text style={styles.vehicle}>{route.vehicleNo || "No vehicle"}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Driver</Text>
                  <Text style={styles.detailValue}>{route.driverName || "Not assigned"}</Text>
                </View>
                {route.driverContact ? (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Contact</Text>
                    <Text style={styles.detailValue}>{route.driverContact}</Text>
                  </View>
                ) : null}
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Students</Text>
                  <Text style={styles.detailValue}>
                    {route.assignedStudents?.length || 0} assigned
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Stops</Text>
                  <Text style={styles.detailValue} numberOfLines={2}>
                    {stops.length ? stops.join("  →  ") : "No stops configured"}
                  </Text>
                </View>
                <Text style={styles.updated}>
                  {lastUpdated(route.currentLocation?.updatedAt)}
                </Text>
              </Pressable>
            );
          })
        )}
      </View>
      {selectedRoute ? <View style={styles.bottomSpace} /> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 16, paddingBottom: 32, gap: 18 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: colors.paper,
  },
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  headerCopy: { flex: 1, gap: 3 },
  eyebrow: { color: colors.amberDark, fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  title: { color: colors.ink, fontSize: 23, fontWeight: "800" },
  subtitle: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  refreshButton: {
    backgroundColor: "#fff",
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  refreshText: { color: colors.ink, fontWeight: "700", fontSize: 12 },
  pressed: { opacity: 0.7 },
  errorBox: {
    backgroundColor: "#FFF1F0",
    borderColor: "#F2C6C2",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  errorText: { color: "#8E3028", fontSize: 12, lineHeight: 17 },
  retryButton: { alignSelf: "flex-start", paddingVertical: 4 },
  retryText: { color: "#8E3028", fontWeight: "800", fontSize: 12 },
  stats: { flexDirection: "row", gap: 10 },
  statCard: {
    flex: 1,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 14,
    gap: 4,
  },
  statValue: { color: colors.ink, fontSize: 20, fontWeight: "800" },
  statLabel: { color: colors.muted, fontSize: 11 },
  section: { gap: 10 },
  sectionTitle: { color: colors.ink, fontSize: 16, fontWeight: "800" },
  mapFrame: {
    height: 280,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#E8EDF0",
    borderWidth: 1,
    borderColor: colors.border,
  },
  mapNotice: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    alignItems: "center",
    backgroundColor: "#FFFFFFE8",
    borderRadius: 10,
    padding: 9,
  },
  mapNoticeText: { color: colors.muted, fontSize: 11, fontWeight: "600" },
  mapCaption: { color: colors.muted, fontSize: 11, lineHeight: 16 },
  emptyCard: {
    padding: 18,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    gap: 5,
  },
  emptyTitle: { color: colors.ink, fontSize: 14, fontWeight: "700" },
  muted: { color: colors.muted, fontSize: 12 },
  routeCard: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 14,
    gap: 10,
  },
  routeCardActive: { borderColor: colors.amberDark },
  routeTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 },
  routeHeading: { flex: 1, gap: 5 },
  routeName: { color: colors.ink, fontSize: 15, fontWeight: "800" },
  status: { alignSelf: "flex-start", fontSize: 10, fontWeight: "800" },
  statusLive: { color: "#287347" },
  statusNoGps: { color: colors.muted },
  vehicle: { color: colors.ink, fontSize: 11, fontWeight: "700" },
  detailRow: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  detailLabel: { color: colors.muted, fontSize: 11, width: 66 },
  detailValue: { flex: 1, color: colors.ink, fontSize: 11, fontWeight: "600", textAlign: "right" },
  updated: { color: colors.muted, fontSize: 10, paddingTop: 2 },
  bottomSpace: { height: 4 },
});
