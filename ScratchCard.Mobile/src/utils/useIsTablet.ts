import { useWindowDimensions } from "react-native";

/**
 * Device-class detection by viewport width. Tablet threshold matches the conventional
 * iPad mini portrait width (768px) — anything at or above that is treated as a tablet.
 * Updates live on rotation because it's backed by useWindowDimensions.
 *
 * Used to gate tablet-only layout tweaks (wider drawer, capped content max-width, etc.)
 * without affecting phones at all.
 */
const TABLET_MIN_WIDTH = 768;

export function useIsTablet(): boolean {
  const { width } = useWindowDimensions();
  return width >= TABLET_MIN_WIDTH;
}
