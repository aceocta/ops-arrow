import React, { useMemo, useState } from "react";
import { ActivityIndicator, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../auth/AuthContext";
import {
  FieldCode,
  getFieldOptions,
  getTillFieldBreakdown,
  getTillFieldBreakdownEntries,
  TillFieldBreakdownRow,
} from "../../api/tillReconciliationApi";
import { DateRangeQuickPicks } from "../../components/DateRangeQuickPicks";
import { DateTimeField, formatDateValue } from "../../components/DateTimeField";
import { EmptyState } from "../../components/EmptyState";
import { LoadingState } from "../../components/LoadingState";
import { PrimaryButton } from "../../components/PrimaryButton";
import { ScreenContainer } from "../../components/ScreenContainer";
import { formatGbp } from "../../utils/currency";
import { formatDayLabel } from "../../utils/dateLabels";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return formatDateValue(d);
}

export function TillLineReportScreen() {
  const { activeShopId } = useAuth();
  const shopId = activeShopId as string;

  const [from, setFrom] = useState(() => daysAgo(29));
  const [to, setTo] = useState(() => formatDateValue(new Date()));
  const [selected, setSelected] = useState<string[]>([]); // specific fields (override group)
  const [groupName, setGroupName] = useState(""); // "" = all groups
  const [groupOpen, setGroupOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const fieldOptionsQuery = useQuery({
    queryKey: ["till-fields", shopId],
    queryFn: () => getFieldOptions(shopId),
    enabled: Boolean(shopId),
    staleTime: 5 * 60 * 1000,
  });
  const allGroups = fieldOptionsQuery.data ?? [];

  // The field codes in the chosen group — used as the filter when no specific fields are picked.
  const groupCodes = useMemo(() => {
    if (!groupName) return [];
    const g = allGroups.find((x) => x.group === groupName);
    return g ? g.fields.map((f) => f.value as string) : [];
  }, [groupName, allGroups]);

  // Specific fields win; otherwise the selected group's fields; otherwise all.
  const effectiveFields = selected.length > 0 ? selected : groupCodes;

  const breakdownQuery = useQuery({
    queryKey: ["till-field-breakdown", shopId, from, to, effectiveFields],
    queryFn: () => getTillFieldBreakdown(shopId, from, to, effectiveFields),
    enabled: Boolean(shopId),
  });

  const data = breakdownQuery.data;
  const rows = data?.rows ?? [];
  const totalEntries = rows.reduce((s, r) => s + r.lineCount, 0);

  const toggleField = (code: string) =>
    setSelected((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));

  return (
    <ScreenContainer
      refreshControl={
        <RefreshControl refreshing={breakdownQuery.isRefetching} onRefresh={() => breakdownQuery.refetch()} tintColor={appTheme.colors.primary} colors={[appTheme.colors.primary]} />
      }
    >
      {/* Period */}
      <View style={ui.card}>
        {/* <Text style={ui.sectionTitle}>Period</Text> */}
        <DateRangeQuickPicks from={from} to={to} onSelect={(f, t) => { setFrom(f); setTo(t); }} style={{ marginBottom: 4 }} />
        <View style={styles.dateRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>From</Text>
            <DateTimeField mode="date" value={from} onChange={setFrom} maximumDate={new Date()} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>To</Text>
            <DateTimeField mode="date" value={to} onChange={setTo} maximumDate={new Date()} />
          </View>
        </View>

        {/* Group filter (coarse) */}
        <Pressable style={styles.filterBar} onPress={() => setGroupOpen(true)}>
          <Ionicons name="layers-outline" size={16} color={appTheme.colors.primary} />
          <Text style={styles.filterBarText}>{groupName || "All groups"}</Text>
          <Ionicons name="chevron-down" size={16} color={appTheme.colors.textSubtle} />
        </Pressable>

        {/* Field filter (fine) */}
        <Pressable style={styles.filterBar} onPress={() => setPickerOpen(true)}>
          <Ionicons name="funnel-outline" size={16} color={appTheme.colors.primary} />
          <Text style={styles.filterBarText}>
            {selected.length === 0
              ? groupName ? "All fields in group" : "All fields"
              : `${selected.length} field${selected.length === 1 ? "" : "s"} selected`}
          </Text>
          <Ionicons name="chevron-forward" size={16} color={appTheme.colors.textSubtle} />
        </Pressable>
      </View>

      {/* Summary */}
      {breakdownQuery.isLoading ? <View style={ui.card}><LoadingState inline /></View> : null}
      {breakdownQuery.isError ? (
        <View style={ui.card}>
          <EmptyState icon="alert-circle-outline" title="Couldn't load report" message="Pull to refresh or adjust the dates." />
        </View>
      ) : null}

      {data && !breakdownQuery.isLoading ? (
        <>
          <View style={[ui.card, styles.summaryCard]}>
            <Text style={styles.summaryLabel}>Total over {formatDayLabel(from)} – {formatDayLabel(to)}</Text>
            <Text style={styles.summaryValue}>{formatGbp(data.grandTotal)}</Text>
            <Text style={styles.summaryMeta}>{totalEntries} {totalEntries === 1 ? "entry" : "entries"} across {rows.length} field{rows.length === 1 ? "" : "s"}</Text>
          </View>

          {rows.length === 0 ? (
            <View style={ui.card}>
              <EmptyState icon="receipt-outline" title="No entries" message="No matching till lines in this period. Adjust the dates or fields." />
            </View>
          ) : (
            <View style={ui.card}>
              {rows.map((row) => (
                <FieldRow
                  key={row.fieldCode}
                  shopId={shopId}
                  from={from}
                  to={to}
                  row={row}
                  expanded={expanded === row.fieldCode}
                  onToggle={() => setExpanded((cur) => (cur === row.fieldCode ? null : row.fieldCode))}
                />
              ))}
            </View>
          )}
        </>
      ) : null}

      {/* Group single-select dropdown */}
      <Modal visible={groupOpen} transparent animationType="slide" onRequestClose={() => setGroupOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setGroupOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={ui.sectionTitle}>Group</Text>
            <ScrollView style={{ maxHeight: 400 }}>
              {[{ value: "", label: "All groups" }, ...allGroups.map((g) => ({ value: g.group, label: g.group }))].map((g) => {
                const on = groupName === g.value;
                return (
                  <Pressable
                    key={g.label}
                    style={styles.pickRow}
                    onPress={() => {
                      setGroupName(g.value);
                      setSelected([]); // group changes reset the fine field selection
                      setGroupOpen(false);
                    }}
                  >
                    <Ionicons name={on ? "radio-button-on" : "radio-button-off"} size={20} color={on ? appTheme.colors.primary : appTheme.colors.textSubtle} />
                    <Text style={styles.pickLabel}>{g.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Field multi-select (scoped to the chosen group) */}
      <FieldPicker
        visible={pickerOpen}
        groups={groupName ? allGroups.filter((g) => g.group === groupName) : allGroups}
        selected={selected}
        onToggle={toggleField}
        onClear={() => setSelected([])}
        onClose={() => setPickerOpen(false)}
      />
    </ScreenContainer>
  );
}

function FieldRow({
  shopId,
  from,
  to,
  row,
  expanded,
  onToggle,
}: {
  shopId: string;
  from: string;
  to: string;
  row: TillFieldBreakdownRow;
  expanded: boolean;
  onToggle: () => void;
}) {
  const entriesQuery = useQuery({
    queryKey: ["till-field-entries", shopId, from, to, row.fieldCode],
    queryFn: () => getTillFieldBreakdownEntries(shopId, from, to, row.fieldCode),
    enabled: expanded,
  });

  return (
    <View style={styles.rowWrap}>
      <Pressable style={styles.row} onPress={onToggle} accessibilityRole="button">
        <Ionicons name={expanded ? "chevron-down" : "chevron-forward"} size={16} color={appTheme.colors.textSubtle} />
        <View style={{ flex: 1 }}>
          <Text style={styles.rowName}>{row.fieldName}</Text>
          <Text style={styles.rowMeta}>
            {row.groupName} · {row.lineCount} {row.lineCount === 1 ? "entry" : "entries"}
            {row.quantityTotal > 0 ? ` · ×${row.quantityTotal}` : ""}
          </Text>
        </View>
        <Text style={styles.rowAmount}>{formatGbp(row.total)}</Text>
      </Pressable>

      {expanded ? (
        <View style={styles.drill}>
          {entriesQuery.isLoading ? (
            <ActivityIndicator size="small" color={appTheme.colors.primary} style={{ paddingVertical: 8 }} />
          ) : (entriesQuery.data ?? []).length === 0 ? (
            <Text style={styles.drillEmpty}>No entries.</Text>
          ) : (
            (entriesQuery.data ?? []).map((e, i) => (
              <View key={`${e.reconciliationId}-${i}`} style={styles.drillRow}>
                <Text style={styles.drillDate}>{formatDayLabel(e.businessDate)}</Text>
                <Text style={styles.drillAmount}>
                  {e.quantity != null && row.quantityTotal > 0 ? `×${e.quantity}  ` : ""}{formatGbp(e.amount)}
                </Text>
              </View>
            ))
          )}
        </View>
      ) : null}
    </View>
  );
}

function FieldPicker({
  visible,
  groups,
  selected,
  onToggle,
  onClear,
  onClose,
}: {
  visible: boolean;
  groups: { group: string; fields: { value: FieldCode; label: string }[] }[];
  selected: string[];
  onToggle: (code: string) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.sheetHeader}>
            <Text style={ui.sectionTitle}>Filter fields</Text>
            <Pressable onPress={onClear}><Text style={styles.clearText}>All fields</Text></Pressable>
          </View>
          <ScrollView style={{ maxHeight: 420 }}>
            {groups.map((g) => (
              <View key={g.group} style={{ marginBottom: 6 }}>
                <Text style={styles.pickerGroup}>{g.group}</Text>
                {g.fields.map((f) => {
                  const isOn = selected.includes(f.value);
                  return (
                    <Pressable key={f.value} style={styles.pickRow} onPress={() => onToggle(f.value)}>
                      <Ionicons name={isOn ? "checkbox" : "square-outline"} size={20} color={isOn ? appTheme.colors.primary : appTheme.colors.textSubtle} />
                      <Text style={styles.pickLabel}>{f.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </ScrollView>
          <PrimaryButton label="Done" onPress={onClose} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  dateRow: { flexDirection: "row", gap: appTheme.spacing.sm },
  fieldLabel: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 12, marginBottom: 2 },
  filterBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: appTheme.radius.sm,
    borderWidth: 1,
    borderColor: appTheme.colors.borderSoft,
    backgroundColor: appTheme.colors.surfaceMuted,
  },
  filterBarText: { flex: 1, color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 14 },
  summaryCard: { alignItems: "center", gap: 2 },
  summaryLabel: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 13 },
  summaryValue: { color: appTheme.colors.text, fontFamily: appTheme.fonts.heading, fontSize: 30, lineHeight: 36 },
  summaryMeta: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 12 },
  rowWrap: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: appTheme.colors.borderSoft },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 11 },
  rowName: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 15 },
  rowMeta: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 12, marginTop: 1 },
  rowAmount: { color: appTheme.colors.text, fontFamily: appTheme.fonts.heading, fontSize: 16 },
  drill: { paddingLeft: 26, paddingBottom: 8, gap: 4 },
  drillRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: appTheme.colors.borderSoft },
  drillDate: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 13 },
  drillAmount: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 13 },
  drillEmpty: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 13, paddingVertical: 6 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  sheet: { backgroundColor: appTheme.colors.surface, borderTopLeftRadius: appTheme.radius.lg, borderTopRightRadius: appTheme.radius.lg, padding: 16, gap: 10 },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  clearText: { color: appTheme.colors.primary, fontFamily: appTheme.fonts.bodyMedium, fontSize: 13 },
  pickerGroup: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.bodyMedium, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2, marginTop: 4 },
  pickRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  pickLabel: { color: appTheme.colors.text, fontFamily: appTheme.fonts.body, fontSize: 14 },
});
