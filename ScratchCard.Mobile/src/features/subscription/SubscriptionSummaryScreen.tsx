import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import { getSubscriptionSummary } from "../../api/subscriptionApi";
import { useAuth } from "../../auth/AuthContext";
import { PrimaryButton } from "../../components/PrimaryButton";
import { ScreenContainer } from "../../components/ScreenContainer";
import { RootStackParamList } from "../../types/navigation";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";

function formatDate(value?: string) {
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
  const { activeShop } = useAuth();
  const companyId = activeShop?.companyId;

  const summaryQuery = useQuery({
    queryKey: ["subscription-summary", companyId],
    queryFn: () => getSubscriptionSummary(companyId as string),
    enabled: Boolean(companyId),
  });

  const summary = summaryQuery.data;

  return (
    <ScreenContainer>
      <View style={ui.card}>
        <Text style={styles.title}>Subscription Summary</Text>
        <Text style={styles.meta}>Company: {activeShop?.companyName ?? "-"}</Text>
        {summaryQuery.isLoading ? <Text style={styles.meta}>Loading summary...</Text> : null}
        {summary ? (
          <>
            <Text style={styles.meta}>Plan: {summary.planName}</Text>
            <Text style={styles.meta}>Status: {summary.status}</Text>
            <Text style={styles.meta}>Billing Cycle: {summary.billingCycle}</Text>
            <Text style={styles.meta}>Active Shops: {summary.activeShopCount}</Text>
            <Text style={styles.meta}>Price Per Shop: GBP {summary.pricePerShop.toFixed(2)}</Text>
            <Text style={styles.meta}>Sub Total: GBP {summary.subTotalAmount.toFixed(2)}</Text>
            <Text style={styles.meta}>Discount: {summary.discountPercentage.toFixed(2)}% (GBP {summary.discountAmount.toFixed(2)})</Text>
            <Text style={styles.meta}>Total: GBP {summary.totalAmount.toFixed(2)}</Text>
            <Text style={styles.meta}>Current Period Ends: {formatDate(summary.currentPeriodEndsOn)}</Text>
            <Text style={styles.meta}>Trial Ends: {formatDate(summary.trialEndsOn)}</Text>
            <Text style={styles.meta}>Trial Days Remaining: {summary.trialDaysRemaining ?? "-"}</Text>
          </>
        ) : null}
        <PrimaryButton label="Choose Plan" onPress={() => navigation.navigate("ChoosePlan")} disabled={!companyId} />
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
});
