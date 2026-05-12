import React, { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import { listDeliveries } from "../../api/deliveriesApi";
import { useAuth } from "../../auth/AuthContext";
import { PrimaryButton } from "../../components/PrimaryButton";
import { ScreenContainer } from "../../components/ScreenContainer";
import type { MainStackParamList } from "../../types/navigation";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";

export function DeliveriesScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { activeShopId, activeShop } = useAuth();
  const shopId = activeShopId;

  const deliveriesQuery = useQuery({
    queryKey: ["deliveries", shopId],
    queryFn: () => listDeliveries(shopId as string),
    enabled: Boolean(shopId),
  });

  const deliveries = useMemo(
    () =>
      [...(deliveriesQuery.data ?? [])].sort(
        (a, b) => new Date(b.deliveryDate).getTime() - new Date(a.deliveryDate).getTime(),
      ),
    [deliveriesQuery.data],
  );

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={{ gap: 12 }}>
        <View style={ui.card}>
          <Text style={styles.meta}>Shop: {activeShop?.shopName ?? "-"}</Text>
          <Text style={styles.meta}>Recent deliveries are listed below.</Text>

          <PrimaryButton
            label="Receive Delivery"
            onPress={() => navigation.navigate("ReceiveDelivery")}
          />
        </View>

        <View style={ui.card}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Deliveries</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={deliveriesQuery.isFetching ? "Refreshing deliveries" : "Refresh deliveries"}
              style={[styles.iconButton, (!shopId || deliveriesQuery.isFetching) ? styles.iconButtonDisabled : null]}
              onPress={() => void deliveriesQuery.refetch()}
              disabled={!shopId || deliveriesQuery.isFetching}
            >
              <Text style={styles.iconGlyph}>{deliveriesQuery.isFetching ? "*" : "\u21BB"}</Text>
            </Pressable>
          </View>
          {deliveries.length === 0 && !deliveriesQuery.isFetching ? (
            <Text style={styles.meta}>No deliveries found for this shop.</Text>
          ) : null}

          {deliveries.map((delivery) => (
            <View key={delivery.id} style={styles.item}>
              <Text style={styles.itemTitle}>{delivery.deliveryReference}</Text>
              <Text style={styles.meta}>Supplier: {delivery.supplierName}</Text>
              <Text style={styles.meta}>Date: {new Date(delivery.deliveryDate).toLocaleDateString()}</Text>
              <Text style={styles.meta}>Packs: {delivery.packs.length}</Text>
              {delivery.notes ? <Text style={styles.meta}>Notes: {delivery.notes}</Text> : null}
            </View>
          ))}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 24,
    lineHeight: 28,
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.heading,
  },
  sectionTitle: {
    fontSize: 17,
    lineHeight: 22,
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  iconButton: {
    width: 32,
    height: 32,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: appTheme.colors.surfaceMuted,
  },
  iconButtonDisabled: {
    opacity: 0.5,
  },
  iconGlyph: {
    color: appTheme.colors.primary,
    fontSize: 18,
    lineHeight: 18,
    fontFamily: appTheme.fonts.bodyMedium,
  },
  item: {
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    padding: 10,
    gap: 4,
  },
  itemTitle: {
    fontFamily: appTheme.fonts.bodyMedium,
    color: appTheme.colors.text,
    fontSize: 14,
    lineHeight: 18,
  },
  meta: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.body,
    fontSize: 13,
    lineHeight: 18,
  },
});
