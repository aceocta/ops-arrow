import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { getMyTimesheetReviews } from "../../api/rotaApi";
import { useAuth } from "../../auth/AuthContext";
import { useFeature } from "../subscription/useFeature";
import { EmptyState } from "../../components/EmptyState";
import { ScreenContainer } from "../../components/ScreenContainer";
import { MainStackParamList } from "../../types/navigation";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";

type Tile = {
  key: string;
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  screen: keyof MainStackParamList;
  show: boolean;
  badge?: number;
};

// Single hub that gathers the staff-facing "My" rota screens (Shifts, Timesheet, Leave) behind one
// menu entry. Each tile is gated by the same subscription feature the drawer uses, so a shop only
// sees what it's entitled to.
export function MyWorkScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { activeShopId } = useAuth();
  const hasRota = useFeature("StaffRota").isAllowed;
  const hasLeave = useFeature("LeaveManagement").isAllowed;

  // Pending timesheet confirmations → badge on the My Timesheet tile (same query the drawer uses).
  const reviewsQuery = useQuery({
    queryKey: ["rota-my-reviews", activeShopId],
    queryFn: () => getMyTimesheetReviews(activeShopId as string),
    enabled: Boolean(activeShopId) && hasRota,
  });
  const pendingReviews = (reviewsQuery.data ?? []).filter((r) => r.status === "PendingStaff" || r.status === "Disputed").length;

  const tiles: Tile[] = [
    { key: "shifts", title: "My Shifts", description: "Your upcoming shifts — check in and out.", icon: "time-outline", screen: "MyShifts", show: hasRota },
    { key: "timesheet", title: "My Timesheet", description: "Review and confirm your recorded hours.", icon: "document-text-outline", screen: "MyTimesheet", show: hasRota, badge: pendingReviews },
    { key: "leave", title: "My Leave", description: "Request time off and view your balance.", icon: "airplane-outline", screen: "MyLeave", show: hasLeave },
  ];
  const visible = tiles.filter((t) => t.show);

  return (
    <ScreenContainer>
      {visible.length === 0 ? (
        <EmptyState
          icon="briefcase-outline"
          title="Nothing here yet"
          message="Your shifts, timesheet, and leave will appear here once your shop enables staff rota."
        />
      ) : (
        <View style={styles.list}>
          {visible.map((t) => (
            <Pressable
              key={t.key}
              style={({ pressed }) => [ui.listItem, styles.row, pressed ? styles.rowPressed : null]}
              onPress={() => navigation.navigate(t.screen as never)}
              accessibilityRole="button"
              accessibilityLabel={t.title}
            >
              <View style={styles.iconWrap}>
                <Ionicons name={t.icon} size={22} color={appTheme.colors.primary} />
              </View>
              <View style={styles.main}>
                <Text style={styles.title}>{t.title}</Text>
                <Text style={styles.desc}>{t.description}</Text>
              </View>
              {t.badge ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{t.badge}</Text>
                </View>
              ) : null}
              <Ionicons name="chevron-forward" size={18} color={appTheme.colors.textSubtle} />
            </Pressable>
          ))}
        </View>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  list: { gap: appTheme.spacing.xs },
  row: { flexDirection: "row", alignItems: "center", gap: appTheme.spacing.sm },
  rowPressed: { opacity: 0.7 },
  iconWrap: {
    width: 40, height: 40, borderRadius: appTheme.radius.sm,
    alignItems: "center", justifyContent: "center",
    backgroundColor: appTheme.colors.surfaceBrandSoft,
  },
  main: { flex: 1, gap: 2 },
  title: { color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 15, lineHeight: 19 },
  desc: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 12, lineHeight: 16 },
  badge: {
    minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6,
    backgroundColor: appTheme.colors.danger, alignItems: "center", justifyContent: "center",
  },
  badgeText: { color: appTheme.colors.onPrimary, fontFamily: appTheme.fonts.bodyMedium, fontSize: 11 },
});
