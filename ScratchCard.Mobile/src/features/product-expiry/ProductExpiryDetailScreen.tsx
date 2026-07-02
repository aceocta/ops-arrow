import React, { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import {
  getProduct,
  ProductExpiryActionType,
  recordProductAction,
} from "../../api/productExpiryApi";
import { useAuth } from "../../auth/AuthContext";
import { FloatingLabelInput } from "../../components/FloatingLabelInput";
import { dismissKeyboardOnTap } from "../../components/KeyboardDismissView";
import { LoadingState } from "../../components/LoadingState";
import { ModalBackdropBlur } from "../../components/ModalBackdropBlur";
import { PrimaryButton } from "../../components/PrimaryButton";
import { ScreenContainer } from "../../components/ScreenContainer";
import { StatusBadge } from "../../components/StatusBadge";
import { toastError, toastSuccess } from "../../components/toast";
import { MainStackParamList } from "../../types/navigation";
import { getApiErrorMessage } from "../../utils/apiErrorMessage";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";

type DetailRoute = RouteProp<MainStackParamList, "ProductExpiryDetail">;

// Ordered by the value ladder: keep value high → low → bin (last resort).
const ACTIONS: { type: ProductExpiryActionType; label: string; icon: keyof typeof Ionicons.glyphMap; reduces: boolean }[] = [
  { type: "MoveToFront", label: "Move to front", icon: "arrow-up-outline", reduces: false },
  { type: "Discount", label: "Discount", icon: "pricetag-outline", reduces: false },
  { type: "MarkSold", label: "Mark sold", icon: "cart-outline", reduces: true },
  { type: "Donate", label: "Donate", icon: "gift-outline", reduces: true },
  { type: "ReturnToSupplier", label: "Return", icon: "return-up-back-outline", reduces: true },
  { type: "Dispose", label: "Dispose (bin)", icon: "trash-outline", reduces: true },
];

export function ProductExpiryDetailScreen() {
  const route = useRoute<DetailRoute>();
  const { id } = route.params;
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const queryClient = useQueryClient();
  const { activeShopId } = useAuth();

  // Header pencil → reuse the Add Product screen in edit mode for this batch (fix a typo, expiry,
  // price, category, or quantity). Available immediately; the target screen loads the batch itself.
  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          onPress={() => navigation.navigate("AddProduct", { editId: id })}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Edit product"
        >
          <Ionicons name="create-outline" size={22} color={appTheme.colors.primary} />
        </Pressable>
      ),
    });
  }, [navigation, id]);

  const [pending, setPending] = useState<{ type: ProductExpiryActionType; reduces: boolean } | null>(null);
  const [qty, setQty] = useState("1");
  const [comment, setComment] = useState("");

  const query = useQuery({ queryKey: ["product-expiry-item", id], queryFn: () => getProduct(id) });
  const batch = query.data;

  const actionMutation = useMutation({
    mutationFn: () =>
      recordProductAction({
        productBatchId: id,
        actionType: (pending as { type: ProductExpiryActionType }).type,
        quantity: Math.max(1, Math.floor(Number(qty) || 1)),
        comment: comment.trim() || undefined,
      }),
    onSuccess: () => {
      toastSuccess("Action recorded.");
      setPending(null);
      setComment("");
      void query.refetch();
      void queryClient.invalidateQueries({ queryKey: ["product-expiry", activeShopId] });
      void queryClient.invalidateQueries({ queryKey: ["product-expiry-scoreboard", activeShopId] });
    },
    onError: (error: unknown) => toastError(getApiErrorMessage(error, "Unable to record action.")),
  });

  const openAction = (a: { type: ProductExpiryActionType; reduces: boolean }) => {
    setPending(a);
    setQty(a.reduces ? String(batch?.remainingQuantity ?? 1) : "1");
    setComment("");
  };

  if (query.isLoading || !batch) {
    return (
      <ScreenContainer>
        <View style={ui.card}><LoadingState message="Loading…" inline /></View>
      </ScreenContainer>
    );
  }

  const isClosed = batch.remainingQuantity <= 0;

  return (
    <ScreenContainer>
      <View style={[ui.card, styles.card]}>
        <View style={styles.headerRow}>
          <Text style={styles.title} numberOfLines={2}>{batch.productName}</Text>
          <StatusBadge label={batch.status === "ExpiringSoon" ? "Expiring soon" : batch.status} tone={batch.status === "Safe" ? "success" : batch.status === "ExpiringSoon" ? "warning" : "danger"} />
        </View>
        <Text style={styles.meta}>{batch.categoryName} · {batch.dateType === "UseBy" ? "Use by" : "Best before"} {batch.expiryDate}</Text>
        <Text style={styles.meta}>{batch.remainingQuantity} of {batch.quantity} remaining{batch.batchNumber ? ` · batch ${batch.batchNumber}` : ""}</Text>
        {batch.dateType === "UseBy" && batch.status === "Expired" ? (
          <View style={styles.warnBox}>
            <Ionicons name="warning-outline" size={14} color={appTheme.colors.danger} />
            <Text style={styles.warnText}>Past use-by — must not be sold. Dispose or return only.</Text>
          </View>
        ) : null}
      </View>

      <View style={[ui.card, styles.card]}>
        <Text style={ui.sectionTitle}>Take action</Text>
        {isClosed ? (
          <Text style={styles.meta}>No stock remaining — this product is cleared.</Text>
        ) : (
          <View style={styles.actionGrid}>
            {ACTIONS.map((a) => {
              // Past use-by: only dispose or return are allowed (mirrors the backend hard stop).
              const blocked = batch.dateType === "UseBy" && batch.status === "Expired"
                && a.type !== "Dispose" && a.type !== "ReturnToSupplier";
              return (
                <Pressable
                  key={a.type}
                  style={[styles.actionBtn, a.type === "Dispose" ? styles.actionDanger : null, blocked ? styles.actionDisabled : null]}
                  onPress={() => !blocked && openAction(a)}
                  disabled={blocked}
                  accessibilityRole="button"
                  accessibilityLabel={a.label}
                >
                  <Ionicons name={a.icon} size={18} color={a.type === "Dispose" ? appTheme.colors.danger : appTheme.colors.primary} />
                  <Text style={[styles.actionLabel, a.type === "Dispose" ? styles.actionLabelDanger : null]}>{a.label}</Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>

      {batch.actions.length > 0 ? (
        <View style={[ui.card, styles.card]}>
          <Text style={ui.sectionTitle}>History</Text>
          {batch.actions.map((act) => (
            <View key={act.id} style={styles.histRow}>
              <Text style={styles.histText}>{act.actionType} · {act.quantity}</Text>
              <Text style={styles.histDate}>{new Date(act.performedOn).toLocaleString()}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <Modal visible={pending !== null} transparent animationType="fade" onRequestClose={() => setPending(null)}>
        <View style={styles.modalBackdrop} onStartShouldSetResponder={dismissKeyboardOnTap}>
          <ModalBackdropBlur />
          <View style={styles.modalCard}>
            <Text style={ui.sectionTitle}>{ACTIONS.find((a) => a.type === pending?.type)?.label}</Text>
            <FloatingLabelInput label="Quantity" value={qty} onChangeText={(v) => setQty(v.replace(/[^0-9]/g, ""))} keyboardType="number-pad" />
            <FloatingLabelInput label="Comment (optional)" value={comment} onChangeText={setComment} />
            <PrimaryButton
              label={actionMutation.isPending ? "Saving…" : "Confirm"}
              onPress={() => actionMutation.mutate()}
              disabled={actionMutation.isPending}
            />
            <PrimaryButton label="Cancel" tone="neutral" onPress={() => setPending(null)} disabled={actionMutation.isPending} />
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  card: { gap: appTheme.spacing.sm },
  headerRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: appTheme.spacing.sm },
  title: { flex: 1, color: appTheme.colors.text, fontFamily: appTheme.fonts.heading, fontSize: 20, lineHeight: 25 },
  meta: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 13, lineHeight: 18 },
  warnBox: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: appTheme.colors.surfaceWarningSoft, borderRadius: appTheme.radius.sm, padding: appTheme.spacing.sm },
  warnText: { flex: 1, color: appTheme.colors.danger, fontFamily: appTheme.fonts.bodyMedium, fontSize: 12, lineHeight: 16 },
  actionGrid: { flexDirection: "row", flexWrap: "wrap", gap: appTheme.spacing.xs },
  actionBtn: {
    flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: appTheme.radius.sm, borderWidth: 1, borderColor: appTheme.colors.border, backgroundColor: appTheme.colors.surface,
  },
  actionDanger: { borderColor: appTheme.colors.danger },
  actionDisabled: { opacity: 0.4 },
  actionLabel: { color: appTheme.colors.primary, fontFamily: appTheme.fonts.bodyMedium, fontSize: 13 },
  actionLabelDanger: { color: appTheme.colors.danger },
  histRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 4 },
  histText: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 13 },
  histDate: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 12 },
  modalBackdrop: { flex: 1, justifyContent: "center", padding: appTheme.spacing.md, backgroundColor: appTheme.colors.overlay },
  modalCard: { backgroundColor: appTheme.colors.background, borderRadius: appTheme.radius.lg, padding: appTheme.spacing.md, gap: appTheme.spacing.sm },
});
