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
      <ScrollView contentContainerStyle={{ gap: 12 }}>
        <View style={styles.card}>
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
          <TextInput style={styles.input} value={ticketNumber} onChangeText={setTicketNumber} placeholder="Ticket number" />
          <Text style={styles.fieldLabel}>Prize Amount</Text>
          <TextInput style={styles.input} value={prizeAmount} onChangeText={setPrizeAmount} keyboardType="decimal-pad" placeholder="Prize amount" />
          <Text style={styles.fieldLabel}>Payment Method</Text>
          <TextInput style={styles.input} value={paymentMethod} onChangeText={setPaymentMethod} placeholder="Payment method (Cash/Card/Transfer)" />
          <Text style={styles.fieldLabel}>Notes</Text>
          <TextInput style={styles.input} value={notes} onChangeText={setNotes} placeholder="Notes (optional)" />

          <PrimaryButton
            label={createMutation.isPending ? "Saving..." : "Create Payout"}
            onPress={() => createMutation.mutate()}
            disabled={createMutation.isPending}
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Shift Payouts</Text>
          {(payoutsQuery.data ?? []).map((payout) => (
            <View style={styles.item} key={payout.id}>
              <Text style={styles.itemTitle}>£ {Number(payout.prizeAmount).toFixed(2)} ({payout.approvalStatus})</Text>
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
  card: {
    backgroundColor: "white",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D9E1E4",
    padding: 14,
    gap: 10,
  },
  title: { fontSize: 22, fontWeight: "700", color: "#0B1E24" },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: "#0B1E24" },
  fieldLabel: { color: "#1E3540", fontSize: 12, lineHeight: 16, fontWeight: "600" },
  meta: { color: "#4D626A" },
  input: {
    borderWidth: 1,
    borderColor: "#C4D2D7",
    borderRadius: 8,
    backgroundColor: "#FAFCFD",
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  packChoices: { gap: 8 },
  choice: {
    borderWidth: 1,
    borderColor: "#0F3D3E",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  choiceSelected: { backgroundColor: "#0F3D3E" },
  choiceText: { color: "#0F3D3E", fontWeight: "700" },
  choiceTextSelected: { color: "#FFF" },
  item: {
    borderWidth: 1,
    borderColor: "#E2E9EC",
    borderRadius: 10,
    padding: 10,
    gap: 4,
  },
  itemTitle: { fontWeight: "700", color: "#102A35" },
  approveButton: {
    alignSelf: "flex-start",
    backgroundColor: "#0F3D3E",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 4,
  },
  approveText: { color: "#FFF", fontWeight: "700", fontSize: 12 },
});
