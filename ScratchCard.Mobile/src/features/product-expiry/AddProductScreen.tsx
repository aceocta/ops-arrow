import React, { useEffect, useMemo, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { addProduct, createProductCategory, listProductCategories, lookupProductByBarcode, ProductDateType } from "../../api/productExpiryApi";
import { subscribeProductScan } from "./productScanBus";
import { normalizeGtin, parseGs1IfApplicable } from "./gs1";
import { useAuth } from "../../auth/AuthContext";
import { DateTimeField, formatDateValue } from "../../components/DateTimeField";
import { FloatingLabelInput } from "../../components/FloatingLabelInput";
import { LoadingState } from "../../components/LoadingState";
import { ModalBackdropBlur } from "../../components/ModalBackdropBlur";
import { PrimaryButton } from "../../components/PrimaryButton";
import { ScreenContainer } from "../../components/ScreenContainer";
import { SegmentedControl } from "../../components/SegmentedControl";
import { toastError, toastSuccess } from "../../components/toast";
import { MainStackParamList } from "../../types/navigation";
import { getApiErrorMessage } from "../../utils/apiErrorMessage";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";

// Roles allowed to create a category (mirrors backend RoleNames.ManagementAndAbove).
const MANAGE_ROLES = ["PlatformAdmin", "CompanyOwner", "Manager"];

function sanitizeMoney(raw: string): string {
  let s = raw.replace(/,/g, ".").replace(/[^\d.]/g, "");
  const dot = s.indexOf(".");
  if (dot !== -1) s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, "").slice(0, 2);
  return s;
}

// Parse a free-typed "7, 3, 0" reminder-stage string into a clean, de-duped, descending day list.
function parseReminderDays(raw: string): number[] {
  return Array.from(new Set(raw.split(/[ ,]+/).map((s) => parseInt(s, 10)).filter((n) => Number.isFinite(n) && n >= 0)))
    .sort((a, b) => b - a);
}

export function AddProductScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const queryClient = useQueryClient();
  const { activeShopId, activeShop, profile } = useAuth();
  // Creating a category is management-only on the server (RoleNames.ManagementAndAbove), so only
  // surface the inline "+ New" affordance to that audience — staff still pick from the existing list.
  // Mirror the backend gate exactly so the button never leads to a 403 dead-end.
  const canManageCategories =
    MANAGE_ROLES.includes(activeShop?.role ?? "") || (profile?.roles?.some((r) => MANAGE_ROLES.includes(r)) ?? false);

  const [productName, setProductName] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [dateType, setDateType] = useState<ProductDateType>("BestBefore");
  const [quantity, setQuantity] = useState("1");
  const [expiryDate, setExpiryDate] = useState(formatDateValue(new Date()));
  const [batchNumber, setBatchNumber] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [barcode, setBarcode] = useState("");
  const [scanHint, setScanHint] = useState<string | null>(null);
  // True after a barcode scan whose lookup found nothing locally or online — surfaces the OCR
  // "scan the label" option so the user can read the name (and expiry) straight off the packaging.
  const [lookupMissed, setLookupMissed] = useState(false);
  // Inline "create category" without leaving the add form (managers/owners only).
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryDays, setNewCategoryDays] = useState("7, 3, 0");
  // expiryDate is seeded to today (never empty), so track manual edits explicitly: a barcode scan
  // must not clobber a date the user typed (or OCR'd via "Scan date").
  const expiryTouched = useRef(false);

  // When the dedicated scanner emits a scan: GS1-parse 2D codes to auto-fill expiry + batch, key the
  // barcode off the GTIN, then prefill the rest from the most recent batch with that barcode
  // (self-completing catalogue) — only filling fields the user hasn't typed.
  useEffect(() => {
    const unsubscribe = subscribeProductScan((scan) => {
      // Name-OCR scan ("scan the label"): the user explicitly read the name off the packaging, so it
      // is authoritative. It may also carry the expiry captured in the same shot.
      if (scan.name) {
        setProductName(scan.name);
        setLookupMissed(false);
        if (scan.expiry) {
          expiryTouched.current = true;
          setExpiryDate(scan.expiry);
        }
        setScanHint(
          scan.expiry
            ? `Read “${scan.name}” and expiry ${scan.expiry} from the label.`
            : `Read “${scan.name}” from the label. Set the expiry date.`,
        );
        return;
      }
      // Date-OCR scan: the user explicitly tapped "Scan date", so this is the authoritative expiry.
      if (scan.expiry) {
        expiryTouched.current = true;
        setExpiryDate(scan.expiry);
        setScanHint(`Read expiry ${scan.expiry} from the label.`);
        return;
      }
      const raw = scan.raw;
      if (!raw) return;

      const gs1 = parseGs1IfApplicable(raw, scan.type);
      const key = normalizeGtin(gs1?.gtin ?? raw);
      setBarcode(key);
      setScanHint(null);
      setLookupMissed(false);

      const scannedDate = gs1?.expiry ?? gs1?.bestBefore;
      if (scannedDate && !expiryTouched.current) setExpiryDate(scannedDate); // don't overwrite a typed date
      // Reflect the pack's date semantics: AI-17 = use-by, AI-15 (only) = best-before.
      if (gs1?.expiry) setDateType("UseBy");
      else if (gs1?.bestBefore) setDateType("BestBefore");
      if (gs1?.batch) setBatchNumber((cur) => (cur.trim() ? cur : gs1.batch ?? ""));

      const scannedBits: string[] = [];
      if (scannedDate) scannedBits.push(`expiry ${scannedDate}`);
      if (gs1?.batch) scannedBits.push(`batch ${gs1.batch}`);

      if (!activeShopId) {
        setScanHint("Select a shop first, then scan to look up the product.");
        return;
      }
      const shopId = activeShopId;
      const scannedPrefix = scannedBits.length ? `Scanned ${scannedBits.join(", ")}. ` : "";
      // Show a "working" state immediately — the online lookup can take a few seconds, and silence
      // reads as a hang on the shop floor.
      setScanHint(`${scannedPrefix}Looking up product…`);

      void (async () => {
        try {
          const match = await lookupProductByBarcode(shopId, key);
          if (!match.found) {
            setLookupMissed(true);
            setScanHint(
              scannedBits.length
                ? `Scanned ${scannedBits.join(", ")}. Not in your catalogue or online — scan the label to read its name.`
                : "Not in your catalogue or online — scan the label to read its name & date.",
            );
            return;
          }
          setLookupMissed(false);

          // Always offer the product name. Category / date-type / price only come from a previous
          // batch at THIS shop (a "local" match), never from the online product database.
          setProductName((cur) => (cur.trim() ? cur : match.productName ?? ""));
          if (match.source === "local") {
            if (match.productCategoryId) setCategoryId((cur) => cur ?? match.productCategoryId ?? null);
            if (!scannedDate && match.dateType) setDateType(match.dateType);
            if (match.unitCost != null) setUnitCost((cur) => (cur.trim() ? cur : String(match.unitCost)));
            if (match.unitPrice != null) setUnitPrice((cur) => (cur.trim() ? cur : String(match.unitPrice)));
            setScanHint(
              scannedBits.length
                ? `Scanned ${scannedBits.join(", ")}; prefilled “${match.productName}”.`
                : `Prefilled from last “${match.productName}”. Set the new expiry date.`,
            );
          } else {
            // Online match — name (and maybe a mapped category) suggested; user confirms the rest.
            if (match.productCategoryId) setCategoryId((cur) => cur ?? match.productCategoryId ?? null);
            const todo: string[] = [];
            if (!match.productCategoryId) todo.push("pick a category");
            if (!scannedDate) todo.push("set the expiry");
            const prefix = scannedBits.length ? `Scanned ${scannedBits.join(", ")}. ` : "";
            setScanHint(`${prefix}Found “${match.productName}” online${todo.length ? ` — ${todo.join(" and ")}.` : "."}`);
          }
        } catch {
          // Lookup is best-effort; the scanned barcode/expiry/batch are still captured. Surface it
          // unconditionally (keeping the GS1 context) so a silent failure — even when a scan hint was
          // already set — doesn't read as "scanning does nothing".
          setScanHint(`${scannedPrefix}Saved the barcode — product lookup is unavailable. Enter the name.`);
        }
      })();
    });
    return unsubscribe;
  }, [activeShopId]);

  const categoriesQuery = useQuery({
    queryKey: ["product-categories", activeShopId],
    queryFn: () => listProductCategories(activeShopId as string),
    enabled: Boolean(activeShopId),
  });
  const categories = useMemo(() => (categoriesQuery.data ?? []).filter((c) => c.isActive), [categoriesQuery.data]);

  const createCategoryMutation = useMutation({
    mutationFn: () =>
      createProductCategory({
        shopId: activeShopId as string,
        name: newCategoryName.trim(),
        reminderDays: parseReminderDays(newCategoryDays),
      }),
    onSuccess: (created) => {
      toastSuccess("Category created.");
      setCategoryModalOpen(false);
      setNewCategoryName("");
      setNewCategoryDays("7, 3, 0");
      void queryClient.invalidateQueries({ queryKey: ["product-categories", activeShopId] });
      setCategoryId(created.id); // auto-select the just-created category
    },
    onError: (error: unknown) => toastError(getApiErrorMessage(error, "Unable to create category.")),
  });

  const qtyValue = Number(quantity);
  const hasQty = Number.isFinite(qtyValue) && qtyValue > 0;
  const canSave = productName.trim().length > 0 && Boolean(categoryId) && hasQty && expiryDate.length > 0;
  const missing = [
    productName.trim() ? null : "name",
    categoryId ? null : "category",
    hasQty ? null : "quantity",
  ].filter(Boolean) as string[];

  // Soft warning, not a block: you may legitimately log already-expired stock as waste, but an
  // accidental past date (typo / wrong year off OCR) is worth flagging before saving.
  const expiryInPast = expiryDate.length > 0 && expiryDate < formatDateValue(new Date());

  const addMutation = useMutation({
    mutationFn: () =>
      addProduct({
        shopId: activeShopId as string,
        productCategoryId: categoryId as string,
        productName: productName.trim(),
        barcode: barcode.trim() || undefined,
        quantity: Math.floor(qtyValue),
        expiryDate,
        dateType,
        batchNumber: batchNumber.trim() || undefined,
        unitCost: unitCost.trim() ? Number(unitCost) : undefined,
        unitPrice: unitPrice.trim() ? Number(unitPrice) : undefined,
      }),
    onSuccess: () => {
      toastSuccess("Product added.");
      void queryClient.invalidateQueries({ queryKey: ["product-expiry", activeShopId] });
      navigation.goBack();
    },
    onError: (error: unknown) => toastError(getApiErrorMessage(error, "Unable to add product.")),
  });

  return (
    <ScreenContainer
      footer={
        <View style={styles.footer}>
          {missing.length > 0 ? <Text style={styles.footerHint}>Add {missing.join(", ")} to save</Text> : null}
          <PrimaryButton
            label={addMutation.isPending ? "Saving…" : "Add product"}
            // Imperative guard, not just `disabled`: on RN two taps can fire before the button
            // re-renders disabled, and POST /product-expiry isn't idempotent (would create 2 batches).
            onPress={() => { if (canSave && !addMutation.isPending) addMutation.mutate(); }}
            disabled={!canSave || addMutation.isPending}
          />
        </View>
      }
    >
      <View style={[ui.card, styles.card]}>
        <Pressable
          style={styles.scanRow}
          onPress={() => navigation.navigate("ProductBarcodeScanner")}
          accessibilityRole="button"
          accessibilityLabel="Scan product barcode"
        >
          <Ionicons name="barcode-outline" size={20} color={appTheme.colors.primary} />
          <Text style={styles.scanText}>{barcode ? `Barcode: ${barcode}` : "Scan barcode (optional)"}</Text>
          {barcode ? (
            <Pressable onPress={() => { setBarcode(""); setScanHint(null); setLookupMissed(false); }} hitSlop={8} accessibilityLabel="Clear barcode">
              <Ionicons name="close-circle" size={18} color={appTheme.colors.textSubtle} />
            </Pressable>
          ) : (
            <Ionicons name="chevron-forward" size={16} color={appTheme.colors.textSubtle} />
          )}
        </Pressable>
        {scanHint ? <Text style={styles.scanHint}>{scanHint}</Text> : null}

        {lookupMissed && !productName.trim() ? (
          <Pressable
            style={styles.ocrCta}
            onPress={() => navigation.navigate("ProductBarcodeScanner", { mode: "name" })}
            accessibilityRole="button"
            accessibilityLabel="Scan the product label to read its name and expiry date"
          >
            <Ionicons name="scan-outline" size={18} color={appTheme.colors.onPrimary} />
            <Text style={styles.ocrCtaText}>Scan name &amp; date from label</Text>
          </Pressable>
        ) : null}

        <View style={styles.labelRow}>
          <Text style={styles.fieldLabel}>Product name</Text>
          <Pressable
            style={styles.scanDateBtn}
            onPress={() => navigation.navigate("ProductBarcodeScanner", { mode: "name" })}
            accessibilityRole="button"
            accessibilityLabel="Scan the product name from the label"
          >
            <Ionicons name="camera-outline" size={14} color={appTheme.colors.primary} />
            <Text style={styles.scanDateText}>Scan name</Text>
          </Pressable>
        </View>
        <TextInput
          style={styles.nameInput}
          value={productName}
          onChangeText={setProductName}
          autoCapitalize="words"
          placeholder="Type or scan the name"
          placeholderTextColor={appTheme.colors.textSubtle}
          accessibilityLabel="Product name"
        />

        <View style={styles.labelRow}>
          <Text style={styles.fieldLabel}>Category</Text>
          {canManageCategories ? (
            <Pressable
              style={styles.scanDateBtn}
              onPress={() => setCategoryModalOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Create a new category"
            >
              <Ionicons name="add-circle-outline" size={14} color={appTheme.colors.primary} />
              <Text style={styles.scanDateText}>New category</Text>
            </Pressable>
          ) : null}
        </View>
        {categoriesQuery.isLoading ? (
          <LoadingState message="Loading categories…" inline />
        ) : categories.length === 0 ? (
          <Text style={styles.note}>
            {canManageCategories
              ? "No categories yet — tap “New category” to add your first one."
              : "No categories set up yet. Ask a manager to add one."}
          </Text>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {categories.map((c) => {
              const selected = c.id === categoryId;
              return (
                <Pressable
                  key={c.id}
                  style={[styles.chip, selected ? styles.chipSelected : null]}
                  onPress={() => setCategoryId(c.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                >
                  <Text style={[styles.chipText, selected ? styles.chipTextSelected : null]}>{c.name}</Text>
                </Pressable>
              );
            })}
            {canManageCategories ? (
              <Pressable
                style={[styles.chip, styles.chipNew]}
                onPress={() => setCategoryModalOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="Create a new category"
              >
                <Ionicons name="add" size={14} color={appTheme.colors.primary} />
                <Text style={styles.chipText}>New</Text>
              </Pressable>
            ) : null}
          </ScrollView>
        )}

        <Text style={styles.fieldLabel}>Date type</Text>
        <SegmentedControl
          options={[
            { value: "UseBy", label: "Use by" },
            { value: "BestBefore", label: "Best before" },
          ]}
          value={dateType}
          onChange={setDateType}
        />

        <View style={styles.labelRow}>
          <Text style={styles.fieldLabel}>Expiry date</Text>
          <Pressable
            style={styles.scanDateBtn}
            onPress={() => navigation.navigate("ProductBarcodeScanner", { mode: "date" })}
            accessibilityRole="button"
            accessibilityLabel="Scan the printed expiry date"
          >
            <Ionicons name="camera-outline" size={14} color={appTheme.colors.primary} />
            <Text style={styles.scanDateText}>Scan date</Text>
          </Pressable>
        </View>
        <DateTimeField mode="date" value={expiryDate} onChange={(v) => { expiryTouched.current = true; setExpiryDate(v); }} />
        {expiryInPast ? (
          <Text style={styles.warn}>This date is in the past — the item will be added as already expired. Double‑check the date if that wasn’t intended.</Text>
        ) : null}

        <View style={styles.row}>
          <View style={styles.cell}>
            <FloatingLabelInput label="Quantity" value={quantity} onChangeText={(v) => setQuantity(v.replace(/[^0-9]/g, ""))} keyboardType="number-pad" />
          </View>
          <View style={styles.cell}>
            <FloatingLabelInput label="Batch # (optional)" value={batchNumber} onChangeText={setBatchNumber} />
          </View>
        </View>

        <View style={styles.row}>
          <View style={styles.cell}>
            <FloatingLabelInput label="Unit cost (optional)" prefix="£" value={unitCost} onChangeText={(v) => setUnitCost(sanitizeMoney(v))} keyboardType="decimal-pad" />
          </View>
          <View style={styles.cell}>
            <FloatingLabelInput label="Unit price (optional)" prefix="£" value={unitPrice} onChangeText={(v) => setUnitPrice(sanitizeMoney(v))} keyboardType="decimal-pad" />
          </View>
        </View>
        <Text style={styles.note}>Cost/price are optional — used for the waste &amp; saved‑value report.</Text>
      </View>

      <Modal visible={categoryModalOpen} transparent animationType="fade" onRequestClose={() => setCategoryModalOpen(false)}>
        <View style={styles.modalBackdrop}>
          <ModalBackdropBlur />
          <View style={styles.modalCard}>
            <Text style={ui.sectionTitle}>New category</Text>
            <FloatingLabelInput label="Category name" value={newCategoryName} onChangeText={setNewCategoryName} autoCapitalize="words" />
            <FloatingLabelInput
              label="Reminder days (e.g. 7, 3, 0)"
              value={newCategoryDays}
              onChangeText={setNewCategoryDays}
              keyboardType="numbers-and-punctuation"
            />
            <Text style={styles.note}>Days before expiry to flag the item — biggest = Expiring Soon, smallest = Urgent.</Text>
            <PrimaryButton
              label={createCategoryMutation.isPending ? "Saving…" : "Create category"}
              onPress={() => createCategoryMutation.mutate()}
              disabled={createCategoryMutation.isPending || newCategoryName.trim().length === 0}
            />
            <PrimaryButton label="Cancel" tone="neutral" onPress={() => setCategoryModalOpen(false)} disabled={createCategoryMutation.isPending} />
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  card: { gap: appTheme.spacing.sm },
  fieldLabel: { color: appTheme.colors.text, fontSize: 13, lineHeight: 16, fontFamily: appTheme.fonts.bodyMedium, marginTop: 2 },
  chips: { gap: appTheme.spacing.xs, paddingVertical: 2 },
  chip: {
    borderWidth: 1, borderColor: appTheme.colors.primary, borderRadius: appTheme.radius.pill,
    paddingHorizontal: 12, paddingVertical: 7,
  },
  chipSelected: { backgroundColor: appTheme.colors.primary },
  chipNew: { flexDirection: "row", alignItems: "center", gap: 4, borderStyle: "dashed" },
  chipText: { color: appTheme.colors.primary, fontFamily: appTheme.fonts.bodyMedium, fontSize: 13 },
  chipTextSelected: { color: appTheme.colors.onPrimary },
  row: { flexDirection: "row", gap: appTheme.spacing.sm },
  cell: { flex: 1 },
  note: { color: appTheme.colors.textSubtle, fontFamily: appTheme.fonts.body, fontSize: 12, lineHeight: 16 },
  warn: { color: appTheme.colors.danger, fontFamily: appTheme.fonts.body, fontSize: 12, lineHeight: 16 },
  modalBackdrop: { flex: 1, justifyContent: "center", padding: appTheme.spacing.md, backgroundColor: appTheme.colors.overlay },
  modalCard: { backgroundColor: appTheme.colors.background, borderRadius: appTheme.radius.lg, padding: appTheme.spacing.md, gap: appTheme.spacing.sm },
  footer: { gap: appTheme.spacing.xs },
  footerHint: { color: appTheme.colors.textMuted, fontSize: 12, lineHeight: 16, fontFamily: appTheme.fonts.body },
  scanRow: {
    flexDirection: "row", alignItems: "center", gap: appTheme.spacing.sm,
    borderWidth: 1, borderColor: appTheme.colors.primary, borderRadius: appTheme.radius.sm,
    paddingHorizontal: appTheme.spacing.sm, paddingVertical: appTheme.spacing.sm,
    backgroundColor: appTheme.colors.surfaceBrandSoft,
  },
  scanText: { flex: 1, color: appTheme.colors.primary, fontFamily: appTheme.fonts.bodyMedium, fontSize: 14 },
  scanHint: { color: appTheme.colors.textSubtle, fontFamily: appTheme.fonts.body, fontSize: 12, lineHeight: 16 },
  labelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 2 },
  scanDateBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 2, paddingHorizontal: 4 },
  scanDateText: { color: appTheme.colors.primary, fontFamily: appTheme.fonts.bodyMedium, fontSize: 12 },
  nameInput: {
    backgroundColor: appTheme.colors.surfaceMuted,
    borderRadius: appTheme.radius.sm,
    borderWidth: 1.5,
    borderColor: "transparent",
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: 12,
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.body,
    fontSize: 15,
  },
  ocrCta: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: appTheme.spacing.xs,
    backgroundColor: appTheme.colors.primary, borderRadius: appTheme.radius.sm,
    paddingVertical: 11, paddingHorizontal: appTheme.spacing.sm,
  },
  ocrCtaText: { color: appTheme.colors.onPrimary, fontFamily: appTheme.fonts.bodyMedium, fontSize: 14 },
});
