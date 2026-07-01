import React, { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, TextInputProps, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNetInfo } from "@react-native-community/netinfo";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getBusinessDay } from "../../api/businessDaysApi";
import { getConfigurations } from "../../api/configurationsApi";
import { getActivePacksForShift, getShift, listShiftClosingNumbers, upsertShiftClosingNumbersBatch } from "../../api/shiftsApi";
import { haptics } from "../../utils/haptics";
import { track } from "../../utils/analytics";
import { PrimaryButton } from "../../components/PrimaryButton";
import { ScreenContainer, useScrollToFocusedInput } from "../../components/ScreenContainer";
import { toastError, toastSuccess } from "../../components/toast";
import { clearShiftDraft, getShiftDraft } from "../../offline/draftRepository";
import { calculateShiftSales } from "../../utils/serialCalculation";
import { confirmDestructive } from "../../utils/confirm";
import { toApiEntryMethod } from "../../utils/enumParsers";
import { formatGbp } from "../../utils/currency";
import { EntryMethod, SellingOrder, ShiftStatus } from "../../types/enums";
import { ScratchCardPack } from "../../types/models";
import { MainStackParamList } from "../../types/navigation";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";
import { subscribeScan } from "../barcode-scanner/scanBus";

type Props = NativeStackScreenProps<MainStackParamList, "EnterClosingNumbers">;

// Closing-serial text box. Wraps a plain TextInput so it can call the screen's scroll-into-view
// helper on focus — this component renders inside ScreenContainer, so the context resolves to the
// real handler (calling the hook in the screen body would sit above the provider and no-op).
// Needed because tapping "Next" advances focus while the keyboard stays up, and no keyboardDidShow
// event fires to scroll the newly-focused field above the keyboard.
const ClosingSerialInput = forwardRef<TextInput, TextInputProps>(function ClosingSerialInput(
  { onFocus, ...rest },
  ref,
) {
  const scrollToFocused = useScrollToFocusedInput();
  return (
    <TextInput
      ref={ref}
      onFocus={(event) => {
        onFocus?.(event);
        scrollToFocused();
      }}
      {...rest}
    />
  );
});

type EntryState = {
  closingSerialNumber: string;
  originalScannedSerialNumber?: string;
  // Optional because the screen seeds a default entry per pack with the opening serial as the
  // initial closing — that seeded entry has no real method until the user types, scans, or
  // marks it sold out. Save flow checks `touchedPackIds` rather than this field.
  entryMethod?: EntryMethod;
  manualEntryReason?: string;
};

const ENABLE_MOBILE_CAMERA_BARCODE_SCANNING_KEY = "EnableMobileCameraBarcodeScanning";

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
  // Tracks packs the user has actually typed into or scanned. Lets us render the opening
  // serial as the input's initial real value (rather than placeholder) while still keeping
  // the row badge as "Pending" until the user explicitly acknowledges/changes it.
  const [touchedPackIds, setTouchedPackIds] = useState<Set<string>>(new Set());
  const [scanStatus, setScanStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [gameNameTooltipPackId, setGameNameTooltipPackId] = useState<string | null>(null);
  const packsRef = useRef<ScratchCardPack[]>([]);
  const entriesRef = useRef<Record<string, EntryState>>({});
  // Mirror of touchedPackIds for the scan subscription callback (which is set up once in a
  // useEffect and can't read the live state directly).
  const touchedPackIdsRef = useRef<Set<string>>(new Set());
  // Per-pack TextInput refs so the "Next" return key (Android) and the inline → button (iOS,
  // where the numeric keypad has no return key) can focus the next pack's input.
  const inputRefs = useRef<Record<string, TextInput | null>>({});
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
      // No candidates at all (shift has no active packs) — nothing the scanner could match.
      setScanStatus("No active packs to scan.");
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

  useEffect(() => {
    packsRef.current = [...(packsQuery.data ?? [])].sort(comparePacksByDisplayOrder);
  }, [packsQuery.data]);

  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  useEffect(() => {
    touchedPackIdsRef.current = touchedPackIds;
  }, [touchedPackIds]);

  // Small helper so scan / sold-out / future automated entry paths can mark a pack as
  // user-acknowledged without each one having to remember to call setTouchedPackIds.
  function markPackTouched(packId: string) {
    setTouchedPackIds((prev) => {
      if (prev.has(packId)) return prev;
      const next = new Set(prev);
      next.add(packId);
      return next;
    });
  }

  useEffect(() => {
    void (async () => {
      const draft = await getShiftDraft<{ entries: Record<string, EntryState> }>(shiftId);
      if (draft) {
        setEntries(draft.entries);
      }
    })();
  }, [shiftId]);

  // Server-stored closing numbers are the source of truth — merge them in so the screen shows
  // what was already saved (including from another device). Persisted rows count as "touched"
  // (the badge should be Ready, not Pending).
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
    setTouchedPackIds((prev) => {
      const next = new Set(prev);
      for (const closing of closingsQuery.data!) {
        next.add(closing.packId);
      }
      return next;
    });
  }, [closingsQuery.data]);

  // Pre-fill each pack's closing with its opening serial as soon as the pack list arrives so
  // the input box always shows a real, editable value (rather than a greyed-out placeholder).
  // Only seeds packs that don't already have an entry — so server-saved values from the effect
  // above and per-pack user edits both win over this default.
  useEffect(() => {
    const packs = packsQuery.data;
    if (!packs || packs.length === 0) {
      return;
    }
    setEntries((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const pack of packs) {
        if (next[pack.id]) continue;
        next[pack.id] = {
          closingSerialNumber: normalizeClosingSerialInput(pack.currentSerialNumber),
          originalScannedSerialNumber: undefined,
          entryMethod: undefined,
          manualEntryReason: undefined,
        };
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [packsQuery.data]);

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
          // A scan always overwrites the current value — no need to clear the textbox first.
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
          markPackTouched(targetPackId);
          return;
        }

        setScanStatus(`No active pack matched scanned code: ${payload.rawBarcode}`);
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
          markPackTouched(matchedPack.id);
          return;
        }

        setScanStatus(
          `Scanned value could not be validated for pack ${matchedPack.packNumber}. Please rescan or enter manually.`
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
      markPackTouched(matchedPack.id);
    });

    return unsubscribe;
    // Scan handling no longer depends on a manual-entry config gate; set up once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  // A row is considered "ready" when either:
  //   - the user has touched it (typed / scanned / Mark Sold Out), OR
  //   - the closing serial still matches the opening (no sales happened — the seeded default
  //     is a valid closing on its own, no need to make the user re-acknowledge it).
  // Together with the error check, this means a no-sales shift can be finalised immediately
  // without the user tapping every pack.
  function isRowReady(row: typeof computedRows[number]) {
    if (row.hasError) return false;
    if (touchedPackIds.has(row.pack.id)) return true;
    const entry = entries[row.pack.id];
    const openingDefault = normalizeClosingSerialInput(row.pack.currentSerialNumber);
    return Boolean(entry?.closingSerialNumber) && entry.closingSerialNumber === openingDefault;
  }
  const errorRows = computedRows.filter((row) => row.hasError).length;
  const pendingRows = computedRows.filter((row) => !isRowReady(row) && !row.hasError).length;
  const toPackHint = (row: typeof computedRows[number]) => ({
    packId: row.pack.id,
    packNumber: row.pack.packNumber,
    label: `Display ${row.pack.displayNumber != null ? `#${row.pack.displayNumber}` : "-"} | Pack ${row.pack.packNumber}`,
  });
  const pendingPackHints = useMemo(
    () =>
      computedRows
        .filter((row) => !isRowReady(row) && !row.hasError)
        .map(toPackHint),
    // isRowReady reads from entries + touchedPackIds — both already in deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [computedRows, touchedPackIds, entries]
  );
  // Every active pack, used so "Scan Any Pack" still works once everything is already scanned —
  // the operator can re-open the scanner to re-check/correct any pack regardless of pending state.
  const allPackHints = useMemo(
    () => computedRows.map(toPackHint),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [computedRows]
  );
  // A shift with zero active packs is finalisable as a no-sales close — there's nothing for
  // the shopkeeper to scan or enter, so blocking them would leave the shift in limbo.
  const canFinalize = errorRows === 0 && pendingRows === 0 && !isSubmitting;
  const isOnline = Boolean(netInfo.isConnected);
  const readinessMessage = errorRows > 0
    ? "Resolve serial errors before finalising the shift."
    : pendingRows > 0
      ? "Enter closing serial numbers for all active packs."
      : "All active packs are ready. You can finalise this shift.";

  async function onSaveClosingNumbers() {
    if (isSubmitting) {
      return;
    }

    const packs = packsQuery.data ?? [];
    // Persist every pack that has a closing serial — either user-touched (typed/scanned/marked
    // sold-out) OR an unchanged opening default (a no-sales pack, which is a valid 0-sold close
    // on its own). This lets a shift with no sales finalise without forcing the user to confirm
    // every pack individually.
    const toSave = packs
      .map((pack) => ({ pack, entry: entries[pack.id] }))
      .filter((x): x is { pack: ScratchCardPack; entry: EntryState } => {
        if (!x.entry?.closingSerialNumber) return false;
        if (touchedPackIds.has(x.pack.id)) return true;
        const openingDefault = normalizeClosingSerialInput(x.pack.currentSerialNumber);
        return x.entry.closingSerialNumber === openingDefault;
      });

    if (toSave.length === 0) {
      Alert.alert("Nothing to save", "Enter at least one closing number first.");
      return;
    }

    // Block any invalid serial (out of range / negative sold). Errors can only come from a
    // touched row in practice — opening defaults always validate clean — but check across all
    // rows defensively so a corrupt seed (e.g. opening outside pack range) is still caught.
    const errored = computedRows.find((row) => row.hasError);
    if (errored) {
      Alert.alert("Validation", `Fix closing serial for pack ${errored.pack.packNumber}.`);
      return;
    }

    setIsSubmitting(true);
    try {
      // One batched request for all packs instead of a PUT per pack (which was N sequential
      // round trips on save).
      const batchItems = toSave.map(({ pack, entry }) => {
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
              // Save only iterates touched rows, so entryMethod is normally already set —
              // default to Manual defensively for the (impossible-in-practice) case that
              // an edited row reaches save without a method recorded.
              : entry.entryMethod ?? EntryMethod.Manual
          ),
          manualEntryReason: entry.manualEntryReason,
        };
      });
      await upsertShiftClosingNumbersBatch(shiftId, batchItems);

      await clearShiftDraft(shiftId);
      await queryClient.invalidateQueries({ queryKey: ["shift-closing-numbers", shiftId] });
      haptics.success();
      track("closing_numbers_saved", { shiftId, shopId, count: toSave.length });
      toastSuccess(`${toSave.length} closing number${toSave.length === 1 ? "" : "s"} saved. Finalise the shift from the Close Shift screen.`);
      navigation.goBack();
    } catch (error: any) {
      haptics.error();
      toastError(error?.response?.data?.message ?? "Unable to save closing numbers.");
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

  const finalizeFooter = (
    <View style={[ui.card, styles.fixedFooterCard]}>
      <View style={styles.finalizeFooterContent}>
        {!canFinalize && blockingReason ? (
          <Text
            style={[styles.meta, errorRows > 0 ? styles.finalizeProgressTextError : null]}
            accessibilityLiveRegion="polite"
          >
            {blockingReason}
          </Text>
        ) : null}

        <PrimaryButton
          label={isSubmitting ? "Saving…" : "Save closing numbers"}
          icon="save-outline"
          onPress={onSaveClosingNumbers}
          disabled={isSubmitting}
        />
      </View>
    </View>
  );

  // Pinned header — the shift name, business date and "Scan any" action stay fixed at the top
  // while the pack list scrolls beneath them, so the scan-all shortcut is always reachable.
  const shiftHeaderSection = (
    <View style={[ui.card, styles.summaryCard]}>
      {/* Single-line title: shift name + date, with the "Scan any" pill inline on the right. */}
      <View style={styles.summaryHeaderRow}>
        <Text style={styles.summaryTitle} numberOfLines={1}>
          {shiftQuery.data?.shiftName ?? "-"}
        </Text>
        <Text style={styles.summaryDate} numberOfLines={1}>
          {businessDayQuery.data?.businessDate ?? "-"}
        </Text>
        {isCameraScanningEnabled ? (
          <Pressable
            style={[styles.compactScanBtn, isSubmitting ? styles.actionButtonDisabled : null]}
            accessibilityRole="button"
            accessibilityLabel="Scan any pack"
            disabled={isSubmitting}
            onPress={() =>
              openBarcodeScanner({
                mode: "auto",
                // Fall back to every pack once nothing is pending, so the button still scans.
                pendingPacks: pendingPackHints.length > 0 ? pendingPackHints : allPackHints,
              })
            }
          >
            <Ionicons name="scan-outline" size={15} color={appTheme.colors.text} />
            <Text style={styles.compactScanBtnText}>Scan any</Text>
          </Pressable>
        ) : null}
      </View>

      {!isCameraScanningEnabled ? (
        <Text style={styles.meta}>Camera scanning is disabled — use the serial box.</Text>
      ) : null}
    </View>
  );

  return (
    <ScreenContainer header={shiftHeaderSection} footer={finalizeFooter} keyboardScrollOffset={160}>
      <View style={styles.content}>
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
              label="Go to packs"
              tone="neutral"
              onPress={() => navigation.navigate("ScratchCardPacks")}
            />
          </View>
        ) : null}

        <View style={styles.packList}>
        {computedRows.map((row, rowIndex) => {
          const entry = entries[row.pack.id];
          const hasClosingSerial = Boolean(entry?.closingSerialNumber?.trim());
          // Pre-fill the opening serial as a suggested starting point so the box is never blank.
          // It is shown muted and the pack stays "Pending" until actually scanned or edited.
          const openingSerialDefault = normalizeClosingSerialInput(row.pack.currentSerialNumber);
          // Next pack in the visible order. Used to chain the Android numeric "Next" return key
          // and the iOS inline arrow button.
          const nextRow = rowIndex + 1 < computedRows.length ? computedRows[rowIndex + 1] : null;
          const focusNextInput = () => {
            if (!nextRow) return;
            inputRefs.current[nextRow.pack.id]?.focus();
          };
          // Unchanged opening serials (no-sales packs) count as Ready without needing a touch.
          const rowReady = isRowReady(row);
          const isPendingRow = !row.hasError && !rowReady;
          const isReadyRow = !row.hasError && rowReady;

          return (
            <View
              style={[
                styles.packRowDense,
                isPendingRow ? styles.packRowPending : null,
                isReadyRow ? styles.packRowReady : null,
                row.hasError ? styles.packRowError : null,
              ]}
              key={row.pack.id}
            >
              {/* Dense single-line row: compact label · closing-serial input · Sold · Scan. */}
              <View style={styles.packRowMain}>
                <Pressable
                  style={styles.packLabelCol}
                  onPress={() => showGameNameTooltip(row.pack.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Show game name for pack ${row.pack.packNumber}`}
                >
                  <Text style={styles.packLabelNum} numberOfLines={1}>
                    {row.pack.displayNumber != null ? `#${row.pack.displayNumber}` : row.pack.packNumber}
                  </Text>
                  {row.pack.displayNumber != null ? (
                    <Text style={styles.packLabelSub} numberOfLines={1}>{row.pack.packNumber}</Text>
                  ) : null}
                </Pressable>

                <View style={styles.vDivider} />

                {/* Opening serial reference (same normalised form the input is seeded with). */}
                <View style={styles.openCol}>
                  <Text style={styles.openLabel}>OPEN</Text>
                  <Text style={styles.openValue} numberOfLines={1}>{openingSerialDefault}</Text>
                </View>

                <ClosingSerialInput
                  ref={(el) => {
                    inputRefs.current[row.pack.id] = el;
                  }}
                  style={[
                    styles.input,
                    styles.denseSerialInput,
                    !hasClosingSerial ? styles.inlineSerialInputDefault : null,
                  ]}
                  // Seeded to the opening serial when the pack list arrives (see useEffect above),
                  // so the box always shows a real editable number; the user adjusts the trailing digits.
                  value={entry?.closingSerialNumber ?? ""}
                  placeholder="Serial"
                  placeholderTextColor={appTheme.colors.textSubtle}
                  keyboardType="numeric"
                  editable={!isSubmitting}
                  returnKeyType={nextRow ? "next" : "done"}
                  submitBehavior={nextRow ? "submit" : undefined}
                  onSubmitEditing={focusNextInput}
                  onBlur={() => {
                    // If the user emptied the field and tapped away, snap it back to the opening
                    // serial (the seeded default) and revert the row to Pending.
                    if (!entry?.closingSerialNumber || entry.closingSerialNumber.trim().length === 0) {
                      setEntries((previous) => ({
                        ...previous,
                        [row.pack.id]: {
                          closingSerialNumber: openingSerialDefault,
                          originalScannedSerialNumber: undefined,
                          entryMethod: undefined,
                          manualEntryReason: undefined,
                        },
                      }));
                      setTouchedPackIds((prev) => {
                        if (!prev.has(row.pack.id)) return prev;
                        const next = new Set(prev);
                        next.delete(row.pack.id);
                        return next;
                      });
                    }
                  }}
                  onChangeText={(value) => {
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
                    // Any edit marks the pack as user-acknowledged — flips Pending to Ready (or Error).
                    setTouchedPackIds((prev) => {
                      if (prev.has(row.pack.id)) return prev;
                      const next = new Set(prev);
                      next.add(row.pack.id);
                      return next;
                    });
                  }}
                />

                <Pressable
                  style={[styles.denseSoldOut, isSubmitting ? styles.actionButtonDisabled : null]}
                  accessibilityRole="button"
                  accessibilityLabel={`Mark pack ${row.pack.packNumber} as sold out`}
                  disabled={isSubmitting}
                  onPress={async () => {
                    // Marking sold-out sets the closing serial to the end of the pack — confirm first.
                    const soldOutSerial = normalizeClosingSerialInput(getLastSerialForPack(row.pack));
                    haptics.warning();
                    const ok = await confirmDestructive({
                      title: "Mark pack as sold out?",
                      message: `Pack ${row.pack.packNumber} closing serial will be set to ${soldOutSerial}.`,
                      confirmLabel: "Mark sold out",
                    });
                    if (!ok) return;
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
                    markPackTouched(row.pack.id);
                  }}
                >
                  <Text style={styles.denseSoldOutText}>Sold</Text>
                </Pressable>

                <Pressable
                  style={[
                    styles.denseScan,
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

              {/* Thin conditional sub-line: error wins; otherwise sales feedback only once entered. */}
              {row.hasError ? (
                <Text style={styles.denseError} numberOfLines={2}>{row.message}</Text>
              ) : hasClosingSerial && row.soldQuantity > 0 ? (
                <Text style={styles.denseMetrics} numberOfLines={1}>
                  Qty {row.soldQuantity} · Sales {formatCurrency(row.salesAmount)}
                </Text>
              ) : null}

              {gameNameTooltipPackId === row.pack.id ? (
                <Text style={styles.packTooltip}>{row.pack.gameName}</Text>
              ) : null}
            </View>
          );
        })}
        </View>

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total sales</Text>
          <Text style={styles.totalValue}>{formatCurrency(totals.salesAmount)}</Text>
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
    // Lift the Save button clear of the bottom edge on both platforms (home indicator on iOS,
    // gesture/nav bar on Android — the ScreenContainer already adds the Android safe-area inset).
    marginBottom: appTheme.spacing.md,
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
  // Slim total-sales bar: muted label left, emphasised amount right.
  totalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceTint,
    gap: appTheme.spacing.sm,
  },
  totalLabel: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 16,
  },
  totalValue: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.heading,
    fontSize: 18,
    lineHeight: 22,
  },
  summaryCard: {
    gap: appTheme.spacing.xs,
    paddingVertical: appTheme.spacing.sm,
  },
  summaryHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
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
  summaryActionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: appTheme.spacing.sm,
  },
  summaryProgressText: {
    flex: 1,
  },
  compactScanBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    height: 30,
    paddingHorizontal: 12,
    borderRadius: appTheme.radius.pill,
    backgroundColor: appTheme.colors.surfaceInfoSoft,
  },
  compactScanBtnText: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 14,
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
  // Dense pack rows — compact enough to show ~12 closing-serial rows on screen at once.
  packList: { gap: 4 },
  packRowDense: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surface,
    borderWidth: 0.8,
    borderColor: appTheme.colors.borderSoft,
    gap: 2,
  },
  packRowPending: { borderColor: appTheme.colors.borderWarningSoft },
  packRowReady: { borderColor: appTheme.colors.borderSuccessSoft },
  packRowError: { borderColor: appTheme.colors.danger },
  packRowMain: { flexDirection: "row", alignItems: "center", gap: 6 },
  packLabelCol: { width: 104 },
  packLabelNum: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 16, lineHeight: 19 },
  packLabelSub: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 12, lineHeight: 15 },
  // Thin vertical rule between the display/pack label and the OPEN column.
  vDivider: { width: StyleSheet.hairlineWidth, alignSelf: "stretch", backgroundColor: appTheme.colors.border },
  openCol: { width: 46 },
  openLabel: { color: appTheme.colors.textSubtle, fontFamily: appTheme.fonts.bodyMedium, fontSize: 10, lineHeight: 13, letterSpacing: 0.3 },
  openValue: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.bodyMedium, fontSize: 14, lineHeight: 17 },
  denseSerialInput: { flex: 1, height: 36, paddingVertical: 4, textAlign: "center", fontSize: 17, fontFamily: appTheme.fonts.bodyMedium },
  denseSoldOut: {
    height: 36,
    paddingHorizontal: 10,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceTintSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  denseSoldOutText: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 14, lineHeight: 16 },
  denseScan: {
    width: 40,
    height: 36,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceInfoSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  // Align the metrics line under the closing input: label (78) + divider + OPEN (46) + the three 6px gaps.
  denseMetrics: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 12, lineHeight: 15, paddingLeft: 168 },
  denseError: { color: appTheme.colors.danger, fontFamily: appTheme.fonts.bodyMedium, fontSize: 12, lineHeight: 15, paddingLeft: 92 },
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
    fontSize: 16,
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


