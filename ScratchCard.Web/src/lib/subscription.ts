import { api, unwrap } from "./api";

export type SubscriptionPlan = {
  id: string;
  name: string;
  pricePerShop: number;
  billingCycle: number;
  trialDays: number;
  description?: string;
  displayOrder: number;
  isActive: boolean;
};

export const subscriptionApi = {
  plans: async () => unwrap<SubscriptionPlan[]>((await api.get("/subscription/plans")).data),
  shopSummary: async (shopId: string) =>
    unwrap<{ subscriptionPlanId?: string | null; planName: string }>(
      (await api.get("/shop-subscription/summary", { params: { shopId } })).data,
    ),
  // Returns the updated summary, or a billing payload (e.g. { checkoutUrl }) for paid plans.
  selectPlan: async (shopId: string, planId: string) =>
    unwrap<any>((await api.post("/shop-subscription/select-plan", { shopId, planId })).data),
};
