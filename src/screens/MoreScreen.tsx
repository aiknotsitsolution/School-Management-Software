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
  const isStudent = user?.role === "student";
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.paper }}
      contentContainerStyle={{ padding: 16, gap: 18 }}
    >
      {!isSuper &&
        (isStudent ||
          can("transport:read") ||
          can("students:read") ||
          can("timetable:read") ||
          can("exams:read") ||
          can("exams:write") ||
          can("marks:read") ||
          can("attendance:mark") ||
          can("students:write") ||
          can("marks:write") ||
          can("homework:read") ||
          can("library:read") ||
          can("promotion:read") ||
          can("promotion:write") ||
          can("transfer:read") ||
          can("transfer:write") ||
          can("sessions:read") ||
          can("sessions:write") ||
          can("rollover:read") ||
          can("inventory:read") ||
          can("inventory:write") ||
          can("hostel:read") ||
          can("hostel:manage") ||
          can("notices:read") ||
          can("notices:publish") ||
          can("leaves:apply") ||
          can("staff:read") ||
          can("reports:view") ||
          can("fees:reports") ||
          (isSchoolAdmin && can("fees:read")) ||
          can("enquiries:write")) && (
          <View>
            <Text style={s.group}>Quick actions</Text>
            <View style={s.grid}>
              {can("staff:read") && (
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
              {can("timetable:read") && (
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
              {(can("exams:read") || can("exams:write")) && (
                <Pressable
                  style={s.tile}
                  onPress={() => nav.navigate("Examination")}
                >
                  <View style={s.icon}>
                    <Ionicons
                      name="clipboard"
                      size={22}
                      color={colors.amberDark}
                    />
                  </View>
                  <Text style={s.label}>Examination</Text>
                </Pressable>
              )}
              {(can("exams:read") || can("exams:write")) && (
                <Pressable
                  style={s.tile}
                  onPress={() => nav.navigate("GradingScales")}
                >
                  <View style={s.icon}>
                    <Ionicons
                      name="stats-chart"
                      size={22}
                      color={colors.amberDark}
                    />
                  </View>
                  <Text style={s.label}>Grading Scales</Text>
                </Pressable>
              )}
              {(can("promotion:read") || can("promotion:write")) && (
                <Pressable
                  style={s.tile}
                  onPress={() => nav.navigate("Promotions")}
                >
                  <View style={s.icon}>
                    <Ionicons
                      name="school"
                      size={22}
                      color={colors.amberDark}
                    />
                  </View>
                  <Text style={s.label}>Promotions</Text>
                </Pressable>
              )}
              {(can("transfer:read") || can("transfer:write")) && (
                <Pressable
                  style={s.tile}
                  onPress={() => nav.navigate("Transfers")}
                >
                  <View style={s.icon}>
                    <Ionicons
                      name="git-compare"
                      size={22}
                      color={colors.amberDark}
                    />
                  </View>
                  <Text style={s.label}>Transfers</Text>
                </Pressable>
              )}
              {(can("sessions:read") || can("sessions:write")) && (
                <Pressable
                  style={s.tile}
                  onPress={() => nav.navigate("AcademicSessions")}
                >
                  <View style={s.icon}>
                    <Ionicons
                      name="calendar"
                      size={22}
                      color={colors.amberDark}
                    />
                  </View>
                  <Text style={s.label}>Academic Sessions</Text>
                </Pressable>
              )}
              {can("rollover:read") && (
                <Pressable
                  style={s.tile}
                  onPress={() => nav.navigate("Rollover")}
                >
                  <View style={s.icon}>
                    <Ionicons
                      name="sync"
                      size={22}
                      color={colors.amberDark}
                    />
                  </View>
                  <Text style={s.label}>Academic Rollover</Text>
                </Pressable>
              )}
              {can("inventory:read") && (
                <Pressable
                  style={s.tile}
                  onPress={() => nav.navigate("Inventory")}
                >
                  <View style={s.icon}>
                    <Ionicons
                      name="cube"
                      size={22}
                      color={colors.amberDark}
                    />
                  </View>
                  <Text style={s.label}>Inventory</Text>
                </Pressable>
              )}
              {(can("hostel:read") || can("hostel:manage")) && (
                <Pressable
                  style={s.tile}
                  onPress={() => nav.navigate("Hostel")}
                >
                  <View style={s.icon}>
                    <Ionicons
                      name="bed"
                      size={22}
                      color={colors.amberDark}
                    />
                  </View>
                  <Text style={s.label}>Hostel</Text>
                </Pressable>
              )}
              {(can("marks:read") || isStudent) && (
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
              {(can("homework:read") || isStudent) && (
                <Pressable
                  style={s.tile}
                  onPress={() => nav.navigate("Homework")}
                >
                  <View style={s.icon}>
                    <Ionicons
                      name="document-text"
                      size={22}
                      color={colors.amberDark}
                    />
                  </View>
                  <Text style={s.label}>Homework</Text>
                </Pressable>
              )}
              {can("homework:read") && (
                <Pressable
                  style={s.tile}
                  onPress={() => nav.navigate("Syllabus")}
                >
                  <View style={s.icon}>
                    <Ionicons
                      name="book"
                      size={22}
                      color={colors.amberDark}
                    />
                  </View>
                  <Text style={s.label}>Syllabus</Text>
                </Pressable>
              )}
              {can("library:read") && (
                <Pressable
                  style={s.tile}
                  onPress={() => nav.navigate("Library")}
                >
                  <View style={s.icon}>
                    <Ionicons
                      name="library"
                      size={22}
                      color={colors.amberDark}
                    />
                  </View>
                  <Text style={s.label}>Library</Text>
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
              {(can("notices:read") || can("notices:publish")) && (
                <Pressable
                  style={s.tile}
                  onPress={() => nav.navigate("NoticeBoard")}
                >
                  <View style={s.icon}>
                    <Ionicons
                      name="newspaper"
                      size={22}
                      color={colors.amberDark}
                    />
                  </View>
                  <Text style={s.label}>Notice Board</Text>
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
                  onPress={() => nav.navigate("StudentOnboard")}
                >
                  <View style={s.icon}>
                    <Ionicons
                      name="person-add"
                      size={22}
                      color={colors.amberDark}
                    />
                  </View>
                  <Text style={s.label}>Student Onboard</Text>
                </Pressable>
              )}
              {can("students:read") && (
                <Pressable
                  style={s.tile}
                  onPress={() => nav.navigate("StudentDatabase")}
                >
                  <View style={s.icon}>
                    <Ionicons
                      name="people"
                      size={22}
                      color={colors.amberDark}
                    />
                  </View>
                  <Text style={s.label}>Student Database</Text>
                </Pressable>
              )}
              {can("leaves:apply") && (
                <Pressable
                  style={s.tile}
                  onPress={() => nav.navigate("Leave")}
                >
                  <View style={s.icon}>
                    <Ionicons
                      name="airplane"
                      size={22}
                      color={colors.amberDark}
                    />
                  </View>
                  <Text style={s.label}>Leave Management</Text>
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
      {(!isSuper || isSchoolAdmin) && (
        <View>
          <Text style={s.group}>Communication</Text>
          <View style={s.grid}>
            {!isSuper && (
              <Pressable
                style={s.tile}
                onPress={() => nav.navigate("MessageBoard")}
              >
                <View style={s.icon}>
                  <Ionicons
                    name="chatbubbles"
                    size={22}
                    color={colors.amberDark}
                  />
                </View>
                <Text style={s.label}>Message Board</Text>
              </Pressable>
            )}
            {user?.role === "school_admin" && (
              <Pressable
                style={s.tile}
                onPress={() => nav.navigate("Broadcast")}
              >
                <View style={s.icon}>
                  <Ionicons
                    name="megaphone"
                    size={22}
                    color={colors.amberDark}
                  />
                </View>
                <Text style={s.label}>Broadcast</Text>
              </Pressable>
            )}
            {can("events:read") && (
              <Pressable
                style={s.tile}
                onPress={() => nav.navigate("Events")}
              >
                <View style={s.icon}>
                  <Ionicons
                    name="calendar"
                    size={22}
                    color={colors.amberDark}
                  />
                </View>
                <Text style={s.label}>Events</Text>
              </Pressable>
            )}
            {!isStudent &&
              (can("reports:view") ||
                can("fees:reports") ||
                can("students:read") ||
                can("attendance:read") ||
                can("attendance:mark") ||
                can("fees:read") ||
                can("enquiries:read") ||
                can("enquiries:write") ||
                can("staff:read")) && (
                <Pressable
                  style={s.tile}
                  onPress={() => nav.navigate("SchoolReports")}
                >
                  <View style={s.icon}>
                    <Ionicons
                      name="bar-chart"
                      size={22}
                      color={colors.amberDark}
                    />
                  </View>
                  <Text style={s.label}>Reports & Analytics</Text>
                </Pressable>
              )}
          </View>
        </View>
      )}
      {can("school:settings") || can("branches:read") ? (
        <View>
          <Text style={s.group}>School administration</Text>
          <View style={s.grid}>
            {can("school:settings") ? (
              <>
                <Pressable
                  style={s.tile}
                  onPress={() => nav.navigate("ManageSchool")}
                >
                  <View style={s.icon}>
                    <Ionicons
                      name="settings"
                      size={22}
                      color={colors.amberDark}
                    />
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
              </>
            ) : null}
            {can("branches:read") ? (
              <Pressable
                style={s.tile}
                onPress={() => nav.navigate("Branches")}
              >
                <View style={s.icon}>
                  <Ionicons
                    name="business-outline"
                    size={22}
                    color={colors.amberDark}
                  />
                </View>
                <Text style={s.label}>Branches</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}
      {MODULE_GROUPS.map((g) => {
        const items = g.items.filter((i) =>
          isSuper
            ? i.platform && i.key !== "p-schools"
            : !i.platform &&
              i.key !== "exams" &&
              i.key !== "inventory" &&
              i.key !== "hostel" &&
              (!i.perm || can(i.perm)),
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
                    } else if (i.key === "homework") {
                      nav.navigate("Homework");
                    } else if (i.key === "leaves") {
                      nav.navigate("Leave");
                    } else if (i.key === "payroll") {
                      nav.navigate("Payroll");
                    } else if (i.key === "orders") {
                      nav.navigate("OnlinePayment");
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
