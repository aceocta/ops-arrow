import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNetInfo } from "@react-native-community/netinfo";
import { Ionicons } from "@expo/vector-icons";
import { appTheme } from "../ui/theme";

/**
 * Slim banner shown when the device drops offline. Mount once at the app shell (above
 * tabs/drawer) so screens don't each have to reinvent their own offline indicator.
 */
export function NetworkStatusBanner() {
  const netInfo = useNetInfo();
  const insets = useSafeAreaInsets();
  // netInfo.isConnected is null briefly while resolving; only show banner when we're
  // confidently disconnected.
  const offline = netInfo.isConnected === false;

  if (!offline) return null;

  return (
    <View
      // Clear the status bar / notch — the banner sits at the very top of a headerless root screen.
      style={[styles.bar, { paddingTop: insets.top + 6 }]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <Ionicons name="cloud-offline-outline" size={14} color={appTheme.colors.onDanger} />
      <Text style={styles.text}>You're offline. Some actions won't be available until you reconnect.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingBottom: 6,
    backgroundColor: appTheme.colors.danger,
  },
  text: {
    color: appTheme.colors.onDanger,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 16,
    flexShrink: 1,
  },
});
