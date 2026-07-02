import React from "react";
import { Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { appTheme } from "../ui/theme";

type IconButtonTone = "default" | "primary" | "danger";

type IconButtonProps = {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  /** Required — icon-only controls are invisible to screen readers without a label. */
  accessibilityLabel: string;
  tone?: IconButtonTone;
  /** Icon glyph size; the tappable area stays a fixed 44pt regardless. */
  size?: number;
  disabled?: boolean;
};

const TONE_COLOR: Record<IconButtonTone, keyof typeof appTheme.colors> = {
  default: "textMuted",
  primary: "primary",
  danger: "danger",
};

/**
 * Shared icon-only button with a guaranteed 44pt hit area and a required accessibility label.
 * Replaces the ad-hoc 32-34pt icon Pressables used for edit/delete/close actions across the app.
 */
export function IconButton({ icon, onPress, accessibilityLabel, tone = "default", size = 20, disabled = false }: IconButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      hitSlop={4}
      style={({ pressed }) => [styles.button, disabled && styles.disabled, pressed && !disabled && styles.pressed]}
    >
      <Ionicons name={icon} size={size} color={appTheme.colors[TONE_COLOR[tone]]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: appTheme.radius.pill,
  },
  disabled: {
    opacity: 0.4,
  },
  pressed: {
    opacity: 0.6,
    backgroundColor: appTheme.colors.surfaceMuted,
  },
});
