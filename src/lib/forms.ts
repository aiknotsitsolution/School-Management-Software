export type FieldType = "text" | "multiline" | "date" | "number" | "select" | "email" | "phone";
export interface Field { key: string; label: string; type?: FieldType; required?: boolean; options?: string[]; initial?: string }
export interface FormSpec { key: string; title: string; endpoint: string; method: "POST" | "PUT"; fields: Field[]; transform?: (v: Record<string, string>) => unknown }

const AUD: Record<string, string[]> = { All: ["all"], "All Parents": ["parent"], "All Staff": ["admin", "teacher"] };
const LEAVE: Record<string, string> = { "Casual Leave": "Casual", "Sick Leave": "Sick", "Privilege Leave": "Earned", "Medical Leave": "Other", "Maternity Leave": "Maternity", "Emergency Leave": "Other" };

export const FORMS: Record<string, FormSpec> = {
  student: {
    key: "student", title: "Add Student", endpoint: "/students", method: "POST",
    fields: [
      { key: "name", label: "Full Name", required: true },
      { key: "admissionNo", label: "Admission No", required: true },
      { key: "rollNo", label: "Roll No", required: true },
      { key: "class", label: "Class", required: true },
      { key: "section", label: "Section", required: true },
      { key: "gender", label: "Gender", type: "select", options: ["Male", "Female", "Other"], required: true },
      { key: "dob", label: "Date of Birth (YYYY-MM-DD)", type: "date", required: true },
      { key: "fatherName", label: "Father's Name" },
      { key: "motherName", label: "Mother's Name" },
      { key: "phone", label: "Parent Phone", type: "phone", required: true },
      { key: "email", label: "Parent Email", type: "email" },
      { key: "address", label: "Address", type: "multiline" },
    ],
  },
  leave: {
    key: "leave", title: "Apply Leave", endpoint: "/leaves", method: "POST",
    fields: [
      { key: "type", label: "Leave Type", type: "select", options: Object.keys(LEAVE), required: true, initial: "Casual Leave" },
      { key: "from", label: "From (YYYY-MM-DD)", type: "date", required: true },
      { key: "to", label: "To (YYYY-MM-DD)", type: "date", required: true },
      { key: "reason", label: "Reason", type: "multiline" },
    ],
    transform: (v) => {
      if (v.to < v.from) throw new Error("To date must be after from date");
      return { leaveType: LEAVE[v.type] || "Other", fromDate: v.from, toDate: v.to, reason: v.reason?.trim() || "—" };
    },
  },
  notice: {
    key: "notice", title: "Publish Notice", endpoint: "/notices", method: "POST",
    fields: [
      { key: "title", label: "Title", required: true },
      { key: "body", label: "Description", type: "multiline", required: true },
      { key: "category", label: "Category", type: "select", options: ["Academic", "Holiday", "Sports", "Fees", "Event", "Transport", "General"], initial: "General", required: true },
      { key: "audience", label: "Audience", type: "select", options: Object.keys(AUD), initial: "All", required: true },
      { key: "date", label: "Expiry Date (YYYY-MM-DD)", type: "date" },
    ],
    transform: (v) => ({ title: v.title.trim(), description: v.body.trim(), category: v.category, pinned: false, audience: AUD[v.audience] ?? ["all"], expiryDate: v.date || undefined }),
  },
  enquiry: {
    key: "enquiry", title: "New Enquiry", endpoint: "/admissions", method: "POST",
    fields: [
      { key: "childName", label: "Child Name", required: true },
      { key: "parentName", label: "Parent Name", required: true },
      { key: "classApplied", label: "Class Applied", required: true },
      { key: "contact", label: "Contact", type: "phone", required: true },
      { key: "email", label: "Email", type: "email" },
      { key: "source", label: "Source", type: "select", options: ["Website", "Walk-in", "Referral", "Social Media", "Newspaper Ad", "Other"], initial: "Walk-in" },
      { key: "status", label: "Status", type: "select", options: ["New", "Contacted", "Campus Visit Scheduled", "Admission Confirmed", "Declined"], initial: "New" },
      { key: "followUp", label: "Follow-up (YYYY-MM-DD)", type: "date" },
    ],
    transform: (v) => ({
      childName: v.childName.trim(), parentName: v.parentName.trim(), classApplied: v.classApplied.trim(), contact: v.contact.trim(),
      email: v.email?.trim() || undefined,
      source: ({ "Social Media": "Other", "Newspaper Ad": "Other" } as Record<string, string>)[v.source] ?? v.source,
      status: ({ "Admission Confirmed": "Admitted", Declined: "Rejected" } as Record<string, string>)[v.status] ?? v.status,
      followUpDate: v.followUp || undefined,
    }),
  },
  payment: {
    key: "payment", title: "Record Payment", endpoint: "/payments", method: "POST",
    fields: [
      { key: "invoiceId", label: "Invoice ID", required: true },
      { key: "amount", label: "Amount", type: "number", required: true },
      { key: "mode", label: "Mode", type: "select", options: ["Cash", "UPI", "Card", "Cheque", "Bank Transfer"], initial: "Cash", required: true },
      { key: "transactionId", label: "Transaction ID" },
    ],
    transform: (v) => ({ invoiceId: v.invoiceId.trim(), amount: Number(v.amount), mode: v.mode, transactionId: v.transactionId?.trim() || undefined }),
  },
};

// Which module list gets a "+" button, and the permission needed.
export const MODULE_FORM: Record<string, { form: string; perm: string }> = {
  "/leaves": { form: "leave", perm: "leaves:apply" },
  "/notices": { form: "notice", perm: "notices:publish" },
  "/payments": { form: "payment", perm: "fees:collect" },
  "/students": { form: "student", perm: "students:write" },
  "/admissions": { form: "enquiry", perm: "enquiries:write" },
};

// Edit / delete support per module (backend path = `${endpoint}/${_id}`).
export const RECORD_ACTIONS: Record<string, { edit?: string; del?: string }> = {
  "/students": { edit: "students:write", del: "students:write" },
  "/admissions": { edit: "enquiries:write", del: "enquiries:write" },
  "/notices": { edit: "notices:publish", del: "notices:publish" },
  "/homework": { edit: "homework:write", del: "homework:write" },
  "/exams": { edit: "exams:write", del: "exams:write" },
  "/events": { edit: "events:publish", del: "events:publish" },
  "/staff": { edit: "staff:write", del: "staff:write" },
  "/hostel": { edit: "hostel:manage", del: "hostel:manage" },
  "/inventory": { edit: "inventory:write", del: "inventory:write" },
  "/library/books": { edit: "library:manage", del: "library:manage" },
  "/fees/structure": { edit: "fees:structure", del: "fees:structure" },
  "/timetable": { del: "timetable:write" },
  "/behavior": { del: "conduct:write" },
  "/achievements": { del: "achievements:write" },
  "/syllabus": { del: "dashboard:view" },
  "/study-materials": { del: "dashboard:view" },
};
