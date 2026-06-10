import React, { useMemo, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { listSubscriptionPlans } from "../../api/subscriptionApi";
import { Skeleton } from "../../components/Skeleton";
import { BillingCycle } from "../../types/enums";
import { appTheme } from "../../ui/theme";

// Apple Guideline 3.1.3(c): a free B2B companion app billing on the web cannot make
// "calls to action for purchase outside the app." Showing a £ price in-app is the riskiest line
// to cross. We hide prices on iOS only; Android (Google Play permits this pattern openly)
// keeps the price for a clearer UX.
const SHOULD_HIDE_PRICES = Platform.OS === "ios";

function formatFeatureLabel(key: string) {
  // Convert a feature key (e.g. "scratch_card.attachments") into a readable label
  // ("Scratch Card · Attachments"). Falls back to the raw key for unknown shapes.
  if (!key) return key;
  const [group, ...rest] = key.split(".");
  const groupLabel = group
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
  if (rest.length === 0) {
    return groupLabel;
  }
  const detailLabel = rest
    .join(".")
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
  return `${groupLabel} · ${detailLabel}`;
}

type SubscriptionPlanPickerProps = {
  value: string | null;
  onChange: (planId: string) => void;
  disabled?: boolean;
  label?: string;
};

export function SubscriptionPlanPicker({ value, onChange, disabled, label = "Subscription Plan" }: SubscriptionPlanPickerProps) {
  const plansQuery = useQuery({
    queryKey: ["subscription-plans"],
    queryFn: listSubscriptionPlans,
    staleTime: 10 * 60 * 1000,
  });

  const [expandedId, setExpandedId] = useState<string | null>(null);

  const selectablePlans = useMemo(
    () => (plansQuery.data ?? []).filter((plan) => plan.isActive && plan.billingCycle !== BillingCycle.Trial),
    [plansQuery.data]
  );

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.helper}>Choose the plan this shop will activate after the free trial.</Text>

      {plansQuery.isLoading ? (
        <View style={{ gap: 8 }}>
          <Skeleton height={56} radius={appTheme.radius.sm} />
          <Skeleton height={56} radius={appTheme.radius.sm} />
        </View>
      ) : plansQuery.isError ? (
        <Text style={styles.error}>Unable to load plans. Pull to refresh or try again.</Text>
      ) : selectablePlans.length === 0 ? (
        <Text style={styles.helper}>No subscription plans are available. Contact support.</Text>
      ) : (
        selectablePlans.map((plan) => {
          const selected = value === plan.id;
          return (
            <Pressable
              key={plan.id}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`Select ${plan.name} plan`}
              disabled={disabled}
              onPress={() => onChange(plan.id)}
              style={[styles.planCard, selected && styles.planCardSelected, disabled && styles.planCardDisabled]}
            >
              <View style={styles.planHeaderRow}>
                <Text style={styles.planName}>{plan.name}</Text>
                {plan.trialDays > 0 ? (
                  <View style={styles.trialBadge}>
                    <Text style={styles.trialBadgeText}>{plan.trialDays}-day trial</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.meta}>Cycle: {plan.billingCycle}</Text>
              {SHOULD_HIDE_PRICES ? (
                <Text style={styles.priceLine}>See pricing in the billing portal</Text>
              ) : (
                <Text style={styles.priceLine}>GBP {plan.pricePerShop.toFixed(2)} per shop</Text>
              )}
              <Pressable
                onPress={() => setExpandedId((cur) => (cur === plan.id ? null : plan.id))}
                style={styles.detailsToggle}
                accessibilityRole="button"
                accessibilityLabel={expandedId === plan.id ? "Hide plan details" : "Show plan details"}
              >
                <Text style={styles.detailsToggleText}>{expandedId === plan.id ? "Hide details" : "View details"}</Text>
              </Pressable>

              {expandedId === plan.id ? (
                <View>
                  {plan.description ? <Text style={styles.meta}>{plan.description}</Text> : null}

                  <View style={styles.limitsRow}>
                    <View style={styles.limitChip}>
                      <Text style={styles.limitChipText}>
                        {plan.maxUsers == null ? "Unlimited users" : `${plan.maxUsers} users`}
                      </Text>
                    </View>
                    <View style={styles.limitChip}>
                      <Text style={styles.limitChipText}>
                        {plan.reportExportsPerMonth == null
                          ? "Unlimited report exports"
                          : `${plan.reportExportsPerMonth} report exports / month`}
                      </Text>
                    </View>
                  </View>

                  {plan.includedFeatures && plan.includedFeatures.length > 0 ? (
                    <View style={styles.featuresList}>
                      {plan.includedFeatures.map((feature) => (
                        <Text key={feature} style={styles.featureBullet}>• {formatFeatureLabel(feature)}</Text>
                      ))}
                    </View>
                  ) : null}
                </View>
              ) : null}
            </Pressable>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 6,
  },
  label: {
    ...appTheme.typography.subtitle,
    color: appTheme.colors.text,
  },
  helper: {
    ...appTheme.typography.caption,
    color: appTheme.colors.textMuted,
  },
  error: {
    ...appTheme.typography.body,
    color: appTheme.colors.danger,
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
    backgroundColor: appTheme.colors.surfaceBrandSoft,
  },
  planCardDisabled: {
    opacity: 0.6,
  },
  planHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  planName: {
    ...appTheme.typography.bodyEmphasis,
    color: appTheme.colors.text,
  },
  trialBadge: {
    backgroundColor: appTheme.colors.badgeSuccessBg,
    borderRadius: appTheme.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: appTheme.colors.badgeSuccessBorder,
  },
  trialBadgeText: {
    ...appTheme.typography.caption,
    color: appTheme.colors.textSuccessStrong,
  },
  meta: {
    ...appTheme.typography.caption,
    color: appTheme.colors.textMuted,
  },
  priceLine: {
    ...appTheme.typography.bodyEmphasis,
    color: appTheme.colors.text,
  },
  detailsToggle: {
    marginTop: 6,
    alignSelf: "flex-start",
  },
  detailsToggleText: {
    color: appTheme.colors.primary,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
  },
  limitsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 4,
  },
  limitChip: {
    backgroundColor: appTheme.colors.surfaceInfoMuted,
    borderRadius: appTheme.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  limitChipText: {
    ...appTheme.typography.caption,
    color: appTheme.colors.textInfoStrong,
  },
  featuresList: {
    marginTop: 4,
    gap: 2,
  },
  featureBullet: {
    ...appTheme.typography.caption,
    color: appTheme.colors.text,
  },
});
