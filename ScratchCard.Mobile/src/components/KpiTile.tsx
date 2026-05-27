import React from "react";
import { StyleSheet, Text, View, ViewStyle } from "react-native";
import { appTheme } from "../ui/theme";

type KpiTone = "default" | "warning" | "danger" | "success" | "info";

type KpiTileProps = {
  label: string;
  value: string | number;
  /** Optional helper line under the value (e.g. "+£12 vs yesterday"). */
  hint?: string;
  /** Colored emphasis on the value — danger/warning/success/info, or default neutral. */
  tone?: KpiTone;
  style?: ViewStyle | ViewStyle[];
};

export function KpiTile({ label, value, hint, tone = "default", style }: KpiTileProps) {
  const toneStyle = TONE_STYLES[tone];
  return (
    <View style={[styles.tile, style]}>
      <Text style={styles.label} numberOfLines={2}>{label}</Text>
      <Text style={[styles.value, toneStyle.value]} numberOfLines={1}>{value}</Text>
      {hint ? <Text style={[styles.hint, toneStyle.hint]} numberOfLines={1}>{hint}</Text> : null}
    </View>
  );
}

type KpiGridProps = {
  /** Number of columns. Default 2 for two-up KPI rows. */
  columns?: 2 | 3 | 4;
  children: React.ReactNode;
};

/**
 * Lays out KpiTile children in equal-width columns. Children flex to fill the row evenly,
 * with the gap subtracted by flexbox — so two columns always sit side-by-side instead of
 * wrapping when the percentage math is off by one pixel. The `columns` count controls how
 * many children fit per row; surplus children wrap.
 */
export function KpiGrid({ columns = 2, children }: KpiGridProps) {
  const items = React.Children.toArray(children).filter(React.isValidElement);
  const rows: React.ReactNode[][] = [];
  for (let i = 0; i < items.length; i += columns) {
    rows.push(items.slice(i, i + columns));
  }
  return (
    <View style={styles.gridStack} accessibilityRole="summary">
      {rows.map((row, rowIdx) => (
        <View key={rowIdx} style={styles.gridRow}>
          {row.map((child, idx) => (
            <View key={idx} style={styles.gridCell}>
              {child}
            </View>
          ))}
          {/* Pad the last row with invisible spacers so tiles stay equal-width even when
              the row has fewer children than the column count. */}
          {row.length < columns
            ? Array.from({ length: columns - row.length }).map((_, sIdx) => (
                <View key={`spacer-${sIdx}`} style={styles.gridCell} />
              ))
            : null}
        </View>
      ))}
    </View>
  );
}

const TONE_STYLES: Record<KpiTone, { value: { color: string }; hint: { color: string } }> = {
  default: {
    value: { color: appTheme.colors.text },
    hint: { color: appTheme.colors.textMuted },
  },
  warning: {
    value: { color: appTheme.colors.warning },
    hint: { color: appTheme.colors.textWarningStrong },
  },
  danger: {
    value: { color: appTheme.colors.danger },
    hint: { color: appTheme.colors.danger },
  },
  success: {
    value: { color: appTheme.colors.success },
    hint: { color: appTheme.colors.textSuccessStrong },
  },
  info: {
    value: { color: appTheme.colors.info },
    hint: { color: appTheme.colors.textInfoStrong },
  },
};

const styles = StyleSheet.create({
  gridStack: {
    gap: appTheme.spacing.xs,
  },
  gridRow: {
    flexDirection: "row",
    gap: appTheme.spacing.xs,
  },
  gridCell: {
    flex: 1,
  },
  tile: {
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceTint,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: 10,
    gap: 2,
  },
  label: {
    ...appTheme.typography.caption,
    color: appTheme.colors.textSubtle,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  value: {
    ...appTheme.typography.title,
    color: appTheme.colors.text,
    fontSize: 18,
    lineHeight: 22,
  },
  hint: {
    ...appTheme.typography.caption,
    color: appTheme.colors.textMuted,
  },
});
