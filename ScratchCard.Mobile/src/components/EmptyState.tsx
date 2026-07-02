import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { appTheme } from "../ui/theme";
import { PrimaryButton } from "./PrimaryButton";

type EmptyStateProps = {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function EmptyState({ icon = "information-circle-outline", title, message, actionLabel, onAction }: EmptyStateProps) {
  return (
    <View style={styles.container} accessibilityRole="summary">
      <View style={styles.iconBubble}>
        <Ionicons name={icon} size={28} color={appTheme.colors.primary} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {actionLabel && onAction ? (
        <View style={styles.action}>
          <PrimaryButton label={actionLabel} onPress={onAction} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    padding: appTheme.spacing.lg,
    gap: appTheme.spacing.xs,
  },
  iconBubble: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: appTheme.colors.surfaceBrandSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: appTheme.spacing.xs,
  },
  title: {
    ...appTheme.typography.title,
    color: appTheme.colors.text,
    textAlign: "center",
  },
  message: {
    ...appTheme.typography.body,
    color: appTheme.colors.textMuted,
    textAlign: "center",
    maxWidth: 320,
  },
  action: {
    marginTop: appTheme.spacing.sm,
  },
});
