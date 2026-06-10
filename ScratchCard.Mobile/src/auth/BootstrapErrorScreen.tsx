import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { PrimaryButton } from "../components/PrimaryButton";
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
      <View style={styles.primaryAction}>
        <PrimaryButton label="Retry" icon="refresh-outline" onPress={onRetry} />
      </View>
      {onSignOut ? (
        <Pressable
          style={({ pressed }) => [styles.secondaryButton, pressed ? styles.secondaryButtonPressed : null]}
          onPress={onSignOut}
          accessibilityRole="button"
          accessibilityLabel="Sign out"
        >
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
  primaryAction: {
    marginTop: appTheme.spacing.md,
    minWidth: 200,
  },
  secondaryButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  secondaryButtonPressed: {
    opacity: 0.6,
  },
  secondaryButtonText: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 16,
  },
});
