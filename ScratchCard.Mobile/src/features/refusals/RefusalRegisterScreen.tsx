import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import SignatureScreen, { SignatureViewRef } from "react-native-signature-canvas";
import { getRefusalDailyLog, getRefusalEntryReviewSignature, getRefusalEntrySignature, recordRefusalEntry } from "../../api/refusalRegisterApi";
import { useAuth } from "../../auth/AuthContext";
import { DateTimeField, formatDateValue, formatTimeValue } from "../../components/DateTimeField";
import { PrimaryButton } from "../../components/PrimaryButton";
import { ScreenContainer } from "../../components/ScreenContainer";
import { MainStackParamList } from "../../types/navigation";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";
import { buildDefaultStaffDisplayName, buildStaffInitialsForPayload, getStaffDisplayName } from "./refusalStaffUtils";

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

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getReviewedDateKey(value?: string) {
  if (!value) {
    return "pending";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "pending";
  }

  const yyyy = String(parsed.getFullYear());
  const mm = String(parsed.getMonth() + 1).padStart(2, "0");
  const dd = String(parsed.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatReviewedOn(value?: string) {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return `${parsed.toLocaleDateString()} ${parsed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

function buildRefusalReportHtml(input: {
  shopName: string;
  date: string;
  entries: Array<{
    sequenceNo: number;
    refusalDate: string;
    product: string;
    refusalTime: string;
    personDescription: string;
    observations?: string;
    staffMemberInitials: string;
    staffSignatureDataUrl?: string;
    reviewedOn?: string;
    reviewedByName?: string;
    reviewNotes?: string;
    managerSignatureDataUrl?: string;
  }>;
}) {
  const grouped = new Map<string, typeof input.entries>();
  input.entries.forEach((entry) => {
    const key = getReviewedDateKey(entry.reviewedOn);
    const items = grouped.get(key) ?? [];
    items.push(entry);
    grouped.set(key, items);
  });

  const sortedKeys = [...grouped.keys()].sort((left, right) => {
    if (left === "pending") return 1;
    if (right === "pending") return -1;
    return right.localeCompare(left);
  });

  const groupsHtml = sortedKeys
    .map((key) => {
      const groupEntries = grouped.get(key) ?? [];
      const title = key === "pending" ? "Pending Manager Review" : `Reviewed Date: ${key}`;
      const rows = groupEntries
        .map((entry) => {
          const staffSignatureCell = entry.staffSignatureDataUrl
            ? `<img alt="staff signature" class="sig" src="${entry.staffSignatureDataUrl}" />`
            : `<span class="sig-missing">No signature</span>`;
          const managerSignatureCell = entry.managerSignatureDataUrl
            ? `<img alt="manager signature" class="sig" src="${entry.managerSignatureDataUrl}" />`
            : `<span class="sig-missing">${entry.reviewedOn ? "No manager signature" : "-"}</span>`;
          return `
            <tr>
              <td>${entry.sequenceNo}</td>
              <td>${escapeHtml(entry.refusalDate)}</td>
              <td>${escapeHtml(entry.product)}</td>
              <td>${escapeHtml(entry.refusalTime || "--:--")}</td>
              <td>${escapeHtml(entry.personDescription)}</td>
              <td>${escapeHtml(entry.observations ?? "")}</td>
              <td>${escapeHtml(entry.staffMemberInitials)}</td>
              <td>${staffSignatureCell}</td>
              <td>${escapeHtml(entry.reviewedByName ?? "-")}</td>
              <td>${escapeHtml(formatReviewedOn(entry.reviewedOn))}</td>
              <td>${escapeHtml(entry.reviewNotes ?? "-")}</td>
              <td>${managerSignatureCell}</td>
            </tr>
          `;
        })
        .join("");

      return `
        <div class="group-title">${escapeHtml(title)}</div>
        <table>
          <thead>
            <tr>
              <th class="col-no">No.</th>
              <th class="col-date">Date</th>
              <th class="col-product">Product</th>
              <th class="col-time">Time</th>
              <th class="col-person">Name of person or description</th>
              <th class="col-obs">Observations</th>
              <th class="col-staff">Staff</th>
              <th class="col-sign">Staff Sign</th>
              <th class="col-manager">Manager</th>
              <th class="col-reviewed-on">Reviewed On</th>
              <th class="col-review-note">Review Notes</th>
              <th class="col-sign">Manager Sign</th>
            </tr>
          </thead>
          <tbody>
            ${rows || `<tr><td colspan="12">No entries in this group.</td></tr>`}
          </tbody>
        </table>
      `;
    })
    .join("");

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          @page {
            size: landscape;
            margin: 10mm;
          }
          body {
            font-family: Arial, Helvetica, sans-serif;
            color: #0f1720;
            margin: 20px;
            font-size: 12px;
          }
          .title {
            font-size: 20px;
            font-weight: 700;
            margin-bottom: 4px;
          }
          .subtitle {
            font-size: 12px;
            color: #425463;
            margin-bottom: 14px;
          }
          .group-title {
            margin-top: 14px;
            margin-bottom: 6px;
            font-size: 12px;
            font-weight: 700;
            color: #223542;
          }
          table {
            border-collapse: collapse;
            width: 100%;
            table-layout: fixed;
            margin-bottom: 10px;
          }
          th, td {
            border: 1px solid #9aa9b5;
            padding: 5px 4px;
            vertical-align: top;
            word-wrap: break-word;
          }
          th {
            background: #edf2f5;
            text-align: left;
            font-size: 10px;
          }
          td {
            min-height: 20px;
            font-size: 9px;
          }
          .col-no { width: 4%; }
          .col-date { width: 7%; }
          .col-product { width: 11%; }
          .col-time { width: 6%; }
          .col-person { width: 15%; }
          .col-obs { width: 14%; }
          .col-staff { width: 6%; }
          .col-sign { width: 8%; }
          .col-manager { width: 8%; }
          .col-reviewed-on { width: 9%; }
          .col-review-note { width: 12%; }
          .sig {
            max-width: 100%;
            max-height: 40px;
            display: block;
            margin: 0 auto;
          }
          .sig-missing {
            color: #6c7a85;
            font-size: 8px;
          }
          .foot {
            margin-top: 14px;
            color: #425463;
            font-size: 11px;
          }
        </style>
      </head>
      <body>
        <div class="title">Refusals Register</div>
        <div class="subtitle">Shop: ${escapeHtml(input.shopName)} | Selected Date: ${escapeHtml(input.date)}</div>
        ${groupsHtml || "<div>No entries found for this date.</div>"}
        <div class="foot">Generated from digital No ID / No Sale register.</div>
      </body>
    </html>
  `;
}

export function RefusalRegisterScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const queryClient = useQueryClient();
  const signatureRef = useRef<SignatureViewRef>(null);
  const { activeShopId, activeShop, profile } = useAuth();
  const shopId = activeShopId;
  const [selectedDate, setSelectedDate] = useState(formatDateValue(new Date()));
  const [refusalTime, setRefusalTime] = useState(formatTimeValue(new Date()));
  const [product, setProduct] = useState("");
  const [personDescription, setPersonDescription] = useState("");
  const [observations, setObservations] = useState("");
  const [staffMemberInitials, setStaffMemberInitials] = useState("");
  const [signatureDataUrl, setSignatureDataUrl] = useState("");
  const [isSignatureModalVisible, setIsSignatureModalVisible] = useState(false);

  const defaultInitials = useMemo(
    () => buildDefaultStaffDisplayName(profile?.firstName, profile?.lastName, profile?.email, profile?.displayName),
    [profile?.displayName, profile?.email, profile?.firstName, profile?.lastName]
  );

  useEffect(() => {
    if (!staffMemberInitials.trim() && defaultInitials) {
      setStaffMemberInitials(defaultInitials);
    }
  }, [defaultInitials, staffMemberInitials]);

  useEffect(() => {
    setSignatureDataUrl("");
  }, [selectedDate]);

  const dailyLogQuery = useQuery({
    queryKey: ["refusal-daily-log", shopId, selectedDate],
    queryFn: () => getRefusalDailyLog(shopId as string, selectedDate),
    enabled: Boolean(shopId) && selectedDate.length === 10,
  });

  const entries = dailyLogQuery.data?.entries ?? [];

  const recordMutation = useMutation({
    mutationFn: async () => {
      if (!shopId) throw new Error("No shop selected.");
      if (!product.trim()) throw new Error("Product is required.");
      if (!personDescription.trim()) throw new Error("Person description is required.");
      if (!signatureDataUrl.trim()) throw new Error("Signature is required.");

        return recordRefusalEntry({
          shopId,
          refusalDate: selectedDate,
          refusalTime,
          product: product.trim(),
          personDescription: personDescription.trim(),
          observations: observations.trim() || undefined,
          staffMemberInitials: buildStaffInitialsForPayload(staffMemberInitials, profile?.email),
          signatureDataUrl,
        });
      },
    onSuccess: async () => {
      setProduct("");
      setPersonDescription("");
      setObservations("");
      setRefusalTime(formatTimeValue(new Date()));
      setSignatureDataUrl("");
      Alert.alert("Saved", "Refusal entry recorded.");
      await queryClient.invalidateQueries({ queryKey: ["refusal-daily-log", shopId, selectedDate] });
    },
    onError: (error: any) => {
      Alert.alert("Failed", error?.response?.data?.message ?? error?.message ?? "Unable to save refusal entry.");
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

  const buildReportHtml = async () => {
    const reportEntries = await Promise.all(
      entries.map(async (entry) => {
        const [staffSignatureDataUrl, managerSignatureDataUrl] = await Promise.all([
          entry.signatureImagePath
            ? getRefusalEntrySignature(entry.id).catch(() => undefined)
            : Promise.resolve(undefined),
          entry.reviewSignatureImagePath
            ? getRefusalEntryReviewSignature(entry.id).catch(() => undefined)
            : Promise.resolve(undefined),
        ]);

        return {
          sequenceNo: entry.sequenceNo,
          refusalDate: entry.refusalDate,
          product: entry.product,
          refusalTime: entry.refusalTime,
          personDescription: entry.personDescription,
          observations: entry.observations,
          staffMemberInitials: getStaffDisplayName(entry),
          staffSignatureDataUrl,
          reviewedOn: entry.reviewedOn,
          reviewedByName: entry.reviewedByName,
          reviewNotes: entry.reviewNotes,
          managerSignatureDataUrl,
        };
      })
    );

    return buildRefusalReportHtml({
      shopName: activeShop?.shopName ?? "-",
      date: selectedDate,
      entries: reportEntries,
    });
  };

  const printRefusalReport = async () => {
    try {
      const html = await buildReportHtml();

      await Print.printAsync({
        html,
        width: 792,
        height: 612,
        orientation: Print.Orientation.landscape,
      });
    } catch (error: any) {
      Alert.alert("Failed", error?.message ?? "Unable to open print dialog.");
    }
  };

  const shareRefusalReport = async () => {
    try {
      const html = await buildReportHtml();

      const { uri } = await Print.printToFileAsync({
        html,
        width: 792,
        height: 612,
      });
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert("Share unavailable", "Sharing is not available on this device.");
        return;
      }

      await Sharing.shareAsync(uri, {
        mimeType: "application/pdf",
        dialogTitle: `Refusals Register ${selectedDate}`,
        UTI: "com.adobe.pdf",
      });
    } catch (error: any) {
      Alert.alert("Failed", error?.message ?? "Unable to generate or share PDF.");
    }
  };

  return (
    <ScreenContainer>
      {/* <View style={styles.hero}>
        <Text style={styles.heroTitle}>No ID / No Sale Register</Text>
        <Text style={styles.heroSubtitle}>Shop: {activeShop?.shopName ?? "-"}</Text>
        <Text style={styles.heroNote}>Each refusal entry must include staff signature.</Text>
      </View> */}

      <View style={ui.card}>
        <Text style={styles.sectionTitle}>Refusal</Text>
        <View style={styles.row}>
          <DateTimeField style={{ flex: 1 }} mode="date" value={selectedDate} onChange={setSelectedDate} />
          <DateTimeField style={{ flex: 1 }} mode="time" value={refusalTime} onChange={setRefusalTime} />
        </View>

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
          placeholder="Example: Male, around 14 years old, blonde, blue jacket"
          placeholderTextColor={appTheme.colors.textSubtle}
          multiline
          textAlignVertical="top"
        />

        <Text style={styles.fieldLabel}>Observations</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={observations}
          onChangeText={setObservations}
          placeholder="Example: Nervous and refused to show ID"
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

        <Text style={styles.fieldLabel}>Staff Signature</Text>
        <View style={styles.signaturePreviewCard}>
          {signatureDataUrl ? (
            <Image source={{ uri: signatureDataUrl }} style={styles.signaturePreviewImage} resizeMode="contain" />
          ) : (
            <Text style={styles.signaturePlaceholder}>No signature captured yet.</Text>
          )}
        </View>
        <View style={styles.signatureActionRow}>
          <Pressable style={styles.secondaryButton} onPress={openSignatureModal}>
            <Text style={styles.secondaryButtonText}>{signatureDataUrl ? "Re-Capture Signature" : "Capture Signature"}</Text>
          </Pressable>
          {signatureDataUrl ? (
            <Pressable style={styles.secondaryButton} onPress={() => setSignatureDataUrl("")}>
              <Text style={styles.secondaryButtonText}>Clear</Text>
            </Pressable>
          ) : null}
        </View>

        <PrimaryButton
          label={recordMutation.isPending ? "Saving..." : "Save Refusal Entry"}
          onPress={() => recordMutation.mutate()}
          disabled={recordMutation.isPending || !shopId || !signatureDataUrl.trim()}
        />

        {/* <Pressable
          accessibilityRole="button"
          style={styles.secondaryButton}
          onPress={() => navigation.navigate("RefusalRegisterByDay")}
        >
          <Text style={styles.secondaryButtonText}>View Logs by Day</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          style={styles.secondaryButton}
          onPress={() => navigation.navigate("RefusalManagerReview")}
        >
          <Text style={styles.secondaryButtonText}>Manager Review List</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          style={styles.secondaryButton}
          onPress={() => navigation.navigate("RefusalReport")}
        >
          <Text style={styles.secondaryButtonText}>Refusal Report (Date Range)</Text>
        </Pressable> */}
      </View>

      <View style={ui.card}>
        <Text style={styles.sectionTitle}>Entries ({selectedDate})</Text>
        {dailyLogQuery.isLoading ? <Text style={styles.meta}>Loading entries...</Text> : null}
        {entries.length === 0 && !dailyLogQuery.isLoading ? <Text style={styles.meta}>No entries for this date.</Text> : null}
        {entries.map((entry) => (
          <View key={entry.id} style={styles.entryItem}>
            <View style={styles.entryTopRow}>
              <Text style={styles.entryNo}>No. {entry.sequenceNo}</Text>
              <Text style={styles.entryTime}>{entry.refusalTime || "--:--"}</Text>
            </View>
            <Text style={styles.entryProduct}>{entry.product}</Text>
            <Text style={styles.meta}>Person: {entry.personDescription}</Text>
            {entry.observations ? <Text style={styles.meta}>Obs: {entry.observations}</Text> : null}
            <Text style={styles.meta}>Staff: {getStaffDisplayName(entry)}</Text>
            <Text style={styles.meta}>Signature: {entry.signatureImagePath ? "Saved" : "Missing"}</Text>
            <Text style={styles.meta}>Manager Review: {entry.reviewedOn ? `Reviewed by ${entry.reviewedByName ?? "-"}` : "Pending"}</Text>
            <View style={styles.entryActions}>
              <Pressable
                style={styles.rowActionButton}
                onPress={() => navigation.navigate("RefusalEntryDetails", { entryId: entry.id })}
              >
                <Text style={styles.rowActionButtonText}>View Details</Text>
              </Pressable>
              <Pressable
                style={styles.rowActionButton}
                onPress={() => navigation.navigate("RefusalEntryEdit", { entryId: entry.id })}
              >
                <Text style={styles.rowActionButtonText}>Edit</Text>
              </Pressable>
            </View>
          </View>
        ))}
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
  heroSubtitle: {
    color: appTheme.colors.onPrimary,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 18,
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
    marginTop: 2,
  },
  row: {
    flexDirection: "row",
    gap: appTheme.spacing.xs,
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
  },
  signatureActionRow: {
    flexDirection: "row",
    gap: appTheme.spacing.xs,
  },
  reportActionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: appTheme.spacing.xs,
  },
  meta: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.body,
    fontSize: 13,
    lineHeight: 18,
  },
  entryItem: {
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    padding: appTheme.spacing.sm,
    gap: 3,
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
  entryTime: {
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
  entryActions: {
    marginTop: appTheme.spacing.xs,
    flexDirection: "row",
    gap: appTheme.spacing.xs,
  },
  rowActionButton: {
    borderWidth: 1,
    borderColor: appTheme.colors.borderStrong,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  rowActionButtonText: {
    color: appTheme.colors.text,
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
