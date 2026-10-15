import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";

export interface Picked { uri: string; name: string; type: string; size?: number }
const MAX = 5 * 1024 * 1024;

export async function pickImage(fromCamera = false): Promise<Picked | null> {
  const perm = fromCamera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error("Permission denied. Enable it in phone settings.");
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.7 };
  const r = fromCamera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  if (r.canceled) return null;
  const a = r.assets[0];
  if (a.fileSize && a.fileSize > MAX) throw new Error("Photo must be under 5 MB");
  const ext = (a.uri.split(".").pop() || "jpg").toLowerCase();
  return { uri: a.uri, name: a.fileName || `photo.${ext}`, type: a.mimeType || `image/${ext === "jpg" ? "jpeg" : ext}`, size: a.fileSize };
}

export async function pickDocument(): Promise<Picked | null> {
  const r = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "image/*", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"], copyToCacheDirectory: true });
  if (r.canceled) return null;
  const a = r.assets[0];
  if (a.size && a.size > 10 * 1024 * 1024) throw new Error("File must be under 10 MB");
  return { uri: a.uri, name: a.name, type: a.mimeType || "application/octet-stream", size: a.size };
}

// React Native FormData accepts { uri, name, type } as a file part.
export function toFormData(field: string, file: Picked, extra: Record<string, string | undefined> = {}) {
  const fd = new FormData();
  fd.append(field, { uri: file.uri, name: file.name, type: file.type } as unknown as Blob);
  Object.entries(extra).forEach(([k, v]) => { if (v) fd.append(k, v); });
  return fd;
}
