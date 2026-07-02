import React from "react";
import { StyleSheet, Text } from "react-native";
import { appTheme } from "../ui/theme";

/**
 * Inline validation message shown below a field that has no built-in error slot (raw TextInput,
 * chip selectors, date pickers). Renders nothing when there's no error. Visually matches
 * FloatingLabelInput's own error text so all field types read identically.
 */
export function FieldError({ error }: { error?: string | null }) {
  if (!error) return null;
  return <Text style={styles.text}>{error}</Text>;
}

const styles = StyleSheet.create({
  text: {
    color: appTheme.colors.danger,
    fontFamily: appTheme.fonts.body,
    fontSize: 12,
    marginTop: 4,
    marginLeft: appTheme.spacing.sm,
  },
});
