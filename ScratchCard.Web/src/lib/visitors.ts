import { api, unwrap } from "./api";

export type VisitorEntry = {
  id: string;
  sequenceNo: number;
  visitDate: string;
  timeIn: string;
  timeOut?: string;
  isOnSite: boolean;
  visitorName: string;
  organisation?: string;
  visitType: string;
  purpose?: string;
  hostName?: string;
  vehicleRegistration?: string;
  isInspector: boolean;
  notes?: string;
  recordedByName?: string;
};

export const visitorsApi = {
  range: async (shopId: string, from: string, to: string) =>
    unwrap<VisitorEntry[]>((await api.get("/visitor-log/entries/range", { params: { shopId, from, to } })).data),
  onSite: async (shopId: string) =>
    unwrap<VisitorEntry[]>((await api.get("/visitor-log/on-site", { params: { shopId } })).data),
  signOut: async (entryId: string) =>
    unwrap<VisitorEntry>((await api.post(`/visitor-log/entries/${entryId}/sign-out`)).data),
};
