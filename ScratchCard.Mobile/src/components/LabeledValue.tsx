import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { appTheme } from "../ui/theme";

type Props = {
  label: string;
  value: string | number;
};

export function LabeledValue({ label, value }: Props) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    paddingVertical: 2,
  },
  label: { color: appTheme.colors.textMuted, fontSize: 14, fontFamily: appTheme.fonts.body },
  value: { color: appTheme.colors.text, fontSize: 14, fontFamily: appTheme.fonts.bodyMedium },
});
