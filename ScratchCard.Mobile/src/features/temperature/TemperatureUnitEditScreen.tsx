import React, { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listTemperatureUnits, reorderTemperatureUnits, updateTemperatureUnit } from "../../api/temperatureLogsApi";
import { useAuth } from "../../auth/AuthContext";
import { FloatingLabelInput } from "../../components/FloatingLabelInput";
import { PrimaryButton } from "../../components/PrimaryButton";
import { ScreenContainer } from "../../components/ScreenContainer";
import { LoadingState } from "../../components/LoadingState";
import { toastError } from "../../components/toast";
import { TemperatureEquipmentType } from "../../types/enums";
import { MainStackParamList } from "../../types/navigation";
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

function sanitizeSignedDecimal(raw: string): string {
  let value = raw.replace(/[^0-9.-]/g, "");
  value = value.replace(/(?!^)-/g, "");
  const firstDot = value.indexOf(".");
  if (firstDot !== -1) {
    value = value.slice(0, firstDot + 1) + value.slice(firstDot + 1).replace(/\./g, "");
  }
  return value;
}

type Props = NativeStackScreenProps<MainStackParamList, "TemperatureUnitEdit">;

export function TemperatureUnitEditScreen({ route, navigation }: Props) {
  const { unitId } = route.params;
  const { activeShopId } = useAuth();
  const shopId = activeShopId;
  const queryClient = useQueryClient();

  const unitsQuery = useQuery({
    queryKey: ["temperature-units", shopId],
    queryFn: () => listTemperatureUnits(shopId as string),
    enabled: Boolean(shopId),
  });

  const units = useMemo(() => unitsQuery.data ?? [], [unitsQuery.data]);
  const unit = units.find((x) => x.id === unitId);

  const [unitName, setUnitName] = useState("");
  const [equipmentType, setEquipmentType] = useState<TemperatureEquipmentType>(TemperatureEquipmentType.Fridge);
  const [minTemp, setMinTemp] = useState("0");
  const [maxTemp, setMaxTemp] = useState("5");
  const [location, setLocation] = useState("");
  const [displayOrder, setDisplayOrder] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [initialized, setInitialized] = useState(false);

  // When an order clash is detected, the resolver lists every unit so the operator can set numbers.
  const [showOrderResolver, setShowOrderResolver] = useState(false);
  const [orderDrafts, setOrderDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    if (initialized || !unit) return;
    setUnitName(unit.unitName);
    setEquipmentType(unit.equipmentType);
    setMinTemp(String(unit.minTemperatureCelsius));
    setMaxTemp(String(unit.maxTemperatureCelsius));
    setLocation(unit.location ?? "");
    setDisplayOrder(unit.displayOrder ? String(unit.displayOrder) : "");
    setIsActive(unit.isActive);
    setInitialized(true);
  }, [initialized, unit]);

  function buildDetailPayload() {
    const min = Number(minTemp);
    const max = Number(maxTemp);
    if (Number.isNaN(min) || Number.isNaN(max)) {
      throw new Error("Temperature range must be numeric.");
    }
    if (!unitName.trim()) {
      throw new Error("Unit name is required.");
    }
    return {
      unitName: unitName.trim(),
      equipmentType,
      minTemperatureCelsius: min,
      maxTemperatureCelsius: max,
      isActive,
      location: location.trim() || undefined,
      displayOrder: displayOrder.trim() ? Number(displayOrder) : undefined,
    };
  }

  async function invalidate() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["temperature-units", shopId] }),
      queryClient.invalidateQueries({ queryKey: ["temperature-daily-log", shopId] }),
    ]);
  }

  // Open the all-units order resolver, seeding each unit's current order (this unit gets the value
  // the operator just tried to use).
  function openOrderResolver() {
    const drafts: Record<string, string> = {};
    units.forEach((u) => {
      drafts[u.id] = u.id === unitId ? (displayOrder.trim() || String(u.displayOrder || "")) : String(u.displayOrder || "");
    });
    setOrderDrafts(drafts);
    setShowOrderResolver(true);
  }

  const saveMutation = useMutation({
    mutationFn: async () => updateTemperatureUnit(unitId, buildDetailPayload()),
    onSuccess: async () => {
      await invalidate();
      Alert.alert("Updated", "Temperature unit updated.");
      navigation.goBack();
    },
    onError: (error: any) => {
      if (error?.response?.data?.code === "temperature_unit_order_duplicate") {
        openOrderResolver();
        return;
      }
      toastError(error?.response?.data?.message ?? error?.message ?? "Unable to update unit.");
    },
  });

  // Save the resolved order numbers for all units, then apply this unit's detail changes.
  const resolveOrderMutation = useMutation({
    mutationFn: async () => {
      const items = Object.entries(orderDrafts).map(([id, value]) => ({ unitId: id, displayOrder: Number(value) }));
      if (items.some((x) => !Number.isInteger(x.displayOrder) || x.displayOrder <= 0)) {
        throw new Error("Give every unit a whole order number of 1 or greater.");
      }
      const seen = new Set<number>();
      for (const item of items) {
        if (seen.has(item.displayOrder)) {
          throw new Error(`Order number ${item.displayOrder} is used more than once. Give each unit a different number.`);
        }
        seen.add(item.displayOrder);
      }
      await reorderTemperatureUnits(shopId as string, items);
      setDisplayOrder(String(orderDrafts[unitId] ?? displayOrder));
      return updateTemperatureUnit(unitId, { ...buildDetailPayload(), displayOrder: Number(orderDrafts[unitId]) });
    },
    onSuccess: async () => {
      setShowOrderResolver(false);
      await invalidate();
      Alert.alert("Updated", "Unit and order numbers saved.");
      navigation.goBack();
    },
    onError: (error: any) => {
      toastError(error?.response?.data?.message ?? error?.message ?? "Unable to save order numbers.");
    },
  });

  if (unitsQuery.isLoading) {
    return (
      <ScreenContainer>
        <LoadingState message="Loading unit..." />
      </ScreenContainer>
    );
  }

  if (!unit) {
    return (
      <ScreenContainer>
        <Text style={styles.meta}>Unit not found.</Text>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={ui.card}>
          <Text style={ui.sectionTitle}>Edit unit</Text>
          <FloatingLabelInput label="Unit name" value={unitName} onChangeText={setUnitName} autoCapitalize="words" />

          <Text style={styles.fieldLabel}>Equipment Type</Text>
          <View style={styles.choiceRow}>
            {equipmentTypeOptions.map((option) => (
              <Pressable
                key={option}
                style={[styles.choice, option === equipmentType ? styles.choiceSelected : null]}
                onPress={() => setEquipmentType(option)}
              >
                <Text style={[styles.choiceText, option === equipmentType ? styles.choiceTextSelected : null]}>{option}</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.row}>
            <View style={styles.cell}>
              <FloatingLabelInput
                label="Min °C"
                value={minTemp}
                onChangeText={(value) => setMinTemp(sanitizeSignedDecimal(value))}
                keyboardType="numbers-and-punctuation"
              />
            </View>
            <View style={styles.cell}>
              <FloatingLabelInput
                label="Max °C"
                value={maxTemp}
                onChangeText={(value) => setMaxTemp(sanitizeSignedDecimal(value))}
                keyboardType="numbers-and-punctuation"
              />
            </View>
          </View>

          <FloatingLabelInput label="Location (optional)" value={location} onChangeText={setLocation} autoCapitalize="words" />
          <FloatingLabelInput
            label="Order number"
            value={displayOrder}
            onChangeText={(value) => setDisplayOrder(value.replace(/[^0-9]/g, ""))}
            keyboardType="number-pad"
          />

          <View style={styles.statusRow}>
            <Text style={styles.statusText}>{isActive ? "Active" : "Inactive"}</Text>
            <Switch value={isActive} onValueChange={setIsActive} />
          </View>

          <PrimaryButton
            label={saveMutation.isPending ? "Saving..." : "Save Changes"}
            onPress={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
          />
          <PrimaryButton
            label="Cancel"
            tone="neutral"
            onPress={() => navigation.goBack()}
            disabled={saveMutation.isPending || resolveOrderMutation.isPending}
          />
        </View>

        {showOrderResolver ? (
          <View style={ui.card}>
            <Text style={ui.sectionTitle}>Set order numbers</Text>
            <Text style={styles.meta}>
              That order number is already in use. Give each unit a different number, then save.
            </Text>
            <View style={styles.orderHeaderRow}>
              <Text style={[styles.orderName, styles.orderHeaderText]}>Unit</Text>
              <Text style={[styles.orderCurrent, styles.orderHeaderText]}>Now</Text>
              <Text style={[styles.orderInputHeader, styles.orderHeaderText]}>New</Text>
            </View>
            {units.map((u) => (
              <View key={u.id} style={[styles.orderRow, u.id === unitId ? styles.orderRowActive : null]}>
                <Text style={styles.orderName} numberOfLines={1}>
                  {u.unitName}{u.id === unitId ? " (editing)" : ""}
                </Text>
                <Text style={styles.orderCurrent}>{u.displayOrder || "-"}</Text>
                <View style={styles.orderInput}>
                  <FloatingLabelInput
                    label="Order"
                    value={orderDrafts[u.id] ?? ""}
                    onChangeText={(value) =>
                      setOrderDrafts((prev) => ({ ...prev, [u.id]: value.replace(/[^0-9]/g, "") }))
                    }
                    keyboardType="number-pad"
                  />
                </View>
              </View>
            ))}
            <PrimaryButton
              label={resolveOrderMutation.isPending ? "Saving..." : "Save order numbers"}
              onPress={() => resolveOrderMutation.mutate()}
              disabled={resolveOrderMutation.isPending}
            />
            <PrimaryButton
              label="Cancel"
              tone="neutral"
              onPress={() => setShowOrderResolver(false)}
              disabled={resolveOrderMutation.isPending}
            />
          </View>
        ) : null}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { gap: appTheme.spacing.sm, paddingBottom: appTheme.spacing.lg },
  meta: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 13, lineHeight: 18 },
  fieldLabel: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 17,
  },
  choiceRow: { flexDirection: "row", flexWrap: "wrap", gap: appTheme.spacing.xs },
  choice: {
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: 7,
    borderRadius: appTheme.radius.sm,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    backgroundColor: appTheme.colors.surface,
  },
  choiceSelected: { borderColor: appTheme.colors.primary, backgroundColor: appTheme.colors.surfaceBrandSoft },
  choiceText: { color: appTheme.colors.text, fontFamily: appTheme.fonts.body, fontSize: 13 },
  choiceTextSelected: { color: appTheme.colors.primary, fontFamily: appTheme.fonts.bodyMedium },
  row: { flexDirection: "row", gap: appTheme.spacing.sm },
  cell: { flex: 1 },
  statusRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  statusText: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 14 },
  orderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: appTheme.spacing.sm,
    paddingVertical: 4,
  },
  orderRowActive: {
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceBrandSoft,
    paddingHorizontal: 8,
  },
  orderName: { flex: 1, color: appTheme.colors.text, fontFamily: appTheme.fonts.body, fontSize: 14 },
  orderCurrent: {
    width: 44,
    textAlign: "center",
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 14,
  },
  orderInput: { width: 110 },
  orderHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: appTheme.spacing.sm,
    paddingHorizontal: 8,
    paddingBottom: 2,
  },
  orderHeaderText: {
    color: appTheme.colors.textSubtle,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  orderInputHeader: { width: 110, textAlign: "center" },
});
