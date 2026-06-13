import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Image, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { LandscapeSignatureModal } from "../../components/LandscapeSignatureModal";
import { DateTimeField, formatDateValue, formatTimeValue } from "../../components/DateTimeField";
import { FloatingLabelInput } from "../../components/FloatingLabelInput";
import { PrimaryButton } from "../../components/PrimaryButton";
import { ScreenContainer } from "../../components/ScreenContainer";
import { toastError, toastSuccess } from "../../components/toast";
import {
  createVisitorEntry,
  getVisitorEntry,
  getVisitorEntrySignature,
  searchVisitorOrganisations,
  updateVisitorEntry,
} from "../../api/visitorLogApi";
import { useAuth } from "../../auth/AuthContext";
import { useFeature } from "../../features/subscription/useFeature";
import { MainStackParamList } from "../../types/navigation";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";
import { getApiErrorMessage } from "../../utils/apiErrorMessage";
import { cleanupLocalImage } from "../../utils/shareFile";

type Props = NativeStackScreenProps<MainStackParamList, "VisitorLogEntryEdit">;

const VISIT_TYPES: string[] = ["Delivery", "Contractor", "Rep", "Inspector", "Other"];

export function VisitorLogEntryEditScreen({ route, navigation }: Props) {
  const entryId = route.params?.entryId;
  const isEdit = Boolean(entryId);
  const queryClient = useQueryClient();
  const { activeShopId, activeShop } = useAuth();
  const isFuelStation = Boolean(activeShop?.isFuelStation);
  const photoFeature = useFeature("visitor_log.attachments");

  // Tap "Next" on the keyboard to advance through text fields. Skips date/time/chip controls
  // which can't accept focus from a keyboard return key.
  const organisationRef = useRef<TextInput>(null);
  const purposeRef = useRef<TextInput>(null);
  const vehicleRegRef = useRef<TextInput>(null);
  const notesRef = useRef<TextInput>(null);

  const [hasInit, setHasInit] = useState(false);
  const [visitDate, setVisitDate] = useState(() => formatDateValue(new Date()));
  const [timeIn, setTimeIn] = useState(() => formatTimeValue(new Date()));
  const [timeOut, setTimeOut] = useState<string>("");
  const [visitorName, setVisitorName] = useState("");
  const [organisation, setOrganisation] = useState("");
  const [visitType, setVisitType] = useState<string>("Other");
  const [purpose, setPurpose] = useState("");
  const [vehicleReg, setVehicleReg] = useState("");
  const [notes, setNotes] = useState("");
  const [spaPassport, setSpaPassport] = useState("");
  const [permit, setPermit] = useState("");
  const [induction, setInduction] = useState(false);
  const [signatureDataUrl, setSignatureDataUrl] = useState("");
  const [photoDataUrl, setPhotoDataUrl] = useState("");
  const [signatureModalOpen, setSignatureModalOpen] = useState(false);
  const [showOrgSuggestions, setShowOrgSuggestions] = useState(false);

  const entryQuery = useQuery({
    queryKey: ["visitor-entry", entryId],
    queryFn: () => getVisitorEntry(entryId as string),
    enabled: isEdit,
  });

  const existingSignatureQuery = useQuery({
    queryKey: ["visitor-entry-signature", entryId],
    queryFn: () => getVisitorEntrySignature(entryId as string),
    enabled: isEdit && Boolean(entryQuery.data?.hasSignature),
  });

  useEffect(() => {
    if (!isEdit || !entryQuery.data || hasInit) return;
    const e = entryQuery.data;
    setVisitDate(e.visitDate);
    setTimeIn(e.timeIn);
    setTimeOut(e.timeOut ?? "");
    setVisitorName(e.visitorName);
    setOrganisation(e.organisation ?? "");
    setVisitType(e.visitType || "Other");
    setPurpose(e.purpose ?? "");
    setVehicleReg(e.vehicleRegistration ?? "");
    setNotes(e.notes ?? "");
    setSpaPassport(e.spaPassportRef ?? "");
    setPermit(e.permitToWorkRef ?? "");
    setInduction(e.inductionAcknowledged);
    setHasInit(true);
  }, [entryQuery.data, hasInit, isEdit]);

  // Platform-wide company-name type-ahead so the same organisation is spelled consistently.
  const orgQuery = useQuery({
    queryKey: ["visitor-organisations", activeShopId, organisation.trim()],
    queryFn: () => searchVisitorOrganisations(activeShopId as string, organisation.trim()),
    enabled: Boolean(activeShopId) && organisation.trim().length >= 2 && showOrgSuggestions,
  });
  const orgSuggestions = orgQuery.data ?? [];

  const capturePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Camera blocked", "Allow camera access to attach a visitor photo.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ base64: true, quality: 0.5, allowsEditing: true });
    if (!result.canceled && result.assets?.[0]?.base64) {
      setPhotoDataUrl(`data:image/jpeg;base64,${result.assets[0].base64}`);
      // Only the base64 data URL is kept (preview + upload) — the camera's file copy in the
      // sandbox is never read again, so delete it straight away.
      void cleanupLocalImage(result.assets[0].uri);
    }
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!activeShopId) throw new Error("No active shop selected.");
      if (!visitorName.trim()) throw new Error("Visitor name is required.");
      if (!timeIn.trim()) throw new Error("Time in is required.");
      if (!isEdit && !signatureDataUrl.trim()) throw new Error("Signature is required.");

      const common = {
        visitorName: visitorName.trim(),
        organisation: organisation.trim() || undefined,
        visitType,
        purpose: purpose.trim() || undefined,
        vehicleRegistration: vehicleReg.trim() || undefined,
        notes: notes.trim() || undefined,
        spaPassportRef: isFuelStation ? spaPassport.trim() || undefined : undefined,
        permitToWorkRef: isFuelStation ? permit.trim() || undefined : undefined,
        inductionAcknowledged: isFuelStation ? induction : undefined,
        photoDataUrl: photoDataUrl.trim() || undefined,
      };

      if (isEdit) {
        return updateVisitorEntry(entryId as string, {
          ...common,
          timeIn,
          timeOut: timeOut.trim() || undefined,
          signatureDataUrl: signatureDataUrl.trim() || undefined,
        });
      }
      return createVisitorEntry({
        ...common,
        shopId: activeShopId,
        visitDate,
        timeIn,
        signatureDataUrl: signatureDataUrl.trim(),
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["visitor-daily-log"] }),
        queryClient.invalidateQueries({ queryKey: ["visitor-on-site"] }),
        queryClient.invalidateQueries({ queryKey: ["visitor-entry", entryId] }),
      ]);
      toastSuccess(isEdit ? "Visitor entry updated." : "Visitor signed in.");
      navigation.goBack();
    },
    onError: (error: any) => {
      toastError(getApiErrorMessage(error, "Unable to save visitor entry."));
    },
  });

  const signaturePreview = signatureDataUrl || existingSignatureQuery.data;
  const isInspector = useMemo(() => visitType === "Inspector", [visitType]);

  // Title rendered by the navigator header instead of an in-screen card.
  useEffect(() => {
    navigation.setOptions({ title: isEdit ? "Edit visit" : "Sign in visitor" });
  }, [navigation, isEdit]);

  return (
    <ScreenContainer
      footer={
        <View style={styles.signFooter}>
          <Pressable
            style={[styles.signFooterBtn, signaturePreview ? styles.signFooterBtnDone : null]}
            onPress={() => setSignatureModalOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={signaturePreview ? "Re-sign" : "Sign"}
          >
            <Ionicons
              name={signaturePreview ? "checkmark-circle" : "create-outline"}
              size={18}
              color={signaturePreview ? appTheme.colors.success : appTheme.colors.primary}
            />
            <Text style={[styles.signFooterBtnText, signaturePreview ? styles.signFooterBtnTextDone : null]}>
              {signaturePreview ? "Signed" : "Sign"}
            </Text>
          </Pressable>
          <View style={{ flex: 1 }}>
            <PrimaryButton
              label={saveMutation.isPending ? "Saving…" : isEdit ? "Save changes" : "Sign in"}
              icon="checkmark-outline"
              onPress={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
            />
          </View>
        </View>
      }
    >
      <View style={ui.card}>
        <DateTimeField mode="date" value={visitDate} onChange={setVisitDate} maximumDate={new Date()} />
        <DateTimeField mode="time" value={timeIn} onChange={setTimeIn} />

        <FloatingLabelInput
          label="Visitor name *"
          value={visitorName}
          onChangeText={setVisitorName}
          autoCapitalize="words"
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => organisationRef.current?.focus()}
        />

        <View style={{ position: "relative" }}>
          <FloatingLabelInput
            ref={organisationRef}
            label="Company / organisation"
            value={organisation}
            onChangeText={(t) => {
              setOrganisation(t);
              setShowOrgSuggestions(true);
            }}
            autoCapitalize="words"
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => purposeRef.current?.focus()}
          />
          {showOrgSuggestions && orgSuggestions.length > 0 ? (
            <View style={styles.suggestBox}>
              {orgSuggestions.map((o) => (
                <Pressable
                  key={o.id}
                  style={styles.suggestItem}
                  onPress={() => {
                    setOrganisation(o.name);
                    setShowOrgSuggestions(false);
                  }}
                >
                  <Text style={styles.suggestName}>{o.name}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>

        <Text style={styles.fieldLabel}>Visit type</Text>
        <View style={styles.chipsRow}>
          {VISIT_TYPES.map((t) => (
            <Pressable key={t} onPress={() => setVisitType(t)} style={[styles.chip, visitType === t ? styles.chipActive : null]}>
              <Text style={[styles.chipText, visitType === t ? styles.chipTextActive : null]}>{t}</Text>
            </Pressable>
          ))}
        </View>
        {isInspector ? <Text style={styles.inspectorHint}>⚑ Managers will be alerted that an inspector is on site.</Text> : null}

        <FloatingLabelInput
          ref={purposeRef}
          label="Reason / work"
          value={purpose}
          onChangeText={setPurpose}
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => vehicleRegRef.current?.focus()}
        />
        <FloatingLabelInput
          ref={vehicleRegRef}
          label="Vehicle registration"
          value={vehicleReg}
          onChangeText={setVehicleReg}
          autoCapitalize="characters"
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => notesRef.current?.focus()}
        />
      </View>

      {isFuelStation ? (
        <View style={ui.card}>
          <Text style={styles.cardTitle}>Forecourt contractor controls</Text>
          <FloatingLabelInput label="SPA passport ref" value={spaPassport} onChangeText={setSpaPassport} autoCapitalize="characters" />
          <FloatingLabelInput label="Permit-to-work ref" value={permit} onChangeText={setPermit} autoCapitalize="characters" />
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Site induction acknowledged</Text>
            <Switch value={induction} onValueChange={setInduction} />
          </View>
        </View>
      ) : null}

      <View style={ui.card}>
        <Text style={styles.cardTitle}>Signature {isEdit ? "" : "*"}</Text>
        {signaturePreview ? (
          <Pressable onPress={() => setSignatureModalOpen(true)} accessibilityRole="button" accessibilityLabel="Tap to re-sign">
            <Image source={{ uri: signaturePreview }} style={styles.signaturePreview} resizeMode="contain" />
            <Text style={styles.signatureHint}>Tap to re-sign</Text>
          </Pressable>
        ) : (
          <Pressable style={styles.signaturePad} onPress={() => setSignatureModalOpen(true)} accessibilityRole="button" accessibilityLabel="Tap to sign">
            <Ionicons name="create-outline" size={22} color={appTheme.colors.primary} />
            <Text style={styles.signaturePadText}>Tap here to sign</Text>
          </Pressable>
        )}

        <FloatingLabelInput
          ref={notesRef}
          label="Notes (optional)"
          value={notes}
          onChangeText={setNotes}
          multiline
          returnKeyType="done"
        />

        {photoFeature.isAllowed ? (
          <>
            <Text style={[styles.cardTitle, { marginTop: 12 }]}>Photo (optional)</Text>
            {photoDataUrl ? <Image source={{ uri: photoDataUrl }} style={styles.photoPreview} resizeMode="cover" /> : null}
            <PrimaryButton label={photoDataUrl ? "Retake photo" : "Take photo"} tone="neutral" icon="camera-outline" onPress={() => void capturePhoto()} />
          </>
        ) : null}
      </View>

      <LandscapeSignatureModal
        visible={signatureModalOpen}
        title="Visitor signature"
        onClose={() => setSignatureModalOpen(false)}
        onSave={(dataUrl) => {
          setSignatureDataUrl(dataUrl);
          setSignatureModalOpen(false);
        }}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  headerCard: { gap: 2 },
  eyebrow: { color: appTheme.colors.textSubtle, fontFamily: appTheme.fonts.bodyMedium, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.4 },
  title: { color: appTheme.colors.text, fontFamily: appTheme.fonts.heading, fontSize: 22, lineHeight: 27 },
  row: { flexDirection: "row", gap: appTheme.spacing.xs },
  flex1: { flex: 1 },
  fieldLabel: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 13, marginTop: 4 },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: appTheme.spacing.xs },
  chip: { borderWidth: 1, borderColor: appTheme.colors.border, borderRadius: appTheme.radius.pill, paddingHorizontal: 14, paddingVertical: 7, backgroundColor: appTheme.colors.surfaceMuted },
  chipActive: { backgroundColor: appTheme.colors.surfaceTint, borderColor: appTheme.colors.primary },
  chipText: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.bodyMedium, fontSize: 13 },
  chipTextActive: { color: appTheme.colors.primary },
  inspectorHint: { color: appTheme.colors.warning, fontFamily: appTheme.fonts.bodyMedium, fontSize: 12 },
  cardTitle: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 16, lineHeight: 20 },
  meta: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 13 },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  switchLabel: { color: appTheme.colors.text, fontFamily: appTheme.fonts.body, fontSize: 14, flex: 1 },
  signaturePreview: { width: "100%", height: 120, backgroundColor: appTheme.colors.surfaceMuted, borderRadius: appTheme.radius.sm },
  // Sticky bottom bar: Sign button + Save, always reachable without scrolling.
  signFooter: { flexDirection: "row", alignItems: "center", gap: appTheme.spacing.sm },
  signFooterBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: appTheme.radius.pill,
    borderWidth: 1,
    borderColor: appTheme.colors.borderBrandSoft,
    backgroundColor: appTheme.colors.surface,
  },
  signFooterBtnDone: {
    borderColor: appTheme.colors.borderSuccessSoft,
    backgroundColor: appTheme.colors.surfaceSuccessSoft,
  },
  signFooterBtnText: { color: appTheme.colors.primary, fontFamily: appTheme.fonts.bodyMedium, fontSize: 14 },
  signFooterBtnTextDone: { color: appTheme.colors.success },
  signatureHint: { color: appTheme.colors.primary, fontFamily: appTheme.fonts.bodyMedium, fontSize: 12, textAlign: "center", marginTop: 6 },
  signaturePad: { height: 120, borderRadius: appTheme.radius.sm, borderWidth: 1, borderStyle: "dashed", borderColor: appTheme.colors.primary, backgroundColor: appTheme.colors.surfaceMuted, alignItems: "center", justifyContent: "center", gap: 6 },
  signaturePadText: { color: appTheme.colors.primary, fontFamily: appTheme.fonts.bodyMedium, fontSize: 14 },
  photoPreview: { width: "100%", height: 180, backgroundColor: appTheme.colors.surfaceMuted, borderRadius: appTheme.radius.sm },
  suggestBox: { borderWidth: 1, borderColor: appTheme.colors.border, borderRadius: appTheme.radius.sm, backgroundColor: appTheme.colors.surface, marginTop: 4, overflow: "hidden" },
  suggestItem: { paddingHorizontal: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: appTheme.colors.borderSoft },
  suggestName: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 14 },
  suggestMeta: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 12 },
});
