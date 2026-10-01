import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { notificationsApi } from "../lib/api";

const Ctx = createContext<{ unread: number; tick: number; refresh: () => void; live: boolean }>({ unread: 0, tick: 0, refresh: () => {}, live: false });
export const useNotifications = () => useContext(Ctx);

// Mounted only while logged in: keeps the unread badge fresh via the SSE stream.
export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const [unread, setUnread] = useState(0);
  const [tick, setTick] = useState(0);
  const [live, setLive] = useState(false);
  const refresh = useCallback(() => {
    notificationsApi.unreadCount().then((r) => setUnread(r.data?.unreadCount ?? 0)).catch(() => {});
    setTick((t) => t + 1);
  }, []);
  useEffect(() => {
    refresh();
    return notificationsApi.subscribe({ onData: refresh, onStatus: (s) => setLive(s === "connected") });
  }, [refresh]);
  return <Ctx.Provider value={{ unread, tick, refresh, live }}>{children}</Ctx.Provider>;
}
