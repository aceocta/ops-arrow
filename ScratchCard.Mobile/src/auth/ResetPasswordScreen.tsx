import React, { useEffect, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { resetPassword } from "../api/authApi";
import { FloatingLabelInput } from "../components/FloatingLabelInput";
import { PrimaryButton } from "../components/PrimaryButton";
import { ScreenContainer } from "../components/ScreenContainer";
import type { RootStackParamList } from "../types/navigation";
import { ui } from "../ui/primitives";
import { appTheme } from "../ui/theme";

type Props = NativeStackScreenProps<RootStackParamList, "ResetPassword">;

export function ResetPasswordScreen({ route, navigation }: Props) {
  const [token, setToken] = useState(route.params?.token ?? "");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    if (route.params?.token) {
      setToken(route.params.token);
    }
  }, [route.params?.token]);

  async function onResetPassword() {
    if (!token.trim()) {
      Alert.alert("Validation", "Reset token is required.");
      return;
    }

    if (!newPassword || newPassword.length < 8) {
      Alert.alert("Validation", "Password must be at least 8 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert("Validation", "Passwords do not match.");
      return;
    }

    setIsBusy(true);
    try {
      await resetPassword({
        token: token.trim(),
        newPassword,
      });

      Alert.alert(
        "Password reset",
        "Your password has been updated. Please sign in with your new password.",
        [
          {
            text: "Go to Sign In",
            onPress: () =>
              navigation.reset({
                index: 0,
                routes: [{ name: "Login" }],
              }),
          },
        ],
        { cancelable: false },
      );
    } catch (error: any) {
      Alert.alert("Reset failed", error?.response?.data?.message ?? "Unable to reset password.");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <ScreenContainer centerContent>
      <View style={[ui.card, styles.card]}>
        <Text style={styles.title}>Reset Password</Text>
        <Text style={styles.subtitle}>Use the token from your email to set a new password.</Text>
        <FloatingLabelInput
          label="Reset token"
          value={token}
          onChangeText={setToken}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!isBusy}
          underlineColorAndroid="transparent"
        />
        <FloatingLabelInput
          label="New password (min 8 characters)"
          value={newPassword}
          onChangeText={setNewPassword}
          secureTextEntry
          editable={!isBusy}
          underlineColorAndroid="transparent"
        />
        <FloatingLabelInput
          label="Confirm new password"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
          editable={!isBusy}
          underlineColorAndroid="transparent"
        />
        <PrimaryButton
          label={isBusy ? "Resetting..." : "Reset Password"}
          onPress={() => void onResetPassword()}
          disabled={isBusy}
        />
        <PrimaryButton
          label="Back to Sign In"
          onPress={() => navigation.navigate("Login")}
          tone="neutral"
          disabled={isBusy}
        />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "100%",
    maxWidth: 460,
    alignSelf: "center",
  },
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
  label: {
    color: appTheme.colors.text,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: appTheme.fonts.bodyMedium,
  },
});
