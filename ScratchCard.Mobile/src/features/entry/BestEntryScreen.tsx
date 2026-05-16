import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { useBestEntry } from "../../navigation/BestEntryContext";
import { MainStackParamList } from "../../types/navigation";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";

type OperationOption = {
  key: "scratchCard" | "temperature" | "refusals" | "checklist";
  title: string;
  route: keyof MainStackParamList;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  iconBg: string;
  operation?: "scratchCard" | "temperature" | "refusals" | "checklist";
};

const operationOptions: OperationOption[] = [
  
  {
    key: "scratchCard",
    title: "Scratch Card",
    route: "Dashboard",
    icon: "albums-outline",
    iconColor: appTheme.colors.primary,
    iconBg: appTheme.colors.surfaceBrandMuted,
    operation: "scratchCard",
  },
  {
    key: "temperature",
    title: "Temperature Log",
    route: "TemperatureLogs",
    icon: "thermometer-outline",
    iconColor: appTheme.colors.info,
    iconBg: appTheme.colors.surfaceInfoMuted,
    operation: "temperature",
  },
  {
    key: "refusals",
    title: "No ID / No Sale",
    route: "RefusalRegister",
    icon: "shield-checkmark-outline",
    iconColor: appTheme.colors.warning,
    iconBg: appTheme.colors.surfaceWarningSoft,
    operation: "refusals",
  },{
    key: "checklist",
    title: "Shop Checklist",
    route: "ShopChecklist",
    icon: "checkmark-done-outline",
    iconColor: appTheme.colors.primary,
    iconBg: appTheme.colors.surfaceSuccessSoft,
    operation: "checklist",
  }
];

export function BestEntryScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { selectedOperation, setSelectedOperation } = useBestEntry();

  return (
    <ScreenContainer>
      <View style={styles.featureGrid}>
        {operationOptions.map((option) => {
          const selected = option.operation ? selectedOperation === option.operation : false;
          return (
            <Pressable
              key={option.key}
              style={[ui.card, styles.featureTile, selected ? styles.featureTileSelected : null]}
              onPress={() => {
                if (option.operation) {
                  setSelectedOperation(option.operation);
                }
                navigation.navigate(option.route as never);
              }}
            >
              <View style={[styles.featureIcon, { backgroundColor: option.iconBg }]}>
                <Ionicons name={option.icon} size={28} color={option.iconColor} />
              </View>
              <Text style={styles.featureTitle}>{option.title}</Text>
            </Pressable>
          );
        })}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  featureGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  featureTile: {
    width: "48%",
    minHeight: 150,
    borderRadius: appTheme.radius.md,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
  },
  featureTileSelected: {
    backgroundColor: appTheme.colors.surfaceBrandMuted,
  },
  featureIcon: {
    width: 62,
    height: 62,
    borderRadius: appTheme.radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  featureTitle: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 16,
    lineHeight: 20,
    textAlign: "center",
  },
});


