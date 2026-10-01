import React, { useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { uploadForm } from "../lib/api";
import { pickDocument, pickImage, Picked, toFormData } from "../lib/upload";
import { Button, Card, Input } from "../components/UI";
import { colors } from "../theme";
import type { RootStackParams } from "../../App";

export default function UploadDocumentScreen({ navigation }: NativeStackScreenProps<RootStackParams, "UploadDocument">) {
  const [file, setFile] = useState<Picked | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [studentId, setStudentId] = useState("");
  const [busy, setBusy] = useState(false);
  const wrap = (fn: () => Promise<Picked | null>) => async () => { try { const f = await fn(); if (f) { setFile(f); if (!title) setTitle(f.name.replace(/\.[^.]+$/, "")); } } catch (e) { Alert.alert("Error", (e as Error).message); } };

  const upload = async () => {
    if (!file) return Alert.alert("Required", "Choose a file first");
    setBusy(true);
    try {
      await uploadForm("/documents", toFormData("file", file, { title: title.trim(), category: category.trim(), studentId: studentId.trim() }));
      Alert.alert("Uploaded", "Document uploaded", [{ text: "OK", onPress: () => navigation.goBack() }]);
    } catch (e) { Alert.alert("Upload failed", (e as Error).message); } finally { setBusy(false); }
  };
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.paper }} contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">
      <Card>
        <Text style={s.f}>{file ? `${file.name}${file.size ? ` · ${(file.size / 1024).toFixed(0)} KB` : ""}` : "No file selected"}</Text>
        <View style={{ gap: 8, marginTop: 12 }}>
          <Button title="Choose file (PDF / Word / image)" variant="ghost" onPress={wrap(pickDocument)} />
          <Button title="Pick from gallery" variant="ghost" onPress={wrap(() => pickImage(false))} />
          <Button title="Take photo" variant="ghost" onPress={wrap(() => pickImage(true))} />
        </View>
      </Card>
      <Input placeholder="Title" value={title} onChangeText={setTitle} />
      <Input placeholder="Category (e.g. Birth Certificate)" value={category} onChangeText={setCategory} />
      <Input placeholder="Student ID / Admission No (optional)" value={studentId} onChangeText={setStudentId} />
      <Button title="Upload" onPress={upload} loading={busy} />
    </ScrollView>
  );
}
const s = StyleSheet.create({ f: { color: colors.ink, fontWeight: "600" } });
