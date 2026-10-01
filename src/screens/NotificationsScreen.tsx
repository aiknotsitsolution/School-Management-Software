import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { notificationsApi } from "../lib/api";
import { useNotifications } from "../context/NotificationsContext";
import { extractList, Row, titleOf } from "../lib/format";
import { Card, Empty } from "../components/UI";
import { colors } from "../theme";

export default function NotificationsScreen() {
  const { unread, tick, refresh, live } = useNotifications();
  const [items, setItems] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { const r = await notificationsApi.list(); setItems(extractList(r.data)); } catch { /* keep old */ }
  }, []);
  useEffect(() => { load().finally(() => setLoading(false)); }, [load, tick]); // tick bumps on every live event

  const shown = useMemo(() => (onlyUnread ? items.filter((n) => !n.read) : items), [items, onlyUnread]);
  const open = async (n: Row) => {
    if (n.read) return;
    setItems((p) => p.map((x) => (x._id === n._id ? { ...x, read: true } : x)));
    try { await notificationsApi.markRead(String(n._id)); refresh(); } catch { /* ignore */ }
  };
  const readAll = async () => { setItems((p) => p.map((x) => ({ ...x, read: true }))); try { await notificationsApi.markAllRead(); refresh(); } catch { /* ignore */ } };

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color={colors.ink} />;
  return (
    <View style={s.root}>
      <View style={s.bar}>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {[false, true].map((u) => (
            <Pressable key={String(u)} onPress={() => setOnlyUnread(u)} style={[s.chip, onlyUnread === u && s.on]}>
              <Text style={[s.chipT, onlyUnread === u && { color: "#fff" }]}>{u ? `Unread${unread ? ` (${unread})` : ""}` : "All"}</Text>
            </Pressable>
          ))}
        </View>
        {unread > 0 && <Pressable onPress={readAll}><Text style={s.link}>Mark all read</Text></Pressable>}
      </View>
      <Text style={[s.live, { color: live ? colors.success : colors.muted }]}>● {live ? "Live" : "Reconnecting…"}</Text>
      <FlatList data={shown} keyExtractor={(n, i) => String(n._id ?? i)} contentContainerStyle={{ gap: 10, paddingBottom: 20 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
        ListEmptyComponent={<Empty text={onlyUnread ? "You're all caught up." : "New updates will appear here."} />}
        renderItem={({ item }) => (
          <Pressable onPress={() => open(item)}>
            <Card style={!item.read ? { borderColor: colors.amber, borderWidth: 1.5 } : undefined}>
              <Text style={s.t}>{titleOf(item)}</Text>
              {!!(item.message ?? item.body) && <Text style={s.b}>{String(item.message ?? item.body)}</Text>}
              {!!item.createdAt && <Text style={s.d}>{new Date(String(item.createdAt)).toLocaleString()}</Text>}
            </Card>
          </Pressable>
        )} />
    </View>
  );
}
const s = StyleSheet.create({
  root: { flex: 1, padding: 16, backgroundColor: colors.paper }, bar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: "#fff" },
  on: { backgroundColor: colors.ink, borderColor: colors.ink }, chipT: { fontWeight: "600", color: colors.ink, fontSize: 13 },
  link: { color: colors.info, fontWeight: "700" }, live: { fontSize: 11, fontWeight: "700", marginVertical: 8 },
  t: { fontWeight: "700", color: colors.ink }, b: { color: colors.text, marginTop: 4 }, d: { color: colors.muted, fontSize: 11, marginTop: 6 },
});
