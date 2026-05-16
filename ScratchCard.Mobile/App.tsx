import React from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DefaultTheme, NavigationContainer, type LinkingOptions } from "@react-navigation/native";
import * as Linking from "expo-linking";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "./src/auth/AuthContext";
import { AppAlertHost, installAppAlertPatch } from "./src/components/AppAlert";
import { RootNavigator } from "./src/navigation/RootNavigator";
import { useAutoSyncBootstrap } from "./src/offline/useAutoSyncBootstrap";
import type { RootStackParamList } from "./src/types/navigation";
import { appTheme } from "./src/ui/theme";

const queryClient = new QueryClient();
installAppAlertPatch();

const navigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: appTheme.colors.background,
    card: appTheme.colors.surface,
    text: appTheme.colors.text,
    primary: appTheme.colors.primary,
    border: appTheme.colors.border,
  },
};

const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [Linking.createURL("/"), "scratchcard://"],
  config: {
    screens: {
      Login: "login",
      CompanySignup: "signup",
      InvitationAccept: {
        path: "invitation/accept",
        parse: {
          token: (value: string) => value,
        },
      },
      ForgotPassword: "forgot-password",
      ResetPassword: "reset-password",
    },
  },
};

function AppShell() {
  useAutoSyncBootstrap();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <NavigationContainer theme={navigationTheme} linking={linking}>
              <RootNavigator />
              <AppAlertHost />
            </NavigationContainer>
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default function App() {
  return <AppShell />;
}
