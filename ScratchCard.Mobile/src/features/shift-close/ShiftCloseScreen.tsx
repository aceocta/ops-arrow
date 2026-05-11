import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import NetInfo, { useNetInfo } from "@react-native-community/netinfo";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getBusinessDay } from "../../api/businessDaysApi";
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

function getSerialCandidatesForPack(pack: ScratchCardPack, rawBarcode: string, parsedSerial: string) {
  const candidates: string[] = [];
  const compact = normalizeDashes(rawBarcode).replace(/\s+/g, "");
  const lastHyphen = compact.lastIndexOf("-");
  if (lastHyphen > -1 && lastHyphen < compact.length - 1) {
    const suffixDigits = compact.slice(lastHyphen + 1).replace(/\D/g, "");
    if (suffixDigits.length >= 3) {
      // Prefer the serial nearest to the explicit ticket suffix first.
      pushUnique(candidates, suffixDigits.slice(0, 3));
      pushUnique(candidates, suffixDigits.slice(-3));
    }
  }

  const digitsOnly = compact.replace(/\D/g, "");
  const packDigits = pack.packNumber.replace(/\D/g, "");

  if (packDigits && digitsOnly.includes(packDigits)) {
    const index = digitsOnly.indexOf(packDigits);
    const trailing = digitsOnly.slice(index + packDigits.length);

    if (trailing.length >= 3) {
      // Strongest signal: serial right after the target pack digits.
      pushUnique(candidates, trailing.slice(0, 3));
      pushUnique(candidates, trailing.slice(-3));
    }

    if (index >= 3) {
      // Some print formats place serial before pack digits.
      pushUnique(candidates, digitsOnly.slice(index - 3, index));
    }
  }

  if (digitsOnly.length >= 3) {
    pushUnique(candidates, digitsOnly.slice(-3));
    pushUnique(candidates, digitsOnly.slice(0, 3));
  }

  // Lowest priority: parser-derived serial may be wrong when scanner reads noisy bars.
  pushUnique(candidates, parsedSerial);

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

function normalizeScannedSerial(value?: string) {
  if (!value) {
    return "";
  }

  const digitsOnly = value.replace(/\D/g, "");
  if (digitsOnly.length > 0) {
    return digitsOnly.length <= 3 ? digitsOnly : digitsOnly.slice(-3);
  }
  return value.trim();
}

function getLastSerialForPack(pack: ScratchCardPack) {
  return pack.sellingOrder === SellingOrder.Descending
    ? pack.startSerialNumber
    : pack.endSerialNumber;
}

function getShiftStatusTone(status?: string): "neutral" | "warning" | "danger" | "success" {
  if (!status) return "neutral";
  if (status === ShiftStatus.Open) return "success";
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const packsRef = useRef<ScratchCardPack[]>([]);

  function openBarcodeScanner(params: { mode: "single" | "auto"; packId?: string; packNumber?: string }) {
    const rootLikeNavigation = navigation.getParent()?.getParent() ?? navigation.getParent() ?? navigation;
    (rootLikeNavigation as any).navigate("BarcodeScanner", params);
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

  useEffect(() => {
    packsRef.current = [...(packsQuery.data ?? [])].sort(comparePacksByDisplayOrder);
  }, [packsQuery.data]);

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
        if (payload.packId && fallbackSerial) {
          const targetPackId = payload.packId;
          setScanStatus(`Captured ${fallbackSerial}. Pack is loading, verify and finalise.`);
          setEntries((previous) => ({
            ...previous,
            [targetPackId]: {
              closingSerialNumber: fallbackSerial,
              originalScannedSerialNumber: payload.parsedSerial || fallbackSerial,
              entryMethod: EntryMethod.ScannedEdited,
              manualEntryReason: previous[targetPackId]?.manualEntryReason,
            },
          }));
          return;
        }

        setScanStatus(`No active pack matched scanned code: ${payload.rawBarcode}`);
        return;
      }

      const resolvedSerial = pickBestSerialForPack(matchedPack, payload.rawBarcode, payload.parsedSerial);
      if (!resolvedSerial) {
        const fallbackSerial = normalizeScannedSerial(payload.parsedSerial || payload.rawBarcode);
        if (fallbackSerial && isValidSerialForPack(matchedPack, fallbackSerial)) {
          setScanStatus(`Captured ${fallbackSerial} for pack ${matchedPack.packNumber}. Please verify before finalising.`);
          setEntries((previous) => ({
            ...previous,
            [matchedPack.id]: {
              closingSerialNumber: fallbackSerial,
              originalScannedSerialNumber: payload.parsedSerial || fallbackSerial,
              entryMethod: EntryMethod.ScannedEdited,
              manualEntryReason: previous[matchedPack.id]?.manualEntryReason,
            },
          }));
          return;
        }

        setScanStatus(
          `Scanned value could not be validated for pack ${matchedPack.packNumber}. Please rescan or enter manually.`
        );
        return;
      }
      const wasAdjusted = resolvedSerial !== payload.parsedSerial;

      setScanStatus(
        payload.parsedPackNumber
          ? `Applied ${resolvedSerial} to pack ${matchedPack.packNumber}${wasAdjusted ? ` (from ${payload.parsedSerial})` : ""}${payload.barcodeType ? ` [${payload.barcodeType}]` : ""}.`
          : `Applied serial ${resolvedSerial}${wasAdjusted ? ` (from ${payload.parsedSerial})` : ""}${payload.barcodeType ? ` [${payload.barcodeType}]` : ""}.`
      );

      setEntries((previous) => ({
        ...previous,
        [matchedPack.id]: {
          closingSerialNumber: resolvedSerial,
          originalScannedSerialNumber: payload.parsedSerial || resolvedSerial,
          entryMethod: EntryMethod.Scanned,
          manualEntryReason: previous[matchedPack.id]?.manualEntryReason,
        },
      }));
    });

    return unsubscribe;
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
  const completedRows = computedRows.filter((row) => Boolean(entries[row.pack.id]?.closingSerialNumber) && !row.hasError).length;
  const errorRows = computedRows.filter((row) => row.hasError).length;
  const pendingRows = computedRows.filter((row) => !entries[row.pack.id]?.closingSerialNumber).length;
  const canFinalize = computedRows.length > 0 && pendingRows === 0 && errorRows === 0 && !isSubmitting;
  const isOnline = Boolean(netInfo.isConnected);

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

    setIsSubmitting(true);
    try {
      const payload = {
        actualCash: 0,
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
      void Promise.allSettled([
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
        {/* <View style={styles.topStatusRow}>
          <StatusBadge label={isOnline ? "Online" : "Offline"} tone={isOnline ? "success" : "warning"} />
          <Text style={styles.topStatusText}>
            {isOnline ? "Real-time submit available" : "Will queue automatically when finalised"}
          </Text>
        </View> */}

        <View style={[ui.card, styles.summaryCard]}>
          <View style={styles.summaryHeaderRow}>
            {/* <Text style={styles.cardTitle}>Shift Close</Text> */}
          <Text style={styles.summaryTitle}>{shiftQuery.data?.shiftName ?? "-"}</Text>
           <Text style={styles.meta}> {businessDayQuery.data?.businessDate ?? "-"}</Text>
            <StatusBadge label={shiftQuery.data?.status ?? "-"} tone={getShiftStatusTone(shiftQuery.data?.status)} />
          </View>
          {/* <Text style={styles.summaryTitle}>{shiftQuery.data?.shiftName ?? "-"}</Text> */}
          {/* <Text style={styles.meta}>Date: {businessDayQuery.data?.businessDate ?? "-"}</Text> */}
          {/* <View style={styles.summaryStatusRow}>
            <Text style={styles.meta}>Day Status:</Text>
            <StatusBadge
              label={businessDayQuery.data?.status ?? "-"}
              tone={getBusinessDayStatusTone(businessDayQuery.data?.status)}
            />
          </View>
          <Text style={styles.meta}>
            Start: {shiftQuery.data?.startTime ? new Date(shiftQuery.data.startTime).toLocaleString() : "-"}
          </Text> */}
          {/* {shiftQuery.data?.endTime ? <Text style={styles.meta}>End: {new Date(shiftQuery.data.endTime).toLocaleString()}</Text> : null} */}
          {/* <View style={styles.progressRow}>
            <View style={styles.progressTile}>
              <Text style={styles.progressLabel}>Packs</Text>
              <Text style={styles.progressValue}>{computedRows.length}</Text>
            </View>
            <View style={styles.progressTile}>
              <Text style={styles.progressLabel}>Ready</Text>
              <Text style={styles.progressValue}>{completedRows}</Text>
            </View>
            <View style={styles.progressTile}>
              <Text style={styles.progressLabel}>Pending</Text>
              <Text style={styles.progressValue}>{pendingRows}</Text>
            </View>
            <View style={styles.progressTile}>
              <Text style={styles.progressLabel}>Issues</Text>
              <Text style={styles.progressValue}>{errorRows}</Text>
            </View>
          </View> */}
        </View>

        <View style={[ui.card, styles.quickScanCard]}>
          {/* <Text style={styles.cardTitle}>Quick Scan</Text>
          <Text style={styles.meta}>Scan continuously and auto-apply closing serials by pack.</Text> */}
          <PrimaryButton
            label="Scan Any Pack Barcode"
            tone="neutral"
            onPress={() => openBarcodeScanner({ mode: "auto" })}
            disabled={isSubmitting}
          />
          {scanStatus ? <Text style={styles.scanStatus}>{scanStatus}</Text> : null}
        </View>

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

          return (
            <View style={[ui.card, styles.packCard]} key={row.pack.id}>
              <View style={styles.packHeaderRow}>
                <Text style={styles.packTitle}>
                  {row.pack.displayNumber != null ? `#${row.pack.displayNumber} - ` : ""}{row.pack.gameName}
                </Text>
                <Text style={styles.packMeta}>
                  Pack: {row.pack.packNumber} 
                </Text>
                {/* <StatusBadge label={rowStatusLabel} tone={rowStatusTone} /> */}
              </View>
              <View style={styles.packMetaRow}>
                <Text style={styles.packMeta}>
               Opening serial: {row.pack.currentSerialNumber}
                </Text>
                <Text style={styles.packMetaRight}>Price £ {row.pack.ticketPrice.toFixed(2)}</Text>
              </View>

              {/* <Text style={styles.fieldLabel}>Closing Serial Number</Text> */}
              <View style={styles.scanInputRow}>
                <TextInput
                  style={[styles.input, styles.inlineSerialInput]}
                  value={entry?.closingSerialNumber ?? ""}
                  placeholder="Closing serial number"
                  placeholderTextColor={appTheme.colors.textSubtle}
                  keyboardType="numeric"
                  onChangeText={(value) => {
                    setEntries((previous) => ({
                      ...previous,
                      [row.pack.id]: {
                        closingSerialNumber: value,
                        originalScannedSerialNumber: previous[row.pack.id]?.originalScannedSerialNumber,
                        entryMethod: previous[row.pack.id]?.originalScannedSerialNumber
                          ? EntryMethod.ScannedEdited
                          : EntryMethod.Manual,
                        manualEntryReason: previous[row.pack.id]?.manualEntryReason,
                      },
                    }));
                  }}
                />

                <Pressable
                  style={styles.soldOutButton}
                  accessibilityRole="button"
                  accessibilityLabel={`Mark pack ${row.pack.packNumber} as sold out`}
                  onPress={() => {
                    const soldOutSerial = getLastSerialForPack(row.pack);
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

                <Pressable
                  style={styles.inlineScanButton}
                  accessibilityRole="button"
                  accessibilityLabel={`Scan barcode for pack ${row.pack.packNumber}`}
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

              {entry?.originalScannedSerialNumber ? (
                <Text style={styles.meta}>Original scanned serial: {entry.originalScannedSerialNumber}</Text>
              ) : null}

              {/* {isFlagged ? <StatusBadge label="Flagged for review" tone="warning" /> : null} */}

              {/* {row.hasError ? <Text style={styles.error}>{row.message}</Text> : null} */}

              <View style={styles.metricsBlock}>
                <View style={styles.metricsRow}>
                  <Text style={styles.metricLine}>
                    Sold qty: <Text style={styles.metricValue}>{row.soldQuantity}</Text>
                  </Text>
                  <Text style={[styles.metricLine, styles.metricLineRight]}>
                    Sales amount: <Text style={styles.metricValue}>£ {row.salesAmount.toFixed(2)}</Text>
                  </Text>
                </View>
              </View>
            </View>
          );
        })}

        <View style={[ui.card, styles.compactCard]}>
          <Text style={styles.cardTitle}>Shift totals</Text>
          <Text style={styles.readonly}>Total sales: £ {totals.salesAmount.toFixed(2)}</Text>
          <Text style={styles.meta}>Ready: {completedRows}  Pending: {pendingRows}  Issues: {errorRows}</Text>
          {!canFinalize ? (
            <Text style={styles.meta}>Enter valid closing serials for all packs before finalising.</Text>
          ) : null}
          <View style={styles.actionGroup}>
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
    gap: 12,
    paddingBottom: 12,
  },
  topStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 2,
  },
  topStatusText: {
    color: appTheme.colors.textSubtle,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 16,
  },
  compactCard: {
    gap: 10,
  },
  summaryCard: {
    gap: 10,
  },
  summaryHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  summaryTitle: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.heading,
    fontSize: 21,
    lineHeight: 25,
  },
  summaryStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  progressRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  progressTile: {
    width: "48.5%",
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: appTheme.spacing.xs,
    gap: 2,
  },
  progressLabel: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.body,
    fontSize: 12,
    lineHeight: 16,
  },
  progressValue: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 18,
  },
  quickScanCard: {
    gap: 10,
  },
  packCard: {
    gap: 10,
  },
  cardTitle: { fontSize: 17, lineHeight: 22, color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium },
  fieldLabel: {
    color: appTheme.colors.text,
    fontSize: 13,
    lineHeight: 16,
    fontFamily: appTheme.fonts.bodyMedium,
    marginTop: 2,
  },
  meta: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, lineHeight: 18, fontSize: 13 },
  packTitle: {
    fontSize: 16,
    lineHeight: 21,
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    flexShrink: 1,
  },
  packHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
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
    gap: 8,
  },
  packMetaRight: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    lineHeight: 18,
    fontSize: 13,
  },
  input: {
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    color: appTheme.colors.text,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: appTheme.spacing.sm,
    fontFamily: appTheme.fonts.body,
    fontSize: 14,
  },
  scanInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  inlineScanButton: {
    width: 44,
    height: 44,
    borderWidth: 1,
    borderColor: appTheme.colors.borderStrong,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  soldOutButton: {
    height: 44,
    minWidth: 74,
    borderWidth: 1,
    borderColor: appTheme.colors.borderStrong,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  soldOutButtonText: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 14,
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
    flex: 1,
    paddingVertical: 10,
  },
  readonly: { color: appTheme.colors.info, fontFamily: appTheme.fonts.bodyMedium, lineHeight: 19, fontSize: 14 },
  metricsBlock: {
    gap: 4,
    marginTop: 2,
  },
  metricsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  metricLine: {
    color: appTheme.colors.info,
    fontFamily: appTheme.fonts.bodyMedium,
    lineHeight: 18,
    fontSize: 13,
  },
  metricLineRight: {
    textAlign: "right",
  },
  metricValue: {
    color: appTheme.colors.info,
    fontFamily: appTheme.fonts.bodyMedium,
  },
  error: { color: appTheme.colors.danger, fontFamily: appTheme.fonts.bodyMedium, lineHeight: 18, fontSize: 13 },
  scanStatus: {
    color: appTheme.colors.info,
    fontFamily: appTheme.fonts.bodyMedium,
    lineHeight: 18,
    fontSize: 13,
    marginTop: 2,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: appTheme.spacing.xs,
  },
  actionGroup: {
    gap: 8,
    marginTop: 4,
  },
});
