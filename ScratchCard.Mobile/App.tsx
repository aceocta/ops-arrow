import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DarkTheme, DefaultTheme, NavigationContainer, type LinkingOptions } from "@react-navigation/native";
import * as Linking from "expo-linking";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "./src/auth/AuthContext";
import { ErrorBoundary } from "./src/components/ErrorBoundary";
import { useAutoSyncBootstrap } from "./src/offline/useAutoSyncBootstrap";
import type { RootStackParamList } from "./src/types/navigation";
import { bootstrapThemeModePreference } from "./src/ui/themePreference";
import { initCrashReporter, reportError } from "./src/utils/crashReporter";
import { initAnalytics, track } from "./src/utils/analytics";

type SplashScreenModule = {
  preventAutoHideAsync?: () => Promise<unknown>;
  hideAsync?: () => Promise<unknown>;
};

let SplashScreen: SplashScreenModule | null = null;
try {
  SplashScreen = require("expo-splash-screen") as SplashScreenModule;
  SplashScreen?.preventAutoHideAsync?.().catch(() => {});
} catch {
  SplashScreen = null;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30 * 1000,
      gcTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: 0,
      onError: (error) => {
        reportError(error, { phase: "mutation" });
      },
    },
  },
});

void initCrashReporter();
void initAnalytics();

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
  const [isThemeReady, setIsThemeReady] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        await bootstrapThemeModePreference();
      } catch (error) {
        reportError(error, { phase: "theme-bootstrap" });
      } finally {
        setIsThemeReady(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (isThemeReady) {
      track("app_opened");
      SplashScreen?.hideAsync?.().catch(() => {});
    }
  }, [isThemeReady]);

  const runtimeModules = useMemo(() => {
    if (!isThemeReady) {
      return null;
    }

    const themeModule = require("./src/ui/theme") as typeof import("./src/ui/theme");
    const appAlertModule = require("./src/components/AppAlert") as typeof import("./src/components/AppAlert");
    const rootNavigatorModule = require("./src/navigation/RootNavigator") as typeof import("./src/navigation/RootNavigator");

    return {
      appTheme: themeModule.appTheme,
      resolvedColorScheme: themeModule.resolvedColorScheme,
      AppAlertHost: appAlertModule.AppAlertHost,
      installAppAlertPatch: appAlertModule.installAppAlertPatch,
      RootNavigator: rootNavigatorModule.RootNavigator,
    };
  }, [isThemeReady]);

  useEffect(() => {
    if (!runtimeModules) {
      return;
    }

    runtimeModules.installAppAlertPatch();
  }, [runtimeModules]);

  const navigationTheme = useMemo(() => {
    if (!runtimeModules) {
      return DefaultTheme;
    }

    const baseNavigationTheme = runtimeModules.resolvedColorScheme === "dark" ? DarkTheme : DefaultTheme;
    return {
      ...baseNavigationTheme,
      colors: {
        ...baseNavigationTheme.colors,
        background: runtimeModules.appTheme.colors.background,
        card: runtimeModules.appTheme.colors.surface,
        text: runtimeModules.appTheme.colors.text,
        primary: runtimeModules.appTheme.colors.primary,
        border: runtimeModules.appTheme.colors.border,
      },
    };
  }, [runtimeModules]);

  if (!runtimeModules) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: DefaultTheme.colors.background }}>
            <ActivityIndicator size="large" />
          </View>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ErrorBoundary>
          <QueryClientProvider client={queryClient}>
            <AuthProvider>
              <NavigationContainer theme={navigationTheme} linking={linking}>
                <runtimeModules.RootNavigator />
                <runtimeModules.AppAlertHost />
              </NavigationContainer>
            </AuthProvider>
          </QueryClientProvider>
        </ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default function App() {
  return <AppShell />;
}
