import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { appTheme } from "../ui/theme";
import { ui } from "../ui/primitives";
import { getShiftTemplates } from "../api/rotaApi";
import { listTemperatureSchedules, listTemperatureUnits } from "../api/temperatureLogsApi";
import { listTills } from "../api/tillsApi";

// Per-shop store of step keys the user chose to skip, so a skipped step doesn't reappear on every
// app launch. Versioned in case the step set changes.
const SKIPPED_STORAGE_PREFIX = "getstarted-skipped:v1:";

type Step = { key: string; label: string; done: boolean; route: string; icon: keyof typeof Ionicons.glyphMap };

/**
 * Onboarding checklist for owners/managers — auto-detects what's still unconfigured for the active
 * shop and deep-links each step. Hides itself once everything entitled is set up.
 */
export function GetStartedCard({ shopId, features, onGo }: { shopId: string; features: string[]; onGo: (route: string) => void }) {
  const [collapsed, setCollapsed] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  // Step keys the user has skipped for this shop (loaded from / persisted to AsyncStorage).
  const [skipped, setSkipped] = useState<string[]>([]);
  const has = (f: string) => features.includes(f);
  const qc = useQueryClient();

  const shiftsQ = useQuery({ queryKey: ["gs-shifts", shopId], queryFn: () => getShiftTemplates(shopId), enabled: !!shopId && has("StaffRota") });
  const tempUnitsQ = useQuery({ queryKey: ["gs-temp-units", shopId], queryFn: () => listTemperatureUnits(shopId), enabled: !!shopId && has("TemperatureLog") });
  const tempQ = useQuery({ queryKey: ["gs-temp", shopId], queryFn: () => listTemperatureSchedules(shopId), enabled: !!shopId && has("TemperatureLog") });
  const tillsQ = useQuery({ queryKey: ["gs-tills", shopId], queryFn: () => listTills(shopId), enabled: !!shopId && has("StoreSales") });

  // Load this shop's skipped steps. Always resets state (even when nothing is stored) so switching
  // shops doesn't carry the previous shop's skips over.
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(SKIPPED_STORAGE_PREFIX + shopId)
      .then((raw) => {
        if (!active) return;
        let parsed: string[] = [];
        if (raw) {
          try { const a = JSON.parse(raw); if (Array.isArray(a)) parsed = a.filter((x): x is string => typeof x === "string"); } catch {}
        }
        setSkipped(parsed);
      })
      .catch(() => { if (active) setSkipped([]); });
    return () => { active = false; };
  }, [shopId]);

  const persistSkipped = (next: string[]) =>
    void AsyncStorage.setItem(SKIPPED_STORAGE_PREFIX + shopId, JSON.stringify(next)).catch(() => undefined);

  const skipStep = (key: string) => {
    setSkipped((prev) => {
      if (prev.includes(key)) return prev;
      const next = [...prev, key];
      persistSkipped(next);
      return next;
    });
  };

  const unskipStep = (key: string) => {
    setSkipped((prev) => {
      if (!prev.includes(key)) return prev;
      const next = prev.filter((k) => k !== key);
      persistSkipped(next);
      return next;
    });
  };

  // The home screen stays mounted, so re-check setup progress whenever it regains focus (e.g. after
  // the user adds a till / shift from a deep-linked config screen and navigates back).
  useFocusEffect(
    React.useCallback(() => {
      if (!shopId) return;
      ["gs-shifts", "gs-temp", "gs-temp-units", "gs-tills"].forEach((k) => qc.invalidateQueries({ queryKey: [k, shopId] }));
    }, [qc, shopId])
  );

  const steps: Step[] = [
    has("StaffRota") && { key: "shifts", label: "Set up shifts", done: (shiftsQ.data?.length ?? 0) > 0, route: "RotaManage", icon: "calendar-number-outline" },
    // Temperature Log needs both units and check times before it's usable — surface them as two
    // ordered steps (add units first; check times target the units).
    has("TemperatureLog") && { key: "temp-units", label: "Add fridges & freezers", done: (tempUnitsQ.data?.length ?? 0) > 0, route: "TemperatureUnits", icon: "thermometer-outline" },
    has("TemperatureLog") && { key: "temp-schedules", label: "Set check times", done: (tempQ.data?.length ?? 0) > 0, route: "TemperatureSchedules", icon: "time-outline" },
    has("StoreSales") && { key: "tills", label: "Add a till", done: (tillsQ.data?.length ?? 0) > 0, route: "TillsConfig", icon: "calculator-outline" },
  ].filter(Boolean) as Step[];
  const isSkipped = (s: Step) => !s.done && skipped.includes(s.key);

  const loading = [shiftsQ, tempUnitsQ, tempQ, tillsQ].some((q) => q.isLoading);
  const total = steps.length;
  const done = steps.filter((s) => s.done).length;
  const skippedCount = steps.filter(isSkipped).length;

  const allDone = !loading && done === total;
  // Hide when there are no applicable steps, the user closed it, or every step is complete. Skipped
  // steps stay visible (marked "Skipped") so they're not silently lost — they only clear by being done.
  if (total === 0 || dismissed || allDone) return null;

  return (
    <View style={[ui.card, styles.card]}>
      <View style={styles.header}>
        <Pressable style={{ flex: 1 }} onPress={() => setCollapsed((c) => !c)}>
          <Text style={styles.title}>Get started</Text>
          <Text style={styles.subtitle}>
            {done} of {total} done{skippedCount ? ` · ${skippedCount} skipped` : ""} — finish setting up your shop
          </Text>
        </Pressable>
        <Pressable onPress={() => setCollapsed((c) => !c)} hitSlop={8} style={styles.headerBtn}>
          <Ionicons name={collapsed ? "chevron-down" : "chevron-up"} size={18} color={appTheme.colors.textSubtle} />
        </Pressable>
        <Pressable onPress={() => setDismissed(true)} hitSlop={8} style={styles.headerBtn}>
          <Ionicons name="close" size={18} color={appTheme.colors.textSubtle} />
        </Pressable>
      </View>

      {!collapsed ? (
        <>
          <View style={styles.track}><View style={[styles.fill, { width: `${total ? (done / total) * 100 : 0}%` }]} /></View>

          <View style={styles.steps}>
            {steps.map((s) => {
              const skippedStep = isSkipped(s);
              return (
                <View key={s.key} style={styles.step}>
                  <Pressable style={styles.stepMain} disabled={s.done} onPress={() => onGo(s.route)}>
                    <Ionicons
                      name={s.done ? "checkmark-circle" : skippedStep ? "play-skip-forward-outline" : "ellipse-outline"}
                      size={20}
                      color={s.done ? appTheme.colors.success : appTheme.colors.textSubtle}
                    />
                    <Text
                      style={[styles.stepLabel, s.done ? styles.stepLabelDone : skippedStep ? styles.stepLabelSkipped : null]}
                      numberOfLines={1}
                    >
                      {s.label}
                    </Text>
                    {!s.done && !skippedStep ? <Ionicons name="chevron-forward" size={16} color={appTheme.colors.textSubtle} /> : null}
                  </Pressable>
                  {s.done ? null : skippedStep ? (
                    <View style={styles.rightRow}>
                      <Text style={styles.skippedBadge}>Skipped</Text>
                      <Pressable onPress={() => unskipStep(s.key)} hitSlop={8} style={styles.skipBtn} accessibilityRole="button" accessibilityLabel={`Undo skip ${s.label}`}>
                        <Text style={styles.undoText}>Undo</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <Pressable onPress={() => skipStep(s.key)} hitSlop={8} style={styles.skipBtn} accessibilityRole="button" accessibilityLabel={`Skip ${s.label}`}>
                      <Text style={styles.skipText}>Skip</Text>
                    </Pressable>
                  )}
                </View>
              );
            })}
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 10 },
  header: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  headerBtn: { paddingTop: 2 },
  title: { color: appTheme.colors.text, fontFamily: appTheme.fonts.heading, fontSize: 16 },
  subtitle: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 12, marginTop: 2 },
  track: { height: 6, borderRadius: 999, backgroundColor: appTheme.colors.surfaceMuted, overflow: "hidden" },
  fill: { height: 6, borderRadius: 999, backgroundColor: appTheme.colors.primary },
  steps: { gap: 2 },
  step: { flexDirection: "row", alignItems: "center", gap: 8 },
  stepMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9 },
  stepLabel: { flex: 1, color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 14 },
  stepLabelDone: { color: appTheme.colors.textSubtle, textDecorationLine: "line-through" },
  stepLabelSkipped: { color: appTheme.colors.textSubtle },
  rightRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  skippedBadge: { color: appTheme.colors.textSubtle, fontFamily: appTheme.fonts.bodyMedium, fontSize: 12 },
  skipBtn: { paddingVertical: 9, paddingHorizontal: 6 },
  skipText: { color: appTheme.colors.textSubtle, fontFamily: appTheme.fonts.bodyMedium, fontSize: 13 },
  undoText: { color: appTheme.colors.primary, fontFamily: appTheme.fonts.bodyMedium, fontSize: 13 },
});
