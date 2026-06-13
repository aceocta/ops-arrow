import React from "react";
import { Pressable, StyleSheet, Text, View, ViewStyle } from "react-native";
import { appTheme } from "../ui/theme";

export type SegmentedOption<T extends string> = {
  value: T;
  label: string;
  /** Blocks selection entirely (no onChange fired). */
  disabled?: boolean;
  /** Visually dimmed but still pressable — e.g. a locked option that routes to an upsell. */
  dimmed?: boolean;
};

type Props<T extends string> = {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Extra style for the track (e.g. { flex: 1 } inside a row, or marginTop). */
  style?: ViewStyle;
};

/**
 * iOS-style segmented control: a muted track with the selected option raised as a pill. The single,
 * shared style for mutually-exclusive option pickers (period/view/mode toggles) across the app.
 */
export function SegmentedControl<T extends string>({ options, value, onChange, style }: Props<T>) {
  return (
    <View style={[styles.track, style]}>
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            style={[styles.btn, selected ? styles.btnActive : null, opt.dimmed ? styles.btnDimmed : null]}
            onPress={() => {
              if (opt.disabled) return;
              onChange(opt.value);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected, disabled: opt.disabled }}
          >
            <Text style={[styles.text, selected ? styles.textActive : null]} numberOfLines={1}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: "row",
    backgroundColor: appTheme.colors.surfaceMuted,
    borderRadius: appTheme.radius.md,
    padding: 3,
  },
  btn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    borderRadius: appTheme.radius.sm,
  },
  btnActive: {
    backgroundColor: appTheme.colors.surface,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
  },
  btnDimmed: { opacity: 0.5 },
  text: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.bodyMedium, fontSize: 13 },
  textActive: { color: appTheme.colors.text },
});
