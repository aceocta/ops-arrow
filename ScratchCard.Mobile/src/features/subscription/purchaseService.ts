import { Platform } from "react-native";
import { submitShopIapReceipt, ShopSubscriptionSummary } from "../../api/subscriptionApi";
import { reportError } from "../../utils/crashReporter";
import { track } from "../../utils/analytics";
import {
  isRevenueCatAvailable,
  purchaseProduct as rcPurchaseProduct,
  restoreCustomer as rcRestoreCustomer,
} from "./revenueCat";

/**
 * Purchase / restore subscription flow.
 *
 * RevenueCat is the source of truth — it handles the App Store / Play purchase, then notifies
 * our backend via webhook. We additionally send the receipt synchronously via
 * /api/shop-subscription/iap-receipt for immediate UI feedback (the backend `IIapReceiptVerifier`
 * is implemented by `RevenueCatReceiptVerifier`, so it consults RevenueCat for current
 * entitlement state regardless of which path arrives first).
 */

export type SubmitReceiptResult = {
  ok: boolean;
  summary?: ShopSubscriptionSummary;
  message?: string;
  cancelled?: boolean;
};

export const isIapAvailable = isRevenueCatAvailable;

/**
 * Trigger a purchase for the given product ID, then send the receipt to the backend.
 * Use this from the paywall after the user selects a plan card.
 */
export async function purchaseSubscription(args: {
  shopId: string;
  appleProductId?: string | null;
  googleProductId?: string | null;
}): Promise<SubmitReceiptResult> {
  const productId = Platform.OS === "ios" ? args.appleProductId : args.googleProductId;
  if (!productId) {
    return { ok: false, message: "This plan has no store product ID configured. Contact support." };
  }

  const purchase = await rcPurchaseProduct(productId);
  if (!purchase.ok) {
    if (purchase.cancelled) {
      track("purchase_cancelled", { productId, shopId: args.shopId });
    } else {
      track("purchase_failed", { productId, reason: purchase.message });
    }
    return { ok: false, message: purchase.message, cancelled: purchase.cancelled };
  }

  try {
    const summary = await submitShopIapReceipt({
      shopId: args.shopId,
      platform: Platform.OS === "ios" ? "ios" : "android",
      productId: purchase.productId,
      transactionId: purchase.transactionId,
      purchaseToken: purchase.purchaseToken ?? undefined,
      originalTransactionId: purchase.originalTransactionId ?? undefined,
      // RevenueCat keys the subscriber by appUserId (= shopId); pass it so the backend can query
      // the verifier even if transactionId rotates between stores.
      receiptData: purchase.appUserId,
    });
    track("purchase_completed", { productId: purchase.productId, platform: Platform.OS, shopId: args.shopId });
    return { ok: true, summary };
  } catch (error: any) {
    reportError(error, { phase: "submit-receipt", productId: purchase.productId, shopId: args.shopId });
    track("purchase_failed", { productId: purchase.productId, reason: error?.response?.data?.message ?? error?.message });
    return { ok: false, message: error?.response?.data?.message ?? "Unable to validate purchase." };
  }
}

export async function restorePurchases(shopId: string): Promise<SubmitReceiptResult> {
  const result = await rcRestoreCustomer();
  if (!result.ok) {
    return { ok: false, message: result.message };
  }

  if (!result.hasActiveEntitlements) {
    return { ok: false, message: "No previous purchases found on this account." };
  }

  // RevenueCat already syncs the receipt to its servers on restore — the webhook will follow,
  // but we also call submit so the UI updates immediately.
  try {
    const summary = await submitShopIapReceipt({
      shopId,
      platform: Platform.OS === "ios" ? "ios" : "android",
      productId: "restored",
      transactionId: result.appUserId,
      receiptData: result.appUserId,
    });
    track("purchase_restored", { shopId });
    return { ok: true, summary };
  } catch (error: any) {
    reportError(error, { phase: "restore-submit", shopId });
    return { ok: false, message: error?.response?.data?.message ?? "Unable to refresh subscription after restore." };
  }
}

// Direct receipt submission, used by tests or back-channels. Most callers should use
// purchaseSubscription / restorePurchases above.
export async function submitPurchaseReceipt(shopId: string, receipt: {
  platform: "ios" | "android";
  productId: string;
  transactionId: string;
  purchaseToken?: string;
  originalTransactionId?: string;
  receiptData?: string;
}): Promise<SubmitReceiptResult> {
  try {
    const summary = await submitShopIapReceipt({ shopId, ...receipt });
    return { ok: true, summary };
  } catch (error: any) {
    reportError(error, { phase: "submit-receipt-direct", shopId });
    return { ok: false, message: error?.response?.data?.message ?? "Submit failed." };
  }
}
