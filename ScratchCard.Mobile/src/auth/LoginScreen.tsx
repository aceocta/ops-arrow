import React, { useRef, useState } from "react";
import { Alert, Image, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Constants from "expo-constants";
import { useMemo } from "react";
import { ScreenContainer } from "../components/ScreenContainer";
import { PrimaryButton } from "../components/PrimaryButton";
import { FloatingLabelInput } from "../components/FloatingLabelInput";
import { PasswordInput } from "../components/PasswordInput";
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
  const [isBusy, setIsBusy] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const passwordRef = useRef<TextInput>(null);

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
    let hasError = false;
    if (!email.trim()) {
      setEmailError("Email is required.");
      hasError = true;
    }
    if (!password) {
      setPasswordError("Password is required.");
      hasError = true;
    }
    if (hasError) return;
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
        <Text style={styles.title}>Sign in</Text>
        <FloatingLabelInput
          label="Email address"
          value={email}
          onChangeText={(t) => {
            setEmail(t);
            if (emailError) setEmailError(null);
          }}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="emailAddress"
          autoComplete="email"
          underlineColorAndroid="transparent"
          editable={!busy}
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => passwordRef.current?.focus()}
          error={emailError}
        />
        <PasswordInput
          ref={passwordRef}
          label="Password"
          value={password}
          onChangeText={(t) => {
            setPassword(t);
            if (passwordError) setPasswordError(null);
          }}
          textContentType="password"
          autoComplete="current-password"
          underlineColorAndroid="transparent"
          editable={!busy}
          returnKeyType="go"
          onSubmitEditing={() => void onSignIn()}
          error={passwordError}
        />
        <PrimaryButton
          label={busy ? "Signing in…" : "Sign in"}
          onPress={() => void onSignIn()}
          disabled={busy}
        />
        <Pressable
          accessibilityRole="button"
          style={styles.inlineLink}
          onPress={() => navigation.navigate("ForgotPassword")}
          disabled={busy}
        >
          <Text style={styles.inlineLinkText}>Forgot password?</Text>
        </Pressable>
        <View style={styles.secondaryActionsRow}>
          <Pressable
            accessibilityRole="button"
            style={styles.secondaryActionButton}
            onPress={() => navigation.navigate("CompanySignup")}
            disabled={busy}
          >
            <Ionicons name="person-add-outline" size={16} color={appTheme.colors.textInfoStrong} />
            <Text style={styles.secondaryActionButtonText}>Create account</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            style={styles.secondaryActionButton}
            onPress={() => navigation.navigate("InvitationAccept")}
            disabled={busy}
          >
            <Ionicons name="mail-open-outline" size={16} color={appTheme.colors.textInfoStrong} />
            <Text style={styles.secondaryActionButtonText}>Accept invitation</Text>
          </Pressable>
        </View>
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
  inlineLink: {
    alignSelf: "flex-end",
    paddingVertical: 2,
    paddingHorizontal: 2,
  },
  inlineLinkText: {
    color: appTheme.colors.primary,
    fontSize: 12,
    lineHeight: 15,
    fontFamily: appTheme.fonts.bodyMedium,
  },
  secondaryActionsRow: {
    flexDirection: "row",
    gap: appTheme.spacing.xs,
  },
  secondaryActionButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: appTheme.radius.sm,
    borderWidth: 0,
    backgroundColor: appTheme.colors.surfaceInfoMuted,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  secondaryActionButtonText: {
    color: appTheme.colors.textInfoStrong,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 15,
  },
});
