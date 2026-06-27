import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ui } from "../ui/primitives";
import { appTheme } from "../ui/theme";
import type { FeatureSetupStep } from "./useFeatureSetupGuard";

/**
 * In-place setup prompt shown on a feature screen when its required setup is incomplete. Owns the
 * whole screen (rather than redirecting or popping a modal) so the user keeps their intent and can
 * finish a step then come back to the real screen. For users who can't configure the feature, shows
 * a passive "ask your manager" message instead of dead-end CTAs.
 */
export function FeatureSetupPrompt({
  icon = "construct-outline",
  title,
  message,
  missing,
  canConfigure,
  passiveMessage,
  onGo,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  message: string;
  missing: FeatureSetupStep[];
  canConfigure: boolean;
  passiveMessage: string;
  onGo: (route: FeatureSetupStep["route"]) => void;
}) {
  return (
    <View style={[ui.card, styles.card]}>
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={28} color={appTheme.colors.primary} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>

      {canConfigure ? (
        <View style={styles.steps}>
          {missing.map((step) => (
            <Pressable
              key={step.key}
              style={styles.step}
              onPress={() => onGo(step.route)}
              accessibilityRole="button"
              accessibilityLabel={step.label}
            >
              <Ionicons name="ellipse-outline" size={20} color={appTheme.colors.textSubtle} />
              <Text style={styles.stepLabel}>{step.label}</Text>
              <View style={styles.todoChip}><Text style={styles.todoChipText}>To do</Text></View>
              <Ionicons name="chevron-forward" size={16} color={appTheme.colors.textSubtle} />
            </Pressable>
          ))}
        </View>
      ) : (
        <Text style={styles.passive}>{passiveMessage}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 10,
    alignItems: "stretch",
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: appTheme.colors.surfaceBrandMuted,
    alignSelf: "center",
  },
  title: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.heading,
    fontSize: 17,
    textAlign: "center",
  },
  message: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.body,
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
  },
  steps: {
    marginTop: 4,
    gap: 2,
  },
  step: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 11,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: appTheme.colors.borderSoft,
  },
  stepLabel: {
    flex: 1,
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 14,
  },
  todoChip: {
    backgroundColor: appTheme.colors.surfaceMuted,
    borderRadius: appTheme.radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  todoChipText: {
    color: appTheme.colors.textSubtle,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 11,
  },
  passive: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.body,
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
    marginTop: 2,
  },
});
