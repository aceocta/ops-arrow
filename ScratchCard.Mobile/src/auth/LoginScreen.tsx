import React, { useState } from "react";
import { Alert, Image, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Constants from "expo-constants";
import { useMemo } from "react";
import { ScreenContainer } from "../components/ScreenContainer";
import { PrimaryButton } from "../components/PrimaryButton";
import type { RootStackParamList } from "../types/navigation";
import { ui } from "../ui/primitives";
import { appTheme } from "../ui/theme";
import { appInfo } from "../config/appInfo";
import { useAuth } from "./AuthContext";

export function LoginScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { signInWithPassword, signInWithDevBypass, isLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  const appConfig = useMemo(() => {
    const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string | boolean | undefined>;
    const enableDevAuthBypassRaw = extra.enableDevAuthBypass;
    const parsedBypassName = parseName(typeof extra.devBypassFullName === "string" ? extra.devBypassFullName : undefined);
    return {
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

  const busy = isLoading || isBusy;

  async function onSignIn() {
    if (!email.trim()) {
      Alert.alert("Validation", "Email is required.");
      return;
    }
    if (!password) {
      Alert.alert("Validation", "Password is required.");
      return;
    }
    setIsBusy(true);
    try {
      await signInWithPassword({ email: email.trim(), password });
    } catch (error: any) {
      Alert.alert("Sign in failed", error?.response?.data?.message ?? "Invalid email or password.");
    } finally {
      setIsBusy(false);
    }
  }

  async function onDevBypassSignIn() {
    if (!appConfig.enableDevAuthBypass) return;
    setIsBusy(true);
    try {
      await signInWithDevBypass({
        email: appConfig.devBypassEmail,
        firstName: appConfig.devBypassFirstName,
        lastName: appConfig.devBypassLastName,
        role: appConfig.devBypassRole,
      });
    } catch (error: any) {
      Alert.alert("Dev login failed", error?.response?.data?.message ?? "Unable to sign in with dev bypass.");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <ScreenContainer centerContent>
      <View style={[styles.brandSection, styles.contentBlock]}>
        <View style={styles.brandRow}>
          <Image source={require("../../assets/ops-arrow-logo.png")} style={styles.brandLogo} resizeMode="contain" />
          <Text style={styles.brandText}>{appInfo.name}</Text>
        </View>
      </View>
      <View style={[ui.card, styles.contentBlock]}>
        <Text style={styles.title}>Sign In</Text>
        {/* <Text style={styles.subtitle}>Sign in to continue with {appInfo.name}.</Text> */}
        <Text style={styles.fieldLabel}>Email Address</Text>
        <TextInput
          style={ui.input}
          value={email}
          onChangeText={setEmail}
          placeholder="Email address"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          underlineColorAndroid="transparent"
          editable={!busy}
        />
        <Text style={styles.fieldLabel}>Password</Text>
        <View style={styles.passwordRow}>
          <View style={styles.passwordInputContainer}>
            <TextInput
              style={styles.passwordInput}
              value={password}
              onChangeText={setPassword}
              placeholder="Password"
              secureTextEntry={!showPassword}
              underlineColorAndroid="transparent"
              editable={!busy}
            />
            <Pressable
              style={styles.passwordIconButton}
              onPress={() => setShowPassword((current) => !current)}
              disabled={busy}
              hitSlop={8}
            >
              <Ionicons
                name={showPassword ? "eye-off-outline" : "eye-outline"}
                size={20}
                color={appTheme.colors.textMuted}
              />
            </Pressable>
          </View>
        </View>
        <PrimaryButton
          label={busy ? "Signing in..." : "Sign In"}
          onPress={() => void onSignIn()}
          disabled={busy}
        />
        <PrimaryButton
          label="Forgot password?"
          onPress={() => navigation.navigate("ForgotPassword")}
          tone="neutral"
          disabled={busy}
        />
        <PrimaryButton
          label="Create an account"
          onPress={() => navigation.navigate("CompanySignup")}
          tone="neutral"
          disabled={busy}
        />
        {/* {appConfig.enableDevAuthBypass ? (
          <>
            <Text style={styles.devHint}>Dev bypass enabled via app config.</Text>
            <PrimaryButton
              label={busy ? "Signing in..." : "Dev Login (Bypass Auth)"}
              onPress={() => void onDevBypassSignIn()}
              tone="neutral"
              disabled={busy}
            />
          </>
        ) : null} */}
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
  brandSection: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: appTheme.spacing.md,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  brandLogo: {
    width: 60,
    height: 60,
  },
  brandText: {
    color: appTheme.colors.text,
    fontSize: 27,
    fontFamily: appTheme.fonts.bodyMedium,
  },
  title: {
    fontSize: 20,
    lineHeight: 26,
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.heading,
  },
  subtitle: {
    color: appTheme.colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: appTheme.fonts.body,
    marginBottom: 2,
  },
  fieldLabel: {
    color: appTheme.colors.text,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: appTheme.fonts.bodyMedium,
    marginTop: 2,
  },
  passwordRow: {
    width: "100%",
  },
  passwordInputContainer: {
    borderWidth: 0,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    position: "relative",
  },
  passwordInput: {
    width: "100%",
    color: appTheme.colors.text,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: 11,
    paddingRight: 44,
    fontSize: 14,
    fontFamily: appTheme.fonts.body,
  },
  passwordIconButton: {
    position: "absolute",
    right: 10,
    top: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
  },
  devHint: {
    color: appTheme.colors.warning,
    lineHeight: 18,
    fontSize: 12,
    fontFamily: appTheme.fonts.body,
  },
});
