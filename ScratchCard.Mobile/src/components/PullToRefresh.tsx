import React from "react";
import { RefreshControl } from "react-native";

export function usePullToRefresh(refetch: () => Promise<unknown>, isRefetching: boolean) {
  return React.useMemo(
    () => <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />,
    [isRefetching, refetch]
  );
}
