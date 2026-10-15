import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Card, Empty } from "../components/UI";
import { useNotifications } from "../context/NotificationsContext";
import { notificationsApi } from "../lib/api";
import { extractList, Row, titleOf } from "../lib/format";
import { colors } from "../theme";
import type { RootStackParams } from "../../App";

function relativeTime(value: unknown) {
  const timestamp = new Date(String(value || "")).getTime();
  if (!Number.isFinite(timestamp)) return "";
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days < 7
    ? `${days}d ago`
    : new Date(timestamp).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
      });
}

export default function NotificationsScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParams>>();
  const { unread, tick, refresh, live } = useNotifications();
  const [items, setItems] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const result = await notificationsApi.list("limit=50");
      setItems(extractList(result.data));
      setError("");
    } catch (loadError) {
      setError((loadError as Error).message || "Unable to load notifications.");
    }
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load, tick]);

  const shown = useMemo(
    () => (onlyUnread ? items.filter((item) => !item.read) : items),
    [items, onlyUnread],
  );

  const openLink = (value: unknown) => {
    const path =
      typeof value === "string"
        ? value.split(/[?#]/)[0].replace(/\/$/, "")
        : "";
    switch (path) {
      case "/student/results":
      case "/results":
        navigation.navigate("StudentResults");
        break;
      case "/student/homework":
      case "/homework":
      case "/my-work":
        navigation.navigate("Homework");
        break;
      case "/student/leave":
      case "/leave":
        navigation.navigate("Leave");
        break;
      case "/fees":
        navigation.navigate("StudentFees");
        break;
      case "/timetable":
      case "/teacher/timetable":
        navigation.navigate("Timetable");
        break;
      case "/messages":
        navigation.navigate("MessageBoard");
        break;
      case "/student/notices":
      case "/notice-board":
      default:
        navigation.navigate("NoticeBoard");
    }
  };

  const open = async (item: Row) => {
    if (!item.read && item._id) {
      setItems((previous) =>
        previous.map((row) =>
          row._id === item._id ? { ...row, read: true } : row,
        ),
      );
      try {
        await notificationsApi.markRead(String(item._id));
        refresh();
      } catch {
        setItems((previous) =>
          previous.map((row) =>
            row._id === item._id ? { ...row, read: false } : row,
          ),
        );
      }
    }
    openLink(item.link);
  };

  const readAll = async () => {
    setItems((previous) => previous.map((item) => ({ ...item, read: true })));
    try {
      await notificationsApi.markAllRead();
      refresh();
    } catch {
      setError("Could not mark notifications as read. Please try again.");
      void load();
    }
  };

  if (loading)
    return <ActivityIndicator style={{ flex: 1 }} color={colors.ink} />;

  return (
    <View style={s.root}>
      <View style={s.heading}>
        <View style={s.headingIcon}>
          <Ionicons name="notifications" size={22} color={colors.amberDark} />
        </View>
        <View style={s.headingCopy}>
          <Text style={s.eyebrow}>SCHOOL SERVICES</Text>
          <Text style={s.title}>Notifications</Text>
          <Text style={s.subtitle}>School announcements and updates.</Text>
        </View>
      </View>
      <View style={s.toolbar}>
        <View style={s.filters}>
          {[false, true].map((unreadOnly) => (
            <Pressable
              key={String(unreadOnly)}
              onPress={() => setOnlyUnread(unreadOnly)}
              style={[s.chip, onlyUnread === unreadOnly && s.activeChip]}
            >
              <Text
                style={[
                  s.chipText,
                  onlyUnread === unreadOnly && s.activeChipText,
                ]}
              >
                {unreadOnly ? `Unread${unread ? ` (${unread})` : ""}` : "All"}
              </Text>
            </Pressable>
          ))}
        </View>
        {unread > 0 && (
          <Pressable
            onPress={() => void readAll()}
            style={s.readAll}
            accessibilityRole="button"
          >
            <Ionicons name="checkmark-done" size={16} color={colors.info} />
            <Text style={s.link}>Mark all read</Text>
          </Pressable>
        )}
      </View>
      <Text style={[s.live, { color: live ? colors.success : colors.muted }]}>
        {live ? "Live updates on" : "Reconnecting to live updates…"}
      </Text>
      {error ? <Text style={s.error}>{error}</Text> : null}
      <FlatList
        data={shown}
        keyExtractor={(item, index) => String(item._id ?? index)}
        contentContainerStyle={s.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
        }
        ListEmptyComponent={
          <Empty
            text={
              onlyUnread ? "You're all caught up." : "No notifications yet."
            }
          />
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => void open(item)}
            accessibilityRole="button"
            accessibilityLabel={`Open notification: ${titleOf(item)}`}
          >
            <Card
              style={
                !item.read
                  ? { ...s.notificationCard, ...s.unreadCard }
                  : s.notificationCard
              }
            >
              <View style={s.notificationRow}>
                {!item.read ? <View style={s.unreadDot} /> : null}
                <View style={s.notificationIcon}>
                  <Ionicons
                    name="notifications-outline"
                    size={18}
                    color={colors.info}
                  />
                </View>
                <View style={s.notificationCopy}>
                  <View style={s.notificationHeading}>
                    <Text numberOfLines={1} style={s.notificationTitle}>
                      {titleOf(item)}
                    </Text>
                    <Text style={s.date}>{relativeTime(item.createdAt)}</Text>
                  </View>
                  {!!(item.message ?? item.body) && (
                    <Text numberOfLines={3} style={s.message}>
                      {String(item.message ?? item.body)}
                    </Text>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={16} color="#98A2B3" />
              </View>
            </Card>
          </Pressable>
        )}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, padding: 16, gap: 10, backgroundColor: colors.paper },
  heading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 17,
    backgroundColor: colors.ink,
    borderRadius: 18,
    borderBottomWidth: 3,
    borderBottomColor: colors.amber,
  },
  headingIcon: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: "#fff",
  },
  headingCopy: { flex: 1, gap: 3 },
  eyebrow: {
    color: "#F0C77F",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  title: { color: "#fff", fontSize: 20, fontWeight: "900" },
  subtitle: { color: "#D7DCE8", fontSize: 11, lineHeight: 16 },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  filters: { flexDirection: "row", gap: 7 },
  chip: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#fff",
  },
  activeChip: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { color: colors.ink, fontSize: 11, fontWeight: "700" },
  activeChipText: { color: "#fff" },
  readAll: { flexDirection: "row", alignItems: "center", gap: 4 },
  link: { color: colors.info, fontSize: 10, fontWeight: "800" },
  live: { fontSize: 10, fontWeight: "700" },
  error: { color: colors.alert, fontSize: 11, lineHeight: 16 },
  list: { gap: 9, paddingBottom: 20 },
  notificationCard: { padding: 12 },
  unreadCard: { borderColor: colors.amber, borderWidth: 1.5 },
  notificationRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  unreadDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.amberDark,
    marginTop: 14,
  },
  notificationIcon: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
    backgroundColor: "#EAF2F8",
  },
  notificationCopy: { flex: 1, minWidth: 0, gap: 4 },
  notificationHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  notificationTitle: {
    flex: 1,
    color: colors.ink,
    fontSize: 12,
    fontWeight: "800",
  },
  message: { color: colors.muted, fontSize: 10, lineHeight: 15 },
  date: { color: colors.muted, fontSize: 9 },
});
