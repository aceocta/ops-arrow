import React, { createContext, useContext } from "react";
import { darkTheme, lightTheme, resolvedColorScheme, type AppTheme } from "./theme";

// The theme resolved at launch (matches the static `appTheme`). Used as the context default so a
// component calling useTheme() outside the provider still gets correct colours rather than crashing.
const launchTheme: AppTheme = resolvedColorScheme === "dark" ? darkTheme : lightTheme;

const ThemeContext = createContext<AppTheme>(launchTheme);

/**
 * Provides the active theme to `useTheme()` consumers.
 *
 * For now it serves the launch-resolved theme, identical to the static `appTheme`, so migrated and
 * un-migrated screens stay perfectly consistent while the app is partway through migration.
 *
 * TO ENABLE LIVE LIGHT/DARK SWITCHING (do this only once every screen reads useTheme(), otherwise a
 * switch would leave un-migrated screens on the old theme = a half-themed app):
 *   - hold the mode in state, resolve light/dark/system to a concrete theme,
 *   - subscribe to `Appearance.addChangeListener` while mode === "system",
 *   - expose a `setMode` that updates state instead of reloading the app (SettingsScreens currently
 *     calls reloadAppAsync after persisting the preference).
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return <ThemeContext.Provider value={launchTheme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): AppTheme {
  return useContext(ThemeContext);
}
