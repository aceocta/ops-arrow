import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Image, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { DrawerActions, NavigatorScreenParams } from "@react-navigation/native";
import { createDrawerNavigator, DrawerContentScrollView, type DrawerContentComponentProps } from "@react-navigation/drawer";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../auth/AuthContext";
import { getMyTimesheetReviews, getPendingApprovals } from "../api/rotaApi";
import { NetworkStatusBanner } from "../components/NetworkStatusBanner";
import { DashboardScreen } from "../features/dashboard/DashboardScreen";
import { BestEntryScreen } from "../features/entry/BestEntryScreen";
import { OwnerOverviewScreen } from "../features/dashboard/OwnerOverviewScreen";
import { MyShiftsScreen, MyTimesheetScreen, RotaManageScreen, RotaTimesheetScreen, RotaApprovalsScreen, RotaStaffMembersScreen } from "../features/rota/RotaScreens";
import { LeaveManagementScreen, MyLeaveScreen, RecordLeaveScreen } from "../features/rota/LeaveScreens";
import { ShiftSwapsScreen } from "../features/rota/ShiftSwapsScreen";
import { UserInvitationsScreen } from "../features/invitations/UserInvitationsScreen";
import { DeliveriesScreen } from "../features/deliveries/DeliveriesScreen";
import { ReceiveDeliveryScreen } from "../features/deliveries/ReceiveDeliveryScreen";
import { TemperatureLogScreen } from "../features/temperature/TemperatureLogScreen";
import { TemperatureLogsByDayScreen } from "../features/temperature/TemperatureLogsByDayScreen";
import { TemperatureLogsReportScreen } from "../features/temperature/TemperatureLogsReportScreen";
import { TemperatureUnitsScreen } from "../features/temperature/TemperatureUnitsScreen";
import { TemperatureUnitEditScreen } from "../features/temperature/TemperatureUnitEditScreen";
import { TemperatureSchedulesScreen } from "../features/temperature/TemperatureSchedulesScreen";
import { TemperatureScheduleGridScreen } from "../features/temperature/TemperatureScheduleGridScreen";
import { RefusalRegisterScreen } from "../features/refusals/RefusalRegisterScreen";
import { RefusalRegisterByDayScreen } from "../features/refusals/RefusalRegisterByDayScreen";
import { RefusalReportScreen } from "../features/refusals/RefusalReportScreen";
import { VisitorLogScreen } from "../features/visitors/VisitorLogScreen";
import { VisitorLogEntryEditScreen } from "../features/visitors/VisitorLogEntryEditScreen";
import { VisitorLogReportScreen } from "../features/visitors/VisitorLogReportScreen";
import { RefusalManagerReviewScreen } from "../features/refusals/RefusalManagerReviewScreen";
import { RefusalEntryDetailsScreen } from "../features/refusals/RefusalEntryDetailsScreen";
import { RefusalEntryEditScreen } from "../features/refusals/RefusalEntryEditScreen";
import { ChecklistConfigurationScreen, ChecklistHistoryScreen, ShopChecklistScreen } from "../features/checklists/ChecklistScreens";
import { ComplianceActionsScreen, ComplianceChecksConfigScreen, ComplianceChecksScreen } from "../features/compliance/ComplianceCheckScreens";
import {
  ScratchCardGamesScreen,
  ScratchCardGameCreateScreen,
  ScratchCardGameEditScreen,
  ScratchCardPacksScreen,
  ManualPackCreateScreen,
  PackDetailsScreen,
  ActivatePackScreen,
} from "../features/packs/PackScreens";
import { BusinessDayScreen } from "../features/business-days/BusinessDayScreen";
import { CloseShiftScreen, OpenShiftScreen, ShiftReconciliationScreen } from "../features/shifts/ShiftScreens";
import { ShiftDetailsScreen } from "../features/shifts/ShiftDetailsScreen";
import { EnterClosingNumbersScreen } from "../features/scratch-card/EnterClosingNumbersScreen";
import { PrizePayoutScreen } from "../features/prize-payouts/PrizePayoutScreen";
import { DayEndCloseScreen } from "../features/day-close/DayEndCloseScreen";
import {
  DailySalesReportScreen,
  ShiftSalesReportScreen,
  ManualClosingReviewScreen,
  StockReportScreen,
  AuditLogScreen,
  NotificationLogScreen,
} from "../features/reports/ReportScreens";
import { UserManagementScreen, ShopConfigurationScreen, AppConfigurationScreen, CompanyManagementScreen, ShopManagementScreen, SettingsScreen } from "../features/settings/SettingsScreens";
import { NotificationPreferencesScreen } from "../features/settings/NotificationPreferencesScreen";
import { ShopFeatureTogglesScreen } from "../features/settings/ShopFeatureTogglesScreen";
import { SafeDropScreen } from "../features/safe-drop/SafeDropScreen";
import { CaptureTillReportScreen } from "../features/store-sales/CaptureTillReportScreen";
import { TillReportReviewScreen } from "../features/store-sales/TillReportReviewScreen";
import { TillReportsListScreen } from "../features/store-sales/TillReportsListScreen";
import { TillReconciliationScreen } from "../features/till-reconciliation/TillReconciliationScreen";
import { TillPaymentSummaryScreen } from "../features/store-sales/TillPaymentSummaryScreen";
import { TillsConfigScreen } from "../features/store-sales/TillsConfigScreen";
import { PaymentTypesConfigScreen } from "../features/store-sales/PaymentTypesConfigScreen";
import { TillGroupsConfigScreen } from "../features/store-sales/TillGroupsConfigScreen";
import { TillLineReportScreen } from "../features/store-sales/TillLineReportScreen";
import { ScratchCardSummaryScreen } from "../features/scratch-card/ScratchCardSummaryScreen";
import { BestEntryProvider, EntryOperation, useBestEntry } from "./BestEntryContext";
import { confirmDestructive } from "../utils/confirm";
import { HelpProvider, useHelp } from "../help/HelpProvider";
import { useEntitlements } from "../features/subscription/useEntitlements";
import { MainStackParamList, RootStackParamList } from "../types/navigation";
import { appTheme } from "../ui/theme";
import { appInfo } from "../config/appInfo";
import { getRoleDisplayName } from "../utils/roleLabels";
import { useIsTablet } from "../utils/useIsTablet";

type MainDrawerParamList = {
  MainStack: NavigatorScreenParams<MainStackParamList> | undefined;
};

type MenuIcon = keyof typeof Ionicons.glyphMap;

type MenuItem = {
  label: string;
  screen: keyof MainStackParamList;
  icon: MenuIcon;
  shopOwnerOnly?: boolean;
  allowedRoles?: string[];
  mode?: EntryOperation;
  rootScreen?: keyof RootStackParamList;
  /** Optional feature gate. If set, the item is only visible when the active shop's
   *  subscription includes this feature key (e.g. "audit_log.basic"). */
  requiredFeature?: string;
};

type DrawerSectionKey = "scratchCard" | "temperature" | "refusals" | "visitors" | "compliance" | "shifts" | "till" | "shop" | "admin";

const Drawer = createDrawerNavigator<MainDrawerParamList>();
const Stack = createNativeStackNavigator<MainStackParamList>();

// Menu is now organised by feature module. Each item keeps its own `requiredFeature` so the
// usual plan/shop-toggle gate still applies — but items are no longer hidden based on the
// active home-screen operation chip. Everything in scope shows under its feature group.

// --- Scratch Card ---
const scratchCardItems: MenuItem[] = [
  { label: "Daily Sales Report", screen: "DailySalesReport", icon: "stats-chart-outline", mode: "scratchCard", requiredFeature: "ScratchCardManagement" },
  { label: "Add Packs", screen: "ScratchCardPacks", icon: "ticket-outline", mode: "scratchCard", requiredFeature: "ScratchCardManagement" },
  { label: "Add Deliveries", screen: "Deliveries", icon: "cube-outline", mode: "scratchCard", requiredFeature: "ScratchCardManagement" },
  { label: "Card Games", screen: "ScratchCardGames", icon: "game-controller-outline", mode: "scratchCard", requiredFeature: "ScratchCardManagement" },
  { label: "Pack Stock", screen: "StockReport", icon: "archive-outline", mode: "scratchCard", requiredFeature: "ScratchCardManagement" },
];

// --- Temperature Log ---
const temperatureItems: MenuItem[] = [
  { label: "Temperature Logs", screen: "TemperatureLogs", icon: "thermometer-outline", mode: "temperature", requiredFeature: "TemperatureLog" },
  {
    label: "Temperature Report",
    screen: "TemperatureScheduleGrid",
    icon: "calendar-outline",
    mode: "temperature",
    requiredFeature: "TemperatureLog",
  },
  {
    label: "Temperature Units",
    screen: "TemperatureUnits",
    icon: "options-outline",
    mode: "temperature",
    requiredFeature: "TemperatureLog",
  },
  // Hidden from the menu (screens/routes remain registered). The Temperature Report above
  // replaces these day/report views.
  // { label: "Temperature Logs by Day", screen: "TemperatureLogsByDay", icon: "calendar-number-outline", mode: "temperature", requiredFeature: "TemperatureLog" },
  // { label: "Temperature Logs Report", screen: "TemperatureLogsReport", icon: "bar-chart-outline", mode: "temperature", requiredFeature: "TemperatureLog" },
  // { label: "Temperature Date Range Report", screen: "TemperatureLogsDateRangeReport", icon: "document-text-outline", mode: "temperature", requiredFeature: "TemperatureLog" },
  {
    label: "Scheduled Checks",
    screen: "TemperatureSchedules",
    icon: "alarm-outline",
    mode: "temperature",
    allowedRoles: ["PlatformAdmin", "CompanyOwner", "Manager"],
    requiredFeature: "TemperatureLog",
  },
];

// --- Refusal Log ---
const refusalItems: MenuItem[] = [
  { label: "Refusal Log", screen: "RefusalRegister", icon: "shield-checkmark-outline", mode: "refusals", requiredFeature: "RefusalNoIdNoSale" },
  { label: "Refusal Report", screen: "RefusalReport", icon: "document-text-outline", mode: "refusals", requiredFeature: "RefusalNoIdNoSale" },
  { label: "Refusal Manager Review", screen: "RefusalManagerReview", icon: "clipboard-outline", mode: "refusals", requiredFeature: "refusal_log.multi_manager_review" },
];

const visitorItems: MenuItem[] = [
  { label: "Visitors Log", screen: "VisitorLog", icon: "people-outline", requiredFeature: "visitor_log.basic" },
  { label: "Visitor Report", screen: "VisitorLogReport", icon: "document-text-outline", requiredFeature: "visitor_log.reports" },
];

// --- Compliance ---
const complianceItems: MenuItem[] = [
  { label: "Compliance Checks", screen: "ComplianceChecks", icon: "clipboard-outline", mode: "compliance", requiredFeature: "ComplianceChecklist" },
  {
    label: "Compliance Setup",
    screen: "ComplianceConfig",
    icon: "build-outline",
    mode: "compliance",
    requiredFeature: "ComplianceChecklist",
  },
  {
    label: "Compliance Action Report",
    screen: "ComplianceActions",
    icon: "warning-outline",
    mode: "compliance",
    allowedRoles: ["PlatformAdmin", "CompanyOwner", "Manager"],
    requiredFeature: "ComplianceChecklist",
  },
];

// --- Shifts (staff rota & attendance) ---
const shiftItems: MenuItem[] = [
  { label: "My Shifts", screen: "MyShifts", icon: "time-outline", requiredFeature: "StaffRota" },
  { label: "My Leave", screen: "MyLeave", icon: "airplane-outline", requiredFeature: "LeaveManagement" },
  { label: "My Timesheet", screen: "MyTimesheet", icon: "document-text-outline", requiredFeature: "StaffRota" },
  { label: "Shift Swaps", screen: "ShiftSwaps", icon: "swap-horizontal-outline", requiredFeature: "staff_rota.shift_swap" },
  { label: "Shift Rota", screen: "RotaManage", icon: "calendar-number-outline", allowedRoles: ["CompanyOwner", "Manager"], requiredFeature: "StaffRota" },
  { label: "External Staff", screen: "RotaStaffMembers", icon: "people-circle-outline", allowedRoles: ["CompanyOwner", "Manager"], requiredFeature: "StaffRota" },
  { label: "Time Approvals", screen: "RotaApprovals", icon: "checkmark-done-outline", allowedRoles: ["CompanyOwner", "Manager"], requiredFeature: "staff_rota.manual_approval" },
  { label: "Timesheet", screen: "RotaTimesheet", icon: "documents-outline", allowedRoles: ["CompanyOwner", "Manager"], requiredFeature: "StaffRota" },
  { label: "Leave", screen: "LeaveManage", icon: "airplane-outline", allowedRoles: ["CompanyOwner", "Manager"], requiredFeature: "LeaveManagement" },
];

// --- Shop (cross-cutting items not tied to a single feature module) ---
const shopItems: MenuItem[] = [
  // {
  //   label: "Store Sales",
  //   screen: "StoreSales",
  //   icon: "cash-outline",
  //   allowedRoles: ["PlatformAdmin", "CompanyOwner", "Manager"],
  //   requiredFeature: "StoreSales",
  // },
  // { label: "Shop Checklist", screen: "ShopChecklist", icon: "checkmark-done-outline", mode: "checklist" },
  // {
  //   label: "Checklist Setup",
  //   screen: "ChecklistConfiguration",
  //   icon: "construct-outline",
  //   mode: "checklist",
  // },
  // {
  //   label: "Checklist History",
  //   screen: "ChecklistHistory",
  //   icon: "document-text-outline",
  //   mode: "checklist",
  //   allowedRoles: ["PlatformAdmin", "CompanyOwner", "Manager"],
  // },
  { label: "Audit Log", screen: "AuditLog", icon: "document-text-outline", requiredFeature: "audit_log.basic" },
  { label: "Notification Log", screen: "NotificationLog", icon: "notifications-outline" },
];

// --- Administration ---
const adminItems: MenuItem[] = [
  { label: "User Invitations", screen: "UserInvitations", icon: "mail-outline", allowedRoles: ["PlatformAdmin", "CompanyOwner", "Manager"] },
  { label: "User Management", screen: "UserManagement", icon: "people-outline", allowedRoles: ["PlatformAdmin", "CompanyOwner", "Manager"] },
  { label: "Shop Management", screen: "ShopManagement", icon: "storefront-outline", allowedRoles: ["PlatformAdmin", "CompanyOwner", "Manager"] },
  {
    label: "Subscription",
    screen: "Settings",
    rootScreen: "SubscriptionSummary",
    icon: "card-outline",
    allowedRoles: ["PlatformAdmin", "CompanyOwner"],
  },
  { label: "Shop Configuration", screen: "ShopConfiguration", icon: "storefront-outline", allowedRoles: ["PlatformAdmin", "CompanyOwner", "Manager"] },
  { label: "App Configuration", screen: "AppConfiguration", icon: "construct-outline", allowedRoles: ["PlatformAdmin", "CompanyOwner"] },
];

// --- Till / Store Sales ---
const tillItems: MenuItem[] = [
  { label: "Till Reconciliation", screen: "TillReconciliation", icon: "cash-outline", requiredFeature: "StoreSales" },
  { label: "Tills", screen: "TillsConfig", icon: "albums-outline", allowedRoles: ["PlatformAdmin", "CompanyOwner", "Manager"] },
  { label: "Payment Types", screen: "PaymentTypesConfig", icon: "card-outline", allowedRoles: ["PlatformAdmin", "CompanyOwner", "Manager"] },
  { label: "Till Groups", screen: "TillGroupsConfig", icon: "layers-outline", allowedRoles: ["PlatformAdmin", "CompanyOwner", "Manager"] },
  { label: "Line Report", screen: "TillLineReport", icon: "stats-chart-outline", allowedRoles: ["PlatformAdmin", "CompanyOwner", "Manager"] },
];

function getOperationLabel(operation: EntryOperation | null) {
  if (operation === "checklist") return "Checklist";
  if (operation === "compliance") return "Compliance";
  if (operation === "temperature") return "Temperature";
  if (operation === "scratchCard") return "Scratch Card";
  if (operation === "refusals") return "Refusal Log";
  return "All";
}

function getDeepestRouteName(state: any): string | undefined {
  if (!state?.routes?.length) {
    return undefined;
  }

  let currentRoute = state.routes[state.index ?? 0];
  while (currentRoute?.state?.routes?.length) {
    const nestedState = currentRoute.state;
    currentRoute = nestedState.routes[nestedState.index ?? 0];
  }

  return currentRoute?.name;
}

function resolveActiveBottomDockScreen(routeName: string | undefined): keyof MainStackParamList {
  if (!routeName) {
    return "BestEntry";
  }

  if (
    routeName === "Dashboard" ||
    routeName === "ShopChecklist" ||
    routeName === "ComplianceChecks" ||
    routeName === "ComplianceConfig" ||
    routeName === "ComplianceActions" ||
    routeName === "BusinessDay" ||
    routeName === "OpenShift" ||
    routeName === "CloseShift" ||
    routeName === "ShiftDetails" ||
    routeName === "ShiftReconciliation" ||
    routeName === "PrizePayout" ||
    routeName === "DayEndClose"
  ) {
    return "Dashboard";
  }

  if (
    routeName === "ScratchCardPacks" ||
    routeName === "ScratchCardGames" ||
    routeName === "ScratchCardGameCreate" ||
    routeName === "ScratchCardGameEdit" ||
    routeName === "ManualPackCreate" ||
    routeName === "PackDetails" ||
    routeName === "ActivatePack" ||
    routeName === "Deliveries" ||
    routeName === "ReceiveDelivery"
  ) {
    return "Dashboard";
  }

  if (
    routeName === "TemperatureLogs" ||
    routeName === "TemperatureLogsByDay" ||
    routeName === "TemperatureLogsReport" ||
    routeName === "TemperatureLogsDateRangeReport" ||
    routeName === "TemperatureUnits"
  ) {
    return "TemperatureLogs";
  }

  if (
    routeName === "RefusalRegister" ||
    routeName === "RefusalRegisterByDay" ||
    routeName === "RefusalReport" ||
    routeName === "RefusalManagerReview" ||
    routeName === "RefusalEntryDetails" ||
    routeName === "RefusalEntryEdit"
  ) {
    return "RefusalRegister";
  }

  if (
    routeName === "Settings" ||
    routeName === "ChecklistConfiguration" ||
    routeName === "ChecklistHistory" ||
    routeName === "UserInvitations" ||
    routeName === "UserManagement" ||
    routeName === "ShopConfiguration" ||
    routeName === "ShopFeatureToggles" ||
    routeName === "AppConfiguration" ||
    routeName === "CompanyManagement" ||
    routeName === "ShopManagement"
  ) {
    return "Settings";
  }

  return "BestEntry";
}

// Which drawer section owns each menu screen — used to auto-expand the section
// containing the screen the user is currently on when the drawer opens.
const SECTION_ITEMS: Record<DrawerSectionKey, MenuItem[]> = {
  scratchCard: scratchCardItems,
  temperature: temperatureItems,
  refusals: refusalItems,
  visitors: visitorItems,
  compliance: complianceItems,
  shifts: shiftItems,
  till: tillItems,
  shop: shopItems,
  admin: adminItems,
};

function sectionKeyForScreen(screen: string | undefined): DrawerSectionKey | null {
  if (!screen) return null;
  for (const [key, items] of Object.entries(SECTION_ITEMS) as [DrawerSectionKey, MenuItem[]][]) {
    if (items.some((item) => item.screen === screen)) return key;
  }
  return null;
}

function sectionKeyForRoute(routeName: string | undefined): DrawerSectionKey | null {
  // Deep child routes (details/edit screens) aren't menu items themselves — fall back to
  // the bottom-dock grouping, which maps them to their feature's root screen.
  return sectionKeyForScreen(routeName) ?? sectionKeyForScreen(resolveActiveBottomDockScreen(routeName));
}

function HamburgerButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable style={styles.menuButton} onPress={onPress} accessibilityRole="button" accessibilityLabel="Open menu">
      <Ionicons name="menu" size={21} color={appTheme.colors.text} />
    </Pressable>
  );
}

// Header actions: a context-aware (?) (only for screens with registered help), left of the menu.
function HeaderRightControls({
  routeName,
  onMenu,
  onHome,
  onSettings,
}: {
  routeName: string;
  onMenu: () => void;
  onHome: () => void;
  onSettings: () => void;
}) {
  const { openHelp, hasHelp } = useHelp();
  return (
    <View style={styles.headerRightRow}>
      {/* Home/Settings replace the old bottom dock. They and the help button share the
          same borderless style so the cluster stays light next to the circled menu
          button. Each shortcut hides on its own screen, where it would be redundant. */}
      {routeName !== "BestEntry" ? (
        <Pressable
          style={({ pressed }) => [styles.headerPlainBtn, pressed ? styles.headerBtnPressed : null]}
          onPress={onHome}
          accessibilityRole="button"
          accessibilityLabel="Go to home"
        >
          <Ionicons name="home-outline" size={21} color={appTheme.colors.primary} />
        </Pressable>
      ) : null}
      {routeName !== "Settings" ? (
        <Pressable
          style={({ pressed }) => [styles.headerPlainBtn, pressed ? styles.headerBtnPressed : null]}
          onPress={onSettings}
          accessibilityRole="button"
          accessibilityLabel="Open settings"
        >
          <Ionicons name="settings-outline" size={21} color={appTheme.colors.primary} />
        </Pressable>
      ) : null}
      {hasHelp(routeName) ? (
        <Pressable
          style={({ pressed }) => [styles.headerPlainBtn, pressed ? styles.headerBtnPressed : null]}
          onPress={() => openHelp(routeName)}
          accessibilityRole="button"
          accessibilityLabel="Help for this screen"
        >
          <Ionicons name="help-circle-outline" size={22} color={appTheme.colors.primary} />
        </Pressable>
      ) : null}
      <HamburgerButton onPress={onMenu} />
    </View>
  );
}

function HomeHeaderTitle() {
  return (
    <View style={styles.homeHeaderTitle}>
      <Image source={require("../../assets/ops-arrow-logo.png")} style={styles.homeHeaderLogo} resizeMode="contain" />
      <Text style={styles.homeHeaderText} numberOfLines={1}>
        {appInfo.name}
      </Text>
    </View>
  );
}

function MainStackScreens() {
  return (
    <Stack.Navigator
      initialRouteName="BestEntry"
      screenOptions={({ navigation, route }) => ({
        headerStyle: { backgroundColor: appTheme.colors.background },
        headerTintColor: appTheme.colors.text,
        headerTitleAlign: "left",
        headerTitleStyle: {
          fontFamily: appTheme.fonts.bodyMedium,
          fontSize: 17,
          lineHeight: 21,
        },
        headerShadowVisible: false,
        headerBackButtonDisplayMode: "minimal",
        headerBackButtonMenuEnabled: false,
        headerRightContainerStyle: {
          paddingRight: appTheme.spacing.xs,
        },
        contentStyle: {
          backgroundColor: appTheme.colors.background,
          paddingBottom: 0,
        },
        headerRight: () => (
          <HeaderRightControls
            routeName={route.name}
            onMenu={() => navigation.getParent()?.dispatch(DrawerActions.toggleDrawer())}
            onHome={() => navigation.navigate("BestEntry")}
            onSettings={() => navigation.navigate("Settings")}
          />
        ),
      })}
    >
      <Stack.Screen name="BestEntry" component={BestEntryScreen} options={{ headerTitle: () => <HomeHeaderTitle /> }} />
      <Stack.Screen name="OwnerDashboard" component={OwnerOverviewScreen} options={{ title: "Dashboard" }} />
      <Stack.Screen name="MyShifts" component={MyShiftsScreen} options={{ title: "My Shifts" }} />
      <Stack.Screen name="MyLeave" component={MyLeaveScreen} options={{ title: "My Leave" }} />
      <Stack.Screen name="MyTimesheet" component={MyTimesheetScreen} options={{ title: "My Timesheet" }} />
      <Stack.Screen name="RotaManage" component={RotaManageScreen} options={{ title: "Shift Rota" }} />
      <Stack.Screen name="RotaTimesheet" component={RotaTimesheetScreen} options={{ title: "Timesheet" }} />
      <Stack.Screen name="RotaApprovals" component={RotaApprovalsScreen} options={{ title: "Time Approvals" }} />
      <Stack.Screen name="LeaveManage" component={LeaveManagementScreen} options={{ title: "Leave" }} />
      <Stack.Screen name="LeaveRecord" component={RecordLeaveScreen} options={{ title: "Record leave" }} />
      <Stack.Screen name="ShiftSwaps" component={ShiftSwapsScreen} options={{ title: "Shift Swaps" }} />
      <Stack.Screen name="RotaStaffMembers" component={RotaStaffMembersScreen} options={{ title: "External Staff" }} />
      <Stack.Screen name="ShopChecklist" component={ShopChecklistScreen} options={{ title: "Shop Checklist" }} />
      <Stack.Screen name="ComplianceChecks" component={ComplianceChecksScreen} options={{ title: "Compliance Checks" }} />
      <Stack.Screen name="ComplianceConfig" component={ComplianceChecksConfigScreen} options={{ title: "Compliance Setup" }} />
      <Stack.Screen name="ComplianceActions" component={ComplianceActionsScreen} options={{ title: "Compliance Action Report" }} />
      <Stack.Screen
        name="ChecklistConfiguration"
        component={ChecklistConfigurationScreen}
        options={{ title: "Checklist Setup" }}
      />
      <Stack.Screen name="ChecklistHistory" component={ChecklistHistoryScreen} options={{ title: "Checklist History" }} />
      <Stack.Screen name="Dashboard" component={DashboardScreen} options={{ title: "Day Management" }} />
      <Stack.Screen name="UserInvitations" component={UserInvitationsScreen} options={{ title: "User Invitations" }} />
      <Stack.Screen name="UserManagement" component={UserManagementScreen} options={{ title: "User Management" }} />
      <Stack.Screen name="ShopConfiguration" component={ShopConfigurationScreen} options={{ title: "Shop Configuration" }} />
      <Stack.Screen name="ShopFeatureToggles" component={ShopFeatureTogglesScreen} options={{ title: "Feature Toggles" }} />
      <Stack.Screen name="AppConfiguration" component={AppConfigurationScreen} options={{ title: "App Configuration" }} />
      <Stack.Screen name="CompanyManagement" component={CompanyManagementScreen} options={{ title: "Company Management" }} />
      <Stack.Screen name="ShopManagement" component={ShopManagementScreen} options={{ title: "Shop Management" }} />
      <Stack.Screen name="ScratchCardGames" component={ScratchCardGamesScreen} options={{ title: "Card Games" }} />
      <Stack.Screen
        name="ScratchCardGameCreate"
        component={ScratchCardGameCreateScreen}
        options={{ presentation: "modal", title: "Create Game" }}
      />
      <Stack.Screen
        name="ScratchCardGameEdit"
        component={ScratchCardGameEditScreen}
        options={{ presentation: "modal", title: "Edit Game" }}
      />
      <Stack.Screen name="Deliveries" component={DeliveriesScreen} options={{ title: "Deliveries" }} />
      <Stack.Screen name="ReceiveDelivery" component={ReceiveDeliveryScreen} options={{ title: "Receive Delivery" }} />
      <Stack.Screen name="TemperatureLogs" component={TemperatureLogScreen} options={{ title: "Temperature Logs" }} />
      <Stack.Screen name="TemperatureLogsByDay" component={TemperatureLogsByDayScreen} options={{ title: "Temperature Logs by Day" }} />
      <Stack.Screen name="TemperatureLogsReport" component={TemperatureLogsReportScreen} options={{ title: "Temperature Logs Report" }} />
      <Stack.Screen name="TemperatureLogsDateRangeReport" component={TemperatureLogsReportScreen} options={{ title: "Temperature Logs Date Range Report" }} />
      <Stack.Screen name="TemperatureUnits" component={TemperatureUnitsScreen} options={{ title: "Temperature Units" }} />
      <Stack.Screen name="TemperatureUnitEdit" component={TemperatureUnitEditScreen} options={{ title: "Edit Unit" }} />
      <Stack.Screen name="TemperatureSchedules" component={TemperatureSchedulesScreen} options={{ title: "Scheduled Checks" }} />
      <Stack.Screen name="TemperatureScheduleGrid" component={TemperatureScheduleGridScreen} options={{ title: "Temperature Report" }} />
      <Stack.Screen name="RefusalRegister" component={RefusalRegisterScreen} options={{ title: "Refusal Log" }} />
      <Stack.Screen name="RefusalRegisterByDay" component={RefusalRegisterByDayScreen} options={{ title: "Refusals by Day" }} />
      <Stack.Screen name="RefusalReport" component={RefusalReportScreen} options={{ title: "Refusal Report" }} />
      <Stack.Screen name="RefusalManagerReview" component={RefusalManagerReviewScreen} options={{ title: "Refusal Manager Review" }} />
      <Stack.Screen name="RefusalEntryDetails" component={RefusalEntryDetailsScreen} options={{ title: "Refusal Details" }} />
      <Stack.Screen name="RefusalEntryEdit" component={RefusalEntryEditScreen} options={{ title: "Edit Refusal" }} />
      <Stack.Screen name="VisitorLog" component={VisitorLogScreen} options={{ title: "Visitors Log" }} />
      <Stack.Screen name="VisitorLogEntryEdit" component={VisitorLogEntryEditScreen} options={{ title: "Visitor" }} />
      <Stack.Screen name="VisitorLogReport" component={VisitorLogReportScreen} options={{ title: "Visitor Report" }} />
      <Stack.Screen name="ScratchCardPacks" component={ScratchCardPacksScreen} options={{ title: "Card Packs" }} />
      <Stack.Screen
        name="ManualPackCreate"
        component={ManualPackCreateScreen}
        options={{ presentation: "modal", title: "Add Manual Pack" }}
      />
      <Stack.Screen name="PackDetails" component={PackDetailsScreen} options={{ title: "Pack Details" }} />
      <Stack.Screen
        name="ActivatePack"
        component={ActivatePackScreen}
        options={{ presentation: "modal", title: "Activate Pack" }}
      />
      <Stack.Screen name="BusinessDay" component={BusinessDayScreen} options={{ title: "Business Day" }} />
      <Stack.Screen name="OpenShift" component={OpenShiftScreen} options={{ title: "Shift Operations" }} />
      <Stack.Screen name="CloseShift" component={CloseShiftScreen} options={{ title: "Close Shift" }} />
      <Stack.Screen name="ShiftDetails" component={ShiftDetailsScreen} options={{ title: "Shift Details" }} />
      <Stack.Screen
        name="EnterClosingNumbers"
        component={EnterClosingNumbersScreen}
        options={{ title: "Closing Numbers" }}
      />
      <Stack.Screen
        name="PrizePayout"
        component={PrizePayoutScreen}
        options={{ presentation: "modal", title: "Prize Payout" }}
      />
      <Stack.Screen name="SafeDrop" component={SafeDropScreen} options={{ title: "Safe Drops" }} />
      <Stack.Screen name="ScratchCardSummary" component={ScratchCardSummaryScreen} options={{ title: "Scratch Card Summary" }} />
      <Stack.Screen
        name="ShiftReconciliation"
        component={ShiftReconciliationScreen}
        options={{ presentation: "modal", title: "Shift Reconciliation" }}
      />
      <Stack.Screen name="DayEndClose" component={DayEndCloseScreen} options={{ title: "Day Management" }} />
      <Stack.Screen name="DailySalesReport" component={DailySalesReportScreen} options={{ title: "Daily Sales Report" }} />
      {/* <Stack.Screen name="ShiftSalesReport" component={ShiftSalesReportScreen} options={{ title: "Shift Sales Report" }} /> */}
      <Stack.Screen name="ManualClosingReview" component={ManualClosingReviewScreen} options={{ title: "Manual Entry Review" }} />
      <Stack.Screen name="StockReport" component={StockReportScreen} options={{ title: "Stock Report" }} />
      <Stack.Screen name="AuditLog" component={AuditLogScreen} options={{ title: "Audit Log" }} />
      <Stack.Screen name="NotificationLog" component={NotificationLogScreen} options={{ title: "Notification Log" }} />
      <Stack.Screen name="StoreSales" component={CaptureTillReportScreen} options={{ title: "Store Sales" }} />
      <Stack.Screen name="TillReportReview" component={TillReportReviewScreen} options={{ title: "Review Till Report" }} />
      <Stack.Screen name="TillReportHistory" component={TillReportsListScreen} options={{ title: "Till Reports" }} />
      <Stack.Screen name="TillReconciliation" component={TillReconciliationScreen} options={{ title: "Till Reconciliation" }} />
      <Stack.Screen name="TillPaymentSummary" component={TillPaymentSummaryScreen} options={{ title: "Payment Totals" }} />
      <Stack.Screen name="TillsConfig" component={TillsConfigScreen} options={{ title: "Tills" }} />
      <Stack.Screen name="PaymentTypesConfig" component={PaymentTypesConfigScreen} options={{ title: "Payment Types" }} />
      <Stack.Screen name="TillGroupsConfig" component={TillGroupsConfigScreen} options={{ title: "Till Groups" }} />
      <Stack.Screen name="TillLineReport" component={TillLineReportScreen} options={{ title: "Line Report" }} />
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: "Settings" }} />
      <Stack.Screen name="NotificationPreferences" component={NotificationPreferencesScreen} options={{ title: "Notifications" }} />
    </Stack.Navigator>
  );
}

type DrawerSectionProps = {
  sectionKey: DrawerSectionKey;
  title: string;
  items: MenuItem[];
  isCompanyOwner: boolean;
  userRoles: string[];
  features: string[];
  onPress: (item: MenuItem) => void;
  expanded: boolean;
  onToggle: (sectionKey: DrawerSectionKey) => void;
  activeScreen?: keyof MainStackParamList;
  /** Visual identity for the group — coloured icon avatar + left-border accent. */
  accentColor: string;
  accentSoftBackground: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** Optional per-screen count badges (e.g. pending approvals on Time Approvals). */
  badges?: Partial<Record<keyof MainStackParamList, number>>;
};

const DrawerSection = React.memo(function DrawerSection({
  sectionKey,
  title,
  items,
  isCompanyOwner,
  userRoles,
  features,
  onPress,
  expanded,
  onToggle,
  activeScreen,
  accentColor,
  accentSoftBackground,
  icon,
  badges,
}: DrawerSectionProps) {
  // Menu is grouped by feature now — no longer filtered by the active operation chip.
  // Items still respect role and feature gates.
  const visibleItems = useMemo(
    () =>
      items.filter(
        (item) =>
          (!item.shopOwnerOnly || isCompanyOwner) &&
          (!item.allowedRoles || item.allowedRoles.some((role) => userRoles.includes(role))) &&
          (!item.requiredFeature || features.includes(item.requiredFeature))
      ),
    [items, isCompanyOwner, userRoles, features]
  );

  const handleToggle = useCallback(() => onToggle(sectionKey), [onToggle, sectionKey]);

  // Sum of item badges, surfaced on the header when collapsed so pending counts
  // (e.g. time approvals) stay visible without expanding the section.
  const badgeTotal = useMemo(
    () => visibleItems.reduce((sum, item) => sum + (badges?.[item.screen] ?? 0), 0),
    [visibleItems, badges],
  );

  if (visibleItems.length === 0) {
    return null;
  }

  return (
    <View style={styles.drawerSection}>
      <Pressable
        style={({ pressed }) => [
          styles.drawerSectionHeader,
          pressed ? styles.drawerSectionHeaderPressed : null,
        ]}
        onPress={handleToggle}
        accessibilityRole="button"
        accessibilityLabel={`${expanded ? "Collapse" : "Expand"} ${title} menu`}
        accessibilityState={{ expanded }}
      >
        <View style={styles.drawerSectionHeaderMain}>
          {/* Coloured tile is the only chromatic element in the header — keeps the drawer
              palette restrained while still giving each group a recognisable identity. */}
          <View style={[styles.drawerSectionAvatar, { backgroundColor: accentSoftBackground }]}>
            <Ionicons name={icon} size={14} color={accentColor} />
          </View>
          <Text style={styles.drawerSectionTitle}>{title}</Text>
        </View>
        {!expanded && badgeTotal > 0 ? (
          <View style={styles.drawerItemBadge}>
            <Text style={styles.drawerItemBadgeText}>{badgeTotal}</Text>
          </View>
        ) : null}
        <View style={styles.drawerSectionToggleIconWrap}>
          <Ionicons
            name={expanded ? "chevron-up-outline" : "chevron-down-outline"}
            size={14}
            color={appTheme.colors.textSubtle}
          />
        </View>
      </Pressable>
      {expanded ? (
        <View style={[styles.drawerSectionItems, styles.drawerSectionItemsAccented, { borderLeftColor: accentColor }]}>
          {visibleItems.map((item) => (
            <Pressable
              key={item.screen}
              style={({ pressed }) => [
                styles.drawerItem,
                activeScreen === item.screen ? styles.drawerItemActive : null,
                pressed ? styles.drawerItemPressed : null,
              ]}
              onPress={() => onPress(item)}
            >
              <View style={styles.drawerItemMain}>
                <View
                  style={[
                    styles.drawerItemIconWrap,
                    activeScreen === item.screen ? styles.drawerItemIconWrapActive : null,
                  ]}
                >
                  <Ionicons
                    name={item.icon}
                    size={15}
                    color={activeScreen === item.screen ? appTheme.colors.onPrimary : appTheme.colors.textMuted}
                  />
                </View>
                <Text style={[styles.drawerItemText, activeScreen === item.screen ? styles.drawerItemTextActive : null]}>
                  {item.label}
                </Text>
              </View>
              <View style={styles.drawerItemRight}>
                {(badges?.[item.screen] ?? 0) > 0 ? (
                  <View style={styles.drawerItemBadge}>
                    <Text style={styles.drawerItemBadgeText}>{badges?.[item.screen]}</Text>
                  </View>
                ) : null}
                <Ionicons
                  name={activeScreen === item.screen ? "checkmark-circle" : "chevron-forward"}
                  size={14}
                  color={activeScreen === item.screen ? appTheme.colors.primary : appTheme.colors.textMuted}
                />
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
});

function DrawerMenuContent(props: DrawerContentComponentProps) {
  const { selectedOperation, setSelectedOperation } = useBestEntry();
  const insets = useSafeAreaInsets();
  const { profile, activeShop, activeShopId, signOut } = useAuth();
  const { entitlements } = useEntitlements();
  // Stabilise these arrays by content so the React.memo'd DrawerSection doesn't re-render on
  // every entitlements refetch even when the actual feature set is unchanged.
  const featuresKey = (entitlements?.features ?? []).slice().sort().join("|");
  const features = useMemo(() => (entitlements?.features ?? []).slice().sort(), [featuresKey]);
  const rolesKey = (profile?.roles ?? []).slice().sort().join("|");
  const userRoles = useMemo(() => (profile?.roles ?? []).slice().sort(), [rolesKey]);
  const isCompanyOwner = userRoles.some((role) => role === "CompanyOwner");
  const isPlatformAdmin = userRoles.some((role) => role === "PlatformAdmin");
  const isManager = userRoles.some((role) => role === "Manager");
  const roleLabel = isPlatformAdmin ? "Admin" : isCompanyOwner ? getRoleDisplayName("CompanyOwner") : isManager ? "Manager" : "Staff";

  // Pending manual-time approvals → badge on the Time Approvals menu item (managers/owners only,
  // and only when the shop is entitled to the manual-approval sub-feature).
  const canApproveTimes = (isCompanyOwner || isManager) && features.includes("staff_rota.manual_approval");
  const pendingApprovalsQuery = useQuery({
    queryKey: ["rota-pending", activeShopId],
    queryFn: () => getPendingApprovals(activeShopId as string),
    enabled: Boolean(activeShopId) && canApproveTimes,
    refetchInterval: 60_000,
  });
  // Timesheets waiting for the signed-in user's confirmation → badge on My Timesheet (all roles).
  const myReviewsQuery = useQuery({
    queryKey: ["rota-my-reviews", activeShopId],
    queryFn: () => getMyTimesheetReviews(activeShopId as string),
    enabled: Boolean(activeShopId) && features.includes("StaffRota"),
    refetchInterval: 60_000,
  });
  const myPendingReviewCount = useMemo(
    () => (myReviewsQuery.data ?? []).filter((r) => r.status === "PendingStaff" || r.status === "Disputed").length,
    [myReviewsQuery.data],
  );
  const shiftBadges = useMemo(
    () => ({
      RotaApprovals: pendingApprovalsQuery.data?.length ?? 0,
      MyTimesheet: myPendingReviewCount,
    }),
    [pendingApprovalsQuery.data, myPendingReviewCount],
  );
  const activeRouteName = getDeepestRouteName(props.state);
  const activeScreen = activeRouteName as keyof MainStackParamList | undefined;
  const drawerBottomPadding = insets.bottom + appTheme.spacing.md;
  const operationLabel = getOperationLabel(selectedOperation);
  const currentUser = profile?.displayName ?? profile?.email ?? "Signed-in user";
  const userInitials = useMemo(() => {
    const source = (profile?.displayName ?? profile?.email ?? "").trim();
    const parts = source.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return "?";
  }, [profile?.displayName, profile?.email]);
  const [expandedSections, setExpandedSections] = useState<Record<DrawerSectionKey, boolean>>({
    scratchCard: true,
    temperature: false,
    refusals: false,
    visitors: false,
    compliance: false,
    shifts: false,
    till: false,
    shop: false,
    admin: false,
  });

  // Keep the drawer oriented: whichever section owns the screen the user is on
  // stays expanded, so the highlighted active item is always visible.
  const activeSectionKey = useMemo(() => sectionKeyForRoute(activeRouteName), [activeRouteName]);
  useEffect(() => {
    if (!activeSectionKey) return;
    setExpandedSections((previous) =>
      previous[activeSectionKey] ? previous : { ...previous, [activeSectionKey]: true },
    );
  }, [activeSectionKey]);

  const goTo = (item: MenuItem) => {
    if (item.rootScreen) {
      const parent = props.navigation.getParent();
      parent?.navigate(item.rootScreen as never);
      props.navigation.closeDrawer();
      return;
    }

    if (item.screen === "ShopChecklist") {
      setSelectedOperation("checklist");
    } else if (item.screen === "ComplianceChecks" || item.screen === "ComplianceConfig" || item.screen === "ComplianceActions") {
      setSelectedOperation("compliance");
    } else if (item.mode) {
      setSelectedOperation(item.mode);
    }

    props.navigation.navigate("MainStack", { screen: item.screen });
    props.navigation.closeDrawer();
  };

  const toggleSection = (sectionKey: DrawerSectionKey) => {
    setExpandedSections((previous) => ({
      ...previous,
      [sectionKey]: !previous[sectionKey],
    }));
  };

  function onOpenSettings() {
    props.navigation.navigate("MainStack", { screen: "Settings" });
    props.navigation.closeDrawer();
  }

  function onOpenHome() {
    setSelectedOperation(null);
    props.navigation.navigate("MainStack", { screen: "BestEntry" });
    props.navigation.closeDrawer();
  }

  function onOpenOverview() {
    props.navigation.navigate("MainStack", { screen: "OwnerDashboard" });
    props.navigation.closeDrawer();
  }

  function onOpenDayManagement() {
    setSelectedOperation("scratchCard");
    props.navigation.navigate("MainStack", { screen: "Dashboard" });
    props.navigation.closeDrawer();
  }

  async function onSignOut() {
    const ok = await confirmDestructive({
      title: "Sign out?",
      message: "You'll need to sign back in with your account.",
      confirmLabel: "Sign Out",
    });
    if (!ok) return;
    props.navigation.closeDrawer();
    await signOut();
  }

  return (
    <DrawerContentScrollView
      {...props}
      contentContainerStyle={[styles.drawerScrollContent, { paddingBottom: drawerBottomPadding }]}
    >
        <View style={[styles.drawerHeader, { paddingTop: appTheme.spacing.md + insets.top }]}>
        <View style={styles.drawerIdentityRow}>
          <View style={styles.drawerAvatar}>
            <Text style={styles.drawerAvatarText}>{userInitials}</Text>
          </View>
          <View style={styles.drawerIdentityText}>
            <Text style={styles.drawerUserName} numberOfLines={1}>{currentUser}</Text>
            <Text style={styles.drawerShopName} numberOfLines={1}>
              {activeShop?.shopName ?? "No active shop selected"}
            </Text>
          </View>
        </View>
        <View style={styles.drawerPillRow}>
          <View style={styles.drawerRolePill}>
            <Text style={styles.drawerRolePillText}>{roleLabel}</Text>
          </View>
          {entitlements?.tier ? (
            <Pressable
              style={({ pressed }) => [styles.drawerPlanPill, pressed ? styles.drawerPlanPillPressed : null]}
              onPress={() => {
                props.navigation.getParent()?.navigate("SubscriptionSummary" as never);
                props.navigation.closeDrawer();
              }}
              accessibilityRole="button"
              accessibilityLabel={`View subscription. Current plan: ${entitlements.tier}`}
            >
              <Ionicons name="card-outline" size={12} color={appTheme.colors.textBrandStrong} />
              <Text style={styles.drawerPlanPillText}>
                {entitlements.tier}
                {entitlements.isInTrial ? " · Trial" : ""}
              </Text>
            </Pressable>
          ) : null}
          </View>
        </View>

        <View style={styles.drawerTopItemWrap}>
          <Pressable
            style={({ pressed }) => [
              styles.drawerItem,
              activeScreen === "BestEntry" ? styles.drawerItemActive : null,
              pressed ? styles.drawerItemPressed : null,
            ]}
            onPress={onOpenHome}
            accessibilityRole="button"
            accessibilityLabel="Home"
          >
            <View style={styles.drawerItemMain}>
              <View
                style={[
                  styles.drawerItemIconWrap,
                  activeScreen === "BestEntry" ? styles.drawerItemIconWrapActive : null,
                ]}
              >
                <Ionicons
                  name="home-outline"
                  size={15}
                  color={activeScreen === "BestEntry" ? appTheme.colors.onPrimary : appTheme.colors.textMuted}
                />
              </View>
              <Text style={[styles.drawerItemText, activeScreen === "BestEntry" ? styles.drawerItemTextActive : null]}>
                Home
              </Text>
            </View>
            <Ionicons
              name={activeScreen === "BestEntry" ? "checkmark-circle" : "chevron-forward"}
              size={14}
              color={activeScreen === "BestEntry" ? appTheme.colors.primary : appTheme.colors.textSubtle}
            />
          </Pressable>
        </View>

        {isCompanyOwner || isManager ? (
          <View style={styles.drawerTopItemWrap}>
            <Pressable
              style={({ pressed }) => [
                styles.drawerItem,
                activeScreen === "OwnerDashboard" ? styles.drawerItemActive : null,
                pressed ? styles.drawerItemPressed : null,
              ]}
              onPress={onOpenOverview}
              accessibilityRole="button"
              accessibilityLabel="Dashboard"
            >
              <View style={styles.drawerItemMain}>
                <View
                  style={[
                    styles.drawerItemIconWrap,
                    activeScreen === "OwnerDashboard" ? styles.drawerItemIconWrapActive : null,
                  ]}
                >
                  <Ionicons
                    name="speedometer-outline"
                    size={15}
                    color={activeScreen === "OwnerDashboard" ? appTheme.colors.onPrimary : appTheme.colors.textMuted}
                  />
                </View>
                <Text style={[styles.drawerItemText, activeScreen === "OwnerDashboard" ? styles.drawerItemTextActive : null]}>
                  Dashboard
                </Text>
              </View>
              <Ionicons
                name={activeScreen === "OwnerDashboard" ? "checkmark-circle" : "chevron-forward"}
                size={14}
                color={activeScreen === "OwnerDashboard" ? appTheme.colors.primary : appTheme.colors.textSubtle}
              />
            </Pressable>
          </View>
        ) : null}

        <View style={styles.drawerTopItemWrap}>
          <Pressable
            style={({ pressed }) => [
              styles.drawerItem,
              activeScreen === "Dashboard" ? styles.drawerItemActive : null,
              pressed ? styles.drawerItemPressed : null,
            ]}
            onPress={onOpenDayManagement}
            accessibilityRole="button"
            accessibilityLabel="Day Management"
          >
            <View style={styles.drawerItemMain}>
              <View
                style={[
                  styles.drawerItemIconWrap,
                  activeScreen === "Dashboard" ? styles.drawerItemIconWrapActive : null,
                ]}
              >
                <Ionicons
                  name="calendar-outline"
                  size={15}
                  color={activeScreen === "Dashboard" ? appTheme.colors.onPrimary : appTheme.colors.textMuted}
                />
              </View>
              <Text style={[styles.drawerItemText, activeScreen === "Dashboard" ? styles.drawerItemTextActive : null]}>
                Day Management
              </Text>
            </View>
            <Ionicons
              name={activeScreen === "Dashboard" ? "checkmark-circle" : "chevron-forward"}
              size={14}
              color={activeScreen === "Dashboard" ? appTheme.colors.primary : appTheme.colors.textSubtle}
            />
          </Pressable>
        </View>

        <DrawerSection
          sectionKey="scratchCard"
          title="Scratch Card"
          icon="albums-outline"
          accentColor={appTheme.colors.primary}
          accentSoftBackground={appTheme.colors.surfaceBrandSoft}
          items={scratchCardItems}
          isCompanyOwner={isCompanyOwner}
          userRoles={userRoles}
          features={features}
          onPress={goTo}
          expanded={expandedSections.scratchCard}
          onToggle={toggleSection}
          activeScreen={activeScreen}
        />

        <DrawerSection
          sectionKey="temperature"
          title="Temperature Log"
          icon="thermometer-outline"
          accentColor={appTheme.colors.info}
          accentSoftBackground={appTheme.colors.surfaceInfoMuted}
          items={temperatureItems}
          isCompanyOwner={isCompanyOwner}
          userRoles={userRoles}
          features={features}
          onPress={goTo}
          expanded={expandedSections.temperature}
          onToggle={toggleSection}
          activeScreen={activeScreen}
        />

        <DrawerSection
          sectionKey="refusals"
          title="Refusal Log"
          icon="shield-checkmark-outline"
          accentColor={appTheme.colors.warning}
          accentSoftBackground={appTheme.colors.surfaceWarningSoft}
          items={refusalItems}
          isCompanyOwner={isCompanyOwner}
          userRoles={userRoles}
          features={features}
          onPress={goTo}
          expanded={expandedSections.refusals}
          onToggle={toggleSection}
          activeScreen={activeScreen}
        />

        <DrawerSection
          sectionKey="visitors"
          title="Visitors Log"
          icon="people-outline"
          accentColor={appTheme.colors.textBrandStrong}
          accentSoftBackground={appTheme.colors.surfaceBrandPale}
          items={visitorItems}
          isCompanyOwner={isCompanyOwner}
          userRoles={userRoles}
          features={features}
          onPress={goTo}
          expanded={expandedSections.visitors}
          onToggle={toggleSection}
          activeScreen={activeScreen}
        />

        <DrawerSection
          sectionKey="compliance"
          title="Compliance Check"
          icon="clipboard-outline"
          accentColor={appTheme.colors.success}
          accentSoftBackground={appTheme.colors.badgeSuccessBg}
          items={complianceItems}
          isCompanyOwner={isCompanyOwner}
          userRoles={userRoles}
          features={features}
          onPress={goTo}
          expanded={expandedSections.compliance}
          onToggle={toggleSection}
          activeScreen={activeScreen}
        />

        <DrawerSection
          sectionKey="shifts"
          title="Shifts"
          icon="time-outline"
          accentColor={appTheme.colors.accent}
          accentSoftBackground={appTheme.colors.surfaceWarningMuted}
          items={shiftItems}
          badges={shiftBadges}
          isCompanyOwner={isCompanyOwner}
          userRoles={userRoles}
          features={features}
          onPress={goTo}
          expanded={expandedSections.shifts}
          onToggle={toggleSection}
          activeScreen={activeScreen}
        />

        <DrawerSection
          sectionKey="till"
          title="Till / Store Sales"
          icon="cash-outline"
          accentColor={appTheme.colors.textSuccessStrong}
          accentSoftBackground={appTheme.colors.surfaceSuccessMuted}
          items={tillItems}
          isCompanyOwner={isCompanyOwner}
          userRoles={userRoles}
          features={features}
          onPress={goTo}
          expanded={expandedSections.till}
          onToggle={toggleSection}
          activeScreen={activeScreen}
        />

        <DrawerSection
          sectionKey="shop"
          title="Logs & Records"
          icon="reader-outline"
          accentColor={appTheme.colors.textMuted}
          accentSoftBackground={appTheme.colors.surfaceNeutralSoft}
          items={shopItems}
          isCompanyOwner={isCompanyOwner}
          userRoles={userRoles}
          features={features}
          onPress={goTo}
          expanded={expandedSections.shop}
          onToggle={toggleSection}
          activeScreen={activeScreen}
        />

        <DrawerSection
          sectionKey="admin"
          title="Administration"
          icon="construct-outline"
          accentColor={appTheme.colors.text}
          accentSoftBackground={appTheme.colors.surfaceNeutralSoft}
          items={adminItems}
          isCompanyOwner={isCompanyOwner}
          userRoles={userRoles}
          features={features}
          onPress={goTo}
          expanded={expandedSections.admin}
          onToggle={toggleSection}
          activeScreen={activeScreen}
        />

      <View style={styles.drawerFooter}>
        <Pressable
          style={({ pressed }) => [
            styles.drawerItem,
            activeScreen === "Settings" ? styles.drawerItemActive : null,
            pressed ? styles.drawerItemPressed : null,
          ]}
          onPress={onOpenSettings}
          accessibilityRole="button"
          accessibilityLabel="Settings"
        >
          <View style={styles.drawerItemMain}>
            <View
              style={[
                styles.drawerItemIconWrap,
                activeScreen === "Settings" ? styles.drawerItemIconWrapActive : null,
              ]}
            >
              <Ionicons
                name="settings-outline"
                size={15}
                color={activeScreen === "Settings" ? appTheme.colors.onPrimary : appTheme.colors.textMuted}
              />
            </View>
            <Text style={[styles.drawerItemText, activeScreen === "Settings" ? styles.drawerItemTextActive : null]}>
              Settings
            </Text>
          </View>
          <Ionicons
            name={activeScreen === "Settings" ? "checkmark-circle" : "chevron-forward"}
            size={14}
            color={activeScreen === "Settings" ? appTheme.colors.primary : appTheme.colors.textSubtle}
          />
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.drawerItem,
            styles.drawerSignOutItem,
            pressed ? styles.drawerItemPressed : null,
          ]}
          onPress={() => {
            void onSignOut();
          }}
          accessibilityRole="button"
          accessibilityLabel="Sign out"
        >
          <View style={styles.drawerItemMain}>
            <View style={styles.drawerSignOutIconWrap}>
              <Ionicons name="log-out-outline" size={15} color={appTheme.colors.danger} />
            </View>
            <Text style={[styles.drawerItemText, styles.drawerSignOutText]}>Sign Out</Text>
          </View>
          <Ionicons name="chevron-forward" size={14} color={appTheme.colors.textSubtle} />
        </Pressable>
      </View>
    </DrawerContentScrollView>
  );
}

export function MainNavigator() {
  // Tablet: widen the drawer so the menu doesn't look phone-pinned to one side. Phone keeps
  // the existing 332-px drawer exactly.
  const isTablet = useIsTablet();
  const drawerWidth = isTablet ? 380 : 332;

  return (
    <BestEntryProvider>
      <HelpProvider>
      <View style={styles.navigatorShell}>
        <NetworkStatusBanner />
        <Drawer.Navigator
          screenOptions={{
            headerShown: false,
            drawerType: "slide",
            overlayColor: appTheme.colors.overlaySoft,
            drawerStyle: {
              width: drawerWidth,
              backgroundColor: appTheme.colors.surface,
            },
            swipeEdgeWidth: 48,
          }}
          drawerContent={(props) => <DrawerMenuContent {...props} />}
        >
          <Drawer.Screen name="MainStack" component={MainStackScreens} />
        </Drawer.Navigator>
      </View>
      </HelpProvider>
    </BestEntryProvider>
  );
}

const styles = StyleSheet.create({
  navigatorShell: {
    flex: 1,
  },
  headerRightRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  menuButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: appTheme.radius.pill,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    backgroundColor: appTheme.colors.surface,
  },
  homeHeaderTitle: {
    flexDirection: "row",
    alignItems: "center",
    gap: appTheme.spacing.xs,
  },
  homeHeaderLogo: {
    width: 28,
    height: 28,
  },
  homeHeaderText: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 18,
    lineHeight: 22,
  },
  drawerScrollContent: {
    paddingTop: 0,
    paddingBottom: 20,
    backgroundColor: appTheme.colors.surface,
  },
  drawerHeader: {
    paddingHorizontal: appTheme.spacing.md,
    paddingVertical: appTheme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: appTheme.colors.border,
    backgroundColor: appTheme.colors.surfaceTintAlt,
    gap: appTheme.spacing.sm,
  },
  drawerIdentityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: appTheme.spacing.sm,
  },
  drawerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: appTheme.colors.surfaceBrandSoft,
  },
  drawerAvatarText: {
    color: appTheme.colors.primary,
    fontFamily: appTheme.fonts.heading,
    fontSize: 16,
    lineHeight: 20,
  },
  drawerIdentityText: {
    flex: 1,
    gap: 2,
  },
  drawerUserName: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 16,
    lineHeight: 20,
  },
  drawerShopName: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.body,
    fontSize: 13,
    lineHeight: 16,
  },
  drawerPillRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: appTheme.spacing.xs,
    marginTop: appTheme.spacing.xs,
  },
  drawerModePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: appTheme.radius.pill,
    borderWidth: 1,
    borderColor: appTheme.colors.borderBrandSoft,
    backgroundColor: appTheme.colors.surfaceBrandSoft,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  drawerModePillText: {
    color: appTheme.colors.primary,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 14,
  },
  drawerRolePill: {
    borderRadius: appTheme.radius.pill,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    backgroundColor: appTheme.colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  drawerRolePillText: {
    color: appTheme.colors.textMuted,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 14,
  },
  drawerPlanPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: appTheme.radius.pill,
    borderWidth: 1,
    borderColor: appTheme.colors.borderBrandSoft,
    backgroundColor: appTheme.colors.surfaceBrandSoft,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  drawerPlanPillPressed: {
    opacity: 0.7,
  },
  drawerPlanPillText: {
    color: appTheme.colors.textBrandStrong,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 12,
    lineHeight: 14,
  },
  drawerSection: {
    paddingHorizontal: appTheme.spacing.md,
    paddingTop: appTheme.spacing.md,
  },
  drawerTopItemWrap: {
    paddingHorizontal: appTheme.spacing.md,
    paddingTop: appTheme.spacing.md,
  },
  drawerFooter: {
    marginTop: appTheme.spacing.lg,
    paddingHorizontal: appTheme.spacing.md,
    paddingBottom: appTheme.spacing.sm,
    gap: appTheme.spacing.xs,
  },
  drawerSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: 8,
    borderRadius: appTheme.radius.md,
    backgroundColor: appTheme.colors.surface,
  },
  drawerSectionHeaderPressed: {
    opacity: 0.94,
  },
  drawerSectionHeaderMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: appTheme.spacing.xs,
  },
  drawerSectionAvatar: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  drawerSectionItemsAccented: {
    borderLeftWidth: 2,
    paddingLeft: 10,
    marginLeft: 14,
    opacity: 1,
  },
  drawerSectionItems: {
    gap: appTheme.spacing.xs,
    marginTop: appTheme.spacing.xs,
  },
  drawerSectionTitle: {
    color: appTheme.colors.text,
    fontSize: 13,
    lineHeight: 17,
    fontFamily: appTheme.fonts.bodyMedium,
    letterSpacing: 0.1,
  },
  drawerSectionCountBadge: {
    minWidth: 22,
    borderRadius: appTheme.radius.pill,
    paddingHorizontal: 7,
    paddingVertical: 3,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    backgroundColor: appTheme.colors.surface,
  },
  drawerSectionCountText: {
    color: appTheme.colors.textSubtle,
    fontSize: 11,
    lineHeight: 13,
    fontFamily: appTheme.fonts.bodyMedium,
  },
  drawerSectionToggleIconWrap: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  drawerItem: {
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: appTheme.radius.sm,
    backgroundColor: appTheme.colors.surface,
    borderWidth: 1,
    borderColor: appTheme.colors.borderSoft,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: appTheme.spacing.xs,
    ...Platform.select({
      ios: {
        shadowColor: "#102030",
        shadowOpacity: 0.06,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
      },
      android: {
        elevation: 1,
      },
      default: {},
    }),
  },
  drawerItemActive: {
    backgroundColor: appTheme.colors.surfaceBrandSoft,
    borderColor: appTheme.colors.borderBrandSoft,
  },
  drawerItemPressed: {
    opacity: 0.94,
  },
  drawerItemMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: appTheme.spacing.sm,
    flex: 1,
  },
  drawerItemRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  drawerItemBadge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: appTheme.radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: appTheme.colors.danger,
  },
  drawerItemBadgeText: {
    color: appTheme.colors.onPrimary,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 11,
    lineHeight: 14,
  },
  drawerItemIconWrap: {
    width: 30,
    height: 30,
    borderRadius: appTheme.radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: appTheme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
  },
  drawerItemIconWrapActive: {
    backgroundColor: appTheme.colors.primary,
    borderColor: appTheme.colors.primary,
  },
  drawerItemText: {
    color: appTheme.colors.text,
    fontSize: 14,
    lineHeight: 19,
    fontFamily: appTheme.fonts.bodyMedium,
  },
  drawerItemTextActive: {
    color: appTheme.colors.textBrandStrong,
  },
  drawerSignOutItem: {
    borderWidth: 1,
    borderColor: appTheme.colors.borderDangerSoft,
    backgroundColor: appTheme.colors.surfaceDangerSoft,
  },
  drawerSignOutIconWrap: {
    width: 30,
    height: 30,
    borderRadius: appTheme.radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: appTheme.colors.surfaceDangerMuted,
  },
  drawerSignOutText: {
    color: appTheme.colors.danger,
  },
  // Borderless header shortcuts (Home / Settings / Help) — only the menu button keeps
  // its circle, anchoring the cluster without crowding the title.
  headerPlainBtn: {
    width: 38,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerBtnPressed: {
    opacity: 0.5,
  },
});
