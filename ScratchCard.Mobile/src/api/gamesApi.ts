import { apiClient } from "./client";
import { ApiResponse } from "./types";
import { Game } from "../types/models";
import { SellingOrder } from "../types/enums";
import { parseSellingOrder, toApiSellingOrder } from "../utils/enumParsers";

export type GameAssignScope = "Shop" | "Company";
export type GameApprovalStatus = "Pending" | "Approved" | "Rejected";

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
  assignScope?: GameAssignScope;
};

export type UpdateGamePayload = CreateGamePayload;

export type DuplicateGameInfo = {
  masterGameId: string;
  gameName: string;
  gameCode: string;
  approvalStatus: GameApprovalStatus;
  alreadyAssignedToShop: boolean;
};

export type CreateGameResult = {
  outcome: "Created" | "DuplicateExists";
  game?: Game;
  duplicate?: DuplicateGameInfo;
};

export type AssignExistingGamePayload = {
  masterGameId: string;
  shopId: string;
  scope: GameAssignScope;
  defaultStartSerialNumber: string;
  defaultEndSerialNumber: string;
  defaultSellingOrder: SellingOrder;
  isActive: boolean;
};

export type PendingGame = {
  masterGameId: string;
  gameName: string;
  gameCode: string;
  ticketPrice: number;
  ticketsPerPack: number;
  originShopId?: string | null;
  originShopName?: string | null;
  originCompanyId?: string | null;
  originCompanyName?: string | null;
  assignedShopCount: number;
  createdOn: string;
};

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

export async function createGame(payload: CreateGamePayload): Promise<CreateGameResult> {
  const response = await apiClient.post<ApiResponse<CreateGameResult>>("/games", {
    ...payload,
    defaultSellingOrder: toApiSellingOrder(payload.defaultSellingOrder),
    assignScope: payload.assignScope ?? "Shop",
  });
  const result = response.data.data;
  return { ...result, game: result.game ? mapGame(result.game) : undefined };
}

export async function assignExistingGame(payload: AssignExistingGamePayload): Promise<Game> {
  const response = await apiClient.post<ApiResponse<Game>>("/games/assign-existing", {
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

// --- PlatformAdmin approval queue ---
export async function listPendingGames() {
  const response = await apiClient.get<ApiResponse<PendingGame[]>>("/games/pending");
  return response.data.data;
}

export async function approveGame(masterGameId: string) {
  await apiClient.post(`/games/${masterGameId}/approve`);
}

export async function rejectGame(masterGameId: string, reason?: string) {
  await apiClient.post(`/games/${masterGameId}/reject`, { reason });
}
