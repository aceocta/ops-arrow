import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, setSessionExpiredHandler, tokens, unwrap } from "../lib/api";
import type { AuthProfile, Entitlements, ProfileShop } from "../lib/types";

export type SignupPayload = {
  email: string;
  password: string;
  verificationCode: string;
  firstName: string;
  lastName: string;
};

type AuthState = {
  ready: boolean;
  profile: AuthProfile | null;
  activeShopId: string | null;
  activeShop: ProfileShop | null;
  features: string[];
  isOwner: boolean;
  isManager: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (payload: SignupPayload) => Promise<void>;
  logout: () => void;
  setActiveShopId: (shopId: string) => void;
  /** Re-fetch /auth/me — used after onboarding steps (company creation) change the profile. */
  refreshProfile: () => Promise<void>;
  hasFeature: (key: string) => boolean;
};

const Ctx = createContext<AuthState | null>(null);
const SHOP_KEY = "oa.web.activeShopId";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [activeShopId, setActiveShopIdState] = useState<string | null>(localStorage.getItem(SHOP_KEY));
  const [features, setFeatures] = useState<string[]>([]);

  const loadProfile = async () => {
    const res = await api.get("/auth/me");
    const p = unwrap<AuthProfile>(res.data);
    setProfile(p);
    const shops = p.shops ?? [];
    const current = localStorage.getItem(SHOP_KEY);
    const chosen = shops.find((s) => s.shopId === current)?.shopId ?? shops[0]?.shopId ?? null;
    if (chosen) {
      localStorage.setItem(SHOP_KEY, chosen);
      setActiveShopIdState(chosen);
    }
    return p;
  };

  // Boot: if we have a token, restore the session.
  useEffect(() => {
    setSessionExpiredHandler(() => {
      setProfile(null);
      setFeatures([]);
    });
    (async () => {
      if (tokens.access()) {
        try {
          await loadProfile();
        } catch {
          tokens.clear();
        }
      }
      setReady(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load entitlements whenever the active shop changes.
  useEffect(() => {
    if (!activeShopId) return;
    (async () => {
      try {
        const res = await api.get("/shop-subscription/entitlements", { params: { shopId: activeShopId } });
        const e = unwrap<Entitlements>(res.data);
        setFeatures(e?.features ?? []);
      } catch {
        setFeatures([]);
      }
    })();
  }, [activeShopId]);

  const applyAuthToken = async (body: any) => {
    const d = unwrap<any>(body);
    const access = d?.accessToken ?? d?.token ?? d?.AccessToken;
    if (!access) throw new Error("No token returned.");
    tokens.set(access, d?.refreshToken ?? d?.RefreshToken ?? null);
    await loadProfile();
  };

  const login = async (email: string, password: string) => {
    const res = await api.post("/auth/login", { email, password });
    await applyAuthToken(res.data);
  };

  // Signup returns the same token envelope as login — the new owner is signed in immediately.
  const signup = async (payload: SignupPayload) => {
    const res = await api.post("/auth/signup", payload);
    await applyAuthToken(res.data);
  };

  const refreshProfile = async () => {
    await loadProfile();
  };

  const logout = () => {
    const rt = tokens.refresh();
    if (rt) api.post("/auth/logout", { refreshToken: rt }).catch(() => {});
    tokens.clear();
    setProfile(null);
    setFeatures([]);
  };

  const setActiveShopId = (shopId: string) => {
    localStorage.setItem(SHOP_KEY, shopId);
    setActiveShopIdState(shopId);
  };

  const roles = profile?.roles ?? [];
  const value = useMemo<AuthState>(
    () => ({
      ready,
      profile,
      activeShopId,
      activeShop: profile?.shops?.find((s) => s.shopId === activeShopId) ?? null,
      features,
      isOwner: roles.some((r) => r === "CompanyOwner" || r === "PlatformAdmin"),
      isManager: roles.some((r) => r === "Manager"),
      login,
      signup,
      logout,
      setActiveShopId,
      refreshProfile,
      hasFeature: (key: string) => features.includes(key),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, profile, activeShopId, features],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used within AuthProvider");
  return v;
}
