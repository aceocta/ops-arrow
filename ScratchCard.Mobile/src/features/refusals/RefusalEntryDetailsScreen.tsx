import React, { useState } from "react";
import { Alert, Image, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getRefusalEntry, getRefusalEntryReviewSignature, getRefusalEntrySignature, reviewRefusalEntry } from "../../api/refusalRegisterApi";
import { useAuth } from "../../auth/AuthContext";
import { ScreenContainer } from "../../components/ScreenContainer";
import { MainStackParamList } from "../../types/navigation";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";
import { getStaffDisplayName } from "./refusalStaffUtils";

type Props = NativeStackScreenProps<MainStackParamList, "RefusalEntryDetails">;

function formatDateTimeValue(value?: string) {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return `${parsed.toLocaleDateString()} ${parsed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

export function RefusalEntryDetailsScreen({ route, navigation }: Props) {
  const { entryId } = route.params;
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const [isReviewModalVisible, setIsReviewModalVisible] = useState(false);
  const [reviewNotes, setReviewNotes] = useState("");

  const entryQuery = useQuery({
    queryKey: ["refusal-entry", entryId],
    queryFn: () => getRefusalEntry(entryId),
  });

  const signatureQuery = useQuery({
    queryKey: ["refusal-entry-signature", entryId],
    queryFn: () => getRefusalEntrySignature(entryId),
    enabled: Boolean(entryQuery.data?.signatureImagePath),
  });
  const reviewSignatureQuery = useQuery({
    queryKey: ["refusal-entry-review-signature", entryId],
    queryFn: () => getRefusalEntryReviewSignature(entryId),
    enabled: Boolean(entryQuery.data?.reviewSignatureImagePath),
  });

  const entry = entryQuery.data;
  const signatureDataUrl = signatureQuery.data;
  const canReview = profile?.roles?.some((role) => role === "ShopOwner" || role === "Manager") ?? false;

  const reviewMutation = useMutation({
    mutationFn: async () => {
      return reviewRefusalEntry(entryId, {
        notes: reviewNotes.trim() || undefined,
      });
    },
    onSuccess: async () => {
      setIsReviewModalVisible(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["refusal-entry", entryId] }),
        queryClient.invalidateQueries({ queryKey: ["refusal-entry-review-signature", entryId] }),
        queryClient.invalidateQueries({ queryKey: ["refusal-review-range"] }),
        queryClient.invalidateQueries({ queryKey: ["refusal-daily-log"] }),
        queryClient.invalidateQueries({ queryKey: ["refusal-daily-log-view"] }),
      ]);
      Alert.alert("Saved", "Manager review updated.");
    },
    onError: (error: any) => {
      Alert.alert("Failed", error?.response?.data?.message ?? error?.message ?? "Unable to update manager review.");
    },
  });

  const openReviewModal = () => {
    setReviewNotes(entry?.reviewNotes ?? "");
    setIsReviewModalVisible(true);
  };

  return (
    <ScreenContainer>
      <View style={styles.hero}>
        <Text style={styles.heroTitle}>Refusal Details</Text>
        <Text style={styles.heroNote}>Review full refusal record before editing.</Text>
      </View>

      <View style={ui.card}>
        {entryQuery.isLoading ? <Text style={styles.meta}>Loading entry...</Text> : null}
        {!entryQuery.isLoading && !entry ? <Text style={styles.meta}>Entry not found.</Text> : null}
        {entry ? (
          <>
            <Text style={styles.title}>No. {entry.sequenceNo}</Text>
            <Text style={styles.meta}>Date: {entry.refusalDate}</Text>
            <Text style={styles.meta}>Time: {entry.refusalTime || "--:--"}</Text>
            <Text style={styles.meta}>Product: {entry.product}</Text>
            <Text style={styles.meta}>Person: {entry.personDescription}</Text>
            {entry.observations ? <Text style={styles.meta}>Observations: {entry.observations}</Text> : null}
            <Text style={styles.meta}>Staff: {getStaffDisplayName(entry)}</Text>
            <Text style={styles.meta}>Signature: {entry.signatureImagePath ? "Saved" : "Missing"}</Text>
            <View style={styles.signaturePreviewCard}>
              {signatureDataUrl ? (
                <Image source={{ uri: signatureDataUrl }} style={styles.signaturePreviewImage} resizeMode="contain" />
              ) : (
                <Text style={styles.pathText}>
                  {signatureQuery.isLoading
                    ? "Loading signature..."
                    : entry.signatureImagePath
                      ? "No signature image available."
                      : "No signature on file."}
                </Text>
              )}
            </View>
            <View style={styles.reviewCard}>
              <Text style={styles.reviewTitle}>Manager Review</Text>
              <Text style={styles.meta}>Status: {entry.reviewedOn ? "Reviewed" : "Pending"}</Text>
              {entry.reviewedByName ? <Text style={styles.meta}>Reviewed by: {entry.reviewedByName}</Text> : null}
              {entry.reviewedOn ? <Text style={styles.meta}>Reviewed on: {formatDateTimeValue(entry.reviewedOn)}</Text> : null}
              {entry.reviewNotes ? <Text style={styles.meta}>Review notes: {entry.reviewNotes}</Text> : null}
              {entry.reviewedOn ? (
                <Text style={styles.meta}>Review signature: {entry.reviewSignatureImagePath ? "Saved" : "Missing"}</Text>
              ) : null}
              {entry.reviewedOn ? (
                <View style={styles.reviewSignatureCard}>
                  {reviewSignatureQuery.data ? (
                    <Image source={{ uri: reviewSignatureQuery.data }} style={styles.signaturePreviewImage} resizeMode="contain" />
                  ) : (
                    <Text style={styles.pathText}>
                      {reviewSignatureQuery.isLoading
                        ? "Loading review signature..."
                        : entry.reviewSignatureImagePath
                          ? "No review signature image available."
                          : "No review signature on file."}
                    </Text>
                  )}
                </View>
              ) : null}
              {canReview ? (
                <Pressable
                  style={styles.reviewButton}
                  onPress={openReviewModal}
                >
                  <Text style={styles.reviewButtonText}>{entry.reviewedOn ? "Update Review" : "Mark as Reviewed"}</Text>
                </Pressable>
              ) : (
                <Text style={styles.pathText}>Only manager or shop owner can complete review.</Text>
              )}
            </View>
            <Pressable
              style={styles.editButton}
              onPress={() => navigation.navigate("RefusalEntryEdit", { entryId: entry.id })}
            >
              <Text style={styles.editButtonText}>Edit Entry</Text>
            </Pressable>
          </>
        ) : null}
      </View>

      <Modal
        visible={isReviewModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsReviewModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.title}>Manager Review</Text>
            <Text style={styles.meta}>Add optional notes and save review.</Text>
            <TextInput
              style={styles.notesInput}
              value={reviewNotes}
              onChangeText={setReviewNotes}
              placeholder="Review notes (optional)"
              placeholderTextColor={appTheme.colors.textSubtle}
              multiline
              textAlignVertical="top"
            />
            <View style={styles.modalActionRow}>
              <Pressable
                style={[styles.modalActionButton, styles.modalActionSecondary]}
                onPress={() => setIsReviewModalVisible(false)}
                disabled={reviewMutation.isPending}
              >
                <Text style={styles.modalActionSecondaryText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalActionButton, styles.modalActionPrimary]}
                onPress={() => reviewMutation.mutate()}
                disabled={reviewMutation.isPending}
              >
                <Text style={styles.modalActionPrimaryText}>{reviewMutation.isPending ? "Saving..." : "Save Review"}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: appTheme.colors.primary,
    borderRadius: appTheme.radius.lg,
    borderWidth: 1,
    borderColor: appTheme.colors.primaryPressed,
    padding: appTheme.spacing.lg,
    gap: appTheme.spacing.xs,
  },
  heroTitle: {
    color: appTheme.colors.onPrimary,
    fontFamily: appTheme.fonts.heading,
    fontSize: 20,
    lineHeight: 24,
  },
  heroNote: {
    color: "#DCEAF4",
    fontFamily: appTheme.fonts.body,
    fontSize: 13,
    lineHeight: 17,
  },
  title: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 16,
    lineHeight: 20,
  },
  meta: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.body,
    fontSize: 13,
    lineHeight: 18,
  },
  pathText: {
    color: appTheme.colors.textSubtle,
    fontFamily: appTheme.fonts.body,
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
  reviewCard: {
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    padding: appTheme.spacing.sm,
    gap: 2,
  },
  reviewSignatureCard: {
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surface,
    minHeight: 100,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    marginTop: appTheme.spacing.xs,
    padding: appTheme.spacing.xs,
  },
  reviewTitle: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 18,
  },
  reviewButton: {
    marginTop: appTheme.spacing.xs,
    borderWidth: 1,
    borderColor: appTheme.colors.primary,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignSelf: "flex-start",
  },
  reviewButtonText: {
    color: appTheme.colors.primary,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 16,
  },
  editButton: {
    marginTop: appTheme.spacing.xs,
    borderWidth: 1,
    borderColor: appTheme.colors.primary,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignSelf: "flex-start",
  },
  editButtonText: {
    color: appTheme.colors.primary,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 16,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 28, 0.45)",
    justifyContent: "center",
    paddingHorizontal: appTheme.spacing.md,
  },
  modalCard: {
    backgroundColor: appTheme.colors.background,
    borderRadius: appTheme.radius.lg,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    padding: appTheme.spacing.md,
    gap: appTheme.spacing.sm,
  },
  notesInput: {
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    color: appTheme.colors.text,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: appTheme.spacing.sm,
    minHeight: 120,
    fontSize: 14,
    lineHeight: 18,
    fontFamily: appTheme.fonts.body,
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
