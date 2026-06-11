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
import { DateTimeField } from "../../components/DateTimeField";
import { EmptyState } from "../../components/EmptyState";
import { TemperatureSchedule } from "../../types/models";
import { confirmDestructive } from "../../utils/confirm";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";

const TOLERANCE_OPTIONS = [15, 30, 60];

// The time picker yields a validated "HH:MM"; the API expects "HH:MM:00".
function toExpectedTime(time: string) {
  return `${time}:00`;
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
  const [time, setTime] = React.useState("10:00");
  const [tolerance, setTolerance] = React.useState(30);
  // Units this scheduled check applies to. Empty = "All units". When adding you can pick several and
  // one schedule record is created per unit; when editing a single record only one unit applies.
  const [selectedUnitIds, setSelectedUnitIds] = React.useState<string[]>([]);
  // When set, the top form edits this existing slot instead of adding a new one.
  const [editingId, setEditingId] = React.useState<string | null>(null);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["temperature-schedules", shopId] });
  };

  function resetForm() {
    setLabel("");
    setTime("10:00");
    setTolerance(30);
    setSelectedUnitIds([]);
  }

  function beginEdit(schedule: TemperatureSchedule) {
    setEditingId(schedule.id);
    setLabel(schedule.label);
    setTime(schedule.expectedTime.slice(0, 5));
    setTolerance(schedule.toleranceMinutes);
    setSelectedUnitIds(schedule.temperatureMonitoringUnitId ? [schedule.temperatureMonitoringUnitId] : []);
  }

  // "All units" clears the selection. Otherwise toggle membership when adding; when editing a single
  // record, selecting a unit replaces the choice (one record can only target one unit).
  function toggleUnit(id: string) {
    setSelectedUnitIds((prev) => {
      if (editingId) {
        return [id];
      }
      return prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
    });
  }

  function cancelEdit() {
    setEditingId(null);
    resetForm();
  }

  const createMutation = useMutation({
    mutationFn: async () => {
      // No specific units → one "All units" schedule; otherwise one schedule per chosen unit.
      const targets: (string | undefined)[] = selectedUnitIds.length > 0 ? selectedUnitIds : [undefined];
      for (const target of targets) {
        await createTemperatureSchedule({
          shopId: shopId as string,
          temperatureMonitoringUnitId: target,
          label: label.trim(),
          expectedTime: toExpectedTime(time),
          toleranceMinutes: tolerance,
          isActive: true,
        });
      }
    },
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
        temperatureMonitoringUnitId: selectedUnitIds[0],
        label: label.trim(),
        expectedTime: toExpectedTime(time),
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
  const canSubmit = label.trim().length > 0 && time.length === 5 && !busy && Boolean(shopId);

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
          returnKeyType="done"
        />

        <View style={styles.timeRow}>
          <Text style={styles.timeLabel}>Time</Text>
          <View style={styles.timeFieldWrap}>
            <DateTimeField mode="time" value={time} onChange={setTime} />
          </View>
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
          <Text style={styles.fieldLabel}>
            Units {editingId ? "(pick one, or All units)" : "(pick one or more, or All units)"}
          </Text>
          <View style={styles.chipRow}>
            <Pressable
              style={[styles.chip, selectedUnitIds.length === 0 ? styles.chipActive : null]}
              onPress={() => setSelectedUnitIds([])}
            >
              <Text style={[styles.chipText, selectedUnitIds.length === 0 ? styles.chipTextActive : null]}>All units</Text>
            </Pressable>
            {units.map((unit) => {
              const active = selectedUnitIds.includes(unit.id);
              return (
                <Pressable
                  key={unit.id}
                  style={[styles.chip, active ? styles.chipActive : null]}
                  onPress={() => toggleUnit(unit.id)}
                >
                  <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>{unit.unitName}</Text>
                </Pressable>
              );
            })}
          </View>
          {!editingId && selectedUnitIds.length > 1 ? (
            <Text style={styles.helperText}>Creates a separate scheduled check for each of the {selectedUnitIds.length} selected units.</Text>
          ) : null}
        </View>

        <PrimaryButton
          label={
            editingId
              ? updateMutation.isPending
                ? "Saving…"
                : "Save changes"
              : createMutation.isPending
                ? "Adding…"
                : selectedUnitIds.length > 1
                  ? `Add ${selectedUnitIds.length} schedules`
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
          <EmptyState icon="thermometer-outline" title="No scheduled checks yet" message="Add a check time above so staff are prompted to log temperatures (with your tolerance window)." />
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
  timeFieldWrap: { flex: 1 },
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
  helperText: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.body,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 6,
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
