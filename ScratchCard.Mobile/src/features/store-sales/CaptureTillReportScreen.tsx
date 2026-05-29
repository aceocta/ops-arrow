import React from "react";
import * as ImagePicker from "expo-image-picker";
import { Alert, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../auth/AuthContext";
import { listBusinessDays } from "../../api/businessDaysApi";
import { listShifts } from "../../api/shiftsApi";
import { parseTillReport, TillReportPhoto } from "../../api/tillReportsApi";
import { ScreenContainer } from "../../components/ScreenContainer";
import { PrimaryButton } from "../../components/PrimaryButton";
import { MainStackParamList } from "../../types/navigation";
import { TillReportType } from "../../types/enums";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";

type Props = NativeStackScreenProps<MainStackParamList, "StoreSales">;

const ACTIVE_DAY_STATUSES = ["Open", "Reopened", "ReadyToClose"];

export function CaptureTillReportScreen({ navigation }: Props) {
  const { activeShopId } = useAuth();
  const shopId = activeShopId;

  const [reportType, setReportType] = React.useState<TillReportType>(TillReportType.DayEnd);
  const [selectedShiftId, setSelectedShiftId] = React.useState<string | null>(null);
  const [photos, setPhotos] = React.useState<TillReportPhoto[]>([]);

  const businessDaysQuery = useQuery({
    queryKey: ["business-days", shopId],
    queryFn: () => listBusinessDays(shopId as string),
    enabled: Boolean(shopId),
  });

  const activeBusinessDay = React.useMemo(
    () => (businessDaysQuery.data ?? []).find((day) => ACTIVE_DAY_STATUSES.includes(String(day.status))),
    [businessDaysQuery.data]
  );
  const activeBusinessDayId = activeBusinessDay?.id;

  const shiftsQuery = useQuery({
    queryKey: ["shifts", shopId, activeBusinessDayId],
    queryFn: () => listShifts(shopId as string, activeBusinessDayId),
    enabled: Boolean(shopId) && Boolean(activeBusinessDayId) && reportType === TillReportType.Shift,
  });
  const shifts = shiftsQuery.data ?? [];

  const parseMutation = useMutation({
    mutationFn: () => {
      if (!shopId) {
        throw new Error("Shop context is missing.");
      }
      return parseTillReport({
        shopId,
        reportType,
        shiftId: reportType === TillReportType.Shift ? selectedShiftId ?? undefined : undefined,
        businessDayId: reportType === TillReportType.DayEnd ? activeBusinessDayId : undefined,
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

    const added: TillReportPhoto[] = result.assets.map((asset, index) => ({
      uri: asset.uri,
      fileName: asset.fileName ?? `till-report-${Date.now()}-${index}.jpg`,
      mimeType: asset.mimeType ?? "image/jpeg",
    }));
    setPhotos((current) => [...current, ...added]);
  }

  function removePhoto(uri: string) {
    setPhotos((current) => current.filter((photo) => photo.uri !== uri));
  }

  const isBusy = parseMutation.isPending;
  const needsShift = reportType === TillReportType.Shift;
  const missingShift = needsShift && !selectedShiftId;
  const missingDay = reportType === TillReportType.DayEnd && !activeBusinessDayId;
  const canProcess = photos.length > 0 && !missingShift && !missingDay && !isBusy && Boolean(shopId);

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
        <Text style={ui.sectionTitle}>What is this till report for?</Text>
        <View style={styles.segment}>
          <SegmentButton
            label="Day end"
            active={reportType === TillReportType.DayEnd}
            onPress={() => setReportType(TillReportType.DayEnd)}
          />
          <SegmentButton
            label="A shift"
            active={reportType === TillReportType.Shift}
            onPress={() => setReportType(TillReportType.Shift)}
          />
        </View>

        {reportType === TillReportType.DayEnd ? (
          missingDay ? (
            <Text style={styles.warn}>No open business day. Open today's business day first.</Text>
          ) : (
            <Text style={ui.caption}>Saved against the current business day{activeBusinessDay ? ` (${activeBusinessDay.businessDate})` : ""}.</Text>
          )
        ) : (
          <View style={styles.shiftPicker}>
            {missingDay ? (
              <Text style={styles.warn}>No open business day. Open a business day to list its shifts.</Text>
            ) : shiftsQuery.isLoading ? (
              <Text style={ui.caption}>Loading shifts…</Text>
            ) : shifts.length === 0 ? (
              <Text style={styles.warn}>No shifts for the current business day.</Text>
            ) : (
              shifts.map((shift) => {
                const selected = shift.id === selectedShiftId;
                return (
                  <Pressable
                    key={shift.id}
                    style={[styles.shiftRow, selected ? styles.shiftRowSelected : null]}
                    onPress={() => setSelectedShiftId(shift.id)}
                    disabled={isBusy}
                  >
                    <Text style={styles.shiftName}>{shift.shiftName}</Text>
                    <Text style={[styles.shiftBadge, selected ? styles.shiftBadgeSelected : null]}>
                      {selected ? "Selected" : String(shift.status)}
                    </Text>
                  </Pressable>
                );
              })
            )}
          </View>
        )}
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
          <Pressable style={styles.addButton} onPress={() => void addPhotos("camera")} disabled={isBusy}>
            <Ionicons name="camera-outline" size={17} color={appTheme.colors.text} />
            <Text style={styles.addButtonText}>Camera</Text>
          </Pressable>
          <Pressable style={styles.addButton} onPress={() => void addPhotos("gallery")} disabled={isBusy}>
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
    </ScreenContainer>
  );
}

function SegmentButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.segmentButton, active ? styles.segmentButtonActive : null]} onPress={onPress}>
      <Text style={[styles.segmentText, active ? styles.segmentTextActive : null]}>{label}</Text>
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
  addButtonText: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 13, lineHeight: 16 },
  linkRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  linkRowMain: { flexDirection: "row", alignItems: "center", gap: 10 },
  linkRowText: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 14, lineHeight: 18 },
});
