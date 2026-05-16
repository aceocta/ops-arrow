import React, { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthContext";
import { listPacks } from "../../api/packsApi";
import { approvePrizePayout, createPrizePayout, listPrizePayouts } from "../../api/prizePayoutsApi";
import { getShift } from "../../api/shiftsApi";
import { ScreenContainer } from "../../components/ScreenContainer";
import { PrimaryButton } from "../../components/PrimaryButton";
import { MainStackParamList } from "../../types/navigation";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";

type Props = NativeStackScreenProps<MainStackParamList, "PrizePayout">;

export function PrizePayoutScreen({ route }: Props) {
  const queryClient = useQueryClient();
  const { shiftId } = route.params;
  const { activeShopId, activeShop } = useAuth();
  const defaultShopId = activeShopId;

  const [selectedPackId, setSelectedPackId] = useState<string>("");
  const [ticketNumber, setTicketNumber] = useState("");
  const [prizeAmount, setPrizeAmount] = useState("0");
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [notes, setNotes] = useState("");

  const shiftQuery = useQuery({
    queryKey: ["shift", shiftId],
    queryFn: () => getShift(shiftId),
  });

  const shopId = shiftQuery.data?.shopId ?? defaultShopId;

  const packsQuery = useQuery({
    queryKey: ["packs", shopId],
    queryFn: () => listPacks(shopId as string),
    enabled: Boolean(shopId),
  });

  const payoutsQuery = useQuery({
    queryKey: ["prize-payouts", shiftId],
    queryFn: () => listPrizePayouts(shiftId),
    enabled: Boolean(shiftId),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!shopId || !shiftQuery.data?.businessDayId) {
        throw new Error("Shift context is not loaded.");
      }

      return createPrizePayout({
        shopId,
        businessDayId: shiftQuery.data.businessDayId,
        shiftId,
        packId: selectedPackId || undefined,
        ticketNumber: ticketNumber.trim() || undefined,
        prizeAmount: Number(prizeAmount),
        paymentMethod: paymentMethod.trim() || "Cash",
        notes: notes.trim() || undefined,
      });
    },
    onSuccess: () => {
      setTicketNumber("");
      setPrizeAmount("0");
      setNotes("");
      Alert.alert("Saved", "Prize payout recorded.");
      void queryClient.invalidateQueries({ queryKey: ["prize-payouts", shiftId] });
    },
    onError: (error: any) => {
      Alert.alert("Failed", error?.response?.data?.message ?? error?.message ?? "Unable to create prize payout.");
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (payoutId: string) => approvePrizePayout(payoutId, { notes: "Approved from mobile" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["prize-payouts", shiftId] });
    },
    onError: (error: any) => {
      Alert.alert("Failed", error?.response?.data?.message ?? "Unable to approve payout.");
    },
  });

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[ui.card, styles.card]}>
          <Text style={styles.meta}>Shop: {activeShop?.shopName ?? "-"}</Text>
          <Text style={styles.meta}>Shift ID: {shiftId}</Text>

          <Text style={styles.fieldLabel}>Pack</Text>
          <ScrollView horizontal contentContainerStyle={styles.packChoices} showsHorizontalScrollIndicator={false}>
            {(packsQuery.data ?? []).map((pack) => {
              const selected = selectedPackId === pack.id;
              return (
                <Pressable
                  key={pack.id}
                  style={[styles.choice, selected && styles.choiceSelected]}
                  onPress={() => setSelectedPackId(pack.id)}
                >
                  <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{pack.packNumber}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <Text style={styles.fieldLabel}>Ticket Number</Text>
          <TextInput
            style={[ui.input, styles.input]}
            value={ticketNumber}
            onChangeText={setTicketNumber}
            placeholder="Ticket number"
            placeholderTextColor={appTheme.colors.textSubtle}
          />
          <Text style={styles.fieldLabel}>Prize Amount</Text>
          <TextInput
            style={[ui.input, styles.input]}
            value={prizeAmount}
            onChangeText={setPrizeAmount}
            keyboardType="decimal-pad"
            placeholder="Prize amount"
            placeholderTextColor={appTheme.colors.textSubtle}
          />
          <Text style={styles.fieldLabel}>Payment Method</Text>
          <TextInput
            style={[ui.input, styles.input]}
            value={paymentMethod}
            onChangeText={setPaymentMethod}
            placeholder="Payment method (Cash/Card/Transfer)"
            placeholderTextColor={appTheme.colors.textSubtle}
          />
          <Text style={styles.fieldLabel}>Notes</Text>
          <TextInput
            style={[ui.input, styles.input]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Notes (optional)"
            placeholderTextColor={appTheme.colors.textSubtle}
          />

          <PrimaryButton
            label={createMutation.isPending ? "Saving..." : "Create Payout"}
            onPress={() => createMutation.mutate()}
            disabled={createMutation.isPending}
          />
        </View>

        <View style={[ui.card, styles.card]}>
          <Text style={styles.sectionTitle}>Shift Payouts</Text>
          {(payoutsQuery.data ?? []).map((payout) => (
            <View style={[ui.listItem, styles.item]} key={payout.id}>
              <Text style={styles.itemTitle}>{`\u00A3 ${Number(payout.prizeAmount).toFixed(2)} (${payout.approvalStatus})`}</Text>
              <Text style={styles.meta}>Ticket: {payout.ticketNumber ?? "-"}</Text>
              <Text style={styles.meta}>Paid On: {new Date(payout.paidOn).toLocaleString()}</Text>
              {payout.approvalStatus !== "Approved" ? (
                <Pressable style={styles.approveButton} onPress={() => approveMutation.mutate(payout.id)}>
                  <Text style={styles.approveText}>Approve</Text>
                </Pressable>
              ) : null}
            </View>
          ))}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: appTheme.spacing.sm,
    paddingBottom: appTheme.spacing.sm,
  },
  card: {
    gap: appTheme.spacing.sm,
  },
  sectionTitle: {
    color: appTheme.colors.text,
    fontSize: 17,
    lineHeight: 22,
    fontFamily: appTheme.fonts.bodyMedium,
  },
  fieldLabel: {
    color: appTheme.colors.text,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: appTheme.fonts.bodyMedium,
  },
  meta: {
    color: appTheme.colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: appTheme.fonts.body,
  },
  input: {
    borderRadius: appTheme.radius.sm,
    paddingVertical: 10,
  },
  packChoices: {
    gap: appTheme.spacing.xs,
  },
  choice: {
    borderWidth: 1,
    borderColor: appTheme.colors.primary,
    borderRadius: appTheme.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: appTheme.colors.surface,
  },
  choiceSelected: {
    backgroundColor: appTheme.colors.primary,
  },
  choiceText: {
    color: appTheme.colors.primary,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 14,
  },
  choiceTextSelected: {
    color: appTheme.colors.onPrimary,
  },
  item: {
    borderColor: appTheme.colors.border,
    backgroundColor: appTheme.colors.surfaceTintSoft,
    gap: 4,
  },
  itemTitle: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 18,
  },
  approveButton: {
    alignSelf: "flex-start",
    backgroundColor: appTheme.colors.primary,
    borderRadius: appTheme.radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 4,
  },
  approveText: {
    color: appTheme.colors.onPrimary,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 14,
  },
});

