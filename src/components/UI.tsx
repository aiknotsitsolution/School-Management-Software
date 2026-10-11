import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from "react-native";
import { colors, radius } from "../theme";

export const Card = ({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
}) => <View style={[s.card, style]}>{children}</View>;

export function Button({
  title,
  onPress,
  loading,
  disabled,
  variant = "primary",
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: "primary" | "ghost";
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={loading || disabled}
      style={({ pressed }) => [
        s.btn,
        variant === "ghost" && s.ghost,
        (loading || disabled) && { opacity: 0.55 },
        pressed && { opacity: 0.85 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <Text style={[s.btnText, variant === "ghost" && { color: colors.ink }]}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}

export const Input = (props: TextInputProps) => (
  <TextInput
    placeholderTextColor="#98A2B3"
    {...props}
    style={[s.input, props.style]}
  />
);

export function Toast({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  return (
    <View
      style={s.toast}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <Text style={s.toastMessage}>{message}</Text>
      <Pressable
        onPress={onDismiss}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Dismiss message"
      >
        <Text style={s.toastDismiss}>Dismiss</Text>
      </Pressable>
    </View>
  );
}

export const StatCard = ({
  label,
  value,
  color = colors.ink,
}: {
  label: string;
  value: string | number;
  color?: string;
}) => (
  <Card style={{ flex: 1, minWidth: "45%" }}>
    <Text style={s.statLabel}>{label}</Text>
    <Text style={[s.statValue, { color }]}>{value}</Text>
  </Card>
);

export const Empty = ({ text }: { text: string }) => (
  <Text style={{ textAlign: "center", color: colors.muted, marginTop: 40 }}>
    {text}
  </Text>
);

const s = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  btn: {
    backgroundColor: colors.ink,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: "center",
  },
  ghost: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: colors.ink,
  },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
  },
  toast: {
    position: "absolute",
    top: 48,
    left: 16,
    right: 16,
    zIndex: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    backgroundColor: "#FFF1EF",
    borderColor: colors.alert,
    borderWidth: 1,
    borderRadius: 8,
  },
  toastMessage: {
    flex: 1,
    color: colors.alert,
    fontSize: 13,
    fontWeight: "600",
  },
  toastDismiss: { color: colors.alert, fontSize: 12, fontWeight: "700" },
  statLabel: { color: colors.muted, fontSize: 12, fontWeight: "600" },
  statValue: { fontSize: 26, fontWeight: "800", marginTop: 4 },
});
