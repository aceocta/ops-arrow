import { api, unwrap } from "./api";

// A reconciliation group (section). Built-ins (shopId null) are read-only; custom ones belong to a shop.
export type TillGroup = {
  id: string;
  shopId?: string | null;
  code: string;
  displayName: string;
  sortOrder: number;
  isActive: boolean;
  isBuiltIn: boolean;
};

export type TillFieldRow = { code: string; displayName: string; groupCode: string; groupName: string; isBuiltIn: boolean };

export type TillFieldOverride = {
  id: string;
  shopId: string;
  canonicalField: string;
  fieldName: string;
  groupCode?: string | null;
  defaultGroupCode: string;
};

export const tillGroupsApi = {
  list: async (shopId: string) =>
    unwrap<TillGroup[]>((await api.get("/till-groups", { params: { shopId } })).data),
  create: async (shopId: string, displayName: string) =>
    unwrap<TillGroup>((await api.post("/till-groups", { shopId, displayName })).data),
  update: async (g: { id: string; displayName: string; sortOrder: number; isActive?: boolean }) =>
    unwrap<TillGroup>((await api.put("/till-groups", { isActive: true, ...g })).data),
  remove: async (id: string) => { await api.delete(`/till-groups/${id}`); },

  // Active catalogue fields (flat) — built-ins + this shop's custom fields.
  listFields: async (shopId: string) =>
    unwrap<TillFieldRow[]>((await api.get("/till-fields", { params: { shopId } })).data),

  // Per-shop field → group assignment (writes a TillFieldOverride.GroupCode).
  listOverrides: async (shopId: string) =>
    unwrap<TillFieldOverride[]>((await api.get("/till-field-overrides", { params: { shopId } })).data),
  assignField: async (shopId: string, canonicalField: string, groupCode: string | null) =>
    unwrap<TillFieldOverride>((await api.post("/till-field-overrides", { shopId, canonicalField, groupCode })).data),
};

// Per-shop custom fields (line items) with simple in/out/none cash behaviour.
export type CashEffect = "In" | "Out" | "None";
export type TillShopField = {
  id: string;
  shopId?: string | null;
  code: string;
  displayName: string;
  groupCode: string;
  cashEffect: CashEffect;
  isActive: boolean;
};

export const tillShopFieldsApi = {
  list: async (shopId: string) =>
    unwrap<TillShopField[]>((await api.get("/till-shop-fields", { params: { shopId } })).data),
  create: async (input: { shopId: string; displayName: string; groupCode: string; cashEffect: CashEffect }) =>
    unwrap<TillShopField>((await api.post("/till-shop-fields", input)).data),
  update: async (input: { id: string; displayName: string; groupCode: string; cashEffect: CashEffect; isActive?: boolean }) =>
    unwrap<TillShopField>((await api.put("/till-shop-fields", { isActive: true, ...input })).data),
  remove: async (id: string) => { await api.delete(`/till-shop-fields/${id}`); },
};
