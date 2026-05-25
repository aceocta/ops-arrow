import { useMemo } from "react";
import { useEntitlements } from "./useEntitlements";
import type { EntitlementFeature } from "./entitlements";

type UseFeatureResult = {
  isAllowed: boolean;
  isLoading: boolean;
  tier: string | null;
  isInTrial: boolean;
  inGracePeriod: boolean;
};

export function useFeature(feature: EntitlementFeature): UseFeatureResult {
  const { entitlements, isLoading, hasFeature } = useEntitlements();

  return useMemo<UseFeatureResult>(() => {
    return {
      isAllowed: hasFeature(feature),
      isLoading,
      tier: entitlements?.tier ?? null,
      isInTrial: entitlements?.isInTrial ?? false,
      inGracePeriod: entitlements?.inGracePeriod ?? false,
    };
  }, [feature, hasFeature, isLoading, entitlements?.tier, entitlements?.isInTrial, entitlements?.inGracePeriod]);
}
