import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api, KEYS, setLogoutHandler } from "../lib/api";
import type { School, User } from "../types";

interface Ctx {
  user: User | null;
  school: School | null;
  loading: boolean;
  signIn: (e: string, p: string) => Promise<void>;
  signOut: () => Promise<void>;
  selectSchool: (school: School | null) => Promise<void>;
  can: (perm: string) => boolean;
  updateUser: (u: Partial<User>) => Promise<void>;
}
const AuthContext = createContext<Ctx>(null as unknown as Ctx);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [school, setSchool] = useState<School | null>(null);
  const [loading, setLoading] = useState(true);

  const signOut = useCallback(async () => {
    await AsyncStorage.multiRemove(Object.values(KEYS));
    setUser(null);
    setSchool(null);
  }, []);

  const selectSchool = useCallback(async (nextSchool: School | null) => {
    await AsyncStorage.setItem(KEYS.school, JSON.stringify(nextSchool));
    setSchool(nextSchool);
  }, []);

  useEffect(() => {
    setLogoutHandler(() => {
      signOut();
    });
    (async () => {
      const [t, u, s] = await AsyncStorage.multiGet([
        KEYS.access,
        KEYS.user,
        KEYS.school,
      ]);
      if (t[1] && u[1]) {
        setUser(JSON.parse(u[1]));
        setSchool(s[1] ? JSON.parse(s[1]) : null);
      }
      setLoading(false);
    })();
  }, [signOut]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { data } = await api.login({ email: email.trim(), password });
    await AsyncStorage.multiSet([
      [KEYS.access, data.accessToken],
      [KEYS.refresh, data.refreshToken],
      [KEYS.user, JSON.stringify(data.user)],
      [KEYS.school, JSON.stringify(data.school ?? null)],
    ]);
    setUser(data.user);
    setSchool(data.school ?? null);
  }, []);

  const can = useCallback(
    (perm: string) => {
      const p = user?.permissions ?? [];
      return (
        user?.role === "super_admin" || p.includes("*") || p.includes(perm)
      );
    },
    [user],
  );

  const updateUser = useCallback(async (patch: Partial<User>) => {
    setUser((prev) => {
      const next = { ...(prev as User), ...patch };
      AsyncStorage.setItem(KEYS.user, JSON.stringify(next));
      return next;
    });
  }, []);
  const value = useMemo(
    () => ({
      user,
      school,
      loading,
      signIn,
      signOut,
      selectSchool,
      can,
      updateUser,
    }),
    [user, school, loading, signIn, signOut, selectSchool, can, updateUser],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
