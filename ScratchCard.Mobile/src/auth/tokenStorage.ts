import * as SecureStore from "expo-secure-store";

const ACCESS_TOKEN_KEY = "scratchcard_access_token";
const ACTIVE_SHOP_ID_KEY = "scratchcard_active_shop_id";

export async function saveAccessToken(token: string) {
  await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, token);
}

export async function getAccessToken() {
  return SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
}

export async function clearAccessToken() {
  await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
}

export async function saveActiveShopId(shopId: string) {
  await SecureStore.setItemAsync(ACTIVE_SHOP_ID_KEY, shopId);
}

export async function getActiveShopId() {
  return SecureStore.getItemAsync(ACTIVE_SHOP_ID_KEY);
}

export async function clearActiveShopId() {
  await SecureStore.deleteItemAsync(ACTIVE_SHOP_ID_KEY);
}
