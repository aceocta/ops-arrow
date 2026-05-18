import React from "react";
import { Platform, StyleSheet, View } from "react-native";
import { BlurView } from "expo-blur";
import { appTheme, resolvedColorScheme } from "../ui/theme";

type ModalBackdropBlurProps = {
  intensity?: number;
};

export function ModalBackdropBlur({ intensity = 38 }: ModalBackdropBlurProps) {
  return (
    <>
      <BlurView
        style={StyleSheet.absoluteFill}
        intensity={intensity}
        tint={resolvedColorScheme === "dark" ? "dark" : "light"}
        blurMethod={Platform.OS === "android" ? "dimezisBlurViewSdk31Plus" : undefined}
      />
      <View pointerEvents="none" style={styles.tintLayer} />
    </>
  );
}

const styles = StyleSheet.create({
  tintLayer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: appTheme.colors.overlaySoft,
  },
});
