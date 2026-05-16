import React, { useState } from "react";
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
import { BestEntryProvider, EntryOperation, useBestEntry } from "./BestEntryContext";
import { MainStackParamList } from "../types/navigation";
import { appTheme } from "../ui/theme";
import { appInfo } from "../config/appInfo";

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
};

type DrawerSectionKey = "operations" | "management" | "reports";

const Drawer = createDrawerNavigator<MainDrawerParamList>();
const Stack = createNativeStackNavigator<MainStackParamList>();

const operationsItems: MenuItem[] = [
  { label: "Home", screen: "BestEntry", icon: "home-outline" },
  { label: "Shop Checklist", screen: "ShopChecklist", icon: "checkmark-done-outline" },
  {
    label: "Checklist Setup",
    screen: "ChecklistConfiguration",
    icon: "construct-outline",
    mode: "checklist",
    allowedRoles: ["PlatformAdmin", "ShopOwner", "Manager"],
  },
  {
    label: "Checklist History",
    screen: "ChecklistHistory",
    icon: "document-text-outline",
    mode: "checklist",
    allowedRoles: ["PlatformAdmin", "ShopOwner", "Manager"],
  },
  { label: "Day Management", screen: "Dashboard", icon: "calendar-outline", mode: "scratchCard" },
  { label: "Deliveries", screen: "Deliveries", icon: "cube-outline", mode: "scratchCard" },
  { label: "Temperature Logs", screen: "TemperatureLogs", icon: "thermometer-outline", mode: "temperature" },
  { label: "Temperature Logs by Day", screen: "TemperatureLogsByDay", icon: "calendar-number-outline", mode: "temperature" },
  { label: "Temperature Logs Report", screen: "TemperatureLogsReport", icon: "bar-chart-outline", mode: "temperature" },
  { label: "Temperature Units", screen: "TemperatureUnits", icon: "options-outline", mode: "temperature" },
  { label: "No ID / No Sale", screen: "RefusalRegister", icon: "shield-checkmark-outline", mode: "refusals" },
  // { label: "Refusals by Day", screen: "RefusalRegisterByDay", mode: "refusals" },
  { label: "Refusal Report", screen: "RefusalReport", icon: "document-text-outline", mode: "refusals" },
  { label: "Refusal Manager Review", screen: "RefusalManagerReview", icon: "clipboard-outline", mode: "refusals" },
  { label: "Card Packs", screen: "ScratchCardPacks", icon: "albums-outline", mode: "scratchCard" },
  { label: "Card Games", screen: "ScratchCardGames", icon: "game-controller-outline", mode: "scratchCard" },
  // { label: "Business Day", screen: "BusinessDay" },
  // { label: "Open Shift", screen: "OpenShift" },
  // { label: "Close Shift", screen: "CloseShift" },
];

const managementItems: MenuItem[] = [
  { label: "Settings", screen: "Settings", icon: "settings-outline" },
  { label: "User Invitations", screen: "UserInvitations", icon: "mail-outline", allowedRoles: ["PlatformAdmin", "ShopOwner", "Manager"] },
  // { label: "Company Management", screen: "CompanyManagement", icon: "business-outline", shopOwnerOnly: true },
  { label: "Shop Management", screen: "ShopManagement", icon: "storefront-outline", shopOwnerOnly: true },
  { label: "User Management", screen: "UserManagement", icon: "people-outline", shopOwnerOnly: true },
  { label: "Shop Configuration", screen: "ShopConfiguration", icon: "storefront-outline" },
  { label: "App Configuration", screen: "AppConfiguration", icon: "construct-outline" },
];

const reportItems: MenuItem[] = [
  { label: "Daily Sales Report", screen: "DailySalesReport", icon: "stats-chart-outline", mode: "scratchCard" },
  // { label: "Shift Sales Report", screen: "ShiftSalesReport", mode: "scratchCard" },
  // { label: "Manual Entry Review", screen: "ManualClosingReview", mode: "scratchCard" },
  { label: "Stock Report", screen: "StockReport", icon: "archive-outline", mode: "scratchCard" },
  // { label: "Audit Log", screen: "AuditLog", mode: "scratchCard" },
  { label: "Notification Log", screen: "NotificationLog", icon: "notifications-outline", mode: "scratchCard" },
];

const bottomDockItems: Array<{
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  screen: keyof MainStackParamList;
}> = [
  // { icon: "calendar-outline", label: "Day", screen: "Dashboard" },
  { icon: "albums-outline", label: "Scratch Cards", screen: "Dashboard" },
  { icon: "thermometer-outline", label: "Temp", screen: "TemperatureLogs" },
  { icon: "shield-checkmark-outline", label: "No ID/No Sale", screen: "RefusalRegister" },
  { icon: "settings-outline", label: "Settings", screen: "Settings" },
];

function resolveOperationForBottomDockScreen(screen: keyof MainStackParamList): EntryOperation | null {
  if (screen === "Dashboard") {
    return "scratchCard";
  }
  if (screen === "TemperatureLogs") {
    return "temperature";
  }
  if (screen === "RefusalRegister") {
    return "refusals";
  }
  return null;
}

function getOperationLabel(operation: EntryOperation | null) {
  if (operation === "checklist") return "Checklist";
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
    return "ScratchCardPacks";
  }

  if (
    routeName === "TemperatureLogs" ||
    routeName === "TemperatureLogsByDay" ||
    routeName === "TemperatureLogsReport" ||
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
        headerBackTitleVisible: false,
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
      <Stack.Screen name="ShiftClose" component={ShiftCloseScreen} options={{ title: "Shift Close" }} />
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
      {/* <Stack.Screen name="AuditLog" component={AuditLogScreen} options={{ title: "Audit Log" }} /> */}
      <Stack.Screen name="NotificationLog" component={NotificationLogScreen} options={{ title: "Notification Log" }} />
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: "Settings" }} />
    </Stack.Navigator>
  );
}

function MainBottomDock() {
  const navigation = useNavigation<any>();
  const { setSelectedOperation } = useBestEntry();
  const insets = useSafeAreaInsets();
  const navigationState = useNavigationState((state) => state);
  const currentRouteName = getDeepestRouteName(navigationState);
  if (currentRouteName === "BestEntry") {
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

function DrawerSection({
  sectionKey,
  title,
  items,
  isShopOwner,
  userRoles,
  onPress,
  selectedOperation,
  expanded,
  onToggle,
  activeScreen,
}: {
  sectionKey: DrawerSectionKey;
  title: string;
  items: MenuItem[];
  isShopOwner: boolean;
  userRoles: string[];
  onPress: (item: MenuItem) => void;
  selectedOperation: EntryOperation | null;
  expanded: boolean;
  onToggle: (sectionKey: DrawerSectionKey) => void;
  activeScreen?: keyof MainStackParamList;
}) {
  const visibleItems = items.filter(
    (item) =>
      (!item.shopOwnerOnly || isShopOwner) &&
      (!item.allowedRoles || item.allowedRoles.some((role) => userRoles.includes(role))) &&
      (!selectedOperation || !item.mode || item.mode === selectedOperation)
  );

  if (visibleItems.length === 0) {
    return null;
  }

  return (
    <View style={styles.drawerSection}>
      <Pressable
        style={styles.drawerSectionHeader}
        onPress={() => onToggle(sectionKey)}
        accessibilityRole="button"
        accessibilityLabel={`${expanded ? "Collapse" : "Expand"} ${title} menu`}
        accessibilityState={{ expanded }}
      >
        <Text style={styles.drawerSectionTitle}>{title}</Text>
        <Ionicons
          name={expanded ? "chevron-up-outline" : "chevron-down-outline"}
          size={14}
          color={appTheme.colors.textSubtle}
        />
      </Pressable>
      {expanded ? (
        <View style={styles.drawerSectionItems}>
          {visibleItems.map((item) => (
            <Pressable
              key={item.screen}
              style={[styles.drawerItem, activeScreen === item.screen ? styles.drawerItemActive : null]}
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
                color={activeScreen === item.screen ? appTheme.colors.primary : appTheme.colors.textSubtle}
              />
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function DrawerMenuContent(props: DrawerContentComponentProps) {
  const { selectedOperation, setSelectedOperation } = useBestEntry();
  const insets = useSafeAreaInsets();
  const { profile, activeShop } = useAuth();
  const userRoles = profile?.roles ?? [];
  const isShopOwner = userRoles.some((role) => role === "ShopOwner");
  const isPlatformAdmin = userRoles.some((role) => role === "PlatformAdmin");
  const isManager = userRoles.some((role) => role === "Manager");
  const roleLabel = isPlatformAdmin ? "Admin" : isShopOwner ? "Shop Owner" : isManager ? "Manager" : "Staff";
  const activeRouteName = getDeepestRouteName(props.state);
  const activeScreen = activeRouteName as keyof MainStackParamList | undefined;
  const operationLabel = getOperationLabel(selectedOperation);
  const currentUser = profile?.displayName ?? profile?.email ?? "Signed-in user";
  const [expandedSections, setExpandedSections] = useState<Record<DrawerSectionKey, boolean>>({
    operations: true,
    management: false,
    reports: false,
  });

  const goTo = (item: MenuItem) => {
    if (item.screen === "ShopChecklist") {
      setSelectedOperation("checklist");
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

  return (
    <DrawerContentScrollView {...props} contentContainerStyle={styles.drawerScrollContent}>
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
        </View>
      </View>

      <DrawerSection
        sectionKey="operations"
        title="Operations"
        items={operationsItems}
        isShopOwner={isShopOwner}
        userRoles={userRoles}
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
        isShopOwner={isShopOwner}
        userRoles={userRoles}
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
        isShopOwner={isShopOwner}
        userRoles={userRoles}
        onPress={goTo}
        selectedOperation={selectedOperation}
        expanded={expandedSections.management}
        onToggle={toggleSection}
        activeScreen={activeScreen}
      />
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
  drawerSection: {
    paddingHorizontal: appTheme.spacing.md,
    paddingTop: appTheme.spacing.md,
  },
  drawerSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 2,
    paddingVertical: 6,
  },
  drawerSectionItems: {
    gap: 8,
    marginTop: 8,
  },
  drawerSectionTitle: {
    color: appTheme.colors.textSubtle,
    fontSize: 12,
    lineHeight: 14,
    textTransform: "uppercase",
    fontFamily: appTheme.fonts.bodyMedium,
  },
  drawerItem: {
    paddingVertical: 10,
    paddingHorizontal: 11,
    borderRadius: appTheme.radius.sm,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    backgroundColor: appTheme.colors.surface,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: appTheme.spacing.xs,
  },
  drawerItemActive: {
    borderColor: appTheme.colors.borderBrandSoft,
    backgroundColor: appTheme.colors.surfaceBrandMuted,
  },
  drawerItemMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: appTheme.spacing.xs,
    flex: 1,
  },
  drawerItemIconWrap: {
    width: 26,
    height: 26,
    borderRadius: appTheme.radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: appTheme.colors.surfaceMuted,
  },
  drawerItemIconWrapActive: {
    backgroundColor: appTheme.colors.primary,
  },
  drawerItemText: {
    color: appTheme.colors.text,
    fontSize: 14,
    lineHeight: 18,
    fontFamily: appTheme.fonts.bodyMedium,
  },
  drawerItemTextActive: {
    color: appTheme.colors.textBrandStrong,
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

