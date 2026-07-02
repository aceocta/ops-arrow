import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { appTheme } from "../ui/theme";

type Props = {
  label: string;
  tone?: "neutral" | "warning" | "danger" | "success";
};

export function StatusBadge({ label, tone = "neutral" }: Props) {
  return (
    <View style={[styles.badge, styles[tone]]}>
      <Text style={[styles.text, styles[`${tone}Text`]]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: "flex-start",
    borderRadius: appTheme.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
  },
  neutral: { backgroundColor: appTheme.colors.badgeNeutralBg, borderColor: appTheme.colors.badgeNeutralBorder },
  warning: { backgroundColor: appTheme.colors.badgeWarningBg, borderColor: appTheme.colors.badgeWarningBorder },
  danger: { backgroundColor: appTheme.colors.badgeDangerBg, borderColor: appTheme.colors.badgeDangerBorder },
  success: { backgroundColor: appTheme.colors.badgeSuccessBg, borderColor: appTheme.colors.badgeSuccessBorder },
  text: {
    fontSize: 11,
    lineHeight: 13,
    fontFamily: appTheme.fonts.bodyMedium,
  },
  // Tone-matched text so status reads at a glance and isn't conveyed by background colour alone
  // (accessibility + daylight glanceability on the shop floor). Uses the "strong" text tokens so the
  // 11px label meets WCAG AA against the soft badge backgrounds (the base warning/success tones fail).
  neutralText: { color: appTheme.colors.textMuted },
  warningText: { color: appTheme.colors.textWarningStrong },
  dangerText: { color: appTheme.colors.textDangerStrong },
  successText: { color: appTheme.colors.textSuccessStrong },
});
