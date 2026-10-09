import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Button, Card, Input, Toast } from "../components/UI";
import { useAuth } from "../context/AuthContext";
import { API_BASE_URL, api } from "../lib/api";
import { pickImage, toFormData, type Picked } from "../lib/upload";
import { colors } from "../theme";
import type { SchoolEvent } from "../types";

const categories = [
  "Sports",
  "National",
  "Academic",
  "Cultural",
  "Holiday",
  "Meeting",
  "Other",
];
const categoryImages: Record<string, string> = {
  sports:
    "https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=900&h=520&fit=crop",
  national:
    "https://images.unsplash.com/photo-1532375810709-75b1da00537c?w=900&h=520&fit=crop",
  academic:
    "https://images.unsplash.com/photo-1532094349884-543bc11b234d?w=900&h=520&fit=crop",
  cultural:
    "https://images.unsplash.com/photo-1503095396549-807759245b35?w=900&h=520&fit=crop",
  holiday:
    "https://images.unsplash.com/photo-1544383835-bda2bc66a55d?w=900&h=520&fit=crop",
  meeting:
    "https://images.unsplash.com/photo-1577896851231-70ef18881754?w=900&h=520&fit=crop",
  other:
    "https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=900&h=520&fit=crop",
};
const views = [
  { key: "upcoming", label: "Upcoming" },
  { key: "past", label: "Past" },
  { key: "all", label: "All events" },
] as const;
type EventView = (typeof views)[number]["key"];

interface EventForm {
  title: string;
  date: string;
  time: string;
  venue: string;
  category: string;
  image: string;
}

function localDateValue(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function blankForm(): EventForm {
  return {
    title: "",
    date: localDateValue(new Date()),
    time: "9:00 AM",
    venue: "",
    category: "Academic",
    image: "",
  };
}

function formatDate(value?: string) {
  if (!value) return "Date to be announced";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date to be announced"
    : date.toLocaleDateString("en-IN", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
      });
}

function dateKey(value?: string) {
  if (value && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }
  const date = value ? new Date(value) : new Date(Number.NaN);
  return Number.isNaN(date.getTime()) ? "" : localDateValue(date);
}

function isPastEvent(event: SchoolEvent) {
  const key = dateKey(event.date);
  return !!key && key < localDateValue(new Date());
}

function eventIcon(category?: string): keyof typeof Ionicons.glyphMap {
  switch ((category || "").toLowerCase()) {
    case "sports":
      return "football-outline";
    case "national":
      return "flag-outline";
    case "academic":
      return "school-outline";
    case "cultural":
      return "musical-notes-outline";
    case "holiday":
      return "sunny-outline";
    case "meeting":
      return "people-outline";
    default:
      return "sparkles-outline";
  }
}

function categoryColor(category?: string) {
  switch ((category || "").toLowerCase()) {
    case "sports":
      return colors.success;
    case "national":
      return colors.alert;
    case "academic":
      return colors.info;
    case "cultural":
      return colors.amberDark;
    case "holiday":
      return "#7B61A8";
    case "meeting":
      return "#37827D";
    default:
      return colors.muted;
  }
}

function eventImageUri(event: SchoolEvent) {
  const image =
    event.image ||
    categoryImages[(event.category || "other").toLowerCase()] ||
    categoryImages.other;
  if (/^https?:\/\//i.test(image)) return image;
  const origin = API_BASE_URL.replace(/\/api\/?$/i, "");
  if (image.startsWith("/")) return `${origin}${image}`;
  if (image.startsWith("uploads/")) return `${origin}/${image}`;
  return `${origin}/${image.replace(/^\/+/, "")}`;
}

function Stat({
  label,
  value,
  icon,
  tint,
}: {
  label: string;
  value: number;
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
}) {
  return (
    <Card style={s.statCard}>
      <View style={[s.statIcon, { backgroundColor: `${tint}18` }]}>
        <Ionicons name={icon} size={16} color={tint} />
      </View>
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </Card>
  );
}

function EventCard({
  event,
  canPublish,
  onEdit,
  style,
}: {
  event: SchoolEvent;
  canPublish: boolean;
  onEdit: () => void;
  style?: ViewStyle;
}) {
  const tint = categoryColor(event.category);
  const past = isPastEvent(event);
  const [imageFailed, setImageFailed] = useState(false);
  const imageUri = eventImageUri(event);
  useEffect(() => setImageFailed(false), [imageUri]);
  return (
    <Card style={{ ...s.eventCard, ...style }}>
      {!imageFailed ? (
        <Image
          source={{ uri: imageUri }}
          style={s.eventImage}
          resizeMode="cover"
          onError={() => setImageFailed(true)}
          accessibilityLabel={`${event.title} event image`}
        />
      ) : (
        <View style={[s.eventArtwork, { backgroundColor: `${tint}12` }]}>
          <View style={[s.artworkDisc, { backgroundColor: `${tint}20` }]} />
          <Ionicons name={eventIcon(event.category)} size={30} color={tint} />
          <Text style={[s.artworkLabel, { color: tint }]}>
            {(event.category || "SCHOOL EVENT").toUpperCase()}
          </Text>
        </View>
      )}
      <View style={s.eventContent}>
        <View style={s.eventCategoryRow}>
          <View style={[s.categoryDot, { backgroundColor: tint }]} />
          <Text style={[s.eventCategory, { color: tint }]}>
            {event.category || "Other"}
          </Text>
          {past && (
            <View style={s.pastBadge}>
              <Text style={s.pastText}>Past</Text>
            </View>
          )}
          {canPublish && (
            <Pressable
              onPress={onEdit}
              hitSlop={9}
              style={s.editButton}
              accessibilityRole="button"
              accessibilityLabel={`Edit ${event.title}`}
            >
              <Ionicons name="ellipsis-horizontal" size={17} color={colors.muted} />
            </Pressable>
          )}
        </View>
        <Text style={s.eventTitle}>{event.title}</Text>
        <View style={s.eventMeta}>
          <Ionicons name="calendar-outline" size={14} color={colors.muted} />
          <Text style={s.eventMetaText}>
            {formatDate(event.date)}
            {event.time ? ` · ${event.time}` : ""}
          </Text>
        </View>
        <View style={s.eventMeta}>
          <Ionicons name="location-outline" size={14} color={colors.muted} />
          <Text numberOfLines={1} style={s.eventMetaText}>
            {event.venue || "Venue to be announced"}
          </Text>
        </View>
      </View>
    </Card>
  );
}

export default function EventsScreen() {
  const { can } = useAuth();
  const { width } = useWindowDimensions();
  const canRead = can("events:read");
  const canPublish = can("events:publish");
  const [events, setEvents] = useState<SchoolEvent[]>([]);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<EventView>("all");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [formVisible, setFormVisible] = useState(false);
  const [editing, setEditing] = useState<SchoolEvent | null>(null);
  const [form, setForm] = useState<EventForm>(blankForm());
  const [picked, setPicked] = useState<Picked | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    setError("");
    try {
      const response = await api.events.list();
      setEvents(Array.isArray(response.data) ? response.data : []);
    } catch (loadError) {
      setError((loadError as Error).message || "Unable to load school events.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (canRead) void load();
    else setLoading(false);
  }, [canRead, load]);

  const today = localDateValue(new Date());
  const stats = useMemo(() => {
    const upcoming = events.filter((event) => {
      const key = dateKey(event.date);
      return !!key && key >= today;
    }).length;
    const thisMonth = events.filter((event) => {
      const date = new Date(event.date || "");
      const now = new Date();
      return (
        !Number.isNaN(date.getTime()) &&
        date.getMonth() === now.getMonth() &&
        date.getFullYear() === now.getFullYear()
      );
    }).length;
    return {
      total: events.length,
      upcoming,
      thisMonth,
      past: events.length - upcoming,
    };
  }, [events, today]);

  const categoryOptions = useMemo(
    () => ["All", ...new Set(events.map((event) => event.category || "Other"))],
    [events],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return events
      .filter((event) => {
        const key = dateKey(event.date);
        const past = !!key && key < today;
        const matchesView =
          view === "all" || (view === "past" ? past : !past);
        const matchesCategory =
          categoryFilter === "All" ||
          (event.category || "Other") === categoryFilter;
        const matchesQuery =
          !needle ||
          [event.title, event.venue, event.category, event.description]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(needle);
        return matchesView && matchesCategory && matchesQuery;
      })
      .sort((a, b) => {
        const dateDiff =
          new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime();
        return view === "past" ? -dateDiff : dateDiff;
      });
  }, [categoryFilter, events, query, today, view]);

  const openCreate = () => {
    setEditing(null);
    setForm(blankForm());
    setPicked(null);
    setError("");
    setFormVisible(true);
  };

  const openEdit = (event: SchoolEvent) => {
    setEditing(event);
    setForm({
      title: event.title || "",
      date: dateKey(event.date) || "",
      time: event.time || "",
      venue: event.venue || "",
      category: event.category || "Other",
      image: event.image || "",
    });
    setPicked(null);
    setError("");
    setFormVisible(true);
  };

  const setField = <K extends keyof EventForm>(key: K, value: EventForm[K]) =>
    setForm((previous) => ({ ...previous, [key]: value }));

  const chooseImage = async () => {
    try {
      const image = await pickImage();
      if (image) {
        setPicked(image);
        setField("image", "");
      }
    } catch (pickError) {
      setError((pickError as Error).message || "Unable to choose this image.");
    }
  };

  const saveEvent = async () => {
    const title = form.title.trim();
    if (!title) {
      setError("Event title is required.");
      return;
    }
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(form.date.trim());
    const parsedDate = match ? new Date(`${form.date.trim()}T00:00:00`) : null;
    if (
      !parsedDate ||
      Number.isNaN(parsedDate.getTime()) ||
      localDateValue(parsedDate) !== form.date.trim()
    ) {
      setError("Enter a valid event date in YYYY-MM-DD format.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      let image = form.image;
      if (picked) {
        const uploaded = await api.events.uploadImage(
          toFormData("image", picked),
        );
        image = uploaded.data.url;
      }
      const payload: Partial<SchoolEvent> = {
        title,
        date: form.date.trim(),
        time: form.time.trim(),
        venue: form.venue.trim(),
        category: form.category.trim() || "Other",
        description: form.category.trim() || "Other",
        image,
        audience: ["all"],
      };
      const response = editing
        ? await api.events.update(editing._id, payload)
        : await api.events.create(payload);
      setEvents((previous) =>
        editing
          ? previous.map((event) =>
              event._id === editing._id ? response.data : event,
            )
          : [response.data, ...previous],
      );
      setFormVisible(false);
      setEditing(null);
      setPicked(null);
      setForm(blankForm());
    } catch (saveError) {
      setError((saveError as Error).message || "Unable to save this event.");
    } finally {
      setSaving(false);
    }
  };

  const deleteEvent = () => {
    if (!editing) return;
    Alert.alert(
      "Delete event?",
      `“${editing.title}” will be removed from the school events.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void (async () => {
              setSaving(true);
              setError("");
              try {
                await api.events.remove(editing._id);
                setEvents((previous) =>
                  previous.filter((event) => event._id !== editing._id),
                );
                setFormVisible(false);
                setEditing(null);
              } catch (deleteError) {
                setError(
                  (deleteError as Error).message || "Unable to delete this event.",
                );
              } finally {
                setSaving(false);
              }
            })();
          },
        },
      ],
    );
  };

  if (!canRead) {
    return (
      <View style={s.root}>
        <View style={s.deniedWrap}>
          <View style={s.deniedIcon}>
            <Ionicons name="lock-closed-outline" size={25} color={colors.alert} />
          </View>
          <Text style={s.emptyTitle}>Events access required</Text>
          <Text style={s.emptyText}>
            Ask your school administrator to grant event access.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={s.root}>
      {!!error && !formVisible && (
        <Toast message={error} onDismiss={() => setError("")} />
      )}
      <ScrollView
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void load()} />
        }
      >
        <View style={s.heading}>
          <View style={s.headingCopy}>
            <Text style={s.eyebrow}>SCHOOL CALENDAR</Text>
            <Text style={s.title}>Events</Text>
            <Text style={s.subtitle}>
              Upcoming celebrations, activities and important dates.
            </Text>
          </View>
          {canPublish && (
            <Pressable
              onPress={openCreate}
              style={s.createButton}
              accessibilityRole="button"
              accessibilityLabel="Create event"
            >
              <Ionicons name="add" size={19} color="#fff" />
              <Text style={s.createText}>Create</Text>
            </Pressable>
          )}
        </View>

        <View style={s.statsGrid}>
          <Stat
            label="Total events"
            value={stats.total}
            icon="sparkles-outline"
            tint={colors.info}
          />
          <Stat
            label="Upcoming"
            value={stats.upcoming}
            icon="calendar-outline"
            tint={colors.success}
          />
          <Stat
            label="This month"
            value={stats.thisMonth}
            icon="time-outline"
            tint={colors.amberDark}
          />
          <Stat
            label="Past events"
            value={stats.past}
            icon="checkmark-done-outline"
            tint={colors.muted}
          />
        </View>

        <View style={s.searchRow}>
          <Ionicons name="search" size={17} color={colors.muted} />
          <Input
            value={query}
            onChangeText={setQuery}
            placeholder="Search events..."
            style={s.searchInput}
            accessibilityLabel="Search events"
          />
          {!!query && (
            <Pressable
              onPress={() => setQuery("")}
              accessibilityRole="button"
              accessibilityLabel="Clear event search"
            >
              <Ionicons name="close-circle" size={17} color={colors.muted} />
            </Pressable>
          )}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.filterRow}
        >
          {views.map((item) => {
            const active = view === item.key;
            return (
              <Pressable
                key={item.key}
                onPress={() => setView(item.key)}
                style={[s.viewChip, active && s.viewChipActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text style={[s.viewText, active && s.viewTextActive]}>
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.categoryFilterRow}
        >
          {categoryOptions.map((category) => {
            const active = categoryFilter === category;
            return (
              <Pressable
                key={category}
                onPress={() => setCategoryFilter(category)}
                style={[s.categoryFilter, active && s.categoryFilterActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text
                  style={[
                    s.categoryFilterText,
                    active && s.categoryFilterTextActive,
                  ]}
                >
                  {category}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={s.listHeading}>
          <View>
            <Text style={s.listTitle}>
              {view === "upcoming"
                ? "Upcoming events"
                : view === "past"
                  ? "Past events"
                  : "All events"}
            </Text>
            <Text style={s.listCaption}>
              {filtered.length} {filtered.length === 1 ? "event" : "events"}
            </Text>
          </View>
          {canPublish && (
            <Pressable
              onPress={openCreate}
              style={s.addIconButton}
              accessibilityRole="button"
              accessibilityLabel="Add event"
            >
              <Ionicons name="add" size={19} color={colors.info} />
            </Pressable>
          )}
        </View>

        {loading ? (
          <ActivityIndicator size="large" color={colors.info} style={s.loader} />
        ) : error && events.length === 0 ? (
          <Card style={s.emptyCard}>
            <Ionicons name="cloud-offline-outline" size={28} color={colors.alert} />
            <Text style={s.emptyTitle}>Couldn’t load events</Text>
            <Text style={s.emptyText}>{error}</Text>
            <Button title="Try again" onPress={() => void load()} />
          </Card>
        ) : filtered.length ? (
          <View style={[s.eventList, width >= 700 && s.eventGrid]}>
            {filtered.map((event) => (
              <EventCard
                key={event._id}
                event={event}
                canPublish={canPublish}
                onEdit={() => openEdit(event)}
                style={width >= 700 ? s.eventGridCard : undefined}
              />
            ))}
          </View>
        ) : (
          <Card style={s.emptyCard}>
            <View style={s.emptyIcon}>
              <Ionicons name="calendar-outline" size={28} color={colors.info} />
            </View>
            <Text style={s.emptyTitle}>No events found</Text>
            <Text style={s.emptyText}>
              Try different filters{canPublish ? " or schedule a new event" : ""}.
            </Text>
            {canPublish && (
              <Button title="Create an event" onPress={openCreate} />
            )}
          </Card>
        )}
      </ScrollView>

      <Modal
        visible={formVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          if (!saving) setFormVisible(false);
        }}
      >
        <KeyboardAvoidingView
          style={s.modalRoot}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={s.modalHeader}>
            <View style={s.headingCopy}>
              <Text style={s.eyebrow}>SCHOOL CALENDAR</Text>
              <Text style={s.modalTitle}>
                {editing ? "Edit event" : "Create event"}
              </Text>
              <Text style={s.subtitle}>Add the details for your school event.</Text>
            </View>
            <Pressable
              onPress={() => setFormVisible(false)}
              disabled={saving}
              accessibilityRole="button"
              accessibilityLabel="Close event form"
            >
              <Ionicons name="close" size={23} color={colors.muted} />
            </Pressable>
          </View>
          {!!error && (
            <View style={s.formError}>
              <Text style={s.formErrorText}>{error}</Text>
            </View>
          )}
          <ScrollView
            contentContainerStyle={s.formContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={s.field}>
              <Text style={s.label}>Event title *</Text>
              <Input
                value={form.title}
                onChangeText={(title) => setField("title", title)}
                placeholder="e.g. Annual Sports Day"
                maxLength={160}
                accessibilityLabel="Event title"
              />
            </View>
            <View style={s.field}>
              <Text style={s.label}>Date * · YYYY-MM-DD</Text>
              <Input
                value={form.date}
                onChangeText={(date) => setField("date", date)}
                placeholder="2026-10-09"
                keyboardType="numbers-and-punctuation"
                maxLength={10}
                accessibilityLabel="Event date in year month day format"
              />
            </View>
            <View style={s.field}>
              <Text style={s.label}>Time</Text>
              <Input
                value={form.time}
                onChangeText={(time) => setField("time", time)}
                placeholder="e.g. 9:00 AM"
                maxLength={40}
                accessibilityLabel="Event time"
              />
            </View>
            <View style={s.field}>
              <Text style={s.label}>Venue</Text>
              <Input
                value={form.venue}
                onChangeText={(venue) => setField("venue", venue)}
                placeholder="e.g. Main Auditorium"
                maxLength={160}
                accessibilityLabel="Event venue"
              />
            </View>
            <View style={s.field}>
              <Text style={s.label}>Category</Text>
              <View style={s.categoryChoices}>
                {categories.map((category) => {
                  const active = form.category === category;
                  const tint = categoryColor(category);
                  return (
                    <Pressable
                      key={category}
                      onPress={() => setField("category", category)}
                      style={[
                        s.categoryChoice,
                        active && {
                          borderColor: tint,
                          backgroundColor: `${tint}12`,
                        },
                      ]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                    >
                      <Ionicons
                        name={eventIcon(category)}
                        size={14}
                        color={tint}
                      />
                      <Text
                        style={[
                          s.categoryChoiceText,
                          active && { color: tint },
                        ]}
                      >
                        {category}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {!categories.includes(form.category) && (
                <Text style={s.helper}>Custom category: {form.category}</Text>
              )}
            </View>
            <View style={s.field}>
              <Text style={s.label}>Photo (optional)</Text>
              {picked || form.image ? (
                <View style={s.imagePreviewWrap}>
                  <Image
                    source={{ uri: picked?.uri || form.image }}
                    style={s.imagePreview}
                    resizeMode="cover"
                  />
                  <Pressable
                    onPress={() => {
                      setPicked(null);
                      setField("image", "");
                    }}
                    style={s.removeImageButton}
                    accessibilityRole="button"
                    accessibilityLabel="Remove event photo"
                  >
                    <Ionicons name="close" size={16} color="#fff" />
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  onPress={() => void chooseImage()}
                  style={s.pickImageButton}
                  accessibilityRole="button"
                  accessibilityLabel="Choose event photo"
                >
                  <Ionicons
                    name="image-outline"
                    size={19}
                    color={colors.info}
                  />
                  <Text style={s.pickImageText}>Choose an image</Text>
                  <Text style={s.helper}>JPG, PNG or WEBP · max 5 MB</Text>
                </Pressable>
              )}
            </View>
          </ScrollView>
          <View style={s.modalFooter}>
            {editing ? (
              <Pressable
                onPress={deleteEvent}
                disabled={saving}
                style={s.deleteButton}
                accessibilityRole="button"
              >
                <Ionicons name="trash-outline" size={16} color={colors.alert} />
                <Text style={s.deleteText}>Delete</Text>
              </Pressable>
            ) : (
              <View />
            )}
            <Pressable
              onPress={() => void saveEvent()}
              disabled={saving}
              style={[s.saveButton, saving && s.disabledButton]}
              accessibilityRole="button"
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="checkmark" size={17} color="#fff" />
              )}
              <Text style={s.saveText}>
                {saving ? "Saving..." : editing ? "Save changes" : "Create event"}
              </Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 16, paddingBottom: 30, gap: 14 },
  heading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 9,
  },
  headingCopy: { flex: 1, gap: 3 },
  eyebrow: {
    color: colors.amberDark,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  title: { color: colors.ink, fontSize: 23, fontWeight: "800" },
  modalTitle: { color: colors.ink, fontSize: 19, fontWeight: "800", marginTop: 3 },
  subtitle: { color: colors.muted, fontSize: 10, lineHeight: 15 },
  createButton: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 10,
    borderRadius: 11,
    backgroundColor: colors.ink,
  },
  createText: { color: "#fff", fontSize: 9, fontWeight: "800" },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  statCard: { flexBasis: "47%", flexGrow: 1, minHeight: 91, padding: 11, borderRadius: 14, gap: 3 },
  statIcon: {
    width: 27,
    height: 27,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
  },
  statValue: { color: colors.ink, fontSize: 17, fontWeight: "800", marginTop: 2 },
  statLabel: { color: colors.muted, fontSize: 9 },
  searchRow: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 11,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: "#fff",
  },
  searchInput: {
    flex: 1,
    borderWidth: 0,
    borderRadius: 0,
    paddingHorizontal: 0,
    paddingVertical: 6,
    backgroundColor: "transparent",
    fontSize: 11,
  },
  filterRow: { gap: 7, paddingRight: 4 },
  viewChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    backgroundColor: "#fff",
  },
  viewChipActive: { borderColor: colors.ink, backgroundColor: colors.ink },
  viewText: { color: colors.muted, fontSize: 9, fontWeight: "700" },
  viewTextActive: { color: "#fff" },
  categoryFilterRow: { gap: 7, paddingRight: 4 },
  categoryFilter: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 15,
    backgroundColor: "#fff",
  },
  categoryFilterActive: { borderColor: colors.info, backgroundColor: "#EAF1FF" },
  categoryFilterText: { color: colors.muted, fontSize: 8, fontWeight: "700" },
  categoryFilterTextActive: { color: colors.info },
  listHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 2,
  },
  listTitle: { color: colors.ink, fontSize: 15, fontWeight: "800" },
  listCaption: { color: colors.muted, fontSize: 9, marginTop: 3 },
  addIconButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: "#EAF1FF",
  },
  loader: { marginTop: 18 },
  eventList: { width: "100%", gap: 12 },
  eventGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  eventCard: {
    width: "100%",
    padding: 0,
    overflow: "hidden",
    borderRadius: 15,
    borderColor: "#D9DEE8",
    borderWidth: 1,
    backgroundColor: "#fff",
    elevation: 2,
    shadowColor: "#16213E",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
  },
  eventGridCard: { width: "48.5%" },
  eventImage: { width: "100%", height: 175, backgroundColor: "#EDF0F5" },
  eventArtwork: {
    height: 108,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    overflow: "hidden",
  },
  artworkDisc: {
    position: "absolute",
    width: 116,
    height: 116,
    borderRadius: 58,
  },
  artworkLabel: { fontSize: 8, fontWeight: "800", letterSpacing: 1 },
  eventContent: { padding: 12, gap: 8 },
  eventCategoryRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  categoryDot: { width: 7, height: 7, borderRadius: 4 },
  eventCategory: { fontSize: 9, fontWeight: "800" },
  pastBadge: {
    marginLeft: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: "#F0F1F3",
  },
  pastText: { color: colors.muted, fontSize: 8, fontWeight: "700" },
  editButton: { marginLeft: "auto", paddingHorizontal: 5, paddingVertical: 2 },
  eventTitle: { color: colors.ink, fontSize: 14, fontWeight: "800", lineHeight: 19 },
  eventMeta: { flexDirection: "row", alignItems: "center", gap: 6 },
  eventMetaText: { flex: 1, color: colors.muted, fontSize: 9 },
  emptyCard: { alignItems: "center", gap: 9, padding: 21, borderRadius: 15 },
  emptyIcon: {
    width: 54,
    height: 54,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    backgroundColor: "#EAF1FF",
  },
  emptyTitle: { color: colors.ink, fontSize: 13, fontWeight: "800" },
  emptyText: { color: colors.muted, fontSize: 9, lineHeight: 14, textAlign: "center" },
  deniedWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28, gap: 9 },
  deniedIcon: { width: 54, height: 54, alignItems: "center", justifyContent: "center", borderRadius: 18, backgroundColor: "#FFF0EE" },
  modalRoot: { flex: 1, backgroundColor: colors.paper },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: "#fff",
  },
  formError: { marginHorizontal: 16, marginTop: 9, padding: 9, borderRadius: 9, backgroundColor: "#FFF0EE" },
  formErrorText: { color: colors.alert, fontSize: 10, fontWeight: "600" },
  formContent: { padding: 16, paddingBottom: 24, gap: 15 },
  field: { gap: 7 },
  label: { color: colors.ink, fontSize: 10, fontWeight: "700" },
  categoryChoices: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  categoryChoice: {
    minHeight: 33,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: "#fff",
  },
  categoryChoiceText: { color: colors.muted, fontSize: 9, fontWeight: "700" },
  helper: { color: colors.muted, fontSize: 9 },
  imagePreviewWrap: { position: "relative" },
  imagePreview: { width: "100%", height: 145, borderRadius: 12, backgroundColor: "#EDF0F5" },
  removeImageButton: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: "rgba(22,33,62,0.78)",
  },
  pickImageButton: {
    minHeight: 82,
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.info,
    borderRadius: 12,
    backgroundColor: "#F4F8FF",
  },
  pickImageText: { color: colors.info, fontSize: 10, fontWeight: "700" },
  modalFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    padding: 13,
    paddingBottom: 18,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: "#fff",
  },
  deleteButton: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
  },
  deleteText: { color: colors.alert, fontSize: 10, fontWeight: "700" },
  saveButton: {
    minHeight: 41,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 13,
    borderRadius: 11,
    backgroundColor: colors.ink,
  },
  disabledButton: { opacity: 0.55 },
  saveText: { color: "#fff", fontSize: 10, fontWeight: "800" },
});
