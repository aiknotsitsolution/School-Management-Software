import AdmissionEnquiryScreen from "./src/screens/AdmissionEnquiryScreen";
import React, { useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { AuthProvider, useAuth } from "./src/context/AuthContext";
import LoginScreen from "./src/screens/LoginScreen";
import DashboardScreen from "./src/screens/DashboardScreen";
import SchoolsManagementScreen from "./src/screens/SchoolsManagementScreen";
import SchoolOnboardingScreen from "./src/screens/SchoolOnboardingScreen";
import PlatformUsersScreen from "./src/screens/PlatformUsersScreen";
import PlatformPlansScreen from "./src/screens/PlatformPlansScreen";
import PlatformSubscriptionsScreen from "./src/screens/PlatformSubscriptionsScreen";
import PlatformReportsScreen from "./src/screens/PlatformReportsScreen";
import PlatformSettingsScreen from "./src/screens/PlatformSettingsScreen";
import StudentsScreen from "./src/screens/StudentsScreen";
import NoticesScreen from "./src/screens/NoticesScreen";
import MessagesScreen from "./src/screens/MessagesScreen";
import BroadcastScreen from "./src/screens/BroadcastScreen";
import EventsScreen from "./src/screens/EventsScreen";
import StudentOnboardScreen from "./src/screens/StudentOnboardScreen";
import ProfileScreen from "./src/screens/ProfileScreen";
import MoreScreen from "./src/screens/MoreScreen";
import ModuleListScreen from "./src/screens/ModuleListScreen";
import ModuleDetailScreen from "./src/screens/ModuleDetailScreen";
import FormScreen from "./src/screens/FormScreen";
import MarkAttendanceScreen from "./src/screens/MarkAttendanceScreen";
import ExaminationScreen from "./src/screens/ExaminationScreen";
import EditRecordScreen from "./src/screens/EditRecordScreen";
import MarksEntryScreen from "./src/screens/MarksEntryScreen";
import NotificationsScreen from "./src/screens/NotificationsScreen";
import UsersAccessScreen from "./src/screens/UsersAccessScreen";
import ManageSchoolScreen from "./src/screens/ManageSchoolScreen";
import SubscriptionScreen from "./src/screens/SubscriptionScreen";
import ForgotPasswordScreen from "./src/screens/ForgotPasswordScreen";
import TimetableScreen from "./src/screens/TimetableScreen";
import ReportCardScreen from "./src/screens/ReportCardScreen";
import GradingScalesScreen from "./src/screens/GradingScalesScreen";
import SyllabusScreen from "./src/screens/SyllabusScreen";
import LibraryScreen from "./src/screens/LibraryScreen";
import PromotionsScreen from "./src/screens/PromotionsScreen";
import TransfersScreen from "./src/screens/TransfersScreen";
import AcademicSessionsScreen from "./src/screens/AcademicSessionsScreen";
import RolloverScreen from "./src/screens/RolloverScreen";
import InventoryScreen from "./src/screens/InventoryScreen";
import HostelScreen from "./src/screens/HostelScreen";
import {
  NotificationsProvider,
  useNotifications,
} from "./src/context/NotificationsContext";
import BusTrackingScreen from "./src/screens/BusTrackingScreen";
import IdCardScreen from "./src/screens/IdCardScreen";
import UploadDocumentScreen from "./src/screens/UploadDocumentScreen";
import StaffScreen from "./src/screens/StaffScreen";
import FeesCollectionScreen from "./src/screens/FeesCollectionScreen";
import HomeworkScreen from "./src/screens/HomeworkScreen";
import LeaveScreen from "./src/screens/LeaveScreen";
import PayrollScreen from "./src/screens/PayrollScreen";
import OnlinePaymentScreen from "./src/screens/OnlinePaymentScreen";
import ReportsScreen from "./src/screens/ReportsScreen";
import BranchesScreen from "./src/screens/BranchesScreen";
import { colors } from "./src/theme";

export type RootStackParams = {
  Tabs: undefined;
  Module: { title: string; endpoint: string };
  Plans: undefined;
  Subscriptions: undefined;
  Reports: undefined;
  PlatformSettings: undefined;
  SchoolOnboarding: undefined;
  AdmissionEnquiry: undefined;
  NoticeBoard: undefined;
  MessageBoard: undefined;
  Broadcast: undefined;
  Events: undefined;
  StudentOnboard: undefined;
  StudentDatabase: undefined;
  Detail: { title: string; row: Record<string, unknown>; endpoint?: string };
  Form: { form: string; initial?: Record<string, string> };
  Edit: { endpoint: string; row: Record<string, unknown> };
  MarksEntry: undefined;
  Timetable: undefined;
  ReportCard: undefined;
  GradingScales: undefined;
  Syllabus: undefined;
  Library: undefined;
  Promotions: undefined;
  Transfers: undefined;
  AcademicSessions: undefined;
  Rollover: undefined;
  Inventory: undefined;
  Hostel: undefined;
  BusTracking: undefined;
  IdCard: undefined;
  UploadDocument: undefined;
  MarkAttendance: undefined;
  Examination: undefined;
  Staff: undefined;
  FeesCollection: undefined;
  ManageSchool: undefined;
  Subscription: undefined;
  Homework: undefined;
  Leave: undefined;
  Payroll: undefined;
  OnlinePayment: undefined;
  SchoolReports: undefined;
  Branches: undefined;
};

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator<RootStackParams>();
const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
  Dashboard: "grid",
  Schools: "business",
  Users: "people-circle",
  "Admission Enquiry": "person-add",
  Staff: "people",
  Students: "people",
  Notices: "megaphone",
  Alerts: "notifications",
  "Users & Access": "people",
  More: "apps",
  Profile: "person",
};
const header = {
  headerStyle: { backgroundColor: colors.ink },
  headerTintColor: "#fff",
};

function PlatformTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        ...header,
        tabBarActiveTintColor: colors.ink,
        tabBarInactiveTintColor: "#98A2B3",
        tabBarIcon: ({ color, size }) => (
          <Ionicons name={icons[route.name]} size={size} color={color} />
        ),
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Schools" component={SchoolsManagementScreen} />
      <Tab.Screen name="Users" component={PlatformUsersScreen} />
      <Tab.Screen name="More" component={MoreScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

function SchoolTabs() {
  const { can } = useAuth();
  const { user } = useAuth();
  const { unread } = useNotifications();
  const isSchoolAdmin = user?.role === "school_admin" || user?.role === "admin";
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        ...header,
        tabBarActiveTintColor: colors.ink,
        tabBarInactiveTintColor: "#98A2B3",
        tabBarIcon: ({ color, size }) => (
          <Ionicons name={icons[route.name]} size={size} color={color} />
        ),
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      {isSchoolAdmin ? (
        can("admissions:read") && (
          <Tab.Screen
            name="Admission Enquiry"
            component={AdmissionEnquiryScreen}
            options={{ title: "Admissions" }}
          />
        )
      ) : (
        <>
          {can("students:read") && (
            <Tab.Screen name="Students" component={StudentsScreen} />
          )}
          <Tab.Screen name="Notices" component={NoticesScreen} />
        </>
      )}
      {isSchoolAdmin && can("staff:read") && (
        <Tab.Screen
          name="Staff"
          component={StaffScreen}
          options={{ title: "Teachers" }}
        />
      )}
      {isSchoolAdmin && can("users:manage") ? (
        <Tab.Screen
          name="Users & Access"
          component={UsersAccessScreen}
          options={{ title: "Users & Access" }}
        />
      ) : (
        <Tab.Screen
          name="Alerts"
          component={NotificationsScreen}
          options={{ tabBarBadge: unread > 0 ? unread : undefined }}
        />
      )}
      <Tab.Screen name="More" component={MoreScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

function Tabs() {
  const { user } = useAuth();
  return user?.role === "super_admin" ? <PlatformTabs /> : <SchoolTabs />;
}

function Root() {
  const { user, loading } = useAuth();
  const [forgot, setForgot] = useState(false);
  if (loading)
    return (
      <View style={{ flex: 1, justifyContent: "center" }}>
        <ActivityIndicator size="large" color={colors.ink} />
      </View>
    );
  if (!user)
    return forgot ? (
      <ForgotPasswordScreen onBack={() => setForgot(false)} />
    ) : (
      <LoginScreen onForgot={() => setForgot(true)} />
    );
  const navigation = (
    <Stack.Navigator screenOptions={header}>
      <Stack.Screen
        name="Tabs"
        component={Tabs}
        options={{ headerShown: false }}
      />
      <Stack.Screen name="Module" component={ModuleListScreen} />
      <Stack.Screen
        name="SchoolOnboarding"
        component={SchoolOnboardingScreen}
        options={{ title: "School Onboarding" }}
      />
      <Stack.Screen
        name="AdmissionEnquiry"
        component={AdmissionEnquiryScreen}
        options={{ title: "Admission Enquiry" }}
      />
      <Stack.Screen
        name="NoticeBoard"
        component={NoticesScreen}
        options={{ title: "Notice Board" }}
      />
      <Stack.Screen
        name="MessageBoard"
        component={MessagesScreen}
        options={{ title: "Message Board" }}
      />
      <Stack.Screen
        name="Broadcast"
        component={BroadcastScreen}
        options={{ title: "Broadcast" }}
      />
      <Stack.Screen
        name="Events"
        component={EventsScreen}
        options={{ title: "Events" }}
      />
      <Stack.Screen
        name="StudentOnboard"
        component={StudentOnboardScreen}
        options={{ title: "Student Onboard" }}
      />
      <Stack.Screen
        name="StudentDatabase"
        component={StudentsScreen}
        options={{ title: "Student Database" }}
      />
      <Stack.Screen
        name="Staff"
        component={StaffScreen}
        options={{ title: "Staff Directory" }}
      />
      <Stack.Screen
        name="FeesCollection"
        component={FeesCollectionScreen}
        options={{ title: "Fees Collection" }}
      />
      <Stack.Screen
        name="ManageSchool"
        component={ManageSchoolScreen}
        options={{ title: "Manage School" }}
      />
      <Stack.Screen
        name="Branches"
        component={BranchesScreen}
        options={{ title: "Branches" }}
      />
      <Stack.Screen
        name="Subscription"
        component={SubscriptionScreen}
        options={{ title: "Subscription & Upgrade" }}
      />
      <Stack.Screen
        name="Plans"
        component={PlatformPlansScreen}
        options={{ title: "Plans & Pricing" }}
      />
      <Stack.Screen
        name="Subscriptions"
        component={PlatformSubscriptionsScreen}
        options={{ title: "Subscriptions" }}
      />
      <Stack.Screen
        name="Reports"
        component={PlatformReportsScreen}
        options={{ title: "Platform Reports" }}
      />
      <Stack.Screen
        name="PlatformSettings"
        component={PlatformSettingsScreen}
        options={{ title: "Platform Settings" }}
      />
      <Stack.Screen name="Detail" component={ModuleDetailScreen} />
      <Stack.Screen name="Form" component={FormScreen} />
      <Stack.Screen name="Timetable" component={TimetableScreen} />
      <Stack.Screen
        name="ReportCard"
        component={ReportCardScreen}
        options={{ title: "Report Card" }}
      />
      <Stack.Screen
        name="GradingScales"
        component={GradingScalesScreen}
        options={{ title: "Grading Scales" }}
      />
      <Stack.Screen
        name="Syllabus"
        component={SyllabusScreen}
        options={{ title: "Syllabus" }}
      />
      <Stack.Screen
        name="Library"
        component={LibraryScreen}
        options={{ title: "My Library" }}
      />
      <Stack.Screen
        name="Promotions"
        component={PromotionsScreen}
        options={{ title: "Promotions" }}
      />
      <Stack.Screen
        name="Transfers"
        component={TransfersScreen}
        options={{ title: "Transfers" }}
      />
      <Stack.Screen
        name="AcademicSessions"
        component={AcademicSessionsScreen}
        options={{ title: "Academic Sessions" }}
      />
      <Stack.Screen
        name="Rollover"
        component={RolloverScreen}
        options={{ title: "Academic Rollover" }}
      />
      <Stack.Screen
        name="Inventory"
        component={InventoryScreen}
        options={{ title: "Inventory" }}
      />
      <Stack.Screen
        name="Hostel"
        component={HostelScreen}
        options={{ title: "Hostel Management" }}
      />
      <Stack.Screen
        name="BusTracking"
        component={BusTrackingScreen}
        options={{ title: "Bus Tracking" }}
      />
      <Stack.Screen
        name="IdCard"
        component={IdCardScreen}
        options={{ title: "ID Card" }}
      />
      <Stack.Screen
        name="UploadDocument"
        component={UploadDocumentScreen}
        options={{ title: "Upload Document" }}
      />
      <Stack.Screen name="Edit" component={EditRecordScreen} />
      <Stack.Screen
        name="MarksEntry"
        component={MarksEntryScreen}
        options={{ title: "Marks Entry" }}
      />
      <Stack.Screen
        name="MarkAttendance"
        component={MarkAttendanceScreen}
        options={{ title: "Attendance" }}
      />
      <Stack.Screen
        name="Examination"
        component={ExaminationScreen}
        options={{ title: "Examination" }}
      />
      <Stack.Screen
        name="Homework"
        component={HomeworkScreen}
        options={{ title: "Homework" }}
      />
      <Stack.Screen
        name="Leave"
        component={LeaveScreen}
        options={{ title: "Leave Management" }}
      />
      <Stack.Screen
        name="Payroll"
        component={PayrollScreen}
        options={{ title: "Payroll Management" }}
      />
      <Stack.Screen
        name="OnlinePayment"
        component={OnlinePaymentScreen}
        options={{ title: "Online Fees Payment" }}
      />
      <Stack.Screen
        name="SchoolReports"
        component={ReportsScreen}
        options={{ title: "Reports & Analytics" }}
      />
    </Stack.Navigator>
  );
  return user.role === "super_admin" ? (
    navigation
  ) : (
    <NotificationsProvider>{navigation}</NotificationsProvider>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NavigationContainer>
          <StatusBar style="light" />
          <Root />
        </NavigationContainer>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
