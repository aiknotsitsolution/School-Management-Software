import React, { useEffect, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { send } from "../lib/api";
import { FORMS } from "../lib/forms";
import { Button, Input } from "../components/UI";
import { colors } from "../theme";
import type { RootStackParams } from "../../App";

export default function FormScreen({ route, navigation }: NativeStackScreenProps<RootStackParams, "Form">) {
  const spec = FORMS[route.params.form];
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(spec.fields.map((f) => [f.key, route.params.initial?.[f.key] ?? f.initial ?? ""])));
  const [busy, setBusy] = useState(false);
  useEffect(() => { navigation.setOptions({ title: spec.title }); }, [navigation, spec.title]);
  const set = (k: string, v: string) => setValues((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    const missing = spec.fields.filter((f) => f.required && !values[f.key]?.trim()).map((f) => f.label);
    if (missing.length) return Alert.alert("Required", `Please fill: ${missing.join(", ")}`);
    setBusy(true);
    try {
      const payload = spec.transform ? spec.transform(values)
        : Object.fromEntries(Object.entries(values).filter(([, v]) => v.trim()).map(([k, v]) => [k, v.trim()]));
      await send(spec.endpoint, spec.method, payload);
      Alert.alert("Success", `${spec.title} completed`, [{ text: "OK", onPress: () => navigation.goBack() }]);
    } catch (e) { Alert.alert("Error", (e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView style={{ backgroundColor: colors.paper }} contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">
        {spec.fields.map((f) => (
          <View key={f.key} style={{ gap: 6 }}>
            <Text style={s.label}>{f.label}{f.required ? " *" : ""}</Text>
            {f.type === "select" ? (
              <View style={s.chips}>
                {f.options!.map((o) => (
                  <Pressable key={o} onPress={() => set(f.key, o)} style={[s.chip, values[f.key] === o && s.chipOn]}>
                    <Text style={[s.chipT, values[f.key] === o && { color: "#fff" }]}>{o}</Text>
                  </Pressable>
                ))}
              </View>
            ) : (
              <Input value={values[f.key]} onChangeText={(t) => set(f.key, t)} multiline={f.type === "multiline"}
                style={f.type === "multiline" ? { minHeight: 90, textAlignVertical: "top" } : undefined}
                keyboardType={f.type === "number" ? "numeric" : f.type === "phone" ? "phone-pad" : f.type === "email" ? "email-address" : "default"}
                autoCapitalize={f.type === "email" ? "none" : "sentences"} placeholder={f.type === "date" ? "2026-09-28" : undefined} />
            )}
          </View>
        ))}
        <Button title={spec.title} onPress={submit} loading={busy} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
const s = StyleSheet.create({
  label: { fontSize: 12.5, fontWeight: "700", color: colors.muted },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: "#fff" },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink }, chipT: { color: colors.ink, fontSize: 13, fontWeight: "600" },
});
