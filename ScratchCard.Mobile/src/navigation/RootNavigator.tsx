import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../auth/AuthContext";
import { CompanySignupScreen } from "../auth/CompanySignupScreen";
import { CompanySetupScreen } from "../auth/CompanySetupScreen";
import { SplashLoadingScreen } from "../auth/SplashLoadingScreen";
import { LoginScreen } from "../auth/LoginScreen";
import { ShopSetupScreen } from "../auth/ShopSetupScreen";
import { getSubscriptionSummary } from "../api/subscriptionApi";
import { InvitationAcceptanceScreen } from "../features/invitations/InvitationAcceptanceScreen";
import { BillingRequiredScreen } from "../features/subscription/BillingRequiredScreen";
import { ChoosePlanScreen } from "../features/subscription/ChoosePlanScreen";
import { SubscriptionSummaryScreen } from "../features/subscription/SubscriptionSummaryScreen";
import { BarcodeScannerScreen } from "../features/barcode-scanner/BarcodeScannerScreen";
import { PendingSyncScreen } from "../features/shift-close/PendingSyncScreen";
import { SyncConflictScreen } from "../features/shift-close/SyncConflictScreen";
import { ShopSelectorScreen } from "../features/shops/ShopSelectorScreen";
import { RootStackParamList } from "../types/navigation";
import { appTheme } from "../ui/theme";
import { MainNavigator } from "./MainNavigator";

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const { isLoading, isAuthenticated, profile, activeShop } = useAuth();
  const companyId = profile?.primaryCompanyId ?? activeShop?.companyId;
  const needsCompanySetup = isAuthenticated && profile?.hasCompanySetup === false;
  const needsShopSetup = isAuthenticated && profile?.hasCompanySetup === true && profile?.hasShopSetup === false;
  const shouldLoadSubscription = isAuthenticated && !needsCompanySetup && !needsShopSetup && Boolean(companyId);

  const subscriptionSummaryQuery = useQuery({
    queryKey: ["subscription-summary-root", companyId],
    queryFn: () => getSubscriptionSummary(companyId as string),
    enabled: shouldLoadSubscription,
  });

  if (isLoading || (shouldLoadSubscription && subscriptionSummaryQuery.isLoading)) {
    return <SplashLoadingScreen />;
  }

  const requiresBillingAction = Boolean(subscriptionSummaryQuery.data?.requiresBillingAction);
  const billingMessage = subscriptionSummaryQuery.data?.status === "TrialExpired"
    ? "Your free trial has ended. Please select a monthly or annual subscription to continue."
    : "Your subscription is not active. Please choose a plan to continue using the application.";

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: appTheme.colors.primary },
        headerTintColor: appTheme.colors.onPrimary,
        headerTitleStyle: {
          fontFamily: appTheme.fonts.bodyMedium,
          fontSize: 18,
        },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: appTheme.colors.background },
      }}
    >
      {!isAuthenticated ? (
        <>
          <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
          <Stack.Screen name="CompanySignup" component={CompanySignupScreen} options={{ title: "Create Account" }} />
          <Stack.Screen name="InvitationAccept" component={InvitationAcceptanceScreen} options={{ title: "Accept Invitation" }} />
        </>
      ) : needsCompanySetup ? (
        <>
          <Stack.Screen name="CompanySetup" component={CompanySetupScreen} options={{ title: "Company Setup" }} />
        </>
      ) : needsShopSetup ? (
        <>
          <Stack.Screen name="ShopSetup" component={ShopSetupScreen} options={{ title: "Shop Setup" }} />
        </>
      ) : requiresBillingAction ? (
        <>
          <Stack.Screen
            name="BillingRequired"
            component={BillingRequiredScreen}
            initialParams={{ message: billingMessage }}
            options={{ title: "Billing Required" }}
          />
          <Stack.Screen name="SubscriptionSummary" component={SubscriptionSummaryScreen} options={{ title: "Subscription Summary" }} />
          <Stack.Screen name="ChoosePlan" component={ChoosePlanScreen} options={{ title: "Choose Plan" }} />
        </>
      ) : (
        <>
          <Stack.Screen name="MainTabs" component={MainNavigator} options={{ headerShown: false }} />
          <Stack.Screen name="SubscriptionSummary" component={SubscriptionSummaryScreen} options={{ title: "Subscription Summary" }} />
          <Stack.Screen name="ChoosePlan" component={ChoosePlanScreen} options={{ title: "Choose Plan" }} />
          <Stack.Screen name="BillingRequired" component={BillingRequiredScreen} options={{ title: "Billing Required" }} />
          <Stack.Screen name="ShopSelector" component={ShopSelectorScreen} options={{ title: "Shop Selector" }} />
          <Stack.Screen name="BarcodeScanner" component={BarcodeScannerScreen} options={{ title: "Scan Barcode" }} />
          <Stack.Screen name="PendingSync" component={PendingSyncScreen} options={{ title: "Pending Sync" }} />
          <Stack.Screen name="SyncConflict" component={SyncConflictScreen} options={{ title: "Sync Conflict" }} />
        </>
      )}
    </Stack.Navigator>
  );
}
