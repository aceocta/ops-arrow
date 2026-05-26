import { SubscriptionPlan } from "../types/models";
import { apiClient } from "./client";
import { ApiResponse } from "./types";

export async function listSubscriptionPlans() {
  const response = await apiClient.get<ApiResponse<SubscriptionPlan[]>>("/subscription/plans");
  return response.data.data;
}

// --- Shop-scoped subscription endpoints (per-shop subscription model) ---

export type ShopSubscriptionSummary = {
  shopId: string;
  companyId: string;
  shopSubscriptionId: string;
  subscriptionPlanId: string | null;
  planName: string;
  billingCycle: string;
  status: string;
  price: number;
  trialStartedOn: string | null;
  trialEndsOn: string | null;
  currentPeriodStartedOn: string | null;
  currentPeriodEndsOn: string | null;
  trialDaysRemaining: number | null;
  requiresBillingAction: boolean;
  includedFeatures: string[];
  maxUsers: number | null;
  reportExportsPerMonth: number | null;
};

export type ShopEntitlementsResponse = {
  shopId: string;
  companyId: string;
  tier: string | null;
  status: string;
  isActive: boolean;
  isInTrial: boolean;
  inGracePeriod: boolean;
  trialDaysRemaining: number | null;
  expiresAt: string | null;
  features: string[];
  maxUsers: number | null;
  reportExportsPerMonth: number | null;
};

export async function getShopSubscriptionSummary(shopId: string) {
  const response = await apiClient.get<ApiResponse<ShopSubscriptionSummary>>("/shop-subscription/summary", {
    params: { shopId },
  });
  return response.data.data;
}

export async function getShopEntitlements(shopId: string) {
  const response = await apiClient.get<ApiResponse<ShopEntitlementsResponse>>("/shop-subscription/entitlements", {
    params: { shopId },
  });
  return response.data.data;
}

export async function selectShopSubscriptionPlan(shopId: string, planId: string) {
  const response = await apiClient.post<ApiResponse<ShopSubscriptionSummary>>("/shop-subscription/select-plan", {
    shopId,
    planId,
  });
  return response.data.data;
}

export async function submitShopIapReceipt(payload: {
  shopId: string;
  platform: "ios" | "android";
  productId: string;
  transactionId: string;
  purchaseToken?: string;
  originalTransactionId?: string;
  receiptData?: string;
}) {
  const response = await apiClient.post<ApiResponse<ShopSubscriptionSummary>>("/shop-subscription/iap-receipt", payload);
  return response.data.data;
}

export async function cancelShopSubscription(shopId: string, cancelAtPeriodEnd: boolean) {
  const response = await apiClient.post<ApiResponse<ShopSubscriptionSummary>>("/shop-subscription/cancel", {
    shopId,
    cancelAtPeriodEnd,
  });
  return response.data.data;
}

export async function reactivateShopSubscription(shopId: string) {
  const response = await apiClient.post<ApiResponse<ShopSubscriptionSummary>>("/shop-subscription/reactivate", {
    shopId,
  });
  return response.data.data;
}

export async function createBillingCheckoutSession(shopId: string, planId: string) {
  const response = await apiClient.post<ApiResponse<{ url: string; provider: string }>>(
    "/shop-subscription/checkout-session",
    { shopId, planId }
  );
  return response.data.data;
}
