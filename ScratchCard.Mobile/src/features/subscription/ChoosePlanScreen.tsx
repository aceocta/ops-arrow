import React, { useEffect, useMemo, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listSubscriptionPlans, selectShopSubscriptionPlan } from "../../api/subscriptionApi";
import { useAuth } from "../../auth/AuthContext";
import { EmptyState } from "../../components/EmptyState";
import { PrimaryButton } from "../../components/PrimaryButton";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Skeleton } from "../../components/Skeleton";
import { toastError, toastSuccess } from "../../components/toast";
import { BillingCycle } from "../../types/enums";
import { RootStackParamList } from "../../types/navigation";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";
import { track } from "../../utils/analytics";
import { haptics } from "../../utils/haptics";
import { restorePurchases } from "./purchaseService";

type CycleFilter = "monthly" | "annual" | "all";

const TERMS_URL = "https://opsarrow.com/terms";
const PRIVACY_URL = "https://opsarrow.com/privacy";

function matchesCycle(cycle: BillingCycle | string, filter: CycleFilter) {
  if (filter === "all") return true;
  const normalized = String(cycle).toLowerCase();
  if (filter === "monthly") return normalized.includes("month");
  if (filter === "annual") return normalized.includes("annual") || normalized.includes("year");
  return true;
}

export function ChoosePlanScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const queryClient = useQueryClient();
  const { activeShop, activeShopId } = useAuth();
  const shopId = activeShopId;
  const [selectedPlanId, setSelectedPlanId] = useState<string>("");
  const [cycleFilter, setCycleFilter] = useState<CycleFilter>("monthly");
  const [restorePending, setRestorePending] = useState(false);

  useEffect(() => {
    track("paywall_viewed", { shopId });
  }, [shopId]);

  const plansQuery = useQuery({
    queryKey: ["subscription-plans"],
    queryFn: listSubscriptionPlans,
  });

  const billablePlans = useMemo(
    () => (plansQuery.data ?? []).filter((plan) => plan.billingCycle !== BillingCycle.Trial),
    [plansQuery.data]
  );

  const visiblePlans = useMemo(
    () => billablePlans.filter((plan) => matchesCycle(plan.billingCycle, cycleFilter)),
    [billablePlans, cycleFilter]
  );

  const selectedPlan = visiblePlans.find((plan) => plan.id === selectedPlanId);

  const selectPlanMutation = useMutation({
    mutationFn: () => selectShopSubscriptionPlan(shopId as string, selectedPlanId),
    onMutate: () => {
      track("plan_selected", { planId: selectedPlanId, shopId });
    },
    onSuccess: async () => {
      haptics.success();
      toastSuccess("Plan selected successfully.");
      await queryClient.invalidateQueries({ queryKey: ["shop-subscription-summary", shopId] });
      await queryClient.invalidateQueries({ queryKey: ["shop-subscription-summary-root", shopId] });
      await queryClient.invalidateQueries({ queryKey: ["shop-entitlements", shopId] });
      navigation.navigate("SubscriptionSummary");
    },
    onError: (error: any) => {
      haptics.error();
      toastError(error?.response?.data?.message ?? "Unable to select plan.");
    },
  });

  async function handleRestore() {
    if (!shopId) return;
    setRestorePending(true);
    const result = await restorePurchases(shopId);
    setRestorePending(false);
    if (result.ok) {
      toastSuccess("Subscription restored.");
      await queryClient.invalidateQueries({ queryKey: ["shop-subscription-summary-root", shopId] });
      await queryClient.invalidateQueries({ queryKey: ["shop-entitlements", shopId] });
      navigation.navigate("SubscriptionSummary");
    } else {
      toastError(result.message ?? "Unable to restore subscription.");
    }
  }

  return (
    <ScreenContainer>
      <View style={ui.card}>
        <Text style={styles.title}>Choose Subscription Plan</Text>
        <Text style={styles.meta}>Company: {activeShop?.companyName ?? "-"}</Text>

        <View style={styles.cycleToggle}>
          {(["monthly", "annual", "all"] as CycleFilter[]).map((value) => (
            <Pressable
              key={value}
              onPress={() => setCycleFilter(value)}
              style={[styles.cycleToggleButton, cycleFilter === value && styles.cycleToggleButtonActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: cycleFilter === value }}
              accessibilityLabel={`Show ${value} plans`}
            >
              <Text style={[styles.cycleToggleText, cycleFilter === value && styles.cycleToggleTextActive]}>
                {value === "monthly" ? "Monthly" : value === "annual" ? "Annual" : "All"}
              </Text>
            </Pressable>
          ))}
        </View>

        {plansQuery.isLoading ? (
          <View style={{ gap: 8 }}>
            <Skeleton height={70} radius={appTheme.radius.sm} />
            <Skeleton height={70} radius={appTheme.radius.sm} />
          </View>
        ) : visiblePlans.length === 0 ? (
          <EmptyState
            icon="pricetag-outline"
            title="No plans available"
            message="No plans match this billing cycle. Try a different cycle or contact support."
          />
        ) : (
          visiblePlans.map((plan) => {
            const selected = selectedPlanId === plan.id;
            return (
              <Pressable
                key={plan.id}
                style={[styles.planCard, selected ? styles.planCardSelected : null]}
                onPress={() => {
                  haptics.selection();
                  setSelectedPlanId(plan.id);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`Select ${plan.name} plan`}
              >
                <View style={styles.planHeaderRow}>
                  <Text style={styles.planTitle}>{plan.name}</Text>
                  {plan.trialDays > 0 ? (
                    <View style={styles.trialBadge}>
                      <Text style={styles.trialBadgeText}>{plan.trialDays}-day trial</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.meta}>Cycle: {plan.billingCycle}</Text>
                <Text style={styles.meta}>Price per shop: GBP {plan.pricePerShop.toFixed(2)}</Text>
                {plan.description ? <Text style={styles.meta}>{plan.description}</Text> : null}
                {plan.includedFeatures && plan.includedFeatures.length > 0 ? (
                  <View style={styles.featuresWrap}>
                    {plan.includedFeatures.map((feature) => (
                      <View key={feature} style={styles.featureChip}>
                        <Text style={styles.featureChipText}>{feature}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </Pressable>
            );
          })
        )}

        {selectedPlan ? (
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>Billing Summary</Text>
            <Text style={styles.meta}>Shop: {activeShop?.shopName ?? "-"}</Text>
            <Text style={styles.meta}>Cycle: {selectedPlan.billingCycle}</Text>
            <Text style={styles.summaryTotal}>Price: GBP {selectedPlan.pricePerShop.toFixed(2)} / {String(selectedPlan.billingCycle).toLowerCase().includes("annual") ? "year" : "month"}</Text>
          </View>
        ) : null}

        <PrimaryButton
          label={selectPlanMutation.isPending ? "Selecting..." : "Select Plan"}
          onPress={() => selectPlanMutation.mutate()}
          disabled={!shopId || !selectedPlanId || selectPlanMutation.isPending}
        />

        <Pressable
          onPress={handleRestore}
          disabled={restorePending}
          style={styles.restoreLink}
          accessibilityRole="button"
          accessibilityLabel="Restore previous purchases"
        >
          <Text style={styles.restoreLinkText}>
            {restorePending ? "Restoring..." : "Restore previous purchases"}
          </Text>
        </Pressable>

        <View style={styles.legalRow}>
          <Pressable onPress={() => Linking.openURL(TERMS_URL)} accessibilityRole="link" accessibilityLabel="Open Terms">
            <Text style={styles.legalLinkText}>Terms</Text>
          </Pressable>
          <Text style={styles.legalSeparator}>·</Text>
          <Pressable onPress={() => Linking.openURL(PRIVACY_URL)} accessibilityRole="link" accessibilityLabel="Open Privacy">
            <Text style={styles.legalLinkText}>Privacy</Text>
          </Pressable>
        </View>
        <Text style={styles.legalHelp}>
          Subscriptions auto-renew unless cancelled at least 24 hours before the end of the current period. Manage in your store account.
        </Text>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: {
    ...appTheme.typography.title,
    color: appTheme.colors.text,
  },
  meta: {
    ...appTheme.typography.body,
    color: appTheme.colors.textMuted,
  },
  cycleToggle: {
    flexDirection: "row",
    backgroundColor: appTheme.colors.surfaceMuted,
    borderRadius: appTheme.radius.pill,
    padding: 4,
    gap: 4,
  },
  cycleToggleButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: appTheme.radius.pill,
    alignItems: "center",
  },
  cycleToggleButtonActive: {
    backgroundColor: appTheme.colors.primary,
  },
  cycleToggleText: {
    ...appTheme.typography.bodyEmphasis,
    color: appTheme.colors.textMuted,
  },
  cycleToggleTextActive: {
    color: appTheme.colors.onPrimary,
  },
  planCard: {
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surface,
    padding: appTheme.spacing.sm,
    gap: 4,
    ...appTheme.elevation.sm,
  },
  planCardSelected: {
    borderColor: appTheme.colors.primary,
    backgroundColor: appTheme.colors.surfaceBrandSoft,
  },
  planHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  planTitle: {
    ...appTheme.typography.subtitle,
    color: appTheme.colors.text,
  },
  trialBadge: {
    backgroundColor: appTheme.colors.badgeSuccessBg,
    borderRadius: appTheme.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: appTheme.colors.badgeSuccessBorder,
  },
  trialBadgeText: {
    ...appTheme.typography.caption,
    color: appTheme.colors.textSuccessStrong,
  },
  featuresWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 6,
  },
  featureChip: {
    backgroundColor: appTheme.colors.surfaceInfoMuted,
    borderRadius: appTheme.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  featureChipText: {
    ...appTheme.typography.caption,
    color: appTheme.colors.textInfoStrong,
  },
  summaryCard: {
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    padding: appTheme.spacing.sm,
    gap: 4,
  },
  summaryTitle: {
    ...appTheme.typography.bodyEmphasis,
    color: appTheme.colors.text,
  },
  summaryTotal: {
    ...appTheme.typography.subtitle,
    color: appTheme.colors.text,
    marginTop: 4,
  },
  restoreLink: {
    alignSelf: "center",
    paddingVertical: 8,
  },
  restoreLinkText: {
    ...appTheme.typography.bodyEmphasis,
    color: appTheme.colors.primary,
  },
  legalRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  legalLinkText: {
    ...appTheme.typography.caption,
    color: appTheme.colors.textMuted,
    textDecorationLine: "underline",
  },
  legalSeparator: {
    ...appTheme.typography.caption,
    color: appTheme.colors.textSubtle,
  },
  legalHelp: {
    ...appTheme.typography.caption,
    color: appTheme.colors.textSubtle,
    textAlign: "center",
    paddingHorizontal: appTheme.spacing.sm,
  },
});
