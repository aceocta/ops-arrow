import { apiClient } from "./client";
import { ApiResponse } from "./types";

// Mirrors the backend canonical fields / enums (string-serialized via JsonStringEnumConverter).
export type TillCanonicalField =
  | "Unmapped"
  | "Cash" | "Card" | "CardDebit" | "CardCredit" | "CardContactless" | "MobilePay" | "Voucher" | "GiftCard" | "AccountCredit" | "Cheque" | "Cashback"
  | "LotterySales" | "LotteryPrizes" | "LotteryCommission" | "ScratchcardSales" | "ScratchcardPrizes" | "PayPoint" | "Payzone" | "Parcels" | "CarrierBags" | "PostOffice" | "FuelSales" | "Atm"
  | "OpeningFloat" | "PaidIn" | "PaidOut" | "SafeDrop" | "Pickup" | "Banking"
  | "GrossSales" | "NetSales" | "Vat20" | "Vat5" | "Vat0" | "VatExempt" | "TotalSales" | "TransactionCount" | "ItemCount"
  | "NoSale" | "Void" | "Refund" | "PriceOverride" | "Discount" | "ErrorCorrection" | "Training" | "DriveOff"
  | "DeptTobacco" | "DeptAlcohol" | "DeptGrocery" | "DeptSoftDrinks" | "DeptConfectionery" | "DeptFoodToGo" | "DeptNewsMag" | "DeptHousehold" | "DeptOther"
  | "SubtotalIgnore";

export type TillFieldGroup = "Control" | "Tender" | "Counter" | "Movement" | "Total" | "Stat" | "Exception" | "Department" | "Income";
export type TillCaptureMethod = "Manual" | "Photo" | "Export";
export type TillLineStatus = "Captured" | "Verified";
export type TillReportType = "DayEnd" | "Shift";
export type TillReconciliationStatus = "Draft" | "NeedsVerification" | "Reconciled" | "Approved";
export type TillVarianceStatus = "Ok" | "Warning" | "Alert";

export type ReconciliationLine = {
  id: string;
  canonicalField: TillCanonicalField;
  fieldName: string;
  group: TillFieldGroup;
  section?: string | null;
  rawLabel?: string | null;
  extractedAmount?: number | null;
  verifiedAmount: number;
  quantity?: number | null;
  captureMethod: TillCaptureMethod;
  status: TillLineStatus;
  notes?: string | null;
};

export type ProofOfCash = {
  cashIn: number;
  paidOut: number;
  safeDrop: number;
  banking: number;
  pickup: number;
  cashback: number;
  prizesPaid: number;
  expectedDrawer: number;
  countedDrawer: number;
  variance: number;
  accountedFor: boolean;
};

export type SafeDropCrossCheck = {
  declaredOnReport: number;
  recordedInSafeModule: number;
  difference: number;
  matches: boolean;
};

export type ReconciliationSummary = {
  cashTender: number;
  cardTender: number;
  commissionIncome: number;
  owedToProviders: { provider: string; amount: number }[];
  noSaleCount: number;
  voids: number;
  refunds: number;
  driveOffs: number;
  unmappedCount: number;
  unverifiedCount: number;
  proofOfCash: ProofOfCash;
  safeDropCrossCheck?: SafeDropCrossCheck | null;
};

export type Reconciliation = {
  id: string;
  shopId: string;
  tillId?: string | null;
  reportType: TillReportType;
  businessDate: string;
  status: TillReconciliationStatus;
  openingFloat: number;
  countedCash?: number | null;
  floatToCarry?: number | null;
  cardCounted?: number | null;
  expectedCash: number;
  cashVariance: number;
  varianceStatus: TillVarianceStatus;
  requiresReason: boolean;
  varianceReasonCode?: string | null;
  varianceNotes?: string | null;
  confirmedOn?: string | null;
  lines: ReconciliationLine[];
  attachments: ReconciliationAttachment[];
  summary: ReconciliationSummary;
};

export type ReconciliationAttachment = {
  id: string;
  sourceLabel?: string | null;
  fileName: string;
};

export async function getOrCreateReconciliation(payload: {
  shopId: string;
  businessDate: string;
  tillId?: string;
  reportType?: TillReportType;
  shiftId?: string;
}) {
  const response = await apiClient.post<ApiResponse<Reconciliation>>("/till-reconciliation", payload);
  return response.data.data;
}

export async function saveReconciliationLine(payload: {
  reconciliationId: string;
  lineId?: string;
  canonicalField: TillCanonicalField;
  section?: string;
  rawLabel?: string;
  extractedAmount?: number;
  verifiedAmount: number;
  quantity?: number;
  captureMethod?: TillCaptureMethod;
  status?: TillLineStatus;
  notes?: string;
  learnMapping?: boolean;
}) {
  const response = await apiClient.post<ApiResponse<Reconciliation>>("/till-reconciliation/lines", payload);
  return response.data.data;
}

export async function deleteReconciliationLine(lineId: string) {
  const response = await apiClient.delete<ApiResponse<Reconciliation>>(`/till-reconciliation/lines/${lineId}`);
  return response.data.data;
}

export async function restoreReconciliationLine(lineId: string) {
  const response = await apiClient.post<ApiResponse<Reconciliation>>(`/till-reconciliation/lines/${lineId}/restore`);
  return response.data.data;
}

export async function setReconciliationCashCount(payload: {
  reconciliationId: string;
  openingFloat?: number;
  countedCash: number;
  denominationJson?: string;
  floatToCarry?: number;
  cardCounted?: number;
}) {
  const response = await apiClient.post<ApiResponse<Reconciliation>>("/till-reconciliation/cash-count", payload);
  return response.data.data;
}

export async function setReconciliationVarianceReason(payload: { reconciliationId: string; reasonCode: string; notes?: string }) {
  const response = await apiClient.post<ApiResponse<Reconciliation>>("/till-reconciliation/variance-reason", payload);
  return response.data.data;
}

export async function setReconciliationStatus(id: string, status: TillReconciliationStatus) {
  const response = await apiClient.post<ApiResponse<Reconciliation>>(`/till-reconciliation/${id}/status`, null, { params: { status } });
  return response.data.data;
}

export async function ingestReconciliationPhoto(input: { id: string; uri: string; fileName?: string; mimeType?: string; sourceLabel?: string }) {
  const formData = new FormData();
  formData.append("file", {
    uri: input.uri,
    name: input.fileName ?? `till-${Date.now()}.jpg`,
    type: input.mimeType ?? "image/jpeg",
  } as any);
  if (input.sourceLabel) formData.append("sourceLabel", input.sourceLabel);
  const response = await apiClient.post<ApiResponse<Reconciliation>>(`/till-reconciliation/${input.id}/ingest-photo`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 90000,
  });
  return response.data.data;
}

export async function getReconciliationAttachment(attachmentId: string) {
  const response = await apiClient.get<ApiResponse<string>>(`/till-reconciliation/attachments/${attachmentId}/content`);
  return response.data.data; // data URL (base64)
}

export type TillRollupTill = {
  id: string;
  tillId?: string | null;
  status: TillReconciliationStatus;
  expectedCash: number;
  countedCash?: number | null;
  cashVariance: number;
  varianceStatus: TillVarianceStatus;
};
export type TillRollup = {
  shopId: string;
  businessDate: string;
  tillCount: number;
  reconciledCount: number;
  approvedCount: number;
  allReconciled: boolean;
  totalExpectedCash: number;
  totalCountedCash: number;
  totalCashVariance: number;
  worstVarianceStatus: TillVarianceStatus;
  totalCommission: number;
  totalNoSale: number;
  totalVoids: number;
  totalRefunds: number;
  tills: TillRollupTill[];
};

export async function getReconciliationRollup(shopId: string, date: string) {
  const response = await apiClient.get<ApiResponse<TillRollup>>("/till-reconciliation/rollup", { params: { shopId, date } });
  return response.data.data;
}

// Canonical fields offered in the manual "add line" picker, grouped for the UI.
export const FIELD_OPTIONS: { group: string; fields: { value: TillCanonicalField; label: string }[] }[] = [
  {
    group: "Tenders",
    fields: [
      { value: "Cash", label: "Cash" },
      { value: "Card", label: "Card" },
      { value: "CardContactless", label: "Contactless" },
      { value: "MobilePay", label: "Mobile pay" },
      { value: "Voucher", label: "Voucher" },
      { value: "Cheque", label: "Cheque" },
      { value: "Cashback", label: "Cashback" },
    ],
  },
  {
    group: "Service counters",
    fields: [
      { value: "LotterySales", label: "Lottery sales" },
      { value: "LotteryPrizes", label: "Lottery prizes paid" },
      { value: "LotteryCommission", label: "Lottery commission" },
      { value: "ScratchcardSales", label: "Scratchcard sales" },
      { value: "ScratchcardPrizes", label: "Scratchcard prizes" },
      { value: "PayPoint", label: "PayPoint" },
      { value: "Payzone", label: "Payzone" },
      { value: "Parcels", label: "Parcels" },
      { value: "CarrierBags", label: "Carrier bags" },
    ],
  },
  {
    group: "Cash movements",
    fields: [
      { value: "PaidIn", label: "Paid in" },
      { value: "PaidOut", label: "Paid out" },
      { value: "SafeDrop", label: "Safe drop" },
      { value: "Pickup", label: "Pickup" },
      { value: "Banking", label: "Banking" },
    ],
  },
  {
    group: "Exceptions",
    fields: [
      { value: "NoSale", label: "No sale (count)" },
      { value: "Void", label: "Voids" },
      { value: "Refund", label: "Refunds" },
      { value: "DriveOff", label: "Drive-off (no pay)" },
    ],
  },
];

export const VARIANCE_REASONS = [
  "Miscount",
  "Wrong change given",
  "Unrecorded paid-out",
  "Prize not logged",
  "Card taken as cash",
  "Training mode",
  "Suspected theft",
  "Other",
];
