import { api, unwrap } from "./api";

export type RefusalEntry = {
  id: string;
  sequenceNo: number;
  refusalDate: string;
  refusalTime: string;
  product: string;
  personDescription: string;
  observations?: string;
  staffMemberInitials: string;
  recordedByName?: string;
  recordedOn: string;
  reviewedOn?: string;
  reviewedByName?: string;
  reviewNotes?: string;
};

export const refusalsApi = {
  range: async (shopId: string, from: string, to: string) =>
    unwrap<RefusalEntry[]>((await api.get("/refusal-register/entries/range", { params: { shopId, from, to } })).data),
  review: async (entryId: string, notes?: string) =>
    unwrap<RefusalEntry>((await api.post(`/refusal-register/entries/${entryId}/review`, { notes })).data),
};
