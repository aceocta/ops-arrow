import { apiClient } from "./client";
import { ApiResponse } from "./types";
import { Shop } from "../types/models";
import { SellingOrder } from "../types/enums";

export type CreateShopPayload = {
  companyId?: string;
  companyName?: string;
  subscriptionPlanId?: string;
  shopName: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  postCode: string;
  country: string;
  scratchCardDisplayCount?: number;
  packSellingOrder?: SellingOrder;
  /** Day the shop's week starts on (0 = Sunday … 6 = Saturday). Omitted on update = unchanged. */
  weekStartDay?: number;
  shiftTemplates?: { name: string; startTime: string; endTime: string }[];
  temperatureCheckTimes?: { label: string; time: string; toleranceMinutes?: number }[];
  /** Modules to start DISABLED for the new shop — the inverse of the owner's feature selection.
   *  Omit to fall back to the platform default-disabled set. */
  disabledFeatureKeys?: string[];
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

export type ShopFeatureModule = {
  key: string;
  name: string;
  description?: string | null;
  isAvailableInPlan: boolean;
  isDisabledByShop: boolean;
};

export type ShopFeatureToggles = {
  shopId: string;
  modules: ShopFeatureModule[];
};

export async function getShopFeatureToggles(shopId: string) {
  const response = await apiClient.get<ApiResponse<ShopFeatureToggles>>(`/shops/${shopId}/feature-toggles`);
  return response.data.data;
}

export async function updateShopFeatureToggles(shopId: string, disabledFeatureKeys: string[]) {
  const response = await apiClient.put<ApiResponse<ShopFeatureToggles>>(
    `/shops/${shopId}/feature-toggles`,
    { disabledFeatureKeys }
  );
  return response.data.data;
}

/**
 * Toggleable feature modules for a prospective subscription plan, used by the shop-creation
 * feature-selection step before a shop exists. `isAvailableInPlan` is false for modules the plan
 * doesn't include (lock them); `isDisabledByShop` carries the default OFF state for a new shop.
 * Pass no planId to treat every module as available.
 */
export async function getShopFeatureModulesForPlan(planId?: string) {
  const response = await apiClient.get<ApiResponse<ShopFeatureToggles>>("/shops/feature-modules", {
    params: planId ? { planId } : undefined,
  });
  return response.data.data;
}
