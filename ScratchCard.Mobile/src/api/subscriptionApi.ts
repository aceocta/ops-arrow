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
  // Pause metadata. PausedOn is null unless status === "Suspended".
  // PauseDaysRemaining counts down to the 1-year auto-cancel; renders the heads-up banner once
  // it crosses ~30.
  pausedOn: string | null;
  pauseDaysRemaining: number | null;
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

// Pauses a shop's subscription. Stripe stops collecting (invoices marked uncollectible during
// pause). Shop becomes read-only. Owner can resume any time within 1 year.
export async function pauseShopSubscription(shopId: string) {
  const response = await apiClient.post<ApiResponse<ShopSubscriptionSummary>>("/shop-subscription/pause", {
    shopId,
  });
  return response.data.data;
}

// Resumes a paused shop. Throws with a structured error (status 409, code "subscription_expired")
// if the Stripe subscription was auto-cancelled — callers should route the user to Choose Plan.
export async function resumeShopSubscription(shopId: string) {
  const response = await apiClient.post<ApiResponse<ShopSubscriptionSummary>>("/shop-subscription/resume", {
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

// Forces the backend to re-pull the shop's subscription state from Stripe directly. Used by
// the "Refresh subscription status" link as a recovery path when a webhook was missed (or the
// user just completed checkout in the external browser and the entitlement isn't yet active).
export async function refreshShopSubscriptionFromProvider(shopId: string) {
  const response = await apiClient.post<ApiResponse<ShopSubscriptionSummary>>(
    "/shop-subscription/refresh-from-provider",
    { shopId }
  );
  return response.data.data;
}

// Idempotently creates the initial trial row for a shop. Pure GET on summary will no longer
// auto-create a trial, so any flow that needs one (shop create, plan picker) calls this
// explicitly.
export async function ensureShopTrial(shopId: string, intendedPlanId?: string) {
  const response = await apiClient.post<ApiResponse<ShopSubscriptionSummary>>(
    "/shop-subscription/ensure-trial",
    { shopId, intendedPlanId }
  );
  return response.data.data;
}

// Returns a Stripe Customer Portal URL the mobile app can open in the external browser so the
// company owner can manage cards, cancel any of their shop subscriptions, and view invoices —
// all under their single company-level Stripe Customer.
export async function createBillingPortalSession(shopId: string) {
  const response = await apiClient.post<ApiResponse<{ url: string; provider: string }>>(
    "/shop-subscription/portal-session",
    { shopId }
  );
  return response.data.data;
}
