import React from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Controller, useForm } from "react-hook-form";
import { ScreenContainer } from "../components/ScreenContainer";
import { PrimaryButton } from "../components/PrimaryButton";
import { ui } from "../ui/primitives";
import { appTheme } from "../ui/theme";
import { useAuth } from "./AuthContext";
import { useState } from "react";

type SignupForm = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  confirmPassword: string;
};

export function CompanySignupScreen() {
  const { signUpWithPassword, isLoading } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const { control, handleSubmit } = useForm<SignupForm>({
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    const email = values.email.trim();
    const firstName = values.firstName.trim();
    const lastName = values.lastName.trim();

    if (!email) {
      Alert.alert("Validation Error", "Email address is required.");
      return;
    }
    if (!values.password || values.password.length < 8) {
      Alert.alert("Validation Error", "Password must be at least 8 characters.");
      return;
    }
    if (values.password !== values.confirmPassword) {
      Alert.alert("Validation Error", "Passwords do not match.");
      return;
    }

    try {
      await signUpWithPassword({
        email,
        password: values.password,
        firstName: firstName || undefined,
        lastName: lastName || undefined,
      });
    } catch (error: any) {
      Alert.alert("Sign up failed", error?.response?.data?.message ?? error?.message ?? "Unable to create account.");
    }
  });

  return (
    <ScreenContainer>
      <View style={ui.card}>
        <View style={styles.header}>
          <Text style={styles.title}>Create Account</Text>
          <Text style={styles.subtitle}>Sign up with email and password. Company and shop setup comes next.</Text>
        </View>

        <Text style={styles.fieldLabel}>First Name (optional)</Text>
        <Controller
          control={control}
          name="firstName"
          render={({ field: { value, onChange } }) => (
            <TextInput
              style={styles.input}
              value={value}
              onChangeText={onChange}
              placeholder="e.g. John"
            />
          )}
        />

        <Text style={styles.fieldLabel}>Last Name (optional)</Text>
        <Controller
          control={control}
          name="lastName"
          render={({ field: { value, onChange } }) => (
            <TextInput
              style={styles.input}
              value={value}
              onChangeText={onChange}
              placeholder="e.g. Smith"
            />
          )}
        />

        <Text style={styles.fieldLabel}>Email Address</Text>
        <Controller
          control={control}
          name="email"
          render={({ field: { value, onChange } }) => (
            <TextInput
              style={styles.input}
              value={value}
              onChangeText={onChange}
              placeholder="e.g. john@company.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          )}
        />

        <Text style={styles.fieldLabel}>Password</Text>
        <Text style={styles.hint}>Minimum 8 characters</Text>
        <Controller
          control={control}
          name="password"
          render={({ field: { value, onChange } }) => (
            <View style={styles.passwordRow}>
              <View style={styles.passwordInputContainer}>
                <TextInput
                  style={styles.passwordInput}
                  value={value}
                  onChangeText={onChange}
                  placeholder="Enter a secure password"
                  secureTextEntry={!showPassword}
                />
                <Pressable
                  style={styles.passwordIconButton}
                  onPress={() => setShowPassword((current) => !current)}
                  disabled={isLoading}
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
          )}
        />

        <Text style={styles.fieldLabel}>Confirm Password</Text>
        <Controller
          control={control}
          name="confirmPassword"
          render={({ field: { value, onChange } }) => (
            <View style={styles.passwordRow}>
              <View style={styles.passwordInputContainer}>
                <TextInput
                  style={styles.passwordInput}
                  value={value}
                  onChangeText={onChange}
                  placeholder="Re-enter your password"
                  secureTextEntry={!showConfirmPassword}
                />
                <Pressable
                  style={styles.passwordIconButton}
                  onPress={() => setShowConfirmPassword((current) => !current)}
                  disabled={isLoading}
                  hitSlop={8}
                >
                  <Ionicons
                    name={showConfirmPassword ? "eye-off-outline" : "eye-outline"}
                    size={20}
                    color={appTheme.colors.textMuted}
                  />
                </Pressable>
              </View>
            </View>
          )}
        />

        <PrimaryButton
          label={isLoading ? "Creating account..." : "Create Account"}
          onPress={() => void onSubmit()}
          disabled={isLoading}
        />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: 4,
  },
  title: {
    color: appTheme.colors.text,
    fontSize: 20,
    lineHeight: 26,
    fontFamily: appTheme.fonts.heading,
  },
  subtitle: {
    color: appTheme.colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: appTheme.fonts.body,
  },
  fieldLabel: {
    color: appTheme.colors.text,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: appTheme.fonts.bodyMedium,
    marginTop: 2,
  },
  hint: {
    color: appTheme.colors.textSubtle,
    fontSize: 11,
    lineHeight: 14,
    fontFamily: appTheme.fonts.body,
    marginTop: -2,
  },
  input: {
    borderWidth: 1,
    borderColor: appTheme.colors.borderStrong,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: 11,
    color: appTheme.colors.text,
    fontSize: 14,
    fontFamily: appTheme.fonts.body,
  },
  passwordRow: {
    width: "100%",
  },
  passwordInputContainer: {
    borderWidth: 1,
    borderColor: appTheme.colors.borderStrong,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    position: "relative",
  },
  passwordInput: {
    width: "100%",
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: 11,
    paddingRight: 44,
    color: appTheme.colors.text,
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
});
