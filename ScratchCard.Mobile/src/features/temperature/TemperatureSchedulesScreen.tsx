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
import { toastSuccess } from "../../components/toast";
import { PrimaryButton } from "../../components/PrimaryButton";
import { DateTimeField } from "../../components/DateTimeField";
import { EmptyState } from "../../components/EmptyState";
import { TemperatureSchedule } from "../../types/models";
import { getApiErrorMessage } from "../../utils/apiErrorMessage";
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
  // Units this scheduled check applies to. Empty = "All units"; one schedule record points at all the
  // selected units (a single check covering several fridges).
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
    setSelectedUnitIds(schedule.unitIds);
  }

  // Toggle this unit's membership. The "All units" chip clears the selection entirely (empty = all).
  function toggleUnit(id: string) {
    setSelectedUnitIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function cancelEdit() {
    setEditingId(null);
    resetForm();
  }

  const createMutation = useMutation({
    // One schedule record that points at all the selected units (empty = all units).
    mutationFn: () =>
      createTemperatureSchedule({
        shopId: shopId as string,
        unitIds: selectedUnitIds,
        label: label.trim(),
        expectedTime: toExpectedTime(time),
        toleranceMinutes: tolerance,
        isActive: true,
      }),
    onSuccess: () => {
      resetForm();
      invalidate();
      toastSuccess("Scheduled check added.");
    },
    onError: (error: any) =>
      Alert.alert("Add failed", getApiErrorMessage(error, "Could not add this scheduled check.")),
  });

  const updateMutation = useMutation({
    mutationFn: () => {
      const current = schedulesQuery.data?.find((s) => s.id === editingId);
      return updateTemperatureSchedule(editingId as string, {
        shopId: shopId as string,
        unitIds: selectedUnitIds,
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
      Alert.alert("Update failed", getApiErrorMessage(error, "Could not update this scheduled check.")),
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
      Alert.alert("Delete failed", getApiErrorMessage(error, "Could not delete this schedule."));
    }
  }

  async function toggleActive(schedule: TemperatureSchedule) {
    try {
      await updateTemperatureSchedule(schedule.id, {
        shopId: schedule.shopId,
        unitIds: schedule.unitIds,
        label: schedule.label,
        expectedTime: schedule.expectedTime,
        toleranceMinutes: schedule.toleranceMinutes,
        isActive: !schedule.isActive,
      });
      invalidate();
    } catch (error: any) {
      Alert.alert("Update failed", getApiErrorMessage(error, "Could not update this schedule."));
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
          <Text style={styles.fieldLabel}>Units (pick one or more, or All units)</Text>
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
          {selectedUnitIds.length > 0 ? (
            <View style={styles.previewBox}>
              <View style={styles.previewHeader}>
                <Ionicons name="information-circle-outline" size={15} color={appTheme.colors.primary} />
                <Text style={styles.previewTitle}>
                  One check covering {selectedUnitIds.length} unit{selectedUnitIds.length > 1 ? "s" : ""}
                </Text>
              </View>
              <Text style={styles.previewUnits}>
                {selectedUnitIds.map((id) => units.find((unit) => unit.id === id)?.unitName ?? "Unit").join(", ")}
              </Text>
            </View>
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
          const unitNames = schedule.unitIds
            .map((id) => units.find((u) => u.id === id)?.unitName)
            .filter(Boolean)
            .join(", ");
          return (
            <View key={schedule.id} style={[styles.row, !schedule.isActive ? styles.rowInactive : null]}>
              <View style={styles.rowMain}>
                <Text style={styles.rowName}>
                  {schedule.label} · {formatTime(schedule.expectedTime)} ±{schedule.toleranceMinutes}m
                </Text>
                <Text style={styles.rowMeta} numberOfLines={1}>
                  {schedule.isActive ? "Active" : "Inactive"} · {unitNames || "All units"}
                </Text>
              </View>
              <View style={styles.rowActions}>
                <Pressable
                  style={({ pressed }) => [styles.iconBtn, editingId === schedule.id ? styles.iconBtnActive : null, pressed ? styles.iconBtnPressed : null]}
                  onPress={() => beginEdit(schedule)}
                  accessibilityRole="button"
                  accessibilityLabel="Edit schedule"
                >
                  <Ionicons name="create-outline" size={17} color={appTheme.colors.text} />
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.iconBtn, pressed ? styles.iconBtnPressed : null]}
                  onPress={() => void toggleActive(schedule)}
                  accessibilityRole="button"
                  accessibilityLabel={schedule.isActive ? "Pause schedule" : "Resume schedule"}
                >
                  <Ionicons
                    name={schedule.isActive ? "pause-circle-outline" : "play-circle-outline"}
                    size={18}
                    color={appTheme.colors.text}
                  />
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.iconBtn, pressed ? styles.iconBtnPressed : null]}
                  onPress={() => confirmDelete(schedule)}
                  accessibilityRole="button"
                  accessibilityLabel="Delete schedule"
                >
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
  previewBox: {
    marginTop: 8,
    padding: 10,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceBrandSoft,
    gap: 4,
  },
  previewHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  previewTitle: {
    flex: 1,
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 17,
  },
  previewUnits: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.body,
    fontSize: 12,
    lineHeight: 16,
  },
  previewMeta: {
    color: appTheme.colors.textSubtle,
    fontFamily: appTheme.fonts.body,
    fontSize: 12,
    lineHeight: 16,
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
  iconBtnPressed: {
    opacity: 0.6,
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
