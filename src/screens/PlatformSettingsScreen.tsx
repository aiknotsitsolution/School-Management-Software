import React, { useEffect, useMemo, useState } from "react";
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
import type { PlatformSetting } from "../types";

const sections = [
  {
    id: "general",
    title: "General",
    blurb: "Public-facing identity of the platform.",
  },
  { id: "security", title: "Security", blurb: "Login and account hardening." },
  { id: "billing", title: "Billing", blurb: "Currency and invoice behaviour." },
  {
    id: "notifications",
    title: "Notifications",
    blurb: "Automated reminders and alerts.",
  },
];

export default function PlatformSettingsScreen() {
  const [settings, setSettings] = useState<PlatformSetting[]>([]);
  const [baseline, setBaseline] = useState<
    Record<string, PlatformSetting["value"]>
  >({});
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let current = true;
    setLoading(true);
    api.platform.settings
      .get()
      .then((response) => {
        if (!current) return;
        const next = response.data || [];
        setSettings(next);
        setBaseline(toBaseline(next));
        setDirty(new Set());
        setError("");
      })
      .catch((loadError: unknown) => {
        if (current)
          setError(
            (loadError as Error).message || "Unable to load platform settings.",
          );
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [reload]);

  const grouped = useMemo(
    () =>
      sections
        .map((section) => ({
          ...section,
          settings: settings.filter(
            (setting) => setting.section === section.id,
          ),
        }))
        .filter((section) => section.settings.length > 0),
    [settings],
  );

  const change = (key: string, value: PlatformSetting["value"]) => {
    setSettings((current) =>
      current.map((setting) =>
        setting.key === key ? { ...setting, value } : setting,
      ),
    );
    setDirty((current) => {
      const next = new Set(current);
      if (sameValue(value, baseline[key])) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const reset = (setting: PlatformSetting) =>
    change(setting.key, setting.default);

  const save = async () => {
    if (!dirty.size) return;
    const payload: Record<string, unknown> = {};
    for (const key of dirty) {
      const setting = settings.find((item) => item.key === key);
      if (!setting) continue;
      if (setting.type === "number") {
        const number = Number(setting.value);
        if (!Number.isFinite(number)) {
          setError(`${setting.label} must be a valid number.`);
          return;
        }
        if (setting.min !== undefined && number < setting.min) {
          setError(`${setting.label} must be at least ${setting.min}.`);
          return;
        }
        if (setting.max !== undefined && number > setting.max) {
          setError(`${setting.label} must be no more than ${setting.max}.`);
          return;
        }
        payload[key] = number;
      } else if (setting.type === "boolean") {
        payload[key] = Boolean(setting.value);
      } else {
        payload[key] = String(setting.value);
      }
    }

    setSaving(true);
    setError("");
    try {
      const response = await api.platform.settings.update(payload);
      const next = response.data || [];
      setSettings(next);
      setBaseline(toBaseline(next));
      setDirty(new Set());
    } catch (saveError) {
      setError(
        (saveError as Error).message || "Unable to save platform settings.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={s.root}>
      {!!error && <Toast message={error} onDismiss={() => setError("")} />}
      <ScrollView
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={s.header}>
          <View style={s.headerCopy}>
            <Text style={s.eyebrow}>PLATFORM OWNER · SYSTEM</Text>
            <Text style={s.title}>Platform Settings</Text>
            <Text style={s.subtitle}>
              Runtime configuration for platform services.
            </Text>
          </View>
          <Pressable
            onPress={save}
            disabled={saving || dirty.size === 0}
            accessibilityRole="button"
            style={[s.saveButton, (!dirty.size || saving) && s.disabled]}
          >
            {saving ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Ionicons name="save-outline" size={17} color="#fff" />
            )}
            <Text style={s.saveText}>
              {saving ? "Saving" : dirty.size ? `Save ${dirty.size}` : "Saved"}
            </Text>
          </Pressable>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color={colors.ink} style={s.loader} />
        ) : settings.length ? (
          grouped.map((section) => (
            <View key={section.id} style={s.section}>
              <View style={s.sectionHeader}>
                <Text style={s.sectionTitle}>{section.title}</Text>
                <Text style={s.sectionBlurb}>{section.blurb}</Text>
              </View>
              <Card style={s.sectionCard}>
                {section.settings.map((setting) => (
                  <SettingRow
                    key={setting.key}
                    setting={setting}
                    onChange={(value) => change(setting.key, value)}
                    onReset={() => reset(setting)}
                  />
                ))}
              </Card>
            </View>
          ))
        ) : (
          <View style={s.emptyState}>
            <Text style={s.emptyText}>
              {error || "No platform settings are available."}
            </Text>
            <Button
              title="Retry"
              onPress={() => setReload((value) => value + 1)}
            />
          </View>
        )}

        {!!settings.length && (
          <Card style={s.notice}>
            <Ionicons
              name="lock-closed-outline"
              size={17}
              color={colors.muted}
            />
            <View style={s.noticeCopy}>
              <Text style={s.noticeTitle}>Secrets are not editable here</Text>
              <Text style={s.noticeText}>
                Database credentials, JWT signing keys, and provider secrets
                remain environment configuration and are never returned by this
                settings API.
              </Text>
            </View>
          </Card>
        )}
      </ScrollView>
    </View>
  );
}

function SettingRow({
  setting,
  onChange,
  onReset,
}: {
  setting: PlatformSetting;
  onChange: (value: PlatformSetting["value"]) => void;
  onReset: () => void;
}) {
  const changed = !sameValue(setting.value, setting.default);
  return (
    <View style={s.settingRow}>
      <View style={s.settingHeader}>
        <View style={s.settingCopy}>
          <View style={s.labelLine}>
            <Text style={s.settingLabel}>{setting.label}</Text>
            {changed && <Text style={s.changedBadge}>CHANGED</Text>}
          </View>
          {!!setting.help && <Text style={s.help}>{setting.help}</Text>}
        </View>
        <Pressable
          onPress={onReset}
          accessibilityRole="button"
          accessibilityLabel={`Reset ${setting.label} to default`}
          hitSlop={8}
          style={s.resetButton}
        >
          <Ionicons name="refresh-outline" size={17} color={colors.muted} />
        </Pressable>
      </View>
      {setting.type === "boolean" ? (
        <View style={s.toggleRow}>
          <Text style={s.valueLabel}>
            {setting.value ? "Enabled" : "Disabled"}
          </Text>
          <Pressable
            onPress={() => onChange(!setting.value)}
            accessibilityRole="switch"
            accessibilityState={{ checked: Boolean(setting.value) }}
            accessibilityLabel={setting.label}
            style={[s.toggle, Boolean(setting.value) ? s.toggleOn : null]}
          >
            <View
              style={[
                s.toggleThumb,
                Boolean(setting.value) ? s.toggleThumbOn : null,
              ]}
            />
          </Pressable>
        </View>
      ) : setting.options?.length ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.options}
        >
          {setting.options.map((option) => (
            <Pressable
              key={option}
              onPress={() => onChange(option)}
              accessibilityRole="radio"
              accessibilityState={{ selected: setting.value === option }}
              style={[s.option, setting.value === option && s.optionSelected]}
            >
              <Text
                style={[
                  s.optionText,
                  setting.value === option && s.optionTextSelected,
                ]}
              >
                {option}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : (
        <Input
          value={String(setting.value ?? "")}
          onChangeText={(value) =>
            onChange(
              setting.type === "number"
                ? value === ""
                  ? ""
                  : Number(value)
                : value,
            )
          }
          keyboardType={setting.type === "number" ? "numeric" : "default"}
          accessibilityLabel={setting.label}
          style={s.settingInput}
        />
      )}
    </View>
  );
}

function sameValue(a: unknown, b: unknown) {
  return Object.is(a, b) || String(a) === String(b);
}

function toBaseline(settings: PlatformSetting[]) {
  const values: Record<string, PlatformSetting["value"]> = {};
  settings.forEach((setting) => {
    values[setting.key] = setting.value;
  });
  return values;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 16, paddingBottom: 30, gap: 16 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  headerCopy: { flex: 1 },
  eyebrow: { color: colors.amberDark, fontSize: 9, fontWeight: "800" },
  title: { color: colors.ink, fontSize: 23, fontWeight: "800", marginTop: 4 },
  subtitle: { color: colors.muted, fontSize: 11, marginTop: 3 },
  saveButton: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: colors.ink,
  },
  saveText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  disabled: { opacity: 0.45 },
  loader: { marginTop: 30 },
  section: { gap: 8 },
  sectionHeader: { gap: 3 },
  sectionTitle: { color: colors.ink, fontSize: 14, fontWeight: "800" },
  sectionBlurb: { color: colors.muted, fontSize: 10 },
  sectionCard: { paddingHorizontal: 13, paddingVertical: 2, borderRadius: 8 },
  settingRow: {
    paddingVertical: 12,
    gap: 9,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  settingHeader: { flexDirection: "row", alignItems: "flex-start", gap: 9 },
  settingCopy: { flex: 1, gap: 3 },
  labelLine: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
  },
  settingLabel: { color: colors.ink, fontSize: 11, fontWeight: "700" },
  changedBadge: {
    color: colors.amberDark,
    backgroundColor: "#FFF3DB",
    borderRadius: 8,
    overflow: "hidden",
    paddingHorizontal: 5,
    paddingVertical: 2,
    fontSize: 7,
    fontWeight: "800",
  },
  help: { color: colors.muted, fontSize: 9, lineHeight: 14 },
  resetButton: { padding: 3 },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  valueLabel: { color: colors.muted, fontSize: 10 },
  toggle: {
    width: 42,
    height: 25,
    justifyContent: "center",
    paddingHorizontal: 3,
    borderRadius: 14,
    backgroundColor: "#C8CDD4",
  },
  toggleOn: { backgroundColor: colors.success },
  toggleThumb: {
    width: 19,
    height: 19,
    borderRadius: 10,
    backgroundColor: "#fff",
  },
  toggleThumbOn: { alignSelf: "flex-end" },
  options: { flexDirection: "row", gap: 6 },
  option: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 15,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.card,
  },
  optionSelected: { borderColor: colors.ink, backgroundColor: colors.ink },
  optionText: { color: colors.muted, fontSize: 9, fontWeight: "600" },
  optionTextSelected: { color: "#fff" },
  settingInput: {
    minHeight: 39,
    borderRadius: 8,
    paddingVertical: 7,
    fontSize: 11,
  },
  notice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    padding: 12,
    borderRadius: 8,
    backgroundColor: "#F2F3F5",
  },
  noticeCopy: { flex: 1, gap: 4 },
  noticeTitle: { color: colors.ink, fontSize: 10, fontWeight: "700" },
  noticeText: { color: colors.muted, fontSize: 9, lineHeight: 14 },
  emptyState: { alignItems: "center", gap: 12, padding: 20 },
  emptyText: { color: colors.muted, fontSize: 11 },
});
