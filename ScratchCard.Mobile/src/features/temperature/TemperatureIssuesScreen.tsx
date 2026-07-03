import React, { useEffect, useMemo, useState } from "react";
import { Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import {
  getTemperatureAttachmentContent,
  listTemperatureEquipmentIssues,
  listTemperatureUnits,
  markTemperatureUnitNotWorking,
  resolveTemperatureIssue,
  setTemperatureIssueUnderMaintenance,
} from "../../api/temperatureLogsApi";
import { useAuth } from "../../auth/AuthContext";
import { EmptyState } from "../../components/EmptyState";
import { FloatingLabelInput } from "../../components/FloatingLabelInput";
import { ModalBackdropBlur } from "../../components/ModalBackdropBlur";
import { PrimaryButton } from "../../components/PrimaryButton";
import { ScreenContainer } from "../../components/ScreenContainer";
import { StatusBadge } from "../../components/StatusBadge";
import { toastError, toastSuccess } from "../../components/toast";
import { EquipmentWorkingStatus, TemperatureResult } from "../../types/enums";
import type { TemperatureEquipmentIssue } from "../../types/models";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";
import { getApiErrorMessage } from "../../utils/apiErrorMessage";
import { optimizeImage } from "../../utils/imageOptimizer";
import { cleanupLocalImage } from "../../utils/shareFile";
import { computeTemperatureTimer, formatDurationShort } from "./temperatureTimer";
import { defaultTargetBand, evaluateTemperature } from "./temperatureVerdict";

const MAX_ISSUE_PHOTOS = 5;
const WARNING_TONE = "#B26A00";

type PhotoDraft = { id: string; fileName: string; base64: string; contentType?: string; uri?: string };

async function ingestAssets(assets: { uri: string; fileName?: string | null }[]): Promise<PhotoDraft[]> {
  const drafts: PhotoDraft[] = [];
  for (const asset of assets) {
    try {
      const optimized = await optimizeImage(asset.uri, { maxDimension: 1600, compress: 0.7 });
      void cleanupLocalImage(asset.uri);
      drafts.push({
        id: `${Date.now()}-${Math.random()}`,
        fileName: asset.fileName ?? `temperature-${Date.now()}.jpg`,
        base64: optimized.base64,
        contentType: "image/jpeg",
        uri: optimized.uri,
      });
    } catch {
      // Skip an image that couldn't be processed.
    }
  }
  return drafts;
}

async function pickPhotosFromLibrary(remaining: number): Promise<PhotoDraft[]> {
  if (remaining <= 0) return [];
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    toastError("Photo library permission is required.");
    return [];
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: "images",
    quality: 1,
    allowsMultipleSelection: true,
    selectionLimit: remaining,
  });
  if (result.canceled) return [];
  return ingestAssets(result.assets.map((a) => ({ uri: a.uri, fileName: a.fileName })));
}

async function capturePhoto(): Promise<PhotoDraft[]> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    toastError("Camera permission is required.");
    return [];
  }
  const result = await ImagePicker.launchCameraAsync({ quality: 1 });
  if (result.canceled) return [];
  return ingestAssets(result.assets.map((a) => ({ uri: a.uri, fileName: a.fileName })));
}

function YesNoPills({ value, onChange }: { value: boolean | null; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.yesNoRow}>
      {[true, false].map((option) => {
        const active = value === option;
        return (
          <Pressable
            key={String(option)}
            accessibilityRole="button"
            onPress={() => onChange(option)}
            style={[styles.yesNoPill, active ? styles.yesNoPillActive : null]}
          >
            <Text style={[styles.yesNoPillText, active ? styles.yesNoPillTextActive : null]}>{option ? "Yes" : "No"}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function statusTone(status: EquipmentWorkingStatus): "success" | "danger" | "warning" | "neutral" {
  switch (status) {
    case EquipmentWorkingStatus.NotWorking:
      return "danger";
    case EquipmentWorkingStatus.UnderMaintenance:
      return "warning";
    case EquipmentWorkingStatus.Working:
      return "success";
    default:
      return "neutral";
  }
}

function statusLabel(status: EquipmentWorkingStatus): string {
  switch (status) {
    case EquipmentWorkingStatus.NotWorking:
      return "Not working";
    case EquipmentWorkingStatus.UnderMaintenance:
      return "Under maintenance";
    case EquipmentWorkingStatus.TemperatureWarning:
      return "Temperature warning";
    default:
      return status;
  }
}

// A compact photo strip with add-from-camera/library and remove, for the resolve/report modals.
function PhotoStrip({
  photos,
  onAdd,
  onRemove,
}: {
  photos: PhotoDraft[];
  onAdd: (drafts: PhotoDraft[]) => void;
  onRemove: (id: string) => void;
}) {
  const remaining = MAX_ISSUE_PHOTOS - photos.length;
  return (
    <View style={styles.photoRow}>
      {photos.map((photo) => (
        <View key={photo.id} style={styles.photoThumb}>
          {photo.uri ? <Image source={{ uri: photo.uri }} style={styles.photoThumbImage} /> : null}
          <Pressable accessibilityRole="button" style={styles.photoRemove} onPress={() => onRemove(photo.id)}>
            <Ionicons name="close" size={13} color="#fff" />
          </Pressable>
        </View>
      ))}
      {remaining > 0 ? (
        <>
          <Pressable accessibilityRole="button" style={styles.addPhotoTile} onPress={async () => onAdd(await capturePhoto())}>
            <Ionicons name="camera" size={18} color={appTheme.colors.textMuted} />
            <Text style={styles.addPhotoText}>Camera</Text>
          </Pressable>
          <Pressable accessibilityRole="button" style={styles.addPhotoTile} onPress={async () => onAdd(await pickPhotosFromLibrary(remaining))}>
            <Ionicons name="images" size={18} color={appTheme.colors.textMuted} />
            <Text style={styles.addPhotoText}>Library</Text>
          </Pressable>
        </>
      ) : null}
    </View>
  );
}

export function TemperatureIssuesScreen() {
  const queryClient = useQueryClient();
  const { activeShopId, profile } = useAuth();
  const shopId = activeShopId;

  const roles = profile?.roles ?? [];
  const canResolve = roles.some((r) => r === "CompanyOwner" || r === "Manager");
  const canOperate = roles.some(
    (r) => r === "CompanyOwner" || r === "Manager" || r === "Cashier" || r === "SalesAssistant",
  );

  // Ticks the timer labels every 30s without refetching.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  const issuesQuery = useQuery({
    queryKey: ["temperature-issues", shopId],
    queryFn: () => listTemperatureEquipmentIssues(shopId as string, true),
    enabled: Boolean(shopId),
    refetchInterval: 60000,
  });
  const unitsQuery = useQuery({
    queryKey: ["temperature-units", shopId],
    queryFn: () => listTemperatureUnits(shopId as string),
    enabled: Boolean(shopId),
    staleTime: 5 * 60 * 1000,
  });

  const issues = issuesQuery.data ?? [];
  const openUnitIds = useMemo(() => new Set(issues.map((i) => i.temperatureMonitoringUnitId)), [issues]);
  const availableUnits = useMemo(
    () => (unitsQuery.data ?? []).filter((u) => u.isActive && !openUnitIds.has(u.id)),
    [unitsQuery.data, openUnitIds],
  );

  // ── Photo preview ──
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const previewMutation = useMutation({
    mutationFn: (attachmentId: string) => getTemperatureAttachmentContent(attachmentId),
    onSuccess: (dataUrl) => (dataUrl ? setPreviewUri(dataUrl) : toastError("Photo is no longer available.")),
    onError: () => toastError("Couldn't load the photo."),
  });

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["temperature-issues", shopId] }),
      queryClient.invalidateQueries({ queryKey: ["temperature-units", shopId] }),
      queryClient.invalidateQueries({ queryKey: ["temperature-daily-log", shopId] }),
    ]);
  };

  // ── Under maintenance ──
  const maintenanceMutation = useMutation({
    mutationFn: (issueId: string) => setTemperatureIssueUnderMaintenance(issueId, {}),
    onSuccess: async () => {
      toastSuccess("Marked under maintenance.");
      await invalidate();
    },
    onError: (e) => toastError(getApiErrorMessage(e, "Couldn't update the issue.")),
  });

  // ── Resolve ──
  const [resolveTarget, setResolveTarget] = useState<TemperatureEquipmentIssue | null>(null);
  const [finalTemp, setFinalTemp] = useState("");
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [engineerContacted, setEngineerContacted] = useState<boolean | null>(null);
  const [foodActionCompleted, setFoodActionCompleted] = useState<boolean | null>(null);
  const [resolvePhotos, setResolvePhotos] = useState<PhotoDraft[]>([]);

  const closeResolve = () => {
    setResolveTarget(null);
    setFinalTemp("");
    setResolutionNotes("");
    setEngineerContacted(null);
    setFoodActionCompleted(null);
    setResolvePhotos([]);
  };

  const resolveVerdict = useMemo(() => {
    if (!resolveTarget) return null;
    const t = Number(finalTemp);
    if (!finalTemp.trim() || !Number.isFinite(t)) return null;
    const unit = (unitsQuery.data ?? []).find((u) => u.id === resolveTarget.temperatureMonitoringUnitId);
    const band = unit
      ? { minCelsius: unit.minTemperatureCelsius, maxCelsius: unit.maxTemperatureCelsius }
      : defaultTargetBand(resolveTarget.foodCategory);
    return evaluateTemperature(resolveTarget.foodCategory, t, band);
  }, [resolveTarget, finalTemp, unitsQuery.data]);

  const resolveMutation = useMutation({
    mutationFn: async () => {
      if (!resolveTarget) throw new Error("No issue selected.");
      return resolveTemperatureIssue(resolveTarget.id, {
        finalTemperatureCelsius: Number(finalTemp),
        resolutionNotes: resolutionNotes.trim(),
        engineerContacted: engineerContacted ?? undefined,
        foodActionCompleted: foodActionCompleted ?? undefined,
        attachments:
          resolvePhotos.length > 0
            ? resolvePhotos.map((p) => ({ fileName: p.fileName, base64: p.base64, contentType: p.contentType }))
            : undefined,
      });
    },
    onSuccess: async () => {
      toastSuccess(resolveVerdict === TemperatureResult.Warning ? "Resolved with warning." : "Issue resolved.");
      closeResolve();
      await invalidate();
    },
    onError: (e) => toastError(getApiErrorMessage(e, "Couldn't resolve the issue.")),
  });

  const submitResolve = () => {
    if (resolveMutation.isPending) return;
    if (!finalTemp.trim() || !Number.isFinite(Number(finalTemp))) {
      toastError("Enter the final temperature.");
      return;
    }
    if (!resolutionNotes.trim()) {
      toastError("Enter the action taken.");
      return;
    }
    if (foodActionCompleted === null) {
      toastError("Confirm whether the food action was completed.");
      return;
    }
    if (resolveVerdict === TemperatureResult.Fail) {
      toastError("The final temperature is still failing — the unit can't return to service yet.");
      return;
    }
    resolveMutation.mutate();
  };

  // ── Mark not working (§15) ──
  const [markOpen, setMarkOpen] = useState(false);
  const [markUnitId, setMarkUnitId] = useState("");
  const [markReason, setMarkReason] = useState("");
  const [markFoodAffected, setMarkFoodAffected] = useState<boolean | null>(null);
  const [markManagerInformed, setMarkManagerInformed] = useState<boolean | null>(null);
  const [markPhotos, setMarkPhotos] = useState<PhotoDraft[]>([]);

  const closeMark = () => {
    setMarkOpen(false);
    setMarkUnitId("");
    setMarkReason("");
    setMarkFoodAffected(null);
    setMarkManagerInformed(null);
    setMarkPhotos([]);
  };

  const markMutation = useMutation({
    mutationFn: async () => {
      if (!shopId) throw new Error("No shop selected.");
      if (!markUnitId) throw new Error("Select a unit.");
      if (!markReason.trim()) throw new Error("Enter a reason.");
      return markTemperatureUnitNotWorking(markUnitId, {
        shopId,
        reason: markReason.trim(),
        foodAffected: markFoodAffected ?? undefined,
        managerInformed: markManagerInformed ?? undefined,
        attachments:
          markPhotos.length > 0
            ? markPhotos.map((p) => ({ fileName: p.fileName, base64: p.base64, contentType: p.contentType }))
            : undefined,
      });
    },
    onSuccess: async () => {
      toastSuccess("Unit marked not working.");
      closeMark();
      await invalidate();
    },
    onError: (e) => toastError(getApiErrorMessage(e, "Couldn't mark the unit not working.")),
  });

  return (
    <ScreenContainer>
      <View style={ui.card}>
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Open equipment issues</Text>
          {canOperate ? (
            <Pressable
              accessibilityRole="button"
              style={({ pressed }) => [styles.addButton, pressed ? styles.pressed : null]}
              onPress={() => setMarkOpen(true)}
            >
              <Text style={styles.addButtonText}>Report not working</Text>
            </Pressable>
          ) : null}
        </View>

        {issues.map((issue) => {
          const timer = computeTemperatureTimer(issue.issueStartedOn, issue.foodCategory, now);
          const timerColor = timer.stage === "over" ? appTheme.colors.danger : timer.stage === "near" ? WARNING_TONE : appTheme.colors.textMuted;
          return (
            <View key={issue.id} style={styles.issueCard}>
              <View style={styles.issueHeader}>
                <Text style={styles.issueTitle}>{issue.unitName}</Text>
                <StatusBadge label={statusLabel(issue.status)} tone={statusTone(issue.status)} />
              </View>
              <Text style={styles.meta}>{issue.reason}</Text>

              {timer.hasLimit ? (
                <View style={styles.timerRow}>
                  <Ionicons name="time-outline" size={15} color={timerColor} />
                  <Text style={[styles.timerText, { color: timerColor }]}>{timer.label}</Text>
                </View>
              ) : (
                <Text style={styles.meta}>Open {formatDurationShort(timer.elapsedMinutes)}</Text>
              )}

              {issue.temperatureAtOpenCelsius != null ? (
                <Text style={styles.meta}>At open: {issue.temperatureAtOpenCelsius.toFixed(1)}°C</Text>
              ) : null}
              {issue.openedByName ? <Text style={styles.metaSubtle}>Reported by {issue.openedByName}</Text> : null}

              {issue.foodMoved || issue.foodDiscarded || issue.managerInformed ? (
                <Text style={styles.metaSubtle}>
                  {[
                    issue.managerInformed ? "Manager informed" : null,
                    issue.foodMoved ? `Food moved${issue.foodMovedTo ? ` → ${issue.foodMovedTo}` : ""}` : null,
                    issue.foodDiscarded ? "Food discarded" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </Text>
              ) : null}

              {issue.attachments.length > 0 ? (
                <View style={styles.photoRow}>
                  {issue.attachments.map((att) => (
                    <Pressable
                      key={att.id}
                      accessibilityRole="button"
                      style={styles.photoThumb}
                      onPress={() => previewMutation.mutate(att.id)}
                    >
                      <View style={styles.photoPlaceholder}>
                        <Ionicons name="image-outline" size={20} color={appTheme.colors.textMuted} />
                      </View>
                    </Pressable>
                  ))}
                </View>
              ) : null}

              <View style={styles.issueActions}>
                {canOperate && issue.status === EquipmentWorkingStatus.NotWorking ? (
                  <Pressable
                    accessibilityRole="button"
                    style={styles.secondaryButton}
                    onPress={() => maintenanceMutation.mutate(issue.id)}
                    disabled={maintenanceMutation.isPending}
                  >
                    <Text style={styles.secondaryButtonText}>Under maintenance</Text>
                  </Pressable>
                ) : null}
                {canResolve ? (
                  <Pressable accessibilityRole="button" style={styles.primaryButton} onPress={() => setResolveTarget(issue)}>
                    <Text style={styles.primaryButtonText}>Resolve</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          );
        })}

        {!issuesQuery.isFetching && issues.length === 0 ? (
          <EmptyState icon="checkmark-circle-outline" title="No open issues" message="Every unit is working. Nice." />
        ) : null}
        {!canResolve ? <Text style={styles.metaSubtle}>Only a manager or owner can resolve an issue.</Text> : null}
      </View>

      {/* ── Resolve modal ── */}
      <Modal visible={resolveTarget !== null} transparent animationType="fade" onRequestClose={closeResolve}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <View style={styles.modalBackdrop}>
            <ModalBackdropBlur />
            <ScrollView contentContainerStyle={styles.modalScroll} keyboardShouldPersistTaps="handled">
              <View style={styles.modalCard}>
                <Text style={styles.sectionTitle}>Resolve — {resolveTarget?.unitName}</Text>
                <Text style={styles.meta}>Record the final check before the unit returns to service (§20).</Text>
                <FloatingLabelInput
                  label="Final temperature °C"
                  value={finalTemp}
                  onChangeText={(v) => setFinalTemp(v.replace(/[^0-9.-]/g, ""))}
                  keyboardType="numbers-and-punctuation"
                />
                {resolveVerdict ? (
                  <Text
                    style={[
                      styles.verdictHint,
                      {
                        color:
                          resolveVerdict === TemperatureResult.Pass
                            ? appTheme.colors.success
                            : resolveVerdict === TemperatureResult.Fail
                              ? appTheme.colors.danger
                              : WARNING_TONE,
                      },
                    ]}
                  >
                    {resolveVerdict === TemperatureResult.Pass
                      ? "Safe — the unit will return to Working."
                      : resolveVerdict === TemperatureResult.Fail
                        ? "Still failing — you can't return the unit to service yet."
                        : "In the warning band — will be resolved with a warning."}
                  </Text>
                ) : null}
                <FloatingLabelInput label="Action taken" value={resolutionNotes} onChangeText={setResolutionNotes} multiline />
                <View style={styles.failQuestionRow}>
                  <Text style={styles.failQuestionLabel}>Engineer contacted?</Text>
                  <YesNoPills value={engineerContacted} onChange={setEngineerContacted} />
                </View>
                <View style={styles.failQuestionRow}>
                  <Text style={styles.failQuestionLabel}>Food action completed?</Text>
                  <YesNoPills value={foodActionCompleted} onChange={setFoodActionCompleted} />
                </View>
                <Text style={styles.miniLabel}>Photos (optional)</Text>
                <PhotoStrip
                  photos={resolvePhotos}
                  onAdd={(drafts) => setResolvePhotos((prev) => [...prev, ...drafts].slice(0, MAX_ISSUE_PHOTOS))}
                  onRemove={(id) => setResolvePhotos((prev) => prev.filter((p) => p.id !== id))}
                />
                <View style={styles.modalActions}>
                  <PrimaryButton
                    label={resolveMutation.isPending ? "Resolving…" : "Resolve issue"}
                    onPress={submitResolve}
                    disabled={resolveMutation.isPending || resolveVerdict === TemperatureResult.Fail}
                    size="sm"
                  />
                  <PrimaryButton label="Cancel" tone="neutral" size="sm" onPress={closeResolve} disabled={resolveMutation.isPending} />
                </View>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Mark not working modal (§15) ── */}
      <Modal visible={markOpen} transparent animationType="fade" onRequestClose={closeMark}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <View style={styles.modalBackdrop}>
            <ModalBackdropBlur />
            <ScrollView contentContainerStyle={styles.modalScroll} keyboardShouldPersistTaps="handled">
              <View style={styles.modalCard}>
                <Text style={styles.sectionTitle}>Report equipment not working</Text>
                {availableUnits.length === 0 ? (
                  <Text style={styles.meta}>Every active unit already has an open issue.</Text>
                ) : (
                  <>
                    <Text style={styles.miniLabel}>Unit</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipWrap}>
                      {availableUnits.map((unit) => {
                        const selected = unit.id === markUnitId;
                        return (
                          <Pressable
                            key={unit.id}
                            accessibilityRole="button"
                            onPress={() => setMarkUnitId(unit.id)}
                            style={[styles.unitChip, selected ? styles.unitChipSelected : null]}
                          >
                            <Text style={[styles.unitChipText, selected ? styles.unitChipTextSelected : null]}>{unit.unitName}</Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  </>
                )}
                <FloatingLabelInput label="Reason (required)" value={markReason} onChangeText={setMarkReason} multiline />
                <View style={styles.failQuestionRow}>
                  <Text style={styles.failQuestionLabel}>Is food affected?</Text>
                  <YesNoPills value={markFoodAffected} onChange={setMarkFoodAffected} />
                </View>
                <View style={styles.failQuestionRow}>
                  <Text style={styles.failQuestionLabel}>Has the manager been informed?</Text>
                  <YesNoPills value={markManagerInformed} onChange={setMarkManagerInformed} />
                </View>
                <Text style={styles.miniLabel}>Photos (optional)</Text>
                <PhotoStrip
                  photos={markPhotos}
                  onAdd={(drafts) => setMarkPhotos((prev) => [...prev, ...drafts].slice(0, MAX_ISSUE_PHOTOS))}
                  onRemove={(id) => setMarkPhotos((prev) => prev.filter((p) => p.id !== id))}
                />
                <View style={styles.modalActions}>
                  <PrimaryButton
                    label={markMutation.isPending ? "Saving…" : "Mark not working"}
                    onPress={() => {
                      if (markMutation.isPending) return;
                      if (!markUnitId) {
                        toastError("Select a unit.");
                        return;
                      }
                      if (!markReason.trim()) {
                        toastError("Enter a reason.");
                        return;
                      }
                      markMutation.mutate();
                    }}
                    disabled={markMutation.isPending || availableUnits.length === 0}
                    size="sm"
                  />
                  <PrimaryButton label="Cancel" tone="neutral" size="sm" onPress={closeMark} disabled={markMutation.isPending} />
                </View>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Photo preview ── */}
      <Modal visible={previewUri !== null} transparent animationType="fade" onRequestClose={() => setPreviewUri(null)}>
        <Pressable style={styles.previewBackdrop} onPress={() => setPreviewUri(null)}>
          <ModalBackdropBlur />
          {previewUri ? <Image source={{ uri: previewUri }} style={styles.previewImage} resizeMode="contain" /> : null}
        </Pressable>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: appTheme.spacing.sm,
  },
  sectionTitle: {
    color: appTheme.colors.text,
    fontSize: 17,
    lineHeight: 22,
    fontFamily: appTheme.fonts.bodyMedium,
    flex: 1,
  },
  addButton: {
    borderWidth: 1,
    borderColor: appTheme.colors.primary,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  addButtonText: {
    color: appTheme.colors.primary,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 16,
  },
  pressed: { opacity: 0.6 },
  issueCard: {
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    padding: appTheme.spacing.sm,
    gap: 4,
    marginTop: appTheme.spacing.sm,
  },
  issueHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: appTheme.spacing.xs,
  },
  issueTitle: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 15,
    lineHeight: 19,
    flex: 1,
  },
  meta: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.body,
    fontSize: 13,
    lineHeight: 18,
  },
  metaSubtle: {
    color: appTheme.colors.textSubtle,
    fontFamily: appTheme.fonts.body,
    fontSize: 12,
    lineHeight: 16,
  },
  timerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  timerText: {
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 17,
  },
  issueActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: appTheme.spacing.xs,
    marginTop: appTheme.spacing.xs,
  },
  primaryButton: {
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  primaryButtonText: {
    color: appTheme.colors.onPrimary,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 16,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: appTheme.colors.primary,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  secondaryButtonText: {
    color: appTheme.colors.primary,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 16,
  },
  miniLabel: {
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    color: appTheme.colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginTop: 2,
  },
  verdictHint: {
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 17,
  },
  failQuestionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: appTheme.spacing.sm,
    marginTop: appTheme.spacing.xs,
  },
  failQuestionLabel: {
    flex: 1,
    fontFamily: appTheme.fonts.body,
    fontSize: 13,
    color: appTheme.colors.text,
  },
  yesNoRow: { flexDirection: "row", gap: 6 },
  yesNoPill: {
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: 5,
    borderRadius: appTheme.radius.pill,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    backgroundColor: appTheme.colors.surface,
  },
  yesNoPillActive: {
    borderColor: appTheme.colors.primary,
    backgroundColor: appTheme.colors.primary,
  },
  yesNoPillText: {
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    color: appTheme.colors.textMuted,
  },
  yesNoPillTextActive: { color: appTheme.colors.onPrimary },
  chipWrap: { gap: appTheme.spacing.xs, paddingVertical: 2 },
  unitChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: appTheme.radius.pill,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    backgroundColor: appTheme.colors.surface,
  },
  unitChipSelected: {
    borderColor: appTheme.colors.primary,
    backgroundColor: appTheme.colors.primary,
  },
  unitChipText: {
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 13,
    color: appTheme.colors.textMuted,
  },
  unitChipTextSelected: { color: appTheme.colors.onPrimary },
  photoRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: appTheme.spacing.xs,
    marginTop: appTheme.spacing.xs,
  },
  photoThumb: {
    width: 56,
    height: 56,
    borderRadius: appTheme.radius.sm,
    overflow: "hidden",
    backgroundColor: appTheme.colors.surfaceMuted,
  },
  photoThumbImage: { width: "100%", height: "100%" },
  photoPlaceholder: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
  },
  photoRemove: {
    position: "absolute",
    top: 2,
    right: 2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  addPhotoTile: {
    width: 56,
    height: 56,
    borderRadius: appTheme.radius.sm,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: appTheme.colors.border,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    backgroundColor: appTheme.colors.surface,
  },
  addPhotoText: {
    fontFamily: appTheme.fonts.body,
    fontSize: 10,
    color: appTheme.colors.textMuted,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: appTheme.colors.overlay,
    justifyContent: "center",
    paddingHorizontal: appTheme.spacing.md,
  },
  modalScroll: {
    flexGrow: 1,
    justifyContent: "center",
    paddingVertical: appTheme.spacing.lg,
  },
  modalCard: {
    backgroundColor: appTheme.colors.background,
    borderRadius: appTheme.radius.lg,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    padding: appTheme.spacing.md,
    gap: appTheme.spacing.sm,
  },
  modalActions: {
    gap: appTheme.spacing.xs,
    marginTop: appTheme.spacing.xs,
  },
  previewBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    alignItems: "center",
    justifyContent: "center",
    padding: appTheme.spacing.md,
  },
  previewImage: {
    width: "100%",
    height: "80%",
  },
});
