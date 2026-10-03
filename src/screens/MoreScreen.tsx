import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuth } from "../context/AuthContext";
import { MODULE_GROUPS } from "../lib/modules";
import { colors } from "../theme";
import type { RootStackParams } from "../../App";

export default function MoreScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParams>>();
  const { user, can } = useAuth();
  const isSuper = user?.role === "super_admin";
  const isSchoolAdmin = user?.role === "school_admin" || user?.role === "admin";
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.paper }}
      contentContainerStyle={{ padding: 16, gap: 18 }}
    >
      {!isSuper &&
        (can("transport:read") ||
          can("students:read") ||
          can("timetable:read") ||
          can("marks:read") ||
          can("attendance:mark") ||
          can("students:write") ||
          can("marks:write") ||
          (isSchoolAdmin && can("staff:read")) ||
          (isSchoolAdmin && can("fees:read")) ||
          can("enquiries:write")) && (
          <View>
            <Text style={s.group}>Quick actions</Text>
            <View style={s.grid}>
              {isSchoolAdmin && can("staff:read") && (
                <Pressable style={s.tile} onPress={() => nav.navigate("Staff")}>
                  <View style={s.icon}>
                    <Ionicons
                      name="people"
                      size={22}
                      color={colors.amberDark}
                    />
                  </View>
                  <Text style={s.label}>Teachers & Staff</Text>
                </Pressable>
              )}
              {isSchoolAdmin && can("fees:read") && (
                <Pressable
                  style={s.tile}
                  onPress={() => nav.navigate("FeesCollection")}
                >
                  <View style={s.icon}>
                    <Ionicons
                      name="wallet"
                      size={22}
                      color={colors.amberDark}
                    />
                  </View>
                  <Text style={s.label}>Fees Collection</Text>
                </Pressable>
              )}
              {can("transport:read") && (
                <Pressable
                  style={s.tile}
                  onPress={() => nav.navigate("BusTracking")}
                >
                  <View style={s.icon}>
                    <Ionicons name="map" size={22} color={colors.amberDark} />
                  </View>
                  <Text style={s.label}>Bus Tracking</Text>
                </Pressable>
              )}
              {(can("students:read") || user?.role === "student") && (
                <Pressable
                  style={s.tile}
                  onPress={() => nav.navigate("IdCard")}
                >
                  <View style={s.icon}>
                    <Ionicons
                      name="id-card"
                      size={22}
                      color={colors.amberDark}
                    />
                  </View>
                  <Text style={s.label}>ID Card</Text>
                </Pressable>
              )}
              {can("timetable:read") && !isSchoolAdmin && (
                <Pressable
                  style={s.tile}
                  onPress={() => nav.navigate("Timetable")}
                >
                  <View style={s.icon}>
                    <Ionicons name="time" size={22} color={colors.amberDark} />
                  </View>
                  <Text style={s.label}>Timetable</Text>
                </Pressable>
              )}
              {can("marks:read") && (
                <Pressable
                  style={s.tile}
                  onPress={() => nav.navigate("ReportCard")}
                >
                  <View style={s.icon}>
                    <Ionicons
                      name="school"
                      size={22}
                      color={colors.amberDark}
                    />
                  </View>
                  <Text style={s.label}>Report Card</Text>
                </Pressable>
              )}
              {can("marks:write") && (
                <Pressable
                  style={s.tile}
                  onPress={() => nav.navigate("MarksEntry")}
                >
                  <View style={s.icon}>
                    <Ionicons
                      name="create"
                      size={22}
                      color={colors.amberDark}
                    />
                  </View>
                  <Text style={s.label}>Marks Entry</Text>
                </Pressable>
              )}
              {can("enquiries:write") && (
                <Pressable
                  style={s.tile}
                  onPress={() => nav.navigate("Form", { form: "enquiry" })}
                >
                  <View style={s.icon}>
                    <Ionicons
                      name="help-circle"
                      size={22}
                      color={colors.amberDark}
                    />
                  </View>
                  <Text style={s.label}>New Enquiry</Text>
                </Pressable>
              )}
              {can("attendance:mark") && (
                <Pressable
                  style={s.tile}
                  onPress={() => nav.navigate("MarkAttendance")}
                >
                  <View style={s.icon}>
                    <Ionicons
                      name="checkmark-done"
                      size={22}
                      color={colors.amberDark}
                    />
                  </View>
                  <Text style={s.label}>Mark Attendance</Text>
                </Pressable>
              )}
              {can("students:write") && (
                <Pressable
                  style={s.tile}
                  onPress={() => nav.navigate("Form", { form: "student" })}
                >
                  <View style={s.icon}>
                    <Ionicons
                      name="person-add"
                      size={22}
                      color={colors.amberDark}
                    />
                  </View>
                  <Text style={s.label}>Add Student</Text>
                </Pressable>
              )}
              {can("leaves:apply") && (
                <Pressable
                  style={s.tile}
                  onPress={() => nav.navigate("Form", { form: "leave" })}
                >
                  <View style={s.icon}>
                    <Ionicons
                      name="airplane"
                      size={22}
                      color={colors.amberDark}
                    />
                  </View>
                  <Text style={s.label}>Apply Leave</Text>
                </Pressable>
              )}
              {can("notices:publish") && (
                <Pressable
                  style={s.tile}
                  onPress={() => nav.navigate("Form", { form: "notice" })}
                >
                  <View style={s.icon}>
                    <Ionicons
                      name="megaphone"
                      size={22}
                      color={colors.amberDark}
                    />
                  </View>
                  <Text style={s.label}>Publish Notice</Text>
                </Pressable>
              )}
              {can("fees:collect") && (
                <Pressable
                  style={s.tile}
                  onPress={() => nav.navigate("Form", { form: "payment" })}
                >
                  <View style={s.icon}>
                    <Ionicons name="cash" size={22} color={colors.amberDark} />
                  </View>
                  <Text style={s.label}>Collect Fee</Text>
                </Pressable>
              )}
            </View>
          </View>
        )}
      {isSchoolAdmin && can("school:settings") ? (
        <View>
          <Text style={s.group}>School administration</Text>
          <View style={s.grid}>
            <Pressable
              style={s.tile}
              onPress={() => nav.navigate("ManageSchool")}
            >
              <View style={s.icon}>
                <Ionicons name="settings" size={22} color={colors.amberDark} />
              </View>
              <Text style={s.label}>Manage School</Text>
            </Pressable>
            <Pressable
              style={s.tile}
              onPress={() => nav.navigate("Subscription")}
            >
              <View style={s.icon}>
                <Ionicons
                  name="card-outline"
                  size={22}
                  color={colors.amberDark}
                />
              </View>
              <Text style={s.label}>Subscription</Text>
            </Pressable>
            {can("timetable:read") ? (
              <Pressable
                style={s.tile}
                onPress={() => nav.navigate("Timetable")}
              >
                <View style={s.icon}>
                  <Ionicons
                    name="calendar"
                    size={22}
                    color={colors.amberDark}
                  />
                </View>
                <Text style={s.label}>Timetable</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}
      {MODULE_GROUPS.map((g) => {
        const items = g.items.filter((i) =>
          isSuper
            ? i.platform && i.key !== "p-schools"
            : !i.platform && (!i.perm || can(i.perm)),
        );
        if (!items.length) return null;
        return (
          <View key={g.title}>
            <Text style={s.group}>{g.title}</Text>
            <View style={s.grid}>
              {items.map((i) => (
                <Pressable
                  key={i.key}
                  style={s.tile}
                  onPress={() => {
                    if (i.key === "attendance" && isSchoolAdmin) {
                      nav.navigate("MarkAttendance");
                    } else if (i.key === "exams" && isSchoolAdmin) {
                      nav.navigate("Examination");
                    } else if (i.key === "admissions") {
                      nav.navigate("AdmissionEnquiry");
                    } else if (i.key === "p-plans") {
                      nav.navigate("Plans");
                    } else if (i.key === "p-subs") {
                      nav.navigate("Subscriptions");
                    } else if (i.key === "p-reports") {
                      nav.navigate("Reports");
                    } else if (i.key === "p-settings") {
                      nav.navigate("PlatformSettings");
                    } else {
                      nav.navigate("Module", {
                        title: i.title,
                        endpoint: i.endpoint,
                      });
                    }
                  }}
                >
                  <View style={s.icon}>
                    <Ionicons
                      name={i.icon}
                      size={22}
                      color={colors.amberDark}
                    />
                  </View>
                  <Text style={s.label}>{i.title}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}
const s = StyleSheet.create({
  group: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.muted,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tile: {
    width: "31%",
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    alignItems: "center",
    gap: 8,
  },
  icon: { backgroundColor: "#FBF1DF", borderRadius: 12, padding: 10 },
  label: {
    fontSize: 11.5,
    fontWeight: "600",
    color: colors.ink,
    textAlign: "center",
  },
});
