import React from "react";
import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { appTheme } from "../ui/theme";

type ReportActionButtonProps = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  /** Force the loading state; otherwise it's inferred from an ellipsis in the label (e.g. "Sending…"). */
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
};

// Modern report action button (Print / Email / Share). Soft brand-tinted pill with a circular icon
// badge that swaps to a spinner while the action runs, press-scale feedback, and a subtle lift.
export function ReportActionButton({ icon, label, onPress, disabled, loading, style }: ReportActionButtonProps) {
  const isLoading = loading ?? (label.includes("…") || label.includes("..."));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled, busy: isLoading }}
      style={({ pressed }) => [
        styles.button,
        pressed && !disabled ? styles.buttonPressed : null,
        disabled ? styles.buttonDisabled : null,
        style,
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      <View style={styles.iconBadge}>
        {isLoading ? (
          <ActivityIndicator size="small" color={appTheme.colors.primary} />
        ) : (
          <Ionicons name={icon} size={15} color={appTheme.colors.primary} />
        )}
      </View>
      <Text style={styles.buttonText} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flex: 1,
    minHeight: 48,
    borderRadius: 999,
    backgroundColor: appTheme.colors.surfaceBrandSoft,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 7,
    paddingHorizontal: 10,
    shadowColor: appTheme.colors.primary,
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  buttonPressed: {
    backgroundColor: appTheme.colors.surfaceBrandMuted,
    transform: [{ scale: 0.97 }],
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  iconBadge: {
    width: 26,
    height: 26,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: appTheme.colors.surface,
  },
  buttonText: {
    color: appTheme.colors.primary,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 16,
  },
});
