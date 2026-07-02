import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adjustCoinStock, getCoinPodDashboard } from "../../api/coinPodApi";
import { useAuth } from "../../auth/AuthContext";
import { FieldError } from "../../components/FieldError";
import { FloatingLabelInput } from "../../components/FloatingLabelInput";
import { LoadingState } from "../../components/LoadingState";
import { PrimaryButton } from "../../components/PrimaryButton";
import { ScreenContainer } from "../../components/ScreenContainer";
import { SegmentedControl } from "../../components/SegmentedControl";
import { useFieldValidation } from "../../components/useFieldValidation";
import { toastError, toastSuccess } from "../../components/toast";
import { MainStackParamList } from "../../types/navigation";
import { getApiErrorMessage } from "../../utils/apiErrorMessage";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";

type Direction = "increase" | "decrease";

const REASONS = ["Counting mistake", "Missing bag", "Damaged bag", "Bank correction", "Setup correction", "Other"];

export function CoinAdjustmentScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const queryClient = useQueryClient();
  const { activeShopId } = useAuth();

  const [denomId, setDenomId] = useState<string | null>(null);
  const [direction, setDirection] = useState<Direction>("decrease");
  const [bagQty, setBagQty] = useState("1");
  const [reason, setReason] = useState<string>(REASONS[0]);
  const [comment, setComment] = useState("");

  const dashboardQuery = useQuery({
    queryKey: ["coin-pod-dashboard", activeShopId],
    queryFn: () => getCoinPodDashboard(activeShopId as string),
    enabled: Boolean(activeShopId),
  });

  const denominations = useMemo(
    () => (dashboardQuery.data?.items ?? []).filter((d) => d.isActive),
    [dashboardQuery.data],
  );
  const selected = denominations.find((d) => d.coinDenominationId === denomId);

  const qty = Number(bagQty);
  const hasQty = Number.isFinite(qty) && qty > 0;
  const exceedsStock = direction === "decrease" && selected ? qty > selected.currentBagQuantity : false;

  // Client-side rules, recomputed every render so a touched field's error clears the instant its
  // value becomes valid. Bag quantity must be a positive integer, and when decreasing it can't
  // exceed what's in stock (cross-field — reuses exceedsStock for the same "only N in stock"
  // message shown in the footer). Reason is a chip selection, so its error reveals on submit only.
  const fieldErrors = {
    bagQty: !hasQty
      ? "Enter 1 or more."
      : exceedsStock
        ? `Only ${selected?.currentBagQuantity ?? 0} bag(s) in stock.`
        : null,
    reason: reason.trim().length === 0 ? "Choose a reason." : null,
  };
  const v = useFieldValidation(fieldErrors);

  const mutation = useMutation({
    mutationFn: () =>
      adjustCoinStock({
        shopId: activeShopId as string,
        coinDenominationId: denomId as string,
        increaseStock: direction === "increase",
        bagQuantity: Math.floor(qty),
        reason: reason.trim(),
        comment: comment.trim() || undefined,
      }),
    onSuccess: () => {
      toastSuccess("Adjustment recorded.");
      void queryClient.invalidateQueries({ queryKey: ["coin-pod-dashboard", activeShopId] });
      void queryClient.invalidateQueries({ queryKey: ["coin-pod-transactions", activeShopId] });
      void queryClient.invalidateQueries({ queryKey: ["coin-pod-alerts", activeShopId] });
      navigation.goBack();
    },
    onError: (error: unknown) => toastError(getApiErrorMessage(error, "Unable to record the adjustment.")),
  });

  const handleSubmit = () => {
    // Imperative guard: on RN two taps can fire before the button re-renders, and the adjustment
    // POST isn't idempotent (would record it twice).
    if (mutation.isPending) return;
    // attemptSubmit reveals every field's error (incl. the reason chips); only fire once valid.
    if (!v.attemptSubmit()) return;
    mutation.mutate();
  };

  return (
    <ScreenContainer
      footer={
        <View style={styles.footer}>
          {exceedsStock ? <Text style={styles.warn}>Only {selected?.currentBagQuantity ?? 0} bag(s) in stock to remove.</Text> : null}
          <PrimaryButton
            label={mutation.isPending ? "Saving…" : "Record adjustment"}
            // Deliberately enabled while incomplete: pressing reveals what's missing via the inline
            // field errors. handleSubmit runs the checks and only fires the POST once valid.
            onPress={handleSubmit}
            disabled={mutation.isPending}
          />
        </View>
      }
    >
      {dashboardQuery.isLoading ? (
        <View style={ui.card}><LoadingState message="Loading denominations…" inline /></View>
      ) : (
        <View style={[ui.card, styles.card]}>
          <Text style={styles.intro}>Correct the recorded stock (counting error, missing/damaged bag, etc.). A reason is required.</Text>

          <Text style={styles.fieldLabel}>Coin denomination</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {denominations.map((d) => {
              const isSel = d.coinDenominationId === denomId;
              return (
                <Pressable
                  key={d.coinDenominationId}
                  style={[styles.chip, isSel ? styles.chipSelected : null]}
                  onPress={() => setDenomId(d.coinDenominationId)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSel }}
                >
                  <Text style={[styles.chipText, isSel ? styles.chipTextSelected : null]}>{d.displayLabel}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {selected ? <Text style={styles.infoText}>Currently {selected.currentBagQuantity} bag(s) in stock.</Text> : null}

          <Text style={styles.fieldLabel}>Direction</Text>
          <SegmentedControl
            options={[
              { value: "decrease", label: "Decrease" },
              { value: "increase", label: "Increase" },
            ]}
            value={direction}
            onChange={setDirection}
          />

          <FloatingLabelInput
            label="Number of bags"
            value={bagQty}
            onChangeText={(t) => setBagQty(t.replace(/[^0-9]/g, ""))}
            onBlur={() => v.touch("bagQty")}
            error={v.showError("bagQty")}
            keyboardType="number-pad"
          />

          <Text style={styles.fieldLabel}>Reason</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {REASONS.map((r) => {
              const isSel = r === reason;
              return (
                <Pressable
                  key={r}
                  style={[styles.chip, isSel ? styles.chipSelected : null]}
                  onPress={() => setReason(r)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSel }}
                >
                  <Text style={[styles.chipText, isSel ? styles.chipTextSelected : null]}>{r}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <FieldError error={v.showError("reason")} />

          <FloatingLabelInput label="Comment (optional)" value={comment} onChangeText={setComment} />
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
    alignItems: "center",
    borderWidth: 1, borderColor: appTheme.colors.primary, borderRadius: appTheme.radius.pill,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  chipSelected: { backgroundColor: appTheme.colors.primary },
  chipText: { color: appTheme.colors.primary, fontFamily: appTheme.fonts.bodyMedium, fontSize: 13 },
  chipTextSelected: { color: appTheme.colors.onPrimary },
  infoText: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 12 },
  footer: { gap: appTheme.spacing.xs },
  warn: { color: appTheme.colors.danger, fontFamily: appTheme.fonts.body, fontSize: 12, lineHeight: 16 },
});
