import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../lib/api";
import { Button, Card, Input, Toast } from "../components/UI";
import { useAuth } from "../context/AuthContext";
import { colors } from "../theme";
import type {
  Conversation,
  ConversationMessage,
  ConversationPerson,
} from "../types";

const roleLabels: Record<string, string> = {
  student: "Student",
  parent: "Parent",
  teacher: "Teacher",
  staff: "Staff",
  school_admin: "Admin",
  admin: "Admin",
  super_admin: "Platform",
};

function roleLabel(role?: string) {
  return role ? roleLabels[role] || role : "School member";
}

function formatTime(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString("en-IN", {
      hour: "numeric",
      minute: "2-digit",
    });
  }
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
}

function otherParticipant(conversation: Conversation, userId: string) {
  if (conversation.with) return conversation.with;
  return conversation.participants?.find(
    (participant) => String(participant.userId) !== userId,
  );
}

function Avatar({ name, role }: { name?: string; role?: string }) {
  return (
    <View style={s.avatar}>
      <Text style={s.avatarText}>
        {(name || "?").trim().charAt(0).toUpperCase()}
      </Text>
      <View
        style={[
          s.avatarStatus,
          role === "teacher" || role === "school_admin"
            ? s.avatarStatusStaff
            : null,
        ]}
      />
    </View>
  );
}

export default function MessagesScreen() {
  const { user } = useAuth();
  const userId = String(user?.id || user?._id || "");
  const threadScrollRef = useRef<ScrollView | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [active, setActive] = useState<Conversation | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [composeVisible, setComposeVisible] = useState(false);
  const [personQuery, setPersonQuery] = useState("");
  const [people, setPeople] = useState<ConversationPerson[]>([]);
  const [searching, setSearching] = useState(false);
  const [firstMessage, setFirstMessage] = useState("");

  const loadConversations = useCallback(async () => {
    setRefreshing(true);
    setError("");
    try {
      const response = await api.conversations.list("limit=100");
      setConversations(
        Array.isArray(response.data)
          ? [...response.data].sort(
              (a, b) =>
                new Date(b.lastMessageAt || 0).getTime() -
                new Date(a.lastMessageAt || 0).getTime(),
            )
          : [],
      );
    } catch (loadError) {
      setError(
        (loadError as Error).message || "Unable to load conversations.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    const query = personQuery.trim();
    if (query.length < 2) {
      setPeople([]);
      setSearching(false);
      return undefined;
    }
    setSearching(true);
    const timer = setTimeout(() => {
      api.conversations
        .people(query)
        .then((response) =>
          setPeople(Array.isArray(response.data) ? response.data : []),
        )
        .catch((searchError: Error) =>
          setError(searchError.message || "Unable to search school members."),
        )
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [personQuery]);

  const totalUnread = useMemo(
    () =>
      conversations.reduce(
        (total, conversation) => total + (conversation.unread || 0),
        0,
      ),
    [conversations],
  );
  const messages = active?.messages || [];

  const openConversation = async (conversation: Conversation) => {
    setError("");
    try {
      const response = await api.conversations.get(conversation._id);
      setActive(response.data);
      setConversations((previous) =>
        previous.map((item) =>
          item._id === conversation._id ? { ...item, unread: 0 } : item,
        ),
      );
    } catch (openError) {
      setError(
        (openError as Error).message || "Unable to open this conversation.",
      );
    }
  };

  const sendReply = async () => {
    const body = reply.trim();
    if (!body || !active || sending) return;
    setSending(true);
    setError("");
    try {
      const response = await api.conversations.reply(active._id, body);
      setActive(response.data);
      setReply("");
      await loadConversations();
    } catch (sendError) {
      setError((sendError as Error).message || "Unable to send this message.");
    } finally {
      setSending(false);
    }
  };

  const startConversation = async (person: ConversationPerson) => {
    if (sending) return;
    setSending(true);
    setError("");
    try {
      const response = await api.conversations.open({
        participantId: person._id,
        body: firstMessage.trim() || undefined,
      });
      setComposeVisible(false);
      setPersonQuery("");
      setFirstMessage("");
      setPeople([]);
      setActive(response.data);
      await loadConversations();
    } catch (openError) {
      setError(
        (openError as Error).message || "Unable to start this conversation.",
      );
    } finally {
      setSending(false);
    }
  };

  const closeComposer = () => {
    setComposeVisible(false);
    setPersonQuery("");
    setFirstMessage("");
    setPeople([]);
  };

  return (
    <View style={s.root}>
      {!!error && <Toast message={error} onDismiss={() => setError("")} />}
      <ScrollView
        contentContainerStyle={s.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={loadConversations}
          />
        }
        keyboardShouldPersistTaps="handled"
      >
        <View style={s.heading}>
          <View style={s.headingCopy}>
            <Text style={s.eyebrow}>SCHOOL COMMUNICATION</Text>
            <Text style={s.title}>Message Board</Text>
            <Text style={s.subtitle}>
              Private conversations with your school community.
            </Text>
          </View>
          <Pressable
            onPress={() => {
              setError("");
              setComposeVisible(true);
            }}
            style={s.newButton}
            accessibilityRole="button"
            accessibilityLabel="New message"
          >
            <Ionicons name="create-outline" size={18} color="#fff" />
            <Text style={s.newButtonText}>New message</Text>
          </Pressable>
        </View>

        <View style={s.summaryRow}>
          <View style={s.summaryIcon}>
            <Ionicons name="chatbubbles" size={19} color={colors.info} />
          </View>
          <View style={s.summaryCopy}>
            <Text style={s.summaryTitle}>
              {conversations.length}{" "}
              {conversations.length === 1 ? "conversation" : "conversations"}
            </Text>
            <Text style={s.summarySubtitle}>
              {totalUnread
                ? `${totalUnread} unread ${totalUnread === 1 ? "message" : "messages"}`
                : "You’re all caught up"}
            </Text>
          </View>
          {totalUnread > 0 && (
            <View style={s.unreadTotal}>
              <Text style={s.unreadTotalText}>
                {totalUnread > 99 ? "99+" : totalUnread}
              </Text>
            </View>
          )}
        </View>

        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>Your inbox</Text>
          <Pressable
            onPress={loadConversations}
            disabled={refreshing}
            accessibilityRole="button"
            accessibilityLabel="Refresh inbox"
            style={s.refreshButton}
          >
            <Ionicons name="refresh" size={16} color={colors.info} />
          </Pressable>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color={colors.ink} style={s.loader} />
        ) : conversations.length ? (
          <View style={s.list}>
            {conversations.map((conversation) => {
              const peer = otherParticipant(conversation, userId);
              return (
                <Pressable
                  key={conversation._id}
                  onPress={() => void openConversation(conversation)}
                  accessibilityRole="button"
                  accessibilityLabel={`Open conversation with ${peer?.name || "school member"}`}
                >
                  <Card style={s.conversationCard}>
                    <Avatar name={peer?.name} role={peer?.role} />
                    <View style={s.conversationCopy}>
                      <View style={s.conversationTop}>
                        <Text numberOfLines={1} style={s.personName}>
                          {peer?.name || "School member"}
                        </Text>
                        <Text style={s.time}>
                          {formatTime(conversation.lastMessageAt)}
                        </Text>
                      </View>
                      <View style={s.conversationBottom}>
                        <View style={s.previewCopy}>
                          <Text style={s.role}>
                            {roleLabel(peer?.role)}
                          </Text>
                          <Text numberOfLines={1} style={s.lastMessage}>
                            {conversation.lastMessage || "Start a conversation"}
                          </Text>
                        </View>
                        {(conversation.unread || 0) > 0 && (
                          <View style={s.unreadBadge}>
                            <Text style={s.unreadText}>
                              {(conversation.unread || 0) > 9
                                ? "9+"
                                : conversation.unread}
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                    <Ionicons
                      name="chevron-forward"
                      size={16}
                      color="#A1A9B7"
                    />
                  </Card>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <Card style={s.emptyCard}>
            <View style={s.emptyIcon}>
              <Ionicons
                name="chatbubbles-outline"
                size={28}
                color={colors.info}
              />
            </View>
            <Text style={s.emptyTitle}>No conversations yet</Text>
            <Text style={s.emptyText}>
              Start a private conversation with someone in your school.
            </Text>
            <Button title="Start a new message" onPress={() => setComposeVisible(true)} />
          </Card>
        )}
      </ScrollView>

      <Modal
        visible={composeVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeComposer}
      >
        <View style={s.modalRoot}>
          <View style={s.modalHeader}>
            <View style={s.headingCopy}>
              <Text style={s.eyebrow}>SCHOOL DIRECTORY</Text>
              <Text style={s.modalTitle}>New message</Text>
              <Text style={s.subtitle}>
                Find an active member of your school.
              </Text>
            </View>
            <Pressable
              onPress={closeComposer}
              accessibilityRole="button"
              accessibilityLabel="Close new message"
            >
              <Ionicons name="close" size={23} color={colors.muted} />
            </Pressable>
          </View>
          <View style={s.composeSearch}>
            <Ionicons name="search" size={17} color={colors.muted} />
            <Input
              value={personQuery}
              onChangeText={setPersonQuery}
              placeholder="Search by name..."
              autoFocus
              style={s.searchInput}
              accessibilityLabel="Search school members"
            />
            {searching && <ActivityIndicator size="small" color={colors.info} />}
          </View>
          <Text style={s.searchHint}>
            {personQuery.trim().length < 2
              ? "Type at least two characters to search."
              : `${people.length} ${people.length === 1 ? "person" : "people"} found`}
          </Text>
          <ScrollView
            contentContainerStyle={s.peopleList}
            keyboardShouldPersistTaps="handled"
          >
            {personQuery.trim().length >= 2 &&
              !searching &&
              people.length === 0 && (
                <Text style={s.noPeople}>No one found for that name.</Text>
              )}
            {people.map((person) => (
              <Pressable
                key={person._id}
                onPress={() => void startConversation(person)}
                disabled={sending}
                accessibilityRole="button"
              >
                <Card style={s.personCard}>
                  <Avatar name={person.name} role={person.role} />
                  <View style={s.conversationCopy}>
                    <Text numberOfLines={1} style={s.personName}>
                      {person.name}
                    </Text>
                    <Text numberOfLines={1} style={s.role}>
                      {person.designation || roleLabel(person.role)}
                    </Text>
                  </View>
                  <Ionicons
                    name="chatbubble-ellipses-outline"
                    size={19}
                    color={colors.info}
                  />
                </Card>
              </Pressable>
            ))}
          </ScrollView>
          <View style={s.firstMessageBox}>
            <Text style={s.inputLabel}>First message (optional)</Text>
            <Input
              value={firstMessage}
              onChangeText={setFirstMessage}
              placeholder="Write a message..."
              multiline
              style={s.firstMessageInput}
              textAlignVertical="top"
            />
          </View>
          {sending && (
            <View style={s.sendingOverlay}>
              <ActivityIndicator color={colors.info} />
              <Text style={s.searchHint}>Opening conversation...</Text>
            </View>
          )}
        </View>
      </Modal>

      <Modal
        visible={!!active}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          setActive(null);
          setReply("");
        }}
      >
        {!!active && (
          <KeyboardAvoidingView
            style={s.threadRoot}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            {(() => {
              const peer = otherParticipant(active, userId);
              return (
                <View style={s.threadHeader}>
                  <Pressable
                    onPress={() => {
                      setActive(null);
                      setReply("");
                      void loadConversations();
                    }}
                    style={s.backButton}
                    accessibilityRole="button"
                    accessibilityLabel="Back to inbox"
                  >
                    <Ionicons name="chevron-back" size={21} color={colors.ink} />
                  </Pressable>
                  <Avatar name={peer?.name} role={peer?.role} />
                  <View style={s.threadPeer}>
                    <Text numberOfLines={1} style={s.personName}>
                      {peer?.name || "Conversation"}
                    </Text>
                    <Text style={s.role}>{roleLabel(peer?.role)}</Text>
                  </View>
                  <Pressable
                    onPress={async () => {
                      try {
                        const response = await api.conversations.get(active._id);
                        setActive(response.data);
                      } catch (refreshError) {
                        setError(
                          (refreshError as Error).message ||
                            "Unable to refresh conversation.",
                        );
                      }
                    }}
                    style={s.refreshButton}
                    accessibilityRole="button"
                    accessibilityLabel="Refresh conversation"
                  >
                    <Ionicons name="refresh" size={16} color={colors.info} />
                  </Pressable>
                </View>
              );
            })()}
            <ScrollView
              ref={threadScrollRef}
              style={s.threadScroll}
              contentContainerStyle={s.messageList}
              keyboardShouldPersistTaps="handled"
              onContentSizeChange={() =>
                threadScrollRef.current?.scrollToEnd({ animated: true })
              }
            >
              <Text style={s.threadCount}>
                {messages.length} {messages.length === 1 ? "message" : "messages"}
              </Text>
              {messages.length ? (
                messages.map((message: ConversationMessage, index) => {
                  const mine = String(message.senderId) === userId;
                  return (
                    <View
                      key={message._id || `${message.at}-${index}`}
                      style={[
                        s.messageRow,
                        mine ? s.messageRowMine : s.messageRowPeer,
                      ]}
                    >
                      <View
                        style={[
                          s.messageBubble,
                          mine ? s.messageBubbleMine : s.messageBubblePeer,
                        ]}
                      >
                        <Text
                          style={[
                            s.messageMeta,
                            mine && s.messageMetaMine,
                          ]}
                        >
                          {mine
                            ? "You"
                            : message.senderName ||
                              roleLabel(message.senderRole)}{" "}
                          · {formatTime(message.at)}
                        </Text>
                        <Text
                          style={[
                            s.messageBody,
                            mine && s.messageBodyMine,
                          ]}
                        >
                          {message.body}
                        </Text>
                      </View>
                    </View>
                  );
                })
              ) : (
                <View style={s.noMessages}>
                  <Ionicons
                    name="chatbubble-ellipses-outline"
                    size={25}
                    color={colors.muted}
                  />
                  <Text style={s.emptyText}>No messages yet. Say hello.</Text>
                </View>
              )}
            </ScrollView>
            {!!error && (
              <Text style={s.threadError}>{error}</Text>
            )}
            <View style={s.replyBar}>
              <Input
                value={reply}
                onChangeText={setReply}
                placeholder="Type a reply..."
                multiline
                style={s.replyInput}
                textAlignVertical="center"
                accessibilityLabel="Write a reply"
              />
              <Pressable
                onPress={() => void sendReply()}
                disabled={!reply.trim() || sending}
                style={[
                  s.sendButton,
                  (!reply.trim() || sending) && s.sendButtonDisabled,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Send message"
              >
                {sending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="send" size={17} color="#fff" />
                )}
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        )}
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 16, paddingBottom: 30, gap: 15 },
  heading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  headingCopy: { flex: 1 },
  eyebrow: {
    color: colors.amberDark,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  title: { color: colors.ink, fontSize: 23, fontWeight: "800", marginTop: 4 },
  modalTitle: { color: colors.ink, fontSize: 19, fontWeight: "800", marginTop: 4 },
  subtitle: { color: colors.muted, fontSize: 10, marginTop: 3, lineHeight: 15 },
  newButton: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: colors.ink,
  },
  newButtonText: { color: "#fff", fontSize: 9, fontWeight: "700" },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    padding: 13,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#fff",
  },
  summaryIcon: {
    width: 39,
    height: 39,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    backgroundColor: "#EAF1FF",
  },
  summaryCopy: { flex: 1, gap: 3 },
  summaryTitle: { color: colors.ink, fontSize: 12, fontWeight: "800" },
  summarySubtitle: { color: colors.muted, fontSize: 9 },
  unreadTotal: {
    minWidth: 25,
    height: 25,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
    borderRadius: 13,
    backgroundColor: colors.info,
  },
  unreadTotalText: { color: "#fff", fontSize: 9, fontWeight: "800" },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: { color: colors.ink, fontSize: 15, fontWeight: "800" },
  refreshButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: "#EAF1FF",
  },
  loader: { marginTop: 22 },
  list: { gap: 9 },
  conversationCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 15,
  },
  avatar: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
    backgroundColor: "#EAF1FF",
  },
  avatarText: { color: colors.info, fontSize: 16, fontWeight: "800" },
  avatarStatus: {
    position: "absolute",
    right: -1,
    bottom: -1,
    width: 11,
    height: 11,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#fff",
    backgroundColor: colors.success,
  },
  avatarStatusStaff: { backgroundColor: colors.amberDark },
  conversationCopy: { flex: 1, minWidth: 0, gap: 4 },
  conversationTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
  },
  personName: { flex: 1, color: colors.ink, fontSize: 12, fontWeight: "800" },
  time: { color: colors.muted, fontSize: 8 },
  conversationBottom: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  previewCopy: { flex: 1, minWidth: 0, gap: 2 },
  role: { color: colors.info, fontSize: 9, fontWeight: "700" },
  lastMessage: { color: colors.muted, fontSize: 10 },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
    borderRadius: 10,
    backgroundColor: colors.info,
  },
  unreadText: { color: "#fff", fontSize: 8, fontWeight: "800" },
  emptyCard: {
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 20,
    paddingVertical: 27,
    borderRadius: 16,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 19,
    backgroundColor: "#EAF1FF",
  },
  emptyTitle: { color: colors.ink, fontSize: 14, fontWeight: "800" },
  emptyText: { color: colors.muted, fontSize: 10, textAlign: "center" },
  modalRoot: { flex: 1, backgroundColor: colors.paper, paddingTop: 18 },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 13,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  composeSearch: {
    minHeight: 43,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 15,
    paddingHorizontal: 11,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: "#fff",
  },
  searchInput: {
    flex: 1,
    borderWidth: 0,
    borderRadius: 0,
    paddingHorizontal: 0,
    paddingVertical: 5,
    backgroundColor: "transparent",
    fontSize: 12,
  },
  searchHint: { color: colors.muted, fontSize: 9, marginHorizontal: 16, marginTop: 8 },
  peopleList: { padding: 16, gap: 8 },
  personCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 11,
    borderRadius: 14,
  },
  noPeople: { paddingVertical: 24, color: colors.muted, fontSize: 11, textAlign: "center" },
  firstMessageBox: { paddingHorizontal: 16, paddingVertical: 11, gap: 6, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: "#fff" },
  inputLabel: { color: colors.ink, fontSize: 10, fontWeight: "700" },
  firstMessageInput: { minHeight: 48, maxHeight: 92, borderRadius: 11, fontSize: 11, paddingVertical: 9 },
  sendingOverlay: { flexDirection: "row", alignItems: "center", gap: 7, paddingBottom: 12 },
  threadRoot: { flex: 1, backgroundColor: colors.paper },
  threadHeader: {
    minHeight: 70,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: "#fff",
  },
  backButton: { width: 30, height: 40, alignItems: "center", justifyContent: "center" },
  threadPeer: { flex: 1, minWidth: 0, gap: 3 },
  threadScroll: { flex: 1 },
  messageList: { padding: 14, gap: 11, flexGrow: 1 },
  threadCount: { color: colors.muted, fontSize: 9, textAlign: "center", marginBottom: 4 },
  messageRow: { width: "100%", flexDirection: "row" },
  messageRowMine: { justifyContent: "flex-end" },
  messageRowPeer: { justifyContent: "flex-start" },
  messageBubble: { maxWidth: "84%", paddingHorizontal: 12, paddingVertical: 9, borderRadius: 15 },
  messageBubbleMine: { borderBottomRightRadius: 5, backgroundColor: colors.info },
  messageBubblePeer: { borderBottomLeftRadius: 5, borderWidth: 1, borderColor: colors.border, backgroundColor: "#fff" },
  messageMeta: { color: colors.muted, fontSize: 8, marginBottom: 4 },
  messageMetaMine: { color: "rgba(255,255,255,0.72)" },
  messageBody: { color: colors.ink, fontSize: 11, lineHeight: 17 },
  messageBodyMine: { color: "#fff" },
  noMessages: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  threadError: { color: colors.alert, fontSize: 9, paddingHorizontal: 14, paddingBottom: 5 },
  replyBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 9,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: "#fff",
  },
  replyInput: { flex: 1, minHeight: 41, maxHeight: 100, borderRadius: 13, fontSize: 11, paddingVertical: 9 },
  sendButton: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: colors.info,
  },
  sendButtonDisabled: { opacity: 0.45 },
});
