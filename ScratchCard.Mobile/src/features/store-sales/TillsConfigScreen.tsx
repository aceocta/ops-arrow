import React from "react";
import { Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthContext";
import { createTill, deleteTill, listTills, updateTill } from "../../api/tillsApi";
import { LoadingState } from "../../components/LoadingState";
import { ScreenContainer } from "../../components/ScreenContainer";
import { PrimaryButton } from "../../components/PrimaryButton";
import { EmptyState } from "../../components/EmptyState";
import { Till } from "../../types/models";
import { confirmDestructive } from "../../utils/confirm";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";

export function TillsConfigScreen() {
  const { activeShopId } = useAuth();
  const shopId = activeShopId;
  const queryClient = useQueryClient();

  const tillsQuery = useQuery({
    queryKey: ["tills", shopId, "all"],
    queryFn: () => listTills(shopId as string, true),
    enabled: Boolean(shopId),
  });

  const [newName, setNewName] = React.useState("");
  const [newCode, setNewCode] = React.useState("");
  const [newFloat, setNewFloat] = React.useState("");
  const [editingTill, setEditingTill] = React.useState<Till | null>(null);
  const codeInputRef = React.useRef<TextInput>(null);

  const refreshTills = () => {
    void queryClient.invalidateQueries({ queryKey: ["tills", shopId] });
    void queryClient.invalidateQueries({ queryKey: ["tills", shopId, "all"] });
  };

  const createMutation = useMutation({
    mutationFn: () => createTill({ shopId: shopId as string, name: newName.trim(), code: newCode.trim() || undefined, defaultFloat: Number(newFloat) || 0 }),
    onSuccess: () => {
      setNewName("");
      setNewCode("");
      setNewFloat("");
      void queryClient.invalidateQueries({ queryKey: ["tills", shopId] });
      void queryClient.invalidateQueries({ queryKey: ["tills", shopId, "all"] });
    },
    onError: (error: any) =>
      Alert.alert("Add failed", error?.response?.data?.message ?? "Could not add this till."),
  });

  async function confirmDelete(till: Till) {
    const ok = await confirmDestructive({
      title: "Delete till",
      message: `Remove "${till.name}"? Existing till reports for it stay intact.`,
    });
    if (!ok) return;
    try {
      await deleteTill(till.id);
      void queryClient.invalidateQueries({ queryKey: ["tills", shopId] });
      void queryClient.invalidateQueries({ queryKey: ["tills", shopId, "all"] });
    } catch (error: any) {
      Alert.alert("Delete failed", error?.response?.data?.message ?? "Could not delete this till.");
    }
  }

  async function toggleActive(till: Till) {
    try {
      await updateTill(till.id, { name: till.name, code: till.code, isActive: !till.isActive, defaultFloat: till.defaultFloat });
      void queryClient.invalidateQueries({ queryKey: ["tills", shopId] });
      void queryClient.invalidateQueries({ queryKey: ["tills", shopId, "all"] });
    } catch (error: any) {
      Alert.alert("Update failed", error?.response?.data?.message ?? "Could not update this till.");
    }
  }

  const tills = tillsQuery.data ?? [];
  const canAdd = newName.trim().length > 0 && !createMutation.isPending && Boolean(shopId);

  return (
    <ScreenContainer>
      <View style={ui.card}>
        <Text style={ui.sectionTitle}>Add a till</Text>
        <Text style={ui.caption}>Give each till a unique name (e.g. "Till 1", "Front Counter"). Code is optional.</Text>
        <View style={styles.fieldRow}>
          <TextInput
            style={styles.input}
            value={newName}
            onChangeText={setNewName}
            placeholder="Name"
            placeholderTextColor={appTheme.colors.textSubtle}
            editable={!createMutation.isPending}
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => codeInputRef.current?.focus()}
          />
          <TextInput
            ref={codeInputRef}
            style={[styles.input, styles.codeInput]}
            value={newCode}
            onChangeText={setNewCode}
            placeholder="Code (optional)"
            placeholderTextColor={appTheme.colors.textSubtle}
            editable={!createMutation.isPending}
            returnKeyType="next"
          />
        </View>
        <View style={{ height: 8 }} />
        <TextInput
          style={[styles.input, styles.blockInput]}
          value={newFloat}
          onChangeText={setNewFloat}
          placeholder="Default float (£) — optional"
          placeholderTextColor={appTheme.colors.textSubtle}
          editable={!createMutation.isPending}
          keyboardType="decimal-pad"
          returnKeyType="done"
        />
        <PrimaryButton
          label={createMutation.isPending ? "Adding..." : "Add till"}
          onPress={() => createMutation.mutate()}
          disabled={!canAdd}
        />
      </View>

      <View style={ui.card}>
        <Text style={ui.sectionTitle}>Configured tills</Text>
        {tillsQuery.isLoading ? <LoadingState inline /> : null}
        {!tillsQuery.isLoading && tills.length === 0 ? (
          <EmptyState icon="calculator-outline" title="No tills yet" message="Add your first till using the form above — it powers till reconciliation and store sales." />
        ) : null}
        {tills.map((till) => (
          <View key={till.id} style={[styles.tillRow, !till.isActive ? styles.tillRowInactive : null]}>
            <View style={styles.tillMain}>
              <Text style={styles.tillName}>
                {till.name}
                {till.code ? ` · ${till.code}` : ""}
              </Text>
              <Text style={styles.tillMeta}>{till.isActive ? "Active" : "Inactive"} · Float £{(till.defaultFloat ?? 0).toFixed(2)}</Text>
            </View>
            <View style={styles.tillActions}>
              <Pressable style={styles.iconBtn} onPress={() => setEditingTill(till)}>
                <Ionicons name="create-outline" size={18} color={appTheme.colors.text} />
              </Pressable>
              <Pressable style={styles.iconBtn} onPress={() => void toggleActive(till)}>
                <Ionicons
                  name={till.isActive ? "pause-circle-outline" : "play-circle-outline"}
                  size={18}
                  color={appTheme.colors.text}
                />
              </Pressable>
              <Pressable style={styles.iconBtn} onPress={() => confirmDelete(till)}>
                <Ionicons name="trash-outline" size={17} color={appTheme.colors.danger} />
              </Pressable>
            </View>
          </View>
        ))}
      </View>

      {editingTill ? (
        <EditTillModal
          till={editingTill}
          onClose={() => setEditingTill(null)}
          onSaved={() => { setEditingTill(null); refreshTills(); }}
        />
      ) : null}
    </ScreenContainer>
  );
}

function EditTillModal({ till, onClose, onSaved }: { till: Till; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = React.useState(till.name);
  const [code, setCode] = React.useState(till.code ?? "");
  const [float, setFloat] = React.useState(String(till.defaultFloat ?? 0));

  const saveMutation = useMutation({
    mutationFn: () => updateTill(till.id, {
      name: name.trim(),
      code: code.trim() || undefined,
      isActive: till.isActive,
      defaultFloat: Number(float) || 0,
    }),
    onSuccess: onSaved,
    onError: (error: any) => Alert.alert("Update failed", error?.response?.data?.message ?? "Could not update this till."),
  });

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <Text style={ui.sectionTitle}>Edit till</Text>
            <Pressable onPress={onClose} hitSlop={8}><Ionicons name="close" size={22} color={appTheme.colors.text} /></Pressable>
          </View>
          <TextInput style={[styles.input, styles.blockInput]} value={name} onChangeText={setName} placeholder="Name" placeholderTextColor={appTheme.colors.textSubtle} />
          <View style={{ height: 8 }} />
          <TextInput style={[styles.input, styles.blockInput]} value={code} onChangeText={setCode} placeholder="Code (optional)" placeholderTextColor={appTheme.colors.textSubtle} />
          <View style={{ height: 8 }} />
          <TextInput style={[styles.input, styles.blockInput]} value={float} onChangeText={setFloat} placeholder="Default float (£)" placeholderTextColor={appTheme.colors.textSubtle} keyboardType="decimal-pad" />
          <View style={{ height: 12 }} />
          <PrimaryButton label={saveMutation.isPending ? "Saving..." : "Save changes"} onPress={() => saveMutation.mutate()} disabled={!name.trim() || saveMutation.isPending} />
          <PrimaryButton label="Cancel" tone="neutral" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fieldRow: { flexDirection: "row", gap: 8 },
  input: {
    flex: 1,
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
  codeInput: { flex: 0.7 },
  // styles.input has flex:1 for the add row; in a column (modal / standalone) that collapses to
  // zero height, so column inputs must opt out of flex and stretch to full width instead.
  blockInput: { flex: 0, alignSelf: "stretch" },
  tillRow: {
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
  tillRowInactive: { backgroundColor: appTheme.colors.surfaceMuted },
  tillMain: { flex: 1, gap: 2 },
  tillName: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 14, lineHeight: 18 },
  tillMeta: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 12, lineHeight: 15 },
  tillActions: { flexDirection: "row", gap: 6 },
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
  modalBackdrop: { flex: 1, backgroundColor: appTheme.colors.overlay, justifyContent: "flex-end" },
  modalSheet: { backgroundColor: appTheme.colors.background, borderTopLeftRadius: appTheme.radius.lg, borderTopRightRadius: appTheme.radius.lg, padding: appTheme.spacing.md },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: appTheme.spacing.sm },
});
