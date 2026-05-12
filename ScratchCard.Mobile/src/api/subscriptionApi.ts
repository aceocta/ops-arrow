import { SubscriptionPlan, SubscriptionSummary } from "../types/models";
import { apiClient } from "./client";
import { ApiResponse } from "./types";

export async function listSubscriptionPlans() {
  const response = await apiClient.get<ApiResponse<SubscriptionPlan[]>>("/subscription/plans");
  return response.data.data;
}

export async function getSubscriptionSummary(companyId: string) {
  const response = await apiClient.get<ApiResponse<SubscriptionSummary>>("/subscription/summary", {
    params: { companyId },
  });
  return response.data.data;
}

export async function calculateSubscription(companyId: string, planId: string) {
  const response = await apiClient.post<ApiResponse<{
    planName: string;
    billingCycle: string;
    activeShopCount: number;
    pricePerShop: number;
    subTotalAmount: number;
    discountPercentage: number;
    discountAmount: number;
    totalAmount: number;
  }>>("/subscription/calculate", { companyId, planId });
  return response.data.data;
}

export async function selectSubscriptionPlan(companyId: string, planId: string) {
  const response = await apiClient.post<ApiResponse<SubscriptionSummary>>("/subscription/select-plan", { companyId, planId });
  return response.data.data;
}
