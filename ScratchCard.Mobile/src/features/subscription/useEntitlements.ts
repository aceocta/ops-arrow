import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
  const [cached, setCached] = useState<Entitlements | null>(null);
  const [cacheLoaded, setCacheLoaded] = useState(false);

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
