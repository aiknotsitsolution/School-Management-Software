import React, { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";
import { api } from "../lib/api";
import { Card, Empty } from "../components/UI";
import { colors } from "../theme";
import type { Notice } from "../types";

export default function NoticesScreen() {
  const [items, setItems] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { api.notices.list().then((r) => setItems(r.data)).finally(() => setLoading(false)); }, []);
  if (loading) return <ActivityIndicator style={{ flex: 1 }} color={colors.ink} />;
  return (
    <View style={{ flex: 1, backgroundColor: colors.paper, padding: 16 }}>
      <FlatList data={items} keyExtractor={(i) => i._id} contentContainerStyle={{ gap: 10 }} ListEmptyComponent={<Empty text="No notices" />}
        renderItem={({ item }) => (
          <Card>
            {!!item.category && <Text style={s.cat}>{item.category}</Text>}
            <Text style={s.title}>{item.title}</Text>
            <Text style={s.body}>{item.body}</Text>
          </Card>
        )} />
    </View>
  );
}
const s = StyleSheet.create({ cat: { color: colors.amberDark, fontSize: 11, fontWeight: "700", textTransform: "uppercase" }, title: { fontWeight: "800", color: colors.ink, fontSize: 16, marginTop: 2 }, body: { color: colors.muted, marginTop: 6 } });
