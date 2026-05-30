import React, { useRef } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Controller, useForm } from "react-hook-form";
import { requestSignupVerificationCode } from "../api/authApi";
import { FloatingLabelInput } from "../components/FloatingLabelInput";
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
  verificationCode: string;
};

const VERIFICATION_CODE_LENGTH = 6;

export function CompanySignupScreen() {
  const { signUpWithPassword, isLoading } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isRequestingCode, setIsRequestingCode] = useState(false);
  const [isCompletingSignup, setIsCompletingSignup] = useState(false);
  const [verificationRequested, setVerificationRequested] = useState(false);
  const [verificationTargetEmail, setVerificationTargetEmail] = useState<string | null>(null);
  const [verificationExpiresOn, setVerificationExpiresOn] = useState<string | null>(null);

  const lastNameRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmPasswordRef = useRef<TextInput>(null);

  const { control, handleSubmit, setValue } = useForm<SignupForm>({
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      password: "",
      confirmPassword: "",
      verificationCode: "",
    },
  });

  function resetVerificationState() {
    setVerificationRequested(false);
    setVerificationTargetEmail(null);
    setVerificationExpiresOn(null);
    setValue("verificationCode", "");
  }

  function validateSignupFields(values: SignupForm) {
    const email = values.email.trim();
    const firstName = values.firstName.trim();
    const lastName = values.lastName.trim();

    if (!email) {
      Alert.alert("Validation Error", "Email address is required.");
      return null;
    }
    if (!firstName || !lastName) {
      Alert.alert("Validation Error", "First name and last name are required.");
      return null;
    }
    if (!values.password || values.password.length < 8) {
      Alert.alert("Validation Error", "Password must be at least 8 characters.");
      return null;
    }
    if (values.password !== values.confirmPassword) {
      Alert.alert("Validation Error", "Passwords do not match.");
      return null;
    }

    return {
      email: email.toLowerCase(),
      firstName,
      lastName,
    };
  }

  const onRequestVerificationCode = handleSubmit(async (values) => {
    const validated = validateSignupFields(values);
    if (!validated) {
      return;
    }

    setIsRequestingCode(true);
    try {
      const response = await requestSignupVerificationCode({
        email: validated.email,
      });
      setVerificationRequested(true);
      setVerificationTargetEmail(validated.email);
      setVerificationExpiresOn(response.expiresOn);
      Alert.alert("Verification Code Sent", `We sent a 6-digit code to ${validated.email}.`);
    } catch (error: any) {
      Alert.alert("Unable to send code", error?.response?.data?.message ?? error?.message ?? "Please try again.");
    } finally {
      setIsRequestingCode(false);
    }
  });

  const onCompleteSignup = handleSubmit(async (values) => {
    const validated = validateSignupFields(values);
    if (!validated) {
      return;
    }

    if (!verificationRequested || !verificationTargetEmail || verificationTargetEmail !== validated.email) {
      Alert.alert("Verification Required", "Request a verification code for this email first.");
      return;
    }

    const verificationCode = values.verificationCode.trim();
    if (!verificationCode) {
      Alert.alert("Validation Error", "Verification code is required.");
      return;
    }

    if (verificationCode.length !== VERIFICATION_CODE_LENGTH || !/^\d+$/.test(verificationCode)) {
      Alert.alert("Validation Error", "Enter a valid 6-digit verification code.");
      return;
    }

    setIsCompletingSignup(true);
    try {
      await signUpWithPassword({
        email: validated.email,
        firstName: validated.firstName,
        lastName: validated.lastName,
        password: values.password,
        verificationCode,
      });
    } catch (error: any) {
      Alert.alert("Sign up failed", error?.response?.data?.message ?? error?.message ?? "Unable to create account.");
    } finally {
      setIsCompletingSignup(false);
    }
  });

  const busy = isLoading || isRequestingCode || isCompletingSignup;
  const expiresHint = verificationExpiresOn
    ? `Code expires at ${new Date(verificationExpiresOn).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`
    : "Check your email for the verification code.";

  return (
    <ScreenContainer>
      <View style={ui.card}>
        <View style={styles.header}>
          <Text style={styles.title}>Create Account</Text>
          <Text style={styles.subtitle}>Step 1 of 3: enter details and verify your email before company setup.</Text>
        </View>

        <Controller
          control={control}
          name="firstName"
          render={({ field: { value, onChange } }) => (
            <FloatingLabelInput
              label="First name"
              value={value}
              onChangeText={onChange}
              underlineColorAndroid="transparent"
              editable={!busy}
              autoCapitalize="words"
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => lastNameRef.current?.focus()}
            />
          )}
        />

        <Controller
          control={control}
          name="lastName"
          render={({ field: { value, onChange } }) => (
            <FloatingLabelInput
              ref={lastNameRef}
              label="Last name"
              value={value}
              onChangeText={onChange}
              underlineColorAndroid="transparent"
              editable={!busy}
              autoCapitalize="words"
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => emailRef.current?.focus()}
            />
          )}
        />

        <Controller
          control={control}
          name="email"
          render={({ field: { value, onChange } }) => (
            <FloatingLabelInput
              ref={emailRef}
              label="Email address"
              value={value}
              onChangeText={(nextValue) => {
                onChange(nextValue);

                if (!verificationRequested || !verificationTargetEmail) {
                  return;
                }

                if (verificationTargetEmail !== nextValue.trim().toLowerCase()) {
                  resetVerificationState();
                }
              }}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              underlineColorAndroid="transparent"
              editable={!busy}
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => passwordRef.current?.focus()}
            />
          )}
        />

        <Text style={styles.hint}>Password: minimum 8 characters</Text>
        <Controller
          control={control}
          name="password"
          render={({ field: { value, onChange } }) => (
            <View style={styles.passwordRow}>
              <View style={styles.passwordInputContainer}>
                <FloatingLabelInput
                  ref={passwordRef}
                  label="Password"
                  value={value}
                  onChangeText={onChange}
                  secureTextEntry={!showPassword}
                  underlineColorAndroid="transparent"
                  editable={!busy}
                  returnKeyType="next"
                  submitBehavior="submit"
                  onSubmitEditing={() => confirmPasswordRef.current?.focus()}
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
          )}
        />

        <Controller
          control={control}
          name="confirmPassword"
          render={({ field: { value, onChange } }) => (
            <View style={styles.passwordRow}>
              <View style={styles.passwordInputContainer}>
                <FloatingLabelInput
                  ref={confirmPasswordRef}
                  label="Confirm password"
                  value={value}
                  onChangeText={onChange}
                  secureTextEntry={!showConfirmPassword}
                  underlineColorAndroid="transparent"
                  editable={!busy}
                  returnKeyType="done"
                />
                <Pressable
                  style={styles.passwordIconButton}
                  onPress={() => setShowConfirmPassword((current) => !current)}
                  disabled={busy}
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

        {!verificationRequested ? (
          <PrimaryButton
            label={isRequestingCode ? "Sending Verification Code..." : "Send Verification Code"}
            onPress={() => void onRequestVerificationCode()}
            disabled={busy}
          />
        ) : (
          <>
            <Text style={styles.hint}>{expiresHint}</Text>
            <Controller
              control={control}
              name="verificationCode"
              render={({ field: { value, onChange } }) => (
                <FloatingLabelInput
                  label="6-digit verification code"
                  value={value}
                  onChangeText={(nextValue) => onChange(nextValue.replace(/\D+/g, ""))}
                  keyboardType="number-pad"
                  maxLength={VERIFICATION_CODE_LENGTH}
                  underlineColorAndroid="transparent"
                  editable={!busy}
                />
              )}
            />

            <PrimaryButton
              label={isCompletingSignup ? "Verifying and Creating Account..." : "Verify Email and Continue"}
              onPress={() => void onCompleteSignup()}
              disabled={busy}
            />

            <View style={styles.secondaryActions}>
              <PrimaryButton
                label={isRequestingCode ? "Resending..." : "Resend Code"}
                onPress={() => void onRequestVerificationCode()}
                disabled={busy}
                tone="neutral"
                size="sm"
              />
              <Pressable
                onPress={() => resetVerificationState()}
                disabled={busy}
                hitSlop={8}
              >
                <Text style={styles.linkText}>Use different email</Text>
              </Pressable>
            </View>
          </>
        )}
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
    borderWidth: 0,
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
  secondaryActions: {
    gap: appTheme.spacing.xs,
    alignItems: "center",
  },
  linkText: {
    color: appTheme.colors.primary,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: appTheme.fonts.bodyMedium,
  },
});
