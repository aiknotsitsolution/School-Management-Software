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
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  selectSchool: (school: School | null) => Promise<void>;
  can: (permission: string) => boolean;
  updateUser: (user: Partial<User>) => Promise<void>;
}

const AuthContext = createContext<Ctx>(null as unknown as Ctx);
export const useAuth = () => useContext(AuthContext);

function schoolSummary(value: School | null | undefined): School | null {
  if (!value) return null;
  return {
    id: value.id,
    _id: value._id,
    name: value.name,
    shortName: value.shortName,
    code: value.code,
    email: value.email,
    phone: value.phone,
    location: value.location,
    address: value.address,
    website: value.website,
    domain: value.domain,
    plan: value.plan,
    status: value.status,
    city: value.city,
    state: value.state,
    pincode: value.pincode,
    board: value.board,
    examFormat: value.examFormat,
    examFormatType: value.examFormatType,
    examFormats: value.examFormats?.map((format) => ({
      name: format.name,
      types: Array.isArray(format.types) ? [...format.types] : [],
    })),
    recognitionNumber: value.recognitionNumber,
    recognitionAuthority: value.recognitionAuthority,
    recognitionVerified: value.recognitionVerified,
    recognitionVerifiedAt: value.recognitionVerifiedAt,
    logo: value.logo,
    settings: value.settings,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    isDeleted: value.isDeleted,
    deletedAt: value.deletedAt,
    academicConfigConfirmed: value.academicConfigConfirmed,
    onboarding: value.onboarding
      ? {
          status: value.onboarding.status,
          appliedAt: value.onboarding.appliedAt,
          completedAt: value.onboarding.completedAt,
          notes: value.onboarding.notes,
        }
      : undefined,
    session: value.session,
    currentSession: value.currentSession
      ? {
          name: value.currentSession.name,
          startDate: value.currentSession.startDate,
          endDate: value.currentSession.endDate,
        }
      : undefined,
  };
}

function userSummary(value: User): User {
  const remotePhoto = (photo?: string) =>
    photo && /^https?:\/\//i.test(photo) && photo.length <= 2048
      ? photo
      : undefined;

  return {
    _id: value._id,
    id: value.id,
    name: value.name,
    email: value.email,
    role: value.role,
    schoolId: value.schoolId,
    phone: value.phone,
    designation: value.designation,
    class: value.class,
    section: value.section,
    isActive: value.isActive,
    emailVerified: value.emailVerified,
    deletedAt: value.deletedAt,
    lastLogin: value.lastLogin,
    lastActivity: value.lastActivity,
    createdAt: value.createdAt,
    permissions: value.permissions,
    avatar: remotePhoto(value.avatar),
    photoUrl: remotePhoto(value.photoUrl),
    photo: remotePhoto(value.photo),
  };
}

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
    const summary = schoolSummary(nextSchool);
    await AsyncStorage.multiSet([
      [KEYS.school, JSON.stringify(summary)],
      [KEYS.activeSchoolId, summary?.id || summary?._id || ""],
    ]);
    setSchool(summary);
  }, []);

  useEffect(() => {
    let current = true;
    setLogoutHandler(() => {
      void signOut();
    });

    const hydrate = async () => {
      try {
        const token = await AsyncStorage.getItem(KEYS.access);
        if (!token) return;

        // Refresh profile and overwrite any legacy oversized cached JSON rows.
        const { data } = await api.me();
        if (!current) return;

        const nextUser = userSummary(data.user);
        const nextSchool = schoolSummary(data.school);
        setUser(nextUser);
        setSchool(nextSchool);
        await AsyncStorage.multiSet([
          [KEYS.user, JSON.stringify(nextUser)],
          [KEYS.school, JSON.stringify(nextSchool)],
          [KEYS.role, nextUser.role],
        ]);
      } catch {
        if (current) {
          setUser(null);
          setSchool(null);
        }
      } finally {
        if (current) setLoading(false);
      }
    };

    void hydrate();
    return () => {
      current = false;
    };
  }, [signOut]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { data } = await api.login({ email: email.trim(), password });
    const nextUser = userSummary(data.user);
    const nextSchool = schoolSummary(data.school);
    await AsyncStorage.multiSet([
      [KEYS.access, data.accessToken],
      [KEYS.refresh, data.refreshToken],
      [KEYS.user, JSON.stringify(nextUser)],
      [KEYS.school, JSON.stringify(nextSchool)],
      [KEYS.role, nextUser.role],
      [KEYS.activeSchoolId, ""],
    ]);
    setUser(nextUser);
    setSchool(nextSchool);
  }, []);

  const can = useCallback(
    (permission: string) => {
      const permissions = user?.permissions ?? [];
      return (
        user?.role === "super_admin" ||
        permissions.includes("*") ||
        permissions.includes(permission)
      );
    },
    [user],
  );

  const updateUser = useCallback(async (patch: Partial<User>) => {
    setUser((previous) => {
      const next = userSummary({ ...(previous as User), ...patch });
      void AsyncStorage.setItem(KEYS.user, JSON.stringify(next));
      void AsyncStorage.setItem(KEYS.role, next.role);
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
