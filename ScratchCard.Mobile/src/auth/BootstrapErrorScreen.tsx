import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { appTheme } from "../ui/theme";

type Props = {
  message?: string;
  onRetry: () => void;
  onSignOut?: () => void;
};

export function BootstrapErrorScreen({ message, onRetry, onSignOut }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>We couldn't finish signing you in</Text>
      <Text style={styles.message}>
        {message || "Check your connection and try again. If this keeps happening, sign out and sign in once more."}
      </Text>
      <Pressable style={styles.primaryButton} onPress={onRetry} accessibilityRole="button" accessibilityLabel="Retry sign-in">
        <Text style={styles.primaryButtonText}>Retry</Text>
      </Pressable>
      {onSignOut ? (
        <Pressable style={styles.secondaryButton} onPress={onSignOut} accessibilityRole="button" accessibilityLabel="Sign out">
          <Text style={styles.secondaryButtonText}>Sign out</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: appTheme.colors.background,
    paddingHorizontal: appTheme.spacing.lg,
    gap: appTheme.spacing.sm,
  },
  title: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.heading,
    fontSize: 20,
    lineHeight: 26,
    textAlign: "center",
  },
  message: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.body,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    maxWidth: 360,
  },
  primaryButton: {
    marginTop: appTheme.spacing.md,
    backgroundColor: appTheme.colors.primary,
    borderRadius: appTheme.radius.pill,
    paddingVertical: 12,
    paddingHorizontal: 28,
  },
  primaryButtonText: {
    color: appTheme.colors.onPrimary,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 18,
  },
  secondaryButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  secondaryButtonText: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 16,
  },
});
