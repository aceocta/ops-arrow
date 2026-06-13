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

export type TillFieldRow = { code: string; displayName: string; groupCode: string; groupName: string };

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

  // Active catalogue fields (flat) with their built-in default group.
  listFields: async () => unwrap<TillFieldRow[]>((await api.get("/till-fields")).data),

  // Per-shop field → group assignment (writes a TillFieldOverride.GroupCode).
  listOverrides: async (shopId: string) =>
    unwrap<TillFieldOverride[]>((await api.get("/till-field-overrides", { params: { shopId } })).data),
  assignField: async (shopId: string, canonicalField: string, groupCode: string | null) =>
    unwrap<TillFieldOverride>((await api.post("/till-field-overrides", { shopId, canonicalField, groupCode })).data),
};
