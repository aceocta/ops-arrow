import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useNetInfo } from "@react-native-community/netinfo";
import { Ionicons } from "@expo/vector-icons";
import { appTheme } from "../ui/theme";

/**
 * Slim banner shown when the device drops offline. Mount once at the app shell (above
 * tabs/drawer) so screens don't each have to reinvent their own offline indicator.
 */
export function NetworkStatusBanner() {
  const netInfo = useNetInfo();
  // netInfo.isConnected is null briefly while resolving; only show banner when we're
  // confidently disconnected.
  const offline = netInfo.isConnected === false;

  if (!offline) return null;

  return (
    <View style={styles.bar} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <Ionicons name="cloud-offline-outline" size={14} color={appTheme.colors.surface} />
      <Text style={styles.text}>You're offline — actions will sync once you're back online.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: appTheme.colors.danger,
  },
  text: {
    color: appTheme.colors.surface,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 16,
    flexShrink: 1,
  },
});
