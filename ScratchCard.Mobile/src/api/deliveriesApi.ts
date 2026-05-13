import { apiClient } from "./client";
import { ApiResponse } from "./types";
import { Delivery, DeliveryNoteParseResult } from "../types/models";
import { SellingOrder } from "../types/enums";
import { parseSellingOrder } from "../utils/enumParsers";

export type CreateDeliveryPackPayload = {
  gameId?: string;
  gameCode?: string;
  gameName?: string;
  packNumber: string;
  displayNumber?: number;
  ticketPrice: number;
  totalTickets: number;
  startSerialNumber: string;
  endSerialNumber: string;
  notes?: string;
};

export type CreateDeliveryPayload = {
  shopId: string;
  deliveryDate: string;
  supplierName: string;
  deliveryReference: string;
  receivedByUserId: string;
  notes?: string;
  allowAutoCreateGames?: boolean;
  packs: CreateDeliveryPackPayload[];
};

export async function listDeliveries(shopId: string) {
  const response = await apiClient.get<ApiResponse<Delivery[]>>("/deliveries", { params: { shopId } });
  return response.data.data;
}

export async function createDelivery(payload: CreateDeliveryPayload) {
  const response = await apiClient.post<ApiResponse<Delivery>>("/deliveries", payload);
  return response.data.data;
}

export async function parseDeliveryNote(input: {
  shopId: string;
  uri: string;
  fileName?: string;
  mimeType?: string;
}) {
  const formData = new FormData();
  formData.append("shopId", input.shopId);
  formData.append("image", {
    uri: input.uri,
    name: input.fileName ?? "delivery-note.jpg",
    type: input.mimeType ?? "image/jpeg",
  } as any);

  const response = await apiClient.post<ApiResponse<DeliveryNoteParseResult>>("/deliveries/parse-note", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });

  const result = response.data.data;

  return {
    ...result,
    packSuggestions: result.packSuggestions.map((suggestion) => ({
      ...suggestion,
      sellingOrder: suggestion.sellingOrder ? parseSellingOrder(suggestion.sellingOrder) : SellingOrder.Ascending,
    })),
  } as DeliveryNoteParseResult;
}
