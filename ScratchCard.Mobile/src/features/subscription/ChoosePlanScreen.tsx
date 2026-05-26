import React, { useEffect, useMemo, useState } from "react";
import { Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listSubscriptionPlans } from "../../api/subscriptionApi";
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
import { startBillingCheckout } from "./purchaseService";

// On iOS we must not show pricing or purchase CTAs in-app (Apple Guideline 3.1.3(c)).
// The button reads as account management; the price grid is rendered in the web billing portal.
const IS_IOS = Platform.OS === "ios";
const CHECKOUT_BUTTON_LABEL = IS_IOS ? "Open billing portal" : "Continue to Checkout";
const CHECKOUT_BUTTON_PENDING = IS_IOS ? "Opening portal..." : "Opening checkout...";

const TERMS_URL = "https://opsarrow.com/terms";
const PRIVACY_URL = "https://opsarrow.com/privacy";

export function ChoosePlanScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const queryClient = useQueryClient();
  const { activeShop, activeShopId } = useAuth();
  const shopId = activeShopId;
  const [selectedPlanId, setSelectedPlanId] = useState<string>("");
  const [restorePending, setRestorePending] = useState(false);

  useEffect(() => {
    track("paywall_viewed", { shopId });
  }, [shopId]);

  const plansQuery = useQuery({
    queryKey: ["subscription-plans"],
    queryFn: listSubscriptionPlans,
  });

  // Monthly-only catalogue. The backend may still hold legacy Trial / Annual rows, so we filter
  // to active Monthly plans here.
  const visiblePlans = useMemo(
    () =>
      (plansQuery.data ?? []).filter(
        (plan) => plan.isActive && plan.billingCycle === BillingCycle.Monthly
      ),
    [plansQuery.data]
  );

  const selectedPlan = visiblePlans.find((plan) => plan.id === selectedPlanId);

  const selectPlanMutation = useMutation({
    mutationFn: async () => {
      track("plan_selected", { planId: selectedPlanId, shopId });

      // App-to-Web model: open Stripe Checkout in the external browser. Payment processing,
      // VAT invoicing, and store-commission avoidance all live on the web side. When the user
      // returns to the app, useEntitlements + the foreground refetch unlock the shop.
      const result = await startBillingCheckout({
        shopId: shopId as string,
        planId: selectedPlanId,
      });
      if (!result.ok) {
        throw new Error(result.message ?? "Unable to open checkout.");
      }
      if (result.cancelled) {
        // User dismissed the browser. Don't navigate away — they may want to try again.
        return null;
      }
      return null;
    },
    onSuccess: async (data) => {
      haptics.success();
      // Whether the user completed checkout or just dismissed, refresh state so the UI catches up
      // as soon as the webhook lands.
      await queryClient.invalidateQueries({ queryKey: ["shop-subscription-summary", shopId] });
      await queryClient.invalidateQueries({ queryKey: ["shop-subscription-summary-root", shopId] });
      await queryClient.invalidateQueries({ queryKey: ["shop-entitlements", shopId] });
      if (data !== null) {
        toastSuccess("Checkout opened. Your shop will unlock once payment is confirmed.");
        navigation.navigate("SubscriptionSummary");
      }
    },
    onError: (error: any) => {
      haptics.error();
      toastError(error?.response?.data?.message ?? error?.message ?? "Unable to start checkout.");
    },
  });

  async function handleRestore() {
    if (!shopId) return;
    setRestorePending(true);
    // In the App-to-Web model "restore" just means re-asking the backend for current entitlement
    // state — the subscription lives on the web, not in the device's IAP wallet.
    await queryClient.invalidateQueries({ queryKey: ["shop-subscription-summary-root", shopId] });
    await queryClient.invalidateQueries({ queryKey: ["shop-entitlements", shopId] });
    setRestorePending(false);
    toastSuccess("Subscription status refreshed.");
  }

  return (
    <ScreenContainer>
      <View style={ui.card}>
        <Text style={styles.title}>{IS_IOS ? "Subscription plans" : "Choose Subscription Plan"}</Text>
        <Text style={styles.meta}>Company: {activeShop?.companyName ?? "-"}</Text>

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
                {!IS_IOS ? (
                  <Text style={styles.meta}>Price per shop: GBP {plan.pricePerShop.toFixed(2)}</Text>
                ) : null}
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
            <Text style={styles.summaryTitle}>Selected plan</Text>
            <Text style={styles.meta}>Shop: {activeShop?.shopName ?? "-"}</Text>
            <Text style={styles.meta}>Plan: {selectedPlan.name}</Text>
            <Text style={styles.meta}>Cycle: {selectedPlan.billingCycle}</Text>
            {IS_IOS ? (
              <Text style={styles.meta}>Pricing and payment are shown in the billing portal.</Text>
            ) : (
              <Text style={styles.summaryTotal}>
                Price: GBP {selectedPlan.pricePerShop.toFixed(2)} / {String(selectedPlan.billingCycle).toLowerCase().includes("annual") ? "year" : "month"}
              </Text>
            )}
          </View>
        ) : null}

        <PrimaryButton
          label={selectPlanMutation.isPending ? CHECKOUT_BUTTON_PENDING : CHECKOUT_BUTTON_LABEL}
          onPress={() => selectPlanMutation.mutate()}
          disabled={!shopId || !selectedPlanId || selectPlanMutation.isPending}
        />

        <Pressable
          onPress={handleRestore}
          disabled={restorePending}
          style={styles.restoreLink}
          accessibilityRole="button"
          accessibilityLabel="Refresh subscription status"
        >
          <Text style={styles.restoreLinkText}>
            {restorePending ? "Refreshing..." : "Refresh subscription status"}
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
