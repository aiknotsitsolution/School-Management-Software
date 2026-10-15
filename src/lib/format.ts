const TITLE_KEYS = ["name", "title", "fullName", "studentName", "bookTitle", "examName", "subject", "invoiceNo", "receiptNo", "planName", "action", "message", "email"];
const HIDE = new Set(["_id", "__v", "password", "schoolId", "createdAt", "updatedAt", "id", "photo", "avatar"]);

export type Row = Record<string, unknown>;

export function extractList(data: unknown): Row[] {
  if (Array.isArray(data)) return data as Row[];
  if (data && typeof data === "object") {
    const arr = Object.values(data as Row).find(Array.isArray);
    if (arr) return arr as Row[];
  }
  return [];
}

export const label = (k: string) => k.replace(/([A-Z])/g, " $1").replace(/[_-]/g, " ").replace(/^\w/, (c) => c.toUpperCase());

export function display(v: unknown): string {
  if (v == null || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) return new Date(v).toLocaleDateString();
  if (Array.isArray(v)) return v.map(display).join(", ") || "—";
  if (typeof v === "object") {
    const o = v as Row;
    const t = TITLE_KEYS.map((k) => o[k]).find((x) => typeof x === "string");
    return (t as string) ?? JSON.stringify(v);
  }
  return String(v);
}

export function titleOf(r: Row): string {
  for (const k of TITLE_KEYS) { const v = r[k]; if (v != null && v !== "") return display(v); }
  return display(r._id);
}

export function previewFields(r: Row, n = 3): [string, string][] {
  return Object.entries(r)
    .filter(([k, v]) => !HIDE.has(k) && !TITLE_KEYS.includes(k) && v != null && v !== "" && typeof v !== "object")
    .slice(0, n).map(([k, v]) => [label(k), display(v)]);
}

export const detailFields = (r: Row): [string, string][] =>
  Object.entries(r).filter(([k]) => !HIDE.has(k) || k === "createdAt").map(([k, v]) => [label(k), display(v)]);
