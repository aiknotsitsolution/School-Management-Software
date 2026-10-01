import React, { useEffect, useMemo, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { send } from "../lib/api";
import { label } from "../lib/format";
import { Button, Input } from "../components/UI";
import { colors } from "../theme";
import type { RootStackParams } from "../../App";

const SKIP = new Set(["_id", "__v", "id", "password", "schoolId", "createdAt", "updatedAt", "photo", "avatar", "userId"]);

// Auto-builds an edit form from the record's primitive fields and PUTs only what changed.
export default function EditRecordScreen({ route, navigation }: NativeStackScreenProps<RootStackParams, "Edit">) {
  const { endpoint, row } = route.params;
  const editable = useMemo(() => Object.entries(row).filter(([k, v]) => !SKIP.has(k) && (typeof v === "string" || typeof v === "number") ), [row]);
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(editable.map(([k, v]) => [k, String(v)])));
  const [busy, setBusy] = useState(false);
  useEffect(() => { navigation.setOptions({ title: "Edit record" }); }, [navigation]);

  const save = async () => {
    const changed: Record<string, string | number> = {};
    editable.forEach(([k, v]) => { if (String(v) !== values[k]) changed[k] = typeof v === "number" ? Number(values[k]) : values[k]; });
    if (!Object.keys(changed).length) return Alert.alert("No changes", "Nothing was edited");
    setBusy(true);
    try {
      await send(`${endpoint}/${row._id}`, "PUT", changed);
      Alert.alert("Saved", "Record updated", [{ text: "OK", onPress: () => navigation.popToTop() }]);
    } catch (e) { Alert.alert("Error", (e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView style={{ backgroundColor: colors.paper }} contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
        {editable.map(([k, v]) => (
          <View key={k} style={{ gap: 5 }}>
            <Text style={s.l}>{label(k)}</Text>
            <Input value={values[k]} onChangeText={(t) => setValues((p) => ({ ...p, [k]: t }))} keyboardType={typeof v === "number" ? "numeric" : "default"} />
          </View>
        ))}
        <Button title="Save changes" onPress={save} loading={busy} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
const s = StyleSheet.create({ l: { fontSize: 12.5, fontWeight: "700", color: colors.muted } });
