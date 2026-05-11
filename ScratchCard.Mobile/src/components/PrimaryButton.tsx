import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { appTheme } from "../ui/theme";

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: "primary" | "neutral" | "danger";
  size?: "sm" | "md";
};

export function PrimaryButton({ label, onPress, disabled, tone = "primary", size = "md" }: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        tone === "neutral" && styles.buttonNeutral,
        tone === "danger" && styles.buttonDanger,
        size === "sm" && styles.buttonSmall,
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Text style={[styles.text, tone === "neutral" && styles.textAlt, size === "sm" && styles.textSmall]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: appTheme.colors.primary,
    borderRadius: appTheme.radius.md,
    paddingVertical: 12,
    paddingHorizontal: 16,
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: appTheme.colors.primaryPressed,
    overflow: "hidden",
    shadowColor: appTheme.colors.primary,
    shadowOpacity: 0.14,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  buttonSmall: {
    minHeight: 38,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  buttonNeutral: {
    backgroundColor: appTheme.colors.surfaceMuted,
    borderColor: appTheme.colors.borderStrong,
  },
  buttonDanger: {
    backgroundColor: appTheme.colors.danger,
    borderColor: "#9A3128",
  },
  pressed: { opacity: 0.92, transform: [{ scale: 0.995 }] },
  disabled: { backgroundColor: "#AEB3AE", borderColor: "#AEB3AE" },
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
