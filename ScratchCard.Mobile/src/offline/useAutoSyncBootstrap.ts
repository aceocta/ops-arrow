import { useEffect } from "react";
import { subscribeAutoSync } from "./syncService";

export function useAutoSyncBootstrap() {
  useEffect(() => {
    const unsubscribe = subscribeAutoSync();
    return () => unsubscribe();
  }, []);
}
