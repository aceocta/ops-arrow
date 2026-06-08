import { api, unwrap } from "./api";

export type ComplianceActionRow = {
  entryId: string;
  groupName: string;
  frequency: string;
  periodLabel: string;
  periodDate: string;
  itemName: string;
  notes?: string;
  actionRequired?: string;
  isActionClosedOut: boolean;
  closedOutNotes?: string;
};

export const complianceApi = {
  actions: async (shopId: string, from: string, to: string, openOnly: boolean) =>
    unwrap<ComplianceActionRow[]>(
      (await api.get("/compliance-checks/actions", { params: { shopId, from, to, openOnly } })).data,
    ),
};
