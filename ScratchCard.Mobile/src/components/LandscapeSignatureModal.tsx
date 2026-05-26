import React, { useRef } from "react";
import { Alert, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import SignatureScreen, { SignatureViewRef } from "react-native-signature-canvas";
import { Ionicons } from "@expo/vector-icons";
import { appTheme } from "../ui/theme";

type Props = {
  visible: boolean;
  title?: string;
  description?: string;
  onClose: () => void;
  onSave: (dataUrl: string) => void;
};

/**
 * Full-screen signature modal that displays the signature pad in landscape orientation
 * even when the device stays in portrait. The user holds the phone normally and gets a
 * wide pen-friendly signing area.
 */
export function LandscapeSignatureModal({ visible, title = "Capture Signature", description, onClose, onSave }: Props) {
  const ref = useRef<SignatureViewRef>(null);
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  // Rotated content is W x H of an unrotated landscape rectangle equal to the screen's H x W.
  const rotatedWidth = screenHeight;
  const rotatedHeight = screenWidth;

  const handleSavePressed = () => {
    ref.current?.readSignature();
  };

  const handleClear = () => {
    ref.current?.clearSignature();
  };

  return (
    <Modal visible={visible} transparent={false} animationType="slide" onRequestClose={onClose}>
      <View style={styles.fullScreen}>
        <View
          style={[
            styles.rotatedContainer,
            {
              width: rotatedWidth,
              height: rotatedHeight,
              left: (screenWidth - rotatedWidth) / 2,
              top: (screenHeight - rotatedHeight) / 2,
            },
          ]}
        >
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{title}</Text>
              {description ? <Text style={styles.subtitle}>{description}</Text> : null}
            </View>
            <Pressable
              style={styles.closeButton}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close signature pad"
            >
              <Ionicons name="close" size={22} color={appTheme.colors.text} />
            </Pressable>
          </View>

          <View style={styles.padWrap}>
            <SignatureScreen
              ref={ref}
              onOK={(value) => {
                onSave(value);
              }}
              onEmpty={() => Alert.alert("Signature required", "Please sign before saving.")}
              autoClear={false}
              descriptionText=""
              webStyle={`
                .m-signature-pad--footer { display: none; margin: 0; }
                .m-signature-pad { box-shadow: none; border: none; }
                body, html { width: 100%; height: 100%; }
                canvas { background: #ffffff; }
              `}
            />
          </View>

          <View style={styles.actionRow}>
            <Pressable style={[styles.actionButton, styles.secondary]} onPress={handleClear}>
              <Text style={styles.secondaryText}>Clear</Text>
            </Pressable>
            <Pressable style={[styles.actionButton, styles.primary]} onPress={handleSavePressed}>
              <Text style={styles.primaryText}>Save Signature</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fullScreen: {
    flex: 1,
    backgroundColor: appTheme.colors.background,
  },
  rotatedContainer: {
    position: "absolute",
    transform: [{ rotate: "90deg" }],
    backgroundColor: appTheme.colors.background,
    padding: appTheme.spacing.md,
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
  actionRow: {
    flexDirection: "row",
    gap: appTheme.spacing.sm,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: appTheme.radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  primary: {
    backgroundColor: appTheme.colors.primary,
  },
  primaryText: {
    color: appTheme.colors.onPrimary,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 18,
  },
  secondary: {
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
});
