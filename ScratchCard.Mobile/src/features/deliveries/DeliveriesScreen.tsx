import React, { useCallback, useMemo } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import { listDeliveries } from "../../api/deliveriesApi";
import { useAuth } from "../../auth/AuthContext";
import { EmptyState } from "../../components/EmptyState";
import { PrimaryButton } from "../../components/PrimaryButton";
import { ScreenContainer } from "../../components/ScreenContainer";
import { SkeletonList } from "../../components/Skeleton";
import type { MainStackParamList } from "../../types/navigation";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";

type DeliveryItem = ReturnType<typeof useDeliveries>["deliveries"][number];

function useDeliveries(shopId: string | null) {
  const query = useQuery({
    queryKey: ["deliveries", shopId],
    queryFn: () => listDeliveries(shopId as string),
    enabled: Boolean(shopId),
  });

  const deliveries = useMemo(
    () =>
      [...(query.data ?? [])].sort(
        (a, b) => new Date(b.deliveryDate).getTime() - new Date(a.deliveryDate).getTime()
      ),
    [query.data]
  );

  return { ...query, deliveries };
}

export function DeliveriesScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { activeShopId, activeShop } = useAuth();
  const shopId = activeShopId;

  const deliveriesQuery = useDeliveries(shopId);

  const handleRefresh = useCallback(() => {
    void deliveriesQuery.refetch();
  }, [deliveriesQuery]);

  const renderItem = useCallback(
    ({ item }: { item: DeliveryItem }) => (
      <View style={styles.item}>
        <Text style={styles.itemTitle}>{item.deliveryReference}</Text>
        <Text style={styles.meta}>Supplier: {item.supplierName}</Text>
        <Text style={styles.meta}>Date: {new Date(item.deliveryDate).toLocaleDateString()}</Text>
        <Text style={styles.meta}>Packs: {item.packs.length}</Text>
        {item.notes ? <Text style={styles.meta}>Notes: {item.notes}</Text> : null}
      </View>
    ),
    []
  );

  const keyExtractor = useCallback((item: DeliveryItem) => item.id, []);

  const isInitialLoading = deliveriesQuery.isLoading && deliveriesQuery.deliveries.length === 0;

  return (
    <ScreenContainer>
      <View style={ui.card}>
        <Text style={styles.meta}>Shop: {activeShop?.shopName ?? "-"}</Text>
        <Text style={styles.meta}>Recent deliveries are listed below.</Text>

        <PrimaryButton label="Receive Delivery" onPress={() => navigation.navigate("ReceiveDelivery")} />
      </View>

      <View style={ui.card}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Deliveries</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={deliveriesQuery.isFetching ? "Refreshing deliveries" : "Refresh deliveries"}
            style={[styles.iconButton, !shopId || deliveriesQuery.isFetching ? styles.iconButtonDisabled : null]}
            onPress={handleRefresh}
            disabled={!shopId || deliveriesQuery.isFetching}
          >
            <Text style={styles.iconGlyph}>{deliveriesQuery.isFetching ? "*" : "↻"}</Text>
          </Pressable>
        </View>

        {isInitialLoading ? (
          <SkeletonList count={4} rowHeight={68} />
        ) : deliveriesQuery.deliveries.length === 0 ? (
          <EmptyState
            icon="cube-outline"
            title="No deliveries yet"
            message="Receive your first delivery to start tracking packs and reconciliation."
            actionLabel="Receive Delivery"
            onAction={() => navigation.navigate("ReceiveDelivery")}
          />
        ) : (
          <FlatList
            data={deliveriesQuery.deliveries}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            scrollEnabled={false}
            ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            refreshControl={
              <RefreshControl refreshing={deliveriesQuery.isRefetching} onRefresh={handleRefresh} />
            }
          />
        )}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
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
