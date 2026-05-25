import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../types/navigation";
import { appTheme } from "../../ui/theme";
import { useFeature } from "./useFeature";
import type { EntitlementFeature } from "./entitlements";

type UpgradeNoticeProps = {
  feature: EntitlementFeature;
  title?: string;
  message?: string;
  compact?: boolean;
};

export function UpgradeNotice({ feature, title, message, compact }: UpgradeNoticeProps) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  return (
    <View style={[styles.container, compact && styles.containerCompact]} accessibilityRole="summary">
      <View style={styles.iconBubble}>
        <Ionicons name="lock-closed-outline" size={compact ? 18 : 26} color={appTheme.colors.primary} />
      </View>
      <View style={styles.textWrap}>
        <Text style={[styles.title, compact && styles.titleCompact]}>
          {title ?? "Upgrade required"}
        </Text>
        <Text style={[styles.message, compact && styles.messageCompact]}>
          {message ?? `This feature ("${feature}") isn't included in your current plan. Upgrade this shop's subscription to unlock it.`}
        </Text>
      </View>
      <Pressable
        style={styles.upgradeButton}
        onPress={() => navigation.navigate("ChoosePlan")}
        accessibilityRole="button"
        accessibilityLabel="View subscription plans"
      >
        <Text style={styles.upgradeButtonText}>{compact ? "Upgrade" : "View plans"}</Text>
      </Pressable>
    </View>
  );
}

type FeatureGateProps = {
  feature: EntitlementFeature;
  fallback?: React.ReactNode;
  title?: string;
  message?: string;
  children: React.ReactNode;
};

/**
 * Conditionally renders `children` only when the active shop's subscription includes `feature`.
 * Otherwise renders `fallback` (defaults to an UpgradeNotice). While entitlements load, renders
 * nothing to avoid flashing the upgrade notice.
 */
export function FeatureGate({ feature, fallback, title, message, children }: FeatureGateProps) {
  const { isAllowed, isLoading } = useFeature(feature);
  if (isLoading) return null;
  if (isAllowed) return <>{children}</>;
  if (fallback !== undefined) return <>{fallback}</>;
  return <UpgradeNotice feature={feature} title={title} message={message} />;
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: appTheme.colors.surfaceBrandSoft,
    borderWidth: 1,
    borderColor: appTheme.colors.borderBrandSoft,
    borderRadius: appTheme.radius.md,
    padding: appTheme.spacing.md,
    gap: appTheme.spacing.sm,
    alignItems: "center",
  },
  containerCompact: {
    flexDirection: "row",
    padding: appTheme.spacing.sm,
    gap: 10,
  },
  iconBubble: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: appTheme.colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  textWrap: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  title: {
    ...appTheme.typography.subtitle,
    color: appTheme.colors.text,
    textAlign: "center",
  },
  titleCompact: {
    ...appTheme.typography.bodyEmphasis,
    textAlign: "left",
  },
  message: {
    ...appTheme.typography.body,
    color: appTheme.colors.textMuted,
    textAlign: "center",
  },
  messageCompact: {
    ...appTheme.typography.caption,
    textAlign: "left",
  },
  upgradeButton: {
    backgroundColor: appTheme.colors.primary,
    borderRadius: appTheme.radius.pill,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  upgradeButtonText: {
    ...appTheme.typography.bodyEmphasis,
    color: appTheme.colors.onPrimary,
  },
});
