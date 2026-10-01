import React, { useState } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { get, send } from "../lib/api";
import { extractList, Row } from "../lib/format";
import { Button, Card, Empty, Input } from "../components/UI";
import { colors } from "../theme";

type St = "Present" | "Absent" | "Half Day" | "Leave";
const STATUSES: { k: St; c: string }[] = [{ k: "Present", c: colors.success }, { k: "Absent", c: colors.alert }, { k: "Half Day", c: colors.amberDark }, { k: "Leave", c: colors.info }];

export default function MarkAttendanceScreen() {
  const [cls, setCls] = useState("");
  const [section, setSection] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [students, setStudents] = useState<Row[]>([]);
  const [marks, setMarks] = useState<Record<string, St>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const idOf = (s: Row) => String(s.admissionNo ?? s._id);

  const load = async () => {
    if (!cls.trim() || !section.trim()) return Alert.alert("Required", "Enter class and section");
    setLoading(true);
    try {
      const r = await get(`/students?class=${encodeURIComponent(cls.trim())}&section=${encodeURIComponent(section.trim())}&limit=500`);
      const list = extractList(r.data).filter((s) => String(s.class) === cls.trim() && String(s.section).toUpperCase() === section.trim().toUpperCase());
      setStudents(list);
      setMarks(Object.fromEntries(list.map((s) => [idOf(s), "Present" as St])));
    } catch (e) { Alert.alert("Error", (e as Error).message); }
    finally { setLoading(false); }
  };

  const save = async () => {
    setSaving(true);
    try {
      await send("/attendance/mark", "POST", { records: students.map((s) => ({ studentId: idOf(s), class: s.class, section: s.section, date, status: marks[idOf(s)] })) });
      Alert.alert("Saved", "Attendance saved");
    } catch (e) { Alert.alert("Error", (e as Error).message); }
    finally { setSaving(false); }
  };

  const counts = STATUSES.map((x) => `${x.k[0]}: ${Object.values(marks).filter((m) => m === x.k).length}`).join("  ");
  return (
    <View style={s.root}>
      <View style={s.row}>
        <Input style={{ flex: 1 }} placeholder="Class" value={cls} onChangeText={setCls} />
        <Input style={{ flex: 1 }} placeholder="Section" autoCapitalize="characters" value={section} onChangeText={setSection} />
      </View>
      <Input placeholder="Date YYYY-MM-DD" value={date} onChangeText={setDate} />
      <Button title="Load students" variant="ghost" onPress={load} />
      {loading ? <ActivityIndicator color={colors.ink} /> : (
        <>
          {students.length > 0 && <Text style={s.counts}>{counts}</Text>}
          <FlatList data={students} keyExtractor={idOf} contentContainerStyle={{ gap: 8 }} ListEmptyComponent={<Empty text="Load a class to mark attendance" />}
            renderItem={({ item }) => (
              <Card style={{ padding: 12 }}>
                <Text style={s.name}>{String(item.name ?? "—")} <Text style={s.roll}>#{String(item.rollNo ?? "")}</Text></Text>
                <View style={s.chips}>
                  {STATUSES.map(({ k, c }) => (
                    <Pressable key={k} onPress={() => setMarks((p) => ({ ...p, [idOf(item)]: k }))} style={[s.chip, { borderColor: c }, marks[idOf(item)] === k && { backgroundColor: c }]}>
                      <Text style={[s.chipT, { color: marks[idOf(item)] === k ? "#fff" : c }]}>{k}</Text>
                    </Pressable>
                  ))}
                </View>
              </Card>
            )} />
          {students.length > 0 && <Button title="Save attendance" onPress={save} loading={saving} />}
        </>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  root: { flex: 1, padding: 16, gap: 10, backgroundColor: colors.paper }, row: { flexDirection: "row", gap: 10 },
  counts: { color: colors.muted, fontWeight: "700" }, name: { fontWeight: "700", color: colors.ink }, roll: { color: colors.muted, fontWeight: "400" },
  chips: { flexDirection: "row", gap: 6, marginTop: 8 }, chip: { flex: 1, borderWidth: 1.5, borderRadius: 8, paddingVertical: 6, alignItems: "center" }, chipT: { fontSize: 11, fontWeight: "700" },
});
