import React, { useMemo, useRef, useState } from "react";
import { Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import SignatureScreen, { SignatureViewRef } from "react-native-signature-canvas";
import { listRefusalEntriesByRange, reviewRefusalEntries } from "../../api/refusalRegisterApi";
import { useAuth } from "../../auth/AuthContext";
import { DateTimeField, formatDateValue, parseDateValue } from "../../components/DateTimeField";
import { PrimaryButton } from "../../components/PrimaryButton";
import { ScreenContainer } from "../../components/ScreenContainer";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";
import { getStaffDisplayName } from "./refusalStaffUtils";

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

function buildDefaultRange() {
  const toDate = new Date();
  const fromDate = new Date(toDate);
  fromDate.setDate(fromDate.getDate() - 6);
  return {
    from: formatDateValue(fromDate),
    to: formatDateValue(toDate),
  };
}

export function RefusalManagerReviewScreen() {
  const queryClient = useQueryClient();
  const signatureRef = useRef<SignatureViewRef>(null);
  const { activeShopId, profile } = useAuth();
  const canReview = profile?.roles?.some((role) => role === "ShopOwner" || role === "Manager") ?? false;
  const defaultRange = useMemo(() => buildDefaultRange(), []);
  const [fromDate, setFromDate] = useState(defaultRange.from);
  const [toDate, setToDate] = useState(defaultRange.to);
  const [selectedEntryIds, setSelectedEntryIds] = useState<string[]>([]);
  const [isReviewModalVisible, setIsReviewModalVisible] = useState(false);
  const [isSignatureModalVisible, setIsSignatureModalVisible] = useState(false);
  const [reviewNotes, setReviewNotes] = useState("");
  const [reviewSignatureDataUrl, setReviewSignatureDataUrl] = useState("");

  const entriesQuery = useQuery({
    queryKey: ["refusal-review-range", activeShopId, fromDate, toDate],
    queryFn: () => listRefusalEntriesByRange(activeShopId as string, fromDate, toDate),
    enabled: Boolean(activeShopId) && fromDate.length === 10 && toDate.length === 10,
  });

  const entries = entriesQuery.data ?? [];
  const pendingEntries = useMemo(() => entries.filter((entry) => !entry.reviewedOn), [entries]);
  const hasDateRangeError = useMemo(() => {
    const from = parseDateValue(fromDate);
    const to = parseDateValue(toDate);
    if (!from || !to) {
      return false;
    }
    return from > to;
  }, [fromDate, toDate]);

  const reviewMutation = useMutation({
    mutationFn: async () => {
      if (!activeShopId) {
        throw new Error("No shop selected.");
      }
      if (!canReview) {
        throw new Error("Only manager or shop owner can review.");
      }
      if (selectedEntryIds.length === 0) {
        throw new Error("Select at least one refusal entry.");
      }
      if (!reviewSignatureDataUrl.trim()) {
        throw new Error("Manager signature is required.");
      }

      return reviewRefusalEntries({
        shopId: activeShopId,
        entryIds: selectedEntryIds,
        notes: reviewNotes.trim() || undefined,
        signatureDataUrl: reviewSignatureDataUrl,
      });
    },
    onSuccess: async () => {
      setIsReviewModalVisible(false);
      setIsSignatureModalVisible(false);
      setReviewNotes("");
      setReviewSignatureDataUrl("");
      setSelectedEntryIds([]);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["refusal-review-range", activeShopId, fromDate, toDate] }),
        queryClient.invalidateQueries({ queryKey: ["refusal-entry"] }),
        queryClient.invalidateQueries({ queryKey: ["refusal-daily-log"] }),
        queryClient.invalidateQueries({ queryKey: ["refusal-daily-log-view"] }),
      ]);
      Alert.alert("Saved", "Selected entries reviewed with manager signature.");
    },
    onError: (error: any) => {
      Alert.alert("Failed", error?.response?.data?.message ?? error?.message ?? "Unable to review selected entries.");
    },
  });

  function toggleEntrySelection(entryId: string) {
    setSelectedEntryIds((previous) =>
      previous.includes(entryId) ? previous.filter((id) => id !== entryId) : [...previous, entryId]
    );
  }

  function selectAllPending() {
    setSelectedEntryIds(pendingEntries.map((entry) => entry.id));
  }

  function clearSelection() {
    setSelectedEntryIds([]);
  }

  function openReviewModal() {
    if (selectedEntryIds.length === 0) {
      Alert.alert("Select entries", "Choose at least one entry to review.");
      return;
    }

    setReviewNotes("");
    setReviewSignatureDataUrl("");
    setIsReviewModalVisible(true);
  }

  function saveSignatureFromPad() {
    signatureRef.current?.readSignature();
  }

  return (
    <ScreenContainer>
      {/* <View style={styles.hero}>
        <Text style={styles.heroTitle}>Refusal Manager Review</Text>
        <Text style={styles.heroNote}>Filter by date range, select entries, then apply one manager signature review.</Text>
      </View> */}

      <View style={ui.card}>
        <Text style={styles.sectionTitle}>Date Range</Text>
        <View style={styles.row}>
          <DateTimeField style={{ flex: 1 }} mode="date" value={fromDate} onChange={setFromDate} placeholder="From date" />
          <DateTimeField style={{ flex: 1 }} mode="date" value={toDate} onChange={setToDate} placeholder="To date" />
        </View>
        {hasDateRangeError ? <Text style={styles.errorText}>From date cannot be after to date.</Text> : null}
        <Text style={styles.meta}>
          {entries.length} total | {pendingEntries.length} pending review | {selectedEntryIds.length} selected
        </Text>
        <View style={styles.actionRow}>
          <Pressable style={styles.secondaryButton} onPress={selectAllPending} disabled={pendingEntries.length === 0}>
            <Text style={styles.secondaryButtonText}>Select Pending</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={clearSelection} disabled={selectedEntryIds.length === 0}>
            <Text style={styles.secondaryButtonText}>Clear Selection</Text>
          </Pressable>
        </View>
        <PrimaryButton
          label={reviewMutation.isPending ? "Saving..." : "Mark Selected Reviewed"}
          onPress={openReviewModal}
          disabled={!canReview || selectedEntryIds.length === 0 || hasDateRangeError}
        />
        {!canReview ? <Text style={styles.errorText}>Only manager or shop owner can apply review.</Text> : null}
      </View>

      <View style={ui.card}>
        <Text style={styles.sectionTitle}>Entries</Text>
        {entriesQuery.isLoading ? <Text style={styles.meta}>Loading entries...</Text> : null}
        {!entriesQuery.isLoading && entries.length === 0 ? <Text style={styles.meta}>No entries in selected range.</Text> : null}
        <ScrollView style={styles.listScroll} contentContainerStyle={styles.listContent}>
          {entries.map((entry) => {
            const isSelected = selectedEntryIds.includes(entry.id);
            return (
              <Pressable
                key={entry.id}
                style={[styles.entryCard, isSelected ? styles.entryCardSelected : null]}
                onPress={() => toggleEntrySelection(entry.id)}
                disabled={!canReview}
              >
                <View style={styles.entryTopRow}>
                  <Text style={styles.entryNo}>[{isSelected ? "x" : " "}] No. {entry.sequenceNo}</Text>
                  <Text style={styles.entryDate}>{entry.refusalDate} {entry.refusalTime || "--:--"}</Text>
                </View>
                <Text style={styles.entryProduct}>{entry.product}</Text>
                <Text style={styles.meta}>Person: {entry.personDescription}</Text>
                <Text style={styles.meta}>Staff: {getStaffDisplayName(entry)}</Text>
                <Text style={styles.meta}>
                  Review: {entry.reviewedOn ? `Reviewed by ${entry.reviewedByName ?? "-"} on ${formatDateTimeValue(entry.reviewedOn)}` : "Pending"}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <Modal
        visible={isReviewModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsReviewModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.sectionTitle}>Apply Manager Review</Text>
            <Text style={styles.meta}>Selected entries: {selectedEntryIds.length}</Text>
            <Text style={styles.fieldLabel}>Review Notes (optional)</Text>
            <TextInput
              style={styles.notesInput}
              value={reviewNotes}
              onChangeText={setReviewNotes}
              placeholder="Manager review notes"
              placeholderTextColor={appTheme.colors.textSubtle}
              multiline
              textAlignVertical="top"
            />
            <Text style={styles.fieldLabel}>Manager Signature</Text>
            <View style={styles.signaturePreviewCard}>
              {reviewSignatureDataUrl ? (
                <Image source={{ uri: reviewSignatureDataUrl }} style={styles.signaturePreviewImage} resizeMode="contain" />
              ) : (
                <Text style={styles.meta}>No signature captured yet.</Text>
              )}
            </View>
            <View style={styles.actionRow}>
              <Pressable style={styles.secondaryButton} onPress={() => setIsSignatureModalVisible(true)}>
                <Text style={styles.secondaryButtonText}>{reviewSignatureDataUrl ? "Re-Capture Signature" : "Capture Signature"}</Text>
              </Pressable>
              {reviewSignatureDataUrl ? (
                <Pressable style={styles.secondaryButton} onPress={() => setReviewSignatureDataUrl("")}>
                  <Text style={styles.secondaryButtonText}>Clear</Text>
                </Pressable>
              ) : null}
            </View>
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

      <Modal
        visible={isSignatureModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsSignatureModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.signatureModalCard}>
            <Text style={styles.sectionTitle}>Capture Signature</Text>
            <Text style={styles.meta}>Sign in the box, then press Save.</Text>
            <View style={styles.signaturePadWrap}>
              <SignatureScreen
                ref={signatureRef}
                onOK={(value) => {
                  setReviewSignatureDataUrl(value);
                  setIsSignatureModalVisible(false);
                }}
                onEmpty={() => Alert.alert("Signature required", "Please sign before saving.")}
                autoClear={false}
                descriptionText="Manager signature"
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
                onPress={() => setIsSignatureModalVisible(false)}
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
  sectionTitle: {
    color: appTheme.colors.text,
    fontSize: 17,
    lineHeight: 22,
    fontFamily: appTheme.fonts.bodyMedium,
  },
  fieldLabel: {
    color: appTheme.colors.text,
    fontSize: 13,
    lineHeight: 16,
    fontFamily: appTheme.fonts.bodyMedium,
  },
  row: {
    flexDirection: "row",
    gap: appTheme.spacing.xs,
  },
  actionRow: {
    flexDirection: "row",
    gap: appTheme.spacing.xs,
    flexWrap: "wrap",
  },
  meta: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.body,
    fontSize: 13,
    lineHeight: 18,
  },
  errorText: {
    color: appTheme.colors.danger,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 16,
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
  listScroll: {
    maxHeight: 420,
  },
  listContent: {
    gap: appTheme.spacing.xs,
    paddingBottom: appTheme.spacing.xs,
  },
  entryCard: {
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    padding: appTheme.spacing.sm,
    gap: 2,
  },
  entryCardSelected: {
    borderColor: appTheme.colors.primary,
    backgroundColor: "#E9F7F6",
  },
  entryTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: appTheme.spacing.xs,
  },
  entryNo: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 13,
    lineHeight: 16,
  },
  entryDate: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.body,
    fontSize: 12,
    lineHeight: 16,
  },
  entryProduct: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 18,
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
    minHeight: 88,
    fontSize: 14,
    lineHeight: 18,
    fontFamily: appTheme.fonts.body,
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
