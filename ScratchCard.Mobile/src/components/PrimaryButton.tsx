import React, { useCallback } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { appTheme } from "../ui/theme";

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: "primary" | "neutral" | "danger" | "success";
  size?: "sm" | "md";
  /** Disable haptic feedback (defaults to enabled on press-in). */
  haptic?: boolean;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const PRESS_SPRING = { damping: 14, stiffness: 280, mass: 0.6 } as const;

export function PrimaryButton({ label, onPress, disabled, tone = "primary", size = "md", haptic = true }: Props) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = useCallback(() => {
    scale.value = withSpring(0.96, PRESS_SPRING);
    if (haptic && !disabled) {
      void Haptics.selectionAsync().catch(() => undefined);
    }
  }, [scale, haptic, disabled]);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, PRESS_SPRING);
  }, [scale]);

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      style={[
        styles.button,
        tone === "neutral" && styles.buttonNeutral,
        tone === "danger" && styles.buttonDanger,
        tone === "success" && styles.buttonSuccess,
        size === "sm" && styles.buttonSmall,
        disabled && styles.disabled,
        animatedStyle,
      ]}
    >
      <Text style={[styles.text, tone === "neutral" && styles.textAlt, size === "sm" && styles.textSmall]}>{label}</Text>
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
    overflow: "hidden",
  },
  buttonSmall: {
    minHeight: 38,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  buttonNeutral: {
    backgroundColor: appTheme.colors.surfaceTintSoft,
  },
  buttonDanger: {
    backgroundColor: appTheme.colors.danger,
  },
  buttonSuccess: {
    backgroundColor: appTheme.colors.success,
  },
  disabled: { backgroundColor: appTheme.colors.borderStrong },
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
});
