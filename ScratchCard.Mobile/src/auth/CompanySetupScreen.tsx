import React, { useRef, useState } from "react";
import { Alert, StyleSheet, Text, TextInput, View } from "react-native";
import { createCompany } from "../api/companiesApi";
import { useAuth } from "./AuthContext";
import { FloatingLabelInput } from "../components/FloatingLabelInput";
import { ScreenContainer } from "../components/ScreenContainer";
import { PrimaryButton } from "../components/PrimaryButton";
import { ui } from "../ui/primitives";
import { appTheme } from "../ui/theme";

export function CompanySetupScreen() {
  const { refreshProfile, isLoading } = useAuth();
  const [companyName, setCompanyName] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [progressMessage, setProgressMessage] = useState<string | null>(null);
  const [companyNameError, setCompanyNameError] = useState<string | null>(null);
  const registrationNumberRef = useRef<TextInput>(null);

  const busy = isLoading || isBusy;

  async function onContinue() {
    if (!companyName.trim()) {
      setCompanyNameError("Company name is required.");
      return;
    }

    setIsBusy(true);
    try {
      // setProgressMessage("Creating company...");
      await createCompany({
        companyName: companyName.trim(),
        registrationNumber: registrationNumber.trim() || undefined,
      });
      // setProgressMessage("Loading company details...");
      await refreshProfile();
    } catch (error: any) {
      Alert.alert("Company setup failed", error?.response?.data?.message ?? "Unable to create company.");
    } finally {
      setProgressMessage(null);
      setIsBusy(false);
    }
  }

  return (
    <ScreenContainer>
      <View style={ui.card}>
        <View style={styles.header}>
          <Text style={styles.title}>Company Setup</Text>
          {/* <Text style={styles.subtitle}>Set up your company details to continue.</Text> */}
        </View>

        <FloatingLabelInput
          label="Company name"
          value={companyName}
          onChangeText={(t) => {
            setCompanyName(t);
            if (companyNameError) setCompanyNameError(null);
          }}
          underlineColorAndroid="transparent"
          editable={!busy}
          autoCapitalize="words"
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => registrationNumberRef.current?.focus()}
          error={companyNameError}
        />

        <FloatingLabelInput
          ref={registrationNumberRef}
          label="Registration number (optional)"
          value={registrationNumber}
          onChangeText={setRegistrationNumber}
          underlineColorAndroid="transparent"
          editable={!busy}
          autoCapitalize="characters"
          returnKeyType="go"
          onSubmitEditing={() => void onContinue()}
        />

        <PrimaryButton
          label={busy ? progressMessage ?? "Creating company..." : "Continue to Shop Setup"}
          onPress={() => void onContinue()}
          disabled={busy}
        />
        {busy && progressMessage ? <Text style={styles.progressText}>{progressMessage}</Text> : null}
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
  progressText: {
    color: appTheme.colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: appTheme.fonts.body,
    textAlign: "center",
  },
});
