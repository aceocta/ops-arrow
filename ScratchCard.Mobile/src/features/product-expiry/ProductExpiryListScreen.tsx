import React, { useState } from "react";
import { Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { listProducts, ProductBatch, ProductExpiryStatus } from "../../api/productExpiryApi";
import { useAuth } from "../../auth/AuthContext";
import { EmptyState } from "../../components/EmptyState";
import { LoadingState } from "../../components/LoadingState";
import { PrimaryButton } from "../../components/PrimaryButton";
import { ScreenContainer } from "../../components/ScreenContainer";
import { SegmentedControl } from "../../components/SegmentedControl";
import { StatusBadge } from "../../components/StatusBadge";
import { MainStackParamList } from "../../types/navigation";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";

type Filter = "all" | ProductExpiryStatus;

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "Urgent", label: "Urgent" },
  { value: "ExpiringSoon", label: "Soon" },
  { value: "Expired", label: "Expired" },
];

function statusTone(status: ProductExpiryStatus): "neutral" | "warning" | "danger" | "success" {
  if (status === "Safe") return "success";
  if (status === "ExpiringSoon") return "warning";
  return "danger"; // Urgent + Expired
}

function statusLabel(status: ProductExpiryStatus) {
  return status === "ExpiringSoon" ? "Expiring soon" : status;
}

function daysLabel(days: number) {
  if (days < 0) return `${Math.abs(days)}d ago`;
  if (days === 0) return "today";
  return `${days}d left`;
}

export function ProductExpiryListScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { activeShopId } = useAuth();
  const [filter, setFilter] = useState<Filter>("all");

  const query = useQuery({
    queryKey: ["product-expiry", activeShopId, filter],
    queryFn: () => listProducts(activeShopId as string, filter === "all" ? undefined : filter),
    enabled: Boolean(activeShopId),
  });

  const items = query.data ?? [];

  return (
    <ScreenContainer
      refreshControl={
        <RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} tintColor={appTheme.colors.primary} />
      }
      footer={<PrimaryButton label="Add product" onPress={() => navigation.navigate("AddProduct")} />}
    >
      <SegmentedControl options={FILTERS} value={filter} onChange={setFilter} />

      {query.isLoading ? (
        <View style={ui.card}><LoadingState message="Loading products…" inline /></View>
      ) : items.length === 0 ? (
        <EmptyState
          icon="cube-outline"
          title={filter === "all" ? "No products tracked yet" : "Nothing in this band"}
          message={filter === "all" ? "Add a product with its expiry date to start tracking." : "Switch filter or add a product."}
        />
      ) : (
        <View style={styles.list}>
          {items.map((item) => (
            <ProductRow key={item.id} item={item} onPress={() => navigation.navigate("ProductExpiryDetail", { id: item.id })} />
          ))}
        </View>
      )}
    </ScreenContainer>
  );
}

function ProductRow({ item, onPress }: { item: ProductBatch; onPress: () => void }) {
  return (
    <Pressable style={[ui.listItem, styles.row]} onPress={onPress} accessibilityRole="button" accessibilityLabel={`${item.productName}, ${statusLabel(item.status)}`}>
      <View style={styles.rowMain}>
        <Text style={styles.rowTitle} numberOfLines={1}>{item.productName}</Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {item.categoryName} · {item.remainingQuantity} left · {item.expiryDate}
        </Text>
      </View>
      <View style={styles.rowRight}>
        <StatusBadge label={statusLabel(item.status)} tone={statusTone(item.status)} />
        <Text style={[styles.days, item.daysToExpiry <= 0 ? styles.daysBad : null]}>{daysLabel(item.daysToExpiry)}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={appTheme.colors.textSubtle} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { gap: appTheme.spacing.xs },
  row: { flexDirection: "row", alignItems: "center", gap: appTheme.spacing.sm },
  rowMain: { flex: 1, gap: 2 },
  rowTitle: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 15, lineHeight: 19 },
  rowMeta: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 12, lineHeight: 16 },
  rowRight: { alignItems: "flex-end", gap: 4 },
  days: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.bodyMedium, fontSize: 12 },
  daysBad: { color: appTheme.colors.danger },
});
