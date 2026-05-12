import { apiClient } from "./client";
import { ApiResponse } from "./types";
import { Shop } from "../types/models";

export type CreateShopPayload = {
  companyId?: string;
  companyName?: string;
  shopName: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  postCode: string;
  country: string;
};

export type UpdateShopPayload = CreateShopPayload & {
  isActive: boolean;
};

export async function listShops(companyId?: string) {
  const response = await apiClient.get<ApiResponse<Shop[]>>("/shops", {
    params: companyId ? { companyId } : undefined,
  });
  return response.data.data;
}

export async function getShop(shopId: string) {
  const response = await apiClient.get<ApiResponse<Shop>>(`/shops/${shopId}`);
  return response.data.data;
}

export async function createShop(payload: CreateShopPayload) {
  const response = await apiClient.post<ApiResponse<Shop>>("/shops", payload);
  return response.data.data;
}

export async function updateShop(shopId: string, payload: UpdateShopPayload) {
  const response = await apiClient.put<ApiResponse<Shop>>(`/shops/${shopId}`, payload);
  return response.data.data;
}
