import { apiClient } from "./client";
import { ApiResponse } from "./types";

export type ProductExpiryStatus = "Safe" | "ExpiringSoon" | "Urgent" | "Expired";
export type ProductDateType = "UseBy" | "BestBefore";
export type ProductExpiryActionType =
  | "MoveToFront"
  | "Discount"
  | "MarkSold"
  | "Donate"
  | "ReturnToSupplier"
  | "Dispose";

export type ProductCategory = {
  id: string;
  shopId?: string | null;
  name: string;
  sortOrder: number;
  isActive: boolean;
  isBuiltIn: boolean;
  reminderDays: number[];
};

export type ProductExpiryAction = {
  id: string;
  productBatchId: string;
  actionType: ProductExpiryActionType;
  quantity: number;
  comment?: string | null;
  performedByUserId: string;
  performedOn: string;
};

export type ProductBatch = {
  id: string;
  shopId: string;
  productCategoryId: string;
  categoryName: string;
  productName: string;
  barcode?: string | null;
  quantity: number;
  remainingQuantity: number;
  expiryDate: string; // ISO date (yyyy-MM-dd)
  dateType: ProductDateType;
  batchNumber?: string | null;
  unitCost?: number | null;
  unitPrice?: number | null;
  status: ProductExpiryStatus;
  daysToExpiry: number;
  addedByUserId: string;
  addedOn: string;
  actions: ProductExpiryAction[];
};

export type ProductExpiryDisposition = {
  actionType: ProductExpiryActionType;
  units: number;
  value: number;
  isSave: boolean;
};

export type ProductExpiryScoreboard = {
  from: string;
  to: string;
  binnedUnits: number;
  binnedValue: number;
  savedUnits: number;
  savedValue: number;
  saveRate: number; // 0..1
  byDisposition: ProductExpiryDisposition[];
};

// --- Categories -------------------------------------------------------------
export async function listProductCategories(shopId: string): Promise<ProductCategory[]> {
  const res = await apiClient.get<ApiResponse<ProductCategory[]>>("/product-categories", { params: { shopId } });
  return res.data.data;
}

export async function createProductCategory(input: {
  shopId: string;
  name: string;
  sortOrder?: number;
  reminderDays: number[];
}): Promise<ProductCategory> {
  const res = await apiClient.post<ApiResponse<ProductCategory>>("/product-categories", input);
  return res.data.data;
}

export async function updateProductCategory(input: {
  id: string;
  shopId: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  reminderDays: number[];
}): Promise<ProductCategory> {
  const res = await apiClient.put<ApiResponse<ProductCategory>>("/product-categories", input);
  return res.data.data;
}

export async function deleteProductCategory(id: string): Promise<void> {
  await apiClient.delete<ApiResponse<boolean>>(`/product-categories/${id}`);
}

// --- Products ---------------------------------------------------------------
export async function addProduct(input: {
  shopId: string;
  productCategoryId: string;
  productName: string;
  barcode?: string;
  quantity: number;
  expiryDate: string;
  dateType: ProductDateType;
  batchNumber?: string;
  unitCost?: number;
  unitPrice?: number;
}): Promise<ProductBatch> {
  const res = await apiClient.post<ApiResponse<ProductBatch>>("/product-expiry", input);
  return res.data.data;
}

export type ProductBarcodeLookup = {
  found: boolean;
  source: "local" | "online" | "none";
  barcode: string;
  productName?: string | null;
  productCategoryId?: string | null;
  categoryName?: string | null;
  dateType?: ProductDateType | null;
  unitCost?: number | null;
  unitPrice?: number | null;
};

export async function lookupProductByBarcode(shopId: string, barcode: string): Promise<ProductBarcodeLookup> {
  const res = await apiClient.get<ApiResponse<ProductBarcodeLookup>>("/product-expiry/lookup", { params: { shopId, barcode } });
  return res.data.data;
}

export async function listProducts(shopId: string, status?: ProductExpiryStatus): Promise<ProductBatch[]> {
  const res = await apiClient.get<ApiResponse<ProductBatch[]>>("/product-expiry", {
    params: status ? { shopId, status } : { shopId },
  });
  return res.data.data;
}

export async function getProduct(id: string): Promise<ProductBatch> {
  const res = await apiClient.get<ApiResponse<ProductBatch>>(`/product-expiry/${id}`);
  return res.data.data;
}

export async function recordProductAction(input: {
  productBatchId: string;
  actionType: ProductExpiryActionType;
  quantity: number;
  comment?: string;
}): Promise<ProductBatch> {
  const res = await apiClient.post<ApiResponse<ProductBatch>>("/product-expiry/actions", input);
  return res.data.data;
}

export async function getProductExpiryScoreboard(shopId: string, from: string, to: string): Promise<ProductExpiryScoreboard> {
  const res = await apiClient.get<ApiResponse<ProductExpiryScoreboard>>("/product-expiry/scoreboard", {
    params: { shopId, from, to },
  });
  return res.data.data;
}
