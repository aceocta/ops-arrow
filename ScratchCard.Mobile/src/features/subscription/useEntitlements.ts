import { useEffect, useMemo, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getShopEntitlements } from "../../api/subscriptionApi";
import { useAuth } from "../../auth/AuthContext";
import {
  cacheEntitlements,
  Entitlements,
  EntitlementFeature,
  fromShopEntitlementsResponse,
  hasFeature,
  loadCachedEntitlements,
} from "./entitlements";

type UseEntitlementsResult = {
  entitlements: Entitlements | null;
  isLoading: boolean;
  isFromCache: boolean;
  refresh: () => Promise<unknown>;
  hasFeature: (feature: EntitlementFeature) => boolean;
};

export function useEntitlements(): UseEntitlementsResult {
  const { activeShopId, isAuthenticated } = useAuth();
  const shopId = activeShopId;
  const queryClient = useQueryClient();
  const [cached, setCached] = useState<Entitlements | null>(null);
  const [cacheLoaded, setCacheLoaded] = useState(false);

  // Whenever the app returns to the foreground (e.g. after the user finishes Stripe Checkout
  // in the external browser and switches back) we invalidate the entitlement query so the gate
  // flips as soon as the webhook lands on the backend.
  useEffect(() => {
    const handleAppStateChange = (state: AppStateStatus) => {
      if (state === "active") {
        void queryClient.invalidateQueries({ queryKey: ["shop-entitlements"] });
        void queryClient.invalidateQueries({ queryKey: ["shop-subscription-summary"] });
        void queryClient.invalidateQueries({ queryKey: ["shop-subscription-summary-root"] });
      }
    };
    const subscription = AppState.addEventListener("change", handleAppStateChange);
    return () => subscription.remove();
  }, [queryClient]);

  useEffect(() => {
    let cancelled = false;
    setCacheLoaded(false);
    setCached(null);
    void loadCachedEntitlements(shopId).then((loaded) => {
      if (cancelled) return;
      setCached(loaded);
      setCacheLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [shopId]);

  const query = useQuery({
    queryKey: ["shop-entitlements", shopId],
    queryFn: () => getShopEntitlements(shopId as string),
    enabled: isAuthenticated && Boolean(shopId),
    staleTime: 5 * 60 * 1000,
  });

  const liveEntitlements = useMemo(() => {
    if (!query.data) return null;
    return fromShopEntitlementsResponse(query.data);
  }, [query.data]);

  useEffect(() => {
    if (liveEntitlements) {
      void cacheEntitlements(liveEntitlements);
      setCached(liveEntitlements);
    }
  }, [liveEntitlements]);

  const entitlements = liveEntitlements ?? cached;
  const isFromCache = !liveEntitlements && Boolean(cached);

  return {
    entitlements,
    isLoading: !cacheLoaded || query.isLoading,
    isFromCache,
    refresh: () => query.refetch(),
    hasFeature: (feature) => hasFeature(entitlements, feature),
  };
}
