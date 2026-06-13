import React, { useMemo, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthContext";
import {
  TillGroup,
  assignFieldGroup,
  createTillGroup,
  deleteTillGroup,
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

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["till-groups", shopId] });
    void qc.invalidateQueries({ queryKey: ["till-field-overrides", shopId] });
    // Open reconciliations re-section on next load.
    void qc.invalidateQueries({ queryKey: ["till-reconciliation"] });
  };

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

      {/* Assign fields to groups */}
      <View style={ui.card}>
        <Text style={ui.sectionTitle}>Assign fields to groups</Text>
        <Text style={ui.caption}>Tap a field to move it into a different group for this shop.</Text>
        {(fieldsQuery.data ?? []).map((f) => {
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
