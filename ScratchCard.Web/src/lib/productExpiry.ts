import { api, unwrap } from "./api";

// String-serialised enums. Mirror Domain.Enums.ProductExpiry*.
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

// Flat history feed row — includes actions on fully-cleared batches, unlike the product list.
export type ProductActionHistory = {
  id: string;
  productBatchId: string;
  productName: string;
  productCategoryId: string;
  categoryName: string;
  barcode?: string | null;
  actionType: ProductExpiryActionType;
  quantity: number;
  comment?: string | null;
  isSave: boolean;
  reducesStock: boolean;
  value: number;
  expiryDate: string; // ISO date
  dateType: ProductDateType;
  performedByUserId: string;
  performedOn: string;
};

// ─── Display metadata ───────────────────────────────────────────────────────

// Expiry status: badge tints stay within the palette the dark-mode overrides cover
// (emerald / amber / red). Expired uses a solid chip to read distinctly from Urgent.
export const STATUS_META: Record<ProductExpiryStatus, { label: string; badge: string }> = {
  Safe: { label: "Safe", badge: "bg-emerald-100 text-emerald-700" },
  ExpiringSoon: { label: "Expiring soon", badge: "bg-amber-100 text-amber-700" },
  Urgent: { label: "Urgent", badge: "bg-red-100 text-red-700" },
  Expired: { label: "Expired", badge: "bg-red-600 text-white" },
};

// Action types → the friendly disposition words the user asked for.
export const ACTION_META: Record<ProductExpiryActionType, { label: string; badge: string }> = {
  Discount: { label: "Discounted", badge: "bg-amber-100 text-amber-700" },
  Dispose: { label: "Binned", badge: "bg-red-100 text-red-700" },
  MarkSold: { label: "Sold", badge: "bg-emerald-100 text-emerald-700" },
  Donate: { label: "Donated", badge: "bg-brand-50 text-brand-700" },
  ReturnToSupplier: { label: "Returned", badge: "bg-slate-100 text-slate-600" },
  MoveToFront: { label: "Moved to front", badge: "bg-slate-100 text-slate-600" },
};

export const actionLabel = (a: ProductExpiryActionType) => ACTION_META[a]?.label ?? a;

// ─── API ────────────────────────────────────────────────────────────────────

export const productExpiryApi = {
  categories: async (shopId: string) =>
    unwrap<ProductCategory[]>((await api.get("/product-categories", { params: { shopId } })).data),

  // Active stock (remaining > 0), optionally filtered by derived status.
  list: async (shopId: string, status?: ProductExpiryStatus) =>
    unwrap<ProductBatch[]>(
      (await api.get("/product-expiry", { params: status ? { shopId, status } : { shopId } })).data,
    ),

  // Flat action history over [from, to] (yyyy-MM-dd), newest first — includes cleared batches.
  history: async (shopId: string, from: string, to: string) =>
    unwrap<ProductActionHistory[]>(
      (await api.get("/product-expiry/history", { params: { shopId, from, to } })).data,
    ),
};
