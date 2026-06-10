import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { appTheme } from "../ui/theme";

export type ShopSetupExtras = {
  shiftTemplates: { name: string; startTime: string; endTime: string }[];
  temperatureCheckTimes: { label: string; time: string; toleranceMinutes: number }[];
};

type ShiftRow = { name: string; start: string; end: string };
type TempRow = { label: string; time: string; tolerance: string };

const DEFAULT_SHIFTS: ShiftRow[] = [
  { name: "Morning", start: "06:00", end: "14:00" },
  { name: "Evening", start: "14:00", end: "22:00" },
];
const DEFAULT_TEMPS: TempRow[] = [
  { label: "Morning check", time: "10:00", tolerance: "30" },
  { label: "Evening check", time: "17:00", tolerance: "30" },
];

/**
 * Collapsible Shifts + Temperature-check setup used when creating a shop (onboarding wizard AND
 * Shop Management). Holds its own state and reports the seed payload up via onChange.
 */
export function ShiftTemperatureSetup({ onChange }: { onChange: (extras: ShopSetupExtras) => void }) {
  const [shiftsOpen, setShiftsOpen] = useState(false);
  const [tempOpen, setTempOpen] = useState(false);
  const [shifts, setShifts] = useState<ShiftRow[]>(DEFAULT_SHIFTS);
  const [tempTimes, setTempTimes] = useState<TempRow[]>(DEFAULT_TEMPS);

  useEffect(() => {
    onChange({
      shiftTemplates: shifts.filter((s) => s.name.trim() && s.start.trim() && s.end.trim())
        .map((s) => ({ name: s.name.trim(), startTime: s.start.trim(), endTime: s.end.trim() })),
      temperatureCheckTimes: tempTimes.filter((t) => t.time.trim())
        .map((t) => ({ label: t.label.trim(), time: t.time.trim(), toleranceMinutes: Number(t.tolerance) || 30 })),
    });
  }, [shifts, tempTimes]);

  return (
    <>
      <View style={styles.section}>
        <Pressable style={styles.header} onPress={() => setShiftsOpen((o) => !o)}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Shifts</Text>
            <Text style={styles.subtitle}>{shiftsOpen ? "Name + start/end (HH:mm)" : `${shifts.length} shift(s) — tap to edit`}</Text>
          </View>
          <Ionicons name={shiftsOpen ? "chevron-up" : "chevron-down"} size={18} color={appTheme.colors.textSubtle} />
        </Pressable>
        {shiftsOpen ? (
          <View style={styles.body}>
            {shifts.map((s, i) => (
              <View key={i} style={styles.row}>
                <TextInput style={[styles.cell, { flex: 2 }]} value={s.name} placeholder="Name" placeholderTextColor={appTheme.colors.textSubtle}
                  onChangeText={(t) => setShifts((p) => p.map((x, j) => j === i ? { ...x, name: t } : x))} />
                <TextInput style={styles.cell} value={s.start} placeholder="06:00" placeholderTextColor={appTheme.colors.textSubtle}
                  onChangeText={(t) => setShifts((p) => p.map((x, j) => j === i ? { ...x, start: t } : x))} />
                <TextInput style={styles.cell} value={s.end} placeholder="14:00" placeholderTextColor={appTheme.colors.textSubtle}
                  onChangeText={(t) => setShifts((p) => p.map((x, j) => j === i ? { ...x, end: t } : x))} />
                <Pressable onPress={() => setShifts((p) => p.filter((_, j) => j !== i))} hitSlop={6}>
                  <Ionicons name="close-circle" size={20} color={appTheme.colors.danger} />
                </Pressable>
              </View>
            ))}
            <Pressable style={styles.add} onPress={() => setShifts((p) => [...p, { name: "", start: "", end: "" }])}>
              <Ionicons name="add" size={16} color={appTheme.colors.primary} /><Text style={styles.addText}>Add shift</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      <View style={styles.section}>
        <Pressable style={styles.header} onPress={() => setTempOpen((o) => !o)}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Temperature check times</Text>
            <Text style={styles.subtitle}>{tempOpen ? "Label + time (HH:mm) + tolerance (mins)" : `${tempTimes.length} time(s) — tap to edit`}</Text>
          </View>
          <Ionicons name={tempOpen ? "chevron-up" : "chevron-down"} size={18} color={appTheme.colors.textSubtle} />
        </Pressable>
        {tempOpen ? (
          <View style={styles.body}>
            {tempTimes.map((t, i) => (
              <View key={i} style={styles.row}>
                <TextInput style={[styles.cell, { flex: 2 }]} value={t.label} placeholder="Label" placeholderTextColor={appTheme.colors.textSubtle}
                  onChangeText={(v) => setTempTimes((p) => p.map((x, j) => j === i ? { ...x, label: v } : x))} />
                <TextInput style={styles.cell} value={t.time} placeholder="10:00" placeholderTextColor={appTheme.colors.textSubtle}
                  onChangeText={(v) => setTempTimes((p) => p.map((x, j) => j === i ? { ...x, time: v } : x))} />
                <TextInput style={styles.cell} value={t.tolerance} placeholder="±min" keyboardType="number-pad" placeholderTextColor={appTheme.colors.textSubtle}
                  onChangeText={(v) => setTempTimes((p) => p.map((x, j) => j === i ? { ...x, tolerance: v } : x))} />
                <Pressable onPress={() => setTempTimes((p) => p.filter((_, j) => j !== i))} hitSlop={6}>
                  <Ionicons name="close-circle" size={20} color={appTheme.colors.danger} />
                </Pressable>
              </View>
            ))}
            <Pressable style={styles.add} onPress={() => setTempTimes((p) => [...p, { label: "", time: "", tolerance: "30" }])}>
              <Ionicons name="add" size={16} color={appTheme.colors.primary} /><Text style={styles.addText}>Add time</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  section: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: appTheme.colors.borderSoft, paddingTop: appTheme.spacing.sm, marginTop: appTheme.spacing.sm },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: appTheme.spacing.sm },
  title: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 14 },
  subtitle: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 12, marginTop: 2 },
  body: { marginTop: appTheme.spacing.sm, gap: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  cell: { flex: 1, borderWidth: 1, borderColor: appTheme.colors.border, borderRadius: appTheme.radius.sm, backgroundColor: appTheme.colors.surfaceMuted, color: appTheme.colors.text, fontFamily: appTheme.fonts.body, fontSize: 14, paddingHorizontal: 10, paddingVertical: 8 },
  add: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 6 },
  addText: { color: appTheme.colors.primary, fontFamily: appTheme.fonts.bodyMedium, fontSize: 13 },
});
