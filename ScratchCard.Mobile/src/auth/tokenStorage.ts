import * as SecureStore from "expo-secure-store";

const ACCESS_TOKEN_KEY = "scratchcard_access_token";
const ACTIVE_SHOP_ID_KEY = "scratchcard_active_shop_id";
let accessTokenCache: string | null | undefined;
let activeShopIdCache: string | null | undefined;

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
