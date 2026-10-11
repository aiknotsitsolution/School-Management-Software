import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Button, Card, Input, Toast } from "../components/UI";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { colors } from "../theme";
import type { BroadcastLog } from "../types";

type Channel = "sms" | "email";
type RecipientType = "audience" | "studentIds" | "classTags" | "explicit";

interface BroadcastForm {
  channel: Channel;
  subject: string;
  body: string;
  recipientType: RecipientType;
  audience: string[];
  studentIds: string;
  classTags: string;
  explicit: string;
}

const recipientOptions: { key: RecipientType; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "audience", label: "School roles", icon: "people-outline" },
  { key: "studentIds", label: "Admission IDs", icon: "id-card-outline" },
  { key: "classTags", label: "Classes", icon: "school-outline" },
  { key: "explicit", label: "Manual list", icon: "create-outline" },
];

const audienceOptions = [
  { key: "all", label: "Everyone" },
  { key: "school_admin", label: "Admins" },
  { key: "teacher", label: "Teachers" },
  { key: "staff", label: "Staff" },
  { key: "student", label: "Students" },
  { key: "parent", label: "Parents" },
];

const emptyForm = (channel: Channel): BroadcastForm => ({
  channel,
  subject: "",
  body: "",
  recipientType: "audience",
  audience: ["all"],
  studentIds: "",
  classTags: "",
  explicit: "",
});

function toList(value: string) {
  return value
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatTime(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function emailHtml(text: string) {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
  return escaped.replace(/\r?\n/g, "<br />");
}

function ChannelButton({
  active,
  label,
  icon,
  onPress,
}: {
  active: boolean;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[s.channelButton, active && s.channelButtonActive]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Ionicons name={icon} size={17} color={active ? "#fff" : colors.muted} />
      <Text style={[s.channelLabel, active && s.channelLabelActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function BroadcastScreen() {
  const { user } = useAuth();
  const [form, setForm] = useState<BroadcastForm>(() => emptyForm("sms"));
  const [logs, setLogs] = useState<BroadcastLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const allowed = user?.role === "school_admin" || user?.role === "super_admin";

  const loadLogs = useCallback(async (refresh = false) => {
    setError("");
    if (refresh) setRefreshing(true);
    else setLoadingLogs(true);
    try {
      const response = await api.broadcast.logs("limit=25");
      setLogs(Array.isArray(response.data) ? response.data : []);
    } catch (loadError) {
      setError((loadError as Error).message || "Unable to load broadcast history.");
    } finally {
      setLoadingLogs(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  const updateForm = (patch: Partial<BroadcastForm>) =>
    setForm((current) => ({ ...current, ...patch }));

  const selectChannel = (channel: Channel) => {
    setForm((current) => ({ ...current, ...emptyForm(channel) }));
  };

  const toggleAudience = (role: string) =>
    setForm((current) => {
      if (role === "all") {
        return { ...current, audience: current.audience.includes("all") ? [] : ["all"] };
      }
      const selected = current.audience.filter((item) => item !== "all");
      return {
        ...current,
        audience: selected.includes(role)
          ? selected.filter((item) => item !== role)
          : [...selected, role],
      };
    });

  const sendBroadcast = async () => {
    const body = form.body.trim();
    if (!body) {
      setError("Write a message before sending.");
      return;
    }
    if (form.channel === "email" && !form.subject.trim()) {
      setError("Add a subject before sending an email.");
      return;
    }
    if (form.recipientType === "audience" && form.audience.length === 0) {
      setError("Select at least one audience role.");
      return;
    }
    const recipientField =
      form.recipientType === "studentIds"
        ? form.studentIds
        : form.recipientType === "classTags"
          ? form.classTags
          : form.recipientType === "explicit"
            ? form.explicit
            : "";
    if (form.recipientType !== "audience" && toList(recipientField).length === 0) {
      setError("Enter at least one recipient.");
      return;
    }

    const targets: {
      audience?: string[];
      studentIds?: string[];
      classTags?: string[];
      numbers?: string[];
      emails?: string[];
    } = {};
    if (form.recipientType === "audience") targets.audience = form.audience;
    else if (form.recipientType === "studentIds") {
      targets.studentIds = toList(form.studentIds);
    } else if (form.recipientType === "classTags") {
      targets.classTags = toList(form.classTags);
      if (form.channel === "email") targets.audience = ["student", "parent"];
    } else if (form.channel === "sms") {
      targets.numbers = toList(form.explicit);
    } else {
      targets.emails = toList(form.explicit);
    }

    Alert.alert(
      `Send ${form.channel.toUpperCase()} broadcast?`,
      "This will send a message to the recipients you selected. Each broadcast is limited to 500 recipients.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Send",
          onPress: () => {
            void (async () => {
              setSending(true);
              setError("");
              try {
                const response =
                  form.channel === "sms"
                    ? await api.broadcast.sms({ ...targets, message: body })
                    : await api.broadcast.email({
                        ...targets,
                        subject: form.subject.trim(),
                        html: emailHtml(body),
                      });
                setForm(emptyForm(form.channel));
                Alert.alert(
                  response.data.dryRun
                    ? "Broadcast recorded (dry run)"
                    : "Broadcast processed",
                  `${response.data.sent} sent, ${response.data.failed} failed${response.data.skipped ? `, ${response.data.skipped} skipped` : ""} of ${response.data.recipients} recipients.`,
                );
                await loadLogs(true);
              } catch (sendError) {
                setError((sendError as Error).message || "Unable to send broadcast.");
              } finally {
                setSending(false);
              }
            })();
          },
        },
      ],
    );
  };

  if (!allowed) {
    return (
      <View style={s.root}>
        <View style={s.deniedWrap}>
          <View style={s.deniedIcon}>
            <Ionicons name="lock-closed-outline" size={26} color={colors.alert} />
          </View>
          <Text style={s.deniedTitle}>Admin access required</Text>
          <Text style={s.deniedText}>
            Only school administrators can send or view bulk broadcasts.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={s.root}>
      {!!error && <Toast message={error} onDismiss={() => setError("")} />}
      <ScrollView
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void loadLogs(true)}
          />
        }
      >
        <View style={s.heading}>
          <View style={s.headingIcon}>
            <Ionicons name="megaphone" size={23} color={colors.amberDark} />
          </View>
          <View style={s.headingCopy}>
            <Text style={s.eyebrow}>SCHOOL OUTREACH</Text>
            <Text style={s.title}>Broadcast</Text>
            <Text style={s.subtitle}>
              Send an SMS or email update to your school community.
            </Text>
          </View>
        </View>

        <View style={s.channelRow}>
          <ChannelButton
            active={form.channel === "sms"}
            label="SMS"
            icon="chatbox-ellipses-outline"
            onPress={() => selectChannel("sms")}
          />
          <ChannelButton
            active={form.channel === "email"}
            label="Email"
            icon="mail-outline"
            onPress={() => selectChannel("email")}
          />
        </View>

        <Card style={s.composeCard}>
          <View style={s.cardHeading}>
            <View>
              <Text style={s.cardTitle}>
                Compose {form.channel === "sms" ? "SMS" : "Email"}
              </Text>
              <Text style={s.cardCaption}>
                Select recipients and write your message.
              </Text>
            </View>
            <View
              style={[
                s.channelIcon,
                form.channel === "email" && s.emailIcon,
              ]}
            >
              <Ionicons
                name={
                  form.channel === "sms"
                    ? "chatbox-ellipses-outline"
                    : "mail-outline"
                }
                size={17}
                color={form.channel === "sms" ? colors.info : colors.success}
              />
            </View>
          </View>

          {form.channel === "email" && (
            <View style={s.field}>
              <Text style={s.label}>Subject *</Text>
              <Input
                value={form.subject}
                onChangeText={(subject) => updateForm({ subject })}
                placeholder="Email subject"
                maxLength={200}
                accessibilityLabel="Email subject"
              />
            </View>
          )}

          <View style={s.field}>
            <Text style={s.label}>Recipients</Text>
            <View style={s.optionGrid}>
              {recipientOptions.map((option) => {
                const active = form.recipientType === option.key;
                return (
                  <Pressable
                    key={option.key}
                    onPress={() => updateForm({ recipientType: option.key })}
                    style={[s.recipientOption, active && s.recipientOptionActive]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <Ionicons
                      name={option.icon}
                      size={15}
                      color={active ? colors.info : colors.muted}
                    />
                    <Text
                      style={[
                        s.recipientOptionText,
                        active && s.recipientOptionTextActive,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {form.recipientType === "audience" && (
            <View style={s.field}>
              <Text style={s.label}>School roles</Text>
              <View style={s.chipWrap}>
                {audienceOptions.map((option) => {
                  const selected = form.audience.includes(option.key);
                  return (
                    <Pressable
                      key={option.key}
                      onPress={() => toggleAudience(option.key)}
                      style={[s.audienceChip, selected && s.audienceChipActive]}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: selected }}
                    >
                      <Text
                        style={[
                          s.audienceText,
                          selected && s.audienceTextActive,
                        ]}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          {form.recipientType === "studentIds" && (
            <View style={s.field}>
              <Text style={s.label}>Admission IDs</Text>
              <Input
                value={form.studentIds}
                onChangeText={(studentIds) => updateForm({ studentIds })}
                placeholder="SM-2024-0001, SM-2024-0002"
                autoCapitalize="characters"
                accessibilityLabel="Admission IDs"
              />
              <Text style={s.helper}>Separate multiple IDs with commas or new lines.</Text>
            </View>
          )}

          {form.recipientType === "classTags" && (
            <View style={s.field}>
              <Text style={s.label}>Class / section</Text>
              <Input
                value={form.classTags}
                onChangeText={(classTags) => updateForm({ classTags })}
                placeholder="5-A, 6-B"
                accessibilityLabel="Class or section recipients"
              />
              <Text style={s.helper}>Enter class tags separated by commas or new lines.</Text>
            </View>
          )}

          {form.recipientType === "explicit" && (
            <View style={s.field}>
              <Text style={s.label}>
                {form.channel === "sms" ? "Phone numbers" : "Email addresses"}
              </Text>
              <Input
                value={form.explicit}
                onChangeText={(explicit) => updateForm({ explicit })}
                placeholder={
                  form.channel === "sms"
                    ? "+91 98765 43210, +91 98765 43211"
                    : "parent@example.com, staff@example.com"
                }
                multiline
                autoCapitalize="none"
                style={s.multilineInput}
                textAlignVertical="top"
                accessibilityLabel={
                  form.channel === "sms" ? "Phone number recipients" : "Email recipients"
                }
              />
              <Text style={s.helper}>Separate multiple recipients with commas or new lines.</Text>
            </View>
          )}

          <View style={s.field}>
            <View style={s.labelRow}>
              <Text style={s.label}>Message *</Text>
              {form.channel === "sms" && (
                <Text
                  style={[
                    s.counter,
                    form.body.length > 480 && s.counterLimit,
                  ]}
                >
                  {form.body.length}/480
                </Text>
              )}
            </View>
            <Input
              value={form.body}
              onChangeText={(body) => updateForm({ body })}
              placeholder={
                form.channel === "sms"
                  ? "Write an SMS update (up to 480 characters)..."
                  : "Write the email message..."
              }
              multiline
              maxLength={form.channel === "sms" ? 480 : 10000}
              style={s.bodyInput}
              textAlignVertical="top"
              accessibilityLabel="Broadcast message"
            />
            {form.channel === "sms" && (
              <Text style={s.helper}>SMS messages are limited to 480 characters.</Text>
            )}
          </View>

          <View style={s.notice}>
            <Ionicons name="shield-checkmark-outline" size={15} color={colors.amberDark} />
            <Text style={s.noticeText}>
              Administrator action. A maximum of 500 recipients is allowed per broadcast.
            </Text>
          </View>
          <Pressable
            onPress={sendBroadcast}
            disabled={sending || !form.body.trim()}
            style={[
              s.sendButton,
              (sending || !form.body.trim()) && s.sendButtonDisabled,
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Send ${form.channel} broadcast`}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="send" size={16} color="#fff" />
            )}
            <Text style={s.sendButtonText}>
              {sending ? "Sending..." : `Send ${form.channel.toUpperCase()}`}
            </Text>
          </Pressable>
        </Card>

        <View style={s.historyHeading}>
          <View>
            <Text style={s.historyTitle}>Recent broadcasts</Text>
            <Text style={s.historyCaption}>Latest 25 delivery records</Text>
          </View>
          <Pressable
            onPress={() => void loadLogs(true)}
            disabled={refreshing}
            style={s.refreshButton}
            accessibilityRole="button"
            accessibilityLabel="Refresh broadcast history"
          >
            <Ionicons name="refresh" size={17} color={colors.info} />
          </Pressable>
        </View>
        {loadingLogs ? (
          <ActivityIndicator size="large" color={colors.info} style={s.loader} />
        ) : logs.length ? (
          <View style={s.logList}>
            {logs.map((log) => (
              <Card key={log._id} style={s.logCard}>
                <View style={s.logTop}>
                  <View
                    style={[
                      s.logIcon,
                      log.channel === "email" && s.emailIcon,
                    ]}
                  >
                    <Ionicons
                      name={
                        log.channel === "sms"
                          ? "chatbox-ellipses-outline"
                          : "mail-outline"
                      }
                      size={16}
                      color={log.channel === "sms" ? colors.info : colors.success}
                    />
                  </View>
                  <View style={s.logTitleCopy}>
                    <Text style={s.logChannel}>
                      {log.channel?.toUpperCase() || "BROADCAST"}
                    </Text>
                    <Text numberOfLines={2} style={s.logSubject}>
                      {log.subject || log.body || "No message content"}
                    </Text>
                  </View>
                  <Text style={s.logTime}>{formatTime(log.createdAt)}</Text>
                </View>
                <View style={s.logDivider} />
                <View style={s.logStats}>
                  <Text style={s.logStat}>
                    {log.recipients?.length || 0} recipients
                  </Text>
                  <Text style={[s.logStat, s.sentStat]}>Sent {log.sent || 0}</Text>
                  <Text style={[s.logStat, s.failedStat]}>
                    Failed {log.failed || 0}
                  </Text>
                  {!!log.skipped && (
                    <Text style={s.logStat}>Skipped {log.skipped}</Text>
                  )}
                  {log.dryRun && <Text style={[s.logStat, s.dryRun]}>Dry run</Text>}
                  <View
                    style={[
                      s.statusBadge,
                      log.status === "sent"
                        ? s.statusSent
                        : log.status === "partial" || log.status === "dry_run"
                          ? s.statusPartial
                          : s.statusFailed,
                    ]}
                  >
                    <Text style={s.statusText}>
                      {(log.status || "failed").replace("_", " ")}
                    </Text>
                  </View>
                </View>
              </Card>
            ))}
          </View>
        ) : (
          <Card style={s.emptyCard}>
            <Ionicons name="archive-outline" size={26} color={colors.muted} />
            <Text style={s.emptyTitle}>No broadcasts yet</Text>
            <Text style={s.emptyText}>
              Successful send attempts will appear here with delivery details.
            </Text>
            <Button
              title="Refresh history"
              onPress={() => void loadLogs(true)}
              variant="ghost"
            />
          </Card>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 16, paddingBottom: 30, gap: 14 },
  heading: { flexDirection: "row", alignItems: "center", gap: 12 },
  headingIcon: {
    width: 47,
    height: 47,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    backgroundColor: "#FFF2D9",
  },
  headingCopy: { flex: 1, gap: 3 },
  eyebrow: { color: colors.amberDark, fontSize: 9, fontWeight: "800", letterSpacing: 0.8 },
  title: { color: colors.ink, fontSize: 22, fontWeight: "800" },
  subtitle: { color: colors.muted, fontSize: 10, lineHeight: 15 },
  channelRow: { flexDirection: "row", gap: 8 },
  channelButton: {
    minWidth: 91,
    minHeight: 39,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    backgroundColor: "#fff",
  },
  channelButtonActive: { borderColor: colors.ink, backgroundColor: colors.ink },
  channelLabel: { color: colors.muted, fontSize: 11, fontWeight: "700" },
  channelLabelActive: { color: "#fff" },
  composeCard: { gap: 14, padding: 14, borderRadius: 16 },
  cardHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 9,
  },
  cardTitle: { color: colors.ink, fontSize: 15, fontWeight: "800" },
  cardCaption: { color: colors.muted, fontSize: 9, marginTop: 3 },
  channelIcon: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
    backgroundColor: "#EAF1FF",
  },
  emailIcon: { backgroundColor: "#EAF7EF" },
  field: { gap: 7 },
  label: { color: colors.ink, fontSize: 10, fontWeight: "700" },
  labelRow: { flexDirection: "row", justifyContent: "space-between" },
  optionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  recipientOption: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: "#fff",
  },
  recipientOptionActive: { borderColor: colors.info, backgroundColor: "#EEF5FF" },
  recipientOptionText: { color: colors.muted, fontSize: 9, fontWeight: "600" },
  recipientOptionTextActive: { color: colors.info },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  audienceChip: {
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    backgroundColor: "#fff",
  },
  audienceChipActive: { borderColor: colors.info, backgroundColor: colors.info },
  audienceText: { color: colors.muted, fontSize: 9, fontWeight: "700" },
  audienceTextActive: { color: "#fff" },
  helper: { color: colors.muted, fontSize: 9, lineHeight: 13 },
  multilineInput: { minHeight: 68, maxHeight: 130, fontSize: 11 },
  bodyInput: { minHeight: 120, maxHeight: 220, fontSize: 11, lineHeight: 17 },
  counter: { color: colors.muted, fontSize: 9, fontWeight: "700" },
  counterLimit: { color: colors.alert },
  notice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 7,
    padding: 10,
    borderRadius: 11,
    backgroundColor: "#FFF8E9",
  },
  noticeText: { flex: 1, color: colors.muted, fontSize: 9, lineHeight: 14 },
  sendButton: {
    minHeight: 43,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    backgroundColor: colors.ink,
  },
  sendButtonDisabled: { opacity: 0.5 },
  sendButtonText: { color: "#fff", fontSize: 11, fontWeight: "800" },
  historyHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 3,
  },
  historyTitle: { color: colors.ink, fontSize: 15, fontWeight: "800" },
  historyCaption: { color: colors.muted, fontSize: 9, marginTop: 3 },
  refreshButton: {
    width: 33,
    height: 33,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
    backgroundColor: "#EAF1FF",
  },
  loader: { marginTop: 18 },
  logList: { gap: 9 },
  logCard: { padding: 12, borderRadius: 14 },
  logTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  logIcon: {
    width: 33,
    height: 33,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
    backgroundColor: "#EAF1FF",
  },
  logTitleCopy: { flex: 1, minWidth: 0, gap: 3 },
  logChannel: { color: colors.ink, fontSize: 9, fontWeight: "800", letterSpacing: 0.4 },
  logSubject: { color: colors.muted, fontSize: 10, lineHeight: 14 },
  logTime: { color: colors.muted, fontSize: 8 },
  logDivider: { height: 1, marginVertical: 9, backgroundColor: colors.border },
  logStats: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 7 },
  logStat: { color: colors.muted, fontSize: 8, fontWeight: "600" },
  sentStat: { color: colors.success },
  failedStat: { color: colors.alert },
  dryRun: { color: colors.info, fontWeight: "800" },
  statusBadge: { marginLeft: "auto", paddingHorizontal: 7, paddingVertical: 4, borderRadius: 10 },
  statusSent: { backgroundColor: "#EAF7EF" },
  statusPartial: { backgroundColor: "#EAF1FF" },
  statusFailed: { backgroundColor: "#FFF0EE" },
  statusText: { color: colors.ink, fontSize: 8, fontWeight: "800", textTransform: "capitalize" },
  emptyCard: { alignItems: "center", gap: 9, padding: 20, borderRadius: 15 },
  emptyTitle: { color: colors.ink, fontSize: 13, fontWeight: "800" },
  emptyText: { color: colors.muted, fontSize: 9, lineHeight: 14, textAlign: "center" },
  deniedWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28, gap: 9 },
  deniedIcon: { width: 55, height: 55, alignItems: "center", justifyContent: "center", borderRadius: 18, backgroundColor: "#FFF0EE" },
  deniedTitle: { color: colors.ink, fontSize: 15, fontWeight: "800" },
  deniedText: { color: colors.muted, fontSize: 10, textAlign: "center", lineHeight: 15 },
});
