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
  const { signOut } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<BillingRequiredRouteProps>();
  const message = route.params?.message ?? "Your trial has ended. Please choose a subscription plan to continue using the app.";

  return (
    <ScreenContainer>
      <View style={ui.card}>
        <Text style={styles.title}>Billing Required</Text>
        <Text style={styles.message}>{message}</Text>
        <PrimaryButton label="Choose Plan" onPress={() => navigation.navigate("ChoosePlan")} />
        <PrimaryButton label="View Subscription Summary" tone="neutral" onPress={() => navigation.navigate("SubscriptionSummary")} />
        <PrimaryButton label="Logout" tone="neutral" onPress={() => void signOut()} />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: {
    color: appTheme.colors.text,
    fontSize: 22,
    lineHeight: 26,
    fontFamily: appTheme.fonts.heading,
  },
  message: {
    color: appTheme.colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: appTheme.fonts.body,
  },
});
