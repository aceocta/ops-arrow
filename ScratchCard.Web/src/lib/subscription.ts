import { api, unwrap } from "./api";

// Enums are serialized as strings by the API (JsonStringEnumConverter).
export type BillingCycle = "Trial" | "Monthly" | "Annual";
export type SubscriptionStatus =
  | "TrialActive"
  | "TrialExpired"
  | "Active"
  | "PastDue"
  | "PaymentFailed"
  | "Cancelled"
  | "Expired"
  | "Suspended";

export type SubscriptionPlan = {
  id: string;
  name: string;
  pricePerShop: number;
  billingCycle: BillingCycle;
  trialDays: number;
  description?: string | null;
  includedFeatures?: string[];
  maxUsers?: number | null;
  reportExportsPerMonth?: number | null;
  displayOrder: number;
  isActive: boolean;
};

// Mirrors ShopSubscriptionSummaryDto.
export type ShopSubscriptionSummary = {
  shopId: string;
  companyId: string;
  shopSubscriptionId: string;
  subscriptionPlanId?: string | null;
  planName: string;
  billingCycle: BillingCycle;
  status: SubscriptionStatus;
  price: number;
  trialStartedOn?: string | null;
  trialEndsOn?: string | null;
  currentPeriodStartedOn?: string | null;
  currentPeriodEndsOn?: string | null;
  trialDaysRemaining?: number | null;
  requiresBillingAction: boolean;
  includedFeatures: string[];
  maxUsers?: number | null;
  reportExportsPerMonth?: number | null;
  /** Set while Status = Suspended (paused). */
  pausedOn?: string | null;
  /** Days before a paused shop is auto-cancelled (1-year cap). Null when not paused. */
  pauseDaysRemaining?: number | null;
};

/** Stripe redirect payload ({ url, provider }) from checkout-session / portal-session. */
export type BillingRedirect = { url: string; provider: string };

export const subscriptionApi = {
  plans: async () => unwrap<SubscriptionPlan[]>((await api.get("/subscription/plans")).data),
  shopSummary: async (shopId: string) =>
    unwrap<ShopSubscriptionSummary>((await api.get("/shop-subscription/summary", { params: { shopId } })).data),
  // Records the plan choice locally and returns the updated summary. Paid plans are only
  // activated once Stripe checkout completes — call checkoutSession() next and redirect.
  selectPlan: async (shopId: string, planId: string) =>
    unwrap<ShopSubscriptionSummary & { checkoutUrl?: string }>(
      (await api.post("/shop-subscription/select-plan", { shopId, planId })).data,
    ),
  // Stripe Checkout Session for a paid plan — send the browser to the returned url.
  checkoutSession: async (shopId: string, planId: string) =>
    unwrap<BillingRedirect>((await api.post("/shop-subscription/checkout-session", { shopId, planId })).data),
  // Stripe Customer Portal (update card, view invoices, manage subscriptions) — redirect to url.
  portalSession: async (shopId: string) =>
    unwrap<BillingRedirect>((await api.post("/shop-subscription/portal-session", { shopId })).data),
  pause: async (shopId: string) =>
    unwrap<ShopSubscriptionSummary>((await api.post("/shop-subscription/pause", { shopId })).data),
  // 409 code "subscription_expired" when the paused Stripe subscription was auto-cancelled.
  resume: async (shopId: string) =>
    unwrap<ShopSubscriptionSummary>((await api.post("/shop-subscription/resume", { shopId })).data),
  cancel: async (shopId: string, cancelAtPeriodEnd = true) =>
    unwrap<ShopSubscriptionSummary>(
      (await api.post("/shop-subscription/cancel", { shopId, cancelAtPeriodEnd })).data,
    ),
  reactivate: async (shopId: string) =>
    unwrap<ShopSubscriptionSummary>((await api.post("/shop-subscription/reactivate", { shopId })).data),
  // Re-pulls the subscription from Stripe — recovery when a webhook was missed or the user
  // just finished checkout and local state hasn't caught up yet.
  refreshFromProvider: async (shopId: string) =>
    unwrap<ShopSubscriptionSummary>((await api.post("/shop-subscription/refresh-from-provider", { shopId })).data),
};
