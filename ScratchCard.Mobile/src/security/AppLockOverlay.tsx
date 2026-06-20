import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PrimaryButton } from "../components/PrimaryButton";
import { appTheme } from "../ui/theme";
import { useAppLock } from "./AppLockContext";

/**
 * Full-screen overlay shown whenever the app is locked (App Lock on + signed in + returned from
 * background / cold start). It auto-prompts for biometrics/passcode once when it appears, and keeps
 * an Unlock button so the user can retry after cancelling. Rendered above the navigator, so the app
 * UI behind it is never visible while locked.
 */
export function AppLockOverlay() {
  const { locked, biometricLabel, unlock } = useAppLock();
  const [busy, setBusy] = useState(false);
  // Auto-prompt exactly once per lock cycle; cancelling won't loop — the user taps Unlock to retry.
  const promptedForThisLock = useRef(false);

  useEffect(() => {
    if (!locked) {
      promptedForThisLock.current = false;
      return;
    }
    if (promptedForThisLock.current) return;
    promptedForThisLock.current = true;
    void runUnlock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked]);

  async function runUnlock() {
    if (busy) return;
    setBusy(true);
    try {
      await unlock();
    } finally {
      setBusy(false);
    }
  }

  if (!locked) return null;

  return (
    <View style={styles.overlay}>
      <View style={styles.iconWrap}>
        <Ionicons name="lock-closed" size={40} color={appTheme.colors.primary} />
      </View>
      <Text style={styles.title}>Ops Arrow is locked</Text>
      <Text style={styles.subtitle}>
        Unlock with {biometricLabel} or your device passcode to continue.
      </Text>
      <View style={styles.actions}>
        <PrimaryButton
          label={busy ? "Unlocking…" : `Unlock with ${biometricLabel}`}
          icon="finger-print-outline"
          onPress={() => void runUnlock()}
          disabled={busy}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: appTheme.colors.background,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: appTheme.spacing.xl,
    gap: appTheme.spacing.sm,
    // Above the navigator and any modals/toasts.
    zIndex: 9999,
    elevation: 9999,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: appTheme.colors.surfaceBrandSoft,
    marginBottom: appTheme.spacing.xs,
  },
  title: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.heading,
    fontSize: 20,
    lineHeight: 26,
    textAlign: "center",
  },
  subtitle: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.body,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  actions: {
    alignSelf: "stretch",
    marginTop: appTheme.spacing.md,
  },
});
