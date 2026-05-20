import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  AuthTokenResult,
  getCurrentUserProfile,
  refreshAuthToken,
  signInWithDevBypass,
  signInWithPassword as signInWithPasswordApi,
  signUpWithPassword as signUpWithPasswordApi,
} from "../api/authApi";
import { AuthProfile } from "../types/models";
import {
  clearAccessToken,
  clearAuthProfile,
  clearActiveShopId,
  getAuthProfile,
  getAccessToken,
  getActiveShopId,
  saveAuthProfile,
  saveAccessToken,
  saveActiveShopId,
} from "./tokenStorage";

type AuthShop = AuthProfile["shops"][number];

type AuthContextValue = {
  isBootstrapping: boolean;
  isLoading: boolean;
  isAuthenticated: boolean;
  profile: AuthProfile | null;
  activeShopId: string | null;
  activeShop: AuthShop | null;
  setActiveShop: (shopId: string) => Promise<void>;
  signInWithPassword: (payload: { email: string; password: string }) => Promise<void>;
  signUpWithPassword: (payload: { email: string; password: string; firstName?: string; lastName?: string }) => Promise<void>;
  signInWithGoogleToken: (idToken: string) => Promise<void>;
  signInWithDevBypass: (payload: { email?: string; firstName?: string; lastName?: string; role?: string; shopId?: string }) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: (preferredShopId?: string | null, refreshTokenClaims?: boolean) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [activeShopId, setActiveShopId] = useState<string | null>(null);

  useEffect(() => {
    void bootstrap();
  }, []);

  async function bootstrap() {
    setIsBootstrapping(true);
    setIsLoading(true);
    try {
      const [token, savedShopId, cachedProfile] = await Promise.all([
        getAccessToken(),
        getActiveShopId(),
        getAuthProfile(),
      ]);

      if (!token) {
        setProfile(null);
        setActiveShopId(null);
        return;
      }

      if (cachedProfile) {
        const cachedShopId = resolveActiveShopId(cachedProfile, savedShopId);
        setProfile(cachedProfile);
        setActiveShopId(cachedShopId);

        if (cachedShopId) {
          void saveActiveShopId(cachedShopId);
        } else {
          void clearActiveShopId();
        }

        void refreshProfileFromServer(cachedShopId);
        return;
      }

      await refreshProfileFromServer(savedShopId);
    } catch {
      await clearAccessToken();
      await clearAuthProfile();
      await clearActiveShopId();
      setProfile(null);
      setActiveShopId(null);
    } finally {
      setIsLoading(false);
      setIsBootstrapping(false);
    }
  }

  async function signInWithPassword(payload: { email: string; password: string }) {
    setIsLoading(true);
    try {
      const result = await signInWithPasswordApi(payload);
      await applyAuthTokenResult(result);
    } catch (error) {
      await clearAccessToken();
      await clearAuthProfile();
      await clearActiveShopId();
      setProfile(null);
      setActiveShopId(null);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }

  async function signUpWithPassword(payload: { email: string; password: string; firstName?: string; lastName?: string }) {
    setIsLoading(true);
    try {
      const result = await signUpWithPasswordApi(payload);
      await applyAuthTokenResult(result);
    } catch (error) {
      await clearAccessToken();
      await clearAuthProfile();
      await clearActiveShopId();
      setProfile(null);
      setActiveShopId(null);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }

  async function signInWithDevBypassLogin(payload: { email?: string; firstName?: string; lastName?: string; role?: string; shopId?: string }) {
    setIsLoading(true);
    try {
      const result = await signInWithDevBypass(payload);
      await applyAuthTokenResult(result, payload.shopId);
    } catch (error) {
      await clearAccessToken();
      await clearAuthProfile();
      await clearActiveShopId();
      setProfile(null);
      setActiveShopId(null);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }

  async function signInWithGoogleToken(_idToken: string) {
    throw new Error("Google sign-in is not configured in this build.");
  }

  async function setActiveShop(shopId: string) {
    if (!profile?.shops.some((shop) => shop.shopId === shopId)) {
      return;
    }

    setActiveShopId(shopId);
    await saveActiveShopId(shopId);
  }

  async function refreshProfile(preferredShopId?: string | null, refreshTokenClaims = false) {
    if (refreshTokenClaims) {
      const refreshed = await refreshAuthToken();
      await applyAuthTokenResult(refreshed, preferredShopId ?? activeShopId);
      return;
    }

    const currentUser = await getCurrentUserProfile();
    const nextShopId = resolveActiveShopId(currentUser, preferredShopId ?? activeShopId);
    setProfile(currentUser);
    setActiveShopId(nextShopId);
    await saveAuthProfile(currentUser);

    if (nextShopId) {
      await saveActiveShopId(nextShopId);
    } else {
      await clearActiveShopId();
    }
  }

  async function signOut() {
    await clearAccessToken();
    await clearAuthProfile();
    await clearActiveShopId();
    setProfile(null);
    setActiveShopId(null);
  }

  const activeShop = useMemo(
    () => profile?.shops.find((shop) => shop.shopId === activeShopId) ?? null,
    [activeShopId, profile?.shops]
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      isBootstrapping,
      isLoading,
      isAuthenticated: Boolean(profile),
      profile,
      activeShopId,
      activeShop,
      setActiveShop,
      signInWithPassword,
      signUpWithPassword,
      signInWithGoogleToken,
      signInWithDevBypass: signInWithDevBypassLogin,
      signOut,
      refreshProfile,
    }),
    [activeShop, activeShopId, isBootstrapping, isLoading, profile]
  );

  async function applyAuthTokenResult(result: AuthTokenResult, preferredShopId?: string | null) {
    await saveAccessToken(result.accessToken);
    const resolvedProfile = result.profile ?? await getCurrentUserProfile();
    const nextShopId = resolveActiveShopId(resolvedProfile, preferredShopId);
    setProfile(resolvedProfile);
    setActiveShopId(nextShopId);
    await saveAuthProfile(resolvedProfile);

    if (nextShopId) {
      await saveActiveShopId(nextShopId);
    } else {
      await clearActiveShopId();
    }
  }

  async function refreshProfileFromServer(preferredShopId?: string | null) {
    try {
      const currentUser = await getCurrentUserProfile();
      const nextShopId = resolveActiveShopId(currentUser, preferredShopId);
      setProfile(currentUser);
      setActiveShopId(nextShopId);
      await saveAuthProfile(currentUser);

      if (nextShopId) {
        await saveActiveShopId(nextShopId);
      } else {
        await clearActiveShopId();
      }
    } catch (error: any) {
      const status = error?.response?.status as number | undefined;
      if (status === 401 || status === 403) {
        await clearAccessToken();
        await clearAuthProfile();
        await clearActiveShopId();
        setProfile(null);
        setActiveShopId(null);
      }
    }
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function resolveActiveShopId(profile: AuthProfile, preferredShopId?: string | null) {
  if (preferredShopId && profile.shops.some((shop) => shop.shopId === preferredShopId)) {
    return preferredShopId;
  }

  return profile.shops[0]?.shopId ?? null;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider.");
  }
  return context;
}
