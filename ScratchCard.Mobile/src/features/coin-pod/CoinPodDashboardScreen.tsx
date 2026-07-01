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

function statusShort(status: CoinBagStatus) {
  switch (status) {
    case "OutOfStock": return "Out";
    case "LowStock": return "Low";
    case "Disabled": return "Off";
    default: return "OK";
  }
}

type Action = { label: string; icon: keyof typeof Ionicons.glyphMap; screen: keyof MainStackParamList; manage?: boolean };

const ACTIONS: Action[] = [
  { label: "Record Stock", icon: "clipboard-outline", screen: "CoinStockCount" },
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
  const activeItems = data?.items.filter((r) => r.isActive) ?? [];
  const totalDefault = activeItems.reduce((s, r) => s + r.openingBagQuantity, 0);
  const totalCurrent = activeItems.reduce((s, r) => s + r.currentBagQuantity, 0);
  const totalDefaultValue = activeItems.reduce((s, r) => s + r.openingBagQuantity * r.bagValue, 0);
  const totalCurrentValue = data?.totalCoinValue ?? 0;

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
            <View style={styles.summaryStats}>
              <View style={styles.stat}>
                <Text style={styles.statLabel}>Default</Text>
                <Text style={styles.statBig}>{money(totalDefaultValue)}</Text>
                <Text style={styles.statSub}>{totalDefault} bag{totalDefault === 1 ? "" : "s"}</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.stat}>
                <Text style={styles.statLabel}>Current</Text>
                <Text style={styles.statBig}>{money(totalCurrentValue)}</Text>
                <Text style={styles.statSub}>{totalCurrent} bag{totalCurrent === 1 ? "" : "s"}</Text>
              </View>
            </View>
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
            <View style={[ui.card, styles.tableCard]}>
              <View style={[styles.tr, styles.headRow]}>
                <Text style={[styles.th, styles.colCoin]}>Coin</Text>
                <Text style={[styles.th, styles.colSmall]}>Default</Text>
                <Text style={[styles.th, styles.colCurrent]}>Current</Text>
                <Text style={[styles.th, styles.colValue]}>Value</Text>
                <View style={styles.colStatus}><Text style={[styles.th, styles.thRight]}>Status</Text></View>
              </View>
              {data.items.map((row) => (
                <CoinTableRow
                  key={row.coinDenominationId}
                  row={row}
                  onPress={canManage ? () => navigation.navigate("CoinBagConfig") : undefined}
                />
              ))}
              <View style={[styles.tr, styles.totalRow]}>
                <Text style={[styles.tdCoin, styles.colCoin]}>Total</Text>
                <Text style={[styles.td, styles.tdMuted, styles.colSmall]}>{totalDefault}</Text>
                <Text style={[styles.td, styles.tdStrong, styles.colCurrent]}>{totalCurrent}</Text>
                <Text style={[styles.td, styles.tdStrong, styles.colValue]}>{money(data.totalCoinValue)}</Text>
                <View style={styles.colStatus} />
              </View>
            </View>
          )}
        </>
      )}
    </ScreenContainer>
  );
}

function CoinTableRow({ row, onPress }: { row: CoinBagStockRow; onPress?: () => void }) {
  return (
    <Pressable
      style={[styles.tr, styles.rowCell, !row.isActive ? styles.rowMuted : null]}
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={`${row.displayLabel} coin bags, ${row.currentBagQuantity} bags, ${statusShort(row.status)}`}
    >
      <Text style={[styles.tdCoin, styles.colCoin]}>{row.displayLabel}</Text>
      <Text style={[styles.td, styles.tdMuted, styles.colSmall]}>{row.openingBagQuantity}</Text>
      <Text style={[styles.td, styles.tdStrong, styles.colCurrent]}>{row.currentBagQuantity}</Text>
      <Text style={[styles.td, styles.colValue]}>{money(row.currentTotalValue)}</Text>
      <View style={[styles.colStatus, styles.statusCell]}>
        <StatusBadge label={statusShort(row.status)} tone={statusTone(row.status)} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  summary: { paddingVertical: appTheme.spacing.xs, gap: 0 },
  summaryStats: { flexDirection: "row", alignItems: "center" },
  stat: { flex: 1 },
  statLabel: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4 },
  statBig: { color: appTheme.colors.text, fontFamily: appTheme.fonts.heading, fontSize: 19, marginTop: 1 },
  statSub: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.bodyMedium, fontSize: 12, marginTop: 1 },
  statDivider: { width: StyleSheet.hairlineWidth, alignSelf: "stretch", backgroundColor: appTheme.colors.border, marginHorizontal: appTheme.spacing.md },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: appTheme.spacing.sm },
  action: {
    flexGrow: 1, flexBasis: "45%", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    borderWidth: 1, borderColor: appTheme.colors.primary, borderRadius: appTheme.radius.sm,
    paddingVertical: 10, backgroundColor: appTheme.colors.surfaceBrandSoft,
  },
  actionText: { color: appTheme.colors.primary, fontFamily: appTheme.fonts.bodyMedium, fontSize: 13 },

  // Table
  tableCard: { paddingVertical: appTheme.spacing.xs, gap: 0 },
  tr: { flexDirection: "row", alignItems: "center", paddingVertical: 7, gap: appTheme.spacing.xs },
  headRow: { paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: appTheme.colors.border },
  rowCell: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: appTheme.colors.border },
  totalRow: { borderTopWidth: 1.5, borderTopColor: appTheme.colors.border, marginTop: 2, paddingTop: 12 },
  rowMuted: { opacity: 0.55 },
  th: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.bodyMedium, fontSize: 11, textTransform: "uppercase" },
  thRight: { textAlign: "right" },
  td: { color: appTheme.colors.text, fontFamily: appTheme.fonts.body, fontSize: 15, textAlign: "right" },
  tdMuted: { color: appTheme.colors.textMuted },
  tdStrong: { fontFamily: appTheme.fonts.bodyMedium },
  tdCoin: { color: appTheme.colors.text, fontFamily: appTheme.fonts.heading, fontSize: 16 },
  colCoin: { flex: 0.9 },
  colNum: { flex: 1, textAlign: "right" },
  colSmall: { flex: 1.1, textAlign: "right" },
  colCurrent: { flex: 1.05, textAlign: "right" },
  colValue: { flex: 1.6, textAlign: "right" },
  colStatus: { flex: 1.2, alignItems: "flex-end" },
  statusCell: { flexDirection: "row", justifyContent: "flex-end" },
});
