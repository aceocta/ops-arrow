import React, { useState } from "react";
import { Alert, StyleSheet, Text, TextInput, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { requestPasswordReset } from "../api/authApi";
import { PrimaryButton } from "../components/PrimaryButton";
import { ScreenContainer } from "../components/ScreenContainer";
import type { RootStackParamList } from "../types/navigation";
import { ui } from "../ui/primitives";
import { appTheme } from "../ui/theme";

export function ForgotPasswordScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [email, setEmail] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  async function onRequestReset() {
    if (!email.trim()) {
      Alert.alert("Validation", "Email is required.");
      return;
    }

    setIsBusy(true);
    try {
      await requestPasswordReset({ email: email.trim() });
      Alert.alert(
        "Check your email",
        "If the account exists, we sent password reset instructions and a token."
      );
      navigation.navigate("ResetPassword");
    } catch (error: any) {
      Alert.alert("Request failed", error?.response?.data?.message ?? "Unable to request password reset.");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <ScreenContainer centerContent>
      <View style={[ui.card, styles.card]}>
        <Text style={styles.title}>Forgot Password</Text>
        <Text style={styles.subtitle}>Enter your account email to receive a reset link and token.</Text>
        <Text style={styles.label}>Email Address</Text>
        <TextInput
          style={ui.input}
          value={email}
          onChangeText={setEmail}
          placeholder="Email address"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!isBusy}
          underlineColorAndroid="transparent"
        />
        <PrimaryButton
          label={isBusy ? "Sending..." : "Send Reset Email"}
          onPress={() => void onRequestReset()}
          disabled={isBusy}
        />
        <PrimaryButton
          label="I already have a token"
          onPress={() => navigation.navigate("ResetPassword")}
          tone="neutral"
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
