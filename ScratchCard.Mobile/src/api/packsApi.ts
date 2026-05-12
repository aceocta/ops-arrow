import { apiClient } from "./client";
import { ApiResponse } from "./types";
import { ScratchCardPack } from "../types/models";
import { SellingOrder } from "../types/enums";
import { parsePackStatus, parseSellingOrder, toApiSellingOrder } from "../utils/enumParsers";

function mapPack(pack: ScratchCardPack): ScratchCardPack {
  return {
    ...pack,
    status: parsePackStatus((pack as any).status),
    sellingOrder: parseSellingOrder((pack as any).sellingOrder),
  };
}

export async function listPacks(shopId: string) {
  const response = await apiClient.get<ApiResponse<ScratchCardPack[]>>("/packs", { params: { shopId } });
  return response.data.data.map(mapPack);
}

export async function getPack(packId: string) {
  const response = await apiClient.get<ApiResponse<ScratchCardPack>>(`/packs/${packId}`);
  return mapPack(response.data.data);
}

export async function createManualPack(payload: {
  shopId: string;
  gameId: string;
  packNumber: string;
  displayNumber?: number;
  ticketPrice: number;
  totalTickets: number;
  startSerialNumber: string;
  endSerialNumber: string;
  sellingOrder?: SellingOrder;
  notes?: string;
}) {
  const { sellingOrder, ...rest } = payload;
  const response = await apiClient.post<ApiResponse<ScratchCardPack>>("/packs/manual", {
    ...rest,
    ...(sellingOrder ? { sellingOrder: toApiSellingOrder(sellingOrder) } : {}),
  });
  return mapPack(response.data.data);
}

export async function updatePackDetails(
  packId: string,
  payload: {
    packNumber: string;
    displayNumber?: number;
    ticketPrice: number;
    totalTickets: number;
    startSerialNumber: string;
    endSerialNumber: string;
    sellingOrder?: SellingOrder;
  }
) {
  const { sellingOrder, ...rest } = payload;
  const response = await apiClient.put<ApiResponse<ScratchCardPack>>(`/packs/${packId}`, {
    ...rest,
    ...(sellingOrder ? { sellingOrder: toApiSellingOrder(sellingOrder) } : {}),
  });
  return mapPack(response.data.data);
}

export async function activatePack(packId: string, payload: { openingSerialNumber: string; sellingOrder?: SellingOrder }) {
  const { sellingOrder, ...rest } = payload;
  const response = await apiClient.post<ApiResponse<ScratchCardPack>>(`/packs/${packId}/activate`, {
    ...rest,
    ...(sellingOrder ? { sellingOrder: toApiSellingOrder(sellingOrder) } : {}),
  });
  return mapPack(response.data.data);
}

export async function pausePack(packId: string, notes?: string) {
  const response = await apiClient.post<ApiResponse<ScratchCardPack>>(`/packs/${packId}/pause`, { notes });
  return mapPack(response.data.data);
}

export async function returnPack(packId: string, notes?: string) {
  const response = await apiClient.post<ApiResponse<ScratchCardPack>>(`/packs/${packId}/return`, { notes });
  return mapPack(response.data.data);
}

export async function markIssuePack(packId: string, notes?: string) {
  const response = await apiClient.post<ApiResponse<ScratchCardPack>>(`/packs/${packId}/issue`, { notes });
  return mapPack(response.data.data);
}

export async function completePack(packId: string, notes?: string) {
  const response = await apiClient.post<ApiResponse<ScratchCardPack>>(`/packs/${packId}/complete`, { notes });
  return mapPack(response.data.data);
}
