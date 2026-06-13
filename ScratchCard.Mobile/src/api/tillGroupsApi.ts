import { apiClient } from "./client";
import { ApiResponse } from "./types";
import { FieldCode } from "./tillReconciliationApi";

// A reconciliation group (section). Built-ins (shopId null) are read-only; custom ones belong to a shop.
export type TillGroup = {
  id: string;
  shopId?: string | null;
  code: string;
  displayName: string;
  sortOrder: number;
  isActive: boolean;
  isBuiltIn: boolean;
};

// Built-in groups + this shop's custom groups, ordered by sort.
export async function listTillGroups(shopId: string): Promise<TillGroup[]> {
  const res = await apiClient.get<ApiResponse<TillGroup[]>>("/till-groups", { params: { shopId } });
  return res.data.data;
}

export async function createTillGroup(input: { shopId: string; displayName: string; sortOrder?: number }): Promise<TillGroup> {
  const res = await apiClient.post<ApiResponse<TillGroup>>("/till-groups", input);
  return res.data.data;
}

export async function updateTillGroup(input: { id: string; displayName: string; sortOrder: number; isActive?: boolean }): Promise<TillGroup> {
  const res = await apiClient.put<ApiResponse<TillGroup>>("/till-groups", { isActive: true, ...input });
  return res.data.data;
}

export async function deleteTillGroup(id: string): Promise<void> {
  await apiClient.delete<ApiResponse<boolean>>(`/till-groups/${id}`);
}

// ---------------------------------------------------------------------------
// Per-shop field → group assignment (writes a TillFieldOverride.GroupCode).
// ---------------------------------------------------------------------------
export type TillFieldOverride = {
  id: string;
  shopId: string;
  canonicalField: FieldCode;
  fieldName: string;
  groupCode?: string | null;
  defaultGroupCode: string;
};

// Flat list of active catalogue fields with their default (built-in) group.
export type TillFieldRow = { code: FieldCode; displayName: string; groupCode: string; groupName: string };
export async function listTillFields(): Promise<TillFieldRow[]> {
  const res = await apiClient.get<ApiResponse<TillFieldRow[]>>("/till-fields");
  return res.data.data;
}

export async function listTillFieldOverrides(shopId: string): Promise<TillFieldOverride[]> {
  const res = await apiClient.get<ApiResponse<TillFieldOverride[]>>("/till-field-overrides", { params: { shopId } });
  return res.data.data;
}

// Set (or clear, with groupCode null) the group a field lands in for this shop.
export async function assignFieldGroup(input: { shopId: string; canonicalField: FieldCode; groupCode: string | null }): Promise<TillFieldOverride> {
  const res = await apiClient.post<ApiResponse<TillFieldOverride>>("/till-field-overrides", input);
  return res.data.data;
}
