import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { colors } from "../theme";
import type { School } from "../types";

export default function SchoolPickerScreen() {
  const { selectSchool } = useAuth();
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    api.schools
      .list()
      .then((response) => {
        if (active) setSchools(response.data);
      })
      .catch((loadError: unknown) => {
        if (active)
          setError((loadError as Error).message || "Unable to load schools.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [retry]);

  const chooseSchool = async (school: School) => {
    try {
      await selectSchool(school);
    } catch {
      setError("Unable to save the selected school. Please try again.");
    }
  };

  return (
    <View style={s.root}>
      <View style={s.header}>
        <Text style={s.eyebrow}>PLATFORM ADMINISTRATION</Text>
        <Text style={s.title}>Select a school</Text>
        <Text style={s.subtitle}>
          Choose the school whose data you want to manage.
        </Text>
      </View>
      {loading ? (
        <ActivityIndicator style={s.loading} size="large" color={colors.ink} />
      ) : error ? (
        <View style={s.messageArea}>
          <Text style={s.error}>{error}</Text>
          <Pressable
            onPress={() => setRetry((value) => value + 1)}
            accessibilityRole="button"
          >
            <Text style={s.retry}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.list}>
          {schools.length === 0 ? (
            <Text style={s.empty}>No schools are available.</Text>
          ) : (
            schools.map((school) => {
              const id = school.id || school._id;
              const unavailable = school.status !== "active";
              return (
                <Pressable
                  key={id || school.name}
                  disabled={!id || unavailable}
                  onPress={() => chooseSchool(school)}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !id || unavailable }}
                  style={({ pressed }) => [
                    s.row,
                    (pressed || unavailable) && s.rowMuted,
                  ]}
                >
                  <View style={s.schoolMark}>
                    <Text style={s.schoolInitial}>
                      {school.name?.slice(0, 1) || "S"}
                    </Text>
                  </View>
                  <View style={s.schoolInfo}>
                    <Text style={s.schoolName}>
                      {school.name || "Unnamed school"}
                    </Text>
                    {!!school.code && (
                      <Text style={s.schoolCode}>{school.code}</Text>
                    )}
                  </View>
                  <Text style={[s.status, unavailable && s.inactive]}>
                    {unavailable ? "Inactive" : "Select"}
                  </Text>
                </Pressable>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper, paddingTop: 56 },
  header: {
    paddingHorizontal: 22,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  eyebrow: { color: colors.amberDark, fontSize: 10, fontWeight: "800" },
  title: { color: colors.ink, fontSize: 25, fontWeight: "800", marginTop: 6 },
  subtitle: { color: colors.muted, fontSize: 13, marginTop: 5 },
  loading: { marginTop: 40 },
  messageArea: { alignItems: "center", gap: 14, padding: 24 },
  error: { color: colors.alert, textAlign: "center", fontSize: 13 },
  retry: { color: colors.info, fontWeight: "700", padding: 8 },
  list: { padding: 16, gap: 10 },
  empty: { color: colors.muted, textAlign: "center", marginTop: 24 },
  row: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
  },
  rowMuted: { opacity: 0.55 },
  schoolMark: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: colors.amber,
  },
  schoolInitial: { color: colors.ink, fontWeight: "800", fontSize: 16 },
  schoolInfo: { flex: 1 },
  schoolName: { color: colors.ink, fontWeight: "700", fontSize: 14 },
  schoolCode: { color: colors.muted, fontSize: 11, marginTop: 3 },
  status: { color: colors.info, fontSize: 12, fontWeight: "700" },
  inactive: { color: colors.muted },
});
