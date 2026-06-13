import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "@tanstack/react-query";
import { emailAccountPortalLink, getShopSubscriptionSummary } from "../../api/subscriptionApi";
import { useAuth } from "../../auth/AuthContext";
import { PrimaryButton } from "../../components/PrimaryButton";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Skeleton } from "../../components/Skeleton";
import { toastError, toastSuccess } from "../../components/toast";
import { getApiErrorMessage } from "../../utils/apiErrorMessage";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";

function formatDate(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

export function SubscriptionSummaryScreen() {
  const { activeShop, activeShopId, profile } = useAuth();
  const shopId = activeShopId;
  const [featuresOpen, setFeaturesOpen] = useState(false);

  // The email endpoint is owner-gated server-side (CompanyOwner / PlatformAdmin), so only show
  // the button to users who can actually use it.
  const isAccountOwner =
    (profile?.roles?.includes("PlatformAdmin") ?? false) || activeShop?.role === "CompanyOwner";

  const summaryQuery = useQuery({
    queryKey: ["shop-subscription-summary", shopId],
    queryFn: () => getShopSubscriptionSummary(shopId as string),
    enabled: Boolean(shopId),
    staleTime: 5 * 60 * 1000,
  });

  const summary = summaryQuery.data;

  const emailInfoMutation = useMutation({
    mutationFn: () => emailAccountPortalLink(shopId as string),
    onSuccess: () => toastSuccess("Check your inbox — we've sent your account info."),
    onError: (error: unknown) => toastError(getApiErrorMessage(error, "Unable to send the email. Please try again.")),
  });

  return (
    <ScreenContainer>
      <View style={ui.card}>
        <Text style={styles.title}>Subscription Summary</Text>
        <Text style={styles.meta}>Shop: {activeShop?.shopName ?? "-"}</Text>

        {summaryQuery.isLoading ? <Skeleton height={20} width="80%" /> : null}
        {summary ? (
          <>
            <Text style={styles.meta}>Plan: {summary.planName || "-"}</Text>
            <Text style={styles.meta}>Status: {summary.status}</Text>
            <Text style={styles.meta}>Billing Cycle: {summary.billingCycle}</Text>
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
                <Pressable
                  style={styles.featuresHeader}
                  onPress={() => setFeaturesOpen((open) => !open)}
                  accessibilityRole="button"
                  accessibilityLabel={`${featuresOpen ? "Hide" : "Show"} included features`}
                >
                  <Text style={styles.featuresHeading}>Included features ({summary.includedFeatures.length})</Text>
                  <Ionicons
                    name={featuresOpen ? "chevron-up" : "chevron-down"}
                    size={18}
                    color={appTheme.colors.textMuted}
                  />
                </Pressable>
                {featuresOpen ? (
                  <View style={styles.featuresList}>
                    {summary.includedFeatures.map((feature) => (
                      <Text key={feature} style={styles.featureBullet}>• {feature}</Text>
                    ))}
                  </View>
                ) : null}
              </View>
            ) : null}
          </>
        ) : null}

        {/* Apple's rules don't allow changing a web-purchased subscription inside the app, so this
            screen is view-only. Mirrors the pattern ChatGPT / Claude / LinkedIn use. */}
        <View style={styles.managedCard}>
          <View style={styles.managedHeader}>
            <Ionicons name="information-circle" size={18} color={appTheme.colors.info} />
            <Text style={styles.managedTitle}>Managed on the web</Text>
          </View>
          <Text style={styles.managedBody}>
            {isAccountOwner
              ? "You can't change your plan inside the app, because your subscription is billed on the web. To upgrade, downgrade, or cancel, manage it in a browser. Tap “Email me my account info” below for a secure link to your billing portal."
              : "You can't change your plan inside the app. Your subscription is managed by your account owner on the web."}
          </Text>
        </View>

        {isAccountOwner && shopId ? (
          <PrimaryButton
            label={emailInfoMutation.isPending ? "Sending…" : "Email me my account info"}
            onPress={() => emailInfoMutation.mutate()}
            disabled={emailInfoMutation.isPending}
          />
        ) : null}
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
  featuresHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  featuresList: {
    gap: 2,
    marginTop: 2,
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
  managedCard: {
    marginTop: appTheme.spacing.xs,
    padding: appTheme.spacing.sm,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    borderColor: appTheme.colors.borderInfoSoft,
    backgroundColor: appTheme.colors.surfaceInfoMuted,
    gap: 4,
  },
  managedHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  managedTitle: {
    ...appTheme.typography.bodyEmphasis,
    color: appTheme.colors.textInfoStrong,
  },
  managedBody: {
    ...appTheme.typography.caption,
    color: appTheme.colors.textInfoStrong,
  },
});
