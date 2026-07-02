import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../auth/AuthContext";
import { appTheme } from "../ui/theme";
import type { MainStackParamList } from "../types/navigation";

const MANAGE_ROLES = ["PlatformAdmin", "CompanyOwner", "Manager"];

type TabDef = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconActive: keyof typeof Ionicons.glyphMap;
  /** Target screen, or undefined for the "More" tab (opens the drawer catalogue). */
  screen?: keyof MainStackParamList;
  /** Routes that count as "inside" this tab, so the tab highlights on child screens too. */
  activeRoutes?: string[];
};

// Frequent destinations for staff — quick access to their own work without the drawer.
const STAFF_TABS: TabDef[] = [
  { key: "home", label: "Home", icon: "home-outline", iconActive: "home", screen: "BestEntry" },
  {
    key: "mywork",
    label: "My work",
    icon: "briefcase-outline",
    iconActive: "briefcase",
    screen: "MyWork",
    activeRoutes: ["MyWork", "MyShifts", "MyShiftDetail", "MyTimesheet", "MyTimesheetDetail", "MyLeave", "ShiftSwaps"],
  },
  { key: "more", label: "More", icon: "menu-outline", iconActive: "menu" },
];

// Managers/owners get the day flow and the insights dashboard alongside home.
const MANAGER_TABS: TabDef[] = [
  { key: "home", label: "Home", icon: "home-outline", iconActive: "home", screen: "BestEntry" },
  {
    key: "day",
    label: "Day",
    icon: "calendar-outline",
    iconActive: "calendar",
    screen: "Dashboard",
    activeRoutes: ["Dashboard", "DayEndClose", "BusinessDay", "OpenShift", "CloseShift", "ShiftDetails", "CloseDay"],
  },
  { key: "dashboard", label: "Insights", icon: "stats-chart-outline", iconActive: "stats-chart", screen: "OwnerDashboard" },
  { key: "more", label: "More", icon: "menu-outline", iconActive: "menu" },
];

/**
 * Persistent bottom navigation bar for the 3-4 most frequent destinations, role-aware. Rendered as a
 * flex sibling BELOW the drawer/stack (see MainNavigator) so it never overlaps a screen's sticky
 * footer, and hidden on focused data-entry screens. Navigation is driven by the parent via callbacks.
 */
export function BottomTabBar({
  currentRouteName,
  onSelectScreen,
  onOpenMore,
}: {
  currentRouteName?: string;
  onSelectScreen: (screen: keyof MainStackParamList) => void;
  onOpenMore: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { profile, activeShop } = useAuth();
  const isManager =
    MANAGE_ROLES.includes(activeShop?.role ?? "") || (profile?.roles?.some((r) => MANAGE_ROLES.includes(r)) ?? false);
  const tabs = isManager ? MANAGER_TABS : STAFF_TABS;

  const isActive = (tab: TabDef) => {
    if (!currentRouteName) return false;
    if (tab.screen && currentRouteName === tab.screen) return true;
    return tab.activeRoutes?.includes(currentRouteName) ?? false;
  };

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 6) }]}>
      {tabs.map((tab) => {
        const active = isActive(tab);
        return (
          <Pressable
            key={tab.key}
            style={styles.tab}
            onPress={() => (tab.screen ? onSelectScreen(tab.screen) : onOpenMore())}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={tab.label}
          >
            <Ionicons
              name={active ? tab.iconActive : tab.icon}
              size={22}
              color={active ? appTheme.colors.primary : appTheme.colors.textMuted}
            />
            <Text style={[styles.label, active ? styles.labelActive : null]} numberOfLines={1}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    backgroundColor: appTheme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: appTheme.colors.borderSoft,
    paddingTop: 6,
  },
  tab: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingHorizontal: 4,
  },
  label: {
    fontSize: 11,
    lineHeight: 13,
    fontFamily: appTheme.fonts.bodyMedium,
    color: appTheme.colors.textMuted,
  },
  labelActive: {
    color: appTheme.colors.primary,
  },
});
