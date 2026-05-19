import React, { useEffect, useMemo, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { NestableDraggableFlatList, NestableScrollContainer } from "react-native-draggable-flatlist";
import {
  closeComplianceCheckAction,
  createComplianceCheckGroup,
  createComplianceCheckItem,
  getComplianceActionReport,
  getComplianceCheckPeriodLog,
  listComplianceCheckConfig,
  reorderComplianceCheckGroups,
  reorderComplianceCheckItems,
  upsertComplianceCheckEntry,
  updateComplianceCheckGroup,
  updateComplianceCheckItem,
} from "../../api/complianceChecksApi";
import { useAuth } from "../../auth/AuthContext";
import { DateTimeField, formatDateValue } from "../../components/DateTimeField";
import { ModalBackdropBlur } from "../../components/ModalBackdropBlur";
import { PrimaryButton } from "../../components/PrimaryButton";
import { ScreenContainer } from "../../components/ScreenContainer";
import { StatusBadge } from "../../components/StatusBadge";
import { MainStackParamList } from "../../types/navigation";
import {
  ComplianceActionReportRow,
  ComplianceCheckEntry,
  ComplianceCheckFrequency,
  ComplianceCheckGroup,
  ComplianceCheckItem,
  ComplianceCheckPeriodRow,
  ComplianceCheckResult,
} from "../../types/models";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";

type EntryDraft = {
  result: ComplianceCheckResult;
  notes: string;
  actionRequired: string;
};

type NoteEditorState = {
  itemId: string;
  field: "notes" | "actionRequired";
  title: string;
} | null;

type GroupFormState = {
  id?: string;
  frequency: ComplianceCheckFrequency;
  groupName: string;
  description: string;
  isActive: boolean;
};

type ItemFormState = {
  id?: string;
  complianceCheckGroupId: string;
  itemName: string;
  description: string;
  isRequired: boolean;
  isActive: boolean;
};

type CloseActionState = {
  entryId: string;
  itemName: string;
} | null;

const frequencyOptions: ComplianceCheckFrequency[] = ["Daily", "Weekly", "Monthly"];

const initialGroupForm: GroupFormState = {
  frequency: "Daily",
  groupName: "",
  description: "",
  isActive: true,
};

const initialItemForm: ItemFormState = {
  complianceCheckGroupId: "",
  itemName: "",
  description: "",
  isRequired: true,
  isActive: true,
};

function formatDay(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString();
}

function formatDateTime(value?: string) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return `${parsed.toLocaleDateString()} ${parsed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

function resolveResultTone(result: ComplianceCheckResult): "success" | "danger" | "warning" {
  if (result === "Compliant") return "success";
  if (result === "NonCompliant") return "danger";
  return "warning";
}

function normalizeGroups(groups: ComplianceCheckGroup[]) {
  return groups
    .slice()
    .sort((a, b) => a.displayOrder - b.displayOrder || a.groupName.localeCompare(b.groupName))
    .map((group) => ({
      ...group,
      items: group.items.slice().sort((a, b) => a.displayOrder - b.displayOrder || a.itemName.localeCompare(b.itemName)),
    }));
}

function isManagerLike(roles: string[]) {
  return roles.includes("PlatformAdmin") || roles.includes("ShopOwner") || roles.includes("Manager");
}

function flattenRows(groups: { rows: ComplianceCheckPeriodRow[] }[]) {
  return groups.flatMap((group) => group.rows);
}

export function ComplianceChecksScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const queryClient = useQueryClient();
  const { activeShopId, profile } = useAuth();
  const shopId = activeShopId;
  const userRoles = profile?.roles ?? [];
  const canManage = isManagerLike(userRoles);

  const [frequency, setFrequency] = useState<ComplianceCheckFrequency>("Daily");
  const [selectedDate, setSelectedDate] = useState(formatDateValue(new Date()));
  const [drafts, setDrafts] = useState<Record<string, EntryDraft>>({});
  const [editorState, setEditorState] = useState<NoteEditorState>(null);
  const [editorValue, setEditorValue] = useState("");

  const logQuery = useQuery({
    queryKey: ["compliance-period-log", shopId, frequency, selectedDate],
    queryFn: () => getComplianceCheckPeriodLog(shopId as string, frequency, selectedDate),
    enabled: Boolean(shopId),
  });

  const periodGroups = logQuery.data?.groups ?? [];
  const allRows = useMemo(() => flattenRows(periodGroups), [periodGroups]);
  const rowByItemId = useMemo(() => {
    const next: Record<string, ComplianceCheckPeriodRow> = {};
    for (const row of allRows) {
      next[row.item.id] = row;
    }
    return next;
  }, [allRows]);

  useEffect(() => {
    const nextDrafts: Record<string, EntryDraft> = {};
    for (const row of allRows) {
      nextDrafts[row.item.id] = {
        result: row.entry?.result ?? "Pending",
        notes: row.entry?.notes ?? "",
        actionRequired: row.entry?.actionRequired ?? "",
      };
    }
    setDrafts(nextDrafts);
  }, [allRows]);

  const saveMutation = useMutation({
    mutationFn: async (input: { item: ComplianceCheckItem; draft: EntryDraft }) => {
      if (!shopId) throw new Error("No shop selected.");
      return upsertComplianceCheckEntry({
        shopId,
        complianceCheckItemId: input.item.id,
        date: selectedDate,
        result: input.draft.result,
        notes: input.draft.notes.trim() || undefined,
        actionRequired: input.draft.actionRequired.trim() || undefined,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["compliance-period-log", shopId, frequency, selectedDate] });
    },
    onError: (error: any) => {
      Alert.alert("Failed", error?.response?.data?.message ?? error?.message ?? "Unable to save compliance check.");
    },
  });

  function getDraft(itemId: string): EntryDraft {
    return drafts[itemId] ?? { result: "Pending", notes: "", actionRequired: "" };
  }

  function updateDraft(itemId: string, patch: Partial<EntryDraft>) {
    setDrafts((previous) => ({
      ...previous,
      [itemId]: {
        ...(previous[itemId] ?? { result: "Pending", notes: "", actionRequired: "" }),
        ...patch,
      },
    }));
  }

  function openEditor(itemId: string, field: "notes" | "actionRequired", itemName: string) {
    const draft = getDraft(itemId);
    setEditorState({
      itemId,
      field,
      title: `${field === "notes" ? "Notes" : "Action Required"} - ${itemName}`,
    });
    setEditorValue(field === "notes" ? draft.notes : draft.actionRequired);
  }

  function applyEditor() {
    if (!editorState) return;
    const currentDraft = getDraft(editorState.itemId);
    const nextDraft: EntryDraft =
      editorState.field === "notes"
        ? { ...currentDraft, notes: editorValue }
        : { ...currentDraft, actionRequired: editorValue };

    if (editorState.field === "notes") {
      updateDraft(editorState.itemId, { notes: nextDraft.notes });
    } else {
      updateDraft(editorState.itemId, { actionRequired: nextDraft.actionRequired });
    }

    if (editorState.field === "actionRequired" && nextDraft.result === "NonCompliant") {
      const row = rowByItemId[editorState.itemId];
      if (row) {
        saveMutation.mutate({ item: row.item, draft: nextDraft });
      }
    }
    setEditorState(null);
    setEditorValue("");
  }

  function saveDraftForItem(item: ComplianceCheckItem, draft: EntryDraft, openActionEditorOnMissing = false) {
    if (draft.result === "NonCompliant" && !draft.actionRequired.trim()) {
      Alert.alert("Action Required", "Please provide action required for non-compliant check.");
      if (openActionEditorOnMissing) {
        openEditor(item.id, "actionRequired", item.itemName);
      }
      return;
    }

    saveMutation.mutate({ item, draft });
  }

  function onSelectResult(row: ComplianceCheckPeriodRow, result: ComplianceCheckResult) {
    const nextDraft: EntryDraft = { ...getDraft(row.item.id), result };
    updateDraft(row.item.id, { result });
    saveDraftForItem(row.item, nextDraft, result === "NonCompliant");
  }

  const summary = useMemo(() => {
    const total = allRows.length;
    let completed = 0;
    let nonCompliant = 0;
    for (const row of allRows) {
      const draft = getDraft(row.item.id);
      if (draft.result !== "Pending") completed += 1;
      if (draft.result === "NonCompliant") nonCompliant += 1;
    }
    return { total, completed, nonCompliant, pending: Math.max(total - completed, 0) };
  }, [allRows, drafts]);

  if (!shopId) {
    return (
      <ScreenContainer>
        <View style={ui.card}>
          <Text style={styles.pageTitle}>Compliance Checks</Text>
          <Text style={styles.meta}>Select a shop to load compliance checks.</Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.heroCard}>
          <View style={styles.heroHead}>
            <View style={{ flex: 1 }}>
              <Text style={styles.pageTitle}>Compliance Checks</Text>
              <Text style={styles.meta}>Digital Daily/Weekly/Monthly operational checks by group.</Text>
            </View>
            <StatusBadge label={frequency} tone="neutral" />
          </View>
          <View style={styles.summaryRow}>
            <View style={styles.summaryTile}>
              <Text style={styles.summaryValue}>{summary.completed}</Text>
              <Text style={styles.summaryLabel}>Completed</Text>
            </View>
            <View style={styles.summaryTile}>
              <Text style={styles.summaryValue}>{summary.pending}</Text>
              <Text style={styles.summaryLabel}>Pending</Text>
            </View>
            <View style={styles.summaryTile}>
              <Text style={styles.summaryValue}>{summary.nonCompliant}</Text>
              <Text style={styles.summaryLabel}>Non-Compliant</Text>
            </View>
          </View>
          <View style={styles.row}>
            <Pressable style={styles.secondaryButton} onPress={() => navigation.navigate("ComplianceActions")}>
              <Text style={styles.secondaryButtonText}>Action Report</Text>
            </Pressable>
            {canManage ? (
              <Pressable style={styles.secondaryButton} onPress={() => navigation.navigate("ComplianceConfig")}>
                <Text style={styles.secondaryButtonText}>Setup</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        <View style={ui.card}>
          <Text style={styles.fieldLabel}>Frequency</Text>
          <View style={styles.chipRow}>
            {frequencyOptions.map((option) => {
              const selected = frequency === option;
              return (
                <Pressable
                  key={option}
                  style={[styles.choiceChip, selected ? styles.choiceChipSelected : null]}
                  onPress={() => setFrequency(option)}
                >
                  <Text style={[styles.choiceChipText, selected ? styles.choiceChipTextSelected : null]}>{option}</Text>
                </Pressable>
              );
            })}
          </View>
          <DateTimeField mode="date" value={selectedDate} onChange={setSelectedDate} />
          <Text style={styles.meta}>Selected date: {formatDay(selectedDate)}</Text>
        </View>

        {logQuery.isLoading ? <Text style={styles.meta}>Loading checks...</Text> : null}
        {periodGroups.map((periodGroup) => (
          <View key={periodGroup.group.id} style={ui.card}>
            <View style={styles.rowBetween}>
              <Text style={styles.groupTitle}>{periodGroup.group.groupName}</Text>
              <StatusBadge label={`${periodGroup.completedCount}/${periodGroup.totalCount}`} tone="neutral" />
            </View>
            {periodGroup.group.description ? <Text style={styles.meta}>{periodGroup.group.description}</Text> : null}
            <View style={styles.groupRows}>
              {periodGroup.rows.map((row) => {
                const draft = getDraft(row.item.id);
                return (
                  <View key={row.item.id} style={styles.itemCard}>
                    <View style={styles.rowBetween}>
                      <Text style={styles.itemTitle}>{row.item.itemName}</Text>
                      <StatusBadge label={draft.result} tone={resolveResultTone(draft.result)} />
                    </View>
                    {row.item.description ? <Text style={styles.meta}>{row.item.description}</Text> : null}

                    <View style={styles.chipRow}>
                      {(["Compliant", "NonCompliant", "NotApplicable", "Pending"] as ComplianceCheckResult[]).map((resultOption) => {
                        const selected = draft.result === resultOption;
                        return (
                          <Pressable
                            key={resultOption}
                            style={[styles.choiceChip, selected ? styles.choiceChipSelected : null]}
                            onPress={() => onSelectResult(row, resultOption)}
                          >
                            <Text style={[styles.choiceChipText, selected ? styles.choiceChipTextSelected : null]}>
                              {resultOption === "NotApplicable" ? "N/A" : resultOption}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>

                    <View style={styles.row}>
                      <Pressable style={styles.noteButton} onPress={() => openEditor(row.item.id, "notes", row.item.itemName)}>
                        <Ionicons name="create-outline" size={14} color={appTheme.colors.primary} />
                        <Text style={styles.noteButtonText}>{draft.notes.trim() ? "Edit Notes" : "Add Notes"}</Text>
                      </Pressable>
                      <Pressable
                        style={styles.noteButton}
                        onPress={() => openEditor(row.item.id, "actionRequired", row.item.itemName)}
                      >
                        <Ionicons name="warning-outline" size={14} color={appTheme.colors.warning} />
                        <Text style={styles.noteButtonText}>{draft.actionRequired.trim() ? "Edit Action" : "Add Action"}</Text>
                      </Pressable>
                      <Pressable
                        style={styles.iconSaveButton}
                        onPress={() => saveDraftForItem(row.item, draft, true)}
                      >
                        <Ionicons name="save-outline" size={16} color={appTheme.colors.primary} />
                      </Pressable>
                    </View>

                    {row.entry ? (
                      <Text style={styles.meta}>
                        Last saved by {row.entry.checkedByName ?? "-"} at {formatDateTime(row.entry.checkedOn)}
                      </Text>
                    ) : null}
                  </View>
                );
              })}
            </View>
          </View>
        ))}

        {periodGroups.length === 0 && !logQuery.isLoading ? (
          <View style={ui.card}>
            <Text style={styles.meta}>No compliance groups configured for this frequency.</Text>
          </View>
        ) : null}
      </ScrollView>

      <Modal visible={Boolean(editorState)} transparent animationType="fade" onRequestClose={() => setEditorState(null)}>
        <View style={styles.modalBackdrop}>
          <ModalBackdropBlur />
          <View style={styles.modalCard}>
            <Text style={styles.itemTitle}>{editorState?.title ?? "Edit"}</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={editorValue}
              onChangeText={setEditorValue}
              placeholder="Enter details..."
              placeholderTextColor={appTheme.colors.textSubtle}
              multiline
            />
            <View style={styles.row}>
              <Pressable style={styles.secondaryButton} onPress={() => setEditorState(null)}>
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.secondaryButton} onPress={applyEditor}>
                <Text style={styles.secondaryButtonText}>Apply</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

export function ComplianceChecksConfigScreen() {
  const queryClient = useQueryClient();
  const { activeShopId } = useAuth();
  const shopId = activeShopId;
  const [frequency, setFrequency] = useState<ComplianceCheckFrequency>("Daily");
  const [groups, setGroups] = useState<ComplianceCheckGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>("");
  const [groupModalVisible, setGroupModalVisible] = useState(false);
  const [itemModalVisible, setItemModalVisible] = useState(false);
  const [groupForm, setGroupForm] = useState<GroupFormState>(initialGroupForm);
  const [itemForm, setItemForm] = useState<ItemFormState>(initialItemForm);

  const configQuery = useQuery({
    queryKey: ["compliance-config", shopId, frequency],
    queryFn: () => listComplianceCheckConfig(shopId as string, frequency),
    enabled: Boolean(shopId),
  });

  useEffect(() => {
    const nextGroups = normalizeGroups(configQuery.data ?? []);
    setGroups(nextGroups);
    if (!nextGroups.some((group) => group.id === selectedGroupId)) {
      setSelectedGroupId(nextGroups[0]?.id ?? "");
    }
  }, [configQuery.data, selectedGroupId]);

  const activeGroup = useMemo(() => groups.find((group) => group.id === selectedGroupId), [groups, selectedGroupId]);

  const groupSaveMutation = useMutation({
    mutationFn: async () => {
      if (!shopId) throw new Error("No shop selected.");
      if (!groupForm.groupName.trim()) throw new Error("Group name is required.");

      if (groupForm.id) {
        await updateComplianceCheckGroup(groupForm.id, {
          frequency: groupForm.frequency,
          groupName: groupForm.groupName.trim(),
          description: groupForm.description.trim() || undefined,
          isActive: groupForm.isActive,
        });
      } else {
        await createComplianceCheckGroup({
          shopId,
          frequency: groupForm.frequency,
          groupName: groupForm.groupName.trim(),
          description: groupForm.description.trim() || undefined,
          isActive: groupForm.isActive,
        });
      }
    },
    onSuccess: async () => {
      setGroupModalVisible(false);
      setGroupForm(initialGroupForm);
      await queryClient.invalidateQueries({ queryKey: ["compliance-config", shopId, frequency] });
    },
    onError: (error: any) => {
      Alert.alert("Failed", error?.response?.data?.message ?? error?.message ?? "Unable to save compliance group.");
    },
  });

  const itemSaveMutation = useMutation({
    mutationFn: async () => {
      if (!shopId) throw new Error("No shop selected.");
      if (!itemForm.complianceCheckGroupId) throw new Error("Select a group.");
      if (!itemForm.itemName.trim()) throw new Error("Item name is required.");

      if (itemForm.id) {
        await updateComplianceCheckItem(itemForm.id, {
          complianceCheckGroupId: itemForm.complianceCheckGroupId,
          itemName: itemForm.itemName.trim(),
          description: itemForm.description.trim() || undefined,
          isRequired: itemForm.isRequired,
          isActive: itemForm.isActive,
        });
      } else {
        await createComplianceCheckItem({
          shopId,
          complianceCheckGroupId: itemForm.complianceCheckGroupId,
          itemName: itemForm.itemName.trim(),
          description: itemForm.description.trim() || undefined,
          isRequired: itemForm.isRequired,
          isActive: itemForm.isActive,
        });
      }
    },
    onSuccess: async () => {
      setItemModalVisible(false);
      setItemForm(initialItemForm);
      await queryClient.invalidateQueries({ queryKey: ["compliance-config", shopId, frequency] });
    },
    onError: (error: any) => {
      Alert.alert("Failed", error?.response?.data?.message ?? error?.message ?? "Unable to save compliance item.");
    },
  });

  async function onReorderGroups(nextGroups: ComplianceCheckGroup[]) {
    if (!shopId) return;
    setGroups(nextGroups);
    try {
      await reorderComplianceCheckGroups({
        shopId,
        frequency,
        orderedGroupIds: nextGroups.map((group) => group.id),
      });
      await queryClient.invalidateQueries({ queryKey: ["compliance-config", shopId, frequency] });
    } catch (error: any) {
      Alert.alert("Failed", error?.response?.data?.message ?? error?.message ?? "Unable to reorder groups.");
      setGroups(normalizeGroups(configQuery.data ?? []));
    }
  }

  async function onReorderItems(nextItems: ComplianceCheckItem[]) {
    if (!shopId || !activeGroup) return;
    const normalized = nextItems.map((item, index) => ({ ...item, displayOrder: index + 1 }));
    setGroups((previous) =>
      previous.map((group) => (group.id === activeGroup.id ? { ...group, items: normalized } : group))
    );

    try {
      await reorderComplianceCheckItems({
        shopId,
        complianceCheckGroupId: activeGroup.id,
        orderedItemIds: normalized.map((item) => item.id),
      });
      await queryClient.invalidateQueries({ queryKey: ["compliance-config", shopId, frequency] });
    } catch (error: any) {
      Alert.alert("Failed", error?.response?.data?.message ?? error?.message ?? "Unable to reorder items.");
      setGroups(normalizeGroups(configQuery.data ?? []));
    }
  }

  function openCreateGroup() {
    setGroupForm({ ...initialGroupForm, frequency });
    setGroupModalVisible(true);
  }

  function openEditGroup(group: ComplianceCheckGroup) {
    setGroupForm({
      id: group.id,
      frequency: group.frequency,
      groupName: group.groupName,
      description: group.description ?? "",
      isActive: group.isActive,
    });
    setGroupModalVisible(true);
  }

  function openCreateItem(targetGroupId?: string) {
    setItemForm({
      ...initialItemForm,
      complianceCheckGroupId: targetGroupId ?? activeGroup?.id ?? groups[0]?.id ?? "",
    });
    setItemModalVisible(true);
  }

  function openEditItem(item: ComplianceCheckItem) {
    setItemForm({
      id: item.id,
      complianceCheckGroupId: item.complianceCheckGroupId,
      itemName: item.itemName,
      description: item.description ?? "",
      isRequired: item.isRequired,
      isActive: item.isActive,
    });
    setItemModalVisible(true);
  }

  if (!shopId) {
    return (
      <ScreenContainer>
        <View style={ui.card}>
          <Text style={styles.pageTitle}>Compliance Setup</Text>
          <Text style={styles.meta}>Select a shop to configure compliance groups and items.</Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <NestableScrollContainer contentContainerStyle={styles.content}>
        <View style={ui.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.pageTitle}>Compliance Setup</Text>
            <View style={styles.row}>
              <Pressable style={styles.secondaryButton} onPress={openCreateGroup}>
                <Text style={styles.secondaryButtonText}>+ Group</Text>
              </Pressable>
              <Pressable style={styles.secondaryButton} onPress={() => openCreateItem()} disabled={!groups.length}>
                <Text style={styles.secondaryButtonText}>+ Item</Text>
              </Pressable>
            </View>
          </View>
          <Text style={styles.meta}>Long press drag handle to reorder groups and items.</Text>
          <View style={styles.chipRow}>
            {frequencyOptions.map((option) => {
              const selected = frequency === option;
              return (
                <Pressable
                  key={option}
                  style={[styles.choiceChip, selected ? styles.choiceChipSelected : null]}
                  onPress={() => setFrequency(option)}
                >
                  <Text style={[styles.choiceChipText, selected ? styles.choiceChipTextSelected : null]}>{option}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {configQuery.isLoading ? <Text style={styles.meta}>Loading groups...</Text> : null}
        <NestableDraggableFlatList
          data={groups}
          keyExtractor={(group) => group.id}
          scrollEnabled={false}
          onDragEnd={({ data }) => {
            void onReorderGroups(data);
          }}
          renderItem={({ item, drag, isActive }) => (
            <View style={[ui.card, isActive ? styles.dragActiveCard : null]}>
              <View style={styles.rowBetween}>
                <Pressable style={{ flex: 1 }} onPress={() => setSelectedGroupId(item.id)}>
                  <Text style={styles.groupTitle}>{item.groupName}</Text>
                </Pressable>
                <StatusBadge label={item.isActive ? "Active" : "Inactive"} tone={item.isActive ? "success" : "warning"} />
              </View>
              <Text style={styles.meta}>{item.items.length} items</Text>
              <View style={styles.row}>
                <Pressable style={styles.secondaryButton} onPress={() => openEditGroup(item)}>
                  <Text style={styles.secondaryButtonText}>Edit</Text>
                </Pressable>
                <Pressable
                  style={styles.secondaryButton}
                  onPress={() => {
                    setSelectedGroupId(item.id);
                    openCreateItem(item.id);
                  }}
                >
                  <Text style={styles.secondaryButtonText}>+ Item</Text>
                </Pressable>
                <Pressable style={styles.dragHandleButton} onLongPress={drag} delayLongPress={120}>
                  <Ionicons name="reorder-three-outline" size={16} color={appTheme.colors.text} />
                  <Text style={styles.secondaryButtonText}>Drag</Text>
                </Pressable>
              </View>
            </View>
          )}
        />

        {activeGroup ? (
          <View style={ui.card}>
            <View style={styles.rowBetween}>
              <Text style={styles.groupTitle}>Items: {activeGroup.groupName}</Text>
              <StatusBadge label={`${activeGroup.items.length}`} tone="neutral" />
            </View>
            <NestableDraggableFlatList
              data={activeGroup.items}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
              onDragEnd={({ data }) => {
                void onReorderItems(data);
              }}
              renderItem={({ item, drag, isActive }) => (
                <View style={[styles.itemCard, isActive ? styles.dragActiveCard : null]}>
                  <View style={styles.rowBetween}>
                    <Text style={styles.itemTitle}>{item.itemName}</Text>
                    <StatusBadge label={item.isActive ? "Active" : "Inactive"} tone={item.isActive ? "success" : "warning"} />
                  </View>
                  {item.description ? <Text style={styles.meta}>{item.description}</Text> : null}
                  <View style={styles.row}>
                    <Pressable style={styles.secondaryButton} onPress={() => openEditItem(item)}>
                      <Text style={styles.secondaryButtonText}>Edit</Text>
                    </Pressable>
                    <Pressable style={styles.dragHandleButton} onLongPress={drag} delayLongPress={120}>
                      <Ionicons name="reorder-three-outline" size={16} color={appTheme.colors.text} />
                      <Text style={styles.secondaryButtonText}>Drag</Text>
                    </Pressable>
                  </View>
                </View>
              )}
            />
          </View>
        ) : (
          <View style={ui.card}>
            <Text style={styles.meta}>Create a group first, then add compliance items.</Text>
          </View>
        )}
      </NestableScrollContainer>

      <Modal visible={groupModalVisible} transparent animationType="fade" onRequestClose={() => setGroupModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <ModalBackdropBlur />
          <View style={styles.modalCard}>
            <ScrollView contentContainerStyle={styles.content}>
              <Text style={styles.itemTitle}>{groupForm.id ? "Edit Group" : "New Group"}</Text>
              <View style={styles.chipRow}>
                {frequencyOptions.map((option) => {
                  const selected = groupForm.frequency === option;
                  return (
                    <Pressable
                      key={option}
                      style={[styles.choiceChip, selected ? styles.choiceChipSelected : null]}
                      onPress={() => setGroupForm((previous) => ({ ...previous, frequency: option }))}
                    >
                      <Text style={[styles.choiceChipText, selected ? styles.choiceChipTextSelected : null]}>{option}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <TextInput
                style={styles.input}
                value={groupForm.groupName}
                onChangeText={(value) => setGroupForm((previous) => ({ ...previous, groupName: value }))}
                placeholder="Group name"
                placeholderTextColor={appTheme.colors.textSubtle}
              />
              <TextInput
                style={[styles.input, styles.textArea]}
                value={groupForm.description}
                onChangeText={(value) => setGroupForm((previous) => ({ ...previous, description: value }))}
                placeholder="Description"
                placeholderTextColor={appTheme.colors.textSubtle}
                multiline
              />
              <Pressable style={styles.toggleRow} onPress={() => setGroupForm((previous) => ({ ...previous, isActive: !previous.isActive }))}>
                <Text style={styles.toggleLabel}>Active</Text>
                <Text style={styles.toggleValue}>{groupForm.isActive ? "Yes" : "No"}</Text>
              </Pressable>
              <PrimaryButton
                label={groupSaveMutation.isPending ? "Saving..." : "Save"}
                onPress={() => groupSaveMutation.mutate()}
                disabled={groupSaveMutation.isPending}
              />
              <Pressable style={styles.secondaryButton} onPress={() => setGroupModalVisible(false)}>
                <Text style={styles.secondaryButtonText}>Close</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={itemModalVisible} transparent animationType="fade" onRequestClose={() => setItemModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <ModalBackdropBlur />
          <View style={styles.modalCard}>
            <ScrollView contentContainerStyle={styles.content}>
              <Text style={styles.itemTitle}>{itemForm.id ? "Edit Item" : "New Item"}</Text>
              <Text style={styles.fieldLabel}>Group</Text>
              <View style={styles.chipRow}>
                {groups.map((group) => {
                  const selected = itemForm.complianceCheckGroupId === group.id;
                  return (
                    <Pressable
                      key={group.id}
                      style={[styles.choiceChip, selected ? styles.choiceChipSelected : null]}
                      onPress={() => setItemForm((previous) => ({ ...previous, complianceCheckGroupId: group.id }))}
                    >
                      <Text style={[styles.choiceChipText, selected ? styles.choiceChipTextSelected : null]}>{group.groupName}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <TextInput
                style={styles.input}
                value={itemForm.itemName}
                onChangeText={(value) => setItemForm((previous) => ({ ...previous, itemName: value }))}
                placeholder="Item name"
                placeholderTextColor={appTheme.colors.textSubtle}
              />
              <TextInput
                style={[styles.input, styles.textArea]}
                value={itemForm.description}
                onChangeText={(value) => setItemForm((previous) => ({ ...previous, description: value }))}
                placeholder="Description"
                placeholderTextColor={appTheme.colors.textSubtle}
                multiline
              />
              <Pressable style={styles.toggleRow} onPress={() => setItemForm((previous) => ({ ...previous, isRequired: !previous.isRequired }))}>
                <Text style={styles.toggleLabel}>Required</Text>
                <Text style={styles.toggleValue}>{itemForm.isRequired ? "Yes" : "No"}</Text>
              </Pressable>
              <Pressable style={styles.toggleRow} onPress={() => setItemForm((previous) => ({ ...previous, isActive: !previous.isActive }))}>
                <Text style={styles.toggleLabel}>Active</Text>
                <Text style={styles.toggleValue}>{itemForm.isActive ? "Yes" : "No"}</Text>
              </Pressable>
              <PrimaryButton
                label={itemSaveMutation.isPending ? "Saving..." : "Save"}
                onPress={() => itemSaveMutation.mutate()}
                disabled={itemSaveMutation.isPending}
              />
              <Pressable style={styles.secondaryButton} onPress={() => setItemModalVisible(false)}>
                <Text style={styles.secondaryButtonText}>Close</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

export function ComplianceActionsScreen() {
  const queryClient = useQueryClient();
  const { activeShopId } = useAuth();
  const shopId = activeShopId;
  const today = useMemo(() => new Date(), []);
  const [fromDate, setFromDate] = useState(formatDateValue(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 30)));
  const [toDate, setToDate] = useState(formatDateValue(today));
  const [openOnly, setOpenOnly] = useState(true);
  const [closeActionState, setCloseActionState] = useState<CloseActionState>(null);
  const [closeNotes, setCloseNotes] = useState("");

  const actionsQuery = useQuery({
    queryKey: ["compliance-actions", shopId, fromDate, toDate, openOnly],
    queryFn: () => getComplianceActionReport(shopId as string, fromDate, toDate, openOnly),
    enabled: Boolean(shopId),
  });

  const closeActionMutation = useMutation({
    mutationFn: async (input: { entryId: string; closedOutNotes?: string }) => {
      if (!shopId) throw new Error("No shop selected.");
      return closeComplianceCheckAction({
        shopId,
        entryId: input.entryId,
        closedOutNotes: input.closedOutNotes,
      });
    },
    onSuccess: async () => {
      setCloseActionState(null);
      setCloseNotes("");
      await queryClient.invalidateQueries({ queryKey: ["compliance-actions", shopId, fromDate, toDate, openOnly] });
    },
    onError: (error: any) => {
      Alert.alert("Failed", error?.response?.data?.message ?? error?.message ?? "Unable to close action.");
    },
  });

  function openCloseAction(row: ComplianceActionReportRow) {
    setCloseActionState({ entryId: row.entryId, itemName: row.itemName });
    setCloseNotes("");
  }

  if (!shopId) {
    return (
      <ScreenContainer>
        <View style={ui.card}>
          <Text style={styles.pageTitle}>Compliance Action Report</Text>
          <Text style={styles.meta}>Select a shop to view action report.</Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={ui.card}>
          <Text style={styles.pageTitle}>Compliance Action Report</Text>
          <Text style={styles.meta}>Track non-compliant checks and close-out actions.</Text>
          <View style={styles.row}>
            <DateTimeField style={{ flex: 1 }} mode="date" value={fromDate} onChange={setFromDate} />
            <DateTimeField style={{ flex: 1 }} mode="date" value={toDate} onChange={setToDate} />
          </View>
          <Pressable style={styles.toggleRow} onPress={() => setOpenOnly((previous) => !previous)}>
            <Text style={styles.toggleLabel}>Open Actions Only</Text>
            <Text style={styles.toggleValue}>{openOnly ? "Yes" : "No"}</Text>
          </Pressable>
        </View>

        {actionsQuery.isLoading ? <Text style={styles.meta}>Loading action report...</Text> : null}
        {(actionsQuery.data ?? []).map((row) => (
          <View key={row.entryId} style={ui.card}>
            <View style={styles.rowBetween}>
              <Text style={styles.itemTitle}>{row.itemName}</Text>
              <StatusBadge label={row.isActionClosedOut ? "Closed" : "Open"} tone={row.isActionClosedOut ? "success" : "warning"} />
            </View>
            <Text style={styles.meta}>Group: {row.groupName}</Text>
            <Text style={styles.meta}>Frequency: {row.frequency}</Text>
            <Text style={styles.meta}>Period: {row.periodLabel || formatDay(row.periodDate)}</Text>
            <Text style={styles.meta}>
              Checked by: {row.checkedByName ?? "-"} at {formatDateTime(row.checkedOn)}
            </Text>
            {row.notes ? <Text style={styles.meta}>Notes: {row.notes}</Text> : null}
            {row.actionRequired ? <Text style={styles.meta}>Action Required: {row.actionRequired}</Text> : null}
            {row.isActionClosedOut ? (
              <>
                <Text style={styles.meta}>
                  Closed by: {row.closedOutByName ?? "-"} at {formatDateTime(row.closedOutOn)}
                </Text>
                {row.closedOutNotes ? <Text style={styles.meta}>Close Notes: {row.closedOutNotes}</Text> : null}
              </>
            ) : (
              <Pressable style={styles.secondaryButton} onPress={() => openCloseAction(row)}>
                <Text style={styles.secondaryButtonText}>Close Action</Text>
              </Pressable>
            )}
          </View>
        ))}
        {(actionsQuery.data ?? []).length === 0 && !actionsQuery.isLoading ? (
          <View style={ui.card}>
            <Text style={styles.meta}>No action rows found for selected filters.</Text>
          </View>
        ) : null}
      </ScrollView>

      <Modal visible={Boolean(closeActionState)} transparent animationType="fade" onRequestClose={() => setCloseActionState(null)}>
        <View style={styles.modalBackdrop}>
          <ModalBackdropBlur />
          <View style={styles.modalCard}>
            <Text style={styles.itemTitle}>Close Action</Text>
            {closeActionState ? <Text style={styles.meta}>{closeActionState.itemName}</Text> : null}
            <TextInput
              style={[styles.input, styles.textArea]}
              value={closeNotes}
              onChangeText={setCloseNotes}
              placeholder="Close-out notes"
              placeholderTextColor={appTheme.colors.textSubtle}
              multiline
            />
            <View style={styles.row}>
              <Pressable style={styles.secondaryButton} onPress={() => setCloseActionState(null)}>
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={styles.secondaryButton}
                onPress={() => {
                  if (!closeActionState) return;
                  closeActionMutation.mutate({
                    entryId: closeActionState.entryId,
                    closedOutNotes: closeNotes.trim() || undefined,
                  });
                }}
              >
                <Text style={styles.secondaryButtonText}>Close Action</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: appTheme.spacing.sm,
    paddingBottom: appTheme.spacing.sm,
  },
  pageTitle: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.heading,
    fontSize: 22,
    lineHeight: 27,
  },
  heroCard: {
    borderRadius: appTheme.radius.md,
    backgroundColor: appTheme.colors.surfaceTintAlt,
    paddingHorizontal: appTheme.spacing.md,
    paddingVertical: appTheme.spacing.md,
    gap: appTheme.spacing.sm,
  },
  heroHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: appTheme.spacing.sm,
  },
  summaryRow: {
    flexDirection: "row",
    gap: appTheme.spacing.xs,
  },
  summaryTile: {
    flex: 1,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surface,
    paddingVertical: appTheme.spacing.xs,
    alignItems: "center",
    gap: 2,
  },
  summaryValue: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.heading,
    fontSize: 18,
    lineHeight: 22,
  },
  summaryLabel: {
    color: appTheme.colors.textSubtle,
    fontFamily: appTheme.fonts.body,
    fontSize: 11,
    lineHeight: 14,
  },
  fieldLabel: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 17,
  },
  groupTitle: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 16,
    lineHeight: 20,
    flex: 1,
  },
  groupRows: {
    gap: appTheme.spacing.xs,
  },
  itemCard: {
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    padding: appTheme.spacing.sm,
    gap: appTheme.spacing.xs,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: appTheme.spacing.xs,
  },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: appTheme.spacing.xs,
  },
  itemTitle: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 15,
    lineHeight: 19,
    flex: 1,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  choiceChip: {
    borderRadius: appTheme.radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: appTheme.colors.surfaceMuted,
  },
  choiceChipSelected: {
    backgroundColor: appTheme.colors.primary,
  },
  choiceChipText: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 15,
  },
  choiceChipTextSelected: {
    color: appTheme.colors.onPrimary,
  },
  noteButton: {
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceInfoMuted,
    paddingHorizontal: 10,
    paddingVertical: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  noteButtonText: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 15,
  },
  iconSaveButton: {
    width: 34,
    height: 34,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceInfoMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButton: {
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceTintSoft,
    paddingHorizontal: 11,
    paddingVertical: 7,
    alignSelf: "flex-start",
  },
  secondaryButtonText: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 15,
  },
  dragHandleButton: {
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceTintAlt,
    paddingHorizontal: 10,
    paddingVertical: 7,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  toggleRow: {
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: appTheme.spacing.sm,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: appTheme.spacing.xs,
  },
  toggleLabel: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.body,
    fontSize: 13,
    lineHeight: 16,
    flex: 1,
  },
  toggleValue: {
    color: appTheme.colors.primary,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 16,
  },
  input: {
    borderWidth: 0,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surface,
    color: appTheme.colors.text,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: appTheme.spacing.sm,
    fontSize: 14,
    fontFamily: appTheme.fonts.body,
  },
  textArea: {
    minHeight: 120,
    textAlignVertical: "top",
  },
  meta: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.body,
    fontSize: 12,
    lineHeight: 16,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: appTheme.colors.overlay,
    justifyContent: "center",
    paddingHorizontal: appTheme.spacing.md,
  },
  modalCard: {
    backgroundColor: appTheme.colors.surface,
    borderRadius: appTheme.radius.lg,
    padding: appTheme.spacing.md,
    gap: appTheme.spacing.xs,
    maxHeight: "88%",
  },
  dragActiveCard: {
    opacity: 0.94,
  },
});
