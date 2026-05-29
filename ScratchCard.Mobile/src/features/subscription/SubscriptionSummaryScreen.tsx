import React from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  cancelShopSubscription,
  getShopSubscriptionSummary,
  pauseShopSubscription,
  reactivateShopSubscription,
  resumeShopSubscription,
} from "../../api/subscriptionApi";
import { useAuth } from "../../auth/AuthContext";
import { PrimaryButton } from "../../components/PrimaryButton";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Skeleton } from "../../components/Skeleton";
import { toastError, toastSuccess } from "../../components/toast";
import { RootStackParamList } from "../../types/navigation";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";
import { SUBSCRIPTION_MANAGE_RESTRICTED_MESSAGE, useCanManageSubscription } from "./useCanManageSubscription";

function formatDate(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

export function SubscriptionSummaryScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const queryClient = useQueryClient();
  const { activeShop, activeShopId } = useAuth();
  const canManageSubscription = useCanManageSubscription();
  const shopId = activeShopId;

  const summaryQuery = useQuery({
    queryKey: ["shop-subscription-summary", shopId],
    queryFn: () => getShopSubscriptionSummary(shopId as string),
    enabled: Boolean(shopId),
    staleTime: 5 * 60 * 1000,
  });

  const summary = summaryQuery.data;
  const status = summary?.status?.toLowerCase();
  const isCancelledAtPeriodEnd = Boolean(status === "active" && (summary as any)?.cancelAtPeriodEnd);
  const isCancelled = status === "cancelled";
  const isPaused = status === "suspended";
  // 11-month heads-up: when fewer than 31 days remain before the 1-year auto-cancel, surface
  // a banner so the owner knows to resume or accept the cancellation.
  const showPauseCapBanner = isPaused
    && summary?.pauseDaysRemaining != null
    && summary.pauseDaysRemaining <= 30;

  const cancelMutation = useMutation({
    mutationFn: (cancelAtPeriodEnd: boolean) => cancelShopSubscription(shopId as string, cancelAtPeriodEnd),
    onSuccess: async () => {
      toastSuccess("Cancellation scheduled.");
      await queryClient.invalidateQueries({ queryKey: ["shop-subscription-summary", shopId] });
      await queryClient.invalidateQueries({ queryKey: ["shop-entitlements", shopId] });
    },
    onError: (error: any) => toastError(error?.response?.data?.message ?? "Unable to cancel."),
  });

  const reactivateMutation = useMutation({
    mutationFn: () => reactivateShopSubscription(shopId as string),
    onSuccess: async () => {
      toastSuccess("Subscription reactivated.");
      await queryClient.invalidateQueries({ queryKey: ["shop-subscription-summary", shopId] });
      await queryClient.invalidateQueries({ queryKey: ["shop-entitlements", shopId] });
    },
    onError: (error: any) => toastError(error?.response?.data?.message ?? "Unable to reactivate."),
  });

  const pauseMutation = useMutation({
    mutationFn: () => pauseShopSubscription(shopId as string),
    onSuccess: async () => {
      toastSuccess("Shop paused. Resume any time within 1 year.");
      await queryClient.invalidateQueries({ queryKey: ["shop-subscription-summary", shopId] });
      await queryClient.invalidateQueries({ queryKey: ["shop-entitlements", shopId] });
    },
    onError: (error: any) => toastError(error?.response?.data?.message ?? "Unable to pause."),
  });

  const resumeMutation = useMutation({
    mutationFn: () => resumeShopSubscription(shopId as string),
    onSuccess: async () => {
      toastSuccess("Shop resumed.");
      await queryClient.invalidateQueries({ queryKey: ["shop-subscription-summary", shopId] });
      await queryClient.invalidateQueries({ queryKey: ["shop-entitlements", shopId] });
    },
    onError: (error: any) => {
      const code = error?.response?.data?.code;
      const message = error?.response?.data?.message ?? "Unable to resume.";
      if (code === "subscription_expired") {
        // The Stripe sub was auto-cancelled by the 1-year cap (or admin action) — fresh
        // checkout is the only path forward. Surface clearly and route to plan picker.
        Alert.alert(
          "Subscription expired",
          message,
          [
            { text: "Close", style: "cancel" },
            { text: "Choose Plan", onPress: () => navigation.navigate("ChoosePlan") },
          ],
        );
        return;
      }
      toastError(message);
    },
  });

  function confirmPause() {
    Alert.alert(
      "Pause shop?",
      "Billing stops immediately. You can resume any time within 1 year. After 1 year, the subscription is automatically cancelled.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Pause shop", onPress: () => pauseMutation.mutate() },
      ],
    );
  }

  function confirmCancel() {
    Alert.alert(
      "Cancel subscription?",
      "This shop will lose access at the end of the current period.",
      [
        { text: "Keep subscription", style: "cancel" },
        { text: "Cancel at period end", style: "destructive", onPress: () => cancelMutation.mutate(true) },
      ]
    );
  }

  return (
    <ScreenContainer>
      <View style={ui.card}>
        <Text style={styles.title}>Subscription Summary</Text>
        <Text style={styles.meta}>Shop: {activeShop?.shopName ?? "-"}</Text>

        {showPauseCapBanner ? (
          <View style={styles.capBanner}>
            <Text style={styles.capBannerTitle}>
              Paused — auto-cancel in {summary?.pauseDaysRemaining} day{summary?.pauseDaysRemaining === 1 ? "" : "s"}
            </Text>
            <Text style={styles.capBannerBody}>
              Resume to keep this shop's subscription on the saved card. After auto-cancel, the
              subscription must be re-created from scratch.
            </Text>
          </View>
        ) : null}

        {summaryQuery.isLoading ? <Skeleton height={20} width="80%" /> : null}
        {summary ? (
          <>
            <Text style={styles.meta}>Plan: {summary.planName || "-"}</Text>
            <Text style={styles.meta}>Status: {summary.status}</Text>
            <Text style={styles.meta}>Billing Cycle: {summary.billingCycle}</Text>
            <Text style={styles.meta}>Price: GBP {summary.price.toFixed(2)}</Text>
            <Text style={styles.meta}>Current Period Ends: {formatDate(summary.currentPeriodEndsOn)}</Text>
            <Text style={styles.meta}>Trial Ends: {formatDate(summary.trialEndsOn)}</Text>
            <Text style={styles.meta}>Trial Days Remaining: {summary.trialDaysRemaining ?? "-"}</Text>

            <View style={styles.limitsRow}>
              <View style={styles.limitChip}>
                <Text style={styles.limitChipText}>
                  {summary.maxUsers == null ? "Unlimited users" : `${summary.maxUsers} users included`}
                </Text>
              </View>
              <View style={styles.limitChip}>
                <Text style={styles.limitChipText}>
                  {summary.reportExportsPerMonth == null
                    ? "Unlimited report exports"
                    : `${summary.reportExportsPerMonth} report exports / month`}
                </Text>
              </View>
            </View>

            {summary.includedFeatures.length > 0 ? (
              <View style={styles.featuresBlock}>
                <Text style={styles.featuresHeading}>Included features</Text>
                {summary.includedFeatures.map((feature) => (
                  <Text key={feature} style={styles.featureBullet}>• {feature}</Text>
                ))}
              </View>
            ) : null}
          </>
        ) : null}
        {canManageSubscription ? (
          <>
            <PrimaryButton label="Choose Plan" onPress={() => navigation.navigate("ChoosePlan")} disabled={!shopId} />

            {summary && isPaused ? (
              <PrimaryButton
                label={resumeMutation.isPending ? "Resuming..." : "Resume Shop"}
                tone="success"
                onPress={() => resumeMutation.mutate()}
                disabled={resumeMutation.isPending}
              />
            ) : null}

            {summary && !isPaused && !isCancelled && !isCancelledAtPeriodEnd ? (
              <PrimaryButton
                label={pauseMutation.isPending ? "Pausing..." : "Pause Shop"}
                tone="neutral"
                onPress={confirmPause}
                disabled={pauseMutation.isPending}
              />
            ) : null}

            {summary && !isPaused && !isCancelled && !isCancelledAtPeriodEnd ? (
              <PrimaryButton
                label={cancelMutation.isPending ? "Cancelling..." : "Cancel Subscription"}
                tone="danger"
                onPress={confirmCancel}
                disabled={cancelMutation.isPending}
              />
            ) : null}

            {summary && (isCancelled || isCancelledAtPeriodEnd) ? (
              <PrimaryButton
                label={reactivateMutation.isPending ? "Reactivating..." : "Reactivate Subscription"}
                tone="success"
                onPress={() => reactivateMutation.mutate()}
                disabled={reactivateMutation.isPending}
              />
            ) : null}
          </>
        ) : (
          <View style={styles.restrictedNotice}>
            <Text style={styles.restrictedText}>{SUBSCRIPTION_MANAGE_RESTRICTED_MESSAGE}</Text>
          </View>
        )}
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
  limitsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 6,
  },
  limitChip: {
    backgroundColor: appTheme.colors.surfaceInfoMuted,
    borderRadius: appTheme.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  limitChipText: {
    ...appTheme.typography.caption,
    color: appTheme.colors.textInfoStrong,
  },
  featuresBlock: {
    marginTop: appTheme.spacing.sm,
    gap: 2,
  },
  featuresHeading: {
    ...appTheme.typography.bodyEmphasis,
    color: appTheme.colors.text,
    marginBottom: 2,
  },
  featureBullet: {
    ...appTheme.typography.caption,
    color: appTheme.colors.textMuted,
  },
  capBanner: {
    backgroundColor: appTheme.colors.surfaceWarningSoft,
    borderRadius: appTheme.radius.sm,
    borderWidth: 1,
    borderColor: appTheme.colors.borderWarningSoft,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: appTheme.spacing.sm,
    gap: 4,
  },
  capBannerTitle: {
    ...appTheme.typography.bodyEmphasis,
    color: appTheme.colors.text,
  },
  capBannerBody: {
    ...appTheme.typography.caption,
    color: appTheme.colors.textMuted,
  },
  restrictedNotice: {
    backgroundColor: appTheme.colors.surfaceInfoMuted,
    borderRadius: appTheme.radius.sm,
    padding: appTheme.spacing.sm,
  },
  restrictedText: {
    ...appTheme.typography.body,
    color: appTheme.colors.textInfoStrong,
  },
});
