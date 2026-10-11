import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "../components/UI";
import { get, send, uploadForm } from "../lib/api";
import { extractList, Row } from "../lib/format";
import { pickDocument, toFormData, type Picked } from "../lib/upload";
import { useAuth } from "../context/AuthContext";
import { colors } from "../theme";

type Issue = Row & {
  _id: string;
  bookTitle?: string;
  bookId?: { title?: string; author?: string; isbn?: string } | string;
  issueDate?: string;
  dueDate?: string;
  returnDate?: string;
  fine?: number;
  status?: string;
  borrowerId?: string;
  borrowerType?: string;
  borrower?: string;
};
type Book = Row & {
  _id: string;
  title: string;
  author: string;
  isbn?: string;
  category?: string;
  totalCopies: number;
  availableCopies: number;
};
type Material = Row & {
  _id: string;
  title: string;
  description?: string;
  subject: string;
  class: string;
  section?: string;
  type?: string;
  fileUrl?: string;
  linkUrl?: string;
  fileName?: string;
  fileSize?: number;
  pageCount?: number;
  createdAt?: string;
};
type LibraryTab = "books" | "issued" | "materials";
type BookForm = { title: string; author: string; isbn: string; category: string; copies: string };
type MaterialForm = {
  title: string;
  description: string;
  subject: string;
  class: string;
  section: string;
  type: string;
  linkUrl: string;
  file: Picked | null;
  fileUrl: string;
  fileName: string;
  fileSize: number | null;
};

const emptyBookForm = (): BookForm => ({
  title: "", author: "", isbn: "", category: "Fiction", copies: "1",
});
const emptyMaterialForm = (): MaterialForm => ({
  title: "", description: "", subject: "", class: "", section: "",
  type: "notes", linkUrl: "", file: null, fileUrl: "", fileName: "", fileSize: null,
});
const MATERIAL_TYPES = ["notes", "worksheet", "ebook", "video", "link", "other"];
type TypeInfo = { label: string; icon: keyof typeof Ionicons.glyphMap; color: string; bg: string };

const TYPE_INFO: Record<string, TypeInfo> = {
  notes: { label: "Notes", icon: "document-text-outline", color: "#2563C7", bg: "#EAF2FF" },
  worksheet: { label: "Worksheet", icon: "reader-outline", color: "#7A46B7", bg: "#F3ECFC" },
  ebook: { label: "E-Book", icon: "book-outline", color: "#15966A", bg: "#E8F7EF" },
  video: { label: "Video", icon: "play-circle-outline", color: "#D35454", bg: "#FDECEC" },
  link: { label: "Link", icon: "link-outline", color: "#B77912", bg: "#FFF5DF" },
  other: { label: "Other", icon: "document-outline", color: "#667085", bg: "#F0F2F5" },
};

function dateKey(value: unknown): string {
  if (!value) return "";
  const raw = String(value);
  const dateOnly = /^(\d{4}-\d{2}-\d{2})$/.exec(raw);
  if (dateOnly) return dateOnly[1];
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
  return `${values.year}-${values.month}-${values.day}`;
}

function formatDate(value: unknown): string {
  const key = dateKey(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return value ? String(value) : "—";
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
  return date.toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function issueBookTitle(issue: Issue): string {
  if (issue.bookTitle) return issue.bookTitle;
  if (issue.bookId && typeof issue.bookId === "object" && issue.bookId.title) {
    return issue.bookId.title;
  }
  return "Book";
}

function isOverdue(issue: Issue, today: string): boolean {
  return !issue.returnDate && !!issue.dueDate && dateKey(issue.dueDate) < today;
}

function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[s.filterChip, active && s.filterChipActive]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={[s.filterChipText, active && s.filterChipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function IssueCard({
  issue,
  overdue,
  onReturn,
}: {
  issue: Issue;
  overdue: boolean;
  onReturn?: () => void;
}) {
  const book =
    issue.bookId && typeof issue.bookId === "object" ? issue.bookId : undefined;
  const returned = Boolean(issue.returnDate) || issue.status === "Returned";
  return (
    <Card style={s.recordCard}>
      <View style={s.recordTop}>
        <View style={s.bookIcon}>
          <Ionicons name="book" size={20} color={colors.amberDark} />
        </View>
        <View style={s.recordInfo}>
          <Text style={s.bookTitle}>{issueBookTitle(issue)}</Text>
          {!!(book?.author || book?.isbn) && (
            <Text style={s.bookMeta}>
              {[book.author, book.isbn ? `ISBN ${book.isbn}` : ""].filter(Boolean).join(" · ")}
            </Text>
          )}
        </View>
        <View
          style={[
            s.statusBadge,
            overdue ? s.overdueBadge : returned ? s.returnedBadge : s.issuedBadge,
          ]}
        >
          <Text
            style={[
              s.statusText,
              overdue ? s.overdueText : returned ? s.returnedText : s.issuedText,
            ]}
          >
            {overdue ? "Overdue" : returned ? "Returned" : "Issued"}
          </Text>
        </View>
      </View>
      <View style={s.dateInfoRow}>
        <View style={s.dateInfo}>
          <Ionicons name="log-in-outline" size={14} color={colors.muted} />
          <Text style={s.dateLabel}>Issued {formatDate(issue.issueDate || issue.createdAt)}</Text>
        </View>
        {returned ? (
          <View style={s.dateInfo}>
            <Ionicons name="checkmark-circle-outline" size={14} color="#15966A" />
            <Text style={s.dateLabel}>Returned {formatDate(issue.returnDate)}</Text>
          </View>
        ) : (
          <View style={s.dateInfo}>
            <Ionicons
              name="calendar-outline"
              size={14}
              color={overdue ? colors.alert : colors.muted}
            />
            <Text style={[s.dateLabel, overdue && { color: colors.alert, fontWeight: "700" }]}>
              Due {formatDate(issue.dueDate)}
            </Text>
          </View>
        )}
      </View>
        {!!issue.borrowerId && (
          <Text style={s.borrowerText}>
            Borrower: {issue.borrower || issue.borrowerId}
          </Text>
        )}
        {returned && Number(issue.fine) > 0 && (
          <Text style={s.fineText}>Fine: ₹{Number(issue.fine).toLocaleString("en-IN")}</Text>
        )}
        {onReturn && !returned && (
          <Pressable onPress={onReturn} style={s.returnButton}>
            <Ionicons name="return-down-back-outline" size={15} color="#15966A" />
            <Text style={s.returnButtonText}>Return book</Text>
          </Pressable>
        )}
    </Card>
    );
}

function BookCard({
    book,
    canManage,
    onEdit,
    onDelete,
}: {
    book: Book;
    canManage: boolean;
    onEdit: () => void;
    onDelete: () => void;
}) {
    const available = Number(book.availableCopies || 0);
    return (
      <Card style={s.recordCard}>
        <View style={s.recordTop}>
          <View style={s.bookIcon}>
            <Ionicons name="book" size={20} color={colors.amberDark} />
          </View>
          <View style={s.recordInfo}>
            <Text style={s.bookTitle}>{book.title}</Text>
            <Text style={s.bookMeta}>by {book.author}{book.isbn ? ` · ISBN ${book.isbn}` : ""}</Text>
          </View>
          <View style={[s.statusBadge, available <= 1 ? s.overdueBadge : s.returnedBadge]}>
            <Text style={[s.statusText, available <= 1 ? s.overdueText : s.returnedText]}>
              {available <= 1 ? "Low / Out" : "In Stock"}
            </Text>
          </View>
        </View>
        <View style={s.dateInfoRow}>
          <Text style={s.dateLabel}>Category: {book.category || "—"}</Text>
          <Text style={s.dateLabel}>Copies: {book.totalCopies}</Text>
          <Text style={s.dateLabel}>Available: {available}</Text>
        </View>
        {canManage && (
          <View style={s.cardActions}>
            <Pressable onPress={onEdit} style={s.smallAction}>
              <Ionicons name="create-outline" size={16} color={colors.ink} />
              <Text style={s.smallActionText}>Edit</Text>
            </Pressable>
            <Pressable onPress={onDelete} style={s.smallAction}>
              <Ionicons name="trash-outline" size={16} color={colors.alert} />
              <Text style={[s.smallActionText, { color: colors.alert }]}>Delete</Text>
            </Pressable>
          </View>
        )}
      </Card>
    );
}

function MaterialCard({
    material,
    onOpen,
    canWrite,
    onEdit,
    onDelete,
}: {
    material: Material;
    onOpen: (url: string) => void;
    canWrite: boolean;
    onEdit: () => void;
    onDelete: () => void;
}) {
  const type = TYPE_INFO[material.type || "other"] || TYPE_INFO.other;
  const files = Number(material.fileSize);
  const fileSize = Number.isFinite(files) && files > 0
    ? files >= 1024 * 1024
      ? `${(files / (1024 * 1024)).toFixed(1)} MB`
      : `${Math.max(1, Math.round(files / 1024))} KB`
    : "";
  return (
    <Card style={s.materialCard}>
      <View style={s.materialTop}>
        <View style={[s.materialIcon, { backgroundColor: type.bg }]}>
          <Ionicons name={type.icon} size={21} color={type.color} />
        </View>
        <View style={s.recordInfo}>
          <Text style={s.materialTitle}>{material.title}</Text>
          <Text style={s.bookMeta}>
            {material.subject} · Class {material.class}
            {material.section ? ` ${material.section}` : ""}
          </Text>
        </View>
        <View style={[s.typeBadge, { backgroundColor: type.bg }]}>
          <Text style={[s.typeText, { color: type.color }]}>{type.label}</Text>
        </View>
      </View>
      {!!material.description && (
        <Text style={s.description} numberOfLines={3}>{material.description}</Text>
      )}
      {!!(material.fileName || material.pageCount || fileSize) && (
        <Text style={s.fileMeta} numberOfLines={1}>
          {[material.fileName, material.pageCount ? `${material.pageCount} pages` : "", fileSize]
            .filter(Boolean)
            .join(" · ")}
        </Text>
      )}
      <View style={s.materialActions}>
        {!!material.fileUrl && (
          <Pressable
            onPress={() => onOpen(material.fileUrl!)}
            style={[s.openButton, { backgroundColor: type.bg }]}
            accessibilityRole="button"
          >
            <Ionicons name="open-outline" size={15} color={type.color} />
            <Text style={[s.openButtonText, { color: type.color }]}>
              {material.type === "ebook" ? "Read / Open" : "Open file"}
            </Text>
          </Pressable>
        )}
        {!!material.linkUrl && (
          <Pressable
            onPress={() => onOpen(material.linkUrl!)}
            style={[s.openButton, { backgroundColor: "#EAF2FF" }]}
            accessibilityRole="button"
          >
            <Ionicons name="link-outline" size={15} color="#2563C7" />
            <Text style={[s.openButtonText, { color: "#2563C7" }]}>Open link</Text>
          </Pressable>
        )}
        {!!material.createdAt && (
          <Text style={s.createdDate}>{formatDate(material.createdAt)}</Text>
        )}
      </View>
      {canWrite && (
        <View style={s.cardActions}>
          <Pressable onPress={onEdit} style={s.smallAction}>
            <Ionicons name="create-outline" size={16} color={colors.ink} />
            <Text style={s.smallActionText}>Edit</Text>
          </Pressable>
          <Pressable onPress={onDelete} style={s.smallAction}>
            <Ionicons name="trash-outline" size={16} color={colors.alert} />
            <Text style={[s.smallActionText, { color: colors.alert }]}>Delete</Text>
          </Pressable>
        </View>
      )}
    </Card>
  );
}

export default function LibraryScreen() {
  const { user, can } = useAuth();
  const isStudent = user?.role === "student";
  const canManage = can("library:manage");
  const canWriteMaterials = can("library:manage") || can("homework:write");
  const canNotify = can("library:notify");
  const [tab, setTab] = useState<LibraryTab>(isStudent ? "issued" : "books");
  const [books, setBooks] = useState<Book[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [booksLoading, setBooksLoading] = useState(true);
  const [issuesLoading, setIssuesLoading] = useState(true);
  const [materialsLoading, setMaterialsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [issuesError, setIssuesError] = useState("");
  const [materialsError, setMaterialsError] = useState("");
  const [booksError, setBooksError] = useState("");
  const [search, setSearch] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [bookQuery, setBookQuery] = useState("");
  const [bookModal, setBookModal] = useState(false);
  const [editingBook, setEditingBook] = useState<Book | null>(null);
  const [bookForm, setBookForm] = useState<BookForm>(emptyBookForm);
  const [issueModal, setIssueModal] = useState(false);
  const [selectedBookId, setSelectedBookId] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [students, setStudents] = useState<Row[]>([]);
  const [dueDate, setDueDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() + 14);
    return date.toISOString().slice(0, 10);
  });
  const [materialModal, setMaterialModal] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
  const [materialForm, setMaterialForm] = useState<MaterialForm>(emptyMaterialForm);
  const [saving, setSaving] = useState(false);
  const [notifying, setNotifying] = useState(false);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else {
      setIssuesLoading(true);
      setMaterialsLoading(true);
    }
    setIssuesError("");
    setMaterialsError("");
    setBooksError("");
    const [bookResult, issueResult, materialResult] = await Promise.allSettled([
      get("/library/books?limit=1000"),
      get("/library/issues?limit=1000"),
      get("/study-materials?limit=100"),
    ]);
    if (bookResult.status === "fulfilled") {
      setBooks(extractList(bookResult.value.data).filter((row) => typeof row._id === "string") as Book[]);
    } else {
      setBooksError(bookResult.reason instanceof Error ? bookResult.reason.message : "Could not load the book catalogue.");
    }
    if (issueResult.status === "fulfilled") {
      setIssues(extractList(issueResult.value.data).filter((row) => typeof row._id === "string") as Issue[]);
    } else {
      setIssuesError(
        issueResult.reason instanceof Error
          ? issueResult.reason.message
          : "Could not load issued books.",
      );
    }
    if (materialResult.status === "fulfilled") {
      setMaterials(extractList(materialResult.value.data).filter((row) => typeof row._id === "string") as Material[]);
    } else {
      setMaterialsError(
        materialResult.reason instanceof Error
          ? materialResult.reason.message
          : "Could not load study materials.",
      );
    }
    setIssuesLoading(false);
    setMaterialsLoading(false);
    setBooksLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!canManage) return;
    get("/students?limit=1000")
      .then((response) => setStudents(extractList(response.data)))
      .catch((error: unknown) => {
        Alert.alert(
          "Could not load students",
          error instanceof Error ? error.message : "Please try again.",
        );
      });
  }, [canManage]);

  const today = dateKey(new Date());
  const activeIssues = useMemo(
    () => issues.filter((issue) => !issue.returnDate && issue.status !== "Returned"),
    [issues],
  );
  const returnedIssues = useMemo(
    () => issues.filter((issue) => Boolean(issue.returnDate) || issue.status === "Returned"),
    [issues],
  );
  const overdueCount = activeIssues.filter((issue) => isOverdue(issue, today)).length;
  const totalCopies = books.reduce((sum, book) => sum + Number(book.totalCopies || 0), 0);
  const availableCopies = books.reduce((sum, book) => sum + Number(book.availableCopies || 0), 0);
  const filteredBooks = useMemo(() => {
    const query = bookQuery.trim().toLowerCase();
    return books.filter((book) =>
      `${book.title} ${book.author} ${book.isbn || ""} ${book.category || ""}`
        .toLowerCase()
        .includes(query),
    );
  }, [books, bookQuery]);

  const subjects = useMemo(
    () => [...new Set(materials.map((item) => item.subject).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [materials],
  );
  const types = useMemo(
    () => [...new Set(materials.map((item) => item.type || "other"))].sort(),
    [materials],
  );
  const filteredMaterials = useMemo(() => {
    const query = search.trim().toLowerCase();
    return materials.filter((item) => {
      const searchable = `${item.title} ${item.subject} ${item.description || ""}`.toLowerCase();
      return (
        (!query || searchable.includes(query)) &&
        (!subjectFilter || item.subject === subjectFilter) &&
        (!typeFilter || (item.type || "other") === typeFilter)
      );
    });
  }, [materials, search, subjectFilter, typeFilter]);

  const openUrl = useCallback(async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert("Unable to open", "This file or link could not be opened on this device.");
    }
  }, []);

  const listData: Row[] =
    tab === "books"
      ? filteredBooks
      : tab === "issued"
        ? activeIssues
        : filteredMaterials;
  const loading = tab === "books" ? booksLoading : tab === "issued" ? issuesLoading : materialsLoading;
  const error = tab === "books" ? booksError : tab === "issued" ? issuesError : materialsError;
  const empty = tab === "books"
    ? filteredBooks.length === 0
    : tab === "issued"
      ? activeIssues.length === 0
      : filteredMaterials.length === 0;

  const openAddBook = () => {
    setEditingBook(null);
    setBookForm(emptyBookForm());
    setBookModal(true);
  };

  const openEditBook = (book: Book) => {
    setEditingBook(book);
    setBookForm({
      title: book.title,
      author: book.author,
      isbn: book.isbn || "",
      category: book.category || "Fiction",
      copies: String(book.totalCopies),
    });
    setBookModal(true);
  };

  const saveBook = async () => {
    const copies = Number(bookForm.copies);
    if (!bookForm.title.trim() || !bookForm.author.trim() || !Number.isInteger(copies) || copies < 1) {
      Alert.alert("Check book details", "Title, author and a positive whole number of copies are required.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: bookForm.title.trim(),
        author: bookForm.author.trim(),
        isbn: bookForm.isbn.trim(),
        category: bookForm.category.trim(),
        totalCopies: copies,
      };
      const response = editingBook
        ? await send(`/library/books/${editingBook._id}`, "PUT", payload)
        : await send("/library/books", "POST", payload);
      const saved = response.data as Book;
      setBooks((previous) =>
        editingBook
          ? previous.map((book) => (book._id === editingBook._id ? saved : book))
          : [saved, ...previous],
      );
      setBookModal(false);
    } catch (error) {
      Alert.alert("Could not save book", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const deleteBook = (book: Book) => {
    Alert.alert("Delete book?", `Remove "${book.title}" from the catalogue?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void send(`/library/books/${book._id}`, "DELETE")
            .then(() => setBooks((previous) => previous.filter((item) => item._id !== book._id)))
            .catch((error: unknown) => Alert.alert("Could not delete book", error instanceof Error ? error.message : "Please try again."));
        },
      },
    ]);
  };

  const issueBook = async () => {
    const selectedStudent = students.find((student) => student._id === selectedStudentId);
    if (!selectedBookId || !selectedStudent || !dueDate) {
      Alert.alert("Complete issue details", "Choose a book, student and due date.");
      return;
    }
    setSaving(true);
    try {
      await send("/library/issues/issue", "POST", {
        bookId: selectedBookId,
        borrowerId: typeof selectedStudent.admissionNo === "string" && selectedStudent.admissionNo
          ? selectedStudent.admissionNo
          : selectedStudentId,
        borrowerType: "student",
        dueDate,
      });
      setIssueModal(false);
      setSelectedStudentId("");
      await load(true);
    } catch (error) {
      Alert.alert("Could not issue book", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const returnBook = (issue: Issue) => {
    Alert.alert("Return book?", `Mark "${issueBookTitle(issue)}" as returned?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Return",
        onPress: () => {
          void send(`/library/issues/${issue._id}/return`, "PATCH", {})
            .then(() => void load(true))
            .catch((error: unknown) => Alert.alert("Could not return book", error instanceof Error ? error.message : "Please try again."));
        },
      },
    ]);
  };

  const sendOverdueNotifications = () => {
    setNotifying(true);
    void send("/library/issues/send-overdue-notifications", "POST")
      .then(() => Alert.alert("Notifications sent", "Overdue notifications were processed."))
      .catch((error: unknown) => Alert.alert("Could not notify borrowers", error instanceof Error ? error.message : "Please try again."))
      .finally(() => setNotifying(false));
  };

  const openMaterialForm = (material?: Material) => {
    setEditingMaterial(material || null);
    setMaterialForm(material ? {
      title: material.title,
      description: material.description || "",
      subject: material.subject,
      class: material.class,
      section: material.section || "",
      type: material.type || "notes",
      linkUrl: material.linkUrl || "",
      file: null,
      fileUrl: material.fileUrl || "",
      fileName: material.fileName || "",
      fileSize: typeof material.fileSize === "number" ? material.fileSize : null,
    } : emptyMaterialForm());
    setMaterialModal(true);
  };

  const saveMaterial = async () => {
    if (!materialForm.title.trim() || !materialForm.subject.trim() || !materialForm.class.trim()) {
      Alert.alert("Complete material details", "Title, subject and class are required.");
      return;
    }
    if (materialForm.type === "link" && !materialForm.linkUrl.trim()) {
      Alert.alert("Link required", "Add a link URL for this material.");
      return;
    }
    if (materialForm.type === "ebook" && !materialForm.file && !materialForm.fileUrl) {
      Alert.alert("PDF required", "Choose a PDF file for the e-book.");
      return;
    }
    setSaving(true);
    try {
      let fileUrl = materialForm.fileUrl || null;
      let fileName = materialForm.fileName || null;
      let fileSize = materialForm.fileSize;
      if (materialForm.file) {
        const upload = await uploadForm<{ url: string; fileName: string; fileSize: number }>(
          "/study-materials/upload",
          toFormData("file", materialForm.file),
        );
        fileUrl = upload.data.url;
        fileName = upload.data.fileName;
        fileSize = upload.data.fileSize;
      }
      const payload = {
        title: materialForm.title.trim(),
        description: materialForm.description.trim(),
        subject: materialForm.subject.trim(),
        class: materialForm.class.trim(),
        section: materialForm.section.trim() || null,
        type: materialForm.type,
        linkUrl: materialForm.type === "link" ? materialForm.linkUrl.trim() : null,
        fileUrl,
        fileName,
        fileSize,
      };
      if (editingMaterial) {
        await send(`/study-materials/${editingMaterial._id}`, "PATCH", payload);
      } else {
        await send("/study-materials", "POST", payload);
      }
      setMaterialModal(false);
      await load(true);
    } catch (error) {
      Alert.alert("Could not save material", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const deleteMaterial = (material: Material) => {
    Alert.alert("Delete material?", `Remove "${material.title}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void send(`/study-materials/${material._id}`, "DELETE", {})
            .then(() => setMaterials((previous) => previous.filter((item) => item._id !== material._id)))
            .catch((error: unknown) => Alert.alert("Could not delete material", error instanceof Error ? error.message : "Please try again."));
        },
      },
    ]);
  };

  return (
    <>
    <FlatList
      style={s.screen}
      contentContainerStyle={s.content}
      data={loading || error || empty ? [] : listData}
      keyExtractor={(item) => String(item._id)}
      renderItem={({ item }) =>
        tab === "books" ? (
          <BookCard
            book={item as Book}
            canManage={canManage}
            onEdit={() => openEditBook(item as Book)}
            onDelete={() => deleteBook(item as Book)}
          />
        ) : tab === "issued" ? (
          <IssueCard
            issue={item as Issue}
            overdue={isOverdue(item as Issue, today)}
            onReturn={canManage ? () => returnBook(item as Issue) : undefined}
          />
        ) : (
          <MaterialCard
            material={item as Material}
            onOpen={(url) => void openUrl(url)}
            canWrite={canWriteMaterials}
            onEdit={() => openMaterialForm(item as Material)}
            onDelete={() => deleteMaterial(item as Material)}
          />
        )
      }
      ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
      ListHeaderComponent={
        <View>
          <View style={s.hero}>
            <View style={s.heroIcon}>
              <Ionicons name="library-outline" size={25} color="#fff" />
            </View>
            <Text style={s.eyebrow}>LIBRARY</Text>
            <Text style={s.title}>{isStudent ? "My Library" : "Library"}</Text>
            <Text style={s.subtitle}>
              {isStudent
                ? "Issued books and study materials shared with your class."
                : "Books, circulation and class study materials — one shelf for the whole school."}
            </Text>
            {canNotify && (
              <Pressable
                style={s.notifyButton}
                onPress={sendOverdueNotifications}
                disabled={notifying}
              >
                <Ionicons name="notifications-outline" size={15} color="#fff" />
                <Text style={s.notifyButtonText}>
                  {notifying ? "Sending..." : "Notify Overdue"}
                </Text>
              </Pressable>
            )}
          </View>
          <View style={s.tabRow}>
            {([
              ...(!isStudent ? [["books", "Books Catalogue"]] : []),
              ["issued", isStudent ? "Issued Books" : "Issued / Returns"],
              ["materials", "Study Materials"],
            ] as [LibraryTab, string][]).map(([key, label]) => {
              const active = tab === key;
              const count = key === "books" ? books.length : key === "issued" ? activeIssues.length : materials.length;
              return (
                <Pressable
                  key={key}
                  onPress={() => setTab(key)}
                  style={[s.tabButton, active && s.activeTabButton]}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[s.tabText, active && s.activeTabText]}>
                    {label} ({count})
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {!isStudent && (
            <View style={s.managementActions}>
              {tab === "books" && canManage && (
                <Pressable onPress={openAddBook} style={s.primaryAction}>
                  <Ionicons name="add" size={17} color="#fff" />
                  <Text style={s.primaryActionText}>Add Book</Text>
                </Pressable>
              )}
              {tab === "issued" && canManage && (
                <Pressable
                  onPress={() => {
                    setSelectedBookId(books.find((book) => Number(book.availableCopies) > 0)?._id || "");
                    setSelectedStudentId("");
                    setIssueModal(true);
                  }}
                  style={s.primaryAction}
                >
                  <Ionicons name="book-outline" size={16} color="#fff" />
                  <Text style={s.primaryActionText}>Issue Book</Text>
                </Pressable>
              )}
              {tab === "materials" && canWriteMaterials && (
                <Pressable onPress={() => openMaterialForm()} style={s.primaryAction}>
                  <Ionicons name="add" size={17} color="#fff" />
                  <Text style={s.primaryActionText}>Add Material</Text>
                </Pressable>
              )}
            </View>
          )}
          {tab === "books" && (
            <>
              <View style={s.summaryRow}>
                <Card style={s.summaryCard}>
                  <Text style={s.summaryValue}>{books.length}</Text>
                  <Text style={s.summaryLabel}>Total titles</Text>
                </Card>
                <Card style={s.summaryCard}>
                  <Text style={s.summaryValue}>{availableCopies}</Text>
                  <Text style={s.summaryLabel}>Available · {totalCopies} copies</Text>
                </Card>
              </View>
              <Card style={s.searchCard}>
                <View style={s.searchRow}>
                  <Ionicons name="search" size={18} color={colors.muted} />
                  <TextInput
                    value={bookQuery}
                    onChangeText={setBookQuery}
                    placeholder="Search title, author or ISBN..."
                    placeholderTextColor="#98A2B3"
                    style={s.searchInput}
                    returnKeyType="search"
                  />
                  {!!bookQuery && (
                    <Pressable onPress={() => setBookQuery("")} hitSlop={8}>
                      <Ionicons name="close-circle" size={18} color={colors.muted} />
                    </Pressable>
                  )}
                </View>
              </Card>
            </>
          )}
          {tab === "issued" && (
            <View style={s.summaryRow}>
              <Card style={s.summaryCard}>
                <Text style={s.summaryValue}>{isStudent ? activeIssues.length : issues.filter((issue) => !issue.returnDate && issue.status !== "Returned").length}</Text>
                <Text style={s.summaryLabel}>{isStudent ? "Books with you" : "Currently issued"}</Text>
              </Card>
              <Card style={s.summaryCard}>
                <Text style={[s.summaryValue, { color: colors.alert }]}>{overdueCount}</Text>
                <Text style={s.summaryLabel}>Overdue</Text>
              </Card>
            </View>
          )}
          {tab === "materials" ? (
            <>
              <Card style={s.searchCard}>
                <View style={s.searchRow}>
                  <Ionicons name="search" size={18} color={colors.muted} />
                  <TextInput
                    value={search}
                    onChangeText={setSearch}
                    placeholder="Search materials..."
                    placeholderTextColor="#98A2B3"
                    style={s.searchInput}
                    returnKeyType="search"
                    accessibilityLabel="Search materials"
                  />
                  {!!search && (
                    <Pressable onPress={() => setSearch("")} hitSlop={8}>
                      <Ionicons name="close-circle" size={18} color={colors.muted} />
                    </Pressable>
                  )}
                </View>
              </Card>
              {!!subjects.length && (
                <>
                  <Text style={s.filterHeading}>SUBJECT</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={s.filterRow}
                  >
                    <FilterChip
                      label="All Subjects"
                      active={!subjectFilter}
                      onPress={() => setSubjectFilter("")}
                    />
                    {subjects.map((subject) => (
                      <FilterChip
                        key={subject}
                        label={subject}
                        active={subjectFilter === subject}
                        onPress={() => setSubjectFilter(subject)}
                      />
                    ))}
                  </ScrollView>
                </>
              )}
              {!!types.length && (
                <>
                  <Text style={s.filterHeading}>TYPE</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={s.filterRow}
                  >
                    <FilterChip
                      label="All Types"
                      active={!typeFilter}
                      onPress={() => setTypeFilter("")}
                    />
                    {types.map((type) => (
                      <FilterChip
                        key={type}
                        label={(TYPE_INFO[type] || TYPE_INFO.other).label}
                        active={typeFilter === type}
                        onPress={() => setTypeFilter(type)}
                      />
                    ))}
                  </ScrollView>
                </>
              )}
              <Text style={s.resultsText}>
                {filteredMaterials.length} {filteredMaterials.length === 1 ? "material" : "materials"} found
              </Text>
            </>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        <View style={s.stateContainer}>
          {loading ? (
            <ActivityIndicator size="large" color={colors.amberDark} />
          ) : error ? (
            <>
              <Ionicons name="cloud-offline-outline" size={38} color={colors.alert} />
              <Text style={s.stateTitle}>
                {tab === "books" ? "Could not load catalogue" : tab === "issued" ? "Could not load issued books" : "Could not load study materials"}
              </Text>
              <Text style={s.stateText}>{error}</Text>
              <Pressable onPress={() => void load()} style={s.retryButton}>
                <Text style={s.retryText}>Retry</Text>
              </Pressable>
            </>
          ) : tab === "books" ? (
            <>
              <Ionicons name="book-outline" size={42} color={colors.amberDark} />
              <Text style={s.stateTitle}>{bookQuery ? "No books match" : "No books in catalogue"}</Text>
              <Text style={s.stateText}>{bookQuery ? "Try a different title, author or ISBN." : "Books added to your school catalogue will appear here."}</Text>
            </>
          ) : tab === "issued" ? (
            <>
              <Ionicons name="book-outline" size={42} color={colors.amberDark} />
              <Text style={s.stateTitle}>No books issued</Text>
              <Text style={s.stateText}>
                Books you borrow from the library will show here.
              </Text>
            </>
          ) : materials.length === 0 ? (
            <>
              <Ionicons name="documents-outline" size={42} color={colors.amberDark} />
              <Text style={s.stateTitle}>No materials yet</Text>
              <Text style={s.stateText}>
                Your teacher will upload notes, worksheets and e-books here.
              </Text>
            </>
          ) : (
            <>
              <Ionicons name="search-outline" size={38} color={colors.muted} />
              <Text style={s.stateTitle}>No matches found</Text>
              <Text style={s.stateText}>Try changing your search or filters.</Text>
            </>
          )}
        </View>
      }
      ListFooterComponent={
        tab === "issued" && returnedIssues.length > 0 ? (
          <View style={s.historySection}>
            <Text style={s.sectionTitle}>Returned ({returnedIssues.length})</Text>
            {returnedIssues.map((issue) => (
              <IssueCard
                key={issue._id}
                issue={issue}
                overdue={false}
              />
            ))}
            {isStudent && <Text style={s.footerNote}>Return books by the due date to avoid fines. For new issues or renewals, visit the school library.</Text>}
          </View>
        ) : null
      }
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void load(true)}
          tintColor={colors.amberDark}
        />
      }
    />
    <Modal visible={bookModal} transparent animationType="slide" onRequestClose={() => setBookModal(false)}>
      <View style={s.modalOverlay}>
        <View style={s.modalPanel}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>{editingBook ? "Edit Book" : "Add Book"}</Text>
            <Pressable onPress={() => setBookModal(false)} hitSlop={10}>
              <Ionicons name="close" size={23} color={colors.muted} />
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled">
            {([
              ["Title *", "title"],
              ["Author *", "author"],
              ["ISBN", "isbn"],
              ["Category", "category"],
              ["Total copies *", "copies"],
            ] as const).map(([label, key]) => (
              <View key={key} style={s.formField}>
                <Text style={s.formLabel}>{label}</Text>
                <TextInput
                  value={bookForm[key]}
                  onChangeText={(value) => setBookForm((form) => ({ ...form, [key]: value }))}
                  style={s.formInput}
                  keyboardType={key === "copies" ? "number-pad" : "default"}
                  placeholder={label.replace(" *", "")}
                  placeholderTextColor="#98A2B3"
                />
              </View>
            ))}
          </ScrollView>
          <View style={s.modalButtons}>
            <Pressable onPress={() => setBookModal(false)} style={s.cancelButton}>
              <Text style={s.cancelButtonText}>Cancel</Text>
            </Pressable>
            <Pressable onPress={() => void saveBook()} disabled={saving} style={s.primaryAction}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryActionText}>{editingBook ? "Update Book" : "Add Book"}</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
    <Modal visible={issueModal} transparent animationType="slide" onRequestClose={() => setIssueModal(false)}>
      <View style={s.modalOverlay}>
        <View style={s.modalPanel}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>Issue Book</Text>
            <Pressable onPress={() => setIssueModal(false)} hitSlop={10}>
              <Ionicons name="close" size={23} color={colors.muted} />
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={s.formLabel}>Select book</Text>
            {books.filter((book) => Number(book.availableCopies) > 0).map((book) => (
              <Pressable
                key={book._id}
                onPress={() => setSelectedBookId(book._id)}
                style={[s.choiceRow, selectedBookId === book._id && s.choiceRowSelected]}
              >
                <Text style={s.choiceTitle}>{book.title}</Text>
                <Text style={s.choiceMeta}>{book.availableCopies} available</Text>
              </Pressable>
            ))}
            <Text style={[s.formLabel, { marginTop: 14 }]}>Select student</Text>
            {students.map((student, index) => {
              const studentId = typeof student._id === "string" ? student._id : "";
              return (
                <Pressable
                  key={studentId || String(index)}
                  onPress={() => setSelectedStudentId(studentId)}
                  style={[s.choiceRow, selectedStudentId === studentId && s.choiceRowSelected]}
                >
                  <Text style={s.choiceTitle}>
                    {typeof student.name === "string" ? student.name : "Student"}
                  </Text>
                  <Text style={s.choiceMeta}>
                    {[student.admissionNo, student.class, student.section].filter(Boolean).join(" · ")}
                  </Text>
                </Pressable>
              );
            })}
            <View style={s.formField}>
              <Text style={s.formLabel}>Due date (YYYY-MM-DD)</Text>
              <TextInput
                value={dueDate}
                onChangeText={setDueDate}
                style={s.formInput}
                placeholder="2026-12-31"
                placeholderTextColor="#98A2B3"
              />
            </View>
          </ScrollView>
          <View style={s.modalButtons}>
            <Pressable onPress={() => setIssueModal(false)} style={s.cancelButton}>
              <Text style={s.cancelButtonText}>Cancel</Text>
            </Pressable>
            <Pressable onPress={() => void issueBook()} disabled={saving} style={s.primaryAction}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryActionText}>Issue Book</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
    <Modal visible={materialModal} transparent animationType="slide" onRequestClose={() => setMaterialModal(false)}>
      <View style={s.modalOverlay}>
        <View style={s.modalPanel}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>{editingMaterial ? "Edit Material" : "Add Material"}</Text>
            <Pressable onPress={() => setMaterialModal(false)} hitSlop={10}>
              <Ionicons name="close" size={23} color={colors.muted} />
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled">
            {([
              ["Title *", "title"],
              ["Description", "description"],
              ["Subject *", "subject"],
              ["Class *", "class"],
              ["Section", "section"],
            ] as const).map(([label, key]) => (
              <View key={key} style={s.formField}>
                <Text style={s.formLabel}>{label}</Text>
                <TextInput
                  value={materialForm[key]}
                  onChangeText={(value) => setMaterialForm((form) => ({ ...form, [key]: value }))}
                  style={[s.formInput, key === "description" && s.multilineInput]}
                  multiline={key === "description"}
                  placeholder={label.replace(" *", "")}
                  placeholderTextColor="#98A2B3"
                />
              </View>
            ))}
            <Text style={s.formLabel}>Material type</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterRow}>
              {MATERIAL_TYPES.map((type) => (
                <FilterChip
                  key={type}
                  label={type}
                  active={materialForm.type === type}
                  onPress={() => setMaterialForm((form) => ({ ...form, type }))}
                />
              ))}
            </ScrollView>
            {materialForm.type === "link" ? (
              <View style={s.formField}>
                <Text style={s.formLabel}>Link URL *</Text>
                <TextInput
                  value={materialForm.linkUrl}
                  onChangeText={(linkUrl) => setMaterialForm((form) => ({ ...form, linkUrl }))}
                  style={s.formInput}
                  autoCapitalize="none"
                  keyboardType="url"
                  placeholder="https://..."
                  placeholderTextColor="#98A2B3"
                />
              </View>
            ) : (
              <>
                {!!materialForm.fileName && <Text style={s.fileMeta}>{materialForm.fileName}</Text>}
                <Pressable
                  style={s.filePicker}
                  onPress={() => {
                    void pickDocument()
                      .then((file) => {
                        if (!file) return;
                        if (file.type !== "application/pdf" && !file.type.startsWith("image/")) {
                          Alert.alert("Unsupported file", "Choose a PDF or image file.");
                          return;
                        }
                        setMaterialForm((form) => ({ ...form, file, fileName: file.name, fileSize: file.size || null, fileUrl: "" }));
                      })
                      .catch((error: unknown) => Alert.alert("Could not select file", error instanceof Error ? error.message : "Please try again."));
                  }}
                >
                  <Ionicons name="cloud-upload-outline" size={17} color={colors.ink} />
                  <Text style={s.smallActionText}>{materialForm.fileName ? "Replace file" : "Choose file (max 10 MB)"}</Text>
                </Pressable>
                {!!materialForm.fileName && (
                  <Pressable onPress={() => setMaterialForm((form) => ({ ...form, file: null, fileUrl: "", fileName: "", fileSize: null }))}>
                    <Text style={s.removeFileText}>Remove attached file</Text>
                  </Pressable>
                )}
              </>
            )}
          </ScrollView>
          <View style={s.modalButtons}>
            <Pressable onPress={() => setMaterialModal(false)} style={s.cancelButton}>
              <Text style={s.cancelButtonText}>Cancel</Text>
            </Pressable>
            <Pressable onPress={() => void saveMaterial()} disabled={saving} style={s.primaryAction}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryActionText}>{editingMaterial ? "Update Material" : "Add Material"}</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
    </>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 16, paddingBottom: 32 },
  hero: { padding: 20, borderRadius: 20, backgroundColor: colors.ink, marginBottom: 14 },
  heroIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 15,
  },
  eyebrow: { color: "#FFD58A", fontSize: 10, fontWeight: "800", letterSpacing: 1.5 },
  title: { color: "#fff", fontSize: 25, fontWeight: "800", marginTop: 4 },
  subtitle: { color: "rgba(255,255,255,0.76)", fontSize: 13, lineHeight: 19, marginTop: 5 },
  notifyButton: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 7, marginTop: 15, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.16)" },
  notifyButtonText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  managementActions: { alignItems: "flex-end", marginBottom: 12 },
  primaryAction: { minHeight: 40, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 10, backgroundColor: colors.ink, paddingHorizontal: 14, paddingVertical: 9 },
  primaryActionText: { color: "#fff", fontSize: 12, fontWeight: "800" },
  tabRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 15,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  tabButton: {
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  activeTabButton: { borderBottomColor: colors.ink },
  tabText: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  activeTabText: { color: colors.ink },
  summaryRow: { flexDirection: "row", gap: 10, marginBottom: 14 },
  summaryCard: { flex: 1, padding: 14 },
  summaryValue: { color: colors.ink, fontSize: 24, fontWeight: "800" },
  summaryLabel: { color: colors.muted, fontSize: 11, marginTop: 3 },
  recordCard: { padding: 14 },
  recordTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  bookIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#FFF4DF",
    justifyContent: "center",
    alignItems: "center",
  },
  recordInfo: { flex: 1, minWidth: 0 },
  bookTitle: { color: colors.ink, fontSize: 14, fontWeight: "800" },
  bookMeta: { color: colors.muted, fontSize: 11, marginTop: 3 },
  statusBadge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 5 },
  overdueBadge: { backgroundColor: "#FDECEC" },
  returnedBadge: { backgroundColor: "#E8F7EF" },
  issuedBadge: { backgroundColor: "#F0F2F5" },
  statusText: { fontSize: 10, fontWeight: "800" },
  overdueText: { color: colors.alert },
  returnedText: { color: "#15966A" },
  issuedText: { color: colors.muted },
  dateInfoRow: { flexDirection: "row", flexWrap: "wrap", gap: 14, marginTop: 12 },
  dateInfo: { flexDirection: "row", alignItems: "center", gap: 5 },
  dateLabel: { color: colors.muted, fontSize: 10 },
  fineText: { color: colors.alert, fontSize: 11, fontWeight: "700", marginTop: 9 },
  borrowerText: { color: colors.muted, fontSize: 11, marginTop: 9 },
  returnButton: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 5, marginTop: 11, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 9, backgroundColor: "#E8F7EF" },
  returnButtonText: { color: "#15966A", fontSize: 11, fontWeight: "800" },
  cardActions: { flexDirection: "row", alignItems: "center", gap: 14, borderTopWidth: 1, borderColor: colors.border, marginTop: 12, paddingTop: 10 },
  smallAction: { flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 3 },
  smallActionText: { color: colors.ink, fontSize: 11, fontWeight: "700" },
  searchCard: { paddingHorizontal: 12, paddingVertical: 2, marginBottom: 15 },
  searchRow: { minHeight: 42, flexDirection: "row", alignItems: "center", gap: 8 },
  searchInput: { flex: 1, color: colors.ink, fontSize: 13, paddingVertical: 8 },
  filterHeading: { color: colors.muted, fontSize: 10, fontWeight: "800", letterSpacing: 1, marginBottom: 7 },
  filterRow: { flexDirection: "row", gap: 7, paddingBottom: 13 },
  filterChip: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#fff",
    borderRadius: 18,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  filterChipActive: { backgroundColor: "#FFF4DF", borderColor: "#F1D39A" },
  filterChipText: { color: colors.muted, fontSize: 11, fontWeight: "700" },
  filterChipTextActive: { color: colors.amberDark },
  resultsText: { color: colors.muted, fontSize: 11, fontWeight: "600", marginBottom: 10 },
  materialCard: { padding: 14 },
  materialTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  materialIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  materialTitle: { color: colors.ink, fontSize: 13, fontWeight: "800" },
  typeBadge: { borderRadius: 9, paddingHorizontal: 8, paddingVertical: 5 },
  typeText: { fontSize: 9, fontWeight: "800" },
  description: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 11 },
  fileMeta: { color: colors.muted, fontSize: 10, marginTop: 7 },
  materialActions: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 12 },
  openButton: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 7 },
  openButtonText: { fontSize: 10, fontWeight: "800" },
  createdDate: { marginLeft: "auto", color: colors.muted, fontSize: 10 },
  stateContainer: { alignItems: "center", paddingHorizontal: 20, paddingVertical: 36, gap: 9 },
  stateTitle: { color: colors.ink, fontSize: 15, fontWeight: "800", textAlign: "center" },
  stateText: { color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: "center" },
  retryButton: { marginTop: 5, borderRadius: 10, backgroundColor: colors.ink, paddingHorizontal: 22, paddingVertical: 10 },
  retryText: { color: "#fff", fontSize: 13, fontWeight: "800" },
  historySection: { gap: 10, marginTop: 24 },
  sectionTitle: { color: colors.ink, fontSize: 15, fontWeight: "800", marginBottom: 2 },
  footerNote: { color: colors.muted, fontSize: 11, lineHeight: 17, marginTop: 16 },
  modalOverlay: { flex: 1, justifyContent: "center", padding: 16, backgroundColor: "rgba(16,24,40,0.55)" },
  modalPanel: { maxHeight: "90%", backgroundColor: "#fff", borderRadius: 18, padding: 18 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  modalTitle: { color: colors.ink, fontSize: 18, fontWeight: "800" },
  formField: { marginBottom: 12 },
  formLabel: { color: colors.ink, fontSize: 11, fontWeight: "700", marginBottom: 6 },
  formInput: { minHeight: 42, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 9, color: colors.ink, fontSize: 13, backgroundColor: "#fff" },
  multilineInput: { minHeight: 76, textAlignVertical: "top" },
  modalButtons: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 9, marginTop: 14 },
  cancelButton: { minHeight: 40, justifyContent: "center", paddingHorizontal: 12 },
  cancelButtonText: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  choiceRow: { padding: 11, borderWidth: 1, borderColor: colors.border, borderRadius: 10, marginTop: 7 },
  choiceRowSelected: { borderColor: colors.amberDark, backgroundColor: "#FFF4DF" },
  choiceTitle: { color: colors.ink, fontSize: 12, fontWeight: "700" },
  choiceMeta: { color: colors.muted, fontSize: 10, marginTop: 3 },
  filePicker: { minHeight: 42, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border, borderStyle: "dashed", borderRadius: 10, marginTop: 7 },
  removeFileText: { color: colors.alert, fontSize: 11, fontWeight: "700", marginTop: 8 },
});
