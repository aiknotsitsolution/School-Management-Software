import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { get } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { extractList, Row } from "../lib/format";
import { Button, Card, Empty, Input } from "../components/UI";
import { colors } from "../theme";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const time = (v: unknown) => { if (!v) return ""; const [h, m] = String(v).split(":").map(Number); if (Number.isNaN(h)) return String(v); return `${((h + 11) % 12) + 1}:${String(m ?? 0).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`; };

export default function TimetableScreen() {
  const { user } = useAuth();
  const [cls, setCls] = useState("");
  const [section, setSection] = useState("");
  const [slots, setSlots] = useState<Row[]>([]);
  const [day, setDay] = useState(DAYS[Math.min(Math.max(new Date().getDay() - 1, 0), 5)]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = async (c: string, sec: string) => {
    setLoading(true); setError("");
    try { const r = await get(`/timetable?class=${encodeURIComponent(c)}&section=${encodeURIComponent(sec)}`); setSlots(extractList(r.data)); }
    catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  };
  useEffect(() => { // students see their own class automatically
    if (user?.role !== "student") return;
    get<Row>("/students/me").then((r) => { const c = String(r.data.class ?? ""), sec = String(r.data.section ?? ""); setCls(c); setSection(sec); load(c, sec); }).catch(() => {});
  }, [user]);

  const periods = useMemo(() => {
    const slot = slots.find((x) => x.day === day);
    return [...((slot?.periods as Row[]) ?? [])].sort((a, b) => String(a.startTime ?? "").localeCompare(String(b.startTime ?? "")));
  }, [slots, day]);

  return (
    <View style={s.root}>
      {user?.role !== "student" && (
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Input style={{ flex: 1 }} placeholder="Class" value={cls} onChangeText={setCls} />
          <Input style={{ flex: 1 }} placeholder="Section" autoCapitalize="characters" value={section} onChangeText={setSection} />
          <View style={{ width: 90 }}><Button title="Load" onPress={() => load(cls.trim(), section.trim())} /></View>
        </View>
      )}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8 }}>
        {DAYS.map((d) => (
          <Pressable key={d} onPress={() => setDay(d)} style={[s.tab, day === d && s.tabOn]}><Text style={[s.tabT, day === d && { color: "#fff" }]}>{d.slice(0, 3)}</Text></Pressable>
        ))}
      </ScrollView>
      {loading ? <ActivityIndicator color={colors.ink} /> : (
        <ScrollView contentContainerStyle={{ gap: 10, paddingBottom: 24 }}>
          {!!error && <Text style={{ color: colors.alert }}>{error}</Text>}
          {periods.length === 0 && <Empty text={`No periods on ${day}`} />}
          {periods.map((p, i) => (
            <Card key={i} style={s.period}>
              <View style={s.time}><Text style={s.tt}>{time(p.startTime)}</Text><Text style={s.tm}>{time(p.endTime)}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={s.sub}>{String(p.subject ?? "—")}</Text>
                <Text style={s.meta}>{[p.teacherName, p.room].filter(Boolean).join(" · ")}</Text>
              </View>
            </Card>
          ))}
        </ScrollView>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  root: { flex: 1, padding: 16, gap: 12, backgroundColor: colors.paper },
  tab: { paddingHorizontal: 18, paddingVertical: 9, borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: "#fff" },
  tabOn: { backgroundColor: colors.ink, borderColor: colors.ink }, tabT: { fontWeight: "700", color: colors.ink },
  period: { flexDirection: "row", gap: 14, alignItems: "center", padding: 14 },
  time: { width: 76, borderRightWidth: 2, borderRightColor: colors.amber, paddingRight: 10 },
  tt: { fontWeight: "800", color: colors.ink, fontSize: 12.5 }, tm: { color: colors.muted, fontSize: 11.5, marginTop: 2 },
  sub: { fontWeight: "800", color: colors.ink, fontSize: 15 }, meta: { color: colors.muted, marginTop: 3, fontSize: 12.5 },
});
