import React, { useEffect, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { FloatingLabelInput } from "../../components/FloatingLabelInput";
import { ScreenContainer } from "../../components/ScreenContainer";
import { PrimaryButton } from "../../components/PrimaryButton";
import { acceptInvitation, validateInvitation } from "../../api/authApi";
import { RootStackParamList } from "../../types/navigation";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";

type Props = NativeStackScreenProps<RootStackParamList, "InvitationAccept">;

type ValidationState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "valid"; email: string; roleName: string; accountExists: boolean }
  | { status: "invalid"; message: string };

function describeAcceptError(error: any): string {
  const data = error?.response?.data;
  if (data) {
    return data.message ?? data.Message ?? `Server error (${error.response.status}).`;
  }
  if (error?.code === "ECONNABORTED" || /timeout/i.test(error?.message ?? "")) {
    return "The server took too long to respond. Please check your connection and try again.";
  }
  return `Could not reach the server. ${error?.message ?? "Please check your connection and try again."}`;
}

export function InvitationAcceptanceScreen({ route, navigation }: Props) {
  const [token, setToken] = useState(route.params?.token ?? "");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [validation, setValidation] = useState<ValidationState>({ status: "idle" });

  useEffect(() => {
    const incomingToken = route.params?.token?.trim();
    if (incomingToken && incomingToken.length > 0) {
      setToken(incomingToken);
    }
  }, [route.params?.token]);

  // Validate the token (debounced) so we can tailor the flow: an existing account just joins the
  // new shop, while a brand-new person sets up their name + password.
  useEffect(() => {
    const trimmed = token.trim();
    if (!trimmed) {
      setValidation({ status: "idle" });
      return;
    }

    let cancelled = false;
    setValidation({ status: "loading" });
    const handle = setTimeout(async () => {
      try {
        const result = await validateInvitation(trimmed);
        if (cancelled) return;
        setValidation({
          status: "valid",
          email: result.email,
          roleName: result.roleName,
          accountExists: result.accountExists,
        });
      } catch (error) {
        if (cancelled) return;
        setValidation({ status: "invalid", message: describeAcceptError(error) });
      }
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [token]);

  const isExistingAccount = validation.status === "valid" && validation.accountExists;
  const isNewUser = validation.status === "valid" && !validation.accountExists;

  async function onAccept() {
    if (validation.status !== "valid") {
      Alert.alert("Validation", "Enter a valid invitation token first.");
      return;
    }

    if (isNewUser) {
      if (!firstName.trim()) return Alert.alert("Validation", "First name is required.");
      if (!lastName.trim()) return Alert.alert("Validation", "Last name is required.");
      if (!password || password.length < 8) return Alert.alert("Validation", "Password must be at least 8 characters.");
      if (password !== confirmPassword) return Alert.alert("Validation", "Passwords do not match.");
    }

    setIsBusy(true);
    try {
      await acceptInvitation(
        isExistingAccount
          ? { token: token.trim() }
          : { token: token.trim(), firstName: firstName.trim(), lastName: lastName.trim(), password },
      );

      const message = isExistingAccount
        ? "You've been added to the shop. Sign in with your existing email and password."
        : "Your account is ready. Please sign in with your email and the password you just set.";

      Alert.alert(
        "Invitation accepted",
        message,
        [
          {
            text: "Go to Sign In",
            onPress: () => navigation.reset({ index: 0, routes: [{ name: "Login" }] }),
          },
        ],
        { cancelable: false },
      );
    } catch (error: any) {
      Alert.alert("Failed", describeAcceptError(error));
    } finally {
      setIsBusy(false);
    }
  }

  const acceptLabel = isBusy
    ? "Accepting..."
    : isExistingAccount
      ? "Accept & Join Shop"
      : "Accept Invitation";

  return (
    <ScreenContainer>
      <View style={ui.card}>
        <Text style={styles.title}>Accept Invitation</Text>

        <FloatingLabelInput label="Invitation token" value={token} onChangeText={setToken} editable={!isBusy} />

        {validation.status === "loading" ? (
          <Text style={styles.subtitle}>Checking invitation…</Text>
        ) : null}

        {validation.status === "invalid" ? (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>{validation.message}</Text>
          </View>
        ) : null}

        {isExistingAccount ? (
          <>
            <Text style={styles.subtitle}>
              This invitation is for <Text style={styles.strong}>{validation.email}</Text> to join as{" "}
              <Text style={styles.strong}>{validation.roleName}</Text>.
            </Text>
            <Text style={styles.subtitle}>
              You already have an account. Accept to join this shop, then sign in with your existing password.
            </Text>
          </>
        ) : null}

        {isNewUser ? (
          <>
            <Text style={styles.subtitle}>Set up your account to join as {validation.roleName}.</Text>
            <FloatingLabelInput label="First name" value={firstName} onChangeText={setFirstName} editable={!isBusy} />
            <FloatingLabelInput label="Last name" value={lastName} onChangeText={setLastName} editable={!isBusy} />
            <FloatingLabelInput
              label="Password (min 8 characters)"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              editable={!isBusy}
            />
            <FloatingLabelInput
              label="Confirm password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              editable={!isBusy}
            />
          </>
        ) : null}

        <PrimaryButton
          label={acceptLabel}
          onPress={() => void onAccept()}
          disabled={isBusy || validation.status !== "valid"}
        />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: {
    color: appTheme.colors.text,
    fontSize: 20,
    lineHeight: 24,
    fontFamily: appTheme.fonts.heading,
  },
  subtitle: {
    color: appTheme.colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: appTheme.fonts.body,
  },
  strong: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
  },
  banner: {
    backgroundColor: appTheme.colors.surfaceMuted,
    borderRadius: appTheme.radius.sm,
    padding: 12,
  },
  bannerText: {
    color: appTheme.colors.danger,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: appTheme.fonts.body,
  },
});
