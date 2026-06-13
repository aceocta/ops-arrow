import React, { useMemo, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthContext";
import {
  CashEffect,
  TillGroup,
  TillShopField,
  assignFieldGroup,
  createShopField,
  createTillGroup,
  deleteShopField,
  deleteTillGroup,
  listShopFields,
  listTillFieldOverrides,
  listTillFields,
  listTillGroups,
  updateTillGroup,
} from "../../api/tillGroupsApi";
import { FieldCode } from "../../api/tillReconciliationApi";
import { LoadingState } from "../../components/LoadingState";
import { ScreenContainer } from "../../components/ScreenContainer";
import { PrimaryButton } from "../../components/PrimaryButton";
import { confirmDestructive } from "../../utils/confirm";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";

export function TillGroupsConfigScreen() {
  const { activeShopId } = useAuth();
  const shopId = activeShopId as string;
  const qc = useQueryClient();

  const groupsQuery = useQuery({ queryKey: ["till-groups", shopId], queryFn: () => listTillGroups(shopId), enabled: Boolean(shopId) });
  const fieldsQuery = useQuery({ queryKey: ["till-fields-flat"], queryFn: () => listTillFields(), enabled: Boolean(shopId) });
  const overridesQuery = useQuery({ queryKey: ["till-field-overrides", shopId], queryFn: () => listTillFieldOverrides(shopId), enabled: Boolean(shopId) });

  const groups = useMemo(() => (groupsQuery.data ?? []).filter((g) => g.isActive), [groupsQuery.data]);
  const groupName = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of groupsQuery.data ?? []) m.set(g.code, g.displayName);
    return m;
  }, [groupsQuery.data]);
  // Current per-shop group code for each field: its override, else its built-in default.
  const overrideByField = useMemo(() => {
    const m = new Map<string, string | null | undefined>();
    for (const o of overridesQuery.data ?? []) m.set(o.canonicalField, o.groupCode);
    return m;
  }, [overridesQuery.data]);

  const shopFieldsQuery = useQuery({ queryKey: ["till-shop-fields", shopId], queryFn: () => listShopFields(shopId), enabled: Boolean(shopId) });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["till-groups", shopId] });
    void qc.invalidateQueries({ queryKey: ["till-field-overrides", shopId] });
    void qc.invalidateQueries({ queryKey: ["till-shop-fields", shopId] });
    // Picker + open reconciliations refresh so the new field is selectable / re-sections.
    void qc.invalidateQueries({ queryKey: ["till-fields", shopId] });
    void qc.invalidateQueries({ queryKey: ["till-fields-flat"] });
    void qc.invalidateQueries({ queryKey: ["till-reconciliation"] });
  };

  // ---- Create / delete custom fields ----
  const [fieldName, setFieldName] = useState("");
  const [fieldGroupCode, setFieldGroupCode] = useState<string>("");
  const [fieldEffect, setFieldEffect] = useState<CashEffect>("Out");
  const createFieldM = useMutation({
    mutationFn: () => createShopField({ shopId, displayName: fieldName.trim(), groupCode: fieldGroupCode || groups[0]?.code || "Movement", cashEffect: fieldEffect }),
    onSuccess: () => { setFieldName(""); invalidate(); },
    onError: (e: any) => Alert.alert("Add failed", e?.response?.data?.message ?? "Could not add this field."),
  });

  async function confirmDeleteField(f: TillShopField) {
    const ok = await confirmDestructive({
      title: "Delete field",
      message: `Remove "${f.displayName}"? Past reconciliations that used it stay readable.`,
    });
    if (!ok) return;
    try {
      await deleteShopField(f.id);
      invalidate();
    } catch (e: any) {
      Alert.alert("Delete failed", e?.response?.data?.message ?? "Could not delete this field.");
    }
  }

  const effectLabel = (e: CashEffect) => (e === "In" ? "Money in" : e === "Out" ? "Money out" : "No cash effect");

  // ---- Create / rename / delete groups ----
  const [newName, setNewName] = useState("");
  const createM = useMutation({
    mutationFn: () => createTillGroup({ shopId, displayName: newName.trim() }),
    onSuccess: () => { setNewName(""); invalidate(); },
    onError: (e: any) => Alert.alert("Add failed", e?.response?.data?.message ?? "Could not add this group."),
  });

  const [editing, setEditing] = useState<TillGroup | null>(null);
  const [editName, setEditName] = useState("");
  const renameM = useMutation({
    mutationFn: () => updateTillGroup({ id: editing!.id, displayName: editName.trim(), sortOrder: editing!.sortOrder, isActive: true }),
    onSuccess: () => { setEditing(null); invalidate(); },
    onError: (e: any) => Alert.alert("Rename failed", e?.response?.data?.message ?? "Could not rename this group."),
  });

  async function confirmDelete(g: TillGroup) {
    const ok = await confirmDestructive({
      title: "Delete group",
      message: `Remove "${g.displayName}"? Any fields assigned to it move back to their default group.`,
    });
    if (!ok) return;
    try {
      await deleteTillGroup(g.id);
      invalidate();
    } catch (e: any) {
      Alert.alert("Delete failed", e?.response?.data?.message ?? "Could not delete this group.");
    }
  }

  // ---- Assign a field to a group ----
  const [assignTarget, setAssignTarget] = useState<{ code: FieldCode; name: string; defaultCode: string } | null>(null);
  const assignM = useMutation({
    mutationFn: (groupCode: string | null) => assignFieldGroup({ shopId, canonicalField: assignTarget!.code, groupCode }),
    onSuccess: () => { setAssignTarget(null); invalidate(); },
    onError: (e: any) => Alert.alert("Couldn't move field", e?.response?.data?.message ?? "Please try again."),
  });

  const loading = groupsQuery.isLoading || fieldsQuery.isLoading || overridesQuery.isLoading;
  const customGroups = groups.filter((g) => !g.isBuiltIn);

  return (
    <ScreenContainer>
      {/* Create a group */}
      <View style={ui.card}>
        <Text style={ui.sectionTitle}>Add a group</Text>
        <Text style={ui.caption}>
          Groups are the sections your till lines are organised into on the reconciliation screen — e.g. "Cash movement",
          "Totals". Create your own, then assign fields to them below.
        </Text>
        <TextInput
          style={styles.input}
          value={newName}
          onChangeText={setNewName}
          placeholder="Group name"
          placeholderTextColor={appTheme.colors.textSubtle}
          editable={!createM.isPending}
          returnKeyType="done"
          onSubmitEditing={() => newName.trim() && createM.mutate()}
        />
        <PrimaryButton
          label={createM.isPending ? "Adding…" : "Add group"}
          onPress={() => createM.mutate()}
          disabled={!newName.trim() || createM.isPending || !shopId}
        />
      </View>

      {/* Groups list */}
      <View style={ui.card}>
        <Text style={ui.sectionTitle}>Groups</Text>
        {loading ? <LoadingState inline /> : null}
        {groups.map((g) => (
          <View key={g.code} style={styles.row}>
            <View style={styles.rowMain}>
              <Text style={styles.rowName}>{g.displayName}</Text>
              <Text style={styles.rowMeta}>{g.isBuiltIn ? "Built-in" : "Custom"}</Text>
            </View>
            {!g.isBuiltIn ? (
              <View style={styles.rowActions}>
                <Pressable style={styles.iconBtn} onPress={() => { setEditing(g); setEditName(g.displayName); }}>
                  <Ionicons name="create-outline" size={17} color={appTheme.colors.text} />
                </Pressable>
                <Pressable style={styles.iconBtn} onPress={() => confirmDelete(g)}>
                  <Ionicons name="trash-outline" size={17} color={appTheme.colors.danger} />
                </Pressable>
              </View>
            ) : null}
          </View>
        ))}
        {!loading && customGroups.length === 0 ? (
          <Text style={ui.caption}>No custom groups yet — add one above. Built-in groups always stay available.</Text>
        ) : null}
      </View>

      {/* Custom fields */}
      <View style={ui.card}>
        <Text style={ui.sectionTitle}>Custom fields</Text>
        <Text style={ui.caption}>
          Add your own till line (e.g. "Wages from till"). "Money out" reduces the expected drawer, "Money in" adds to
          it, "No cash effect" just records a figure. Pick which group it appears under.
        </Text>
        <TextInput
          style={styles.input}
          value={fieldName}
          onChangeText={setFieldName}
          placeholder="Field name"
          placeholderTextColor={appTheme.colors.textSubtle}
          editable={!createFieldM.isPending}
        />

        {/* Cash effect */}
        <View style={styles.segment}>
          {(["Out", "In", "None"] as CashEffect[]).map((e) => (
            <Pressable
              key={e}
              style={[styles.segmentBtn, fieldEffect === e ? styles.segmentBtnActive : null]}
              onPress={() => setFieldEffect(e)}
            >
              <Text style={[styles.segmentText, fieldEffect === e ? styles.segmentTextActive : null]}>{effectLabel(e)}</Text>
            </Pressable>
          ))}
        </View>

        {/* Group picker */}
        <Text style={[ui.caption, { marginTop: 2 }]}>Group</Text>
        <View style={styles.chipsWrap}>
          {groups.map((g) => {
            const sel = (fieldGroupCode || groups[0]?.code) === g.code;
            return (
              <Pressable key={g.code} style={[styles.chip, sel ? styles.chipActive : null]} onPress={() => setFieldGroupCode(g.code)}>
                <Text style={[styles.chipText, sel ? styles.chipTextActive : null]}>{g.displayName}</Text>
              </Pressable>
            );
          })}
        </View>

        <PrimaryButton
          label={createFieldM.isPending ? "Adding…" : "Add field"}
          onPress={() => createFieldM.mutate()}
          disabled={!fieldName.trim() || createFieldM.isPending || !shopId}
        />

        {(shopFieldsQuery.data ?? []).map((f) => (
          <View key={f.id} style={styles.row}>
            <View style={styles.rowMain}>
              <Text style={styles.rowName}>{f.displayName}</Text>
              <Text style={styles.rowMeta}>{effectLabel(f.cashEffect)} · {groupName.get(f.groupCode) ?? f.groupCode}</Text>
            </View>
            <Pressable style={styles.iconBtn} onPress={() => confirmDeleteField(f)}>
              <Ionicons name="trash-outline" size={17} color={appTheme.colors.danger} />
            </Pressable>
          </View>
        ))}
        {!loading && (shopFieldsQuery.data?.length ?? 0) === 0 ? (
          <Text style={ui.caption}>No custom fields yet.</Text>
        ) : null}
      </View>

      {/* Assign fields to groups */}
      <View style={ui.card}>
        <Text style={ui.sectionTitle}>Assign fields to groups</Text>
        <Text style={ui.caption}>Tap a field to move it into a different group for this shop. (Custom fields set their group above.)</Text>
        {(fieldsQuery.data ?? []).filter((f) => f.isBuiltIn).map((f) => {
          const currentCode = overrideByField.get(f.code) ?? f.groupCode;
          const currentName = groupName.get(currentCode) ?? f.groupName ?? currentCode;
          return (
            <Pressable
              key={f.code}
              style={styles.row}
              onPress={() => setAssignTarget({ code: f.code, name: f.displayName, defaultCode: f.groupCode })}
            >
              <View style={styles.rowMain}>
                <Text style={styles.rowName}>{f.displayName}</Text>
                <Text style={styles.rowMeta}>{currentName}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={appTheme.colors.textSubtle} />
            </Pressable>
          );
        })}
      </View>

      {/* Rename modal */}
      <Modal visible={editing !== null} transparent animationType="fade" onRequestClose={() => setEditing(null)}>
        <Pressable style={styles.backdrop} onPress={() => setEditing(null)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={ui.sectionTitle}>Rename group</Text>
            <TextInput
              style={styles.input}
              value={editName}
              onChangeText={setEditName}
              placeholder="Group name"
              placeholderTextColor={appTheme.colors.textSubtle}
              autoFocus
            />
            <PrimaryButton
              label={renameM.isPending ? "Saving…" : "Save"}
              onPress={() => renameM.mutate()}
              disabled={!editName.trim() || renameM.isPending}
            />
            <PrimaryButton tone="neutral" label="Cancel" onPress={() => setEditing(null)} disabled={renameM.isPending} />
          </Pressable>
        </Pressable>
      </Modal>

      {/* Assign-to-group picker */}
      <Modal visible={assignTarget !== null} transparent animationType="slide" onRequestClose={() => setAssignTarget(null)}>
        <Pressable style={styles.backdrop} onPress={() => setAssignTarget(null)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={ui.sectionTitle}>Move "{assignTarget?.name}" to…</Text>
            <ScrollView style={{ maxHeight: 360 }}>
              {groups.map((g) => {
                const isDefault = g.code === assignTarget?.defaultCode;
                return (
                  <Pressable
                    key={g.code}
                    style={styles.pickRow}
                    onPress={() => assignM.mutate(isDefault ? null : g.code)}
                    disabled={assignM.isPending}
                  >
                    <Text style={styles.rowName}>{g.displayName}</Text>
                    {isDefault ? <Text style={styles.rowMeta}>Default</Text> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
            <PrimaryButton tone="neutral" label="Cancel" onPress={() => setAssignTarget(null)} disabled={assignM.isPending} />
          </Pressable>
        </Pressable>
      </Modal>
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
  segment: { flexDirection: "row", gap: 6, marginTop: 4 },
  segmentBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
    borderRadius: appTheme.radius.sm,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    backgroundColor: appTheme.colors.surfaceMuted,
  },
  segmentBtnActive: { borderColor: appTheme.colors.primary, backgroundColor: appTheme.colors.surfaceBrandMuted },
  segmentText: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 12 },
  segmentTextActive: { color: appTheme.colors.primary, fontFamily: appTheme.fonts.bodyMedium },
  chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 2 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: appTheme.radius.pill,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    backgroundColor: appTheme.colors.surface,
  },
  chipActive: { borderColor: appTheme.colors.primary, backgroundColor: appTheme.colors.surfaceBrandMuted },
  chipText: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 12 },
  chipTextActive: { color: appTheme.colors.primary, fontFamily: appTheme.fonts.bodyMedium },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", padding: 24 },
  sheet: { backgroundColor: appTheme.colors.surface, borderRadius: appTheme.radius.md, padding: 16, gap: 10 },
  pickRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: appTheme.colors.borderSoft,
    gap: 8,
  },
});
