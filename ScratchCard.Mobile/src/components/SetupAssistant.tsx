import React, { useMemo, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
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
  category: string;
  feature?: string;   // hide unless this entitlement is present
  manager?: boolean;  // hide for non-managers
};

// Ordered categories for the directory (empty-query) view.
const CATEGORIES = [
  "Daily operations",
  "Staff & rota",
  "Temperature",
  "Till & store sales",
  "Scratch cards",
  "Compliance & safety",
  "Reports",
  "Settings & admin",
];

// Everything you can set up / open in the system — matched against the user's own words.
const TASKS: Task[] = [
  // Daily operations
  { category: "Daily operations", title: "Start the business day", instruction: "Open trading for the day", route: "BusinessDay", icon: "sunny-outline", keywords: "business day open start trading begin" },
  { category: "Daily operations", title: "Open a shift", instruction: "Start a new shift", route: "OpenShift", icon: "play-outline", keywords: "open shift start begin clock" },
  { category: "Daily operations", title: "Close a shift", instruction: "Cash up and close a shift", route: "CloseShift", icon: "stop-outline", keywords: "close shift end cash up finish" },
  { category: "Daily operations", title: "Day management", instruction: "Scratch card day overview", route: "Dashboard", icon: "albums-outline", keywords: "day management dashboard overview scratch", feature: "ScratchCardManagement" },
  { category: "Daily operations", title: "Record a delivery", instruction: "Receive incoming stock", route: "ReceiveDelivery", icon: "cube-outline", keywords: "delivery receive stock goods supplier order incoming" },
  { category: "Daily operations", title: "Deliveries", instruction: "View stock deliveries", route: "Deliveries", icon: "cube-outline", keywords: "delivery deliveries stock goods supplier" },

  // Staff & rota
  { category: "Staff & rota", title: "Set up shifts / rota", instruction: "Create shift templates and build the rota", route: "RotaManage", icon: "calendar-number-outline", keywords: "shift rota schedule roster shifts hours plan week template", feature: "StaffRota" },
  { category: "Staff & rota", title: "Add staff", instruction: "Add roster-only / external staff", route: "RotaStaffMembers", icon: "people-outline", keywords: "staff member employee worker add external team people hire", feature: "StaffRota" },
  { category: "Staff & rota", title: "My shifts", instruction: "Your upcoming shifts, clock in/out", route: "MyShifts", icon: "time-outline", keywords: "my shift clock in out attendance upcoming mine", feature: "StaffRota" },
  { category: "Staff & rota", title: "Swap a shift", instruction: "Request a shift swap or give-away", route: "ShiftSwaps", icon: "swap-horizontal-outline", keywords: "swap shift give away cover trade exchange change", feature: "staff_rota.shift_swap" },
  { category: "Staff & rota", title: "Time approvals", instruction: "Approve manual time entries", route: "RotaApprovals", icon: "checkmark-done-outline", keywords: "time approval approve hours manual entry timesheet", feature: "staff_rota.manual_approval", manager: true },
  { category: "Staff & rota", title: "Timesheets", instruction: "Hours worked & labour cost", route: "RotaTimesheet", icon: "documents-outline", keywords: "timesheet hours worked labour cost wages pay", feature: "StaffRota", manager: true },

  // Temperature
  { category: "Temperature", title: "Add temperature units", instruction: "Add fridges/freezers to monitor", route: "TemperatureUnits", icon: "thermometer-outline", keywords: "temperature unit fridge freezer appliance equipment add", feature: "TemperatureLog" },
  { category: "Temperature", title: "Set temperature check times", instruction: "Schedule checks + tolerance", route: "TemperatureSchedules", icon: "time-outline", keywords: "temperature fridge freezer check schedule time tolerance cold chain", feature: "TemperatureLog" },
  { category: "Temperature", title: "Record a temperature", instruction: "Log today's readings", route: "TemperatureLogs", icon: "thermometer-outline", keywords: "temperature record log reading enter today", feature: "TemperatureLog" },
  { category: "Temperature", title: "Temperature report", instruction: "Review past readings", route: "TemperatureLogsReport", icon: "stats-chart-outline", keywords: "temperature report history readings review", feature: "TemperatureLog" },

  // Till & store sales
  { category: "Till & store sales", title: "Add a till", instruction: "Set up tills for reconciliation", route: "TillsConfig", icon: "calculator-outline", keywords: "till cash register pos drawer store sales add", feature: "StoreSales" },
  { category: "Till & store sales", title: "Add payment types", instruction: "Configure how customers pay", route: "PaymentTypesConfig", icon: "card-outline", keywords: "payment type card cash method tender pay", feature: "StoreSales" },
  { category: "Till & store sales", title: "Till reconciliation", instruction: "Reconcile the till, import reports", route: "TillReconciliation", icon: "receipt-outline", keywords: "till report reconcile reconciliation cash count variance import", feature: "StoreSales" },
  { category: "Till & store sales", title: "Till report history", instruction: "Past till reports", route: "TillReportHistory", icon: "time-outline", keywords: "till report history past previous", feature: "StoreSales" },
  { category: "Till & store sales", title: "Store sales report", instruction: "Sales by shift / day", route: "StoreSales", icon: "stats-chart-outline", keywords: "store sales report shift day revenue", feature: "StoreSales" },

  // Scratch cards
  { category: "Scratch cards", title: "Scratch card games", instruction: "Set up the games you sell", route: "ScratchCardGames", icon: "ticket-outline", keywords: "scratch card game master setup add lottery", feature: "ScratchCardManagement" },
  { category: "Scratch cards", title: "Scratch card packs", instruction: "Manage activated packs", route: "ScratchCardPacks", icon: "albums-outline", keywords: "scratch card pack activate manage book", feature: "ScratchCardManagement" },
  { category: "Scratch cards", title: "Scratch card sales", instruction: "Record & report sales", route: "DailySalesReport", icon: "ticket-outline", keywords: "scratch card lottery sales game daily report", feature: "ScratchCardManagement" },
  { category: "Scratch cards", title: "Stock report", instruction: "Scratch card stock on hand", route: "StockReport", icon: "cube-outline", keywords: "stock report scratch card inventory on hand", feature: "ScratchCardManagement" },

  // Compliance & safety
  { category: "Compliance & safety", title: "Compliance checks", instruction: "Complete compliance checklists", route: "ComplianceChecks", icon: "clipboard-outline", keywords: "compliance check checklist due diligence audit safety", feature: "ComplianceChecklist" },
  { category: "Compliance & safety", title: "Set up compliance", instruction: "Configure compliance items", route: "ComplianceConfig", icon: "construct-outline", keywords: "compliance setup configure items rules", feature: "ComplianceChecklist", manager: true },
  { category: "Compliance & safety", title: "Daily checklist", instruction: "Complete the shop checklist", route: "ShopChecklist", icon: "checkbox-outline", keywords: "checklist daily tasks open close shop" },
  { category: "Compliance & safety", title: "Set up checklist", instruction: "Configure checklist items", route: "ChecklistConfiguration", icon: "construct-outline", keywords: "checklist setup configure items tasks", manager: true },
  { category: "Compliance & safety", title: "Refusals log", instruction: "Record a refused sale (no ID)", route: "RefusalRegister", icon: "shield-checkmark-outline", keywords: "refusal refuse no id challenge 25 sale underage", feature: "RefusalNoIdNoSale" },
  { category: "Compliance & safety", title: "Visitors log", instruction: "Sign in visitors / inspectors", route: "VisitorLog", icon: "people-outline", keywords: "visitor inspector sign in log book guest", feature: "VisitorsLog" },

  // Reports
  { category: "Reports", title: "Shift sales report", instruction: "Sales by shift", route: "ShiftSalesReport", icon: "stats-chart-outline", keywords: "shift sales report revenue" },
  { category: "Reports", title: "Refusal report", instruction: "Refusals over a period", route: "RefusalReport", icon: "stats-chart-outline", keywords: "refusal report history period", feature: "RefusalNoIdNoSale" },
  { category: "Reports", title: "Visitor report", instruction: "Visitors over a period", route: "VisitorLogReport", icon: "stats-chart-outline", keywords: "visitor report history period", feature: "VisitorsLog" },
  { category: "Reports", title: "Audit log", instruction: "Who changed what", route: "AuditLog", icon: "list-outline", keywords: "audit log history changes activity trail", manager: true },
  { category: "Reports", title: "Notification log", instruction: "Sent alerts & messages", route: "NotificationLog", icon: "notifications-outline", keywords: "notification log alerts messages sent history" },

  // Settings & admin
  { category: "Settings & admin", title: "Settings", instruction: "App, account & subscription", route: "Settings", icon: "settings-outline", keywords: "settings account subscription plan billing preferences app theme" },
  { category: "Settings & admin", title: "Notification preferences", instruction: "Choose which alerts you get", route: "NotificationPreferences", icon: "notifications-outline", keywords: "notification preferences alerts email whatsapp push settings" },
  { category: "Settings & admin", title: "Shop configuration", instruction: "Shifts, business day, packs…", route: "ShopConfiguration", icon: "construct-outline", keywords: "shop configuration config settings shift business day packs setup master data", manager: true },
  { category: "Settings & admin", title: "Feature toggles", instruction: "Turn shop modules on/off", route: "ShopFeatureToggles", icon: "toggle-outline", keywords: "feature toggle module enable disable on off", manager: true },
  { category: "Settings & admin", title: "App configuration", instruction: "Global app/master data", route: "AppConfiguration", icon: "construct-outline", keywords: "app configuration global master data admin defaults", manager: true },
  { category: "Settings & admin", title: "Create or edit a shop", instruction: "Add a new shop or edit details", route: "ShopManagement", icon: "storefront-outline", keywords: "shop create add new store branch edit setup location", manager: true },
  { category: "Settings & admin", title: "Company management", instruction: "Manage companies", route: "CompanyManagement", icon: "business-outline", keywords: "company management organisation business group", manager: true },
  { category: "Settings & admin", title: "Manage users", instruction: "Who can access this shop", route: "UserManagement", icon: "people-circle-outline", keywords: "user manage role permission access account staff login", manager: true },
  { category: "Settings & admin", title: "Invite a user", instruction: "Invite a manager/cashier by email", route: "UserInvitations", icon: "mail-outline", keywords: "invite user manager cashier email team account access add person", manager: true },
  { category: "Settings & admin", title: "Owner dashboard", instruction: "Cross-shop overview", route: "OwnerDashboard", icon: "grid-outline", keywords: "owner dashboard overview analytics cross shop", manager: true },
];

export function SetupAssistant({ visible, onClose, features, isManager, onGo }: {
  visible: boolean; onClose: () => void; features: string[]; isManager: boolean; onGo: (route: keyof MainStackParamList) => void;
}) {
  const [query, setQuery] = useState("");

  const available = useMemo(
    () => TASKS.filter((t) => (!t.feature || features.includes(t.feature)) && (!t.manager || isManager)),
    [features, isManager],
  );

  const results = useMemo(() => {
    const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 1);
    if (terms.length === 0) return null; // null = show grouped directory
    return available
      .map((t) => {
        const hay = `${t.title} ${t.keywords} ${t.category}`.toLowerCase();
        const score = terms.reduce((n, term) => (hay.includes(term) ? n + 1 : n), 0);
        return { t, score };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((r) => r.t);
  }, [query, available]);

  const renderRow = (t: Task) => (
    <Pressable key={t.route + t.title} style={styles.row} onPress={() => { onClose(); onGo(t.route); }}>
      <View style={styles.rowIcon}><Ionicons name={t.icon} size={20} color={appTheme.colors.primary} /></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{t.title}</Text>
        <Text style={styles.rowInstruction}>{t.instruction}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={appTheme.colors.textSubtle} />
    </Pressable>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
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
              placeholder="e.g. add a till, fridge check times, invite staff…"
              placeholderTextColor={appTheme.colors.textSubtle}
              autoFocus
            />
            {query ? <Pressable onPress={() => setQuery("")} hitSlop={8}><Ionicons name="close-circle" size={18} color={appTheme.colors.textSubtle} /></Pressable> : null}
          </View>

          <ScrollView style={{ maxHeight: 440 }} keyboardShouldPersistTaps="handled">
            {results === null ? (
              // Directory view — grouped by category
              CATEGORIES.map((cat) => {
                const items = available.filter((t) => t.category === cat);
                if (items.length === 0) return null;
                return (
                  <View key={cat} style={styles.group}>
                    <Text style={styles.groupTitle}>{cat}</Text>
                    {items.map(renderRow)}
                  </View>
                );
              })
            ) : results.length === 0 ? (
              <Text style={styles.empty}>No matches — try words like “till”, “temperature”, “shift”, “staff”, “report”, or “settings”.</Text>
            ) : (
              results.map(renderRow)
            )}
          </ScrollView>
        </View>
      </View>
      </KeyboardAvoidingView>
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
  group: { marginTop: 6 },
  groupTitle: { color: appTheme.colors.textSubtle, fontFamily: appTheme.fonts.bodyMedium, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2, marginTop: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: appTheme.colors.borderSoft },
  rowIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: appTheme.colors.surfaceBrandMuted },
  rowTitle: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 15 },
  rowInstruction: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 12, marginTop: 1 },
});
