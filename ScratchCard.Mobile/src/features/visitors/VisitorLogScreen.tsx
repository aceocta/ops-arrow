import React, { useCallback, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DateTimeField, formatDateValue } from "../../components/DateTimeField";
import { PrimaryButton } from "../../components/PrimaryButton";
import { LoadingState } from "../../components/LoadingState";
import { ScreenContainer } from "../../components/ScreenContainer";
import { getVisitorDailyLog, signOutVisitor } from "../../api/visitorLogApi";
import { useAuth } from "../../auth/AuthContext";
import { MainStackParamList } from "../../types/navigation";
import { VisitorLogEntry } from "../../types/models";
import { ui } from "../../ui/primitives";
import { appTheme } from "../../ui/theme";

type Props = NativeStackScreenProps<MainStackParamList, "VisitorLog">;

export function VisitorLogScreen({ navigation }: Props) {
  const { activeShopId } = useAuth();
  const queryClient = useQueryClient();
  const [date, setDate] = useState(() => formatDateValue(new Date()));

  const dailyQuery = useQuery({
    queryKey: ["visitor-daily-log", activeShopId, date],
    queryFn: () => getVisitorDailyLog(activeShopId as string, date),
    enabled: Boolean(activeShopId),
  });

  // Returning from sign-in / sign-out flows: refetch so the on-site list reflects mutations
  // made on the child screen.
  useFocusEffect(
    useCallback(() => {
      if (activeShopId) void dailyQuery.refetch();
    }, [dailyQuery.refetch, activeShopId]),
  );

  const signOutMutation = useMutation({
    mutationFn: (entryId: string) => signOutVisitor(entryId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["visitor-daily-log"] });
      void queryClient.invalidateQueries({ queryKey: ["visitor-on-site"] });
    },
    onError: (e: any) => Alert.alert("Failed", e?.response?.data?.message ?? "Unable to sign visitor out."),
  });

  const data = dailyQuery.data;
  const entries = data?.entries ?? [];

  const confirmSignOut = (entry: VisitorLogEntry) => {
    Alert.alert("Sign out visitor?", `Mark ${entry.visitorName} as left now?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", onPress: () => signOutMutation.mutate(entry.id) },
    ]);
  };

  return (
    <ScreenContainer>
      <View style={[ui.card, styles.headerCard]}>
        <View style={styles.headerRow}>
          <View style={styles.flex1}>
            <Text style={styles.eyebrow}>Visitors Log</Text>
            <Text style={styles.title}>Daily register</Text>
          </View>
          {data ? (
            <View style={styles.onSitePill}>
              <Text style={styles.onSitePillText}>{data.onSiteCount} on site</Text>
            </View>
          ) : null}
        </View>
        <DateTimeField mode="date" value={date} onChange={setDate} maximumDate={new Date()} />
        <PrimaryButton label="Sign in visitor" icon="person-add-outline" onPress={() => navigation.navigate("VisitorLogEntryEdit", {})} />
        <PrimaryButton label="Report" tone="neutral" icon="document-text-outline" onPress={() => navigation.navigate("VisitorLogReport")} />
      </View>

      {dailyQuery.isLoading ? (
        <LoadingState />
      ) : entries.length === 0 ? (
        <View style={ui.card}>
          <Text style={ui.bodyText}>No visitors recorded for this date.</Text>
        </View>
      ) : (
        entries.map((entry) => (
          <Pressable
            key={entry.id}
            style={[ui.card, styles.entryCard, entry.isOnSite ? styles.entryOnSite : null]}
            onPress={() => navigation.navigate("VisitorLogEntryEdit", { entryId: entry.id })}
          >
            <View style={styles.entryHeader}>
              <Text style={styles.entryName} numberOfLines={1}>
                #{entry.sequenceNo} · {entry.visitorName}
              </Text>
              <View style={[styles.typeBadge, entry.isInspector ? styles.typeBadgeInspector : null]}>
                <Text style={[styles.typeBadgeText, entry.isInspector ? styles.typeBadgeTextInspector : null]}>{entry.visitType}</Text>
              </View>
            </View>
            {entry.organisation ? <Text style={styles.entryMeta}>{entry.organisation}</Text> : null}
            <Text style={styles.entryMeta}>
              In {entry.timeIn}
              {entry.timeOut ? ` · Out ${entry.timeOut}` : " · still on site"}
              {entry.vehicleRegistration ? ` · ${entry.vehicleRegistration}` : ""}
            </Text>
            {entry.purpose ? <Text style={styles.entryMeta}>{entry.purpose}</Text> : null}
            {entry.isOnSite ? (
              <Pressable
                style={styles.signOutButton}
                onPress={() => confirmSignOut(entry)}
                disabled={signOutMutation.isPending}
              >
                <Text style={styles.signOutText}>Sign out</Text>
              </Pressable>
            ) : null}
          </Pressable>
        ))
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  headerCard: { gap: appTheme.spacing.sm },
  headerRow: { flexDirection: "row", alignItems: "flex-start", gap: appTheme.spacing.sm },
  flex1: { flex: 1 },
  eyebrow: { color: appTheme.colors.textSubtle, fontFamily: appTheme.fonts.bodyMedium, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.4 },
  title: { color: appTheme.colors.text, fontFamily: appTheme.fonts.heading, fontSize: 22, lineHeight: 27 },
  onSitePill: { backgroundColor: appTheme.colors.surfaceSuccessMuted, borderRadius: appTheme.radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  onSitePillText: { color: appTheme.colors.success, fontFamily: appTheme.fonts.bodyMedium, fontSize: 13 },
  entryCard: { gap: 4 },
  entryOnSite: { borderWidth: 0.8, borderColor: appTheme.colors.borderSuccessSoft },
  entryHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: appTheme.spacing.sm },
  entryName: { flex: 1, color: appTheme.colors.text, fontFamily: appTheme.fonts.bodyMedium, fontSize: 15 },
  entryMeta: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.body, fontSize: 13, lineHeight: 18 },
  typeBadge: { backgroundColor: appTheme.colors.surfaceMuted, borderRadius: appTheme.radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  typeBadgeText: { color: appTheme.colors.textMuted, fontFamily: appTheme.fonts.bodyMedium, fontSize: 11 },
  typeBadgeInspector: { backgroundColor: appTheme.colors.surfaceWarningSoft },
  typeBadgeTextInspector: { color: appTheme.colors.warning },
  signOutButton: { alignSelf: "flex-start", marginTop: 6, borderRadius: appTheme.radius.sm, backgroundColor: appTheme.colors.surfaceTintSoft, paddingHorizontal: 16, paddingVertical: 8 },
  signOutText: { color: appTheme.colors.primary, fontFamily: appTheme.fonts.bodyMedium, fontSize: 13 },
});
