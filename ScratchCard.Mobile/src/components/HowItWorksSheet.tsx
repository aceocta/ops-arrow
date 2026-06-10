import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PrimaryButton } from "./PrimaryButton";
import { appTheme } from "../ui/theme";

export type HowItWorksStep = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  detail: string;
};

/** Numbered step list — used inline (e.g. an empty-state intro) and inside the help sheet. */
export function HowItWorksSteps({ steps }: { steps: HowItWorksStep[] }) {
  return (
    <View style={styles.stepsWrap}>
      {steps.map((s, i) => (
        <View key={s.title} style={styles.stepRow}>
          <View style={styles.stepNum}><Text style={styles.stepNumText}>{i + 1}</Text></View>
          <Ionicons name={s.icon} size={18} color={appTheme.colors.primary} style={styles.stepIcon} />
          <View style={{ flex: 1 }}>
            <Text style={styles.stepTitle}>{s.title}</Text>
            <Text style={styles.stepDetail}>{s.detail}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

/** Bottom-sheet "how it works" guide, reopened from a (?) button. */
export function HowItWorksSheet({ visible, title, steps, onClose }: {
  visible: boolean; title: string; steps: HowItWorksStep[]; onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={8}><Ionicons name="close" size={22} color={appTheme.colors.text} /></Pressable>
          </View>
          <HowItWorksSteps steps={steps} />
          <PrimaryButton label="Got it" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: appTheme.colors.overlay, justifyContent: "flex-end" },
  sheet: { backgroundColor: appTheme.colors.background, borderTopLeftRadius: appTheme.radius.lg, borderTopRightRadius: appTheme.radius.lg, padding: appTheme.spacing.md, gap: 8 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: appTheme.spacing.sm },
  title: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 17, lineHeight: 22 },
  stepsWrap: { gap: 12, marginTop: 4, marginBottom: 12 },
  stepRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  stepNum: { width: 22, height: 22, borderRadius: 11, backgroundColor: appTheme.colors.surfaceBrandSoft, alignItems: "center", justifyContent: "center" },
  stepNumText: { color: appTheme.colors.primary, fontFamily: appTheme.fonts.bodyMedium, fontSize: 12, lineHeight: 15 },
  stepIcon: { marginTop: 1 },
  stepTitle: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 14, lineHeight: 18 },
  stepDetail: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 12, lineHeight: 16, marginTop: 1 },
});
