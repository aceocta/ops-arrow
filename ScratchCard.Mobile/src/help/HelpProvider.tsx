import React, { createContext, useCallback, useContext, useState } from "react";
import { HowItWorksSheet } from "../components/HowItWorksSheet";
import { HELP_CONTENT, hasHelpFor } from "./helpContent";

type HelpContextValue = {
  /** Open the help sheet for a route. No-op if the route has no registered help. */
  openHelp: (routeName: string) => void;
  /** Whether a route has help (drives the header (?) visibility). */
  hasHelp: (routeName?: string) => boolean;
};

const HelpContext = createContext<HelpContextValue>({ openHelp: () => {}, hasHelp: () => false });

export const useHelp = () => useContext(HelpContext);

/** Holds the single, shared "how it works" sheet and exposes open/has helpers to the whole app. */
export function HelpProvider({ children }: { children: React.ReactNode }) {
  const [routeName, setRouteName] = useState<string | null>(null);

  const openHelp = useCallback((name: string) => {
    if (hasHelpFor(name)) setRouteName(name);
  }, []);

  const content = routeName ? HELP_CONTENT[routeName] : null;

  return (
    <HelpContext.Provider value={{ openHelp, hasHelp: hasHelpFor }}>
      {children}
      <HowItWorksSheet
        visible={Boolean(content)}
        title={content?.title ?? ""}
        steps={content?.steps ?? []}
        onClose={() => setRouteName(null)}
      />
    </HelpContext.Provider>
  );
}
