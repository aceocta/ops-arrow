import React from "react";
import { Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { CoinBagStatus, CoinBagStockRow, getCoinPodDashboard } from "../../api/coinPodApi";
import { useAuth } from "../../auth/AuthContext";
import { EmptyState } from "../../components/EmptyState";
import { LoadingState } from "../../components/LoadingState";
import { ScreenContainer } from "../../components/ScreenContainer";
import { StatusBadge } from "../../components/StatusBadge";
import { MainStackParamList } from "../../types/navigation";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";

const MANAGE_ROLES = ["PlatformAdmin", "CompanyOwner", "Manager"];

function money(value: number) {
  return `£${(value ?? 0).toFixed(2)}`;
}

function statusTone(status: CoinBagStatus): "neutral" | "warning" | "danger" | "success" {
  switch (status) {
    case "OutOfStock": return "danger";
    case "LowStock": return "warning";
    case "Disabled": return "neutral";
    default: return "success";
  }
}

function statusLabel(status: CoinBagStatus) {
  switch (status) {
    case "OutOfStock": return "Out of stock";
    case "LowStock": return "Low stock";
    case "Disabled": return "Disabled";
    default: return "Normal";
  }
}

type Action = { label: string; icon: keyof typeof Ionicons.glyphMap; screen: keyof MainStackParamList; manage?: boolean };

const ACTIONS: Action[] = [
  { label: "Notes → Coins", icon: "swap-horizontal-outline", screen: "CoinNotesToCoins" },
  { label: "Coins → Notes", icon: "swap-horizontal-outline", screen: "CoinCoinsToNotes" },
  { label: "Adjust", icon: "create-outline", screen: "CoinAdjustment", manage: true },
  { label: "History", icon: "time-outline", screen: "CoinHistory" },
];

export function CoinPodDashboardScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { activeShopId, activeShop, profile } = useAuth();
  const canManage = MANAGE_ROLES.includes(activeShop?.role ?? "") || (profile?.roles?.some((r) => MANAGE_ROLES.includes(r)) ?? false);

  const query = useQuery({
    queryKey: ["coin-pod-dashboard", activeShopId],
    queryFn: () => getCoinPodDashboard(activeShopId as string),
    enabled: Boolean(activeShopId),
  });

  const data = query.data;

  return (
    <ScreenContainer
      refreshControl={
        <RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} tintColor={appTheme.colors.primary} />
      }
    >
      {query.isLoading ? (
        <View style={ui.card}><LoadingState message="Loading coin stock…" inline /></View>
      ) : !data ? (
        <EmptyState icon="cash-outline" title="Coin Pod unavailable" message="Pull down to retry." />
      ) : (
        <>
          <View style={[ui.card, styles.summary]}>
            <View>
              <Text style={styles.summaryLabel}>Total coin bag value</Text>
              <Text style={styles.summaryValue}>{money(data.totalCoinValue)}</Text>
            </View>
            <Pressable
              style={styles.alertPill}
              onPress={() => navigation.navigate("CoinAlerts")}
              accessibilityRole="button"
              accessibilityLabel="View coin alerts"
            >
              <Ionicons
                name={data.activeAlertCount > 0 ? "alert-circle" : "alert-circle-outline"}
                size={18}
                color={data.activeAlertCount > 0 ? appTheme.colors.danger : appTheme.colors.textSubtle}
              />
              <Text style={[styles.alertText, data.activeAlertCount > 0 ? styles.alertTextActive : null]}>
                {data.activeAlertCount > 0 ? `${data.activeAlertCount} active` : "No alerts"}
              </Text>
            </Pressable>
          </View>

          <View style={styles.actions}>
            {ACTIONS.filter((a) => !a.manage || canManage).map((a) => (
              <Pressable
                key={a.screen}
                style={styles.action}
                onPress={() => navigation.navigate(a.screen as never)}
                accessibilityRole="button"
                accessibilityLabel={a.label}
              >
                <Ionicons name={a.icon} size={20} color={appTheme.colors.primary} />
                <Text style={styles.actionText}>{a.label}</Text>
              </Pressable>
            ))}
          </View>

          {data.items.length === 0 ? (
            <EmptyState icon="cash-outline" title="No coin denominations" message="Coin bag configuration will appear here." />
          ) : (
            <View style={styles.list}>
              {data.items.map((row) => (
                <CoinRow
                  key={row.coinDenominationId}
                  row={row}
                  onPress={canManage ? () => navigation.navigate("CoinBagConfig") : undefined}
                />
              ))}
            </View>
          )}
        </>
      )}
    </ScreenContainer>
  );
}

function CoinRow({ row, onPress }: { row: CoinBagStockRow; onPress?: () => void }) {
  return (
    <Pressable
      style={[ui.listItem, styles.row, !row.isActive ? styles.rowMuted : null]}
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={`${row.displayLabel} coin bags, ${statusLabel(row.status)}`}
    >
      <View style={styles.coinBadge}>
        <Text style={styles.coinBadgeText}>{row.displayLabel}</Text>
      </View>
      <View style={styles.rowMain}>
        <Text style={styles.rowTitle} numberOfLines={1}>{row.currentBagQuantity} bag{row.currentBagQuantity === 1 ? "" : "s"} · {money(row.currentTotalValue)}</Text>
        <Text style={styles.rowMeta} numberOfLines={1}>Bag {money(row.bagValue)} · alert ≤ {row.stockAlertLimit}</Text>
      </View>
      <StatusBadge label={statusLabel(row.status)} tone={statusTone(row.status)} />
      {onPress ? <Ionicons name="chevron-forward" size={16} color={appTheme.colors.textSubtle} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  summary: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  summaryLabel: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 12 },
  summaryValue: { color: appTheme.colors.text, fontFamily: appTheme.fonts.heading, fontSize: 24, marginTop: 2 },
  alertPill: { flexDirection: "row", alignItems: "center", gap: 6 },
  alertText: { color: appTheme.colors.textSubtle, fontFamily: appTheme.fonts.bodyMedium, fontSize: 13 },
  alertTextActive: { color: appTheme.colors.danger },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: appTheme.spacing.sm, marginTop: appTheme.spacing.sm },
  action: {
    flexGrow: 1, flexBasis: "45%", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    borderWidth: 1, borderColor: appTheme.colors.primary, borderRadius: appTheme.radius.sm,
    paddingVertical: 12, backgroundColor: appTheme.colors.surfaceBrandSoft,
  },
  actionText: { color: appTheme.colors.primary, fontFamily: appTheme.fonts.bodyMedium, fontSize: 13 },
  list: { gap: appTheme.spacing.xs, marginTop: appTheme.spacing.sm },
  row: { flexDirection: "row", alignItems: "center", gap: appTheme.spacing.sm },
  rowMuted: { opacity: 0.55 },
  coinBadge: {
    width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center",
    backgroundColor: appTheme.colors.surfaceBrandSoft, borderWidth: 1, borderColor: appTheme.colors.primary,
  },
  coinBadgeText: { color: appTheme.colors.primary, fontFamily: appTheme.fonts.heading, fontSize: 13 },
  rowMain: { flex: 1, gap: 2 },
  rowTitle: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 15, lineHeight: 19 },
  rowMeta: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 12, lineHeight: 16 },
});
