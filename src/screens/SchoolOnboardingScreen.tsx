import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../lib/api";
import { Button, Card, Input, Toast } from "../components/UI";
import { colors } from "../theme";
import type { PlatformPlan, School } from "../types";

type SchoolForm = {
  name: string;
  code: string;
  shortName: string;
  sessionStart: string;
  sessionEnd: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
};
type AdminForm = { name: string; email: string; password: string };

const year = new Date().getFullYear();
const initialSchool: SchoolForm = {
  name: "",
  code: "",
  shortName: "",
  sessionStart: `${year}-04-01`,
  sessionEnd: `${year + 1}-03-31`,
  email: "",
  phone: "",
  address: "",
  city: "",
  state: "",
  pincode: "",
};
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^[+]?[(]?[0-9]{1,4}[)]?[-\s./0-9]*$/;

export default function SchoolOnboardingScreen() {
  const [step, setStep] = useState(0);
  const [schoolForm, setSchoolForm] = useState<SchoolForm>(initialSchool);
  const [admin, setAdmin] = useState<AdminForm>({
    name: "",
    email: "",
    password: "",
  });
  const [plans, setPlans] = useState<PlatformPlan[]>([]);
  const [planId, setPlanId] = useState("");
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [createdSchool, setCreatedSchool] = useState<School | null>(null);
  const [adminCreated, setAdminCreated] = useState(false);
  const [subscriptionAssigned, setSubscriptionAssigned] = useState(false);
  const [onboardingStatus, setOnboardingStatus] = useState("created");
  const [done, setDone] = useState(false);

  useEffect(() => {
    let active = true;
    api.plans
      .list("status=active&limit=100")
      .then((response) => {
        if (!active) return;
        setPlans(response.data || []);
        if (response.data?.length) setPlanId(response.data[0]._id);
      })
      .catch((loadError: unknown) => {
        if (active)
          setError(
            (loadError as Error).message ||
              "Unable to load subscription plans.",
          );
      })
      .finally(() => {
        if (active) setLoadingPlans(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const patchSchool = (key: keyof SchoolForm, value: string) =>
    setSchoolForm((current) => ({ ...current, [key]: value }));
  const patchAdmin = (key: keyof AdminForm, value: string) =>
    setAdmin((current) => ({ ...current, [key]: value }));

  const nextFromProfile = () => {
    if (!schoolForm.name.trim() || !schoolForm.code.trim())
      return setError("School name and code are required.");
    if (schoolForm.email && !emailPattern.test(schoolForm.email.trim()))
      return setError("Enter a valid school email.");
    if (schoolForm.phone && !phonePattern.test(schoolForm.phone.trim()))
      return setError("Enter a valid phone number.");
    if (
      schoolForm.pincode &&
      !/^[1-9][0-9]{5}$/.test(schoolForm.pincode.trim())
    )
      return setError("Enter a valid 6-digit pincode.");
    if (
      !schoolForm.sessionStart ||
      !schoolForm.sessionEnd ||
      new Date(schoolForm.sessionEnd) <= new Date(schoolForm.sessionStart)
    )
      return setError("Session end date must be after the start date.");
    setError("");
    setStep(1);
  };

  const nextFromAdmin = () => {
    if (!admin.name.trim() || !admin.email.trim() || !admin.password)
      return setError("Admin name, email and password are required.");
    if (!emailPattern.test(admin.email.trim()))
      return setError("Enter a valid admin email.");
    if (admin.password.length < 8)
      return setError("Admin password must be at least 8 characters.");
    setError("");
    setStep(2);
  };

  const launch = async () => {
    if (!planId) return setError("Select a subscription plan first.");
    setError("");
    setBusy(true);
    try {
      let school = createdSchool;
      if (!school) {
        const response = await api.createSchool({
          ...schoolForm,
          name: schoolForm.name.trim(),
          code: schoolForm.code.trim().toLowerCase(),
          shortName: schoolForm.shortName.trim() || undefined,
          email: schoolForm.email.trim().toLowerCase() || undefined,
          phone: schoolForm.phone.trim() || undefined,
          address: schoolForm.address.trim() || undefined,
          city: schoolForm.city.trim() || undefined,
          state: schoolForm.state.trim() || undefined,
          pincode: schoolForm.pincode.trim() || undefined,
        });
        school = response.data;
        setCreatedSchool(school);
      }
      const schoolId = school._id || school.id;
      if (!schoolId)
        throw new Error(
          "School was created, but the server did not return its ID.",
        );

      let currentOnboardingStatus = onboardingStatus;
      if (currentOnboardingStatus === "created") {
        await api.platform.schools.updateOnboarding(schoolId, "configured");
        currentOnboardingStatus = "configured";
        setOnboardingStatus("configured");
      }
      if (!adminCreated) {
        await api.createUser({
          schoolId,
          name: admin.name.trim(),
          email: admin.email.trim().toLowerCase(),
          password: admin.password,
          role: "school_admin",
        });
        setAdminCreated(true);
      }
      if (!subscriptionAssigned) {
        await api.platform.assignSubscription(schoolId, planId);
        setSubscriptionAssigned(true);
      }
      if (currentOnboardingStatus === "configured") {
        await api.platform.schools.updateOnboarding(schoolId, "subscribed");
        currentOnboardingStatus = "subscribed";
        setOnboardingStatus("subscribed");
      }
      if (currentOnboardingStatus === "subscribed") {
        await api.platform.schools.updateOnboarding(schoolId, "live");
        currentOnboardingStatus = "live";
        setOnboardingStatus("live");
      }
      void api.platform.schools.sendWelcomeEmail(schoolId).catch(() => {});
      setDone(true);
    } catch (launchError) {
      setError(
        (launchError as Error).message ||
          "School onboarding failed. Retry to continue.",
      );
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setStep(0);
    setSchoolForm(initialSchool);
    setAdmin({ name: "", email: "", password: "" });
    setPlanId(plans[0]?._id || "");
    setCreatedSchool(null);
    setAdminCreated(false);
    setSubscriptionAssigned(false);
    setOnboardingStatus("created");
    setDone(false);
    setError("");
  };

  if (done) {
    return (
      <ScrollView style={s.root} contentContainerStyle={s.content}>
        <Card style={s.successCard}>
          <Ionicons name="checkmark-circle" size={44} color={colors.success} />
          <Text style={s.title}>School launched</Text>
          <Text style={s.subtitle}>
            {schoolForm.name} is live with an admin account and subscription.
          </Text>
          <Text style={s.detail}>Admin login: {admin.email}</Text>
          <Button title="Onboard another school" onPress={reset} />
        </Card>
      </ScrollView>
    );
  }

  const steps = ["School profile", "School admin", "Subscription", "Launch"];
  return (
    <View style={s.root}>
      {!!error && <Toast message={error} onDismiss={() => setError("")} />}
      <ScrollView
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
      >
        <View>
          <Text style={s.eyebrow}>PLATFORM OWNER · SCHOOL OPERATIONS</Text>
          <Text style={s.title}>Onboard a school</Text>
          <Text style={s.subtitle}>
            Create a tenant, admin account and first subscription.
          </Text>
        </View>

        <View style={s.stepper}>
          {steps.map((label, index) => (
            <Pressable
              key={label}
              onPress={() => index < step && setStep(index)}
              disabled={index > step}
              style={s.stepItem}
            >
              <View
                style={[
                  s.stepNumber,
                  index === step && s.currentStep,
                  index < step && s.completeStep,
                ]}
              >
                <Text
                  style={[
                    s.stepNumberText,
                    (index === step || index < step) && s.currentStepText,
                  ]}
                >
                  {index < step ? "✓" : index + 1}
                </Text>
              </View>
              <Text
                numberOfLines={1}
                style={[s.stepLabel, index === step && s.currentLabel]}
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </View>

        {step === 0 && (
          <Card style={s.formCard}>
            <Text style={s.sectionTitle}>School profile</Text>
            <Field
              label="School name *"
              value={schoolForm.name}
              onChangeText={(value) => patchSchool("name", value)}
              placeholder="e.g. Brightwood Academy"
            />
            <Field
              label="School code *"
              value={schoolForm.code}
              onChangeText={(value) => patchSchool("code", value)}
              placeholder="e.g. brightwood-academy"
              autoCapitalize="none"
            />
            <Field
              label="Short name"
              value={schoolForm.shortName}
              onChangeText={(value) => patchSchool("shortName", value)}
              placeholder="Optional"
            />
            <Text style={s.helper}>Academic session dates (YYYY-MM-DD)</Text>
            <View style={s.dateRow}>
              <View style={s.dateField}>
                <Field
                  label="Starts *"
                  value={schoolForm.sessionStart}
                  onChangeText={(value) => patchSchool("sessionStart", value)}
                  placeholder="2026-04-01"
                />
              </View>
              <View style={s.dateField}>
                <Field
                  label="Ends *"
                  value={schoolForm.sessionEnd}
                  onChangeText={(value) => patchSchool("sessionEnd", value)}
                  placeholder="2027-03-31"
                />
              </View>
            </View>
            <Field
              label="School email"
              value={schoolForm.email}
              onChangeText={(value) => patchSchool("email", value)}
              placeholder="office@school.com"
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <Field
              label="Phone"
              value={schoolForm.phone}
              onChangeText={(value) => patchSchool("phone", value)}
              placeholder="School contact number"
              keyboardType="phone-pad"
            />
            <Field
              label="Address"
              value={schoolForm.address}
              onChangeText={(value) => patchSchool("address", value)}
              placeholder="Street address"
            />
            <View style={s.dateRow}>
              <View style={s.dateField}>
                <Field
                  label="City"
                  value={schoolForm.city}
                  onChangeText={(value) => patchSchool("city", value)}
                  placeholder="City"
                />
              </View>
              <View style={s.dateField}>
                <Field
                  label="State"
                  value={schoolForm.state}
                  onChangeText={(value) => patchSchool("state", value)}
                  placeholder="State"
                />
              </View>
            </View>
            <Field
              label="Pincode"
              value={schoolForm.pincode}
              onChangeText={(value) => patchSchool("pincode", value)}
              placeholder="6-digit pincode"
              keyboardType="number-pad"
              maxLength={6}
            />
            <Button title="Continue to admin" onPress={nextFromProfile} />
          </Card>
        )}

        {step === 1 && (
          <Card style={s.formCard}>
            <Text style={s.sectionTitle}>School admin account</Text>
            <Field
              label="Admin full name *"
              value={admin.name}
              onChangeText={(value) => patchAdmin("name", value)}
              placeholder="Full name"
            />
            <Field
              label="Admin email *"
              value={admin.email}
              onChangeText={(value) => patchAdmin("email", value)}
              placeholder="admin@school.com"
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <Field
              label="Temporary password *"
              value={admin.password}
              onChangeText={(value) => patchAdmin("password", value)}
              placeholder="At least 8 characters"
              secureTextEntry
              autoCapitalize="none"
            />
            <View style={s.buttonRow}>
              <Button title="Back" variant="ghost" onPress={() => setStep(0)} />
              <View style={s.buttonSpacer}>
                <Button title="Choose plan" onPress={nextFromAdmin} />
              </View>
            </View>
          </Card>
        )}

        {step === 2 && (
          <Card style={s.formCard}>
            <Text style={s.sectionTitle}>Choose subscription plan</Text>
            {loadingPlans ? (
              <ActivityIndicator color={colors.ink} style={{ margin: 24 }} />
            ) : plans.length ? (
              plans.map((plan) => {
                const selected = planId === plan._id;
                return (
                  <Pressable
                    key={plan._id}
                    onPress={() => setPlanId(plan._id)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    style={[s.plan, selected && s.selectedPlan]}
                  >
                    <View style={s.planTop}>
                      <View style={[s.radio, selected && s.radioSelected]}>
                        {selected && <View style={s.radioDot} />}
                      </View>
                      <View style={s.planInfo}>
                        <Text style={s.planName}>{plan.name}</Text>
                        <Text style={s.planDescription}>
                          {plan.description || plan.code}
                        </Text>
                      </View>
                      <Text style={s.planPrice}>
                        ₹{Number(plan.price || 0).toLocaleString("en-IN")}/
                        {plan.billingCycle === "yearly" ? "yr" : "mo"}
                      </Text>
                    </View>
                    <Text style={s.planTrial}>
                      {plan.trialDays
                        ? `${plan.trialDays}-day trial`
                        : "No trial"}
                    </Text>
                  </Pressable>
                );
              })
            ) : (
              <Text style={s.subtitle}>No active plans are available.</Text>
            )}
            <View style={s.buttonRow}>
              <Button title="Back" variant="ghost" onPress={() => setStep(1)} />
              <View style={s.buttonSpacer}>
                <Button
                  title="Review launch"
                  onPress={() => {
                    if (planId) setStep(3);
                    else setError("Select a plan first.");
                  }}
                  loading={loadingPlans}
                />
              </View>
            </View>
          </Card>
        )}

        {step === 3 && (
          <Card style={s.formCard}>
            <Text style={s.sectionTitle}>Review and launch</Text>
            <ReviewRow label="School" value={schoolForm.name} />
            <ReviewRow label="Code" value={schoolForm.code.toLowerCase()} />
            <ReviewRow
              label="Academic session"
              value={`${schoolForm.sessionStart} to ${schoolForm.sessionEnd}`}
            />
            <ReviewRow label="School admin" value={admin.email} />
            <ReviewRow
              label="Subscription"
              value={plans.find((plan) => plan._id === planId)?.name || "—"}
            />
            {!!createdSchool && (
              <Text style={s.resumeNote}>
                School record already created. Retry will continue onboarding
                without creating a duplicate.
              </Text>
            )}
            <View style={s.buttonRow}>
              <Button title="Back" variant="ghost" onPress={() => setStep(2)} />
              <View style={s.buttonSpacer}>
                <Button
                  title={busy ? "Launching..." : "Launch school"}
                  onPress={launch}
                  loading={busy}
                />
              </View>
            </View>
          </Card>
        )}
      </ScrollView>
    </View>
  );
}

function Field({
  label,
  ...props
}: { label: string } & React.ComponentProps<typeof Input>) {
  return (
    <View style={s.field}>
      <Text style={s.fieldLabel}>{label}</Text>
      <Input {...props} style={[s.input, props.style]} />
    </View>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.reviewRow}>
      <Text style={s.reviewLabel}>{label}</Text>
      <Text style={s.reviewValue}>{value || "—"}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 16, paddingBottom: 30, gap: 16 },
  eyebrow: { color: colors.amberDark, fontSize: 10, fontWeight: "800" },
  title: { color: colors.ink, fontSize: 23, fontWeight: "800", marginTop: 5 },
  subtitle: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 4 },
  stepper: { flexDirection: "row", justifyContent: "space-between", gap: 4 },
  stepItem: { flex: 1, alignItems: "center", gap: 5 },
  stepNumber: {
    width: 27,
    height: 27,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: "#E9E6DE",
  },
  currentStep: { backgroundColor: colors.ink },
  completeStep: { backgroundColor: colors.success },
  stepNumberText: { color: colors.muted, fontSize: 11, fontWeight: "800" },
  currentStepText: { color: "#fff" },
  stepLabel: { color: colors.muted, fontSize: 9, textAlign: "center" },
  currentLabel: { color: colors.ink, fontWeight: "700" },
  formCard: { gap: 14, borderRadius: 8 },
  sectionTitle: { color: colors.ink, fontSize: 16, fontWeight: "800" },
  field: { gap: 5 },
  fieldLabel: { color: colors.ink, fontSize: 11, fontWeight: "700" },
  input: { minHeight: 44, borderRadius: 8, fontSize: 13, paddingVertical: 9 },
  helper: { color: colors.muted, fontSize: 10, marginBottom: -8 },
  dateRow: { flexDirection: "row", gap: 10 },
  dateField: { flex: 1 },
  buttonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 4,
  },
  buttonSpacer: { flex: 1 },
  plan: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    gap: 7,
  },
  selectedPlan: { borderColor: colors.ink, backgroundColor: "#F4F5F7" },
  planTop: { flexDirection: "row", alignItems: "center", gap: 9 },
  radio: {
    width: 18,
    height: 18,
    borderWidth: 1.5,
    borderColor: colors.muted,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  radioSelected: { borderColor: colors.ink },
  radioDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.ink,
  },
  planInfo: { flex: 1, gap: 3 },
  planName: { color: colors.ink, fontSize: 13, fontWeight: "700" },
  planDescription: { color: colors.muted, fontSize: 10 },
  planPrice: { color: colors.ink, fontSize: 12, fontWeight: "800" },
  planTrial: { color: colors.muted, fontSize: 10, marginLeft: 27 },
  reviewRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  reviewLabel: { color: colors.muted, fontSize: 11 },
  reviewValue: {
    flex: 1,
    color: colors.ink,
    fontSize: 11,
    fontWeight: "700",
    textAlign: "right",
  },
  resumeNote: {
    color: colors.info,
    fontSize: 11,
    lineHeight: 16,
    backgroundColor: "#EFF7FC",
    padding: 10,
    borderRadius: 8,
  },
  successCard: {
    alignItems: "center",
    gap: 14,
    marginTop: 32,
    borderRadius: 8,
  },
  detail: { color: colors.muted, fontSize: 12, marginBottom: 6 },
});
