import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { AuthProfile } from "../types/models";

const ACCESS_TOKEN_KEY = "scratchcard_access_token";
const REFRESH_TOKEN_KEY = "scratchcard_refresh_token";
const ACTIVE_SHOP_ID_KEY = "scratchcard_active_shop_id";
// Legacy key: the whole AuthProfile (incl. PII) used to live in plaintext AsyncStorage under this
// key. It is migrated to the split scheme below on first read and then deleted.
const LEGACY_AUTH_PROFILE_KEY = "scratchcard_auth_profile";
// Split profile storage: PII (email, names, phone) goes to SecureStore — it's small, so it stays
// well under SecureStore's ~2048-byte per-value guidance. The remainder (roles, shop list, setup
// flags — non-PII operational data, unbounded size) stays in AsyncStorage.
const AUTH_PROFILE_PII_KEY = "scratchcard_auth_profile_pii";
const AUTH_PROFILE_REST_KEY = "scratchcard_auth_profile_rest";
let accessTokenCache: string | null | undefined;
let refreshTokenCache: string | null | undefined;
let activeShopIdCache: string | null | undefined;
let authProfileCache: AuthProfile | null | undefined;

export async function saveAccessToken(token: string) {
  accessTokenCache = token;
  await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, token);
}

export async function getAccessToken() {
  if (accessTokenCache !== undefined) {
    return accessTokenCache;
  }

  accessTokenCache = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
  return accessTokenCache;
}

export async function clearAccessToken() {
  accessTokenCache = null;
  await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
}

export async function saveRefreshToken(token: string) {
  refreshTokenCache = token;
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token);
}

export async function getRefreshToken() {
  if (refreshTokenCache !== undefined) {
    return refreshTokenCache;
  }

  refreshTokenCache = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
  return refreshTokenCache;
}

export async function clearRefreshToken() {
  refreshTokenCache = null;
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
}

export async function saveActiveShopId(shopId: string) {
  activeShopIdCache = shopId;
  await SecureStore.setItemAsync(ACTIVE_SHOP_ID_KEY, shopId);
}

export async function getActiveShopId() {
  if (activeShopIdCache !== undefined) {
    return activeShopIdCache;
  }

  activeShopIdCache = await SecureStore.getItemAsync(ACTIVE_SHOP_ID_KEY);
  return activeShopIdCache;
}

export async function clearActiveShopId() {
  activeShopIdCache = null;
  await SecureStore.deleteItemAsync(ACTIVE_SHOP_ID_KEY);
}

type AuthProfilePii = Pick<AuthProfile, "email" | "firstName" | "lastName" | "phoneNumber" | "displayName">;
type AuthProfileRest = Omit<AuthProfile, keyof AuthProfilePii>;

function splitAuthProfile(profile: AuthProfile): { pii: AuthProfilePii; rest: AuthProfileRest } {
  const { email, firstName, lastName, phoneNumber, displayName, ...rest } = profile;
  return { pii: { email, firstName, lastName, phoneNumber, displayName }, rest };
}

export async function saveAuthProfile(profile: AuthProfile) {
  authProfileCache = profile;
  const { pii, rest } = splitAuthProfile(profile);
  await SecureStore.setItemAsync(AUTH_PROFILE_PII_KEY, JSON.stringify(pii));
  await AsyncStorage.setItem(AUTH_PROFILE_REST_KEY, JSON.stringify(rest));
}

export async function getAuthProfile() {
  if (authProfileCache !== undefined) {
    return authProfileCache;
  }

  try {
    const [rawPii, rawRest] = await Promise.all([
      SecureStore.getItemAsync(AUTH_PROFILE_PII_KEY),
      AsyncStorage.getItem(AUTH_PROFILE_REST_KEY),
    ]);

    if (rawPii && rawRest) {
      const pii = JSON.parse(rawPii) as AuthProfilePii;
      const rest = JSON.parse(rawRest) as AuthProfileRest;
      authProfileCache = { ...rest, ...pii };
      return authProfileCache;
    }

    // One-time migration: a profile stored by an older app version still lives as a single
    // plaintext AsyncStorage blob. Move it to the split scheme and delete the old key.
    const legacyRaw = await AsyncStorage.getItem(LEGACY_AUTH_PROFILE_KEY);
    if (legacyRaw) {
      const legacyProfile = JSON.parse(legacyRaw) as AuthProfile;
      await saveAuthProfile(legacyProfile);
      await AsyncStorage.removeItem(LEGACY_AUTH_PROFILE_KEY);
      return authProfileCache ?? legacyProfile;
    }

    authProfileCache = null;
    return null;
  } catch {
    authProfileCache = null;
    return null;
  }
}

export async function clearAuthProfile() {
  authProfileCache = null;
  await Promise.all([
    SecureStore.deleteItemAsync(AUTH_PROFILE_PII_KEY),
    AsyncStorage.removeItem(AUTH_PROFILE_REST_KEY),
    // Defensive: also drop the legacy plaintext blob in case migration never ran.
    AsyncStorage.removeItem(LEGACY_AUTH_PROFILE_KEY),
  ]);
}
