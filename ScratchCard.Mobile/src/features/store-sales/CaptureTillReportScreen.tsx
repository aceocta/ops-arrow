import React from "react";
import * as ImagePicker from "expo-image-picker";
import { ActivityIndicator, Alert, Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../auth/AuthContext";
import { listBusinessDays } from "../../api/businessDaysApi";
import { listShifts } from "../../api/shiftsApi";
import { parseTillReport, TillReportPhoto } from "../../api/tillReportsApi";
import { compressForUpload } from "../../utils/imageCompression";
import { listTills } from "../../api/tillsApi";
import { ScreenContainer } from "../../components/ScreenContainer";
import { PrimaryButton } from "../../components/PrimaryButton";
import { MainStackParamList } from "../../types/navigation";
import { TillReportType } from "../../types/enums";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";

type Props = NativeStackScreenProps<MainStackParamList, "StoreSales">;

const ACTIVE_DAY_STATUSES = ["Open", "Reopened", "ReadyToClose"];

export function CaptureTillReportScreen({ navigation, route }: Props) {
  const { activeShopId } = useAuth();
  const shopId = activeShopId;
  const params = route.params;

  const [reportType, setReportType] = React.useState<TillReportType>(
    (params?.reportType as TillReportType) ?? TillReportType.DayEnd
  );
  const [selectedShiftId, setSelectedShiftId] = React.useState<string | null>(params?.shiftId ?? null);
  const [selectedTillId, setSelectedTillId] = React.useState<string | null>(null);
  const [photos, setPhotos] = React.useState<TillReportPhoto[]>([]);
  const [addingPhotos, setAddingPhotos] = React.useState(false);

  const tillsQuery = useQuery({
    queryKey: ["tills", shopId],
    queryFn: () => listTills(shopId as string),
    enabled: Boolean(shopId),
  });
  const tills = tillsQuery.data ?? [];

  // Auto-select if there's exactly one till — the picker is hidden in that case anyway.
  React.useEffect(() => {
    if (tills.length === 1 && selectedTillId !== tills[0].id) {
      setSelectedTillId(tills[0].id);
    }
  }, [tills, selectedTillId]);

  const businessDaysQuery = useQuery({
    queryKey: ["business-days", shopId],
    queryFn: () => listBusinessDays(shopId as string),
    enabled: Boolean(shopId),
  });

  const activeBusinessDay = React.useMemo(
    () => (businessDaysQuery.data ?? []).find((day) => ACTIVE_DAY_STATUSES.includes(String(day.status))),
    [businessDaysQuery.data]
  );
  // A caller (Day Management / Shift Details) can pin the business day; otherwise use the open one.
  const effectiveBusinessDayId = params?.businessDayId ?? activeBusinessDay?.id;
  const effectiveBusinessDay = React.useMemo(
    () => (businessDaysQuery.data ?? []).find((day) => day.id === effectiveBusinessDayId) ?? activeBusinessDay,
    [businessDaysQuery.data, effectiveBusinessDayId, activeBusinessDay]
  );

  const shiftsQuery = useQuery({
    queryKey: ["shifts", shopId, effectiveBusinessDayId],
    queryFn: () => listShifts(shopId as string, effectiveBusinessDayId),
    enabled: Boolean(shopId) && Boolean(effectiveBusinessDayId) && reportType === TillReportType.Shift,
  });
  const shifts = shiftsQuery.data ?? [];

  const parseMutation = useMutation({
    mutationFn: () => {
      if (!shopId) {
        throw new Error("Shop context is missing.");
      }
      return parseTillReport({
        shopId,
        tillId: selectedTillId ?? undefined,
        reportType,
        shiftId: reportType === TillReportType.Shift ? selectedShiftId ?? undefined : undefined,
        businessDayId: reportType === TillReportType.DayEnd ? effectiveBusinessDayId : undefined,
        photos,
      });
    },
    onSuccess: (report) => {
      setPhotos([]);
      navigation.navigate("TillReportReview", { reportId: report.id });
    },
    onError: () => {
      Alert.alert("Could not read report", "We couldn't read those photos. Please try clearer images.");
    },
  });

  async function addPhotos(source: "camera" | "gallery") {
    const permission =
      source === "camera"
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert("Permission required", source === "camera" ? "Camera permission is required." : "Photo access is required.");
      return;
    }

    const result =
      source === "camera"
        ? await ImagePicker.launchCameraAsync({ mediaTypes: "images", quality: 0.85, allowsEditing: false })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: "images",
            quality: 0.85,
            allowsEditing: false,
            allowsMultipleSelection: true,
          });

    if (result.canceled || result.assets.length === 0) {
      return;
    }

    // Compress each picked photo before adding to the list — drops a 4 MB phone shot to a few
    // hundred KB, so uploads finish quickly even on poor cellular without hurting OCR accuracy.
    // Compression can take a couple of seconds for several large shots, so show a busy overlay.
    setAddingPhotos(true);
    const startedAt = Date.now();
    try {
      const compressed = await Promise.all(
        result.assets.map(async (asset, index) => {
          const out = await compressForUpload(asset.uri);
          return {
            uri: out.uri,
            fileName: asset.fileName ?? `till-report-${Date.now()}-${index}.jpg`,
            mimeType: "image/jpeg",
          } satisfies TillReportPhoto;
        }),
      );
      setPhotos((current) => [...current, ...compressed]);
    } catch {
      Alert.alert("Couldn't add photos", "Something went wrong preparing those images. Please try again.");
    } finally {
      // Keep the overlay up for a minimum beat so a fast compression still registers visually
      // instead of flashing by unseen.
      const elapsed = Date.now() - startedAt;
      if (elapsed < 600) {
        await new Promise<void>((resolve) => setTimeout(() => resolve(), 600 - elapsed));
      }
      setAddingPhotos(false);
    }
  }

  function removePhoto(uri: string) {
    setPhotos((current) => current.filter((photo) => photo.uri !== uri));
  }

  const isBusy = parseMutation.isPending;
  const needsShift = reportType === TillReportType.Shift;
  const missingShift = needsShift && !selectedShiftId;
  const missingDay = reportType === TillReportType.DayEnd && !effectiveBusinessDayId;
  const missingTill = tills.length > 0 && !selectedTillId;
  const canProcess = photos.length > 0 && !missingShift && !missingDay && !missingTill && !isBusy && Boolean(shopId);

  return (
    <ScreenContainer
      footer={
        <View style={styles.footerWrap}>
          <PrimaryButton
            label={isBusy ? "Reading..." : `Process ${photos.length || ""} photo${photos.length === 1 ? "" : "s"}`.trim()}
            onPress={() => parseMutation.mutate()}
            disabled={!canProcess}
          />
        </View>
      }
    >
      <View style={ui.card}>
        <Text style={ui.sectionTitle}>What's this till report for?</Text>

        <View style={styles.pickerGroup}>
          <Text style={styles.pickerLabel}>Scope</Text>
          <View style={styles.chipRow}>
            <Chip
              label="Day end"
              active={reportType === TillReportType.DayEnd}
              disabled={isBusy}
              onPress={() => setReportType(TillReportType.DayEnd)}
            />
            <Chip
              label="A shift"
              active={reportType === TillReportType.Shift}
              disabled={isBusy}
              onPress={() => setReportType(TillReportType.Shift)}
            />
          </View>
          {reportType === TillReportType.DayEnd && !missingDay && effectiveBusinessDay ? (
            <Text style={ui.caption}>Business day {effectiveBusinessDay.businessDate}</Text>
          ) : null}
          {reportType === TillReportType.DayEnd && missingDay ? (
            <Text style={styles.warn}>No open business day. Open today's business day first.</Text>
          ) : null}
        </View>

        {reportType === TillReportType.Shift ? (
          <View style={styles.pickerGroup}>
            <Text style={styles.pickerLabel}>Shift</Text>
            {missingDay ? (
              <Text style={styles.warn}>No open business day. Open a business day to list its shifts.</Text>
            ) : shiftsQuery.isLoading ? (
              <Text style={ui.caption}>Loading shifts…</Text>
            ) : shifts.length === 0 ? (
              <Text style={styles.warn}>No shifts for the current business day.</Text>
            ) : (
              <View style={styles.chipRow}>
                {shifts.map((shift) => (
                  <Chip
                    key={shift.id}
                    label={shift.shiftName}
                    sublabel={String(shift.status)}
                    active={shift.id === selectedShiftId}
                    disabled={isBusy}
                    onPress={() => setSelectedShiftId(shift.id)}
                  />
                ))}
              </View>
            )}
          </View>
        ) : null}

        <View style={styles.pickerGroup}>
          <Text style={styles.pickerLabel}>Till</Text>
          {tillsQuery.isLoading ? (
            <Text style={ui.caption}>Loading tills…</Text>
          ) : tills.length === 0 ? (
            <View>
              <Text style={styles.warn}>No tills configured for this shop.</Text>
              <Pressable onPress={() => navigation.navigate("TillsConfig")} disabled={isBusy}>
                <Text style={styles.link}>Set up tills →</Text>
              </Pressable>
            </View>
          ) : tills.length === 1 ? (
            <View style={styles.chipRow}>
              <Chip
                label={tills[0].name}
                sublabel={tills[0].code ?? undefined}
                active
                disabled
                onPress={() => undefined}
              />
            </View>
          ) : (
            <>
              <View style={styles.chipRow}>
                {tills.map((till) => (
                  <Chip
                    key={till.id}
                    label={till.name}
                    sublabel={till.code ?? undefined}
                    active={till.id === selectedTillId}
                    disabled={isBusy}
                    onPress={() => setSelectedTillId(till.id)}
                  />
                ))}
              </View>
              <Pressable onPress={() => navigation.navigate("TillsConfig")} disabled={isBusy}>
                <Text style={styles.link}>Manage tills →</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>

      <View style={ui.card}>
        <Text style={ui.sectionTitle}>Photos</Text>
        <Text style={ui.caption}>Add one or more photos — a single report can span several pages.</Text>

        {photos.length > 0 ? (
          <View style={styles.thumbRow}>
            {photos.map((photo) => (
              <View key={photo.uri} style={styles.thumbWrap}>
                <Image source={{ uri: photo.uri }} style={styles.thumb} />
                <Pressable style={styles.thumbRemove} onPress={() => removePhoto(photo.uri)} disabled={isBusy}>
                  <Ionicons name="close" size={13} color={appTheme.colors.onPrimary} />
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.addRow}>
          <Pressable style={[styles.addButton, addingPhotos ? styles.addButtonBusy : null]} onPress={() => void addPhotos("camera")} disabled={isBusy || addingPhotos}>
            <Ionicons name="camera-outline" size={17} color={appTheme.colors.text} />
            <Text style={styles.addButtonText}>Camera</Text>
          </Pressable>
          <Pressable style={[styles.addButton, addingPhotos ? styles.addButtonBusy : null]} onPress={() => void addPhotos("gallery")} disabled={isBusy || addingPhotos}>
            <Ionicons name="images-outline" size={17} color={appTheme.colors.text} />
            <Text style={styles.addButtonText}>Gallery</Text>
          </Pressable>
        </View>
      </View>

      <View style={ui.card}>
        <Pressable style={styles.linkRow} onPress={() => navigation.navigate("TillReportHistory")} disabled={isBusy}>
          <View style={styles.linkRowMain}>
            <Ionicons name="receipt-outline" size={18} color={appTheme.colors.primary} />
            <Text style={styles.linkRowText}>View saved till reports</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={appTheme.colors.textMuted} />
        </Pressable>
      </View>

      <ParsingOverlay visible={isBusy} photoCount={photos.length} />
      <BusyOverlay
        visible={addingPhotos}
        title="Adding photos"
        message="Optimising your images…"
        hint="This only takes a moment."
      />
    </ScreenContainer>
  );
}

// A blocking full-screen overlay with a spinner — used for both photo optimisation and report
// parsing so the user always gets clear, unmissable feedback during waits.
function BusyOverlay({ visible, title, message, hint }: { visible: boolean; title: string; message?: string; hint?: string }) {
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={() => undefined}>
      <View style={styles.overlayBackdrop}>
        <View style={styles.overlayCard}>
          <ActivityIndicator size="large" color={appTheme.colors.primary} />
          <Text style={styles.overlayTitle}>{title}</Text>
          {message ? <Text style={styles.overlayMsg}>{message}</Text> : null}
          {hint ? <Text style={styles.overlayHint}>{hint}</Text> : null}
        </View>
      </View>
    </Modal>
  );
}

// Reading a till report runs OCR + AI matching on the server (~10s). The cycling status reassures
// the user the app hasn't frozen and that they should keep it open.
function ParsingOverlay({ visible, photoCount }: { visible: boolean; photoCount: number }) {
  const messages = React.useMemo(
    () => [
      photoCount > 1 ? `Uploading ${photoCount} photos…` : "Uploading your photo…",
      "Reading the till report…",
      "Matching lines to categories…",
      "Almost there…",
    ],
    [photoCount],
  );
  const [idx, setIdx] = React.useState(0);

  React.useEffect(() => {
    if (!visible) {
      setIdx(0);
      return;
    }
    const timer = setInterval(() => setIdx((current) => Math.min(current + 1, messages.length - 1)), 2500);
    return () => clearInterval(timer);
  }, [visible, messages.length]);

  return (
    <BusyOverlay
      visible={visible}
      title="Reading your till report"
      message={messages[idx]}
      hint="This usually takes about 10 seconds. Please keep the app open."
    />
  );
}

function Chip({
  label,
  sublabel,
  active,
  disabled,
  onPress,
}: {
  label: string;
  sublabel?: string;
  active: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.chip, active ? styles.chipSelected : null, disabled ? styles.chipDisabled : null]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.chipText, active ? styles.chipTextSelected : null]} numberOfLines={1}>
        {label}
      </Text>
      {sublabel ? (
        <Text style={[styles.chipSub, active ? styles.chipSubSelected : null]} numberOfLines={1}>
          {sublabel}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  footerWrap: {
    paddingBottom: 16,
  },
  segment: {
    flexDirection: "row",
    gap: 8,
  },
  segmentButton: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 9,
    borderRadius: appTheme.radius.pill,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    backgroundColor: appTheme.colors.surface,
  },
  segmentButtonActive: {
    backgroundColor: appTheme.colors.primary,
    borderColor: appTheme.colors.primary,
  },
  segmentText: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.bodyMedium, fontSize: 13, lineHeight: 16 },
  segmentTextActive: { color: appTheme.colors.onPrimary },
  warn: { color: appTheme.colors.warning, fontFamily: appTheme.fonts.bodyMedium, fontSize: 12, lineHeight: 16 },
  link: { color: appTheme.colors.primary, fontFamily: appTheme.fonts.bodyMedium, fontSize: 13, lineHeight: 17, paddingTop: 4 },
  chipRow: { flexDirection: "row", gap: 8 },
  chip: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surface,
    gap: 2,
  },
  chipSelected: {
    borderColor: appTheme.colors.primary,
    backgroundColor: appTheme.colors.surfaceBrandSoft,
  },
  chipText: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 13, lineHeight: 16, textAlign: "center" },
  chipTextSelected: { color: appTheme.colors.primary },
  chipSub: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 11, lineHeight: 13, textAlign: "center" },
  chipSubSelected: { color: appTheme.colors.primary },
  chipDisabled: { opacity: 0.55 },
  pickerGroup: { gap: 6 },
  pickerLabel: {
    color: appTheme.colors.textSubtle,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 11,
    lineHeight: 13,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  shiftPicker: { gap: 8 },
  shiftRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  shiftRowSelected: { borderColor: appTheme.colors.primary, backgroundColor: appTheme.colors.surfaceBrandSoft },
  shiftName: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 14, lineHeight: 18 },
  shiftBadge: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 12, lineHeight: 14 },
  shiftBadgeSelected: { color: appTheme.colors.primary, fontFamily: appTheme.fonts.bodyMedium },
  thumbRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  thumbWrap: { width: 64, height: 64 },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: appTheme.radius.sm,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
  },
  thumbRemove: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: appTheme.colors.danger,
    alignItems: "center",
    justifyContent: "center",
  },
  addRow: { flexDirection: "row", gap: 8 },
  addButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: appTheme.colors.surfaceTintSoft,
    borderRadius: appTheme.radius.pill,
    paddingVertical: 11,
  },
  addButtonBusy: { opacity: 0.55 },
  addButtonText: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 13, lineHeight: 16 },
  overlayBackdrop: {
    flex: 1,
    backgroundColor: appTheme.colors.overlay,
    alignItems: "center",
    justifyContent: "center",
    padding: appTheme.spacing.lg,
  },
  overlayCard: {
    width: "100%",
    maxWidth: 320,
    alignItems: "center",
    gap: 10,
    backgroundColor: appTheme.colors.surface,
    borderRadius: appTheme.radius.lg,
    paddingVertical: 28,
    paddingHorizontal: 24,
  },
  overlayTitle: { color: appTheme.colors.text, fontFamily: appTheme.fonts.heading, fontSize: 16, lineHeight: 20, marginTop: 4 },
  overlayMsg: { color: appTheme.colors.primary, fontFamily: appTheme.fonts.bodyMedium, fontSize: 14, lineHeight: 18, textAlign: "center" },
  overlayHint: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 12, lineHeight: 16, textAlign: "center" },
  linkRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  linkRowMain: { flexDirection: "row", alignItems: "center", gap: 10 },
  linkRowText: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 14, lineHeight: 18 },
});
