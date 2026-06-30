import React, { useState } from "react";
import { Modal, Pressable, RefreshControl, StyleSheet, Switch, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { CoinBagConfig, getCoinBagConfigs, updateCoinBagConfig } from "../../api/coinPodApi";
import { useAuth } from "../../auth/AuthContext";
import { EmptyState } from "../../components/EmptyState";
import { FloatingLabelInput } from "../../components/FloatingLabelInput";
import { LoadingState } from "../../components/LoadingState";
import { ModalBackdropBlur } from "../../components/ModalBackdropBlur";
import { PrimaryButton } from "../../components/PrimaryButton";
import { ScreenContainer } from "../../components/ScreenContainer";
import { toastError, toastSuccess } from "../../components/toast";
import { getApiErrorMessage } from "../../utils/apiErrorMessage";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";

const RECIPIENT_TYPES: { value: string; label: string }[] = [
  { value: "OwnersAndManagers", label: "Owners & Managers" },
  { value: "OwnersOnly", label: "Owners" },
  { value: "ManagersOnly", label: "Managers" },
];

function sanitizeMoney(raw: string): string {
  let s = raw.replace(/,/g, ".").replace(/[^\d.]/g, "");
  const dot = s.indexOf(".");
  if (dot !== -1) s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, "").slice(0, 2);
  return s;
}

function money(value: number) {
  return `£${(value ?? 0).toFixed(2)}`;
}

type Draft = {
  bagValue: string;
  openingBagQuantity: string;
  minBagQuantity: string;
  maxBagQuantity: string;
  stockAlertLimit: string;
  isAlertEnabled: boolean;
  alertRecipientType: string;
  isActive: boolean;
};

function toDraft(c: CoinBagConfig): Draft {
  return {
    bagValue: String(c.bagValue),
    openingBagQuantity: String(c.openingBagQuantity),
    minBagQuantity: String(c.minBagQuantity),
    maxBagQuantity: String(c.maxBagQuantity),
    stockAlertLimit: String(c.stockAlertLimit),
    isAlertEnabled: c.isAlertEnabled,
    alertRecipientType: c.alertRecipientType || "OwnersAndManagers",
    isActive: c.isActive,
  };
}

export function CoinBagConfigScreen() {
  const queryClient = useQueryClient();
  const { activeShopId } = useAuth();
  const [editing, setEditing] = useState<CoinBagConfig | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  const query = useQuery({
    queryKey: ["coin-pod-config", activeShopId],
    queryFn: () => getCoinBagConfigs(activeShopId as string),
    enabled: Boolean(activeShopId),
  });

  const mutation = useMutation({
    mutationFn: () => {
      const d = draft as Draft;
      return updateCoinBagConfig({
        shopId: activeShopId as string,
        coinDenominationId: (editing as CoinBagConfig).coinDenominationId,
        bagValue: Number(d.bagValue) || 0,
        openingBagQuantity: Number(d.openingBagQuantity) || 0,
        minBagQuantity: Number(d.minBagQuantity) || 0,
        maxBagQuantity: Number(d.maxBagQuantity) || 0,
        stockAlertLimit: Number(d.stockAlertLimit) || 0,
        isAlertEnabled: d.isAlertEnabled,
        alertRecipientType: d.alertRecipientType,
        isActive: d.isActive,
      });
    },
    onSuccess: () => {
      toastSuccess("Configuration saved.");
      void queryClient.invalidateQueries({ queryKey: ["coin-pod-config", activeShopId] });
      void queryClient.invalidateQueries({ queryKey: ["coin-pod-dashboard", activeShopId] });
      setEditing(null);
      setDraft(null);
    },
    onError: (error: unknown) => toastError(getApiErrorMessage(error, "Unable to save configuration.")),
  });

  const openEdit = (c: CoinBagConfig) => {
    setEditing(c);
    setDraft(toDraft(c));
  };

  const draftValid = draft ? (Number(draft.bagValue) || 0) > 0 : false;

  return (
    <ScreenContainer
      refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} tintColor={appTheme.colors.primary} />}
    >
      {query.isLoading ? (
        <View style={ui.card}><LoadingState message="Loading configuration…" inline /></View>
      ) : (query.data ?? []).length === 0 ? (
        <EmptyState icon="settings-outline" title="No configuration" message="Coin bag configuration will appear here." />
      ) : (
        <View style={styles.list}>
          {(query.data ?? []).map((c) => (
            <Pressable key={c.id} style={[ui.listItem, styles.row, !c.isActive ? styles.rowMuted : null]} onPress={() => openEdit(c)} accessibilityRole="button" accessibilityLabel={`Edit ${c.displayLabel} configuration`}>
              <View style={styles.coinBadge}><Text style={styles.coinBadgeText}>{c.displayLabel}</Text></View>
              <View style={styles.rowMain}>
                <Text style={styles.rowTitle}>Bag {money(c.bagValue)} · alert ≤ {c.stockAlertLimit}</Text>
                <Text style={styles.rowMeta}>
                  Opening {c.openingBagQuantity} · {c.isAlertEnabled ? "alerts on" : "alerts off"}{c.isActive ? "" : " · inactive"}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={appTheme.colors.textSubtle} />
            </Pressable>
          ))}
        </View>
      )}

      <Modal visible={editing !== null} transparent animationType="fade" onRequestClose={() => setEditing(null)}>
        <View style={styles.modalBackdrop}>
          <ModalBackdropBlur />
          <View style={styles.modalCard}>
            <Text style={ui.sectionTitle}>{editing?.displayLabel} coin bags</Text>
            {draft ? (
              <>
                <View style={styles.row2}>
                  <View style={styles.cell}><FloatingLabelInput label="Bag value" prefix="£" value={draft.bagValue} onChangeText={(v) => setDraft({ ...draft, bagValue: sanitizeMoney(v) })} keyboardType="decimal-pad" /></View>
                  <View style={styles.cell}><FloatingLabelInput label="Stock alert limit" value={draft.stockAlertLimit} onChangeText={(v) => setDraft({ ...draft, stockAlertLimit: v.replace(/[^0-9]/g, "") })} keyboardType="number-pad" /></View>
                </View>
                <View style={styles.row2}>
                  <View style={styles.cell}><FloatingLabelInput label="Opening bags" value={draft.openingBagQuantity} onChangeText={(v) => setDraft({ ...draft, openingBagQuantity: v.replace(/[^0-9]/g, "") })} keyboardType="number-pad" /></View>
                  <View style={styles.cell}><FloatingLabelInput label="Min bags" value={draft.minBagQuantity} onChangeText={(v) => setDraft({ ...draft, minBagQuantity: v.replace(/[^0-9]/g, "") })} keyboardType="number-pad" /></View>
                </View>
                <FloatingLabelInput label="Max bags" value={draft.maxBagQuantity} onChangeText={(v) => setDraft({ ...draft, maxBagQuantity: v.replace(/[^0-9]/g, "") })} keyboardType="number-pad" />

                <View style={styles.toggleRow}>
                  <Text style={styles.toggleLabel}>Low-stock alerts</Text>
                  <Switch value={draft.isAlertEnabled} onValueChange={(v) => setDraft({ ...draft, isAlertEnabled: v })} />
                </View>

                <Text style={styles.fieldLabel}>Alert recipients</Text>
                <View style={styles.chipsWrap}>
                  {RECIPIENT_TYPES.map((r) => {
                    const isSel = r.value === draft.alertRecipientType;
                    return (
                      <Pressable key={r.value} style={[styles.chip, isSel ? styles.chipSelected : null]} onPress={() => setDraft({ ...draft, alertRecipientType: r.value })} accessibilityRole="button" accessibilityState={{ selected: isSel }}>
                        <Text style={[styles.chipText, isSel ? styles.chipTextSelected : null]}>{r.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>

                <View style={styles.toggleRow}>
                  <Text style={styles.toggleLabel}>Manage this denomination</Text>
                  <Switch value={draft.isActive} onValueChange={(v) => setDraft({ ...draft, isActive: v })} />
                </View>

                <PrimaryButton label={mutation.isPending ? "Saving…" : "Save"} onPress={() => mutation.mutate()} disabled={mutation.isPending || !draftValid} />
                <PrimaryButton label="Cancel" tone="neutral" onPress={() => setEditing(null)} disabled={mutation.isPending} />
              </>
            ) : null}
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  list: { gap: appTheme.spacing.xs },
  row: { flexDirection: "row", alignItems: "center", gap: appTheme.spacing.sm },
  rowMuted: { opacity: 0.55 },
  coinBadge: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: appTheme.colors.surfaceBrandSoft, borderWidth: 1, borderColor: appTheme.colors.primary },
  coinBadgeText: { color: appTheme.colors.primary, fontFamily: appTheme.fonts.heading, fontSize: 13 },
  rowMain: { flex: 1, gap: 2 },
  rowTitle: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 15, lineHeight: 19 },
  rowMeta: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 12, lineHeight: 16 },
  modalBackdrop: { flex: 1, justifyContent: "center", padding: appTheme.spacing.md, backgroundColor: appTheme.colors.overlay },
  modalCard: { backgroundColor: appTheme.colors.background, borderRadius: appTheme.radius.lg, padding: appTheme.spacing.md, gap: appTheme.spacing.sm },
  row2: { flexDirection: "row", gap: appTheme.spacing.sm },
  cell: { flex: 1 },
  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 4 },
  toggleLabel: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 14 },
  fieldLabel: { color: appTheme.colors.text, fontSize: 13, lineHeight: 16, fontFamily: appTheme.fonts.bodyMedium, marginTop: 2 },
  chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: appTheme.spacing.xs },
  chip: { borderWidth: 1, borderColor: appTheme.colors.primary, borderRadius: appTheme.radius.pill, paddingHorizontal: 12, paddingVertical: 7 },
  chipSelected: { backgroundColor: appTheme.colors.primary },
  chipText: { color: appTheme.colors.primary, fontFamily: appTheme.fonts.bodyMedium, fontSize: 13 },
  chipTextSelected: { color: appTheme.colors.onPrimary },
});
