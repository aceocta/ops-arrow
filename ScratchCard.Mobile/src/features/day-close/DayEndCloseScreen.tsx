import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import {
  closeBusinessDay,
  getBusinessDay,
  getBusinessDayCloseAttachmentContent,
  listBusinessDays,
  openBusinessDay,
  reopenBusinessDay,
} from "../../api/businessDaysApi";
import { getConfigurations } from "../../api/configurationsApi";
import { listPacks } from "../../api/packsApi";
import { DateTimeField, formatDateValue, parseDateValue } from "../../components/DateTimeField";
import { getShiftSales, listShifts, openShift, reopenShift, startScheduledShift } from "../../api/shiftsApi";
import { StatusBadge } from "../../components/StatusBadge";
import { ScreenContainer } from "../../components/ScreenContainer";
import { PrimaryButton } from "../../components/PrimaryButton";
import { deriveShopOperationalSetup } from "../settings/shopConfiguration";
import { PackStatus, ShiftStatus } from "../../types/enums";
import { MainStackParamList } from "../../types/navigation";
import { BusinessDay } from "../../types/models";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";

type Props = NativeStackScreenProps<MainStackParamList, "DayEndClose">;

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
const DEFAULT_CLOSE_DAY_PAYOUT = "0";

function getStatusTone(status?: string): "neutral" | "warning" | "danger" | "success" {
  if (!status) return "neutral";
  if (status === "Closed") return "success";
  if (status === "ReadyToClose") return "warning";
  if (status === "Reopened") return "danger";
  return "neutral";
}

function getShiftTone(status: ShiftStatus): "neutral" | "warning" | "danger" | "success" {
  if (status === ShiftStatus.Open) return "success";
  if (status === ShiftStatus.Scheduled) return "warning";
  if (status === ShiftStatus.Reopened) return "warning";
  if (status === ShiftStatus.Closed || status === ShiftStatus.Approved) return "neutral";
  return "neutral";
}

function getBusinessDayStatusHint(status?: string) {
  if (status === "Open") return "Day is active and can take transactions.";
  if (status === "ReadyToClose") return "All shifts are closed and day is ready to close.";
  if (status === "Closed") return "Day is closed and available for historical review.";
  if (status === "Reopened") return "Day was reopened for additional adjustments.";
  return "Review this day before switching.";
}

function getDefaultShiftNameForNow(reference = new Date()) {
  const hour = reference.getHours();
  if (hour < 12) return "Morning";
  if (hour < 18) return "Evening";
  return "Night";
}

function comparePacksByDisplayOrder(a: { displayNumber?: number; packNumber: string }, b: { displayNumber?: number; packNumber: string }) {
  const aDisplay = a.displayNumber;
  const bDisplay = b.displayNumber;
  if (aDisplay != null && bDisplay != null && aDisplay !== bDisplay) {
    return aDisplay - bDisplay;
  }
  if (aDisplay != null && bDisplay == null) return -1;
  if (aDisplay == null && bDisplay != null) return 1;
  return a.packNumber.localeCompare(b.packNumber);
}

function resolveGameCodeFromPack(pack: { gameCode?: string; packNumber: string }) {
  if (pack.gameCode?.trim()) {
    return pack.gameCode.trim().toUpperCase();
  }
  const normalized = pack.packNumber.trim();
  if (!normalized.includes("-")) {
    return "-";
  }
  return normalized.split("-")[0]?.trim().toUpperCase() || "-";
}

function formatCurrency(value?: number) {
  if (value == null || !Number.isFinite(value)) {
    return "-";
  }
  return `\u00A3 ${value.toFixed(2)}`;
}

function getDateValueOffset(baseDateValue: string, dayOffset: number) {
  const parsed = parseDateValue(baseDateValue) ?? new Date();
  const shifted = new Date(parsed);
  shifted.setDate(shifted.getDate() + dayOffset);
  return formatDateValue(shifted);
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailLine}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
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

export function DayEndCloseScreen({ route, navigation }: Props) {
  const { businessDayId } = route.params;
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState("");
  const [lottoPayoutAmount, setLottoPayoutAmount] = useState(DEFAULT_CLOSE_DAY_PAYOUT);
  const [scratchCardPayoutAmount, setScratchCardPayoutAmount] = useState(DEFAULT_CLOSE_DAY_PAYOUT);
  const [tillPayoutAmount, setTillPayoutAmount] = useState(DEFAULT_CLOSE_DAY_PAYOUT);
  const [reopenReason, setReopenReason] = useState("");
  const [targetBusinessDate, setTargetBusinessDate] = useState(formatDateValue(new Date()));
  const [isDayPickerModalVisible, setIsDayPickerModalVisible] = useState(false);
  const [isCloseDayModalVisible, setIsCloseDayModalVisible] = useState(false);
  const [isReopenDayModalVisible, setIsReopenDayModalVisible] = useState(false);
  const [isOpenShiftModalVisible, setIsOpenShiftModalVisible] = useState(false);
  const [isStartScheduledShiftModalVisible, setIsStartScheduledShiftModalVisible] = useState(false);
  const [pendingScheduledShiftStart, setPendingScheduledShiftStart] = useState<{ id: string; shiftName: string } | null>(null);
  const [isAttachmentPreviewModalVisible, setIsAttachmentPreviewModalVisible] = useState(false);
  const [attachmentPreviewId, setAttachmentPreviewId] = useState<string | null>(null);
  const [newShiftName, setNewShiftName] = useState("");
  const [closeDayAttachments, setCloseDayAttachments] = useState<CloseAttachmentState[]>([]);
  const [attachmentPreviewTitle, setAttachmentPreviewTitle] = useState("");
  const [attachmentPreviewUri, setAttachmentPreviewUri] = useState<string>();
  const [loadingDayAttachmentId, setLoadingDayAttachmentId] = useState<string | null>(null);
  const [downloadingDayAttachmentId, setDownloadingDayAttachmentId] = useState<string | null>(null);
  const [confirmedOpeningSerialByPackId, setConfirmedOpeningSerialByPackId] = useState<Record<string, boolean>>({});
  const [openingSerialNumberByPackId, setOpeningSerialNumberByPackId] = useState<Record<string, string>>({});

  const dayQuery = useQuery({
    queryKey: ["business-day", businessDayId],
    queryFn: () => getBusinessDay(businessDayId),
  });

  useEffect(() => {
    const dayCloseSummary = dayQuery.data?.scratchCardDayCloseSummary;
    if (!dayCloseSummary) {
      setLottoPayoutAmount(DEFAULT_CLOSE_DAY_PAYOUT);
      setScratchCardPayoutAmount(DEFAULT_CLOSE_DAY_PAYOUT);
      setTillPayoutAmount(DEFAULT_CLOSE_DAY_PAYOUT);
      return;
    }

    setLottoPayoutAmount(String(dayCloseSummary.lottoPayout));
    setScratchCardPayoutAmount(String(dayCloseSummary.scratchCardPayout));
    setTillPayoutAmount(String(dayCloseSummary.tillPayout));
  }, [
    dayQuery.data?.scratchCardDayCloseSummary?.lottoPayout,
    dayQuery.data?.scratchCardDayCloseSummary?.scratchCardPayout,
    dayQuery.data?.scratchCardDayCloseSummary?.tillPayout,
  ]);

  const normalizePayoutInput = useCallback((raw: string) => {
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : DEFAULT_CLOSE_DAY_PAYOUT;
  }, []);

  const normalizeAllPayoutInputs = useCallback(() => {
    setLottoPayoutAmount((previous) => normalizePayoutInput(previous));
    setScratchCardPayoutAmount((previous) => normalizePayoutInput(previous));
    setTillPayoutAmount((previous) => normalizePayoutInput(previous));
  }, [normalizePayoutInput]);

  const closeMutation = useMutation({
    mutationFn: async () => closeBusinessDay(businessDayId, {
      lottoPayout: Number(normalizePayoutInput(lottoPayoutAmount)),
      scratchCardPayout: Number(normalizePayoutInput(scratchCardPayoutAmount)),
      tillPayout: Number(normalizePayoutInput(tillPayoutAmount)),
      notes: notes.trim() || undefined,
      attachments: closeDayAttachments.map((attachment) => ({
        fileName: attachment.fileName,
        base64: attachment.base64,
        contentType: attachment.contentType,
      })),
    }),
    onSuccess: () => {
      setIsCloseDayModalVisible(false);
      setLottoPayoutAmount(DEFAULT_CLOSE_DAY_PAYOUT);
      setScratchCardPayoutAmount(DEFAULT_CLOSE_DAY_PAYOUT);
      setTillPayoutAmount(DEFAULT_CLOSE_DAY_PAYOUT);
      setNotes("");
      setCloseDayAttachments([]);
      Alert.alert("Closed", "Business day closed successfully.");
      void dayQuery.refetch();
    },
    onError: (error: any) => {
      const code = error?.response?.data?.code;
      const message = error?.response?.data?.message ?? "Unable to close business day.";
      if (code === "checklist_required_tasks_pending") {
        Alert.alert("Checklist Required", message, [
          {
            text: "Open Checklist",
            onPress: () => navigation.navigate("ShopChecklist"),
          },
          { text: "OK" },
        ]);
        return;
      }

      Alert.alert("Failed", message);
    },
  });

  const reopenMutation = useMutation({
    mutationFn: async () => reopenBusinessDay(businessDayId, { reason: reopenReason || undefined }),
    onSuccess: () => {
      setIsReopenDayModalVisible(false);
      Alert.alert("Reopened", "Business day reopened successfully.");
      void dayQuery.refetch();
    },
    onError: (error: any) => {
      Alert.alert("Failed", error?.response?.data?.message ?? "Unable to reopen business day.");
    },
  });

  const openShiftMutation = useMutation({
    mutationFn: async () => {
      if (!day?.shopId) {
        throw new Error("Shop context is missing.");
      }
      const defaultShiftName = shopOperationalSetup.shiftDefaultName.trim() || getDefaultShiftNameForNow();
      const normalizedShiftName = shopOperationalSetup.allowCustomShiftName
        ? (newShiftName.trim() || defaultShiftName)
        : defaultShiftName;

      const duplicateShift = shopOperationalSetup.allowCustomShiftName
        ? shiftsQuery.data?.find(
            (shift) => shift.shiftName.trim().toLowerCase() === normalizedShiftName.toLowerCase(),
          )
        : undefined;
      if (duplicateShift) {
        throw new Error(`Shift '${normalizedShiftName}' already exists for this business day.`);
      }

      const existingOpenShiftNames = getExistingOpenShiftNames();
      if (existingOpenShiftNames.length > 0) {
        throw new Error(`Close existing open shift(s) first: ${existingOpenShiftNames.join(", ")}.`);
      }

      const unconfirmedPacks = getUnconfirmedOpeningSerialPacks();
      if (unconfirmedPacks.length > 0) {
        throw new Error("Confirm starting serial numbers for all active packs before opening a shift.");
      }

      return openShift({
        businessDayId,
        shopId: day.shopId,
        shiftName: normalizedShiftName,
        openingSerialConfirmations: activePacksForOpening.map((pack) => ({
          packId: pack.id,
          openingSerialNumber: getOpeningSerialForPack(pack.id, pack.currentSerialNumber),
        })),
      });
    },
    onSuccess: async () => {
      setIsOpenShiftModalVisible(false);
      setNewShiftName(shopOperationalSetup.shiftDefaultName.trim() || getDefaultShiftNameForNow());
      Alert.alert("Shift opened", "New shift opened successfully.");
      await shiftsQuery.refetch();
    },
    onError: (error: any) => {
      Alert.alert("Failed", error?.response?.data?.message ?? error?.message ?? "Unable to open shift.");
    },
  });
  const reopenShiftMutation = useMutation({
    mutationFn: async ({ shiftId }: { shiftId: string }) => reopenShift(shiftId, { reason: "Reopened from day management." }),
    onSuccess: async () => {
      Alert.alert("Reopened", "Shift reopened successfully.");
      await shiftsQuery.refetch();
    },
    onError: (error: any) => {
      Alert.alert("Failed", error?.response?.data?.message ?? "Unable to reopen shift.");
    },
  });
  const startScheduledShiftMutation = useMutation({
    mutationFn: async ({
      shiftId,
      openingSerialConfirmations,
    }: {
      shiftId: string;
      openingSerialConfirmations: Array<{ packId: string; openingSerialNumber: string }>;
    }) => startScheduledShift(shiftId, { openingSerialConfirmations }),
    onSuccess: async () => {
      setIsStartScheduledShiftModalVisible(false);
      setPendingScheduledShiftStart(null);
      Alert.alert("Started", "Scheduled shift started successfully.");
      await shiftsQuery.refetch();
    },
    onError: (error: any) => {
      Alert.alert("Failed", error?.response?.data?.message ?? "Unable to start scheduled shift.");
    },
  });

  const day = dayQuery.data;
  const status = day?.status;
  const persistedDayAttachments = day?.closeAttachments ?? [];
  const missingOpeningTicketCount = day?.missingOpeningTicketCount ?? 0;
  const missingOpeningTicketDetails = day?.missingOpeningTicketDetails ?? [];
  const canClose = status === "Open" || status === "Reopened" || status === "ReadyToClose";
  const canReopen = status === "Closed";
  const canManageShifts = canClose;
  const persistedDayCloseSummary = day?.scratchCardDayCloseSummary;
  const displayLottoPayout =
    persistedDayCloseSummary?.lottoPayout != null
      ? Number(persistedDayCloseSummary.lottoPayout)
      : lottoPayoutAmount.trim().length > 0
        ? Number(lottoPayoutAmount)
        : undefined;
  const displayScratchCardPayout =
    persistedDayCloseSummary?.scratchCardPayout != null
      ? Number(persistedDayCloseSummary.scratchCardPayout)
      : scratchCardPayoutAmount.trim().length > 0
        ? Number(scratchCardPayoutAmount)
        : undefined;
  const displayTillPayout =
    persistedDayCloseSummary?.tillPayout != null
      ? Number(persistedDayCloseSummary.tillPayout)
      : tillPayoutAmount.trim().length > 0
        ? Number(tillPayoutAmount)
        : undefined;

  const shiftsQuery = useQuery({
    queryKey: ["shifts", day?.shopId, businessDayId],
    queryFn: () => listShifts(day?.shopId as string, businessDayId),
    enabled: Boolean(day?.shopId),
  });
  const configurationQuery = useQuery({
    queryKey: ["configurations", day?.shopId],
    queryFn: () => getConfigurations(day?.shopId as string),
    enabled: Boolean(day?.shopId),
  });
  const packsQuery = useQuery({
    queryKey: ["packs", day?.shopId],
    queryFn: () => listPacks(day?.shopId as string),
    enabled: Boolean(day?.shopId),
  });
  const shopOperationalSetup = useMemo(
    () => deriveShopOperationalSetup(configurationQuery.data),
    [configurationQuery.data],
  );
  const activePacksForOpening = useMemo(
    () =>
      (packsQuery.data ?? [])
        .filter((pack) => pack.status === PackStatus.Active)
        .slice()
        .sort(comparePacksByDisplayOrder),
    [packsQuery.data],
  );
  const hasUnconfirmedOpeningSerials = activePacksForOpening.some((pack) => {
    const enteredSerial = getOpeningSerialForPack(pack.id, pack.currentSerialNumber);
    return !confirmedOpeningSerialByPackId[pack.id] || enteredSerial.length === 0;
  });

  function getOpeningSerialForPack(packId: string, fallback: string) {
    return (openingSerialNumberByPackId[packId] ?? fallback).trim();
  }

  function getUnconfirmedOpeningSerialPacks() {
    return activePacksForOpening.filter((pack) => {
      const enteredSerial = getOpeningSerialForPack(pack.id, pack.currentSerialNumber);
      return !confirmedOpeningSerialByPackId[pack.id] || enteredSerial.length === 0;
    });
  }

  function confirmAllOpeningSerials() {
    setConfirmedOpeningSerialByPackId(() => {
      const next: Record<string, boolean> = {};
      for (const pack of activePacksForOpening) {
        next[pack.id] = getOpeningSerialForPack(pack.id, pack.currentSerialNumber).length > 0;
      }
      return next;
    });
  }

  function getExistingOpenShiftNames() {
    return (shiftsQuery.data ?? [])
      .filter((shift) => shift.status === "Open" || shift.status === "Reopened")
      .map((shift) => shift.shiftName)
      .filter((name, index, all) => all.findIndex((value) => value.toLowerCase() === name.toLowerCase()) === index);
  }

  function ensureNoExistingOpenShiftsBeforeSerialConfirmation() {
    const existingOpenShiftNames = getExistingOpenShiftNames();
    if (existingOpenShiftNames.length === 0) {
      return true;
    }

    Alert.alert(
      "Close open shifts first",
      `Close existing open shift(s) first: ${existingOpenShiftNames.join(", ")}.`,
    );
    return false;
  }

  function openStartScheduledShiftConfirmation(shiftId: string, shiftName: string) {
    if (!ensureNoExistingOpenShiftsBeforeSerialConfirmation()) {
      return;
    }

    setPendingScheduledShiftStart({ id: shiftId, shiftName });
    setIsStartScheduledShiftModalVisible(true);
  }

  function closeStartScheduledShiftConfirmation() {
    if (startScheduledShiftMutation.isPending) {
      return;
    }
    setIsStartScheduledShiftModalVisible(false);
    setPendingScheduledShiftStart(null);
  }

  function startPendingScheduledShift() {
    if (!pendingScheduledShiftStart) {
      return;
    }

    const existingOpenShiftNames = getExistingOpenShiftNames();
    if (existingOpenShiftNames.length > 0) {
      Alert.alert(
        "Close open shifts first",
        `Close existing open shift(s) first: ${existingOpenShiftNames.join(", ")}.`,
      );
      return;
    }

    const unconfirmedPacks = getUnconfirmedOpeningSerialPacks();
    if (unconfirmedPacks.length > 0) {
      Alert.alert("Confirmation required", "Confirm starting serial numbers for all active packs first.");
      return;
    }

    startScheduledShiftMutation.mutate({
      shiftId: pendingScheduledShiftStart.id,
      openingSerialConfirmations: activePacksForOpening.map((pack) => ({
        packId: pack.id,
        openingSerialNumber: getOpeningSerialForPack(pack.id, pack.currentSerialNumber),
      })),
    });
  }

  function renderOpeningSerialConfirmationCard(confirmationHint: string) {
    const totalPacks = activePacksForOpening.length;
    const confirmedPackCount = activePacksForOpening.reduce((count, pack) => {
      const enteredSerial = getOpeningSerialForPack(pack.id, pack.currentSerialNumber);
      return confirmedOpeningSerialByPackId[pack.id] && enteredSerial.length > 0 ? count + 1 : count;
    }, 0);

    return (
      <View style={styles.reviewSnapshotCard}>
        <View style={styles.serialConfirmHeaderRow}>
          <Text style={styles.reviewSnapshotTitle}>Confirm Starting Serials</Text>
          {/* {totalPacks > 0 ? (
            <View style={styles.serialProgressPill}>
              <Text style={styles.serialProgressText}>{confirmedPackCount}/{totalPacks}</Text>
            </View>
          ) : null} */}

           {activePacksForOpening.length > 0 ? (
          <View style={styles.serialConfirmActionRow}>
            <Pressable
              style={[
                styles.serialConfirmButton,
                !hasUnconfirmedOpeningSerials ? styles.serialConfirmButtonSelected : null,
                !hasUnconfirmedOpeningSerials ? styles.serialConfirmButtonDisabled : null,
              ]}
              onPress={confirmAllOpeningSerials}
              disabled={!hasUnconfirmedOpeningSerials}
            >
              <Text style={[styles.serialConfirmButtonText, !hasUnconfirmedOpeningSerials ? styles.serialConfirmButtonTextSelected : null]}>
                {hasUnconfirmedOpeningSerials ? "Confirm All" : "All Confirmed"}
              </Text>
            </Pressable>
          </View>
        ) : null}
        </View>
        <Text style={[styles.meta, styles.serialConfirmHint]}>{confirmationHint}</Text>
       

        {packsQuery.isFetching ? <Text style={styles.meta}>Loading active packs...</Text> : null}
        {!packsQuery.isFetching && activePacksForOpening.length === 0 ? (
          <Text style={styles.meta}>No active packs found for this shop.</Text>
        ) : null}
        {activePacksForOpening.map((pack) => {
          const isConfirmed = Boolean(confirmedOpeningSerialByPackId[pack.id]);
          const enteredOpeningSerial = openingSerialNumberByPackId[pack.id] ?? pack.currentSerialNumber;
          const hasSerialValue = enteredOpeningSerial.trim().length > 0;
          return (
            <View key={pack.id} style={styles.serialConfirmRow}>
              <Text style={styles.serialPackTitle}>
                Display: {pack.displayNumber != null ? `#${pack.displayNumber}` : "-"} | {pack.gameName}
              </Text>
              <Text style={styles.meta}>
                Code: {resolveGameCodeFromPack(pack)} | Expected: {pack.currentSerialNumber}
              </Text>
              <View style={styles.serialConfirmInputRow}>
                <TextInput
                  style={[styles.input, styles.serialConfirmInput]}
                  value={enteredOpeningSerial}
                  placeholder="Starting serial"
                  placeholderTextColor={appTheme.colors.textSubtle}
                  keyboardType="numeric"
                  onChangeText={(value) => {
                    setOpeningSerialNumberByPackId((previous) => ({
                      ...previous,
                      [pack.id]: value,
                    }));
                    setConfirmedOpeningSerialByPackId((previous) => ({
                      ...previous,
                      [pack.id]: false,
                    }));
                  }}
                />
                <Pressable
                  style={[
                    styles.serialConfirmButton,
                    isConfirmed ? styles.serialConfirmButtonSelected : null,
                    !hasSerialValue ? styles.serialConfirmButtonDisabled : null,
                  ]}
                  disabled={!hasSerialValue}
                  onPress={() =>
                    setConfirmedOpeningSerialByPackId((previous) => ({
                      ...previous,
                      [pack.id]: !isConfirmed,
                    }))
                  }
                >
                  <Text style={[styles.serialConfirmButtonText, isConfirmed ? styles.serialConfirmButtonTextSelected : null]}>
                    {isConfirmed ? "Confirmed" : "Confirm"}
                  </Text>
                </Pressable>
              </View>
            </View>
          );
        })}
      </View>
    );
  }

  useEffect(() => {
    const preserveCurrentEdits = isOpenShiftModalVisible || isStartScheduledShiftModalVisible;

    setConfirmedOpeningSerialByPackId((previous) => {
      const next: Record<string, boolean> = {};
      for (const pack of activePacksForOpening) {
        next[pack.id] = preserveCurrentEdits ? (previous[pack.id] ?? false) : false;
      }
      return next;
    });

    setOpeningSerialNumberByPackId((previous) => {
      const next: Record<string, string> = {};
      for (const pack of activePacksForOpening) {
        next[pack.id] = preserveCurrentEdits
          ? (previous[pack.id] ?? pack.currentSerialNumber)
          : pack.currentSerialNumber;
      }
      return next;
    });
  }, [activePacksForOpening, isOpenShiftModalVisible, isStartScheduledShiftModalVisible]);

  useEffect(() => {
    if (!isOpenShiftModalVisible) {
      return;
    }

    setNewShiftName(shopOperationalSetup.shiftDefaultName.trim() || getDefaultShiftNameForNow());
  }, [isOpenShiftModalVisible, shopOperationalSetup.shiftDefaultName]);

  useFocusEffect(
    useCallback(() => {
      const shopId = day?.shopId;
      void (async () => {
        await Promise.allSettled([
          queryClient.invalidateQueries({ queryKey: ["business-day", businessDayId] }),
          queryClient.invalidateQueries({ queryKey: ["day-shift-sales-totals", businessDayId] }),
          queryClient.invalidateQueries({ queryKey: ["day-summary-closed-shift-sales", businessDayId] }),
          shopId
            ? queryClient.invalidateQueries({ queryKey: ["shifts", shopId, businessDayId] })
            : Promise.resolve(),
          shopId
            ? queryClient.invalidateQueries({ queryKey: ["packs", shopId] })
            : Promise.resolve(),
        ]);

        await Promise.allSettled([
          queryClient.refetchQueries({ queryKey: ["business-day", businessDayId], exact: true }),
          shopId
            ? queryClient.refetchQueries({ queryKey: ["shifts", shopId, businessDayId], exact: true })
            : Promise.resolve(),
          shopId
            ? queryClient.refetchQueries({ queryKey: ["packs", shopId], exact: true })
            : Promise.resolve(),
        ]);
      })();
    }, [businessDayId, day?.shopId, queryClient]),
  );

  const shifts = shiftsQuery.data ?? [];
  const closedSummaryStatuses = new Set<ShiftStatus>([ShiftStatus.Closed, ShiftStatus.Approved]);
  const closedShiftIds = useMemo(
    () => shifts.filter((shift) => closedSummaryStatuses.has(shift.status)).map((shift) => shift.id),
    [shifts],
  );
  const shiftIds = useMemo(() => shifts.map((shift) => shift.id), [shifts]);
  const shiftIdsKey = shiftIds.join(",");
  const shiftSalesTotalsQuery = useQuery({
    queryKey: ["day-shift-sales-totals", businessDayId, shiftIdsKey],
    queryFn: async () => {
      if (shiftIds.length === 0) {
        return {} as Record<string, number>;
      }

      const entries = await Promise.all(
        shifts.map(async (shift) => {
          try {
            const sales = await getShiftSales(shift.id);
            const total = sales.reduce((sum, entry) => sum + Number(entry.salesAmount ?? 0), 0);
            return [shift.id, total] as const;
          } catch {
            return [shift.id, 0] as const;
          }
        }),
      );

      return Object.fromEntries(entries);
    },
    enabled: shiftIds.length > 0,
  });
  const closedShiftIdsKey = closedShiftIds.join(",");
  const closedShiftSalesQuery = useQuery({
    queryKey: ["day-summary-closed-shift-sales", businessDayId, closedShiftIdsKey],
    queryFn: async () => {
      if (closedShiftIds.length === 0) {
        return 0;
      }

      const salesCollections = await Promise.all(
        closedShiftIds.map(async (shiftId) => {
          try {
            return await getShiftSales(shiftId);
          } catch {
            return [];
          }
        }),
      );

      return salesCollections
        .flat()
        .reduce((sum, entry) => sum + Number(entry.salesAmount ?? 0), 0);
    },
    enabled: closedShiftIds.length > 0,
  });
  const lotteryMachinePayout = displayLottoPayout;
  const scratchCardPayout = displayScratchCardPayout;
  const tillPayout = displayTillPayout;
  const summaryTotalSales = closedShiftIds.length === 0 ? 0 : Number(closedShiftSalesQuery.data ?? 0);
  const tillPayoutVariance =
    tillPayout != null && lotteryMachinePayout != null && scratchCardPayout != null
      ? tillPayout - (lotteryMachinePayout + scratchCardPayout)
      : undefined;
  const hasTillPayoutVariance = tillPayoutVariance != null && Math.abs(tillPayoutVariance) >= 0.01;
  const tillPayoutVarianceText =
    tillPayoutVariance != null
      ? `${tillPayoutVariance > 0 ? "+" : "-"}\u00A3 ${Math.abs(tillPayoutVariance).toFixed(2)}`
      : "";
  const tillPayoutVarianceStyle =
    hasTillPayoutVariance
      ? [styles.kpiValue, styles.kpiValueNegative]
      : styles.kpiValue;
  const closableStatuses = new Set<ShiftStatus>([ShiftStatus.Open, ShiftStatus.Reopened]);
  const hasOpenShifts = shifts.some((shift) => closableStatuses.has(shift.status));
  const openShiftCount = shifts.filter((shift) => closableStatuses.has(shift.status)).length;
  const scheduledShiftCount = shifts.filter((shift) => shift.status === ShiftStatus.Scheduled).length;
  const closedShiftCount = shifts.filter((shift) => closedSummaryStatuses.has(shift.status)).length;
  const dayStatusMessage = canClose
    ? hasOpenShifts
      ? "Close all open shifts before closing this business day."
      : "All shifts are closed. You can finish this business day now."
    : canReopen
      ? "This business day is closed. Reopen only if more edits are required."
      : "No day action is available for the current status.";
  const openDayMutation = useMutation({
    mutationFn: async () => {
      if (!day?.shopId) {
        throw new Error("Shop context is missing.");
      }
      return openBusinessDay({ shopId: day.shopId, businessDate: targetBusinessDate });
    },
    onSuccess: (openedDay) => {
      setIsDayPickerModalVisible(false);
      Alert.alert("Opened", `Business day opened (${openedDay.businessDate}).`);
      navigation.replace("DayEndClose", { businessDayId: openedDay.id });
    },
    onError: (error: any) => {
      Alert.alert("Failed", error?.response?.data?.message ?? "Unable to open business day.");
    },
  });

  const previewDayAttachmentMutation = useMutation({
    mutationFn: async ({ attachmentId, fileName }: { attachmentId: string; fileName: string }) => {
      const dataUrl = await getBusinessDayCloseAttachmentContent(attachmentId);
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

  const downloadDayAttachmentMutation = useMutation({
    mutationFn: async ({ attachmentId, fileName }: { attachmentId: string; fileName: string }) => {
      const dataUrl = await getBusinessDayCloseAttachmentContent(attachmentId);
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

  const dayPickerFromDate = useMemo(
    () => getDateValueOffset(targetBusinessDate, -21),
    [targetBusinessDate],
  );
  const dayPickerToDate = useMemo(
    () => getDateValueOffset(targetBusinessDate, 14),
    [targetBusinessDate],
  );

  const daysQuery = useQuery({
    queryKey: ["business-days-for-picker", day?.shopId, dayPickerFromDate, dayPickerToDate],
    queryFn: () => listBusinessDays(day?.shopId as string, { from: dayPickerFromDate, to: dayPickerToDate }),
    enabled: Boolean(day?.shopId) && isDayPickerModalVisible,
    staleTime: 5 * 60 * 1000,
  });

  const availableDays = useMemo(
    () => (daysQuery.data ?? []).slice(0, 30),
    [daysQuery.data],
  );
  const selectedDateDay = useMemo(
    () => availableDays.find((item) => item.businessDate === targetBusinessDate),
    [availableDays, targetBusinessDate],
  );
  const selectedDayIsCurrent = selectedDateDay?.id === businessDayId;
  const selectedDateStatusHint = getBusinessDayStatusHint(selectedDateDay?.status);
  const dayPickerLookupErrorMessage = daysQuery.isError
    ? (daysQuery.error as any)?.response?.data?.message ?? "Unable to load business-day availability for this date."
    : "";
  const isDayPickerLookupLoading = daysQuery.isFetching && !daysQuery.data;
  const dayPickerPrimaryLabel = selectedDateDay
    ? (selectedDayIsCurrent ? "Already Managing This Date" : `Switch To ${selectedDateDay.businessDate}`)
    : (openDayMutation.isPending ? "Opening..." : `Open ${targetBusinessDate}`);
  const dayPickerPrimaryDisabled = selectedDateDay
    ? selectedDayIsCurrent
    : openDayMutation.isPending || !day?.shopId || isDayPickerLookupLoading;

  const selectDay = (selectedDay: BusinessDay) => {
    setIsDayPickerModalVisible(false);
    if (selectedDay.id === businessDayId) {
      return;
    }
    navigation.replace("DayEndClose", { businessDayId: selectedDay.id });
  };

  const onDayPickerPrimaryAction = () => {
    if (selectedDateDay) {
      selectDay(selectedDateDay);
      return;
    }
    openDayMutation.mutate();
  };

  const previewDayAttachment = (attachmentId: string, fileName: string) => {
    setLoadingDayAttachmentId(attachmentId);
    previewDayAttachmentMutation.mutate(
      { attachmentId, fileName },
      {
        onSettled: () => {
          setLoadingDayAttachmentId(null);
        },
      },
    );
  };

  const downloadDayAttachment = (attachmentId: string, fileName: string) => {
    setDownloadingDayAttachmentId(attachmentId);
    downloadDayAttachmentMutation.mutate(
      { attachmentId, fileName },
      {
        onSettled: () => {
          setDownloadingDayAttachmentId(null);
        },
      },
    );
  };

  const selectCloseDayAttachments = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission required", "Photo access is required to add an attachment.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      quality: 0.85,
      allowsEditing: false,
      allowsMultipleSelection: true,
      selectionLimit: MAX_CLOSE_ATTACHMENTS,
      base64: true,
    });

    if (result.canceled || result.assets.length === 0) {
      return;
    }

    let oversizedCount = 0;
    const selected = result.assets
      .filter((asset) => Boolean(asset.base64))
      .flatMap((asset) => {
        if (typeof asset.fileSize === "number" && asset.fileSize > MAX_CLOSE_ATTACHMENT_BYTES) {
          oversizedCount++;
          return [];
        }

        return [{
          id: `${Date.now()}-${Math.random()}`,
          fileName: asset.fileName ?? `day-close-${Date.now()}.jpg`,
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
      Alert.alert("Attachment failed", "Unable to read selected attachment(s).");
      return;
    }

    setCloseDayAttachments((previous) => {
      const combined = [...previous, ...selected];
      if (combined.length <= MAX_CLOSE_ATTACHMENTS) {
        return combined;
      }

      Alert.alert("Attachment limit", "A maximum of 10 attachments can be added.");
      return combined.slice(0, MAX_CLOSE_ATTACHMENTS);
    });
  };

  const validateCloseDayInputs = () => {
    const values = [
      { label: "Lotto payout", raw: lottoPayoutAmount },
      { label: "Scratch card payout", raw: scratchCardPayoutAmount },
      { label: "Till payout", raw: tillPayoutAmount },
    ];

    for (const value of values) {
      const normalizedValue = normalizePayoutInput(value.raw);
      if (!Number.isFinite(Number(normalizedValue))) {
        Alert.alert("Validation", `${value.label} must be a valid number.`);
        return false;
      }
    }

    return true;
  };

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.pageContent}>
        <View style={[ui.card, styles.dayHeaderCard]}>
          <View style={styles.summaryHeaderRow}>
            <View style={styles.summaryHeading}>
              {/* <Text style={styles.summaryEyebrow}>Business Date</Text> */}
              <Text style={styles.summaryDate}>{day?.businessDate ?? "-"}</Text>
            </View>
            <StatusBadge label={status ?? "-"} tone={getStatusTone(status)} />
          </View>
          {/* <Text style={styles.meta}>{dayStatusMessage}</Text> */}
          <View style={styles.summaryMetaGrid}>
            <View style={styles.summaryMetaItem}>
              <Text style={styles.summaryMetaLabel}>Open Shifts</Text>
              <Text style={styles.summaryMetaValue}>{openShiftCount}</Text>
            </View>
            <View style={styles.summaryMetaItem}>
              <Text style={styles.summaryMetaLabel}>Closed Shifts</Text>
              <Text style={styles.summaryMetaValue}>{closedShiftCount}</Text>
            </View>
            <View style={styles.summaryMetaItem}>
              <Text style={styles.summaryMetaLabel}>Scheduled</Text>
              <Text style={styles.summaryMetaValue}>{scheduledShiftCount}</Text>
            </View>
            <View style={styles.summaryMetaItem}>
              <Text style={styles.summaryMetaLabel}>Missing Tickets</Text>
              <Text
                style={[
                  styles.summaryMetaValue,
                  missingOpeningTicketCount > 0 ? styles.summaryMetaValueDanger : null,
                ]}
              >
                {missingOpeningTicketCount}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Change business date"
              style={styles.dateActionInlineButton}
              onPress={() => {
                setTargetBusinessDate(day?.businessDate ?? formatDateValue(new Date()));
                setIsDayPickerModalVisible(true);
              }}
            >
              <Text style={styles.dateActionInlineButtonText}>Change Date</Text>
            </Pressable>
          </View>
        </View>

        <View style={[ui.card, styles.sectionCard]}>
          <View style={styles.sectionTitleRow}>
            <View style={styles.sectionTitleBlock}>
              <Text style={styles.sectionTitle}>Shift Operations</Text>
              {/* <Text style={styles.meta}>Manage shifts, review times, and close active shifts.</Text> */}
            </View>
            <View style={styles.shiftHeaderActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open new shift"
                style={[styles.shiftOpenButton, !canManageShifts ? styles.shiftOpenButtonDisabled : null]}
                onPress={() => {
                  if (!ensureNoExistingOpenShiftsBeforeSerialConfirmation()) {
                    return;
                  }
                  setNewShiftName(shopOperationalSetup.shiftDefaultName.trim() || getDefaultShiftNameForNow());
                  setIsOpenShiftModalVisible(true);
                }}
                disabled={!canManageShifts}
              >
                <Text style={styles.shiftOpenButtonText}>Open Shift</Text>
              </Pressable>
              {/* <Pressable
                accessibilityRole="button"
                accessibilityLabel={shiftsQuery.isFetching ? "Refreshing shifts" : "Refresh shifts"}
                style={[styles.iconButton, (!day?.shopId || shiftsQuery.isFetching) ? styles.iconButtonDisabled : null]}
                onPress={() => void shiftsQuery.refetch()}
                disabled={!day?.shopId || shiftsQuery.isFetching}
              >
                <Text style={styles.iconGlyph}>{shiftsQuery.isFetching ? "*" : "\u21BB"}</Text>
              </Pressable> */}
            </View>
          </View>
          <View style={styles.summaryDivider} />
          {shifts.length === 0 && !shiftsQuery.isFetching ? (
            <Text style={styles.meta}>No shifts found for this day.</Text>
          ) : null}

          {shifts.map((shift) => {
            const canCloseShift = closableStatuses.has(shift.status);
            const canStartScheduledShift = shift.status === ShiftStatus.Scheduled;
            const shiftSalesTotal = shiftSalesTotalsQuery.data?.[shift.id];
            return (
              <View key={shift.id} style={styles.shiftItem}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${shift.shiftName} shift details`}
                  style={styles.shiftDetailsTapArea}
                  onPress={() => navigation.navigate("ShiftDetails", { shiftId: shift.id, shopId: shift.shopId })}
                >
                  <View style={styles.shiftHeader}>
                    <Text style={styles.shiftName}>{shift.shiftName}</Text>
                    <StatusBadge label={shift.status} tone={getShiftTone(shift.status)} />
                  </View>
                  <DetailLine label="Start" value={new Date(shift.startTime).toLocaleString()} />
                  {shift.endTime ? <DetailLine label="End" value={new Date(shift.endTime).toLocaleString()} /> : null}
                  <DetailLine
                    label="Sales Total"
                    value={shiftSalesTotal != null ? formatCurrency(shiftSalesTotal) : "Loading..."}
                  />
                  {/* <Text style={styles.shiftDetailsHint}>Tap to open shift details</Text> */}
                </Pressable>
                {canCloseShift ? (
                  <View style={styles.shiftActionRow}>
                    <PrimaryButton
                      label="Close Shift"
                      onPress={() => navigation.navigate("ShiftClose", { shiftId: shift.id, shopId: shift.shopId })}
                      disabled={!canManageShifts}
                    />
                  </View>
                ) : canStartScheduledShift ? (
                  <View style={styles.shiftActionRow}>
                    <PrimaryButton
                      label={startScheduledShiftMutation.isPending ? "Starting..." : "Start Shift"}
                      onPress={() => openStartScheduledShiftConfirmation(shift.id, shift.shiftName)}
                      disabled={!canManageShifts || startScheduledShiftMutation.isPending}
                    />
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>

        {missingOpeningTicketDetails.length > 0 ? (
          <View style={[ui.card, styles.sectionCard]}>
            <View style={styles.sectionTitleRow}>
              <Text style={styles.sectionTitle}>Missing Tickets (Opening Serial)</Text>
              <StatusBadge
                label={`${missingOpeningTicketCount}`}
                tone={missingOpeningTicketCount > 0 ? "danger" : "success"}
              />
            </View>
            <View style={styles.missingTicketList}>
              {missingOpeningTicketDetails.map((detail, index) => (
                <View key={`${detail.shiftId}-${detail.packId}-${index}`} style={styles.missingTicketItem}>
                  <Text style={styles.reviewSnapshotTitle}>
                    Display: {detail.displayNumber != null ? `#${detail.displayNumber}` : "-"} | {detail.gameName}
                  </Text>
                  <Text style={styles.meta}>Shift: {detail.shiftName}</Text>
                  <Text style={styles.meta}>Game Code: {detail.gameCode || "-"}</Text>
                  <Text style={styles.meta}>Pack: {detail.packNumber}</Text>
                  <Text style={styles.meta}>
                    Expected: {detail.expectedOpeningSerialNumber} | Actual: {detail.actualOpeningSerialNumber}
                  </Text>
                  <Text style={styles.missingTicketQty}>Missing Qty: {detail.missingQuantity}</Text>
                  {detail.overageQuantity > 0 ? (
                    <Text style={styles.meta}>Overage Qty: {detail.overageQuantity}</Text>
                  ) : null}
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <View style={[ui.card, styles.sectionCard]}>
          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionTitle}>Financial Summary</Text>
            {hasTillPayoutVariance ? (
              <Text style={[styles.summaryVarianceText, tillPayoutVarianceStyle]}>
                {tillPayoutVarianceText}
              </Text>
            ) : null}
          </View>
          <View style={styles.kpiGrid}>
            <View style={styles.kpiTile}>
              <Text style={styles.kpiLabel}>Total Sales</Text>
              <Text style={styles.kpiValue}>{formatCurrency(summaryTotalSales)}</Text>
            </View>
            <View style={styles.kpiTile}>
              <Text style={styles.kpiLabel}>Lotto Payout</Text>
              <Text style={styles.kpiValue}>{formatCurrency(lotteryMachinePayout)}</Text>
            </View>
            <View style={styles.kpiTile}>
              <Text style={styles.kpiLabel}>Scratch Card Payout</Text>
              <Text style={styles.kpiValue}>{formatCurrency(scratchCardPayout)}</Text>
            </View>
            <View style={styles.kpiTile}>
              <Text style={styles.kpiLabel}>Till Payout</Text>
              <Text style={styles.kpiValue}>{formatCurrency(tillPayout)}</Text>
            </View>
          </View>
        </View>

        {persistedDayAttachments.length > 0 ? (
          <View style={[ui.card, styles.sectionCard]}>
            <Text style={styles.sectionTitle}>Attachments</Text>
            <View style={styles.attachmentList}>
              {persistedDayAttachments.map((attachment) => {
                const canPreviewImage = isImageContentType(attachment.contentType);
                const isLoadingPreview = loadingDayAttachmentId === attachment.id;
                const isDownloading = downloadingDayAttachmentId === attachment.id;
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
                      <Text style={styles.meta}>
                        Uploaded {new Date(attachment.uploadedOn).toLocaleString()}
                      </Text>
                    </View>
                    <View style={styles.attachmentActionStack}>
                      <Pressable
                        style={styles.attachmentDownloadButton}
                        accessibilityRole="button"
                        accessibilityLabel={`Download attachment ${attachment.fileName}`}
                        onPress={() => downloadDayAttachment(attachment.id, attachment.fileName)}
                        disabled={isDownloading}
                      >
                        <Text style={styles.attachmentDownloadButtonText}>{isDownloading ? "Saving..." : "Download"}</Text>
                      </Pressable>
                      {canPreviewImage ? (
                        <Pressable
                          style={styles.attachmentViewButton}
                          accessibilityRole="button"
                          accessibilityLabel={`Preview attachment ${attachment.fileName}`}
                          onPress={() => previewDayAttachment(attachment.id, attachment.fileName)}
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
          </View>
        ) : null}

        {canClose ? (
          <PrimaryButton
            label="Close Day"
            onPress={() => setIsCloseDayModalVisible(true)}
            disabled={hasOpenShifts}
          />
        ) : null}
        {canReopen ? (
          <PrimaryButton
            label="Reopen Day"
            tone="neutral"
            onPress={() => setIsReopenDayModalVisible(true)}
          />
        ) : null}
        {/* <View style={[ui.card, styles.sectionCard]}>
          <Text style={styles.sectionTitle}>Day Action</Text>
          <Text style={styles.meta}>{dayStatusMessage}</Text>
          {canClose ? (
            <PrimaryButton
              label="Close Day"
              onPress={() => setIsCloseDayModalVisible(true)}
              disabled={hasOpenShifts}
            />
          ) : null}
          {canReopen ? (
            <PrimaryButton
              label="Reopen Day"
              tone="neutral"
              onPress={() => setIsReopenDayModalVisible(true)}
            />
          ) : null}
        </View> */}

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
                    downloadDayAttachment(attachmentPreviewId, attachmentPreviewTitle);
                  }}
                  disabled={!attachmentPreviewId || !attachmentPreviewTitle || downloadingDayAttachmentId === attachmentPreviewId}
                >
                  <Text style={styles.attachmentPreviewHeaderButtonText}>
                    {downloadingDayAttachmentId === attachmentPreviewId ? "Saving..." : "Download"}
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

        <Modal
          visible={isDayPickerModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setIsDayPickerModalVisible(false)}
        >
          <View style={styles.dayPickerBackdrop}>
            <View style={[styles.modalCard, styles.dayPickerModalCard]}>
              <View style={styles.dayPickerHeaderRow}>
                <View style={styles.dayPickerHeaderTextWrap}>
                  {/* <Text style={styles.dayPickerEyebrow}>Business Day</Text> */}
                  <Text style={styles.dayPickerTitle}>Change Date</Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close date picker"
                  style={styles.dayPickerCloseButton}
                  onPress={() => setIsDayPickerModalVisible(false)}
                >
                  <Text style={styles.dayPickerCloseButtonText}>X</Text>
                </Pressable>
              </View>
              <ScrollView
                style={styles.dayPickerBodyScroll}
                contentContainerStyle={styles.dayPickerBodyContent}
                showsVerticalScrollIndicator={false}
              >
                <Text style={styles.dayPickerSubtitle}>Choose a date, review availability, then confirm switch or open.</Text>

                <View style={styles.dayPickerCurrentDayCard}>
                  <View style={styles.dayPickerCurrentDayHeader}>
                    <Text style={styles.dayPickerCurrentDayLabel}>Currently Managing</Text>
                    <StatusBadge label={status ?? "-"} tone={getStatusTone(status)} />
                  </View>
                  <Text style={styles.dayPickerCurrentDayValue}>{day?.businessDate ?? "-"}</Text>
                </View>

                <View style={styles.dayPickerDateSection}>
                  <View style={styles.dayPickerSectionHeaderRow}>
                    <Text style={styles.dayPickerSectionLabel}>1. Select Business Date</Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Select today's date"
                      style={styles.dayPickerQuickActionButton}
                      onPress={() => setTargetBusinessDate(formatDateValue(new Date()))}
                    >
                      <Text style={styles.dayPickerQuickActionButtonText}>Today</Text>
                    </Pressable>
                  </View>
                  <DateTimeField
                    mode="date"
                    value={targetBusinessDate}
                    onChange={setTargetBusinessDate}
                    style={styles.dayPickerDateField}
                  />
                  <View style={styles.dayPickerQuickDateRow}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Select currently managed business date"
                      style={styles.dayPickerQuickActionButton}
                      onPress={() => setTargetBusinessDate(day?.businessDate ?? formatDateValue(new Date()))}
                    >
                      <Text style={styles.dayPickerQuickActionButtonText}>Use Current Day</Text>
                    </Pressable>
                  </View>
                </View>

                <View style={styles.dayPickerSelectionCard}>
                  <Text style={styles.dayPickerSectionLabel}>2. Review Selected Date</Text>
                  <Text style={styles.dayPickerSelectionDate}>{targetBusinessDate}</Text>
                  {isDayPickerLookupLoading ? (
                    <Text style={styles.dayPickerSelectionMeta}>Checking day availability...</Text>
                  ) : dayPickerLookupErrorMessage ? (
                    <Text style={styles.error}>{dayPickerLookupErrorMessage}</Text>
                  ) : selectedDateDay ? (
                    <>
                      <View style={styles.dayPickerSelectionHeader}>
                        <Text style={styles.dayPickerSelectionTitle}>
                          {selectedDayIsCurrent ? "This date is already open here." : "Existing business day found."}
                        </Text>
                        <StatusBadge label={selectedDateDay.status} tone={getStatusTone(selectedDateDay.status)} />
                      </View>
                      <Text style={styles.dayPickerSelectionMeta}>{selectedDateStatusHint}</Text>
                    </>
                  ) : (
                    <>
                      <Text style={styles.dayPickerSelectionTitle}>No business day exists for this date.</Text>
                      <Text style={styles.dayPickerSelectionMeta}>Create and open a new business day for {targetBusinessDate}.</Text>
                    </>
                  )}
                  <PrimaryButton
                    label={dayPickerPrimaryLabel}
                    tone={selectedDayIsCurrent ? "neutral" : "primary"}
                    onPress={onDayPickerPrimaryAction}
                    disabled={dayPickerPrimaryDisabled}
                  />
                </View>

                <View style={styles.dayPickerListSection}>
                  <View style={styles.dayPickerListHeader}>
                    <Text style={styles.dayPickerSectionLabel}>3. Nearby Business Days</Text>
                    <Text style={styles.dayPickerListMeta}>
                      {daysQuery.isFetching ? "Refreshing..." : `${availableDays.length} loaded`}
                    </Text>
                  </View>
                  <Text style={styles.dayPickerListHint}>Tap a row to prefill the selected date above.</Text>
                  <ScrollView
                    style={styles.dayPickerList}
                    contentContainerStyle={styles.dayPickerListContent}
                    showsVerticalScrollIndicator={false}
                    nestedScrollEnabled
                  >
                    {availableDays.map((item) => {
                      const isCurrentDay = item.id === businessDayId;
                      const isTargetDate = item.businessDate === targetBusinessDate;
                      return (
                        <Pressable
                          key={item.id}
                          style={[
                            styles.dayPickerItem,
                            isTargetDate ? styles.dayPickerItemTargetDate : null,
                            isCurrentDay ? styles.dayPickerItemCurrentDay : null,
                          ]}
                          onPress={() => setTargetBusinessDate(item.businessDate)}
                        >
                          <View style={styles.dayPickerItemInfo}>
                            <Text style={styles.dayPickerDate}>{item.businessDate}</Text>
                            <Text style={styles.dayPickerItemMeta}>
                              {isCurrentDay ? "Currently managed in this screen." : getBusinessDayStatusHint(item.status)}
                            </Text>
                          </View>
                          <View style={styles.dayPickerItemBadgeWrap}>
                            <StatusBadge label={item.status} tone={getStatusTone(item.status)} />
                          </View>
                        </Pressable>
                      );
                    })}
                    {!daysQuery.isFetching && availableDays.length === 0 ? (
                      <View style={styles.dayPickerEmptyState}>
                        <Text style={styles.meta}>No business days found in this date range.</Text>
                      </View>
                    ) : null}
                  </ScrollView>
                </View>
              </ScrollView>

              <View style={styles.dayPickerFooterRow}>
                <Pressable
                  style={[styles.modalActionButton, styles.modalActionNeutral]}
                  onPress={() => setIsDayPickerModalVisible(false)}
                >
                  <Text style={styles.modalActionNeutralText}>Cancel</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        <Modal
          visible={isOpenShiftModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setIsOpenShiftModalVisible(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <Text style={styles.sectionTitle}>Open New Shift</Text>
             
              {shopOperationalSetup.allowCustomShiftName ? (
                <>
                  <Text style={styles.fieldLabel}>Shift Name</Text>
                  <TextInput
                    style={styles.input}
                    value={newShiftName}
                    onChangeText={setNewShiftName}
                    placeholder="Shift name"
                    placeholderTextColor={appTheme.colors.textSubtle}
                  />
                </>
              ) : (
                <View style={styles.reviewSnapshotCard}>
                  <Text style={styles.reviewSnapshotTitle}>Shift Name</Text>
                  <Text style={styles.meta}>{shopOperationalSetup.shiftDefaultName}</Text>
                </View>
              )}
              {renderOpeningSerialConfirmationCard("Confirm each active pack before opening the shift.")}
              <View style={styles.modalActionRow}>
                <Pressable
                  style={[
                    styles.modalActionButton,
                    styles.modalActionButtonLeft,
                    styles.modalActionPrimary,
                    (openShiftMutation.isPending || !canManageShifts) ? styles.modalActionDisabled : null,
                  ]}
                  onPress={() => openShiftMutation.mutate()}
                  disabled={openShiftMutation.isPending || !canManageShifts}
                >
                  <Text style={styles.modalActionPrimaryText}>{openShiftMutation.isPending ? "Opening..." : "Open Shift"}</Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.modalActionButton,
                    styles.modalActionButtonRight,
                    styles.modalActionNeutral,
                    openShiftMutation.isPending ? styles.modalActionDisabled : null,
                  ]}
                  onPress={() => setIsOpenShiftModalVisible(false)}
                  disabled={openShiftMutation.isPending}
                >
                  <Text style={styles.modalActionNeutralText}>Close</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        <Modal
          visible={isStartScheduledShiftModalVisible}
          transparent
          animationType="fade"
          onRequestClose={closeStartScheduledShiftConfirmation}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <Text style={styles.sectionTitle}>Start - {pendingScheduledShiftStart?.shiftName}</Text>
              {/* <Text style={styles.meta}>
                {pendingScheduledShiftStart
                  ? `Shift: ${pendingScheduledShiftStart.shiftName}. Confirm each active pack before starting the shift.`
                  : "Confirm each active pack before starting the shift."}
              </Text> */}
              {renderOpeningSerialConfirmationCard("Update any serial that is not correct, then confirm it before start.")}
              <View style={styles.modalActionRow}>
                <Pressable
                  style={[
                    styles.modalActionButton,
                    styles.modalActionButtonLeft,
                    styles.modalActionPrimary,
                    (startScheduledShiftMutation.isPending || !canManageShifts || !pendingScheduledShiftStart || packsQuery.isFetching)
                      ? styles.modalActionDisabled
                      : null,
                  ]}
                  onPress={startPendingScheduledShift}
                  disabled={startScheduledShiftMutation.isPending || !canManageShifts || !pendingScheduledShiftStart || packsQuery.isFetching}
                >
                  <Text style={styles.modalActionPrimaryText}>
                    {startScheduledShiftMutation.isPending ? "Starting..." : "Start Shift"}
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.modalActionButton,
                    styles.modalActionButtonRight,
                    styles.modalActionNeutral,
                    startScheduledShiftMutation.isPending ? styles.modalActionDisabled : null,
                  ]}
                  onPress={closeStartScheduledShiftConfirmation}
                  disabled={startScheduledShiftMutation.isPending}
                >
                  <Text style={styles.modalActionNeutralText}>Close</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        <Modal
          visible={isCloseDayModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setIsCloseDayModalVisible(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <Text style={styles.sectionTitle}>Close Day</Text>
              <Text style={styles.meta}>Enter payouts, then close this business day.</Text>
              <Text style={styles.fieldLabel}>Lotto Payout</Text>
              <TextInput
                style={styles.input}
                value={lottoPayoutAmount}
                onChangeText={setLottoPayoutAmount}
                onFocus={() => {
                  if (lottoPayoutAmount.trim() === DEFAULT_CLOSE_DAY_PAYOUT) {
                    setLottoPayoutAmount("");
                  }
                }}
                onBlur={() => {
                  if (!lottoPayoutAmount.trim().length) {
                    setLottoPayoutAmount(DEFAULT_CLOSE_DAY_PAYOUT);
                  }
                }}
                placeholder="Lotto payout"
                placeholderTextColor={appTheme.colors.textSubtle}
                keyboardType="decimal-pad"
              />
              <Text style={styles.fieldLabel}>Scratch Card Payout</Text>
              <TextInput
                style={styles.input}
                value={scratchCardPayoutAmount}
                onChangeText={setScratchCardPayoutAmount}
                onFocus={() => {
                  if (scratchCardPayoutAmount.trim() === DEFAULT_CLOSE_DAY_PAYOUT) {
                    setScratchCardPayoutAmount("");
                  }
                }}
                onBlur={() => {
                  if (!scratchCardPayoutAmount.trim().length) {
                    setScratchCardPayoutAmount(DEFAULT_CLOSE_DAY_PAYOUT);
                  }
                }}
                placeholder="Scratch card payout"
                placeholderTextColor={appTheme.colors.textSubtle}
                keyboardType="decimal-pad"
              />
              <Text style={styles.fieldLabel}>Till Payout</Text>
              <TextInput
                style={styles.input}
                value={tillPayoutAmount}
                onChangeText={setTillPayoutAmount}
                onFocus={() => {
                  if (tillPayoutAmount.trim() === DEFAULT_CLOSE_DAY_PAYOUT) {
                    setTillPayoutAmount("");
                  }
                }}
                onBlur={() => {
                  if (!tillPayoutAmount.trim().length) {
                    setTillPayoutAmount(DEFAULT_CLOSE_DAY_PAYOUT);
                  }
                }}
                placeholder="Till payout"
                placeholderTextColor={appTheme.colors.textSubtle}
                keyboardType="decimal-pad"
              />
              <Text style={styles.fieldLabel}>Additional Close Notes</Text>
              <TextInput
                style={styles.input}
                value={notes}
                onChangeText={setNotes}
                placeholder="Additional notes (optional)"
                placeholderTextColor={appTheme.colors.textSubtle}
              />
              <Text style={styles.fieldLabel}>Attachments (Optional)</Text>
              {/* <Text style={styles.meta}>Up to 10 files. Images show a preview.</Text> */}
              {closeDayAttachments.length === 0 ? (
                <Text style={styles.meta}>No attachments selected.</Text>
              ) : (
                <Text style={styles.meta}>{closeDayAttachments.length} attachment(s) selected.</Text>
              )}
              {closeDayAttachments.length > 0 ? (
                <View style={styles.attachmentList}>
                  {closeDayAttachments.map((attachment) => {
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
                          <Text style={styles.attachmentFileName} numberOfLines={1}>
                            {attachment.fileName}
                          </Text>
                          <Text style={styles.meta}>
                            {(attachment.contentType ?? "application/octet-stream")}
                            {attachment.size ? ` | ${formatFileSize(attachment.size)}` : ""}
                          </Text>
                        </View>
                        <Pressable
                          style={styles.attachmentRemoveButton}
                          accessibilityRole="button"
                          accessibilityLabel={`Remove attachment ${attachment.fileName}`}
                          onPress={() =>
                            setCloseDayAttachments((previous) => previous.filter((item) => item.id !== attachment.id))
                          }
                          disabled={closeMutation.isPending}
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
                  accessibilityLabel={closeDayAttachments.length > 0 ? "Add more close day attachments" : "Add close day attachments"}
                  onPress={() => void selectCloseDayAttachments()}
                  disabled={closeMutation.isPending}
                >
                  <Text style={styles.attachmentActionButtonText}>
                    {closeDayAttachments.length > 0 ? "Add More Attachments" : "Add Attachments"}
                  </Text>
                </Pressable>
                {closeDayAttachments.length > 0 ? (
                  <Pressable
                    style={[styles.attachmentActionButton, styles.attachmentActionButtonDanger]}
                    accessibilityRole="button"
                    accessibilityLabel="Clear all close day attachments"
                    onPress={() => setCloseDayAttachments([])}
                    disabled={closeMutation.isPending}
                  >
                    <Text style={[styles.attachmentActionButtonText, styles.attachmentActionButtonTextDanger]}>Clear All</Text>
                  </Pressable>
                ) : null}
              </View>
              <View style={styles.modalActionRow}>
                <Pressable
                  style={[
                    styles.modalActionButton,
                    styles.modalActionButtonLeft,
                    styles.modalActionPrimary,
                    (closeMutation.isPending || !canClose) ? styles.modalActionDisabled : null,
                  ]}
                  onPress={() => {
                    normalizeAllPayoutInputs();
                    if (!validateCloseDayInputs()) {
                      return;
                    }
                    closeMutation.mutate();
                  }}
                  disabled={closeMutation.isPending || !canClose}
                >
                  <Text style={styles.modalActionPrimaryText}>{closeMutation.isPending ? "Closing..." : "Close Day"}</Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.modalActionButton,
                    styles.modalActionButtonRight,
                    styles.modalActionNeutral,
                    closeMutation.isPending ? styles.modalActionDisabled : null,
                  ]}
                  onPress={() => setIsCloseDayModalVisible(false)}
                  disabled={closeMutation.isPending}
                >
                  <Text style={styles.modalActionNeutralText}>Cancel</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

        <Modal
          visible={isReopenDayModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setIsReopenDayModalVisible(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <Text style={styles.sectionTitle}>Reopen Day</Text>
              <Text style={styles.meta}>Provide a reason and reopen this day.</Text>
              <Text style={styles.fieldLabel}>Reopen Reason</Text>
              <TextInput
                style={styles.input}
                value={reopenReason}
                onChangeText={setReopenReason}
                placeholder="Reason (optional)"
                placeholderTextColor={appTheme.colors.textSubtle}
              />
              <View style={styles.modalActionRow}>
                <Pressable
                  style={[
                    styles.modalActionButton,
                    styles.modalActionButtonLeft,
                    styles.modalActionPrimary,
                    (reopenMutation.isPending || !canReopen) ? styles.modalActionDisabled : null,
                  ]}
                  onPress={() => reopenMutation.mutate()}
                  disabled={reopenMutation.isPending || !canReopen}
                >
                  <Text style={styles.modalActionPrimaryText}>{reopenMutation.isPending ? "Reopening..." : "Reopen Day"}</Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.modalActionButton,
                    styles.modalActionButtonRight,
                    styles.modalActionNeutral,
                    reopenMutation.isPending ? styles.modalActionDisabled : null,
                  ]}
                  onPress={() => setIsReopenDayModalVisible(false)}
                  disabled={reopenMutation.isPending}
                >
                  <Text style={styles.modalActionNeutralText}>Cancel</Text>
                </Pressable>
              </View>
            </View>
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
  dayHeaderCard: {
    gap: appTheme.spacing.sm,
  },
  summaryHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: appTheme.spacing.sm,
  },
  summaryHeading: {
    gap: 2,
    flexShrink: 1,
  },
  summaryEyebrow: {
    color: appTheme.colors.textSubtle,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 15,
    letterSpacing: 0.2,
    textTransform: "uppercase",
  },
  summaryDate: {
    color: appTheme.colors.text,
    fontSize: 22,
    lineHeight: 28,
    fontFamily: appTheme.fonts.heading,
  },
  summaryMetaGrid: {
    flexDirection: "row",
    alignItems: "stretch",
    flexWrap: "wrap",
    gap: appTheme.spacing.xs,
  },
  summaryMetaItem: {
    flex: 1,
    minWidth: 112,
    backgroundColor: appTheme.colors.surfaceMuted,
    borderRadius: appTheme.radius.sm,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: appTheme.spacing.xs,
    gap: 2,
  },
  summaryMetaLabel: {
    color: appTheme.colors.textSubtle,
    fontSize: 11,
    lineHeight: 14,
    fontFamily: appTheme.fonts.bodyMedium,
  },
  summaryMetaValue: {
    color: appTheme.colors.text,
    fontSize: 18,
    lineHeight: 22,
    fontFamily: appTheme.fonts.heading,
  },
  summaryMetaValueDanger: {
    color: appTheme.colors.danger,
  },
  dateActionInlineButton: {
    borderWidth: 0,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.primary,
    minHeight: 48,
    paddingHorizontal: appTheme.spacing.sm,
    alignItems: "center",
    justifyContent: "center",
    flexGrow: 1,
  },
  dateActionButtonDisabled: {
    opacity: 0.55,
  },
  dateActionInlineButtonText: {
    color: appTheme.colors.onPrimary,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 16,
  },
  summaryDivider: {
    marginTop: 2,
    borderTopWidth: 0,
    borderTopColor: "transparent",
    paddingTop: appTheme.spacing.xs,
  },
  sectionCard: {
    gap: appTheme.spacing.sm,
  },
  sectionTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: appTheme.spacing.xs,
  },
  sectionTitleBlock: {
    flex: 1,
    gap: 2,
  },
  shiftHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: appTheme.spacing.xs,
  },
  shiftOpenButton: {
    borderWidth: 0,
    borderRadius: appTheme.radius.sm,
    backgroundColor: "#DDF5F1",
    minHeight: 38,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  shiftOpenButtonDisabled: {
    opacity: 0.55,
  },
  shiftOpenButtonText: {
    color: appTheme.colors.primary,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 16,
  },
  sectionTitle: {
    fontSize: 18,
    lineHeight: 23,
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
  },
  summaryVarianceText: {
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 15,
    backgroundColor: "#FFF1F3",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: appTheme.radius.pill,
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
    backgroundColor: "#F4F8FF",
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: appTheme.spacing.sm,
    gap: 4,
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
  kpiValueNegative: {
    color: appTheme.colors.danger,
  },
  iconButton: {
    width: 38,
    height: 38,
    borderWidth: 0,
    borderRadius: appTheme.radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E8F2FA",
  },
  iconButtonDisabled: {
    opacity: 0.5,
  },
  iconGlyph: {
    color: appTheme.colors.primary,
    fontSize: 18,
    lineHeight: 18,
    fontFamily: appTheme.fonts.bodyMedium,
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
  multilineInput: {
    minHeight: 84,
    textAlignVertical: "top",
  },
  meta: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, lineHeight: 19, fontSize: 13 },
  error: {
    color: appTheme.colors.danger,
    fontFamily: appTheme.fonts.bodyMedium,
    lineHeight: 18,
    fontSize: 12,
  },
  detailLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: appTheme.spacing.xs,
    backgroundColor: appTheme.colors.surface,
    borderRadius: appTheme.radius.sm,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: 8,
  },
  detailLabel: {
    minWidth: 84,
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 16,
  },
  detailValue: {
    flex: 1,
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 16,
    textAlign: "right",
  },
  reviewSnapshotCard: {
    borderWidth: 0,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: appTheme.spacing.xs,
    gap: 3,
  },
  reviewSnapshotTitle: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 16,
  },
  reviewSummaryCard: {
    borderWidth: 0,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: appTheme.spacing.xs,
    gap: 3,
    marginTop: appTheme.spacing.xs,
  },
  reviewSummaryTitle: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 16,
  },
  reviewHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: appTheme.spacing.xs,
  },
  shiftItem: {
    borderWidth: 0,
    borderRadius: appTheme.radius.sm,
    backgroundColor: "#EEF3FB",
    padding: appTheme.spacing.sm,
    gap: appTheme.spacing.xs,
  },
  shiftDetailsTapArea: {
    gap: 8,
  },
  shiftHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: appTheme.spacing.xs,
  },
  shiftName: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 15,
    lineHeight: 19,
    flexShrink: 1,
  },
  shiftDetailsHint: {
    color: appTheme.colors.textSubtle,
    fontFamily: appTheme.fonts.body,
    fontSize: 12,
    lineHeight: 15,
  },
  shiftActionRow: {
    marginTop: 2,
  },
  missingTicketList: {
    gap: appTheme.spacing.xs,
  },
  missingTicketItem: {
    borderWidth: 0,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: appTheme.spacing.xs,
    gap: 2,
  },
  missingTicketQty: {
    color: appTheme.colors.danger,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 17,
  },
  serialConfirmHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: appTheme.spacing.sm,
  },
  serialConfirmHint: {
    marginTop: -1,
  },
  serialProgressPill: {
    borderWidth: 0,
    borderColor: appTheme.colors.primary,
    borderRadius: appTheme.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: "#E9F7F6",
    minWidth: 44,
    alignItems: "center",
  },
  serialProgressText: {
    color: appTheme.colors.primary,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 11,
    lineHeight: 14,
  },
  serialConfirmRow: {
    borderWidth: 0,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surface,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: appTheme.spacing.xs,
    gap: 4,
  },
  serialPackTitle: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 17,
  },
  serialConfirmActionRow: {
    flexDirection: "row",
    marginTop: 2,
  },
  serialConfirmInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: appTheme.spacing.xs,
  },
  serialConfirmInput: {
    flex: 1,
  },
  serialConfirmButton: {
    borderWidth: 0,
    borderColor: appTheme.colors.primary,
    borderRadius: appTheme.radius.pill,
    backgroundColor: "#E9F7F6",
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: "flex-start",
  },
  serialConfirmButtonSelected: {
    backgroundColor: appTheme.colors.primary,
  },
  serialConfirmButtonDisabled: {
    opacity: 0.72,
  },
  serialConfirmButtonText: {
    color: appTheme.colors.primary,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 14,
  },
  serialConfirmButtonTextSelected: {
    color: "#F4FFFE",
  },
  dayPickerModalCard: {
    width: "100%",
    maxHeight: "92%",
    borderTopLeftRadius: appTheme.radius.lg,
    borderTopRightRadius: appTheme.radius.lg,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    paddingTop: appTheme.spacing.sm,
    paddingBottom: appTheme.spacing.lg,
  },
  dayPickerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 28, 0.45)",
    justifyContent: "flex-end",
  },
  dayPickerBodyScroll: {
    minHeight: 0,
  },
  dayPickerBodyContent: {
    gap: appTheme.spacing.sm,
    paddingBottom: appTheme.spacing.sm,
  },
  dayPickerHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: appTheme.spacing.sm,
  },
  dayPickerHeaderTextWrap: {
    flex: 1,
    gap: 2,
  },
  dayPickerEyebrow: {
    color: appTheme.colors.textSubtle,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  dayPickerTitle: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.heading,
    fontSize: 24,
    lineHeight: 29,
  },
  dayPickerCloseButton: {
    width: 34,
    height: 34,
    borderRadius: appTheme.radius.pill,
    backgroundColor: appTheme.colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  dayPickerCloseButtonText: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 21,
    lineHeight: 21,
    marginTop: -1,
  },
  dayPickerSubtitle: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.body,
    fontSize: 13,
    lineHeight: 18,
  },
  dayPickerCurrentDayCard: {
    borderWidth: 0,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    backgroundColor: "#F2F7FC",
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: appTheme.spacing.sm,
    gap: 6,
  },
  dayPickerCurrentDayHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: appTheme.spacing.xs,
  },
  dayPickerCurrentDayLabel: {
    color: appTheme.colors.textSubtle,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 11,
    lineHeight: 14,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  dayPickerCurrentDayValue: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.heading,
    fontSize: 19,
    lineHeight: 24,
  },
  dayPickerDateSection: {
    gap: 6,
  },
  dayPickerSectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: appTheme.spacing.xs,
  },
  dayPickerSectionLabel: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 16,
  },
  dayPickerDateField: {
    marginTop: 0,
  },
  dayPickerQuickDateRow: {
    flexDirection: "row",
    justifyContent: "flex-start",
  },
  dayPickerQuickActionButton: {
    borderWidth: 0,
    borderColor: appTheme.colors.borderStrong,
    borderRadius: appTheme.radius.pill,
    backgroundColor: appTheme.colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 7,
    alignSelf: "flex-start",
  },
  dayPickerQuickActionButtonText: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 14,
  },
  dayPickerSelectionCard: {
    borderWidth: 0,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: appTheme.spacing.sm,
    gap: appTheme.spacing.xs,
  },
  dayPickerSelectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: appTheme.spacing.xs,
  },
  dayPickerSelectionTitle: {
    flex: 1,
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 18,
  },
  dayPickerSelectionDate: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.heading,
    fontSize: 16,
    lineHeight: 20,
  },
  dayPickerSelectionMeta: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.body,
    fontSize: 12,
    lineHeight: 16,
  },
  dayPickerListSection: {
    gap: appTheme.spacing.xs,
    minHeight: 0,
  },
  dayPickerListHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: appTheme.spacing.xs,
  },
  dayPickerListMeta: {
    color: appTheme.colors.textSubtle,
    fontFamily: appTheme.fonts.body,
    fontSize: 12,
    lineHeight: 15,
  },
  dayPickerListHint: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.body,
    fontSize: 11,
    lineHeight: 14,
  },
  dayPickerList: {
    maxHeight: 220,
    minHeight: 88,
    borderWidth: 0,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surface,
  },
  dayPickerListContent: {
    gap: appTheme.spacing.xs,
    padding: appTheme.spacing.xs,
  },
  dayPickerItem: {
    borderWidth: 0,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: appTheme.spacing.xs,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: appTheme.spacing.sm,
  },
  dayPickerItemTargetDate: {
    borderColor: appTheme.colors.primary,
    backgroundColor: "#E9F6FA",
  },
  dayPickerItemCurrentDay: {
    opacity: 0.72,
  },
  dayPickerItemInfo: {
    flex: 1,
    gap: 2,
  },
  dayPickerItemMeta: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.body,
    fontSize: 11,
    lineHeight: 14,
  },
  dayPickerItemBadgeWrap: {
    alignSelf: "center",
  },
  dayPickerEmptyState: {
    borderRadius: appTheme.radius.sm,
    borderWidth: 0,
    borderColor: appTheme.colors.border,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: appTheme.spacing.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
  },
  dayPickerDate: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 18,
    flexShrink: 1,
  },
  dayPickerFooterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingTop: appTheme.spacing.xs,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 28, 0.45)",
    justifyContent: "center",
    paddingHorizontal: appTheme.spacing.md,
  },
  modalCard: {
    backgroundColor: appTheme.colors.background,
    borderRadius: appTheme.radius.lg,
    borderWidth: 0,
    borderColor: appTheme.colors.border,
    padding: appTheme.spacing.md,
    gap: appTheme.spacing.sm,
  },
  attachmentPreviewBackdrop: {
    flex: 1,
    backgroundColor: "#05090C",
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
    color: "#F5FAFF",
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 18,
  },
  attachmentPreviewHeaderActions: {
    flexDirection: "row",
    gap: 8,
  },
  attachmentPreviewHeaderButton: {
    borderWidth: 0,
    borderColor: "#35506A",
    borderRadius: appTheme.radius.sm,
    backgroundColor: "#102030",
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  attachmentPreviewHeaderButtonText: {
    color: "#EAF4FC",
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
    color: "#D2DCE6",
    fontFamily: appTheme.fonts.body,
    fontSize: 14,
    lineHeight: 18,
    textAlign: "center",
  },
  attachmentPreviewModalImage: {
    flex: 1,
    width: "100%",
    backgroundColor: "#05090C",
  },
  attachmentList: {
    gap: appTheme.spacing.xs,
  },
  attachmentItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: appTheme.spacing.xs,
    borderWidth: 0,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    paddingHorizontal: appTheme.spacing.xs,
    paddingVertical: appTheme.spacing.xs,
  },
  attachmentPreviewImage: {
    width: 44,
    height: 44,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surface,
  },
  attachmentFileIcon: {
    width: 44,
    height: 44,
    borderRadius: appTheme.radius.sm,
    backgroundColor: "#EEF3FB",
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
    backgroundColor: "#DDF5F1",
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
    borderWidth: 0,
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
  attachmentRemoveButton: {
    borderWidth: 0,
    borderColor: appTheme.colors.borderStrong,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surface,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  attachmentRemoveButtonText: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 11,
    lineHeight: 13,
  },
  attachmentViewButton: {
    borderWidth: 0,
    borderColor: appTheme.colors.primary,
    borderRadius: appTheme.radius.sm,
    backgroundColor: "#E8F5F2",
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
    borderWidth: 0,
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
  attachmentActionRow: {
    flexDirection: "row",
    gap: appTheme.spacing.xs,
  },
  attachmentActionButton: {
    flex: 1,
    minHeight: 38,
    borderRadius: appTheme.radius.sm,
    backgroundColor: "#F2F6FC",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: appTheme.spacing.sm,
  },
  attachmentActionButtonDanger: {
    backgroundColor: appTheme.colors.danger,
  },
  attachmentActionButtonText: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 15,
  },
  attachmentActionButtonTextDanger: {
    color: appTheme.colors.onPrimary,
  },
  modalActionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  modalActionButton: {
    flex: 1,
    borderRadius: appTheme.radius.md,
    borderWidth: 0,
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  modalActionButtonLeft: {
    marginRight: appTheme.spacing.xs,
  },
  modalActionButtonRight: {
    marginLeft: appTheme.spacing.xs,
  },
  modalActionPrimary: {
    backgroundColor: appTheme.colors.primary,
    borderColor: appTheme.colors.primaryPressed,
  },
  modalActionNeutral: {
    backgroundColor: appTheme.colors.surfaceMuted,
    borderColor: appTheme.colors.borderStrong,
  },
  modalActionPrimaryText: {
    color: appTheme.colors.onPrimary,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 18,
  },
  modalActionNeutralText: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 18,
  },
  modalActionDisabled: {
    opacity: 0.55,
  },
});


