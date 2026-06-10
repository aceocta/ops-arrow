import React, { useCallback, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getPendingApprovals } from "../../api/rotaApi";
import { listShiftSwaps } from "../../api/shiftSwapsApi";
import { getTemperatureScheduleGrid } from "../../api/temperatureLogsApi";
import { listShiftCloseCandidates } from "../../api/shiftsApi";
import { listBusinessDays } from "../../api/businessDaysApi";
import { formatDateValue } from "../../components/DateTimeField";
import { ScreenContainer } from "../../components/ScreenContainer";
import { GetStartedCard } from "../../components/GetStartedCard";
import { EmptyState } from "../../components/EmptyState";
import { SetupAssistant } from "../../components/SetupAssistant";
import { SubscriptionBanner } from "../subscription/SubscriptionBanner";
import { useAuth } from "../../auth/AuthContext";
import { useBestEntry } from "../../navigation/BestEntryContext";
import { useEntitlements } from "../subscription/useEntitlements";
import { MainStackParamList } from "../../types/navigation";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";

type OperationOption = {
  key: "scratchCard" | "scratchCardGames" | "temperature" | "refusals" | "checklist" | "compliance" | "visitors" | "shifts" | "till";
  title: string;
  route: keyof MainStackParamList;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  iconBg: string;
  operation?: "scratchCard" | "temperature" | "refusals" | "checklist" | "compliance";
  /** Top-level module key. Tile hides if the shop's plan does not include it OR the owner
   *  has toggled it off in Feature Toggles. */
  requiredFeature?: string;
};

const operationOptions: OperationOption[] = [

  {
    key: "scratchCard",
    title: "Day Management",
    route: "Dashboard",
    icon: "albums-outline",
    iconColor: appTheme.colors.primary,
    iconBg: appTheme.colors.surfaceBrandMuted,
    operation: "scratchCard",
    requiredFeature: "ScratchCardManagement",
  },
  {
    key: "scratchCardGames",
    title: "Scratch Card",
    route: "DailySalesReport",
    icon: "ticket-outline",
    iconColor: appTheme.colors.primary,
    iconBg: appTheme.colors.surfaceBrandMuted,
    requiredFeature: "ScratchCardManagement",
  },
  {
    key: "temperature",
    title: "Temperature Log",
    route: "TemperatureLogs",
    icon: "thermometer-outline",
    iconColor: appTheme.colors.info,
    iconBg: appTheme.colors.surfaceInfoMuted,
    operation: "temperature",
    requiredFeature: "TemperatureLog",
  },
  {
    key: "till",
    title: "Till Report",
    route: "TillReconciliation",
    icon: "receipt-outline",
    iconColor: appTheme.colors.primary,
    iconBg: appTheme.colors.surfaceBrandMuted,
    requiredFeature: "StoreSales",
  },
  {
    key: "refusals",
    title: "Refusal Log",
    route: "RefusalRegister",
    icon: "shield-checkmark-outline",
    iconColor: appTheme.colors.warning,
    iconBg: appTheme.colors.surfaceWarningSoft,
    operation: "refusals",
    requiredFeature: "RefusalNoIdNoSale",
  },
  {
    key: "compliance",
    title: "Compliance Checks",
    route: "ComplianceChecks",
    icon: "clipboard-outline",
    iconColor: appTheme.colors.warning,
    iconBg: appTheme.colors.surfaceWarningSoft,
    operation: "compliance",
    requiredFeature: "ComplianceChecklist",
  },
  {
    key: "visitors",
    title: "Visitors Log",
    // Land on the daily register so existing visits are visible at a glance.
    // The register has a "Sign in visitor" primary button for the next-action path.
    route: "VisitorLog",
    icon: "people-outline",
    iconColor: appTheme.colors.info,
    iconBg: appTheme.colors.surfaceInfoMuted,
  },
  {
    key: "shifts",
    title: "My Shifts",
    route: "MyShifts",
    icon: "time-outline",
    iconColor: appTheme.colors.info,
    iconBg: appTheme.colors.surfaceInfoMuted,
    requiredFeature: "StaffRota",
  }
];

export function BestEntryScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { selectedOperation, setSelectedOperation } = useBestEntry();
  const { entitlements } = useEntitlements();
  const { profile, activeShop, activeShopId, setActiveShop } = useAuth();
  const features = entitlements?.features ?? [];
  // Managers / owners manage the rota; everyone else lands on their own shifts.
  const roles = profile?.roles ?? [];
  const canManageRota = roles.some((r) => r === "CompanyOwner" || r === "Manager" || r === "PlatformAdmin");
  const visibleOptions = operationOptions
    .filter((o) => !o.requiredFeature || features.includes(o.requiredFeature))
    .map((o) =>
      o.key === "shifts" && canManageRota
        ? { ...o, title: "Shift Rota", route: "RotaManage" as keyof MainStackParamList }
        : o
    );

  const shops = profile?.shops ?? [];
  const canSwitchShop = shops.length > 1;
  const [switchOpen, setSwitchOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const firstName = profile?.firstName || profile?.displayName?.split(" ")[0] || "there";

  // "Needs attention" signals — things waiting on the user, surfaced at the top with one-tap links.
  const qc = useQueryClient();
  const approvalsQ = useQuery({
    queryKey: ["home-approvals", activeShopId],
    queryFn: () => getPendingApprovals(activeShopId as string),
    enabled: !!activeShopId && canManageRota && features.includes("staff_rota.manual_approval"),
  });
  const swapsQ = useQuery({
    queryKey: ["home-swaps", activeShopId],
    queryFn: () => listShiftSwaps(activeShopId as string),
    enabled: !!activeShopId && features.includes("staff_rota.shift_swap"),
  });
  const today = formatDateValue(new Date());
  const tempGridQ = useQuery({
    queryKey: ["home-temp", activeShopId, today],
    queryFn: () => getTemperatureScheduleGrid({ shopId: activeShopId as string, from: today, to: today }),
    enabled: !!activeShopId && features.includes("TemperatureLog"),
  });
  const closeQ = useQuery({
    queryKey: ["home-close", activeShopId],
    queryFn: () => listShiftCloseCandidates(activeShopId as string),
    enabled: !!activeShopId && features.includes("ScratchCardManagement"),
  });
  const bizDayQ = useQuery({
    queryKey: ["home-bizday", activeShopId, today],
    queryFn: () => listBusinessDays(activeShopId as string, { from: today, to: today }),
    enabled: !!activeShopId && features.includes("ScratchCardManagement"),
  });

  const approvalsCount = approvalsQ.data?.length ?? 0;
  const swapsCount = (swapsQ.data ?? []).filter((s) => s.status === "Pending" && s.canRespond).length;
  const tempMissed = (tempGridQ.data?.cells ?? []).filter((c) => c.state === "Missed").length;
  const dayNotStarted = bizDayQ.isSuccess && (bizDayQ.data?.length ?? 0) === 0;

  // Only prompt to close a shift near its end: within 10 min before, and "overdue" >5 min after.
  // Shifts without a scheduled end aren't nagged (minsTo → Infinity).
  const nowMs = Date.now();
  const minsTo = (iso?: string) => (iso ? (new Date(iso).getTime() - nowMs) / 60000 : Infinity);
  const dueClose = (closeQ.data ?? []).filter((c) => minsTo(c.endTime) <= 10);
  const dueCloseCount = dueClose.length;
  const closeSevere = dueClose.some((c) => minsTo(c.endTime) < -5);

  const badgeByKey: Record<string, number> = {
    shifts: approvalsCount + swapsCount,
    temperature: tempMissed,
    scratchCard: dueCloseCount,
  };

  useFocusEffect(
    useCallback(() => {
      if (!activeShopId) return;
      ["home-approvals", "home-swaps", "home-temp", "home-close", "home-bizday"].forEach((k) =>
        qc.invalidateQueries({ queryKey: [k, activeShopId] }),
      );
    }, [qc, activeShopId]),
  );

  const attention: { key: string; label: string; route: keyof MainStackParamList; icon: keyof typeof Ionicons.glyphMap; count?: number; severe?: boolean }[] = [
    dayNotStarted ? { key: "bizday", label: "Start today's business day", route: "BusinessDay", icon: "sunny-outline" } : null,
    dueCloseCount > 0 ? { key: "close", label: `${dueCloseCount} ${dueCloseCount === 1 ? "shift" : "shifts"} ${closeSevere ? "overdue to close" : "ready to close"}`, route: "CloseShift", icon: "stop-outline", count: dueCloseCount, severe: closeSevere } : null,
    tempMissed > 0 ? { key: "temp", label: `${tempMissed} temperature ${tempMissed === 1 ? "check" : "checks"} overdue`, route: "TemperatureLogs", icon: "thermometer-outline", count: tempMissed, severe: true } : null,
    approvalsCount > 0 ? { key: "approvals", label: `${approvalsCount} time ${approvalsCount === 1 ? "entry" : "entries"} to approve`, route: "RotaApprovals", icon: "checkmark-done-outline", count: approvalsCount } : null,
    swapsCount > 0 ? { key: "swaps", label: `${swapsCount} shift ${swapsCount === 1 ? "swap" : "swaps"} to respond`, route: "ShiftSwaps", icon: "swap-horizontal-outline", count: swapsCount } : null,
  ].filter(Boolean) as any;

  const chooseShop = async (shopId: string) => {
    setSwitchOpen(false);
    if (shopId !== activeShopId) {
      try {
        await setActiveShop(shopId);
      } catch {
        // setActiveShop guards membership; ignore failures.
      }
    }
  };

  return (
    <ScreenContainer>
      <SubscriptionBanner />

      {/* Greeting header */}
      <View style={styles.header}>
        <Text style={styles.greeting}>{greeting},</Text>
        <Text style={styles.name} numberOfLines={1}>{firstName} 👋</Text>
      </View>

      {/* Active shop — tappable to switch when the user belongs to more than one shop. */}
      <Pressable
        style={[ui.card, styles.shopChip]}
        onPress={() => canSwitchShop && setSwitchOpen(true)}
        disabled={!canSwitchShop}
        accessibilityRole="button"
        accessibilityLabel="Active shop. Tap to switch."
      >
        <View style={styles.shopChipIcon}>
          <Ionicons name="storefront-outline" size={18} color={appTheme.colors.primary} />
        </View>
        <View style={styles.shopChipText}>
          <Text style={styles.shopChipLabel}>Active shop</Text>
          <Text style={styles.shopChipName} numberOfLines={1}>{activeShop?.shopName ?? "No shop selected"}</Text>
        </View>
        {canSwitchShop ? (
          <View style={styles.switchPill}>
            <Ionicons name="swap-horizontal" size={14} color={appTheme.colors.primary} />
            <Text style={styles.switchPillText}>Switch</Text>
          </View>
        ) : null}
      </Pressable>

      {attention.length > 0 ? (
        <View style={[ui.card, styles.attentionCard]}>
          <View style={styles.attentionHeader}>
            <Ionicons name="alert-circle" size={18} color={appTheme.colors.warning} />
            <Text style={styles.attentionTitle}>Needs your attention</Text>
          </View>
          {attention.map((a) => (
            <Pressable key={a.key} style={styles.attentionRow} onPress={() => navigation.navigate(a.route as never)}>
              {a.count ? (
                <View style={[styles.attentionBadge, a.severe ? styles.attentionBadgeSevere : null]}><Text style={styles.attentionBadgeText}>{a.count}</Text></View>
              ) : (
                <View style={[styles.attentionDot, a.severe ? styles.attentionDotSevere : null]} />
              )}
              <Ionicons name={a.icon} size={18} color={a.severe ? appTheme.colors.danger : appTheme.colors.text} />
              <Text style={[styles.attentionLabel, a.severe ? styles.attentionLabelSevere : null]}>{a.label}</Text>
              <Ionicons name="chevron-forward" size={16} color={appTheme.colors.textSubtle} />
            </Pressable>
          ))}
        </View>
      ) : null}

      {canManageRota && activeShopId ? (
        <GetStartedCard shopId={activeShopId} features={features} onGo={(route) => navigation.navigate(route as never)} />
      ) : null}

      <Pressable style={styles.askBar} onPress={() => setAssistantOpen(true)}>
        <Ionicons name="search" size={18} color={appTheme.colors.textSubtle} />
        <Text style={styles.askBarText}>Set something up… ask in your own words</Text>
      </Pressable>

      {visibleOptions.length === 0 ? (
        <EmptyState
          icon="grid-outline"
          title="No features enabled yet"
          message={canManageRota
            ? "This shop has no active modules. Choose a plan or contact support to enable features."
            : "Your manager hasn't enabled any features for you yet. Check back soon."}
        />
      ) : (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Quick actions</Text>
          <View style={styles.featureGrid}>
            {visibleOptions.map((option) => {
              const selected = option.operation ? selectedOperation === option.operation : false;
              return (
                <Pressable
                  key={option.key}
                  style={[ui.card, styles.featureTile, selected ? styles.featureTileSelected : null]}
                  onPress={() => {
                    if (option.operation) {
                      setSelectedOperation(option.operation);
                    }
                    navigation.navigate(option.route as never);
                  }}
                >
                  <View style={[styles.featureIcon, { backgroundColor: option.iconBg }]}>
                    <Ionicons name={option.icon} size={24} color={option.iconColor} />
                  </View>
                  {(badgeByKey[option.key] ?? 0) > 0 ? (
                    <View style={styles.tileBadge}><Text style={styles.tileBadgeText}>{badgeByKey[option.key]}</Text></View>
                  ) : null}
                  <Text style={styles.featureTitle}>{option.title}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      <Modal visible={switchOpen} transparent animationType="fade" onRequestClose={() => setSwitchOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setSwitchOpen(false)}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Switch shop</Text>
            {shops.map((shop) => {
              const active = shop.shopId === activeShopId;
              return (
                <Pressable key={shop.shopId} style={styles.shopRow} onPress={() => chooseShop(shop.shopId)}>
                  <Text style={[styles.shopRowText, active ? styles.shopRowTextActive : null]} numberOfLines={1}>
                    {shop.shopName}
                  </Text>
                  {active ? <Ionicons name="checkmark-circle" size={18} color={appTheme.colors.primary} /> : null}
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Modal>

      <SetupAssistant
        visible={assistantOpen}
        onClose={() => setAssistantOpen(false)}
        features={features}
        isManager={canManageRota}
        onGo={(route) => navigation.navigate(route as never)}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  attentionCard: {
    gap: 8,
    borderWidth: 1,
    borderColor: appTheme.colors.borderWarningSoft,
    backgroundColor: appTheme.colors.surfaceWarningSoft,
  },
  attentionHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  attentionTitle: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 14 },
  attentionRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: appTheme.colors.borderWarningSoft },
  attentionBadge: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, alignItems: "center", justifyContent: "center", backgroundColor: appTheme.colors.warning },
  attentionBadgeSevere: { backgroundColor: appTheme.colors.danger },
  attentionDot: { width: 8, height: 8, borderRadius: 4, marginHorizontal: 7, backgroundColor: appTheme.colors.warning },
  attentionDotSevere: { backgroundColor: appTheme.colors.danger },
  attentionLabelSevere: { color: appTheme.colors.danger, fontFamily: appTheme.fonts.bodyMedium },
  attentionBadgeText: { color: "#FFFFFF", fontFamily: appTheme.fonts.bodyMedium, fontSize: 12 },
  attentionLabel: { flex: 1, color: appTheme.colors.text, fontFamily: appTheme.fonts.body, fontSize: 14 },
  tileBadge: {
    position: "absolute",
    top: 10,
    right: 10,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: appTheme.colors.danger,
  },
  tileBadgeText: { color: "#FFFFFF", fontFamily: appTheme.fonts.bodyMedium, fontSize: 12 },
  header: {
    gap: 2,
  },
  greeting: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.body,
    fontSize: 15,
  },
  name: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.heading,
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.3,
  },
  shopChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
  },
  shopChipIcon: {
    width: 40,
    height: 40,
    borderRadius: appTheme.radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: appTheme.colors.surfaceBrandSoft,
  },
  shopChipText: { flex: 1, gap: 2 },
  shopChipLabel: {
    color: appTheme.colors.textSubtle,
    fontFamily: appTheme.fonts.body,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  shopChipName: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 16, lineHeight: 20 },
  switchPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: appTheme.radius.pill,
    backgroundColor: appTheme.colors.surfaceBrandSoft,
  },
  switchPillText: { color: appTheme.colors.primary, fontFamily: appTheme.fonts.bodyMedium, fontSize: 13 },
  askBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: appTheme.radius.pill,
    backgroundColor: appTheme.colors.surface,
    borderWidth: 1,
    borderColor: appTheme.colors.borderSoft,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  askBarText: {
    color: appTheme.colors.textSubtle,
    fontFamily: appTheme.fonts.body,
    fontSize: 14,
  },
  section: { gap: appTheme.spacing.sm },
  sectionLabel: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 13,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    backgroundColor: appTheme.colors.surface,
    borderRadius: appTheme.radius.md,
    padding: 16,
    gap: 4,
  },
  modalTitle: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 16,
    lineHeight: 20,
    marginBottom: 6,
  },
  shopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: appTheme.colors.borderSoft,
  },
  shopRowText: { flex: 1, color: appTheme.colors.text, fontFamily: appTheme.fonts.body, fontSize: 15 },
  shopRowTextActive: { color: appTheme.colors.primary, fontFamily: appTheme.fonts.bodyMedium },
  featureGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  featureTile: {
    width: "48%",
    minHeight: 104,
    borderRadius: appTheme.radius.md,
    padding: appTheme.spacing.md,
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  featureTileSelected: {
    backgroundColor: appTheme.colors.surfaceBrandMuted,
    borderWidth: 1,
    borderColor: appTheme.colors.borderBrandSoft,
  },
  featureIcon: {
    width: 48,
    height: 48,
    borderRadius: appTheme.radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  featureTitle: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 15,
    lineHeight: 19,
  },
});


