import { apiClient } from "./client";
import type { ApiResponse, SubscriptionPlan } from "../types";

export async function listPlans() {
  const res = await apiClient.get<ApiResponse<SubscriptionPlan[]>>("/subscription/plans");
  return res.data.data;
}
