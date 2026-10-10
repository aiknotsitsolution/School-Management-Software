import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  ActivityIndicator,
  AppState,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import MapView, { Marker, PROVIDER_DEFAULT } from "react-native-maps";
import { api } from "../lib/api";
import { Card } from "../components/UI";
import { useAuth } from "../context/AuthContext";
import type { TransportRoute, TransportStop } from "../types";
import { colors } from "../theme";

const DEFAULT_CENTER = { latitude: 20.5937, longitude: 78.9629 };
const REFRESH_INTERVAL_MS = 30_000;
const STATUS_FILTERS = ["All", "Live GPS", "No GPS signal"] as const;

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

function timeAgo(value?: string | number) {
  if (!value) return "—";
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "—";
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatPing(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function BusTrackingScreen() {
  const { school, can } = useAuth();
  const canSync = can("transport:update");
  const [routes, setRoutes] = useState<TransportRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<(typeof STATUS_FILTERS)[number]>("All");
  const [providers, setProviders] = useState<{
    traccar?: { enabled?: boolean; configured?: boolean };
  } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const map = useRef<MapView>(null);
  const schoolLocation = coordinate(
    school?.location?.lat,
    school?.location?.lng,
  );
  const initialCenter = schoolLocation || DEFAULT_CENTER;

  const load = useCallback(async (isRefresh = false, silent = false) => {
    if (isRefresh && !silent) setRefreshing(true);
    if (!silent) setError("");
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
      if (!silent) {
        setError(err instanceof Error ? err.message : "Could not load bus routes.");
      }
    } finally {
      setLoading(false);
      if (!silent) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    let active = AppState.currentState === "active";
    const appStateSubscription = AppState.addEventListener("change", (state) => {
      active = state === "active";
      if (active) void load(true, true);
    });
    const timer = setInterval(() => {
      if (active) void load(true, true);
    }, REFRESH_INTERVAL_MS);
    return () => {
      clearInterval(timer);
      appStateSubscription.remove();
    };
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    void api.transport.trackingStatus()
      .then((response) => {
        if (!cancelled) setProviders(response.data?.providers || null);
      })
      .catch(() => {
        if (!cancelled) setProviders(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
  const newestPing = routes
    .map((route) => route.currentLocation?.updatedAt)
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value).getTime())
    .filter(Number.isFinite)
    .sort((a, b) => b - a)[0];
  const filteredRoutes = useMemo(() => {
    const search = query.trim().toLocaleLowerCase();
    return routes.filter((route) => {
      const position = routePosition(route);
      const status = position ? "Live GPS" : "No GPS signal";
      const matchesStatus = statusFilter === "All" || status === statusFilter;
      const stops = (route.stops || []).map(stopName).join(" ");
      const matchesSearch =
        !search ||
        (route.routeNo || "").toLocaleLowerCase().includes(search) ||
        (route.vehicleNo || "").toLocaleLowerCase().includes(search) ||
        (route.driverName || "").toLocaleLowerCase().includes(search) ||
        stops.toLocaleLowerCase().includes(search);
      return matchesStatus && matchesSearch;
    });
  }, [routes, query, statusFilter]);
  const providerState = providers?.traccar
    ? providers.traccar.enabled && providers.traccar.configured
      ? { label: "GPS provider connected", tone: styles.providerReady }
      : providers.traccar.enabled
        ? { label: "Provider enabled, not configured · manual positions only", tone: styles.providerWarning }
        : { label: "No GPS provider configured · manual positions only", tone: styles.providerNeutral }
    : null;
  const selectedPosition = selectedRoute ? routePosition(selectedRoute) : null;
  const stopsForMap = selectedRoute?.stops || [];
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

  const syncSelected = async () => {
    if (!canSync || !selectedRoute?._id || syncing) return;
    setSyncing(true);
    try {
      await api.transport.sync(selectedRoute._id);
      await load(true);
    } catch (err) {
      Alert.alert(
        "Could not sync GPS",
        err instanceof Error ? err.message : "Could not sync with the GPS provider.",
      );
    } finally {
      setSyncing(false);
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

      {providerState ? (
        <View style={[styles.providerBanner, providerState.tone]}>
          <Ionicons
            name={providerState.tone === styles.providerReady ? "checkmark-circle" : "information-circle"}
            size={16}
            color={providerState.tone === styles.providerReady ? "#287347" : colors.muted}
          />
          <Text style={styles.providerText}>{providerState.label}</Text>
        </View>
      ) : null}

      <View style={styles.stats}>
        <MetricCard value={`${liveCount} / ${routes.length}`} label="Routes with GPS" icon="bus" />
        <MetricCard value={String(studentCount)} label="Students assigned" icon="people" />
        <MetricCard value={String(liveCount)} label="Reporting GPS" icon="navigate" />
        <MetricCard value={timeAgo(newestPing)} label="Last ping" icon="time" />
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>Live fleet map</Text>
          <Text style={styles.liveCount}>{liveCount} reporting</Text>
        </View>
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
            {stopsForMap.map((stop, index) => {
              if (typeof stop === "string") return null;
              const stopCoordinate = coordinate(stop.lat, stop.lng);
              if (!stopCoordinate) return null;
              return (
                <Marker
                  key={`${selectedId}-stop-${index}`}
                  coordinate={stopCoordinate}
                  title={stopName(stop)}
                  description={stop.time ? `Scheduled ${stop.time}` : `Stop ${index + 1}`}
                  pinColor="#16213E"
                />
              );
            })}
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
          Bus markers show last reported positions. Tap a bus marker or route card to select a route.
        </Text>
      </View>

      {selectedRoute ? (
        <Card style={styles.detailCard}>
          <View style={styles.detailHeader}>
            <View style={styles.busIcon}>
              <Ionicons name="bus" size={20} color={colors.amberDark} />
            </View>
            <View style={styles.detailTitleWrap}>
              <Text style={styles.sectionTitle}>Route {routeName(selectedRoute)}</Text>
              <Text style={styles.detailSubtitle}>
                {selectedRoute.vehicleNo || "Vehicle not assigned"}
              </Text>
            </View>
            {selectedRoute.currentLocation ? (
              <View style={[
                styles.gpsBadge,
                selectedRoute.live?.stale ? styles.gpsStale : styles.gpsLive,
              ]}>
                <Text style={[
                  styles.gpsBadgeText,
                  selectedRoute.live?.stale ? styles.gpsStaleText : styles.gpsLiveText,
                ]}>
                  {selectedRoute.live?.stale ? "Stale GPS" : "Live GPS"}
                </Text>
              </View>
            ) : (
              <View style={[styles.gpsBadge, styles.gpsStale]}>
                <Text style={[styles.gpsBadgeText, styles.gpsStaleText]}>No GPS</Text>
              </View>
            )}
          </View>
          <View style={styles.routeMetrics}>
            <SmallMetric label="Students" value={String(selectedRoute.assignedStudents?.length || 0)} icon="people-outline" />
            <SmallMetric label="Stops" value={String(selectedRoute.stops?.length || 0)} icon="location-outline" />
            <SmallMetric label="Vehicle" value={selectedRoute.vehicleNo || "—"} icon="bus-outline" />
          </View>
          <View style={styles.routeInfoBox}>
            <InfoRow icon="person-outline" label="Driver" value={selectedRoute.driverName || "Not assigned"} />
            {selectedRoute.driverContact ? (
              <Pressable
                style={styles.driverCall}
                onPress={() => {
                  const phone = selectedRoute.driverContact?.replace(/[^\d+]/g, "");
                  if (phone) {
                    void Linking.openURL(`tel:${phone}`).catch(() =>
                      Alert.alert("Unable to call", "This device cannot open the phone dialer."),
                    );
                  }
                }}
                accessibilityRole="button"
                accessibilityLabel={`Call driver ${selectedRoute.driverName || ""}`}
              >
                <Ionicons name="call" size={14} color="#287347" />
                <Text style={styles.driverCallText}>{selectedRoute.driverContact}</Text>
              </Pressable>
            ) : null}
            <InfoRow
              icon="location-outline"
              label="Next stop"
              value={selectedRoute.live?.nextStop || "No next stop available"}
            />
            <View style={styles.progressMetrics}>
              <SmallMetric
                label="Distance"
                value={selectedRoute.live?.distanceKm != null ? `${selectedRoute.live.distanceKm} km` : "—"}
                icon="navigate-outline"
              />
              <SmallMetric
                label="ETA"
                value={selectedRoute.live?.etaMinutes != null ? `${selectedRoute.live.etaMinutes} min` : "—"}
                icon="time-outline"
              />
              <SmallMetric
                label="Stops left"
                value={selectedRoute.live?.stopsRemaining != null ? String(selectedRoute.live.stopsRemaining) : "—"}
                icon="git-branch-outline"
              />
            </View>
            <InfoRow
              icon="map-outline"
              label="Coordinates"
              value={selectedPosition
                ? `${selectedPosition.latitude.toFixed(5)}, ${selectedPosition.longitude.toFixed(5)}`
                : "No GPS fix"}
            />
            <InfoRow
              icon="time-outline"
              label="Last reported"
              value={formatPing(selectedRoute.currentLocation?.updatedAt)}
            />
            <InfoRow
              icon="speedometer-outline"
              label="Position source"
              value={`${selectedRoute.currentLocation?.source === "traccar"
                ? `GPS device${selectedRoute.tracking?.deviceName ? ` · ${selectedRoute.tracking.deviceName}` : ""}`
                : selectedRoute.currentLocation?.source === "manual"
                  ? "Entered manually by an operator"
                  : "Source unknown"}${(selectedRoute.live?.speedKmh ?? selectedRoute.currentLocation?.speedKmh ?? 0) > 0
                    ? ` · ${selectedRoute.live?.speedKmh ?? selectedRoute.currentLocation?.speedKmh} km/h`
                    : ""}`}
            />
            {selectedRoute.routePlan?.totalKm != null ? (
              <InfoRow
                icon="trail-sign-outline"
                label="Full route"
                value={`${selectedRoute.routePlan.totalKm} km${selectedRoute.routePlan.totalMinutes ? ` · ${selectedRoute.routePlan.totalMinutes} min` : ""}`}
              />
            ) : null}
          </View>
          {selectedRoute.tracking?.deviceId && canSync ? (
            <Pressable
              onPress={() => void syncSelected()}
              disabled={syncing}
              style={styles.syncButton}
            >
              {syncing ? (
                <ActivityIndicator size="small" color={colors.ink} />
              ) : (
                <Ionicons name="sync" size={16} color={colors.ink} />
              )}
              <Text style={styles.syncButtonText}>
                {syncing ? "Syncing GPS..." : "Sync GPS now"}
              </Text>
            </Pressable>
          ) : selectedRoute.tracking?.deviceId ? (
            <Text style={styles.syncHint}>GPS device is connected. Automatic updates refresh every 30 seconds.</Text>
          ) : (
            <Text style={styles.syncHint}>
              {selectedRoute.live?.nextStop
                ? `Heading to ${selectedRoute.live.nextStop}.`
                : "Add stops with coordinates to calculate route distance and ETA."}
            </Text>
          )}
          <View style={styles.officeContact}>
            <View style={styles.officeIcon}>
              <Ionicons name="headset-outline" size={15} color={colors.muted} />
            </View>
            <View style={styles.officeCopy}>
              <Text style={styles.officeLabel}>School office</Text>
              <Text style={styles.officeName}>{school?.name || "School contact"}</Text>
            </View>
            {school?.phone ? (
              <Pressable
                style={styles.officeCall}
                onPress={() => {
                  void Linking.openURL(`tel:${school.phone?.replace(/[^\d+]/g, "")}`).catch(() =>
                    Alert.alert("Unable to call", "This device cannot open the phone dialer."),
                  );
                }}
                accessibilityRole="button"
                accessibilityLabel="Call school office"
              >
                <Ionicons name="call" size={13} color="#287347" />
                <Text style={styles.officeCallText}>Call office</Text>
              </Pressable>
            ) : (
              <Text style={styles.muted}>No number</Text>
            )}
          </View>
        </Card>
      ) : null}

      <View style={styles.section}>
        <View style={styles.sectionHeading}>
          <View>
            <Text style={styles.sectionTitle}>All routes ({routes.length})</Text>
            <Text style={styles.mapCaption}>{filteredRoutes.length} routes match your filters</Text>
          </View>
          <Pressable
            onPress={() => void load(true)}
            disabled={refreshing}
            style={styles.refreshButton}
            accessibilityRole="button"
            accessibilityLabel="Refresh bus routes"
          >
            {refreshing ? (
              <ActivityIndicator size="small" color={colors.ink} />
            ) : (
              <Ionicons name="refresh" size={17} color={colors.ink} />
            )}
          </Pressable>
        </View>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={16} color={colors.muted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search route, vehicle, driver or stop"
            placeholderTextColor="#98A2B3"
            style={styles.searchInput}
            autoCorrect={false}
          />
          {!!query && (
            <Pressable onPress={() => setQuery("")} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color={colors.muted} />
            </Pressable>
          )}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {STATUS_FILTERS.map((filter) => (
            <Pressable
              key={filter}
              onPress={() => setStatusFilter(filter)}
              style={[styles.filterChip, statusFilter === filter && styles.filterChipActive]}
            >
              <Text style={[styles.filterText, statusFilter === filter && styles.filterTextActive]}>
                {filter === "All" ? "All status" : filter}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
        {!routes.length ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No transport routes found</Text>
            <Text style={styles.muted}>
              Routes will appear here after they are configured for the school.
            </Text>
          </View>
        ) : !filteredRoutes.length ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No routes match these filters</Text>
            <Text style={styles.muted}>Try another search or GPS status filter.</Text>
          </View>
        ) : (
          filteredRoutes.map((route) => {
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

function MetricCard({
  value,
  label,
  icon,
}: {
  value: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View style={styles.statCard}>
      <Ionicons name={icon} size={15} color={colors.amberDark} />
      <Text style={styles.statValue} numberOfLines={1}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function SmallMetric({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View style={styles.smallMetric}>
      <Text style={styles.smallMetricLabel}>
        <Ionicons name={icon} size={11} color={colors.muted} /> {label}
      </Text>
      <Text style={styles.smallMetricValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={14} color={colors.muted} />
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={2}>{value}</Text>
    </View>
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
  providerBanner: { flexDirection: "row", alignItems: "center", gap: 7, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 9 },
  providerReady: { backgroundColor: "#E8F7EF" },
  providerWarning: { backgroundColor: "#FFF4DF" },
  providerNeutral: { backgroundColor: "#F0F2F5" },
  providerText: { flex: 1, color: colors.muted, fontSize: 10, fontWeight: "700" },
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
  stats: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  statCard: {
    width: "48%",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 14,
    gap: 4,
  },
  statValue: { color: colors.ink, fontSize: 18, fontWeight: "800" },
  statLabel: { color: colors.muted, fontSize: 9 },
  section: { gap: 10 },
  sectionTitle: { color: colors.ink, fontSize: 16, fontWeight: "800" },
  sectionHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  liveCount: { color: "#287347", backgroundColor: "#E8F7EF", overflow: "hidden", borderRadius: 9, paddingHorizontal: 8, paddingVertical: 5, fontSize: 9, fontWeight: "800" },
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
  detailCard: { gap: 12, padding: 14 },
  detailHeader: { flexDirection: "row", alignItems: "center", gap: 9 },
  busIcon: { width: 39, height: 39, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#FFF4DF" },
  detailTitleWrap: { flex: 1, gap: 3 },
  detailSubtitle: { color: colors.muted, fontSize: 10 },
  gpsBadge: { borderRadius: 9, paddingHorizontal: 8, paddingVertical: 5 },
  gpsLive: { backgroundColor: "#E8F7EF" },
  gpsStale: { backgroundColor: "#F0F2F5" },
  gpsBadgeText: { fontSize: 8, fontWeight: "800" },
  gpsLiveText: { color: "#287347" },
  gpsStaleText: { color: colors.muted },
  routeMetrics: { flexDirection: "row", gap: 7 },
  smallMetric: { flex: 1, minWidth: 0, borderRadius: 9, backgroundColor: colors.paper, padding: 8, gap: 4 },
  smallMetricLabel: { color: colors.muted, fontSize: 8 },
  smallMetricValue: { color: colors.ink, fontSize: 10, fontWeight: "800" },
  routeInfoBox: { backgroundColor: colors.paper, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9, gap: 9 },
  infoRow: { flexDirection: "row", alignItems: "flex-start", gap: 7 },
  infoLabel: { width: 76, color: colors.muted, fontSize: 9 },
  infoValue: { flex: 1, color: colors.ink, fontSize: 9, fontWeight: "600", textAlign: "right" },
  progressMetrics: { flexDirection: "row", gap: 6 },
  driverCall: { flexDirection: "row", alignSelf: "flex-end", alignItems: "center", gap: 5, paddingVertical: 3 },
  driverCallText: { color: "#287347", fontSize: 10, fontWeight: "700" },
  syncButton: { minHeight: 39, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 7, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: "#fff" },
  syncButtonText: { color: colors.ink, fontSize: 10, fontWeight: "800" },
  syncHint: { color: colors.muted, fontSize: 9, lineHeight: 14 },
  officeContact: { flexDirection: "row", alignItems: "center", gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingTop: 10 },
  officeIcon: { width: 30, height: 30, borderRadius: 9, backgroundColor: "#F0F2F5", alignItems: "center", justifyContent: "center" },
  officeCopy: { flex: 1, gap: 2 },
  officeLabel: { color: colors.muted, fontSize: 8 },
  officeName: { color: colors.ink, fontSize: 10, fontWeight: "700" },
  officeCall: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8, backgroundColor: "#E8F7EF" },
  officeCallText: { color: "#287347", fontSize: 9, fontWeight: "800" },
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
  searchBox: { minHeight: 41, flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: "#fff", paddingHorizontal: 10 },
  searchInput: { flex: 1, color: colors.ink, fontSize: 10, paddingVertical: 8 },
  filterRow: { flexDirection: "row", gap: 7 },
  filterChip: { borderWidth: 1, borderColor: colors.border, backgroundColor: "#fff", borderRadius: 9, paddingHorizontal: 9, paddingVertical: 6 },
  filterChipActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  filterText: { color: colors.muted, fontSize: 9, fontWeight: "700" },
  filterTextActive: { color: "#fff" },
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
