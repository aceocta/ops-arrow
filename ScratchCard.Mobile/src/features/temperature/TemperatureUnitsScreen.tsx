import React, { useEffect, useRef, useState } from "react";
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { createTemperatureUnit, listTemperatureEquipmentIssues, listTemperatureUnits } from "../../api/temperatureLogsApi";
import { MainStackParamList } from "../../types/navigation";
import { useAuth } from "../../auth/AuthContext";
import { EmptyState } from "../../components/EmptyState";
import { FloatingLabelInput } from "../../components/FloatingLabelInput";
import { PrimaryButton } from "../../components/PrimaryButton";
import { dismissKeyboardOnTap } from "../../components/KeyboardDismissView";
import { ScreenContainer } from "../../components/ScreenContainer";
import { useFieldValidation } from "../../components/useFieldValidation";
import { toastError, toastSuccess } from "../../components/toast";
import { StatusBadge } from "../../components/StatusBadge";
import { ModalBackdropBlur } from "../../components/ModalBackdropBlur";
import { EquipmentWorkingStatus, TemperatureEquipmentType } from "../../types/enums";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";

function sanitizeSignedDecimal(raw: string): string {
  if (!raw) return "";
  const negative = raw.trim().startsWith("-");
  const digits = raw.replace(/[^0-9.]/g, "");
  const parts = digits.split(".");
  const cleaned = parts.length > 1 ? `${parts[0]}.${parts.slice(1).join("")}` : digits;
  return negative ? `-${cleaned}` : cleaned;
}

const equipmentTypeOptions: TemperatureEquipmentType[] = [
  TemperatureEquipmentType.Fridge,
  TemperatureEquipmentType.Freezer,
  TemperatureEquipmentType.CoolRoom,
  TemperatureEquipmentType.DisplayChill,
  TemperatureEquipmentType.HotFoodDisplay,
  TemperatureEquipmentType.HotFoodCounter,
  TemperatureEquipmentType.BainMarie,
  TemperatureEquipmentType.PieWarmer,
  TemperatureEquipmentType.Other,
];

function formatTemperature(value: number) {
  return `${value.toFixed(1)} C`;
}

// A secondary badge for a unit whose working status isn't plain "Working" (spec §9/§22).
function workingStatusBadge(status: EquipmentWorkingStatus): { label: string; tone: "warning" | "danger" } | null {
  switch (status) {
    case EquipmentWorkingStatus.NotWorking:
      return { label: "Not working", tone: "danger" };
    case EquipmentWorkingStatus.UnderMaintenance:
      return { label: "Under maintenance", tone: "warning" };
    case EquipmentWorkingStatus.TemperatureWarning:
      return { label: "Temp warning", tone: "warning" };
    default:
      return null;
  }
}

function WorkingStatusBadge({ status }: { status: EquipmentWorkingStatus }) {
  const badge = workingStatusBadge(status);
  return badge ? <StatusBadge label={badge.label} tone={badge.tone} /> : null;
}

export function TemperatureUnitsScreen() {
  const queryClient = useQueryClient();
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { activeShopId, activeShop, profile } = useAuth();
  const shopId = activeShopId;
  // Setting up units is open to all operational roles (incl. Cashier & SalesAssistant).
  const canManageUnits =
    profile?.roles?.some((role) =>
      role === "CompanyOwner" || role === "Manager" || role === "Cashier" || role === "SalesAssistant",
    ) ?? false;

  const [isCreateModalVisible, setIsCreateModalVisible] = useState(false);
  const [newUnitName, setNewUnitName] = useState("");
  const [newEquipmentType, setNewEquipmentType] = useState<TemperatureEquipmentType>(TemperatureEquipmentType.Fridge);
  const [newMinTemp, setNewMinTemp] = useState("0");
  const [newMaxTemp, setNewMaxTemp] = useState("5");
  const [newLocation, setNewLocation] = useState("");
  const [newDisplayOrder, setNewDisplayOrder] = useState("");

  const newMinTempRef = useRef<TextInput>(null);
  const newMaxTempRef = useRef<TextInput>(null);
  const newLocationRef = useRef<TextInput>(null);

  const unitsQuery = useQuery({
    queryKey: ["temperature-units", shopId],
    queryFn: () => listTemperatureUnits(shopId as string),
    enabled: Boolean(shopId),
    staleTime: 10 * 60 * 1000,
  });

  // Open equipment issues, for the header count + per-unit indicator (spec §22).
  const issuesQuery = useQuery({
    queryKey: ["temperature-issues", shopId],
    queryFn: () => listTemperatureEquipmentIssues(shopId as string, true),
    enabled: Boolean(shopId),
    staleTime: 60 * 1000,
  });
  const openIssueCount = issuesQuery.data?.length ?? 0;

  const createUnitMutation = useMutation({
    mutationFn: async (shiftConflicts: boolean) => {
      if (!shopId) throw new Error("No shop selected.");
      if (!newUnitName.trim()) throw new Error("Unit name is required.");

      const min = Number(newMinTemp);
      const max = Number(newMaxTemp);
      if (Number.isNaN(min) || Number.isNaN(max)) {
        throw new Error("Temperature range must be numeric.");
      }

      return createTemperatureUnit({
        shopId,
        unitName: newUnitName.trim(),
        equipmentType: newEquipmentType,
        minTemperatureCelsius: min,
        maxTemperatureCelsius: max,
        location: newLocation.trim() || undefined,
        displayOrder: newDisplayOrder.trim() ? Number(newDisplayOrder) : undefined,
        shiftConflicts,
      });
    },
    onSuccess: async () => {
      setNewUnitName("");
      setNewEquipmentType(TemperatureEquipmentType.Fridge);
      setNewMinTemp("0");
      setNewMaxTemp("5");
      setNewLocation("");
      setNewDisplayOrder("");
      setIsCreateModalVisible(false);
      toastSuccess("Temperature unit created.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["temperature-units", shopId] }),
        queryClient.invalidateQueries({ queryKey: ["temperature-daily-log", shopId] }),
      ]);
    },
    onError: (error: any, shiftConflicts: boolean) => {
      if (!shiftConflicts && error?.response?.data?.code === "temperature_unit_order_duplicate") {
        Alert.alert(
          "Order number in use",
          `${error.response.data.message}\n\nShift the other units down to make room?`,
          [
            { text: "Cancel", style: "cancel" },
            { text: "Shift & Save", onPress: () => createUnitMutation.mutate(true) },
          ],
        );
        return;
      }
      toastError(error?.response?.data?.message ?? error?.message ?? "Unable to create unit.");
    },
  });

  // Client-side rules, recomputed every render so a touched field's error clears the instant its
  // value becomes valid. Location & order number are optional (no rule). The min<max cross-field
  // check reports on the max field so the message sits beside the value the user must raise.
  const minValue = Number(newMinTemp);
  const maxValue = Number(newMaxTemp);
  const fieldErrors = {
    unitName: newUnitName.trim().length === 0 ? "Enter a unit name." : null,
    minTemperatureCelsius: !Number.isFinite(minValue) ? "Enter a number." : null,
    maxTemperatureCelsius: !Number.isFinite(maxValue)
      ? "Enter a number."
      : Number.isFinite(minValue) && minValue >= maxValue
        ? "Max must be greater than min."
        : null,
  };
  const validation = useFieldValidation(fieldErrors);
  // Clear revealed errors each time the create modal opens so a prior failed submit doesn't flag the
  // freshly-reset form.
  useEffect(() => {
    if (isCreateModalVisible) validation.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCreateModalVisible]);

  return (
    <ScreenContainer>

      <View style={ui.card}>
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Units List</Text>
          <Pressable
            style={({ pressed }) => [styles.addButton, !canManageUnits ? styles.addButtonDisabled : null, pressed ? styles.pressed : null]}
            onPress={() => setIsCreateModalVisible(true)}
            disabled={!canManageUnits}
            accessibilityRole="button"
            accessibilityLabel="Add new unit"
          >
            <Text style={styles.addButtonText}>Add new unit</Text>
          </Pressable>
        </View>
        {!canManageUnits ? <Text style={styles.meta}>Only manager or company owner can add new units.</Text> : null}

        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [styles.issuesLink, pressed ? styles.pressed : null]}
          onPress={() => navigation.navigate("TemperatureIssues")}
        >
          <View style={styles.issuesLinkLeft}>
            <StatusBadge label={String(openIssueCount)} tone={openIssueCount > 0 ? "danger" : "neutral"} />
            <Text style={styles.issuesLinkText}>Equipment issues</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={appTheme.colors.textMuted} />
        </Pressable>

        {(unitsQuery.data ?? []).map((unit) => (
          <View key={unit.id} style={styles.unitItem}>
            <View style={styles.unitHeader}>
              <Text style={styles.unitTitle}>{unit.displayOrder ? `${unit.displayOrder}. ` : ""}{unit.unitName}</Text>
              <View style={styles.unitHeaderBadges}>
                <WorkingStatusBadge status={unit.currentWorkingStatus} />
                <StatusBadge label={unit.isActive ? "Active" : "Inactive"} tone={unit.isActive ? "success" : "neutral"} />
              </View>
            </View>
            <Text style={styles.meta}>
              {unit.equipmentType}{unit.location ? ` | ${unit.location}` : ""}
            </Text>
            <Text style={styles.meta}>
              Range: {formatTemperature(unit.minTemperatureCelsius)} to {formatTemperature(unit.maxTemperatureCelsius)}
            </Text>
            {canManageUnits ? (
              <View style={styles.unitActions}>
                <Pressable style={styles.editButton} onPress={() => navigation.navigate("TemperatureUnitEdit", { unitId: unit.id })}>
                  <Text style={styles.editButtonText}>Edit unit</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        ))}
        {!unitsQuery.isFetching && (unitsQuery.data?.length ?? 0) === 0 ? (
          <EmptyState icon="thermometer-outline" title="No units yet" message="Add your first fridge or freezer above." />
        ) : null}
      </View>

      <Modal
        visible={isCreateModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsCreateModalVisible(false)}
      >
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <View style={styles.modalBackdrop} onStartShouldSetResponder={dismissKeyboardOnTap}>
          <ModalBackdropBlur />
          <View style={styles.modalCard}>
            <Text style={styles.sectionTitle}>Add New Unit</Text>
            <FloatingLabelInput
              label="Unit name (e.g. Front Fridge)"
              value={newUnitName}
              onChangeText={setNewUnitName}
              error={validation.showError("unitName")}
              onBlur={() => validation.touch("unitName")}
              autoCapitalize="words"
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => newMinTempRef.current?.focus()}
            />
            <Text style={styles.fieldLabel}>Equipment Type</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choiceRow}>
              {equipmentTypeOptions.map((option) => (
                <Pressable
                  key={option}
                  style={[styles.choice, option === newEquipmentType ? styles.choiceSelected : null]}
                  onPress={() => setNewEquipmentType(option)}
                >
                  <Text style={[styles.choiceText, option === newEquipmentType ? styles.choiceTextSelected : null]}>
                    {option}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <FloatingLabelInput
                  ref={newMinTempRef}
                  label="Min °C"
                  value={newMinTemp}
                  onChangeText={(value) => setNewMinTemp(sanitizeSignedDecimal(value))}
                  error={validation.showError("minTemperatureCelsius")}
                  onBlur={() => validation.touch("minTemperatureCelsius")}
                  keyboardType="numbers-and-punctuation"
                  returnKeyType="next"
                  submitBehavior="submit"
                  onSubmitEditing={() => newMaxTempRef.current?.focus()}
                />
              </View>
              <View style={{ flex: 1 }}>
                <FloatingLabelInput
                  ref={newMaxTempRef}
                  label="Max °C"
                  value={newMaxTemp}
                  onChangeText={(value) => setNewMaxTemp(sanitizeSignedDecimal(value))}
                  error={validation.showError("maxTemperatureCelsius")}
                  onBlur={() => validation.touch("maxTemperatureCelsius")}
                  keyboardType="numbers-and-punctuation"
                  returnKeyType="next"
                  submitBehavior="submit"
                  onSubmitEditing={() => newLocationRef.current?.focus()}
                />
              </View>
            </View>

            <FloatingLabelInput
              ref={newLocationRef}
              label="Location (optional)"
              value={newLocation}
              onChangeText={setNewLocation}
              autoCapitalize="words"
              returnKeyType="next"
            />
            <FloatingLabelInput
              label="Order number (optional)"
              value={newDisplayOrder}
              onChangeText={(value) => setNewDisplayOrder(value.replace(/[^0-9]/g, ""))}
              keyboardType="number-pad"
              returnKeyType="done"
            />
            <View style={styles.modalActions}>
              <PrimaryButton
                label={createUnitMutation.isPending ? "Creating…" : "Create unit"}
                // Enabled while incomplete so pressing reveals the inline field errors; the guard
                // below runs the checks and only fires the POST once everything is valid.
                onPress={() => {
                  if (createUnitMutation.isPending) return;
                  if (!validation.attemptSubmit()) return;
                  createUnitMutation.mutate(false);
                }}
                disabled={createUnitMutation.isPending || !shopId}
                size="sm"
              />
              <PrimaryButton
                label="Cancel"
                tone="neutral"
                size="sm"
                onPress={() => setIsCreateModalVisible(false)}
                disabled={createUnitMutation.isPending}
              />
            </View>
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: appTheme.colors.primary,
    borderRadius: appTheme.radius.lg,
    borderWidth: 1,
    borderColor: appTheme.colors.primaryPressed,
    padding: appTheme.spacing.lg,
    gap: appTheme.spacing.xs,
  },
  heroTitle: {
    color: appTheme.colors.onPrimary,
    fontFamily: appTheme.fonts.heading,
    fontSize: 20,
    lineHeight: 24,
  },
  heroSubtitle: {
    color: appTheme.colors.onPrimary,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 18,
  },
  heroNote: {
    color: appTheme.colors.textOnDark,
    fontFamily: appTheme.fonts.body,
    fontSize: 13,
    lineHeight: 17,
  },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: appTheme.spacing.sm,
  },
  sectionTitle: {
    color: appTheme.colors.text,
    fontSize: 17,
    lineHeight: 22,
    fontFamily: appTheme.fonts.bodyMedium,
  },
  addButton: {
    borderWidth: 1,
    borderColor: appTheme.colors.primary,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  addButtonDisabled: {
    opacity: 0.55,
  },
  pressed: {
    opacity: 0.6,
  },
  addButtonText: {
    color: appTheme.colors.primary,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 16,
  },
  unitItem: {
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    padding: appTheme.spacing.sm,
    gap: 4,
  },
  unitActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 2,
  },
  editButton: {
    borderWidth: 1,
    borderColor: appTheme.colors.primary,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  editButtonText: {
    color: appTheme.colors.primary,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 16,
  },
  unitHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: appTheme.spacing.xs,
  },
  unitHeaderBadges: {
    flexDirection: "row",
    alignItems: "center",
    gap: appTheme.spacing.xs,
    flexShrink: 0,
  },
  issuesLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surface,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: 10,
    marginTop: appTheme.spacing.xs,
  },
  issuesLinkLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: appTheme.spacing.xs,
  },
  issuesLinkText: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 18,
  },
  unitTitle: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 18,
    flex: 1,
  },
  meta: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.body,
    fontSize: 13,
    lineHeight: 18,
  },
  fieldLabel: {
    color: appTheme.colors.text,
    fontSize: 13,
    lineHeight: 16,
    fontFamily: appTheme.fonts.bodyMedium,
    marginTop: 2,
  },
  input: {
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    color: appTheme.colors.text,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: appTheme.spacing.sm,
    fontSize: 14,
    lineHeight: 18,
    fontFamily: appTheme.fonts.body,
  },
  row: {
    flexDirection: "row",
    gap: appTheme.spacing.xs,
  },
  choiceRow: {
    gap: appTheme.spacing.xs,
  },
  choice: {
    borderWidth: 1,
    borderColor: appTheme.colors.borderStrong,
    borderRadius: appTheme.radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: appTheme.colors.surfaceMuted,
  },
  choiceSelected: {
    backgroundColor: appTheme.colors.primary,
    borderColor: appTheme.colors.primary,
  },
  choiceText: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 16,
  },
  choiceTextSelected: {
    color: appTheme.colors.onPrimary,
  },
  statusToggleRow: {
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  statusToggleText: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 16,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: appTheme.colors.overlay,
    justifyContent: "center",
    paddingHorizontal: appTheme.spacing.md,
  },
  modalCard: {
    backgroundColor: appTheme.colors.background,
    borderRadius: appTheme.radius.lg,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    padding: appTheme.spacing.md,
    gap: appTheme.spacing.sm,
  },
  modalActions: {
    gap: appTheme.spacing.xs,
  },
});



