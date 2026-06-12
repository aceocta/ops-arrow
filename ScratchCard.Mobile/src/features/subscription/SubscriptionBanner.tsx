import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../types/navigation";
import { appTheme } from "../../ui/theme";
import { useEntitlements } from "./useEntitlements";

type Tone = "warning" | "danger";

type BannerSpec = {
  tone: Tone;
  title: string;
  message: string;
  cta: string;
};

function deriveBanner(args: {
  isInTrial: boolean;
  trialDaysRemaining: number | null;
  inGracePeriod: boolean;
  isActive: boolean;
  status: string | null;
}): BannerSpec | null {
  if (args.inGracePeriod) {
    return {
      tone: "danger",
      title: "Payment issue",
      message: "There's a problem with this shop's subscription. Ask your account owner to review it.",
      cta: "View details",
    };
  }

  if (args.isInTrial && args.trialDaysRemaining !== null && args.trialDaysRemaining <= 3) {
    return {
      tone: "warning",
      title: args.trialDaysRemaining <= 0 ? "Trial ends today" : `Trial ends in ${args.trialDaysRemaining} day${args.trialDaysRemaining === 1 ? "" : "s"}`,
      message: "Your trial ends soon. Ask your account owner to keep this shop active.",
      cta: "View details",
    };
  }

  if (!args.isActive && args.status?.toLowerCase() === "trialexpired") {
    return {
      tone: "danger",
      title: "Trial expired",
      message: "This shop's trial has ended. Ask your account owner to renew.",
      cta: "View details",
    };
  }

  return null;
}

export function SubscriptionBanner() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { entitlements } = useEntitlements();

  if (!entitlements) return null;

  const spec = deriveBanner({
    isInTrial: entitlements.isInTrial,
    trialDaysRemaining: entitlements.trialDaysRemaining,
    inGracePeriod: entitlements.inGracePeriod,
    isActive: entitlements.isActive,
    status: entitlements.status,
  });

  if (!spec) return null;

  return (
    <Pressable
      style={[styles.banner, spec.tone === "danger" ? styles.bannerDanger : styles.bannerWarning]}
      onPress={() => navigation.navigate(spec.tone === "danger" ? "BillingRequired" : "SubscriptionSummary")}
      accessibilityRole="button"
      accessibilityLabel={`${spec.title}. ${spec.cta}`}
    >
      <Ionicons
        name={spec.tone === "danger" ? "alert-circle-outline" : "time-outline"}
        size={18}
        color={spec.tone === "danger" ? appTheme.colors.danger : appTheme.colors.warning}
      />
      <View style={styles.textWrap}>
        <Text style={styles.title}>{spec.title}</Text>
        <Text style={styles.message}>{spec.message}</Text>
      </View>
      <Text style={styles.cta}>{spec.cta} ›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: appTheme.radius.sm,
    borderWidth: 1,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: 10,
    marginHorizontal: appTheme.spacing.md,
    marginTop: appTheme.spacing.xs,
  },
  bannerWarning: {
    backgroundColor: appTheme.colors.surfaceWarningSoft,
    borderColor: appTheme.colors.borderWarningSoft,
  },
  bannerDanger: {
    backgroundColor: appTheme.colors.surfaceDangerSoft,
    borderColor: appTheme.colors.borderDangerSoft,
  },
  textWrap: {
    flex: 1,
    gap: 2,
  },
  title: {
    ...appTheme.typography.bodyEmphasis,
    color: appTheme.colors.text,
  },
  message: {
    ...appTheme.typography.caption,
    color: appTheme.colors.textMuted,
  },
  cta: {
    ...appTheme.typography.bodyEmphasis,
    color: appTheme.colors.primary,
  },
});
