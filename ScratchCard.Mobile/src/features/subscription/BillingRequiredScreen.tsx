import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp, NativeStackScreenProps } from "@react-navigation/native-stack";
import { useMutation } from "@tanstack/react-query";
import { emailAccountPortalLink } from "../../api/subscriptionApi";
import { PrimaryButton } from "../../components/PrimaryButton";
import { ScreenContainer } from "../../components/ScreenContainer";
import { toastError, toastSuccess } from "../../components/toast";
import { useAuth } from "../../auth/AuthContext";
import { RootStackParamList } from "../../types/navigation";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";
import { getApiErrorMessage } from "../../utils/apiErrorMessage";

type BillingRequiredRouteProps = NativeStackScreenProps<RootStackParamList, "BillingRequired">["route"];

export function BillingRequiredScreen() {
  const { signOut, activeShop, activeShopId, profile } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<BillingRequiredRouteProps>();
  const message =
    route.params?.message ??
    "This shop's subscription isn't active. Once it's renewed, sign in again — or ask your account owner.";

  // The email endpoint is owner-gated server-side (CompanyOwner / PlatformAdmin), so only show
  // the button to users who can actually use it.
  const isAccountOwner =
    (profile?.roles?.includes("PlatformAdmin") ?? false) || activeShop?.role === "CompanyOwner";

  const emailInfoMutation = useMutation({
    mutationFn: () => emailAccountPortalLink(activeShopId as string),
    onSuccess: () => toastSuccess("Check your inbox — we've sent your account info."),
    onError: (error: unknown) => toastError(getApiErrorMessage(error, "Unable to send the email. Please try again.")),
  });

  return (
    <ScreenContainer>
      <View style={ui.card}>
        <Text style={styles.title}>Subscription inactive</Text>
        {activeShop?.shopName ? <Text style={styles.shop}>{activeShop.shopName}</Text> : null}
        <Text style={styles.message}>{message}</Text>

        {isAccountOwner && activeShopId ? (
          <PrimaryButton
            label={emailInfoMutation.isPending ? "Sending…" : "Email me my account info"}
            onPress={() => emailInfoMutation.mutate()}
            disabled={emailInfoMutation.isPending}
          />
        ) : null}
        {!isAccountOwner ? <Text style={styles.help}>Ask your account owner to renew.</Text> : null}
        <PrimaryButton label="View subscription" tone="neutral" onPress={() => navigation.navigate("SubscriptionSummary")} />
        <PrimaryButton label="Log out" tone="neutral" onPress={() => void signOut()} />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: {
    ...appTheme.typography.title,
    color: appTheme.colors.text,
  },
  shop: {
    ...appTheme.typography.subtitle,
    color: appTheme.colors.textBrandStrong,
  },
  message: {
    ...appTheme.typography.body,
    color: appTheme.colors.textMuted,
  },
  help: {
    ...appTheme.typography.caption,
    color: appTheme.colors.textSubtle,
    marginTop: appTheme.spacing.xs,
  },
});
