import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addProduct, listProductCategories, ProductDateType } from "../../api/productExpiryApi";
import { useAuth } from "../../auth/AuthContext";
import { DateTimeField, formatDateValue } from "../../components/DateTimeField";
import { FloatingLabelInput } from "../../components/FloatingLabelInput";
import { LoadingState } from "../../components/LoadingState";
import { PrimaryButton } from "../../components/PrimaryButton";
import { ScreenContainer } from "../../components/ScreenContainer";
import { SegmentedControl } from "../../components/SegmentedControl";
import { toastError, toastSuccess } from "../../components/toast";
import { MainStackParamList } from "../../types/navigation";
import { getApiErrorMessage } from "../../utils/apiErrorMessage";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";

function sanitizeMoney(raw: string): string {
  let s = raw.replace(/,/g, ".").replace(/[^\d.]/g, "");
  const dot = s.indexOf(".");
  if (dot !== -1) s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, "").slice(0, 2);
  return s;
}

export function AddProductScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const queryClient = useQueryClient();
  const { activeShopId } = useAuth();

  const [productName, setProductName] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [dateType, setDateType] = useState<ProductDateType>("UseBy");
  const [quantity, setQuantity] = useState("1");
  const [expiryDate, setExpiryDate] = useState(formatDateValue(new Date()));
  const [batchNumber, setBatchNumber] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [unitPrice, setUnitPrice] = useState("");

  const categoriesQuery = useQuery({
    queryKey: ["product-categories", activeShopId],
    queryFn: () => listProductCategories(activeShopId as string),
    enabled: Boolean(activeShopId),
  });
  const categories = useMemo(() => (categoriesQuery.data ?? []).filter((c) => c.isActive), [categoriesQuery.data]);

  const qtyValue = Number(quantity);
  const hasQty = Number.isFinite(qtyValue) && qtyValue > 0;
  const canSave = productName.trim().length > 0 && Boolean(categoryId) && hasQty && expiryDate.length > 0;
  const missing = [
    productName.trim() ? null : "name",
    categoryId ? null : "category",
    hasQty ? null : "quantity",
  ].filter(Boolean) as string[];

  const addMutation = useMutation({
    mutationFn: () =>
      addProduct({
        shopId: activeShopId as string,
        productCategoryId: categoryId as string,
        productName: productName.trim(),
        quantity: Math.floor(qtyValue),
        expiryDate,
        dateType,
        batchNumber: batchNumber.trim() || undefined,
        unitCost: unitCost.trim() ? Number(unitCost) : undefined,
        unitPrice: unitPrice.trim() ? Number(unitPrice) : undefined,
      }),
    onSuccess: () => {
      toastSuccess("Product added.");
      void queryClient.invalidateQueries({ queryKey: ["product-expiry", activeShopId] });
      navigation.goBack();
    },
    onError: (error: unknown) => toastError(getApiErrorMessage(error, "Unable to add product.")),
  });

  return (
    <ScreenContainer
      footer={
        <View style={styles.footer}>
          {missing.length > 0 ? <Text style={styles.footerHint}>Add {missing.join(", ")} to save</Text> : null}
          <PrimaryButton
            label={addMutation.isPending ? "Saving…" : "Add product"}
            onPress={() => addMutation.mutate()}
            disabled={!canSave || addMutation.isPending}
          />
        </View>
      }
    >
      <View style={[ui.card, styles.card]}>
        <FloatingLabelInput label="Product name" value={productName} onChangeText={setProductName} autoCapitalize="words" />

        <Text style={styles.fieldLabel}>Category</Text>
        {categoriesQuery.isLoading ? (
          <LoadingState message="Loading categories…" inline />
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {categories.map((c) => {
              const selected = c.id === categoryId;
              return (
                <Pressable
                  key={c.id}
                  style={[styles.chip, selected ? styles.chipSelected : null]}
                  onPress={() => setCategoryId(c.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                >
                  <Text style={[styles.chipText, selected ? styles.chipTextSelected : null]}>{c.name}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        <Text style={styles.fieldLabel}>Date type</Text>
        <SegmentedControl
          options={[
            { value: "UseBy", label: "Use by" },
            { value: "BestBefore", label: "Best before" },
          ]}
          value={dateType}
          onChange={setDateType}
        />

        <Text style={styles.fieldLabel}>Expiry date</Text>
        <DateTimeField mode="date" value={expiryDate} onChange={setExpiryDate} />

        <View style={styles.row}>
          <View style={styles.cell}>
            <FloatingLabelInput label="Quantity" value={quantity} onChangeText={(v) => setQuantity(v.replace(/[^0-9]/g, ""))} keyboardType="number-pad" />
          </View>
          <View style={styles.cell}>
            <FloatingLabelInput label="Batch # (optional)" value={batchNumber} onChangeText={setBatchNumber} />
          </View>
        </View>

        <View style={styles.row}>
          <View style={styles.cell}>
            <FloatingLabelInput label="Unit cost (optional)" prefix="£" value={unitCost} onChangeText={(v) => setUnitCost(sanitizeMoney(v))} keyboardType="decimal-pad" />
          </View>
          <View style={styles.cell}>
            <FloatingLabelInput label="Unit price (optional)" prefix="£" value={unitPrice} onChangeText={(v) => setUnitPrice(sanitizeMoney(v))} keyboardType="decimal-pad" />
          </View>
        </View>
        <Text style={styles.note}>Cost/price are optional — used for the waste &amp; saved‑value report.</Text>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  card: { gap: appTheme.spacing.sm },
  fieldLabel: { color: appTheme.colors.text, fontSize: 13, lineHeight: 16, fontFamily: appTheme.fonts.bodyMedium, marginTop: 2 },
  chips: { gap: appTheme.spacing.xs, paddingVertical: 2 },
  chip: {
    borderWidth: 1, borderColor: appTheme.colors.primary, borderRadius: appTheme.radius.pill,
    paddingHorizontal: 12, paddingVertical: 7,
  },
  chipSelected: { backgroundColor: appTheme.colors.primary },
  chipText: { color: appTheme.colors.primary, fontFamily: appTheme.fonts.bodyMedium, fontSize: 13 },
  chipTextSelected: { color: appTheme.colors.onPrimary },
  row: { flexDirection: "row", gap: appTheme.spacing.sm },
  cell: { flex: 1 },
  note: { color: appTheme.colors.textSubtle, fontFamily: appTheme.fonts.body, fontSize: 12, lineHeight: 16 },
  footer: { gap: appTheme.spacing.xs },
  footerHint: { color: appTheme.colors.textMuted, fontSize: 12, lineHeight: 16, fontFamily: appTheme.fonts.body },
});
