import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { api } from "../lib/api";
import { Button, Card, Input, Toast } from "../components/UI";
import { colors } from "../theme";
import type { School } from "../types";
import type { RootStackParams } from "../../App";

const PAGE_SIZE = 10;

export default function SchoolsManagementScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParams>>();
  const [schools, setSchools] = useState<School[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [onboarding, setOnboarding] = useState("");
  const [deleted, setDeleted] = useState(false);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let current = true;
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      limit: String(PAGE_SIZE),
    });
    if (query.trim()) params.set("q", query.trim());
    if (deleted) params.set("deleted", "true");
    else {
      if (status) params.set("status", status);
      if (onboarding) params.set("onboarding", onboarding);
    }
    api.platform.schools
      .list(params.toString())
      .then((response) => {
        if (!current) return;
        setSchools(response.data || []);
        setTotal(response.total || 0);
        setPages(response.pages || 0);
        setError("");
      })
      .catch((loadError: unknown) => {
        if (current)
          setError((loadError as Error).message || "Unable to load schools.");
      })
      .finally(() => {
        if (current) {
          setLoading(false);
          setRefreshing(false);
        }
      });
    return () => {
      current = false;
    };
  }, [query, status, onboarding, deleted, page, refreshKey]);

  const confirm = (
    title: string,
    message: string,
    action: () => Promise<void>,
  ) => {
    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Continue",
        onPress: () => {
          void action();
        },
      },
    ]);
  };

  const mutate = async (
    school: School,
    action: "suspend" | "activate" | "delete" | "restore",
  ) => {
    const id = school._id || school.id;
    if (!id) return;
    setBusyId(id);
    setError("");
    try {
      if (action === "suspend" || action === "activate") {
        await api.platform.schools.setStatus(
          id,
          action === "suspend" ? "suspended" : "active",
        );
      } else if (action === "delete") {
        await api.platform.schools.softDelete(id);
      } else {
        await api.platform.schools.restore(id);
      }
      setRefreshKey((value) => value + 1);
    } catch (mutationError) {
      setError((mutationError as Error).message || "School update failed.");
    } finally {
      setBusyId("");
    }
  };

  const refresh = () => {
    setRefreshing(true);
    setRefreshKey((value) => value + 1);
  };

  return (
    <View style={s.root}>
      {!!error && <Toast message={error} onDismiss={() => setError("")} />}
      <ScrollView
        contentContainerStyle={s.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} />
        }
      >
        <View style={s.heading}>
          <View>
            <Text style={s.eyebrow}>PLATFORM OWNER</Text>
            <Text style={s.title}>Schools</Text>
            <Text style={s.subtitle}>
              {total.toLocaleString("en-IN")} schools
            </Text>
          </View>
          <Pressable
            style={s.onboardButton}
            onPress={() => navigation.navigate("SchoolOnboarding")}
            accessibilityRole="button"
          >
            <Ionicons name="add" size={17} color="#fff" />
            <Text style={s.onboardButtonText}>Onboard school</Text>
          </Pressable>
        </View>

        <View style={s.tabs}>
          <FilterChip
            label="Active schools"
            selected={!deleted}
            onPress={() => {
              setDeleted(false);
              setPage(1);
            }}
          />
          <FilterChip
            label="Deleted"
            selected={deleted}
            onPress={() => {
              setDeleted(true);
              setStatus("");
              setOnboarding("");
              setPage(1);
            }}
          />
        </View>

        <View style={s.searchBox}>
          <Ionicons name="search" size={17} color={colors.muted} />
          <Input
            placeholder="Search name, code or city"
            value={query}
            onChangeText={(value) => {
              setQuery(value);
              setPage(1);
            }}
            style={s.searchInput}
            accessibilityLabel="Search schools"
          />
          {!!query && (
            <Pressable
              onPress={() => setQuery("")}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
            >
              <Ionicons name="close-circle" size={18} color={colors.muted} />
            </Pressable>
          )}
        </View>

        {!deleted && (
          <>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.chips}
            >
              {[
                ["", "All"],
                ["active", "Active"],
                ["suspended", "Suspended"],
              ].map(([value, label]) => (
                <FilterChip
                  key={value || "all-status"}
                  label={label}
                  selected={status === value}
                  onPress={() => {
                    setStatus(value);
                    setPage(1);
                  }}
                />
              ))}
            </ScrollView>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.chips}
            >
              {[
                ["", "All stages"],
                ["created", "Created"],
                ["configured", "Configured"],
                ["subscribed", "Subscribed"],
                ["live", "Live"],
              ].map(([value, label]) => (
                <FilterChip
                  key={value || "all-onboarding"}
                  label={label}
                  selected={onboarding === value}
                  onPress={() => {
                    setOnboarding(value);
                    setPage(1);
                  }}
                />
              ))}
            </ScrollView>
          </>
        )}

        {loading ? (
          <ActivityIndicator style={s.loader} size="large" color={colors.ink} />
        ) : schools.length ? (
          <View style={s.list}>
            {schools.map((school) => {
              const id = school._id || school.id || school.name || "school";
              const busy = busyId === id;
              return (
                <Card key={id} style={s.schoolCard}>
                  <View style={s.schoolTop}>
                    <View style={s.schoolIcon}>
                      <Ionicons name="school" size={20} color={colors.ink} />
                    </View>
                    <View style={s.schoolIdentity}>
                      <Text style={s.schoolName}>
                        {school.name || "Unnamed school"}
                      </Text>
                      <Text style={s.schoolMeta}>
                        {school.code || "No code"}
                        {school.city ? ` · ${school.city}` : ""}
                      </Text>
                    </View>
                    <View
                      style={[
                        s.status,
                        school.status === "active" && s.activeStatus,
                      ]}
                    >
                      <Text
                        style={[
                          s.statusText,
                          school.status === "active" && s.activeText,
                        ]}
                      >
                        {school.status || "unknown"}
                      </Text>
                    </View>
                  </View>
                  <View style={s.schoolDetails}>
                    <Text style={s.detailText}>Plan: {school.plan || "—"}</Text>
                    <Text style={s.detailText}>
                      Onboarding: {school.onboarding?.status || "created"}
                    </Text>
                    <Text style={s.detailText}>
                      Created: {formatDate(school.createdAt)}
                    </Text>
                  </View>
                  <View style={s.actions}>
                    {deleted ? (
                      <ActionButton
                        label="Restore"
                        icon="refresh"
                        disabled={busy}
                        onPress={() => void mutate(school, "restore")}
                      />
                    ) : (
                      <>
                        <ActionButton
                          label={
                            school.status === "active" ? "Suspend" : "Activate"
                          }
                          icon={
                            school.status === "active"
                              ? "pause-circle-outline"
                              : "checkmark-circle-outline"
                          }
                          disabled={busy}
                          onPress={() =>
                            confirm(
                              school.status === "active"
                                ? "Suspend school?"
                                : "Activate school?",
                              school.name || "Update this school status?",
                              () =>
                                mutate(
                                  school,
                                  school.status === "active"
                                    ? "suspend"
                                    : "activate",
                                ),
                            )
                          }
                        />
                        <ActionButton
                          label="Move to trash"
                          icon="trash-outline"
                          disabled={busy}
                          destructive
                          onPress={() =>
                            confirm(
                              "Move school to trash?",
                              school.name ||
                                "This school can be restored later.",
                              () => mutate(school, "delete"),
                            )
                          }
                        />
                      </>
                    )}
                  </View>
                  {busy && (
                    <ActivityIndicator size="small" color={colors.info} />
                  )}
                </Card>
              );
            })}
          </View>
        ) : (
          <Text style={s.empty}>
            {deleted
              ? "No deleted schools."
              : "No schools match these filters."}
          </Text>
        )}

        {pages > 1 && (
          <View style={s.pager}>
            <Pressable
              disabled={page <= 1}
              onPress={() => setPage((value) => value - 1)}
              accessibilityRole="button"
            >
              <Text style={[s.pageAction, page <= 1 && s.disabled]}>
                Previous
              </Text>
            </Pressable>
            <Text style={s.pageText}>
              Page {page} of {pages}
            </Text>
            <Pressable
              disabled={page >= pages}
              onPress={() => setPage((value) => value + 1)}
              accessibilityRole="button"
            >
              <Text style={[s.pageAction, page >= pages && s.disabled]}>
                Next
              </Text>
            </Pressable>
          </View>
        )}
        {!loading && (
          <Button
            title="Refresh schools"
            variant="ghost"
            onPress={refresh}
            loading={refreshing}
          />
        )}
      </ScrollView>
    </View>
  );
}

function FilterChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[s.chip, selected && s.selectedChip]}
    >
      <Text style={[s.chipText, selected && s.selectedChipText]}>{label}</Text>
    </Pressable>
  );
}

function ActionButton({
  label,
  icon,
  disabled,
  destructive,
  onPress,
}: {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  disabled: boolean;
  destructive?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      style={[
        s.action,
        destructive && s.destructiveAction,
        disabled && s.disabled,
      ]}
    >
      <Ionicons
        name={icon}
        size={15}
        color={destructive ? colors.alert : colors.info}
      />
      <Text style={[s.actionText, destructive && s.destructiveText]}>
        {label}
      </Text>
    </Pressable>
  );
}

function formatDate(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 16, paddingBottom: 28, gap: 14 },
  heading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  onboardButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: colors.ink,
  },
  onboardButtonText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  eyebrow: { color: colors.amberDark, fontSize: 10, fontWeight: "800" },
  title: { color: colors.ink, fontSize: 24, fontWeight: "800", marginTop: 4 },
  subtitle: { color: colors.muted, fontSize: 12, marginTop: 3 },
  tabs: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 8,
  },
  searchBox: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.card,
  },
  searchInput: {
    flex: 1,
    borderWidth: 0,
    borderRadius: 0,
    paddingHorizontal: 0,
    paddingVertical: 8,
    backgroundColor: "transparent",
  },
  chips: { gap: 7, paddingVertical: 2 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: colors.card,
  },
  selectedChip: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { color: colors.muted, fontSize: 11, fontWeight: "600" },
  selectedChipText: { color: "#fff" },
  loader: { marginTop: 36 },
  list: { gap: 10 },
  schoolCard: { padding: 13, gap: 11, borderRadius: 8 },
  schoolTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  schoolIcon: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8EBD4",
    borderRadius: 8,
  },
  schoolIdentity: { flex: 1, gap: 3 },
  schoolName: { color: colors.ink, fontSize: 13, fontWeight: "700" },
  schoolMeta: { color: colors.muted, fontSize: 10 },
  status: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: "#F1F2F4",
  },
  activeStatus: { backgroundColor: "#E8F5EC" },
  statusText: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: "700",
    textTransform: "capitalize",
  },
  activeText: { color: colors.success },
  schoolDetails: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  detailText: { color: colors.muted, fontSize: 10 },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 9,
  },
  action: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 5,
    paddingHorizontal: 7,
  },
  actionText: { color: colors.info, fontSize: 10, fontWeight: "700" },
  destructiveAction: { marginLeft: "auto" },
  destructiveText: { color: colors.alert },
  disabled: { opacity: 0.4 },
  empty: {
    color: colors.muted,
    fontSize: 13,
    textAlign: "center",
    paddingVertical: 30,
  },
  pager: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
  },
  pageAction: {
    color: colors.info,
    fontSize: 12,
    fontWeight: "700",
    padding: 8,
  },
  pageText: { color: colors.muted, fontSize: 11 },
});
