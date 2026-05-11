import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { DrawerActions, NavigatorScreenParams } from "@react-navigation/native";
import { createDrawerNavigator, DrawerContentScrollView, type DrawerContentComponentProps } from "@react-navigation/drawer";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
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
import { UserManagementScreen, AppConfigurationScreen, CompanyManagementScreen, ShopManagementScreen, SettingsScreen } from "../features/settings/SettingsScreens";
import { BestEntryProvider, EntryOperation, useBestEntry } from "./BestEntryContext";
import { MainStackParamList } from "../types/navigation";
import { appTheme } from "../ui/theme";

type MainDrawerParamList = {
  MainStack: NavigatorScreenParams<MainStackParamList> | undefined;
};

type MenuItem = {
  label: string;
  screen: keyof MainStackParamList;
  shopOwnerOnly?: boolean;
  mode?: EntryOperation;
};

type DrawerSectionKey = "operations" | "management" | "reports";

const Drawer = createDrawerNavigator<MainDrawerParamList>();
const Stack = createNativeStackNavigator<MainStackParamList>();

const operationsItems: MenuItem[] = [
  { label: "Home", screen: "BestEntry" },
  { label: "Day Management", screen: "Dashboard", mode: "scratchCard" },
  { label: "Deliveries", screen: "Deliveries", mode: "scratchCard" },
  { label: "Temperature Logs", screen: "TemperatureLogs", mode: "temperature" },
  { label: "Temperature Logs by Day", screen: "TemperatureLogsByDay", mode: "temperature" },
  { label: "Temperature Logs Report", screen: "TemperatureLogsReport", mode: "temperature" },
  { label: "Temperature Units", screen: "TemperatureUnits", mode: "temperature" },
  { label: "No ID / No Sale", screen: "RefusalRegister", mode: "refusals" },
  // { label: "Refusals by Day", screen: "RefusalRegisterByDay", mode: "refusals" },
  { label: "Refusal Report", screen: "RefusalReport", mode: "refusals" },
  { label: "Refusal Manager Review", screen: "RefusalManagerReview", mode: "refusals" },
  { label: "Card Packs", screen: "ScratchCardPacks", mode: "scratchCard" },
  { label: "Card Games", screen: "ScratchCardGames", mode: "scratchCard" },
  // { label: "Business Day", screen: "BusinessDay" },
  // { label: "Open Shift", screen: "OpenShift" },
  // { label: "Close Shift", screen: "CloseShift" },
];

const managementItems: MenuItem[] = [
  { label: "Settings", screen: "Settings" },
  { label: "User Invitations", screen: "UserInvitations" },
  // { label: "Company Management", screen: "CompanyManagement", shopOwnerOnly: true },
  { label: "Shop Management", screen: "ShopManagement", shopOwnerOnly: true },
  { label: "User Management", screen: "UserManagement", shopOwnerOnly: true },
  { label: "App Configuration", screen: "AppConfiguration", shopOwnerOnly: true },
];

const reportItems: MenuItem[] = [
  { label: "Daily Sales Report", screen: "DailySalesReport", mode: "scratchCard" },
  { label: "Shift Sales Report", screen: "ShiftSalesReport", mode: "scratchCard" },
  { label: "Manual Entry Review", screen: "ManualClosingReview", mode: "scratchCard" },
  { label: "Stock Report", screen: "StockReport", mode: "scratchCard" },
  { label: "Audit Log", screen: "AuditLog", mode: "scratchCard" },
  { label: "Notification Log", screen: "NotificationLog", mode: "scratchCard" },
];

function HamburgerButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable style={styles.menuButton} onPress={onPress} accessibilityRole="button" accessibilityLabel="Open menu">
      <Text style={styles.menuIcon}>≡</Text>
    </Pressable>
  );
}

function MainStackScreens() {
  return (
    <Stack.Navigator
      initialRouteName="BestEntry"
      screenOptions={({ navigation }) => ({
        headerStyle: { backgroundColor: appTheme.colors.background },
        headerTintColor: appTheme.colors.text,
        headerTitleStyle: {
          fontFamily: appTheme.fonts.bodyMedium,
          fontSize: 17,
        },
        headerShadowVisible: false,
        headerBackTitleVisible: false,
        contentStyle: { backgroundColor: appTheme.colors.background },
        headerRight: () => (
          <HamburgerButton onPress={() => navigation.getParent()?.dispatch(DrawerActions.toggleDrawer())} />
        ),
      })}
    >
      <Stack.Screen name="BestEntry" component={BestEntryScreen} options={{ title: "Home" }} />
      <Stack.Screen name="Dashboard" component={DashboardScreen} options={{ title: "Day Management" }} />
      <Stack.Screen name="UserInvitations" component={UserInvitationsScreen} options={{ title: "User Invitations" }} />
      <Stack.Screen name="UserManagement" component={UserManagementScreen} options={{ title: "User Management" }} />
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
      <Stack.Screen name="ShiftSalesReport" component={ShiftSalesReportScreen} options={{ title: "Shift Sales Report" }} />
      <Stack.Screen name="ManualClosingReview" component={ManualClosingReviewScreen} options={{ title: "Manual Entry Review" }} />
      <Stack.Screen name="StockReport" component={StockReportScreen} options={{ title: "Stock Report" }} />
      <Stack.Screen name="AuditLog" component={AuditLogScreen} options={{ title: "Audit Log" }} />
      <Stack.Screen name="NotificationLog" component={NotificationLogScreen} options={{ title: "Notification Log" }} />
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: "Settings" }} />
    </Stack.Navigator>
  );
}

function DrawerSection({
  sectionKey,
  title,
  items,
  isShopOwner,
  onPress,
  selectedOperation,
  expanded,
  onToggle,
}: {
  sectionKey: DrawerSectionKey;
  title: string;
  items: MenuItem[];
  isShopOwner: boolean;
  onPress: (item: MenuItem) => void;
  selectedOperation: EntryOperation | null;
  expanded: boolean;
  onToggle: (sectionKey: DrawerSectionKey) => void;
}) {
  const visibleItems = items.filter(
    (item) =>
      (!item.shopOwnerOnly || isShopOwner) &&
      (!selectedOperation || !item.mode || item.mode === selectedOperation)
  );

  return (
    <View style={styles.drawerSection}>
      <Pressable
        style={styles.drawerSectionHeader}
        onPress={() => onToggle(sectionKey)}
        accessibilityRole="button"
        accessibilityLabel={`${expanded ? "Collapse" : "Expand"} ${title} menu`}
      >
        <Text style={styles.drawerSectionTitle}>{title}</Text>
        <Text style={styles.drawerSectionIcon}>{expanded ? "v" : ">"}</Text>
      </Pressable>
      {expanded ? (
        <View style={styles.drawerSectionItems}>
          {visibleItems.map((item) => (
          <Pressable key={item.screen} style={styles.drawerItem} onPress={() => onPress(item)}>
            <Text style={styles.drawerItemText}>{item.label}</Text>
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
  const isShopOwner = profile?.roles?.some((role) => role === "ShopOwner") ?? false;
  const [expandedSections, setExpandedSections] = useState<Record<DrawerSectionKey, boolean>>({
    operations: true,
    management: false,
    reports: false,
  });

  const goTo = (item: MenuItem) => {
    if (item.mode) {
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
        <Text style={styles.drawerTitle}>Menu</Text>
        <Text style={styles.drawerSubtle}>{activeShop?.shopName ?? "No active shop selected"}</Text>
        <Text style={styles.drawerSubtle}>
          Operation: {selectedOperation === "temperature" ? "Temperature" : selectedOperation === "scratchCard" ? "Scratch Card" : selectedOperation === "refusals" ? "No ID / No Sale" : "All"}
        </Text>
      </View>

      <DrawerSection
        sectionKey="operations"
        title="Operations"
        items={operationsItems}
        isShopOwner={isShopOwner}
        onPress={goTo}
        selectedOperation={selectedOperation}
        expanded={expandedSections.operations}
        onToggle={toggleSection}
      />
      <DrawerSection
        sectionKey="management"
        title="Management"
        items={managementItems}
        isShopOwner={isShopOwner}
        onPress={goTo}
        selectedOperation={selectedOperation}
        expanded={expandedSections.management}
        onToggle={toggleSection}
      />
      <DrawerSection
        sectionKey="reports"
        title="Reports"
        items={reportItems}
        isShopOwner={isShopOwner}
        onPress={goTo}
        selectedOperation={selectedOperation}
        expanded={expandedSections.reports}
        onToggle={toggleSection}
      />
    </DrawerContentScrollView>
  );
}

export function MainNavigator() {
  return (
    <BestEntryProvider>
      <Drawer.Navigator
        screenOptions={{
          headerShown: false,
          drawerType: "slide",
          drawerStyle: {
            width: 324,
            backgroundColor: appTheme.colors.surface,
          },
          swipeEdgeWidth: 48,
        }}
        drawerContent={(props) => <DrawerMenuContent {...props} />}
      >
        <Drawer.Screen name="MainStack" component={MainStackScreens} />
      </Drawer.Navigator>
    </BestEntryProvider>
  );
}

const styles = StyleSheet.create({
  menuButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: appTheme.radius.sm,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    backgroundColor: appTheme.colors.surface,
  },
  menuIcon: {
    color: appTheme.colors.text,
    fontSize: 19,
    lineHeight: 18,
    fontFamily: appTheme.fonts.bodyMedium,
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
    backgroundColor: appTheme.colors.backgroundAlt,
  },
  drawerTitle: {
    color: appTheme.colors.text,
    fontSize: 20,
    lineHeight: 24,
    fontFamily: appTheme.fonts.heading,
  },
  drawerSubtle: {
    marginTop: 4,
    color: appTheme.colors.textMuted,
    fontSize: 13,
    lineHeight: 16,
    fontFamily: appTheme.fonts.body,
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
  drawerSectionIcon: {
    color: appTheme.colors.textSubtle,
    fontSize: 14,
    lineHeight: 16,
    fontFamily: appTheme.fonts.bodyMedium,
  },
  drawerItem: {
    paddingVertical: 12,
    paddingHorizontal: 13,
    borderRadius: appTheme.radius.sm,
    borderWidth: 1,
    borderColor: appTheme.colors.border,
    backgroundColor: appTheme.colors.surface,
  },
  drawerItemText: {
    color: appTheme.colors.text,
    fontSize: 14,
    lineHeight: 18,
    fontFamily: appTheme.fonts.bodyMedium,
  },
});
