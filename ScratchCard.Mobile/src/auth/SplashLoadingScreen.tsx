import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { appTheme } from "../ui/theme";

type SplashLoadingScreenProps = {
  message?: string;
};

export function SplashLoadingScreen({ message }: SplashLoadingScreenProps) {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={appTheme.colors.primary} />
      {message ? <Text style={styles.message}>{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: appTheme.colors.background,
    gap: 10,
  },
  message: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.body,
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
  },
});
