import React, { createContext, useContext, useMemo, useState } from "react";
import { login as loginApi } from "../api/auth";
import { getStoredToken, setStoredToken } from "../api/client";
import type { UserProfile } from "../types";

const PROFILE_KEY = "adminweb.profile";
const PLATFORM_ADMIN = "PlatformAdmin";

function readStoredProfile(): UserProfile | null {
  const raw = localStorage.getItem(PROFILE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UserProfile;
  } catch {
    return null;
  }
}

interface AuthContextValue {
  profile: UserProfile | null;
  isAuthenticated: boolean;
  isPlatformAdmin: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<UserProfile | null>(
    getStoredToken() ? readStoredProfile() : null
  );

  const signIn = async (email: string, password: string) => {
    const result = await loginApi(email, password);
    if (!result.profile?.roles?.includes(PLATFORM_ADMIN)) {
      // Don't persist a non-admin session — this console is PlatformAdmin only.
      throw new Error("This account is not a platform administrator.");
    }
    setStoredToken(result.accessToken);
    localStorage.setItem(PROFILE_KEY, JSON.stringify(result.profile));
    setProfile(result.profile);
  };

  const signOut = () => {
    setStoredToken(null);
    localStorage.removeItem(PROFILE_KEY);
    setProfile(null);
  };

  const value = useMemo<AuthContextValue>(
    () => ({
      profile,
      isAuthenticated: Boolean(profile),
      isPlatformAdmin: Boolean(profile?.roles?.includes(PLATFORM_ADMIN)),
      signIn,
      signOut,
    }),
    [profile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
