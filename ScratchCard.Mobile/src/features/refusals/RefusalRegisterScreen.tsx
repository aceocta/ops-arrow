import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { shareFileAndCleanup } from "../../utils/shareFile";
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
import { useFieldValidation } from "../../components/useFieldValidation";
import { FieldError } from "../../components/FieldError";
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

// Common refusal reasons — quick-add into Observations.
const refusalReasons = [
  "No ID",
  "Underage",
  "Failed Challenge 25",
  "Intoxicated",
  "Proxy / agency sale",
  "No reason given",
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

  const handleSubmit = () => {
    if (recordMutation.isPending) return;
    if (!validation.attemptSubmit()) return; // reveals every inline error
    recordMutation.mutate();
  };

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

  // Required-field state drives the "what's needed" footer hint (kept for context) — the Save
  // button is deliberately enabled while incomplete; the inline field errors reveal what's missing.
  const hasProduct = product.trim().length > 0;
  const hasDescription = personDescription.trim().length > 0;
  const hasSignature = signatureDataUrl.trim().length > 0;
  const missing = [
    !hasProduct ? "product" : null,
    !hasDescription ? "description" : null,
    !hasSignature ? "signature" : null,
  ].filter(Boolean) as string[];

  // Client-side rules, recomputed every render so a touched field's error clears the instant its
  // value becomes valid. Time is seeded to now and optional here, so it isn't gated. Signature has
  // no blur event, so its error reveals on submit only.
  const fieldErrors = {
    product: hasProduct ? null : "Enter the refused product.",
    personDescription: hasDescription ? null : "Enter a person description.",
    signature: hasSignature ? null : "Signature required.",
  };
  const validation = useFieldValidation(fieldErrors);

  // Reason quick-picks toggle into Observations (no dedicated field yet), " · "-separated.
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

      // Check share availability first so we never materialise a PDF we can't hand off.
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert("Share unavailable", "Sharing is not available on this device.");
        return;
      }

      const { uri } = await Print.printToFileAsync({
        html,
        width: 792,
        height: 612,
      });

      await shareFileAndCleanup(uri, {
        mimeType: "application/pdf",
        dialogTitle: `Refusals Register ${selectedDate}`,
        UTI: "com.adobe.pdf",
      });
    } catch (error: any) {
      toastError(error?.message ?? "Unable to generate or share PDF.");
    }
  };

  return (
    <ScreenContainer
      footer={
        <View style={styles.footerWrap}>
          {missing.length > 0 ? (
            <View style={styles.footerHintRow}>
              <Ionicons name="information-circle-outline" size={14} color={appTheme.colors.textMuted} />
              <Text style={styles.footerHint}>Add {missing.join(", ")} to save</Text>
            </View>
          ) : null}
          <View style={styles.signFooter}>
            <Pressable
              style={[styles.signFooterBtn, hasSignature ? styles.signFooterBtnDone : null]}
              onPress={openSignatureModal}
              accessibilityRole="button"
              accessibilityLabel={hasSignature ? "Re-sign" : "Sign"}
            >
              <Ionicons
                name={hasSignature ? "checkmark-circle" : "create-outline"}
                size={18}
                color={hasSignature ? appTheme.colors.success : appTheme.colors.primary}
              />
              <Text style={[styles.signFooterBtnText, hasSignature ? styles.signFooterBtnTextDone : null]}>
                {hasSignature ? "Signed" : "Sign"}
              </Text>
            </Pressable>
            <View style={{ flex: 1 }}>
              <PrimaryButton
                label={recordMutation.isPending ? "Saving…" : "Save refusal entry"}
                // Enabled while incomplete: pressing it reveals what's missing via inline errors.
                onPress={handleSubmit}
                disabled={recordMutation.isPending}
              />
            </View>
          </View>
        </View>
      }
    >
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

      {/* Section 1 — what was refused */}
      <View style={ui.card}>
        <View style={styles.sectionHeader}>
          <Ionicons name="hand-left-outline" size={18} color={appTheme.colors.primary} />
          <Text style={styles.sectionTitle}>Refusal details</Text>
        </View>

        <Text style={styles.fieldLabel}>Date &amp; time</Text>
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
          label="Refused product *"
          value={product}
          onChangeText={setProduct}
          onBlur={() => validation.touch("product")}
          error={validation.showError("product")}
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

        <Text style={[styles.fieldLabel, styles.required]}>Person description *</Text>
        <TextInput
          ref={personDescriptionRef}
          style={[styles.input, styles.textArea, validation.showError("personDescription") ? styles.inputError : null]}
          value={personDescription}
          onChangeText={setPersonDescription}
          onBlur={() => validation.touch("personDescription")}
          placeholder="Example: Male, around 14 years old, blonde, blue jacket"
          placeholderTextColor={appTheme.colors.textSubtle}
          multiline
          textAlignVertical="top"
        />
        <FieldError error={validation.showError("personDescription")} />

        <Text style={styles.fieldLabel}>Reason (tap to add)</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {refusalReasons.map((reason) => {
            const active = reasonActive(reason);
            return (
              <Pressable
                key={reason}
                style={[styles.chip, active ? styles.chipSelected : null]}
                onPress={() => toggleReason(reason)}
              >
                <Text style={[styles.chipText, active ? styles.chipTextSelected : null]}>{reason}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

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
      </View>

      {/* Section 2 — who recorded it */}
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

        <Text style={styles.fieldLabel}>Signature *</Text>
        <Pressable
          style={[styles.signaturePreviewCard, !hasSignature ? styles.signatureMissing : null]}
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
        <FieldError error={validation.showError("signature")} />
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
          <Pressable
            key={entry.id}
            style={styles.entryItem}
            onPress={() => navigation.navigate("RefusalEntryDetails", { entryId: entry.id })}
            accessibilityRole="button"
            accessibilityLabel={`View refusal ${entry.sequenceNo}`}
          >
            {/* Title row: product + time, with the sequence number as a leading badge */}
            <View style={styles.entryTopRow}>
              <View style={styles.entrySeq}><Text style={styles.entrySeqText}>{entry.sequenceNo}</Text></View>
              <Text style={styles.entryProduct} numberOfLines={1}>{entry.product}</Text>
              <View style={styles.entryTimePill}>
                <Ionicons name="time-outline" size={12} color={appTheme.colors.textMuted} />
                <Text style={styles.entryTime}>{entry.refusalTime || "--:--"}</Text>
              </View>
            </View>

            {entry.personDescription ? <Text style={styles.entryDesc} numberOfLines={2}>{entry.personDescription}</Text> : null}
            {entry.observations ? <Text style={styles.entryObs} numberOfLines={2}>{entry.observations}</Text> : null}

            <View style={styles.entryBadgeRow}>
              <StatusBadge label={entry.signatureImagePath ? "Signed" : "No signature"} tone={entry.signatureImagePath ? "success" : "danger"} />
              <StatusBadge label={entry.reviewedOn ? "Reviewed" : "Pending review"} tone={entry.reviewedOn ? "success" : "warning"} />
            </View>

            <View style={styles.entryFooterRow}>
              <Text style={styles.entryStaff} numberOfLines={1}>
                {getStaffDisplayName(entry)}{entry.reviewedOn ? ` · reviewed by ${entry.reviewedByName ?? "-"}` : ""}
              </Text>
              <Pressable
                style={styles.entryEditBtn}
                hitSlop={8}
                onPress={() => navigation.navigate("RefusalEntryEdit", { entryId: entry.id })}
                accessibilityRole="button"
                accessibilityLabel={`Edit refusal ${entry.sequenceNo}`}
              >
                <Ionicons name="create-outline" size={15} color={appTheme.colors.primary} />
                <Text style={styles.entryEditText}>Edit</Text>
              </Pressable>
            </View>
          </Pressable>
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
  // Sticky bottom bar: Sign button + Save, always reachable without scrolling.
  signFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: appTheme.spacing.sm,
    backgroundColor: appTheme.colors.surface,
    borderWidth: 1,
    borderColor: appTheme.colors.borderSoft,
    borderRadius: appTheme.radius.lg,
    padding: appTheme.spacing.sm,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  signFooterBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: appTheme.radius.pill,
    borderWidth: 1,
    borderColor: appTheme.colors.borderBrandSoft,
    backgroundColor: appTheme.colors.surfaceBrandMuted,
  },
  signFooterBtnDone: {
    borderColor: appTheme.colors.borderSuccessSoft,
    backgroundColor: appTheme.colors.surfaceSuccessSoft,
  },
  signFooterBtnText: {
    color: appTheme.colors.primary,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 14,
  },
  signFooterBtnTextDone: {
    color: appTheme.colors.success,
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
    gap: 6,
    marginBottom: appTheme.spacing.xs,
  },
  entrySeq: {
    minWidth: 24,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: appTheme.radius.pill,
    backgroundColor: appTheme.colors.surfaceBrandMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  entrySeqText: { color: appTheme.colors.primary, fontFamily: appTheme.fonts.bodyMedium, fontSize: 12 },
  entryTimePill: { flexDirection: "row", alignItems: "center", gap: 3 },
  entryDesc: { color: appTheme.colors.text, fontFamily: appTheme.fonts.body, fontSize: 13, lineHeight: 18 },
  entryObs: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 12, lineHeight: 16 },
  entryFooterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 2,
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: appTheme.colors.borderSoft,
  },
  entryStaff: { flex: 1, color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 12 },
  entryEditBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 4, paddingHorizontal: 8, borderRadius: appTheme.radius.pill, backgroundColor: appTheme.colors.surfaceBrandMuted },
  entryEditText: { color: appTheme.colors.primary, fontFamily: appTheme.fonts.bodyMedium, fontSize: 13 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 2 },
  required: {},
  // The base `input` has borderWidth:0, so give the error state a visible width too.
  inputError: { borderWidth: 1, borderColor: appTheme.colors.danger },
  signatureMissing: { borderWidth: 1, borderStyle: "dashed", borderColor: appTheme.colors.borderStrong },
  footerWrap: { gap: 8 },
  footerHintRow: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "center" },
  footerHint: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 12 },
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
    flex: 1,
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


