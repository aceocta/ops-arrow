import { apiClient } from "./client";
import { ApiResponse } from "./types";

// Mirrors ScratchCard.Application.DTOs.CoinPods.* — the Coin Pod (coin bag management) feature.

export type CoinBagStatus = "Normal" | "LowStock" | "OutOfStock" | "Disabled";

export type CoinBagStockRow = {
  coinDenominationId: string;
  code: string;
  displayLabel: string;
  name: string;
  sortOrder: number;
  bagValue: number;
  openingBagQuantity: number;
  currentBagQuantity: number;
  currentTotalValue: number;
  stockAlertLimit: number;
  isAlertEnabled: boolean;
  isActive: boolean;
  isNote: boolean;
  status: CoinBagStatus;
  lastUpdatedOn?: string | null;
  lastUpdatedByUserId?: string | null;
};

export type CoinPodDashboard = {
  shopId: string;
  totalCoinValue: number;
  /** The shop's single loose (un-bagged) coin cash pot — any value, all denominations. Included in totalCoinValue. */
  looseCashAmount: number;
  activeAlertCount: number;
  items: CoinBagStockRow[];
};

export type CoinBagConfig = {
  id: string;
  shopId: string;
  coinDenominationId: string;
  code: string;
  displayLabel: string;
  name: string;
  coinValue: number;
  sortOrder: number;
  bagValue: number;
  minBagQuantity: number;
  maxBagQuantity: number;
  openingBagQuantity: number;
  stockAlertLimit: number;
  isAlertEnabled: boolean;
  alertRecipientType: string;
  isActive: boolean;
  isNote: boolean;
  currentBagQuantity: number;
};

export type CoinStockCountEntry = { coinDenominationId: string; value: number };

export type CoinBagTransaction = {
  id: string;
  shopId: string;
  transactionNumber: string;
  transactionType: string;
  coinDenominationId: string;
  code: string;
  displayLabel: string;
  bagQuantity: number;
  bagValue: number;
  totalCoinValue: number;
  noteAmount: number;
  differenceAmount: number;
  direction: string;
  status: string;
  comment?: string | null;
  performedByUserId: string;
  performedOn: string;
};

export type CoinBagAlertStatus = "Active" | "Resolved" | "Dismissed";

export type CoinBagAlert = {
  id: string;
  shopId: string;
  coinDenominationId: string;
  code: string;
  displayLabel: string;
  alertType: string;
  currentBagQuantity: number;
  stockAlertLimit: number;
  status: CoinBagAlertStatus;
  message: string;
  triggeredOn: string;
  resolvedOn?: string | null;
};

export type UpdateCoinBagConfigPayload = {
  shopId: string;
  coinDenominationId: string;
  bagValue: number;
  minBagQuantity: number;
  maxBagQuantity: number;
  openingBagQuantity: number;
  stockAlertLimit: number;
  isAlertEnabled: boolean;
  alertRecipientType?: string;
  isActive: boolean;
};

export type CoinSwapPayload = {
  shopId: string;
  coinDenominationId: string;
  bagQuantity: number;
  noteAmount: number;
  comment?: string;
};

export type CoinAdjustmentPayload = {
  shopId: string;
  coinDenominationId: string;
  increaseStock: boolean;
  bagQuantity: number;
  reason: string;
  comment?: string;
};

export type CoinBankMovementPayload = {
  shopId: string;
  coinDenominationId: string;
  bagQuantity: number;
  comment?: string;
};

export type CoinMovementSummaryRow = {
  transactionType: string;
  count: number;
  totalBags: number;
  totalCoinValue: number;
  totalNoteAmount: number;
};

export type CoinPodReport = {
  shopId: string;
  from: string;
  to: string;
  totalCoinValue: number;
  /** The shop's single loose (un-bagged) coin cash pot — included in totalCoinValue. */
  looseCashAmount: number;
  stockSummary: CoinBagStockRow[];
  movementSummary: CoinMovementSummaryRow[];
  exceptions: CoinBagTransaction[];
  alerts: CoinBagAlert[];
};

export async function getCoinPodDashboard(shopId: string): Promise<CoinPodDashboard> {
  const response = await apiClient.get<ApiResponse<CoinPodDashboard>>("/coin-pod/dashboard", { params: { shopId } });
  return response.data.data;
}

export async function getCoinBagConfigs(shopId: string): Promise<CoinBagConfig[]> {
  const response = await apiClient.get<ApiResponse<CoinBagConfig[]>>("/coin-pod/config", { params: { shopId } });
  return response.data.data ?? [];
}

export async function updateCoinBagConfig(payload: UpdateCoinBagConfigPayload): Promise<CoinBagConfig> {
  const response = await apiClient.put<ApiResponse<CoinBagConfig>>("/coin-pod/config", payload);
  return response.data.data;
}

export async function swapNotesToCoins(payload: CoinSwapPayload): Promise<CoinBagTransaction> {
  const response = await apiClient.post<ApiResponse<CoinBagTransaction>>("/coin-pod/swaps/notes-to-coins", payload);
  return response.data.data;
}

export async function swapCoinsToNotes(payload: CoinSwapPayload): Promise<CoinBagTransaction> {
  const response = await apiClient.post<ApiResponse<CoinBagTransaction>>("/coin-pod/swaps/coins-to-notes", payload);
  return response.data.data;
}

export async function adjustCoinStock(payload: CoinAdjustmentPayload): Promise<CoinBagTransaction> {
  const response = await apiClient.post<ApiResponse<CoinBagTransaction>>("/coin-pod/adjustments", payload);
  return response.data.data;
}

export async function bankRefillCoins(payload: CoinBankMovementPayload): Promise<CoinBagTransaction> {
  const response = await apiClient.post<ApiResponse<CoinBagTransaction>>("/coin-pod/bank/refill", payload);
  return response.data.data;
}

export async function bankRemoveCoins(payload: CoinBankMovementPayload): Promise<CoinBagTransaction> {
  const response = await apiClient.post<ApiResponse<CoinBagTransaction>>("/coin-pod/bank/removal", payload);
  return response.data.data;
}

export async function getCoinTransactions(
  shopId: string,
  from: string,
  to: string,
  coinDenominationId?: string,
): Promise<CoinBagTransaction[]> {
  const response = await apiClient.get<ApiResponse<CoinBagTransaction[]>>("/coin-pod/transactions", {
    params: { shopId, from, to, coinDenominationId },
  });
  return response.data.data ?? [];
}

export async function getCoinAlerts(shopId: string, status?: CoinBagAlertStatus): Promise<CoinBagAlert[]> {
  const response = await apiClient.get<ApiResponse<CoinBagAlert[]>>("/coin-pod/alerts", {
    params: { shopId, status },
  });
  return response.data.data ?? [];
}

export async function dismissCoinAlert(shopId: string, alertId: string): Promise<CoinBagAlert> {
  const response = await apiClient.post<ApiResponse<CoinBagAlert>>(`/coin-pod/alerts/${alertId}/dismiss`, null, {
    params: { shopId },
  });
  return response.data.data;
}

export async function reverseCoinTransaction(shopId: string, transactionId: string, reason: string): Promise<CoinBagTransaction> {
  const response = await apiClient.post<ApiResponse<CoinBagTransaction>>(
    `/coin-pod/transactions/${transactionId}/reverse`,
    { shopId, reason },
  );
  return response.data.data;
}

export async function getCoinPodReport(shopId: string, from: string, to: string): Promise<CoinPodReport> {
  const response = await apiClient.get<ApiResponse<CoinPodReport>>("/coin-pod/report", {
    params: { shopId, from, to },
  });
  return response.data.data;
}

// looseCashAmount (optional) sets the shop's single loose-cash pot; omit to leave it unchanged.
export async function recordCoinStock(
  shopId: string,
  entries: CoinStockCountEntry[],
  looseCashAmount?: number,
): Promise<CoinPodDashboard> {
  const response = await apiClient.post<ApiResponse<CoinPodDashboard>>("/coin-pod/stock-count", {
    shopId,
    entries,
    looseCashAmount,
  });
  return response.data.data;
}
