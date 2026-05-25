import { submitShopIapReceipt, ShopSubscriptionSummary } from "../../api/subscriptionApi";
import { reportError } from "../../utils/crashReporter";
import { track } from "../../utils/analytics";

export type PurchaseReceipt = {
  platform: "ios" | "android";
  productId: string;
  transactionId: string;
  purchaseToken?: string;
  originalTransactionId?: string;
  receiptData?: string;
};

export type SubmitReceiptResult = {
  ok: boolean;
  summary?: ShopSubscriptionSummary;
  message?: string;
};

export async function submitPurchaseReceipt(shopId: string, receipt: PurchaseReceipt): Promise<SubmitReceiptResult> {
  try {
    const summary = await submitShopIapReceipt({ shopId, ...receipt });
    track("purchase_completed", { shopId, productId: receipt.productId, platform: receipt.platform });
    return { ok: true, summary };
  } catch (error: any) {
    reportError(error, { phase: "submit-purchase-receipt", productId: receipt.productId, shopId });
    track("purchase_failed", { productId: receipt.productId, reason: error?.response?.data?.message ?? error?.message });
    return { ok: false, message: error?.response?.data?.message ?? "Unable to validate purchase. Please contact support." };
  }
}

import { Platform } from "react-native";

type IapModule = {
  initConnection?: () => Promise<unknown>;
  endConnection?: () => Promise<unknown>;
  getSubscriptions?: (skus: string[]) => Promise<unknown>;
  requestSubscription?: (request: { sku: string }) => Promise<any>;
  finishTransaction?: (args: { purchase: any; isConsumable?: boolean }) => Promise<unknown>;
  getAvailablePurchases?: () => Promise<any[]>;
};

let iapModule: IapModule | null = null;
try {
  iapModule = require("react-native-iap") as IapModule;
} catch {
  iapModule = null;
}

export const isIapAvailable = () => Boolean(iapModule?.initConnection && iapModule?.requestSubscription);

/**
 * Trigger an in-app purchase for the given product ID and then send the resulting receipt to
 * the backend for verification. The backend resolves the product ID to a SubscriptionPlan and
 * activates the shop's subscription.
 *
 * Returns a friendly message describing the result.
 *
 * TODO before launch:
 *   - Install `react-native-iap` (`npm install react-native-iap`) and run the native build.
 *   - Make sure the App Store Connect / Google Play product IDs match the ones in the SubscriptionPlan rows.
 *   - Wire receipt verification on the backend (replace NoopIapReceiptVerifier).
 */
export async function purchaseSubscription(args: {
  shopId: string;
  appleProductId?: string | null;
  googleProductId?: string | null;
}): Promise<SubmitReceiptResult> {
  if (!isIapAvailable() || !iapModule?.requestSubscription) {
    return { ok: false, message: "In-app purchase is not available in this build." };
  }

  const productId = Platform.OS === "ios" ? args.appleProductId : args.googleProductId;
  if (!productId) {
    return { ok: false, message: "This plan has no store product ID configured. Contact support." };
  }

  try {
    await iapModule.initConnection?.();
    const purchase = await iapModule.requestSubscription({ sku: productId });
    if (!purchase) {
      return { ok: false, message: "Purchase was not completed." };
    }

    const receipt: PurchaseReceipt = {
      platform: Platform.OS === "ios" ? "ios" : "android",
      productId,
      transactionId: purchase.transactionId ?? purchase.purchaseToken,
      purchaseToken: purchase.purchaseToken,
      originalTransactionId: purchase.originalTransactionIdentifierIOS ?? purchase.originalTransactionId,
      receiptData: purchase.transactionReceipt,
    };

    const result = await submitPurchaseReceipt(args.shopId, receipt);
    if (result.ok) {
      try {
        await iapModule.finishTransaction?.({ purchase, isConsumable: false });
      } catch {
        // best-effort
      }
    }
    return result;
  } catch (error: any) {
    reportError(error, { phase: "purchase-subscription", productId, shopId: args.shopId });
    return { ok: false, message: error?.message ?? "Purchase failed." };
  } finally {
    try { await iapModule.endConnection?.(); } catch { /* ignore */ }
  }
}

export async function restorePurchases(shopId: string): Promise<SubmitReceiptResult> {
  if (!isIapAvailable() || !iapModule?.getAvailablePurchases) {
    return {
      ok: false,
      message: "In-app purchase is not available in this build. Restore from your store account is required.",
    };
  }

  try {
    await iapModule.initConnection?.();
    const purchases = (await iapModule.getAvailablePurchases?.()) ?? [];
    if (purchases.length === 0) {
      return { ok: false, message: "No previous purchases found on this account." };
    }

    const latest = purchases[purchases.length - 1];
    const receipt: PurchaseReceipt = {
      platform: latest.transactionReceipt ? "ios" : "android",
      productId: latest.productId,
      transactionId: latest.transactionId ?? latest.purchaseToken,
      purchaseToken: latest.purchaseToken,
      originalTransactionId: latest.originalTransactionIdentifierIOS ?? latest.originalTransactionId,
      receiptData: latest.transactionReceipt,
    };
    const result = await submitPurchaseReceipt(shopId, receipt);
    if (result.ok) {
      track("purchase_restored", { shopId, productId: receipt.productId });
    }
    return result;
  } catch (error: any) {
    reportError(error, { phase: "restore-purchases", shopId });
    return { ok: false, message: error?.message ?? "Unable to restore purchases." };
  } finally {
    try {
      await iapModule.endConnection?.();
    } catch {
      // ignore
    }
  }
}
