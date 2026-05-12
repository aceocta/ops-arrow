import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { ScreenContainer } from "./ScreenContainer";
import { ui } from "../ui/primitives";
import { appTheme } from "../ui/theme";

type Props = {
  title: string;
  subtitle?: string;
};

export function PlaceholderFeatureScreen({ title, subtitle }: Props) {
  return (
    <ScreenContainer>
      <View style={ui.card}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>
          {subtitle ?? "This screen scaffold is ready for feature-specific implementation."}
        </Text>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 22, lineHeight: 26, fontFamily: appTheme.fonts.heading, color: appTheme.colors.text },
  subtitle: { fontSize: 14, lineHeight: 20, color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body },
});
