import type { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";

export type IconName = ComponentProps<typeof Ionicons>["name"];
export interface ModuleDef {
  key: string;
  title: string;
  endpoint: string;
  icon: IconName;
  perm?: string;
  platform?: boolean;
}
export interface ModuleGroup {
  title: string;
  items: ModuleDef[];
}

const m = (
  key: string,
  title: string,
  endpoint: string,
  icon: IconName,
  perm?: string,
  platform = false,
): ModuleDef => ({ key, title, endpoint, icon, perm, platform });

export const MODULE_GROUPS: ModuleGroup[] = [
  {
    title: "Academics",
    items: [
      m(
        "attendance",
        "Attendance",
        "/attendance",
        "calendar",
        "attendance:read",
      ),
      m("timetable", "Timetable", "/timetable", "time", "timetable:read"),
      m("homework", "Homework", "/homework", "book", "homework:read"),
      m("exams", "Examination", "/exams", "document-text", "exams:read"),
      m("marks", "Marks", "/marks", "ribbon", "marks:read"),
      m("syllabus", "Syllabus", "/syllabus", "list", "dashboard:view"),
      m(
        "study",
        "Study Materials",
        "/study-materials",
        "library",
        "dashboard:view",
      ),
      m("behavior", "Behavior Log", "/behavior", "happy", "conduct:read"),
      m(
        "achievements",
        "Achievements",
        "/achievements",
        "trophy",
        "achievements:read",
      ),
      m("documents", "Documents", "/documents", "folder", "students:read"),
    ],
  },
  {
    title: "Administration",
    items: [
      m(
        "admissions",
        "Admissions",
        "/admissions",
        "person-add",
        "admissions:read",
      ),
      m("staff", "Staff", "/staff", "briefcase", "staff:read"),
      m("events", "Events", "/events", "star", "events:read"),
      m("leaves", "Leave", "/leaves", "airplane", "leaves:apply"),
      m("payroll", "Payroll", "/payroll", "cash", "payroll:view"),
      m("inventory", "Inventory", "/inventory", "cube", "inventory:read"),
      m(
        "sessions",
        "Academic Sessions",
        "/auth/sessions",
        "calendar-number",
        "sessions:read",
      ),
      m("users", "Users", "/auth/users", "people-circle", "users:manage"),
    ],
  },
  {
    title: "Finance",
    items: [
      m("fees", "Fee Invoices", "/fees", "wallet", "fees:read"),
      m("payments", "Payments", "/payments", "card", "fees:read"),
      m(
        "structure",
        "Fee Structure",
        "/fees/structure",
        "layers",
        "fees:structure",
      ),
      m("orders", "Online Payments", "/payments/orders", "globe", "fees:read"),
    ],
  },
  {
    title: "Facilities",
    items: [
      m("books", "Library Books", "/library/books", "book", "library:read"),
      m(
        "issues",
        "Book Issues",
        "/library/issues",
        "swap-horizontal",
        "library:read",
      ),
      m("hostel", "Hostel", "/hostel", "bed", "hostel:read"),
      m("transport", "Bus / Transport", "/transport", "bus", "transport:read"),
    ],
  },
  {
    title: "Platform",
    items: [
      m("p-schools", "Schools", "/platform/schools", "school", undefined, true),
      m(
        "p-plans",
        "Plans & Pricing",
        "/platform/plans",
        "pricetag",
        undefined,
        true,
      ),
      m(
        "p-subs",
        "Subscriptions",
        "/platform/subscriptions",
        "card",
        undefined,
        true,
      ),
      m(
        "p-reports",
        "Reports",
        "/platform/reports",
        "bar-chart",
        undefined,
        true,
      ),
      m(
        "p-settings",
        "Platform Settings",
        "/platform/settings",
        "settings",
        undefined,
        true,
      ),
      m(
        "p-audit",
        "Audit Logs",
        "/platform/audit-logs",
        "shield-checkmark",
        undefined,
        true,
      ),
    ],
  },
  {
    title: "General",
    items: [
      m("notifications", "Notifications", "/notifications", "notifications"),
    ],
  },
];
