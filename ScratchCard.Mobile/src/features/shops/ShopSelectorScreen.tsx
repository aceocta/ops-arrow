import React, { useMemo } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useAuth } from "../../auth/AuthContext";
import { ScreenContainer } from "../../components/ScreenContainer";
import { RootStackParamList } from "../../types/navigation";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";

type Props = NativeStackScreenProps<RootStackParamList, "ShopSelector">;

type GroupedShops = {
  companyId: string;
  companyName: string;
  shops: Array<{
    shopId: string;
    shopName: string;
    role: string;
  }>;
};

export function ShopSelectorScreen({ navigation }: Props) {
  const { profile, activeShopId, setActiveShop } = useAuth();

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

  async function onSelectShop(shopId: string) {
    try {
      await setActiveShop(shopId);
      navigation.goBack();
    } catch {
      Alert.alert("Switch failed", "Unable to switch shop. Please try again.");
    }
  }

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={{ gap: 12 }}>
        <View style={ui.card}>
          <Text style={styles.subtitle}>All actions will run under the selected shop.</Text>

          {groupedShops.map((group) => (
            <View key={group.companyId} style={styles.groupCard}>
              <Text style={styles.groupTitle}>{group.companyName}</Text>
              {group.shops.map((shop) => {
                const selected = shop.shopId === activeShopId;
                return (
                  <Pressable
                    key={shop.shopId}
                    style={[styles.shopRow, selected ? styles.shopRowSelected : null]}
                    onPress={() => void onSelectShop(shop.shopId)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.shopName}>{shop.shopName}</Text>
                      <Text style={styles.meta}>Role: {shop.role}</Text>
                    </View>
                    <Text style={[styles.badge, selected ? styles.badgeSelected : null]}>
                      {selected ? "Active" : "Select"}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ))}

          {groupedShops.length === 0 ? <Text style={styles.meta}>No shop assignments found for this user.</Text> : null}
        </View>
      </ScrollView>
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
    backgroundColor: "#E4F3F1",
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
    color: "#F5FFFE",
    backgroundColor: appTheme.colors.primary,
  },
});
