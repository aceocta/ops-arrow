export type ApiResponse<T> = { success: boolean; data: T; message?: string };

export type ProfileShop = {
  shopId: string;
  companyId?: string;
  companyName?: string;
  shopName: string;
  role: string;
  isFuelStation?: boolean;
};

export type AuthProfile = {
  userId?: string;
  email: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  roles: string[];
  shops: ProfileShop[];
};

export type Entitlements = {
  features: string[];
  maxUsers?: number | null;
};

// Owner overview (multi-shop dashboard) — mirrors OwnerOverviewDto.
export type OwnerSalesPoint = { date: string; amount: number };
export type OwnerTempPoint = { date: string; inRange: number; outOfRange: number };
export type OwnerShopOverview = {
  shopId: string;
  shopName: string;
  salesAmount: number;
  previousSalesAmount: number;
  cashVariance: number;
  dayStatus: string;
  temperatureIssues: number;
  temperatureOutOfRangeUnits: number;
  complianceNonCompliantCount: number;
  openComplianceActions: number;
  complianceScore: number;
  lowStockPacks: number;
  refusals: number;
  visitors: number;
  onShiftNow: number;
  pendingApprovals: number;
  needsAttention: boolean;
  attentionReasons: string[];
};
export type OwnerOverview = {
  from: string;
  to: string;
  shops: OwnerShopOverview[];
  shopCount: number;
  totalSalesAmount: number;
  previousTotalSalesAmount: number;
  totalCashVariance: number;
  shopsNeedingAttention: number;
  totalOpenComplianceActions: number;
  totalTemperatureIssues: number;
  totalLowStockPacks: number;
  totalRefusals: number;
  totalVisitors: number;
  totalOnShiftNow: number;
  totalPendingApprovals: number;
  averageComplianceScore: number;
  salesByDay: OwnerSalesPoint[];
  temperatureByDay: OwnerTempPoint[];
};
