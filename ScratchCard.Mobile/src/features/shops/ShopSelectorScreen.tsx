import React, { useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuth } from "../../auth/AuthContext";
import { ScreenContainer } from "../../components/ScreenContainer";
import { PrimaryButton } from "../../components/PrimaryButton";
import { RootStackParamList } from "../../types/navigation";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";
import { getRoleDisplayName } from "../../utils/roleLabels";

type GroupedShops = {
  companyId: string;
  companyName: string;
  shops: Array<{
    shopId: string;
    shopName: string;
    role: string;
  }>;
};

export function ShopSelectorScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { profile, activeShopId, setActiveShop } = useAuth();
  // Tapping a shop only *stages* the choice; the user confirms with the bottom button so a
  // mis-tap doesn't drop them into the wrong shop (which would mean switching back / re-login).
  const [selectedShopId, setSelectedShopId] = useState<string | null>(activeShopId);
  const [isSwitching, setIsSwitching] = useState(false);

  const groupedShops = useMemo<GroupedShops[]>(() => {
    const groups = new Map<string, GroupedShops>();
    for (const shop of profile?.shops ?? []) {
      const key = shop.companyId ?? "no-company";
      const companyName = shop.companyName ?? "Unassigned Company";
      const existing = groups.get(key);
      if (existing) {
        existing.shops.push({
          shopId: shop.shopId,
          shopName: shop.shopName,
          role: shop.role,
        });
      } else {
        groups.set(key, {
          companyId: key,
          companyName,
          shops: [
            {
              shopId: shop.shopId,
              shopName: shop.shopName,
              role: shop.role,
            },
          ],
        });
      }
    }

    return [...groups.values()]
      .sort((a, b) => a.companyName.localeCompare(b.companyName))
      .map((group) => ({
        ...group,
        shops: group.shops.sort((a, b) => a.shopName.localeCompare(b.shopName)),
      }));
  }, [profile?.shops]);

  async function onConfirm() {
    if (!selectedShopId || isSwitching) {
      return;
    }
    setIsSwitching(true);
    try {
      await setActiveShop(selectedShopId);
      // In-app switcher: return to the previous screen. Mandatory post-login chooser: there's
      // nothing to go back to — setting the active shop re-renders the navigator into the app.
      if (navigation.canGoBack()) {
        navigation.goBack();
      }
    } catch {
      Alert.alert("Switch failed", "Unable to switch shop. Please try again.");
    } finally {
      setIsSwitching(false);
    }
  }

  return (
    <ScreenContainer
      footer={
        groupedShops.length > 0 ? (
          <PrimaryButton
            label={isSwitching ? "Opening..." : "Continue"}
            onPress={() => void onConfirm()}
            disabled={!selectedShopId || isSwitching}
          />
        ) : undefined
      }
    >
      <View style={ui.card}>
        <Text style={styles.subtitle}>Tap a shop to select it, then press Continue. All actions will run under the selected shop.</Text>

        {groupedShops.map((group) => (
          <View key={group.companyId} style={styles.groupCard}>
            <Text style={styles.groupTitle}>{group.companyName}</Text>
            {group.shops.map((shop) => {
              const selected = shop.shopId === selectedShopId;
              const isCurrent = shop.shopId === activeShopId;
              return (
                <Pressable
                  key={shop.shopId}
                  style={[styles.shopRow, selected ? styles.shopRowSelected : null]}
                  onPress={() => setSelectedShopId(shop.shopId)}
                  disabled={isSwitching}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.shopName}>{shop.shopName}</Text>
                    <Text style={styles.meta}>
                      Role: {getRoleDisplayName(shop.role)}{isCurrent ? " · Current" : ""}
                    </Text>
                  </View>
                  <Text style={[styles.badge, selected ? styles.badgeSelected : null]}>
                    {selected ? "Selected" : "Select"}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ))}

        {groupedShops.length === 0 ? <Text style={styles.meta}>No shop assignments found for this user.</Text> : null}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 24, lineHeight: 28, color: appTheme.colors.text, fontFamily: appTheme.fonts.heading },
  subtitle: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 13, lineHeight: 18 },
  groupCard: {
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    padding: 10,
    gap: 8,
  },
  groupTitle: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 18,
  },
  shopRow: {
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  shopRowSelected: {
    borderColor: appTheme.colors.primary,
    backgroundColor: appTheme.colors.surfaceSuccessMuted,
  },
  shopName: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 18,
  },
  meta: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 12, lineHeight: 16 },
  badge: {
    color: appTheme.colors.primary,
    borderWidth: 1,
    borderColor: appTheme.colors.primary,
    borderRadius: appTheme.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 14,
  },
  badgeSelected: {
    color: appTheme.colors.textOnDark,
    backgroundColor: appTheme.colors.primary,
  },
});

