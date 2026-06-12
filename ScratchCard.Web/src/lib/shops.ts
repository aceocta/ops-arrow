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
};

export const shopsApi = {
  list: async (companyId?: string | null) =>
    unwrap<Shop[]>((await api.get("/shops", { params: { companyId: companyId ?? undefined } })).data),
  create: async (p: SaveShopPayload) => unwrap<Shop>((await api.post("/shops", p)).data),
  update: async (id: string, p: SaveShopPayload) => unwrap<Shop>((await api.put(`/shops/${id}`, p)).data),
};
