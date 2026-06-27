import React from "react";
import { Linking, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { resolveWebPlatformUrl } from "../config/appInfo";
import { PrimaryButton } from "./PrimaryButton";
import { ui } from "../ui/primitives";
import { appTheme } from "../ui/theme";

/**
 * Card explaining that an action (e.g. creating a shop) is only available on the web platform.
 * Renders an "Open web platform" button when a web URL is configured; otherwise just the message.
 * Pass extra actions (Refresh, Sign out, …) as children.
 */
export function WebOnlyNotice({
  title,
  message,
  children,
}: {
  title: string;
  message: string;
  children?: React.ReactNode;
}) {
  const webUrl = resolveWebPlatformUrl();
  return (
    <View style={[ui.card, styles.card]}>
      <Ionicons name="desktop-outline" size={30} color={appTheme.colors.primary} />
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      {webUrl ? (
        <PrimaryButton
          label="Open web platform"
          icon="open-outline"
          onPress={() => void Linking.openURL(webUrl).catch(() => undefined)}
        />
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: "center", gap: appTheme.spacing.sm },
  title: { color: appTheme.colors.text, fontFamily: appTheme.fonts.heading, fontSize: 17, lineHeight: 22, textAlign: "center" },
  message: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 13, lineHeight: 19, textAlign: "center" },
});
