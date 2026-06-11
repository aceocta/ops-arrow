import React, { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PrimaryButton } from "./PrimaryButton";
import { appTheme } from "../ui/theme";

export type HowItWorksStep = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  detail: string;
  /** Optional deeper guidance, revealed when the step is tapped (progressive disclosure).
   *  A string renders as a paragraph; an array renders as bullets. Steps without it
   *  aren't expandable — only add it where there's genuinely more to say. */
  more?: string | string[];
};

/** Numbered step list — used inline (e.g. an empty-state intro) and inside the help sheet.
 *  Steps with `more` content expand in place when tapped (one open at a time). */
export function HowItWorksSteps({ steps }: { steps: HowItWorksStep[] }) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  return (
    <View style={styles.stepsWrap}>
      {steps.map((s, i) => {
        const expandable = s.more != null && (Array.isArray(s.more) ? s.more.length > 0 : s.more.length > 0);
        const expanded = expandable && expandedIndex === i;
        const body = (
          <>
            <View style={styles.stepRow}>
              <View style={styles.stepNum}><Text style={styles.stepNumText}>{i + 1}</Text></View>
              <Ionicons name={s.icon} size={18} color={appTheme.colors.primary} style={styles.stepIcon} />
              <View style={{ flex: 1 }}>
                <Text style={styles.stepTitle}>{s.title}</Text>
                <Text style={styles.stepDetail}>{s.detail}</Text>
              </View>
              {expandable ? (
                <Ionicons
                  name={expanded ? "chevron-up" : "chevron-down"}
                  size={15}
                  color={appTheme.colors.textSubtle}
                  style={styles.stepChevron}
                />
              ) : null}
            </View>
            {expanded ? (
              <View style={styles.stepMore}>
                {(Array.isArray(s.more) ? s.more : [s.more as string]).map((line, lineIdx) => (
                  <View key={lineIdx} style={styles.stepMoreLine}>
                    {Array.isArray(s.more) ? <Text style={styles.stepMoreBullet}>•</Text> : null}
                    <Text style={styles.stepMoreText}>{line}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </>
        );
        if (!expandable) {
          return <View key={s.title}>{body}</View>;
        }
        return (
          <Pressable
            key={s.title}
            onPress={() => setExpandedIndex(expanded ? null : i)}
            style={({ pressed }) => (pressed ? styles.stepPressed : null)}
            accessibilityRole="button"
            accessibilityState={{ expanded }}
            accessibilityLabel={`${s.title}. ${expanded ? "Hide" : "Show"} more detail`}
          >
            {body}
          </Pressable>
        );
      })}
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
          {/* Expanded steps can outgrow small screens — keep the sheet capped and scrollable. */}
          <ScrollView style={styles.stepsScroll} bounces={false}>
            <HowItWorksSteps steps={steps} />
          </ScrollView>
          <PrimaryButton label="Got it" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: appTheme.colors.overlay, justifyContent: "flex-end" },
  sheet: { backgroundColor: appTheme.colors.background, borderTopLeftRadius: appTheme.radius.lg, borderTopRightRadius: appTheme.radius.lg, padding: appTheme.spacing.md, gap: 8, maxHeight: "85%" },
  stepsScroll: { flexGrow: 0 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: appTheme.spacing.sm },
  title: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 17, lineHeight: 22 },
  stepsWrap: { gap: 12, marginTop: 4, marginBottom: 12 },
  stepRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  stepNum: { width: 22, height: 22, borderRadius: 11, backgroundColor: appTheme.colors.surfaceBrandSoft, alignItems: "center", justifyContent: "center" },
  stepNumText: { color: appTheme.colors.primary, fontFamily: appTheme.fonts.bodyMedium, fontSize: 12, lineHeight: 15 },
  stepIcon: { marginTop: 1 },
  stepTitle: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 14, lineHeight: 18 },
  stepDetail: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 12, lineHeight: 16, marginTop: 1 },
  stepChevron: { marginTop: 3 },
  stepPressed: { opacity: 0.7 },
  stepMore: {
    marginTop: 6,
    marginLeft: 32,
    padding: appTheme.spacing.sm,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    gap: 4,
  },
  stepMoreLine: { flexDirection: "row", gap: 6 },
  stepMoreBullet: { color: appTheme.colors.primary, fontSize: 12, lineHeight: 17 },
  stepMoreText: { flex: 1, color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 12, lineHeight: 17 },
});
