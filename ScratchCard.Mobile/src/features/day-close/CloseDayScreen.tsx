import React, { useEffect, useRef, useState } from "react";
import { Alert, Image, Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { closeBusinessDay, getBusinessDay, listBusinessDays, openBusinessDay } from "../../api/businessDaysApi";
import { formatDateValue, parseDateValue } from "../../components/DateTimeField";
import { FloatingLabelInput } from "../../components/FloatingLabelInput";
import { LoadingState } from "../../components/LoadingState";
import { PrimaryButton } from "../../components/PrimaryButton";
import { ScreenContainer } from "../../components/ScreenContainer";
import { UpgradeNotice } from "../subscription/FeatureGate";
import { useFeature } from "../subscription/useFeature";
import { formatFileSize } from "../../utils/attachments";
import { confirmDestructive } from "../../utils/confirm";
import { formatGbpOrDash, formatSignedGbp } from "../../utils/currency";
import { formatDayLabel } from "../../utils/dateLabels";
import { haptics } from "../../utils/haptics";
import { cleanupLocalImage } from "../../utils/shareFile";
import { MainStackParamList } from "../../types/navigation";
import { appTheme } from "../../ui/theme";

type Props = NativeStackScreenProps<MainStackParamList, "CloseDay">;

type CloseAttachmentState = {
  id: string;
  fileName: string;
  base64: string;
  contentType?: string;
  uri?: string;
  size?: number;
};

const DEFAULT_CLOSE_DAY_PAYOUT = "0";
const MAX_CLOSE_ATTACHMENTS = 10;
const MAX_CLOSE_ATTACHMENT_BYTES = 10 * 1024 * 1024;

function getApiErrorMessage(error: unknown, fallback: string): string {
  const e = error as any;
  const status = e?.response?.status as number | undefined;
  const serverMessage =
    typeof e?.response?.data?.message === "string" ? e.response.data.message :
    typeof e?.response?.data?.error === "string" ? e.response.data.error : undefined;
  if (e?.message === "Network Error" || e?.code === "ERR_NETWORK") {
    return "Couldn't reach the server. Check your connection and try again.";
  }
  if (status === 401 || status === 403) return serverMessage ?? "You don't have permission for this action.";
  if (status === 409) return serverMessage ?? "Another user changed this record. Pull to refresh and retry.";
  if (status === 422 || status === 400) return serverMessage ?? "Please review the highlighted fields and try again.";
  if (status && status >= 500) return "Server problem. Wait a moment and try again — the data hasn't been saved.";
  return serverMessage ?? e?.message ?? fallback;
}

// Allow only digits + optional single decimal with up to 2 places. Strips commas and leading zeros.
function sanitizeMoneyInput(raw: string): string {
  if (!raw) return "";
  let s = raw.replace(/,/g, ".").replace(/[^\d.]/g, "");
  const firstDot = s.indexOf(".");
  if (firstDot !== -1) {
    s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, "");
    s = s.slice(0, firstDot + 3);
  }
  if (s.length > 1 && s.startsWith("0") && !s.startsWith("0.")) {
    s = s.replace(/^0+/, "");
    if (s === "" || s.startsWith(".")) s = "0" + s;
  }
  return s;
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

function isActiveBusinessDayStatus(status?: string) {
  const normalized = (status ?? "").trim().toLowerCase();
  return normalized === "open" || normalized === "reopened" || normalized === "readytoclose";
}

export function CloseDayScreen({ route, navigation }: Props) {
  const { businessDayId, closedShiftCount, totalSales } = route.params;
  const queryClient = useQueryClient();

  const [notes, setNotes] = useState("");
  const [lottoPayoutAmount, setLottoPayoutAmount] = useState(DEFAULT_CLOSE_DAY_PAYOUT);
  const [scratchCardPayoutAmount, setScratchCardPayoutAmount] = useState(DEFAULT_CLOSE_DAY_PAYOUT);
  const [tillPayoutAmount, setTillPayoutAmount] = useState(DEFAULT_CLOSE_DAY_PAYOUT);
  const [closeDayAttachments, setCloseDayAttachments] = useState<CloseAttachmentState[]>([]);
  // Whether closing the day should automatically open the next business day and roll the user into
  // it. Defaults ON (the long-standing behaviour); off closes the day only and returns here.
  const [autoOpenNextDay, setAutoOpenNextDay] = useState(true);
  const [payoutFieldError, setPayoutFieldError] = useState<{ key: "lotto" | "scratch" | "till"; message: string } | null>(null);
  const lottoInputRef = useRef<TextInput | null>(null);
  const scratchInputRef = useRef<TextInput | null>(null);
  const tillInputRef = useRef<TextInput | null>(null);

  const attachmentsFeature = useFeature("scratch_card.attachments");

  const dayQuery = useQuery({
    queryKey: ["business-day", businessDayId],
    queryFn: () => getBusinessDay(businessDayId),
  });
  const day = dayQuery.data;

  // Seed the payout inputs from any persisted close summary (a re-close after reopen).
  useEffect(() => {
    const summary = day?.scratchCardDayCloseSummary;
    if (!summary) return;
    setLottoPayoutAmount(String(summary.lottoPayout));
    setScratchCardPayoutAmount(String(summary.scratchCardPayout));
    setTillPayoutAmount(String(summary.tillPayout));
  }, [
    day?.scratchCardDayCloseSummary?.lottoPayout,
    day?.scratchCardDayCloseSummary?.scratchCardPayout,
    day?.scratchCardDayCloseSummary?.tillPayout,
  ]);

  const normalizePayoutInput = (raw: string) => {
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : DEFAULT_CLOSE_DAY_PAYOUT;
  };
  const normalizeAllPayoutInputs = () => {
    setLottoPayoutAmount((p) => normalizePayoutInput(p));
    setScratchCardPayoutAmount((p) => normalizePayoutInput(p));
    setTillPayoutAmount((p) => normalizePayoutInput(p));
  };

  // The day isn't closed yet, so the recap/variance reflect the live inputs.
  const lottoValue = Number(normalizePayoutInput(lottoPayoutAmount));
  const scratchValue = Number(normalizePayoutInput(scratchCardPayoutAmount));
  const tillValue = Number(normalizePayoutInput(tillPayoutAmount));
  const tillPayoutVariance =
    Number.isFinite(tillValue) && Number.isFinite(lottoValue) && Number.isFinite(scratchValue)
      ? tillValue - (lottoValue + scratchValue)
      : undefined;
  const hasTillPayoutVariance = tillPayoutVariance != null && Math.abs(tillPayoutVariance) >= 0.01;
  const tillPayoutVarianceText = tillPayoutVariance != null ? formatSignedGbp(tillPayoutVariance) : "";

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
      if (combined.length <= MAX_CLOSE_ATTACHMENTS) return combined;
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
    if (result.canceled || result.assets.length === 0) return;
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
    if (result.canceled || result.assets.length === 0) return;
    ingestCloseDayAssets(result.assets);
  };

  const validateCloseDayInputs = () => {
    const fields: Array<{ key: "lotto" | "scratch" | "till"; label: string; raw: string; ref: React.RefObject<TextInput | null> }> = [
      { key: "lotto", label: "Lotto payout", raw: lottoPayoutAmount, ref: lottoInputRef },
      { key: "scratch", label: "Scratch card payout", raw: scratchCardPayoutAmount, ref: scratchInputRef },
      { key: "till", label: "Till payout", raw: tillPayoutAmount, ref: tillInputRef },
    ];
    for (const field of fields) {
      const value = Number(normalizePayoutInput(field.raw));
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

  const closeMutation = useMutation({
    mutationFn: async () => closeBusinessDay(businessDayId, {
      lottoPayout: Number(normalizePayoutInput(lottoPayoutAmount)),
      scratchCardPayout: Number(normalizePayoutInput(scratchCardPayoutAmount)),
      tillPayout: Number(normalizePayoutInput(tillPayoutAmount)),
      notes: notes.trim() || undefined,
      attachments: closeDayAttachments.map((a) => ({ fileName: a.fileName, base64: a.base64, contentType: a.contentType })),
    }),
    onSuccess: async (closedDay) => {
      haptics.success();
      void Promise.allSettled(closeDayAttachments.map((a) => cleanupLocalImage(a.uri)));
      setCloseDayAttachments([]);
      // Make the day-management screen reflect the new Closed status when we go back.
      void queryClient.invalidateQueries({ queryKey: ["business-day", businessDayId] });

      if (!autoOpenNextDay) {
        Alert.alert("Closed", "Business day closed. Open the next day when you're ready.");
        navigation.goBack();
        return;
      }

      const shopId = closedDay?.shopId ?? day?.shopId;
      if (!shopId || !closedDay?.businessDate) {
        Alert.alert("Closed", "Business day closed successfully.");
        navigation.goBack();
        return;
      }

      const nextDate = getDateValueOffset(closedDay.businessDate, 1);
      try {
        const openedDay = await openBusinessDay({ shopId, businessDate: nextDate });
        Alert.alert("Closed", `Business day closed. Opened ${openedDay.businessDate}.`);
        // Replace this close screen with the next day's management screen; back returns to the
        // just-closed day (now showing Closed).
        navigation.replace("DayEndClose", { businessDayId: openedDay.id });
        return;
      } catch {
        try {
          const nearbyDays = await listBusinessDays(shopId, { from: nextDate, to: getDateValueOffset(nextDate, 14) });
          const fallbackDay =
            nearbyDays.find((item) => isActiveBusinessDayStatus(item.status)) ??
            nearbyDays.find((item) => item.businessDate === nextDate);
          if (fallbackDay) {
            Alert.alert("Closed", `Business day closed. Opened ${fallbackDay.businessDate}.`);
            navigation.replace("DayEndClose", { businessDayId: fallbackDay.id });
            return;
          }
        } catch {
          // Keep close success and fall through if next-day lookup fails.
        }
      }
      Alert.alert("Closed", "Business day closed successfully.");
      navigation.goBack();
    },
    onError: (error: unknown) => {
      Alert.alert("Couldn't close the day", getApiErrorMessage(error, "Unable to close business day."));
    },
  });

  const onCloseDay = async () => {
    normalizeAllPayoutInputs();
    if (!validateCloseDayInputs()) return;
    if (hasTillPayoutVariance) {
      haptics.warning();
      const direction = (tillPayoutVariance ?? 0) < 0 ? "short" : "over";
      const ok = await confirmDestructive({
        title: "Confirm cash variance",
        message: `Till is ${direction} by ${tillPayoutVarianceText}. Closing the day will commit this variance. Continue?`,
        cancelLabel: "Review",
        confirmLabel: "Close anyway",
      });
      if (!ok) return;
    } else {
      // Closing a day locks its figures and is not a routine undo — always confirm with a recap,
      // even when the cash balances, so it can't be committed on a single accidental tap.
      const shiftLabel = `${closedShiftCount} shift${closedShiftCount === 1 ? "" : "s"}`;
      const ok = await confirmDestructive({
        title: "Close this business day?",
        message: `${formatDayLabel(day?.businessDate)} — ${shiftLabel}, ${formatCurrency(totalSales)} in sales. This locks the day's figures.`,
        cancelLabel: "Not yet",
        confirmLabel: "Close day",
      });
      if (!ok) return;
    }
    closeMutation.mutate();
  };

  if (dayQuery.isLoading && !day) {
    return (
      <ScreenContainer>
        <View style={styles.card}><LoadingState message="Loading day…" inline /></View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer
      footer={
        <PrimaryButton
          label={
            closeMutation.isPending
              ? (closeDayAttachments.length > 0
                  ? `Closing (uploading ${closeDayAttachments.length} file${closeDayAttachments.length === 1 ? "" : "s"})…`
                  : "Closing…")
              : "Close day"
          }
          onPress={() => void onCloseDay()}
          disabled={closeMutation.isPending}
        />
      }
    >
      {/* <Text style={styles.meta}>Review the recap below, then close this business day.</Text> */}

      {/* Recap — the figures the close will commit. */}
      <View style={styles.recapCard}>
        <View style={styles.recapHeaderRow}>
          <Text style={styles.recapTitle}>Recap</Text>
          <Text style={styles.recapDate}>{formatDayLabel(day?.businessDate)}</Text>
        </View>
        <View style={styles.recapRow}>
          <Text style={styles.recapLabel}>Closed shifts</Text>
          <Text style={styles.recapValue}>{closedShiftCount}</Text>
        </View>
        <View style={styles.recapRow}>
          <Text style={styles.recapLabel}>Total sales</Text>
          <Text style={styles.recapValue}>{formatCurrency(totalSales)}</Text>
        </View>
        <View style={styles.recapRow}>
          <Text style={styles.recapLabel}>Lotto payout</Text>
          <Text style={styles.recapValue}>{formatCurrency(lottoValue)}</Text>
        </View>
        <View style={styles.recapRow}>
          <Text style={styles.recapLabel}>Scratch card payout</Text>
          <Text style={styles.recapValue}>{formatCurrency(scratchValue)}</Text>
        </View>
        <View style={styles.recapRow}>
          <Text style={styles.recapLabel}>Till payout</Text>
          <Text style={styles.recapValue}>{formatCurrency(tillValue)}</Text>
        </View>
        {hasTillPayoutVariance ? (
          <View style={[styles.recapVarianceRow, (tillPayoutVariance ?? 0) < 0 ? styles.recapVarianceRowNegative : styles.recapVarianceRowPositive]}>
            <Text style={styles.recapVarianceLabel}>{(tillPayoutVariance ?? 0) < 0 ? "Cash short" : "Cash over"}</Text>
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
        onFocus={() => { if (lottoPayoutAmount.trim() === DEFAULT_CLOSE_DAY_PAYOUT) setLottoPayoutAmount(""); }}
        onBlur={() => { if (!lottoPayoutAmount.trim().length) setLottoPayoutAmount(DEFAULT_CLOSE_DAY_PAYOUT); }}
        keyboardType="decimal-pad"
        accessibilityLabel="Lotto payout amount in pounds"
        error={payoutFieldError?.key === "lotto" ? payoutFieldError.message : null}
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => scratchInputRef.current?.focus()}
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
        onFocus={() => { if (scratchCardPayoutAmount.trim() === DEFAULT_CLOSE_DAY_PAYOUT) setScratchCardPayoutAmount(""); }}
        onBlur={() => { if (!scratchCardPayoutAmount.trim().length) setScratchCardPayoutAmount(DEFAULT_CLOSE_DAY_PAYOUT); }}
        keyboardType="decimal-pad"
        accessibilityLabel="Scratch card payout amount in pounds"
        error={payoutFieldError?.key === "scratch" ? payoutFieldError.message : null}
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => tillInputRef.current?.focus()}
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
        onFocus={() => { if (tillPayoutAmount.trim() === DEFAULT_CLOSE_DAY_PAYOUT) setTillPayoutAmount(""); }}
        onBlur={() => { if (!tillPayoutAmount.trim().length) setTillPayoutAmount(DEFAULT_CLOSE_DAY_PAYOUT); }}
        keyboardType="decimal-pad"
        accessibilityLabel="Till payout amount in pounds"
        error={payoutFieldError?.key === "till" ? payoutFieldError.message : null}
        returnKeyType="done"
      />

      <View style={styles.noteAttachmentSection}>
        <Text style={styles.noteAttachmentSectionTitle}>Close Note & Attachments</Text>
        <TextInput
          style={[styles.input, styles.multilineInput]}
          value={notes}
          onChangeText={setNotes}
          placeholder="Anything notable about this day…"
          placeholderTextColor={appTheme.colors.textSubtle}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
          accessibilityLabel="Additional close notes"
        />
        {attachmentsFeature.isAllowed ? (
          <Text style={styles.meta}>
            {closeDayAttachments.length === 0 ? "No attachments selected." : `${closeDayAttachments.length} attachment(s) selected.`}
          </Text>
        ) : !attachmentsFeature.isLoading ? (
          <UpgradeNotice
            feature="scratch_card.attachments"
            title="Attachments not included in your plan"
            message="Day-close attachments aren't included in this shop's current plan."
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
                    <View style={styles.attachmentFileIcon}><Text style={styles.attachmentFileIconText}>FILE</Text></View>
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
                    onPress={async () => {
                      const ok = await confirmDestructive({
                        title: "Remove attachment?",
                        message: `Remove '${attachment.fileName}' from this close?`,
                        confirmLabel: "Remove",
                      });
                      if (ok) setCloseDayAttachments((previous) => previous.filter((item) => item.id !== attachment.id));
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
              <Text style={styles.attachmentActionButtonText}>Take photo</Text>
            </Pressable>
            <Pressable
              style={styles.attachmentActionButton}
              accessibilityRole="button"
              accessibilityLabel="Pick attachments from gallery"
              onPress={() => void selectCloseDayAttachments()}
              disabled={closeMutation.isPending}
            >
              <Ionicons name="images-outline" size={16} color={appTheme.colors.text} />
              <Text style={styles.attachmentActionButtonText}>From gallery</Text>
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
              <Text style={[styles.attachmentActionButtonText, styles.attachmentActionButtonTextDanger]}>Clear all</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      <View style={styles.autoOpenRow}>
        <View style={styles.autoOpenTextWrap}>
          <Text style={styles.autoOpenTitle}>Open next business day</Text>
          <Text style={styles.autoOpenHint}>
            {autoOpenNextDay
              ? "After closing, the next day opens automatically and you continue there."
              : "Closes this day only — you can open the next day yourself later."}
          </Text>
        </View>
        <Switch
          value={autoOpenNextDay}
          onValueChange={setAutoOpenNextDay}
          disabled={closeMutation.isPending}
          accessibilityLabel="Open the next business day automatically after closing"
        />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.md,
    backgroundColor: appTheme.colors.surface,
    padding: appTheme.spacing.md,
  },
  meta: {
    color: appTheme.colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: appTheme.fonts.body,
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
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  recapTitle: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 18,
  },
  recapDate: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.body,
    fontSize: 12,
    lineHeight: 16,
  },
  recapRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: appTheme.colors.borderSoft,
  },
  recapVarianceRowNegative: {},
  recapVarianceRowPositive: {},
  recapVarianceLabel: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 18,
  },
  recapVarianceValue: {
    color: appTheme.colors.danger,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 18,
  },
  noteAttachmentSection: {
    gap: appTheme.spacing.sm,
  },
  noteAttachmentSectionTitle: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 18,
  },
  input: {
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    color: appTheme.colors.text,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: appTheme.spacing.sm,
    fontSize: 14,
    fontFamily: appTheme.fonts.body,
  },
  multilineInput: {
    minHeight: 96,
  },
  attachmentList: {
    gap: appTheme.spacing.xs,
  },
  attachmentItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: appTheme.spacing.sm,
    borderWidth: 1,
    borderColor: appTheme.colors.borderSoft,
    borderRadius: appTheme.radius.sm,
    padding: appTheme.spacing.xs,
  },
  attachmentPreviewImage: {
    width: 40,
    height: 40,
    borderRadius: appTheme.radius.sm,
  },
  attachmentFileIcon: {
    width: 40,
    height: 40,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  attachmentFileIconText: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 10,
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
    backgroundColor: appTheme.colors.surfaceMuted,
  },
  attachmentRemoveButtonText: {
    color: appTheme.colors.danger,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
  },
  attachmentActionRow: {
    flexDirection: "row",
    gap: appTheme.spacing.sm,
  },
  attachmentActionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: appTheme.spacing.sm,
    borderRadius: appTheme.radius.sm,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    backgroundColor: appTheme.colors.surface,
  },
  attachmentActionButtonDanger: {
    borderColor: appTheme.colors.danger,
  },
  attachmentActionButtonText: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 13,
  },
  attachmentActionButtonTextDanger: {
    color: appTheme.colors.danger,
  },
  autoOpenRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: appTheme.spacing.sm,
    paddingVertical: appTheme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: appTheme.colors.borderSoft,
  },
  autoOpenTextWrap: {
    flex: 1,
    gap: 2,
  },
  autoOpenTitle: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 18,
  },
  autoOpenHint: {
    color: appTheme.colors.textSubtle,
    fontFamily: appTheme.fonts.body,
    fontSize: 12,
    lineHeight: 16,
  },
});
