import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { get } from "../lib/api";
import { extractList, previewFields, titleOf, Row } from "../lib/format";
import { Card, Empty, Input } from "../components/UI";
import { colors } from "../theme";
import { MODULE_FORM } from "../lib/forms";
import { useAuth } from "../context/AuthContext";
import type { RootStackParams } from "../../App";

export default function ModuleListScreen({ route, navigation }: NativeStackScreenProps<RootStackParams, "Module">) {
  const { title, endpoint } = route.params;
  const { can } = useAuth();
  const formDef = MODULE_FORM[endpoint];
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    try { setError(""); const r = await get(endpoint); setRows(extractList(r.data)); }
    catch (e) { setError((e as Error).message); }
  }, [endpoint]);

  useEffect(() => { const unsub = navigation.addListener("focus", () => { load(); }); return unsub; }, [navigation, load]);

  useEffect(() => { navigation.setOptions({ title }); load().finally(() => setLoading(false)); }, [load, navigation, title]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return q ? rows.filter((r) => JSON.stringify(r).toLowerCase().includes(q)) : rows;
  }, [rows, query]);

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color={colors.ink} />;
  return (
    <View style={s.root}>
      <Input placeholder={`Search ${title}`} value={query} onChangeText={setQuery} />
      {!!error && <Text style={s.err}>{error}</Text>}
      <FlatList data={filtered} keyExtractor={(r, i) => String(r._id ?? i)} contentContainerStyle={{ gap: 10, paddingVertical: 12 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
        ListEmptyComponent={<Empty text={error ? "Could not load data" : "No records found"} />}
        renderItem={({ item }) => (
          <Pressable onPress={() => navigation.navigate("Detail", { title: titleOf(item), row: item, endpoint })}>
            <Card>
              <Text style={s.t}>{titleOf(item)}</Text>
              {previewFields(item).map(([k, v]) => <Text key={k} style={s.f}><Text style={s.k}>{k}: </Text>{v}</Text>)}
            </Card>
          </Pressable>
        )} />
      {endpoint === "/documents" && (
        <Pressable style={s.fab} onPress={() => navigation.navigate("UploadDocument")}><Text style={s.plus}>↑</Text></Pressable>
      )}
      {formDef && can(formDef.perm) && (
        <Pressable style={s.fab} onPress={() => navigation.navigate("Form", { form: formDef.form })}><Text style={s.plus}>+</Text></Pressable>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  root: { flex: 1, padding: 16, backgroundColor: colors.paper },
  t: { fontWeight: "800", color: colors.ink, fontSize: 15, marginBottom: 4 },
  f: { color: colors.text, fontSize: 13, marginTop: 2 }, k: { color: colors.muted },
  fab: { position: "absolute", right: 20, bottom: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: colors.amber, alignItems: "center", justifyContent: "center", elevation: 4 },
  plus: { fontSize: 30, color: colors.ink, marginTop: -2 },
  err: { color: colors.alert, marginTop: 8 },
});
