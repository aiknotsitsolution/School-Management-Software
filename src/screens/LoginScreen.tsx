import React, { useEffect, useState } from "react";
import {
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../context/AuthContext";
import { Button, Input, Toast } from "../components/UI";
import { colors } from "../theme";

export default function LoginScreen({ onForgot }: { onForgot?: () => void }) {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(""), 5000);
    return () => clearTimeout(timer);
  }, [error]);

  const submit = async () => {
    const cleanEmail = email.trim().toLowerCase();
    setError("");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError("Enter a valid email address.");
      return;
    }
    if (!password) {
      setError("Enter your password.");
      return;
    }

    setLoading(true);
    try {
      await signIn(cleanEmail, password);
    } catch (submitError) {
      setError(
        (submitError as Error).message ||
          "Unable to sign in. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={s.root}
    >
      {!!error && <Toast message={error} onDismiss={() => setError("")} />}
      <ScrollView
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
      >
        <ImageBackground
          source={{
            uri: "https://images.unsplash.com/photo-1580582932707-520aed937b7b?w=1200&h=700&fit=crop",
          }}
          imageStyle={s.heroImage}
          style={s.hero}
        >
          <View style={s.heroShade} />
          <View style={s.brandRow}>
            <View style={s.brandMark}>
              <Ionicons name="school" size={22} color={colors.ink} />
            </View>
            <View>
              <Text style={s.brand}>Zipschool OS</Text>
              <Text style={s.tag}>School operations, connected</Text>
            </View>
          </View>
          <View style={s.heroCopy}>
            <Text style={s.eyebrow}>SCHOOL ADMINISTRATION</Text>
            <Text style={s.heroTitle}>One place for the whole school day.</Text>
          </View>
        </ImageBackground>

        <View style={s.form}>
          <Text style={s.welcome}>Welcome back</Text>
          <Text style={s.title}>Sign in to Zipschool OS</Text>
          <Text style={s.subtitle}>
            Use your registered school email address.
          </Text>

          <View style={s.field}>
            <Text style={s.label}>Email address</Text>
            <View style={s.inputWrap}>
              <Ionicons name="mail-outline" size={18} color={colors.muted} />
              <Input
                placeholder="you@example.com"
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                returnKeyType="next"
                value={email}
                onChangeText={setEmail}
                style={s.input}
                accessibilityLabel="Email address"
              />
            </View>
          </View>

          <View style={s.field}>
            <Text style={s.label}>Password</Text>
            <View style={s.inputWrap}>
              <Ionicons
                name="lock-closed-outline"
                size={18}
                color={colors.muted}
              />
              <Input
                placeholder="Enter your password"
                autoComplete="current-password"
                secureTextEntry={!showPassword}
                returnKeyType="done"
                value={password}
                onChangeText={setPassword}
                onSubmitEditing={submit}
                style={s.input}
                accessibilityLabel="Password"
              />
              <Pressable
                onPress={() => setShowPassword((visible) => !visible)}
                accessibilityRole="button"
                accessibilityLabel={
                  showPassword ? "Hide password" : "Show password"
                }
                hitSlop={8}
              >
                <Ionicons
                  name={showPassword ? "eye-off-outline" : "eye-outline"}
                  size={19}
                  color={colors.muted}
                />
              </Pressable>
            </View>
          </View>

          {!!error && (
            <Text
              style={s.error}
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
            >
              {error}
            </Text>
          )}
          <Button title="Sign in" onPress={submit} loading={loading} />
          {onForgot && (
            <Pressable onPress={onForgot} hitSlop={8}>
              <Text style={s.forgot}>Forgot password?</Text>
            </Pressable>
          )}

          <Text style={s.footer}>
            Accounts are created by your school or platform administrator.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  content: { flexGrow: 1, paddingBottom: 24 },
  hero: {
    minHeight: 260,
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 26,
    justifyContent: "space-between",
    overflow: "hidden",
  },
  heroImage: { opacity: 0.3 },
  heroShade: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(22, 33, 62, 0.9)",
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  brandMark: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: colors.amber,
    alignItems: "center",
    justifyContent: "center",
  },
  brand: { color: "#fff", fontSize: 18, fontWeight: "800" },
  tag: { color: "rgba(255,255,255,0.7)", marginTop: 3, fontSize: 12 },
  heroCopy: { maxWidth: 320, gap: 7 },
  eyebrow: { color: colors.amber, fontSize: 10, fontWeight: "800" },
  heroTitle: { color: "#fff", fontSize: 25, lineHeight: 31, fontWeight: "800" },
  form: { paddingHorizontal: 24, paddingTop: 26, gap: 15 },
  welcome: {
    color: colors.amberDark,
    fontSize: 12,
    fontWeight: "700",
    marginBottom: -12,
  },
  title: { fontSize: 23, fontWeight: "800", color: colors.ink },
  subtitle: { color: colors.muted, fontSize: 13, marginTop: -10 },
  field: { gap: 7 },
  label: { color: colors.ink, fontSize: 12, fontWeight: "700" },
  inputWrap: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingLeft: 13,
    paddingRight: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.card,
  },
  input: {
    flex: 1,
    borderWidth: 0,
    borderRadius: 0,
    paddingHorizontal: 0,
    paddingVertical: 11,
    backgroundColor: "transparent",
  },
  forgot: {
    color: colors.info,
    fontWeight: "700",
    textAlign: "center",
    paddingVertical: 2,
  },
  error: { color: colors.alert, fontSize: 13 },
  footer: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 17,
    textAlign: "center",
    marginTop: 3,
  },
});
