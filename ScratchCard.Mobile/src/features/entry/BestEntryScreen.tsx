import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { useBestEntry } from "../../navigation/BestEntryContext";
import { MainStackParamList } from "../../types/navigation";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";

const operationOptions = [
  {
    key: "scratchCard" as const,
    title: "Scratch Card",
    meta: "Day management and card operations",
    route: "Dashboard" as const,
    iconGlyph: "🃏",
    iconColor: "#146C77",
    badgeColor: "#E2F4F6",
  },
  {
    key: "temperature" as const,
    title: "Temperature",
    meta: "Daily temperature log checks",
    route: "TemperatureLogs" as const,
    iconGlyph: "🌡️",
    iconColor: "#1D4ED8",
    badgeColor: "#E7EEFF",
  },
  {
    key: "refusals" as const,
    title: "No ID / No Sale",
    meta: "Refused sale logging and sign-off",
    route: "RefusalRegister" as const,
    iconGlyph: "⛔",
    iconColor: "#B45309",
    badgeColor: "#FFF4E6",
  },
];

export function BestEntryScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { selectedOperation, setSelectedOperation } = useBestEntry();

  return (
    <ScreenContainer>
      {/* <View style={styles.hero}>
        <Text style={styles.heroSubtitle}>Choose an operation to continue</Text>
        <Text style={styles.heroNote}>Shop: {activeShop?.shopName ?? "No active shop selected"}</Text>
      </View> */}

      <View style={styles.operationGrid}>
        {operationOptions.map((option) => (
          <Pressable
            key={option.key}
            style={[ui.card, styles.operationTile, selectedOperation === option.key ? styles.operationTileSelected : null]}
            onPress={() => {
              setSelectedOperation(option.key);
              navigation.navigate(option.route);
            }}
          >
            <View style={[styles.iconBadge, { backgroundColor: option.badgeColor }]}>
              <Text style={[styles.iconGlyph, { color: option.iconColor }]}>{option.iconGlyph}</Text>
            </View>
            <Text style={styles.operationTitle}>{option.title}</Text>
            <Text style={styles.operationMeta}>{option.meta}</Text>
          </Pressable>
        ))}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: appTheme.colors.primary,
    borderRadius: appTheme.radius.lg,
    borderWidth: 1,
    borderColor: appTheme.colors.primaryPressed,
    padding: appTheme.spacing.lg,
    gap: appTheme.spacing.xs,
  },
  heroTitle: {
    color: appTheme.colors.onPrimary,
    fontFamily: appTheme.fonts.heading,
    fontSize: 22,
    lineHeight: 26,
  },
  heroSubtitle: {
    color: appTheme.colors.onPrimary,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 18,
  },
  heroNote: {
    color: "#DCEAF4",
    fontFamily: appTheme.fonts.body,
    fontSize: 13,
    lineHeight: 17,
  },
  operationGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: appTheme.spacing.sm,
  },
  operationTile: {
    width: "48%",
    minHeight: 176,
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: appTheme.spacing.xs,
  },
  operationTileSelected: {
    borderColor: appTheme.colors.primary,
    backgroundColor: "#E9F7F6",
  },
  iconBadge: {
    width: 48,
    height: 48,
    borderRadius: appTheme.radius.sm,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  iconGlyph: {
    fontSize: 22,
    lineHeight: 26,
  },
  operationTitle: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 17,
    lineHeight: 21,
  },
  operationMeta: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.body,
    fontSize: 13,
    lineHeight: 17,
  },
});
