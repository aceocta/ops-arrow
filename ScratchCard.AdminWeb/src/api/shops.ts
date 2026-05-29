import { apiClient } from "./client";
import type { AdminShopListItem, ApiResponse, PagedResult } from "../types";

export async function listShops(search: string, page: number, pageSize: number) {
  const res = await apiClient.get<ApiResponse<PagedResult<AdminShopListItem>>>("/admin/shops", {
    params: { search: search || undefined, page, pageSize },
  });
  return res.data.data;
}

export interface CreateShopRequest {
  companyId: string;
  shopName: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  postCode: string;
  country: string;
  subscriptionPlanId?: string;
}

// PlatformAdmin creates a shop for a customer. The API attaches the customer's company owner
// (not the admin) and starts a trial.
export async function createShop(payload: CreateShopRequest) {
  const res = await apiClient.post<ApiResponse<unknown>>("/shops", payload);
  return res.data.data;
}
