import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
  "Each denomination box shows its current total value. Tap a box to clear it and type the new total you're " +
  "holding — it's converted to a pack count (value ÷ pack value) and sets the stock. Loose money is one box " +
  "for all your spare coins together (any denomination) — type any amount, no packs. Leave a box empty and it " +
  "keeps the current amount. Everything counts towards the shop's coin total.";

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

// The denomination's current total value on record (= current packs × pack value).
function existingValueOf(row: CoinBagStockRow): number {
  return row.currentBagQuantity * row.bagValue;
}

function fmtValue(n: number): string {
  return n > 0 ? n.toFixed(2) : "";
}

export function CoinStockCountScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const queryClient = useQueryClient();
  const { activeShopId } = useAuth();
  // One box per denomination (bagged value → packs), plus a single loose-money box for the whole shop.
  const [values, setValues] = useState<Record<string, string>>({});
  const [looseInput, setLooseInput] = useState<string>("");
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [looseFocused, setLooseFocused] = useState(false);
  const hasInit = useRef(false);

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

  // Prefill every box with the current amount on record. Tapping a box clears it (onFocus) to type a new
  // count; leaving it empty restores this on blur.
  useEffect(() => {
    if (!query.data || hasInit.current) return;
    const init: Record<string, string> = {};
    for (const row of items) init[row.coinDenominationId] = fmtValue(existingValueOf(row));
    setValues(init);
    setLooseInput(fmtValue(query.data.looseCashAmount));
    hasInit.current = true;
  }, [query.data, items]);

  // Only rows whose entered value maps to a different pack count than what's on record are sent.
  const entries = items
    .map((row) => {
      const raw = (values[row.coinDenominationId] ?? "").trim();
      if (raw === "") return null;
      const v = Number(raw);
      if (!Number.isFinite(v) || v < 0) return null;
      const newPacks = row.bagValue > 0 ? Math.round(v / row.bagValue) : 0;
      if (newPacks === row.currentBagQuantity) return null;
      return { coinDenominationId: row.coinDenominationId, value: v };
    })
    .filter((e): e is { coinDenominationId: string; value: number } => e !== null);

  // The single loose-money pot is sent only when its entered amount differs from what's on record.
  const currentLoose = query.data?.looseCashAmount ?? 0;
  const looseNum = looseInput.trim() === "" ? null : Number(looseInput);
  const looseChanged = looseNum !== null && Number.isFinite(looseNum) && looseNum >= 0 && looseNum !== currentLoose;
  const totalChanges = entries.length + (looseChanged ? 1 : 0);

  const mutation = useMutation({
    mutationFn: () =>
      recordCoinStock(activeShopId as string, entries, looseChanged ? (looseNum as number) : undefined),
    onSuccess: () => {
      toastSuccess(`Stock updated (${totalChanges} change${totalChanges === 1 ? "" : "s"}).`);
      void queryClient.invalidateQueries({ queryKey: ["coin-pod-dashboard", activeShopId] });
      void queryClient.invalidateQueries({ queryKey: ["coin-pod-transactions", activeShopId] });
      void queryClient.invalidateQueries({ queryKey: ["coin-pod-alerts", activeShopId] });
      navigation.goBack();
    },
    onError: (error: unknown) => toastError(getApiErrorMessage(error, "Unable to record stock.")),
  });

  const setValue = (id: string, raw: string) => setValues((prev) => ({ ...prev, [id]: sanitizeMoney(raw) }));

  const renderRow = (row: CoinBagStockRow) => {
    const id = row.coinDenominationId;
    const existing = existingValueOf(row);
    const value = values[id] ?? "";
    const focused = focusedId === id;
    const packs = packsFor(value, row.bagValue);
    const showArrow = packs != null && packs !== row.currentBagQuantity;
    return (
      <View key={id} style={[ui.card, styles.itemCard]}>
        <View style={styles.topRow}>
          <View style={styles.badgeWrap}>
            <View style={[styles.badgeBase, row.isNote ? styles.noteBadge : styles.coinBadge]}>
              <Text style={styles.badgeText}>{row.displayLabel}</Text>
            </View>
          </View>
          <View style={styles.rowMain}>
            <Text style={styles.rowLine} numberOfLines={1}>
              {money(row.bagValue)}/pack · now {row.currentBagQuantity}{showArrow ? ` → ${packs}` : ""}
            </Text>
          </View>
          <View style={styles.moneyInput}>
            <Text style={styles.moneyPrefix}>£</Text>
            <TextInput
              style={styles.moneyField}
              value={value}
              onChangeText={(v) => setValue(id, v)}
              onFocus={() => { setFocusedId(id); setValues((prev) => ({ ...prev, [id]: "" })); }}
              onBlur={() => {
                setFocusedId((cur) => (cur === id ? null : cur));
                setValues((prev) => ((prev[id] ?? "").trim() === "" ? { ...prev, [id]: fmtValue(existing) } : prev));
              }}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={appTheme.colors.textSubtle}
              accessibilityLabel={`Value held for ${row.displayLabel}`}
            />
          </View>
        </View>
        {focused ? (
          <Text style={styles.hint}>Current: {money(existing)} · {row.currentBagQuantity} pack{row.currentBagQuantity === 1 ? "" : "s"}</Text>
        ) : null}
      </View>
    );
  };

  const renderLooseCard = () => (
    <View style={[ui.card, styles.looseCard]}>
      <View style={styles.topRow}>
        <View style={styles.looseIcon}>
          <Ionicons name="cash-outline" size={22} color={appTheme.colors.primary} />
        </View>
        <View style={styles.rowMain}>
          <Text style={styles.looseTitle}>Loose money</Text>
          <Text style={styles.looseSub}>All spare coins together — any denomination</Text>
        </View>
        <View style={styles.moneyInput}>
          <Text style={styles.moneyPrefix}>£</Text>
          <TextInput
            style={styles.moneyField}
            value={looseInput}
            onChangeText={(v) => setLooseInput(sanitizeMoney(v))}
            onFocus={() => { setLooseFocused(true); setLooseInput(""); }}
            onBlur={() => {
              setLooseFocused(false);
              setLooseInput((prev) => (prev.trim() === "" ? fmtValue(currentLoose) : prev));
            }}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor={appTheme.colors.textSubtle}
            accessibilityLabel="Total loose money"
          />
        </View>
      </View>
      {looseFocused ? <Text style={styles.hint}>Current: {money(currentLoose)}</Text> : null}
    </View>
  );

  return (
    <ScreenContainer
      footer={
        <PrimaryButton
          label={mutation.isPending ? "Saving…" : totalChanges === 0 ? "No changes to record" : `Record stock (${totalChanges})`}
          onPress={() => { if (totalChanges > 0 && !mutation.isPending) mutation.mutate(); }}
          disabled={totalChanges === 0 || mutation.isPending}
        />
      }
    >
      {query.isLoading ? (
        <View style={ui.card}><LoadingState message="Loading denominations…" inline /></View>
      ) : (
        <View style={styles.list}>
          <Text style={styles.listHint}>Tap a box to change it · leave a box empty to keep the current amount.</Text>
          {renderLooseCard()}
          {items.map(renderRow)}
        </View>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  helpBtn: { paddingHorizontal: 6, paddingVertical: 2 },
  list: { gap: 6 },
  listHint: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 12, lineHeight: 16, marginBottom: 2 },
  itemCard: {
    paddingVertical: appTheme.spacing.xs, paddingHorizontal: appTheme.spacing.sm, gap: 4,
  },
  looseCard: {
    paddingVertical: appTheme.spacing.xs, paddingHorizontal: appTheme.spacing.sm, gap: 4,
    backgroundColor: appTheme.colors.surfaceBrandSoft,
  },
  looseIcon: { width: 46, alignItems: "center" },
  looseTitle: { color: appTheme.colors.text, fontFamily: appTheme.fonts.heading, fontSize: 14 },
  looseSub: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 11, marginTop: 1 },
  topRow: { flexDirection: "row", alignItems: "center", gap: appTheme.spacing.sm },
  hint: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.bodyMedium, fontSize: 11, textAlign: "right" },
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
    flexDirection: "row", alignItems: "center", width: 104, height: 36,
    borderRadius: appTheme.radius.sm, backgroundColor: appTheme.colors.surfaceMuted, paddingHorizontal: 8, gap: 2,
  },
  moneyPrefix: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 14 },
  moneyField: { flex: 1, color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 15, padding: 0, textAlign: "right" },
});
