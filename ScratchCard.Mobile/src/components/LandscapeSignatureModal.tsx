import React, { useEffect, useRef, useState } from "react";
import { Alert, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { SignaturePad, SignaturePadRef } from "./SignaturePad";
import { haptics } from "../utils/haptics";
import { appTheme } from "../ui/theme";

type Props = {
  visible: boolean;
  title?: string;
  description?: string;
  onClose: () => void;
  onSave: (dataUrl: string) => void;
};

/**
 * Full-screen portrait signature capture. Native Skia ink (smooth, low-latency) with a baseline
 * guide, Undo/Clear, Save disabled until signed, and a discard prompt if closed mid-signature.
 * (Kept the historical export name so existing call sites need no change; it's portrait now.)
 */
export function LandscapeSignatureModal({ visible, title = "Capture Signature", description, onClose, onSave }: Props) {
  const padRef = useRef<SignaturePadRef>(null);
  const insets = useSafeAreaInsets();
  const [strokeCount, setStrokeCount] = useState(0);
  const hasInk = strokeCount > 0;

  // Reset to a clean pad each time the sheet opens.
  useEffect(() => {
    if (visible) {
      padRef.current?.clear();
      setStrokeCount(0);
    }
  }, [visible]);

  const handleSave = () => {
    const url = padRef.current?.toDataUrl();
    if (!url) return;
    haptics.success();
    onSave(url);
  };

  const handleClose = () => {
    if (hasInk) {
      Alert.alert("Discard signature?", "Your signature hasn't been saved yet.", [
        { text: "Keep editing", style: "cancel" },
        { text: "Discard", style: "destructive", onPress: onClose },
      ]);
      return;
    }
    onClose();
  };

  return (
    <Modal visible={visible} transparent={false} animationType="slide" onRequestClose={handleClose}>
      <GestureHandlerRootView style={styles.fullScreen}>
        <View style={[styles.page, { paddingTop: insets.top + appTheme.spacing.sm, paddingBottom: insets.bottom + appTheme.spacing.md }]}>
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{title}</Text>
              {description ? <Text style={styles.subtitle}>{description}</Text> : null}
            </View>
            <Pressable
              style={styles.closeButton}
              onPress={handleClose}
              accessibilityRole="button"
              accessibilityLabel="Close signature pad"
            >
              <Ionicons name="close" size={22} color={appTheme.colors.text} />
            </Pressable>
          </View>

          <View style={styles.padWrap}>
            <SignaturePad ref={padRef} onStrokeCountChange={setStrokeCount} />
            {!hasInk ? (
              <View pointerEvents="none" style={styles.guide}>
                <Text style={styles.guideText}>✕ Sign here</Text>
                <View style={styles.baseline} />
              </View>
            ) : null}
          </View>

          <View style={styles.actionRow}>
            <Pressable
              style={[styles.actionButton, styles.secondary, !hasInk ? styles.disabled : null]}
              onPress={() => padRef.current?.undo()}
              disabled={!hasInk}
              accessibilityRole="button"
              accessibilityLabel="Undo last stroke"
            >
              <Ionicons name="arrow-undo-outline" size={16} color={appTheme.colors.text} />
              <Text style={styles.secondaryText}>Undo</Text>
            </Pressable>
            <Pressable
              style={[styles.actionButton, styles.secondary, !hasInk ? styles.disabled : null]}
              onPress={() => {
                padRef.current?.clear();
                setStrokeCount(0);
              }}
              disabled={!hasInk}
              accessibilityRole="button"
              accessibilityLabel="Clear signature"
            >
              <Ionicons name="trash-outline" size={16} color={appTheme.colors.text} />
              <Text style={styles.secondaryText}>Clear</Text>
            </Pressable>
            <Pressable
              style={[styles.actionButton, styles.primary, !hasInk ? styles.disabled : null]}
              onPress={handleSave}
              disabled={!hasInk}
              accessibilityRole="button"
              accessibilityLabel="Save signature"
            >
              <Text style={styles.primaryText}>Save signature</Text>
            </Pressable>
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fullScreen: { flex: 1, backgroundColor: appTheme.colors.background },
  page: {
    flex: 1,
    paddingHorizontal: appTheme.spacing.md,
    gap: appTheme.spacing.sm,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: appTheme.spacing.sm,
  },
  title: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.heading,
    fontSize: 18,
    lineHeight: 22,
  },
  subtitle: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.body,
    fontSize: 13,
    lineHeight: 17,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: appTheme.colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  padWrap: {
    flex: 1,
    borderRadius: appTheme.radius.md,
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: appTheme.colors.border,
  },
  // Faint paper-style guide, shown only while the pad is empty.
  guide: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
    paddingBottom: "16%",
    paddingHorizontal: 24,
  },
  guideText: {
    color: appTheme.colors.textSubtle,
    fontFamily: appTheme.fonts.body,
    fontSize: 13,
    marginBottom: 6,
  },
  baseline: {
    height: 1,
    backgroundColor: appTheme.colors.border,
  },
  actionRow: {
    flexDirection: "row",
    gap: appTheme.spacing.sm,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: appTheme.radius.pill,
  },
  primary: {
    flex: 1.6,
    backgroundColor: appTheme.colors.primary,
  },
  primaryText: {
    color: appTheme.colors.onPrimary,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 18,
  },
  secondary: {
    flex: 1,
    backgroundColor: appTheme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
  },
  secondaryText: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 18,
  },
  disabled: {
    opacity: 0.4,
  },
});
