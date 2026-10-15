import React, { useEffect, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { authApi } from "../lib/api";
import { Button, Input } from "../components/UI";
import { colors } from "../theme";

export default function ForgotPasswordScreen({ onBack }: { onBack: () => void }) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [email, setEmail] = useState("");
  const [masked, setMasked] = useState("");
  const [otp, setOtp] = useState("");
  const [token, setToken] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [timer, setTimer] = useState(0);
  useEffect(() => { if (timer <= 0) return; const t = setTimeout(() => setTimer(timer - 1), 1000); return () => clearTimeout(t); }, [timer]);

  const run = async (fn: () => Promise<void>) => { setError(""); setBusy(true); try { await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } };
  const sendOtp = () => run(async () => {
    if (!email.trim()) throw new Error("Enter your email");
    const { data } = await authApi.forgotPassword(email.trim());
    setMasked(data?.maskedEmail || email.trim()); setStep(2); setTimer(60);
  });
  const verify = () => run(async () => {
    if (otp.length !== 6) throw new Error("Enter the 6-digit code");
    const { data } = await authApi.verifyOtp(email.trim(), otp);
    setToken(data?.resetToken || ""); setStep(3);
  });
  const reset = () => run(async () => {
    if (pw.length < 8) throw new Error("Password must be at least 8 characters");
    if (pw !== pw2) throw new Error("Passwords do not match");
    await authApi.resetPassword(token, pw); setStep(4);
  });
  const resend = () => run(async () => { await authApi.forgotPassword(email.trim()); setOtp(""); setTimer(60); Alert.alert("Sent", "A new code has been sent"); });

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.paper }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={s.c} keyboardShouldPersistTaps="handled">
        <Pressable onPress={onBack}><Text style={s.back}>← Back to sign in</Text></Pressable>
        {step === 1 && <View style={s.g}>
          <Text style={s.h}>Forgot password?</Text><Text style={s.p}>Enter your account email and we'll send a 6-digit code.</Text>
          <Input placeholder="Email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
          <Button title="Send code" onPress={sendOtp} loading={busy} />
        </View>}
        {step === 2 && <View style={s.g}>
          <Text style={s.h}>Enter code</Text><Text style={s.p}>We sent a code to {masked}.</Text>
          <Input placeholder="6-digit code" keyboardType="number-pad" maxLength={6} value={otp} onChangeText={(t) => setOtp(t.replace(/\D/g, ""))} style={{ letterSpacing: 8, textAlign: "center", fontSize: 22 }} />
          <Button title="Verify" onPress={verify} loading={busy} />
          <Pressable disabled={timer > 0} onPress={resend}><Text style={[s.link, timer > 0 && { color: colors.muted }]}>{timer > 0 ? `Resend in ${timer}s` : "Resend code"}</Text></Pressable>
        </View>}
        {step === 3 && <View style={s.g}>
          <Text style={s.h}>New password</Text>
          <Input placeholder="New password" secureTextEntry value={pw} onChangeText={setPw} />
          <Input placeholder="Confirm password" secureTextEntry value={pw2} onChangeText={setPw2} />
          <Button title="Reset password" onPress={reset} loading={busy} />
        </View>}
        {step === 4 && <View style={s.g}>
          <Text style={s.h}>Password updated ✅</Text><Text style={s.p}>You can now sign in with your new password.</Text>
          <Button title="Back to sign in" onPress={onBack} />
        </View>}
        {!!error && <Text style={s.err}>{error}</Text>}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
const s = StyleSheet.create({
  c: { padding: 24, paddingTop: 70, gap: 18 }, g: { gap: 14 }, back: { color: colors.info, fontWeight: "700" },
  h: { fontSize: 24, fontWeight: "800", color: colors.ink }, p: { color: colors.muted }, link: { color: colors.info, fontWeight: "700", textAlign: "center" }, err: { color: colors.alert },
});
