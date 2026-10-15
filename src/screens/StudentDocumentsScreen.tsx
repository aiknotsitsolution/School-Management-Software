import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Card, Input } from "../components/UI";
import { get, send, uploadForm } from "../lib/api";
import { extractList, Row } from "../lib/format";
import {
  pickDocument,
  pickImage,
  toFormData,
  type Picked,
} from "../lib/upload";
import { colors } from "../theme";

type StudentDocument = Row & {
  _id: string;
  title?: string;
  category?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  url?: string;
  createdAt?: string;
  uploadedBy?: string;
};

const CATEGORIES = ["academic", "identity", "health", "transfer", "other"];
const CATEGORY_STYLE: Record<string, { color: string; background: string }> = {
  academic: { color: colors.info, background: "#EAF2F8" },
  identity: { color: colors.success, background: "#E8F7EF" },
  health: { color: "#7257C8", background: "#F1EDFC" },
  transfer: { color: colors.amberDark, background: "#FFF4DF" },
  other: { color: colors.muted, background: "#F0F2F5" },
};

const formatDate = (value?: string) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
};

const formatSize = (value?: number) => {
  if (!value) return "";
  return value >= 1024 * 1024
    ? `${(value / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(value / 1024))} KB`;
};

export default function StudentDocumentsScreen() {
  const [documents, setDocuments] = useState<StudentDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("other");
  const [file, setFile] = useState<Picked | null>(null);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const response = await get("/documents?limit=100");
      setDocuments(extractList(response.data) as StudentDocument[]);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load your documents.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const chooseFile = async (picker: () => Promise<Picked | null>) => {
    try {
      const selected = await picker();
      if (!selected) return;
      setFile(selected);
      if (!title.trim()) setTitle(selected.name.replace(/\.[^.]+$/, ""));
    } catch (pickError) {
      Alert.alert(
        "Could not select file",
        pickError instanceof Error ? pickError.message : "Please try again.",
      );
    }
  };

  const upload = async () => {
    if (!file) {
      Alert.alert(
        "Choose a file",
        "Select an image, PDF or Word document first.",
      );
      return;
    }
    if (!title.trim()) {
      Alert.alert("Title required", "Enter a title for this document.");
      return;
    }
    setUploading(true);
    setError("");
    try {
      const response = await uploadForm<StudentDocument>(
        "/documents",
        toFormData("file", file, {
          title: title.trim(),
          category,
        }),
      );
      setDocuments((previous) => [response.data, ...previous]);
      setTitle("");
      setCategory("other");
      setFile(null);
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Document upload failed.",
      );
    } finally {
      setUploading(false);
    }
  };

  const openDocument = async (document: StudentDocument) => {
    if (!document.url) {
      Alert.alert("Document unavailable", "This document has no file link.");
      return;
    }
    try {
      await Linking.openURL(document.url);
    } catch {
      Alert.alert(
        "Unable to open document",
        "This file could not be opened on your device.",
      );
    }
  };

  const removeDocument = (document: StudentDocument) => {
    Alert.alert(
      "Delete document?",
      `Remove "${document.title || document.fileName || "this document"}" from your student file?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void send(
              `/documents/${encodeURIComponent(document._id)}`,
              "DELETE",
            )
              .then(() =>
                setDocuments((previous) =>
                  previous.filter((item) => item._id !== document._id),
                ),
              )
              .catch((deleteError: unknown) =>
                Alert.alert(
                  "Could not delete document",
                  deleteError instanceof Error
                    ? deleteError.message
                    : "Please try again.",
                ),
              );
          },
        },
      ],
    );
  };

  return (
    <ScrollView
      style={s.screen}
      contentContainerStyle={s.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void load(true)}
          tintColor={colors.info}
        />
      }
    >
      <View style={s.hero}>
        <View style={s.heroIcon}>
          <Ionicons
            name="folder-open-outline"
            size={23}
            color={colors.amberDark}
          />
        </View>
        <Text style={s.eyebrow}>SCHOOL RECORDS</Text>
        <Text style={s.heroTitle}>My Documents</Text>
        <Text style={s.heroSubtitle}>
          Certificates, reports and records issued to you by the school office.
        </Text>
      </View>

      <View style={s.sectionHeading}>
        <Text style={s.sectionTitle}>Your documents</Text>
        <Text style={s.count}>{documents.length}</Text>
      </View>

      {error ? (
        <Card style={s.errorCard}>
          <Text style={s.errorText}>{error}</Text>
          <Pressable onPress={() => void load()} style={s.retryButton}>
            <Ionicons name="refresh" size={15} color={colors.info} />
            <Text style={s.retryText}>Try again</Text>
          </Pressable>
        </Card>
      ) : null}

      {loading ? (
        <ActivityIndicator size="large" color={colors.info} style={s.loader} />
      ) : documents.length ? (
        <View style={s.documentList}>
          {documents.map((document) => {
            const categoryStyle =
              CATEGORY_STYLE[document.category || "other"] ||
              CATEGORY_STYLE.other;
            return (
              <Card key={document._id} style={s.documentCard}>
                <View style={s.documentIcon}>
                  <Ionicons
                    name="document-text-outline"
                    size={19}
                    color={colors.info}
                  />
                </View>
                <View style={s.documentCopy}>
                  <View style={s.documentHeading}>
                    <Text numberOfLines={2} style={s.documentTitle}>
                      {document.title || "Document"}
                    </Text>
                    <View
                      style={[
                        s.categoryBadge,
                        { backgroundColor: categoryStyle.background },
                      ]}
                    >
                      <Text
                        style={[s.categoryText, { color: categoryStyle.color }]}
                      >
                        {document.category || "other"}
                      </Text>
                    </View>
                  </View>
                  <Text numberOfLines={2} style={s.documentMeta}>
                    {document.fileName || "File"}
                    {document.fileSize
                      ? ` · ${formatSize(document.fileSize)}`
                      : ""}
                    {` · ${formatDate(document.createdAt)}`}
                    {document.uploadedBy ? ` · by ${document.uploadedBy}` : ""}
                  </Text>
                  <View style={s.documentActions}>
                    <Pressable
                      onPress={() => void openDocument(document)}
                      style={s.openButton}
                      accessibilityRole="button"
                      accessibilityLabel={`Open ${document.title || "document"}`}
                    >
                      <Ionicons
                        name="open-outline"
                        size={15}
                        color={colors.info}
                      />
                      <Text style={s.openText}>Open</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => removeDocument(document)}
                      style={s.deleteButton}
                      accessibilityRole="button"
                      accessibilityLabel={`Delete ${document.title || "document"}`}
                    >
                      <Ionicons
                        name="trash-outline"
                        size={16}
                        color={colors.alert}
                      />
                    </Pressable>
                  </View>
                </View>
              </Card>
            );
          })}
        </View>
      ) : (
        <Card style={s.emptyCard}>
          <Ionicons
            name="document-text-outline"
            size={36}
            color={colors.muted}
          />
          <Text style={s.emptyTitle}>No documents yet</Text>
          <Text style={s.emptyText}>
            Documents issued to you by the school will appear here.
          </Text>
        </Card>
      )}

      <View style={s.sectionHeading}>
        <Text style={s.sectionTitle}>Upload your own document</Text>
      </View>
      <Card style={s.uploadCard}>
        <Text style={s.uploadDescription}>
          Attach a scanned certificate or record to your student file. The
          school office can also add documents here.
        </Text>
        <Input
          value={title}
          onChangeText={setTitle}
          placeholder="Document title"
          accessibilityLabel="Document title"
        />
        <Text style={s.fieldLabel}>Category</Text>
        <View style={s.categoryOptions}>
          {CATEGORIES.map((item) => (
            <Pressable
              key={item}
              onPress={() => setCategory(item)}
              style={[
                s.categoryOption,
                category === item && s.categoryOptionActive,
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: category === item }}
            >
              <Text
                style={[
                  s.categoryOptionText,
                  category === item && s.categoryOptionTextActive,
                ]}
              >
                {item[0].toUpperCase() + item.slice(1)}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={s.filePicker}>
          <Ionicons name="attach-outline" size={19} color={colors.info} />
          <View style={s.filePickerCopy}>
            <Text numberOfLines={2} style={s.fileName}>
              {file?.name || "Choose an image, PDF or Word file"}
            </Text>
            <Text style={s.fileHint}>
              {file?.size ? `${formatSize(file.size)} | ` : ""}Maximum 10 MB
            </Text>
          </View>
          <Pressable
            onPress={() => void chooseFile(pickDocument)}
            disabled={uploading}
            style={s.chooseButton}
            accessibilityRole="button"
            accessibilityLabel="Choose document file"
          >
            <Ionicons
              name="folder-open-outline"
              size={18}
              color={colors.info}
            />
          </Pressable>
        </View>
        <View style={s.pickerActions}>
          <Pressable
            onPress={() => void chooseFile(() => pickImage(false))}
            disabled={uploading}
            style={s.secondaryAction}
          >
            <Ionicons name="image-outline" size={16} color={colors.ink} />
            <Text style={s.secondaryActionText}>Gallery</Text>
          </Pressable>
          <Pressable
            onPress={() => void chooseFile(() => pickImage(true))}
            disabled={uploading}
            style={s.secondaryAction}
          >
            <Ionicons name="camera-outline" size={16} color={colors.ink} />
            <Text style={s.secondaryActionText}>Take photo</Text>
          </Pressable>
        </View>
        {file ? (
          <Pressable onPress={() => setFile(null)} style={s.clearFile}>
            <Ionicons
              name="close-circle-outline"
              size={15}
              color={colors.muted}
            />
            <Text style={s.clearFileText}>Remove selected file</Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={() => void upload()}
          disabled={uploading || !file}
          style={[
            s.uploadButton,
            (uploading || !file) && s.uploadButtonDisabled,
          ]}
          accessibilityRole="button"
        >
          {uploading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="cloud-upload-outline" size={17} color="#fff" />
          )}
          <Text style={s.uploadButtonText}>
            {uploading ? "Uploading…" : "Upload document"}
          </Text>
        </Pressable>
      </Card>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 16, paddingBottom: 34, gap: 12 },
  hero: {
    padding: 19,
    borderRadius: 20,
    backgroundColor: colors.ink,
    marginBottom: 5,
    borderBottomWidth: 3,
    borderBottomColor: colors.amber,
  },
  heroIcon: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    backgroundColor: "#fff",
    marginBottom: 13,
  },
  eyebrow: {
    color: "#F0C77F",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.3,
  },
  heroTitle: { color: "#fff", fontSize: 23, fontWeight: "900", marginTop: 4 },
  heroSubtitle: {
    color: "#D7DCE8",
    fontSize: 11,
    lineHeight: 17,
    marginTop: 5,
  },
  sectionHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  sectionTitle: { color: colors.ink, fontSize: 15, fontWeight: "800" },
  count: { color: colors.muted, fontSize: 11, fontWeight: "800" },
  loader: { marginVertical: 24 },
  errorCard: { gap: 8, borderColor: "#F2C6C2" },
  errorText: { color: colors.alert, fontSize: 11, lineHeight: 16 },
  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
  },
  retryText: { color: colors.info, fontSize: 11, fontWeight: "800" },
  documentList: { gap: 9 },
  documentCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 12,
  },
  documentIcon: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
    backgroundColor: "#EAF2F8",
  },
  documentCopy: { flex: 1, minWidth: 0, gap: 7 },
  documentHeading: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 7,
  },
  documentTitle: {
    flex: 1,
    color: colors.ink,
    fontSize: 12,
    fontWeight: "800",
  },
  categoryBadge: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 4 },
  categoryText: { fontSize: 8, fontWeight: "900" },
  documentMeta: { color: colors.muted, fontSize: 9, lineHeight: 14 },
  documentActions: { flexDirection: "row", alignItems: "center", gap: 7 },
  openButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#EAF2F8",
  },
  openText: { color: colors.info, fontSize: 10, fontWeight: "800" },
  deleteButton: {
    width: 31,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: "#FDECEC",
  },
  emptyCard: {
    minHeight: 150,
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    padding: 20,
  },
  emptyTitle: { color: colors.ink, fontSize: 14, fontWeight: "800" },
  emptyText: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 16,
    textAlign: "center",
  },
  uploadCard: { gap: 11 },
  uploadDescription: { color: colors.muted, fontSize: 10, lineHeight: 15 },
  fieldLabel: { color: colors.ink, fontSize: 10, fontWeight: "800" },
  categoryOptions: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  categoryOption: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    backgroundColor: "#fff",
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  categoryOptionActive: {
    borderColor: colors.ink,
    backgroundColor: colors.ink,
  },
  categoryOptionText: { color: colors.muted, fontSize: 9, fontWeight: "700" },
  categoryOptionTextActive: { color: "#fff" },
  filePicker: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 10,
    backgroundColor: "#FBFAF7",
  },
  filePickerCopy: { flex: 1, minWidth: 0, gap: 3 },
  fileName: { color: colors.ink, fontSize: 10, fontWeight: "700" },
  fileHint: { color: colors.muted, fontSize: 9 },
  chooseButton: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: "#EAF2F8",
  },
  pickerActions: { flexDirection: "row", gap: 8 },
  secondaryAction: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 9,
    backgroundColor: "#fff",
    paddingVertical: 9,
  },
  secondaryActionText: { color: colors.ink, fontSize: 10, fontWeight: "700" },
  clearFile: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
  },
  clearFileText: { color: colors.muted, fontSize: 9, fontWeight: "600" },
  uploadButton: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderRadius: 10,
    backgroundColor: colors.ink,
    paddingHorizontal: 14,
  },
  uploadButtonDisabled: { opacity: 0.5 },
  uploadButtonText: { color: "#fff", fontSize: 11, fontWeight: "800" },
});
