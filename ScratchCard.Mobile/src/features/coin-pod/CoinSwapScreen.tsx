import React, { useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CoinBagStockRow,
  getCoinPodDashboard,
  swapCoinsToNotes,
  swapNotesToCoins,
} from "../../api/coinPodApi";
import { useAuth } from "../../auth/AuthContext";
import { FloatingLabelInput } from "../../components/FloatingLabelInput";
import { LoadingState } from "../../components/LoadingState";
import { PrimaryButton } from "../../components/PrimaryButton";
import { ScreenContainer } from "../../components/ScreenContainer";
import { toastError, toastSuccess } from "../../components/toast";
import { MainStackParamList } from "../../types/navigation";
import { getApiErrorMessage } from "../../utils/apiErrorMessage";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";

type Direction = "notesToCoins" | "coinsToNotes";

function sanitizeMoney(raw: string): string {
  let s = raw.replace(/,/g, ".").replace(/[^\d.]/g, "");
  const dot = s.indexOf(".");
  if (dot !== -1) s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, "").slice(0, 2);
  return s;
}

function money(value: number) {
  return `£${(value ?? 0).toFixed(2)}`;
}

export function CoinNotesToCoinsScreen() {
  return <CoinSwapForm direction="notesToCoins" />;
}

export function CoinCoinsToNotesScreen() {
  return <CoinSwapForm direction="coinsToNotes" />;
}

function CoinSwapForm({ direction }: { direction: Direction }) {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const queryClient = useQueryClient();
  const { activeShopId } = useAuth();
  const isNotesToCoins = direction === "notesToCoins";

  const [denomId, setDenomId] = useState<string | null>(null);
  const [bagQty, setBagQty] = useState("1");
  const [noteAmount, setNoteAmount] = useState("");
  const [comment, setComment] = useState("");
  const noteTouched = useRef(false);

  const dashboardQuery = useQuery({
    queryKey: ["coin-pod-dashboard", activeShopId],
    queryFn: () => getCoinPodDashboard(activeShopId as string),
    enabled: Boolean(activeShopId),
  });

  const denominations = useMemo(
    () => (dashboardQuery.data?.items ?? []).filter((d) => d.isActive),
    [dashboardQuery.data],
  );
  const selected: CoinBagStockRow | undefined = denominations.find((d) => d.coinDenominationId === denomId);

  const qty = Number(bagQty);
  const hasQty = Number.isFinite(qty) && qty > 0;
  const totalCoinValue = selected && hasQty ? selected.bagValue * qty : 0;

  // Auto-fill the note amount to the coin value until the user types their own (mismatch needs a comment).
  const effectiveNote = noteTouched.current ? noteAmount : totalCoinValue ? totalCoinValue.toFixed(2) : "";
  const noteValue = Number(effectiveNote);
  const hasNote = Number.isFinite(noteValue) && noteValue >= 0;
  const difference = hasNote ? noteValue - totalCoinValue : 0;
  const mismatch = Math.abs(difference) >= 0.005;

  const exceedsStock = isNotesToCoins && selected ? qty > selected.currentBagQuantity : false;
  const canSave = Boolean(selected) && hasQty && hasNote && !exceedsStock && (!mismatch || comment.trim().length > 0);

  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
        shopId: activeShopId as string,
        coinDenominationId: denomId as string,
        bagQuantity: Math.floor(qty),
        noteAmount: noteValue,
        comment: comment.trim() || undefined,
      };
      return isNotesToCoins ? swapNotesToCoins(payload) : swapCoinsToNotes(payload);
    },
    onSuccess: () => {
      toastSuccess(isNotesToCoins ? "Coins taken." : "Coins returned.");
      void queryClient.invalidateQueries({ queryKey: ["coin-pod-dashboard", activeShopId] });
      void queryClient.invalidateQueries({ queryKey: ["coin-pod-transactions", activeShopId] });
      void queryClient.invalidateQueries({ queryKey: ["coin-pod-alerts", activeShopId] });
      navigation.goBack();
    },
    onError: (error: unknown) => toastError(getApiErrorMessage(error, "Unable to record the swap.")),
  });

  return (
    <ScreenContainer
      footer={
        <View style={styles.footer}>
          {exceedsStock ? (
            <Text style={styles.warn}>Only {selected?.currentBagQuantity ?? 0} bag(s) available to take.</Text>
          ) : mismatch && comment.trim().length === 0 ? (
            <Text style={styles.warn}>Notes ({money(noteValue)}) don't match coin value ({money(totalCoinValue)}) — add a comment.</Text>
          ) : null}
          <PrimaryButton
            label={mutation.isPending ? "Saving…" : isNotesToCoins ? "Take coin bags" : "Return coin bags"}
            onPress={() => { if (canSave && !mutation.isPending) mutation.mutate(); }}
            disabled={!canSave || mutation.isPending}
          />
        </View>
      }
    >
      {dashboardQuery.isLoading ? (
        <View style={ui.card}><LoadingState message="Loading denominations…" inline /></View>
      ) : (
        <View style={[ui.card, styles.card]}>
          <Text style={styles.intro}>
            {isNotesToCoins
              ? "Take coin bags out and record the notes you received."
              : "Return coin bags and record the notes you gave out."}
          </Text>

          <Text style={styles.fieldLabel}>Coin denomination</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {denominations.map((d) => {
              const isSel = d.coinDenominationId === denomId;
              return (
                <Pressable
                  key={d.coinDenominationId}
                  style={[styles.chip, isSel ? styles.chipSelected : null]}
                  onPress={() => { setDenomId(d.coinDenominationId); noteTouched.current = false; }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSel }}
                >
                  <Text style={[styles.chipText, isSel ? styles.chipTextSelected : null]}>{d.displayLabel}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {selected ? (
            <View style={styles.infoRow}>
              <Text style={styles.infoText}>Bag value {money(selected.bagValue)}</Text>
              <Text style={styles.infoText}>In stock {selected.currentBagQuantity}</Text>
            </View>
          ) : null}

          <FloatingLabelInput
            label="Number of bags"
            value={bagQty}
            onChangeText={(v) => { setBagQty(v.replace(/[^0-9]/g, "")); noteTouched.current = false; }}
            keyboardType="number-pad"
          />

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total coin value</Text>
            <Text style={styles.totalValue}>{money(totalCoinValue)}</Text>
          </View>

          <FloatingLabelInput
            label={isNotesToCoins ? "Notes received" : "Notes given out"}
            prefix="£"
            value={effectiveNote}
            onChangeText={(v) => { noteTouched.current = true; setNoteAmount(sanitizeMoney(v)); }}
            keyboardType="decimal-pad"
          />

          <FloatingLabelInput
            label={mismatch ? "Comment (required — amounts differ)" : "Comment (optional)"}
            value={comment}
            onChangeText={setComment}
          />
        </View>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  card: { gap: appTheme.spacing.sm },
  intro: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 13, lineHeight: 18 },
  fieldLabel: { color: appTheme.colors.text, fontSize: 13, lineHeight: 16, fontFamily: appTheme.fonts.bodyMedium, marginTop: 2 },
  chips: { gap: appTheme.spacing.xs, paddingVertical: 2 },
  chip: {
    minWidth: 48, alignItems: "center",
    borderWidth: 1, borderColor: appTheme.colors.primary, borderRadius: appTheme.radius.pill,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  chipSelected: { backgroundColor: appTheme.colors.primary },
  chipText: { color: appTheme.colors.primary, fontFamily: appTheme.fonts.bodyMedium, fontSize: 14 },
  chipTextSelected: { color: appTheme.colors.onPrimary },
  infoRow: { flexDirection: "row", justifyContent: "space-between" },
  infoText: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 12 },
  totalRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: appTheme.colors.surfaceMuted, borderRadius: appTheme.radius.sm,
    paddingHorizontal: appTheme.spacing.sm, paddingVertical: 10,
  },
  totalLabel: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.bodyMedium, fontSize: 13 },
  totalValue: { color: appTheme.colors.text, fontFamily: appTheme.fonts.heading, fontSize: 18 },
  footer: { gap: appTheme.spacing.xs },
  warn: { color: appTheme.colors.danger, fontFamily: appTheme.fonts.body, fontSize: 12, lineHeight: 16 },
});
