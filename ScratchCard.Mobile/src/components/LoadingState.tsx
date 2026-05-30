import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { appTheme } from "../ui/theme";

type LoadingStateProps = {
  message?: string;
  size?: "small" | "large";
  inline?: boolean;
};

/**
 * Standard "loading…" indicator. Use across list/report screens instead of bare
 * `<Text>Loading…</Text>` so the look is consistent. Pass `inline` for compact inline
 * placement; default is a centred block.
 */
export function LoadingState({ message = "Loading…", size = "small", inline = false }: LoadingStateProps) {
  return (
    <View
      style={[styles.container, inline ? styles.inline : styles.block]}
      accessibilityRole="progressbar"
      accessibilityLabel={message}
    >
      <ActivityIndicator size={size} color={appTheme.colors.primary} />
      {message ? <Text style={styles.message}>{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: appTheme.spacing.xs,
  },
  block: {
    justifyContent: "center",
    padding: appTheme.spacing.lg,
  },
  inline: {
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: appTheme.spacing.xs,
  },
  message: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.body,
    fontSize: 13,
    lineHeight: 18,
  },
});
