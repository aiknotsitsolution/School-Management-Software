import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { get, send } from "../lib/api";
import { extractList, Row, titleOf } from "../lib/format";
import { Button, Card, Empty, Input } from "../components/UI";
import { colors } from "../theme";

export default function MarksEntryScreen() {
  const [exams, setExams] = useState<Row[]>([]);
  const [exam, setExam] = useState<Row | null>(null);
  const [students, setStudents] = useState<Row[]>([]);
  const [entries, setEntries] = useState<Record<string, { m: string; r: string }>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const adm = (s: Row) => String(s.admissionNo ?? s._id);

  useEffect(() => { get("/exams").then((r) => setExams(extractList(r.data))).catch(() => {}); }, []);

  const pick = async (e: Row) => {
    setExam(e); setLoading(true);
    try {
      const [sr, mr] = await Promise.all([
        get(`/students?class=${encodeURIComponent(String(e.class))}&section=${encodeURIComponent(String(e.section ?? ""))}&limit=500`),
        get(`/marks?examId=${e._id}&limit=1000`),
      ]);
      setStudents(extractList(sr.data));
      const pre: Record<string, { m: string; r: string }> = {};
      extractList(mr.data).forEach((m) => { pre[String(m.studentId)] = { m: String(m.marksObtained ?? ""), r: String(m.remarks ?? "") }; });
      setEntries(pre);
    } catch (err) { Alert.alert("Error", (err as Error).message); }
    finally { setLoading(false); }
  };

  const save = async () => {
    const payload = students.filter((s) => entries[adm(s)]?.m?.trim())
      .map((s) => ({ studentId: adm(s), marksObtained: Number(entries[adm(s)].m), remarks: entries[adm(s)].r || undefined }));
    if (!payload.length) return Alert.alert("Nothing to save", "Enter marks for at least one student");
    const max = Number(exam?.maxMarks ?? 0);
    if (max && payload.some((p) => p.marksObtained > max)) return Alert.alert("Invalid", `Marks cannot exceed ${max}`);
    setSaving(true);
    try { await send("/marks", "POST", { examId: exam!._id, entries: payload }); Alert.alert("Saved", `${payload.length} marks saved`); }
    catch (err) { Alert.alert("Error", (err as Error).message); }
    finally { setSaving(false); }
  };

  if (!exam) return (
    <View style={s.root}>
      <Text style={s.h}>Select exam</Text>
      <FlatList data={exams} keyExtractor={(e) => String(e._id)} contentContainerStyle={{ gap: 10 }} ListEmptyComponent={<Empty text="No exams found" />}
        renderItem={({ item }) => (
          <Pressable onPress={() => pick(item)}><Card><Text style={s.t}>{titleOf(item)}</Text>
            <Text style={s.m}>Class {String(item.class ?? "—")}{item.section ? `-${item.section}` : ""} · Max {String(item.maxMarks ?? "—")}</Text></Card></Pressable>
        )} />
    </View>
  );
  return (
    <View style={s.root}>
      <Pressable onPress={() => setExam(null)}><Text style={s.back}>← {titleOf(exam)} (change)</Text></Pressable>
      {loading ? <ActivityIndicator color={colors.ink} /> : (
        <>
          <FlatList data={students} keyExtractor={adm} contentContainerStyle={{ gap: 8 }} ListEmptyComponent={<Empty text="No students in this class" />}
            renderItem={({ item }) => (
              <Card style={{ padding: 12, flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Text style={[s.t, { flex: 1 }]}>{String(item.name ?? "—")}</Text>
                <Input style={{ width: 80, textAlign: "center" }} placeholder="Marks" keyboardType="numeric" value={entries[adm(item)]?.m ?? ""}
                  onChangeText={(t) => setEntries((p) => ({ ...p, [adm(item)]: { m: t, r: p[adm(item)]?.r ?? "" } }))} />
              </Card>
            )} />
          {students.length > 0 && <Button title="Save marks" onPress={save} loading={saving} />}
        </>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  root: { flex: 1, padding: 16, gap: 10, backgroundColor: colors.paper }, h: { fontWeight: "800", fontSize: 16, color: colors.ink },
  t: { fontWeight: "700", color: colors.ink }, m: { color: colors.muted, marginTop: 3 }, back: { color: colors.info, fontWeight: "700" },
});
