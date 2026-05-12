import React, { useEffect, useRef, useState } from "react";
import { Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import SignatureScreen, { SignatureViewRef } from "react-native-signature-canvas";
import { getRefusalEntry, getRefusalEntrySignature, updateRefusalEntry } from "../../api/refusalRegisterApi";
import { useAuth } from "../../auth/AuthContext";
import { DateTimeField } from "../../components/DateTimeField";
import { PrimaryButton } from "../../components/PrimaryButton";
import { ScreenContainer } from "../../components/ScreenContainer";
import { StatusBadge } from "../../components/StatusBadge";
import { MainStackParamList } from "../../types/navigation";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";
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

export function RefusalEntryEditScreen({ route, navigation }: Props) {
  const { entryId } = route.params;
  const queryClient = useQueryClient();
  const signatureRef = useRef<SignatureViewRef>(null);
  const { profile } = useAuth();

  const [hasInitialized, setHasInitialized] = useState(false);
  const [refusalTime, setRefusalTime] = useState("");
  const [product, setProduct] = useState("");
  const [personDescription, setPersonDescription] = useState("");
  const [observations, setObservations] = useState("");
  const [staffMemberInitials, setStaffMemberInitials] = useState("");
  const [signatureDataUrl, setSignatureDataUrl] = useState("");
  const [isSignatureModalVisible, setIsSignatureModalVisible] = useState(false);

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
      if (!personDescription.trim()) throw new Error("Person description is required.");
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
      Alert.alert("Saved", "Refusal entry updated.");
      navigation.goBack();
    },
    onError: (error: any) => {
      Alert.alert("Failed", error?.response?.data?.message ?? error?.message ?? "Unable to update refusal entry.");
    },
  });

  const openSignatureModal = () => {
    setIsSignatureModalVisible(true);
  };

  const closeSignatureModal = () => {
    setIsSignatureModalVisible(false);
  };

  const saveSignatureFromPad = () => {
    signatureRef.current?.readSignature();
  };

  const entry = entryQuery.data;
  const signaturePreviewUri = signatureDataUrl || signatureQuery.data;

  return (
    <ScreenContainer>
      <View style={styles.screenHeaderCard}>
        <Text style={styles.screenHeaderEyebrow}>No ID / No Sale</Text>
        <Text style={styles.screenHeaderTitle}>Edit Refusal Entry</Text>
        <Text style={styles.screenHeaderMeta}>Update details and optionally replace the staff signature.</Text>
      </View>

      <View style={ui.card}>
        {entryQuery.isLoading ? <Text style={styles.meta}>Loading entry...</Text> : null}
        {!entryQuery.isLoading && !entry ? <Text style={styles.meta}>Entry not found.</Text> : null}
        {entry ? (
          <>
            <Text style={styles.meta}>No. {entry.sequenceNo}</Text>
            <Text style={styles.meta}>Date: {entry.refusalDate}</Text>
            <View style={styles.badgeRow}>
              <StatusBadge label={entry.signatureImagePath ? "Signed" : "No Signature"} tone={entry.signatureImagePath ? "success" : "danger"} />
              <StatusBadge label={entry.reviewedOn ? "Reviewed" : "Pending Review"} tone={entry.reviewedOn ? "success" : "warning"} />
            </View>
            <DateTimeField mode="time" value={refusalTime} onChange={setRefusalTime} />

            <Text style={styles.fieldLabel}>Product</Text>
            <TextInput
              style={styles.input}
              value={product}
              onChangeText={setProduct}
              placeholder="Enter refused product"
              placeholderTextColor={appTheme.colors.textSubtle}
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

            <Text style={styles.fieldLabel}>Name of person or description</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={personDescription}
              onChangeText={setPersonDescription}
              placeholder="Person description"
              placeholderTextColor={appTheme.colors.textSubtle}
              multiline
              textAlignVertical="top"
            />

            <Text style={styles.fieldLabel}>Observations</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={observations}
              onChangeText={setObservations}
              placeholder="Observations"
              placeholderTextColor={appTheme.colors.textSubtle}
              multiline
              textAlignVertical="top"
            />

            <Text style={styles.fieldLabel}>Staff Member Name</Text>
            <TextInput
              style={styles.input}
              value={staffMemberInitials}
              onChangeText={setStaffMemberInitials}
              placeholder="Full name"
              placeholderTextColor={appTheme.colors.textSubtle}
              autoCapitalize="words"
            />

            <Text style={styles.fieldLabel}>Signature</Text>
            <View style={styles.signaturePreviewCard}>
              {signaturePreviewUri ? (
                <Image source={{ uri: signaturePreviewUri }} style={styles.signaturePreviewImage} resizeMode="contain" />
              ) : (
                <Text style={styles.signaturePlaceholder}>
                  {signatureQuery.isLoading ? "Loading signature..." : entry.signatureImagePath ? "Existing signature will be kept." : "No signature on file."}
                </Text>
              )}
            </View>
            <View style={styles.signatureActionRow}>
              <Pressable style={styles.secondaryButton} onPress={openSignatureModal}>
                <Text style={styles.secondaryButtonText}>{signatureDataUrl ? "Re-Capture Signature" : "Capture New Signature"}</Text>
              </Pressable>
              {signatureDataUrl ? (
                <Pressable style={styles.secondaryButton} onPress={() => setSignatureDataUrl("")}>
                  <Text style={styles.secondaryButtonText}>Clear</Text>
                </Pressable>
              ) : null}
            </View>

            <PrimaryButton
              label={updateMutation.isPending ? "Saving..." : "Save Changes"}
              onPress={() => updateMutation.mutate()}
              disabled={updateMutation.isPending}
            />
            <PrimaryButton label="Cancel" tone="neutral" onPress={() => navigation.goBack()} disabled={updateMutation.isPending} />
          </>
        ) : null}
      </View>

      <Modal
        visible={isSignatureModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeSignatureModal}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.signatureModalCard}>
            <Text style={styles.sectionTitle}>Capture Signature</Text>
            <Text style={styles.meta}>Sign in the box, then press Save.</Text>
            <View style={styles.signaturePadWrap}>
              <SignatureScreen
                ref={signatureRef}
                onOK={(value) => {
                  setSignatureDataUrl(value);
                  setIsSignatureModalVisible(false);
                }}
                onEmpty={() => Alert.alert("Signature required", "Please sign before saving.")}
                autoClear={false}
                descriptionText="Staff signature"
                webStyle={`
                  .m-signature-pad--footer {display: none; margin: 0;}
                  .m-signature-pad {box-shadow: none; border: none;}
                  body, html {width: 100%; height: 100%;}
                `}
              />
            </View>
            <View style={styles.modalActionRow}>
              <Pressable
                style={[styles.modalActionButton, styles.modalActionSecondary]}
                onPress={() => signatureRef.current?.clearSignature()}
              >
                <Text style={styles.modalActionSecondaryText}>Clear</Text>
              </Pressable>
              <Pressable
                style={[styles.modalActionButton, styles.modalActionPrimary]}
                onPress={saveSignatureFromPad}
              >
                <Text style={styles.modalActionPrimaryText}>Save</Text>
              </Pressable>
              <Pressable
                style={[styles.modalActionButton, styles.modalActionSecondary]}
                onPress={closeSignatureModal}
              >
                <Text style={styles.modalActionSecondaryText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  screenHeaderCard: {
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.md,
    backgroundColor: "#F1F6FC",
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
    backgroundColor: "#E9F7F6",
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
    backgroundColor: "rgba(15, 23, 28, 0.45)",
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
