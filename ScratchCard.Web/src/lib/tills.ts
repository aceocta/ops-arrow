import { api, unwrap } from "./api";

export type Till = {
  id: string;
  shopId: string;
  name: string;
  code?: string | null;
  isActive: boolean;
  defaultFloat: number;
};

export const tillsApi = {
  list: async (shopId: string, includeInactive = true) =>
    unwrap<Till[]>((await api.get("/tills", { params: { shopId, includeInactive } })).data),
  create: async (p: { shopId: string; name: string; code?: string; defaultFloat: number }) =>
    unwrap<Till>((await api.post("/tills", p)).data),
  update: async (id: string, p: { name: string; code?: string; isActive: boolean; defaultFloat: number }) =>
    unwrap<Till>((await api.put(`/tills/${id}`, p)).data),
  remove: async (id: string) => { await api.delete(`/tills/${id}`); },
  // Seed default Till Report data (payment types + a default till) for one shop or every shop in a company.
  applyDefaults: async (body: { shopId?: string; companyId?: string }) =>
    unwrap<{ seeded: number }>((await api.post("/till-report-defaults/apply", body)).data),
};
