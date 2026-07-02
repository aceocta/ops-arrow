import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { appTheme } from "../ui/theme";

type ChipProps = {
  label: string;
  onPress: () => void;
  selected?: boolean;
  disabled?: boolean;
  /** Optional Ionicons name rendered before the label. */
  icon?: keyof typeof Ionicons.glyphMap;
  /** Overrides the announced label; defaults to `label`. */
  accessibilityLabel?: string;
};

/**
 * Shared selectable pill. Replaces the many hand-rolled chip idioms across the app so touch targets
 * and screen-reader semantics are consistent: a 40pt body plus hitSlop clears the 44pt guideline, and
 * selected/disabled state is exposed to assistive tech (not conveyed by colour alone).
 */
export function Chip({ label, onPress, selected = false, disabled = false, icon, accessibilityLabel }: ChipProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected, disabled }}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.chipSelected,
        disabled && styles.chipDisabled,
        pressed && !disabled && styles.chipPressed,
      ]}
    >
      <View style={styles.content}>
        {icon ? (
          <Ionicons
            name={icon}
            size={15}
            color={selected ? appTheme.colors.textBrandStrong : appTheme.colors.textMuted}
          />
        ) : null}
        <Text style={[styles.label, selected && styles.labelSelected]} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: appTheme.radius.pill,
    borderWidth: 1,
    borderColor: appTheme.colors.borderSoft,
    backgroundColor: appTheme.colors.surfaceMuted,
  },
  chipSelected: {
    backgroundColor: appTheme.colors.surfaceBrandSoft,
    borderColor: appTheme.colors.primary,
  },
  chipDisabled: {
    opacity: 0.5,
  },
  chipPressed: {
    opacity: 0.7,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  label: {
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 17,
    color: appTheme.colors.textMuted,
  },
  labelSelected: {
    color: appTheme.colors.textBrandStrong,
  },
});
