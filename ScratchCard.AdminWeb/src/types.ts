// Mirrors the API DTOs (camelCase JSON). See ScratchCard.Application/DTOs.

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export interface PagedResult<T> {
  items: T[];
  totalCount: number;
}

export interface UserShop {
  shopId: string;
  companyId?: string | null;
  companyName?: string | null;
  shopName: string;
  role: string;
}

export interface UserProfile {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  displayName: string;
  roles: string[];
  shops: UserShop[];
  hasCompanySetup: boolean;
  hasShopSetup: boolean;
  primaryCompanyId?: string | null;
}

export interface AuthTokenResponse {
  accessToken: string;
  expiresOn: string;
  tokenType: string;
  profile: UserProfile;
}

export interface CustomerListItem {
  id: string;
  companyName: string;
  email: string;
  phoneNumber?: string | null;
  status: string;
  isActive: boolean;
  shopCount: number;
  userCount: number;
  subscriptionStatus: string;
  createdOn: string;
}

export interface ShopSummary {
  id: string;
  shopName: string;
  city: string;
  isActive: boolean;
  subscriptionStatus: string;
}

export interface CustomerUser {
  userId: string;
  fullName: string;
  email: string;
  roleName: string;
  shopName: string;
  isActive: boolean;
  lastLoginOn?: string | null;
}

export interface CustomerSubscription {
  status: string;
  activeShopSubscriptionCount: number;
  totalShopSubscriptionCount: number;
  planName?: string | null;
}

export interface CustomerDetail {
  id: string;
  companyName: string;
  registrationNumber?: string | null;
  email: string;
  phoneNumber?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  postCode?: string | null;
  country: string;
  status: string;
  isActive: boolean;
  createdOn: string;
  shops: ShopSummary[];
  users: CustomerUser[];
  subscription: CustomerSubscription;
}

export interface AdminUpdateCustomerRequest {
  companyName: string;
  registrationNumber?: string | null;
  email: string;
  phoneNumber?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  postCode?: string | null;
  country?: string | null;
  isActive: boolean;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  billingCycle: string;
  pricePerShop: number;
  trialDays: number;
  description?: string | null;
  includedFeatures: string[];
  maxUsers?: number | null;
  reportExportsPerMonth?: number | null;
  displayOrder: number;
  isActive: boolean;
}
