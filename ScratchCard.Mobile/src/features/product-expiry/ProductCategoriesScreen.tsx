import React, { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import {
  createProductCategory,
  deleteProductCategory,
  listProductCategories,
  ProductCategory,
  updateProductCategory,
} from "../../api/productExpiryApi";
import { useAuth } from "../../auth/AuthContext";
import { FloatingLabelInput } from "../../components/FloatingLabelInput";
import { LoadingState } from "../../components/LoadingState";
import { ModalBackdropBlur } from "../../components/ModalBackdropBlur";
import { PrimaryButton } from "../../components/PrimaryButton";
import { ScreenContainer } from "../../components/ScreenContainer";
import { StatusBadge } from "../../components/StatusBadge";
import { toastError, toastSuccess } from "../../components/toast";
import { confirmDestructive } from "../../utils/confirm";
import { getApiErrorMessage } from "../../utils/apiErrorMessage";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";

function parseDays(raw: string): number[] {
  return Array.from(new Set(raw.split(/[ ,]+/).map((s) => parseInt(s, 10)).filter((n) => Number.isFinite(n) && n >= 0)))
    .sort((a, b) => b - a);
}

export function ProductCategoriesScreen() {
  const queryClient = useQueryClient();
  const { activeShopId } = useAuth();

  const [editing, setEditing] = useState<ProductCategory | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [name, setName] = useState("");
  const [daysText, setDaysText] = useState("");

  const query = useQuery({
    queryKey: ["product-categories", activeShopId],
    queryFn: () => listProductCategories(activeShopId as string),
    enabled: Boolean(activeShopId),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["product-categories", activeShopId] });

  const saveMutation = useMutation({
    mutationFn: () => {
      const reminderDays = parseDays(daysText);
      if (isNew) {
        return createProductCategory({ shopId: activeShopId as string, name: name.trim(), reminderDays });
      }
      return updateProductCategory({
        id: (editing as ProductCategory).id,
        shopId: activeShopId as string,
        name: name.trim(),
        sortOrder: (editing as ProductCategory).sortOrder,
        isActive: true,
        reminderDays,
      });
    },
    onSuccess: () => {
      toastSuccess(isNew ? "Category created." : "Category updated.");
      closeEditor();
      void invalidate();
    },
    onError: (error: unknown) => toastError(getApiErrorMessage(error, "Unable to save category.")),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteProductCategory(id),
    onSuccess: () => {
      toastSuccess("Category deleted.");
      void invalidate();
    },
    onError: (error: unknown) => toastError(getApiErrorMessage(error, "Unable to delete category.")),
  });

  const openNew = () => {
    setIsNew(true);
    setEditing(null);
    setName("");
    setDaysText("");
  };
  const openEdit = (c: ProductCategory) => {
    setIsNew(false);
    setEditing(c);
    setName(c.name);
    setDaysText(c.reminderDays.join(", "));
  };
  const closeEditor = () => {
    setEditing(null);
    setIsNew(false);
    setName("");
    setDaysText("");
  };

  const editorOpen = isNew || editing !== null;
  const categories = query.data ?? [];

  return (
    <ScreenContainer footer={<PrimaryButton label="New category" onPress={openNew} />}>
      {query.isLoading ? (
        <View style={ui.card}><LoadingState message="Loading categories…" inline /></View>
      ) : (
        <View style={styles.list}>
          {categories.map((c) => (
            <View key={c.id} style={[ui.listItem, styles.row]}>
              <View style={styles.rowMain}>
                <View style={styles.rowTitleRow}>
                  <Text style={styles.rowTitle}>{c.name}</Text>
                  {c.isBuiltIn ? <StatusBadge label="Built-in" tone="neutral" /> : null}
                </View>
                <Text style={styles.rowMeta}>
                  {c.reminderDays.length > 0 ? `Alerts: ${c.reminderDays.map((d) => `${d}d`).join(" · ")}` : "No reminders set"}
                </Text>
              </View>
              {!c.isBuiltIn ? (
                <>
                  <Pressable onPress={() => openEdit(c)} hitSlop={8} accessibilityLabel={`Edit ${c.name}`}>
                    <Ionicons name="create-outline" size={20} color={appTheme.colors.primary} />
                  </Pressable>
                  <Pressable
                    onPress={async () => {
                      const ok = await confirmDestructive({ title: "Delete category?", message: `Delete '${c.name}'?`, confirmLabel: "Delete" });
                      if (ok) deleteMutation.mutate(c.id);
                    }}
                    hitSlop={8}
                    accessibilityLabel={`Delete ${c.name}`}
                  >
                    <Ionicons name="trash-outline" size={20} color={appTheme.colors.danger} />
                  </Pressable>
                </>
              ) : (
                <Ionicons name="lock-closed-outline" size={18} color={appTheme.colors.textSubtle} />
              )}
            </View>
          ))}
        </View>
      )}

      <Modal visible={editorOpen} transparent animationType="fade" onRequestClose={closeEditor}>
        <View style={styles.modalBackdrop}>
          <ModalBackdropBlur />
          <View style={styles.modalCard}>
            <Text style={ui.sectionTitle}>{isNew ? "New category" : "Edit category"}</Text>
            <FloatingLabelInput label="Category name" value={name} onChangeText={setName} autoCapitalize="words" />
            <FloatingLabelInput label="Reminder days (e.g. 7, 3, 0)" value={daysText} onChangeText={setDaysText} keyboardType="numbers-and-punctuation" />
            <Text style={styles.note}>Days before expiry to flag the item — biggest = Expiring Soon, smallest = Urgent.</Text>
            <PrimaryButton
              label={saveMutation.isPending ? "Saving…" : "Save"}
              onPress={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || name.trim().length === 0}
            />
            <PrimaryButton label="Cancel" tone="neutral" onPress={closeEditor} disabled={saveMutation.isPending} />
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  list: { gap: appTheme.spacing.xs },
  row: { flexDirection: "row", alignItems: "center", gap: appTheme.spacing.sm },
  rowMain: { flex: 1, gap: 2 },
  rowTitleRow: { flexDirection: "row", alignItems: "center", gap: appTheme.spacing.xs },
  rowTitle: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 15, lineHeight: 19 },
  rowMeta: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 12, lineHeight: 16 },
  note: { color: appTheme.colors.textSubtle, fontFamily: appTheme.fonts.body, fontSize: 12, lineHeight: 16 },
  modalBackdrop: { flex: 1, justifyContent: "center", padding: appTheme.spacing.md, backgroundColor: appTheme.colors.overlay },
  modalCard: { backgroundColor: appTheme.colors.background, borderRadius: appTheme.radius.lg, padding: appTheme.spacing.md, gap: appTheme.spacing.sm },
});
