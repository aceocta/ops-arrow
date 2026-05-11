import React, { useState } from "react";
import { Alert, StyleSheet, Text, TextInput, View } from "react-native";
import { createShop } from "../api/shopsApi";
import { useAuth } from "./AuthContext";
import { ScreenContainer } from "../components/ScreenContainer";
import { PrimaryButton } from "../components/PrimaryButton";
import { ui } from "../ui/primitives";
import { appTheme } from "../ui/theme";

export function ShopSetupScreen() {
  const { profile, refreshProfile, isLoading } = useAuth();
  const [shopName, setShopName] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [city, setCity] = useState("");
  const [postCode, setPostCode] = useState("");
  const [country, setCountry] = useState("UK");
  const [isBusy, setIsBusy] = useState(false);

  const companyId = profile?.primaryCompanyId;
  const busy = isLoading || isBusy;

  async function onContinue() {
    if (!companyId) {
      Alert.alert("Setup required", "Company is not available. Please complete company setup first.");
      return;
    }
    if (!shopName.trim() || !addressLine1.trim() || !city.trim() || !postCode.trim() || !country.trim()) {
      Alert.alert("Validation", "Shop name, address, city, post code, and country are required.");
      return;
    }

    setIsBusy(true);
    try {
      await createShop({
        companyId,
        shopName: shopName.trim(),
        addressLine1: addressLine1.trim(),
        addressLine2: addressLine2.trim() || undefined,
        city: city.trim(),
        postCode: postCode.trim(),
        country: country.trim(),
      });
      await refreshProfile();
    } catch (error: any) {
      Alert.alert("Shop setup failed", error?.response?.data?.message ?? "Unable to create shop.");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <ScreenContainer>
      <View style={ui.card}>
        <View style={styles.header}>
          <Text style={styles.title}>Shop Setup</Text>
          <Text style={styles.subtitle}>Create your first shop to finish onboarding.</Text>
        </View>

        <Text style={styles.fieldLabel}>Shop Name</Text>
        <TextInput
          style={styles.input}
          value={shopName}
          onChangeText={setShopName}
          placeholder="e.g. Main Street Shop"
          editable={!busy}
        />

        <Text style={styles.fieldLabel}>Address Line 1</Text>
        <TextInput
          style={styles.input}
          value={addressLine1}
          onChangeText={setAddressLine1}
          placeholder="e.g. 12 High Street"
          editable={!busy}
        />

        <Text style={styles.fieldLabel}>Address Line 2 (optional)</Text>
        <TextInput
          style={styles.input}
          value={addressLine2}
          onChangeText={setAddressLine2}
          placeholder="e.g. Unit A"
          editable={!busy}
        />

        <Text style={styles.fieldLabel}>City</Text>
        <TextInput
          style={styles.input}
          value={city}
          onChangeText={setCity}
          placeholder="e.g. London"
          editable={!busy}
        />

        <Text style={styles.fieldLabel}>Post Code</Text>
        <TextInput
          style={styles.input}
          value={postCode}
          onChangeText={setPostCode}
          placeholder="e.g. SW1A 1AA"
          autoCapitalize="characters"
          editable={!busy}
        />

        <Text style={styles.fieldLabel}>Country</Text>
        <TextInput
          style={styles.input}
          value={country}
          onChangeText={setCountry}
          placeholder="e.g. UK"
          editable={!busy}
        />

        <PrimaryButton
          label={busy ? "Saving..." : "Finish Setup"}
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
