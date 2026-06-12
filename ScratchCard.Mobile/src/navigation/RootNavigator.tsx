import React, { useEffect } from "react";
import { Text } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../auth/AuthContext";
import { installSubscriptionErrorHandler } from "../features/subscription/subscriptionErrorBus";
import { toastError, toastWarning } from "../components/toast";
import { BootstrapErrorScreen } from "../auth/BootstrapErrorScreen";
import { CompanySignupScreen } from "../auth/CompanySignupScreen";
import { CompanySetupScreen } from "../auth/CompanySetupScreen";
import { SplashLoadingScreen } from "../auth/SplashLoadingScreen";
import { LoginScreen } from "../auth/LoginScreen";
import { ForgotPasswordScreen } from "../auth/ForgotPasswordScreen";
import { ResetPasswordScreen } from "../auth/ResetPasswordScreen";
import { ShopSetupScreen } from "../auth/ShopSetupScreen";
import { getShopSubscriptionSummary } from "../api/subscriptionApi";
import { InvitationAcceptanceScreen } from "../features/invitations/InvitationAcceptanceScreen";
import { BillingRequiredScreen } from "../features/subscription/BillingRequiredScreen";
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
  const { isBootstrapping, isAuthenticated, profile, activeShopId, bootstrapError, retryBootstrap, signOut } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const queryClient = useQueryClient();
  const needsCompanySetup = isAuthenticated && profile?.hasCompanySetup === false;
  const needsShopSetup = isAuthenticated && profile?.hasCompanySetup === true && profile?.hasShopSetup === false;
  // After login, if the user belongs to more than one shop and hasn't got an active shop resolved
  // (no remembered choice), force them to pick. The selector groups shops by company, so this
  // doubles as the company picker when they span multiple companies.
  const needsShopSelection =
    isAuthenticated && !needsCompanySetup && !needsShopSetup && !activeShopId && (profile?.shops?.length ?? 0) > 0;
  const spansMultipleCompanies =
    new Set((profile?.shops ?? []).map((shop) => shop.companyId ?? "none")).size > 1;
  const shouldLoadSubscription = isAuthenticated && !needsCompanySetup && !needsShopSetup && Boolean(activeShopId);

  useEffect(() => {
    installSubscriptionErrorHandler((payload) => {
      // Refresh the cached entitlements so other queries flip to the latest plan state.
      void queryClient.invalidateQueries({ queryKey: ["shop-entitlements"] });
      void queryClient.invalidateQueries({ queryKey: ["shop-subscription-summary"] });
      void queryClient.invalidateQueries({ queryKey: ["shop-subscription-summary-root"] });

      if (payload.kind === "user_seat_limit_reached") {
        toastError(payload.message ?? "This shop has reached its user seat limit.", "Seat limit reached");
        navigation.navigate("SubscriptionSummary");
        return;
      }

      if (payload.kind === "subscription_expired") {
        toastWarning(payload.message ?? "This shop's subscription is no longer active.", "Subscription expired");
        navigation.navigate("BillingRequired", { message: payload.message });
        return;
      }

      // feature_not_in_plan — show the read-only subscription summary for context.
      toastWarning(payload.message ?? "This feature is not in your current plan.", "Feature unavailable");
      navigation.navigate("SubscriptionSummary");
    });

    return () => installSubscriptionErrorHandler(null);
  }, [navigation, queryClient]);

  const subscriptionSummaryQuery = useQuery({
    queryKey: ["shop-subscription-summary-root", activeShopId],
    queryFn: () => getShopSubscriptionSummary(activeShopId as string),
    enabled: shouldLoadSubscription,
    retry: 0,
    staleTime: 5 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  if (isBootstrapping) {
    return <SplashLoadingScreen />;
  }

  if (bootstrapError) {
    return (
      <BootstrapErrorScreen
        message={bootstrapError.message}
        onRetry={() => void retryBootstrap()}
        onSignOut={() => void signOut()}
      />
    );
  }

  const requiresBillingAction = shouldLoadSubscription && Boolean(subscriptionSummaryQuery.data?.requiresBillingAction);
  const billingMessage = subscriptionSummaryQuery.data?.status === "TrialExpired"
    ? "Your free trial has ended. Once a subscription is active, sign in again — or ask your account owner."
    : "This shop's subscription isn't active. Once it's renewed, sign in again — or ask your account owner.";

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: appTheme.colors.background },
        headerTintColor: appTheme.colors.text,
        headerTitleAlign: "left",
        headerTitleStyle: {
          fontFamily: appTheme.fonts.bodyMedium,
          fontSize: 17,
        },
        headerShadowVisible: false,
        headerBackButtonDisplayMode: "minimal",
        contentStyle: { backgroundColor: appTheme.colors.background },
      }}
    >
      {!isAuthenticated ? (
        <>
          <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
          <Stack.Screen name="CompanySignup" component={CompanySignupScreen} options={{ title: "" }} />
        </>
      ) : needsCompanySetup ? (
        <>
          <Stack.Screen name="CompanySetup" component={CompanySetupScreen} options={{ title: "Company Setup" }} />
        </>
      ) : needsShopSetup ? (
        <>
          <Stack.Screen name="ShopSetup" component={ShopSetupScreen} options={{ title: "Shop Setup" }} />
        </>
      ) : needsShopSelection ? (
        <>
          <Stack.Screen
            name="ShopSelection"
            component={ShopSelectorScreen}
            options={{
              title: spansMultipleCompanies ? "Select Company & Shop" : "Select Shop",
              headerRight: () => (
                <Text
                  onPress={() => void signOut()}
                  style={{ color: appTheme.colors.primary, fontFamily: appTheme.fonts.bodyMedium, fontSize: 14 }}
                >
                  Log out
                </Text>
              ),
            }}
          />
        </>
      ) : requiresBillingAction ? (
        <>
          <Stack.Screen
            name="BillingRequired"
            component={BillingRequiredScreen}
            initialParams={{ message: billingMessage }}
            options={{ title: "Subscription" }}
          />
          <Stack.Screen name="SubscriptionSummary" component={SubscriptionSummaryScreen} options={{ title: "Subscription Summary" }} />
        </>
      ) : (
        <>
          <Stack.Screen name="MainTabs" component={MainNavigator} options={{ headerShown: false }} />
          <Stack.Screen name="SubscriptionSummary" component={SubscriptionSummaryScreen} options={{ title: "Subscription Summary" }} />
          <Stack.Screen name="BillingRequired" component={BillingRequiredScreen} options={{ title: "Subscription" }} />
          <Stack.Screen name="ShopSelector" component={ShopSelectorScreen} options={{ title: "Shop Selector" }} />
          <Stack.Screen
            name="BarcodeScanner"
            component={BarcodeScannerScreen}
            options={{
              title: "Scan Barcode",
              presentation: "fullScreenModal",
              headerShown: false,
            }}
          />
          <Stack.Screen name="PendingSync" component={PendingSyncScreen} options={{ title: "Pending Sync" }} />
          <Stack.Screen name="SyncConflict" component={SyncConflictScreen} options={{ title: "Sync Conflict" }} />
        </>
      )}
      <Stack.Screen name="InvitationAccept" component={InvitationAcceptanceScreen} options={{ title: "Accept Invitation" }} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} options={{ title: "" }} />
      <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} options={{ title: "" }} />
    </Stack.Navigator>
  );
}
