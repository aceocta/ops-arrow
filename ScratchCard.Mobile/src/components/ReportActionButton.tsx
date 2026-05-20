import React from "react";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleProp, StyleSheet, Text, ViewStyle } from "react-native";
import { appTheme } from "../ui/theme";

type ReportActionButtonProps = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function ReportActionButton({ icon, label, onPress, disabled, style }: ReportActionButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      style={[styles.button, disabled ? styles.buttonDisabled : null, style]}
      onPress={onPress}
      disabled={disabled}
    >
      <Ionicons name={icon} size={16} color={appTheme.colors.primary} />
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flex: 1,
    minHeight: 42,
    borderWidth: 0,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceTintSoft,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 10,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: appTheme.colors.primary,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 15,
  },
});
