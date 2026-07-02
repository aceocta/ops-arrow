import React, { useRef } from "react";
import { Alert, Linking, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Controller, useForm, useWatch } from "react-hook-form";
import { requestSignupVerificationCode } from "../api/authApi";
import { FloatingLabelInput } from "../components/FloatingLabelInput";
import { PasswordInput } from "../components/PasswordInput";
import { PhoneNumberInput } from "../components/PhoneNumberInput";
import { ScreenContainer } from "../components/ScreenContainer";
import { PrimaryButton } from "../components/PrimaryButton";
import { useFieldValidation } from "../components/useFieldValidation";
import { toastSuccess } from "../components/toast";
import { ui } from "../ui/primitives";
import { appTheme } from "../ui/theme";
import { useAuth } from "./AuthContext";
import { useState } from "react";

type SignupForm = {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  password: string;
  confirmPassword: string;
  verificationCode: string;
};

const VERIFICATION_CODE_LENGTH = 6;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TERMS_URL = "https://opsarrow.co.uk/terms";
const PRIVACY_URL = "https://opsarrow.co.uk/privacy";

export function CompanySignupScreen() {
  const { signUpWithPassword, isLoading } = useAuth();
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
      phoneNumber: "",
      password: "",
      confirmPassword: "",
      verificationCode: "",
    },
  });

  // Live form values so the client-side rules below recompute every render — that's what lets a
  // touched field's error clear the instant its value becomes valid (the shared hook owns only the
  // reveal *timing*, not the rules).
  const values = useWatch({ control });
  const firstName = values.firstName ?? "";
  const lastName = values.lastName ?? "";
  const email = values.email ?? "";
  const password = values.password ?? "";
  const confirmPassword = values.confirmPassword ?? "";
  const verificationCode = values.verificationCode ?? "";

  // Single errors map covering both steps. Details rules are always active; verificationCode only
  // becomes an active rule once the code step is shown (verificationRequested) — so attemptSubmit on
  // step 1 ("Send code") blocks on the details but never on the not-yet-shown code field, while the
  // code step blocks on both details and the code (mirroring the old two-pass validation).
  const trimmedEmail = email.trim();
  const errors = {
    firstName: firstName.trim().length === 0 ? "Enter your first name." : null,
    lastName: lastName.trim().length === 0 ? "Enter your last name." : null,
    email: !trimmedEmail
      ? "Enter your email address."
      : !EMAIL_PATTERN.test(trimmedEmail)
        ? "Enter a valid email address."
        : null,
    password: !password
      ? "Enter a password."
      : password.length < 8
        ? "Use at least 8 characters."
        : null,
    confirmPassword: !confirmPassword
      ? "Confirm your password."
      : confirmPassword !== password
        ? "Passwords don't match."
        : null,
    verificationCode: !verificationRequested
      ? null
      : /^\d{6}$/.test(verificationCode.trim())
        ? null
        : "Enter the 6-digit code.",
  };
  const v = useFieldValidation(errors);

  function resetVerificationState() {
    setVerificationRequested(false);
    setVerificationTargetEmail(null);
    setVerificationExpiresOn(null);
    setValue("verificationCode", "");
  }

  const onRequestVerificationCode = handleSubmit(async (formValues) => {
    // Inline field-level validation replaces the old Alert.alert checks. On this step the code
    // field's rule is inactive (verificationRequested is false), so it never blocks here.
    if (!v.attemptSubmit()) {
      return;
    }

    const normalizedEmail = formValues.email.trim().toLowerCase();
    setIsRequestingCode(true);
    try {
      const response = await requestSignupVerificationCode({
        email: normalizedEmail,
      });
      setVerificationRequested(true);
      setVerificationTargetEmail(normalizedEmail);
      setVerificationExpiresOn(response.expiresOn);
      toastSuccess(`Verification code sent to ${normalizedEmail}.`);
    } catch (error: any) {
      Alert.alert("Unable to send code", error?.response?.data?.message ?? error?.message ?? "Please try again.");
    } finally {
      setIsRequestingCode(false);
    }
  });

  const onCompleteSignup = handleSubmit(async (formValues) => {
    // Inline field-level validation replaces the old Alert.alert checks. On this step the code
    // field's rule is active (verificationRequested is true), so attemptSubmit also gates the code.
    if (!v.attemptSubmit()) {
      return;
    }

    const normalizedEmail = formValues.email.trim().toLowerCase();
    // State-consistency guard (not a field rule): the code was requested for a *different* email, so
    // it wouldn't match. Keep as an Alert — it's about the flow state, not a single input's value.
    if (!verificationRequested || !verificationTargetEmail || verificationTargetEmail !== normalizedEmail) {
      Alert.alert("Verification Required", "Request a verification code for this email first.");
      return;
    }

    setIsCompletingSignup(true);
    try {
      await signUpWithPassword({
        email: normalizedEmail,
        firstName: formValues.firstName.trim(),
        lastName: formValues.lastName.trim(),
        password: formValues.password,
        verificationCode: formValues.verificationCode.trim(),
        ownerPhoneNumber: formValues.phoneNumber.trim() || undefined,
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
              onBlur={() => v.touch("firstName")}
              error={v.showError("firstName")}
              underlineColorAndroid="transparent"
              editable={!busy}
              autoCapitalize="words"
              textContentType="givenName"
              autoComplete="given-name"
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
              onBlur={() => v.touch("lastName")}
              error={v.showError("lastName")}
              underlineColorAndroid="transparent"
              editable={!busy}
              autoCapitalize="words"
              textContentType="familyName"
              autoComplete="family-name"
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
              onBlur={() => v.touch("email")}
              error={v.showError("email")}
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
            />
          )}
        />

        <Controller
          control={control}
          name="phoneNumber"
          render={({ field: { value, onChange } }) => (
            <PhoneNumberInput
              label="Phone (optional)"
              value={value}
              onChangeText={onChange}
              editable={!busy}
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => passwordRef.current?.focus()}
            />
          )}
        />
        <Text style={styles.hint}>Optional. Add a phone to receive WhatsApp alerts for shift and day-end closures.</Text>

        <Controller
          control={control}
          name="password"
          render={({ field: { value, onChange } }) => (
            <PasswordInput
              ref={passwordRef}
              label="Password (min. 8 characters)"
              value={value}
              onChangeText={onChange}
              onBlur={() => v.touch("password")}
              error={v.showError("password")}
              textContentType="newPassword"
              autoComplete="new-password"
              underlineColorAndroid="transparent"
              editable={!busy}
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => confirmPasswordRef.current?.focus()}
            />
          )}
        />

        <Controller
          control={control}
          name="confirmPassword"
          render={({ field: { value, onChange } }) => (
            <PasswordInput
              ref={confirmPasswordRef}
              label="Confirm password"
              value={value}
              onChangeText={onChange}
              onBlur={() => v.touch("confirmPassword")}
              error={v.showError("confirmPassword")}
              textContentType="newPassword"
              autoComplete="new-password"
              underlineColorAndroid="transparent"
              editable={!busy}
              returnKeyType="done"
            />
          )}
        />

        <Text style={styles.consent}>
          By creating an account, you agree to our{" "}
          <Text style={styles.consentLink} onPress={() => void Linking.openURL(TERMS_URL)}>
            Terms of Service
          </Text>{" "}
          and{" "}
          <Text style={styles.consentLink} onPress={() => void Linking.openURL(PRIVACY_URL)}>
            Privacy Policy
          </Text>
          .
        </Text>

        {!verificationRequested ? (
          <PrimaryButton
            label={isRequestingCode ? "Sending verification code…" : "Send verification code"}
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
                  label="6-digit code"
                  value={value}
                  onChangeText={(nextValue) => onChange(nextValue.replace(/\D+/g, ""))}
                  onBlur={() => v.touch("verificationCode")}
                  error={v.showError("verificationCode")}
                  keyboardType="number-pad"
                  maxLength={VERIFICATION_CODE_LENGTH}
                  textContentType="oneTimeCode"
                  autoComplete="one-time-code"
                  underlineColorAndroid="transparent"
                  editable={!busy}
                />
              )}
            />

            <PrimaryButton
              label={isCompletingSignup ? "Verifying and creating account…" : "Verify email and continue"}
              onPress={() => void onCompleteSignup()}
              disabled={busy}
            />

            <View style={styles.secondaryActions}>
              <PrimaryButton
                label={isRequestingCode ? "Resending…" : "Resend code"}
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
  hint: {
    color: appTheme.colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: appTheme.fonts.body,
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
  consent: {
    color: appTheme.colors.textSubtle,
    fontSize: 12,
    lineHeight: 17,
    fontFamily: appTheme.fonts.body,
    textAlign: "center",
    marginTop: appTheme.spacing.xs,
  },
  consentLink: {
    color: appTheme.colors.primary,
    fontFamily: appTheme.fonts.bodyMedium,
    textDecorationLine: "underline",
  },
});
