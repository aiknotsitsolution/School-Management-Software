import React, { useEffect, useState } from "react";
import {
  ActionSheetIOS,
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api, uploadForm } from "../lib/api";
import { pickImage, toFormData } from "../lib/upload";
import { useAuth } from "../context/AuthContext";
import { Button, Card, Input, Toast } from "../components/UI";
import { colors } from "../theme";

export default function ProfileScreen() {
  const { user, school, signOut, updateUser } = useAuth();
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isSuperAdmin = user?.role === "super_admin";
  const [activeSection, setActiveSection] = useState<"profile" | "security">(
    "profile",
  );
  const [accountUser, setAccountUser] = useState(user);
  const [loadingAccount, setLoadingAccount] = useState(false);
  const [editing, setEditing] = useState(false);
  const [profileForm, setProfileForm] = useState({
    name: user?.name || "",
    phone: user?.phone || "",
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    oldPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [savingPassword, setSavingPassword] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isSuperAdmin) return;
    let current = true;
    setLoadingAccount(true);
    api
      .me()
      .then(async ({ data }) => {
        if (!current) return;
        setAccountUser(data.user);
        setProfileForm({
          name: data.user.name || "",
          phone: data.user.phone || "",
        });
        await updateUser(data.user);
      })
      .catch((loadError: unknown) => {
        if (current)
          setError(
            (loadError as Error).message || "Unable to load account details.",
          );
      })
      .finally(() => {
        if (current) setLoadingAccount(false);
      });
    return () => {
      current = false;
    };
  }, [isSuperAdmin, updateUser]);

  const change = async (camera: boolean) => {
    try {
      const f = await pickImage(camera);
      if (!f) return;
      setPreview(f.uri);
      setBusy(true);
      await uploadForm("/auth/upload-photo", toFormData("photo", f));
      const me = await api.me();
      await updateUser(me.data.user);
      setAccountUser(me.data.user);
      Alert.alert("Done", "Profile photo updated");
    } catch (e) {
      setPreview(null);
      Alert.alert("Error", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const chooseSource = () =>
    Platform.OS === "ios"
      ? ActionSheetIOS.showActionSheetWithOptions(
          {
            options: ["Cancel", "Take photo", "Choose from gallery"],
            cancelButtonIndex: 0,
          },
          (i) => {
            if (i) change(i === 1);
          },
        )
      : Alert.alert("Profile photo", "Choose source", [
          { text: "Camera", onPress: () => change(true) },
          { text: "Gallery", onPress: () => change(false) },
          { text: "Cancel", style: "cancel" },
        ]);
  const photoUser = isSuperAdmin ? accountUser : user;
  const photo =
    preview ?? photoUser?.avatar ?? photoUser?.photoUrl ?? photoUser?.photo;
  const row = (k: string, v?: string) => (
    <View style={s.row}>
      <Text style={s.k}>{k}</Text>
      <Text style={s.v}>{v ?? "—"}</Text>
    </View>
  );

  const saveProfile = async () => {
    if (!profileForm.name.trim()) {
      setError("Name is required.");
      return;
    }
    setSavingProfile(true);
    setError("");
    try {
      const response = await api.updateMe({
        name: profileForm.name.trim(),
        phone: profileForm.phone.trim(),
      });
      setAccountUser(response.data);
      await updateUser(response.data);
      setEditing(false);
      Alert.alert("Saved", "Profile updated successfully.");
    } catch (saveError) {
      setError(
        (saveError as Error).message || "Unable to update your profile.",
      );
    } finally {
      setSavingProfile(false);
    }
  };

  const changePassword = async () => {
    if (!passwordForm.oldPassword)
      return setError("Enter your current password.");
    if (passwordForm.newPassword.length < 8)
      return setError("New password must be at least 8 characters.");
    if (
      !/[a-zA-Z]/.test(passwordForm.newPassword) ||
      !/[0-9]/.test(passwordForm.newPassword)
    )
      return setError("New password must contain a letter and a number.");
    if (passwordForm.newPassword !== passwordForm.confirmPassword)
      return setError("New passwords do not match.");
    if (passwordForm.newPassword === passwordForm.oldPassword)
      return setError("New password must differ from your current password.");
    setSavingPassword(true);
    setError("");
    try {
      await api.changePassword({
        oldPassword: passwordForm.oldPassword,
        newPassword: passwordForm.newPassword,
      });
      setPasswordForm({
        oldPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
      Alert.alert("Updated", "Password updated successfully.");
    } catch (passwordError) {
      setError(
        (passwordError as Error).message || "Unable to change password.",
      );
    } finally {
      setSavingPassword(false);
    }
  };

  if (isSuperAdmin) {
    return (
      <View style={s.accountRoot}>
        {!!error && <Toast message={error} onDismiss={() => setError("")} />}
        <ScrollView
          contentContainerStyle={s.accountContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={s.accountHeading}>
            <View>
              <Text style={s.eyebrow}>MY ACCOUNT</Text>
              <Text style={s.accountTitle}>Profile & security</Text>
            </View>
            <Ionicons name="person-circle" size={31} color={colors.amberDark} />
          </View>

          <View style={s.accountTabs}>
            <Pressable
              onPress={() => setActiveSection("profile")}
              style={[
                s.accountTab,
                activeSection === "profile" && s.accountTabActive,
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: activeSection === "profile" }}
            >
              <Text
                style={[
                  s.accountTabText,
                  activeSection === "profile" && s.accountTabTextActive,
                ]}
              >
                My Profile
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setActiveSection("security")}
              style={[
                s.accountTab,
                activeSection === "security" && s.accountTabActive,
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: activeSection === "security" }}
            >
              <Text
                style={[
                  s.accountTabText,
                  activeSection === "security" && s.accountTabTextActive,
                ]}
              >
                Security
              </Text>
            </Pressable>
          </View>

          {activeSection === "profile" ? (
            <>
              <Card style={s.identityCard}>
                <Pressable
                  onPress={chooseSource}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityLabel="Change profile photo"
                >
                  {photo ? (
                    <Image source={{ uri: photo }} style={s.accountAvatar} />
                  ) : (
                    <View style={[s.accountAvatar, s.avatarPlaceholder]}>
                      <Text style={s.avatarInitial}>
                        {(photoUser?.name ?? "?")[0]?.toUpperCase()}
                      </Text>
                    </View>
                  )}
                </Pressable>
                <Text style={s.identityName}>{photoUser?.name || "—"}</Text>
                <Text style={s.identityEmail}>{photoUser?.email || "—"}</Text>
                <Text style={s.identityRole}>Platform Owner</Text>
                <Text style={s.photoHint}>
                  {busy ? "Uploading photo..." : "Tap the photo to change it"}
                </Text>
              </Card>

              <Card style={s.accountCard}>
                <View style={s.cardHeading}>
                  <Text style={s.cardTitle}>Account details</Text>
                  {!editing && (
                    <Pressable
                      onPress={() => {
                        setProfileForm({
                          name: photoUser?.name || "",
                          phone: photoUser?.phone || "",
                        });
                        setEditing(true);
                      }}
                      accessibilityRole="button"
                    >
                      <Text style={s.editText}>Edit</Text>
                    </Pressable>
                  )}
                </View>
                {loadingAccount ? (
                  <ActivityIndicator
                    color={colors.ink}
                    style={{ margin: 16 }}
                  />
                ) : (
                  <>
                    {editing ? (
                      <>
                        <AccountField
                          label="Full name"
                          value={profileForm.name}
                          onChangeText={(value) =>
                            setProfileForm((current) => ({
                              ...current,
                              name: value,
                            }))
                          }
                          placeholder="Full name"
                        />
                        <AccountField
                          label="Phone"
                          value={profileForm.phone}
                          onChangeText={(value) =>
                            setProfileForm((current) => ({
                              ...current,
                              phone: value,
                            }))
                          }
                          placeholder="Phone number"
                          keyboardType="phone-pad"
                        />
                        <View style={s.formActions}>
                          <Button
                            title="Cancel"
                            variant="ghost"
                            onPress={() => setEditing(false)}
                          />
                          <View style={s.actionGrow}>
                            <Button
                              title={
                                savingProfile ? "Saving..." : "Save changes"
                              }
                              onPress={saveProfile}
                              loading={savingProfile}
                            />
                          </View>
                        </View>
                      </>
                    ) : (
                      <>
                        {accountRow("Name", photoUser?.name)}
                        {accountRow("Email", photoUser?.email)}
                        {accountRow("Phone", photoUser?.phone)}
                        {accountRow("Role", "Platform Owner")}
                        {accountRow(
                          "Joined",
                          displayDate(photoUser?.createdAt),
                        )}
                        {accountRow(
                          "Last login",
                          displayDate(photoUser?.lastLogin),
                        )}
                      </>
                    )}
                  </>
                )}
              </Card>
            </>
          ) : (
            <>
              <Card style={s.accountCard}>
                <Text style={s.cardTitle}>Change password</Text>
                <Text style={s.securityText}>
                  Use your current password to update account access.
                </Text>
                <AccountField
                  label="Current password"
                  value={passwordForm.oldPassword}
                  onChangeText={(value) =>
                    setPasswordForm((current) => ({
                      ...current,
                      oldPassword: value,
                    }))
                  }
                  placeholder="Current password"
                  secureTextEntry
                  autoCapitalize="none"
                />
                <AccountField
                  label="New password"
                  value={passwordForm.newPassword}
                  onChangeText={(value) =>
                    setPasswordForm((current) => ({
                      ...current,
                      newPassword: value,
                    }))
                  }
                  placeholder="At least 8 characters"
                  secureTextEntry
                  autoCapitalize="none"
                />
                <AccountField
                  label="Confirm new password"
                  value={passwordForm.confirmPassword}
                  onChangeText={(value) =>
                    setPasswordForm((current) => ({
                      ...current,
                      confirmPassword: value,
                    }))
                  }
                  placeholder="Repeat new password"
                  secureTextEntry
                  autoCapitalize="none"
                />
                <Button
                  title={savingPassword ? "Updating..." : "Update password"}
                  onPress={changePassword}
                  loading={savingPassword}
                />
              </Card>
              <Card style={s.policyCard}>
                <Text style={s.cardTitle}>Password policy</Text>
                <Text style={s.securityText}>At least 8 characters</Text>
                <Text style={s.securityText}>
                  At least one letter and one number
                </Text>
                <Text style={s.securityText}>
                  Must differ from your current password
                </Text>
              </Card>
            </>
          )}

          <Button title="Sign out" variant="ghost" onPress={signOut} />
        </ScrollView>
      </View>
    );
  }

  return (
    <View
      style={{ flex: 1, backgroundColor: colors.paper, padding: 16, gap: 16 }}
    >
      <View style={{ alignItems: "center", gap: 8 }}>
        <Pressable onPress={chooseSource} disabled={busy}>
          {photo ? (
            <Image source={{ uri: photo }} style={s.av} />
          ) : (
            <View style={[s.av, s.ph]}>
              <Text style={s.ini}>{(user?.name ?? "?")[0]?.toUpperCase()}</Text>
            </View>
          )}
        </Pressable>
        <Text style={{ color: colors.info, fontWeight: "700" }}>
          {busy ? "Uploading…" : "Change photo"}
        </Text>
      </View>
      <Card>
        {row("Name", user?.name)}
        {row("Email", user?.email)}
        {row("Role", user?.role)}
        {row("Designation", user?.designation)}
        {row("School", school?.name)}
      </Card>
      <Button title="Sign out" variant="ghost" onPress={signOut} />
    </View>
  );
}

function AccountField({
  label,
  ...props
}: { label: string } & React.ComponentProps<typeof Input>) {
  return (
    <View style={s.accountField}>
      <Text style={s.accountFieldLabel}>{label}</Text>
      <Input {...props} style={[s.accountInput, props.style]} />
    </View>
  );
}

function accountRow(label: string, value?: string | null) {
  return (
    <View key={label} style={s.row}>
      <Text style={s.k}>{label}</Text>
      <Text style={s.v}>{value || "—"}</Text>
    </View>
  );
}

function displayDate(value?: string | null) {
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
  accountRoot: { flex: 1, backgroundColor: colors.paper },
  accountContent: { padding: 16, paddingBottom: 28, gap: 14 },
  accountHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  eyebrow: { color: colors.amberDark, fontSize: 9, fontWeight: "800" },
  accountTitle: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: "800",
    marginTop: 4,
  },
  accountTabs: {
    flexDirection: "row",
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  accountTab: {
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  accountTabActive: { borderBottomColor: colors.ink },
  accountTabText: { color: colors.muted, fontSize: 11, fontWeight: "600" },
  accountTabTextActive: { color: colors.ink, fontWeight: "800" },
  identityCard: { alignItems: "center", gap: 6, borderRadius: 8 },
  accountAvatar: { width: 82, height: 82, borderRadius: 41 },
  avatarPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.ink,
  },
  avatarInitial: { color: "#fff", fontSize: 30, fontWeight: "800" },
  identityName: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: "800",
    marginTop: 3,
  },
  identityEmail: { color: colors.muted, fontSize: 11 },
  identityRole: {
    color: colors.info,
    backgroundColor: "#EAF2F9",
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 12,
    overflow: "hidden",
    fontSize: 9,
    fontWeight: "800",
  },
  photoHint: { color: colors.muted, fontSize: 9 },
  accountCard: { gap: 12, borderRadius: 8 },
  cardHeading: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardTitle: { color: colors.ink, fontSize: 14, fontWeight: "800" },
  editText: { color: colors.info, fontSize: 11, fontWeight: "700", padding: 4 },
  accountField: { gap: 5 },
  accountFieldLabel: { color: colors.ink, fontSize: 10, fontWeight: "700" },
  accountInput: { minHeight: 42, fontSize: 12, borderRadius: 8 },
  formActions: { flexDirection: "row", gap: 9, alignItems: "center" },
  actionGrow: { flex: 1 },
  securityText: { color: colors.muted, fontSize: 10, lineHeight: 15 },
  policyCard: { gap: 8, borderRadius: 8 },
  av: { width: 96, height: 96, borderRadius: 48 },
  ph: {
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  ini: { color: "#fff", fontSize: 34, fontWeight: "800" },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  k: { color: colors.muted },
  v: { color: colors.ink, fontWeight: "600" },
});
