import { api, unwrap } from "./api";

export type ConfigurationItem = {
  id: string;
  shopId?: string;
  configKey: string;
  configValue: string;
  dataType: string;
  groupName: string;
  description?: string;
  isActive: boolean;
};

export type RoleOption = { id: string; name: string; description?: string };

export const lookupsApi = {
  roles: async () => unwrap<RoleOption[]>((await api.get("/lookups/roles")).data),
};

export const configApi = {
  get: async (shopId: string) =>
    unwrap<ConfigurationItem[]>((await api.get("/configurations", { params: { shopId } })).data),
  update: async (shopId: string, items: { groupName?: string; configKey: string; configValue: string }[]) =>
    (await api.put("/configurations", { shopId, items })).data,
};
