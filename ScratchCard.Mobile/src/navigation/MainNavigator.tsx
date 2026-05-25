import React, { useCallback, useMemo, useState } from "react";
import { Image, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { DrawerActions, NavigatorScreenParams, useNavigation, useNavigationState } from "@react-navigation/native";
import { createDrawerNavigator, DrawerContentScrollView, type DrawerContentComponentProps } from "@react-navigation/drawer";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../auth/AuthContext";
import { DashboardScreen } from "../features/dashboard/DashboardScreen";
import { BestEntryScreen } from "../features/entry/BestEntryScreen";
import { UserInvitationsScreen } from "../features/invitations/UserInvitationsScreen";
import { DeliveriesScreen } from "../features/deliveries/DeliveriesScreen";
import { ReceiveDeliveryScreen } from "../features/deliveries/ReceiveDeliveryScreen";
import { TemperatureLogScreen } from "../features/temperature/TemperatureLogScreen";
import { TemperatureLogsByDayScreen } from "../features/temperature/TemperatureLogsByDayScreen";
import { TemperatureLogsReportScreen } from "../features/temperature/TemperatureLogsReportScreen";
import { TemperatureUnitsScreen } from "../features/temperature/TemperatureUnitsScreen";
import { RefusalRegisterScreen } from "../features/refusals/RefusalRegisterScreen";
import { RefusalRegisterByDayScreen } from "../features/refusals/RefusalRegisterByDayScreen";
import { RefusalReportScreen } from "../features/refusals/RefusalReportScreen";
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
import { ShiftCloseScreen } from "../features/shift-close/ShiftCloseScreen";
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
import { BestEntryProvider, EntryOperation, useBestEntry } from "./BestEntryContext";
import { useEntitlements } from "../features/subscription/useEntitlements";
import { MainStackParamList, RootStackParamList } from "../types/navigation";
import { appTheme } from "../ui/theme";
import { appInfo } from "../config/appInfo";
import { getRoleDisplayName } from "../utils/roleLabels";

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

type DrawerSectionKey = "operations" | "management" | "reports";

const Drawer = createDrawerNavigator<MainDrawerParamList>();
const Stack = createNativeStackNavigator<MainStackParamList>();

const operationsItems: MenuItem[] = [
  { label: "Shop Checklist", screen: "ShopChecklist", icon: "checkmark-done-outline", mode: "checklist" },
  { label: "Compliance Checks", screen: "ComplianceChecks", icon: "clipboard-outline", mode: "compliance" },
  {
    label: "Compliance Setup",
    screen: "ComplianceConfig",
    icon: "build-outline",
    mode: "compliance",
    allowedRoles: ["PlatformAdmin", "CompanyOwner", "Manager"],
  },
  {
    label: "Compliance Action Report",
    screen: "ComplianceActions",
    icon: "warning-outline",
    mode: "compliance",
    allowedRoles: ["PlatformAdmin", "CompanyOwner", "Manager"],
  },
  {
    label: "Checklist Setup",
    screen: "ChecklistConfiguration",
    icon: "construct-outline",
    mode: "checklist",
    allowedRoles: ["PlatformAdmin", "CompanyOwner", "Manager"],
  },
  {
    label: "Checklist History",
    screen: "ChecklistHistory",
    icon: "document-text-outline",
    mode: "checklist",
    allowedRoles: ["PlatformAdmin", "CompanyOwner", "Manager"],
  },
  { label: "Day Management", screen: "Dashboard", icon: "calendar-outline", mode: "scratchCard" },
  { label: "Deliveries", screen: "Deliveries", icon: "cube-outline", mode: "scratchCard" },
  { label: "Temperature Logs", screen: "TemperatureLogs", icon: "thermometer-outline", mode: "temperature" },
  { label: "Temperature Logs by Day", screen: "TemperatureLogsByDay", icon: "calendar-number-outline", mode: "temperature" },
  { label: "Temperature Logs Report", screen: "TemperatureLogsReport", icon: "bar-chart-outline", mode: "temperature" },
  { label: "Temperature Logs Date Range Report", screen: "TemperatureLogsDateRangeReport", icon: "document-text-outline", mode: "temperature" },
  { label: "Temperature Units", screen: "TemperatureUnits", icon: "options-outline", mode: "temperature" },
  { label: "No ID / No Sale", screen: "RefusalRegister", icon: "shield-checkmark-outline", mode: "refusals" },
  // { label: "Refusals by Day", screen: "RefusalRegisterByDay", mode: "refusals" },
  { label: "Refusal Report", screen: "RefusalReport", icon: "document-text-outline", mode: "refusals" },
  { label: "Refusal Manager Review", screen: "RefusalManagerReview", icon: "clipboard-outline", mode: "refusals", requiredFeature: "refusal_log.multi_manager_review" },
  { label: "Card Packs", screen: "ScratchCardPacks", icon: "albums-outline", mode: "scratchCard" },
  { label: "Card Games", screen: "ScratchCardGames", icon: "game-controller-outline", mode: "scratchCard" },
  // { label: "Business Day", screen: "BusinessDay" },
  // { label: "Open Shift", screen: "OpenShift" },
  // { label: "Close Shift", screen: "CloseShift" },
];

const managementItems: MenuItem[] = [
  { label: "User Invitations", screen: "UserInvitations", icon: "mail-outline", allowedRoles: ["PlatformAdmin", "CompanyOwner", "Manager"] },
  // { label: "Company Management", screen: "CompanyManagement", icon: "business-outline", shopOwnerOnly: true },
  { label: "Shop Management", screen: "ShopManagement", icon: "storefront-outline", allowedRoles: ["PlatformAdmin", "CompanyOwner", "Manager"] },
  { label: "User Management", screen: "UserManagement", icon: "people-outline", allowedRoles: ["PlatformAdmin", "CompanyOwner", "Manager"] },
  {
    label: "Subscription",
    screen: "Settings",
    rootScreen: "SubscriptionSummary",
    icon: "card-outline",
    allowedRoles: ["PlatformAdmin", "CompanyOwner"],
  },
  { label: "Notifications", screen: "NotificationPreferences", icon: "notifications-outline" },
  { label: "Shop Configuration", screen: "ShopConfiguration", icon: "storefront-outline" },
  { label: "App Configuration", screen: "AppConfiguration", icon: "construct-outline" },
];

const reportItems: MenuItem[] = [
  { label: "Daily Sales Report", screen: "DailySalesReport", icon: "stats-chart-outline", mode: "scratchCard" },
  // { label: "Shift Sales Report", screen: "ShiftSalesReport", mode: "scratchCard" },
  // { label: "Manual Entry Review", screen: "ManualClosingReview", mode: "scratchCard" },
  { label: "Stock Report", screen: "StockReport", icon: "archive-outline", mode: "scratchCard" },
  { label: "Audit Log", screen: "AuditLog", icon: "document-text-outline", mode: "scratchCard", requiredFeature: "audit_log.basic" },
  { label: "Notification Log", screen: "NotificationLog", icon: "notifications-outline", mode: "scratchCard" },
];

const bottomDockItems: Array<{
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  screen: keyof MainStackParamList;
}> = [
  { icon: "home-outline", label: "Home", screen: "BestEntry" },
  { icon: "albums-outline", label: "Scratch Card", screen: "Dashboard" },
  { icon: "thermometer-outline", label: "Temp", screen: "TemperatureLogs" },
  { icon: "settings-outline", label: "Settings", screen: "Settings" },
];

const drawerBottomPaddingWithDock = 92;

function shouldShowBottomDock(routeName: string | undefined) {
  return !(
    routeName === "BestEntry" ||
    routeName === "Dashboard" ||
    routeName === "ComplianceChecks" ||
    routeName === "RefusalRegister" ||
    routeName === "DayEndClose" ||
    routeName === "CloseShift" ||
    routeName === "ShiftClose"
  );
}

function resolveOperationForBottomDockScreen(screen: keyof MainStackParamList): EntryOperation | null {
  if (screen === "Dashboard") {
    return "scratchCard";
  }
  if (screen === "TemperatureLogs") {
    return "temperature";
  }
  return null;
}

function getOperationLabel(operation: EntryOperation | null) {
  if (operation === "checklist") return "Checklist";
  if (operation === "compliance") return "Compliance";
  if (operation === "temperature") return "Temperature";
  if (operation === "scratchCard") return "Scratch Card";
  if (operation === "refusals") return "No ID / No Sale";
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
    routeName === "ShiftClose" ||
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
    routeName === "AppConfiguration" ||
    routeName === "CompanyManagement" ||
    routeName === "ShopManagement"
  ) {
    return "Settings";
  }

  return "BestEntry";
}

function HamburgerButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable style={styles.menuButton} onPress={onPress} accessibilityRole="button" accessibilityLabel="Open menu">
      <Ionicons name="menu" size={21} color={appTheme.colors.text} />
    </Pressable>
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
          <HamburgerButton onPress={() => navigation.getParent()?.dispatch(DrawerActions.toggleDrawer())} />
        ),
      })}
    >
      <Stack.Screen name="BestEntry" component={BestEntryScreen} options={{ headerTitle: () => <HomeHeaderTitle /> }} />
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
      <Stack.Screen name="RefusalRegister" component={RefusalRegisterScreen} options={{ title: "No ID / No Sale" }} />
      <Stack.Screen name="RefusalRegisterByDay" component={RefusalRegisterByDayScreen} options={{ title: "Refusals by Day" }} />
      <Stack.Screen name="RefusalReport" component={RefusalReportScreen} options={{ title: "Refusal Report" }} />
      <Stack.Screen name="RefusalManagerReview" component={RefusalManagerReviewScreen} options={{ title: "Refusal Manager Review" }} />
      <Stack.Screen name="RefusalEntryDetails" component={RefusalEntryDetailsScreen} options={{ title: "Refusal Details" }} />
      <Stack.Screen name="RefusalEntryEdit" component={RefusalEntryEditScreen} options={{ title: "Edit Refusal" }} />
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
        name="ShiftClose"
        component={ShiftCloseScreen}
        options={{ title: "Shift Close", headerRight: () => null }}
      />
      <Stack.Screen
        name="PrizePayout"
        component={PrizePayoutScreen}
        options={{ presentation: "modal", title: "Prize Payout" }}
      />
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
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: "Settings" }} />
      <Stack.Screen name="NotificationPreferences" component={NotificationPreferencesScreen} options={{ title: "Notifications" }} />
    </Stack.Navigator>
  );
}

function MainBottomDock() {
  const navigation = useNavigation<any>();
  const { setSelectedOperation } = useBestEntry();
  const insets = useSafeAreaInsets();
  const navigationState = useNavigationState((state) => state);
  const currentRouteName = getDeepestRouteName(navigationState);
  if (!shouldShowBottomDock(currentRouteName)) {
    return null;
  }

  const activeScreen = resolveActiveBottomDockScreen(currentRouteName);
  const dockBottomInset = Math.max(insets.bottom, appTheme.spacing.xs);
  const dockVerticalOffset = Platform.OS === "android" ? -8 : 0;

  return (
    <View style={[styles.bottomDockWrap, { paddingBottom: dockBottomInset, bottom: dockVerticalOffset }]}>
      <View style={styles.bottomDock}>
        {bottomDockItems.map((item) => {
          const isActive = item.screen === activeScreen;
          return (
            <Pressable
              key={item.screen}
              style={[styles.bottomDockItem, isActive ? styles.bottomDockItemActive : null]}
              onPress={() => {
                const operation = resolveOperationForBottomDockScreen(item.screen);
                if (operation) {
                  setSelectedOperation(operation);
                }
                navigation.navigate("MainTabs", { screen: "MainStack", params: { screen: item.screen } });
              }}
              accessibilityRole="button"
              accessibilityLabel={`Open ${item.label}`}
            >
              <Ionicons name={item.icon} size={18} color={isActive ? appTheme.colors.primary : appTheme.colors.textSubtle} />
              <Text style={[styles.bottomDockItemLabel, isActive ? styles.bottomDockItemLabelActive : null]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
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
  selectedOperation: EntryOperation | null;
  expanded: boolean;
  onToggle: (sectionKey: DrawerSectionKey) => void;
  activeScreen?: keyof MainStackParamList;
};

const DrawerSection = React.memo(function DrawerSection({
  sectionKey,
  title,
  items,
  isCompanyOwner,
  userRoles,
  features,
  onPress,
  selectedOperation,
  expanded,
  onToggle,
  activeScreen,
}: DrawerSectionProps) {
  const visibleItems = useMemo(
    () =>
      items.filter(
        (item) =>
          (!item.shopOwnerOnly || isCompanyOwner) &&
          (!item.allowedRoles || item.allowedRoles.some((role) => userRoles.includes(role))) &&
          (!selectedOperation || !item.mode || item.mode === selectedOperation) &&
          (!item.requiredFeature || features.includes(item.requiredFeature))
      ),
    [items, isCompanyOwner, userRoles, features, selectedOperation]
  );

  const handleToggle = useCallback(() => onToggle(sectionKey), [onToggle, sectionKey]);

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
          <Text style={styles.drawerSectionTitle}>{title}</Text>
          {/* <View style={styles.drawerSectionCountBadge}>
            <Text style={styles.drawerSectionCountText}>{visibleItems.length}</Text>
          </View> */}
        </View>
        <View style={styles.drawerSectionToggleIconWrap}>
          <Ionicons
            name={expanded ? "chevron-up-outline" : "chevron-down-outline"}
            size={14}
            color={appTheme.colors.textSubtle}
          />
        </View>
      </Pressable>
      {expanded ? (
        <View style={styles.drawerSectionItems}>
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
              <Ionicons
                name={activeScreen === item.screen ? "checkmark-circle" : "chevron-forward"}
                size={14}
                color={activeScreen === item.screen ? appTheme.colors.primary : appTheme.colors.textMuted}
              />
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
  const { profile, activeShop, signOut } = useAuth();
  const { entitlements } = useEntitlements();
  const features = entitlements?.features ?? [];
  const userRoles = profile?.roles ?? [];
  const isCompanyOwner = userRoles.some((role) => role === "CompanyOwner");
  const isPlatformAdmin = userRoles.some((role) => role === "PlatformAdmin");
  const isManager = userRoles.some((role) => role === "Manager");
  const roleLabel = isPlatformAdmin ? "Admin" : isCompanyOwner ? getRoleDisplayName("CompanyOwner") : isManager ? "Manager" : "Staff";
  const activeRouteName = getDeepestRouteName(props.state);
  const activeScreen = activeRouteName as keyof MainStackParamList | undefined;
  const showBottomDock = shouldShowBottomDock(activeRouteName);
  const drawerBottomPadding = showBottomDock
    ? insets.bottom + drawerBottomPaddingWithDock
    : insets.bottom + appTheme.spacing.md;
  const operationLabel = getOperationLabel(selectedOperation);
  const currentUser = profile?.displayName ?? profile?.email ?? "Signed-in user";
  const [expandedSections, setExpandedSections] = useState<Record<DrawerSectionKey, boolean>>({
    operations: true,
    management: false,
    reports: false,
  });

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

  async function onSignOut() {
    props.navigation.closeDrawer();
    await signOut();
  }

  return (
    <DrawerContentScrollView
      {...props}
      contentContainerStyle={[styles.drawerScrollContent, { paddingBottom: drawerBottomPadding }]}
    >
        <View style={[styles.drawerHeader, { paddingTop: appTheme.spacing.md + insets.top }]}>
          <Text style={styles.drawerEyebrow}>Navigation</Text>
          <Text style={styles.drawerTitle}>Menu</Text>
        <Text style={styles.drawerSubtle}>{currentUser}</Text>
        <Text style={styles.drawerShopName}>{activeShop?.shopName ?? "No active shop selected"}</Text>
        <View style={styles.drawerPillRow}>
          <View style={styles.drawerModePill}>
            <Ionicons name="compass-outline" size={12} color={appTheme.colors.primary} />
            <Text style={styles.drawerModePillText}>{operationLabel}</Text>
          </View>
          <View style={styles.drawerRolePill}>
            <Text style={styles.drawerRolePillText}>{roleLabel}</Text>
          </View>
          {entitlements?.tier ? (
            <Pressable
              style={styles.drawerPlanPill}
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

        <DrawerSection
          sectionKey="operations"
          title="Operations"
          items={operationsItems}
        isCompanyOwner={isCompanyOwner}
        userRoles={userRoles}
        features={features}
        onPress={goTo}
        selectedOperation={selectedOperation}
        expanded={expandedSections.operations}
        onToggle={toggleSection}
        activeScreen={activeScreen}
      />

      <DrawerSection
        sectionKey="reports"
        title="Reports"
        items={reportItems}
        isCompanyOwner={isCompanyOwner}
        userRoles={userRoles}
        features={features}
        onPress={goTo}
        selectedOperation={selectedOperation}
        expanded={expandedSections.reports}
        onToggle={toggleSection}
        activeScreen={activeScreen}
      />
      <DrawerSection
        sectionKey="management"
        title="Management"
        items={managementItems}
        isCompanyOwner={isCompanyOwner}
        userRoles={userRoles}
        features={features}
        onPress={goTo}
        selectedOperation={selectedOperation}
        expanded={expandedSections.management}
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
  return (
    <BestEntryProvider>
      <View style={styles.navigatorShell}>
        <Drawer.Navigator
          screenOptions={{
            headerShown: false,
            drawerType: "slide",
            overlayColor: appTheme.colors.overlaySoft,
            drawerStyle: {
              width: 332,
              backgroundColor: appTheme.colors.surface,
            },
            swipeEdgeWidth: 48,
          }}
          drawerContent={(props) => <DrawerMenuContent {...props} />}
        >
          <Drawer.Screen name="MainStack" component={MainStackScreens} />
        </Drawer.Navigator>
        <MainBottomDock />
      </View>
    </BestEntryProvider>
  );
}

const styles = StyleSheet.create({
  navigatorShell: {
    flex: 1,
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
    paddingVertical: appTheme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: appTheme.colors.border,
    backgroundColor: appTheme.colors.surfaceTintAlt,
    gap: 4,
  },
  drawerEyebrow: {
    color: appTheme.colors.textSubtle,
    fontSize: 11,
    lineHeight: 14,
    textTransform: "uppercase",
    letterSpacing: 0.3,
    fontFamily: appTheme.fonts.bodyMedium,
  },
  drawerTitle: {
    color: appTheme.colors.text,
    fontSize: 20,
    lineHeight: 24,
    fontFamily: appTheme.fonts.heading,
  },
  drawerSubtle: {
    color: appTheme.colors.textMuted,
    fontSize: 13,
    lineHeight: 16,
    fontFamily: appTheme.fonts.body,
  },
  drawerShopName: {
    color: appTheme.colors.text,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 18,
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
    paddingVertical: 9,
    borderRadius: appTheme.radius.pill,
    borderWidth: 1,
    borderColor: appTheme.colors.borderSoft,
    backgroundColor: appTheme.colors.surfaceNeutralSoft,
  },
  drawerSectionHeaderPressed: {
    opacity: 0.94,
  },
  drawerSectionHeaderMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: appTheme.spacing.xs,
  },
  drawerSectionItems: {
    gap: appTheme.spacing.xs,
    marginTop: appTheme.spacing.xs,
  },
  drawerSectionTitle: {
    color: appTheme.colors.textMuted,
    fontSize: 11,
    lineHeight: 14,
    textTransform: "uppercase",
    fontFamily: appTheme.fonts.bodyMedium,
    letterSpacing: 0.4,
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
    borderRadius: appTheme.radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: appTheme.colors.surface,
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
  bottomDockWrap: {
    position: "absolute",
    left: appTheme.spacing.md,
    right: appTheme.spacing.md,
    bottom: 0,
    backgroundColor: "transparent",
  },
  bottomDock: {
    backgroundColor: appTheme.colors.surface,
    borderRadius: appTheme.radius.pill,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    paddingVertical: 6,
    paddingHorizontal: 6,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  bottomDockItem: {
    gap: 3,
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    minHeight: 44,
    borderRadius: appTheme.radius.pill,
    paddingVertical: 5,
  },
  bottomDockItemActive: {
    backgroundColor: appTheme.colors.surfaceBrandSoft,
  },
  bottomDockItemLabel: {
    color: appTheme.colors.textSubtle,
    fontFamily: appTheme.fonts.bodyMedium,
    fontSize: 11,
    lineHeight: 13,
  },
  bottomDockItemLabelActive: {
    color: appTheme.colors.primary,
  },
});
