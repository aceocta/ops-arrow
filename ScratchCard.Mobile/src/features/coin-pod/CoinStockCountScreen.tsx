import React, { useLayoutEffect, useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { CoinBagStockRow, getCoinPodDashboard, recordCoinStock } from "../../api/coinPodApi";
import { useAuth } from "../../auth/AuthContext";
import { LoadingState } from "../../components/LoadingState";
import { PrimaryButton } from "../../components/PrimaryButton";
import { ScreenContainer } from "../../components/ScreenContainer";
import { toastError, toastSuccess } from "../../components/toast";
import { MainStackParamList } from "../../types/navigation";
import { getApiErrorMessage } from "../../utils/apiErrorMessage";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";

const INSTRUCTION =
  "Enter the total cash value you're holding for each denomination. It's converted to a pack count " +
  "(value ÷ pack value) and sets the current stock. Leave a row blank to keep it unchanged.";

function sanitizeMoney(raw: string): string {
  let s = raw.replace(/,/g, ".").replace(/[^\d.]/g, "");
  const dot = s.indexOf(".");
  if (dot !== -1) s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, "").slice(0, 2);
  return s;
}

function money(value: number) {
  return `£${(value ?? 0).toFixed(2)}`;
}

function packsFor(value: string, bagValue: number): number | null {
  const v = Number(value);
  if (!value.trim() || !Number.isFinite(v) || bagValue <= 0) return null;
  return Math.max(0, Math.round(v / bagValue));
}

export function CoinStockCountScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const queryClient = useQueryClient();
  const { activeShopId } = useAuth();
  const [values, setValues] = useState<Record<string, string>>({});

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={styles.headerRight}>
          <View style={styles.legendCircle} />
          <Text style={styles.legendText}>Coin</Text>
          <View style={styles.legendRect} />
          <Text style={styles.legendText}>Note</Text>
          <Pressable
            onPress={() => Alert.alert("How to record stock", INSTRUCTION, [{ text: "Got it" }])}
            hitSlop={10}
            style={styles.helpBtn}
            accessibilityRole="button"
            accessibilityLabel="How to record stock"
          >
            <Ionicons name="help-circle-outline" size={22} color={appTheme.colors.primary} />
          </Pressable>
        </View>
      ),
    });
  }, [navigation]);

  const query = useQuery({
    queryKey: ["coin-pod-dashboard", activeShopId],
    queryFn: () => getCoinPodDashboard(activeShopId as string),
    enabled: Boolean(activeShopId),
  });

  const items = useMemo(() => (query.data?.items ?? []).filter((i) => i.isActive), [query.data]);

  const entries = items
    .filter((i) => (values[i.coinDenominationId] ?? "").trim() !== "")
    .map((i) => ({ coinDenominationId: i.coinDenominationId, value: Number(values[i.coinDenominationId]) }))
    .filter((e) => Number.isFinite(e.value) && e.value >= 0);

  const mutation = useMutation({
    mutationFn: () => recordCoinStock(activeShopId as string, entries),
    onSuccess: () => {
      toastSuccess(`Stock updated for ${entries.length} denomination${entries.length === 1 ? "" : "s"}.`);
      void queryClient.invalidateQueries({ queryKey: ["coin-pod-dashboard", activeShopId] });
      void queryClient.invalidateQueries({ queryKey: ["coin-pod-transactions", activeShopId] });
      void queryClient.invalidateQueries({ queryKey: ["coin-pod-alerts", activeShopId] });
      navigation.goBack();
    },
    onError: (error: unknown) => toastError(getApiErrorMessage(error, "Unable to record stock.")),
  });

  const setValue = (id: string, raw: string) => setValues((prev) => ({ ...prev, [id]: sanitizeMoney(raw) }));

  const renderRow = (row: CoinBagStockRow) => {
    const value = values[row.coinDenominationId] ?? "";
    const packs = packsFor(value, row.bagValue);
    return (
      <View key={row.coinDenominationId} style={[ui.card, styles.itemCard]}>
        <View style={styles.badgeWrap}>
          <View style={[styles.badgeBase, row.isNote ? styles.noteBadge : styles.coinBadge]}>
            <Text style={styles.badgeText}>{row.displayLabel}</Text>
          </View>
        </View>
        <View style={styles.rowMain}>
          <Text style={styles.rowLine} numberOfLines={1}>
            {money(row.bagValue)}/pack · now {row.currentBagQuantity}{packs != null ? ` → ${packs}` : ""}
          </Text>
        </View>
        <View style={styles.moneyInput}>
          <Text style={styles.moneyPrefix}>£</Text>
          <TextInput
            style={styles.moneyField}
            value={value}
            onChangeText={(v) => setValue(row.coinDenominationId, v)}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor={appTheme.colors.textSubtle}
            accessibilityLabel={`Value held for ${row.displayLabel}`}
          />
        </View>
      </View>
    );
  };

  return (
    <ScreenContainer
      footer={
        <PrimaryButton
          label={mutation.isPending ? "Saving…" : `Record stock (${entries.length})`}
          onPress={() => { if (entries.length > 0 && !mutation.isPending) mutation.mutate(); }}
          disabled={entries.length === 0 || mutation.isPending}
        />
      }
    >
      {query.isLoading ? (
        <View style={ui.card}><LoadingState message="Loading denominations…" inline /></View>
      ) : (
        <View style={styles.list}>{items.map(renderRow)}</View>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  helpBtn: { paddingHorizontal: 6, paddingVertical: 2 },
  list: { gap: 6 },
  itemCard: {
    flexDirection: "row", alignItems: "center", gap: appTheme.spacing.sm,
    paddingVertical: appTheme.spacing.xs, paddingHorizontal: appTheme.spacing.sm,
  },
  badgeWrap: { width: 46, alignItems: "center" },
  badgeBase: {
    alignItems: "center", justifyContent: "center",
    backgroundColor: appTheme.colors.surfaceBrandSoft, borderWidth: 1, borderColor: appTheme.colors.primary,
  },
  // Coins = circle, notes = rectangle.
  coinBadge: { width: 34, height: 34, borderRadius: 17 },
  noteBadge: { width: 44, height: 28, borderRadius: 5 },
  badgeText: { color: appTheme.colors.primary, fontFamily: appTheme.fonts.heading, fontSize: 13 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 5, paddingRight: 2 },
  legendCircle: { width: 13, height: 13, borderRadius: 7, borderWidth: 1, borderColor: appTheme.colors.primary, backgroundColor: appTheme.colors.surfaceBrandSoft },
  legendRect: { width: 17, height: 11, borderRadius: 3, borderWidth: 1, borderColor: appTheme.colors.primary, backgroundColor: appTheme.colors.surfaceBrandSoft },
  legendText: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 11 },
  rowMain: { flex: 1 },
  rowLine: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 13, lineHeight: 17 },
  moneyInput: {
    flexDirection: "row", alignItems: "center", width: 100, height: 36,
    borderRadius: appTheme.radius.sm, backgroundColor: appTheme.colors.surfaceMuted, paddingHorizontal: 8, gap: 2,
  },
  moneyPrefix: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 14 },
  moneyField: { flex: 1, color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 15, padding: 0, textAlign: "right" },
});
