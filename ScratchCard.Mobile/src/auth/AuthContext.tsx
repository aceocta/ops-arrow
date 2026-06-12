import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState, AppStateStatus } from "react-native";
import {
  AuthTokenResult,
  getCurrentUserProfile,
  logout as logoutApi,
  refreshAccessToken,
  signInWithDevBypass,
  signInWithPassword as signInWithPasswordApi,
  signUpCompany as signUpCompanyApi,
  signUpWithPassword as signUpWithPasswordApi,
} from "../api/authApi";
import { registerPushToken, unregisterPushToken } from "../api/notificationsApi";
import { onSessionExpired } from "./authEvents";
import { runSessionCleanup } from "./sessionCleanup";
import { resolveFirebasePushTokenAsync } from "../notifications/pushRegistration";
import { clearAllCachedEntitlements } from "../features/subscription/entitlements";
import { clearAllNotificationPreferences } from "../features/settings/notificationPreferencesStorage";
import { wipeAllOfflineData } from "../storage/sqlite";
import { AuthProfile } from "../types/models";
import { reportError } from "../utils/crashReporter";
import { identifyUser, resetAnalytics } from "../utils/analytics";
import { setCrashReporterUser } from "../utils/crashReporter";
import {
  clearAccessToken,
  clearAuthProfile,
  clearActiveShopId,
  clearRefreshToken,
  getAuthProfile,
  getAccessToken,
  getActiveShopId,
  getRefreshToken,
  saveAuthProfile,
  saveAccessToken,
  saveActiveShopId,
  saveRefreshToken,
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
  signUpWithPassword: (payload: { email: string; password: string; verificationCode: string; firstName?: string; lastName?: string; ownerPhoneNumber?: string }) => Promise<void>;
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
  const isSigningOutRef = useRef(false);

  useEffect(() => {
    void bootstrap();
  }, []);

  // Proactive access-token refresh. The server issues an 8h token (see Jwt:AccessTokenExpiryMinutes);
  // for an app used through a full shift we don't want the user logged out mid-action. Refresh on
  // a 3h cadence while foregrounded, and on returning to the app after being away ≥ 1h.
  const lastRefreshRef = useRef<number>(Date.now());
  useEffect(() => {
    if (!profile) return;

    const refresh = async (reason: string) => {
      try {
        const storedRefreshToken = await getRefreshToken();
        if (!storedRefreshToken) {
          return;
        }
        // Rotating refresh: returns a new access + refresh pair and revokes the old refresh token.
        const refreshed = await refreshAccessToken(storedRefreshToken);
        if (refreshed.accessToken) {
          await saveAccessToken(refreshed.accessToken);
          if (refreshed.refreshToken) {
            await saveRefreshToken(refreshed.refreshToken);
          }
          lastRefreshRef.current = Date.now();
        }
      } catch (error) {
        reportError(error, { phase: `auth-refresh:${reason}` });
      }
    };

    const intervalId = setInterval(() => {
      void refresh("interval");
    }, 3 * 60 * 60 * 1000);

    const onAppStateChange = (next: AppStateStatus) => {
      if (next === "active") {
        const sinceLast = Date.now() - lastRefreshRef.current;
        if (sinceLast >= 60 * 60 * 1000) {
          void refresh("foreground");
        }
      }
    };
    const sub = AppState.addEventListener("change", onAppStateChange);

    return () => {
      clearInterval(intervalId);
      sub.remove();
    };
  }, [profile?.userId]);

  useEffect(() => {
    if (profile?.userId) {
      identifyUser(profile.userId, { email: profile.email });
      setCrashReporterUser({ id: profile.userId, email: profile.email });
    } else {
      setCrashReporterUser(null);
      resetAnalytics();
    }
  }, [profile?.userId, profile?.email]);

  // When the API interceptor can't refresh the access token, the session is unrecoverable —
  // sign out so the navigator returns to Login.
  useEffect(() => {
    return onSessionExpired(() => {
      void signOut();
    });
  }, []);

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
        await clearRefreshToken();
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
      await clearRefreshToken();
      await clearAuthProfile();
      await clearActiveShopId();
      setProfile(null);
      setActiveShopId(null);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }

  async function signUpWithPassword(payload: { email: string; password: string; verificationCode: string; firstName?: string; lastName?: string; ownerPhoneNumber?: string }) {
    setIsLoading(true);
    try {
      const result = await signUpWithPasswordApi(payload);
      await applyAuthTokenResult(result);
    } catch (error) {
      await clearAccessToken();
      await clearRefreshToken();
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
      await clearRefreshToken();
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
      await clearRefreshToken();
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
      // Rotate the token to pick up fresh role/claim changes (e.g. after company/shop setup).
      const storedRefreshToken = await getRefreshToken();
      if (storedRefreshToken) {
        const refreshed = await refreshAccessToken(storedRefreshToken);
        await applyAuthTokenResult(refreshed, preferredShopId ?? activeShopId);
        return;
      }
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
    // Re-entrancy guard: the unregister call below can itself 401 → emitSessionExpired → signOut,
    // which would cascade. A second call while one is in flight is a no-op.
    if (isSigningOutRef.current) {
      return;
    }
    isSigningOutRef.current = true;
    try {
      await performSignOut();
    } finally {
      isSigningOutRef.current = false;
    }
  }

  async function performSignOut() {
    // Grab the refresh token before clearing storage so we can still revoke it server-side.
    let refreshToken: string | null = null;
    try {
      refreshToken = await getRefreshToken();
    } catch {
      refreshToken = null;
    }

    // Unregister this device's push token while we still have an authenticated session (the call
    // needs the access token, so it must run BEFORE the tokens are cleared). Best-effort and
    // bounded: a slow/unreachable backend must not leave the user stuck on the logged-in screen,
    // so we give it a few seconds and then move on regardless.
    try {
      const devicePushToken = await resolveFirebasePushTokenAsync();
      const shopsToUnregister = profile?.shops ?? [];
      if (devicePushToken && shopsToUnregister.length > 0) {
        await Promise.race([
          Promise.allSettled(
            shopsToUnregister.map((shop) =>
              unregisterPushToken({ shopId: shop.shopId, pushToken: devicePushToken.token })
            )
          ),
          new Promise<void>((resolve) => {
            setTimeout(() => resolve(), 4000);
          }),
        ]);
      }
    } catch {
      // Push unregistration is best-effort and must not block sign-out.
    }

    // Clear the local session so the app signs out — never block the user on a slow or unreachable
    // backend (the previous order awaited the logout call before clearing state, so a hung request
    // left the user stuck on the logged-in screen).
    await clearAccessToken();
    await clearRefreshToken();
    await clearAuthProfile();
    await clearActiveShopId();
    setProfile(null);
    setActiveShopId(null);

    // Shared shop devices: wipe everything the previous user's session left behind. Each step is
    // best-effort so one failure doesn't abort the rest.
    try {
      // Registered callbacks, e.g. App.tsx clears the TanStack Query cache.
      await runSessionCleanup();
    } catch {}
    try {
      // Cached subscription entitlements for ALL shops, not just the active one.
      await clearAllCachedEntitlements();
    } catch {}
    try {
      // Locally stored per-shop notification channel preferences.
      await clearAllNotificationPreferences();
    } catch {}
    try {
      // Offline SQLite queues (shift-close payloads with cash counts, drafts, checklist queue).
      await wipeAllOfflineData();
    } catch {}

    // Best-effort server-side revoke in the background; failures don't affect the sign-out.
    if (refreshToken) {
      void logoutApi(refreshToken).catch(() => {});
    }
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
    if (result.refreshToken) {
      await saveRefreshToken(result.refreshToken);
    }
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
        await clearRefreshToken();
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
  // Honour a remembered/last-used shop when it's still valid.
  if (preferredShopId && profile.shops.some((shop) => shop.shopId === preferredShopId)) {
    return preferredShopId;
  }

  // Exactly one shop → go straight in. With more than one (especially across companies) we return
  // null so the app forces an explicit shop/company choice instead of guessing.
  if (profile.shops.length === 1) {
    return profile.shops[0].shopId;
  }

  return null;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider.");
  }
  return context;
}
