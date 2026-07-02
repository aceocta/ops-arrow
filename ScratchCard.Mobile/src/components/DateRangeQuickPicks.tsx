import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View, ViewStyle } from "react-native";
import { formatDateValue } from "./DateTimeField";
import { appTheme } from "../ui/theme";

type Props = {
  /** Current selected range (so the matching preset highlights). */
  from: string;
  to: string;
  onSelect: (from: string, to: string) => void;
  style?: ViewStyle;
};

/**
 * Segmented Today / 7 days / 30 days quick-range selector. Sets the from/to dates to a preset window;
 * the preset that matches the current range is highlighted. Pair it above a from/to date-field row.
 */
export function DateRangeQuickPicks({ from, to, onSelect, style }: Props) {
  const presets = useMemo(() => {
    const today = new Date();
    const todayStr = formatDateValue(today);
    const daysBack = (n: number) => {
      const d = new Date(today);
      d.setDate(d.getDate() - n);
      return formatDateValue(d);
    };
    return [
      { key: "today", label: "Today", from: todayStr, to: todayStr },
      { key: "7d", label: "7 days", from: daysBack(6), to: todayStr },
      { key: "30d", label: "30 days", from: daysBack(29), to: todayStr },
    ];
  }, []);

  return (
    <View style={[styles.row, style]}>
      {presets.map((p) => {
        const active = p.from === from && p.to === to;
        return (
          <Pressable
            key={p.key}
            style={[styles.chip, active ? styles.chipActive : null]}
            onPress={() => onSelect(p.from, p.to)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>{p.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 2,
    padding: 3,
    borderRadius: 999,
    backgroundColor: appTheme.colors.surfaceMuted,
  },
  chip: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    minHeight: 44,
    borderRadius: 999,
  },
  chipActive: {
    backgroundColor: appTheme.colors.surface,
    shadowColor: appTheme.colors.shadow,
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  chipText: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.bodyMedium, fontSize: 13 },
  chipTextActive: { color: appTheme.colors.primary, fontFamily: appTheme.fonts.bodyMedium },
});
