import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import { getShopSubscriptionSummary } from "../../api/subscriptionApi";
import { useAuth } from "../../auth/AuthContext";
import { PrimaryButton } from "../../components/PrimaryButton";
import { ScreenContainer } from "../../components/ScreenContainer";
import { Skeleton } from "../../components/Skeleton";
import { RootStackParamList } from "../../types/navigation";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";

function formatDate(value?: string | null) {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
}

export function SubscriptionSummaryScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { activeShop, activeShopId } = useAuth();
  const shopId = activeShopId;

  const summaryQuery = useQuery({
    queryKey: ["shop-subscription-summary", shopId],
    queryFn: () => getShopSubscriptionSummary(shopId as string),
    enabled: Boolean(shopId),
  });

  const summary = summaryQuery.data;

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
        <PrimaryButton label="Choose Plan" onPress={() => navigation.navigate("ChoosePlan")} disabled={!shopId} />
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
});
