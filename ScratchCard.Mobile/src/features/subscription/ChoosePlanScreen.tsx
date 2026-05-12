import React, { useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { calculateSubscription, listSubscriptionPlans, selectSubscriptionPlan } from "../../api/subscriptionApi";
import { useAuth } from "../../auth/AuthContext";
import { PrimaryButton } from "../../components/PrimaryButton";
import { ScreenContainer } from "../../components/ScreenContainer";
import { BillingCycle } from "../../types/enums";
import { RootStackParamList } from "../../types/navigation";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";

export function ChoosePlanScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const queryClient = useQueryClient();
  const { activeShop } = useAuth();
  const companyId = activeShop?.companyId;
  const [selectedPlanId, setSelectedPlanId] = useState<string>("");

  const plansQuery = useQuery({
    queryKey: ["subscription-plans"],
    queryFn: listSubscriptionPlans,
  });

  const selectablePlans = useMemo(
    () => (plansQuery.data ?? []).filter((plan) => plan.billingCycle !== BillingCycle.Trial),
    [plansQuery.data]
  );

  const selectedPlan = selectablePlans.find((plan) => plan.id === selectedPlanId);

  const calculationQuery = useQuery({
    queryKey: ["subscription-calculate", companyId, selectedPlanId],
    queryFn: () => calculateSubscription(companyId as string, selectedPlanId),
    enabled: Boolean(companyId) && Boolean(selectedPlanId),
  });

  const selectPlanMutation = useMutation({
    mutationFn: () => selectSubscriptionPlan(companyId as string, selectedPlanId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["subscription-summary"] });
      await queryClient.invalidateQueries({ queryKey: ["subscription-summary-root"] });
      navigation.navigate("SubscriptionSummary");
    },
    onError: (error: any) => {
      Alert.alert("Failed", error?.response?.data?.message ?? "Unable to select plan.");
    },
  });

  return (
    <ScreenContainer>
      <View style={ui.card}>
        <Text style={styles.title}>Choose Subscription Plan</Text>
        <Text style={styles.meta}>Company: {activeShop?.companyName ?? "-"}</Text>
        <Text style={styles.meta}>No payment method is required during trial signup. Select a paid plan when ready.</Text>
        {plansQuery.isLoading ? <Text style={styles.meta}>Loading plans...</Text> : null}
        {selectablePlans.map((plan) => {
          const selected = selectedPlanId === plan.id;
          return (
            <Pressable
              key={plan.id}
              style={[styles.planCard, selected ? styles.planCardSelected : null]}
              onPress={() => setSelectedPlanId(plan.id)}
            >
              <Text style={styles.planTitle}>{plan.name}</Text>
              <Text style={styles.meta}>Cycle: {plan.billingCycle}</Text>
              <Text style={styles.meta}>Price per shop: GBP {plan.pricePerShop.toFixed(2)}</Text>
              {plan.description ? <Text style={styles.meta}>{plan.description}</Text> : null}
            </Pressable>
          );
        })}
        {selectedPlan ? (
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>Billing Summary</Text>
            {calculationQuery.isLoading ? <Text style={styles.meta}>Calculating...</Text> : null}
            {calculationQuery.data ? (
              <>
                <Text style={styles.meta}>Active shops: {calculationQuery.data.activeShopCount}</Text>
                <Text style={styles.meta}>Sub total: GBP {calculationQuery.data.subTotalAmount.toFixed(2)}</Text>
                <Text style={styles.meta}>
                  Discount: {calculationQuery.data.discountPercentage.toFixed(2)}% (GBP {calculationQuery.data.discountAmount.toFixed(2)})
                </Text>
                <Text style={styles.meta}>Total: GBP {calculationQuery.data.totalAmount.toFixed(2)}</Text>
              </>
            ) : null}
          </View>
        ) : null}
        <PrimaryButton
          label={selectPlanMutation.isPending ? "Selecting..." : "Select Plan"}
          onPress={() => selectPlanMutation.mutate()}
          disabled={!companyId || !selectedPlanId || selectPlanMutation.isPending}
        />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: {
    color: appTheme.colors.text,
    fontSize: 20,
    lineHeight: 24,
    fontFamily: appTheme.fonts.heading,
  },
  meta: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.body,
    fontSize: 13,
    lineHeight: 18,
  },
  planCard: {
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surface,
    padding: appTheme.spacing.sm,
    gap: 4,
  },
  planCardSelected: {
    borderColor: appTheme.colors.primary,
    backgroundColor: appTheme.colors.backgroundAlt,
  },
  planTitle: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 18,
  },
  summaryCard: {
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    padding: appTheme.spacing.sm,
    gap: 2,
  },
  summaryTitle: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 16,
  },
});
