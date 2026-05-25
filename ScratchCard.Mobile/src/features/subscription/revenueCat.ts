import { Platform } from "react-native";
import Constants from "expo-constants";
import { reportError } from "../../utils/crashReporter";

/**
 * RevenueCat integration for per-shop subscriptions.
 *
 * Setup checklist:
 *   1. `npm install react-native-purchases` (already in package.json) then rebuild the native shell.
 *   2. Configure App Store / Play products with the IDs in SubscriptionPlan.AppleProductId /
 *      .GoogleProductId on the backend, and link them to RevenueCat Offerings.
 *   3. Provide platform-specific public SDK keys via env:
 *        EXPO_PUBLIC_REVENUECAT_IOS_KEY
 *        EXPO_PUBLIC_REVENUECAT_ANDROID_KEY
 *   4. In the RevenueCat dashboard, point the webhook to
 *        POST {API_BASE_URL}/api/shop-subscription/revenuecat-webhook
 *      with an Authorization header equal to RevenueCat:WebhookAuthorization on the backend.
 *
 * In Expo Go (no native module) or when keys are missing, all functions resolve to safe no-ops.
 */

type PurchasesOffering = {
  identifier: string;
  availablePackages: Array<{
    identifier: string;
    product: { identifier: string; priceString: string; title: string };
  }>;
};

type CustomerInfo = {
  originalAppUserId: string;
  entitlements: { active: Record<string, { productIdentifier: string; expirationDate: string | null }> };
};

type PurchaseSuccess = {
  customerInfo: CustomerInfo;
  productIdentifier: string;
  transaction: { transactionIdentifier?: string; purchaseToken?: string; originalTransactionIdentifier?: string };
};

type PurchasesModule = {
  configure: (opts: { apiKey: string; appUserID?: string }) => void;
  logIn: (appUserId: string) => Promise<{ customerInfo: CustomerInfo; created: boolean }>;
  logOut: () => Promise<{ customerInfo: CustomerInfo }>;
  getOfferings: () => Promise<{ current: PurchasesOffering | null; all: Record<string, PurchasesOffering> }>;
  purchaseProduct: (productId: string) => Promise<PurchaseSuccess>;
  purchasePackage: (pkg: any) => Promise<PurchaseSuccess>;
  restorePurchases: () => Promise<CustomerInfo>;
  syncPurchases: () => Promise<void>;
  getCustomerInfo: () => Promise<CustomerInfo>;
};

let mod: PurchasesModule | null = null;
try {
  // Dynamic require so the bundle still works without the native module (Expo Go etc).
  mod = (require("react-native-purchases") as { default: PurchasesModule }).default;
} catch {
  mod = null;
}

let isConfigured = false;
let currentShopId: string | null = null;

function resolveApiKey(): string | null {
  const fromEnv = Platform.OS === "ios"
    ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY
    : process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;
  if (fromEnv && fromEnv.length > 0) return fromEnv;

  const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, unknown>;
  const fromExtra = Platform.OS === "ios" ? extra.revenueCatIosKey : extra.revenueCatAndroidKey;
  return typeof fromExtra === "string" && fromExtra.length > 0 ? fromExtra : null;
}

export function isRevenueCatAvailable() {
  return Boolean(mod && resolveApiKey());
}

/**
 * Configure the SDK once on app start. Safe to call multiple times.
 */
export function configureRevenueCat(initialShopId?: string | null) {
  if (!mod || isConfigured) return;
  const apiKey = resolveApiKey();
  if (!apiKey) {
    return;
  }
  try {
    mod.configure({ apiKey, appUserID: initialShopId ?? undefined });
    isConfigured = true;
    currentShopId = initialShopId ?? null;
  } catch (error) {
    reportError(error, { phase: "revenuecat-configure" });
  }
}

/**
 * Tell RevenueCat which shop the user is currently acting on. Must be called whenever the
 * active shop changes — RevenueCat keys all subscriber state by this appUserId.
 */
export async function setActiveShop(shopId: string | null) {
  if (!isRevenueCatAvailable() || !mod) return;
  if (!isConfigured) {
    configureRevenueCat(shopId);
    return;
  }
  if (shopId === currentShopId) return;

  try {
    if (shopId) {
      await mod.logIn(shopId);
    } else {
      await mod.logOut();
    }
    currentShopId = shopId;
  } catch (error) {
    reportError(error, { phase: "revenuecat-login", shopId });
  }
}

export async function purchaseProduct(productId: string) {
  if (!isRevenueCatAvailable() || !mod) {
    return { ok: false as const, message: "RevenueCat is not available in this build." };
  }
  try {
    const result = await mod.purchaseProduct(productId);
    return {
      ok: true as const,
      productId: result.productIdentifier,
      transactionId: result.transaction?.transactionIdentifier ?? result.transaction?.purchaseToken ?? "",
      originalTransactionId: result.transaction?.originalTransactionIdentifier ?? null,
      purchaseToken: result.transaction?.purchaseToken ?? null,
      appUserId: result.customerInfo.originalAppUserId,
    };
  } catch (error: any) {
    if (error?.userCancelled) {
      return { ok: false as const, cancelled: true, message: "Purchase cancelled." };
    }
    reportError(error, { phase: "revenuecat-purchase", productId });
    return { ok: false as const, message: error?.message ?? "Purchase failed." };
  }
}

export async function restoreCustomer() {
  if (!isRevenueCatAvailable() || !mod) {
    return { ok: false as const, message: "RevenueCat is not available in this build." };
  }
  try {
    const info = await mod.restorePurchases();
    return {
      ok: true as const,
      appUserId: info.originalAppUserId,
      hasActiveEntitlements: Object.keys(info.entitlements?.active ?? {}).length > 0,
    };
  } catch (error: any) {
    reportError(error, { phase: "revenuecat-restore" });
    return { ok: false as const, message: error?.message ?? "Restore failed." };
  }
}
