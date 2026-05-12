import { apiClient } from "./client";
import { ApiResponse } from "./types";
import { Game } from "../types/models";
import { SellingOrder } from "../types/enums";
import { parseSellingOrder, toApiSellingOrder } from "../utils/enumParsers";

export type CreateGamePayload = {
  shopId: string;
  gameName: string;
  gameCode: string;
  defaultTicketPrice: number;
  defaultTicketsPerPack: number;
  defaultStartSerialNumber: string;
  defaultEndSerialNumber: string;
  defaultSellingOrder: SellingOrder;
  commissionRate?: number;
  isActive: boolean;
};

export type UpdateGamePayload = CreateGamePayload;

function mapGame(game: Game): Game {
  return {
    ...game,
    defaultSellingOrder: parseSellingOrder((game as any).defaultSellingOrder),
  };
}

export async function listGames(shopId: string) {
  const response = await apiClient.get<ApiResponse<Game[]>>("/games", { params: { shopId } });
  return response.data.data.map(mapGame);
}

export async function createGame(payload: CreateGamePayload) {
  const response = await apiClient.post<ApiResponse<Game>>("/games", {
    ...payload,
    defaultSellingOrder: toApiSellingOrder(payload.defaultSellingOrder),
  });
  return mapGame(response.data.data);
}

export async function updateGame(gameId: string, payload: UpdateGamePayload) {
  const response = await apiClient.put<ApiResponse<Game>>(`/games/${gameId}`, {
    ...payload,
    defaultSellingOrder: toApiSellingOrder(payload.defaultSellingOrder),
  });
  return mapGame(response.data.data);
}
