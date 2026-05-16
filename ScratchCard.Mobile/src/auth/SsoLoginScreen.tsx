import React, { useEffect, useMemo, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as WebBrowser from "expo-web-browser";
import Constants from "expo-constants";
import * as Google from "expo-auth-session/providers/google";
import { resolvedApiBaseUrl } from "../api/client";
import { appInfo } from "../config/appInfo";
import { ScreenContainer } from "../components/ScreenContainer";
import { PrimaryButton } from "../components/PrimaryButton";
import type { RootStackParamList } from "../types/navigation";
import { ui } from "../ui/primitives";
import { appTheme } from "../ui/theme";
import { useAuth } from "./AuthContext";

WebBrowser.maybeCompleteAuthSession();

export function SsoLoginScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { signInWithGoogleToken, signInWithDevBypass, isLoading } = useAuth();
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const isExpoGo = Constants.executionEnvironment === "storeClient";

  const appConfig = useMemo(() => {
    const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string | boolean | undefined>;
    const enableDevAuthBypassRaw = extra.enableDevAuthBypass;
    const parsedBypassName = parseName(typeof extra.devBypassFullName === "string" ? extra.devBypassFullName : undefined);

    return {
      androidClientId: typeof extra.googleAndroidClientId === "string" ? extra.googleAndroidClientId : undefined,
      iosClientId: typeof extra.googleIosClientId === "string" ? extra.googleIosClientId : undefined,
      webClientId: typeof extra.googleWebClientId === "string" ? extra.googleWebClientId : undefined,
      enableDevAuthBypass:
        enableDevAuthBypassRaw === true ||
        (typeof enableDevAuthBypassRaw === "string" && enableDevAuthBypassRaw.toLowerCase() === "true"),
      devBypassEmail: typeof extra.devBypassEmail === "string" ? extra.devBypassEmail : undefined,
      devBypassFirstName:
        typeof extra.devBypassFirstName === "string"
          ? extra.devBypassFirstName
          : parsedBypassName.firstName,
      devBypassLastName:
        typeof extra.devBypassLastName === "string"
          ? extra.devBypassLastName
          : parsedBypassName.lastName,
      devBypassRole: typeof extra.devBypassRole === "string" ? extra.devBypassRole : undefined,
    };
  }, []);

  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    androidClientId: appConfig.androidClientId,
    iosClientId: appConfig.iosClientId,
    webClientId: appConfig.webClientId,
    scopes: ["openid", "profile", "email"],
    selectAccount: true,
  });

  useEffect(() => {
    if (!response) {
      return;
    }

    if (response.type === "error") {
      setIsAuthorizing(false);
      const details =
        response.error?.description ??
        response.error?.params?.error_description ??
        response.error?.params?.error ??
        "Authentication failed.";
      Alert.alert("Google Sign-In Failed", details);
      return;
    }

    if (response.type !== "success") {
      return;
    }

    const idToken = response.authentication?.idToken ?? response.params.id_token;
    if (!idToken) {
      setIsAuthorizing(false);
      Alert.alert("Google Sign-In Failed", "Google response did not include an ID token.");
      return;
    }

    void (async () => {
      try {
        await signInWithGoogleToken(idToken);
      } catch (error: any) {
        Alert.alert("Login failed", error?.response?.data?.message ?? "Unable to sign in.");
      } finally {
        setIsAuthorizing(false);
      }
    })();
  }, [response, signInWithGoogleToken]);

  async function onGoogleSignIn() {
    if (isExpoGo) {
      Alert.alert(
        "Google SSO requires a dev build",
        "This app is running in Expo Go, which uses exp:// redirect URIs that Google blocks. Build and open the app as a development client, then try again."
      );
      return;
    }

    if (!appConfig.androidClientId || !appConfig.iosClientId || !appConfig.webClientId) {
      Alert.alert(
        "Configuration missing",
        "googleAndroidClientId, googleIosClientId, and googleWebClientId must be configured in app.json extra."
      );
      return;
    }

    if (!request) {
      Alert.alert("Not ready", "Google auth request is still initializing.");
      return;
    }

    setIsAuthorizing(true);
    await promptAsync();
  }

  async function onDevBypassSignIn() {
    if (!appConfig.enableDevAuthBypass) {
      return;
    }

    setIsAuthorizing(true);
    try {
      await signInWithDevBypass({
        email: appConfig.devBypassEmail,
        firstName: appConfig.devBypassFirstName,
        lastName: appConfig.devBypassLastName,
        role: appConfig.devBypassRole,
      });
    } catch (error: any) {
      const status = error?.response?.status;
      const message = error?.response?.data?.message ?? error?.message ?? "Unable to sign in with dev bypass.";
      const details = `${status ? `[${status}] ` : ""}${message}\nAPI: ${resolvedApiBaseUrl}`;
      Alert.alert("Dev login failed", details);
    } finally {
      setIsAuthorizing(false);
    }
  }

  const buttonLabel = isLoading || isAuthorizing ? "Signing in..." : "Continue with Google";
  const showDevBypass = appConfig.enableDevAuthBypass;

  return (
    <ScreenContainer centerContent>
      <View style={[styles.hero, styles.contentBlock]}>
        <Text style={styles.heroTitle}>{appInfo.loginTitle}</Text>
        <Text style={styles.heroSubtitle}>Secure access for shop owners, managers, and cashiers.</Text>
      </View>
      <View style={[ui.card, styles.contentBlock]}>
        <Text style={styles.title}>Sign in with Google</Text>
        <Text style={styles.subtitle}>
          Sign in with your Google account. Access is granted only if your email is linked to an active invited user.
        </Text>
        <PrimaryButton label={buttonLabel} onPress={onGoogleSignIn} disabled={isLoading || isAuthorizing} />
        <PrimaryButton
          label="Sign up your business"
          onPress={() => navigation.navigate("CompanySignup")}
          tone="neutral"
          disabled={isLoading || isAuthorizing}
        />
        {showDevBypass ? (
          <>
            <Text style={styles.devHint}>Bypass Google authentication (enabled by app config).</Text>
            <PrimaryButton
              label={isLoading || isAuthorizing ? "Signing in..." : "Dev Login (Bypass Auth)"}
              onPress={onDevBypassSignIn}
              tone="neutral"
              disabled={isLoading || isAuthorizing}
            />
          </>
        ) : null}
      </View>
    </ScreenContainer>
  );
}

function parseName(value?: string) {
  if (!value?.trim()) {
    return { firstName: undefined, lastName: undefined };
  }

  const trimmed = value.trim();
  const firstSpaceIndex = trimmed.indexOf(" ");
  if (firstSpaceIndex < 0) {
    return { firstName: trimmed, lastName: undefined };
  }

  return {
    firstName: trimmed.slice(0, firstSpaceIndex).trim() || undefined,
    lastName: trimmed.slice(firstSpaceIndex + 1).trim() || undefined,
  };
}

const styles = StyleSheet.create({
  contentBlock: {
    width: "100%",
    maxWidth: 460,
    alignSelf: "center",
  },
  hero: {
    backgroundColor: appTheme.colors.primary,
    borderRadius: appTheme.radius.lg,
    borderWidth: 1,
    borderColor: appTheme.colors.primaryPressed,
    padding: appTheme.spacing.lg,
    gap: 4,
  },
  heroTitle: {
    color: appTheme.colors.onPrimary,
    fontSize: 26,
    lineHeight: 30,
    fontFamily: appTheme.fonts.heading,
  },
  heroSubtitle: {
    color: appTheme.colors.textOnDark,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: appTheme.fonts.body,
  },
  title: { fontSize: 22, lineHeight: 26, color: appTheme.colors.text, fontFamily: appTheme.fonts.heading },
  subtitle: { color: appTheme.colors.textMuted, lineHeight: 20, fontFamily: appTheme.fonts.body },
  devHint: { color: appTheme.colors.warning, lineHeight: 18, fontSize: 12, fontFamily: appTheme.fonts.body },
});

