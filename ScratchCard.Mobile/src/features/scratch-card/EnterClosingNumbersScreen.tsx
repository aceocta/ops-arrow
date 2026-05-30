import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useNetInfo } from "@react-native-community/netinfo";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getBusinessDay } from "../../api/businessDaysApi";
import { getConfigurations } from "../../api/configurationsApi";
import { getActivePacksForShift, getShift, listShiftClosingNumbers, upsertShiftClosingNumber } from "../../api/shiftsApi";
import { haptics } from "../../utils/haptics";
import { track } from "../../utils/analytics";
import { PrimaryButton } from "../../components/PrimaryButton";
import { ScreenContainer } from "../../components/ScreenContainer";
import { clearShiftDraft, getShiftDraft } from "../../offline/draftRepository";
import { calculateShiftSales } from "../../utils/serialCalculation";
import { toApiEntryMethod } from "../../utils/enumParsers";
import { formatGbp } from "../../utils/currency";
import { EntryMethod, SellingOrder, ShiftStatus } from "../../types/enums";
import { ScratchCardPack } from "../../types/models";
import { MainStackParamList } from "../../types/navigation";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";
import { subscribeScan } from "../barcode-scanner/scanBus";

type Props = NativeStackScreenProps<MainStackParamList, "EnterClosingNumbers">;

type EntryState = {
  closingSerialNumber: string;
  originalScannedSerialNumber?: string;
  entryMethod: EntryMethod;
  manualEntryReason?: string;
};

const ENABLE_MOBILE_CAMERA_BARCODE_SCANNING_KEY = "EnableMobileCameraBarcodeScanning";
const ALLOW_MANUAL_ENTRY_IF_SCAN_FAILS_KEY = "AllowManualEntryIfScanFails";

function parseBooleanConfigValue(value: string | undefined, fallback: boolean) {
  if (!value) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes") {
    return true;
  }
  if (normalized === "false" || normalized === "0" || normalized === "no") {
    return false;
  }

  return fallback;
}

function normalizePackNumber(value: string) {
  return value.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

function normalizePackNumberWithoutLeadingZeros(value: string) {
  const normalized = normalizePackNumber(value).replace(/^0+/, "");
  return normalized.length > 0 ? normalized : "0";
}

function normalizeDashes(value: string) {
  return value.replace(/[\u2010\u2011\u2012\u2013\u2014\u2212\uFE58\uFE63\uFF0D]/g, "-");
}

function getPackNumberSegments(value: string) {
  return normalizeDashes(value)
    .split("-")
    .map((part) => normalizePackNumber(part))
    .filter((part) => part.length > 0);
}

function matchesScannedPackNumber(storedPackNumber: string, scannedPackNumber: string) {
  const storedNormalized = normalizePackNumber(storedPackNumber);
  const scannedNormalized = normalizePackNumber(scannedPackNumber);

  if (!storedNormalized || !scannedNormalized) {
    return false;
  }

  const storedNoZeros = normalizePackNumberWithoutLeadingZeros(storedPackNumber);
  const scannedNoZeros = normalizePackNumberWithoutLeadingZeros(scannedPackNumber);

  if (storedNormalized === scannedNormalized || storedNoZeros === scannedNoZeros) {
    return true;
  }

  const storedSegments = getPackNumberSegments(storedPackNumber);
  const scannedSegments = getPackNumberSegments(scannedPackNumber);
  const storedTail = storedSegments.length > 0 ? storedSegments[storedSegments.length - 1] : "";
  const scannedTail = scannedSegments.length > 0 ? scannedSegments[scannedSegments.length - 1] : "";
  const storedTailNoZeros = storedTail.replace(/^0+/, "") || "0";
  const scannedTailNoZeros = scannedTail.replace(/^0+/, "") || "0";

  if (storedTail.length >= 6 && (storedTail === scannedTail || storedTailNoZeros === scannedTailNoZeros)) {
    return true;
  }

  if (scannedTail.length >= 6) {
    const tailCandidates = [scannedTail, scannedTailNoZeros].filter((candidate) => candidate.length >= 6);
    if (tailCandidates.some((candidate) => storedNormalized.endsWith(candidate) || storedNoZeros.endsWith(candidate))) {
      return true;
    }
  }

  if (storedTail.length >= 6) {
    const tailCandidates = [storedTail, storedTailNoZeros].filter((candidate) => candidate.length >= 6);
    if (tailCandidates.some((candidate) => scannedNormalized.endsWith(candidate) || scannedNoZeros.endsWith(candidate))) {
      return true;
    }
  }

  return false;
}

function pushUnique(target: string[], value?: string) {
  if (!value) {
    return;
  }
  if (!target.includes(value)) {
    target.push(value);
  }
}

function normalizeScannedSerial(value?: string) {
  if (!value) {
    return "";
  }

  const digitsOnly = value.replace(/\D/g, "");
  if (digitsOnly.length > 0) {
    const compact = digitsOnly.length <= 3 ? digitsOnly : digitsOnly.slice(-3);
    const withoutLeadingZeros = compact.replace(/^0+/, "");
    return withoutLeadingZeros.length > 0 ? withoutLeadingZeros : "0";
  }

  return value.trim();
}

function normalizeClosingSerialInput(value?: string) {
  if (!value) {
    return "";
  }

  const digitsOnly = value.replace(/\D/g, "");
  if (!digitsOnly) {
    return "";
  }

  const withoutLeadingZeros = digitsOnly.replace(/^0+/, "");
  return withoutLeadingZeros.length > 0 ? withoutLeadingZeros : "0";
}

function getSerialCandidatesForPack(pack: ScratchCardPack, rawBarcode: string, parsedSerial: string) {
  const candidates: string[] = [];
  const compact = normalizeDashes(rawBarcode).replace(/\s+/g, "");
  const lastHyphen = compact.lastIndexOf("-");
  if (lastHyphen > -1 && lastHyphen < compact.length - 1) {
    const suffixDigits = compact.slice(lastHyphen + 1).replace(/\D/g, "");
    if (suffixDigits.length >= 3) {
      // Prefer the serial nearest to the explicit ticket suffix first.
      pushUnique(candidates, normalizeScannedSerial(suffixDigits.slice(0, 3)));
      pushUnique(candidates, normalizeScannedSerial(suffixDigits.slice(-3)));
    }
  }

  const digitsOnly = compact.replace(/\D/g, "");
  const packDigits = pack.packNumber.replace(/\D/g, "");

  if (packDigits && digitsOnly.includes(packDigits)) {
    const index = digitsOnly.indexOf(packDigits);
    const trailing = digitsOnly.slice(index + packDigits.length);

    if (trailing.length >= 3) {
      // Strongest signal: serial right after the target pack digits.
      pushUnique(candidates, normalizeScannedSerial(trailing.slice(0, 3)));
      pushUnique(candidates, normalizeScannedSerial(trailing.slice(-3)));
    }

    if (index >= 3) {
      // Some print formats place serial before pack digits.
      pushUnique(candidates, normalizeScannedSerial(digitsOnly.slice(index - 3, index)));
    }
  }

  if (digitsOnly.length >= 3) {
    pushUnique(candidates, normalizeScannedSerial(digitsOnly.slice(-3)));
    pushUnique(candidates, normalizeScannedSerial(digitsOnly.slice(0, 3)));
  }

  // Lowest priority: parser-derived serial may be wrong when scanner reads noisy bars.
  pushUnique(candidates, normalizeScannedSerial(parsedSerial));

  return candidates.filter((value) => value.length > 0);
}

function isValidSerialForPack(pack: ScratchCardPack, serial: string) {
  try {
    calculateShiftSales(
      pack.currentSerialNumber,
      serial,
      pack.startSerialNumber,
      pack.endSerialNumber,
      pack.sellingOrder,
      pack.ticketPrice,
      pack.totalTickets
    );
    return true;
  } catch {
    return false;
  }
}

function pickBestSerialForPack(pack: ScratchCardPack, rawBarcode: string, parsedSerial: string) {
  const candidates = getSerialCandidatesForPack(pack, rawBarcode, parsedSerial);
  const validCandidate = candidates.find((value) => isValidSerialForPack(pack, value));
  return validCandidate;
}

function getLastSerialForPack(pack: ScratchCardPack) {
  return pack.sellingOrder === SellingOrder.Descending
    ? pack.startSerialNumber
    : pack.endSerialNumber;
}

function formatCurrency(value: number) {
  return formatGbp(value);
}

function comparePacksByDisplayOrder(a: ScratchCardPack, b: ScratchCardPack) {
  const aDisplay = a.displayNumber;
  const bDisplay = b.displayNumber;

  if (aDisplay != null && bDisplay != null && aDisplay !== bDisplay) {
    return aDisplay - bDisplay;
  }
  if (aDisplay != null && bDisplay == null) return -1;
  if (aDisplay == null && bDisplay != null) return 1;

  return a.packNumber.localeCompare(b.packNumber);
}

export function EnterClosingNumbersScreen({ route, navigation }: Props) {
  const { shiftId, shopId } = route.params;
  const netInfo = useNetInfo();
  const queryClient = useQueryClient();
  const [entries, setEntries] = useState<Record<string, EntryState>>({});
  const [scanStatus, setScanStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [gameNameTooltipPackId, setGameNameTooltipPackId] = useState<string | null>(null);
  const packsRef = useRef<ScratchCardPack[]>([]);
  const entriesRef = useRef<Record<string, EntryState>>({});
  const gameNameTooltipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function openBarcodeScanner(params: {
    mode: "single" | "auto";
    packId?: string;
    packNumber?: string;
    pendingPacks?: Array<{ packId?: string; packNumber: string; label?: string }>;
  }) {
    if (!isCameraScanningEnabled) {
      Alert.alert(
        "Scanner disabled",
        "Camera barcode scanning is disabled for this shop. Enter closing serials in the textbox."
      );
      return;
    }
    if (params.mode === "auto" && (params.pendingPacks?.length ?? 0) === 0) {
      setScanStatus("All packs are already scanned.");
      return;
    }

    const rootLikeNavigation = navigation.getParent()?.getParent() ?? navigation.getParent() ?? navigation;
    (rootLikeNavigation as any).navigate("BarcodeScanner", params);
  }

  const packsQuery = useQuery({
    queryKey: ["shift-active-packs", shiftId],
    queryFn: () => getActivePacksForShift(shiftId),
  });

  const closingsQuery = useQuery({
    queryKey: ["shift-closing-numbers", shiftId],
    queryFn: () => listShiftClosingNumbers(shiftId),
  });

  const shiftQuery = useQuery({
    queryKey: ["shift", shiftId],
    queryFn: () => getShift(shiftId),
  });

  const businessDayQuery = useQuery({
    queryKey: ["business-day", shiftQuery.data?.businessDayId],
    queryFn: () => getBusinessDay(shiftQuery.data?.businessDayId as string),
    enabled: Boolean(shiftQuery.data?.businessDayId),
  });

  const configurationsQuery = useQuery({
    queryKey: ["configurations", shopId],
    queryFn: () => getConfigurations(shopId ?? undefined),
    enabled: Boolean(shopId),
  });

  const isCameraScanningEnabled = useMemo(() => {
    const configuredValue = configurationsQuery.data?.find(
      (item) => item.configKey.toLowerCase() === ENABLE_MOBILE_CAMERA_BARCODE_SCANNING_KEY.toLowerCase()
    )?.configValue;
    return parseBooleanConfigValue(configuredValue, true);
  }, [configurationsQuery.data]);

  const allowManualEntryIfScanFails = useMemo(() => {
    const configuredValue = configurationsQuery.data?.find(
      (item) => item.configKey.toLowerCase() === ALLOW_MANUAL_ENTRY_IF_SCAN_FAILS_KEY.toLowerCase()
    )?.configValue;
    return parseBooleanConfigValue(configuredValue, true);
  }, [configurationsQuery.data]);

  const isManualClosingSerialEnabled = isCameraScanningEnabled
    ? allowManualEntryIfScanFails
    : true;

  useEffect(() => {
    packsRef.current = [...(packsQuery.data ?? [])].sort(comparePacksByDisplayOrder);
  }, [packsQuery.data]);

  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  useEffect(() => {
    void (async () => {
      const draft = await getShiftDraft<{ entries: Record<string, EntryState> }>(shiftId);
      if (draft) {
        setEntries(draft.entries);
      }
    })();
  }, [shiftId]);

  // Server-stored closing numbers are the source of truth — merge them in so the screen shows
  // what was already saved (including from another device).
  useEffect(() => {
    if (!closingsQuery.data) {
      return;
    }
    setEntries((prev) => {
      const next = { ...prev };
      for (const closing of closingsQuery.data!) {
        next[closing.packId] = {
          closingSerialNumber: closing.closingSerialNumber,
          originalScannedSerialNumber: closing.originalScannedSerialNumber ?? undefined,
          entryMethod: closing.entryMethod,
          manualEntryReason: closing.manualEntryReason ?? undefined,
        };
      }
      return next;
    });
  }, [closingsQuery.data]);

  useEffect(() => () => {
    if (gameNameTooltipTimerRef.current) {
      clearTimeout(gameNameTooltipTimerRef.current);
    }
  }, []);

  function showGameNameTooltip(packId: string) {
    setGameNameTooltipPackId(packId);
    if (gameNameTooltipTimerRef.current) {
      clearTimeout(gameNameTooltipTimerRef.current);
    }
    gameNameTooltipTimerRef.current = setTimeout(() => {
      setGameNameTooltipPackId((previous) => (previous === packId ? null : previous));
    }, 1800);
  }

  useEffect(() => {
    const unsubscribe = subscribeScan((payload) => {
      const packs = packsRef.current;
      const matchedPack = (() => {
        if (payload.packId) {
          return packs.find((pack) => pack.id === payload.packId) ?? null;
        }

        if (!payload.parsedPackNumber) {
          return null;
        }

        const scannedPackNumber = payload.parsedPackNumber;
        const matchingPacks = packs.filter((pack) => matchesScannedPackNumber(pack.packNumber, scannedPackNumber));
        if (matchingPacks.length === 1) {
          return matchingPacks[0];
        }

        if (matchingPacks.length > 1) {
          setScanStatus(`Multiple active packs matched scanned code: ${payload.parsedPackNumber}. Scan from pack row to target one pack.`);
          return null;
        }

        return null;
      })();

      if (!matchedPack) {
        const fallbackSerial = normalizeScannedSerial(payload.parsedSerial || payload.rawBarcode);
        const normalizedParsedSerial = normalizeScannedSerial(payload.parsedSerial);
        if (payload.packId && fallbackSerial) {
          const targetPackId = payload.packId;
          const existingEntry = entriesRef.current[targetPackId];
          if (existingEntry?.closingSerialNumber?.trim()) {
            setScanStatus("Closing serial is already set. Clear the textbox first if you need to rescan.");
            return;
          }

          setScanStatus(`Captured ${fallbackSerial}. Pack is loading, verify and finalise.`);
          setEntries((previous) => ({
            ...previous,
            [targetPackId]: {
              closingSerialNumber: fallbackSerial,
              originalScannedSerialNumber: normalizedParsedSerial || fallbackSerial,
              entryMethod: EntryMethod.ScannedEdited,
              manualEntryReason: previous[targetPackId]?.manualEntryReason,
            },
          }));
          return;
        }

        setScanStatus(`No active pack matched scanned code: ${payload.rawBarcode}`);
        return;
      }

      const existingEntry = entriesRef.current[matchedPack.id];
      if (existingEntry?.closingSerialNumber?.trim()) {
        // setScanStatus(`Closing serial already set for pack ${matchedPack.packNumber}. Clear it first to scan again.`);
        return;
      }

      const resolvedSerial = pickBestSerialForPack(matchedPack, payload.rawBarcode, payload.parsedSerial);
      if (!resolvedSerial) {
        const fallbackSerial = normalizeScannedSerial(payload.parsedSerial || payload.rawBarcode);
        const normalizedParsedSerial = normalizeScannedSerial(payload.parsedSerial);
        if (fallbackSerial && isValidSerialForPack(matchedPack, fallbackSerial)) {
          setScanStatus(`Captured ${fallbackSerial} for pack ${matchedPack.packNumber}. Please verify before finalising.`);
          setEntries((previous) => ({
            ...previous,
            [matchedPack.id]: {
              closingSerialNumber: fallbackSerial,
              originalScannedSerialNumber: normalizedParsedSerial || fallbackSerial,
              entryMethod: EntryMethod.ScannedEdited,
              manualEntryReason: previous[matchedPack.id]?.manualEntryReason,
            },
          }));
          return;
        }

        setScanStatus(
          `Scanned value could not be validated for pack ${matchedPack.packNumber}.${isManualClosingSerialEnabled ? " Please rescan or enter manually." : " Please rescan."}`
        );
        return;
      }
      const normalizedParsedSerial = normalizeScannedSerial(payload.parsedSerial);
      const wasAdjusted = normalizedParsedSerial.length > 0 && resolvedSerial !== normalizedParsedSerial;

      setScanStatus(
        payload.parsedPackNumber
          ? `Applied ${resolvedSerial} to pack ${matchedPack.packNumber}${wasAdjusted ? ` (from ${normalizedParsedSerial})` : ""}${payload.barcodeType ? ` [${payload.barcodeType}]` : ""}.`
          : `Applied serial ${resolvedSerial}${wasAdjusted ? ` (from ${normalizedParsedSerial})` : ""}${payload.barcodeType ? ` [${payload.barcodeType}]` : ""}.`
      );

      setEntries((previous) => ({
        ...previous,
        [matchedPack.id]: {
          closingSerialNumber: resolvedSerial,
          originalScannedSerialNumber: normalizedParsedSerial || resolvedSerial,
          entryMethod: EntryMethod.Scanned,
          manualEntryReason: previous[matchedPack.id]?.manualEntryReason,
        },
      }));
    });

    return unsubscribe;
  }, [isManualClosingSerialEnabled]);

  const computedRows = useMemo(() => {
    const packs = [...(packsQuery.data ?? [])].sort(comparePacksByDisplayOrder);
    return packs.map((pack) => {
      const entry = entries[pack.id];
      if (!entry?.closingSerialNumber) {
        return {
          pack,
          soldQuantity: 0,
          salesAmount: 0,
          remainingTickets: pack.totalTickets,
          hasError: false,
          message: "",
        };
      }

      try {
        const calc = calculateShiftSales(
          pack.currentSerialNumber,
          entry.closingSerialNumber,
          pack.startSerialNumber,
          pack.endSerialNumber,
          pack.sellingOrder,
          pack.ticketPrice,
          pack.totalTickets
        );

        return {
          pack,
          soldQuantity: calc.soldQuantity,
          salesAmount: calc.salesAmount,
          remainingTickets: calc.remainingTickets,
          hasError: false,
          message: "",
        };
      } catch (error: any) {
        return {
          pack,
          soldQuantity: 0,
          salesAmount: 0,
          remainingTickets: pack.totalTickets,
          hasError: true,
          message: error.message,
        };
      }
    });
  }, [entries, packsQuery.data]);

  const totals = computedRows.reduce(
    (acc, row) => {
      acc.salesAmount += row.salesAmount;
      return acc;
    },
    { salesAmount: 0 }
  );
  const completedRows = computedRows.filter((row) => Boolean(entries[row.pack.id]?.closingSerialNumber) && !row.hasError).length;
  const errorRows = computedRows.filter((row) => row.hasError).length;
  const pendingRows = computedRows.filter((row) => !entries[row.pack.id]?.closingSerialNumber).length;
  const scannedRows = computedRows.length - pendingRows;
  const pendingPackHints = useMemo(
    () =>
      computedRows
        .filter((row) => !entries[row.pack.id]?.closingSerialNumber)
        .map((row) => ({
          packId: row.pack.id,
          packNumber: row.pack.packNumber,
          label: `Display ${row.pack.displayNumber != null ? `#${row.pack.displayNumber}` : "-"} | Pack ${row.pack.packNumber}`,
        })),
    [computedRows, entries]
  );
  // A shift with zero active packs is finalisable as a no-sales close — there's nothing for
  // the shopkeeper to scan or enter, so blocking them would leave the shift in limbo.
  const canFinalize = errorRows === 0 && pendingRows === 0 && !isSubmitting;
  const isOnline = Boolean(netInfo.isConnected);
  const readinessMessage = errorRows > 0
    ? "Resolve serial errors before finalising the shift."
    : pendingRows > 0
      ? isManualClosingSerialEnabled
        ? "Enter closing serial numbers for all active packs."
        : "Scan each pack to capture closing serial numbers for all active packs."
      : "All active packs are ready. You can finalise this shift.";

  async function onSaveClosingNumbers() {
    if (isSubmitting) {
      return;
    }

    const packs = packsQuery.data ?? [];
    const toSave = packs
      .map((pack) => ({ pack, entry: entries[pack.id] }))
      .filter((x): x is { pack: ScratchCardPack; entry: EntryState } => Boolean(x.entry?.closingSerialNumber));

    if (toSave.length === 0) {
      Alert.alert("Nothing to save", "Enter at least one closing number first.");
      return;
    }

    // Block any entered-but-invalid serial (out of range / negative sold).
    const errored = computedRows.find((row) => entries[row.pack.id]?.closingSerialNumber && row.hasError);
    if (errored) {
      Alert.alert("Validation", `Fix closing serial for pack ${errored.pack.packNumber}.`);
      return;
    }

    if (!isManualClosingSerialEnabled) {
      const manualEntryPack = toSave.find((x) => x.entry.entryMethod === EntryMethod.Manual);
      if (manualEntryPack) {
        Alert.alert("Validation", `Manual entry is disabled. Scan pack ${manualEntryPack.pack.packNumber} instead.`);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      for (const { pack, entry } of toSave) {
        const wasEdited =
          entry.originalScannedSerialNumber &&
          entry.originalScannedSerialNumber !== entry.closingSerialNumber;
        await upsertShiftClosingNumber(shiftId, {
          packId: pack.id,
          closingSerialNumber: entry.closingSerialNumber,
          originalScannedSerialNumber: entry.originalScannedSerialNumber,
          entryMethod: toApiEntryMethod(
            entry.entryMethod === EntryMethod.Scanned && wasEdited
              ? EntryMethod.ScannedEdited
              : entry.entryMethod
          ),
          manualEntryReason: entry.manualEntryReason,
        });
      }

      await clearShiftDraft(shiftId);
      await queryClient.invalidateQueries({ queryKey: ["shift-closing-numbers", shiftId] });
      haptics.success();
      track("closing_numbers_saved", { shiftId, shopId, count: toSave.length });
      Alert.alert("Saved", `${toSave.length} closing number${toSave.length === 1 ? "" : "s"} saved. Finalise the shift from the Close Shift screen.`);
      navigation.goBack();
    } catch (error: any) {
      haptics.error();
      Alert.alert("Failed", error?.response?.data?.message ?? "Unable to save closing numbers.");
    } finally {
      setIsSubmitting(false);
    }
  }

  // Up to three pack numbers shown inline; the rest collapsed into "+N more" so the footer
  // doesn't grow unbounded if the shopkeeper has many active packs.
  const pendingPackList = pendingPackHints.slice(0, 3).map((p) => `#${p.packNumber}`).join(", ");
  const pendingPackOverflow = pendingPackHints.length > 3 ? ` +${pendingPackHints.length - 3} more` : "";
  const blockingReason: string = !isSubmitting
    ? (errorRows > 0
        ? `${errorRows} pack${errorRows === 1 ? "" : "s"} have a serial error — tap each red row to fix.`
        : pendingRows > 0
          ? `${pendingRows} pack${pendingRows === 1 ? "" : "s"} still need a closing serial${pendingPackList ? ` (${pendingPackList}${pendingPackOverflow})` : ""}.`
          : "")
    : "";
  const readyProgress = computedRows.length > 0
    ? `${completedRows} of ${computedRows.length} pack${computedRows.length === 1 ? "" : "s"} ready`
    : "No active packs — this will be a zero-sales close.";

  const finalizeFooter = (
    <View style={[ui.card, styles.fixedFooterCard]}>
      <View style={styles.finalizeFooterContent}>
        {readyProgress ? (
          <View style={styles.finalizeProgressRow}>
            <Text style={styles.finalizeProgressText}>{readyProgress}</Text>
            {errorRows > 0 ? (
              <Text style={[styles.finalizeProgressText, styles.finalizeProgressTextError]}>
                {errorRows} error{errorRows === 1 ? "" : "s"}
              </Text>
            ) : null}
          </View>
        ) : null}
        {!canFinalize && blockingReason ? (
          <Text
            style={[styles.meta, errorRows > 0 ? styles.finalizeProgressTextError : null]}
            accessibilityLiveRegion="polite"
          >
            {blockingReason}
          </Text>
        ) : null}

        <PrimaryButton
          label={isSubmitting ? "Saving..." : "Save Closing Numbers"}
          icon="save-outline"
          onPress={onSaveClosingNumbers}
          disabled={isSubmitting}
        />
      </View>
    </View>
  );

  return (
    <ScreenContainer footer={finalizeFooter} keyboardScrollOffset={160}>
      <View style={styles.content}>
        <View style={[ui.card, styles.summaryCard]}>
          <View style={styles.summaryHeaderRow}>
            <Text style={styles.summaryTitle} numberOfLines={1}>
              {shiftQuery.data?.shiftName ?? "-"}
            </Text>
            <Text style={styles.summaryDate} numberOfLines={1}>
              {businessDayQuery.data?.businessDate ?? "-"}
            </Text>
          </View>
          {/* <View style={styles.progressRow}> */}
            {/* <View style={styles.progressTile}>
              <Text style={styles.progressLabel}>Active Packs</Text>
              <Text style={styles.progressValue}>{computedRows.length}</Text>
            </View>
            <View style={styles.progressTile}>
              <Text style={styles.progressLabel}>Ready</Text>
              <Text style={styles.progressValue}>{completedRows}</Text>
            </View> */}
            {/* <View style={styles.progressTile}>
              <Text style={styles.progressLabel}>Pending</Text>
              <Text style={styles.progressValue}>{pendingRows}</Text>
            </View>
            <View style={styles.progressTile}>
              <Text style={styles.progressLabel}>Issues</Text>
              <Text style={styles.progressValue}>{errorRows}</Text>
            </View> */}
          {/* </View> */}
          {/* <Text style={styles.meta}>{readinessMessage}</Text> */}

          {computedRows.length > 0 ? (
            <View style={styles.scanProgressRow}>
              <Text style={styles.scanProgressText}>
                {scannedRows} scanned · {pendingRows} pending
              </Text>
              {errorRows > 0 ? (
                <Text style={[styles.scanProgressText, styles.finalizeProgressTextError]}>
                  {errorRows} error{errorRows === 1 ? "" : "s"}
                </Text>
              ) : null}
            </View>
          ) : null}

              {isCameraScanningEnabled ? (
            <PrimaryButton
              label="Scan Any Pack"
              tone="neutral"
              onPress={() =>
                openBarcodeScanner({
                  mode: "auto",
                  pendingPacks: pendingPackHints,
                })
              }
              disabled={isSubmitting}
            />
          ) : (
            <Text style={styles.meta}>Camera scanning is disabled for this shop. Use the closing serial textbox.</Text>
          )}
        </View>

        {/* <View style={[ui.card, styles.quickScanCard]}> */}
          {/* <Text style={styles.cardTitle}>Quick Scan</Text>
          <Text style={styles.meta}>Scan continuously and auto-apply closing serials by pack.</Text> */}
      
          {/* <Text style={styles.meta}>{readinessMessage}</Text> */}
          {/* {scanStatus ? <Text style={styles.scanStatus}>{scanStatus}</Text> : null} */}
        {/* </View> */}

        {computedRows.length === 0 ? (
          <View style={[ui.card, styles.compactCard]}>
            <Text style={styles.cardTitle}>No Active Packs</Text>
            <Text style={styles.meta}>
              No packs are currently active for this shift's shop. You can still finalise the shift
              as a zero-sales close, or activate packs first.
            </Text>
            <PrimaryButton
              label="Go To Packs"
              tone="neutral"
              onPress={() => navigation.navigate("ScratchCardPacks")}
            />
          </View>
        ) : null}

        {computedRows.map((row) => {
          const entry = entries[row.pack.id];
          const hasClosingSerial = Boolean(entry?.closingSerialNumber?.trim());
          // Pre-fill the opening serial as a suggested starting point so the box is never blank.
          // It is shown muted and the pack stays "Pending" until actually scanned or edited.
          const openingSerialDefault = normalizeClosingSerialInput(row.pack.currentSerialNumber);
          const isFlagged =
            entry?.entryMethod === EntryMethod.Manual ||
            (entry?.originalScannedSerialNumber &&
              entry.originalScannedSerialNumber !== entry.closingSerialNumber);
          const rowStatusLabel = row.hasError ? "Error" : entry?.closingSerialNumber ? "Ready" : "Pending";
          const rowStatusTone: "danger" | "success" | "warning" = row.hasError ? "danger" : entry?.closingSerialNumber ? "success" : "warning";
          const isPendingRow = rowStatusLabel === "Pending";
          const isReadyRow = rowStatusLabel === "Ready";

          return (
            <View
              style={[
                ui.card,
                styles.packCard,
                isPendingRow ? styles.packCardPending : null,
                isReadyRow ? styles.packCardReady : null,
              ]}
              key={row.pack.id}
            >
              <View style={styles.packHeaderRow}>
                <Pressable
                  style={styles.packTitlePressable}
                  onPress={() => showGameNameTooltip(row.pack.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Show game name for pack ${row.pack.packNumber}`}
                >
                  <Text style={styles.packTitle} numberOfLines={1}>
                    {row.pack.displayNumber != null ? `#${row.pack.displayNumber} | ` : ""}
                    Pack - {row.pack.packNumber}
                  </Text>
                </Pressable>
                <Text style={styles.packMeta}>Opening: {row.pack.currentSerialNumber}</Text>
                {/* <StatusBadge label={rowStatusLabel} tone={rowStatusTone} /> */}
              </View>
              {gameNameTooltipPackId === row.pack.id ? (
                <Text style={styles.packTooltip}>{row.pack.gameName}</Text>
              ) : null}

              {/* <Text style={styles.fieldLabel}>Closing Serial Number</Text> */}
              <View style={styles.scanInputRow}>
                <View style={styles.scanInputCell}>
                  <TextInput
                    style={[
                      styles.input,
                      styles.inlineSerialInput,
                      !hasClosingSerial ? styles.inlineSerialInputDefault : null,
                      !isManualClosingSerialEnabled ? styles.inputDisabled : null,
                    ]}
                    value={entry?.closingSerialNumber || openingSerialDefault}
                    placeholder={isManualClosingSerialEnabled ? "Serial no" : "Scan required"}
                    placeholderTextColor={appTheme.colors.textSubtle}
                    keyboardType="numeric"
                    editable={isManualClosingSerialEnabled}
                    onChangeText={(value) => {
                      if (!isManualClosingSerialEnabled) {
                        return;
                      }
                      const normalizedValue = normalizeClosingSerialInput(value);

                      setEntries((previous) => ({
                        ...previous,
                        [row.pack.id]: {
                          closingSerialNumber: normalizedValue,
                          originalScannedSerialNumber: previous[row.pack.id]?.originalScannedSerialNumber,
                          entryMethod: previous[row.pack.id]?.originalScannedSerialNumber
                            ? EntryMethod.ScannedEdited
                            : EntryMethod.Manual,
                          manualEntryReason: previous[row.pack.id]?.manualEntryReason,
                        },
                      }));
                    }}
                  />
                </View>

                <View style={styles.scanInputCell}>
                  <Pressable
                    style={[
                      styles.soldOutButton,
                      (!isManualClosingSerialEnabled || isSubmitting) ? styles.actionButtonDisabled : null,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`Mark pack ${row.pack.packNumber} as sold out`}
                    disabled={!isManualClosingSerialEnabled || isSubmitting}
                    onPress={() => {
                      // Marking sold-out sets the closing serial to the end of the pack which
                      // cannot be undone short of editing the textbox — confirm first so a
                      // mis-tap doesn't silently empty the inventory.
                      const soldOutSerial = normalizeClosingSerialInput(getLastSerialForPack(row.pack));
                      haptics.warning();
                      Alert.alert(
                        "Mark pack as sold out?",
                        `Pack ${row.pack.packNumber} closing serial will be set to ${soldOutSerial}.`,
                        [
                          { text: "Cancel", style: "cancel" },
                          {
                            text: "Mark sold out",
                            style: "destructive",
                            onPress: () => {
                              haptics.success();
                              setEntries((previous) => ({
                                ...previous,
                                [row.pack.id]: {
                                  closingSerialNumber: soldOutSerial,
                                  originalScannedSerialNumber: previous[row.pack.id]?.originalScannedSerialNumber,
                                  entryMethod: previous[row.pack.id]?.originalScannedSerialNumber
                                    ? EntryMethod.ScannedEdited
                                    : EntryMethod.Manual,
                                  manualEntryReason: previous[row.pack.id]?.manualEntryReason,
                                },
                              }));
                            },
                          },
                        ],
                      );
                    }}
                  >
                    <Text style={styles.soldOutButtonText}>Sold Out</Text>
                  </Pressable>
                </View>

                <View style={styles.scanInputCell}>
                  <Pressable
                    style={[
                      styles.inlineScanButton,
                      (!isCameraScanningEnabled || isSubmitting) ? styles.actionButtonDisabled : null,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`Scan barcode for pack ${row.pack.packNumber}`}
                    disabled={!isCameraScanningEnabled || isSubmitting}
                    onPress={() => openBarcodeScanner({ mode: "single", packId: row.pack.id, packNumber: row.pack.packNumber })}
                  >
                    <View style={styles.scanIconWrap}>
                      <View style={[styles.scanCorner, styles.scanCornerTopLeft]} />
                      <View style={[styles.scanCorner, styles.scanCornerTopRight]} />
                      <View style={[styles.scanCorner, styles.scanCornerBottomLeft]} />
                      <View style={[styles.scanCorner, styles.scanCornerBottomRight]} />

                      <View style={styles.inlineScanGlyph}>
                        <View style={[styles.barcodeBar, styles.barcodeBarThin]} />
                        <View style={[styles.barcodeBar, styles.barcodeBarWide]} />
                        <View style={[styles.barcodeBar, styles.barcodeBarThin]} />
                        <View style={[styles.barcodeBar, styles.barcodeBarMedium]} />
                        <View style={[styles.barcodeBar, styles.barcodeBarThin]} />
                        <View style={[styles.barcodeBar, styles.barcodeBarWide]} />
                        <View style={[styles.barcodeBar, styles.barcodeBarThin]} />
                      </View>
                    </View>
                  </Pressable>
                </View>
              </View>

              {entry?.originalScannedSerialNumber ? (
                <Text style={styles.meta}>Original scanned serial: {entry.originalScannedSerialNumber}</Text>
              ) : null}

              {/* {isFlagged ? <StatusBadge label="Edited serial" tone="warning" /> : null} */}
              {row.hasError ? <Text style={styles.error}>{row.message}</Text> : null}

              {hasClosingSerial ? (
                <View style={styles.metricsInlineRow}>
                  <Text style={[styles.packMeta, styles.metricsInlineItem]}>
                    Price {formatCurrency(row.pack.ticketPrice)}
                  </Text>
                  <Text style={[styles.packMeta, styles.metricsInlineItemCenter]}>
                    Qty {row.soldQuantity}
                  </Text>
                  <Text style={[styles.packMeta, styles.metricsInlineItemRight]}>
                    Sales {formatCurrency(row.salesAmount)}
                  </Text>
                </View>
              ) : null}
            </View>
          );
        })}

        <View style={[ui.card, styles.compactCard]}>
          <Text style={styles.cardTitle}>Total sales: {formatCurrency(totals.salesAmount)}</Text>
        </View>

      </View>
    </ScreenContainer>
  );
}
const styles = StyleSheet.create({
  content: {
    gap: appTheme.spacing.sm,
    paddingBottom: appTheme.spacing.xl * 2 + appTheme.spacing.sm,
  },
  fixedFooterCard: {
    paddingVertical: appTheme.spacing.sm,
    marginBottom: Platform.OS === "android" ? appTheme.spacing.sm : 0,
  },
  finalizeFooterContent: {
    gap: 6,
  },
  finalizeProgressRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: appTheme.spacing.xs,
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
  compactCard: {
    gap: appTheme.spacing.sm,
  },
  summaryCard: {
    gap: appTheme.spacing.xs,
  },
  summaryHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: appTheme.spacing.sm,
  },
  summaryHeading: {
    flex: 1,
    gap: 2,
  },
  summaryEyebrow: {
    color: appTheme.colors.textSubtle,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 15,
    letterSpacing: 0.2,
    textTransform: "uppercase",
  },
  summaryTitle: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.heading,
    fontSize: 18,
    lineHeight: 22,
    flex: 1,
  },
  summaryDate: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 16,
    textAlign: "right",
  },
  summaryStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: appTheme.spacing.xs,
  },
  progressRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: appTheme.spacing.xs,
  },
  progressTile: {
    width: "48.8%",
    borderWidth: 0,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceTint,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: appTheme.spacing.sm,
    gap: 2,
  },
  progressLabel: {
    color: appTheme.colors.textSubtle,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 11,
    lineHeight: 14,
    textTransform: "uppercase",
  },
  progressValue: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.heading,
    fontSize: 17,
    lineHeight: 21,
  },
  quickScanCard: {
    gap: appTheme.spacing.sm,
  },
  packCard: {
    gap: appTheme.spacing.xs,
  },
  packCardPending: {
    backgroundColor: appTheme.colors.surface,
    borderWidth: 0.8,
    borderColor: appTheme.colors.borderWarningSoft,
  },
  packCardReady: {
    backgroundColor: appTheme.colors.surface,
    borderWidth: 0.8,
    borderColor: appTheme.colors.borderSuccessSoft,
  },
  cardTitle: {
    fontSize: 18,
    lineHeight: 23,
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
  },
  fieldLabel: {
    color: appTheme.colors.text,
    fontSize: 13,
    lineHeight: 16,
    fontFamily: appTheme.fonts.bodyMedium,
    marginTop: 2,
  },
  meta: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.body,
    lineHeight: 18,
    fontSize: 13,
  },
  packTitle: {
    fontSize: 15,
    lineHeight: 19,
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    flex: 1,
  },
  packTitlePressable: {
    flex: 1,
  },
  packTooltip: {
    alignSelf: "flex-start",
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.body,
    fontSize: 12,
    lineHeight: 15,
    backgroundColor: appTheme.colors.surfaceMuted,
    borderRadius: appTheme.radius.sm,
    paddingHorizontal: appTheme.spacing.xs,
    paddingVertical: 4,
  },
  packHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: appTheme.spacing.sm,
  },
  packMeta: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.body,
    lineHeight: 16,
    fontSize: 12,
  },
  packMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: appTheme.spacing.sm,
  },
  packMetaRight: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    lineHeight: 18,
    fontSize: 13,
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
  inputDisabled: {
    opacity: 0.6,
  },
  scanInputRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 6,
  },
  scanInputCell: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
  },
  inlineScanButton: {
    width: "100%",
    height: 38,
    borderWidth: 0,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceInfoSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  soldOutButton: {
    width: "100%",
    height: 38,
    borderWidth: 0,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceTintSoft,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  soldOutButtonText: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 11,
    lineHeight: 13,
  },
  actionButtonDisabled: {
    opacity: 0.55,
  },
  scanIconWrap: {
    width: 18,
    height: 18,
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  scanCorner: {
    position: "absolute",
    width: 5,
    height: 5,
    borderColor: appTheme.colors.textSubtle,
  },
  scanCornerTopLeft: {
    top: 0.5,
    left: 0.5,
    borderTopWidth: 1.5,
    borderLeftWidth: 1.5,
  },
  scanCornerTopRight: {
    top: 0.5,
    right: 0.5,
    borderTopWidth: 1.5,
    borderRightWidth: 1.5,
  },
  scanCornerBottomLeft: {
    bottom: 0.5,
    left: 0.5,
    borderBottomWidth: 1.5,
    borderLeftWidth: 1.5,
  },
  scanCornerBottomRight: {
    bottom: 0.5,
    right: 0.5,
    borderBottomWidth: 1.5,
    borderRightWidth: 1.5,
  },
  inlineScanGlyph: {
    flexDirection: "row",
    alignItems: "flex-end",
    height: 11,
    gap: 1,
  },
  barcodeBar: {
    backgroundColor: appTheme.colors.text,
    borderRadius: 0.5,
  },
  barcodeBarThin: {
    width: 1.5,
    height: 7,
  },
  barcodeBarMedium: {
    width: 2,
    height: 9,
  },
  barcodeBarWide: {
    width: 2.5,
    height: 11,
  },
  inlineSerialInput: {
    width: "100%",
    height: 38,
    paddingVertical: 6,
  },
  inlineSerialInputDefault: {
    // Suggested opening serial — muted so it reads as a default, not a confirmed entry.
    color: appTheme.colors.textSubtle,
  },
  scanProgressRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: appTheme.spacing.xs,
  },
  scanProgressText: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 16,
  },
  readonly: {
    color: appTheme.colors.info,
    fontFamily: appTheme.fonts.bodyMedium,
    lineHeight: 20,
    fontSize: 15,
  },
  metricsBlock: {
    marginTop: 2,
  },
  metricsInlineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: appTheme.spacing.sm,
  },
  metricsInlineItem: {
    flex: 1,
  },
  metricsInlineItemCenter: {
    flex: 1,
    textAlign: "center",
  },
  metricsInlineItemRight: {
    flex: 1,
    textAlign: "right",
  },
  metricsRow: {
    flexDirection: "row",
    gap: appTheme.spacing.xs,
  },
  metricTile: {
    flex: 1,
    backgroundColor: appTheme.colors.surfaceTint,
    borderRadius: appTheme.radius.sm,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: appTheme.spacing.xs,
    gap: 2,
  },
  metricLabel: {
    color: appTheme.colors.textSubtle,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 11,
    lineHeight: 14,
    textTransform: "uppercase",
  },
  metricValue: {
    color: appTheme.colors.info,
    fontFamily: appTheme.fonts.bodyMedium,
    lineHeight: 18,
    fontSize: 13,
  },
  metricValueRight: {
    textAlign: "right",
  },
  error: {
    color: appTheme.colors.danger,
    fontFamily: appTheme.fonts.bodyMedium,
    lineHeight: 18,
    fontSize: 13,
  },
  scanStatus: {
    color: appTheme.colors.info,
    fontFamily: appTheme.fonts.bodyMedium,
    lineHeight: 18,
    fontSize: 13,
    borderWidth: 0,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceInfoMuted,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: appTheme.spacing.xs,
  },
  actionGroup: {
    gap: appTheme.spacing.xs,
    marginTop: 2,
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
  attachmentRemoveButton: {
    borderWidth: 1,
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
});


