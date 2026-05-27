import React, { useMemo, useState } from "react";
import { Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { addCanisterDrop, getBusinessDay, listCanisterDrops } from "../../api/businessDaysApi";
import { getConfigurations } from "../../api/configurationsApi";
import { getShopSubscriptionSummary } from "../../api/subscriptionApi";
import { useAuth } from "../../auth/AuthContext";
import { getShift, getShiftCloseAttachmentContent, getShiftSales } from "../../api/shiftsApi";
import { FloatingLabelInput } from "../../components/FloatingLabelInput";
import { ScreenContainer } from "../../components/ScreenContainer";
import { SectionHeader } from "../../components/SectionHeader";
import { KpiGrid, KpiTile } from "../../components/KpiTile";
import { StatusBadge } from "../../components/StatusBadge";
import { ShiftStatus } from "../../types/enums";
import { MainStackParamList } from "../../types/navigation";
import { formatGbp } from "../../utils/currency";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";

type Props = NativeStackScreenProps<MainStackParamList, "ShiftDetails">;
const SAFE_DROP_FEATURE_KEY = "SafeDropManagement";
const SAFE_DROP_CONFIG_KEY = "EnableSafeDropManagement";

function getShiftTone(status?: ShiftStatus): "neutral" | "warning" | "danger" | "success" {
  if (!status) return "neutral";
  if (status === ShiftStatus.Open) return "success";
  if (status === ShiftStatus.Scheduled) return "warning";
  if (status === ShiftStatus.Reopened) return "warning";
  if (status === ShiftStatus.Closed || status === ShiftStatus.Approved) return "neutral";
  return "neutral";
}

function getBusinessDayTone(status?: string): "neutral" | "warning" | "danger" | "success" {
  if (!status) return "neutral";
  if (status === "Closed") return "success";
  if (status === "ReadyToClose") return "warning";
  if (status === "Reopened") return "danger";
  return "neutral";
}

function formatDuration(startTime?: string, endTime?: string) {
  if (!startTime) return "-";
  const start = new Date(startTime);
  const end = endTime ? new Date(endTime) : new Date();
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return "-";
  }

  const elapsedMinutes = Math.max(0, Math.floor((end.getTime() - start.getTime()) / 60000));
  const hours = Math.floor(elapsedMinutes / 60);
  const minutes = elapsedMinutes % 60;
  if (hours === 0) {
    return `${minutes}m`;
  }
  return `${hours}h ${minutes}m`;
}

function formatCurrency(value: number) {
  return formatGbp(value);
}

function parseConfigurationBool(rawValue: string, fallback = false) {
  const normalized = rawValue.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes") {
    return true;
  }
  if (normalized === "false" || normalized === "0" || normalized === "no") {
    return false;
  }
  return fallback;
}

function formatFileSize(size?: number) {
  if (!size || size <= 0) {
    return "";
  }

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

function isImageContentType(contentType?: string) {
  return (contentType ?? "").toLowerCase().startsWith("image/");
}

function getContentTypeFromDataUrl(dataUrl: string) {
  const prefix = "data:";
  const suffix = ";base64,";
  if (!dataUrl.startsWith(prefix)) {
    return "application/octet-stream";
  }

  const endIndex = dataUrl.indexOf(suffix);
  if (endIndex <= prefix.length) {
    return "application/octet-stream";
  }

  return dataUrl.slice(prefix.length, endIndex).trim() || "application/octet-stream";
}

function getBase64Payload(dataUrl: string) {
  const marker = "base64,";
  const markerIndex = dataUrl.indexOf(marker);
  return markerIndex >= 0 ? dataUrl.slice(markerIndex + marker.length).trim() : dataUrl.trim();
}

function getFileExtensionFromContentType(contentType: string) {
  switch (contentType.toLowerCase()) {
    case "image/jpeg":
      return ".jpg";
    case "image/png":
      return ".png";
    case "image/webp":
      return ".webp";
    case "image/gif":
      return ".gif";
    case "application/pdf":
      return ".pdf";
    case "text/plain":
      return ".txt";
    default:
      return "";
  }
}

function ensureFileNameWithExtension(fileName: string, contentType: string) {
  const trimmed = fileName.trim();
  if (trimmed.length === 0) {
    const extension = getFileExtensionFromContentType(contentType);
    return `attachment${extension || ".bin"}`;
  }

  const hasExtension = /\.[A-Za-z0-9]{1,10}$/.test(trimmed);
  if (hasExtension) {
    return trimmed;
  }

  const extension = getFileExtensionFromContentType(contentType);
  return `${trimmed}${extension || ""}`;
}

export function ShiftDetailsScreen({ route, navigation }: Props) {
  const { shiftId, shopId: routeShopId } = route.params;
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const [isAttachmentPreviewModalVisible, setIsAttachmentPreviewModalVisible] = useState(false);
  const [attachmentPreviewId, setAttachmentPreviewId] = useState<string | null>(null);
  const [attachmentPreviewTitle, setAttachmentPreviewTitle] = useState("");
  const [attachmentPreviewUri, setAttachmentPreviewUri] = useState<string>();
  const [loadingAttachmentId, setLoadingAttachmentId] = useState<string | null>(null);
  const [downloadingAttachmentId, setDownloadingAttachmentId] = useState<string | null>(null);
  const [safeDropCanisterNumber, setSafeDropCanisterNumber] = useState("");
  const [safeDropAmount, setSafeDropAmount] = useState("");
  const [safeDropByName, setSafeDropByName] = useState("");
  // Inline validation for the amount field — surfaces under the input as the user types so
  // they don't have to submit just to discover an invalid amount.
  const safeDropAmountError = useMemo(() => {
    const raw = safeDropAmount.trim();
    if (raw.length === 0) return null;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return "Enter a valid number.";
    if (parsed <= 0) return "Amount must be greater than zero.";
    return null;
  }, [safeDropAmount]);

  const shiftQuery = useQuery({
    queryKey: ["shift", shiftId],
    queryFn: () => getShift(shiftId),
  });
  const shift = shiftQuery.data;
  const shiftShopId = shift?.shopId ?? routeShopId;

  const businessDayQuery = useQuery({
    queryKey: ["business-day", shiftQuery.data?.businessDayId],
    queryFn: () => getBusinessDay(shiftQuery.data?.businessDayId as string),
    enabled: Boolean(shiftQuery.data?.businessDayId),
  });

  const configurationQuery = useQuery({
    queryKey: ["configurations", shiftShopId],
    queryFn: () => getConfigurations(shiftShopId),
    enabled: Boolean(shiftShopId),
  });

  const subscriptionSummaryQuery = useQuery({
    queryKey: ["shop-subscription-summary", shiftShopId],
    queryFn: () => getShopSubscriptionSummary(shiftShopId as string),
    enabled: Boolean(shiftShopId),
    staleTime: 5 * 60 * 1000,
  });

  const salesQuery = useQuery({
    queryKey: ["shift-sales", shiftId],
    queryFn: () => getShiftSales(shiftId),
  });

  const previewAttachmentMutation = useMutation({
    mutationFn: async ({ attachmentId, fileName }: { attachmentId: string; fileName: string }) => {
      const dataUrl = await getShiftCloseAttachmentContent(attachmentId);
      if (!dataUrl) {
        throw new Error("Attachment file is not available.");
      }

      return { attachmentId, dataUrl, fileName };
    },
    onSuccess: ({ attachmentId, dataUrl, fileName }) => {
      setAttachmentPreviewId(attachmentId);
      setAttachmentPreviewTitle(fileName);
      setAttachmentPreviewUri(dataUrl);
      setIsAttachmentPreviewModalVisible(true);
    },
    onError: (error: any) => {
      Alert.alert("Preview unavailable", error?.response?.data?.message ?? error?.message ?? "Unable to load attachment.");
    },
  });

  const downloadAttachmentMutation = useMutation({
    mutationFn: async ({ attachmentId, fileName }: { attachmentId: string; fileName: string }) => {
      const dataUrl = await getShiftCloseAttachmentContent(attachmentId);
      if (!dataUrl) {
        throw new Error("Attachment file is not available.");
      }

      const contentType = getContentTypeFromDataUrl(dataUrl);
      const base64Payload = getBase64Payload(dataUrl);
      const safeFileName = ensureFileNameWithExtension(fileName, contentType);
      const targetDirectory = FileSystem.documentDirectory ?? FileSystem.cacheDirectory;
      if (!targetDirectory) {
        throw new Error("Storage directory is unavailable on this device.");
      }

      const targetUri = `${targetDirectory}${Date.now()}-${safeFileName}`;
      await FileSystem.writeAsStringAsync(targetUri, base64Payload, { encoding: FileSystem.EncodingType.Base64 });
      return { fileUri: targetUri, fileName: safeFileName, contentType };
    },
    onSuccess: async ({ fileUri, fileName, contentType }) => {
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert("Downloaded", `File saved to:\n${fileUri}`);
        return;
      }

      await Sharing.shareAsync(fileUri, {
        mimeType: contentType,
        dialogTitle: `Download ${fileName}`,
      });
    },
    onError: (error: any) => {
      Alert.alert("Download failed", error?.response?.data?.message ?? error?.message ?? "Unable to download attachment.");
    },
  });

  const entries = salesQuery.data ?? [];
  const totals = useMemo(() => {
    return entries.reduce(
      (acc, entry) => {
        acc.totalSoldQuantity += Number(entry.soldQuantity ?? 0);
        acc.totalSalesAmount += Number(entry.salesAmount ?? 0);
        acc.totalRemainingTickets += Number(entry.remainingTickets ?? 0);
        if (entry.isFlaggedForReview) {
          acc.flaggedCount += 1;
        }
        return acc;
      },
      { totalSoldQuantity: 0, totalSalesAmount: 0, totalRemainingTickets: 0, flaggedCount: 0 },
    );
  }, [entries]);

  const safeDropDefaultByName = useMemo(() => {
    const displayName = profile?.displayName?.trim();
    if (displayName) return displayName;
    const firstName = profile?.firstName?.trim() ?? "";
    const lastName = profile?.lastName?.trim() ?? "";
    const fullName = `${firstName} ${lastName}`.trim();
    if (fullName) return fullName;
    return profile?.email?.trim() ?? "";
  }, [profile?.displayName, profile?.email, profile?.firstName, profile?.lastName]);

  const subscriptionIncludedFeatures = subscriptionSummaryQuery.data?.includedFeatures ?? [];
  const hasSafeDropSubscriptionFeature = subscriptionIncludedFeatures.some(
    (feature) => feature.toLowerCase() === SAFE_DROP_FEATURE_KEY.toLowerCase(),
  );
  const safeDropConfigValue = configurationQuery.data?.find(
    (item) => item.configKey.toLowerCase() === SAFE_DROP_CONFIG_KEY.toLowerCase(),
  )?.configValue ?? "false";
  const safeDropConfigEnabled = parseConfigurationBool(safeDropConfigValue, false);
  const isSafeDropManagementVisible = hasSafeDropSubscriptionFeature && safeDropConfigEnabled;
  const safeDropVisibilityMessage = !hasSafeDropSubscriptionFeature
    ? "Safe Drop is not included in the current subscription package for this shop."
    : !safeDropConfigEnabled
      ? "Safe Drop is disabled in App Configuration for this shop."
      : null;

  const canisterDropsQuery = useQuery({
    queryKey: ["safe-drops", shift?.businessDayId],
    queryFn: () => listCanisterDrops(shift?.businessDayId as string),
    enabled: isSafeDropManagementVisible && Boolean(shift?.businessDayId),
  });

  const safeDropsForShift = useMemo(
    () => (canisterDropsQuery.data ?? []).filter((drop) => drop.shiftId === shiftId),
    [canisterDropsQuery.data, shiftId],
  );

  const addCanisterDropMutation = useMutation({
    mutationFn: async () => {
      if (!shift?.businessDayId) {
        throw new Error("Business day context is missing.");
      }

      const canisterNumber = safeDropCanisterNumber.trim();
      if (!canisterNumber) {
        throw new Error("Canister number is required.");
      }

      const parsedAmount = Number(safeDropAmount.trim());
      if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        throw new Error("Amount must be a valid number greater than zero.");
      }

      return addCanisterDrop(shift.businessDayId, {
        canisterNumber,
        amount: parsedAmount,
        droppedByName: safeDropByName.trim() || safeDropDefaultByName || undefined,
      });
    },
    onSuccess: async () => {
      setSafeDropCanisterNumber("");
      setSafeDropAmount("");
      Alert.alert("Saved", "Safe drop recorded successfully.");
      await queryClient.invalidateQueries({ queryKey: ["safe-drops", shift?.businessDayId] });
      await queryClient.invalidateQueries({ queryKey: ["safe-drop-canisters", shift?.businessDayId] });
    },
    onError: (error: any) => {
      const message = error?.response?.data?.message ?? error?.message ?? "Unable to record safe drop.";
      Alert.alert("Failed", message);
    },
  });

  const closeAttachments = shift?.closeAttachments ?? [];
  const businessDay = businessDayQuery.data;
  const canCloseShift = shift?.status === ShiftStatus.Open || shift?.status === ShiftStatus.Reopened;
  const canRecordSafeDrop = isSafeDropManagementVisible && canCloseShift;
  const closeShiftShopId = shift?.shopId ?? routeShopId;

  const previewAttachment = (attachmentId: string, fileName: string) => {
    setLoadingAttachmentId(attachmentId);
    previewAttachmentMutation.mutate(
      { attachmentId, fileName },
      {
        onSettled: () => {
          setLoadingAttachmentId(null);
        },
      },
    );
  };

  const downloadAttachment = (attachmentId: string, fileName: string) => {
    setDownloadingAttachmentId(attachmentId);
    downloadAttachmentMutation.mutate(
      { attachmentId, fileName },
      {
        onSettled: () => {
          setDownloadingAttachmentId(null);
        },
      },
    );
  };

  // Close Shift footer dock — keeps the primary action reachable on long entry lists.
  const shiftActionsFooter = canCloseShift ? (
    <View style={[ui.card, styles.footerDock]}>
      <Pressable
        style={[styles.actionButton, !closeShiftShopId ? styles.actionButtonDisabled : null]}
        onPress={() => navigation.navigate("ShiftClose", { shiftId, shopId: closeShiftShopId })}
        disabled={!closeShiftShopId}
      >
        <Text style={styles.actionButtonText}>Close Shift</Text>
      </Pressable>
    </View>
  ) : null;

  return (
    <ScreenContainer footer={shiftActionsFooter}>
      <ScrollView contentContainerStyle={styles.pageContent}>
        <View style={[ui.card, styles.summaryCard]}>
          <View style={styles.headerRow}>
            <View style={styles.headingBlock}>
              {/* <Text style={styles.headerEyebrow}>Shift Details</Text> */}
              <Text style={styles.shiftName}>{shift?.shiftName ?? "Shift"}</Text>
            </View>
            <StatusBadge label={shift?.status ?? "-"} tone={getShiftTone(shift?.status)} />
          </View>
          {/* <View style={styles.badgeRow}>
            <Text style={styles.businessDate}>{businessDay?.businessDate ?? "-"}</Text>
            {businessDay?.status ? (
              <StatusBadge label={`Day ${businessDay.status}`} tone={getBusinessDayTone(businessDay.status)} />
            ) : null}
          </View> */}
          <View style={styles.infoGrid}>
            <View style={styles.infoTile}>
              <Text style={styles.infoLabel}>Start</Text>
              <Text style={styles.infoValue}>{shift?.startTime ? new Date(shift.startTime).toLocaleString() : "-"}</Text>
            </View>
            <View style={styles.infoTile}>
              <Text style={styles.infoLabel}>End</Text>
              <Text style={styles.infoValue}>{shift?.endTime ? new Date(shift.endTime).toLocaleString() : "Open"}</Text>
            </View>
            {/* <View style={styles.infoTile}>
              <Text style={styles.infoLabel}>Duration</Text>
              <Text style={styles.infoValue}>{formatDuration(shift?.startTime, shift?.endTime)}</Text>
            </View>
            <View style={styles.infoTile}>
              <Text style={styles.infoLabel}>Sync</Text>
              <Text style={styles.infoValue}>{shift?.syncStatus ?? "-"}</Text>
            </View> */}
          </View>
        </View>

        <View style={[ui.card, styles.summaryCard]}>
          <SectionHeader
            title="Scratch Card Summary"
            icon="stats-chart-outline"
            right={
              totals.flaggedCount > 0 ? (
                <StatusBadge label={`${totals.flaggedCount} flagged`} tone="warning" />
              ) : undefined
            }
          />
          <KpiGrid columns={2}>
            {/* <KpiTile label="Entries" value={entries.length} /> */}
            <KpiTile label="Sold Qty" value={totals.totalSoldQuantity} />
            <KpiTile label="Sales" value={formatCurrency(totals.totalSalesAmount)} />
            {/* <KpiTile label="Remaining" value={totals.totalRemainingTickets} /> */}
          </KpiGrid>
          {salesQuery.isFetching ? <Text style={styles.meta}>Loading...</Text> : null}
        </View>

           <View style={[ui.card, styles.summaryCard]}>
          <Text style={styles.sectionTitle}>Scratch CardSales</Text>
          {!salesQuery.isFetching && entries.length === 0 ? (
            <Text style={styles.meta}>No entries for this shift.</Text>
          ) : null}
          {entries.map((entry) => (
            <View key={entry.id} style={[styles.entryCard, entry.isFlaggedForReview ? styles.entryCardFlagged : null]}>
              <View style={styles.entryHeader}>
                <Text style={styles.entryTitle}>Pack {entry.packNumber}</Text>
                <StatusBadge label={entry.entryMethod} tone={entry.isFlaggedForReview ? "warning" : "neutral"} />
              </View>
              <View style={styles.entryStatsGrid}>
                <View style={styles.entryPairRow}>
                  <View style={styles.entryStatTile}>
                    <Text style={styles.entryPairLabel}>Opening</Text>
                    <Text style={styles.entryPairValue}>{entry.openingSerialNumber}</Text>
                  </View>
                  <View style={styles.entryStatTile}>
                    <Text style={styles.entryPairLabel}>Closing</Text>
                    <Text style={styles.entryPairValue}>{entry.closingSerialNumber}</Text>
                  </View>
                </View>
                <View style={styles.entryPairRow}>
                  <View style={styles.entryStatTile}>
                    <Text style={styles.entryPairLabel}>Sold Qty</Text>
                    <Text style={styles.entryPairValue}>{entry.soldQuantity}</Text>
                  </View>
                  <View style={styles.entryStatTile}>
                    <Text style={styles.entryPairLabel}>Sales</Text>
                    <Text style={styles.entryPairValue}>{formatCurrency(Number(entry.salesAmount))}</Text>
                  </View>
                </View>
                <View style={styles.entryPairRow}>
                  <View style={styles.entryStatTile}>
                    <Text style={styles.entryPairLabel}>Ticket Price</Text>
                    <Text style={styles.entryPairValue}>{formatCurrency(Number(entry.ticketPrice))}</Text>
                  </View>
                  <View style={styles.entryStatTile}>
                    <Text style={styles.entryPairLabel}>Remaining</Text>
                    <Text style={styles.entryPairValue}>{entry.remainingTickets}</Text>
                  </View>
                </View>
              </View>
              {entry.originalScannedSerialNumber ? (
                <Text style={styles.meta}>Scanned: {entry.originalScannedSerialNumber}</Text>
              ) : null}
            </View>
          ))}
        </View>


        {isSafeDropManagementVisible ? (
          <View style={[ui.card, styles.summaryCard]}>
            <SectionHeader
              title="Safe Drop"
              icon="lock-closed-outline"
              right={
                <StatusBadge
                  label={`${safeDropsForShift.length}`}
                  tone={safeDropsForShift.length > 0 ? "success" : "neutral"}
                />
              }
            />
            {/* <Text style={styles.meta}>
              {canCloseShift
                ? "Record safe drops during this active shift."
                : "Safe drops can be added only while this shift is open or reopened."}
            </Text> */}
            <FloatingLabelInput
              label="Canister number"
              value={safeDropCanisterNumber}
              onChangeText={setSafeDropCanisterNumber}
              editable={canRecordSafeDrop && !addCanisterDropMutation.isPending}
            />
            <FloatingLabelInput
              label="Amount"
              prefix="£"
              value={safeDropAmount}
              onChangeText={setSafeDropAmount}
              keyboardType="decimal-pad"
              editable={canRecordSafeDrop && !addCanisterDropMutation.isPending}
              error={safeDropAmountError}
            />
            <FloatingLabelInput
              label={safeDropDefaultByName ? `Dropped by (default: ${safeDropDefaultByName})` : "Dropped by"}
              value={safeDropByName}
              onChangeText={setSafeDropByName}
              editable={canRecordSafeDrop && !addCanisterDropMutation.isPending}
            />
            <Pressable
              style={[styles.actionButton, (!canRecordSafeDrop || addCanisterDropMutation.isPending) ? styles.actionButtonDisabled : null]}
              onPress={() => addCanisterDropMutation.mutate()}
              disabled={!canRecordSafeDrop || addCanisterDropMutation.isPending}
            >
              <Text style={styles.actionButtonText}>{addCanisterDropMutation.isPending ? "Saving..." : "Add Safe Drop"}</Text>
            </Pressable>

            {canisterDropsQuery.isFetching ? (
              <Text style={styles.meta}>Loading safe drops...</Text>
            ) : safeDropsForShift.length > 0 ? (
              <View style={styles.safeDropCompactList}>
                {safeDropsForShift.map((drop) => {
                  const isPending = drop.approvalStatus === "Pending";
                  const isRejected = drop.approvalStatus === "Rejected";
                  const droppedTime = new Date(drop.droppedOn);
                  const droppedTimeLabel = Number.isNaN(droppedTime.getTime())
                    ? "—"
                    : droppedTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                  const accentColor = isPending
                    ? appTheme.colors.warning
                    : isRejected
                      ? appTheme.colors.danger
                      : appTheme.colors.success;
                  return (
                    <View key={drop.id} style={styles.safeDropCompactRow}>
                      <View style={[styles.safeDropCompactAccent, { backgroundColor: accentColor }]} />
                      <View style={styles.safeDropCompactBody}>
                        <View style={styles.safeDropCompactLine}>
                          <Text style={styles.safeDropCompactPrimary} numberOfLines={1}>
                            {droppedTimeLabel} · #{drop.canisterNumber}
                          </Text>
                          <Text style={styles.safeDropCompactAmount}>{formatCurrency(drop.amount)}</Text>
                        </View>
                        <View style={styles.safeDropCompactMetaRow}>
                          <Text style={styles.safeDropCompactMetaText} numberOfLines={1}>
                            {drop.droppedByName}
                          </Text>
                          <StatusBadge
                            label={drop.approvalStatus}
                            tone={isPending ? "warning" : isRejected ? "danger" : "success"}
                          />
                        </View>
                        {isRejected && drop.approvalNotes ? (
                          <Text style={styles.safeDropCompactReason} numberOfLines={2}>
                            Rejected: {drop.approvalNotes}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : (
              <Text style={styles.meta}>No safe drops recorded for this shift.</Text>
            )}
          </View>
        ) : (
          <View style={[ui.card, styles.summaryCard]}>
            <Text style={styles.sectionTitle}>Safe Drop</Text>
            <Text style={styles.meta}>{safeDropVisibilityMessage ?? "Safe Drop is currently unavailable."}</Text>
          </View>
        )}

     
           <View style={[ui.card, styles.summaryCard]}>
          <Text style={styles.sectionTitle}>Attachments</Text>
          {closeAttachments.length === 0 ? (
            <Text style={styles.meta}>No attachments saved for this shift.</Text>
          ) : (
            <View style={styles.attachmentList}>
              {closeAttachments.map((attachment) => {
                const canPreviewImage = isImageContentType(attachment.contentType);
                const isLoadingPreview = loadingAttachmentId === attachment.id;
                const isDownloading = downloadingAttachmentId === attachment.id;
                return (
                  <View key={attachment.id} style={styles.attachmentItem}>
                    {canPreviewImage ? (
                      <View style={styles.attachmentImageBadge}>
                        <Text style={styles.attachmentImageBadgeText}>IMG</Text>
                      </View>
                    ) : (
                      <View style={styles.attachmentFileIcon}>
                        <Text style={styles.attachmentFileIconText}>FILE</Text>
                      </View>
                    )}
                    <View style={styles.attachmentMeta}>
                      <Text style={styles.attachmentFileName} numberOfLines={1}>
                        {attachment.fileName}
                      </Text>
                      <Text style={styles.meta}>
                        {(attachment.contentType ?? "application/octet-stream")}
                        {attachment.fileSizeBytes ? ` | ${formatFileSize(attachment.fileSizeBytes)}` : ""}
                      </Text>
                      <Text style={styles.meta}>Uploaded {new Date(attachment.uploadedOn).toLocaleString()}</Text>
                    </View>
                    <View style={styles.attachmentActionStack}>
                      <Pressable
                        style={styles.attachmentDownloadButton}
                        accessibilityRole="button"
                        accessibilityLabel={`Download attachment ${attachment.fileName}`}
                        onPress={() => downloadAttachment(attachment.id, attachment.fileName)}
                        disabled={isDownloading}
                      >
                        <Text style={styles.attachmentDownloadButtonText}>{isDownloading ? "Saving..." : "Download"}</Text>
                      </Pressable>
                      {canPreviewImage ? (
                        <Pressable
                          style={styles.attachmentViewButton}
                          accessibilityRole="button"
                          accessibilityLabel={`Preview attachment ${attachment.fileName}`}
                          onPress={() => previewAttachment(attachment.id, attachment.fileName)}
                          disabled={isLoadingPreview}
                        >
                          <Text style={styles.attachmentViewButtonText}>{isLoadingPreview ? "Loading..." : "Preview"}</Text>
                        </Pressable>
                      ) : (
                        <View style={styles.attachmentNoPreviewBadge}>
                          <Text style={styles.attachmentNoPreviewBadgeText}>No Preview</Text>
                        </View>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        <Modal
          visible={isAttachmentPreviewModalVisible}
          transparent={false}
          animationType="fade"
          onRequestClose={() => {
            setIsAttachmentPreviewModalVisible(false);
            setAttachmentPreviewId(null);
            setAttachmentPreviewTitle("");
            setAttachmentPreviewUri(undefined);
          }}
        >
          <View style={styles.attachmentPreviewBackdrop}>
            <View style={styles.attachmentPreviewHeader}>
              <Text style={styles.attachmentPreviewTitle} numberOfLines={1}>{attachmentPreviewTitle || "Attachment Preview"}</Text>
              <View style={styles.attachmentPreviewHeaderActions}>
                <Pressable
                  style={styles.attachmentPreviewHeaderButton}
                  onPress={() => {
                    if (!attachmentPreviewId || !attachmentPreviewTitle) {
                      return;
                    }
                    downloadAttachment(attachmentPreviewId, attachmentPreviewTitle);
                  }}
                  disabled={!attachmentPreviewId || !attachmentPreviewTitle || downloadingAttachmentId === attachmentPreviewId}
                >
                  <Text style={styles.attachmentPreviewHeaderButtonText}>
                    {downloadingAttachmentId === attachmentPreviewId ? "Saving..." : "Download"}
                  </Text>
                </Pressable>
                <Pressable
                  style={styles.attachmentPreviewHeaderButton}
                  onPress={() => {
                    setIsAttachmentPreviewModalVisible(false);
                    setAttachmentPreviewId(null);
                    setAttachmentPreviewTitle("");
                    setAttachmentPreviewUri(undefined);
                  }}
                >
                  <Text style={styles.attachmentPreviewHeaderButtonText}>Close</Text>
                </Pressable>
              </View>
            </View>
            {attachmentPreviewUri ? (
              <Image source={{ uri: attachmentPreviewUri }} style={styles.attachmentPreviewModalImage} resizeMode="contain" />
            ) : (
              <View style={styles.attachmentPreviewEmptyState}>
                <Text style={styles.attachmentPreviewEmptyText}>No preview available.</Text>
              </View>
            )}
          </View>
        </Modal>

       
      </ScrollView>
    </ScreenContainer>
  );
}
const styles = StyleSheet.create({
  pageContent: {
    gap: appTheme.spacing.sm,
    paddingBottom: appTheme.spacing.sm,
  },
  summaryCard: {
    gap: appTheme.spacing.sm,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: appTheme.spacing.sm,
  },
  headingBlock: {
    flex: 1,
    gap: 2,
  },
  headerEyebrow: {
    color: appTheme.colors.textSubtle,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 15,
    letterSpacing: 0.2,
    textTransform: "uppercase",
  },
  shiftName: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.heading,
    fontSize: 22,
    lineHeight: 27,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: appTheme.spacing.xs,
  },
  businessDate: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 18,
  },
  infoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: appTheme.spacing.xs,
  },
  infoTile: {
    width: "48.8%",
    borderWidth: 0,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceTint,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: appTheme.spacing.xs,
    gap: 2,
  },
  infoLabel: {
    color: appTheme.colors.textSubtle,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 11,
    lineHeight: 14,
    textTransform: "uppercase",
  },
  infoValue: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.body,
    fontSize: 12,
    lineHeight: 16,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: appTheme.spacing.sm,
  },
  sectionTitle: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 18,
    lineHeight: 23,
  },
  meta: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.body,
    fontSize: 13,
    lineHeight: 18,
  },
  fieldLabel: {
    color: appTheme.colors.text,
    fontSize: 13,
    lineHeight: 16,
    fontFamily: appTheme.fonts.bodyMedium,
    marginTop: 2,
  },
  input: {
    borderWidth: 0,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    color: appTheme.colors.text,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: appTheme.spacing.sm,
    fontFamily: appTheme.fonts.body,
    fontSize: 14,
  },
  safeDropCompactList: {
    gap: 6,
  },
  safeDropCompactRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: appTheme.colors.borderSoft,
  },
  safeDropCompactAccent: {
    width: 3,
    alignSelf: "stretch",
    borderRadius: 2,
  },
  safeDropCompactBody: {
    flex: 1,
    gap: 2,
  },
  safeDropCompactLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  safeDropCompactPrimary: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 16,
    flex: 1,
  },
  safeDropCompactAmount: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 17,
  },
  safeDropCompactMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  safeDropCompactMetaText: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.body,
    fontSize: 12,
    lineHeight: 16,
    flex: 1,
  },
  safeDropCompactReason: {
    color: appTheme.colors.danger,
    fontFamily: appTheme.fonts.body,
    fontSize: 11,
    lineHeight: 14,
  },
  kpiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: appTheme.spacing.xs,
  },
  kpiTile: {
    width: "48.8%",
    borderWidth: 0,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceTintAlt,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: appTheme.spacing.sm,
    gap: 3,
  },
  kpiLabel: {
    color: appTheme.colors.textSubtle,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 11,
    lineHeight: 14,
    textTransform: "uppercase",
  },
  kpiValue: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.heading,
    fontSize: 16,
    lineHeight: 20,
  },
  attachmentList: {
    gap: appTheme.spacing.xs,
  },
  attachmentItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: appTheme.spacing.xs,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    paddingHorizontal: appTheme.spacing.xs,
    paddingVertical: appTheme.spacing.xs,
  },
  attachmentFileIcon: {
    width: 44,
    height: 44,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceTintAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  attachmentFileIconText: {
    color: appTheme.colors.textSubtle,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 10,
    lineHeight: 12,
  },
  attachmentImageBadge: {
    width: 44,
    height: 44,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceSuccessMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  attachmentImageBadgeText: {
    color: appTheme.colors.primary,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 10,
    lineHeight: 12,
  },
  attachmentMeta: {
    flex: 1,
    gap: 2,
  },
  attachmentFileName: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 16,
  },
  attachmentActionStack: {
    gap: 6,
    alignItems: "flex-end",
  },
  attachmentDownloadButton: {
    borderWidth: 1,
    borderColor: appTheme.colors.borderStrong,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  attachmentDownloadButtonText: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 11,
    lineHeight: 13,
  },
  attachmentViewButton: {
    borderWidth: 1,
    borderColor: appTheme.colors.primary,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceSuccessAlt,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  attachmentViewButtonText: {
    color: appTheme.colors.primary,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 11,
    lineHeight: 13,
  },
  attachmentNoPreviewBadge: {
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surface,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  attachmentNoPreviewBadgeText: {
    color: appTheme.colors.textSubtle,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 10,
    lineHeight: 12,
  },
  attachmentPreviewBackdrop: {
    flex: 1,
    backgroundColor: appTheme.colors.previewBackdrop,
  },
  attachmentPreviewHeader: {
    paddingTop: 18,
    paddingHorizontal: 12,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  attachmentPreviewTitle: {
    flex: 1,
    color: appTheme.colors.previewText,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 18,
  },
  attachmentPreviewHeaderActions: {
    flexDirection: "row",
    gap: 8,
  },
  attachmentPreviewHeaderButton: {
    borderWidth: 1,
    borderColor: appTheme.colors.previewBorder,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.previewSurface,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  attachmentPreviewHeaderButtonText: {
    color: appTheme.colors.previewText,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 14,
  },
  attachmentPreviewEmptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  attachmentPreviewEmptyText: {
    color: appTheme.colors.previewTextMuted,
    fontFamily: appTheme.fonts.body,
    fontSize: 14,
    lineHeight: 18,
    textAlign: "center",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: appTheme.colors.overlay,
    justifyContent: "center",
    paddingHorizontal: appTheme.spacing.md,
  },
  modalCard: {
    backgroundColor: appTheme.colors.background,
    borderRadius: appTheme.radius.lg,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    padding: appTheme.spacing.md,
    gap: appTheme.spacing.sm,
  },
  attachmentPreviewModalCard: {
    maxHeight: "90%",
  },
  attachmentPreviewModalImage: {
    flex: 1,
    width: "100%",
    backgroundColor: appTheme.colors.previewBackdrop,
  },
  actionRow: {
    flexDirection: "row",
    justifyContent: "center",
  },
  attachmentPreviewCloseButton: {
    flex: 1,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    borderColor: appTheme.colors.borderStrong,
    backgroundColor: appTheme.colors.surfaceMuted,
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  attachmentPreviewCloseButtonText: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 18,
  },
  actionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: appTheme.spacing.sm,
  },
  footerDock: {
    paddingVertical: appTheme.spacing.sm,
  },
  actionButton: {
    borderWidth: 0,
    borderRadius: appTheme.radius.md,
    backgroundColor: appTheme.colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: "center",
  },
  actionButtonDisabled: {
    opacity: 0.55,
  },
  actionButtonText: {
    color: appTheme.colors.onPrimary,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 18,
  },
  iconButton: {
    width: 38,
    height: 38,
    borderWidth: 0,
    borderRadius: appTheme.radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: appTheme.colors.surfaceInfoSoft,
  },
  iconButtonDisabled: {
    opacity: 0.55,
  },
  iconGlyph: {
    color: appTheme.colors.primary,
    fontSize: 18,
    lineHeight: 18,
    fontFamily: appTheme.fonts.bodyMedium,
  },
  entryCard: {
    borderWidth: 0,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceNeutralMuted,
    padding: appTheme.spacing.sm,
    gap: appTheme.spacing.xs,
  },
  entryCardFlagged: {
    backgroundColor: appTheme.colors.surfaceWarningSoft,
  },
  entryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: appTheme.spacing.sm,
  },
  entryTitle: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 18,
    flexShrink: 1,
  },
  entryStatsGrid: {
    gap: appTheme.spacing.xs,
  },
  entryPairRow: {
    flexDirection: "row",
    gap: appTheme.spacing.xs,
  },
  entryStatTile: {
    flex: 1,
    backgroundColor: appTheme.colors.surface,
    borderRadius: appTheme.radius.sm,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: appTheme.spacing.xs,
    gap: 2,
  },
  entryPairLabel: {
    color: appTheme.colors.textSubtle,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 11,
    lineHeight: 14,
    textTransform: "uppercase",
  },
  entryPairValue: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 16,
  },
});



