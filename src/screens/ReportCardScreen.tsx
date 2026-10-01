import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { get } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { extractList, Row } from "../lib/format";
import { Card, Empty, Input } from "../components/UI";
import { colors } from "../theme";

const TERMS = ["Term 1", "Term 2", "Final"];
const grade = (pct: number) => (pct >= 90 ? "A+" : pct >= 80 ? "A" : pct >= 70 ? "B+" : pct >= 60 ? "B" : pct >= 50 ? "C" : pct >= 33 ? "D" : "F");

export default function ReportCardScreen() {
  const { user } = useAuth();
  const isStudent = user?.role === "student";
  const [students, setStudents] = useState<Row[]>([]);
  const [student, setStudent] = useState<Row | null>(null);
  const [query, setQuery] = useState("");
  const [term, setTerm] = useState(TERMS[0]);
  const [subjects, setSubjects] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isStudent) get<Row>("/students/me").then((r) => setStudent(r.data)).catch(() => {});
    else get("/students?limit=500").then((r) => setStudents(extractList(r.data))).catch(() => {});
  }, [isStudent]);

  useEffect(() => {
    if (!student) return;
    setLoading(true); setError("");
    get<Row>(`/marks/report-card?studentId=${encodeURIComponent(String(student.admissionNo ?? student._id))}&examName=${encodeURIComponent(term)}&includeDrafts=1`)
      .then((r) => setSubjects((r.data?.subjects as Row[]) ?? [])).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, [student, term]);

  const filtered = useMemo(() => students.filter((x) => String(x.name ?? "").toLowerCase().includes(query.toLowerCase())).slice(0, 40), [students, query]);
  const totals = useMemo(() => {
    const got = (subjects ?? []).reduce((a, x) => a + Number(x.marksObtained || 0), 0);
    const max = (subjects ?? []).reduce((a, x) => a + Number(x.maxMarks || 0), 0);
    return { got, max, pct: max ? (got / max) * 100 : 0 };
  }, [subjects]);

  if (!student) return (
    <View style={s.root}>
      <Input placeholder="Search student" value={query} onChangeText={setQuery} />
      <FlatList data={filtered} keyExtractor={(x) => String(x._id)} contentContainerStyle={{ gap: 8, paddingTop: 12 }} ListEmptyComponent={<Empty text={isStudent ? "Loading…" : "No students"} />}
        renderItem={({ item }) => <Pressable onPress={() => setStudent(item)}><Card><Text style={s.n}>{String(item.name ?? "—")}</Text><Text style={s.m}>Class {String(item.class ?? "—")}-{String(item.section ?? "")} · Roll {String(item.rollNo ?? "—")}</Text></Card></Pressable>} />
    </View>
  );
  return (
    <ScrollView style={s.root} contentContainerStyle={{ gap: 12, paddingBottom: 30 }}>
      {!isStudent && <Pressable onPress={() => { setStudent(null); setSubjects(null); }}><Text style={s.back}>← Change student</Text></Pressable>}
      <Card style={{ backgroundColor: colors.ink }}>
        <Text style={{ color: "#fff", fontWeight: "800", fontSize: 18 }}>{String(student.name ?? "")}</Text>
        <Text style={{ color: colors.amberDark, marginTop: 4 }}>Class {String(student.class ?? "—")}-{String(student.section ?? "")} · Roll {String(student.rollNo ?? "—")}</Text>
      </Card>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {TERMS.map((t) => <Pressable key={t} onPress={() => setTerm(t)} style={[s.chip, term === t && s.on]}><Text style={[s.chipT, term === t && { color: "#fff" }]}>{t}</Text></Pressable>)}
      </View>
      {loading ? <ActivityIndicator color={colors.ink} /> : error ? <Text style={{ color: colors.alert }}>{error}</Text> : !subjects?.length ? <Empty text="No marks published for this term" /> : (
        <>
          <Card style={{ padding: 0, overflow: "hidden" }}>
            {subjects.map((x, i) => {
              const m = Number(x.marksObtained || 0), mx = Number(x.maxMarks || 0), pct = mx ? (m / mx) * 100 : 0;
              return (
                <View key={i} style={s.row}>
                  <Text style={[s.n, { flex: 1 }]}>{String(x.subject ?? "—")}</Text>
                  <Text style={s.m}>{m}/{mx}</Text>
                  <Text style={[s.g, { color: pct >= 33 ? colors.success : colors.alert }]}>{String(x.grade ?? grade(pct))}</Text>
                </View>
              );
            })}
          </Card>
          <Card><Text style={s.m}>Total</Text><Text style={s.big}>{totals.got} / {totals.max}</Text><Text style={s.n}>{totals.pct.toFixed(1)}% · Grade {grade(totals.pct)}</Text></Card>
        </>
      )}
    </ScrollView>
  );
}
const s = StyleSheet.create({
  root: { flex: 1, padding: 16, backgroundColor: colors.paper }, n: { fontWeight: "700", color: colors.ink }, m: { color: colors.muted }, back: { color: colors.info, fontWeight: "700" },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: "#fff" }, on: { backgroundColor: colors.ink, borderColor: colors.ink }, chipT: { fontWeight: "600", color: colors.ink },
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, g: { fontWeight: "800", width: 30, textAlign: "right" }, big: { fontSize: 28, fontWeight: "800", color: colors.ink },
});
