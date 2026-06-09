import { api, unwrap } from "./api";

export type Till = {
  id: string;
  shopId: string;
  name: string;
  code?: string | null;
  isActive: boolean;
};

export const tillsApi = {
  list: async (shopId: string, includeInactive = true) =>
    unwrap<Till[]>((await api.get("/tills", { params: { shopId, includeInactive } })).data),
  create: async (p: { shopId: string; name: string; code?: string }) =>
    unwrap<Till>((await api.post("/tills", p)).data),
  update: async (id: string, p: { name: string; code?: string; isActive: boolean }) =>
    unwrap<Till>((await api.put(`/tills/${id}`, p)).data),
  remove: async (id: string) => { await api.delete(`/tills/${id}`); },
};
