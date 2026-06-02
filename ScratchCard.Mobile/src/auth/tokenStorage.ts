import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { AuthProfile } from "../types/models";

const ACCESS_TOKEN_KEY = "scratchcard_access_token";
const REFRESH_TOKEN_KEY = "scratchcard_refresh_token";
const ACTIVE_SHOP_ID_KEY = "scratchcard_active_shop_id";
const AUTH_PROFILE_KEY = "scratchcard_auth_profile";
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

export async function saveAuthProfile(profile: AuthProfile) {
  authProfileCache = profile;
  await AsyncStorage.setItem(AUTH_PROFILE_KEY, JSON.stringify(profile));
}

export async function getAuthProfile() {
  if (authProfileCache !== undefined) {
    return authProfileCache;
  }

  try {
    const rawProfile = await AsyncStorage.getItem(AUTH_PROFILE_KEY);
    if (!rawProfile) {
      authProfileCache = null;
      return null;
    }

    authProfileCache = JSON.parse(rawProfile) as AuthProfile;
    return authProfileCache;
  } catch {
    authProfileCache = null;
    return null;
  }
}

export async function clearAuthProfile() {
  authProfileCache = null;
  await AsyncStorage.removeItem(AUTH_PROFILE_KEY);
}
