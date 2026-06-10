import React, { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { appTheme } from "../ui/theme";
import { ui } from "../ui/primitives";
import { MainStackParamList } from "../types/navigation";

type Task = {
  title: string;
  instruction: string;
  route: keyof MainStackParamList;
  keywords: string;
  icon: keyof typeof Ionicons.glyphMap;
  feature?: string;
};

// A small catalogue of "things you can set up / do", matched against the user's own words.
const TASKS: Task[] = [
  { title: "Add a till", instruction: "Set up tills for reconciliation & store sales", route: "TillsConfig", icon: "calculator-outline", keywords: "till cash register pos drawer store sales", feature: "StoreSales" },
  { title: "Add payment types", instruction: "Configure how customers pay (card, cash…)", route: "PaymentTypesConfig", icon: "card-outline", keywords: "payment type card cash method tender pay", feature: "StoreSales" },
  { title: "Till report / reconciliation", instruction: "Reconcile the till, import reports", route: "TillReconciliation", icon: "receipt-outline", keywords: "till report reconcile reconciliation cash count variance import", feature: "StoreSales" },
  { title: "Set temperature check times", instruction: "Schedule fridge/freezer checks + tolerance", route: "TemperatureSchedules", icon: "time-outline", keywords: "temperature fridge freezer check schedule time tolerance cold chain", feature: "TemperatureLog" },
  { title: "Add temperature units", instruction: "Add the fridges/freezers you monitor", route: "TemperatureUnits", icon: "thermometer-outline", keywords: "temperature unit fridge freezer appliance equipment", feature: "TemperatureLog" },
  { title: "Record a temperature", instruction: "Log today's temperature readings", route: "TemperatureLogs", icon: "thermometer-outline", keywords: "temperature record log reading enter today", feature: "TemperatureLog" },
  { title: "Set up shifts / rota", instruction: "Create shift templates and build the rota", route: "RotaManage", icon: "calendar-number-outline", keywords: "shift rota schedule roster shifts hours plan week", feature: "StaffRota" },
  { title: "Add staff", instruction: "Add roster-only / external staff members", route: "RotaStaffMembers", icon: "people-outline", keywords: "staff member employee worker add external team people", feature: "StaffRota" },
  { title: "My shifts", instruction: "See upcoming shifts, clock in / out", route: "MyShifts", icon: "time-outline", keywords: "my shift clock in out attendance upcoming", feature: "StaffRota" },
  { title: "Swap a shift", instruction: "Request a shift swap or give it away", route: "ShiftSwaps", icon: "swap-horizontal-outline", keywords: "swap shift give away cover trade exchange change", feature: "staff_rota.shift_swap" },
  { title: "Invite a user", instruction: "Invite a manager/cashier by email", route: "UserInvitations", icon: "mail-outline", keywords: "invite user manager cashier email team account access add person" },
  { title: "Manage users", instruction: "Manage who can access this shop", route: "UserManagement", icon: "people-circle-outline", keywords: "user manage role permission access account staff login" },
  { title: "Create or edit a shop", instruction: "Add a new shop or edit shop details", route: "ShopManagement", icon: "storefront-outline", keywords: "shop create add new store branch edit setup location" },
  { title: "Scratch card sales", instruction: "Record & report scratch card sales", route: "DailySalesReport", icon: "ticket-outline", keywords: "scratch card lottery sales game pack ticket", feature: "ScratchCardManagement" },
  { title: "Compliance checks", instruction: "Complete compliance checklists", route: "ComplianceChecks", icon: "clipboard-outline", keywords: "compliance check checklist due diligence audit", feature: "ComplianceChecklist" },
  { title: "Refusals log", instruction: "Record a refused sale (no ID, no sale)", route: "RefusalRegister", icon: "shield-checkmark-outline", keywords: "refusal refuse no id challenge 25 sale underage", feature: "RefusalNoIdNoSale" },
  { title: "Visitors log", instruction: "Sign in visitors / inspectors", route: "VisitorLog", icon: "people-outline", keywords: "visitor inspector sign in log book guest", feature: "VisitorsLog" },
  { title: "Deliveries", instruction: "Record stock deliveries", route: "Deliveries", icon: "cube-outline", keywords: "delivery stock goods received supplier order" },
];

export function SetupAssistant({ visible, onClose, features, onGo }: {
  visible: boolean; onClose: () => void; features: string[]; onGo: (route: keyof MainStackParamList) => void;
}) {
  const [query, setQuery] = useState("");

  const available = useMemo(() => TASKS.filter((t) => !t.feature || features.includes(t.feature)), [features]);
  const results = useMemo(() => {
    const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 1);
    if (terms.length === 0) return available;
    return available
      .map((t) => {
        const hay = `${t.title} ${t.keywords}`.toLowerCase();
        const score = terms.reduce((n, term) => (hay.includes(term) ? n + 1 : n), 0);
        return { t, score };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((r) => r.t);
  }, [query, available]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={ui.sectionTitle}>What do you want to set up?</Text>
            <Pressable onPress={onClose} hitSlop={8}><Ionicons name="close" size={22} color={appTheme.colors.text} /></Pressable>
          </View>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={18} color={appTheme.colors.textSubtle} />
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="e.g. how do I add a till, set fridge check times…"
              placeholderTextColor={appTheme.colors.textSubtle}
              autoFocus
            />
            {query ? <Pressable onPress={() => setQuery("")} hitSlop={8}><Ionicons name="close-circle" size={18} color={appTheme.colors.textSubtle} /></Pressable> : null}
          </View>

          <ScrollView style={{ maxHeight: 380 }} keyboardShouldPersistTaps="handled">
            {results.length === 0 ? (
              <Text style={styles.empty}>No matches — try different words like “till”, “temperature”, “shift”, or “staff”.</Text>
            ) : results.map((t) => (
              <Pressable key={t.route + t.title} style={styles.row} onPress={() => { onClose(); onGo(t.route); }}>
                <View style={styles.rowIcon}><Ionicons name={t.icon} size={20} color={appTheme.colors.primary} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{t.title}</Text>
                  <Text style={styles.rowInstruction}>{t.instruction}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={appTheme.colors.textSubtle} />
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: appTheme.colors.overlay, justifyContent: "flex-end" },
  sheet: { backgroundColor: appTheme.colors.background, borderTopLeftRadius: appTheme.radius.lg, borderTopRightRadius: appTheme.radius.lg, padding: appTheme.spacing.md, gap: 10 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  searchBox: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: appTheme.colors.border, borderRadius: appTheme.radius.sm, backgroundColor: appTheme.colors.surfaceMuted, paddingHorizontal: 12, paddingVertical: 10 },
  searchInput: { flex: 1, color: appTheme.colors.text, fontFamily: appTheme.fonts.body, fontSize: 15, padding: 0 },
  empty: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 14, padding: 16, textAlign: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: appTheme.colors.borderSoft },
  rowIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: appTheme.colors.surfaceBrandMuted },
  rowTitle: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 15 },
  rowInstruction: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 12, marginTop: 1 },
});
