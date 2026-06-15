import React, { useEffect, useRef, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EmptyState } from "../../components/EmptyState";
import { LoadingState } from "../../components/LoadingState";
import { LandscapeSignatureModal } from "../../components/LandscapeSignatureModal";
import { getRefusalEntry, getRefusalEntrySignature, updateRefusalEntry } from "../../api/refusalRegisterApi";
import { useAuth } from "../../auth/AuthContext";
import { DateTimeField } from "../../components/DateTimeField";
import { FloatingLabelInput } from "../../components/FloatingLabelInput";
import { PrimaryButton } from "../../components/PrimaryButton";
import { ScreenContainer } from "../../components/ScreenContainer";
import { toastError, toastSuccess } from "../../components/toast";
import { StatusBadge } from "../../components/StatusBadge";
import { MainStackParamList } from "../../types/navigation";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";
import { getApiErrorMessage } from "../../utils/apiErrorMessage";
import { buildStaffInitialsForPayload } from "./refusalStaffUtils";

type Props = NativeStackScreenProps<MainStackParamList, "RefusalEntryEdit">;

const productSuggestions = [
  "Alcohol",
  "Tobacco Products",
  "Cigarette Papers",
  "E-Cigarettes",
  "Lottery",
  "Scratchcards",
  "Fireworks",
  "Knife/Razor Blade",
  "Aerosol Spray Paint",
  "Energy Drink",
  "PEGI 18 Game/DVD",
  "PEGI 16 Game/DVD",
];

const refusalReasons = [
  "No ID",
  "Underage",
  "Failed Challenge 25",
  "Intoxicated",
  "Proxy / agency sale",
  "No reason given",
];

export function RefusalEntryEditScreen({ route, navigation }: Props) {
  const { entryId } = route.params;
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  const [hasInitialized, setHasInitialized] = useState(false);
  const [refusalTime, setRefusalTime] = useState("");
  const [product, setProduct] = useState("");
  const [personDescription, setPersonDescription] = useState("");
  const [observations, setObservations] = useState("");
  const [staffMemberInitials, setStaffMemberInitials] = useState("");
  const [signatureDataUrl, setSignatureDataUrl] = useState("");
  const [isSignatureModalVisible, setIsSignatureModalVisible] = useState(false);

  const personDescriptionRef = useRef<TextInput>(null);
  const observationsRef = useRef<TextInput>(null);
  const staffRef = useRef<TextInput>(null);

  const entryQuery = useQuery({
    queryKey: ["refusal-entry", entryId],
    queryFn: () => getRefusalEntry(entryId),
  });

  const signatureQuery = useQuery({
    queryKey: ["refusal-entry-signature", entryId],
    queryFn: () => getRefusalEntrySignature(entryId),
    enabled: Boolean(entryQuery.data?.signatureImagePath),
  });

  useEffect(() => {
    if (!entryQuery.data || hasInitialized) {
      return;
    }

    setRefusalTime(entryQuery.data.refusalTime || "");
    setProduct(entryQuery.data.product);
    setPersonDescription(entryQuery.data.personDescription);
    setObservations(entryQuery.data.observations ?? "");
    setStaffMemberInitials(entryQuery.data.recordedByName ?? entryQuery.data.staffMemberInitials);
    setHasInitialized(true);
  }, [entryQuery.data, hasInitialized]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!product.trim()) throw new Error("Product is required.");
      if (!personDescription.trim()) throw new Error("Description is required.");
      if (!refusalTime.trim()) throw new Error("Time is required.");

      return updateRefusalEntry(entryId, {
        refusalTime,
        product: product.trim(),
        personDescription: personDescription.trim(),
        observations: observations.trim() || undefined,
        staffMemberInitials: buildStaffInitialsForPayload(staffMemberInitials, profile?.email),
        signatureDataUrl: signatureDataUrl.trim() || undefined,
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["refusal-entry", entryId] }),
        queryClient.invalidateQueries({ queryKey: ["refusal-entry-signature", entryId] }),
        queryClient.invalidateQueries({ queryKey: ["refusal-daily-log"] }),
        queryClient.invalidateQueries({ queryKey: ["refusal-daily-log-view"] }),
      ]);
      toastSuccess("Refusal entry updated.");
      navigation.goBack();
    },
    onError: (error: any) => {
      toastError(getApiErrorMessage(error, "Unable to update refusal entry."));
    },
  });

  const openSignatureModal = () => {
    setIsSignatureModalVisible(true);
  };

  const closeSignatureModal = () => {
    setIsSignatureModalVisible(false);
  };

  const entry = entryQuery.data;
  const signaturePreviewUri = signatureDataUrl || signatureQuery.data;

  // Required to save (signature is optional on edit — the existing one is kept).
  const hasProduct = product.trim().length > 0;
  const hasDescription = personDescription.trim().length > 0;
  const hasTime = refusalTime.trim().length > 0;
  const canSave = hasProduct && hasDescription && hasTime && !updateMutation.isPending;
  const missing = [
    !hasProduct ? "product" : null,
    !hasDescription ? "description" : null,
    !hasTime ? "time" : null,
  ].filter(Boolean) as string[];

  const reasonActive = (reason: string) =>
    observations.split("·").map((s) => s.trim().toLowerCase()).includes(reason.toLowerCase());
  const toggleReason = (reason: string) => {
    setObservations((cur) => {
      const parts = cur.split("·").map((s) => s.trim()).filter(Boolean);
      const idx = parts.findIndex((p) => p.toLowerCase() === reason.toLowerCase());
      if (idx >= 0) parts.splice(idx, 1);
      else parts.push(reason);
      return parts.join(" · ");
    });
  };

  return (
    <ScreenContainer
      footer={
        entry ? (
          <View style={styles.footerWrap}>
            {missing.length > 0 ? (
              <View style={styles.footerHintRow}>
                <Ionicons name="information-circle-outline" size={14} color={appTheme.colors.textMuted} />
                <Text style={styles.footerHint}>Add {missing.join(", ")} to save</Text>
              </View>
            ) : null}
            <View style={styles.signFooter}>
              <Pressable
                style={[styles.signFooterBtn, signaturePreviewUri ? styles.signFooterBtnDone : null]}
                onPress={openSignatureModal}
                accessibilityRole="button"
                accessibilityLabel={signaturePreviewUri ? "Re-sign" : "Sign"}
              >
                <Ionicons name={signaturePreviewUri ? "checkmark-circle" : "create-outline"} size={18} color={signaturePreviewUri ? appTheme.colors.success : appTheme.colors.primary} />
                <Text style={[styles.signFooterBtnText, signaturePreviewUri ? styles.signFooterBtnTextDone : null]}>{signaturePreviewUri ? "Signed" : "Sign"}</Text>
              </Pressable>
              <View style={{ flex: 1 }}>
                <PrimaryButton
                  label={updateMutation.isPending ? "Saving…" : "Save changes"}
                  onPress={() => updateMutation.mutate()}
                  disabled={!canSave}
                />
              </View>
            </View>
          </View>
        ) : undefined
      }
    >
      {entryQuery.isLoading ? <View style={ui.card}><LoadingState inline /></View> : null}
      {!entryQuery.isLoading && !entry ? (
        <View style={ui.card}>
          <EmptyState icon="alert-circle-outline" title="Entry not found" message="This refusal entry may have been removed." />
        </View>
      ) : null}

      {entry ? (
        <>
          {/* Entry summary */}
          <View style={ui.card}>
            <View style={styles.entryMetaRow}>
              <Text style={styles.entryMetaTitle}>Refusal No. {entry.sequenceNo}</Text>
              <Text style={styles.meta}>{entry.refusalDate}</Text>
            </View>
            <View style={styles.badgeRow}>
              <StatusBadge label={entry.signatureImagePath ? "Signed" : "No signature"} tone={entry.signatureImagePath ? "success" : "danger"} />
              <StatusBadge label={entry.reviewedOn ? "Reviewed" : "Pending review"} tone={entry.reviewedOn ? "success" : "warning"} />
            </View>
          </View>

          {/* Refusal details */}
          <View style={ui.card}>
            <View style={styles.sectionHeader}>
              <Ionicons name="hand-left-outline" size={18} color={appTheme.colors.primary} />
              <Text style={styles.sectionTitle}>Refusal details</Text>
            </View>

            <Text style={styles.fieldLabel}>Time *</Text>
            <DateTimeField mode="time" value={refusalTime} onChange={setRefusalTime} />

            <FloatingLabelInput
              label="Refused product *"
              value={product}
              onChangeText={setProduct}
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => personDescriptionRef.current?.focus()}
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {productSuggestions.map((item) => (
                <Pressable
                  key={item}
                  style={[styles.chip, item === product ? styles.chipSelected : null]}
                  onPress={() => setProduct(item)}
                >
                  <Text style={[styles.chipText, item === product ? styles.chipTextSelected : null]}>{item}</Text>
                </Pressable>
              ))}
            </ScrollView>

            <Text style={styles.fieldLabel}>Person description *</Text>
            <TextInput
              ref={personDescriptionRef}
              style={[styles.input, styles.textArea]}
              value={personDescription}
              onChangeText={setPersonDescription}
              placeholder="Example: Male, around 14 years old, blonde, blue jacket"
              placeholderTextColor={appTheme.colors.textSubtle}
              multiline
              textAlignVertical="top"
            />

            <Text style={styles.fieldLabel}>Reason (tap to add)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {refusalReasons.map((reason) => {
                const active = reasonActive(reason);
                return (
                  <Pressable key={reason} style={[styles.chip, active ? styles.chipSelected : null]} onPress={() => toggleReason(reason)}>
                    <Text style={[styles.chipText, active ? styles.chipTextSelected : null]}>{reason}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <Text style={styles.fieldLabel}>Observations</Text>
            <TextInput
              ref={observationsRef}
              style={[styles.input, styles.textArea]}
              value={observations}
              onChangeText={setObservations}
              placeholder="Example: Nervous and refused to show ID"
              placeholderTextColor={appTheme.colors.textSubtle}
              multiline
              textAlignVertical="top"
            />
          </View>

          {/* Recorded by */}
          <View style={ui.card}>
            <View style={styles.sectionHeader}>
              <Ionicons name="person-outline" size={18} color={appTheme.colors.primary} />
              <Text style={styles.sectionTitle}>Recorded by</Text>
            </View>

            <FloatingLabelInput
              ref={staffRef}
              label="Staff member full name"
              value={staffMemberInitials}
              onChangeText={setStaffMemberInitials}
              autoCapitalize="words"
              returnKeyType="done"
            />

            <Text style={styles.fieldLabel}>Signature</Text>
            <Pressable style={styles.signaturePreviewCard} onPress={openSignatureModal} accessibilityRole="button" accessibilityLabel="Tap to sign">
              {signaturePreviewUri ? (
                <>
                  <Image source={{ uri: signaturePreviewUri }} style={styles.signaturePreviewImage} resizeMode="contain" />
                  <Text style={styles.signatureTapHint}>Tap to re-sign</Text>
                </>
              ) : (
                <Text style={styles.signaturePlaceholder}>
                  {signatureQuery.isLoading ? "Loading signature…" : "✍  Tap here to sign"}
                </Text>
              )}
            </Pressable>
            {signatureDataUrl ? (
              <View style={styles.signatureActionRow}>
                <Pressable style={styles.secondaryButton} onPress={() => setSignatureDataUrl("")}>
                  <Text style={styles.secondaryButtonText}>Clear re-sign</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        </>
      ) : null}

      <LandscapeSignatureModal
        visible={isSignatureModalVisible}
        title="Staff Signature"
        description="Sign with your finger, then press Save."
        onClose={closeSignatureModal}
        onSave={(value) => {
          setSignatureDataUrl(value);
          setIsSignatureModalVisible(false);
        }}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  screenHeaderCard: {
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.md,
    backgroundColor: appTheme.colors.surfaceNeutralSoft,
    paddingHorizontal: appTheme.spacing.md,
    paddingVertical: appTheme.spacing.md,
    gap: 2,
  },
  screenHeaderEyebrow: {
    color: appTheme.colors.textSubtle,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 11,
    lineHeight: 14,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  screenHeaderTitle: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.heading,
    fontSize: 25,
    lineHeight: 30,
  },
  screenHeaderMeta: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.body,
    fontSize: 13,
    lineHeight: 17,
  },
  sectionTitle: {
    color: appTheme.colors.text,
    fontSize: 17,
    lineHeight: 22,
    fontFamily: appTheme.fonts.bodyMedium,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: appTheme.spacing.xs,
    marginBottom: appTheme.spacing.xs,
  },
  entryMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: appTheme.spacing.xs,
  },
  entryMetaTitle: {
    color: appTheme.colors.text,
    fontSize: 17,
    lineHeight: 22,
    fontFamily: appTheme.fonts.heading,
  },
  footerWrap: {
    gap: appTheme.spacing.xs,
  },
  footerHintRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  footerHint: {
    color: appTheme.colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: appTheme.fonts.body,
  },
  signFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: appTheme.spacing.sm,
  },
  signFooterBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: appTheme.spacing.md,
    paddingVertical: appTheme.spacing.sm,
    borderRadius: appTheme.radius.sm,
    borderWidth: 1,
    borderColor: appTheme.colors.primary,
    backgroundColor: appTheme.colors.surface,
  },
  signFooterBtnDone: {
    borderColor: appTheme.colors.success,
  },
  signFooterBtnText: {
    color: appTheme.colors.primary,
    fontSize: 14,
    lineHeight: 18,
    fontFamily: appTheme.fonts.bodyMedium,
  },
  signFooterBtnTextDone: {
    color: appTheme.colors.success,
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: appTheme.spacing.xs,
  },
  fieldLabel: {
    color: appTheme.colors.text,
    fontSize: 13,
    lineHeight: 16,
    fontFamily: appTheme.fonts.bodyMedium,
    marginTop: 2,
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
    lineHeight: 18,
    fontFamily: appTheme.fonts.body,
  },
  textArea: {
    minHeight: 72,
  },
  chipRow: {
    gap: appTheme.spacing.xs,
  },
  chip: {
    borderWidth: 1,
    borderColor: appTheme.colors.borderStrong,
    borderRadius: appTheme.radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: appTheme.colors.surfaceMuted,
  },
  chipSelected: {
    borderColor: appTheme.colors.primary,
    backgroundColor: appTheme.colors.surfaceBrandSoft,
  },
  chipText: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.body,
    fontSize: 12,
    lineHeight: 16,
  },
  chipTextSelected: {
    color: appTheme.colors.primary,
    fontFamily: appTheme.fonts.bodyMedium,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: appTheme.colors.primary,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignSelf: "flex-start",
  },
  secondaryButtonText: {
    color: appTheme.colors.primary,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 16,
  },
  signaturePreviewCard: {
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    minHeight: 120,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    padding: appTheme.spacing.xs,
  },
  signaturePreviewImage: {
    width: "100%",
    height: 110,
  },
  signatureTapHint: {
    color: appTheme.colors.primary,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    marginTop: 4,
  },
  signaturePlaceholder: {
    color: appTheme.colors.textSubtle,
    fontFamily: appTheme.fonts.body,
    fontSize: 12,
    lineHeight: 16,
    textAlign: "center",
  },
  signatureActionRow: {
    flexDirection: "row",
    gap: appTheme.spacing.xs,
  },
  meta: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.body,
    fontSize: 13,
    lineHeight: 18,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: appTheme.colors.overlay,
    justifyContent: "center",
    paddingHorizontal: appTheme.spacing.md,
  },
  signatureModalCard: {
    backgroundColor: appTheme.colors.background,
    borderRadius: appTheme.radius.lg,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    padding: appTheme.spacing.md,
    gap: appTheme.spacing.sm,
  },
  signaturePadWrap: {
    height: 240,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    overflow: "hidden",
    backgroundColor: appTheme.colors.surface,
  },
  modalActionRow: {
    flexDirection: "row",
    gap: appTheme.spacing.xs,
  },
  modalActionButton: {
    flex: 1,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    paddingVertical: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  modalActionPrimary: {
    backgroundColor: appTheme.colors.primary,
    borderColor: appTheme.colors.primaryPressed,
  },
  modalActionSecondary: {
    backgroundColor: appTheme.colors.surfaceMuted,
    borderColor: appTheme.colors.borderStrong,
  },
  modalActionPrimaryText: {
    color: appTheme.colors.onPrimary,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 18,
  },
  modalActionSecondaryText: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 18,
  },
});


