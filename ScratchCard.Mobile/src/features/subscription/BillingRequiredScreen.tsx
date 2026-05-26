import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp, NativeStackScreenProps } from "@react-navigation/native-stack";
import { PrimaryButton } from "../../components/PrimaryButton";
import { ScreenContainer } from "../../components/ScreenContainer";
import { useAuth } from "../../auth/AuthContext";
import { RootStackParamList } from "../../types/navigation";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";

type BillingRequiredRouteProps = NativeStackScreenProps<RootStackParamList, "BillingRequired">["route"];

export function BillingRequiredScreen() {
  const { signOut, activeShop } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<BillingRequiredRouteProps>();
  const message =
    route.params?.message ??
    "This shop profile requires an active operational license. Activate this shop via your account billing portal to continue.";

  return (
    <ScreenContainer>
      <View style={ui.card}>
        <Text style={styles.title}>Activation required</Text>
        {activeShop?.shopName ? <Text style={styles.shop}>{activeShop.shopName}</Text> : null}
        <Text style={styles.message}>{message}</Text>

        <PrimaryButton label="Activate via billing portal" onPress={() => navigation.navigate("ChoosePlan")} />
        <PrimaryButton label="View Subscription" tone="neutral" onPress={() => navigation.navigate("SubscriptionSummary")} />
        <PrimaryButton label="Log out" tone="neutral" onPress={() => void signOut()} />

        <Text style={styles.help}>
          Payment is processed securely on the web. Switch back to this shop in the app once payment is confirmed —
          usually within a minute.
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
