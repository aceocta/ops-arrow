import React from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DefaultTheme, NavigationContainer } from "@react-navigation/native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "./src/auth/AuthContext";
import { AppAlertHost, installAppAlertPatch } from "./src/components/AppAlert";
import { RootNavigator } from "./src/navigation/RootNavigator";
import { useAutoSyncBootstrap } from "./src/offline/useAutoSyncBootstrap";
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

function AppShell() {
  useAutoSyncBootstrap();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <NavigationContainer theme={navigationTheme}>
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
