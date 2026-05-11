import React, { useState } from "react";
import { Alert, StyleSheet, Text, TextInput, View } from "react-native";
import { createCompany } from "../api/companiesApi";
import { useAuth } from "./AuthContext";
import { ScreenContainer } from "../components/ScreenContainer";
import { PrimaryButton } from "../components/PrimaryButton";
import { ui } from "../ui/primitives";
import { appTheme } from "../ui/theme";

export function CompanySetupScreen() {
  const { refreshProfile, isLoading } = useAuth();
  const [companyName, setCompanyName] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  const busy = isLoading || isBusy;

  async function onContinue() {
    if (!companyName.trim()) {
      Alert.alert("Validation", "Company name is required.");
      return;
    }

    setIsBusy(true);
    try {
      await createCompany({
        companyName: companyName.trim(),
        registrationNumber: registrationNumber.trim() || undefined,
      });
      await refreshProfile();
    } catch (error: any) {
      Alert.alert("Company setup failed", error?.response?.data?.message ?? "Unable to create company.");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <ScreenContainer>
      <View style={ui.card}>
        <View style={styles.header}>
          <Text style={styles.title}>Company Setup</Text>
          <Text style={styles.subtitle}>Set up your company details to continue.</Text>
        </View>

        <Text style={styles.fieldLabel}>Company Name</Text>
        <TextInput
          style={styles.input}
          value={companyName}
          onChangeText={setCompanyName}
          placeholder="e.g. Sunrise Retail Ltd"
          editable={!busy}
        />

        <Text style={styles.fieldLabel}>Registration Number (optional)</Text>
        <TextInput
          style={styles.input}
          value={registrationNumber}
          onChangeText={setRegistrationNumber}
          placeholder="e.g. 12345678"
          editable={!busy}
        />

        <PrimaryButton
          label={busy ? "Saving..." : "Continue to Shop Setup"}
          onPress={() => void onContinue()}
          disabled={busy}
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
});
