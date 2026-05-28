import React, { useMemo, useState } from "react";
import { Alert, Image, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import NetInfo, { useNetInfo } from "@react-native-community/netinfo";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { getBusinessDay, listBusinessDays } from "../../api/businessDaysApi";
import { getActivePacksForShift, finalizeShift, getShift, listShiftClosingNumbers } from "../../api/shiftsApi";
import { haptics } from "../../utils/haptics";
import { track } from "../../utils/analytics";
import { PrimaryButton } from "../../components/PrimaryButton";
import { ScreenContainer } from "../../components/ScreenContainer";
import { SectionHeader } from "../../components/SectionHeader";
import { KpiGrid, KpiTile } from "../../components/KpiTile";
import { SkeletonList } from "../../components/Skeleton";
import { formatGbp } from "../../utils/currency";
import { MainStackParamList } from "../../types/navigation";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";

type Props = NativeStackScreenProps<MainStackParamList, "ShiftClose">;

type CloseAttachmentState = {
  id: string;
  fileName: string;
  base64: string;
  contentType?: string;
  uri?: string;
  size?: number;
};

const MAX_CLOSE_ATTACHMENTS = 10;
const MAX_CLOSE_ATTACHMENT_BYTES = 10 * 1024 * 1024;

function formatCurrency(value: number) {
  return formatGbp(value);
}

function formatFileSize(size?: number) {
  if (!size || size <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let value = size;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  const fixed = unitIndex === 0 ? value.toFixed(0) : value.toFixed(1);
  return `${fixed} ${units[unitIndex]}`;
}

export function ShiftCloseScreen({ route, navigation }: Props) {
  const { shiftId, shopId } = route.params;
  const netInfo = useNetInfo();
  const queryClient = useQueryClient();
  const [closeAttachments, setCloseAttachments] = useState<CloseAttachmentState[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const shiftQuery = useQuery({
    queryKey: ["shift", shiftId],
    queryFn: () => getShift(shiftId),
  });

  const businessDayQuery = useQuery({
    queryKey: ["business-day", shiftQuery.data?.businessDayId],
    queryFn: () => getBusinessDay(shiftQuery.data?.businessDayId as string),
    enabled: Boolean(shiftQuery.data?.businessDayId),
  });

  const packsQuery = useQuery({
    queryKey: ["shift-active-packs", shiftId],
    queryFn: () => getActivePacksForShift(shiftId),
  });

  const closingsQuery = useQuery({
    queryKey: ["shift-closing-numbers", shiftId],
    queryFn: () => listShiftClosingNumbers(shiftId),
  });

  const closings = useMemo(
    () => [...(closingsQuery.data ?? [])].sort((a, b) => (a.displayNumber ?? Infinity) - (b.displayNumber ?? Infinity)),
    [closingsQuery.data]
  );

  const closedPackIds = useMemo(() => new Set(closings.map((c) => c.packId)), [closings]);

  const pendingPacks = useMemo(
    () => (packsQuery.data ?? []).filter((pack) => !closedPackIds.has(pack.id)),
    [packsQuery.data, closedPackIds]
  );

  const totals = useMemo(() => {
    const activeCount = packsQuery.data?.length ?? 0;
    return {
      active: activeCount,
      entered: closings.length,
      pending: pendingPacks.length,
      sales: closings.reduce((sum, c) => sum + Number(c.salesAmount ?? 0), 0),
    };
  }, [packsQuery.data?.length, closings, pendingPacks.length]);

  const isInitialLoading = packsQuery.isLoading || closingsQuery.isLoading;
  const isOnline = Boolean(netInfo.isConnected);
  // Zero active packs is a valid no-sales close. Otherwise every active pack must have a stored
  // closing number before finalising.
  const canFinalize = !isSubmitting && isOnline && totals.pending === 0;

  function ingestCloseAttachmentAssets(assets: ImagePicker.ImagePickerAsset[]) {
    let oversizedCount = 0;
    const selected = assets
      .filter((asset) => Boolean(asset.base64))
      .flatMap((asset) => {
        if (typeof asset.fileSize === "number" && asset.fileSize > MAX_CLOSE_ATTACHMENT_BYTES) {
          oversizedCount++;
          return [];
        }
        return [{
          id: `${Date.now()}-${Math.random()}`,
          fileName: asset.fileName ?? `shift-close-${Date.now()}.jpg`,
          base64: asset.base64 as string,
          contentType: asset.mimeType ?? "image/jpeg",
          uri: asset.uri,
          size: asset.fileSize,
        }];
      });

    if (oversizedCount > 0) {
      Alert.alert("File too large", `${oversizedCount} attachment(s) exceeded 10 MB and were skipped.`);
    }
    if (selected.length === 0) {
      Alert.alert("Attachment failed", "Unable to read the selected file(s).");
      return;
    }

    setCloseAttachments((previous) => {
      const combined = [...previous, ...selected];
      if (combined.length <= MAX_CLOSE_ATTACHMENTS) return combined;
      Alert.alert("Attachment limit", "A maximum of 10 attachments can be added.");
      return combined.slice(0, MAX_CLOSE_ATTACHMENTS);
    });
  }

  async function selectCloseAttachments() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission required", "Photo access is required to add an attachment from your library.");
      return;
    }
    const remainingSlots = Math.max(0, MAX_CLOSE_ATTACHMENTS - closeAttachments.length);
    if (remainingSlots === 0) {
      Alert.alert("Attachment limit", "A maximum of 10 attachments can be added.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      quality: 0.85,
      allowsEditing: false,
      allowsMultipleSelection: true,
      selectionLimit: remainingSlots,
      base64: true,
    });
    if (result.canceled || result.assets.length === 0) return;
    ingestCloseAttachmentAssets(result.assets);
  }

  async function captureCloseAttachment() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission required", "Camera access is required to take a photo for this close.");
      return;
    }
    if (closeAttachments.length >= MAX_CLOSE_ATTACHMENTS) {
      Alert.alert("Attachment limit", "A maximum of 10 attachments can be added.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: "images",
      quality: 0.85,
      allowsEditing: false,
      base64: true,
    });
    if (result.canceled || result.assets.length === 0) return;
    ingestCloseAttachmentAssets(result.assets);
  }

  async function onFinalize() {
    if (isSubmitting) return;

    if (!isOnline) {
      Alert.alert("You're offline", "Finalising the shift needs a connection so it can read the closing numbers you saved. Reconnect and try again.");
      return;
    }

    if (totals.pending > 0) {
      Alert.alert(
        "Closing numbers missing",
        `${totals.pending} active pack${totals.pending === 1 ? "" : "s"} still need a closing number. Enter them on the Closing Numbers screen first.`
      );
      return;
    }

    if ((packsQuery.data?.length ?? 0) === 0) {
      const proceed = await new Promise<boolean>((resolve) => {
        Alert.alert(
          "Close shift with no sales?",
          "There are no active packs for this shift. Finalising will close it with zero sales recorded. Continue?",
          [
            { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
            { text: "Close shift", style: "destructive", onPress: () => resolve(true) },
          ],
        );
      });
      if (!proceed) return;
    }

    setIsSubmitting(true);
    try {
      // No entries payload — the server folds in the closing numbers from the staging store.
      const payload = {
        attachments: closeAttachments.map((attachment) => ({
          fileName: attachment.fileName,
          base64: attachment.base64,
          contentType: attachment.contentType,
        })),
        entries: [] as unknown[],
      };

      const connection = await NetInfo.fetch();
      if (!connection.isConnected) {
        Alert.alert("You're offline", "Finalising needs a connection. Reconnect and try again.");
        return;
      }

      const closeResult = await finalizeShift(shiftId, payload);
      void Promise.allSettled([
        queryClient.invalidateQueries({ queryKey: ["shift", shiftId] }),
        queryClient.invalidateQueries({ queryKey: ["shift-sales", shiftId] }),
        queryClient.invalidateQueries({ queryKey: ["shift-active-packs", shiftId] }),
        queryClient.invalidateQueries({ queryKey: ["shift-closing-numbers", shiftId] }),
        queryClient.invalidateQueries({ queryKey: ["shifts"] }),
        queryClient.invalidateQueries({ queryKey: ["business-day"] }),
        queryClient.invalidateQueries({ queryKey: ["business-days"] }),
        queryClient.invalidateQueries({ queryKey: ["close-shift-candidates"] }),
        queryClient.invalidateQueries({ queryKey: ["day-shift-sales-totals"] }),
        queryClient.invalidateQueries({ queryKey: ["day-summary-closed-shift-sales"] }),
      ]);

      const relatedShopId = shiftQuery.data?.shopId ?? shopId;
      if (closeResult.moveDayManagementToNextBusinessDate && closeResult.nextBusinessDate && relatedShopId) {
        try {
          const allDays = await listBusinessDays(relatedShopId);
          const nextDay = allDays.find((day) => day.businessDate === closeResult.nextBusinessDate);
          if (nextDay) {
            haptics.success();
            track("shift_closed", { shiftId, shopId, nextBusinessDate: nextDay.businessDate });
            Alert.alert("Shift finalised", `Shift close submitted. Day management moved to ${nextDay.businessDate}.`);
            navigation.replace("DayEndClose", { businessDayId: nextDay.id });
            return;
          }
        } catch {
          // Shift close is already persisted; if the day lookup fails we still keep success flow.
        }
      }

      haptics.success();
      track("shift_closed", { shiftId, shopId });
      Alert.alert("Shift finalised", "Shift close submitted successfully.");
      navigation.goBack();
    } catch (error: any) {
      haptics.error();
      Alert.alert("Failed", error?.response?.data?.message ?? "Shift close failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const finalizeFooter = (
    <View style={[ui.card, styles.fixedFooterCard]}>
      <View style={styles.finalizeFooterContent}>
        <Text style={styles.finalizeProgressText}>
          {totals.active === 0
            ? "No active packs — this will be a zero-sales close."
            : `${totals.entered} of ${totals.active} pack${totals.active === 1 ? "" : "s"} entered`}
        </Text>
        {!isOnline ? (
          <Text style={[styles.meta, styles.finalizeProgressTextError]}>
            You're offline — reconnect to finalise.
          </Text>
        ) : totals.pending > 0 ? (
          <Text style={[styles.meta, styles.finalizeProgressTextError]}>
            {totals.pending} pack{totals.pending === 1 ? "" : "s"} still need a closing number.
          </Text>
        ) : null}
        <PrimaryButton
          label={isSubmitting ? "Finalising..." : "Finalise Shift"}
          icon="checkmark-circle-outline"
          onPress={onFinalize}
          disabled={!canFinalize}
        />
      </View>
    </View>
  );

  return (
    <ScreenContainer footer={finalizeFooter}>
      <View style={styles.content}>
        <View style={[ui.card, styles.card]}>
          <View style={styles.summaryHeaderRow}>
            <Text style={styles.summaryTitle} numberOfLines={1}>{shiftQuery.data?.shiftName ?? "-"}</Text>
            <Text style={styles.summaryDate} numberOfLines={1}>{businessDayQuery.data?.businessDate ?? "-"}</Text>
          </View>
          <KpiGrid columns={3}>
            <KpiTile label="Entered" value={totals.entered} tone={totals.active > 0 && totals.pending === 0 ? "success" : "default"} />
            <KpiTile label="Pending" value={totals.pending} tone={totals.pending > 0 ? "warning" : "default"} />
            <KpiTile label="Sales" value={formatCurrency(totals.sales)} />
          </KpiGrid>
          <Pressable
            style={styles.enterButton}
            onPress={() => navigation.navigate("EnterClosingNumbers", { shiftId, shopId, shiftName: shiftQuery.data?.shiftName })}
            accessibilityRole="button"
            accessibilityLabel="Enter or edit closing numbers"
          >
            <Ionicons name="create-outline" size={16} color={appTheme.colors.primary} />
            <Text style={styles.enterButtonText}>
              {totals.pending > 0 ? "Enter Closing Numbers" : "Edit Closing Numbers"}
            </Text>
          </Pressable>
        </View>

        {isInitialLoading ? (
          <SkeletonList count={4} rowHeight={64} />
        ) : (
          <>
            {pendingPacks.length > 0 ? (
              <View style={[ui.card, styles.card]}>
                <SectionHeader title="Awaiting Closing Number" icon="alert-circle-outline" />
                {pendingPacks.map((pack) => (
                  <View key={pack.id} style={styles.pendingRow}>
                    <Text style={styles.pendingText} numberOfLines={1}>
                      {pack.displayNumber != null ? `#${pack.displayNumber} · ` : ""}{pack.gameName}
                    </Text>
                    <Text style={styles.pendingMeta}>Pack {pack.packNumber}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            <View style={[ui.card, styles.card]}>
              <SectionHeader title="Closing Numbers" icon="list-outline" />
              {closings.length === 0 ? (
                <Text style={styles.meta}>No closing numbers entered yet.</Text>
              ) : (
                closings.map((row) => (
                  <View key={row.packId} style={styles.reviewRow}>
                    <View style={styles.reviewIdentity}>
                      <Text style={styles.reviewTitle} numberOfLines={1}>
                        {row.displayNumber != null ? `#${row.displayNumber} · ` : ""}{row.gameName}
                      </Text>
                      <Text style={styles.reviewMeta} numberOfLines={1}>
                        {row.openingSerialNumber} → {row.closingSerialNumber} · {row.soldQuantity} sold
                      </Text>
                    </View>
                    <Text style={styles.reviewAmount}>{formatCurrency(row.salesAmount)}</Text>
                  </View>
                ))
              )}
            </View>

            <View style={[ui.card, styles.card]}>
              <SectionHeader title="Attachments" subtitle="Optional — up to 10 files" icon="attach-outline" />
              {closeAttachments.length > 0 ? (
                <View style={styles.attachmentList}>
                  {closeAttachments.map((attachment) => {
                    const canPreviewImage = Boolean(attachment.uri) && (attachment.contentType?.startsWith("image/") ?? false);
                    return (
                      <View key={attachment.id} style={styles.attachmentItem}>
                        {canPreviewImage ? (
                          <Image source={{ uri: attachment.uri }} style={styles.attachmentPreviewImage} resizeMode="cover" />
                        ) : (
                          <View style={styles.attachmentFileIcon}>
                            <Text style={styles.attachmentFileIconText}>FILE</Text>
                          </View>
                        )}
                        <View style={styles.attachmentMeta}>
                          <Text style={styles.attachmentFileName} numberOfLines={1}>{attachment.fileName}</Text>
                          <Text style={styles.meta}>
                            {(attachment.contentType ?? "application/octet-stream")}
                            {attachment.size ? ` | ${formatFileSize(attachment.size)}` : ""}
                          </Text>
                        </View>
                        <Pressable
                          style={styles.attachmentRemoveButton}
                          accessibilityRole="button"
                          accessibilityLabel={`Remove attachment ${attachment.fileName}`}
                          onPress={() => setCloseAttachments((previous) => previous.filter((item) => item.id !== attachment.id))}
                          disabled={isSubmitting}
                        >
                          <Text style={styles.attachmentRemoveButtonText}>Remove</Text>
                        </Pressable>
                      </View>
                    );
                  })}
                </View>
              ) : null}
              <View style={styles.attachmentActionRow}>
                <Pressable
                  style={styles.attachmentActionButton}
                  accessibilityRole="button"
                  accessibilityLabel="Take a photo for this close"
                  onPress={() => void captureCloseAttachment()}
                  disabled={isSubmitting}
                >
                  <Ionicons name="camera-outline" size={16} color={appTheme.colors.text} />
                  <Text style={styles.attachmentActionButtonText}>Take Photo</Text>
                </Pressable>
                <Pressable
                  style={styles.attachmentActionButton}
                  accessibilityRole="button"
                  accessibilityLabel="Pick attachments from gallery"
                  onPress={() => void selectCloseAttachments()}
                  disabled={isSubmitting}
                >
                  <Ionicons name="images-outline" size={16} color={appTheme.colors.text} />
                  <Text style={styles.attachmentActionButtonText}>From Gallery</Text>
                </Pressable>
              </View>
            </View>
          </>
        )}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: appTheme.spacing.sm,
    paddingBottom: appTheme.spacing.xl * 2 + appTheme.spacing.sm,
  },
  card: {
    gap: appTheme.spacing.sm,
  },
  fixedFooterCard: {
    paddingVertical: appTheme.spacing.sm,
    marginBottom: Platform.OS === "android" ? appTheme.spacing.sm : 0,
  },
  finalizeFooterContent: {
    gap: 6,
  },
  finalizeProgressText: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 16,
  },
  finalizeProgressTextError: {
    color: appTheme.colors.danger,
  },
  summaryHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: appTheme.spacing.xs,
  },
  summaryTitle: {
    ...appTheme.typography.subtitle,
    color: appTheme.colors.text,
    flex: 1,
  },
  summaryDate: {
    ...appTheme.typography.caption,
    color: appTheme.colors.textMuted,
  },
  enterButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: appTheme.radius.pill,
    backgroundColor: appTheme.colors.surfaceBrandSoft,
    paddingVertical: 10,
  },
  enterButtonText: {
    color: appTheme.colors.primary,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 14,
  },
  meta: {
    ...appTheme.typography.caption,
    color: appTheme.colors.textMuted,
  },
  pendingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: appTheme.spacing.xs,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: appTheme.colors.borderSoft,
  },
  pendingText: {
    flex: 1,
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 17,
  },
  pendingMeta: {
    ...appTheme.typography.caption,
    color: appTheme.colors.textMuted,
  },
  reviewRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: appTheme.spacing.xs,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: appTheme.colors.borderSoft,
  },
  reviewIdentity: {
    flex: 1,
    gap: 2,
  },
  reviewTitle: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 17,
  },
  reviewMeta: {
    ...appTheme.typography.caption,
    color: appTheme.colors.textMuted,
  },
  reviewAmount: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 18,
  },
  attachmentList: {
    gap: appTheme.spacing.xs,
  },
  attachmentItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: appTheme.spacing.sm,
    backgroundColor: appTheme.colors.surfaceTint,
    borderRadius: appTheme.radius.sm,
    padding: appTheme.spacing.xs,
  },
  attachmentPreviewImage: {
    width: 44,
    height: 44,
    borderRadius: appTheme.radius.sm,
  },
  attachmentFileIcon: {
    width: 44,
    height: 44,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  attachmentFileIconText: {
    color: appTheme.colors.textSubtle,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 11,
  },
  attachmentMeta: {
    flex: 1,
    gap: 2,
  },
  attachmentFileName: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 17,
  },
  attachmentRemoveButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceDangerSoft,
  },
  attachmentRemoveButtonText: {
    color: appTheme.colors.danger,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
  },
  attachmentActionRow: {
    flexDirection: "row",
    gap: appTheme.spacing.xs,
  },
  attachmentActionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
  },
  attachmentActionButtonText: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 13,
  },
});
