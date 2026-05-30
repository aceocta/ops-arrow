import React, { PropsWithChildren, useEffect, useRef } from "react";
import { Animated, StyleProp, ViewStyle } from "react-native";
import { appTheme } from "../ui/theme";

type RowFlashTone = "success" | "warning" | "info";

type RowFlashProps = PropsWithChildren<{
  /**
   * When this value changes (after initial mount), the row briefly tints the success colour.
   * Typical usage: pass a value that the parent bumps on a successful mutation — e.g. the
   * row's `reviewedOn` timestamp, `timeOut` string, or a counter.
   */
  flashKey?: string | number | null;
  /** Tone of the flash. Defaults to success (green). */
  tone?: RowFlashTone;
  /** Total flash duration in ms (rise + fade). Defaults to 600. */
  durationMs?: number;
  style?: StyleProp<ViewStyle>;
}>;

const TONE_TO_TINT: Record<RowFlashTone, string> = {
  success: appTheme.colors.surfaceSuccessSoft ?? "rgba(16, 185, 129, 0.18)",
  warning: appTheme.colors.surfaceWarningSoft ?? "rgba(245, 158, 11, 0.18)",
  info: appTheme.colors.surfaceInfoMuted ?? "rgba(59, 130, 246, 0.18)",
};

/**
 * Wraps a row and briefly tints its background when `flashKey` changes — signals "yes, this
 * row was just updated" without needing a toast or modal. Cheap cosmetic confirmation; ignores
 * the first render so screens that mount with already-set values don't flash on load.
 */
export function RowFlash({ children, flashKey, tone = "success", durationMs = 600, style }: RowFlashProps) {
  const previousKey = useRef(flashKey);
  const initialMount = useRef(true);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (initialMount.current) {
      initialMount.current = false;
      previousKey.current = flashKey;
      return;
    }

    // Flash only when the key actually changes to a non-null value. Going to null = no flash
    // (think: undoing a state, no celebration needed).
    if (flashKey != null && flashKey !== previousKey.current) {
      anim.setValue(1);
      Animated.timing(anim, {
        toValue: 0,
        duration: durationMs,
        useNativeDriver: false,
      }).start();
    }

    previousKey.current = flashKey;
  }, [flashKey, anim, durationMs]);

  const backgroundColor = anim.interpolate({
    inputRange: [0, 1],
    outputRange: ["transparent", TONE_TO_TINT[tone]],
  });

  return <Animated.View style={[style, { backgroundColor }]}>{children}</Animated.View>;
}
