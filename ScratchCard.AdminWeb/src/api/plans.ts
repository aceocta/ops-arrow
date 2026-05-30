import { apiClient } from "./client";
import type {
  ApiResponse,
  Feature,
  SubscriptionPlan,
  SubscriptionPlanFeature,
  UpsertPlanFeatureRequest,
} from "../types";

// Admin catalogue view — includes inactive plans with full config (unlike /subscription/plans,
// which is the customer-facing active list).
export async function listAdminPlans() {
  const res = await apiClient.get<ApiResponse<SubscriptionPlan[]>>("/admin/subscription-plans");
  return res.data.data;
}

export async function listFeatures(includeInactive = false) {
  const res = await apiClient.get<ApiResponse<Feature[]>>("/admin/features", {
    params: { includeInactive: includeInactive || undefined },
  });
  return res.data.data;
}

export async function listPlanFeatures(planId: string) {
  const res = await apiClient.get<ApiResponse<SubscriptionPlanFeature[]>>(
    `/admin/subscription-plans/${planId}/features`
  );
  return res.data.data;
}

// Full replacement: any feature not in `features` is removed from the plan. Used by the Save
// button on the plan feature editor.
export async function setPlanFeatures(planId: string, features: UpsertPlanFeatureRequest[]) {
  const res = await apiClient.post<ApiResponse<SubscriptionPlanFeature[]>>(
    `/admin/subscription-plans/${planId}/features:set`,
    { features }
  );
  return res.data.data;
}
