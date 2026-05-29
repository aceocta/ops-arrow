import React from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthContext";
import { createTill, deleteTill, listTills, updateTill } from "../../api/tillsApi";
import { ScreenContainer } from "../../components/ScreenContainer";
import { PrimaryButton } from "../../components/PrimaryButton";
import { Till } from "../../types/models";
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

  const createMutation = useMutation({
    mutationFn: () => createTill({ shopId: shopId as string, name: newName.trim(), code: newCode.trim() || undefined }),
    onSuccess: () => {
      setNewName("");
      setNewCode("");
      void queryClient.invalidateQueries({ queryKey: ["tills", shopId] });
      void queryClient.invalidateQueries({ queryKey: ["tills", shopId, "all"] });
    },
    onError: (error: any) =>
      Alert.alert("Add failed", error?.response?.data?.message ?? "Could not add this till."),
  });

  function confirmDelete(till: Till) {
    Alert.alert(
      "Delete till",
      `Remove "${till.name}"? Existing till reports for it stay intact.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteTill(till.id);
              void queryClient.invalidateQueries({ queryKey: ["tills", shopId] });
              void queryClient.invalidateQueries({ queryKey: ["tills", shopId, "all"] });
            } catch (error: any) {
              Alert.alert("Delete failed", error?.response?.data?.message ?? "Could not delete this till.");
            }
          },
        },
      ],
    );
  }

  async function toggleActive(till: Till) {
    try {
      await updateTill(till.id, { name: till.name, code: till.code, isActive: !till.isActive });
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
          />
          <TextInput
            style={[styles.input, styles.codeInput]}
            value={newCode}
            onChangeText={setNewCode}
            placeholder="Code (optional)"
            placeholderTextColor={appTheme.colors.textSubtle}
            editable={!createMutation.isPending}
          />
        </View>
        <PrimaryButton
          label={createMutation.isPending ? "Adding..." : "Add till"}
          onPress={() => createMutation.mutate()}
          disabled={!canAdd}
        />
      </View>

      <View style={ui.card}>
        <Text style={ui.sectionTitle}>Configured tills</Text>
        {tillsQuery.isLoading ? <Text style={ui.bodyText}>Loading…</Text> : null}
        {!tillsQuery.isLoading && tills.length === 0 ? (
          <Text style={ui.bodyText}>No tills yet. Add your first one above.</Text>
        ) : null}
        {tills.map((till) => (
          <View key={till.id} style={[styles.tillRow, !till.isActive ? styles.tillRowInactive : null]}>
            <View style={styles.tillMain}>
              <Text style={styles.tillName}>
                {till.name}
                {till.code ? ` · ${till.code}` : ""}
              </Text>
              <Text style={styles.tillMeta}>{till.isActive ? "Active" : "Inactive"}</Text>
            </View>
            <View style={styles.tillActions}>
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
    </ScreenContainer>
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
});
