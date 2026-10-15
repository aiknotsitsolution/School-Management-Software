import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import ViewShot from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import { get } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { extractList, Row } from "../lib/format";
import { Button, Card, Empty, Input } from "../components/UI";
import { colors } from "../theme";

const d = (v: unknown) => (v ? new Date(String(v)).toLocaleDateString() : "");
const Line = ({ k, v }: { k: string; v?: unknown }) => (v ? <View style={s.line}><Text style={s.k}>{k}</Text><Text style={s.v}>{String(v)}</Text></View> : null);

export default function IdCardScreen() {
  const { user, school } = useAuth();
  const isStudent = user?.role === "student";
  const [students, setStudents] = useState<Row[]>([]);
  const [st, setSt] = useState<Row | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const shot = useRef<React.ComponentRef<typeof ViewShot>>(null);

  useEffect(() => {
    if (isStudent) get<Row>("/students/me").then((r) => setSt(r.data)).catch(() => {});
    else get("/students?limit=500").then((r) => setStudents(extractList(r.data))).catch(() => {});
  }, [isStudent]);
  const list = useMemo(() => students.filter((x) => String(x.name ?? "").toLowerCase().includes(q.toLowerCase())).slice(0, 40), [students, q]);

  const share = async () => {
    setBusy(true);
    try {
      const uri = await shot.current?.capture?.();
      if (!uri) throw new Error("Could not capture card");
      if (!(await Sharing.isAvailableAsync())) throw new Error("Sharing is not available on this device");
      await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle: "Share ID card" });
    } catch (e) { Alert.alert("Error", (e as Error).message); } finally { setBusy(false); }
  };

  if (!st) return isStudent ? <ActivityIndicator style={{ flex: 1 }} color={colors.ink} /> : (
    <View style={s.root}>
      <Input placeholder="Search student" value={q} onChangeText={setQ} />
      <FlatList data={list} keyExtractor={(x) => String(x._id)} contentContainerStyle={{ gap: 8, paddingTop: 12 }} ListEmptyComponent={<Empty text="No students" />}
        renderItem={({ item }) => <Pressable onPress={() => setSt(item)}><Card><Text style={s.n}>{String(item.name ?? "—")}</Text><Text style={s.k}>Class {String(item.class ?? "—")}-{String(item.section ?? "")}</Text></Card></Pressable>} />
    </View>
  );
  const photo = (st.photoUrl ?? st.photo) as string | undefined;
  const accent = colors.amber;
  return (
    <ScrollView style={s.root} contentContainerStyle={{ gap: 16, alignItems: "center", paddingBottom: 30 }}>
      {!isStudent && <Pressable onPress={() => setSt(null)} style={{ alignSelf: "flex-start" }}><Text style={{ color: colors.info, fontWeight: "700" }}>← Change student</Text></Pressable>}
      <ViewShot ref={shot} options={{ format: "png", quality: 1 }}>
        <View style={s.card}>
          <View style={s.head}><Text style={s.school}>{school?.name ?? "Zipschool OS"}</Text><Text style={s.sub}>Student Identity Card</Text></View>
          <View style={{ alignItems: "center", marginTop: -28 }}>
            {photo ? <Image source={{ uri: photo }} style={s.photo} /> : <View style={[s.photo, s.ph]}><Text style={s.init}>{String(st.name ?? "?").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}</Text></View>}
            <Text style={s.name}>{String(st.name ?? "—")}</Text>
          </View>
          <View style={{ padding: 16, gap: 6 }}>
            <Line k="Admission ID" v={st.admissionNo} />
            <Line k="Class" v={`${st.class ?? "—"} · ${st.section ?? "—"}${st.rollNo ? ` — Roll ${st.rollNo}` : ""}`} />
            <Line k="Date of Birth" v={d(st.dob)} /><Line k="Blood Group" v={st.bloodGroup} /><Line k="House" v={st.house && `${st.house} House`} />
            <Line k="Parent" v={st.parentName ?? st.fatherName} /><Line k="Contact" v={st.parentContact} />
          </View>
          <View style={[s.foot, { backgroundColor: accent }]}><Text style={s.fid}>ID {String(st.idCardNumber ?? st.admissionNo ?? "—")}</Text>{!!st.idCardIssuedAt && <Text style={s.fiss}>Issued {d(st.idCardIssuedAt)}</Text>}</View>
        </View>
      </ViewShot>
      <View style={{ width: "100%" }}><Button title="Share / save as image" onPress={share} loading={busy} /></View>
    </ScrollView>
  );
}
const s = StyleSheet.create({
  root: { flex: 1, padding: 16, backgroundColor: colors.paper }, n: { fontWeight: "700", color: colors.ink },
  card: { width: 300, backgroundColor: "#fff", borderRadius: 20, overflow: "hidden", borderWidth: 1, borderColor: colors.border },
  head: { backgroundColor: colors.ink, paddingTop: 18, paddingBottom: 46, alignItems: "center" }, school: { color: "#fff", fontWeight: "800", fontSize: 16 }, sub: { color: colors.amber, fontSize: 11, marginTop: 2 },
  photo: { width: 92, height: 92, borderRadius: 18, borderWidth: 3, borderColor: "#fff" }, ph: { backgroundColor: "#F6EFE3", alignItems: "center", justifyContent: "center" }, init: { fontSize: 28, fontWeight: "800", color: "#B4652F" },
  name: { fontSize: 18, fontWeight: "800", color: colors.ink, marginTop: 8 },
  line: { flexDirection: "row", justifyContent: "space-between" }, k: { color: colors.muted, fontSize: 11.5 }, v: { color: colors.ink, fontWeight: "700", fontSize: 12.5, flexShrink: 1, textAlign: "right" },
  foot: { paddingVertical: 10, paddingHorizontal: 16, flexDirection: "row", justifyContent: "space-between" }, fid: { color: "#fff", fontWeight: "800" }, fiss: { color: "#fff", fontSize: 10 },
});
