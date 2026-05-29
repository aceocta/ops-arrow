import React from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthContext";
import {
  createShopPaymentType,
  deleteShopPaymentType,
  listShopPaymentTypes,
  seedShopPaymentTypeDefaults,
  updateShopPaymentType,
} from "../../api/shopPaymentTypesApi";
import { ScreenContainer } from "../../components/ScreenContainer";
import { PrimaryButton } from "../../components/PrimaryButton";
import { ShopPaymentType } from "../../types/models";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";

export function PaymentTypesConfigScreen() {
  const { activeShopId } = useAuth();
  const shopId = activeShopId;
  const queryClient = useQueryClient();

  const typesQuery = useQuery({
    queryKey: ["shop-payment-types", shopId, "all"],
    queryFn: () => listShopPaymentTypes(shopId as string, true),
    enabled: Boolean(shopId),
  });

  const [name, setName] = React.useState("");
  const [keywords, setKeywords] = React.useState("");

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["shop-payment-types", shopId] });
    void queryClient.invalidateQueries({ queryKey: ["shop-payment-types", shopId, "all"] });
  };

  const createMutation = useMutation({
    mutationFn: () =>
      createShopPaymentType({
        shopId: shopId as string,
        name: name.trim(),
        keywords: keywords.trim() || undefined,
      }),
    onSuccess: () => {
      setName("");
      setKeywords("");
      invalidate();
    },
    onError: (error: any) =>
      Alert.alert("Add failed", error?.response?.data?.message ?? "Could not add this payment type."),
  });

  const seedDefaultsMutation = useMutation({
    mutationFn: () => seedShopPaymentTypeDefaults(shopId as string),
    onSuccess: () => invalidate(),
    onError: (error: any) =>
      Alert.alert("Seed failed", error?.response?.data?.message ?? "Could not seed default payment types."),
  });

  async function toggleActive(type: ShopPaymentType) {
    try {
      await updateShopPaymentType(type.id, {
        name: type.name,
        code: type.code,
        keywords: type.keywords,
        sortOrder: type.sortOrder,
        isActive: !type.isActive,
      });
      invalidate();
    } catch (error: any) {
      Alert.alert("Update failed", error?.response?.data?.message ?? "Could not update this payment type.");
    }
  }

  function confirmDelete(type: ShopPaymentType) {
    Alert.alert(
      "Delete payment type",
      `Remove "${type.name}"? Existing till-report payments stay readable.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteShopPaymentType(type.id);
              invalidate();
            } catch (error: any) {
              Alert.alert("Delete failed", error?.response?.data?.message ?? "Could not delete this payment type.");
            }
          },
        },
      ],
    );
  }

  const types = typesQuery.data ?? [];
  const canAdd = name.trim().length > 0 && !createMutation.isPending && Boolean(shopId);

  return (
    <ScreenContainer>
      <View style={ui.card}>
        <Text style={ui.sectionTitle}>Add a payment type</Text>
        <Text style={ui.caption}>
          Name shows on reports (e.g. "Cash", "Card", "Cheque"). Keywords help auto-detect tender lines from a till
          report — comma-separated, e.g. "card, visa, mastercard, debit".
        </Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="Name"
          placeholderTextColor={appTheme.colors.textSubtle}
          editable={!createMutation.isPending}
        />
        <TextInput
          style={styles.input}
          value={keywords}
          onChangeText={setKeywords}
          placeholder="Keywords (optional)"
          placeholderTextColor={appTheme.colors.textSubtle}
          editable={!createMutation.isPending}
        />
        <PrimaryButton
          label={createMutation.isPending ? "Adding..." : "Add payment type"}
          onPress={() => createMutation.mutate()}
          disabled={!canAdd}
        />
      </View>

      <View style={ui.card}>
        <Text style={ui.sectionTitle}>Configured payment types</Text>
        {typesQuery.isLoading ? <Text style={ui.bodyText}>Loading…</Text> : null}
        {!typesQuery.isLoading && types.length === 0 ? (
          <>
            <Text style={ui.bodyText}>None yet — start with the common defaults below or add your own above.</Text>
            <PrimaryButton
              tone="neutral"
              label={seedDefaultsMutation.isPending ? "Adding..." : "Add common defaults"}
              onPress={() => seedDefaultsMutation.mutate()}
              disabled={seedDefaultsMutation.isPending}
            />
            <Text style={ui.caption}>Cash · Card · Credit Card · Fuel Card · Cheque (you can edit or delete any).</Text>
          </>
        ) : null}
        {types.map((type) => (
          <View key={type.id} style={[styles.row, !type.isActive ? styles.rowInactive : null]}>
            <View style={styles.rowMain}>
              <Text style={styles.rowName}>{type.name}</Text>
              <Text style={styles.rowMeta}>
                {type.isActive ? "Active" : "Inactive"}
                {type.keywords ? ` · ${type.keywords}` : ""}
              </Text>
            </View>
            <View style={styles.rowActions}>
              <Pressable style={styles.iconBtn} onPress={() => void toggleActive(type)}>
                <Ionicons
                  name={type.isActive ? "pause-circle-outline" : "play-circle-outline"}
                  size={18}
                  color={appTheme.colors.text}
                />
              </Pressable>
              <Pressable style={styles.iconBtn} onPress={() => confirmDelete(type)}>
                <Ionicons name="trash-outline" size={17} color={appTheme.colors.danger} />
              </Pressable>
            </View>
          </View>
        ))}
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
});
