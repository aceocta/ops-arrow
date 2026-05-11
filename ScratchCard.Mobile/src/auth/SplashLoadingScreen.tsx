import React from "react";
import { ActivityIndicator, View } from "react-native";
import { appTheme } from "../ui/theme";

export function SplashLoadingScreen() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: appTheme.colors.background }}>
      <ActivityIndicator size="large" color={appTheme.colors.primary} />
    </View>
  );
}
