import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
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
import * as Location from "expo-location";
import MapView, { Marker, type MapPressEvent } from "react-native-maps";
import { Button, Card, Input } from "../components/UI";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import type { TransportRoute, TransportStop } from "../types";
import { colors } from "../theme";

type DraftStop = {
  name: string;
  lat: number | null;
  lng: number | null;
  time: string;
};
type PlaceResult = {
  id?: string;
  label?: string;
  name?: string;
  lat: number;
  lng: number;
};
type PlanPreview = {
  totalKm?: number | null;
  totalMinutes?: number | null;
  legs?: {
    fromStop?: string;
    toStop?: string;
    km?: number | null;
    minutes?: number | null;
  }[];
};
type Device = { id: string; name?: string };
type RouteForm = {
  routeNo: string;
  vehicleNo: string;
  driverName: string;
  driverContact: string;
};

const EMPTY_FORM: RouteForm = {
  routeNo: "",
  vehicleNo: "",
  driverName: "",
  driverContact: "",
};
const DEFAULT_REGION = {
  latitude: 20.5937,
  longitude: 78.9629,
  latitudeDelta: 15,
  longitudeDelta: 15,
};

function stopCoordinates(stop: TransportStop | string): DraftStop {
  if (typeof stop === "string") {
    return { name: stop, lat: null, lng: null, time: "" };
  }
  const lat = Number(stop.lat);
  const lng = Number(stop.lng);
  return {
    name: stop.name || "",
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
    time: stop.time || "",
  };
}

function isRoutable(
  stop: DraftStop,
): stop is DraftStop & { lat: number; lng: number } {
  return (
    stop.lat !== null &&
    stop.lng !== null &&
    Number.isFinite(stop.lat) &&
    Number.isFinite(stop.lng) &&
    stop.lat >= -90 &&
    stop.lat <= 90 &&
    stop.lng >= -180 &&
    stop.lng <= 180
  );
}

function Metric({ label, value, icon }: { label: string; value: number; icon: keyof typeof Ionicons.glyphMap }) {
  return (
    <View style={styles.metric}>
      <Ionicons name={icon} size={17} color={colors.amberDark} />
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  keyboardType?: "default" | "numeric" | "phone-pad";
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Input
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        keyboardType={keyboardType}
        autoCapitalize={keyboardType === "phone-pad" ? "none" : "sentences"}
      />
    </View>
  );
}

export default function BusRoutesScreen() {
  const { can, school } = useAuth();
  const canUpdate = can("transport:update");
  const [routes, setRoutes] = useState<TransportRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [providers, setProviders] = useState<{
    traccar?: { enabled?: boolean; configured?: boolean };
  } | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [devicesError, setDevicesError] = useState("");
  const [editorVisible, setEditorVisible] = useState(false);
  const [editing, setEditing] = useState<TransportRoute | null>(null);
  const [form, setForm] = useState<RouteForm>(EMPTY_FORM);
  const [stops, setStops] = useState<DraftStop[]>([]);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [placeResults, setPlaceResults] = useState<PlaceResult[]>([]);
  const [placeLoading, setPlaceLoading] = useState(false);
  const [placeError, setPlaceError] = useState("");
  const [attribution, setAttribution] = useState("");
  const [plan, setPlan] = useState<PlanPreview | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [pinLoading, setPinLoading] = useState(false);
  const [deviceRoute, setDeviceRoute] = useState<TransportRoute | null>(null);
  const [binding, setBinding] = useState(false);
  const [locationRoute, setLocationRoute] = useState<TransportRoute | null>(
    null,
  );
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [locationSaving, setLocationSaving] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const response = await api.transport.list();
      setRoutes(response.data || []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not load bus routes.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    let cancelled = false;
    void api.transport
      .trackingStatus()
      .then(({ data }) => {
        if (!cancelled) setProviders(data?.providers || null);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setProviders(null);
          setDevicesError(
            err instanceof Error
              ? err.message
              : "Could not check GPS provider status.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const gpsUsable = Boolean(
    providers?.traccar?.enabled && providers?.traccar?.configured,
  );
  useEffect(() => {
    if (!gpsUsable) {
      setDevices([]);
      return;
    }
    let cancelled = false;
    setDevicesLoading(true);
    setDevicesError("");
    void api.transport
      .devices()
      .then(({ data }) => {
        if (!cancelled) setDevices(data?.devices || []);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setDevicesError(
            err instanceof Error ? err.message : "Could not load GPS devices.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setDevicesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [gpsUsable]);

  useEffect(() => {
    const search = query.trim();
    if (search.length < 3 || !editorVisible) {
      setPlaceResults([]);
      setPlaceError("");
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      setPlaceLoading(true);
      setPlaceError("");
      void api.transport
        .searchPlaces(search)
        .then(({ data }) => {
          if (cancelled) return;
          setPlaceResults(data?.results || []);
          setAttribution(data?.attribution || "");
        })
        .catch((err: unknown) => {
          if (!cancelled) {
            setPlaceResults([]);
            setPlaceError(
              err instanceof Error ? err.message : "Place search failed.",
            );
          }
        })
        .finally(() => {
          if (!cancelled) setPlaceLoading(false);
        });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, editorVisible]);

  useEffect(() => {
    if (!editorVisible || stops.filter(isRoutable).length < 2) {
      setPlan(null);
      setPlanLoading(false);
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      setPlanLoading(true);
      void api.transport
        .previewPlan(
          editing?._id || null,
          stops
            .filter(isRoutable)
            .map(({ name, lat, lng, time }) => ({ name, lat, lng, time })),
        )
        .then(({ data }) => {
          if (!cancelled) setPlan(data || null);
        })
        .catch(() => {
          if (!cancelled) setPlan(null);
        })
        .finally(() => {
          if (!cancelled) setPlanLoading(false);
        });
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [editing, editorVisible, stops]);

  const boundDeviceIds = useMemo(
    () =>
      routes
        .map((route) => route.tracking?.deviceId)
        .filter((id): id is string => Boolean(id)),
    [routes],
  );
  const availableDevices = devices.filter(
    (device) =>
      !boundDeviceIds.includes(device.id) ||
      device.id === deviceRoute?.tracking?.deviceId,
  );
  const stats = useMemo(
    () => ({
      routeCount: routes.length,
      stopCount: routes.reduce(
        (total, route) => total + (route.stops?.length || 0),
        0,
      ),
      driverCount: routes.filter((route) => route.driverName).length,
      studentCount: routes.reduce(
        (total, route) => total + (route.assignedStudents?.length || 0),
        0,
      ),
      trackedCount: routes.filter((route) => route.tracking?.deviceId).length,
    }),
    [routes],
  );

  const openEditor = (route?: TransportRoute) => {
    setEditing(route || null);
    setForm(
      route
        ? {
            routeNo: route.routeNo || "",
            vehicleNo: route.vehicleNo || "",
            driverName: route.driverName || "",
            driverContact: route.driverContact || "",
          }
        : EMPTY_FORM,
    );
    setStops((route?.stops || []).map(stopCoordinates));
    setPlan(null);
    setQuery("");
    setPlaceResults([]);
    setPlaceError("");
    setEditorVisible(true);
  };

  const closeEditor = () => {
    setEditorVisible(false);
    setEditing(null);
    setStops([]);
    setQuery("");
    setPlaceResults([]);
    setPlan(null);
  };

  const addPlace = (place: PlaceResult) => {
    setStops((current) => [
      ...current,
      {
        name: place.name || place.label || "Unnamed stop",
        lat: Number(place.lat),
        lng: Number(place.lng),
        time: "",
      },
    ]);
    setQuery("");
    setPlaceResults([]);
  };

  const addMapPin = async ({ nativeEvent }: MapPressEvent) => {
    if (pinLoading) return;
    const { latitude: lat, longitude: lng } = nativeEvent.coordinate;
    setPinLoading(true);
    let name = `Pinned stop ${stops.length + 1}`;
    try {
      const { data } = await api.transport.reversePlace(lat, lng);
      if (data?.label || data?.name) {
        name = (data.label || data.name || name).split(",")[0] || name;
      }
    } catch (err) {
      Alert.alert(
        "Place name unavailable",
        err instanceof Error
          ? `${err.message} The stop was added with coordinates only.`
          : "The stop was added with coordinates only.",
      );
    } finally {
      setPinLoading(false);
      setStops((current) => [...current, { name, lat, lng, time: "" }]);
    }
  };

  const saveRoute = async () => {
    if (!form.routeNo.trim()) {
      Alert.alert("Route number required", "Enter a route number to continue.");
      return;
    }
    if (stops.length < 2) {
      Alert.alert("Add stops", "A route needs at least two stops.");
      return;
    }
    const withoutCoordinates = stops.filter((stop) => !isRoutable(stop)).length;
    if (withoutCoordinates) {
      Alert.alert(
        "Coordinates required",
        `${withoutCoordinates} stop(s) need coordinates. Add them by searching for a place or tapping the map.`,
      );
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        routeNo: form.routeNo.trim(),
        vehicleNo: form.vehicleNo.trim(),
        driverName: form.driverName.trim(),
        driverContact: form.driverContact.trim(),
        stops: stops
          .filter(isRoutable)
          .map(({ name, lat, lng, time }) => ({ name, lat, lng, time })),
      };
      if (editing) await api.transport.update(editing._id, payload);
      else await api.transport.create(payload);
      closeEditor();
      await load();
      Alert.alert("Saved", editing ? "Route updated." : "Route created.");
    } catch (err) {
      Alert.alert(
        "Could not save route",
        err instanceof Error ? err.message : "Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const moveStop = (index: number, offset: number) => {
    setStops((current) => {
      const nextIndex = index + offset;
      if (nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  };

  const bindDevice = async (device: Device) => {
    if (!deviceRoute) return;
    setBinding(true);
    try {
      await api.transport.bindDevice(deviceRoute._id, device.id);
      setDeviceRoute(null);
      await load(true);
      Alert.alert(
        "GPS device connected",
        `${device.name || device.id} is now linked to Route ${deviceRoute.routeNo || ""}.`,
      );
    } catch (err) {
      Alert.alert(
        "Could not connect GPS device",
        err instanceof Error ? err.message : "Please try again.",
      );
    } finally {
      setBinding(false);
    }
  };

  const unbindDevice = (route: TransportRoute) => {
    Alert.alert(
      "Remove GPS device?",
      `Disconnect the GPS device from Route ${route.routeNo || ""}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Disconnect",
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                await api.transport.unbindDevice(route._id);
                await load(true);
              } catch (err) {
                Alert.alert(
                  "Could not disconnect device",
                  err instanceof Error ? err.message : "Please try again.",
                );
              }
            })();
          },
        },
      ],
    );
  };

  const openLocation = (route: TransportRoute) => {
    setLocationRoute(route);
    setLatitude(String(route.currentLocation?.lat ?? ""));
    setLongitude(String(route.currentLocation?.lng ?? ""));
  };

  const useCurrentLocation = async () => {
    setLocationLoading(true);
    try {
      if (!(await Location.hasServicesEnabledAsync())) {
        Alert.alert(
          "Location is turned off",
          "Turn on device location services, then try again.",
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Open settings",
              onPress: () => {
                void Linking.openSettings().catch(() =>
                  Alert.alert("Could not open settings", "Turn on location in your device settings."),
                );
              },
            },
          ],
        );
        return;
      }
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        Alert.alert(
          "Location permission needed",
          "Allow location access while using the app to fill in the bus's current coordinates.",
          permission.canAskAgain
            ? [{ text: "OK" }]
            : [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Open settings",
                  onPress: () => {
                    void Linking.openSettings().catch(() =>
                      Alert.alert("Could not open settings", "Enable location permission in your device settings."),
                    );
                  },
                },
              ],
        );
        return;
      }
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      setLatitude(String(position.coords.latitude));
      setLongitude(String(position.coords.longitude));
    } catch (err) {
      Alert.alert(
        "Could not get current location",
        err instanceof Error ? err.message : "Check location services and try again.",
      );
    } finally {
      setLocationLoading(false);
    }
  };

  const saveLocation = async () => {
    const lat = Number(latitude.trim());
    const lng = Number(longitude.trim());
    if (
      !latitude.trim() ||
      !longitude.trim() ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    ) {
      Alert.alert(
        "Invalid coordinates",
        "Enter a latitude from -90 to 90 and longitude from -180 to 180.",
      );
      return;
    }
    if (!locationRoute) return;
    setLocationSaving(true);
    try {
      await api.transport.updateLocation(locationRoute._id, { lat, lng });
      setLocationRoute(null);
      await load(true);
      Alert.alert("Location updated", "The bus position has been saved.");
    } catch (err) {
      Alert.alert(
        "Could not update location",
        err instanceof Error ? err.message : "Please try again.",
      );
    } finally {
      setLocationSaving(false);
    }
  };

  const schoolCoordinate =
    school?.location?.lat != null && school.location.lng != null
      ? {
          latitude: Number(school.location.lat),
          longitude: Number(school.location.lng),
        }
      : null;
  const initialRegion = schoolCoordinate
    ? { ...schoolCoordinate, latitudeDelta: 0.12, longitudeDelta: 0.12 }
    : DEFAULT_REGION;

  return (
    <>
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
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>TRANSPORT WORKSPACE</Text>
            <Text style={styles.title}>Bus Routes</Text>
            <Text style={styles.subtitle}>
              Plan stops, assign drivers and manage GPS tracking.
            </Text>
          </View>
          {canUpdate ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => openEditor()}
              style={styles.addButton}
            >
              <Ionicons name="add" size={19} color="#fff" />
              <Text style={styles.addButtonText}>Plan</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.metrics}>
          <Metric label="Routes" value={stats.routeCount} icon="bus-outline" />
          <Metric label="Stops" value={stats.stopCount} icon="location-outline" />
          <Metric label="Drivers" value={stats.driverCount} icon="call-outline" />
          <Metric label="Students" value={stats.studentCount} icon="people-outline" />
          <Metric label="GPS tracked" value={stats.trackedCount} icon="navigate-outline" />
        </View>

        {!gpsUsable && providers ? (
          <View style={styles.infoBanner}>
            <Ionicons
              name="information-circle-outline"
              size={18}
              color={colors.info}
            />
            <Text style={styles.infoText}>
              GPS provider is not configured. You can still update bus
              locations manually.
            </Text>
          </View>
        ) : null}
        {devicesError ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{devicesError}</Text>
          </View>
        ) : null}
        {error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable onPress={() => void load(true)}>
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>All routes ({routes.length})</Text>
          <Pressable
            onPress={() => void load(true)}
            disabled={refreshing}
            accessibilityRole="button"
            accessibilityLabel="Refresh bus routes"
          >
            <Ionicons name="refresh" size={19} color={colors.ink} />
          </Pressable>
        </View>
        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.amberDark} size="large" />
            <Text style={styles.muted}>Loading routes…</Text>
          </View>
        ) : routes.length === 0 ? (
          <Card style={styles.empty}>
            <Ionicons name="bus-outline" size={34} color={colors.muted} />
            <Text style={styles.emptyTitle}>No routes configured yet</Text>
            <Text style={styles.muted}>
              Create a route to start managing stops and bus tracking.
            </Text>
          </Card>
        ) : (
          routes.map((route) => (
            <Card key={route._id} style={styles.routeCard}>
              <View style={styles.routeTop}>
                <View style={styles.routeTitleWrap}>
                  <View style={styles.routeIcon}>
                    <Ionicons name="bus" size={18} color={colors.ink} />
                  </View>
                  <View style={styles.routeCopy}>
                    <Text style={styles.routeTitle}>
                      Route {route.routeNo || "—"}
                    </Text>
                    <Text style={styles.routeMeta}>
                      {route.vehicleNo || "No vehicle assigned"}
                    </Text>
                  </View>
                </View>
                <View
                  style={[
                    styles.statusPill,
                    route.currentLocation?.updatedAt
                      ? styles.statusLive
                      : styles.statusIdle,
                  ]}
                >
                  <Text
                    style={[
                      styles.statusText,
                      route.currentLocation?.updatedAt
                        ? styles.statusLiveText
                        : styles.statusIdleText,
                    ]}
                  >
                    {route.currentLocation?.updatedAt ? "LIVE" : "NO GPS"}
                  </Text>
                </View>
              </View>
              <View style={styles.routeInfo}>
                <RouteInfo
                  icon="person-outline"
                  label="Driver"
                  value={route.driverName || "Not assigned"}
                />
                <RouteInfo
                  icon="call-outline"
                  label="Contact"
                  value={route.driverContact || "Not provided"}
                />
                <RouteInfo
                  icon="people-outline"
                  label="Students"
                  value={String(route.assignedStudents?.length || 0)}
                />
                <RouteInfo
                  icon="navigate-outline"
                  label="Distance"
                  value={
                    route.routePlan?.totalKm != null
                      ? `${route.routePlan.totalKm} km`
                      : "—"
                  }
                />
              </View>
              <Text style={styles.stopsLabel}>
                Stops ({route.stops?.length || 0})
              </Text>
              <Text style={styles.stopsText}>
                {(route.stops || [])
                  .map((stop) =>
                    typeof stop === "string" ? stop : stop.name || "Unnamed",
                  )
                  .join("  →  ") || "No stops configured"}
              </Text>
              <View style={styles.gpsRow}>
                <Ionicons
                  name={route.tracking?.deviceId ? "link" : "unlink-outline"}
                  size={15}
                  color={colors.muted}
                />
                <Text style={styles.gpsText}>
                  {route.tracking?.deviceId
                    ? `GPS: ${route.tracking.deviceName || route.tracking.deviceId}`
                    : "GPS device not linked"}
                </Text>
              </View>
              {canUpdate ? (
                <View style={styles.actions}>
                  <SmallAction
                    icon="create-outline"
                    label="Edit route"
                    onPress={() => openEditor(route)}
                  />
                  <SmallAction
                    icon="locate-outline"
                    label="Update location"
                    onPress={() => openLocation(route)}
                  />
                  {gpsUsable ? (
                    <SmallAction
                      icon={route.tracking?.deviceId ? "unlink-outline" : "link"}
                      label={route.tracking?.deviceId ? "Unlink GPS" : "Link GPS"}
                      onPress={() =>
                        route.tracking?.deviceId
                          ? unbindDevice(route)
                          : setDeviceRoute(route)
                      }
                    />
                  ) : null}
                </View>
              ) : null}
            </Card>
          ))
        )}
      </ScrollView>

      <Modal
        visible={editorVisible}
        animationType="slide"
        onRequestClose={closeEditor}
      >
        <KeyboardAvoidingView
          style={styles.modal}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalEyebrow}>TRANSPORT WORKSPACE</Text>
              <Text style={styles.modalTitle}>
                {editing ? `Edit Route ${editing.routeNo || ""}` : "Plan a route"}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close route editor"
              onPress={closeEditor}
              hitSlop={12}
            >
              <Ionicons name="close" size={25} color={colors.ink} />
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={styles.editorContent}
            keyboardShouldPersistTaps="handled"
          >
            <Card style={styles.formCard}>
              <Field
                label="Route number *"
                value={form.routeNo}
                onChangeText={(routeNo) => setForm((prev) => ({ ...prev, routeNo }))}
                placeholder="e.g. R-01"
              />
              <Field
                label="Vehicle number"
                value={form.vehicleNo}
                onChangeText={(vehicleNo) =>
                  setForm((prev) => ({ ...prev, vehicleNo }))
                }
                placeholder="e.g. MH 01 AB 1234"
              />
              <Field
                label="Driver name"
                value={form.driverName}
                onChangeText={(driverName) =>
                  setForm((prev) => ({ ...prev, driverName }))
                }
                placeholder="Driver name"
              />
              <Field
                label="Driver contact"
                value={form.driverContact}
                onChangeText={(driverContact) =>
                  setForm((prev) => ({ ...prev, driverContact }))
                }
                placeholder="Phone number"
                keyboardType="phone-pad"
              />
            </Card>

            <Card style={styles.formCard}>
              <Text style={styles.cardTitle}>Find and add stops</Text>
              <Input
                value={query}
                onChangeText={setQuery}
                placeholder="Search places (type 3+ characters)"
                autoCorrect={false}
              />
              {placeLoading ? (
                <ActivityIndicator color={colors.amberDark} />
              ) : null}
              {placeError ? <Text style={styles.errorText}>{placeError}</Text> : null}
              {placeResults.map((place, index) => (
                <Pressable
                  key={place.id || `${place.label}-${index}`}
                  onPress={() => addPlace(place)}
                  style={styles.placeResult}
                >
                  <Ionicons name="add-circle-outline" size={18} color={colors.info} />
                  <Text style={styles.placeText}>
                    {place.label || place.name || "Unnamed place"}
                  </Text>
                </Pressable>
              ))}
              {attribution ? (
                <Text style={styles.attribution}>{attribution}</Text>
              ) : null}
              <Text style={styles.mapHint}>
                Search for a place or tap the map to add a stop.
              </Text>
              <MapView
                style={styles.editorMap}
                initialRegion={initialRegion}
                onPress={(event) => void addMapPin(event)}
              >
                {stops.filter(isRoutable).map((stop, index) => (
                  <Marker
                    key={`${index}-${stop.name}`}
                    coordinate={{
                      latitude: stop.lat,
                      longitude: stop.lng,
                    }}
                    title={`${index + 1}. ${stop.name}`}
                  />
                ))}
              </MapView>
              {pinLoading ? (
                <Text style={styles.muted}>Adding and labelling map pin…</Text>
              ) : null}
            </Card>

            <Card style={styles.formCard}>
              <View style={styles.stopsHeading}>
                <Text style={styles.cardTitle}>Stops in order</Text>
                <Text style={styles.muted}>{stops.length} total</Text>
              </View>
              {stops.length === 0 ? (
                <Text style={styles.emptyStops}>No stops yet. Add one above.</Text>
              ) : (
                stops.map((stop, index) => (
                  <View key={`${index}-${stop.name}`} style={styles.stopRow}>
                    <View style={styles.stopTitleRow}>
                      <View style={styles.stopNumber}>
                        <Text style={styles.stopNumberText}>{index + 1}</Text>
                      </View>
                      <View style={styles.stopCopy}>
                        <Text style={styles.stopName}>
                          {stop.name || "Unnamed stop"}
                        </Text>
                        <Text style={styles.coordinateText}>
                          {isRoutable(stop)
                            ? `${stop.lat?.toFixed(5)}, ${stop.lng?.toFixed(5)}`
                            : "Coordinates required"}
                        </Text>
                      </View>
                      <View style={styles.stopActions}>
                        <IconAction
                          icon="arrow-up"
                          label="Move stop up"
                          disabled={index === 0}
                          onPress={() => moveStop(index, -1)}
                        />
                        <IconAction
                          icon="arrow-down"
                          label="Move stop down"
                          disabled={index === stops.length - 1}
                          onPress={() => moveStop(index, 1)}
                        />
                        <IconAction
                          icon="trash-outline"
                          label="Remove stop"
                          onPress={() =>
                            setStops((current) =>
                              current.filter((_, stopIndex) => stopIndex !== index),
                            )
                          }
                        />
                      </View>
                    </View>
                    <Input
                      value={stop.time}
                      onChangeText={(time) =>
                        setStops((current) =>
                          current.map((item, stopIndex) =>
                            stopIndex === index ? { ...item, time } : item,
                          ),
                        )
                      }
                      placeholder="Scheduled time (optional, e.g. 07:30)"
                    />
                  </View>
                ))
              )}
            </Card>

            {plan ? (
              <Card style={styles.formCard}>
                <View style={styles.stopsHeading}>
                  <Text style={styles.cardTitle}>Driving plan</Text>
                  {planLoading ? (
                    <ActivityIndicator color={colors.amberDark} />
                  ) : null}
                </View>
                <Text style={styles.planSummary}>
                  {plan.totalKm != null ? `${plan.totalKm} km` : "Distance unavailable"}
                  {"  ·  "}
                  {plan.totalMinutes != null
                    ? `${plan.totalMinutes} min`
                    : "ETA unavailable"}
                </Text>
                {(plan.legs || []).map((leg, index) => (
                  <Text key={`${leg.fromStop}-${index}`} style={styles.legText}>
                    {leg.fromStop || "Stop"} → {leg.toStop || "Stop"} ·{" "}
                    {leg.km != null ? `${leg.km} km` : "—"} ·{" "}
                    {leg.minutes != null ? `${leg.minutes} min` : "—"}
                  </Text>
                ))}
              </Card>
            ) : planLoading ? (
              <View style={styles.planLoading}>
                <ActivityIndicator color={colors.amberDark} />
                <Text style={styles.muted}>Calculating route distance and time…</Text>
              </View>
            ) : null}
            <Button
              title={editing ? "Save route changes" : "Create route"}
              onPress={() => void saveRoute()}
              loading={saving}
              disabled={!canUpdate}
            />
            <Pressable onPress={closeEditor} style={styles.cancelButton}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={Boolean(deviceRoute)}
        transparent
        animationType="slide"
        onRequestClose={() => setDeviceRoute(null)}
      >
        <View style={styles.scrim}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.modalTitle}>Connect GPS device</Text>
              <Pressable onPress={() => setDeviceRoute(null)} hitSlop={10}>
                <Ionicons name="close" size={24} color={colors.ink} />
              </Pressable>
            </View>
            <Text style={styles.muted}>
              Choose an available device for Route {deviceRoute?.routeNo || ""}.
            </Text>
            {devicesLoading ? (
              <ActivityIndicator color={colors.amberDark} />
            ) : availableDevices.length ? (
              availableDevices.map((device) => (
                <Pressable
                  key={device.id}
                  disabled={binding}
                  onPress={() => void bindDevice(device)}
                  style={styles.deviceRow}
                >
                  <Ionicons name="hardware-chip-outline" size={19} color={colors.info} />
                  <Text style={styles.deviceName}>
                    {device.name ? `${device.name} (${device.id})` : device.id}
                  </Text>
                  {binding ? (
                    <ActivityIndicator size="small" color={colors.amberDark} />
                  ) : (
                    <Ionicons name="link-outline" size={17} color={colors.ink} />
                  )}
                </Pressable>
              ))
            ) : (
              <Text style={styles.emptyStops}>
                {devicesError || "No unbound GPS devices are available."}
              </Text>
            )}
          </View>
        </View>
      </Modal>

      <Modal
        visible={Boolean(locationRoute)}
        transparent
        animationType="slide"
        onRequestClose={() => setLocationRoute(null)}
      >
        <View style={styles.scrim}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.modalTitle}>
                Update Route {locationRoute?.routeNo || ""} location
              </Text>
              <Pressable onPress={() => setLocationRoute(null)} hitSlop={10}>
                <Ionicons name="close" size={24} color={colors.ink} />
              </Pressable>
            </View>
            <Text style={styles.muted}>
              Enter the bus's current latitude and longitude.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void useCurrentLocation()}
              disabled={locationLoading}
              style={styles.currentLocationButton}
            >
              {locationLoading ? (
                <ActivityIndicator size="small" color={colors.ink} />
              ) : (
                <Ionicons name="locate-outline" size={18} color={colors.ink} />
              )}
              <Text style={styles.currentLocationText}>
                {locationLoading ? "Getting current location…" : "Use my current location"}
              </Text>
            </Pressable>
            <View style={styles.coordinateFields}>
              <View style={styles.coordinateField}>
                <Field
                  label="Latitude"
                  value={latitude}
                  onChangeText={setLatitude}
                  placeholder="19.0760"
                  keyboardType="numeric"
                />
              </View>
              <View style={styles.coordinateField}>
                <Field
                  label="Longitude"
                  value={longitude}
                  onChangeText={setLongitude}
                  placeholder="72.8777"
                  keyboardType="numeric"
                />
              </View>
            </View>
            <Button
              title="Save location"
              onPress={() => void saveLocation()}
              loading={locationSaving}
            />
          </View>
        </View>
      </Modal>
    </>
  );
}

function RouteInfo({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.routeInfoItem}>
      <Ionicons name={icon} size={14} color={colors.muted} />
      <Text style={styles.routeInfoLabel}>{label}</Text>
      <Text numberOfLines={1} style={styles.routeInfoValue}>
        {value}
      </Text>
    </View>
  );
}

function SmallAction({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={styles.smallAction}
    >
      <Ionicons name={icon} size={15} color={colors.info} />
      <Text style={styles.smallActionText}>{label}</Text>
    </Pressable>
  );
}

function IconAction({
  icon,
  label,
  onPress,
  disabled = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      hitSlop={7}
      style={disabled ? styles.iconActionDisabled : styles.iconAction}
    >
      <Ionicons name={icon} size={17} color={disabled ? "#AEB6C2" : colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 16, gap: 14, paddingBottom: 36 },
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  headerCopy: { flex: 1, gap: 3 },
  eyebrow: {
    color: colors.amberDark,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
  },
  title: { color: colors.ink, fontSize: 25, fontWeight: "800" },
  subtitle: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.ink,
    borderRadius: 12,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  addButtonText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  metric: {
    flexBasis: "31%",
    flexGrow: 1,
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 11,
    gap: 4,
  },
  metricValue: { color: colors.ink, fontSize: 21, fontWeight: "800" },
  metricLabel: { color: colors.muted, fontSize: 10, fontWeight: "600" },
  infoBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#EEF5FC",
    borderColor: "#C9DDF1",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  infoText: { flex: 1, color: colors.info, fontSize: 12, lineHeight: 17 },
  errorBanner: {
    gap: 8,
    backgroundColor: "#FFF1EF",
    borderColor: colors.alert,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  errorText: { color: colors.alert, fontSize: 12, lineHeight: 18 },
  retryText: { color: colors.ink, fontSize: 12, fontWeight: "700" },
  sectionHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  sectionTitle: { color: colors.ink, fontSize: 17, fontWeight: "800" },
  loading: { alignItems: "center", gap: 10, paddingVertical: 36 },
  muted: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  empty: { alignItems: "center", gap: 8, paddingVertical: 28 },
  emptyTitle: { color: colors.ink, fontSize: 15, fontWeight: "700" },
  routeCard: { gap: 12 },
  routeTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  routeTitleWrap: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  routeIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#F0F2F5",
    alignItems: "center",
    justifyContent: "center",
  },
  routeCopy: { flex: 1, gap: 3 },
  routeTitle: { color: colors.ink, fontSize: 15, fontWeight: "800" },
  routeMeta: { color: colors.muted, fontSize: 12 },
  statusPill: { borderRadius: 20, paddingHorizontal: 9, paddingVertical: 5 },
  statusLive: { backgroundColor: "#E8F7EF" },
  statusIdle: { backgroundColor: "#F0F2F5" },
  statusText: { fontSize: 10, fontWeight: "800" },
  statusLiveText: { color: colors.success },
  statusIdleText: { color: colors.muted },
  routeInfo: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  routeInfoItem: { width: "47%", gap: 3 },
  routeInfoLabel: { color: colors.muted, fontSize: 10 },
  routeInfoValue: { color: colors.text, fontSize: 12, fontWeight: "700" },
  stopsLabel: { color: colors.muted, fontSize: 11, fontWeight: "700" },
  stopsText: { color: colors.text, fontSize: 12, lineHeight: 18 },
  gpsRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  gpsText: { color: colors.muted, fontSize: 11, flex: 1 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  smallAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#fff",
    borderRadius: 9,
    paddingHorizontal: 9,
    paddingVertical: 8,
  },
  smallActionText: { color: colors.info, fontSize: 11, fontWeight: "700" },
  modal: { flex: 1, backgroundColor: colors.paper, paddingTop: 48 },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalEyebrow: {
    color: colors.amberDark,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1,
  },
  modalTitle: { color: colors.ink, fontSize: 18, fontWeight: "800", flex: 1 },
  editorContent: { padding: 16, gap: 14, paddingBottom: 36 },
  formCard: { gap: 12 },
  field: { gap: 6 },
  fieldLabel: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  cardTitle: { color: colors.ink, fontSize: 15, fontWeight: "800" },
  placeResult: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  placeText: { flex: 1, color: colors.text, fontSize: 12, lineHeight: 17 },
  attribution: { color: colors.muted, fontSize: 10 },
  mapHint: { color: colors.muted, fontSize: 11 },
  editorMap: { height: 260, borderRadius: 13, overflow: "hidden" },
  stopsHeading: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  emptyStops: { color: colors.muted, fontSize: 12, textAlign: "center", padding: 12 },
  stopRow: {
    gap: 9,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 10,
  },
  stopTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  stopNumber: {
    width: 25,
    height: 25,
    borderRadius: 13,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  stopNumberText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  stopCopy: { flex: 1, gap: 3 },
  stopName: { color: colors.ink, fontSize: 12, fontWeight: "700" },
  coordinateText: { color: colors.muted, fontSize: 10 },
  stopActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  iconAction: { padding: 2 },
  iconActionDisabled: { padding: 2, opacity: 0.5 },
  planSummary: { color: colors.ink, fontWeight: "800", fontSize: 14 },
  legText: { color: colors.muted, fontSize: 11, lineHeight: 17 },
  planLoading: { alignItems: "center", gap: 8, padding: 10 },
  cancelButton: { alignItems: "center", padding: 12 },
  cancelText: { color: colors.muted, fontWeight: "700", fontSize: 14 },
  scrim: {
    flex: 1,
    backgroundColor: "rgba(10, 18, 35, 0.4)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.paper,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 18,
    paddingBottom: 28,
    gap: 14,
  },
  sheetHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  deviceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#fff",
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 13,
  },
  deviceName: { color: colors.text, flex: 1, fontSize: 13, fontWeight: "600" },
  coordinateFields: { flexDirection: "row", gap: 10 },
  coordinateField: { flex: 1 },
  currentLocationButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: colors.ink,
    borderRadius: 12,
    backgroundColor: "#fff",
    padding: 12,
  },
  currentLocationText: { color: colors.ink, fontSize: 13, fontWeight: "700" },
});
