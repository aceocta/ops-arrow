import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ShopEntitlementsResponse, ShopSubscriptionSummary } from "../../api/subscriptionApi";

const ENTITLEMENTS_CACHE_KEY_PREFIX = "opsarrow_shop_entitlements_v1:";

// Mirrors the granular keys in ScratchCard.Domain.Constants.FeatureKeys. Kept as `string`
// for forward-compat so backend can ship new keys without a mobile release; specific keys are
// listed below for IDE autocomplete and documentation.
export type EntitlementFeature =
  | "ScratchCardManagement" | "TemperatureLog" | "RefusalNoIdNoSale" | "ComplianceChecklist" | "SafeDropManagement"
  | "scratch_card.basic" | "scratch_card.attachments" | "scratch_card.manual_entry_alerts"
  | "scratch_card.advanced_validation" | "scratch_card.manual_correction_reasons" | "scratch_card.suspicious_alerts"
  | "temperature_log.basic" | "temperature_log.missed_alerts" | "temperature_log.scheduled_checks" | "temperature_log.full_history"
  | "refusal_log.basic" | "refusal_log.attachments" | "refusal_log.multi_manager_review"
  | "refusal_log.analytics" | "refusal_log.staff_reports"
  | "compliance.basic" | "compliance.daily_weekly_monthly" | "compliance.advanced" | "compliance.photo_evidence"
  | "safe_drop.basic" | "safe_drop.canister_limit_alerts"
  | "safe_drop.approval_workflow" | "safe_drop.cash_variance"
  | "notifications.email" | "notifications.push" | "notifications.whatsapp" | "notifications.priority"
  | "dashboard.basic" | "dashboard.advanced" | "dashboard.multi_shop"
  | "audit_log.basic" | "approval_workflow.manager" | "reports.advanced" | "support.priority"
  | (string & {});

export type Entitlements = {
  shopId: string | null;
  companyId: string | null;
  tier: string | null;
  status: string | null;
  features: EntitlementFeature[];
  isActive: boolean;
  isInTrial: boolean;
  inGracePeriod: boolean;
  expiresAt: string | null;
  trialDaysRemaining: number | null;
  maxUsers: number | null;
  reportExportsPerMonth: number | null;
  cachedAt: string;
};

const ACTIVE_STATUSES = ["active", "trialactive"];
const GRACE_STATUSES = ["pastdue", "paymentfailed"];

function cacheKey(shopId: string) {
  return `${ENTITLEMENTS_CACHE_KEY_PREFIX}${shopId}`;
}

export function deriveEntitlementsFromSummary(summary: ShopSubscriptionSummary | null | undefined): Entitlements {
  if (!summary) {
    return {
      shopId: null,
      companyId: null,
      tier: null,
      status: null,
      features: [],
      isActive: false,
      isInTrial: false,
      inGracePeriod: false,
      expiresAt: null,
      trialDaysRemaining: null,
      maxUsers: null,
      reportExportsPerMonth: null,
      cachedAt: new Date().toISOString(),
    };
  }

  const normalizedStatus = String(summary.status).toLowerCase();
  const isInTrial = normalizedStatus === "trialactive" || (summary.trialDaysRemaining ?? 0) > 0;
  const isActive = ACTIVE_STATUSES.includes(normalizedStatus) || isInTrial;
  const inGracePeriod = GRACE_STATUSES.includes(normalizedStatus);

  return {
    shopId: summary.shopId,
    companyId: summary.companyId,
    tier: summary.planName,
    status: summary.status,
    features: (summary.includedFeatures ?? []) as EntitlementFeature[],
    isActive,
    isInTrial,
    inGracePeriod,
    expiresAt: summary.currentPeriodEndsOn ?? summary.trialEndsOn ?? null,
    trialDaysRemaining: summary.trialDaysRemaining ?? null,
    maxUsers: summary.maxUsers ?? null,
    reportExportsPerMonth: summary.reportExportsPerMonth ?? null,
    cachedAt: new Date().toISOString(),
  };
}

export function fromShopEntitlementsResponse(response: ShopEntitlementsResponse): Entitlements {
  return {
    shopId: response.shopId,
    companyId: response.companyId,
    tier: response.tier,
    status: response.status,
    features: (response.features ?? []) as EntitlementFeature[],
    isActive: response.isActive,
    isInTrial: response.isInTrial,
    inGracePeriod: response.inGracePeriod,
    expiresAt: response.expiresAt,
    trialDaysRemaining: response.trialDaysRemaining,
    maxUsers: response.maxUsers ?? null,
    reportExportsPerMonth: response.reportExportsPerMonth ?? null,
    cachedAt: new Date().toISOString(),
  };
}

export async function cacheEntitlements(entitlements: Entitlements) {
  if (!entitlements.shopId) return;
  try {
    await AsyncStorage.setItem(cacheKey(entitlements.shopId), JSON.stringify(entitlements));
  } catch {
    // best-effort
  }
}

export async function loadCachedEntitlements(shopId: string | null | undefined): Promise<Entitlements | null> {
  if (!shopId) return null;
  try {
    const raw = await AsyncStorage.getItem(cacheKey(shopId));
    if (!raw) return null;
    return JSON.parse(raw) as Entitlements;
  } catch {
    return null;
  }
}

export async function clearCachedEntitlements(shopId: string | null | undefined) {
  if (!shopId) return;
  try {
    await AsyncStorage.removeItem(cacheKey(shopId));
  } catch {
    // best-effort
  }
}

export function hasFeature(entitlements: Entitlements | null | undefined, feature: EntitlementFeature) {
  if (!entitlements) return false;
  if (!entitlements.isActive && !entitlements.inGracePeriod) return false;
  if (!entitlements.features || entitlements.features.length === 0) return false;
  return entitlements.features.includes(feature);
}
