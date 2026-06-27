import React, { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { listProducts, ProductBatch, ProductExpiryStatus } from "../../api/productExpiryApi";
import { useAuth } from "../../auth/AuthContext";
import { DateTimeField, formatDateValue } from "../../components/DateTimeField";
import { EmptyState } from "../../components/EmptyState";
import { LoadingState } from "../../components/LoadingState";
import { PrimaryButton } from "../../components/PrimaryButton";
import { ScreenContainer } from "../../components/ScreenContainer";
import { SegmentedControl } from "../../components/SegmentedControl";
import { StatusBadge } from "../../components/StatusBadge";
import { MainStackParamList } from "../../types/navigation";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";

type Filter = "all" | ProductExpiryStatus;

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "Urgent", label: "Urgent" },
  { value: "ExpiringSoon", label: "Soon" },
  { value: "Expired", label: "Expired" },
];

type DatePreset = "any" | "today" | "next7" | "next30" | "custom";

const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: "any", label: "Any date" },
  { value: "today", label: "Today" },
  { value: "next7", label: "7 days" },
  { value: "next30", label: "30 days" },
  { value: "custom", label: "Custom" },
];

function addDaysIso(baseIso: string, days: number): string {
  const d = new Date(`${baseIso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return formatDateValue(d);
}

function statusTone(status: ProductExpiryStatus): "neutral" | "warning" | "danger" | "success" {
  if (status === "Safe") return "success";
  if (status === "ExpiringSoon") return "warning";
  return "danger"; // Urgent + Expired
}

function statusLabel(status: ProductExpiryStatus) {
  return status === "ExpiringSoon" ? "Expiring soon" : status;
}

function daysLabel(days: number) {
  if (days < 0) return `${Math.abs(days)}d ago`;
  if (days === 0) return "today";
  return `${days}d left`;
}

export function ProductExpiryListScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { activeShopId } = useAuth();
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const today = formatDateValue(new Date());
  const [datePreset, setDatePreset] = useState<DatePreset>("any");
  const [customFrom, setCustomFrom] = useState(today);
  const [customTo, setCustomTo] = useState(today);
  // Secondary refine filters (category + expiry date) live behind a collapsible panel so the page
  // reads clean by default — the daily "what needs attention" check is just the status band on top.
  const [filtersOpen, setFiltersOpen] = useState(false);

  const query = useQuery({
    queryKey: ["product-expiry", activeShopId, filter],
    queryFn: () => listProducts(activeShopId as string, filter === "all" ? undefined : filter),
    enabled: Boolean(activeShopId),
  });

  const items = query.data ?? [];

  // Categories present in the current (status-filtered) items — the chip filter only offers bands
  // that actually have stock, so there are no dead-end taps.
  const categories = useMemo(() => {
    const map = new Map<string, string>();
    items.forEach((it) => { if (!map.has(it.productCategoryId)) map.set(it.productCategoryId, it.categoryName); });
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [items]);

  // Resolve the chosen preset (or custom range) into an inclusive [from, to] expiry window. null = unbounded.
  const { dateFrom, dateTo } = useMemo<{ dateFrom: string | null; dateTo: string | null }>(() => {
    switch (datePreset) {
      case "today": return { dateFrom: today, dateTo: today };
      case "next7": return { dateFrom: today, dateTo: addDaysIso(today, 7) };
      case "next30": return { dateFrom: today, dateTo: addDaysIso(today, 30) };
      case "custom": return customFrom <= customTo ? { dateFrom: customFrom, dateTo: customTo } : { dateFrom: customTo, dateTo: customFrom };
      default: return { dateFrom: null, dateTo: null };
    }
  }, [datePreset, customFrom, customTo, today]);

  const term = search.trim().toLowerCase();
  const filteredItems = items.filter(
    (it) =>
      (categoryId === null || it.productCategoryId === categoryId) &&
      (term === "" || it.productName.toLowerCase().includes(term)) &&
      (dateFrom === null || it.expiryDate >= dateFrom) &&
      (dateTo === null || it.expiryDate <= dateTo),
  );

  // Switching status band changes which categories exist, so clear the (now possibly stale) category.
  const onStatusChange = (next: Filter) => {
    setFilter(next);
    setCategoryId(null);
  };

  // Count + clear only the secondary refine filters (category + expiry date). Status band and search
  // are always visible with their own controls, so they're excluded.
  const activeFilterCount = (categoryId !== null ? 1 : 0) + (datePreset !== "any" ? 1 : 0);
  const clearFilters = () => {
    setCategoryId(null);
    setDatePreset("any");
    setCustomFrom(today);
    setCustomTo(today);
  };

  return (
    <ScreenContainer
      refreshControl={
        <RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} tintColor={appTheme.colors.primary} />
      }
      footer={<PrimaryButton label="Add product" onPress={() => navigation.navigate("AddProduct")} />}
    >
      <View style={styles.filters}>
        <SegmentedControl options={FILTERS} value={filter} onChange={onStatusChange} />

        <View style={styles.searchRow}>
          <Ionicons name="search" size={16} color={appTheme.colors.textSubtle} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search product name"
            placeholderTextColor={appTheme.colors.textSubtle}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {search ? (
            <Pressable onPress={() => setSearch("")} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear search">
              <Ionicons name="close-circle" size={16} color={appTheme.colors.textSubtle} />
            </Pressable>
          ) : null}
        </View>

        <View style={styles.filtersHeader}>
          <Pressable
            style={styles.filtersHeaderLeft}
            onPress={() => setFiltersOpen((o) => !o)}
            accessibilityRole="button"
            accessibilityState={{ expanded: filtersOpen }}
            accessibilityLabel="Filters"
          >
            <Ionicons name={filtersOpen ? "chevron-down" : "chevron-forward"} size={16} color={appTheme.colors.textSubtle} />
            <Text style={styles.filtersHeaderText}>Filters</Text>
            {activeFilterCount > 0 ? (
              <View style={styles.badge}><Text style={styles.badgeText}>{activeFilterCount}</Text></View>
            ) : null}
          </Pressable>
          {activeFilterCount > 0 ? (
            <Pressable onPress={clearFilters} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear filters">
              <Text style={styles.clearText}>Clear</Text>
            </Pressable>
          ) : null}
        </View>

        {filtersOpen ? (
          <>
            {categories.length > 1 ? (
              <>
                <Text style={styles.filterLabel}>Category</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                  <Pressable
                    style={[styles.chip, categoryId === null ? styles.chipSelected : null]}
                    onPress={() => setCategoryId(null)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: categoryId === null }}
                  >
                    <Text style={[styles.chipText, categoryId === null ? styles.chipTextSelected : null]}>All</Text>
                  </Pressable>
                  {categories.map((c) => {
                    const selected = categoryId === c.id;
                    return (
                      <Pressable
                        key={c.id}
                        style={[styles.chip, selected ? styles.chipSelected : null]}
                        onPress={() => setCategoryId(selected ? null : c.id)}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                      >
                        <Text style={[styles.chipText, selected ? styles.chipTextSelected : null]} numberOfLines={1}>{c.name}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </>
            ) : null}

            <Text style={styles.filterLabel}>Expiry date</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {DATE_PRESETS.map((p) => {
                const selected = datePreset === p.value;
                return (
                  <Pressable
                    key={p.value}
                    style={[styles.chip, selected ? styles.chipSelected : null]}
                    onPress={() => setDatePreset(p.value)}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                  >
                    <Text style={[styles.chipText, selected ? styles.chipTextSelected : null]}>{p.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            {datePreset === "custom" ? (
              <View style={styles.customDateRow}>
                <View style={styles.cell}>
                  <Text style={styles.fieldLabel}>From</Text>
                  <DateTimeField mode="date" value={customFrom} onChange={setCustomFrom} />
                </View>
                <View style={styles.cell}>
                  <Text style={styles.fieldLabel}>To</Text>
                  <DateTimeField mode="date" value={customTo} onChange={setCustomTo} />
                </View>
              </View>
            ) : null}
          </>
        ) : null}
      </View>

      {query.isLoading ? (
        <View style={ui.card}><LoadingState message="Loading products…" inline /></View>
      ) : items.length === 0 ? (
        <EmptyState
          icon="cube-outline"
          title={filter === "all" ? "No products tracked yet" : "Nothing in this band"}
          message={filter === "all" ? "Add a product with its expiry date to start tracking." : "Switch filter or add a product."}
        />
      ) : filteredItems.length === 0 ? (
        <EmptyState
          icon="search-outline"
          title="No matches"
          message="No products match your filters (search, category, or expiry window). Clear them to see all."
        />
      ) : (
        <View style={styles.list}>
          {filteredItems.map((item) => (
            <ProductRow key={item.id} item={item} onPress={() => navigation.navigate("ProductExpiryDetail", { id: item.id })} />
          ))}
        </View>
      )}
    </ScreenContainer>
  );
}

function ProductRow({ item, onPress }: { item: ProductBatch; onPress: () => void }) {
  return (
    <Pressable style={[ui.listItem, styles.row]} onPress={onPress} accessibilityRole="button" accessibilityLabel={`${item.productName}, ${statusLabel(item.status)}`}>
      <View style={styles.rowMain}>
        <Text style={styles.rowTitle} numberOfLines={1}>{item.productName}</Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {item.categoryName} · {item.remainingQuantity} left · {item.expiryDate}
        </Text>
      </View>
      <View style={styles.rowRight}>
        <StatusBadge label={statusLabel(item.status)} tone={statusTone(item.status)} />
        <Text style={[styles.days, item.daysToExpiry <= 0 ? styles.daysBad : null]}>{daysLabel(item.daysToExpiry)}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={appTheme.colors.textSubtle} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  filters: { gap: appTheme.spacing.sm },
  searchRow: {
    flexDirection: "row", alignItems: "center", gap: appTheme.spacing.xs,
    borderWidth: 1, borderColor: appTheme.colors.border, borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surfaceMuted, paddingHorizontal: appTheme.spacing.sm, paddingVertical: 8,
  },
  searchInput: { flex: 1, color: appTheme.colors.text, fontFamily: appTheme.fonts.body, fontSize: 14, padding: 0, margin: 0 },
  chips: { gap: appTheme.spacing.xs, paddingVertical: 2 },
  chip: {
    borderWidth: 1, borderColor: appTheme.colors.primary, borderRadius: appTheme.radius.pill,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  chipSelected: { backgroundColor: appTheme.colors.primary },
  chipText: { color: appTheme.colors.primary, fontFamily: appTheme.fonts.bodyMedium, fontSize: 13 },
  chipTextSelected: { color: appTheme.colors.onPrimary },
  filtersHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 6 },
  filtersHeaderLeft: { flexDirection: "row", alignItems: "center", gap: appTheme.spacing.xs },
  filtersHeaderText: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 14 },
  badge: { minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5, backgroundColor: appTheme.colors.primary, alignItems: "center", justifyContent: "center" },
  badgeText: { color: appTheme.colors.onPrimary, fontFamily: appTheme.fonts.bodyMedium, fontSize: 11 },
  clearText: { color: appTheme.colors.primary, fontFamily: appTheme.fonts.bodyMedium, fontSize: 13 },
  filterLabel: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.bodyMedium, fontSize: 12, marginTop: 2 },
  customDateRow: { flexDirection: "row", gap: appTheme.spacing.sm },
  cell: { flex: 1 },
  fieldLabel: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 12, lineHeight: 16, marginBottom: 2 },
  list: { gap: appTheme.spacing.xs },
  row: { flexDirection: "row", alignItems: "center", gap: appTheme.spacing.sm },
  rowMain: { flex: 1, gap: 2 },
  rowTitle: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 15, lineHeight: 19 },
  rowMeta: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 12, lineHeight: 16 },
  rowRight: { alignItems: "flex-end", gap: 4 },
  days: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.bodyMedium, fontSize: 12 },
  daysBad: { color: appTheme.colors.danger },
});
