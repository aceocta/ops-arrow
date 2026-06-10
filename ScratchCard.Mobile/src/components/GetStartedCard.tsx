import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { appTheme } from "../ui/theme";
import { ui } from "../ui/primitives";
import { getShiftTemplates, getAssignableUsers } from "../api/rotaApi";
import { listTemperatureSchedules } from "../api/temperatureLogsApi";
import { listTills } from "../api/tillsApi";

type Step = { key: string; label: string; done: boolean; route: string; icon: keyof typeof Ionicons.glyphMap };

/**
 * Onboarding checklist for owners/managers — auto-detects what's still unconfigured for the active
 * shop and deep-links each step. Hides itself once everything entitled is set up.
 */
export function GetStartedCard({ shopId, features, onGo }: { shopId: string; features: string[]; onGo: (route: string) => void }) {
  const [collapsed, setCollapsed] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const has = (f: string) => features.includes(f);
  const qc = useQueryClient();

  const shiftsQ = useQuery({ queryKey: ["gs-shifts", shopId], queryFn: () => getShiftTemplates(shopId), enabled: !!shopId && has("StaffRota") });
  const tempQ = useQuery({ queryKey: ["gs-temp", shopId], queryFn: () => listTemperatureSchedules(shopId), enabled: !!shopId && has("TemperatureLog") });
  const tillsQ = useQuery({ queryKey: ["gs-tills", shopId], queryFn: () => listTills(shopId), enabled: !!shopId && has("StoreSales") });
  const staffQ = useQuery({ queryKey: ["gs-staff", shopId], queryFn: () => getAssignableUsers(shopId), enabled: !!shopId && has("StaffRota") });

  // The home screen stays mounted, so re-check setup progress whenever it regains focus (e.g. after
  // the user adds a till / shift from a deep-linked config screen and navigates back).
  useFocusEffect(
    React.useCallback(() => {
      if (!shopId) return;
      ["gs-shifts", "gs-temp", "gs-tills", "gs-staff"].forEach((k) => qc.invalidateQueries({ queryKey: [k, shopId] }));
    }, [qc, shopId])
  );

  const steps: Step[] = [
    has("StaffRota") && { key: "shifts", label: "Set up shifts", done: (shiftsQ.data?.length ?? 0) > 0, route: "RotaManage", icon: "calendar-number-outline" },
    has("TemperatureLog") && { key: "temp", label: "Add temperature checks", done: (tempQ.data?.length ?? 0) > 0, route: "TemperatureSchedules", icon: "thermometer-outline" },
    has("StoreSales") && { key: "tills", label: "Add a till", done: (tillsQ.data?.length ?? 0) > 0, route: "TillsConfig", icon: "calculator-outline" },
    has("StaffRota") && { key: "staff", label: "Add your staff", done: (staffQ.data?.length ?? 0) > 1, route: "RotaStaffMembers", icon: "people-outline" },
  ].filter(Boolean) as Step[];

  const loading = [shiftsQ, tempQ, tillsQ, staffQ].some((q) => q.isLoading);
  const total = steps.length;
  const done = steps.filter((s) => s.done).length;

  const allDone = !loading && done === total;
  // Hide when there are no applicable steps, the user closed it, or everything is already done.
  if (total === 0 || dismissed || allDone) return null;

  return (
    <View style={[ui.card, styles.card]}>
      <View style={styles.header}>
        <Pressable style={{ flex: 1 }} onPress={() => setCollapsed((c) => !c)}>
          <Text style={styles.title}>Get started</Text>
          <Text style={styles.subtitle}>{done} of {total} done — finish setting up your shop</Text>
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
            {steps.map((s) => (
              <Pressable key={s.key} style={styles.step} disabled={s.done} onPress={() => onGo(s.route)}>
                <Ionicons name={s.done ? "checkmark-circle" : "ellipse-outline"} size={20} color={s.done ? appTheme.colors.success : appTheme.colors.textSubtle} />
                <Text style={[styles.stepLabel, s.done ? styles.stepLabelDone : null]}>{s.label}</Text>
                {!s.done ? <Ionicons name="chevron-forward" size={16} color={appTheme.colors.textSubtle} /> : null}
              </Pressable>
            ))}
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
  step: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9 },
  stepLabel: { flex: 1, color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 14 },
  stepLabelDone: { color: appTheme.colors.textSubtle, textDecorationLine: "line-through" },
});
