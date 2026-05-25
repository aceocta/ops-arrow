import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  AuthTokenResult,
  getCurrentUserProfile,
  refreshAuthToken,
  signInWithDevBypass,
  signInWithPassword as signInWithPasswordApi,
  signUpCompany as signUpCompanyApi,
  signUpWithPassword as signUpWithPasswordApi,
} from "../api/authApi";
import { registerPushToken } from "../api/notificationsApi";
import { resolveFirebasePushTokenAsync } from "../notifications/pushRegistration";
import { AuthProfile } from "../types/models";
import { reportError } from "../utils/crashReporter";
import { identifyUser, resetAnalytics } from "../utils/analytics";
import { setCrashReporterUser } from "../utils/crashReporter";
import { setActiveShop as setRevenueCatActiveShop } from "../features/subscription/revenueCat";
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
  bootstrapError: Error | null;
  retryBootstrap: () => Promise<void>;
  setActiveShop: (shopId: string) => Promise<void>;
  signInWithPassword: (payload: { email: string; password: string }) => Promise<void>;
  signUpWithPassword: (payload: { email: string; password: string; verificationCode: string; firstName?: string; lastName?: string }) => Promise<void>;
  signUpCompany: (payload: {
    companyName: string;
    ownerFirstName: string;
    ownerLastName: string;
    ownerEmail: string;
    phoneNumber?: string;
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    postCode?: string;
    country: string;
    firstShopName?: string;
    password: string;
  }) => Promise<void>;
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
  const [bootstrapError, setBootstrapError] = useState<Error | null>(null);

  useEffect(() => {
    void bootstrap();
  }, []);

  useEffect(() => {
    if (profile?.userId) {
      identifyUser(profile.userId, { email: profile.email });
      setCrashReporterUser({ id: profile.userId, email: profile.email });
    } else {
      setCrashReporterUser(null);
      resetAnalytics();
    }
  }, [profile?.userId, profile?.email]);

  // Keep RevenueCat's appUserId in sync with the active shop so subscriber state, purchases,
  // and webhook events all key by shopId.
  useEffect(() => {
    void setRevenueCatActiveShop(activeShopId);
  }, [activeShopId]);

  useEffect(() => {
    if (!profile?.userId || !activeShopId) {
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const devicePushToken = await resolveFirebasePushTokenAsync();
        if (!devicePushToken || cancelled) {
          return;
        }

        await registerPushToken({
          shopId: activeShopId,
          pushToken: devicePushToken.token,
          platform: devicePushToken.platform,
          deviceName: profile.displayName?.trim() || profile.email,
        });
      } catch {
        // Push registration is best-effort and must not block app usage.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeShopId, profile?.displayName, profile?.email, profile?.userId]);

  async function bootstrap() {
    setIsBootstrapping(true);
    setIsLoading(true);
    setBootstrapError(null);
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
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error));
      const status = (error as any)?.response?.status as number | undefined;
      const isAuthFailure = status === 401 || status === 403;

      reportError(normalized, { phase: "auth-bootstrap", status });

      if (isAuthFailure) {
        await clearAccessToken();
        await clearAuthProfile();
        await clearActiveShopId();
        setProfile(null);
        setActiveShopId(null);
        setBootstrapError(null);
      } else {
        setBootstrapError(normalized);
      }
    } finally {
      setIsLoading(false);
      setIsBootstrapping(false);
    }
  }

  const retryBootstrap = useCallback(async () => {
    await bootstrap();
  }, []);

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

  async function signUpWithPassword(payload: { email: string; password: string; verificationCode: string; firstName?: string; lastName?: string }) {
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

  async function signUpCompany(payload: {
    companyName: string;
    ownerFirstName: string;
    ownerLastName: string;
    ownerEmail: string;
    phoneNumber?: string;
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    postCode?: string;
    country: string;
    firstShopName?: string;
    password: string;
  }) {
    setIsLoading(true);
    try {
      const result = await signUpCompanyApi(payload);
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
      bootstrapError,
      retryBootstrap,
      setActiveShop,
      signInWithPassword,
      signUpWithPassword,
      signUpCompany,
      signInWithGoogleToken,
      signInWithDevBypass: signInWithDevBypassLogin,
      signOut,
      refreshProfile,
    }),
    [activeShop, activeShopId, bootstrapError, isBootstrapping, isLoading, profile, retryBootstrap]
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
