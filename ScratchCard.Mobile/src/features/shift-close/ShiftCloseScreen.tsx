import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import NetInfo, { useNetInfo } from "@react-native-community/netinfo";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { getBusinessDay } from "../../api/businessDaysApi";
import { getConfigurations } from "../../api/configurationsApi";
import { getActivePacksForShift, finalizeShift, getShift } from "../../api/shiftsApi";
import { PrimaryButton } from "../../components/PrimaryButton";
import { ScreenContainer } from "../../components/ScreenContainer";
import { StatusBadge } from "../../components/StatusBadge";
import { enqueueOfflineShiftClose } from "../../offline/queueRepository";
import { clearShiftDraft, getShiftDraft } from "../../offline/draftRepository";
import { calculateShiftSales } from "../../utils/serialCalculation";
import { toApiEntryMethod } from "../../utils/enumParsers";
import { EntryMethod, SellingOrder, ShiftStatus } from "../../types/enums";
import { ScratchCardPack } from "../../types/models";
import { MainStackParamList } from "../../types/navigation";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";
import { subscribeScan } from "../barcode-scanner/scanBus";

type Props = NativeStackScreenProps<MainStackParamList, "ShiftClose">;

type EntryState = {
  closingSerialNumber: string;
  originalScannedSerialNumber?: string;
  entryMethod: EntryMethod;
  manualEntryReason?: string;
};

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

function getShiftStatusTone(status?: string): "neutral" | "warning" | "danger" | "success" {
  if (!status) return "neutral";
  if (status === ShiftStatus.Open) return "success";
  if (status === ShiftStatus.Scheduled) return "warning";
  if (status === ShiftStatus.Reopened) return "warning";
  if (status === ShiftStatus.Closed || status === ShiftStatus.Approved) return "neutral";
  return "neutral";
}

function getBusinessDayStatusTone(status?: string): "neutral" | "warning" | "danger" | "success" {
  if (!status) return "neutral";
  if (status === "Closed") return "success";
  if (status === "ReadyToClose") return "warning";
  if (status === "Reopened") return "danger";
  return "neutral";
}

function formatCurrency(value: number) {
  return `\u00A3 ${value.toFixed(2)}`;
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

export function ShiftCloseScreen({ route, navigation }: Props) {
  const { shiftId, shopId } = route.params;
  const netInfo = useNetInfo();
  const queryClient = useQueryClient();
  const [entries, setEntries] = useState<Record<string, EntryState>>({});
  const [scanStatus, setScanStatus] = useState<string | null>(null);
  const [closeAttachments, setCloseAttachments] = useState<CloseAttachmentState[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const packsRef = useRef<ScratchCardPack[]>([]);
  const entriesRef = useRef<Record<string, EntryState>>({});

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

  async function selectCloseAttachments() {
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
      Alert.alert("Attachment failed", "Unable to read selected attachment(s).");
      return;
    }

    setCloseAttachments((previous) => {
      const combined = [...previous, ...selected];
      if (combined.length <= MAX_CLOSE_ATTACHMENTS) {
        return combined;
      }

      Alert.alert("Attachment limit", "A maximum of 10 attachments can be added.");
      return combined.slice(0, MAX_CLOSE_ATTACHMENTS);
    });
  }

  const packsQuery = useQuery({
    queryKey: ["shift-active-packs", shiftId],
    queryFn: () => getActivePacksForShift(shiftId),
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
        setScanStatus(`Closing serial already set for pack ${matchedPack.packNumber}. Clear it first to scan again.`);
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
  const pendingPackHints = useMemo(
    () =>
      computedRows
        .filter((row) => !entries[row.pack.id]?.closingSerialNumber)
        .map((row) => ({
          packId: row.pack.id,
          packNumber: row.pack.packNumber,
          label: `${row.pack.displayNumber != null ? `#${row.pack.displayNumber} - ` : ""}${row.pack.gameName}`,
        })),
    [computedRows, entries]
  );
  const canFinalize = computedRows.length > 0 && pendingRows === 0 && errorRows === 0 && !isSubmitting;
  const isOnline = Boolean(netInfo.isConnected);
  const readinessMessage = errorRows > 0
    ? "Resolve serial errors before finalising the shift."
    : pendingRows > 0
      ? isManualClosingSerialEnabled
        ? "Enter closing serial numbers for all active packs."
        : "Scan each pack to capture closing serial numbers for all active packs."
      : "All active packs are ready. You can finalise this shift.";

  async function onFinalize() {
    if (isSubmitting) {
      return;
    }

    const packs = packsQuery.data ?? [];
    if (packs.length === 0) {
      Alert.alert("No active packs", "No active packs are available for shift close.");
      return;
    }

    for (const row of computedRows) {
      if (!entries[row.pack.id]?.closingSerialNumber || row.hasError) {
        Alert.alert("Validation", `Fix closing serial for pack ${row.pack.packNumber}.`);
        return;
      }
    }

    if (!isManualClosingSerialEnabled) {
      const manualEntryPack = computedRows.find((row) => entries[row.pack.id]?.entryMethod === EntryMethod.Manual);
      if (manualEntryPack) {
        Alert.alert("Validation", `Manual entry is disabled. Scan pack ${manualEntryPack.pack.packNumber} instead.`);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const payload = {
        attachments: closeAttachments.map((attachment) => ({
          fileName: attachment.fileName,
          base64: attachment.base64,
          contentType: attachment.contentType,
        })),
        entries: packs.map((pack) => {
          const entry = entries[pack.id];
          const wasEdited =
            entry.originalScannedSerialNumber &&
            entry.originalScannedSerialNumber !== entry.closingSerialNumber;

          return {
            packId: pack.id,
            closingSerialNumber: entry.closingSerialNumber,
            originalScannedSerialNumber: entry.originalScannedSerialNumber,
            entryMethod: toApiEntryMethod(
              entry.entryMethod === EntryMethod.Scanned && wasEdited
                ? EntryMethod.ScannedEdited
                : entry.entryMethod
            ),
            manualEntryReason: entry.manualEntryReason,
          };
        }),
      };

      const connection = await NetInfo.fetch();

      if (!connection.isConnected) {
        await enqueueOfflineShiftClose(shiftId, shopId, {
          shiftId,
          shopId,
          localCreatedOn: new Date().toISOString(),
          payload,
        });
        await clearShiftDraft(shiftId);
        Alert.alert("Offline Mode", "Shift saved as Pending Sync.");
        return;
      }

      await finalizeShift(shiftId, payload);
      await clearShiftDraft(shiftId);
      await Promise.allSettled([
        queryClient.invalidateQueries({ queryKey: ["shift", shiftId] }),
        queryClient.invalidateQueries({ queryKey: ["shift-sales", shiftId] }),
        queryClient.invalidateQueries({ queryKey: ["shift-active-packs", shiftId] }),
        queryClient.invalidateQueries({ queryKey: ["shifts"] }),
        queryClient.invalidateQueries({ queryKey: ["business-day"] }),
        queryClient.invalidateQueries({ queryKey: ["business-days"] }),
        queryClient.invalidateQueries({ queryKey: ["close-shift-candidates"] }),
        queryClient.invalidateQueries({ queryKey: ["day-shift-sales-totals"] }),
        queryClient.invalidateQueries({ queryKey: ["day-summary-closed-shift-sales"] }),
      ]);

      const relatedBusinessDayId = shiftQuery.data?.businessDayId;
      const relatedShopId = shiftQuery.data?.shopId ?? shopId;

      await Promise.allSettled([
        relatedBusinessDayId
          ? queryClient.refetchQueries({ queryKey: ["business-day", relatedBusinessDayId], type: "all" })
          : Promise.resolve(),
        relatedBusinessDayId && relatedShopId
          ? queryClient.refetchQueries({ queryKey: ["shifts", relatedShopId, relatedBusinessDayId], type: "all" })
          : Promise.resolve(),
        relatedShopId
          ? queryClient.refetchQueries({ queryKey: ["business-days", relatedShopId], type: "all" })
          : Promise.resolve(),
        relatedShopId
          ? queryClient.refetchQueries({ queryKey: ["business-days-for-picker", relatedShopId], type: "all" })
          : Promise.resolve(),
      ]);

      Alert.alert("Shift finalised", "Shift close submitted successfully.");
      navigation.goBack();
    } catch (error: any) {
      Alert.alert("Failed", error?.response?.data?.message ?? "Shift close failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[ui.card, styles.summaryCard]}>
          <View style={styles.summaryHeaderRow}>
            <View style={styles.summaryHeading}>
              {/* <Text style={styles.summaryEyebrow}>Shift Close</Text> */}
              <Text style={styles.summaryTitle}>{shiftQuery.data?.shiftName ?? "-"}</Text>
              <Text style={styles.meta}>Business Date: {businessDayQuery.data?.businessDate ?? "-"}</Text>
            </View>
            <StatusBadge label={shiftQuery.data?.status ?? "-"} tone={getShiftStatusTone(shiftQuery.data?.status)} />
          </View>
          <View style={styles.summaryStatusRow}>
            {/* <StatusBadge
              label={businessDayQuery.data?.status ?? "-"}
              tone={getBusinessDayStatusTone(businessDayQuery.data?.status)}
            /> */}
            {/* <StatusBadge label={isOnline ? "Online" : "Offline"} tone={isOnline ? "success" : "warning"} /> */}
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
        </View>

        {/* <View style={[ui.card, styles.quickScanCard]}> */}
          {/* <Text style={styles.cardTitle}>Quick Scan</Text>
          <Text style={styles.meta}>Scan continuously and auto-apply closing serials by pack.</Text> */}
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
          {!isManualClosingSerialEnabled && isCameraScanningEnabled ? (
            <Text style={styles.meta}>Manual closing serial entry is disabled. Use scan for each pack.</Text>
          ) : null}
          <Text style={styles.meta}>{readinessMessage}</Text>
          {scanStatus ? <Text style={styles.scanStatus}>{scanStatus}</Text> : null}
        {/* </View> */}

        {computedRows.length === 0 ? (
          <View style={[ui.card, styles.compactCard]}>
            <Text style={styles.cardTitle}>No Active Packs</Text>
            <Text style={styles.meta}>No packs are currently active for this shift's shop.</Text>
            <Text style={styles.meta}>Activate packs from Scratch Card Packs before closing the shift.</Text>
            <PrimaryButton
              label="Go To Packs"
              tone="neutral"
              onPress={() => navigation.navigate("ScratchCardPacks")}
            />
          </View>
        ) : null}

        {computedRows.map((row) => {
          const entry = entries[row.pack.id];
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
                <Text style={styles.packTitle}>
                  {row.pack.displayNumber != null ? `#${row.pack.displayNumber} - ` : ""}{row.pack.gameName}
                </Text>
                {/* <StatusBadge label={rowStatusLabel} tone={rowStatusTone} /> */}
              </View>

              {/* <Text style={styles.packMeta}>Pack: {row.pack.packNumber}</Text> */}
              <View style={styles.packMetaRow}>
                <Text style={styles.packMeta}>Pack: {row.pack.packNumber}</Text>
                <Text style={styles.packMeta}>Opening serial: {row.pack.currentSerialNumber}</Text>
                {/* <Text style={styles.packMetaRight}>Price {formatCurrency(row.pack.ticketPrice)}</Text> */}
              </View>

              <Text style={styles.fieldLabel}>Closing Serial Number</Text>
              <View style={styles.scanInputRow}>
                <View style={styles.scanInputCell}>
                  <TextInput
                    style={[styles.input, styles.inlineSerialInput, !isManualClosingSerialEnabled ? styles.inputDisabled : null]}
                    value={entry?.closingSerialNumber ?? ""}
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
                      const soldOutSerial = normalizeClosingSerialInput(getLastSerialForPack(row.pack));
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

              {isFlagged ? <StatusBadge label="Edited serial" tone="warning" /> : null}
              {row.hasError ? <Text style={styles.error}>{row.message}</Text> : null}

              <View style={styles.metricsBlock}>
                <View style={styles.metricsRow}>
                   {/* <View style={styles.metricTile}>
                    <Text style={styles.metricLabel}>Sold Qty</Text>
                    <Text style={styles.metricValue}>{row.soldQuantity}</Text>
                  </View> */}
                   <View style={styles.metricTile}>
                <Text style={styles.metricLabel}>Price</Text>
                <Text style={styles.metricValue}> {formatCurrency(row.pack.ticketPrice)}</Text>
              </View>
                  <View style={styles.metricTile}>
                    <Text style={styles.metricLabel}>Sold Qty</Text>
                    <Text style={styles.metricValue}>{row.soldQuantity}</Text>
                  </View>
                  <View style={styles.metricTile}>
                    <Text style={styles.metricLabel}>Sales Amount</Text>
                    <Text style={[styles.metricValue, styles.metricValueRight]}>{formatCurrency(row.salesAmount)}</Text>
                  </View>
                </View>
              </View>
            </View>
          );
        })}

        <View style={[ui.card, styles.compactCard]}>
          <Text style={styles.cardTitle}>Shift Totals</Text>
          <Text style={styles.readonly}>Total sales: {formatCurrency(totals.salesAmount)}</Text>
          <Text style={styles.meta}>{pendingRows > 0 ? `Pending: ${pendingRows}` : ""}</Text>
        </View>

        <View style={[ui.card, styles.compactCard]}>
          <Text style={styles.fieldLabel}>Attachments (Optional)</Text>
          {/* <Text style={styles.meta}>Up to 10 files. Images show a preview.</Text> */}
          {closeAttachments.length === 0 ? (
            <Text style={styles.meta}>No attachments selected.</Text>
          ) : (
            <Text style={styles.meta}>{closeAttachments.length} attachment(s) selected.</Text>
          )}
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
              accessibilityLabel={closeAttachments.length > 0 ? "Add more attachments" : "Add attachments"}
              onPress={() => void selectCloseAttachments()}
              disabled={isSubmitting}
            >
              <Text style={styles.attachmentActionButtonText}>
                {closeAttachments.length > 0 ? "Add More Attachments" : "Add Attachments"}
              </Text>
            </Pressable>
            {closeAttachments.length > 0 ? (
              <Pressable
                style={[styles.attachmentActionButton, styles.attachmentActionButtonDanger]}
                accessibilityRole="button"
                accessibilityLabel="Clear all attachments"
                onPress={() => setCloseAttachments([])}
                disabled={isSubmitting}
              >
                <Text style={[styles.attachmentActionButtonText, styles.attachmentActionButtonTextDanger]}>Clear All</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        <View style={[ui.card, styles.compactCard]}>
          <View style={styles.actionGroup}>
            {!canFinalize ? (
              <Text style={styles.meta}>
                {isManualClosingSerialEnabled
                  ? "Enter valid closing serials for all packs before finalising."
                  : "Scan all packs and resolve serial errors before finalising."}
              </Text>
            ) : null}

            <PrimaryButton
              label={isSubmitting ? "Finalising..." : "Finalise Shift"}
              onPress={onFinalize}
              disabled={!canFinalize}
            />
          </View>
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
  compactCard: {
    gap: appTheme.spacing.sm,
  },
  summaryCard: {
    gap: appTheme.spacing.sm,
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
    fontSize: 22,
    lineHeight: 28,
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
    backgroundColor: "#F4F8FF",
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
    gap: appTheme.spacing.sm,
  },
  packCardPending: {
    backgroundColor: "#FFFFFF",
    borderWidth: 0.8,
    borderColor: "#F2D9A6",
  },
  packCardReady: {
    backgroundColor: "#FFFFFF",
    borderWidth: 0.8,
    borderColor: "#B7E2C3",
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
    fontSize: 16,
    lineHeight: 21,
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    flex: 1,
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
    lineHeight: 18,
    fontSize: 13,
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
    gap: appTheme.spacing.xs,
  },
  scanInputCell: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
  },
  inlineScanButton: {
    width: "100%",
    height: 44,
    borderWidth: 0,
    borderRadius: appTheme.radius.sm,
    backgroundColor: "#E8F2FA",
    alignItems: "center",
    justifyContent: "center",
  },
  soldOutButton: {
    width: "100%",
    height: 44,
    borderWidth: 0,
    borderRadius: appTheme.radius.sm,
    backgroundColor: "#F2F6FC",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  soldOutButtonText: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 14,
  },
  actionButtonDisabled: {
    opacity: 0.55,
  },
  scanIconWrap: {
    width: 22,
    height: 22,
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  scanCorner: {
    position: "absolute",
    width: 6,
    height: 6,
    borderColor: appTheme.colors.textSubtle,
  },
  scanCornerTopLeft: {
    top: 1,
    left: 1,
    borderTopWidth: 1.5,
    borderLeftWidth: 1.5,
  },
  scanCornerTopRight: {
    top: 1,
    right: 1,
    borderTopWidth: 1.5,
    borderRightWidth: 1.5,
  },
  scanCornerBottomLeft: {
    bottom: 1,
    left: 1,
    borderBottomWidth: 1.5,
    borderLeftWidth: 1.5,
  },
  scanCornerBottomRight: {
    bottom: 1,
    right: 1,
    borderBottomWidth: 1.5,
    borderRightWidth: 1.5,
  },
  inlineScanGlyph: {
    flexDirection: "row",
    alignItems: "flex-end",
    height: 14,
    gap: 1.5,
  },
  barcodeBar: {
    backgroundColor: appTheme.colors.text,
    borderRadius: 0.5,
  },
  barcodeBarThin: {
    width: 1.75,
    height: 9,
  },
  barcodeBarMedium: {
    width: 2.5,
    height: 12,
  },
  barcodeBarWide: {
    width: 3,
    height: 14,
  },
  inlineSerialInput: {
    width: "100%",
    height: 44,
    paddingVertical: 10,
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
  metricsRow: {
    flexDirection: "row",
    gap: appTheme.spacing.xs,
  },
  metricTile: {
    flex: 1,
    backgroundColor: "#F4F8FF",
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
    backgroundColor: "#EAF2FF",
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
});
