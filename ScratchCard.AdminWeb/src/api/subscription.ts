import { apiClient } from "./client";
import type { ApiResponse, SubscriptionPlan } from "../types";

export async function listPlans() {
  const res = await apiClient.get<ApiResponse<SubscriptionPlan[]>>("/subscription/plans");
  return res.data.data;
}

// Company-level (legacy) subscription actions — PlatformAdmin-gated on the API.
export async function selectPlan(companyId: string, planId: string) {
  const res = await apiClient.post<ApiResponse<unknown>>("/subscription/select-plan", { companyId, planId });
  return res.data.data;
}

export async function cancelSubscription(companyId: string, cancelAtPeriodEnd = true) {
  const res = await apiClient.post<ApiResponse<unknown>>("/subscription/cancel", { companyId, cancelAtPeriodEnd });
  return res.data.data;
}

export async function reactivateSubscription(companyId: string) {
  const res = await apiClient.post<ApiResponse<unknown>>("/subscription/reactivate", { companyId });
  return res.data.data;
}
