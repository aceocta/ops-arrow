import { useMemo } from "react";
import { StyleSheet } from "react-native";
import { useTheme } from "./ThemeContext";
import type { AppTheme } from "./theme";

/**
 * Theme-aware stylesheet factory. Replaces module-scope `StyleSheet.create(...)` (which bakes colours
 * at import) so a component re-creates its styles for the current theme and re-renders on theme change.
 *
 *   const useStyles = makeStyles((t) => ({ card: { backgroundColor: t.colors.surface } }));
 *   function Card() { const styles = useStyles(); ... }
 *
 * Styles are memoised per theme identity, so there's no per-render cost while the theme is stable.
 */
export function makeStyles<T extends StyleSheet.NamedStyles<T>>(factory: (theme: AppTheme) => T) {
  return function useStyles(): T {
    const theme = useTheme();
    return useMemo(() => StyleSheet.create(factory(theme)), [theme]);
  };
}
