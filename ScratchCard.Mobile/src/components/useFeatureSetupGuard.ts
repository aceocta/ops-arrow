import type { MainStackParamList } from "../types/navigation";

export type FeatureSetupStep = {
  key: string;
  label: string;
  route: keyof MainStackParamList;
  done: boolean;
};

export type FeatureSetupStatus = {
  status: "loading" | "ok" | "incomplete";
  missing: FeatureSetupStep[];
};

/**
 * Guard helper for feature screens whose required setup can be incomplete (e.g. Temperature Log
 * needs units + check times before it's usable). The caller supplies the ordered steps with their
 * done flags — derived from queries it already runs — so nothing is fetched twice. Returns:
 *   - "loading"    while the underlying data is still loading (render the screen / a skeleton),
 *   - "incomplete" with the missing steps (render a FeatureSetupPrompt instead of the screen),
 *   - "ok"         when every step is done (render the screen normally).
 *
 * Generic by design: Store Sales (tills + payment types), Staff Rota (shifts), etc. can adopt it by
 * passing their own steps. It calls no React hooks, but keep the call unconditional / at the top of
 * the component (before any early return) to satisfy the rules-of-hooks lint.
 */
export function useFeatureSetupGuard(input: {
  enabled: boolean;
  isLoading: boolean;
  steps: FeatureSetupStep[];
}): FeatureSetupStatus {
  if (!input.enabled) return { status: "ok", missing: [] };
  if (input.isLoading) return { status: "loading", missing: [] };
  const missing = input.steps.filter((s) => !s.done);
  return { status: missing.length === 0 ? "ok" : "incomplete", missing };
}
