import React, { forwardRef, useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
} from "react-native";
import { appTheme } from "../ui/theme";
import { ModalBackdropBlur } from "./ModalBackdropBlur";

type CountryCode = {
  /** ISO 3166-1 alpha-2 — purely informational; not stored. */
  iso: string;
  dialPrefix: string;
  label: string;
};

/**
 * Curated short-list of countries the app sees today. UK first (default). Order matters: the
 * parser walks this list to split a stored E.164 number into (prefix, rest) and the LONGEST
 * matching prefix wins to avoid e.g. "+1" eating a "+1684" American Samoa number.
 */
const COUNTRY_CODES: ReadonlyArray<CountryCode> = [
  { iso: "GB", dialPrefix: "+44", label: "United Kingdom" },
  { iso: "IE", dialPrefix: "+353", label: "Ireland" },
  { iso: "US", dialPrefix: "+1", label: "United States" },
  { iso: "CA", dialPrefix: "+1", label: "Canada" },
  { iso: "IN", dialPrefix: "+91", label: "India" },
  { iso: "AU", dialPrefix: "+61", label: "Australia" },
  { iso: "NZ", dialPrefix: "+64", label: "New Zealand" },
  { iso: "FR", dialPrefix: "+33", label: "France" },
  { iso: "DE", dialPrefix: "+49", label: "Germany" },
  { iso: "ES", dialPrefix: "+34", label: "Spain" },
  { iso: "IT", dialPrefix: "+39", label: "Italy" },
  { iso: "NL", dialPrefix: "+31", label: "Netherlands" },
  { iso: "PT", dialPrefix: "+351", label: "Portugal" },
  { iso: "PL", dialPrefix: "+48", label: "Poland" },
  { iso: "RO", dialPrefix: "+40", label: "Romania" },
  { iso: "PK", dialPrefix: "+92", label: "Pakistan" },
  { iso: "BD", dialPrefix: "+880", label: "Bangladesh" },
  { iso: "LK", dialPrefix: "+94", label: "Sri Lanka" },
  { iso: "AE", dialPrefix: "+971", label: "United Arab Emirates" },
  { iso: "SA", dialPrefix: "+966", label: "Saudi Arabia" },
  { iso: "ZA", dialPrefix: "+27", label: "South Africa" },
  { iso: "NG", dialPrefix: "+234", label: "Nigeria" },
];

const DEFAULT_DIAL_PREFIX = "+44";

type PhoneNumberInputProps = Omit<TextInputProps, "value" | "onChangeText" | "keyboardType" | "autoCapitalize"> & {
  /** Composed E.164-ish value (e.g. "+447911123456") — empty string when cleared. */
  value: string;
  onChangeText: (composed: string) => void;
  label?: string;
  /** Override the default country (used only when value is empty). Falls back to GB. */
  defaultDialPrefix?: string;
};

/**
 * Splits a stored phone string into (dialPrefix, nationalNumber). Picks the longest matching
 * prefix to handle overlapping codes (e.g. +1 vs +1684). Falls back to UK + raw rest when
 * no prefix matches, so old data that's just digits without country code stays editable.
 */
function splitStoredPhone(stored: string, fallback: string): { dial: string; rest: string } {
  const trimmed = stored.trim();
  if (!trimmed) return { dial: fallback, rest: "" };

  const candidates = [...COUNTRY_CODES]
    .map((c) => c.dialPrefix)
    .filter((prefix) => trimmed.startsWith(prefix))
    .sort((a, b) => b.length - a.length);
  if (candidates.length > 0) {
    const prefix = candidates[0];
    return { dial: prefix, rest: trimmed.slice(prefix.length).trim() };
  }

  // Legacy UK number with a leading 0 (e.g. "07911 123456") — treat as UK national.
  if (trimmed.startsWith("0")) {
    return { dial: "+44", rest: trimmed.slice(1).trim() };
  }

  return { dial: fallback, rest: trimmed };
}

function composeStoredPhone(dial: string, rest: string): string {
  const cleanedRest = rest.trim().replace(/\s+/g, "");
  if (!cleanedRest) return "";
  return `${dial}${cleanedRest}`;
}

/**
 * Phone input with a country-code chip on the left and a national-number input on the right.
 * Tapping the chip opens a modal picker. Defaults to UK when nothing is currently set.
 * Stores the composed value back via onChangeText as a single string ("+44..." or "") so
 * existing form/state shapes don't change.
 */
export const PhoneNumberInput = forwardRef<TextInput, PhoneNumberInputProps>(function PhoneNumberInput(
  { value, onChangeText, label = "Phone (optional)", defaultDialPrefix = DEFAULT_DIAL_PREFIX, editable = true, ...rest },
  ref,
) {
  const { dial, rest: nationalNumber } = useMemo(
    () => splitStoredPhone(value, defaultDialPrefix),
    [value, defaultDialPrefix],
  );
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  function onDialChange(nextDial: string) {
    setIsPickerOpen(false);
    onChangeText(composeStoredPhone(nextDial, nationalNumber));
  }

  function onNationalChange(nextRest: string) {
    onChangeText(composeStoredPhone(dial, nextRest));
  }

  return (
    <View>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.row}>
        <Pressable
          style={[styles.dialChip, !editable ? styles.dialChipDisabled : null]}
          onPress={() => setIsPickerOpen(true)}
          disabled={!editable}
          accessibilityRole="button"
          accessibilityLabel={`Country code, currently ${dial}`}
        >
          <Text style={styles.dialChipText}>{dial}</Text>
        </Pressable>
        <TextInput
          ref={ref}
          {...rest}
          value={nationalNumber}
          onChangeText={onNationalChange}
          keyboardType="phone-pad"
          autoCapitalize="none"
          autoCorrect={false}
          editable={editable}
          placeholder={rest.placeholder ?? "7911 123456"}
          placeholderTextColor={appTheme.colors.textSubtle}
          style={styles.input}
        />
      </View>

      <Modal
        visible={isPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsPickerOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <ModalBackdropBlur />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Select country code</Text>
            <ScrollView style={styles.modalList} contentContainerStyle={styles.modalListContent}>
              {COUNTRY_CODES.map((c) => {
                const selected = c.dialPrefix === dial;
                return (
                  <Pressable
                    key={`${c.iso}-${c.dialPrefix}`}
                    style={[styles.countryRow, selected ? styles.countryRowSelected : null]}
                    onPress={() => onDialChange(c.dialPrefix)}
                  >
                    <Text style={[styles.countryRowText, selected ? styles.countryRowTextSelected : null]}>
                      {c.label}
                    </Text>
                    <Text style={[styles.countryRowDial, selected ? styles.countryRowTextSelected : null]}>
                      {c.dialPrefix}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <Pressable style={styles.modalCloseButton} onPress={() => setIsPickerOpen(false)}>
              <Text style={styles.modalCloseButtonText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
});

const styles = StyleSheet.create({
  label: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.3,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 8,
  },
  dialChip: {
    minWidth: 64,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    borderWidth: 1.5,
    borderColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  dialChipDisabled: {
    opacity: 0.6,
  },
  dialChipText: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 15,
  },
  input: {
    flex: 1,
    backgroundColor: appTheme.colors.surfaceMuted,
    borderRadius: appTheme.radius.sm,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: 12,
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.body,
    fontSize: 15,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: appTheme.colors.overlay,
    justifyContent: "center",
    paddingHorizontal: appTheme.spacing.md,
  },
  modalCard: {
    backgroundColor: appTheme.colors.background,
    borderRadius: appTheme.radius.lg,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    padding: appTheme.spacing.md,
    maxHeight: "75%",
    gap: appTheme.spacing.sm,
  },
  modalTitle: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 16,
    lineHeight: 20,
  },
  modalList: {
    maxHeight: 420,
  },
  modalListContent: {
    gap: 4,
  },
  countryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surface,
    borderWidth: 1,
    borderColor: appTheme.colors.borderSoft,
  },
  countryRowSelected: {
    backgroundColor: appTheme.colors.surfaceBrandSoft,
    borderColor: appTheme.colors.primary,
  },
  countryRowText: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.body,
    fontSize: 14,
    flexShrink: 1,
  },
  countryRowTextSelected: {
    color: appTheme.colors.primary,
    fontFamily: appTheme.fonts.bodyMedium,
  },
  countryRowDial: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 13,
    marginLeft: appTheme.spacing.sm,
  },
  modalCloseButton: {
    alignSelf: "flex-end",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
  },
  modalCloseButtonText: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 14,
  },
});
