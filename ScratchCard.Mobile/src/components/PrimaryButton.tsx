import React, { useCallback } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { appTheme } from "../ui/theme";

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  /** Shows a spinner, disables the button and announces a busy state to screen readers. */
  loading?: boolean;
  tone?: "primary" | "neutral" | "danger" | "success";
  size?: "sm" | "md";
  /** Optional Ionicons name rendered before the label. */
  icon?: keyof typeof Ionicons.glyphMap;
  /** Disable haptic feedback (defaults to enabled on press-in). */
  haptic?: boolean;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const PRESS_SPRING = { damping: 14, stiffness: 280, mass: 0.6 } as const;

// Small size is under the 44pt target, so extend the tappable area without changing its footprint.
const SMALL_HIT_SLOP = { top: 6, bottom: 6, left: 6, right: 6 } as const;

export function PrimaryButton({
  label,
  onPress,
  disabled,
  loading = false,
  tone = "primary",
  size = "md",
  icon,
  haptic = true,
}: Props) {
  const scale = useSharedValue(1);
  const isDisabled = Boolean(disabled) || loading;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = useCallback(() => {
    scale.value = withSpring(0.96, PRESS_SPRING);
    if (haptic && !isDisabled) {
      void Haptics.selectionAsync().catch(() => undefined);
    }
  }, [scale, haptic, isDisabled]);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, PRESS_SPRING);
  }, [scale]);

  const contentColor =
    isDisabled
      ? appTheme.colors.textSubtle
      : tone === "neutral"
        ? appTheme.colors.text
        : appTheme.colors.onPrimary;

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      hitSlop={size === "sm" ? SMALL_HIT_SLOP : undefined}
      style={[
        styles.button,
        tone === "neutral" && styles.buttonNeutral,
        tone === "danger" && styles.buttonDanger,
        tone === "success" && styles.buttonSuccess,
        size === "sm" && styles.buttonSmall,
        isDisabled && styles.disabled,
        animatedStyle,
      ]}
    >
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator size="small" color={contentColor} />
        ) : icon ? (
          <Ionicons name={icon} size={size === "sm" ? 14 : 16} color={contentColor} style={styles.icon} />
        ) : null}
        <Text
          style={[
            styles.text,
            tone === "neutral" && styles.textAlt,
            size === "sm" && styles.textSmall,
            isDisabled && styles.textDisabled,
          ]}
        >
          {label}
        </Text>
      </View>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: appTheme.colors.primary,
    borderRadius: appTheme.radius.pill,
    paddingVertical: 12,
    paddingHorizontal: 18,
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 0,
    // Soft brand-tinted lift so the primary action reads as elevated (iOS colour, Android elevation).
    shadowColor: appTheme.colors.primary,
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  buttonSmall: {
    minHeight: 38,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  buttonNeutral: {
    backgroundColor: appTheme.colors.surfaceTintSoft,
    borderWidth: 1,
    borderColor: appTheme.colors.borderSoft,
    shadowOpacity: 0,
    elevation: 0,
  },
  buttonDanger: {
    backgroundColor: appTheme.colors.danger,
    shadowColor: appTheme.colors.danger,
  },
  buttonSuccess: {
    backgroundColor: appTheme.colors.success,
    shadowColor: appTheme.colors.success,
  },
  disabled: { backgroundColor: appTheme.colors.surfaceMuted, borderWidth: 1, borderColor: appTheme.colors.borderSoft, shadowOpacity: 0, elevation: 0 },
  content: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  icon: {
    marginLeft: -2,
  },
  text: {
    color: appTheme.colors.onPrimary,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 18,
  },
  textAlt: {
    color: appTheme.colors.text,
  },
  textSmall: {
    fontSize: 13,
    lineHeight: 16,
  },
  // Readable label during "Saving…"/"Sending…" busy states (previously near-white on a near-white bg).
  textDisabled: {
    color: appTheme.colors.textSubtle,
  },
});
