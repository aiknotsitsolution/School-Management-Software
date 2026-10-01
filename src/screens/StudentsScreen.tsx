import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";
import { api } from "../lib/api";
import { Card, Empty, Input } from "../components/UI";
import { colors } from "../theme";
import type { Student } from "../types";

const fullName = (s: Student) => s.name || [s.firstName, s.lastName].filter(Boolean).join(" ") || "—";

export default function StudentsScreen() {
  const [items, setItems] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => { api.students.list("limit=500").then((r) => setItems(r.data)).finally(() => setLoading(false)); }, []);
  const filtered = useMemo(() => items.filter((s) => fullName(s).toLowerCase().includes(query.toLowerCase())), [items, query]);

  if (loading) return <ActivityIndicator style={{ flex: 1 }} color={colors.ink} />;
  return (
    <View style={s.root}>
      <Input placeholder="Search students" value={query} onChangeText={setQuery} />
      <FlatList data={filtered} keyExtractor={(i) => i._id} contentContainerStyle={{ gap: 10, paddingTop: 12 }}
        ListEmptyComponent={<Empty text="No students found" />}
        renderItem={({ item }) => (
          <Card>
            <Text style={s.name}>{fullName(item)}</Text>
            <Text style={s.meta}>Class {item.class ?? "—"}{item.section ? `-${item.section}` : ""} · Roll {item.rollNo ?? "—"}</Text>
          </Card>
        )} />
    </View>
  );
}
const s = StyleSheet.create({ root: { flex: 1, padding: 16, backgroundColor: colors.paper }, name: { fontWeight: "700", color: colors.ink, fontSize: 15 }, meta: { color: colors.muted, marginTop: 3 } });
