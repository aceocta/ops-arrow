import React from "react";
import { StyleSheet, Text, View, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { appTheme } from "../ui/theme";

type SectionHeaderProps = {
  title: string;
  subtitle?: string;
  /** Optional leading icon. Renders inside a tinted square so each section reads as a
   *  distinct surface — used to differentiate feature groups (Safe Drop, Compliance, etc.). */
  icon?: keyof typeof Ionicons.glyphMap;
  /** Right-aligned slot. Use for a StatusBadge, count chip, action button, or chevron. */
  right?: React.ReactNode;
  /** Margin under the title block, used to space it from the section's content. */
  spacing?: "tight" | "normal";
  style?: ViewStyle | ViewStyle[];
};

export function SectionHeader({
  title,
  subtitle,
  icon,
  right,
  spacing = "normal",
  style,
}: SectionHeaderProps) {
  return (
    <View
      style={[
        styles.row,
        spacing === "tight" ? styles.rowTight : null,
        style,
      ]}
    >
      <View style={styles.left}>
        {icon ? (
          <View style={styles.iconTile}>
            <Ionicons name={icon} size={14} color={appTheme.colors.primary} />
          </View>
        ) : null}
        <View style={styles.textBlock}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle} numberOfLines={2}>{subtitle}</Text> : null}
        </View>
      </View>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: appTheme.spacing.sm,
  },
  rowTight: {
    marginBottom: 0,
  },
  left: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: appTheme.spacing.xs,
  },
  iconTile: {
    width: 26,
    height: 26,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: appTheme.colors.surfaceBrandSoft,
  },
  textBlock: {
    flex: 1,
    gap: 2,
  },
  title: {
    ...appTheme.typography.subtitle,
    color: appTheme.colors.text,
  },
  subtitle: {
    ...appTheme.typography.caption,
    color: appTheme.colors.textMuted,
  },
  right: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
});
