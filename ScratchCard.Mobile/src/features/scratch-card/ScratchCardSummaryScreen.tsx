import React, { useMemo } from "react";
import { RefreshControl, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import { getShiftSales, listShifts } from "../../api/shiftsApi";
import { PrimaryButton } from "../../components/PrimaryButton";
import { ScreenContainer } from "../../components/ScreenContainer";
import { SectionHeader } from "../../components/SectionHeader";
import { KpiGrid, KpiTile } from "../../components/KpiTile";
import { Skeleton } from "../../components/Skeleton";
import { StatusBadge } from "../../components/StatusBadge";
import type { MainStackParamList } from "../../types/navigation";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";

type ScratchCardSummaryRoute = RouteProp<MainStackParamList, "ScratchCardSummary">;

type PackRow = {
  id: string;
  packNumber: string;
  displayNumber?: number | null;
  openingSerialNumber: string;
  closingSerialNumber: string;
  ticketPrice: number;
  soldQuantity: number;
  salesAmount: number;
  missingQuantity: number;
};

type ShiftGroup = {
  shiftId: string;
  shiftName: string;
  status: string;
  packs: PackRow[];
  soldQuantity: number;
  amount: number;
  missingTickets: number;
};

function formatCurrencyGBP(value: number) {
  return `£${value.toFixed(2)}`;
}

export function ScratchCardSummaryScreen() {
  const route = useRoute<ScratchCardSummaryRoute>();
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { businessDayId, businessDate, shopId } = route.params;

  const shiftsQuery = useQuery({
    queryKey: ["shifts", shopId, businessDayId],
    queryFn: () => listShifts(shopId, businessDayId),
    enabled: Boolean(shopId),
  });

  const shifts = useMemo(() => {
    const list = [...(shiftsQuery.data ?? [])];
    return list.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  }, [shiftsQuery.data]);
  const shiftIds = useMemo(() => shifts.map((shift) => shift.id), [shifts]);
  const shiftIdsKey = shiftIds.join(",");

  const salesQuery = useQuery({
    queryKey: ["scratch-card-summary-sales", businessDayId, shiftIdsKey],
    queryFn: async () => {
      const entries = await Promise.all(
        shifts.map(async (shift) => {
          try {
            const sales = await getShiftSales(shift.id);
            return [shift.id, sales] as const;
          } catch {
            return [shift.id, []] as const;
          }
        }),
      );
      return Object.fromEntries(entries) as Record<string, Awaited<ReturnType<typeof getShiftSales>>>;
    },
    enabled: shiftIds.length > 0,
  });

  const groups = useMemo<ShiftGroup[]>(
    () =>
      shifts.map((shift) => {
        const packs: PackRow[] = (salesQuery.data?.[shift.id] ?? []).map((entry) => ({
          id: entry.id,
          packNumber: entry.packNumber,
          displayNumber: entry.displayNumber,
          openingSerialNumber: entry.openingSerialNumber,
          closingSerialNumber: entry.closingSerialNumber,
          ticketPrice: Number(entry.ticketPrice ?? 0),
          soldQuantity: Number(entry.soldQuantity ?? 0),
          salesAmount: Number(entry.salesAmount ?? 0),
          missingQuantity: Number(entry.missingQuantity ?? 0),
        }));
        const totals = packs.reduce(
          (acc, p) => ({
            soldQuantity: acc.soldQuantity + p.soldQuantity,
            amount: acc.amount + p.salesAmount,
          }),
          { soldQuantity: 0, amount: 0 },
        );
        return {
          shiftId: shift.id,
          shiftName: shift.shiftName,
          status: shift.status,
          packs,
          soldQuantity: totals.soldQuantity,
          amount: totals.amount,
          missingTickets: shift.missingOpeningTicketCount ?? 0,
        };
      }),
    [shifts, salesQuery.data],
  );

  const dayTotals = useMemo(
    () =>
      groups.reduce(
        (acc, group) => ({
          soldQuantity: acc.soldQuantity + group.soldQuantity,
          amount: acc.amount + group.amount,
          missingTickets: acc.missingTickets + group.missingTickets,
        }),
        { soldQuantity: 0, amount: 0, missingTickets: 0 },
      ),
    [groups],
  );

  const isLoading = shiftsQuery.isLoading || (shiftIds.length > 0 && salesQuery.isLoading);
  const isRefetching = shiftsQuery.isRefetching || salesQuery.isRefetching;

  const refresh = () => {
    void shiftsQuery.refetch();
    void salesQuery.refetch();
  };

  return (
    <ScreenContainer
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={refresh}
          tintColor={appTheme.colors.primary}
        />
      }
    >
      <View style={[ui.card, styles.card]}>
        <SectionHeader
          title="Scratch Card Summary"
          subtitle={businessDate}
          icon="albums-outline"
          right={
            dayTotals.missingTickets > 0 ? (
              <StatusBadge label={`${dayTotals.missingTickets} missing`} tone="danger" />
            ) : undefined
          }
        />
        <KpiGrid columns={2}>
          <KpiTile label="Sold Qty" value={dayTotals.soldQuantity} />
          <KpiTile label="Sales Amount" value={formatCurrencyGBP(dayTotals.amount)} />
        </KpiGrid>
        {dayTotals.missingTickets > 0 ? (
          <Text style={styles.missingText}>
            {dayTotals.missingTickets} missing scratch card ticket{dayTotals.missingTickets === 1 ? "" : "s"} across all shifts.
          </Text>
        ) : null}
      </View>

      {isLoading ? (
        <View style={[ui.card, styles.card]}>
          <View style={styles.skeletonStack}>
            <Skeleton height={40} radius={appTheme.radius.sm} />
            <Skeleton height={40} radius={appTheme.radius.sm} />
            <Skeleton height={40} radius={appTheme.radius.sm} />
          </View>
        </View>
      ) : groups.length === 0 ? (
        <View style={[ui.card, styles.card]}>
          <Text style={styles.meta}>No shifts recorded for this day.</Text>
        </View>
      ) : (
        groups.map((group) => (
          <View key={group.shiftId} style={[ui.card, styles.card]}>
            <SectionHeader
              title={group.shiftName}
              subtitle={group.status}
              icon="layers-outline"
              right={
                group.missingTickets > 0 ? (
                  <StatusBadge label={`${group.missingTickets} missing`} tone="danger" />
                ) : undefined
              }
            />
            {group.packs.length === 0 ? (
              <Text style={styles.meta}>No scratch card sales for this shift.</Text>
            ) : (
              <View style={styles.packList}>
                {group.packs.map((pack) => (
                  <View key={pack.id} style={[styles.packItem, pack.missingQuantity > 0 ? styles.packItemMissing : null]}>
                    <View style={styles.packTopRow}>
                      <Text style={styles.packTitle} numberOfLines={1}>
                        {pack.displayNumber != null ? `#${pack.displayNumber} · ` : ""}
                        Pack {pack.packNumber}
                      </Text>
                      {pack.missingQuantity > 0 ? (
                        <StatusBadge label={`${pack.missingQuantity} missing`} tone="danger" />
                      ) : null}
                      <Text style={styles.packSales}>{formatCurrencyGBP(pack.salesAmount)}</Text>
                    </View>
                    <View style={styles.serialRow}>
                      <Text style={styles.serialLabel}>Open</Text>
                      <Text style={styles.serialValue} numberOfLines={1}>{pack.openingSerialNumber || "-"}</Text>
                      <Ionicons name="arrow-forward" size={12} color={appTheme.colors.textSubtle} />
                      <Text style={styles.serialLabel}>Close</Text>
                      <Text style={styles.serialValue} numberOfLines={1}>{pack.closingSerialNumber || "-"}</Text>
                    </View>
                    <Text style={styles.packMeta}>
                      {formatCurrencyGBP(pack.ticketPrice)} · {pack.soldQuantity} sold
                    </Text>
                  </View>
                ))}
                <View style={styles.subtotalRow}>
                  <Text style={styles.subtotalLabel}>Subtotal</Text>
                  <Text style={styles.subtotalValue}>
                    {group.soldQuantity} sold · {formatCurrencyGBP(group.amount)}
                  </Text>
                </View>
              </View>
            )}
          </View>
        ))
      )}

      <PrimaryButton
        label="View Daily Sales Report"
        tone="neutral"
        icon="stats-chart-outline"
        onPress={() => navigation.navigate("DailySalesReport", { date: businessDate })}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: appTheme.spacing.sm,
  },
  meta: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.body,
    fontSize: 13,
    lineHeight: 18,
  },
  missingText: {
    color: appTheme.colors.danger,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 18,
  },
  skeletonStack: {
    gap: 8,
  },
  packList: {
    gap: appTheme.spacing.xs,
  },
  packItem: {
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceTint,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: appTheme.spacing.sm,
    gap: 4,
  },
  packItemMissing: {
    borderWidth: 1,
    borderColor: appTheme.colors.danger,
  },
  packTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: appTheme.spacing.sm,
  },
  packTitle: {
    flex: 1,
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 15,
    lineHeight: 19,
  },
  packSales: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.heading,
    fontSize: 16,
    lineHeight: 20,
  },
  serialRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 4,
  },
  serialLabel: {
    color: appTheme.colors.textSubtle,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 10,
    lineHeight: 14,
    textTransform: "uppercase",
  },
  serialValue: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.body,
    fontSize: 13,
    lineHeight: 16,
  },
  packMeta: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.body,
    fontSize: 12,
    lineHeight: 16,
  },
  subtotalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: appTheme.spacing.sm,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: appTheme.colors.border,
  },
  subtotalLabel: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.heading,
    fontSize: 14,
    lineHeight: 18,
  },
  subtotalValue: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.heading,
    fontSize: 14,
    lineHeight: 18,
  },
});
