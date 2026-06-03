import React from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthContext";
import {
  createTemperatureSchedule,
  deleteTemperatureSchedule,
  listTemperatureSchedules,
  listTemperatureUnits,
  updateTemperatureSchedule,
} from "../../api/temperatureLogsApi";
import { LoadingState } from "../../components/LoadingState";
import { ScreenContainer } from "../../components/ScreenContainer";
import { PrimaryButton } from "../../components/PrimaryButton";
import { TemperatureSchedule } from "../../types/models";
import { confirmDestructive } from "../../utils/confirm";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";

const TOLERANCE_OPTIONS = [15, 30, 60];

function clampHour(value: string) {
  const n = Math.max(0, Math.min(23, Number(value) | 0));
  return String(n).padStart(2, "0");
}

function clampMinute(value: string) {
  const n = Math.max(0, Math.min(59, Number(value) | 0));
  return String(n).padStart(2, "0");
}

function toTimeString(hour: string, minute: string) {
  return `${clampHour(hour)}:${clampMinute(minute)}:00`;
}

function formatTime(value: string) {
  return value?.length >= 5 ? value.slice(0, 5) : value;
}

export function TemperatureSchedulesScreen() {
  const { activeShopId } = useAuth();
  const shopId = activeShopId;
  const queryClient = useQueryClient();

  const schedulesQuery = useQuery({
    queryKey: ["temperature-schedules", shopId],
    queryFn: () => listTemperatureSchedules(shopId as string),
    enabled: Boolean(shopId),
  });
  const unitsQuery = useQuery({
    queryKey: ["temperature-units", shopId],
    queryFn: () => listTemperatureUnits(shopId as string),
    enabled: Boolean(shopId),
  });

  const [label, setLabel] = React.useState("");
  const [hour, setHour] = React.useState("10");
  const [minute, setMinute] = React.useState("00");
  const hourRef = React.useRef<TextInput>(null);
  const minuteRef = React.useRef<TextInput>(null);
  const [tolerance, setTolerance] = React.useState(30);
  const [unitId, setUnitId] = React.useState<string | undefined>(undefined);
  // When set, the top form edits this existing slot instead of adding a new one.
  const [editingId, setEditingId] = React.useState<string | null>(null);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["temperature-schedules", shopId] });
  };

  function resetForm() {
    setLabel("");
    setHour("10");
    setMinute("00");
    setTolerance(30);
    setUnitId(undefined);
  }

  function beginEdit(schedule: TemperatureSchedule) {
    setEditingId(schedule.id);
    setLabel(schedule.label);
    setHour(schedule.expectedTime.slice(0, 2));
    setMinute(schedule.expectedTime.slice(3, 5));
    setTolerance(schedule.toleranceMinutes);
    setUnitId(schedule.temperatureMonitoringUnitId ?? undefined);
  }

  function cancelEdit() {
    setEditingId(null);
    resetForm();
  }

  const createMutation = useMutation({
    mutationFn: () =>
      createTemperatureSchedule({
        shopId: shopId as string,
        temperatureMonitoringUnitId: unitId,
        label: label.trim(),
        expectedTime: toTimeString(hour, minute),
        toleranceMinutes: tolerance,
        isActive: true,
      }),
    onSuccess: () => {
      resetForm();
      invalidate();
    },
    onError: (error: any) =>
      Alert.alert("Add failed", error?.response?.data?.message ?? "Could not add this scheduled check."),
  });

  const updateMutation = useMutation({
    mutationFn: () => {
      const current = schedulesQuery.data?.find((s) => s.id === editingId);
      return updateTemperatureSchedule(editingId as string, {
        shopId: shopId as string,
        temperatureMonitoringUnitId: unitId,
        label: label.trim(),
        expectedTime: toTimeString(hour, minute),
        toleranceMinutes: tolerance,
        // Editing the schedule's details shouldn't change whether it's active.
        isActive: current?.isActive ?? true,
      });
    },
    onSuccess: () => {
      cancelEdit();
      invalidate();
    },
    onError: (error: any) =>
      Alert.alert("Update failed", error?.response?.data?.message ?? "Could not update this scheduled check."),
  });

  async function confirmDelete(schedule: TemperatureSchedule) {
    const ok = await confirmDestructive({
      title: "Delete schedule",
      message: `Remove the "${schedule.label}" slot? Existing readings stay intact.`,
    });
    if (!ok) return;
    try {
      await deleteTemperatureSchedule(schedule.id);
      invalidate();
    } catch (error: any) {
      Alert.alert("Delete failed", error?.response?.data?.message ?? "Could not delete this schedule.");
    }
  }

  async function toggleActive(schedule: TemperatureSchedule) {
    try {
      await updateTemperatureSchedule(schedule.id, {
        shopId: schedule.shopId,
        temperatureMonitoringUnitId: schedule.temperatureMonitoringUnitId,
        label: schedule.label,
        expectedTime: schedule.expectedTime,
        toleranceMinutes: schedule.toleranceMinutes,
        isActive: !schedule.isActive,
      });
      invalidate();
    } catch (error: any) {
      Alert.alert("Update failed", error?.response?.data?.message ?? "Could not update this schedule.");
    }
  }

  const schedules = schedulesQuery.data ?? [];
  const units = unitsQuery.data ?? [];
  const busy = createMutation.isPending || updateMutation.isPending;
  const canSubmit =
    label.trim().length > 0 && hour.length > 0 && minute.length > 0 && !busy && Boolean(shopId);

  return (
    <ScreenContainer>
      <View style={ui.card}>
        <Text style={ui.sectionTitle}>{editingId ? "Edit scheduled check" : "Add a scheduled check"}</Text>
        <Text style={ui.caption}>
          Tell the system when temperatures should be taken (e.g. "Morning" at 10:00 ±30 min). Readings inside the
          window are on-time; outside the window they're flagged late in the report.
        </Text>

        <TextInput
          style={styles.input}
          value={label}
          onChangeText={setLabel}
          placeholder="Label (e.g. Morning, Evening, Closing)"
          placeholderTextColor={appTheme.colors.textSubtle}
          editable={!busy}
          autoCapitalize="words"
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => hourRef.current?.focus()}
        />

        <View style={styles.timeRow}>
          <Text style={styles.timeLabel}>Time</Text>
          <TextInput
            ref={hourRef}
            style={[styles.input, styles.timeInput]}
            value={hour}
            onChangeText={(t) => setHour(t.replace(/\D/g, "").slice(0, 2))}
            placeholder="HH"
            placeholderTextColor={appTheme.colors.textSubtle}
            keyboardType="number-pad"
            maxLength={2}
            editable={!busy}
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => minuteRef.current?.focus()}
          />
          <Text style={styles.timeColon}>:</Text>
          <TextInput
            ref={minuteRef}
            style={[styles.input, styles.timeInput]}
            value={minute}
            onChangeText={(t) => setMinute(t.replace(/\D/g, "").slice(0, 2))}
            placeholder="MM"
            placeholderTextColor={appTheme.colors.textSubtle}
            keyboardType="number-pad"
            maxLength={2}
            editable={!busy}
            returnKeyType="done"
          />
        </View>

        <View>
          <Text style={styles.fieldLabel}>Tolerance</Text>
          <View style={styles.chipRow}>
            {TOLERANCE_OPTIONS.map((minutes) => {
              const active = tolerance === minutes;
              return (
                <Pressable
                  key={minutes}
                  style={[styles.chip, active ? styles.chipActive : null]}
                  onPress={() => setTolerance(minutes)}
                >
                  <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>±{minutes}m</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View>
          <Text style={styles.fieldLabel}>Unit (optional)</Text>
          <View style={styles.chipRow}>
            <Pressable
              style={[styles.chip, !unitId ? styles.chipActive : null]}
              onPress={() => setUnitId(undefined)}
            >
              <Text style={[styles.chipText, !unitId ? styles.chipTextActive : null]}>All units</Text>
            </Pressable>
            {units.map((unit) => {
              const active = unit.id === unitId;
              return (
                <Pressable
                  key={unit.id}
                  style={[styles.chip, active ? styles.chipActive : null]}
                  onPress={() => setUnitId(unit.id)}
                >
                  <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>{unit.unitName}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <PrimaryButton
          label={
            editingId
              ? updateMutation.isPending
                ? "Saving..."
                : "Save changes"
              : createMutation.isPending
                ? "Adding..."
                : "Add schedule"
          }
          onPress={() => (editingId ? updateMutation.mutate() : createMutation.mutate())}
          disabled={!canSubmit}
        />
        {editingId ? (
          <Pressable style={styles.cancelBtn} onPress={cancelEdit} disabled={busy}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={ui.card}>
        <Text style={ui.sectionTitle}>Configured slots</Text>
        {schedulesQuery.isLoading ? <LoadingState inline /> : null}
        {!schedulesQuery.isLoading && schedules.length === 0 ? (
          <Text style={ui.bodyText}>No scheduled checks yet — add one above.</Text>
        ) : null}
        {schedules.map((schedule) => {
          const unit = units.find((u) => u.id === schedule.temperatureMonitoringUnitId);
          return (
            <View key={schedule.id} style={[styles.row, !schedule.isActive ? styles.rowInactive : null]}>
              <View style={styles.rowMain}>
                <Text style={styles.rowName}>
                  {schedule.label} · {formatTime(schedule.expectedTime)} ±{schedule.toleranceMinutes}m
                </Text>
                <Text style={styles.rowMeta}>
                  {schedule.isActive ? "Active" : "Inactive"} · {unit ? unit.unitName : "All units"}
                </Text>
              </View>
              <View style={styles.rowActions}>
                <Pressable
                  style={[styles.iconBtn, editingId === schedule.id ? styles.iconBtnActive : null]}
                  onPress={() => beginEdit(schedule)}
                >
                  <Ionicons name="create-outline" size={17} color={appTheme.colors.text} />
                </Pressable>
                <Pressable style={styles.iconBtn} onPress={() => void toggleActive(schedule)}>
                  <Ionicons
                    name={schedule.isActive ? "pause-circle-outline" : "play-circle-outline"}
                    size={18}
                    color={appTheme.colors.text}
                  />
                </Pressable>
                <Pressable style={styles.iconBtn} onPress={() => confirmDelete(schedule)}>
                  <Ionicons name="trash-outline" size={17} color={appTheme.colors.danger} />
                </Pressable>
              </View>
            </View>
          );
        })}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.body,
    fontSize: 14,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  timeRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  timeLabel: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.bodyMedium, fontSize: 13, lineHeight: 17, width: 50 },
  timeInput: { flex: 1, textAlign: "center", fontSize: 16 },
  timeColon: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 18, paddingHorizontal: 2 },
  fieldLabel: {
    color: appTheme.colors.textSubtle,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 11,
    lineHeight: 13,
    letterSpacing: 0.3,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: appTheme.radius.pill,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    backgroundColor: appTheme.colors.surface,
  },
  chipActive: { borderColor: appTheme.colors.primary, backgroundColor: appTheme.colors.surfaceBrandSoft },
  chipText: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.bodyMedium, fontSize: 13, lineHeight: 16 },
  chipTextActive: { color: appTheme.colors.primary },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: appTheme.colors.borderSoft,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 9,
    gap: 8,
  },
  rowInactive: { backgroundColor: appTheme.colors.surfaceMuted },
  rowMain: { flex: 1, gap: 2 },
  rowName: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 14, lineHeight: 18 },
  rowMeta: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 12, lineHeight: 15 },
  rowActions: { flexDirection: "row", gap: 6 },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: appTheme.radius.sm,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    backgroundColor: appTheme.colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  iconBtnActive: {
    borderColor: appTheme.colors.primary,
    backgroundColor: appTheme.colors.surfaceBrandSoft,
  },
  cancelBtn: {
    alignItems: "center",
    paddingVertical: 10,
  },
  cancelBtnText: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 18,
  },
});
