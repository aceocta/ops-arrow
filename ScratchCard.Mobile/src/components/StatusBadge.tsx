import React from "react";
import { Text, View } from "react-native";
import { makeStyles } from "../ui/makeStyles";

type Props = {
  label: string;
  tone?: "neutral" | "warning" | "danger" | "success";
};

export function StatusBadge({ label, tone = "neutral" }: Props) {
  const styles = useStyles();
  return (
    <View style={[styles.badge, styles[tone]]}>
      <Text style={[styles.text, styles[`${tone}Text`]]}>{label}</Text>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  badge: {
    alignSelf: "flex-start",
    borderRadius: t.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
  },
  neutral: { backgroundColor: t.colors.badgeNeutralBg, borderColor: t.colors.badgeNeutralBorder },
  warning: { backgroundColor: t.colors.badgeWarningBg, borderColor: t.colors.badgeWarningBorder },
  danger: { backgroundColor: t.colors.badgeDangerBg, borderColor: t.colors.badgeDangerBorder },
  success: { backgroundColor: t.colors.badgeSuccessBg, borderColor: t.colors.badgeSuccessBorder },
  text: {
    fontSize: 11,
    lineHeight: 13,
    fontFamily: t.fonts.bodyMedium,
  },
  // Tone-matched text so status reads at a glance and isn't conveyed by background colour alone
  // (accessibility + daylight glanceability on the shop floor). Uses the "strong" text tokens so the
  // 11px label meets WCAG AA against the soft badge backgrounds (the base warning/success tones fail).
  neutralText: { color: t.colors.textMuted },
  warningText: { color: t.colors.textWarningStrong },
  dangerText: { color: t.colors.textDangerStrong },
  successText: { color: t.colors.textSuccessStrong },
}));
