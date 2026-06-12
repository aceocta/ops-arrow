import React, { useRef, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { createShop } from "../api/shopsApi";
import { useAuth } from "./AuthContext";
import { FloatingLabelInput } from "../components/FloatingLabelInput";
import { ScreenContainer } from "../components/ScreenContainer";
import { PrimaryButton } from "../components/PrimaryButton";
import { SubscriptionPlanPicker } from "../features/subscription/SubscriptionPlanPicker";
import { ShiftTemperatureSetup, ShopSetupExtras } from "../components/ShiftTemperatureSetup";
import { ui } from "../ui/primitives";
import { appTheme } from "../ui/theme";
import { SellingOrder } from "../types/enums";
import { DEFAULT_WEEK_START_DAY, WEEK_START_CHOICES } from "../utils/week";

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
  const [weekStartDay, setWeekStartDay] = useState(DEFAULT_WEEK_START_DAY);
  const [subscriptionPlanId, setSubscriptionPlanId] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [progressMessage, setProgressMessage] = useState<string | null>(null);
  const [shopNameError, setShopNameError] = useState<string | null>(null);
  const [addressLine1Error, setAddressLine1Error] = useState<string | null>(null);
  const [cityError, setCityError] = useState<string | null>(null);
  const [postCodeError, setPostCodeError] = useState<string | null>(null);
  const [countryError, setCountryError] = useState<string | null>(null);
  const [displayCountError, setDisplayCountError] = useState<string | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [planOpen, setPlanOpen] = useState(true);
  const [extras, setExtras] = useState<ShopSetupExtras>({ shiftTemplates: [], temperatureCheckTimes: [] });

  const addressLine1Ref = useRef<TextInput>(null);
  const addressLine2Ref = useRef<TextInput>(null);
  const cityRef = useRef<TextInput>(null);
  const postCodeRef = useRef<TextInput>(null);
  const countryRef = useRef<TextInput>(null);

  const companyId = profile?.primaryCompanyId;
  const busy = isLoading || isBusy;

  async function onContinue() {
    if (!companyId) {
      Alert.alert("Setup required", "Company is not available. Please complete company setup first.");
      return;
    }
    let hasError = false;
    if (!shopName.trim()) { setShopNameError("Required."); hasError = true; }
    if (!addressLine1.trim()) { setAddressLine1Error("Required."); hasError = true; }
    if (!city.trim()) { setCityError("Required."); hasError = true; }
    if (!postCode.trim()) { setPostCodeError("Required."); hasError = true; }
    if (!country.trim()) { setCountryError("Required."); hasError = true; }
    const parsedDisplayCount = Number(scratchCardDisplayCount.trim());
    if (!Number.isInteger(parsedDisplayCount) || parsedDisplayCount <= 0) {
      setDisplayCountError("Must be a whole number greater than 0.");
      hasError = true;
    }
    if (!subscriptionPlanId) {
      setPlanError("Please select a subscription plan.");
      hasError = true;
    }
    if (hasError) return;

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
        weekStartDay,
        // Validation above already early-exits when this is null.
        subscriptionPlanId: subscriptionPlanId!,
        shiftTemplates: extras.shiftTemplates,
        temperatureCheckTimes: extras.temperatureCheckTimes,
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
          onChangeText={(t) => { setShopName(t); if (shopNameError) setShopNameError(null); }}
          underlineColorAndroid="transparent"
          editable={!busy}
          autoCapitalize="words"
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => addressLine1Ref.current?.focus()}
          error={shopNameError}
        />

        <FloatingLabelInput
          ref={addressLine1Ref}
          label="Address line 1"
          value={addressLine1}
          onChangeText={(t) => { setAddressLine1(t); if (addressLine1Error) setAddressLine1Error(null); }}
          underlineColorAndroid="transparent"
          editable={!busy}
          autoCapitalize="words"
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => addressLine2Ref.current?.focus()}
          error={addressLine1Error}
        />

        <FloatingLabelInput
          ref={addressLine2Ref}
          label="Address line 2 (optional)"
          value={addressLine2}
          onChangeText={setAddressLine2}
          underlineColorAndroid="transparent"
          editable={!busy}
          autoCapitalize="words"
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => cityRef.current?.focus()}
        />

        <FloatingLabelInput
          ref={cityRef}
          label="City"
          value={city}
          onChangeText={(t) => { setCity(t); if (cityError) setCityError(null); }}
          underlineColorAndroid="transparent"
          editable={!busy}
          autoCapitalize="words"
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => postCodeRef.current?.focus()}
          error={cityError}
        />

        <FloatingLabelInput
          ref={postCodeRef}
          label="Post code"
          value={postCode}
          onChangeText={(t) => { setPostCode(t); if (postCodeError) setPostCodeError(null); }}
          autoCapitalize="characters"
          underlineColorAndroid="transparent"
          editable={!busy}
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => countryRef.current?.focus()}
          error={postCodeError}
        />

        <FloatingLabelInput
          ref={countryRef}
          label="Country"
          value={country}
          onChangeText={(t) => { setCountry(t); if (countryError) setCountryError(null); }}
          underlineColorAndroid="transparent"
          editable={!busy}
          autoCapitalize="words"
          returnKeyType="done"
          error={countryError}
        />

        <View style={styles.configSection}>
          <Text style={styles.configTitle}>Pack Configuration</Text>
          <Text style={styles.configSubtitle}>Set the initial selling order and display capacity for this shop.</Text>

          <FloatingLabelInput
            label="Scratch card display count"
            value={scratchCardDisplayCount}
            onChangeText={(t) => { setScratchCardDisplayCount(t); if (displayCountError) setDisplayCountError(null); }}
            keyboardType="number-pad"
            underlineColorAndroid="transparent"
            editable={!busy}
            error={displayCountError}
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
          <Text style={styles.configTitle}>Week starts on</Text>
          <Text style={styles.configSubtitle}>Rota weeks and weekly reports run from this day.</Text>
          <View style={styles.dayChipRow}>
            {WEEK_START_CHOICES.map((choice) => {
              const selected = weekStartDay === choice.value;
              return (
                <Pressable
                  key={choice.value}
                  style={({ pressed }) => [
                    styles.dayChip,
                    selected ? styles.dayChipSelected : null,
                    pressed ? styles.dayChipPressed : null,
                  ]}
                  onPress={() => setWeekStartDay(choice.value)}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`Week starts on ${choice.label}`}
                >
                  <Text style={[styles.dayChipText, selected ? styles.dayChipTextSelected : null]}>{choice.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.configSection}>
          <Pressable style={styles.sectionHeader} onPress={() => setPlanOpen((o) => !o)}>
            <View style={{ flex: 1 }}>
              <Text style={styles.configTitle}>Subscription plan</Text>
              {!planOpen ? <Text style={styles.configSubtitle}>{subscriptionPlanId ? "Plan selected" : "Tap to choose a plan"}</Text> : null}
            </View>
            <Ionicons name={planOpen ? "chevron-up" : "chevron-down"} size={18} color={appTheme.colors.textSubtle} />
          </Pressable>
          {planOpen ? (
            <View style={{ marginTop: appTheme.spacing.sm }}>
              <SubscriptionPlanPicker
                value={subscriptionPlanId}
                onChange={(id) => { setSubscriptionPlanId(id); if (planError) setPlanError(null); }}
                disabled={busy}
              />
              {planError ? <Text style={styles.planErrorText}>{planError}</Text> : null}
            </View>
          ) : null}
        </View>

        <ShiftTemperatureSetup onChange={setExtras} />

        <PrimaryButton
          label={busy ? progressMessage ?? "Saving…" : "Finish setup"}
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
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: appTheme.spacing.sm,
  },
  rowEdit: { flexDirection: "row", alignItems: "center", gap: 6 },
  cellInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.body,
    fontSize: 14,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  addRow: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 6 },
  addRowText: { color: appTheme.colors.primary, fontFamily: appTheme.fonts.bodyMedium, fontSize: 13 },
  planErrorText: {
    color: appTheme.colors.danger,
    fontFamily: appTheme.fonts.body,
    fontSize: 12,
    marginTop: 4,
    marginLeft: appTheme.spacing.sm,
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
  dayChipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  dayChip: {
    flex: 1,
    alignItems: "center",
    borderRadius: appTheme.radius.pill,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    backgroundColor: appTheme.colors.surfaceMuted,
    paddingVertical: 8,
  },
  dayChipSelected: {
    borderColor: appTheme.colors.borderStrong,
    backgroundColor: appTheme.colors.surfaceBrandSoft,
  },
  dayChipPressed: {
    opacity: 0.7,
  },
  dayChipText: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 16,
  },
  dayChipTextSelected: {
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
