import React, { useMemo, useRef, useState } from "react";
import { Alert, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { RouteProp, useRoute } from "@react-navigation/native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addCanisterDrop,
  approveCanisterDrop,
  listCanisterDrops,
} from "../../api/businessDaysApi";
import { useAuth } from "../../auth/AuthContext";
import { EmptyState } from "../../components/EmptyState";
import { FloatingLabelInput } from "../../components/FloatingLabelInput";
import { PrimaryButton } from "../../components/PrimaryButton";
import { ScreenContainer } from "../../components/ScreenContainer";
import { SectionHeader } from "../../components/SectionHeader";
import { useFieldValidation } from "../../components/useFieldValidation";
import { KpiGrid, KpiTile } from "../../components/KpiTile";
import { Skeleton } from "../../components/Skeleton";
import { StatusBadge } from "../../components/StatusBadge";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";
import { getApiErrorMessage } from "../../utils/apiErrorMessage";
import { confirmAction } from "../../utils/confirm";
import { formatGbp } from "../../utils/currency";
import { haptics } from "../../utils/haptics";
import type { MainStackParamList } from "../../types/navigation";

type SafeDropRoute = RouteProp<MainStackParamList, "SafeDrop">;

const formatCurrencyGBP = formatGbp;

function normalizeRole(role: string | null | undefined) {
  return (role ?? "").trim().toLowerCase().replace(/\s+/g, "");
}

export function SafeDropScreen() {
  const route = useRoute<SafeDropRoute>();
  const { businessDayId, businessDate } = route.params;
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  const dropsQuery = useQuery({
    queryKey: ["safe-drops", businessDayId],
    queryFn: () => listCanisterDrops(businessDayId),
    enabled: Boolean(businessDayId),
  });

  // Owners + managers can see every drop and approve them. Cashiers/staff see only the ones
  // they recorded — the server already enforces this, but mirroring it locally avoids
  // showing a list that doesn't match what the API returns.
  const canApprove = useMemo(() => {
    const roles = new Set((profile?.roles ?? []).map(normalizeRole));
    return roles.has("companyowner") || roles.has("manager") || roles.has("shopmanager");
  }, [profile?.roles]);

  const defaultDroppedByName = useMemo(() => {
    const full = `${profile?.firstName ?? ""} ${profile?.lastName ?? ""}`.trim();
    return full || profile?.displayName || "";
  }, [profile?.displayName, profile?.firstName, profile?.lastName]);

  const [canisterNumber, setCanisterNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [droppedByName, setDroppedByName] = useState("");
  const amountRef = useRef<TextInput>(null);
  const droppedByNameRef = useRef<TextInput>(null);

  // Field-level validation via the shared useFieldValidation hook: recompute the error map each
  // render (so a touched field clears live once valid), and let the hook own the reveal timing
  // (on blur, then live). droppedByName is optional — the mutation falls back to the user's own
  // name — so it carries no rule. Amount mirrors the mutationFn check exactly: finite and > 0.
  const parsedAmountValue = Number(amount.trim());
  const fieldErrors = {
    canisterNumber: canisterNumber.trim().length === 0 ? "Enter the canister number." : null,
    amount:
      !(amount.trim().length > 0 && Number.isFinite(parsedAmountValue) && parsedAmountValue > 0)
        ? "Enter a number greater than zero."
        : null,
  };
  const v = useFieldValidation(fieldErrors);

  const addMutation = useMutation({
    mutationFn: async () => {
      // Backstop only — the submit handler blocks invalid input via useFieldValidation; these
      // throws guard against any programmatic call path.
      const trimmedCanister = canisterNumber.trim();
      if (!trimmedCanister) throw new Error("Canister number is required.");
      const parsedAmount = Number(amount.trim());
      if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        throw new Error("Amount must be a valid number greater than zero.");
      }
      return addCanisterDrop(businessDayId, {
        canisterNumber: trimmedCanister,
        amount: parsedAmount,
        droppedByName: droppedByName.trim() || defaultDroppedByName || undefined,
      });
    },
    onSuccess: async () => {
      haptics.success();
      setCanisterNumber("");
      setAmount("");
      await queryClient.invalidateQueries({ queryKey: ["safe-drops", businessDayId] });
      await dropsQuery.refetch();
    },
    onError: (error) => {
      Alert.alert("Couldn't record safe drop", getApiErrorMessage(error, "Unable to record safe drop."));
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (dropId: string) => approveCanisterDrop(dropId),
    onSuccess: async () => {
      haptics.success();
      await dropsQuery.refetch();
    },
    onError: (error) => {
      Alert.alert("Couldn't approve drop", getApiErrorMessage(error, "Unable to approve safe drop."));
    },
  });

  const drops = dropsQuery.data ?? [];
  const totals = useMemo(() => {
    const nonRejected = drops.filter((d) => d.approvalStatus !== "Rejected");
    return {
      count: drops.length,
      pending: drops.filter((d) => d.approvalStatus === "Pending").length,
      amount: nonRejected.reduce((sum, d) => sum + Number(d.amount ?? 0), 0),
    };
  }, [drops]);

  const handleSubmit = () => {
    // Imperative guard: two taps can fire before the button re-renders, and the POST isn't
    // idempotent (would record two drops).
    if (addMutation.isPending) return;
    // Reveal every field error. Canister is the first field (its inline error is now visible);
    // if it's valid but amount isn't, pull the amount field forward.
    if (!v.attemptSubmit()) {
      if (!fieldErrors.canisterNumber && fieldErrors.amount) amountRef.current?.focus();
      return;
    }
    addMutation.mutate();
  };

  return (
    <ScreenContainer
      refreshControl={
        <RefreshControl
          refreshing={dropsQuery.isRefetching}
          onRefresh={() => void dropsQuery.refetch()}
          tintColor={appTheme.colors.primary}
        />
      }
      footer={
        <View style={styles.footerWrap}>
          <PrimaryButton
            label={addMutation.isPending ? "Saving…" : "Add safe drop"}
            // Enabled while incomplete: pressing reveals what's missing via inline field errors.
            // handleSubmit runs the checks and only fires the POST once everything's valid.
            onPress={handleSubmit}
            disabled={addMutation.isPending}
          />
        </View>
      }
    >
      <View style={[ui.card, styles.card]}>
        <KpiGrid columns={2}>
          <KpiTile label="Total Dropped" value={formatCurrencyGBP(totals.amount)} />
          <KpiTile
            label="Drops"
            value={totals.count}
            hint={totals.pending > 0 ? `${totals.pending} awaiting approval` : undefined}
            tone={totals.pending > 0 ? "warning" : "default"}
          />
        </KpiGrid>
      </View>

      <View style={[ui.card, styles.card]}>
        <SectionHeader
          title="Add Safe Drop"
          subtitle={`Records a new canister drop for ${businessDate}.`}
          icon="add-circle-outline"
        />
        <FloatingLabelInput
          label="Canister number"
          value={canisterNumber}
          onChangeText={setCanisterNumber}
          onBlur={() => v.touch("canisterNumber")}
          error={v.showError("canisterNumber")}
          editable={!addMutation.isPending}
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => amountRef.current?.focus()}
        />
        <FloatingLabelInput
          ref={amountRef}
          label="Amount"
          prefix="£"
          value={amount}
          onChangeText={setAmount}
          onBlur={() => v.touch("amount")}
          error={v.showError("amount")}
          keyboardType="decimal-pad"
          editable={!addMutation.isPending}
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => droppedByNameRef.current?.focus()}
        />
        <FloatingLabelInput
          ref={droppedByNameRef}
          label={defaultDroppedByName ? `Dropped by (default: ${defaultDroppedByName})` : "Dropped by"}
          value={droppedByName}
          onChangeText={setDroppedByName}
          editable={!addMutation.isPending}
          autoCapitalize="words"
          returnKeyType="done"
        />
      </View>

      <View style={[ui.card, styles.card]}>
        <SectionHeader
          title="Drops on this date"
          icon="list-outline"
          right={
            <StatusBadge
              label={totals.pending > 0 ? `${totals.pending} pending` : `${totals.count}`}
              tone={totals.pending > 0 ? "warning" : totals.count > 0 ? "success" : "neutral"}
            />
          }
        />

        {dropsQuery.isLoading ? (
          <View style={{ gap: 8 }}>
            <Skeleton height={84} radius={appTheme.radius.sm} />
            <Skeleton height={84} radius={appTheme.radius.sm} />
          </View>
        ) : drops.length === 0 ? (
          <EmptyState
            icon="lock-closed-outline"
            title="No safe drops yet"
            message={
              canApprove
                ? "No safe drops have been recorded for this day yet."
                : "You haven't recorded any safe drops for this day yet."
            }
          />
        ) : (
          <View style={styles.dropList}>
            {drops.map((drop) => {
              const isPending = drop.approvalStatus === "Pending";
              const isRejected = drop.approvalStatus === "Rejected";
              const droppedDate = new Date(drop.droppedOn);
              const droppedLabel = Number.isNaN(droppedDate.getTime())
                ? "—"
                : droppedDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
              const accentColor = isPending
                ? appTheme.colors.warning
                : isRejected
                  ? appTheme.colors.danger
                  : appTheme.colors.success;
              return (
                <View key={drop.id} style={styles.dropCard}>
                  <View style={[styles.dropAccent, { backgroundColor: accentColor }]} />
                  <View style={styles.dropBody}>
                    <View style={styles.dropHeaderRow}>
                      <View style={styles.dropIdentity}>
                        <View style={styles.dropCanisterRow}>
                          <Ionicons name="lock-closed-outline" size={13} color={appTheme.colors.textMuted} />
                          <Text style={styles.dropCanisterLabel}>CANISTER · {droppedLabel}</Text>
                        </View>
                        <Text style={styles.dropCanisterValue} numberOfLines={1}>
                          {drop.canisterNumber}
                        </Text>
                      </View>
                      <View style={styles.dropAmountBlock}>
                        <Text style={styles.dropAmount}>{formatCurrencyGBP(Number(drop.amount ?? 0))}</Text>
                        <StatusBadge
                          label={drop.approvalStatus}
                          tone={isPending ? "warning" : isRejected ? "danger" : "success"}
                        />
                      </View>
                    </View>

                    <View style={styles.dropMetaLine}>
                      <Ionicons name="person-outline" size={12} color={appTheme.colors.textSubtle} />
                      <Text style={styles.dropMetaText} numberOfLines={1}>
                        {drop.droppedByName}
                      </Text>
                      {drop.shiftName ? (
                        <>
                          <Text style={styles.dropMetaSep}>·</Text>
                          <Ionicons name="time-outline" size={12} color={appTheme.colors.textSubtle} />
                          <Text style={styles.dropMetaText} numberOfLines={1}>
                            {drop.shiftName}
                          </Text>
                        </>
                      ) : null}
                    </View>

                    {!isPending && drop.approvalNotes ? (
                      <View style={styles.dropNoteRow}>
                        <Ionicons
                          name={isRejected ? "alert-circle-outline" : "chatbubble-ellipses-outline"}
                          size={12}
                          color={isRejected ? appTheme.colors.danger : appTheme.colors.textSubtle}
                        />
                        <Text
                          style={[
                            styles.dropNoteText,
                            isRejected ? styles.dropNoteTextDanger : null,
                          ]}
                          numberOfLines={3}
                        >
                          {drop.approvalNotes}
                        </Text>
                      </View>
                    ) : null}

                    {isPending && canApprove ? (
                      <Pressable
                        style={({ pressed }) => [
                          styles.approveButton,
                          pressed ? styles.approveButtonPressed : null,
                          approveMutation.isPending ? styles.approveButtonDisabled : null,
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel={`Approve safe drop ${drop.canisterNumber} for ${formatCurrencyGBP(Number(drop.amount ?? 0))}`}
                        onPress={async () => {
                          const ok = await confirmAction({
                            title: "Approve this safe drop?",
                            message: `Approve the ${formatCurrencyGBP(Number(drop.amount ?? 0))} drop for canister ${drop.canisterNumber}?`,
                            confirmLabel: "Approve",
                          });
                          if (ok) approveMutation.mutate(drop.id);
                        }}
                        disabled={approveMutation.isPending}
                      >
                        <Ionicons name="checkmark-circle-outline" size={16} color={appTheme.colors.primary} />
                        <Text style={styles.approveButtonText}>
                          {approveMutation.isPending ? "Approving…" : "Approve"}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: appTheme.spacing.sm,
  },
  footerWrap: {
    gap: appTheme.spacing.xs,
  },
  dropList: {
    gap: appTheme.spacing.xs,
  },
  dropCard: {
    flexDirection: "row",
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surface,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: appTheme.colors.borderSoft,
  },
  dropAccent: {
    width: 4,
    alignSelf: "stretch",
  },
  dropBody: {
    flex: 1,
    padding: appTheme.spacing.sm,
    gap: 6,
  },
  dropHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: appTheme.spacing.sm,
  },
  dropIdentity: {
    flex: 1,
    gap: 2,
  },
  dropCanisterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  dropCanisterLabel: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.4,
  },
  dropCanisterValue: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 15,
    lineHeight: 19,
  },
  dropAmountBlock: {
    alignItems: "flex-end",
    gap: 4,
  },
  dropAmount: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.heading,
    fontSize: 16,
    lineHeight: 20,
  },
  dropMetaLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  dropMetaText: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.body,
    fontSize: 12,
    lineHeight: 16,
  },
  dropMetaSep: {
    color: appTheme.colors.textSubtle,
    fontSize: 12,
    lineHeight: 16,
  },
  dropNoteRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 4,
  },
  dropNoteText: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.body,
    fontSize: 12,
    lineHeight: 16,
    flex: 1,
  },
  dropNoteTextDanger: {
    color: appTheme.colors.danger,
  },
  approveButton: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: appTheme.radius.pill,
    backgroundColor: appTheme.colors.surfaceBrandSoft,
  },
  approveButtonPressed: {
    opacity: 0.85,
  },
  approveButtonDisabled: {
    opacity: 0.55,
  },
  approveButtonText: {
    color: appTheme.colors.primary,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 16,
  },
});
