import React, { useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { createShop } from "../api/shopsApi";
import { useAuth } from "./AuthContext";
import { FloatingLabelInput } from "../components/FloatingLabelInput";
import { ScreenContainer } from "../components/ScreenContainer";
import { PrimaryButton } from "../components/PrimaryButton";
import { SubscriptionPlanPicker } from "../features/subscription/SubscriptionPlanPicker";
import { ui } from "../ui/primitives";
import { appTheme } from "../ui/theme";
import { SellingOrder } from "../types/enums";

export function ShopSetupScreen() {
  const { profile, refreshProfile, isLoading } = useAuth();
  const [shopName, setShopName] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [city, setCity] = useState("");
  const [postCode, setPostCode] = useState("");
  const [country, setCountry] = useState("UK");
  const [scratchCardDisplayCount, setScratchCardDisplayCount] = useState("24");
  const [packSellingOrder, setPackSellingOrder] = useState<SellingOrder>(SellingOrder.Ascending);
  const [subscriptionPlanId, setSubscriptionPlanId] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [progressMessage, setProgressMessage] = useState<string | null>(null);

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
    const parsedDisplayCount = Number(scratchCardDisplayCount.trim());
    if (!Number.isInteger(parsedDisplayCount) || parsedDisplayCount <= 0) {
      Alert.alert("Validation", "Display count must be a whole number greater than 0.");
      return;
    }
    if (!subscriptionPlanId) {
      Alert.alert("Validation", "Please select a subscription plan for this shop.");
      return;
    }

    setIsBusy(true);
    try {
      // setProgressMessage("Creating shop...");
      const createdShop = await createShop({
        companyId,
        shopName: shopName.trim(),
        addressLine1: addressLine1.trim(),
        addressLine2: addressLine2.trim() || undefined,
        city: city.trim(),
        postCode: postCode.trim(),
        country: country.trim(),
        scratchCardDisplayCount: parsedDisplayCount,
        packSellingOrder,
        subscriptionPlanId,
      });
      // setProgressMessage("Finalizing setup...");
      await refreshProfile(createdShop.id, true);
    } catch (error: any) {
      Alert.alert("Shop setup failed", error?.response?.data?.message ?? "Unable to create shop.");
    } finally {
      setProgressMessage(null);
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

        <FloatingLabelInput
          label="Shop name"
          value={shopName}
          onChangeText={setShopName}
          underlineColorAndroid="transparent"
          editable={!busy}
        />

        <FloatingLabelInput
          label="Address line 1"
          value={addressLine1}
          onChangeText={setAddressLine1}
          underlineColorAndroid="transparent"
          editable={!busy}
        />

        <FloatingLabelInput
          label="Address line 2 (optional)"
          value={addressLine2}
          onChangeText={setAddressLine2}
          underlineColorAndroid="transparent"
          editable={!busy}
        />

        <FloatingLabelInput
          label="City"
          value={city}
          onChangeText={setCity}
          underlineColorAndroid="transparent"
          editable={!busy}
        />

        <FloatingLabelInput
          label="Post code"
          value={postCode}
          onChangeText={setPostCode}
          autoCapitalize="characters"
          underlineColorAndroid="transparent"
          editable={!busy}
        />

        <FloatingLabelInput
          label="Country"
          value={country}
          onChangeText={setCountry}
          underlineColorAndroid="transparent"
          editable={!busy}
        />

        <View style={styles.configSection}>
          <Text style={styles.configTitle}>Pack Configuration</Text>
          <Text style={styles.configSubtitle}>Set the initial selling order and display capacity for this shop.</Text>

          <FloatingLabelInput
            label="Scratch card display count"
            value={scratchCardDisplayCount}
            onChangeText={setScratchCardDisplayCount}
            keyboardType="number-pad"
            underlineColorAndroid="transparent"
            editable={!busy}
          />

          <Text style={styles.fieldLabel}>Pack Selling Order</Text>
          <View style={styles.choiceRow}>
            <Text
              style={[styles.choiceChip, packSellingOrder === SellingOrder.Ascending ? styles.choiceChipSelected : null]}
              onPress={() => setPackSellingOrder(SellingOrder.Ascending)}
            >
              Start From 0
            </Text>
            <Text
              style={[styles.choiceChip, packSellingOrder === SellingOrder.Descending ? styles.choiceChipSelected : null]}
              onPress={() => setPackSellingOrder(SellingOrder.Descending)}
            >
              End To 0
            </Text>
          </View>
        </View>

        <View style={styles.configSection}>
          <SubscriptionPlanPicker
            value={subscriptionPlanId}
            onChange={setSubscriptionPlanId}
            disabled={busy}
          />
        </View>

        <PrimaryButton
          label={busy ? progressMessage ?? "Saving..." : "Finish Setup"}
          onPress={() => void onContinue()}
          disabled={busy || !subscriptionPlanId}
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
  configSection: {
    marginTop: appTheme.spacing.xs,
    borderTopWidth: 1,
    borderTopColor: appTheme.colors.border,
    paddingTop: appTheme.spacing.sm,
    gap: 6,
  },
  configTitle: {
    color: appTheme.colors.text,
    fontSize: 14,
    lineHeight: 18,
    fontFamily: appTheme.fonts.bodyMedium,
  },
  configSubtitle: {
    color: appTheme.colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: appTheme.fonts.body,
  },
  choiceRow: {
    flexDirection: "row",
    gap: appTheme.spacing.xs,
    alignItems: "center",
    flexWrap: "wrap",
  },
  choiceChipText: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 16,
  },
  choiceChip: {
    flex: 1,
    borderRadius: appTheme.radius.pill,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    backgroundColor: appTheme.colors.surfaceMuted,
    color: appTheme.colors.text,
    textAlign: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 16,
  },
  choiceChipSelected: {
    borderColor: appTheme.colors.borderStrong,
    backgroundColor: appTheme.colors.surfaceBrandSoft,
    color: appTheme.colors.primary,
  },
  progressText: {
    color: appTheme.colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: appTheme.fonts.body,
    textAlign: "center",
  },
});
