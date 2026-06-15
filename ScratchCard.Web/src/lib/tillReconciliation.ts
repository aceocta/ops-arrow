import { api, unwrap } from "./api";

export type VarianceStatus = "Ok" | "Warning" | "Alert";
export type ReconStatus = "Draft" | "NeedsVerification" | "Reconciled" | "Approved";

export type RollupTill = {
  id: string;
  tillId?: string | null;
  tillName: string;
  status: ReconStatus;
  expectedCash: number;
  countedCash?: number | null;
  cashVariance: number;
  varianceStatus: VarianceStatus;
};

export type Rollup = {
  shopId: string;
  businessDate: string;
  tillCount: number;
  reconciledCount: number;
  approvedCount: number;
  allReconciled: boolean;
  totalExpectedCash: number;
  totalCountedCash: number;
  totalCashVariance: number;
  worstVarianceStatus: VarianceStatus;
  totalCommission: number;
  totalNoSale: number;
  totalVoids: number;
  totalRefunds: number;
  tills: RollupTill[];
};

export type StaffAnalyticsRow = {
  userId?: string | null;
  name: string;
  count: number;
  totalVariance: number;
  shortCount: number;
  alertCount: number;
  noSaleCount: number;
};

export type Analytics = {
  shopId: string;
  from: string;
  to: string;
  staff: StaffAnalyticsRow[];
};

// ---- Per-field breakdown over a period ----
export type FieldBreakdownRow = {
  fieldCode: string;
  fieldName: string;
  groupCode: string;
  groupName: string;
  groupSort: number;
  total: number;
  lineCount: number;
  quantityTotal: number;
};
export type FieldBreakdown = {
  shopId: string;
  from: string;
  to: string;
  rows: FieldBreakdownRow[];
  grandTotal: number;
};
export type FieldBreakdownEntry = {
  reconciliationId: string;
  businessDate: string;
  amount: number;
  quantity?: number | null;
};

// ---- Single reconciliation detail (drill-down) ----
export type ReconLine = {
  id: string;
  canonicalField: string;
  fieldName: string;
  group: string;
  rawLabel?: string | null;
  verifiedAmount: number;
  quantity?: number | null;
  status: "Captured" | "Verified";
};
export type ReconAttachment = { id: string; sourceLabel?: string | null; fileName: string };
export type ProofOfCash = {
  cashIn: number; paidOut: number; safeDrop: number; banking: number; pickup: number;
  cashback: number; prizesPaid: number; expectedDrawer: number; countedDrawer: number;
  variance: number; accountedFor: boolean;
};
export type ReconSummary = {
  cashTender: number; cardTender: number; commissionIncome: number;
  owedToProviders: { provider: string; amount: number }[];
  noSaleCount: number; voids: number; refunds: number; unmappedCount: number; unverifiedCount: number;
  proofOfCash: ProofOfCash;
  safeDropCrossCheck?: { declaredOnReport: number; recordedInSafeModule: number; difference: number; matches: boolean } | null;
};
export type Reconciliation = {
  id: string; shopId: string; tillId?: string | null; businessDate: string; status: ReconStatus;
  openingFloat: number; countedCash?: number | null; expectedCash: number; cashVariance: number;
  varianceStatus: VarianceStatus; varianceReasonCode?: string | null; confirmedOn?: string | null;
  lines: ReconLine[]; attachments: ReconAttachment[]; summary: ReconSummary;
};

export const tillReconApi = {
  rollup: async (shopId: string, date: string) =>
    unwrap<Rollup>((await api.get("/till-reconciliation/rollup", { params: { shopId, date } })).data),
  analytics: async (shopId: string, from: string, to: string) =>
    unwrap<Analytics>((await api.get("/till-reconciliation/analytics", { params: { shopId, from, to } })).data),
  fieldBreakdown: async (shopId: string, from: string, to: string, fields?: string[]) =>
    unwrap<FieldBreakdown>((await api.get("/till-reconciliation/field-breakdown", {
      params: { shopId, from, to, fields: fields && fields.length > 0 ? fields.join(",") : undefined },
    })).data),
  fieldBreakdownEntries: async (shopId: string, from: string, to: string, field: string) =>
    unwrap<FieldBreakdownEntry[]>((await api.get("/till-reconciliation/field-breakdown/entries", {
      params: { shopId, from, to, field },
    })).data),
  get: async (id: string) =>
    unwrap<Reconciliation>((await api.get(`/till-reconciliation/${id}`)).data),
  attachment: async (attachmentId: string) =>
    unwrap<string>((await api.get(`/till-reconciliation/attachments/${attachmentId}/content`)).data),
  // Undo a photo upload — removes the photo and the lines it produced.
  deleteAttachment: async (attachmentId: string) =>
    unwrap<Reconciliation>((await api.delete(`/till-reconciliation/attachments/${attachmentId}`)).data),
  // Reopen an approved (locked) reconciliation back to editable. Management only.
  reopen: async (id: string) =>
    unwrap<Reconciliation>((await api.post(`/till-reconciliation/${id}/reopen`)).data),
  // Erase a reconciliation entirely. Management only.
  erase: async (id: string) => { await api.delete(`/till-reconciliation/${id}`); },
};

// ---- Phase 3: Post Office balance ----
export type PostOfficeBalance = {
  id: string;
  shopId: string;
  businessDate: string;
  openingBalance: number;
  cashIn: number;
  cashOut: number;
  expectedBalance: number;
  countedBalance?: number | null;
  variance: number;
  varianceStatus: VarianceStatus;
  notes?: string | null;
  status: ReconStatus;
};

// ---- Phase 3: Provider settlement ----
export type SettlementProvider = "PayPoint" | "Payzone" | "Lottery" | "Parcels";
export type SettlementStatus = "Open" | "Matched" | "Discrepancy" | "Settled";
export type ProviderSettlement = {
  id: string;
  shopId: string;
  provider: SettlementProvider;
  periodStart: string;
  periodEnd: string;
  capturedSales: number;
  capturedPrizes: number;
  capturedCommission: number;
  capturedOwed: number;
  statementAmount?: number | null;
  statementCommission?: number | null;
  ddAmount?: number | null;
  ddDate?: string | null;
  variance: number;
  status: SettlementStatus;
  notes?: string | null;
};

// ---- Phase 4: accounting export ----
export type LedgerCategory = "Bank" | "Sales" | "Income" | "Expense" | "Liability" | "Variance" | "Memo" | "Ignore";
export type AccountingLine = { field: string; fieldName: string; ledger: LedgerCategory; vatBucket: string; amount: number };
export type VatRateRow = { bucket: string; net: number; vat: number; gross: number };
export type AccountingSummary = {
  shopId: string; from: string; to: string;
  turnoverExAgency: number; otherTurnover: number; tendersTotal: number; commissionIncome: number;
  agencyLiabilities: number; expenses: number; cashOverShort: number;
  vatByRate: VatRateRow[]; lines: AccountingLine[];
};

export const tillAccountingApi = {
  summary: async (shopId: string, from: string, to: string) =>
    unwrap<AccountingSummary>((await api.get("/till-accounting/summary", { params: { shopId, from, to } })).data),
  downloadCsv: async (shopId: string, from: string, to: string) => {
    const res = await api.get("/till-accounting/export.csv", { params: { shopId, from, to }, responseType: "blob" });
    const url = URL.createObjectURL(res.data as Blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `till-journal_${from}_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  },
};

export const tillSettlementApi = {
  getPostOffice: async (shopId: string, businessDate: string) =>
    unwrap<PostOfficeBalance>((await api.post("/till-settlement/post-office", { shopId, businessDate })).data),
  savePostOffice: async (p: { id: string; openingBalance: number; cashIn: number; cashOut: number; countedBalance?: number; notes?: string }) =>
    unwrap<PostOfficeBalance>((await api.post("/till-settlement/post-office/save", p)).data),
  setPostOfficeStatus: async (id: string, status: ReconStatus) =>
    unwrap<PostOfficeBalance>((await api.post(`/till-settlement/post-office/${id}/status`, null, { params: { status } })).data),

  listSettlements: async (shopId: string, from: string, to: string) =>
    unwrap<ProviderSettlement[]>((await api.get("/till-settlement/provider", { params: { shopId, from, to } })).data),
  createSettlement: async (p: { shopId: string; provider: SettlementProvider; periodStart: string; periodEnd: string }) =>
    unwrap<ProviderSettlement>((await api.post("/till-settlement/provider", p)).data),
  refreshSettlement: async (id: string) =>
    unwrap<ProviderSettlement>((await api.post(`/till-settlement/provider/${id}/refresh`)).data),
  setStatement: async (p: { id: string; statementAmount?: number; statementCommission?: number; ddAmount?: number; ddDate?: string; notes?: string }) =>
    unwrap<ProviderSettlement>((await api.post("/till-settlement/provider/statement", p)).data),
  setSettlementStatus: async (id: string, status: SettlementStatus) =>
    unwrap<ProviderSettlement>((await api.post(`/till-settlement/provider/${id}/status`, null, { params: { status } })).data),
};
