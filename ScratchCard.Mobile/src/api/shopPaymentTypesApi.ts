import { apiClient } from "./client";
import { ApiResponse } from "./types";
import { ShopPaymentType } from "../types/models";

export async function listShopPaymentTypes(shopId: string, includeInactive = false) {
  const response = await apiClient.get<ApiResponse<ShopPaymentType[]>>("/shop-payment-types", {
    params: { shopId, includeInactive },
  });
  return response.data.data;
}

export async function createShopPaymentType(input: {
  shopId: string;
  name: string;
  code?: string;
  keywords?: string;
  sortOrder?: number;
}) {
  const response = await apiClient.post<ApiResponse<ShopPaymentType>>("/shop-payment-types", {
    shopId: input.shopId,
    name: input.name,
    code: input.code,
    keywords: input.keywords,
    sortOrder: input.sortOrder ?? 0,
  });
  return response.data.data;
}

export async function updateShopPaymentType(id: string, input: {
  name: string;
  code?: string;
  keywords?: string;
  sortOrder?: number;
  isActive: boolean;
}) {
  const response = await apiClient.put<ApiResponse<ShopPaymentType>>(`/shop-payment-types/${id}`, {
    name: input.name,
    code: input.code,
    keywords: input.keywords,
    sortOrder: input.sortOrder ?? 0,
    isActive: input.isActive,
  });
  return response.data.data;
}

export async function deleteShopPaymentType(id: string) {
  await apiClient.delete(`/shop-payment-types/${id}`);
}

export async function seedShopPaymentTypeDefaults(shopId: string) {
  const response = await apiClient.post<ApiResponse<ShopPaymentType[]>>(
    "/shop-payment-types/seed-defaults",
    null,
    { params: { shopId } },
  );
  return response.data.data;
}
