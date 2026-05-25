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

type IapModule = {
  initConnection?: () => Promise<unknown>;
  endConnection?: () => Promise<unknown>;
  getSubscriptions?: (skus: string[]) => Promise<unknown>;
  requestSubscription?: (request: { sku: string }) => Promise<unknown>;
  getAvailablePurchases?: () => Promise<any[]>;
};

let iapModule: IapModule | null = null;
try {
  iapModule = require("react-native-iap") as IapModule;
} catch {
  iapModule = null;
}

export const isIapAvailable = () => Boolean(iapModule?.initConnection && iapModule?.requestSubscription);

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
