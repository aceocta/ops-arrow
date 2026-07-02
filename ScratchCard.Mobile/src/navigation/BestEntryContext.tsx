import React, { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type EntryOperation = "scratchCard" | "temperature" | "refusals" | "checklist" | "compliance";

const STORAGE_KEY = "best-entry-operation:v1";
const VALID: EntryOperation[] = ["scratchCard", "temperature", "refusals", "checklist", "compliance"];

type BestEntryContextValue = {
  selectedOperation: EntryOperation | null;
  setSelectedOperation: (operation: EntryOperation | null) => void;
};

const BestEntryContext = createContext<BestEntryContextValue | undefined>(undefined);

export function BestEntryProvider({ children }: PropsWithChildren) {
  const [selectedOperation, setSelectedOperationState] = useState<EntryOperation | null>(null);

  // Restore the last-used operation mode so a backgrounded / restarted app keeps the user's workflow
  // highlight instead of resetting to the neutral home state.
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (active && raw && (VALID as string[]).includes(raw)) setSelectedOperationState(raw as EntryOperation);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  // Persist on change (only from explicit sets, so the initial null never clobbers a stored value).
  const setSelectedOperation = useCallback((operation: EntryOperation | null) => {
    setSelectedOperationState(operation);
    if (operation) void AsyncStorage.setItem(STORAGE_KEY, operation).catch(() => undefined);
    else void AsyncStorage.removeItem(STORAGE_KEY).catch(() => undefined);
  }, []);

  const value = useMemo(
    () => ({ selectedOperation, setSelectedOperation }),
    [selectedOperation, setSelectedOperation]
  );

  return <BestEntryContext.Provider value={value}>{children}</BestEntryContext.Provider>;
}

export function useBestEntry() {
  const context = useContext(BestEntryContext);
  if (!context) {
    throw new Error("useBestEntry must be used within BestEntryProvider.");
  }

  return context;
}
