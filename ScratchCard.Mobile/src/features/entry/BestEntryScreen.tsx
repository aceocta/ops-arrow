import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { SubscriptionBanner } from "../subscription/SubscriptionBanner";
import { useAuth } from "../../auth/AuthContext";
import { OwnerOverviewScreen } from "../dashboard/OwnerOverviewScreen";
import { useBestEntry } from "../../navigation/BestEntryContext";
import { useEntitlements } from "../subscription/useEntitlements";
import { MainStackParamList } from "../../types/navigation";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";

type OperationOption = {
  key: "scratchCard" | "temperature" | "refusals" | "checklist" | "compliance" | "visitors";
  title: string;
  route: keyof MainStackParamList;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  iconBg: string;
  operation?: "scratchCard" | "temperature" | "refusals" | "checklist" | "compliance";
  /** Top-level module key. Tile hides if the shop's plan does not include it OR the owner
   *  has toggled it off in Feature Toggles. */
  requiredFeature?: string;
};

const operationOptions: OperationOption[] = [

  {
    key: "scratchCard",
    title: "Day Management",
    route: "Dashboard",
    icon: "albums-outline",
    iconColor: appTheme.colors.primary,
    iconBg: appTheme.colors.surfaceBrandMuted,
    operation: "scratchCard",
    requiredFeature: "ScratchCardManagement",
  },
  {
    key: "temperature",
    title: "Temperature Log",
    route: "TemperatureLogs",
    icon: "thermometer-outline",
    iconColor: appTheme.colors.info,
    iconBg: appTheme.colors.surfaceInfoMuted,
    operation: "temperature",
    requiredFeature: "TemperatureLog",
  },
  {
    key: "refusals",
    title: "Refusal Log",
    route: "RefusalRegister",
    icon: "shield-checkmark-outline",
    iconColor: appTheme.colors.warning,
    iconBg: appTheme.colors.surfaceWarningSoft,
    operation: "refusals",
    requiredFeature: "RefusalNoIdNoSale",
  },
  {
    key: "compliance",
    title: "Compliance Checks",
    route: "ComplianceChecks",
    icon: "clipboard-outline",
    iconColor: appTheme.colors.warning,
    iconBg: appTheme.colors.surfaceWarningSoft,
    operation: "compliance",
    requiredFeature: "ComplianceChecklist",
  },
  {
    key: "visitors",
    title: "Visitors Log",
    // Land on the daily register so existing visits are visible at a glance.
    // The register has a "Sign in visitor" primary button for the next-action path.
    route: "VisitorLog",
    icon: "people-outline",
    iconColor: appTheme.colors.info,
    iconBg: appTheme.colors.surfaceInfoMuted,
  }
];

export function BestEntryScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { selectedOperation, setSelectedOperation } = useBestEntry();
  const { entitlements } = useEntitlements();
  const { profile } = useAuth();
  const features = entitlements?.features ?? [];
  const visibleOptions = operationOptions.filter(
    (o) => !o.requiredFeature || features.includes(o.requiredFeature)
  );

  // Company owners land on the multi-shop operations dashboard instead of the entry grid.
  const isCompanyOwner = profile?.roles?.includes("CompanyOwner") ?? false;
  if (isCompanyOwner) {
    return <OwnerOverviewScreen />;
  }

  return (
    <ScreenContainer>
      <SubscriptionBanner />
      <View style={styles.featureGrid}>
        {visibleOptions.map((option) => {
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


