import React, { useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createTemperatureUnit, listTemperatureUnits, updateTemperatureUnit } from "../../api/temperatureLogsApi";
import { useAuth } from "../../auth/AuthContext";
import { PrimaryButton } from "../../components/PrimaryButton";
import { ScreenContainer } from "../../components/ScreenContainer";
import { StatusBadge } from "../../components/StatusBadge";
import { TemperatureEquipmentType } from "../../types/enums";
import { TemperatureMonitoringUnit } from "../../types/models";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";

const equipmentTypeOptions: TemperatureEquipmentType[] = [
  TemperatureEquipmentType.Fridge,
  TemperatureEquipmentType.Freezer,
  TemperatureEquipmentType.CoolRoom,
  TemperatureEquipmentType.DisplayChill,
  TemperatureEquipmentType.HotFoodDisplay,
  TemperatureEquipmentType.Other,
];

function formatTemperature(value: number) {
  return `${value.toFixed(1)} C`;
}

export function TemperatureUnitsScreen() {
  const queryClient = useQueryClient();
  const { activeShopId, activeShop, profile } = useAuth();
  const shopId = activeShopId;
  const canManageUnits = profile?.roles?.some((role) => role === "ShopOwner" || role === "Manager") ?? false;

  const [isCreateModalVisible, setIsCreateModalVisible] = useState(false);
  const [newUnitName, setNewUnitName] = useState("");
  const [newEquipmentType, setNewEquipmentType] = useState<TemperatureEquipmentType>(TemperatureEquipmentType.Fridge);
  const [newMinTemp, setNewMinTemp] = useState("0");
  const [newMaxTemp, setNewMaxTemp] = useState("5");
  const [newLocation, setNewLocation] = useState("");
  const [editingUnitId, setEditingUnitId] = useState<string | null>(null);
  const [editUnitName, setEditUnitName] = useState("");
  const [editEquipmentType, setEditEquipmentType] = useState<TemperatureEquipmentType>(TemperatureEquipmentType.Fridge);
  const [editMinTemp, setEditMinTemp] = useState("0");
  const [editMaxTemp, setEditMaxTemp] = useState("5");
  const [editLocation, setEditLocation] = useState("");
  const [editIsActive, setEditIsActive] = useState(true);

  const unitsQuery = useQuery({
    queryKey: ["temperature-units", shopId],
    queryFn: () => listTemperatureUnits(shopId as string),
    enabled: Boolean(shopId),
  });

  const createUnitMutation = useMutation({
    mutationFn: async () => {
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
      });
    },
    onSuccess: async () => {
      setNewUnitName("");
      setNewEquipmentType(TemperatureEquipmentType.Fridge);
      setNewMinTemp("0");
      setNewMaxTemp("5");
      setNewLocation("");
      setIsCreateModalVisible(false);
      Alert.alert("Created", "Temperature unit created.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["temperature-units", shopId] }),
        queryClient.invalidateQueries({ queryKey: ["temperature-daily-log", shopId] }),
      ]);
    },
    onError: (error: any) => {
      Alert.alert("Failed", error?.response?.data?.message ?? error?.message ?? "Unable to create unit.");
    },
  });

  const openEditModal = (unit: TemperatureMonitoringUnit) => {
    setEditingUnitId(unit.id);
    setEditUnitName(unit.unitName);
    setEditEquipmentType(unit.equipmentType);
    setEditMinTemp(String(unit.minTemperatureCelsius));
    setEditMaxTemp(String(unit.maxTemperatureCelsius));
    setEditLocation(unit.location ?? "");
    setEditIsActive(unit.isActive);
  };

  const closeEditModal = () => {
    setEditingUnitId(null);
    setEditUnitName("");
    setEditEquipmentType(TemperatureEquipmentType.Fridge);
    setEditMinTemp("0");
    setEditMaxTemp("5");
    setEditLocation("");
    setEditIsActive(true);
  };

  const updateUnitMutation = useMutation({
    mutationFn: async () => {
      if (!editingUnitId) throw new Error("No unit selected.");

      const min = Number(editMinTemp);
      const max = Number(editMaxTemp);
      if (Number.isNaN(min) || Number.isNaN(max)) {
        throw new Error("Temperature range must be numeric.");
      }

      return updateTemperatureUnit(editingUnitId, {
        unitName: editUnitName.trim(),
        equipmentType: editEquipmentType,
        minTemperatureCelsius: min,
        maxTemperatureCelsius: max,
        isActive: editIsActive,
        location: editLocation.trim() || undefined,
      });
    },
    onSuccess: async () => {
      closeEditModal();
      Alert.alert("Updated", "Temperature unit updated.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["temperature-units", shopId] }),
        queryClient.invalidateQueries({ queryKey: ["temperature-daily-log", shopId] }),
      ]);
    },
    onError: (error: any) => {
      Alert.alert("Failed", error?.response?.data?.message ?? error?.message ?? "Unable to update unit.");
    },
  });

  return (
    <ScreenContainer>
      <View style={styles.hero}>
        <Text style={styles.heroTitle}>Temperature Units</Text>
        <Text style={styles.heroSubtitle}>Shop: {activeShop?.shopName ?? "-"}</Text>
        <Text style={styles.heroNote}>Manage all monitoring units and accepted temperature ranges.</Text>
      </View>

      <View style={ui.card}>
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Units List</Text>
          <Pressable
            style={[styles.addButton, !canManageUnits ? styles.addButtonDisabled : null]}
            onPress={() => setIsCreateModalVisible(true)}
            disabled={!canManageUnits}
          >
            <Text style={styles.addButtonText}>Add New Unit</Text>
          </Pressable>
        </View>
        {!canManageUnits ? <Text style={styles.meta}>Only manager or shop owner can add new units.</Text> : null}

        {(unitsQuery.data ?? []).map((unit) => (
          <View key={unit.id} style={styles.unitItem}>
            <View style={styles.unitHeader}>
              <Text style={styles.unitTitle}>{unit.unitName}</Text>
              <StatusBadge label={unit.isActive ? "Active" : "Inactive"} tone={unit.isActive ? "success" : "neutral"} />
            </View>
            <Text style={styles.meta}>
              {unit.equipmentType}{unit.location ? ` | ${unit.location}` : ""}
            </Text>
            <Text style={styles.meta}>
              Range: {formatTemperature(unit.minTemperatureCelsius)} to {formatTemperature(unit.maxTemperatureCelsius)}
            </Text>
            {canManageUnits ? (
              <View style={styles.unitActions}>
                <Pressable style={styles.editButton} onPress={() => openEditModal(unit)}>
                  <Text style={styles.editButtonText}>Edit Unit</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        ))}
        {!unitsQuery.isFetching && (unitsQuery.data?.length ?? 0) === 0 ? <Text style={styles.meta}>No units found.</Text> : null}
      </View>

      <Modal
        visible={isCreateModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsCreateModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.sectionTitle}>Add New Unit</Text>
            <TextInput
              style={styles.input}
              value={newUnitName}
              onChangeText={setNewUnitName}
              placeholder="Unit name (example: Front Fridge)"
              placeholderTextColor={appTheme.colors.textSubtle}
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
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={newMinTemp}
                onChangeText={setNewMinTemp}
                placeholder="Min C"
                placeholderTextColor={appTheme.colors.textSubtle}
                keyboardType="decimal-pad"
              />
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={newMaxTemp}
                onChangeText={setNewMaxTemp}
                placeholder="Max C"
                placeholderTextColor={appTheme.colors.textSubtle}
                keyboardType="decimal-pad"
              />
            </View>

            <TextInput
              style={styles.input}
              value={newLocation}
              onChangeText={setNewLocation}
              placeholder="Location (optional)"
              placeholderTextColor={appTheme.colors.textSubtle}
            />
            <View style={styles.modalActions}>
              <PrimaryButton
                label={createUnitMutation.isPending ? "Creating..." : "Create Unit"}
                onPress={() => createUnitMutation.mutate()}
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
      </Modal>

      <Modal
        visible={editingUnitId != null}
        transparent
        animationType="fade"
        onRequestClose={closeEditModal}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.sectionTitle}>Edit Unit</Text>
            <TextInput
              style={styles.input}
              value={editUnitName}
              onChangeText={setEditUnitName}
              placeholder="Unit name"
              placeholderTextColor={appTheme.colors.textSubtle}
            />
            <Text style={styles.fieldLabel}>Equipment Type</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choiceRow}>
              {equipmentTypeOptions.map((option) => (
                <Pressable
                  key={option}
                  style={[styles.choice, option === editEquipmentType ? styles.choiceSelected : null]}
                  onPress={() => setEditEquipmentType(option)}
                >
                  <Text style={[styles.choiceText, option === editEquipmentType ? styles.choiceTextSelected : null]}>
                    {option}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            <View style={styles.row}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={editMinTemp}
                onChangeText={setEditMinTemp}
                placeholder="Min C"
                placeholderTextColor={appTheme.colors.textSubtle}
                keyboardType="decimal-pad"
              />
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={editMaxTemp}
                onChangeText={setEditMaxTemp}
                placeholder="Max C"
                placeholderTextColor={appTheme.colors.textSubtle}
                keyboardType="decimal-pad"
              />
            </View>

            <TextInput
              style={styles.input}
              value={editLocation}
              onChangeText={setEditLocation}
              placeholder="Location (optional)"
              placeholderTextColor={appTheme.colors.textSubtle}
            />

            <Text style={styles.fieldLabel}>Status</Text>
            <View style={styles.statusToggleRow}>
              <Text style={styles.statusToggleText}>{editIsActive ? "Active" : "Inactive"}</Text>
              <Switch
                value={editIsActive}
                onValueChange={setEditIsActive}
                trackColor={{ false: appTheme.colors.borderStrong, true: appTheme.colors.primary }}
                thumbColor={appTheme.colors.onPrimary}
              />
            </View>

            <View style={styles.modalActions}>
              <PrimaryButton
                label={updateUnitMutation.isPending ? "Saving..." : "Save Changes"}
                onPress={() => updateUnitMutation.mutate()}
                disabled={updateUnitMutation.isPending}
                size="sm"
              />
              <PrimaryButton
                label="Cancel"
                tone="neutral"
                size="sm"
                onPress={closeEditModal}
                disabled={updateUnitMutation.isPending}
              />
            </View>
          </View>
        </View>
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
    color: "#DCEAF4",
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

