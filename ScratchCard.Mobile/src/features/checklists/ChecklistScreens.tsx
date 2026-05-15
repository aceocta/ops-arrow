import React, { useEffect, useMemo, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useNetInfo } from "@react-native-community/netinfo";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { NestableDraggableFlatList, NestableScrollContainer } from "react-native-draggable-flatlist";
import {
  createChecklistGroup,
  createChecklistTask,
  getChecklistDailyLog,
  listChecklistCompletionHistory,
  listChecklistConfiguration,
  reorderChecklistGroups,
  reorderChecklistTasks,
  updateChecklistGroup,
  updateChecklistTask,
  upsertChecklistTaskCompletion,
} from "../../api/checklistsApi";
import { useAuth } from "../../auth/AuthContext";
import { DateTimeField, formatDateValue } from "../../components/DateTimeField";
import { PrimaryButton } from "../../components/PrimaryButton";
import { ScreenContainer } from "../../components/ScreenContainer";
import { StatusBadge } from "../../components/StatusBadge";
import {
  enqueueOfflineChecklistCompletion,
  listOfflineChecklistQueue,
} from "../../offline/checklistQueueRepository";
import { MainStackParamList } from "../../types/navigation";
import { ChecklistDailyTask, ShopChecklistGroup, ShopChecklistTask } from "../../types/models";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";

function formatDay(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleDateString();
}

function formatDateTime(value?: string) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return `${parsed.toLocaleDateString()} ${parsed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

function sortChecklistConfiguration(groups: ShopChecklistGroup[]) {
  return groups
    .slice()
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((group) => ({
      ...group,
      tasks: group.tasks.slice().sort((a, b) => a.displayOrder - b.displayOrder),
    }));
}

type DailyTaskLocalState = {
  isCompleted: boolean;
  notes: string;
  queued: boolean;
};

type NoteEditorState = {
  taskId: string;
  taskName: string;
} | null;

export function ShopChecklistScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { activeShopId, profile } = useAuth();
  const shopId = activeShopId;
  const netInfo = useNetInfo();
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState(formatDateValue(new Date()));
  const [taskState, setTaskState] = useState<Record<string, DailyTaskLocalState>>({});
  const [noteEditor, setNoteEditor] = useState<NoteEditorState>(null);
  const [noteDraft, setNoteDraft] = useState("");

  const queueQuery = useQuery({
    queryKey: ["offline-checklist-queue"],
    queryFn: listOfflineChecklistQueue,
  });

  const dailyQuery = useQuery({
    queryKey: ["checklist-daily", shopId, selectedDate],
    queryFn: () => getChecklistDailyLog(shopId as string, selectedDate),
    enabled: Boolean(shopId) && selectedDate.length === 10,
  });

  useEffect(() => {
    if (!dailyQuery.data) {
      return;
    }

    const queuedTaskIds = new Set(
      (queueQuery.data ?? [])
        .filter((item) => item.shopId === shopId && item.businessDate === selectedDate)
        .map((item) => item.checklistTaskId)
    );

    const nextState: Record<string, DailyTaskLocalState> = {};
    for (const group of dailyQuery.data.groups) {
      for (const taskRow of group.tasks) {
        nextState[taskRow.task.id] = {
          isCompleted: Boolean(taskRow.completion?.isCompleted),
          notes: taskRow.completion?.notes ?? "",
          queued: queuedTaskIds.has(taskRow.task.id),
        };
      }
    }
    setTaskState(nextState);
  }, [dailyQuery.data, queueQuery.data, selectedDate, shopId]);

  const saveCompletionMutation = useMutation({
    mutationFn: async (input: { task: ShopChecklistTask; state: DailyTaskLocalState }) => {
      if (!shopId) {
        throw new Error("No shop selected.");
      }

      const payload = {
        shopId,
        businessDate: selectedDate,
        checklistTaskId: input.task.id,
        isCompleted: input.state.isCompleted,
        notes: input.state.notes.trim() || undefined,
      };

      if (!netInfo.isConnected) {
        await enqueueOfflineChecklistCompletion(payload);
        return { ...payload, offlineQueued: true };
      }

      await upsertChecklistTaskCompletion(payload);
      return { ...payload, offlineQueued: false };
    },
    onSuccess: async (result) => {
      if (result.offlineQueued) {
        setTaskState((previous) => ({
          ...previous,
          [result.checklistTaskId]: {
            ...(previous[result.checklistTaskId] ?? { isCompleted: result.isCompleted, notes: result.notes ?? "", queued: true }),
            queued: true,
          },
        }));
        await queueQuery.refetch();
        return;
      }

      setTaskState((previous) => ({
        ...previous,
        [result.checklistTaskId]: {
          ...(previous[result.checklistTaskId] ?? { isCompleted: result.isCompleted, notes: result.notes ?? "", queued: false }),
          queued: false,
        },
      }));
      await queryClient.invalidateQueries({ queryKey: ["checklist-daily", shopId, selectedDate] });
      await queueQuery.refetch();
    },
    onError: (error: any) => {
      Alert.alert("Failed", error?.response?.data?.message ?? error?.message ?? "Unable to save checklist task.");
    },
  });

  const completionSummary = useMemo(() => {
    const groups = dailyQuery.data?.groups ?? [];
    let total = 0;
    let completed = 0;

    for (const group of groups) {
      for (const row of group.tasks) {
        total += 1;
        const local = taskState[row.task.id];
        if (local?.isCompleted) {
          completed += 1;
        }
      }
    }

    return {
      total,
      completed,
      pending: Math.max(total - completed, 0),
    };
  }, [dailyQuery.data?.groups, taskState]);

  function getTaskState(taskRow: ChecklistDailyTask): DailyTaskLocalState {
    return taskState[taskRow.task.id] ?? {
      isCompleted: Boolean(taskRow.completion?.isCompleted),
      notes: taskRow.completion?.notes ?? "",
      queued: false,
    };
  }

  function persistTask(taskRow: ChecklistDailyTask, nextState: DailyTaskLocalState) {
    if (taskRow.task.notesRequiredOnComplete && nextState.isCompleted && !nextState.notes.trim()) {
      Alert.alert("Notes Required", "Please add notes before saving this task.");
      return;
    }

    const previousState = getTaskState(taskRow);

    setTaskState((previous) => ({
      ...previous,
      [taskRow.task.id]: nextState,
    }));

    saveCompletionMutation.mutate(
      {
        task: taskRow.task,
        state: nextState,
      },
      {
        onError: () => {
          setTaskState((previous) => ({
            ...previous,
            [taskRow.task.id]: previousState,
          }));
        },
      }
    );
  }

  function openNoteEditor(taskRow: ChecklistDailyTask) {
    const local = getTaskState(taskRow);
    setNoteDraft(local.notes);
    setNoteEditor({
      taskId: taskRow.task.id,
      taskName: taskRow.task.taskName,
    });
  }

  function applyNoteEditor() {
    if (!noteEditor) {
      return;
    }

    setTaskState((previous) => ({
      ...previous,
      [noteEditor.taskId]: {
        ...(previous[noteEditor.taskId] ?? {
          isCompleted: false,
          notes: "",
          queued: false,
        }),
        notes: noteDraft,
      },
    }));
    setNoteEditor(null);
  }

  const offlineQueueCount = useMemo(
    () =>
      (queueQuery.data ?? []).filter(
        (item) => item.shopId === shopId && item.businessDate === selectedDate
      ).length,
    [queueQuery.data, selectedDate, shopId]
  );
  const canConfigureChecklist = useMemo(() => {
    const roles = profile?.roles ?? [];
    return roles.includes("PlatformAdmin") || roles.includes("ShopOwner") || roles.includes("Manager");
  }, [profile?.roles]);

  if (!shopId) {
    return (
      <ScreenContainer>
        <View style={ui.card}>
          <Text style={styles.pageTitle}>Shop Checklist</Text>
          <Text style={styles.meta}>Select a shop to load checklist tasks.</Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.pageHeaderCard}>
          <View style={styles.pageHeaderTopRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.pageTitle}>Shop Checklist</Text>
              <Text style={styles.pageMeta}>Date: {formatDay(selectedDate)}</Text>
            </View>
            <StatusBadge label={netInfo.isConnected ? "Online" : "Offline"} tone={netInfo.isConnected ? "success" : "warning"} />
          </View>
          <View style={styles.summaryRow}>
            <View style={styles.summaryTile}>
              <Text style={styles.summaryValue}>{completionSummary.completed}</Text>
              <Text style={styles.summaryLabel}>Completed</Text>
            </View>
            <View style={styles.summaryTile}>
              <Text style={styles.summaryValue}>{completionSummary.pending}</Text>
              <Text style={styles.summaryLabel}>Pending</Text>
            </View>
            <View style={styles.summaryTile}>
              <Text style={styles.summaryValue}>{completionSummary.total}</Text>
              <Text style={styles.summaryLabel}>Total</Text>
            </View>
          </View>
          {offlineQueueCount > 0 ? (
            <Text style={styles.meta}>{offlineQueueCount} checklist updates queued for sync.</Text>
          ) : null}
          {canConfigureChecklist ? (
            <Pressable
              style={styles.secondaryButton}
              onPress={() => navigation.navigate("ChecklistConfiguration")}
              accessibilityRole="button"
              accessibilityLabel="Open checklist setup"
            >
              <Text style={styles.secondaryButtonText}>Checklist Setup</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={ui.card}>
          <DateTimeField mode="date" value={selectedDate} onChange={setSelectedDate} />
        </View>

        {dailyQuery.isLoading ? <Text style={styles.meta}>Loading checklist...</Text> : null}

        {(dailyQuery.data?.groups ?? []).map((groupLog) => (
          <View key={groupLog.group.id} style={ui.card}>
            <View style={styles.groupHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.groupTitle}>{groupLog.group.groupName}</Text>
                {groupLog.group.description ? <Text style={styles.meta}>{groupLog.group.description}</Text> : null}
              </View>
              <StatusBadge label={`${groupLog.completedCount}/${groupLog.totalCount}`} tone={groupLog.completedCount === groupLog.totalCount ? "success" : "warning"} />
            </View>

            <View style={styles.taskList}>
              {groupLog.tasks.map((taskRow) => {
                const local = getTaskState(taskRow);

                return (
                  <View key={taskRow.task.id} style={styles.taskCard}>
                    <View style={styles.taskHeaderRow}>
                      <Pressable
                        style={[styles.checkBox, local.isCompleted ? styles.checkBoxChecked : null]}
                        accessibilityRole="button"
                        accessibilityLabel={`Toggle ${taskRow.task.taskName}`}
                        onPress={() => {
                          const next = {
                            ...local,
                            isCompleted: !local.isCompleted,
                          };
                          setTaskState((previous) => ({
                            ...previous,
                            [taskRow.task.id]: next,
                          }));
                        }}
                      >
                        <Text style={styles.checkBoxText}>{local.isCompleted ? "\u2713" : ""}</Text>
                      </Pressable>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.taskTitle}>{taskRow.task.taskName}</Text>
                      </View>
                      <View style={styles.taskHeaderActions}>
                        <Pressable
                          style={styles.iconNoteButton}
                          onPress={() => openNoteEditor(taskRow)}
                          accessibilityRole="button"
                          accessibilityLabel={`Add note for ${taskRow.task.taskName}`}
                        >
                          <Ionicons
                            name={local.notes.trim() ? "create-outline" : "chatbox-ellipses-outline"}
                            size={16}
                            color={appTheme.colors.primary}
                          />
                        </Pressable>
                        <Pressable
                          style={styles.iconSaveButton}
                          onPress={() => persistTask(taskRow, local)}
                          accessibilityRole="button"
                          accessibilityLabel={`Save ${taskRow.task.taskName}`}
                        >
                          <Ionicons name="save-outline" size={16} color={appTheme.colors.primary} />
                        </Pressable>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        ))}
      </ScrollView>

      <Modal visible={Boolean(noteEditor)} transparent animationType="fade" onRequestClose={() => setNoteEditor(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.groupTitle}>Note</Text>
            {noteEditor ? <Text style={styles.meta}>{noteEditor.taskName}</Text> : null}
            <TextInput
              style={[styles.input, styles.noteInput]}
              value={noteDraft}
              onChangeText={setNoteDraft}
              placeholder="Add note"
              placeholderTextColor={appTheme.colors.textSubtle}
              multiline
            />
            <View style={styles.row}>
              <Pressable style={styles.secondaryButton} onPress={() => setNoteEditor(null)}>
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.secondaryButton} onPress={applyNoteEditor}>
                <Text style={styles.secondaryButtonText}>Apply</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

type GroupFormState = {
  id?: string;
  groupName: string;
  description: string;
  isActive: boolean;
};

type TaskFormState = {
  id?: string;
  checklistGroupId: string;
  taskName: string;
  description: string;
  isRequired: boolean;
  isActive: boolean;
  notesRequiredOnComplete: boolean;
  requiredForShopOpen: boolean;
  requiredForShiftClose: boolean;
  requiredForDayClose: boolean;
};

type TaskBooleanField = keyof Pick<
  TaskFormState,
  | "isRequired"
  | "isActive"
  | "notesRequiredOnComplete"
  | "requiredForShopOpen"
  | "requiredForShiftClose"
  | "requiredForDayClose"
>;

const taskBooleanToggleOptions: Array<{ key: TaskBooleanField; label: string }> = [
  { key: "isRequired", label: "Required" },
  { key: "isActive", label: "Active" },
  { key: "notesRequiredOnComplete", label: "Notes Required on Complete" },
  { key: "requiredForShopOpen", label: "Required for Shop Open" },
  { key: "requiredForShiftClose", label: "Required for Shift Close" },
  { key: "requiredForDayClose", label: "Required for Day Close" },
];

const initialGroupForm: GroupFormState = {
  groupName: "",
  description: "",
  isActive: true,
};

const initialTaskForm: TaskFormState = {
  checklistGroupId: "",
  taskName: "",
  description: "",
  isRequired: true,
  isActive: true,
  notesRequiredOnComplete: false,
  requiredForShopOpen: false,
  requiredForShiftClose: false,
  requiredForDayClose: false,
};

export function ChecklistConfigurationScreen() {
  const { activeShopId } = useAuth();
  const shopId = activeShopId;
  const queryClient = useQueryClient();
  const [groupModalVisible, setGroupModalVisible] = useState(false);
  const [taskModalVisible, setTaskModalVisible] = useState(false);
  const [groupForm, setGroupForm] = useState<GroupFormState>(initialGroupForm);
  const [taskForm, setTaskForm] = useState<TaskFormState>(initialTaskForm);
  const [configGroups, setConfigGroups] = useState<ShopChecklistGroup[]>([]);

  const configQuery = useQuery({
    queryKey: ["checklist-config", shopId],
    queryFn: () => listChecklistConfiguration(shopId as string),
    enabled: Boolean(shopId),
  });

  useEffect(() => {
    setConfigGroups(sortChecklistConfiguration(configQuery.data ?? []));
  }, [configQuery.data]);

  const saveGroupMutation = useMutation({
    mutationFn: async () => {
      if (!shopId) throw new Error("No shop selected.");
      if (!groupForm.groupName.trim()) throw new Error("Group name is required.");

      if (groupForm.id) {
        await updateChecklistGroup(groupForm.id, {
          groupName: groupForm.groupName.trim(),
          description: groupForm.description.trim() || undefined,
          isActive: groupForm.isActive,
        });
      } else {
        await createChecklistGroup({
          shopId,
          groupName: groupForm.groupName.trim(),
          description: groupForm.description.trim() || undefined,
          isActive: groupForm.isActive,
        });
      }
    },
    onSuccess: async () => {
      setGroupModalVisible(false);
      setGroupForm(initialGroupForm);
      await queryClient.invalidateQueries({ queryKey: ["checklist-config", shopId] });
    },
    onError: (error: any) => {
      Alert.alert("Failed", error?.response?.data?.message ?? error?.message ?? "Unable to save checklist group.");
    },
  });

  const saveTaskMutation = useMutation({
    mutationFn: async () => {
      if (!shopId) throw new Error("No shop selected.");
      if (!taskForm.taskName.trim()) throw new Error("Task name is required.");
      if (!taskForm.checklistGroupId) throw new Error("Checklist group is required.");

      if (taskForm.id) {
        await updateChecklistTask(taskForm.id, {
          taskName: taskForm.taskName.trim(),
          description: taskForm.description.trim() || undefined,
          isRequired: taskForm.isRequired,
          isActive: taskForm.isActive,
          notesRequiredOnComplete: taskForm.notesRequiredOnComplete,
          requiredForShopOpen: taskForm.requiredForShopOpen,
          requiredForShiftClose: taskForm.requiredForShiftClose,
          requiredForDayClose: taskForm.requiredForDayClose,
        });
      } else {
        await createChecklistTask({
          shopId,
          checklistGroupId: taskForm.checklistGroupId,
          taskName: taskForm.taskName.trim(),
          description: taskForm.description.trim() || undefined,
          isRequired: taskForm.isRequired,
          isActive: taskForm.isActive,
          notesRequiredOnComplete: taskForm.notesRequiredOnComplete,
          requiredForShopOpen: taskForm.requiredForShopOpen,
          requiredForShiftClose: taskForm.requiredForShiftClose,
          requiredForDayClose: taskForm.requiredForDayClose,
        });
      }
    },
    onSuccess: async () => {
      setTaskModalVisible(false);
      setTaskForm(initialTaskForm);
      await queryClient.invalidateQueries({ queryKey: ["checklist-config", shopId] });
    },
    onError: (error: any) => {
      Alert.alert("Failed", error?.response?.data?.message ?? error?.message ?? "Unable to save checklist task.");
    },
  });

  async function handleGroupReorder(nextGroups: ShopChecklistGroup[]) {
    const sortedGroups = sortChecklistConfiguration(nextGroups);
    const previousGroups = configGroups;
    try {
      if (!shopId) return;
      setConfigGroups(sortedGroups);
      await reorderChecklistGroups({
        shopId,
        orderedGroupIds: sortedGroups.map((group) => group.id),
      });
      await queryClient.invalidateQueries({ queryKey: ["checklist-config", shopId] });
    } catch (error: any) {
      setConfigGroups(previousGroups);
      Alert.alert("Failed", error?.response?.data?.message ?? error?.message ?? "Unable to reorder checklist groups.");
    }
  }

  async function handleTaskReorder(groupId: string, nextTasks: ShopChecklistTask[]) {
    const sortedTasks = nextTasks.slice();
    const previousGroups = configGroups;
    try {
      if (!shopId) return;

      const updatedGroups = previousGroups.map((group) =>
        group.id === groupId
          ? {
            ...group,
            tasks: sortedTasks,
          }
          : group
      );

      setConfigGroups(updatedGroups);

      const group = updatedGroups.find((x) => x.id === groupId);
      if (!group) return;
      await reorderChecklistTasks({
        shopId,
        checklistGroupId: groupId,
        orderedTaskIds: group.tasks.map((task) => task.id),
      });
      await queryClient.invalidateQueries({ queryKey: ["checklist-config", shopId] });
    } catch (error: any) {
      setConfigGroups(previousGroups);
      Alert.alert("Failed", error?.response?.data?.message ?? error?.message ?? "Unable to reorder checklist tasks.");
    }
  }

  function openEditGroupModal(groupId?: string) {
    if (!groupId) {
      setGroupForm(initialGroupForm);
      setGroupModalVisible(true);
      return;
    }

    const group = configGroups.find((x) => x.id === groupId);
    if (!group) return;
    setGroupForm({
      id: group.id,
      groupName: group.groupName,
      description: group.description ?? "",
      isActive: group.isActive,
    });
    setGroupModalVisible(true);
  }

  function openEditTaskModal(groupId: string, taskId?: string) {
    if (!taskId) {
      setTaskForm({ ...initialTaskForm, checklistGroupId: groupId });
      setTaskModalVisible(true);
      return;
    }

    const group = configGroups.find((x) => x.id === groupId);
    const task = group?.tasks.find((x) => x.id === taskId);
    if (!task) return;
    setTaskForm({
      id: task.id,
      checklistGroupId: groupId,
      taskName: task.taskName,
      description: task.description ?? "",
      isRequired: task.isRequired,
      isActive: task.isActive,
      notesRequiredOnComplete: task.notesRequiredOnComplete,
      requiredForShopOpen: task.requiredForShopOpen,
      requiredForShiftClose: task.requiredForShiftClose,
      requiredForDayClose: task.requiredForDayClose,
    });
    setTaskModalVisible(true);
  }

  if (!shopId) {
    return (
      <ScreenContainer>
        <View style={ui.card}>
          <Text style={styles.pageTitle}>Checklist Configuration</Text>
          <Text style={styles.meta}>Select a shop to configure checklist groups and tasks.</Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <NestableScrollContainer contentContainerStyle={styles.content}>
        <View style={ui.card}>
          <View style={styles.groupHeader}>
            <Text style={styles.pageTitle}>Checklist Configuration</Text>
            <Pressable style={styles.secondaryButton} onPress={() => openEditGroupModal()}>
              <Text style={styles.secondaryButtonText}>+ Group</Text>
            </Pressable>
          </View>
          <Text style={styles.meta}>Create, reorder, activate, and configure checklist groups/tasks per shop.</Text>
          <Text style={styles.meta}>Long press the drag icon to reorder groups or tasks.</Text>
        </View>

        {configQuery.isLoading ? <Text style={styles.meta}>Loading checklist configuration...</Text> : null}
        {configGroups.length === 0 && !configQuery.isLoading ? (
          <View style={ui.card}>
            <Text style={styles.meta}>No checklist groups configured yet.</Text>
          </View>
        ) : null}

        <NestableDraggableFlatList
          data={configGroups}
          keyExtractor={(group) => group.id}
          scrollEnabled={false}
          onDragEnd={({ data }) => {
            void handleGroupReorder(data);
          }}
          renderItem={({ item: group, drag, isActive }) => (
            <View style={[ui.card, isActive ? styles.dragActiveCard : null]}>
              <View style={styles.groupHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.groupTitle}>{group.groupName}</Text>
                  {group.description ? <Text style={styles.meta}>{group.description}</Text> : null}
                </View>
                <StatusBadge label={group.isActive ? "Active" : "Inactive"} tone={group.isActive ? "success" : "warning"} />
              </View>

              <View style={styles.row}>
                <Pressable style={styles.secondaryButton} onPress={() => openEditGroupModal(group.id)}>
                  <Text style={styles.secondaryButtonText}>Edit</Text>
                </Pressable>
                <Pressable style={styles.secondaryButton} onPress={() => openEditTaskModal(group.id)}>
                  <Text style={styles.secondaryButtonText}>+ Task</Text>
                </Pressable>
                <Pressable
                  style={styles.dragHandleButton}
                  onLongPress={drag}
                  delayLongPress={120}
                  accessibilityRole="button"
                  accessibilityLabel={`Reorder ${group.groupName}`}
                >
                  <Ionicons name="reorder-three-outline" size={16} color={appTheme.colors.text} />
                  <Text style={styles.dragHandleText}>Drag</Text>
                </Pressable>
              </View>

              <NestableDraggableFlatList
                data={group.tasks}
                keyExtractor={(task) => task.id}
                scrollEnabled={false}
                onDragEnd={({ data }) => {
                  void handleTaskReorder(group.id, data);
                }}
                renderItem={({ item: task, drag: dragTask, isActive: isTaskActive }) => (
                  <View style={[styles.taskCard, isTaskActive ? styles.dragActiveCard : null]}>
                    <Text style={styles.taskTitle}>{task.taskName}</Text>
                    {task.description ? <Text style={styles.meta}>{task.description}</Text> : null}
                    <View style={styles.tagRow}>
                      <View style={styles.tagChip}><Text style={styles.tagText}>{task.isRequired ? "Required" : "Optional"}</Text></View>
                      <View style={styles.tagChip}><Text style={styles.tagText}>{task.isActive ? "Active" : "Inactive"}</Text></View>
                      {task.requiredForDayClose ? <View style={styles.tagChip}><Text style={styles.tagText}>Day Close</Text></View> : null}
                      {task.requiredForShiftClose ? <View style={styles.tagChip}><Text style={styles.tagText}>Shift Close</Text></View> : null}
                      {task.requiredForShopOpen ? <View style={styles.tagChip}><Text style={styles.tagText}>Shop Open</Text></View> : null}
                      {task.notesRequiredOnComplete ? <View style={styles.tagChip}><Text style={styles.tagText}>Notes Required</Text></View> : null}
                    </View>
                    <View style={styles.row}>
                      <Pressable style={styles.secondaryButton} onPress={() => openEditTaskModal(group.id, task.id)}>
                        <Text style={styles.secondaryButtonText}>Edit</Text>
                      </Pressable>
                      <Pressable
                        style={styles.dragHandleButton}
                        onLongPress={dragTask}
                        delayLongPress={120}
                        accessibilityRole="button"
                        accessibilityLabel={`Reorder ${task.taskName}`}
                      >
                        <Ionicons name="reorder-three-outline" size={16} color={appTheme.colors.text} />
                        <Text style={styles.dragHandleText}>Drag</Text>
                      </Pressable>
                    </View>
                  </View>
                )}
              />
            </View>
          )}
        />
      </NestableScrollContainer>

      <Modal visible={groupModalVisible} transparent animationType="fade" onRequestClose={() => setGroupModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.groupTitle}>{groupForm.id ? "Edit Group" : "New Group"}</Text>
            <TextInput
              style={styles.input}
              value={groupForm.groupName}
              onChangeText={(value) => setGroupForm((prev) => ({ ...prev, groupName: value }))}
              placeholder="Group name"
              placeholderTextColor={appTheme.colors.textSubtle}
            />
            <TextInput
              style={styles.input}
              value={groupForm.description}
              onChangeText={(value) => setGroupForm((prev) => ({ ...prev, description: value }))}
              placeholder="Description"
              placeholderTextColor={appTheme.colors.textSubtle}
              multiline
            />
            <Pressable
              style={styles.toggleRow}
              onPress={() => setGroupForm((prev) => ({ ...prev, isActive: !prev.isActive }))}
            >
              <Text style={styles.toggleLabel}>Active</Text>
              <Text style={styles.toggleValue}>{groupForm.isActive ? "Yes" : "No"}</Text>
            </Pressable>
            <PrimaryButton
              label={saveGroupMutation.isPending ? "Saving..." : "Save Group"}
              onPress={() => saveGroupMutation.mutate()}
              disabled={saveGroupMutation.isPending}
            />
            <Pressable style={styles.secondaryButton} onPress={() => setGroupModalVisible(false)}>
              <Text style={styles.secondaryButtonText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={taskModalVisible} transparent animationType="fade" onRequestClose={() => setTaskModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <ScrollView contentContainerStyle={{ gap: appTheme.spacing.xs }}>
              <Text style={styles.groupTitle}>{taskForm.id ? "Edit Task" : "New Task"}</Text>
              <TextInput
                style={styles.input}
                value={taskForm.taskName}
                onChangeText={(value) => setTaskForm((prev) => ({ ...prev, taskName: value }))}
                placeholder="Task name"
                placeholderTextColor={appTheme.colors.textSubtle}
              />
              <TextInput
                style={styles.input}
                value={taskForm.description}
                onChangeText={(value) => setTaskForm((prev) => ({ ...prev, description: value }))}
                placeholder="Description"
                placeholderTextColor={appTheme.colors.textSubtle}
                multiline
              />

              {taskBooleanToggleOptions.map(({ key, label }) => (
                <Pressable
                  key={key}
                  style={styles.toggleRow}
                  onPress={() =>
                    setTaskForm((prev) => ({
                      ...prev,
                      [key]: !prev[key],
                    }))
                  }
                >
                  <Text style={styles.toggleLabel}>{label}</Text>
                  <Text style={styles.toggleValue}>{taskForm[key] ? "Yes" : "No"}</Text>
                </Pressable>
              ))}

              <PrimaryButton
                label={saveTaskMutation.isPending ? "Saving..." : "Save Task"}
                onPress={() => saveTaskMutation.mutate()}
                disabled={saveTaskMutation.isPending}
              />
              <Pressable style={styles.secondaryButton} onPress={() => setTaskModalVisible(false)}>
                <Text style={styles.secondaryButtonText}>Close</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

export function ChecklistHistoryScreen() {
  const { activeShopId } = useAuth();
  const shopId = activeShopId;
  const today = useMemo(() => new Date(), []);
  const [fromDate, setFromDate] = useState(formatDateValue(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7)));
  const [toDate, setToDate] = useState(formatDateValue(today));

  const historyQuery = useQuery({
    queryKey: ["checklist-history", shopId, fromDate, toDate],
    queryFn: () => listChecklistCompletionHistory(shopId as string, fromDate, toDate),
    enabled: Boolean(shopId) && fromDate.length === 10 && toDate.length === 10,
  });

  if (!shopId) {
    return (
      <ScreenContainer>
        <View style={ui.card}>
          <Text style={styles.pageTitle}>Checklist History</Text>
          <Text style={styles.meta}>Select a shop to view checklist completion history.</Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={ui.card}>
          <Text style={styles.pageTitle}>Checklist History</Text>
          <Text style={styles.meta}>Completion and audit history for selected date range.</Text>
          <View style={styles.row}>
            <DateTimeField style={{ flex: 1 }} mode="date" value={fromDate} onChange={setFromDate} />
            <DateTimeField style={{ flex: 1 }} mode="date" value={toDate} onChange={setToDate} />
          </View>
        </View>

        <View style={ui.card}>
          {historyQuery.isLoading ? <Text style={styles.meta}>Loading history...</Text> : null}
          {(historyQuery.data ?? []).length === 0 && !historyQuery.isLoading ? (
            <Text style={styles.meta}>No checklist completion history found for this date range.</Text>
          ) : null}

          {(historyQuery.data ?? []).map((row) => (
            <View key={row.completionId} style={styles.historyRow}>
              <View style={styles.groupHeader}>
                <Text style={styles.taskTitle}>{row.checklistGroupName} - {row.checklistTaskName}</Text>
                <StatusBadge label={row.isCompleted ? "Completed" : "Pending"} tone={row.isCompleted ? "success" : "warning"} />
              </View>
              <Text style={styles.meta}>Date: {formatDay(row.businessDate)}</Text>
              <Text style={styles.meta}>By: {row.completedByName ?? "-"}</Text>
              <Text style={styles.meta}>When: {formatDateTime(row.completedOn)}</Text>
              {row.notes ? <Text style={styles.meta}>Notes: {row.notes}</Text> : null}
            </View>
          ))}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: appTheme.spacing.sm,
    paddingBottom: appTheme.spacing.sm,
  },
  pageHeaderCard: {
    borderRadius: appTheme.radius.md,
    backgroundColor: "#EEF5FC",
    paddingHorizontal: appTheme.spacing.md,
    paddingVertical: appTheme.spacing.md,
    gap: appTheme.spacing.sm,
  },
  pageHeaderTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: appTheme.spacing.sm,
  },
  pageTitle: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.heading,
    fontSize: 22,
    lineHeight: 27,
  },
  pageMeta: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.body,
    fontSize: 13,
    lineHeight: 17,
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
  groupHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: appTheme.spacing.xs,
  },
  groupTitle: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 16,
    lineHeight: 20,
  },
  taskList: {
    gap: appTheme.spacing.xs,
  },
  taskCard: {
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    padding: appTheme.spacing.sm,
    gap: appTheme.spacing.xs,
  },
  taskHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: appTheme.spacing.xs,
  },
  taskHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  checkBox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
  },
  checkBoxChecked: {
    backgroundColor: appTheme.colors.success,
  },
  checkBoxText: {
    color: "#FFFFFF",
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 16,
  },
  taskTitle: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 18,
  },
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  tagChip: {
    borderRadius: appTheme.radius.pill,
    backgroundColor: "#E8F2FF",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  tagText: {
    color: "#294A7A",
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 11,
    lineHeight: 13,
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
  taskActionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: appTheme.spacing.sm,
  },
  iconSaveButton: {
    width: 34,
    height: 34,
    borderRadius: appTheme.radius.sm,
    backgroundColor: "#EAF3FF",
    alignItems: "center",
    justifyContent: "center",
  },
  iconNoteButton: {
    width: 34,
    height: 34,
    borderRadius: appTheme.radius.sm,
    backgroundColor: "#EAF3FF",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButton: {
    borderRadius: appTheme.radius.sm,
    backgroundColor: "#F0F5FB",
    paddingHorizontal: 11,
    paddingVertical: 7,
    alignSelf: "flex-start",
  },
  dragHandleButton: {
    borderRadius: appTheme.radius.sm,
    backgroundColor: "#E3ECF8",
    paddingHorizontal: 10,
    paddingVertical: 7,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  secondaryButtonText: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 15,
  },
  dragHandleText: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 15,
  },
  meta: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.body,
    fontSize: 12,
    lineHeight: 16,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: appTheme.spacing.xs,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 28, 0.45)",
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
  noteInput: {
    minHeight: 120,
    textAlignVertical: "top",
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
  historyRow: {
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    padding: appTheme.spacing.sm,
    gap: 4,
  },
  dragActiveCard: {
    opacity: 0.94,
  },
});
