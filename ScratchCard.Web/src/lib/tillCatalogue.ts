import { api, unwrap } from "./api";

export type TillFieldDefinition = {
  id: string;
  code: string;
  displayName: string;
  group: string;
  cashDirection: string;
  affectsDrawer: boolean;
  vat: string;
  isCommissionIncome: boolean;
  defaultLedger: string;
  sortOrder: number;
  isBuiltIn: boolean;
  isActive: boolean;
};

export type TillFieldAlias = { id: string; normalizedAlias: string; code: string };

export const GROUPS = ["Control", "Tender", "Counter", "Movement", "Total", "Stat", "Exception", "Department", "Income"];
export const CASH_DIRECTIONS = ["None", "In", "Out", "Separate"];
export const VATS = ["NotApplicable", "Standard20", "Reduced5", "Zero", "Exempt", "OutOfScope"];
export const LEDGERS = ["Bank", "Sales", "Income", "Expense", "Liability", "Variance", "Memo", "Ignore"];

const base = "/admin/till-field-definitions";

export const tillCatalogueApi = {
  listDefs: async () => unwrap<TillFieldDefinition[]>((await api.get(base)).data),
  createDef: async (d: Partial<TillFieldDefinition> & { code: string }) =>
    unwrap<TillFieldDefinition>((await api.post(base, d)).data),
  updateDef: async (d: Partial<TillFieldDefinition> & { code: string }) =>
    unwrap<TillFieldDefinition>((await api.put(base, d)).data),
  reload: async () => { await api.post(`${base}/reload`); },
  listAliases: async () => unwrap<TillFieldAlias[]>((await api.get(`${base}/aliases`)).data),
  addAlias: async (code: string, alias: string) =>
    unwrap<TillFieldAlias>((await api.post(`${base}/aliases`, { code, alias })).data),
  deleteAlias: async (id: string) => { await api.delete(`${base}/aliases/${id}`); },
};
