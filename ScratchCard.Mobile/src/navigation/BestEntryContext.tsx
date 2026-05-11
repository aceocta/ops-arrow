import React, { createContext, PropsWithChildren, useContext, useMemo, useState } from "react";

export type EntryOperation = "scratchCard" | "temperature" | "refusals";

type BestEntryContextValue = {
  selectedOperation: EntryOperation | null;
  setSelectedOperation: (operation: EntryOperation | null) => void;
};

const BestEntryContext = createContext<BestEntryContextValue | undefined>(undefined);

export function BestEntryProvider({ children }: PropsWithChildren) {
  const [selectedOperation, setSelectedOperation] = useState<EntryOperation | null>(null);

  const value = useMemo(
    () => ({
      selectedOperation,
      setSelectedOperation,
    }),
    [selectedOperation]
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
