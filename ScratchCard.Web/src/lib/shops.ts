import { api, unwrap } from "./api";

export type Shop = {
  id: string;
  companyId?: string | null;
  companyName?: string | null;
  shopName: string;
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  postCode: string;
  country: string;
  isActive: boolean;
  /** First day of the rota week: 0=Sunday … 6=Saturday (default 1 = Monday). */
  weekStartDay?: number;
};

export type SaveShopPayload = {
  companyId?: string | null;
  subscriptionPlanId?: string;
  shopName: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  postCode: string;
  country: string;
  isActive?: boolean;
  weekStartDay?: number;
  /** Modules to start DISABLED for a new shop — the inverse of the owner's feature selection. */
  disabledFeatureKeys?: string[];
};

// Mirrors ShopFeatureModuleDto / ShopFeatureTogglesDto on the backend.
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

export const shopsApi = {
  list: async (companyId?: string | null) =>
    unwrap<Shop[]>((await api.get("/shops", { params: { companyId: companyId ?? undefined } })).data),
  create: async (p: SaveShopPayload) => unwrap<Shop>((await api.post("/shops", p)).data),
  update: async (id: string, p: SaveShopPayload) => unwrap<Shop>((await api.put(`/shops/${id}`, p)).data),
  // Per-shop module toggles (post-create editor). The list is the inverse — modules to disable.
  featureToggles: async (shopId: string) =>
    unwrap<ShopFeatureToggles>((await api.get(`/shops/${shopId}/feature-toggles`)).data),
  updateFeatureToggles: async (shopId: string, disabledFeatureKeys: string[]) =>
    unwrap<ShopFeatureToggles>((await api.put(`/shops/${shopId}/feature-toggles`, { disabledFeatureKeys })).data),
  // Toggleable modules for a prospective plan, used by the shop-creation feature selector (before a
  // shop exists). Modules not in the plan come back isAvailableInPlan=false so the UI can lock them.
  featureModulesForPlan: async (planId?: string) =>
    unwrap<ShopFeatureToggles>((await api.get("/shops/feature-modules", { params: { planId: planId || undefined } })).data),
};
