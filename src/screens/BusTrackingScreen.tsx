import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from "react-native-maps";
import { get } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { extractList, Row } from "../lib/format";
import { colors } from "../theme";

const STATUS_COLOR: Record<string, string> = { "On Route": "#3F8F5F", Delayed: "#D65A4A", "Not Started": "#94A3B8", Arrived: "#16213E" };
const DEFAULT_SCHOOL = { latitude: 23.2599, longitude: 77.4126 };
const num = (v: unknown) => (v == null || v === "" ? NaN : Number(v));
const nameOf = (r: Row) => String(r.name ?? r.routeName ?? r.route ?? r.busNo ?? r.vehicleNo ?? r.number ?? "Bus");

export default function BusTrackingScreen() {
  const { school } = useAuth();
  const [routes, setRoutes] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const map = useRef<MapView>(null);
  const loc = (school as unknown as { location?: { lat: number; lng: number } })?.location;
  const schoolPos = loc ? { latitude: loc.lat, longitude: loc.lng } : DEFAULT_SCHOOL;

  const load = useCallback(async () => { try { const r = await get("/transport"); setRoutes(extractList(r.data)); } catch { /* keep last */ } }, []);
  useEffect(() => { load().finally(() => setLoading(false)); const t = setInterval(load, 10000); return () => clearInterval(t); }, [load]); // live: poll every 10s

  const buses = useMemo(() => routes.map((r) => ({ r, id: String(r._id ?? r.id), pos: { latitude: num(r.lat), longitude: num(r.lng) },
    path: ((r.waypoints as number[][]) ?? []).map(([la, ln]) => ({ latitude: Number(la), longitude: Number(ln) })).filter((p) => !isNaN(p.latitude)) }))
    .filter((b) => !isNaN(b.pos.latitude) && !isNaN(b.pos.longitude)), [routes]);

  useEffect(() => {
    if (!buses.length) return;
    const pts = [schoolPos, ...buses.flatMap((b) => [b.pos, ...b.path])];
    setTimeout(() => map.current?.fitToCoordinates(pts, { edgePadding: { top: 60, right: 60, bottom: 220, left: 60 }, animated: true }), 400);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buses.length]);

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color={colors.ink} />;
  return (
    <View style={{ flex: 1 }}>
      <MapView ref={map} style={{ flex: 1 }} provider={PROVIDER_DEFAULT} initialRegion={{ ...schoolPos, latitudeDelta: 0.08, longitudeDelta: 0.08 }}>
        <Marker coordinate={schoolPos} title="School" pinColor={colors.ink} />
        {buses.map((b) => {
          const c = STATUS_COLOR[String(b.r.status)] ?? "#94A3B8";
          return (
            <React.Fragment key={b.id}>
              {b.path.length > 1 && <Polyline coordinates={b.path} strokeColor={c} strokeWidth={3} lineDashPattern={b.r.status === "Delayed" ? [8, 6] : undefined} />}
              <Marker coordinate={b.pos} title={nameOf(b.r)} description={String(b.r.status ?? "")} pinColor={c} onPress={() => setSelected(b.id)} />
            </React.Fragment>
          );
        })}
      </MapView>
      <View style={s.sheet}>
        <Text style={s.h}>Buses · live (10s refresh)</Text>
        <FlatList horizontal data={buses} keyExtractor={(b) => b.id} showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}
          ListEmptyComponent={<Text style={{ color: colors.muted }}>No buses with GPS location yet</Text>}
          renderItem={({ item: b }) => (
            <Pressable onPress={() => { setSelected(b.id); map.current?.animateToRegion({ ...b.pos, latitudeDelta: 0.02, longitudeDelta: 0.02 }, 500); }}
              style={[s.chip, selected === b.id && { borderColor: colors.amber, borderWidth: 2 }]}>
              <View style={[s.dot, { backgroundColor: STATUS_COLOR[String(b.r.status)] ?? "#94A3B8" }]} />
              <View><Text style={s.n}>{nameOf(b.r)}</Text><Text style={s.m}>{String(b.r.status ?? "—")}{b.r.speed ? ` · ${b.r.speed}` : ""}</Text></View>
            </Pressable>
          )} />
      </View>
    </View>
  );
}
const s = StyleSheet.create({
  sheet: { position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: "#fff", padding: 14, borderTopLeftRadius: 20, borderTopRightRadius: 20, gap: 10, elevation: 8 },
  h: { fontWeight: "800", color: colors.ink }, chip: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.paper },
  dot: { width: 10, height: 10, borderRadius: 5 }, n: { fontWeight: "700", color: colors.ink }, m: { color: colors.muted, fontSize: 11.5 },
});
