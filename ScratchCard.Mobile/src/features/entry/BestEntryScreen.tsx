import React, { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ScreenContainer } from "../../components/ScreenContainer";
import { SubscriptionBanner } from "../subscription/SubscriptionBanner";
import { useAuth } from "../../auth/AuthContext";
import { useBestEntry } from "../../navigation/BestEntryContext";
import { useEntitlements } from "../subscription/useEntitlements";
import { MainStackParamList } from "../../types/navigation";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";

type OperationOption = {
  key: "scratchCard" | "temperature" | "refusals" | "checklist" | "compliance" | "visitors" | "shifts";
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
  },
  {
    key: "shifts",
    title: "My Shifts",
    route: "MyShifts",
    icon: "time-outline",
    iconColor: appTheme.colors.info,
    iconBg: appTheme.colors.surfaceInfoMuted,
    requiredFeature: "StaffRota",
  }
];

export function BestEntryScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { selectedOperation, setSelectedOperation } = useBestEntry();
  const { entitlements } = useEntitlements();
  const { profile, activeShop, activeShopId, setActiveShop } = useAuth();
  const features = entitlements?.features ?? [];
  // Managers / owners manage the rota; everyone else lands on their own shifts.
  const roles = profile?.roles ?? [];
  const canManageRota = roles.some((r) => r === "CompanyOwner" || r === "Manager" || r === "PlatformAdmin");
  const visibleOptions = operationOptions
    .filter((o) => !o.requiredFeature || features.includes(o.requiredFeature))
    .map((o) =>
      o.key === "shifts" && canManageRota
        ? { ...o, title: "Shift Rota", route: "RotaManage" as keyof MainStackParamList }
        : o
    );

  const shops = profile?.shops ?? [];
  const canSwitchShop = shops.length > 1;
  const [switchOpen, setSwitchOpen] = useState(false);

  const chooseShop = async (shopId: string) => {
    setSwitchOpen(false);
    if (shopId !== activeShopId) {
      try {
        await setActiveShop(shopId);
      } catch {
        // setActiveShop guards membership; ignore failures.
      }
    }
  };

  return (
    <ScreenContainer>
      <SubscriptionBanner />

      {/* Active shop + quick switch — only relevant when the user belongs to more than one shop. */}
      {canSwitchShop ? (
        <Pressable
          style={[ui.card, styles.shopCard]}
          onPress={() => setSwitchOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Active shop. Tap to switch."
        >
          <View style={styles.shopCardIcon}>
            <Ionicons name="storefront-outline" size={20} color={appTheme.colors.primary} />
          </View>
          <View style={styles.shopCardText}>
            <Text style={styles.shopCardLabel}>Active shop</Text>
            <Text style={styles.shopCardName} numberOfLines={1}>
              {activeShop?.shopName ?? "No shop selected"}
            </Text>
          </View>
          <View style={styles.switchPill}>
            <Ionicons name="swap-horizontal" size={14} color={appTheme.colors.primary} />
            <Text style={styles.switchPillText}>Switch</Text>
          </View>
        </Pressable>
      ) : null}

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

      <Modal visible={switchOpen} transparent animationType="fade" onRequestClose={() => setSwitchOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setSwitchOpen(false)}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Switch shop</Text>
            {shops.map((shop) => {
              const active = shop.shopId === activeShopId;
              return (
                <Pressable key={shop.shopId} style={styles.shopRow} onPress={() => chooseShop(shop.shopId)}>
                  <Text style={[styles.shopRowText, active ? styles.shopRowTextActive : null]} numberOfLines={1}>
                    {shop.shopName}
                  </Text>
                  {active ? <Ionicons name="checkmark-circle" size={18} color={appTheme.colors.primary} /> : null}
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  shopCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },
  shopCardIcon: {
    width: 40,
    height: 40,
    borderRadius: appTheme.radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: appTheme.colors.surfaceBrandSoft,
  },
  shopCardText: { flex: 1, gap: 2 },
  shopCardLabel: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.body,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  shopCardName: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 16, lineHeight: 20 },
  switchPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: appTheme.colors.primary,
    backgroundColor: appTheme.colors.surfaceBrandSoft,
  },
  switchPillText: { color: appTheme.colors.primary, fontFamily: appTheme.fonts.bodyMedium, fontSize: 13 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    backgroundColor: appTheme.colors.surface,
    borderRadius: appTheme.radius.md,
    padding: 16,
    gap: 4,
  },
  modalTitle: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 16,
    lineHeight: 20,
    marginBottom: 6,
  },
  shopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: appTheme.colors.borderSoft,
  },
  shopRowText: { flex: 1, color: appTheme.colors.text, fontFamily: appTheme.fonts.body, fontSize: 15 },
  shopRowTextActive: { color: appTheme.colors.primary, fontFamily: appTheme.fonts.bodyMedium },
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


