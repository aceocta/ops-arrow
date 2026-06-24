import { api, unwrap } from "./api";

export type GameApprovalStatus = "Pending" | "Approved" | "Rejected";
export type SellingOrder = "Ascending" | "Descending";
export type GameAssignScope = "Shop" | "Company";

export type Game = {
  id: string;
  masterGameId: string;
  shopId: string;
  gameName: string;
  gameCode: string;
  defaultTicketPrice: number;
  defaultTicketsPerPack: number;
  defaultStartSerialNumber: string;
  defaultEndSerialNumber: string;
  defaultSellingOrder: SellingOrder;
  isActive: boolean;
  approvalStatus: GameApprovalStatus;
};

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

export type CreateGameInput = {
  shopId: string;
  gameName: string;
  gameCode: string;
  defaultTicketPrice: number;
  defaultTicketsPerPack: number;
  defaultStartSerialNumber: string;
  defaultEndSerialNumber: string;
  defaultSellingOrder: SellingOrder;
  isActive: boolean;
  assignScope: GameAssignScope;
};

export type AssignExistingInput = {
  masterGameId: string;
  shopId: string;
  scope: GameAssignScope;
  defaultStartSerialNumber: string;
  defaultEndSerialNumber: string;
  defaultSellingOrder: SellingOrder;
  isActive: boolean;
};

export const gamesApi = {
  list: async (shopId: string) => unwrap<Game[]>((await api.get("/games", { params: { shopId } })).data),
  create: async (input: CreateGameInput) => unwrap<CreateGameResult>((await api.post("/games", input)).data),
  assignExisting: async (input: AssignExistingInput) => unwrap<Game>((await api.post("/games/assign-existing", input)).data),
  pending: async () => unwrap<PendingGame[]>((await api.get("/games/pending")).data),
  approve: async (masterGameId: string) => (await api.post(`/games/${masterGameId}/approve`)).data,
  reject: async (masterGameId: string, reason?: string) => (await api.post(`/games/${masterGameId}/reject`, { reason })).data,
};
