import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Animated, Image, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import {
  approveCanisterDrop,
  closeBusinessDay,
  getBusinessDay,
  getBusinessDayCloseAttachmentContent,
  listCanisterDrops,
  listBusinessDays,
  openBusinessDay,
  reopenBusinessDay,
} from "../../api/businessDaysApi";
import { getConfigurations } from "../../api/configurationsApi";
import { getShopSubscriptionSummary } from "../../api/subscriptionApi";
import { getTemperatureDailyLog } from "../../api/temperatureLogsApi";
import { getComplianceCheckPeriodLog } from "../../api/complianceChecksApi";
import { listPacks } from "../../api/packsApi";
import { DateTimeField, formatDateValue, parseDateValue } from "../../components/DateTimeField";
import { FloatingLabelInput } from "../../components/FloatingLabelInput";
import { ModalBackdropBlur } from "../../components/ModalBackdropBlur";
import { SectionHeader } from "../../components/SectionHeader";
import { KpiGrid, KpiTile } from "../../components/KpiTile";
import { getShiftSales, listShifts, openShift, reopenShift, startScheduledShift } from "../../api/shiftsApi";
import { getTillDaySummary } from "../../api/tillReportsApi";
import { StatusBadge } from "../../components/StatusBadge";
import { ScreenContainer } from "../../components/ScreenContainer";
import { PrimaryButton } from "../../components/PrimaryButton";
import { deriveShopOperationalSetup } from "../settings/shopConfiguration";
import { formatGbpOrDash, formatSignedGbp } from "../../utils/currency";
import { PackStatus, ShiftStatus } from "../../types/enums";
import { MainStackParamList } from "../../types/navigation";
import { BusinessDay, ConfigurationItem, Shift } from "../../types/models";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";
import { useAuth } from "../../auth/AuthContext";
import { useFeature } from "../subscription/useFeature";
import { UpgradeNotice } from "../subscription/FeatureGate";
import { confirmDestructive } from "../../utils/confirm";
import { haptics } from "../../utils/haptics";

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
const SAFE_DROP_FEATURE_KEY = "SafeDropManagement";
const SAFE_DROP_CONFIG_KEY = "EnableSafeDropManagement";
const TEMPERATURE_LOG_FEATURE_KEY = "TemperatureLog";
const COMPLIANCE_CHECK_FEATURE_KEY = "ComplianceChecklist";

// Maps common axios/fetch errors into a single actionable message for the shopkeeper.
// `fallback` is shown when the server didn't return anything more specific.
function getApiErrorMessage(error: unknown, fallback: string): string {
  const e = error as any;
  const status = e?.response?.status as number | undefined;
  const serverMessage =
    typeof e?.response?.data?.message === "string" ? e.response.data.message :
    typeof e?.response?.data?.error === "string" ? e.response.data.error : undefined;

  if (e?.message === "Network Error" || e?.code === "ERR_NETWORK") {
    return "Couldn't reach the server. Check your connection and try again.";
  }
  if (status === 401 || status === 403) {
    return serverMessage ?? "You don't have permission for this action. Sign in again or ask your manager.";
  }
  if (status === 409) {
    return serverMessage ?? "Another user changed this record. Pull to refresh and retry.";
  }
  if (status === 422 || status === 400) {
    return serverMessage ?? "Please review the highlighted fields and try again.";
  }
  if (status && status >= 500) {
    return "Server problem. Wait a moment and try again — the data hasn't been saved.";
  }
  return serverMessage ?? e?.message ?? fallback;
}

// Allow only digits + optional single decimal with up to 2 places. Strips commas (en-GB users
// often type "12,50") and leading zeros that would otherwise display as "00250".
function sanitizeMoneyInput(raw: string): string {
  if (!raw) return "";
  let s = raw.replace(/,/g, ".").replace(/[^\d.]/g, "");
  const firstDot = s.indexOf(".");
  if (firstDot !== -1) {
    s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, "");
    s = s.slice(0, firstDot + 3); // keep at most 2 decimals
  }
  // Strip leading zeros, but preserve "0.xx" and a bare "0".
  if (s.length > 1 && s.startsWith("0") && !s.startsWith("0.")) {
    s = s.replace(/^0+/, "");
    if (s === "" || s.startsWith(".")) s = "0" + s;
  }
  return s;
}

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

function isActiveBusinessDayStatus(status?: string) {
  const normalized = (status ?? "").trim().toLowerCase();
  return normalized === "open" || normalized === "reopened" || normalized === "readytoclose";
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
  return formatGbpOrDash(value);
}

function getDateValueOffset(baseDateValue: string, dayOffset: number) {
  const parsed = parseDateValue(baseDateValue) ?? new Date();
  const shifted = new Date(parsed);
  shifted.setDate(shifted.getDate() + dayOffset);
  return formatDateValue(shifted);
}

function getConfigurationValue(items: ConfigurationItem[] | undefined, key: string, fallback: string) {
  const matched = items?.find((item) => item.configKey.toLowerCase() === key.toLowerCase());
  const value = matched?.configValue?.trim();
  return value && value.length > 0 ? value : fallback;
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

function normalizeRoleKey(value?: string | null) {
  return (value ?? "").replace(/[\s_-]+/g, "").trim().toLowerCase();
}

function normalizeLookupValue(value?: string | null) {
  return (value ?? "").trim().toLowerCase();
}

function parseTimeToMinutes(value: string, fallbackMinutes: number) {
  const trimmed = value.trim();
  const match = /^(\d{2}):(\d{2})$/.exec(trimmed);
  if (!match) {
    return fallbackMinutes;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) {
    return fallbackMinutes;
  }

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return fallbackMinutes;
  }

  return (hours * 60) + minutes;
}

function formatShiftDateTimeCompact(value: Date) {
  return value.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// Used when a shift's start and end land on different calendar days (e.g. opened before
// midnight, closed after). Showing the date alongside the time stops "21:30 – 02:15" from
// looking like a 19-hour gap on the same day.
function formatShiftDateTimeWithDay(value: Date) {
  const datePart = value.toLocaleDateString([], { month: "short", day: "numeric" });
  const timePart = value.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return `${datePart}, ${timePart}`;
}

function isSameCalendarDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// Renders a Date span as a compact duration like "4h 20m" or "45m". Used on closed shifts
// in the day-management screen so the shopkeeper can see how long the shift actually ran
// without doing the maths in their head.
function formatShiftDuration(start: Date, end: Date): string {
  const totalMinutes = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
  if (totalMinutes === 0) return "";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
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

function DayManagementLoadingState() {
  const pulse = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 820,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.45,
          duration: 820,
          useNativeDriver: true,
        }),
      ])
    );

    animation.start();
    return () => animation.stop();
  }, [pulse]);

  const placeholderStyle = { opacity: pulse };

  return (
    <View style={styles.loadingShell}>
      <View style={styles.dateNavigationRow}>
        <Pressable style={[styles.dateNavigationButton, styles.dateActionButtonDisabled]} disabled>
          <Text style={styles.dateNavigationButtonText}>Previous Day</Text>
        </Pressable>
        <Pressable style={[styles.dateActionInlineButton, styles.dateActionButtonDisabled]} disabled>
          <Text style={styles.dateActionInlineButtonText}>Change Date</Text>
        </Pressable>
        <Pressable style={[styles.dateNavigationButton, styles.dateActionButtonDisabled]} disabled>
          <Text style={styles.dateNavigationButtonText}>Next Day</Text>
        </Pressable>
      </View>

      <View style={[ui.card, styles.loadingCard]}>
        <View style={styles.loadingHeaderRow}>
          <Animated.View style={[styles.loadingDateText, placeholderStyle]} />
          <Animated.View style={[styles.loadingStatusBadge, placeholderStyle]} />
        </View>
        <View style={styles.loadingSummaryGrid}>
          <Animated.View style={[styles.loadingSummaryTile, placeholderStyle]} />
          <Animated.View style={[styles.loadingSummaryTile, placeholderStyle]} />
          <Animated.View style={[styles.loadingSummaryTile, placeholderStyle]} />
          <Animated.View style={[styles.loadingSummaryTile, placeholderStyle]} />
        </View>
      </View>

      <View style={[ui.card, styles.loadingCard]}>
        <View style={styles.loadingHeaderRow}>
          <Animated.View style={[styles.loadingSectionTitle, placeholderStyle]} />
          <Animated.View style={[styles.loadingActionButton, placeholderStyle]} />
        </View>
        <View style={styles.loadingDivider} />
        <View style={styles.loadingShiftList}>
          <View style={styles.loadingShiftItem}>
            <Animated.View style={[styles.loadingShiftTitle, placeholderStyle]} />
            <Animated.View style={[styles.loadingShiftLine, placeholderStyle]} />
            <Animated.View style={[styles.loadingShiftLineShort, placeholderStyle]} />
            <Animated.View style={[styles.loadingShiftAction, placeholderStyle]} />
          </View>
          <View style={styles.loadingShiftItem}>
            <Animated.View style={[styles.loadingShiftTitle, placeholderStyle]} />
            <Animated.View style={[styles.loadingShiftLine, placeholderStyle]} />
            <Animated.View style={[styles.loadingShiftLineShort, placeholderStyle]} />
          </View>
        </View>
      </View>

      <View style={[ui.card, styles.loadingCard]}>
        <Animated.View style={[styles.loadingSectionTitle, placeholderStyle]} />
        <View style={styles.loadingKpiGrid}>
          <Animated.View style={[styles.loadingKpiTile, placeholderStyle]} />
          <Animated.View style={[styles.loadingKpiTile, placeholderStyle]} />
          <Animated.View style={[styles.loadingKpiTile, placeholderStyle]} />
          <Animated.View style={[styles.loadingKpiTile, placeholderStyle]} />
        </View>
      </View>
    </View>
  );
}

function ShiftOperationsLoadingState() {
  const pulse = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 820,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.45,
          duration: 820,
          useNativeDriver: true,
        }),
      ])
    );

    animation.start();
    return () => animation.stop();
  }, [pulse]);

  const placeholderStyle = { opacity: pulse };

  return (
    <View style={styles.loadingShiftList}>
      <View style={styles.loadingShiftItem}>
        <Animated.View style={[styles.loadingShiftTitle, placeholderStyle]} />
        <Animated.View style={[styles.loadingShiftLine, placeholderStyle]} />
        <Animated.View style={[styles.loadingShiftLineShort, placeholderStyle]} />
        <Animated.View style={[styles.loadingShiftAction, placeholderStyle]} />
      </View>
      <View style={styles.loadingShiftItem}>
        <Animated.View style={[styles.loadingShiftTitle, placeholderStyle]} />
        <Animated.View style={[styles.loadingShiftLine, placeholderStyle]} />
        <Animated.View style={[styles.loadingShiftLineShort, placeholderStyle]} />
      </View>
    </View>
  );
}

export function DayEndCloseScreen({ route, navigation }: Props) {
  const { businessDayId } = route.params;
  const queryClient = useQueryClient();
  const { profile, activeShop } = useAuth();
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
  // Opt-in: when set, success handler will open the next business day and navigate to it.
  // Default off so a misdial does not roll the user onto an unexpected day.
  const [shouldAutoOpenNextDay, setShouldAutoOpenNextDay] = useState(false);
  // scratch_card.attachments is Growth+. Starter shops see a compact upgrade notice in place
  // of the attachment uploader so they can still complete the close.
  const attachmentsFeature = useFeature("scratch_card.attachments");
  // Per-field validation error for the close-day payouts. Renders inline beneath the failing
  // input and focus jumps via the matching ref.
  const [payoutFieldError, setPayoutFieldError] = useState<{ key: "lotto" | "scratch" | "till"; message: string } | null>(null);
  const lottoInputRef = useRef<TextInput | null>(null);
  const scratchInputRef = useRef<TextInput | null>(null);
  const tillInputRef = useRef<TextInput | null>(null);
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

  const tillDaySummaryQuery = useQuery({
    queryKey: ["till-day-summary", dayQuery.data?.shopId, businessDayId],
    queryFn: () => getTillDaySummary(dayQuery.data?.shopId as string, businessDayId),
    enabled: Boolean(dayQuery.data?.shopId) && Boolean(businessDayId),
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
    onSuccess: async (closedDay) => {
      haptics.success();
      setIsCloseDayModalVisible(false);
      setLottoPayoutAmount(DEFAULT_CLOSE_DAY_PAYOUT);
      setScratchCardPayoutAmount(DEFAULT_CLOSE_DAY_PAYOUT);
      setTillPayoutAmount(DEFAULT_CLOSE_DAY_PAYOUT);
      setNotes("");
      setCloseDayAttachments([]);

      const shopId = closedDay?.shopId ?? day?.shopId;
      // Only roll forward when the shopkeeper opted in via the close-day modal. Otherwise we
      // leave them on the closed day so they can review the saved totals.
      if (!shouldAutoOpenNextDay || !shopId || !closedDay?.businessDate) {
        Alert.alert("Closed", "Business day closed successfully.");
        void dayQuery.refetch();
        setShouldAutoOpenNextDay(false);
        return;
      }

      const nextDate = getDateValueOffset(closedDay.businessDate, 1);
      try {
        const openedDay = await openBusinessDay({ shopId, businessDate: nextDate });
        Alert.alert("Closed", `Business day closed. Opened ${openedDay.businessDate}.`);
        // Use navigate (not replace) so back gesture returns to the just-closed day.
        navigation.navigate("DayEndClose", { businessDayId: openedDay.id });
        setShouldAutoOpenNextDay(false);
        return;
      } catch {
        try {
          const nearbyDays = await listBusinessDays(shopId, {
            from: nextDate,
            to: getDateValueOffset(nextDate, 14),
          });
          const fallbackDay =
            nearbyDays.find((item) => isActiveBusinessDayStatus(item.status)) ??
            nearbyDays.find((item) => item.businessDate === nextDate);

          if (fallbackDay) {
            Alert.alert("Closed", `Business day closed. Opened ${fallbackDay.businessDate}.`);
            navigation.navigate("DayEndClose", { businessDayId: fallbackDay.id });
            setShouldAutoOpenNextDay(false);
            return;
          }
        } catch {
          // Keep close success and fall through if next-day lookup fails.
        }
      }

      Alert.alert("Closed", "Business day closed successfully.");
      void dayQuery.refetch();
      setShouldAutoOpenNextDay(false);
    },
    onError: (error: unknown) => {
      Alert.alert("Couldn't close the day", getApiErrorMessage(error, "Unable to close business day."));
    },
  });

  const reopenMutation = useMutation({
    // Server requires a non-empty reason; we also enforce trimmed length on the client at
    // the button's disabled state so the audit log isn't muddied with empty reasons.
    mutationFn: async () => reopenBusinessDay(businessDayId, { reason: reopenReason.trim() }),
    onSuccess: () => {
      haptics.success();
      setIsReopenDayModalVisible(false);
      setReopenReason("");
      Alert.alert("Reopened", "Business day reopened successfully.");
      void dayQuery.refetch();
    },
    onError: (error: unknown) => {
      haptics.error();
      Alert.alert("Couldn't reopen the day", getApiErrorMessage(error, "Unable to reopen business day."));
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
    onError: (error: unknown) => {
      Alert.alert("Couldn't open shift", getApiErrorMessage(error, "Unable to open shift."));
    },
  });
  const reopenShiftMutation = useMutation({
    mutationFn: async ({ shiftId }: { shiftId: string }) => reopenShift(shiftId, { reason: "Reopened from day management." }),
    onSuccess: async () => {
      Alert.alert("Reopened", "Shift reopened successfully.");
      await shiftsQuery.refetch();
    },
    onError: (error: unknown) => {
      Alert.alert("Couldn't reopen shift", getApiErrorMessage(error, "Unable to reopen shift."));
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
    onError: (error: unknown) => {
      Alert.alert("Couldn't start shift", getApiErrorMessage(error, "Unable to start scheduled shift."));
    },
  });
  const day = dayQuery.data;
  const status = day?.status;
  const dayShopMembership = profile?.shops.find((shop) => shop.shopId === day?.shopId);
  const subscriptionShopId = day?.shopId ?? activeShop?.shopId ?? null;
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
  const subscriptionSummaryQuery = useQuery({
    queryKey: ["shop-subscription-summary", subscriptionShopId],
    queryFn: () => getShopSubscriptionSummary(subscriptionShopId as string),
    enabled: Boolean(subscriptionShopId),
    staleTime: 5 * 60 * 1000,
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
  const subscriptionIncludedFeatures = subscriptionSummaryQuery.data?.includedFeatures ?? [];
  const hasSafeDropSubscriptionFeature = subscriptionIncludedFeatures.some(
    (feature) => feature.toLowerCase() === SAFE_DROP_FEATURE_KEY.toLowerCase(),
  );
  const safeDropConfigEnabled = parseConfigurationBool(
    getConfigurationValue(configurationQuery.data, SAFE_DROP_CONFIG_KEY, "false"),
    false,
  );
  const isSafeDropManagementVisible = hasSafeDropSubscriptionFeature && safeDropConfigEnabled;
  const canisterDropsQuery = useQuery({
    queryKey: ["safe-drops", businessDayId],
    queryFn: () => listCanisterDrops(businessDayId),
    enabled: isSafeDropManagementVisible,
  });

  // Temperature Log summary on the Day Management screen — same plan-gate pattern as Safe
  // Drop. Daily log query is scoped to this day's business date so the counts on the card match
  // what the user sees on the Temperature Logs screen for the same day.
  const hasTemperatureLogFeature = subscriptionIncludedFeatures.some(
    (feature) => feature.toLowerCase() === TEMPERATURE_LOG_FEATURE_KEY.toLowerCase(),
  );
  const temperatureLogQuery = useQuery({
    queryKey: ["temperature-daily-log", day?.shopId, day?.businessDate],
    queryFn: () => getTemperatureDailyLog(day?.shopId as string, day?.businessDate as string),
    enabled: hasTemperatureLogFeature && Boolean(day?.shopId) && Boolean(day?.businessDate),
    staleTime: 60 * 1000,
  });
  const temperatureSummary = useMemo(() => {
    const units = temperatureLogQuery.data?.units ?? [];
    let recorded = 0;
    let outOfRange = 0;
    for (const unitLog of units) {
      const latest = unitLog.readings.length > 0
        ? unitLog.readings[unitLog.readings.length - 1]
        : undefined;
      if (latest) {
        recorded += 1;
        if (latest.isOutOfRange) outOfRange += 1;
      }
    }
    return {
      total: units.length,
      recorded,
      pending: Math.max(units.length - recorded, 0),
      outOfRange,
    };
  }, [temperatureLogQuery.data?.units]);

  // Compliance Check summary on the Day Management screen — same plan-gate + business-date
  // pattern as Temperature Log. We fetch the Daily-frequency period log because the Day
  // Management card is scoped to one business day. Weekly/Monthly counters live inside the
  // Compliance Checks screen itself.
  const hasComplianceCheckFeature = subscriptionIncludedFeatures.some(
    (feature) => feature.toLowerCase() === COMPLIANCE_CHECK_FEATURE_KEY.toLowerCase(),
  );
  const hasStoreSalesFeature = subscriptionIncludedFeatures.some(
    (feature) => feature.toLowerCase() === "storesales",
  );
  const complianceLogQuery = useQuery({
    queryKey: ["compliance-period-log", day?.shopId, "Daily", day?.businessDate],
    queryFn: () => getComplianceCheckPeriodLog(day?.shopId as string, "Daily", day?.businessDate as string),
    enabled: hasComplianceCheckFeature && Boolean(day?.shopId) && Boolean(day?.businessDate),
    staleTime: 60 * 1000,
  });
  const complianceSummary = useMemo(() => {
    const data = complianceLogQuery.data;
    const total = data?.totalCount ?? 0;
    const completed = data?.completedCount ?? 0;
    const nonCompliant = data?.nonCompliantCount ?? 0;
    return {
      total,
      completed,
      pending: Math.max(total - completed, 0),
      nonCompliant,
    };
  }, [complianceLogQuery.data]);

  const businessDayTiming = useMemo(() => {
    const startRaw = getConfigurationValue(
      configurationQuery.data,
      "BusinessStartTime",
      shopOperationalSetup.shiftStartTime,
    );
    const endRaw = getConfigurationValue(
      configurationQuery.data,
      "BusinessEndTime",
      shopOperationalSetup.shiftEndTime,
    );

    const defaultStartMinutes = parseTimeToMinutes(shopOperationalSetup.shiftStartTime, 6 * 60);
    const defaultEndMinutes = parseTimeToMinutes(shopOperationalSetup.shiftEndTime, (21 * 60) + 59);
    const startMinutes = parseTimeToMinutes(startRaw, defaultStartMinutes);
    const endMinutes = parseTimeToMinutes(endRaw, defaultEndMinutes);

    return {
      startMinutes,
      endMinutes,
      isOvernight: startMinutes > endMinutes,
    };
  }, [configurationQuery.data, shopOperationalSetup.shiftStartTime, shopOperationalSetup.shiftEndTime]);
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
    haptics.success();
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

  function renderOpeningSerialConfirmationCard(confirmationHint: string, expanded = false) {
    const totalPacks = activePacksForOpening.length;
    const confirmedPackCount = activePacksForOpening.reduce((count, pack) => {
      const enteredSerial = getOpeningSerialForPack(pack.id, pack.currentSerialNumber);
      return confirmedOpeningSerialByPackId[pack.id] && enteredSerial.length > 0 ? count + 1 : count;
    }, 0);

    return (
      <View style={[styles.reviewSnapshotCard, expanded ? styles.reviewSnapshotCardExpanded : null]}>
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
              <View style={styles.serialConfirmAllInner}>
                {!hasUnconfirmedOpeningSerials ? (
                  <Ionicons name="checkmark" size={14} color={appTheme.colors.onPrimary} />
                ) : null}
                <Text style={[styles.serialConfirmButtonText, !hasUnconfirmedOpeningSerials ? styles.serialConfirmButtonTextSelected : null]}>
                  {hasUnconfirmedOpeningSerials ? "Confirm All" : "All Confirmed"}
                </Text>
              </View>
            </Pressable>
          </View>
        ) : null}
        </View>
        <Text style={[styles.meta, styles.serialConfirmHint]}>{confirmationHint}</Text>
       

        {packsQuery.isFetching ? <Text style={styles.meta}>Loading active packs...</Text> : null}
        {!packsQuery.isFetching && activePacksForOpening.length === 0 ? (
          <Text style={styles.meta}>No active packs found for this shop.</Text>
        ) : null}
        <ScrollView
          style={[styles.serialConfirmList, expanded ? styles.serialConfirmListExpanded : null]}
          contentContainerStyle={styles.serialConfirmListContent}
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator
        >
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
                    keyboardType="number-pad"
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
        </ScrollView>
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
          queryClient.invalidateQueries({ queryKey: ["till-day-summary", shopId, businessDayId] }),
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
            ? queryClient.refetchQueries({ queryKey: ["till-day-summary", shopId, businessDayId], exact: true })
            : Promise.resolve(),
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

  const shiftDisplayWindowById = useMemo(() => {
    const result: Record<string, { start: Date; end?: Date }> = {};
    const businessDateValue = day?.businessDate ?? "";
    const nextBusinessDateValue = businessDateValue
      ? getDateValueOffset(businessDateValue, 1)
      : "";
    const overnightWindowEndMinutes = businessDayTiming.endMinutes;

    for (const shift of shiftsQuery.data ?? []) {
      let displayStart = new Date(shift.startTime);
      let displayEnd = shift.endTime ? new Date(shift.endTime) : undefined;

      if (
        businessDayTiming.isOvernight &&
        shift.status === ShiftStatus.Scheduled &&
        shift.isAutoCreated &&
        businessDateValue &&
        displayEnd
      ) {
        const startDateValue = formatDateValue(displayStart);
        const endDateValue = formatDateValue(displayEnd);
        const startMinutes = (displayStart.getHours() * 60) + displayStart.getMinutes();
        const endMinutes = (displayEnd.getHours() * 60) + displayEnd.getMinutes();

        const isLegacyOvernightPlacement =
          startDateValue === businessDateValue &&
          endDateValue === nextBusinessDateValue &&
          startMinutes > overnightWindowEndMinutes &&
          endMinutes <= overnightWindowEndMinutes;

        if (isLegacyOvernightPlacement) {
          displayStart = new Date(displayStart.getTime() - (24 * 60 * 60 * 1000));
          displayEnd = new Date(displayEnd.getTime() - (24 * 60 * 60 * 1000));
        }
      }

      result[shift.id] = { start: displayStart, end: displayEnd };
    }

    return result;
  }, [businessDayTiming.endMinutes, businessDayTiming.isOvernight, day?.businessDate, shiftsQuery.data]);

  const shifts = useMemo(
    () =>
      [...(shiftsQuery.data ?? [])].sort((a, b) => {
        const aStart = shiftDisplayWindowById[a.id]?.start ?? new Date(a.startTime);
        const bStart = shiftDisplayWindowById[b.id]?.start ?? new Date(b.startTime);
        return aStart.getTime() - bStart.getTime();
      }),
    [shiftDisplayWindowById, shiftsQuery.data],
  );
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
        return {} as Record<string, { amount: number; soldQuantity: number }>;
      }

      const entries = await Promise.all(
        shifts.map(async (shift) => {
          try {
            const sales = await getShiftSales(shift.id);
            const totals = sales.reduce(
              (acc, entry) => ({
                amount: acc.amount + Number(entry.salesAmount ?? 0),
                soldQuantity: acc.soldQuantity + Number(entry.soldQuantity ?? 0),
              }),
              { amount: 0, soldQuantity: 0 },
            );
            return [shift.id, totals] as const;
          } catch {
            return [shift.id, { amount: 0, soldQuantity: 0 }] as const;
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
  // Aggregate scratch-card sales across every shift on this business day for the new Scratch
  // Card Summary section. Pulled from the shift-level totals query so the numbers always
  // match the per-shift cards in the list above.
  const scratchCardShiftBreakdown = useMemo(() => {
    return shifts.map((shift) => {
      const totals = shiftSalesTotalsQuery.data?.[shift.id];
      return {
        shiftId: shift.id,
        shiftName: shift.shiftName,
        soldQuantity: totals?.soldQuantity ?? 0,
        amount: totals?.amount ?? 0,
      };
    });
  }, [shifts, shiftSalesTotalsQuery.data]);
  const scratchCardDayTotals = useMemo(() => {
    return scratchCardShiftBreakdown.reduce(
      (acc, row) => ({
        soldQuantity: acc.soldQuantity + row.soldQuantity,
        amount: acc.amount + row.amount,
      }),
      { soldQuantity: 0, amount: 0 },
    );
  }, [scratchCardShiftBreakdown]);
  const tillPayoutVariance =
    tillPayout != null && lotteryMachinePayout != null && scratchCardPayout != null
      ? tillPayout - (lotteryMachinePayout + scratchCardPayout)
      : undefined;
  const hasTillPayoutVariance = tillPayoutVariance != null && Math.abs(tillPayoutVariance) >= 0.01;
  const tillPayoutVarianceText =
    tillPayoutVariance != null
      ? formatSignedGbp(tillPayoutVariance)
      : "";
  const tillPayoutVarianceStyle =
    hasTillPayoutVariance
      ? [styles.kpiValue, styles.kpiValueNegative]
      : styles.kpiValue;
  const canViewAllSafeDrops = useMemo(() => {
    const normalizedRoles = new Set((profile?.roles ?? []).map((role) => normalizeRoleKey(role)));
    normalizedRoles.add(normalizeRoleKey(dayShopMembership?.role));
    return normalizedRoles.has("companyowner") || normalizedRoles.has("manager") || normalizedRoles.has("shopmanager");
  }, [dayShopMembership?.role, profile?.roles]);
  const safeDropUserAliases = useMemo(() => {
    const aliases = new Set<string>();
    const displayName = profile?.displayName?.trim();
    if (displayName) {
      aliases.add(displayName.toLowerCase());
    }
    const fullName = `${profile?.firstName ?? ""} ${profile?.lastName ?? ""}`.trim();
    if (fullName) {
      aliases.add(fullName.toLowerCase());
    }
    const email = profile?.email?.trim();
    if (email) {
      aliases.add(email.toLowerCase());
    }
    return aliases;
  }, [profile?.displayName, profile?.email, profile?.firstName, profile?.lastName]);
  const visibleCanisterDrops = useMemo(() => {
    const drops = canisterDropsQuery.data ?? [];
    if (canViewAllSafeDrops) {
      return drops;
    }

    const currentUserId = normalizeLookupValue(profile?.userId);
    return drops.filter((drop) => {
      const droppedByUserId = normalizeLookupValue(drop.droppedByUserId);
      if (currentUserId && droppedByUserId) {
        return droppedByUserId === currentUserId;
      }

      const droppedByName = normalizeLookupValue(drop.droppedByName);
      return droppedByName.length > 0 && safeDropUserAliases.has(droppedByName);
    });
  }, [canViewAllSafeDrops, canisterDropsQuery.data, profile?.userId, safeDropUserAliases]);

  const pendingDropCount = useMemo(
    () => visibleCanisterDrops.filter((d) => d.approvalStatus === "Pending").length,
    [visibleCanisterDrops],
  );
  // Cash committed to the safe so far today. Rejected drops are excluded — they represent
  // reversed/abandoned drops, so they don't belong in a "money dropped" total.
  const safeDropTotal = useMemo(
    () => visibleCanisterDrops
      .filter((d) => d.approvalStatus !== "Rejected")
      .reduce((sum, d) => sum + Number(d.amount ?? 0), 0),
    [visibleCanisterDrops],
  );

  const approveDropMutation = useMutation({
    mutationFn: async (canisterDropId: string) => approveCanisterDrop(canisterDropId),
    onSuccess: async () => {
      await canisterDropsQuery.refetch();
    },
    onError: (error: unknown) => {
      Alert.alert("Couldn't approve drop", getApiErrorMessage(error, "Unable to approve safe drop."));
    },
  });
  const closableStatuses = new Set<ShiftStatus>([ShiftStatus.Open, ShiftStatus.Reopened]);
  const hasOpenShifts = shifts.some((shift) => closableStatuses.has(shift.status));
  const openShiftCount = shifts.filter((shift) => closableStatuses.has(shift.status)).length;

  // On first load of the day-management detail, if a shift is already open jump straight into
  // it so staff land on the live shift. Pushed (not replaced) so Back returns to this screen.
  // The ref keeps it from re-firing when the user navigates back here.
  const hasAutoOpenedShiftRef = useRef(false);
  useEffect(() => {
    if (hasAutoOpenedShiftRef.current || shiftsQuery.isLoading) {
      return;
    }
    const openShift = shifts.find(
      (shift) => shift.status === ShiftStatus.Open || shift.status === ShiftStatus.Reopened,
    );
    if (openShift) {
      hasAutoOpenedShiftRef.current = true;
      navigation.navigate("ShiftDetails", { shiftId: openShift.id, shopId: openShift.shopId });
    }
  }, [shifts, shiftsQuery.isLoading, navigation]);
  const safeDropSectionMessage = canViewAllSafeDrops
    ? "Showing all safe drops for this business day."
    : "Showing only safe drops recorded by you.";
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
    onError: (error: unknown) => {
      Alert.alert("Couldn't open day", getApiErrorMessage(error, "Unable to open business day."));
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
    onError: (error: unknown) => {
      Alert.alert("Preview unavailable", getApiErrorMessage(error, "Unable to load attachment."));
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
    onError: (error: unknown) => {
      Alert.alert("Download failed", getApiErrorMessage(error, "Unable to download attachment."));
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

  const dayNavigationFromDate = useMemo(
    () => getDateValueOffset(day?.businessDate ?? formatDateValue(new Date()), -30),
    [day?.businessDate],
  );
  const dayNavigationToDate = useMemo(
    () => getDateValueOffset(day?.businessDate ?? formatDateValue(new Date()), 30),
    [day?.businessDate],
  );
  const dayNavigationQuery = useQuery({
    queryKey: ["business-days-nav", day?.shopId, dayNavigationFromDate, dayNavigationToDate],
    queryFn: () => listBusinessDays(day?.shopId as string, { from: dayNavigationFromDate, to: dayNavigationToDate }),
    enabled: Boolean(day?.shopId),
    staleTime: 5 * 60 * 1000,
  });
  const orderedDayNavigationItems = useMemo(
    () => [...(dayNavigationQuery.data ?? [])].sort((a, b) => a.businessDate.localeCompare(b.businessDate)),
    [dayNavigationQuery.data],
  );
  const currentDayNavigationIndex = useMemo(
    () => orderedDayNavigationItems.findIndex((item) => item.id === businessDayId),
    [businessDayId, orderedDayNavigationItems],
  );
  const previousBusinessDay = currentDayNavigationIndex > 0
    ? orderedDayNavigationItems[currentDayNavigationIndex - 1]
    : undefined;
  const nextBusinessDay = currentDayNavigationIndex >= 0 && currentDayNavigationIndex < orderedDayNavigationItems.length - 1
    ? orderedDayNavigationItems[currentDayNavigationIndex + 1]
    : undefined;

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

  // Shared sink for both library-picked and camera-captured assets. Filters oversized files,
  // builds CloseAttachmentState entries, and appends to closeDayAttachments while honouring
  // MAX_CLOSE_ATTACHMENTS.
  const ingestCloseDayAssets = (assets: ImagePicker.ImagePickerAsset[]) => {
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
      Alert.alert("Attachment failed", "Unable to read the selected file(s).");
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

  const selectCloseDayAttachments = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission required", "Photo access is required to add an attachment from your library.");
      return;
    }

    const remainingSlots = Math.max(0, MAX_CLOSE_ATTACHMENTS - closeDayAttachments.length);
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

    if (result.canceled || result.assets.length === 0) {
      return;
    }

    ingestCloseDayAssets(result.assets);
  };

  const captureCloseDayAttachment = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission required", "Camera access is required to take a photo for this close.");
      return;
    }

    if (closeDayAttachments.length >= MAX_CLOSE_ATTACHMENTS) {
      Alert.alert("Attachment limit", "A maximum of 10 attachments can be added.");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: "images",
      quality: 0.85,
      allowsEditing: false,
      base64: true,
    });

    if (result.canceled || result.assets.length === 0) {
      return;
    }

    ingestCloseDayAssets(result.assets);
  };

  const validateCloseDayInputs = () => {
    // Per-field validation. Sets payoutFieldError for the first failing field so an inline
    // hint appears beneath the input and (where possible) focus jumps there.
    const fields: Array<{ key: "lotto" | "scratch" | "till"; label: string; raw: string; ref: React.RefObject<TextInput | null> }> = [
      { key: "lotto", label: "Lotto payout", raw: lottoPayoutAmount, ref: lottoInputRef },
      { key: "scratch", label: "Scratch card payout", raw: scratchCardPayoutAmount, ref: scratchInputRef },
      { key: "till", label: "Till payout", raw: tillPayoutAmount, ref: tillInputRef },
    ];

    for (const field of fields) {
      const normalized = normalizePayoutInput(field.raw);
      const value = Number(normalized);
      if (!Number.isFinite(value)) {
        setPayoutFieldError({ key: field.key, message: `${field.label} must be a valid number (digits and one decimal point only).` });
        field.ref.current?.focus();
        return false;
      }
      if (value < 0) {
        setPayoutFieldError({ key: field.key, message: `${field.label} can't be negative.` });
        field.ref.current?.focus();
        return false;
      }
    }

    setPayoutFieldError(null);
    return true;
  };

  const isDayManagementInitialLoading =
    (dayQuery.isLoading && !dayQuery.data) ||
    (Boolean(day?.shopId) && shiftsQuery.isLoading && !shiftsQuery.data);

  const onRefresh = useCallback(async () => {
    await Promise.all([
      dayQuery.refetch(),
      shiftsQuery.refetch(),
      tillDaySummaryQuery.refetch(),
      isSafeDropManagementVisible ? canisterDropsQuery.refetch() : Promise.resolve(),
      hasTemperatureLogFeature ? temperatureLogQuery.refetch() : Promise.resolve(),
      hasComplianceCheckFeature ? complianceLogQuery.refetch() : Promise.resolve(),
      subscriptionShopId ? subscriptionSummaryQuery.refetch() : Promise.resolve(),
    ]);
  }, [dayQuery, shiftsQuery, tillDaySummaryQuery, isSafeDropManagementVisible, canisterDropsQuery, hasTemperatureLogFeature, temperatureLogQuery, hasComplianceCheckFeature, complianceLogQuery, subscriptionShopId, subscriptionSummaryQuery]);
  const isRefreshing = dayQuery.isRefetching || shiftsQuery.isRefetching;

  if (isDayManagementInitialLoading) {
    return (
      <ScreenContainer>
        <DayManagementLoadingState />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={onRefresh}
          tintColor={appTheme.colors.primary}
        />
      }
    >
      <View style={styles.pageContent}>
        {subscriptionSummaryQuery.isError && Boolean(subscriptionShopId) ? (
          <View style={styles.warningBanner} accessibilityRole="alert">
            <Ionicons name="cloud-offline-outline" size={18} color={appTheme.colors.danger} />
            <Text style={styles.warningBannerText}>
              Couldn't verify this shop's subscription. Pull down to refresh. Some sections (e.g. Safe Drop) may be hidden until this succeeds.
            </Text>
          </View>
        ) : null}

        <View style={[ui.card, styles.dayHeaderCard]}>
          <View style={styles.summaryHeaderRow}>
            <View style={styles.summaryHeading}>
              {/* <Text style={styles.summaryEyebrow}>Business Date</Text> */}
              <Text style={styles.summaryDate}>{day?.businessDate ?? "-"}</Text>
            </View>
            <StatusBadge label={status ?? "-"} tone={getStatusTone(status)} />
          </View>
           <View style={styles.dateNavigationRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={previousBusinessDay ? `Go to previous day ${previousBusinessDay.businessDate}` : "No previous day available"}
                style={[
                  styles.dateNavigationButton,
                  !previousBusinessDay ? styles.dateActionButtonDisabled : null,
                ]}
                onPress={() => {
                  if (!previousBusinessDay) {
                    return;
                  }
                  navigation.replace("DayEndClose", { businessDayId: previousBusinessDay.id });
                }}
                disabled={!previousBusinessDay}
              >
                <Text style={styles.dateNavigationButtonText}>Previous Day</Text>
              </Pressable>
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
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={nextBusinessDay ? `Go to next day ${nextBusinessDay.businessDate}` : "No next day available"}
                style={[
                  styles.dateNavigationButton,
                  !nextBusinessDay ? styles.dateActionButtonDisabled : null,
                ]}
                onPress={() => {
                  if (!nextBusinessDay) {
                    return;
                  }
                  navigation.replace("DayEndClose", { businessDayId: nextBusinessDay.id });
                }}
                disabled={!nextBusinessDay}
              >
                <Text style={styles.dateNavigationButtonText}>Next Day</Text>
              </Pressable>
            </View>
          {/* <Text style={styles.meta}>{dayStatusMessage}</Text> */}
          {/* <View style={styles.summaryMetaGrid}>
            <View style={styles.summaryMetaItem}>
              <Text style={styles.summaryMetaText}>Open Shifts - {openShiftCount}</Text>
            </View>
            <View style={styles.summaryMetaItem}>
              <Text style={styles.summaryMetaText}>Closed Shifts - {closedShiftCount}</Text>
            </View>
            <View style={styles.summaryMetaItem}>
              <Text style={styles.summaryMetaText}>Scheduled - {scheduledShiftCount}</Text>
            </View>
            <View style={styles.summaryMetaItem}>
              <Text
                style={[
                  styles.summaryMetaText,
                  missingOpeningTicketCount > 0 ? styles.summaryMetaTextDanger : null,
                ]}
              >
                Missing Tickets - {missingOpeningTicketCount}
              </Text>
            </View>
           
          </View> */}
        </View>

        <View style={[ui.card, styles.sectionCard]}>
          <SectionHeader
            title="Shifts"
            icon="time-outline"
            right={
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open new shift"
                style={({ pressed }) => [
                  styles.shiftOpenButton,
                  pressed ? styles.shiftOpenButtonPressed : null,
                  !canManageShifts ? styles.shiftOpenButtonDisabled : null,
                ]}
                onPress={() => {
                  if (!ensureNoExistingOpenShiftsBeforeSerialConfirmation()) {
                    return;
                  }
                  setNewShiftName(shopOperationalSetup.shiftDefaultName.trim() || getDefaultShiftNameForNow());
                  setIsOpenShiftModalVisible(true);
                }}
                disabled={!canManageShifts}
              >
                <Ionicons name="add" size={14} color={appTheme.colors.onPrimary} />
                <Text style={styles.shiftOpenButtonText}>Open Shift</Text>
              </Pressable>
            }
          />
          {/* <View style={styles.summaryDivider} /> */}
          {shiftsQuery.isFetching ? (
            <ShiftOperationsLoadingState />
          ) : shifts.length === 0 ? (
            <View style={styles.emptyStateCard}>
              <Ionicons name="time-outline" size={28} color={appTheme.colors.primary} />
              <Text style={styles.emptyStateTitle}>No shifts yet</Text>
              <Text style={styles.emptyStateBody}>
                Open the first shift of this business day to start recording sales.
              </Text>
              {canManageShifts ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Open first shift"
                  style={[styles.emptyStateCta, !canManageShifts ? styles.shiftOpenButtonDisabled : null]}
                  onPress={() => {
                    if (!ensureNoExistingOpenShiftsBeforeSerialConfirmation()) return;
                    setNewShiftName(shopOperationalSetup.shiftDefaultName.trim() || getDefaultShiftNameForNow());
                    setIsOpenShiftModalVisible(true);
                  }}
                >
                  <Text style={styles.emptyStateCtaText}>Open First Shift</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {!shiftsQuery.isFetching ? shifts.map((shift) => {
            const canCloseShift = closableStatuses.has(shift.status);
            const canStartScheduledShift = shift.status === ShiftStatus.Scheduled;
            const isClosedShift = closedSummaryStatuses.has(shift.status);
            const isOpenShift = shift.status === ShiftStatus.Open || shift.status === ShiftStatus.Reopened;
            const shiftSalesTotals = shiftSalesTotalsQuery.data?.[shift.id];
            const shiftSalesTotal = shiftSalesTotals?.amount;
            const salesIsLoading = isClosedShift && shiftSalesTotals == null;
            const displayWindow = shiftDisplayWindowById[shift.id];
            const displayStart = displayWindow?.start ?? new Date(shift.startTime);
            const displayEnd = displayWindow?.end;
            // When a shift crosses midnight, show the start's date alongside its time so the
            // span ("Apr 12, 21:30 – 02:15") is unambiguous instead of looking like a same-day
            // 19-hour gap.
            const crossesMidnight = !!displayEnd && !isSameCalendarDay(displayStart, displayEnd);
            const compactStart = crossesMidnight
              ? formatShiftDateTimeWithDay(displayStart)
              : formatShiftDateTimeCompact(displayStart);
            const compactEnd = displayEnd
              ? (crossesMidnight ? formatShiftDateTimeWithDay(displayEnd) : formatShiftDateTimeCompact(displayEnd))
              : "";
            // Duration shown for closed shifts so the user can see at-a-glance how long the
            // shift ran. Skipped for active shifts because "running for 4h 20m" updates over
            // time and we don't have a tick refresh hook in this tree.
            const durationLabel = isClosedShift && displayEnd
              ? formatShiftDuration(displayStart, displayEnd)
              : "";
            const compactSales = isClosedShift
              ? (shiftSalesTotal != null ? formatCurrency(shiftSalesTotal) : "")
              : "";
            // Build a single accessibility label so VoiceOver reads everything coherently.
            const a11yParts = [
              shift.shiftName,
              `status ${shift.status}`,
              `start ${compactStart}`,
              compactEnd ? `end ${compactEnd}` : null,
              compactSales ? `sales ${compactSales}` : null,
            ].filter(Boolean);
            const isScheduledShift = shift.status === ShiftStatus.Scheduled;
            const accentStyle = isOpenShift
              ? styles.shiftCardAccentOpen
              : isScheduledShift
                ? styles.shiftCardAccentScheduled
                : styles.shiftCardAccentClosed;
            return (
              <View
                key={shift.id}
                style={[
                  styles.shiftItem,
                  isOpenShift ? styles.shiftItemOpen : null,
                  isClosedShift ? styles.shiftItemClosed : null,
                  isScheduledShift ? styles.shiftItemScheduled : null,
                ]}
              >
                <View style={[styles.shiftCardAccent, accentStyle]} />
                <View style={styles.shiftCardContent}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={a11yParts.join(", ")}
                    accessibilityHint="Opens the shift details screen"
                    style={({ pressed }) => [
                      styles.shiftDetailsTapArea,
                      pressed ? styles.shiftDetailsTapAreaPressed : null,
                    ]}
                    android_ripple={{ color: appTheme.colors.borderBrandSoft, borderless: false }}
                    onPress={() => navigation.navigate("ShiftDetails", { shiftId: shift.id, shopId: shift.shopId })}
                  >
                    <View style={styles.shiftBody}>
                      <View style={styles.shiftHeader}>
                        <View style={styles.shiftNameBlock}>
                          {isOpenShift ? <View style={styles.shiftLiveDot} /> : null}
                          <Text style={styles.shiftName} numberOfLines={1}>{shift.shiftName}</Text>
                        </View>
                        {compactSales ? (
                          <Text style={styles.shiftSalesAmount}>{compactSales}</Text>
                        ) : salesIsLoading ? (
                          <View style={styles.shiftSalesSkeleton} accessibilityLabel="Loading sales total" />
                        ) : null}
                      </View>
                      <View style={styles.shiftMetaRow}>
                        <StatusBadge label={shift.status} tone={getShiftTone(shift.status)} />
                        <View style={styles.shiftTimeBlock}>
                          <Ionicons
                            name="time-outline"
                            size={12}
                            color={appTheme.colors.textSubtle}
                          />
                          <Text style={styles.shiftCompactMeta} numberOfLines={1}>
                            {compactStart}
                            {compactEnd ? ` – ${compactEnd}` : ""}
                            {durationLabel ? ` · ${durationLabel}` : ""}
                          </Text>
                        </View>
                      </View>
                    </View>
                    <Ionicons
                      name="chevron-forward"
                      size={20}
                      color={appTheme.colors.textSubtle}
                      style={styles.shiftChevron}
                    />
                  </Pressable>
                  {canCloseShift ? (
                    <View style={styles.shiftActionRow}>
                      <PrimaryButton
                        label="Close Shift"
                        tone="success"
                        size="sm"
                        icon="checkmark-circle-outline"
                        onPress={() => navigation.navigate("ShiftDetails", { shiftId: shift.id, shopId: shift.shopId })}
                        disabled={!canManageShifts}
                      />
                    </View>
                  ) : canStartScheduledShift ? (
                    <View style={styles.shiftActionRow}>
                      <PrimaryButton
                        label={startScheduledShiftMutation.isPending ? "Starting..." : "Start Shift"}
                        size="sm"
                        icon="play-circle-outline"
                        onPress={() => openStartScheduledShiftConfirmation(shift.id, shift.shiftName)}
                        disabled={!canManageShifts || startScheduledShiftMutation.isPending}
                      />
                    </View>
                  ) : null}
                </View>
              </View>
            );
          }) : null}
        </View>

                <Pressable
          onPress={() => {
            if (!day?.id || !day.shopId) return;
            navigation.navigate("ScratchCardSummary", {
              businessDayId: day.id,
              businessDate: day.businessDate,
              shopId: day.shopId,
            });
          }}
          accessibilityRole="button"
          accessibilityLabel="Open Scratch Card"
          style={({ pressed }) => [
            ui.card,
            styles.sectionCard,
            pressed ? styles.sectionCardPressed : null,
          ]}
        >
          <SectionHeader
            title="Scratch Card Summary"
            icon="albums-outline"
            right={<Ionicons name="chevron-forward" size={18} color={appTheme.colors.textSubtle} />}
          />
          {hasTillPayoutVariance ? (
            <View
              style={[
                styles.varianceHeroTile,
                (tillPayoutVariance ?? 0) < 0 ? styles.varianceHeroTileNegative : styles.varianceHeroTilePositive,
              ]}
              accessibilityRole="summary"
              accessibilityLabel={`Cash ${(tillPayoutVariance ?? 0) < 0 ? "short" : "over"} by ${tillPayoutVarianceText}`}
            >
              <Text style={styles.varianceHeroLabel}>
                {(tillPayoutVariance ?? 0) < 0 ? "CASH SHORT" : "CASH OVER"}
              </Text>
              <Text style={styles.varianceHeroValue}>{tillPayoutVarianceText}</Text>
              <Text style={styles.varianceHeroHint}>
                Till payout vs. lotto + scratch-card payouts.
              </Text>
            </View>
          ) : null}
          <KpiGrid columns={2}>
            <KpiTile label="Sold Qty" value={scratchCardDayTotals.soldQuantity} />
            <KpiTile label="Sales Amount" value={formatCurrency(scratchCardDayTotals.amount)} />
          </KpiGrid>
          {scratchCardShiftBreakdown.length > 0 ? (
            <View style={styles.shiftBreakdownList}>
              {scratchCardShiftBreakdown.map((row) => (
                <View key={row.shiftId} style={styles.shiftBreakdownRow}>
                  <Text style={styles.shiftBreakdownName} numberOfLines={1}>{row.shiftName}</Text>
                  <Text style={styles.shiftBreakdownMeta} numberOfLines={1}>
                    {row.soldQuantity} sold · {formatCurrency(row.amount)}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </Pressable>

        {day && hasStoreSalesFeature ? (
          <Pressable
            onPress={() => navigation.navigate("StoreSales", { reportType: "DayEnd", businessDayId })}
            accessibilityRole="button"
            accessibilityLabel="Add day-end till report"
            style={({ pressed }) => [ui.card, styles.sectionCard, pressed ? styles.sectionCardPressed : null]}
          >
            <SectionHeader
              title="Store Sales (Till Report)"
              icon="cash-outline"
              right={<Ionicons name="chevron-forward" size={18} color={appTheme.colors.textSubtle} />}
            />
            {tillDaySummaryQuery.data && tillDaySummaryQuery.data.reportCount > 0 ? (
              <KpiGrid columns={2}>
                <KpiTile label="Total Sales" value={formatGbpOrDash(tillDaySummaryQuery.data.totalSales)} tone="success" />
                <KpiTile label="Payouts" value={formatGbpOrDash(tillDaySummaryQuery.data.payouts)} />
                {tillDaySummaryQuery.data.tenders.slice(0, 4).map((t, i) => (
                  <KpiTile key={t.paymentTypeId ?? `${t.name}-${i}`} label={t.name} value={formatGbpOrDash(t.amount)} />
                ))}
              </KpiGrid>
            ) : (
              <Text style={styles.meta}>Scan the day-end till report to record income, expense and tender.</Text>
            )}
          </Pressable>
        ) : null}

        {isSafeDropManagementVisible ? (
          <Pressable
            onPress={() => {
              if (!day?.id || !day.shopId) return;
              navigation.navigate("SafeDrop", {
                businessDayId: day.id,
                businessDate: day.businessDate,
                shopId: day.shopId,
              });
            }}
            accessibilityRole="button"
            accessibilityLabel="Open safe drops detail and add new"
            style={({ pressed }) => [
              ui.card,
              styles.sectionCard,
              pressed ? styles.sectionCardPressed : null,
            ]}
          >

            
            <SectionHeader
              title="Safe Drops"
              icon="lock-closed-outline"
              right={
                <>
                  {/* <StatusBadge
                    label={pendingDropCount > 0 ? `${pendingDropCount} pending` : `${visibleCanisterDrops.length}`}
                    tone={pendingDropCount > 0 ? "warning" : visibleCanisterDrops.length > 0 ? "success" : "neutral"}
                  /> */}
                  <Ionicons name="chevron-forward" size={18} color={appTheme.colors.textSubtle} />
                </>
              }
            />
            {visibleCanisterDrops.length > 0 ? (
              <KpiGrid columns={2}>
                <KpiTile label="Drops" value={visibleCanisterDrops.length} />
                <KpiTile label="Total" value={formatCurrency(safeDropTotal)} />
              </KpiGrid>
            ) : null}
            {canisterDropsQuery.isFetching && visibleCanisterDrops.length === 0 ? (
              <Text style={styles.meta}>Loading safe drops...</Text>
            ) : visibleCanisterDrops.length === 0 ? (
              <Text style={styles.meta}>
                {canViewAllSafeDrops
                  ? "No safe drops recorded for this day."
                  : "No safe drops recorded by you for this day."}
              </Text>
            ) : null}
          </Pressable>
        ) : null}

        {hasTemperatureLogFeature ? (
          <Pressable
            onPress={() => navigation.navigate("TemperatureLogs", { date: day?.businessDate })}
            accessibilityRole="button"
            accessibilityLabel="Open Temperature Logs"
            style={({ pressed }) => [
              ui.card,
              styles.sectionCard,
              pressed ? styles.sectionCardPressed : null,
            ]}
          >
            <SectionHeader
              title="Temperature Log"
              icon="thermometer-outline"
              right={
                <>
                  {/* <StatusBadge
                    label={
                      temperatureSummary.outOfRange > 0
                        ? `${temperatureSummary.outOfRange} out of range`
                        : temperatureSummary.pending > 0
                          ? `${temperatureSummary.pending} pending`
                          : temperatureSummary.total > 0
                            ? "All checked"
                            : "No units"
                    }
                    tone={
                      temperatureSummary.outOfRange > 0
                        ? "danger"
                        : temperatureSummary.pending > 0
                          ? "warning"
                          : temperatureSummary.total > 0
                            ? "success"
                            : "neutral"
                    }
                  /> */}
                  <Ionicons name="chevron-forward" size={18} color={appTheme.colors.textSubtle} />
                </>
              }
            />
            {temperatureLogQuery.isLoading ? (
              <Text style={styles.meta}>Loading today's temperature checks...</Text>
            ) : temperatureSummary.total === 0 ? (
              <Text style={styles.meta}>
                No monitoring units configured. Tap to set them up in the Temperature Log.
              </Text>
            ) : (
              <KpiGrid columns={2}>
                {/* <KpiTile label="Units" value={temperatureSummary.total} /> */}
                <KpiTile
                  label="Recorded"
                  value={temperatureSummary.recorded}
                  tone={temperatureSummary.recorded === temperatureSummary.total ? "success" : "default"}
                />
                <KpiTile
                  label={temperatureSummary.outOfRange > 0 ? "Out of range" : "Pending"}
                  value={
                    temperatureSummary.outOfRange > 0
                      ? temperatureSummary.outOfRange
                      : temperatureSummary.pending
                  }
                  tone={
                    temperatureSummary.outOfRange > 0
                      ? "danger"
                      : temperatureSummary.pending > 0
                        ? "warning"
                        : "default"
                  }
                />
              </KpiGrid>
            )}
          </Pressable>
        ) : null}

        {hasComplianceCheckFeature ? (
          <Pressable
            onPress={() => navigation.navigate("ComplianceChecks", { date: day?.businessDate })}
            accessibilityRole="button"
            accessibilityLabel="Open Compliance Checks"
            style={({ pressed }) => [
              ui.card,
              styles.sectionCard,
              pressed ? styles.sectionCardPressed : null,
            ]}
          >
            <SectionHeader
              title="Compliance Check"
              icon="clipboard-outline"
              right={
                <>
                  {/* <StatusBadge
                    label={
                      complianceSummary.nonCompliant > 0
                        ? `${complianceSummary.nonCompliant} non-compliant`
                        : complianceSummary.pending > 0
                          ? `${complianceSummary.pending} pending`
                          : complianceSummary.total > 0
                            ? "All checked"
                            : "No items"
                    }
                    tone={
                      complianceSummary.nonCompliant > 0
                        ? "danger"
                        : complianceSummary.pending > 0
                          ? "warning"
                          : complianceSummary.total > 0
                            ? "success"
                            : "neutral"
                    }
                  /> */}
                  <Ionicons name="chevron-forward" size={18} color={appTheme.colors.textSubtle} />
                </>
              }
            />
            {complianceLogQuery.isLoading ? (
              <Text style={styles.meta}>Loading today's compliance checks...</Text>
            ) : complianceSummary.total === 0 ? (
              <Text style={styles.meta}>
                No daily checks configured. Tap to set them up in Compliance Setup.
              </Text>
            ) : (
              <KpiGrid columns={2}>
                <KpiTile
                  label="Completed"
                  value={complianceSummary.completed}
                  tone={complianceSummary.completed === complianceSummary.total ? "success" : "default"}
                />
                <KpiTile
                  label={complianceSummary.nonCompliant > 0 ? "Non-compliant" : "Pending"}
                  value={
                    complianceSummary.nonCompliant > 0
                      ? complianceSummary.nonCompliant
                      : complianceSummary.pending
                  }
                  tone={
                    complianceSummary.nonCompliant > 0
                      ? "danger"
                      : complianceSummary.pending > 0
                        ? "warning"
                        : "default"
                  }
                />
              </KpiGrid>
            )}
          </Pressable>
        ) : null}

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
            label={closeMutation.isPending ? "Closing..." : "Close Day"}
            onPress={() => setIsCloseDayModalVisible(true)}
            disabled={hasOpenShifts || closeMutation.isPending}
          />
        ) : null}
        {canReopen ? (
          <PrimaryButton
            label={reopenMutation.isPending ? "Reopening..." : "Reopen Day"}
            tone="neutral"
            onPress={() => setIsReopenDayModalVisible(true)}
            disabled={reopenMutation.isPending}
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
            <ModalBackdropBlur />
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
                  <Ionicons name="close" size={20} color={appTheme.colors.textMuted} />
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
                    <Text style={styles.dayPickerSectionLabel}>Select Business Date</Text>
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
                  {/* <View style={styles.dayPickerQuickDateRow}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Select currently managed business date"
                      style={styles.dayPickerQuickActionButton}
                      onPress={() => setTargetBusinessDate(day?.businessDate ?? formatDateValue(new Date()))}
                    >
                      <Text style={styles.dayPickerQuickActionButtonText}>Use Current Day</Text>
                    </Pressable>
                  </View> */}
                </View>

                <View style={styles.dayPickerSelectionCard}>
                  {/* <Text style={styles.dayPickerSectionLabel}>2. Review Selected Date</Text>
                  <Text style={styles.dayPickerSelectionDate}>{targetBusinessDate}</Text> */}
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
                      {/* <Text style={styles.dayPickerSelectionTitle}>No business day exists for this date.</Text> */}
                      {/* <Text style={styles.dayPickerSelectionMeta}>Create and open a new business day for {targetBusinessDate}.</Text> */}
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
                    <Text style={styles.dayPickerSectionLabel}>Nearby Business Days</Text>
                    <Text style={styles.dayPickerListMeta}>
                      {daysQuery.isFetching ? "Refreshing..." : `${availableDays.length} loaded`}
                    </Text>
                  </View>
                  {/* <Text style={styles.dayPickerListHint}>Tap a row to prefill the selected date above.</Text> */}
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
            <ModalBackdropBlur />
            <View style={[styles.modalCard, styles.shiftStartModalCard]}>
              <Text style={styles.sectionTitle}>Open New Shift</Text>

              <View style={styles.shiftStartModalBody}>
                {shopOperationalSetup.allowCustomShiftName ? (
                  <FloatingLabelInput
                    label="Shift name"
                    value={newShiftName}
                    onChangeText={setNewShiftName}
                  />
                ) : (
                  <View style={styles.reviewSnapshotCard}>
                    <Text style={styles.reviewSnapshotTitle}>Shift Name</Text>
                    <Text style={styles.meta}>{shopOperationalSetup.shiftDefaultName}</Text>
                  </View>
                )}
                {renderOpeningSerialConfirmationCard("Confirm each active pack before opening the shift.", true)}
              </View>
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
            <ModalBackdropBlur />
            <View style={[styles.modalCard, styles.shiftStartModalCard]}>
              <Text style={styles.sectionTitle}>Start - {pendingScheduledShiftStart?.shiftName}</Text>
              {/* <Text style={styles.meta}>
                {pendingScheduledShiftStart
                  ? `Shift: ${pendingScheduledShiftStart.shiftName}. Confirm each active pack before starting the shift.`
                  : "Confirm each active pack before starting the shift."}
              </Text> */}
              <View style={styles.shiftStartModalBody}>
                {renderOpeningSerialConfirmationCard("Update any serial that is not correct, then confirm it before start.", true)}
              </View>
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
            <ModalBackdropBlur />
            <ScrollView
              style={styles.closeDayModalScroll}
              contentContainerStyle={styles.closeDayModalScrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
            <View style={styles.modalCard}>
              <Text style={styles.sectionTitle}>Close Day</Text>
              <Text style={styles.meta}>Review the recap below, then close this business day.</Text>

              {/* Recap card — shows the figures the close will commit so the shopkeeper can
                  spot a fat-finger before triggering the irreversible action. */}
              <View style={styles.recapCard}>
                <View style={styles.recapHeaderRow}>
                  <Text style={styles.recapTitle}>Recap</Text>
                  <Text style={styles.recapDate}>{day?.businessDate ?? "-"}</Text>
                </View>
                <View style={styles.recapRow}>
                  <Text style={styles.recapLabel}>Closed shifts</Text>
                  <Text style={styles.recapValue}>{closedShiftCount}</Text>
                </View>
                <View style={styles.recapRow}>
                  <Text style={styles.recapLabel}>Total sales</Text>
                  <Text style={styles.recapValue}>{formatCurrency(summaryTotalSales)}</Text>
                </View>
                <View style={styles.recapRow}>
                  <Text style={styles.recapLabel}>Lotto payout</Text>
                  <Text style={styles.recapValue}>{formatCurrency(displayLottoPayout)}</Text>
                </View>
                <View style={styles.recapRow}>
                  <Text style={styles.recapLabel}>Scratch card payout</Text>
                  <Text style={styles.recapValue}>{formatCurrency(displayScratchCardPayout)}</Text>
                </View>
                <View style={styles.recapRow}>
                  <Text style={styles.recapLabel}>Till payout</Text>
                  <Text style={styles.recapValue}>{formatCurrency(displayTillPayout)}</Text>
                </View>
                {hasTillPayoutVariance ? (
                  <View style={[styles.recapVarianceRow, (tillPayoutVariance ?? 0) < 0 ? styles.recapVarianceRowNegative : styles.recapVarianceRowPositive]}>
                    <Text style={styles.recapVarianceLabel}>
                      {(tillPayoutVariance ?? 0) < 0 ? "Cash short" : "Cash over"}
                    </Text>
                    <Text style={styles.recapVarianceValue}>{tillPayoutVarianceText}</Text>
                  </View>
                ) : null}
              </View>

              <FloatingLabelInput
                ref={lottoInputRef}
                label="Lotto payout"
                prefix="£"
                value={lottoPayoutAmount}
                onChangeText={(t) => {
                  setLottoPayoutAmount(sanitizeMoneyInput(t));
                  if (payoutFieldError?.key === "lotto") setPayoutFieldError(null);
                }}
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
                keyboardType="decimal-pad"
                accessibilityLabel="Lotto payout amount in pounds"
                error={payoutFieldError?.key === "lotto" ? payoutFieldError.message : null}
              />
              <FloatingLabelInput
                ref={scratchInputRef}
                label="Scratch card payout"
                prefix="£"
                value={scratchCardPayoutAmount}
                onChangeText={(t) => {
                  setScratchCardPayoutAmount(sanitizeMoneyInput(t));
                  if (payoutFieldError?.key === "scratch") setPayoutFieldError(null);
                }}
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
                keyboardType="decimal-pad"
                accessibilityLabel="Scratch card payout amount in pounds"
                error={payoutFieldError?.key === "scratch" ? payoutFieldError.message : null}
              />
              <FloatingLabelInput
                ref={tillInputRef}
                label="Till payout"
                prefix="£"
                value={tillPayoutAmount}
                onChangeText={(t) => {
                  setTillPayoutAmount(sanitizeMoneyInput(t));
                  if (payoutFieldError?.key === "till") setPayoutFieldError(null);
                }}
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
                keyboardType="decimal-pad"
                accessibilityLabel="Till payout amount in pounds"
                error={payoutFieldError?.key === "till" ? payoutFieldError.message : null}
              />
              <Text style={styles.fieldLabel}>Additional Close Notes</Text>
              <TextInput
                style={[styles.input, styles.multilineInput]}
                value={notes}
                onChangeText={setNotes}
                placeholder="Additional notes (optional)"
                placeholderTextColor={appTheme.colors.textSubtle}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                accessibilityLabel="Additional close notes"
              />
              {attachmentsFeature.isAllowed ? (
                <>
                  <Text style={styles.fieldLabel}>Attachments (Optional)</Text>
                  <Text style={styles.meta}>
                    {closeDayAttachments.length === 0
                      ? "No attachments selected."
                      : `${closeDayAttachments.length} attachment(s) selected.`}
                  </Text>
                </>
              ) : !attachmentsFeature.isLoading ? (
                <UpgradeNotice
                  feature="scratch_card.attachments"
                  title="Attachments are a Growth-tier feature"
                  message="Upload supporting documents (e.g. scanned till receipts) to your day-close from the Growth plan and above."
                  compact
                />
              ) : null}
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
                          onPress={async () => {
                            const ok = await confirmDestructive({
                              title: "Remove attachment?",
                              message: `Remove '${attachment.fileName}' from this close?`,
                              confirmLabel: "Remove",
                            });
                            if (ok) {
                              setCloseDayAttachments((previous) => previous.filter((item) => item.id !== attachment.id));
                            }
                          }}
                          disabled={closeMutation.isPending}
                        >
                          <Text style={styles.attachmentRemoveButtonText}>Remove</Text>
                        </Pressable>
                      </View>
                    );
                  })}
                </View>
              ) : null}
              {attachmentsFeature.isAllowed ? (
                <View style={styles.attachmentActionRow}>
                  <Pressable
                    style={styles.attachmentActionButton}
                    accessibilityRole="button"
                    accessibilityLabel="Take a photo for this close"
                    onPress={() => void captureCloseDayAttachment()}
                    disabled={closeMutation.isPending}
                  >
                    <Ionicons name="camera-outline" size={16} color={appTheme.colors.text} />
                    <Text style={styles.attachmentActionButtonText}>Take Photo</Text>
                  </Pressable>
                  <Pressable
                    style={styles.attachmentActionButton}
                    accessibilityRole="button"
                    accessibilityLabel="Pick attachments from gallery"
                    onPress={() => void selectCloseDayAttachments()}
                    disabled={closeMutation.isPending}
                  >
                    <Ionicons name="images-outline" size={16} color={appTheme.colors.text} />
                    <Text style={styles.attachmentActionButtonText}>From Gallery</Text>
                  </Pressable>
                </View>
              ) : null}
              {closeDayAttachments.length > 0 ? (
                <View style={styles.attachmentActionRow}>
                  <Pressable
                    style={[styles.attachmentActionButton, styles.attachmentActionButtonDanger]}
                    accessibilityRole="button"
                    accessibilityLabel="Clear all close day attachments"
                    onPress={async () => {
                      const ok = await confirmDestructive({
                        title: "Clear all attachments?",
                        message: `This will remove all ${closeDayAttachments.length} attachment(s). You'll need to re-add them if you want to attach files to this close.`,
                        confirmLabel: "Clear all",
                      });
                      if (ok) setCloseDayAttachments([]);
                    }}
                    disabled={closeMutation.isPending}
                  >
                    <Text style={[styles.attachmentActionButtonText, styles.attachmentActionButtonTextDanger]}>Clear All</Text>
                  </Pressable>
                </View>
              ) : null}
              <Pressable
                style={styles.optInRow}
                onPress={() => {
                  haptics.selection();
                  setShouldAutoOpenNextDay((v) => !v);
                }}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: shouldAutoOpenNextDay }}
                accessibilityLabel="Open next business day automatically after closing"
              >
                <View style={[styles.optInCheckbox, shouldAutoOpenNextDay ? styles.optInCheckboxOn : null]}>
                  {shouldAutoOpenNextDay ? <Ionicons name="checkmark" size={14} color={appTheme.colors.onPrimary} /> : null}
                </View>
                <Text style={styles.optInLabel}>Open next business day after closing</Text>
              </Pressable>
              <View style={styles.modalActionRow}>
                <Pressable
                  style={[
                    styles.modalActionButton,
                    styles.modalActionButtonLeft,
                    styles.modalActionPrimary,
                    (closeMutation.isPending || !canClose) ? styles.modalActionDisabled : null,
                  ]}
                  onPress={async () => {
                    normalizeAllPayoutInputs();
                    if (!validateCloseDayInputs()) {
                      return;
                    }
                    // When the till payout doesn't reconcile with lotto + scratch payouts we
                    // make the shopkeeper acknowledge the cash variance explicitly. This is
                    // the most common cause of "I didn't mean to close that".
                    if (hasTillPayoutVariance) {
                      haptics.warning();
                      const direction = (tillPayoutVariance ?? 0) < 0 ? "short" : "over";
                      const ok = await confirmDestructive({
                        title: "Confirm cash variance",
                        message: `Till is ${direction} by ${tillPayoutVarianceText}. Closing the day will commit this variance. Continue?`,
                        cancelLabel: "Review",
                        confirmLabel: "Close anyway",
                      });
                      if (ok) closeMutation.mutate();
                      return;
                    }
                    closeMutation.mutate();
                  }}
                  disabled={closeMutation.isPending || !canClose}
                >
                  <Text style={styles.modalActionPrimaryText}>
                    {closeMutation.isPending
                      ? (closeDayAttachments.length > 0
                          ? `Closing (uploading ${closeDayAttachments.length} file${closeDayAttachments.length === 1 ? "" : "s"})...`
                          : "Closing...")
                      : "Close Day"}
                  </Text>
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
            </ScrollView>
          </View>
        </Modal>

        <Modal
          visible={isReopenDayModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setIsReopenDayModalVisible(false)}
        >
          <View style={styles.modalBackdrop}>
            <ModalBackdropBlur />
            <View style={styles.modalCard}>
              <Text style={styles.sectionTitle}>Reopen Day</Text>
              <View style={styles.warningBanner}>
                <Ionicons name="warning-outline" size={18} color={appTheme.colors.danger} />
                <Text style={styles.warningBannerText}>
                  Reopening this day allows further edits and re-triggers downstream reconciliation.
                </Text>
              </View>
              <Text style={styles.fieldLabel}>Why are you reopening? (required)</Text>
              <TextInput
                style={[styles.input, styles.multilineInput]}
                value={reopenReason}
                onChangeText={setReopenReason}
                placeholder="Explain why this day needs to be reopened"
                placeholderTextColor={appTheme.colors.textSubtle}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                accessibilityLabel="Reopen reason"
              />
              <View style={styles.modalActionRow}>
                <Pressable
                  style={[
                    styles.modalActionButton,
                    styles.modalActionButtonLeft,
                    styles.modalActionPrimary,
                    (reopenMutation.isPending || !canReopen || reopenReason.trim().length === 0) ? styles.modalActionDisabled : null,
                  ]}
                  onPress={async () => {
                    if (reopenReason.trim().length === 0) return;
                    const ok = await confirmDestructive({
                      title: "Reopen this day?",
                      message: "Are you sure you want to reopen this closed day? This action is logged.",
                      confirmLabel: "Reopen",
                    });
                    if (ok) reopenMutation.mutate();
                  }}
                  disabled={reopenMutation.isPending || !canReopen || reopenReason.trim().length === 0}
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
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  loadingShell: {
    gap: appTheme.spacing.sm,
    paddingBottom: appTheme.spacing.sm,
  },
  loadingCard: {
    gap: appTheme.spacing.sm,
  },
  loadingDateButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: appTheme.radius.pill,
    backgroundColor: appTheme.colors.surfaceTintAlt,
  },
  loadingDateButtonCenter: {
    flex: 1,
    minHeight: 42,
    borderRadius: appTheme.radius.pill,
    backgroundColor: appTheme.colors.surfaceBrandMuted,
  },
  loadingHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: appTheme.spacing.sm,
  },
  loadingDateText: {
    width: 148,
    height: 28,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceTintAlt,
  },
  loadingStatusBadge: {
    width: 88,
    height: 30,
    borderRadius: appTheme.radius.pill,
    backgroundColor: appTheme.colors.surfaceNeutralSoft,
  },
  loadingSummaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: appTheme.spacing.xs,
  },
  loadingSummaryTile: {
    width: "48.8%",
    minHeight: 54,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceTint,
  },
  loadingSectionTitle: {
    width: 156,
    height: 24,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceTintAlt,
  },
  loadingActionButton: {
    width: 104,
    height: 38,
    borderRadius: appTheme.radius.pill,
    backgroundColor: appTheme.colors.surfaceBrandMuted,
  },
  loadingDivider: {
    height: 1,
    backgroundColor: appTheme.colors.borderSoft,
  },
  loadingShiftList: {
    gap: appTheme.spacing.xs,
  },
  loadingShiftItem: {
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceTintAlt,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: appTheme.spacing.sm,
    gap: 8,
  },
  loadingShiftTitle: {
    width: "56%",
    height: 20,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surface,
  },
  loadingShiftLine: {
    width: "100%",
    height: 16,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surface,
  },
  loadingShiftLineShort: {
    width: "72%",
    height: 16,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surface,
  },
  loadingShiftAction: {
    width: "100%",
    height: 42,
    borderRadius: appTheme.radius.pill,
    backgroundColor: appTheme.colors.surfaceBrandMuted,
  },
  loadingKpiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: appTheme.spacing.xs,
  },
  loadingKpiTile: {
    width: "48.8%",
    minHeight: 62,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceTint,
  },
  pageContent: {
    gap: appTheme.spacing.xs,
    paddingBottom: appTheme.spacing.xs,
  },
  dayHeaderCard: {
    gap: appTheme.spacing.xs,
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
    fontSize: 19,
    lineHeight: 24,
    fontFamily: appTheme.fonts.heading,
  },
  summaryMetaGrid: {
    flexDirection: "row",
    alignItems: "stretch",
    flexWrap: "wrap",
    gap: appTheme.spacing.xs,
    justifyContent: "space-between",
  },
  summaryMetaItem: {
    width: "48.8%",
    minWidth: 0,
    backgroundColor: appTheme.colors.surfaceMuted,
    borderRadius: appTheme.radius.sm,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: appTheme.spacing.xs,
    gap: 2,
  },
  summaryMetaText: {
    color: appTheme.colors.text,
    fontSize: 14,
    lineHeight: 18,
    fontFamily: appTheme.fonts.bodyMedium,
  },
  summaryMetaTextDanger: {
    color: appTheme.colors.danger,
  },
  dateActionInlineButton: {
    flex: 1,
    minHeight: 34,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: appTheme.spacing.sm,
  },
  dateActionButtonDisabled: {
    opacity: 0.55,
  },
  dateActionInlineButtonText: {
    color: appTheme.colors.onPrimary,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 14,
  },
  dateNavigationRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "stretch",
    gap: appTheme.spacing.xs,
  },
  dateNavigationButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceSuccessMuted,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: appTheme.spacing.sm,
  },
  dateNavigationButtonText: {
    color: appTheme.colors.primary,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 11,
    lineHeight: 13,
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
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: appTheme.radius.pill,
    backgroundColor: appTheme.colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  shiftOpenButtonPressed: {
    backgroundColor: appTheme.colors.primaryPressed,
  },
  shiftOpenButtonDisabled: {
    opacity: 0.5,
  },
  shiftOpenButtonText: {
    color: appTheme.colors.onPrimary,
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
    backgroundColor: appTheme.colors.surfaceDangerSoft,
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
    backgroundColor: appTheme.colors.surfaceTint,
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
    backgroundColor: appTheme.colors.surfaceInfoSoft,
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
  safeDropTableTitle: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 16,
    marginTop: appTheme.spacing.xs,
  },
  safeDropTableScrollContent: {
    paddingBottom: 2,
  },
  safeDropTable: {
    minWidth: 620,
    borderWidth: 0,
    borderRadius: appTheme.radius.sm,
    overflow: "hidden",
    backgroundColor: appTheme.colors.surface,
  },
  safeDropTableRow: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 0,
    borderBottomColor: appTheme.colors.border,
    backgroundColor: appTheme.colors.surfaceMuted,
  },
  safeDropTableHeaderRow: {
    backgroundColor: appTheme.colors.surfaceTintAlt,
  },
  safeDropTableCell: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.body,
    fontSize: 12,
    lineHeight: 16,
    paddingHorizontal: appTheme.spacing.xs,
    paddingVertical: 9,
  },
  safeDropTableHeaderText: {
    fontFamily: appTheme.fonts.bodyMedium,
    color: appTheme.colors.textSubtle,
    textTransform: "uppercase",
    fontSize: 11,
    lineHeight: 14,
  },
  safeDropTableCellCanister: {
    width: 100,
  },
  safeDropTableCellAmount: {
    width: 100,
  },
  safeDropTableCellBy: {
    width: 140,
  },
  safeDropTableCellShift: {
    width: 130,
  },
  safeDropTableCellTime: {
    width: 190,
  },
  safeDropAmount: {
    fontFamily: appTheme.fonts.bodyMedium,
    color: appTheme.colors.primary,
  },
  error: {
    color: appTheme.colors.danger,
    fontFamily: appTheme.fonts.bodyMedium,
    lineHeight: 18,
    fontSize: 12,
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
  reviewSnapshotCardExpanded: {
    flex: 1,
    minHeight: 0,
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
  // Uniform white-on-surface card so the list reads as a single rhythm; status is conveyed
  // by the accent stripe + badge instead of three different background fills. Open shift
  // gets a faint primary-tinted background so the live one still pops without being shouty.
  shiftItem: {
    flexDirection: "row",
    overflow: "hidden",
    borderRadius: appTheme.radius.md,
    backgroundColor: appTheme.colors.surface,
    gap: 0,
  },
  shiftItemOpen: {
    backgroundColor: appTheme.colors.surfaceBrandSoft,
  },
  shiftItemClosed: {},
  shiftItemScheduled: {},
  shiftCardAccent: {
    width: 3,
  },
  shiftCardAccentOpen: {
    backgroundColor: appTheme.colors.primary,
  },
  shiftCardAccentClosed: {
    backgroundColor: appTheme.colors.borderSoft,
  },
  shiftCardAccentScheduled: {
    backgroundColor: appTheme.colors.warning,
  },
  shiftCardContent: {
    flex: 1,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: appTheme.spacing.sm,
    gap: appTheme.spacing.xs,
  },
  shiftDetailsTapArea: {
    flexDirection: "row",
    alignItems: "center",
    gap: appTheme.spacing.xs,
    minHeight: 56,
  },
  shiftDetailsTapAreaPressed: {
    opacity: 0.7,
  },
  shiftBody: {
    flex: 1,
    gap: 4,
  },
  shiftNameBlock: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  // Small dot rendered before the shift name when the shift is currently open. Subtle,
  // since the open-state already has a tinted background — the dot just reinforces it.
  shiftLiveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: appTheme.colors.primary,
  },
  shiftChevron: {
    marginLeft: 4,
  },
  // Bar-shaped skeleton placeholder shown in the Sales row while shift totals are loading.
  shiftSalesSkeleton: {
    height: 14,
    width: 110,
    borderRadius: 4,
    backgroundColor: appTheme.colors.surfaceMuted,
    marginTop: 2,
    opacity: 0.7,
  },
  shiftHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: appTheme.spacing.xs,
  },
  shiftMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: appTheme.spacing.xs,
  },
  shiftTimeBlock: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 1,
  },
  shiftSalesAmount: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.heading,
    fontSize: 17,
    lineHeight: 21,
  },
  shiftName: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 17,
    flexShrink: 1,
  },
  shiftCompactMeta: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.body,
    fontSize: 12,
    lineHeight: 15,
  },
  shiftDetailsHint: {
    color: appTheme.colors.textSubtle,
    fontFamily: appTheme.fonts.body,
    fontSize: 12,
    lineHeight: 15,
  },
  shiftActionRow: {
    marginTop: 4,
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
  serialConfirmList: {
    minHeight: 0,
    flexShrink: 1,
  },
  serialConfirmListExpanded: {
    flex: 1,
  },
  serialConfirmListContent: {
    gap: appTheme.spacing.xs,
    paddingTop: appTheme.spacing.xs,
    paddingBottom: appTheme.spacing.xs,
  },
  serialProgressPill: {
    borderWidth: 0,
    borderColor: appTheme.colors.primary,
    borderRadius: appTheme.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: appTheme.colors.surfaceBrandSoft,
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
  serialConfirmAllInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  serialConfirmButton: {
    borderWidth: 0,
    borderColor: appTheme.colors.primary,
    borderRadius: appTheme.radius.pill,
    backgroundColor: appTheme.colors.surfaceBrandSoft,
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
    color: appTheme.colors.textOnDark,
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
    backgroundColor: appTheme.colors.overlay,
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
    width: 44,
    height: 44,
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
    backgroundColor: appTheme.colors.surfaceNeutralSoft,
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
    backgroundColor: appTheme.colors.surfaceBrandMuted,
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
    backgroundColor: appTheme.colors.overlay,
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
    overflow: "hidden",
  },
  shiftStartModalCard: {
    width: "100%",
    height: "92%",
    maxHeight: "92%",
  },
  shiftStartModalBody: {
    flex: 1,
    minHeight: 0,
    gap: appTheme.spacing.sm,
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
    borderWidth: 0,
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
  attachmentPreviewModalImage: {
    flex: 1,
    width: "100%",
    backgroundColor: appTheme.colors.previewBackdrop,
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
    borderWidth: 0,
    borderColor: appTheme.colors.borderStrong,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 44,
    minWidth: 88,
    alignItems: "center",
    justifyContent: "center",
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
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 44,
    minWidth: 80,
    alignItems: "center",
    justifyContent: "center",
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
    backgroundColor: appTheme.colors.surfaceSuccessAlt,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 44,
    minWidth: 88,
    alignItems: "center",
    justifyContent: "center",
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
    flexDirection: "row",
    minHeight: 38,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceTintSoft,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
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
  // --- Added in the day-close UX pass ---
  inputError: {
    borderWidth: 1,
    borderColor: appTheme.colors.danger,
  },
  fieldErrorText: {
    color: appTheme.colors.danger,
    fontFamily: appTheme.fonts.body,
    fontSize: 12,
    lineHeight: 16,
    marginTop: -2,
    marginBottom: 4,
  },
  warningBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: appTheme.spacing.xs,
    backgroundColor: appTheme.colors.surfaceDangerSoft,
    borderRadius: appTheme.radius.sm,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: appTheme.spacing.sm,
  },
  warningBannerText: {
    flex: 1,
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.body,
    fontSize: 13,
    lineHeight: 17,
  },
  shiftBreakdownList: {
    gap: 6,
    marginTop: 2,
  },
  shiftBreakdownRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: appTheme.spacing.xs,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: appTheme.colors.borderSoft,
  },
  shiftBreakdownName: {
    flex: 1,
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 17,
  },
  shiftBreakdownMeta: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.body,
    fontSize: 12,
    lineHeight: 16,
  },
  varianceHeroTile: {
    borderRadius: appTheme.radius.md,
    paddingHorizontal: appTheme.spacing.md,
    paddingVertical: appTheme.spacing.md,
    gap: 4,
  },
  varianceHeroTilePositive: {
    backgroundColor: appTheme.colors.surfaceSuccessMuted,
  },
  varianceHeroTileNegative: {
    backgroundColor: appTheme.colors.surfaceDangerSoft,
  },
  varianceHeroLabel: {
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 14,
    letterSpacing: 0.6,
    color: appTheme.colors.textMuted,
    textTransform: "uppercase",
  },
  varianceHeroValue: {
    fontFamily: appTheme.fonts.heading,
    fontSize: 28,
    lineHeight: 32,
    color: appTheme.colors.text,
  },
  varianceHeroHint: {
    fontFamily: appTheme.fonts.body,
    fontSize: 12,
    lineHeight: 16,
    color: appTheme.colors.textMuted,
  },
  emptyStateCard: {
    alignItems: "center",
    gap: appTheme.spacing.xs,
    paddingVertical: appTheme.spacing.md,
    paddingHorizontal: appTheme.spacing.md,
    borderRadius: appTheme.radius.md,
    backgroundColor: appTheme.colors.surfaceTintAlt,
  },
  emptyStateTitle: {
    fontFamily: appTheme.fonts.bodyMedium,
    color: appTheme.colors.text,
    fontSize: 15,
    lineHeight: 19,
  },
  emptyStateBody: {
    fontFamily: appTheme.fonts.body,
    color: appTheme.colors.textMuted,
    fontSize: 13,
    lineHeight: 17,
    textAlign: "center",
  },
  emptyStateCta: {
    marginTop: appTheme.spacing.xs,
    minHeight: 44,
    paddingHorizontal: appTheme.spacing.md,
    backgroundColor: appTheme.colors.primary,
    borderRadius: appTheme.radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyStateCtaText: {
    color: appTheme.colors.onPrimary,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 18,
  },
  shiftSalesValue: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 17,
    marginTop: 2,
  },
  safeDropList: {
    gap: appTheme.spacing.xs,
  },
  safeDropCompactList: {
    gap: 6,
  },
  sectionCardPressed: {
    opacity: 0.94,
  },
  sectionTitleRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  safeDropCompactRow: {
    flexDirection: "row",
    alignItems: "center",
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
  safeDropCompactReason: {
    color: appTheme.colors.danger,
    fontFamily: appTheme.fonts.body,
    fontSize: 11,
    lineHeight: 14,
  },
  safeDropCompactApprove: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: appTheme.radius.pill,
    backgroundColor: appTheme.colors.surfaceBrandSoft,
  },
  safeDropCompactApproveText: {
    color: appTheme.colors.primary,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 14,
  },
  safeDropCard: {
    flexDirection: "row",
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surface,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: appTheme.colors.borderSoft,
  },
  safeDropCardPending: {
    backgroundColor: appTheme.colors.surfaceWarningSoft,
    borderColor: appTheme.colors.borderWarningSoft,
  },
  safeDropCardApproved: {
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.borderSuccessSoft,
  },
  safeDropCardRejected: {
    backgroundColor: appTheme.colors.surfaceDangerSoft,
    borderColor: appTheme.colors.danger,
  },
  safeDropCardAccent: {
    width: 4,
  },
  safeDropCardAccentPending: {
    backgroundColor: appTheme.colors.warning ?? appTheme.colors.danger,
  },
  safeDropCardAccentApproved: {
    backgroundColor: appTheme.colors.primary,
  },
  safeDropCardAccentRejected: {
    backgroundColor: appTheme.colors.danger,
  },
  safeDropCardContent: {
    flex: 1,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: appTheme.spacing.sm,
    gap: 6,
  },
  safeDropCardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: appTheme.spacing.sm,
  },
  safeDropCardCanisterBlock: {
    flex: 1,
    gap: 2,
  },
  safeDropCanisterIconRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  safeDropCardCanisterLabel: {
    fontFamily: appTheme.fonts.bodyMedium,
    color: appTheme.colors.textMuted,
    fontSize: 10,
    lineHeight: 13,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  safeDropCardCanisterValue: {
    fontFamily: appTheme.fonts.bodyMedium,
    color: appTheme.colors.text,
    fontSize: 15,
    lineHeight: 19,
  },
  safeDropAmountBlock: {
    alignItems: "flex-end",
    gap: 4,
  },
  safeDropCardAmount: {
    fontFamily: appTheme.fonts.heading,
    color: appTheme.colors.text,
    fontSize: 20,
    lineHeight: 24,
  },
  safeDropMetaLine: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 4,
  },
  safeDropMetaSep: {
    color: appTheme.colors.textSubtle,
    fontFamily: appTheme.fonts.body,
    fontSize: 12,
    lineHeight: 16,
    marginHorizontal: 2,
  },
  safeDropNotesRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 4,
    paddingTop: 2,
  },
  safeDropCardMetaText: {
    fontFamily: appTheme.fonts.body,
    color: appTheme.colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
    flexShrink: 1,
  },
  safeDropApproveButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 4,
    minHeight: 36,
    paddingHorizontal: appTheme.spacing.md,
    backgroundColor: appTheme.colors.surfaceSuccessMuted,
    borderRadius: appTheme.radius.pill,
    borderWidth: 1,
    borderColor: appTheme.colors.primary,
  },
  safeDropApproveButtonPressed: {
    backgroundColor: appTheme.colors.surfaceBrandSoft,
  },
  safeDropApproveButtonDisabled: {
    opacity: 0.55,
  },
  safeDropApproveButtonText: {
    color: appTheme.colors.primary,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 16,
  },
  closeDayModalScroll: {
    maxHeight: "92%",
  },
  closeDayModalScrollContent: {
    flexGrow: 1,
  },
  recapCard: {
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceTint,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: appTheme.spacing.sm,
    gap: 4,
  },
  recapHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 2,
  },
  recapTitle: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 16,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  recapDate: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 16,
  },
  recapRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  recapLabel: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.body,
    fontSize: 13,
    lineHeight: 18,
  },
  recapValue: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 18,
  },
  recapVarianceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: 6,
    borderRadius: appTheme.radius.sm,
  },
  recapVarianceRowNegative: {
    backgroundColor: appTheme.colors.surfaceWarningSoft,
  },
  recapVarianceRowPositive: {
    backgroundColor: appTheme.colors.surfaceSuccessMuted,
  },
  recapVarianceLabel: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 18,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  recapVarianceValue: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.heading,
    fontSize: 15,
    lineHeight: 19,
  },
  optInRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: appTheme.spacing.xs,
    paddingVertical: 6,
  },
  optInCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: appTheme.colors.border,
    backgroundColor: appTheme.colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  optInCheckboxOn: {
    backgroundColor: appTheme.colors.primary,
    borderColor: appTheme.colors.primary,
  },
  optInLabel: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 17,
    flex: 1,
  },
});





