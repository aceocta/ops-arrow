import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { LandscapeSignatureModal } from "../../components/LandscapeSignatureModal";
import { getRefusalDailyLog, getRefusalEntryReviewSignature, getRefusalEntrySignature, recordRefusalEntry } from "../../api/refusalRegisterApi";
import { useAuth } from "../../auth/AuthContext";
import { DateTimeField, formatDateValue, formatTimeValue, parseDateTimeValue } from "../../components/DateTimeField";
import { EmptyState } from "../../components/EmptyState";
import { PrimaryButton } from "../../components/PrimaryButton";
import { FloatingLabelInput } from "../../components/FloatingLabelInput";
import { ScreenContainer } from "../../components/ScreenContainer";
import { toastError, toastSuccess } from "../../components/toast";
import { SkeletonList } from "../../components/Skeleton";
import { StatusBadge } from "../../components/StatusBadge";
import { MainStackParamList } from "../../types/navigation";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";
import { getApiErrorMessage } from "../../utils/apiErrorMessage";
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

function shiftDateByDays(dateValue: string, days: number) {
  const parts = dateValue.split("-").map((part) => Number(part));
  if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) {
    return dateValue;
  }

  const [year, month, day] = parts;
  const shifted = new Date(year, month - 1, day);
  shifted.setDate(shifted.getDate() + days);
  return formatDateValue(shifted);
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
              <th class="col-person">Description</th>
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
        <div class="foot">Generated from digital Refusal Log register.</div>
      </body>
    </html>
  `;
}

export function RefusalRegisterScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const queryClient = useQueryClient();
  const { activeShopId, activeShop, profile } = useAuth();
  const shopId = activeShopId;
  const [selectedDate, setSelectedDate] = useState(formatDateValue(new Date()));
  const [refusalTime, setRefusalTime] = useState(formatTimeValue(new Date()));
  const [product, setProduct] = useState("");
  const [personDescription, setPersonDescription] = useState("");
  const [observations, setObservations] = useState("");
  const [staffMemberInitials, setStaffMemberInitials] = useState("");
  const personDescriptionRef = useRef<TextInput>(null);
  const staffRef = useRef<TextInput>(null);
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
  const reviewedCount = entries.filter((entry) => Boolean(entry.reviewedOn)).length;
  const pendingCount = entries.length - reviewedCount;

  const recordMutation = useMutation({
    mutationFn: async () => {
      if (!shopId) throw new Error("No shop selected.");
      if (!product.trim()) throw new Error("Product is required.");
      if (!personDescription.trim()) throw new Error("Description is required.");
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
      toastSuccess("Refusal entry recorded.");
      await queryClient.invalidateQueries({ queryKey: ["refusal-daily-log", shopId, selectedDate] });
    },
    onError: (error: any) => {
      toastError(getApiErrorMessage(error, "Unable to save refusal entry."));
    },
  });

  const openSignatureModal = () => {
    setIsSignatureModalVisible(true);
  };

  const closeSignatureModal = () => {
    setIsSignatureModalVisible(false);
  };
  const moveSelectedDate = (days: number) => {
    setSelectedDate((current) => shiftDateByDays(current, days));
  };
  const refusalDateTimeValue = `${selectedDate} ${refusalTime}`;

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
      toastError(error?.message ?? "Unable to open print dialog.");
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
      toastError(error?.message ?? "Unable to generate or share PDF.");
    }
  };

  return (
    <ScreenContainer>
      {/* <View style={styles.screenHeaderCard}>
        <View style={styles.screenHeaderTopRow}>
          <View style={styles.screenHeaderTitleWrap}>
            <Text style={styles.screenHeaderTitle}>Refusal Register</Text>
            <Text style={styles.screenHeaderMeta}>Shop: {activeShop?.shopName ?? "-"}</Text>
          </View>
          <StatusBadge label={pendingCount > 0 ? "Pending Reviews" : "Up To Date"} tone={pendingCount > 0 ? "warning" : "success"} />
        </View>
        <View style={styles.headerMetricRow}>
          <View style={styles.headerMetricCard}>
            <Text style={styles.headerMetricValue}>{entries.length}</Text>
            <Text style={styles.headerMetricLabel}>Total Entries</Text>
          </View>
          <View style={styles.headerMetricCard}>
            <Text style={styles.headerMetricValue}>{reviewedCount}</Text>
            <Text style={styles.headerMetricLabel}>Reviewed</Text>
          </View>
          <View style={styles.headerMetricCard}>
            <Text style={styles.headerMetricValue}>{pendingCount}</Text>
            <Text style={styles.headerMetricLabel}>Pending</Text>
          </View>
        </View>
      </View> */}

      <View style={ui.card}>
        {/* <Text style={styles.sectionTitle}>Refusal</Text> */}
        {/* <Text style={styles.sectionSubtitle}>Record refusal details and capture a staff signature.</Text> */}
        <View style={styles.dateNavRow}>
          <Pressable
            style={styles.dateNavButton}
            onPress={() => moveSelectedDate(-1)}
            accessibilityRole="button"
            accessibilityLabel="Previous day"
          >
            <Ionicons name="chevron-back" size={18} color={appTheme.colors.text} />
          </Pressable>
          <DateTimeField
            style={{ flex: 1 }}
            mode="datetime"
            value={refusalDateTimeValue}
            onChange={(value) => {
              const parsed = parseDateTimeValue(value);
              if (!parsed) {
                return;
              }

              setSelectedDate(formatDateValue(parsed));
              setRefusalTime(formatTimeValue(parsed));
            }}
          />
          <Pressable
            style={styles.dateNavButton}
            onPress={() => moveSelectedDate(1)}
            accessibilityRole="button"
            accessibilityLabel="Next day"
          >
            <Ionicons name="chevron-forward" size={18} color={appTheme.colors.text} />
          </Pressable>
        </View>

        <FloatingLabelInput
          label="Refused product"
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

        <Text style={styles.fieldLabel}>Description</Text>
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

        <FloatingLabelInput
          ref={staffRef}
          label="Staff member full name"
          value={staffMemberInitials}
          onChangeText={setStaffMemberInitials}
          autoCapitalize="words"
          returnKeyType="done"
        />

        <Text style={styles.fieldLabel}>Staff Signature</Text>
        <Pressable
          style={styles.signaturePreviewCard}
          onPress={openSignatureModal}
          accessibilityRole="button"
          accessibilityLabel={signatureDataUrl ? "Tap to re-sign" : "Tap to sign"}
        >
          {signatureDataUrl ? (
            <>
              <Image source={{ uri: signatureDataUrl }} style={styles.signaturePreviewImage} resizeMode="contain" />
              <Text style={styles.signatureTapHint}>Tap to re-sign</Text>
            </>
          ) : (
            <Text style={styles.signaturePlaceholder}>✍  Tap here to sign</Text>
          )}
        </Pressable>

        <PrimaryButton
          label={recordMutation.isPending ? "Saving…" : "Save refusal entry"}
          onPress={() => recordMutation.mutate()}
          disabled={recordMutation.isPending || !shopId || !signatureDataUrl.trim()}
        />

      
      </View>

      <View style={ui.card}>
        <Text style={styles.sectionTitle}>Entries ({selectedDate})</Text>
        <Text style={styles.sectionSubtitle}>Latest refusal records for this date.</Text>
        {dailyLogQuery.isLoading ? <SkeletonList count={3} rowHeight={84} /> : null}
        {entries.length === 0 && !dailyLogQuery.isLoading ? (
          <EmptyState
            icon="hand-left-outline"
            title="No entries yet"
            message="No entries for this date."
          />
        ) : null}
        {entries.map((entry) => (
          <View key={entry.id} style={styles.entryItem}>
            <View style={styles.entryHeaderTop}>
              <View style={styles.entryTopRow}>
                <Text style={styles.entryNo}>No. {entry.sequenceNo}</Text>
                <Text style={styles.entryTime}>{entry.refusalTime || "--:--"}</Text>
              </View>
              <View style={styles.entryBadgeRow}>
                <StatusBadge label={entry.signatureImagePath ? "Signed" : "No Signature"} tone={entry.signatureImagePath ? "success" : "danger"} />
                <StatusBadge
                  label={entry.reviewedOn ? "Reviewed" : "Pending Review"}
                  tone={entry.reviewedOn ? "success" : "warning"}
                />
              </View>
            </View>
            <Text style={styles.entryProduct}>{entry.product}</Text>
            <Text style={styles.meta}>Person: {entry.personDescription}</Text>
            {entry.observations ? <Text style={styles.meta}>Obs: {entry.observations}</Text> : null}
            <Text style={styles.meta}>Staff: {getStaffDisplayName(entry)}</Text>
            <Text style={styles.meta}>Manager Review: {entry.reviewedOn ? `Reviewed by ${entry.reviewedByName ?? "-"}` : "Pending"}</Text>
            <View style={styles.entryActions}>
              <Pressable
                style={styles.rowActionButton}
                onPress={() => navigation.navigate("RefusalEntryDetails", { entryId: entry.id })}
              >
                <Text style={styles.rowActionButtonText}>View details</Text>
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
    borderWidth: 0,
    borderColor: "transparent",
    borderRadius: appTheme.radius.md,
    backgroundColor: appTheme.colors.surfaceNeutralSoft,
    paddingHorizontal: appTheme.spacing.md,
    paddingVertical: appTheme.spacing.md,
    gap: appTheme.spacing.sm,
  },
  screenHeaderTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: appTheme.spacing.sm,
  },
  screenHeaderTitleWrap: {
    flex: 1,
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
  headerMetricRow: {
    flexDirection: "row",
    gap: appTheme.spacing.xs,
  },
  headerMetricCard: {
    flex: 1,
    borderWidth: 0,
    borderColor: "transparent",
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surface,
    paddingVertical: appTheme.spacing.xs,
    alignItems: "center",
    gap: 2,
  },
  headerMetricValue: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.heading,
    fontSize: 18,
    lineHeight: 21,
  },
  headerMetricLabel: {
    color: appTheme.colors.textSubtle,
    fontFamily: appTheme.fonts.body,
    fontSize: 11,
    lineHeight: 14,
  },
  sectionTitle: {
    color: appTheme.colors.text,
    fontSize: 17,
    lineHeight: 22,
    fontFamily: appTheme.fonts.bodyMedium,
  },
  sectionSubtitle: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.body,
    fontSize: 12,
    lineHeight: 16,
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
  dateNavRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: appTheme.spacing.xs,
  },
  dateNavButton: {
    width: 32,
    height: 32,
    borderRadius: appTheme.radius.sm,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    backgroundColor: appTheme.colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  dateNavButtonText: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 16,
    lineHeight: 18,
  },
  input: {
    borderWidth: 0,
    borderColor: "transparent",
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
    borderWidth: 0,
    borderColor: "transparent",
    borderRadius: appTheme.radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: appTheme.colors.surfaceMuted,
  },
  chipSelected: {
    borderColor: "transparent",
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
    borderWidth: 0,
    borderColor: "transparent",
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
    borderWidth: 0,
    borderColor: "transparent",
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
  signatureTapHint: {
    color: appTheme.colors.primary,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 11,
    lineHeight: 14,
    marginTop: 2,
  },
  reportActionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: appTheme.spacing.xs,
  },
  utilityActionGrid: {
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
    borderWidth: 0,
    borderColor: "transparent",
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted,
    padding: appTheme.spacing.sm,
    gap: 3,
  },
  entryHeaderTop: {
    gap: appTheme.spacing.xs,
  },
  entryTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: appTheme.spacing.xs,
  },
  entryBadgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
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
    borderWidth: 0,
    borderColor: "transparent",
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
    backgroundColor: appTheme.colors.overlay,
    justifyContent: "center",
    paddingHorizontal: appTheme.spacing.md,
  },
  signatureModalCard: {
    backgroundColor: appTheme.colors.background,
    borderRadius: appTheme.radius.lg,
    borderWidth: 0,
    borderColor: "transparent",
    padding: appTheme.spacing.md,
    gap: appTheme.spacing.sm,
  },
  signaturePadWrap: {
    height: 240,
    borderWidth: 0,
    borderColor: "transparent",
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
    borderWidth: 0,
    paddingVertical: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  modalActionPrimary: {
    backgroundColor: appTheme.colors.primary,
    borderColor: "transparent",
  },
  modalActionSecondary: {
    backgroundColor: appTheme.colors.surfaceMuted,
    borderColor: "transparent",
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


