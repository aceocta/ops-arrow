import React from "react";
import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { appTheme } from "../ui/theme";

export type ReportAction = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  /** Force the spinner; otherwise inferred from an ellipsis in the label (e.g. "Sending…"). */
  loading?: boolean;
};

type Props = {
  actions: (ReportAction | false | null | undefined)[];
  style?: StyleProp<ViewStyle>;
};

/**
 * Connected segmented action bar for report screens (Print | Email | Share). One rounded, elevated
 * container with hairline dividers; each segment shows an icon (or spinner while running) + label.
 */
export function ReportActionBar({ actions, style }: Props) {
  const items = actions.filter(Boolean) as ReportAction[];
  if (items.length === 0) return null;

  return (
    <View style={[styles.bar, style]}>
      {items.map((action, index) => {
        const loading = action.loading ?? (action.label.includes("…") || action.label.includes("..."));
        return (
          <React.Fragment key={`${action.label}-${index}`}>
            {index > 0 ? <View style={styles.divider} /> : null}
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !!action.disabled, busy: loading }}
              style={({ pressed }) => [
                styles.segment,
                pressed && !action.disabled ? styles.segmentPressed : null,
                action.disabled ? styles.segmentDisabled : null,
              ]}
              onPress={action.onPress}
              disabled={action.disabled}
            >
              {loading ? (
                <ActivityIndicator size="small" color={appTheme.colors.primary} />
              ) : (
                <Ionicons name={action.icon} size={18} color={appTheme.colors.primary} />
              )}
              <Text style={styles.segmentText} numberOfLines={1}>{action.label}</Text>
            </Pressable>
          </React.Fragment>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "stretch",
    borderRadius: appTheme.radius.md,
    backgroundColor: appTheme.colors.surface,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: appTheme.colors.borderSoft,
    shadowColor: "#0f172a",
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  segment: {
    flex: 1,
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 8,
  },
  segmentPressed: {
    backgroundColor: appTheme.colors.surfaceBrandSoft,
  },
  segmentDisabled: {
    opacity: 0.4,
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: appTheme.colors.borderSoft,
    marginVertical: 9,
  },
  segmentText: {
    color: appTheme.colors.primary,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 16,
  },
});
