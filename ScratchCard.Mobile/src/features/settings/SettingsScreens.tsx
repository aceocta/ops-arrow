import React, { useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Constants from "expo-constants";
import { Ionicons } from "@expo/vector-icons";
import { createCompany, listMyCompanies, updateCompany } from "../../api/companiesApi";
import { getConfigurations, updateConfigurations } from "../../api/configurationsApi";
import { resolvedApiBaseUrl } from "../../api/client";
import { DateTimeField } from "../../components/DateTimeField";
import { getRoleOptions } from "../../api/lookupsApi";
import { createShop, listShops, updateShop } from "../../api/shopsApi";
import { deactivateUser, listUsers, reactivateUser, updateUserRole } from "../../api/usersApi";
import { useAuth } from "../../auth/AuthContext";
import { LabeledValue } from "../../components/LabeledValue";
import { ScreenContainer } from "../../components/ScreenContainer";
import { SellingOrder } from "../../types/enums";
import { Company, ConfigurationItem, Shop } from "../../types/models";
import { MainStackParamList } from "../../types/navigation";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";
import { buildShiftTemplateId, SHOP_CONFIG_KEYS, serializeShiftTemplates, ShiftTemplateSetup } from "./shopConfiguration";

const timeValuePattern = /^\d{2}:\d{2}$/;
const time24HourPattern = /^([01]\d|2[0-3]):([0-5]\d)$/;
const configDraftSeparator = "||";

function buildConfigDraftKey(groupName: string, configKey: string) {
  return `${groupName}${configDraftSeparator}${configKey}`;
}

function parseConfigDraftKey(draftKey: string) {
  const separatorIndex = draftKey.indexOf(configDraftSeparator);
  if (separatorIndex <= 0) {
    return {
      groupName: "",
      configKey: draftKey,
    };
  }

  return {
    groupName: draftKey.slice(0, separatorIndex),
    configKey: draftKey.slice(separatorIndex + configDraftSeparator.length),
  };
}

function isTimeConfiguration(configKey: string, value: string) {
  return /time/i.test(configKey) && timeValuePattern.test(value);
}

function isBooleanConfiguration(item: ConfigurationItem, currentValue: string) {
  if (item.dataType?.toLowerCase() === "bool") {
    return true;
  }

  const normalized = currentValue.trim().toLowerCase();
  return normalized === "true" || normalized === "false" || normalized === "1" || normalized === "0";
}

function isSellingOrderConfiguration(configKey: string) {
  return configKey.toLowerCase() === SHOP_CONFIG_KEYS.packSellingOrder.toLowerCase();
}

function isShiftTemplatesConfiguration(configKey: string) {
  return configKey.toLowerCase() === SHOP_CONFIG_KEYS.shiftTemplates.toLowerCase();
}

function isScratchCardDisplayCountConfiguration(configKey: string) {
  return configKey.toLowerCase() === SHOP_CONFIG_KEYS.scratchCardDisplayCount.toLowerCase();
}

function prettifyConfigKey(configKey: string) {
  return configKey
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .trim();
}

function parseBooleanValue(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes") return true;
  if (normalized === "false" || normalized === "0" || normalized === "no") return false;
  return false;
}

function isValid24HourTime(value: string) {
  return time24HourPattern.test(value.trim());
}

function parseShiftTemplatesEditor(value: string): ShiftTemplateSetup[] {
  const fallback: ShiftTemplateSetup[] = [
    { id: "main-shift", name: "Main Shift", startTime: "06:00", endTime: "23:00", isActive: true },
  ];

  if (!value.trim()) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(value);
    const source: any[] = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.templates)
        ? parsed.templates
        : [];

    if (source.length === 0) {
      return fallback;
    }

    const templates: ShiftTemplateSetup[] = [];
    source.forEach((item, index) => {
      const name = `${item?.name ?? item?.shiftName ?? ""}`.trim();
      const startTime = `${item?.startTime ?? ""}`.trim();
      const endTime = `${item?.endTime ?? ""}`.trim();

      templates.push({
        id: buildShiftTemplateId(`${(item?.id ?? item?.templateId ?? name) || `shift-${index + 1}`}`, index),
        name: name.slice(0, 100),
        startTime: startTime.slice(0, 5),
        endTime: endTime.slice(0, 5),
        isActive: item?.isActive !== false,
      });
    });

    if (templates.length === 0) {
      return fallback;
    }

    return templates.sort((a, b) => a.startTime.localeCompare(b.startTime));
  } catch {
    return fallback;
  }
}

function buildDisplayName(input: { firstName?: string; lastName?: string; displayName?: string; email?: string }) {
  if (input.displayName?.trim()) {
    return input.displayName.trim();
  }

  const joined = `${input.firstName ?? ""} ${input.lastName ?? ""}`.trim();
  if (joined) {
    return joined;
  }

  return input.email ?? "-";
}

type ConfigurationGroupSummary = {
  title: string;
  description: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
};

function getConfigurationGroupSummary(groupName: string): ConfigurationGroupSummary {
  if (groupName === "General Settings") {
    return {
      title: "General",
      description: "Currency, timezone, and core behavior defaults.",
      icon: "settings-outline",
    };
  }

  if (groupName === "Pack Settings") {
    return {
      title: "Pack",
      description: "Pack selling order and ticket display behavior.",
      icon: "albums-outline",
    };
  }

  if (groupName === "Shift Settings") {
    return {
      title: "Shift",
      description: "Shift templates, timing, and close controls.",
      icon: "time-outline",
    };
  }

  if (groupName === "Barcode Settings") {
    return {
      title: "Barcode",
      description: "Camera scanning and manual-entry fallback controls.",
      icon: "barcode-outline",
    };
  }

  return {
    title: groupName.replace(/ Settings$/i, ""),
    description: "Shop configuration controls.",
    icon: "options-outline",
  };
}

export function UserManagementScreen() {
  const queryClient = useQueryClient();
  const { activeShopId, activeShop } = useAuth();
  const shopId = activeShopId;

  const usersQuery = useQuery({
    queryKey: ["users", shopId],
    queryFn: () => listUsers(shopId as string),
    enabled: Boolean(shopId),
  });

  const rolesQuery = useQuery({
    queryKey: ["roles"],
    queryFn: getRoleOptions,
    enabled: Boolean(shopId),
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, roleId }: { userId: string; roleId: string }) => {
      if (!shopId) throw new Error("Shop context missing.");
      return updateUserRole(userId, { shopId, roleId });
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["users", shopId] }),
    onError: (error: any) => Alert.alert("Failed", error?.response?.data?.message ?? "Unable to update role."),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ userId, isActive }: { userId: string; isActive: boolean }) => {
      if (!shopId) throw new Error("Shop context missing.");
      if (isActive) return deactivateUser(userId, shopId);
      return reactivateUser(userId, shopId);
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["users", shopId] }),
    onError: (error: any) => Alert.alert("Failed", error?.response?.data?.message ?? "Unable to change user status."),
  });

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={{ gap: 12 }}>
        <View style={ui.card}>
          <Text style={styles.meta}>Shop: {activeShop?.shopName ?? "-"}</Text>
          {(usersQuery.data ?? []).map((user) => (
            <View key={user.id} style={styles.item}>
              <Text style={styles.itemTitle}>{buildDisplayName(user)} ({user.email})</Text>
              <Text style={styles.meta}>Current Role: {user.roleName}</Text>
              <Text style={styles.meta}>Status: {user.isActive ? "Active" : "Inactive"}</Text>
              <Text style={styles.meta}>Last Login: {user.lastLoginOn ? new Date(user.lastLoginOn).toLocaleString() : "-"}</Text>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
                {(rolesQuery.data ?? []).map((role) => (
                  <Pressable
                    key={role.id}
                    style={styles.smallButton}
                    onPress={() => updateRoleMutation.mutate({ userId: user.id, roleId: role.id })}
                  >
                    <Text style={styles.smallButtonText}>Set {role.name}</Text>
                  </Pressable>
                ))}
              </ScrollView>

              <Pressable
                style={[styles.smallButton, user.isActive ? styles.smallButtonDanger : styles.smallButtonSuccess]}
                onPress={() => toggleActiveMutation.mutate({ userId: user.id, isActive: user.isActive })}
              >
                <Text style={styles.smallButtonText}>{user.isActive ? "Deactivate" : "Reactivate"}</Text>
              </Pressable>
            </View>
          ))}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

export function AppConfigurationScreen() {
  const { activeShopId, activeShop } = useAuth();
  const queryClient = useQueryClient();
  const shopId = activeShopId;
  const [draftValues, setDraftValues] = useState<Record<string, string>>({});
  const shiftTemplatesDraftKey = buildConfigDraftKey("Shift Settings", SHOP_CONFIG_KEYS.shiftTemplates);
  const shiftStartTimeDraftKey = buildConfigDraftKey("Shift Settings", SHOP_CONFIG_KEYS.shiftStartTime);
  const shiftEndTimeDraftKey = buildConfigDraftKey("Shift Settings", SHOP_CONFIG_KEYS.shiftEndTime);
  const shiftDefaultNameDraftKey = buildConfigDraftKey("Shift Settings", SHOP_CONFIG_KEYS.shiftDefaultName);
  const scratchCardDisplayCountDraftKey = buildConfigDraftKey("Pack Settings", SHOP_CONFIG_KEYS.scratchCardDisplayCount);

  const configurationsQuery = useQuery({
    queryKey: ["configurations", shopId],
    queryFn: () => getConfigurations(shopId ?? undefined),
    enabled: Boolean(shopId),
  });

  const grouped = useMemo(() => {
    const hiddenConfigKeys = new Set([
      "DefaultSellingOrder",
      SHOP_CONFIG_KEYS.shiftStartTime,
      SHOP_CONFIG_KEYS.shiftEndTime,
      SHOP_CONFIG_KEYS.shiftDefaultName,
    ]);
    const visibleGroups = new Set([
      "General Settings",
      "Pack Settings",
      "Shift Settings",
      "Barcode Settings",
    ]);
    const output = new Map<string, ConfigurationItem[]>();
    for (const item of configurationsQuery.data ?? []) {
      if (hiddenConfigKeys.has(item.configKey)) {
        continue;
      }
      if (!visibleGroups.has(item.groupName)) {
        continue;
      }
      const arr = output.get(item.groupName) ?? [];
      arr.push(item);
      output.set(item.groupName, arr);
    }

    return [...output.entries()]
      .map(([groupName, items]) => ([
        groupName,
        items.slice().sort((a, b) => a.configKey.localeCompare(b.configKey)),
      ] as const))
      .sort(([groupA], [groupB]) => groupA.localeCompare(groupB));
  }, [configurationsQuery.data]);
  const draftChangeCount = Object.keys(draftValues).length;
  const hasDraftChanges = draftChangeCount > 0;
  const totalVisibleConfigurationCount = grouped.reduce((total, [, items]) => total + items.length, 0);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!shopId) {
        throw new Error("Shop context missing.");
      }

      const draftEntries = new Map<string, string>(Object.entries(draftValues));
      if (draftEntries.has(shiftTemplatesDraftKey)) {
        const templates = parseShiftTemplatesEditor(draftEntries.get(shiftTemplatesDraftKey) ?? "");
        if (templates.length === 0) {
          throw new Error("At least one shift template is required.");
        }

        for (let i = 0; i < templates.length; i += 1) {
          const template = templates[i];
          if (!template.name.trim()) {
            throw new Error(`Shift ${i + 1}: name is required.`);
          }
          if (!isValid24HourTime(template.startTime)) {
            throw new Error(`Shift ${i + 1}: start time must be HH:mm (24-hour).`);
          }
          if (!isValid24HourTime(template.endTime)) {
            throw new Error(`Shift ${i + 1}: end time must be HH:mm (24-hour).`);
          }
        }

        const primaryTemplate = templates[0];
        draftEntries.set(shiftStartTimeDraftKey, primaryTemplate.startTime);
        draftEntries.set(shiftEndTimeDraftKey, primaryTemplate.endTime);
        draftEntries.set(shiftDefaultNameDraftKey, primaryTemplate.name);
        draftEntries.set(shiftTemplatesDraftKey, serializeShiftTemplates(templates));
      }

      if (draftEntries.has(scratchCardDisplayCountDraftKey)) {
        const rawDisplayCount = (draftEntries.get(scratchCardDisplayCountDraftKey) ?? "").trim();
        const parsedDisplayCount = Number(rawDisplayCount);
        if (!Number.isInteger(parsedDisplayCount) || parsedDisplayCount <= 0) {
          throw new Error("Scratch Card Display Count must be a whole number greater than zero.");
        }
        draftEntries.set(scratchCardDisplayCountDraftKey, String(parsedDisplayCount));
      }

      const changedItems = [...draftEntries.entries()]
        .map(([draftKey, configValue]) => {
          const parsedKey = parseConfigDraftKey(draftKey);
          if (!parsedKey.groupName || !parsedKey.configKey) {
            return null;
          }

          return {
            groupName: parsedKey.groupName,
            configKey: parsedKey.configKey,
            configValue,
          };
        })
        .filter((item): item is { groupName: string; configKey: string; configValue: string } => Boolean(item));

      if (changedItems.length === 0) {
        throw new Error("No configuration changes to save.");
      }

      return updateConfigurations({
        shopId,
        items: changedItems,
      });
    },
    onSuccess: () => {
      setDraftValues({});
      Alert.alert("Saved", "Configuration updated.");
      void queryClient.invalidateQueries({ queryKey: ["configurations", shopId] });
    },
    onError: (error: any) => {
      Alert.alert("Failed", error?.response?.data?.message ?? error?.message ?? "Unable to update configuration.");
    },
  });

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.configPageContent}>
        <View style={[ui.card, styles.configHeroCard]}>
          <View style={styles.configHeroHeaderRow}>
            <View style={styles.configHeroHeaderTextWrap}>
              <Text style={styles.configHeroTitle}>App Configuration</Text>
              <Text style={styles.meta}>Shop: {activeShop?.shopName ?? "-"}</Text>
            </View>
            <View style={styles.configCountPill}>
              <Text style={styles.configCountPillText}>{totalVisibleConfigurationCount} fields</Text>
            </View>
          </View>
          <Text style={styles.configHeroSubtitle}>
            Update operational behavior for general shop setup, scratch-card pack flow, and shifts.
          </Text>
          <View style={styles.configHeroStatusRow}>
            <View style={[styles.configStatusChip, hasDraftChanges ? styles.configStatusChipWarning : styles.configStatusChipSuccess]}>
              <Ionicons
                name={hasDraftChanges ? "create-outline" : "checkmark-circle-outline"}
                size={14}
                color={hasDraftChanges ? "#7A4B00" : "#0D5F2D"}
              />
              <Text style={[styles.configStatusChipText, hasDraftChanges ? styles.configStatusChipTextWarning : styles.configStatusChipTextSuccess]}>
                {hasDraftChanges ? `${draftChangeCount} unsaved change${draftChangeCount > 1 ? "s" : ""}` : "All changes saved"}
              </Text>
            </View>
          </View>
        </View>

        {configurationsQuery.isLoading ? (
          <View style={[ui.card, styles.configStateCard]}>
            <Text style={styles.itemTitle}>Loading settings...</Text>
            <Text style={styles.meta}>Fetching configuration values for this shop.</Text>
          </View>
        ) : null}

        {configurationsQuery.isError ? (
          <View style={[ui.card, styles.configStateCard]}>
            <Text style={styles.itemTitle}>Failed to load settings</Text>
            <Text style={styles.meta}>
              {(configurationsQuery.error as any)?.response?.data?.message
                ?? (configurationsQuery.error as any)?.message
                ?? "Unable to retrieve configuration values."}
            </Text>
            <Pressable
              style={styles.secondaryActionButton}
              onPress={() => void configurationsQuery.refetch()}
            >
              <Text style={styles.secondaryActionButtonText}>Retry</Text>
            </Pressable>
          </View>
        ) : null}

        {!configurationsQuery.isLoading && !configurationsQuery.isError && grouped.map(([groupName, items]) => {
          const groupSummary = getConfigurationGroupSummary(groupName);
          return (
            <View key={groupName} style={styles.groupCard}>
              <View style={styles.groupHeaderRow}>
                <View style={styles.groupHeaderInfo}>
                  <View style={styles.groupHeaderIconWrap}>
                    <Ionicons name={groupSummary.icon} size={16} color={appTheme.colors.primary} />
                  </View>
                  <View style={styles.groupHeaderTextWrap}>
                    <Text style={styles.groupHeaderTitle}>{groupSummary.title}</Text>
                    <Text style={styles.groupHeaderDescription}>{groupSummary.description}</Text>
                  </View>
                </View>
                <View style={styles.groupCountPill}>
                  <Text style={styles.groupCountPillText}>{items.length}</Text>
                </View>
              </View>

              <View style={styles.groupFieldList}>
                {items.map((item) => {
                  const itemDraftKey = buildConfigDraftKey(item.groupName, item.configKey);
                  const draft = draftValues[itemDraftKey];
                  const currentValue = draft ?? item.configValue;
                  const currentBoolValue = parseBooleanValue(currentValue);
                  const isEdited = typeof draft === "string" && draft !== item.configValue;

                  return (
                    <View
                      key={item.id}
                      style={[
                        styles.configFieldCard,
                        isEdited ? styles.configFieldCardEdited : null,
                      ]}
                    >
                      <View style={styles.configFieldHeaderRow}>
                        <Text style={styles.configFieldLabel}>{prettifyConfigKey(item.configKey)}</Text>
                        {isEdited ? (
                          <View style={styles.configEditedBadge}>
                            <Text style={styles.configEditedBadgeText}>Edited</Text>
                          </View>
                        ) : null}
                      </View>

                      {isShiftTemplatesConfiguration(item.configKey) ? (
                        <View style={styles.shiftTemplateList}>
                          {parseShiftTemplatesEditor(currentValue).map((template, index, sourceTemplates) => {
                            const updateTemplates = (nextTemplates: ShiftTemplateSetup[]) => {
                              setDraftValues((prev) => ({
                                ...prev,
                                [itemDraftKey]: serializeShiftTemplates(nextTemplates),
                              }));
                            };

                            const updateCurrentTemplate = (patch: Partial<ShiftTemplateSetup>) => {
                              const nextTemplates = sourceTemplates.map((entry, rowIndex) => (
                                rowIndex === index ? { ...entry, ...patch } : entry
                              ));
                              updateTemplates(nextTemplates);
                            };

                            const removeTemplate = () => {
                              if (sourceTemplates.length <= 1) {
                                Alert.alert("At least one shift is required.");
                                return;
                              }

                              const nextTemplates = sourceTemplates.filter((_, rowIndex) => rowIndex !== index);
                              updateTemplates(nextTemplates);
                            };

                            return (
                              <View key={`${template.id}-${index}`} style={styles.shiftTemplateCard}>
                                <View style={styles.shiftTemplateHeaderRow}>
                                  <Text style={styles.itemTitle}>Shift {index + 1}</Text>
                                  <Pressable
                                    style={[styles.smallButton, styles.smallButtonDanger]}
                                    onPress={removeTemplate}
                                  >
                                    <Text style={styles.smallButtonText}>Remove</Text>
                                  </Pressable>
                                </View>
                                <Text style={styles.fieldLabel}>Shift Name</Text>
                                <TextInput
                                  style={styles.input}
                                  value={template.name}
                                  onChangeText={(value) => updateCurrentTemplate({ name: value })}
                                  placeholder={`Shift ${index + 1}`}
                                />
                                <View style={styles.shiftTemplateTimeRow}>
                                  <View style={styles.shiftTemplateTimeColumn}>
                                    <Text style={styles.fieldLabel}>Start Time</Text>
                                    <TextInput
                                      style={styles.input}
                                      value={template.startTime}
                                      onChangeText={(value) => updateCurrentTemplate({ startTime: value })}
                                      placeholder="HH:mm"
                                      keyboardType="numbers-and-punctuation"
                                      autoCapitalize="none"
                                      autoCorrect={false}
                                      maxLength={5}
                                    />
                                  </View>
                                  <View style={styles.shiftTemplateTimeColumn}>
                                    <Text style={styles.fieldLabel}>End Time</Text>
                                    <TextInput
                                      style={styles.input}
                                      value={template.endTime}
                                      onChangeText={(value) => updateCurrentTemplate({ endTime: value })}
                                      placeholder="HH:mm"
                                      keyboardType="numbers-and-punctuation"
                                      autoCapitalize="none"
                                      autoCorrect={false}
                                      maxLength={5}
                                    />
                                  </View>
                                </View>
                                <View style={styles.row}>
                                  <Pressable
                                    style={[styles.choiceChip, template.isActive ? styles.choiceChipSelected : null]}
                                    onPress={() => updateCurrentTemplate({ isActive: true })}
                                  >
                                    <Text style={[styles.choiceChipText, template.isActive ? styles.choiceChipTextSelected : null]}>Active</Text>
                                  </Pressable>
                                  <Pressable
                                    style={[styles.choiceChip, !template.isActive ? styles.choiceChipSelected : null]}
                                    onPress={() => updateCurrentTemplate({ isActive: false })}
                                  >
                                    <Text style={[styles.choiceChipText, !template.isActive ? styles.choiceChipTextSelected : null]}>Inactive</Text>
                                  </Pressable>
                                </View>
                              </View>
                            );
                          })}
                          <Pressable
                            style={[styles.smallButton, styles.smallButtonSecondary]}
                            onPress={() => {
                              const templates = parseShiftTemplatesEditor(currentValue);
                              const nextIndex = templates.length;
                              const nextTemplates = [
                                ...templates,
                                {
                                  id: buildShiftTemplateId(`shift-${nextIndex + 1}`, nextIndex),
                                  name: "",
                                  startTime: "06:00",
                                  endTime: "14:00",
                                  isActive: true,
                                },
                              ];

                              setDraftValues((prev) => ({
                                ...prev,
                                [itemDraftKey]: serializeShiftTemplates(nextTemplates),
                              }));
                            }}
                          >
                            <Text style={[styles.smallButtonText, styles.smallButtonTextSecondary]}>Add Shift</Text>
                          </Pressable>
                          <Text style={styles.caption}>
                            Use 24-hour format (HH:mm). Overnight shift is supported; e.g. 22:00 to 06:00 belongs to the starting business day.
                          </Text>
                        </View>
                      ) : isTimeConfiguration(item.configKey, currentValue) ? (
                        <DateTimeField
                          mode="time"
                          value={currentValue}
                          onChange={(value) => setDraftValues((prev) => ({ ...prev, [itemDraftKey]: value }))}
                          placeholder="Select time"
                        />
                      ) : isSellingOrderConfiguration(item.configKey) ? (
                        <View style={styles.row}>
                          <Pressable
                            style={[styles.choiceChip, currentValue.toLowerCase() === SellingOrder.Ascending.toLowerCase() ? styles.choiceChipSelected : null]}
                            onPress={() => setDraftValues((prev) => ({ ...prev, [itemDraftKey]: SellingOrder.Ascending }))}
                          >
                            <Text style={[styles.choiceChipText, currentValue.toLowerCase() === SellingOrder.Ascending.toLowerCase() ? styles.choiceChipTextSelected : null]}>
                              Start From 0
                            </Text>
                          </Pressable>
                          <Pressable
                            style={[styles.choiceChip, currentValue.toLowerCase() === SellingOrder.Descending.toLowerCase() ? styles.choiceChipSelected : null]}
                            onPress={() => setDraftValues((prev) => ({ ...prev, [itemDraftKey]: SellingOrder.Descending }))}
                          >
                            <Text style={[styles.choiceChipText, currentValue.toLowerCase() === SellingOrder.Descending.toLowerCase() ? styles.choiceChipTextSelected : null]}>
                              End To 0
                            </Text>
                          </Pressable>
                        </View>
                      ) : isBooleanConfiguration(item, currentValue) ? (
                        <View style={styles.row}>
                          <Pressable
                            style={[styles.choiceChip, currentBoolValue ? styles.choiceChipSelected : null]}
                            onPress={() => setDraftValues((prev) => ({ ...prev, [itemDraftKey]: "true" }))}
                          >
                            <Text style={[styles.choiceChipText, currentBoolValue ? styles.choiceChipTextSelected : null]}>Enabled</Text>
                          </Pressable>
                          <Pressable
                            style={[styles.choiceChip, !currentBoolValue ? styles.choiceChipSelected : null]}
                            onPress={() => setDraftValues((prev) => ({ ...prev, [itemDraftKey]: "false" }))}
                          >
                            <Text style={[styles.choiceChipText, !currentBoolValue ? styles.choiceChipTextSelected : null]}>Disabled</Text>
                          </Pressable>
                        </View>
                      ) : (
                        <TextInput
                          style={styles.input}
                          value={currentValue}
                          onChangeText={(value) => setDraftValues((prev) => ({ ...prev, [itemDraftKey]: value }))}
                          placeholder={item.configValue}
                          keyboardType={isScratchCardDisplayCountConfiguration(item.configKey) ? "number-pad" : "default"}
                        />
                      )}

                      {item.description ? <Text style={styles.caption}>{item.description}</Text> : null}
                    </View>
                  );
                })}
              </View>
            </View>
          );
        })}

        {!configurationsQuery.isLoading && !configurationsQuery.isError ? (
          <View style={[ui.card, styles.configFooterCard]}>
            <View style={styles.configFooterActionRow}>
              <Pressable
                style={[
                  styles.secondaryActionButton,
                  !hasDraftChanges || saveMutation.isPending ? styles.dateActionButtonDisabled : null,
                ]}
                onPress={() => setDraftValues({})}
                disabled={!hasDraftChanges || saveMutation.isPending}
              >
                <Text style={styles.secondaryActionButtonText}>Discard Changes</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.actionButton,
                  !hasDraftChanges || saveMutation.isPending ? styles.dateActionButtonDisabled : null,
                ]}
                onPress={() => saveMutation.mutate()}
                disabled={!hasDraftChanges || saveMutation.isPending}
              >
                <Text style={styles.actionButtonText}>{saveMutation.isPending ? "Saving..." : "Save Configuration"}</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </ScrollView>
    </ScreenContainer>
  );
}

export function CompanyManagementScreen() {
  const queryClient = useQueryClient();
  const [companyName, setCompanyName] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");

  const companiesQuery = useQuery({
    queryKey: ["companies", "mine"],
    queryFn: listMyCompanies,
  });

  const createCompanyMutation = useMutation({
    mutationFn: async () => {
      if (!companyName.trim()) {
        throw new Error("Company name is required.");
      }

      return createCompany({
        companyName: companyName.trim(),
        registrationNumber: registrationNumber.trim() || undefined,
      });
    },
    onSuccess: () => {
      setCompanyName("");
      setRegistrationNumber("");
      Alert.alert("Created", "Company created successfully.");
      void queryClient.invalidateQueries({ queryKey: ["companies", "mine"] });
    },
    onError: (error: any) => {
      Alert.alert("Failed", error?.response?.data?.message ?? error?.message ?? "Unable to create company.");
    },
  });

  const toggleCompanyMutation = useMutation({
    mutationFn: async (company: Company) =>
      updateCompany(company.id, {
        companyName: company.companyName,
        registrationNumber: company.registrationNumber,
        isActive: !company.isActive,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["companies", "mine"] });
    },
    onError: (error: any) => {
      Alert.alert("Failed", error?.response?.data?.message ?? "Unable to update company status.");
    },
  });

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={{ gap: 12 }}>
        <View style={ui.card}>
          <Text style={styles.fieldLabel}>Company Name</Text>
          <TextInput style={styles.input} value={companyName} onChangeText={setCompanyName} placeholder="Company name" />
          <Text style={styles.fieldLabel}>Registration Number</Text>
          <TextInput
            style={styles.input}
            value={registrationNumber}
            onChangeText={setRegistrationNumber}
            placeholder="Registration number (optional)"
          />
          <Pressable style={styles.actionButton} onPress={() => createCompanyMutation.mutate()}>
            <Text style={styles.actionButtonText}>{createCompanyMutation.isPending ? "Creating..." : "Create Company"}</Text>
          </Pressable>
        </View>

        <View style={ui.card}>
          <Text style={styles.sectionTitle}>My Companies</Text>
          {(companiesQuery.data ?? []).map((company) => (
            <View key={company.id} style={styles.item}>
              <Text style={styles.itemTitle}>{company.companyName}</Text>
              <Text style={styles.meta}>Reg No: {company.registrationNumber || "-"}</Text>
              <Text style={styles.meta}>Status: {company.isActive ? "Active" : "Inactive"}</Text>
              <Pressable style={styles.smallButton} onPress={() => toggleCompanyMutation.mutate(company)}>
                <Text style={styles.smallButtonText}>{company.isActive ? "Deactivate" : "Activate"}</Text>
              </Pressable>
            </View>
          ))}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

export function ShopManagementScreen() {
  const queryClient = useQueryClient();
  const { activeShop, refreshProfile } = useAuth();
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>(activeShop?.companyId ?? "");
  const [editingShopId, setEditingShopId] = useState<string | null>(null);
  const [editingIsActive, setEditingIsActive] = useState(true);
  const [shopName, setShopName] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [city, setCity] = useState("");
  const [postCode, setPostCode] = useState("");
  const [country, setCountry] = useState("UK");

  const companiesQuery = useQuery({
    queryKey: ["companies", "mine"],
    queryFn: listMyCompanies,
  });

  const companies = companiesQuery.data ?? [];

  const resolvedCompanyId = useMemo(() => {
    if (selectedCompanyId) {
      return selectedCompanyId;
    }
    return companies[0]?.id ?? "";
  }, [companies, selectedCompanyId]);

  const shopsQuery = useQuery({
    queryKey: ["shops", resolvedCompanyId],
    queryFn: () => listShops(resolvedCompanyId || undefined),
    enabled: companies.length > 0,
  });

  const saveShopMutation = useMutation({
    mutationFn: async () => {
      if (!resolvedCompanyId) {
        throw new Error("Select a company first.");
      }
      if (!shopName.trim() || !addressLine1.trim() || !city.trim() || !postCode.trim() || !country.trim()) {
        throw new Error("Shop name, address, city, postcode, and country are required.");
      }

      const payload = {
        companyId: resolvedCompanyId,
        shopName: shopName.trim(),
        addressLine1: addressLine1.trim(),
        addressLine2: addressLine2.trim() || undefined,
        city: city.trim(),
        postCode: postCode.trim(),
        country: country.trim(),
      };

      if (editingShopId) {
        return updateShop(editingShopId, {
          ...payload,
          isActive: editingIsActive,
        });
      }

      return createShop(payload);
    },
    onSuccess: () => {
      setEditingShopId(null);
      setEditingIsActive(true);
      setShopName("");
      setAddressLine1("");
      setAddressLine2("");
      setCity("");
      setPostCode("");
      setCountry("UK");
      Alert.alert(editingShopId ? "Updated" : "Created", editingShopId ? "Shop updated successfully." : "Shop created successfully.");
      void Promise.all([queryClient.invalidateQueries({ queryKey: ["shops", resolvedCompanyId] }), refreshProfile()]);
    },
    onError: (error: any) => {
      Alert.alert("Failed", error?.response?.data?.message ?? error?.message ?? `Unable to ${editingShopId ? "update" : "create"} shop.`);
    },
  });

  function beginEditShop(shop: Shop) {
    setEditingShopId(shop.id);
    setEditingIsActive(shop.isActive);
    setShopName(shop.shopName);
    setAddressLine1(shop.addressLine1);
    setAddressLine2(shop.addressLine2 ?? "");
    setCity(shop.city);
    setPostCode(shop.postCode);
    setCountry(shop.country);
  }

  function cancelEditShop() {
    setEditingShopId(null);
    setEditingIsActive(true);
    setShopName("");
    setAddressLine1("");
    setAddressLine2("");
    setCity("");
    setPostCode("");
    setCountry("UK");
  }

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={{ gap: 12 }}>
        <View style={ui.card}>
          <Text style={styles.meta}>Select Company</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
            {companies.map((company) => {
              const selected = company.id === resolvedCompanyId;
              return (
                <Pressable
                  key={company.id}
                  style={[styles.choiceChip, selected ? styles.choiceChipSelected : null]}
                  onPress={() => setSelectedCompanyId(company.id)}
                >
                  <Text style={[styles.choiceChipText, selected ? styles.choiceChipTextSelected : null]}>{company.companyName}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <Text style={styles.fieldLabel}>Shop Name</Text>
          <TextInput style={styles.input} value={shopName} onChangeText={setShopName} placeholder="Shop name" />
          <Text style={styles.fieldLabel}>Address Line 1</Text>
          <TextInput style={styles.input} value={addressLine1} onChangeText={setAddressLine1} placeholder="Address line 1" />
          <Text style={styles.fieldLabel}>Address Line 2</Text>
          <TextInput style={styles.input} value={addressLine2} onChangeText={setAddressLine2} placeholder="Address line 2 (optional)" />
          <Text style={styles.fieldLabel}>City</Text>
          <TextInput style={styles.input} value={city} onChangeText={setCity} placeholder="City" />
          <Text style={styles.fieldLabel}>Post Code</Text>
          <TextInput style={styles.input} value={postCode} onChangeText={setPostCode} placeholder="Post code" />
          <Text style={styles.fieldLabel}>Country</Text>
          <TextInput style={styles.input} value={country} onChangeText={setCountry} placeholder="Country" />

          {editingShopId ? (
            <View style={styles.row}>
              <Pressable
                style={[styles.choiceChip, editingIsActive ? styles.choiceChipSelected : null]}
                onPress={() => setEditingIsActive(true)}
              >
                <Text style={[styles.choiceChipText, editingIsActive ? styles.choiceChipTextSelected : null]}>Active</Text>
              </Pressable>
              <Pressable
                style={[styles.choiceChip, !editingIsActive ? styles.choiceChipSelected : null]}
                onPress={() => setEditingIsActive(false)}
              >
                <Text style={[styles.choiceChipText, !editingIsActive ? styles.choiceChipTextSelected : null]}>Inactive</Text>
              </Pressable>
            </View>
          ) : null}

          <Pressable style={styles.actionButton} onPress={() => saveShopMutation.mutate()}>
            <Text style={styles.actionButtonText}>
              {saveShopMutation.isPending
                ? (editingShopId ? "Updating..." : "Creating...")
                : (editingShopId ? "Update Shop" : "Create Shop")}
            </Text>
          </Pressable>
          {editingShopId ? (
            <Pressable style={[styles.actionButton, styles.smallButtonDanger]} onPress={cancelEditShop}>
              <Text style={styles.actionButtonText}>Cancel Edit</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={ui.card}>
          <Text style={styles.sectionTitle}>Company Shops</Text>
          {(shopsQuery.data ?? []).map((shop) => (
            <View key={shop.id} style={styles.item}>
              <Text style={styles.itemTitle}>{shop.shopName}</Text>
              <Text style={styles.meta}>{shop.addressLine1}, {shop.city}</Text>
              <Text style={styles.meta}>{shop.postCode}, {shop.country}</Text>
              <Text style={styles.meta}>Status: {shop.isActive ? "Active" : "Inactive"}</Text>
              <View style={styles.row}>
                <Pressable style={styles.smallButton} onPress={() => beginEditShop(shop)}>
                  <Text style={styles.smallButtonText}>Edit</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

function SettingsNavRow({
  icon,
  title,
  description,
  onPress,
  tone = "default",
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  onPress: () => void;
  tone?: "default" | "danger";
}) {
  const isDanger = tone === "danger";
  return (
    <Pressable
      style={({ pressed }) => [
        styles.settingsNavRow,
        isDanger ? styles.settingsNavRowDanger : null,
        pressed ? styles.settingsNavRowPressed : null,
      ]}
      onPress={onPress}
    >
      <View style={[styles.settingsNavIconWrap, isDanger ? styles.settingsNavIconWrapDanger : null]}>
        <Ionicons name={icon} size={17} color={isDanger ? appTheme.colors.danger : appTheme.colors.primary} />
      </View>
      <View style={styles.settingsNavTextWrap}>
        <Text style={[styles.settingsNavTitle, isDanger ? styles.settingsNavTitleDanger : null]}>{title}</Text>
        {/* <Text style={styles.settingsNavDescription}>{description}</Text> */}
      </View>
      <Ionicons name="chevron-forward" size={15} color={appTheme.colors.textSubtle} />
    </Pressable>
  );
}

export function SettingsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { profile, activeShop, signOut } = useAuth();

  const displayName = profile ? buildDisplayName(profile) : "-";
  const avatarInitial = displayName !== "-" && displayName.trim().length > 0 ? displayName.trim().charAt(0).toUpperCase() : "?";
  const shopCount = profile?.shops?.length ?? 0;
  const primaryRole = profile?.roles?.[0] ?? "-";
  const isShopOwner = profile?.roles?.some((role) => role === "ShopOwner") ?? false;
  const appVersion = Constants.expoConfig?.version ?? "1.0.0";

  type SettingsAction = {
    key: string;
    title: string;
    description: string;
    icon: keyof typeof Ionicons.glyphMap;
    onPress: () => void;
    tone?: "default" | "danger";
  };

  const managementActions: SettingsAction[] = [
    {
      key: "switch-shop",
      title: "Switch Shop",
      description: "Change your active store and company context.",
      icon: "swap-horizontal-outline",
      onPress: () => (navigation.getParent() as any)?.navigate("ShopSelector"),
    },
    {
      key: "user-invitations",
      title: "User Invitations",
      description: "Invite team members and manage invitation requests.",
      icon: "mail-outline",
      onPress: () => navigation.navigate("UserInvitations"),
    },
    {
      key: "app-configuration",
      title: "App Configuration",
      description: "Control operational times and runtime settings.",
      icon: "construct-outline",
      onPress: () => navigation.navigate("AppConfiguration"),
    },
  ];

  if (isShopOwner) {
    managementActions.push(
      {
        key: "company-management",
        title: "Company Management",
        description: "Update company records and activation status.",
        icon: "business-outline",
        onPress: () => navigation.navigate("CompanyManagement"),
      },
      {
        key: "shop-management",
        title: "Shop Management",
        description: "Create or edit shops and maintain store details.",
        icon: "storefront-outline",
        onPress: () => navigation.navigate("ShopManagement"),
      },
      {
        key: "user-management",
        title: "User Management",
        description: "Change user roles and active states.",
        icon: "people-outline",
        onPress: () => navigation.navigate("UserManagement"),
      },
    );
  }

  async function onSignOut() {
    try {
      await signOut();
    } catch {
      Alert.alert("Sign out failed", "Unable to complete sign out. Please try again.");
    }
  }

  return (
    <ScreenContainer>
      <View style={[ui.card, styles.settingsHeroCard]}>
        <View style={styles.settingsHeroHeader}>
          <View style={styles.settingsAvatar}>
            <Text style={styles.settingsAvatarText}>{avatarInitial}</Text>
          </View>
          <View style={styles.settingsHeroTextWrap}>
            <Text style={styles.settingsHeroName}>{displayName}</Text>
            <Text style={styles.settingsHeroEmail}>{profile?.email ?? "-"}</Text>
            <View style={styles.settingsMetaChipRow}>
              <View style={styles.settingsMetaChip}>
                <Ionicons name="shield-checkmark-outline" size={12} color={appTheme.colors.primary} />
                <Text style={styles.settingsMetaChipText}>{primaryRole}</Text>
              </View>
              <View style={styles.settingsMetaChip}>
                <Ionicons name="business-outline" size={12} color={appTheme.colors.primary} />
                <Text style={styles.settingsMetaChipText}>{shopCount} assigned shops</Text>
              </View>
            </View>
          </View>
        </View>
        <View style={styles.settingsContextCard}>
          <LabeledValue label="Active shop" value={activeShop?.shopName ?? "-"} />
          <LabeledValue label="Active company" value={activeShop?.companyName ?? "-"} />
        </View>
      </View>

      <View style={ui.card}>
        <Text style={styles.sectionTitle}>Management</Text>
        <Text style={styles.settingsSectionMeta}>Admin tools for teams, stores, and platform behavior.</Text>
        <View style={styles.settingsSectionRows}>
          {managementActions.map((action) => (
            <SettingsNavRow
              key={action.key}
              icon={action.icon}
              title={action.title}
              description={action.description}
              onPress={action.onPress}
              tone={action.tone}
            />
          ))}
        </View>
      </View>

      {/* <View style={ui.card}>
        <Text style={styles.sectionTitle}>Environment</Text>
        <LabeledValue label="App version" value={appVersion} />
        <LabeledValue label="API base URL" value={resolvedApiBaseUrl} />
        <LabeledValue label="Mode" value={__DEV__ ? "Development" : "Production"} />
      </View> */}

      <View style={ui.card}>
        {/* <Text style={styles.sectionTitle}>Session</Text> */}
        {/* <Text style={styles.settingsSectionMeta}>End your current authenticated session on this device.</Text> */}
        <SettingsNavRow
          icon="log-out-outline"
          title="Sign Out"
          description="You can sign back in with your company account."
          onPress={onSignOut}
          tone="danger"
        />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 24, lineHeight: 28, color: appTheme.colors.text, fontFamily: appTheme.fonts.heading },
  sectionTitle: { fontSize: 17, lineHeight: 22, color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium },
  configPageContent: {
    gap: 12,
    paddingBottom: appTheme.spacing.sm,
  },
  configHeroCard: {
    gap: appTheme.spacing.sm,
    backgroundColor: "#F4F8FF",
    borderWidth: 1,
    borderColor: "#D8E5F9",
  },
  configHeroHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: appTheme.spacing.sm,
  },
  configHeroHeaderTextWrap: {
    flex: 1,
    gap: 2,
  },
  configHeroTitle: {
    fontFamily: appTheme.fonts.heading,
    color: appTheme.colors.text,
    fontSize: 20,
    lineHeight: 26,
  },
  configCountPill: {
    borderRadius: appTheme.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: "#E2ECFB",
    borderWidth: 1,
    borderColor: "#C4D7F7",
  },
  configCountPillText: {
    color: "#2B4E83",
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 15,
  },
  configHeroSubtitle: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.body,
    fontSize: 13,
    lineHeight: 18,
  },
  configHeroStatusRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  configStatusChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: appTheme.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
  },
  configStatusChipWarning: {
    backgroundColor: "#FFF4DF",
    borderColor: "#E9C789",
  },
  configStatusChipSuccess: {
    backgroundColor: "#E8F9ED",
    borderColor: "#A9D9B8",
  },
  configStatusChipText: {
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 15,
  },
  configStatusChipTextWarning: {
    color: "#7A4B00",
  },
  configStatusChipTextSuccess: {
    color: "#0D5F2D",
  },
  configStateCard: {
    gap: appTheme.spacing.xs,
  },
  settingsHeroCard: {
    gap: appTheme.spacing.md,
    backgroundColor: "#F2F6FD",
  },
  settingsHeroHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: appTheme.spacing.sm,
  },
  settingsAvatar: {
    width: 54,
    height: 54,
    borderRadius: appTheme.radius.pill,
    backgroundColor: appTheme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  settingsAvatarText: {
    color: appTheme.colors.onPrimary,
    fontFamily: appTheme.fonts.heading,
    fontSize: 22,
    lineHeight: 26,
  },
  settingsHeroTextWrap: {
    flex: 1,
    gap: 3,
  },
  settingsHeroName: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.heading,
    fontSize: 22,
    lineHeight: 28,
  },
  settingsHeroEmail: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.body,
    fontSize: 13,
    lineHeight: 17,
  },
  settingsMetaChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 2,
  },
  settingsMetaChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: appTheme.radius.pill,
    borderWidth: 1,
    borderColor: "#BFE2E7",
    backgroundColor: "#E8F8FB",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  settingsMetaChipText: {
    color: appTheme.colors.primary,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 14,
  },
  settingsContextCard: {
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surface,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: appTheme.spacing.sm,
    gap: appTheme.spacing.xs,
  },
  settingsSectionMeta: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.body,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 1,
  },
  settingsSectionRows: {
    gap: appTheme.spacing.xs,
    marginTop: 2,
  },
  settingsNavRow: {
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: appTheme.spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: appTheme.spacing.xs,
  },
  settingsNavRowPressed: {
    opacity: 0.9,
  },
  settingsNavRowDanger: {
    backgroundColor: "#FFF0F3",
    borderColor: "#EEC5CF",
  },
  settingsNavIconWrap: {
    width: 30,
    height: 30,
    borderRadius: appTheme.radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E8F8FB",
  },
  settingsNavIconWrapDanger: {
    backgroundColor: "#FFE2E8",
  },
  settingsNavTextWrap: {
    flex: 1,
    gap: 2,
  },
  settingsNavTitle: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 18,
  },
  settingsNavTitleDanger: {
    color: appTheme.colors.danger,
  },
  settingsNavDescription: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.body,
    fontSize: 12,
    lineHeight: 16,
  },
  actionButton: {
    backgroundColor: appTheme.colors.primary,
    borderRadius: appTheme.radius.sm,
    borderWidth: 1,
    borderColor: "#0A3B3D",
    paddingVertical: 11,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
  },
  dateActionButtonDisabled: {
    opacity: 0.6,
  },
  actionButtonText: { color: "#ECFEFC", fontFamily: appTheme.fonts.bodyMedium, fontSize: 14, lineHeight: 18 },
  groupCard: {
    borderWidth: 1,
    borderColor: "#D9E2EE",
    borderRadius: appTheme.radius.sm,
    backgroundColor: "#F8FBFF",
    padding: 12,
    gap: 10,
  },
  groupHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  groupHeaderInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  groupHeaderIconWrap: {
    width: 30,
    height: 30,
    borderRadius: appTheme.radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EAF6F8",
    borderWidth: 1,
    borderColor: "#BFE2E7",
  },
  groupHeaderTextWrap: {
    flex: 1,
    gap: 2,
  },
  groupHeaderTitle: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 18,
  },
  groupHeaderDescription: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.body,
    fontSize: 12,
    lineHeight: 16,
  },
  groupCountPill: {
    borderRadius: appTheme.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "#C8D8EA",
    backgroundColor: "#EEF4FC",
  },
  groupCountPillText: {
    color: "#375C8D",
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 15,
  },
  groupFieldList: {
    gap: 8,
  },
  configFieldCard: {
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surface,
    padding: 10,
    gap: 6,
  },
  configFieldCardEdited: {
    borderColor: "#58A0A7",
    backgroundColor: "#F4FBFB",
  },
  configFieldHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  configFieldLabel: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 17,
    flex: 1,
  },
  configEditedBadge: {
    borderRadius: appTheme.radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: "#DBF3F5",
    borderWidth: 1,
    borderColor: "#91CDD4",
  },
  configEditedBadgeText: {
    color: "#0F666B",
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 11,
    lineHeight: 13,
  },
  shiftTemplateList: {
    gap: 8,
  },
  shiftTemplateCard: {
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surface,
    padding: 10,
    gap: 6,
  },
  shiftTemplateHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  shiftTemplateTimeRow: {
    flexDirection: "row",
    gap: 8,
  },
  shiftTemplateTimeColumn: {
    flex: 1,
    gap: 4,
  },
  item: {
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    padding: 10,
    gap: 4,
  },
  itemTitle: { fontFamily: appTheme.fonts.bodyMedium, color: appTheme.colors.text, fontSize: 14, lineHeight: 18 },
  meta: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 13, lineHeight: 18 },
  fieldLabel: {
    color: appTheme.colors.text,
    fontSize: 13,
    lineHeight: 16,
    fontFamily: appTheme.fonts.bodyMedium,
    marginTop: 2,
  },
  caption: { color: appTheme.colors.textSubtle, fontSize: 12, lineHeight: 16, fontFamily: appTheme.fonts.body },
  row: { flexDirection: "row", gap: 8 },
  choiceChip: {
    borderWidth: 1,
    borderColor: appTheme.colors.primary,
    borderRadius: appTheme.radius.pill,
    backgroundColor: "#E9F7F6",
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  choiceChipSelected: {
    backgroundColor: appTheme.colors.primary,
  },
  choiceChipText: {
    color: appTheme.colors.primary,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 14,
  },
  choiceChipTextSelected: {
    color: "#F4FFFE",
  },
  input: {
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surface,
    color: appTheme.colors.text,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: appTheme.spacing.sm,
    fontFamily: appTheme.fonts.body,
    fontSize: 14,
  },
  smallButton: {
    backgroundColor: appTheme.colors.primary,
    borderRadius: appTheme.radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  smallButtonSecondary: {
    backgroundColor: "#EAF6F8",
    borderWidth: 1,
    borderColor: "#A9D5DC",
  },
  smallButtonDanger: { backgroundColor: appTheme.colors.danger },
  smallButtonSuccess: { backgroundColor: appTheme.colors.success },
  smallButtonText: { color: "#FFF", fontFamily: appTheme.fonts.bodyMedium, fontSize: 12, lineHeight: 14 },
  smallButtonTextSecondary: {
    color: "#1A646A",
  },
  configFooterCard: {
    gap: appTheme.spacing.xs,
  },
  configFooterActionRow: {
    flexDirection: "row",
    gap: 8,
  },
  secondaryActionButton: {
    borderRadius: appTheme.radius.sm,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    backgroundColor: appTheme.colors.surfaceMuted,
    paddingVertical: 11,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
  },
  secondaryActionButtonText: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 18,
  },
  logoutButton: {
    backgroundColor: appTheme.colors.danger,
    borderRadius: appTheme.radius.sm,
    paddingVertical: 12,
    alignItems: "center",
  },
  logoutButtonText: { color: "#FFF", fontFamily: appTheme.fonts.bodyMedium, fontSize: 16, lineHeight: 18 },
});
